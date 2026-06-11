import axios from 'axios';
import { createHash } from 'crypto';

const NIM_CHAT_COMPLETIONS_URL = process.env.NVIDIA_NIM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'deepseek-ai/deepseek-v4-pro';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_SAFE_REQUESTS_PER_MINUTE = 36;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 2;
const DEFAULT_USER_COOLDOWN_MS = 60 * 1000;
const DEFAULT_GUILD_COOLDOWN_MS = 10 * 1000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;
const requestTimestamps = [];
const userCooldowns = new Map();
const guildCooldowns = new Map();
const responseCache = new Map();
const inFlightRequests = new Map();
const blockedApiKeys = new Map();
let activeRequestCount = 0;
let preferredApiKeyIndex = 0;

function getRateLimitPerMinute() {
  const parsed = Number(process.env.NVIDIA_NIM_RATE_LIMIT_PER_MINUTE || MAX_SAFE_REQUESTS_PER_MINUTE);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MAX_SAFE_REQUESTS_PER_MINUTE;
  }

  return Math.min(Math.floor(parsed), MAX_SAFE_REQUESTS_PER_MINUTE);
}

function getPositiveIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getMaxConcurrentRequests() {
  return Math.min(
    getPositiveIntegerEnv('NVIDIA_NIM_MAX_CONCURRENT_REQUESTS', DEFAULT_MAX_CONCURRENT_REQUESTS),
    5
  );
}

function getUserCooldownMs() {
  return getPositiveIntegerEnv(
    'NVIDIA_NIM_USER_COOLDOWN_SECONDS',
    DEFAULT_USER_COOLDOWN_MS / 1000
  ) * 1000;
}

function getGuildCooldownMs() {
  return getPositiveIntegerEnv(
    'NVIDIA_NIM_GUILD_COOLDOWN_SECONDS',
    DEFAULT_GUILD_COOLDOWN_MS / 1000
  ) * 1000;
}

function getCacheTtlMs() {
  return getPositiveIntegerEnv(
    'NVIDIA_NIM_CACHE_TTL_SECONDS',
    DEFAULT_CACHE_TTL_MS / 1000
  ) * 1000;
}

function createLimitedError(code, retryAfterMs = 0) {
  const error = new Error(code);
  error.code = code;
  error.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return error;
}

function enforceCommandCooldown(context = {}) {
  const now = Date.now();
  const userId = context.userId;
  const guildId = context.guildId;

  if (userId) {
    const userAvailableAt = userCooldowns.get(userId) || 0;
    if (userAvailableAt > now) {
      throw createLimitedError('NVIDIA_NIM_USER_COOLDOWN', userAvailableAt - now);
    }
  }

  if (guildId) {
    const guildAvailableAt = guildCooldowns.get(guildId) || 0;
    if (guildAvailableAt > now) {
      throw createLimitedError('NVIDIA_NIM_GUILD_COOLDOWN', guildAvailableAt - now);
    }
  }

  if (userId) {
    userCooldowns.set(userId, now + getUserCooldownMs());
  }
  if (guildId) {
    guildCooldowns.set(guildId, now + getGuildCooldownMs());
  }
}

function enforceLocalRateLimit() {
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= getRateLimitPerMinute()) {
    throw createLimitedError(
      'NVIDIA_NIM_LOCAL_RATE_LIMIT',
      RATE_LIMIT_WINDOW_MS - (now - requestTimestamps[0])
    );
  }

  requestTimestamps.push(now);
}

function createPrompt(analysisData) {
  return [
    '아래 JSON은 한 발로란트 플레이어의 최근 경기 데이터입니다.',
    '데이터에 없는 내용은 추측하지 말고, 숫자 기반으로 평가하세요.',
    '출력은 한국어 Discord 메시지로 작성하세요.',
    '구성은 1) 한줄 총평 2) 강점 3) 약점 4) 다음 3게임 실천 과제 순서로 하세요.',
    '총 700자 이내로 쓰고, 각 항목은 1~2문장만 작성하세요.',
    '문장을 중간에 끊지 말고 반드시 완성된 문장으로 끝내세요.',
    '깨질 수 있는 특수문자, 희귀 기호, 장식 문자, 표 문자는 쓰지 마세요.',
    '맵 콜아웃은 "A 사이트", "B 메인"처럼 일반 한글과 ASCII만 사용하세요.',
    '',
    JSON.stringify(analysisData, null, 2),
  ].join('\n');
}

function createFocusedPrompt(analysisData) {
  return [
    '아래 JSON은 한 발로란트 플레이어의 직전 1경기 데이터입니다.',
    '데이터에 없는 라운드 상황, 포지션, 콜, 팀원 행동은 추측하지 마세요.',
    '출력은 한국어 Discord 메시지로 작성하세요.',
    '프로 코치처럼 냉정하고 구체적으로 평가하세요.',
    '구성은 1) 전판 총평 2) 교전 평가 3) 운영/생존 평가 4) 바로 고칠 3가지 순서로 하세요.',
    '총 1000자 이내로 쓰고, 각 항목은 짧은 문단으로 작성하세요.',
    '문장을 중간에 끊지 말고 반드시 완성된 문장으로 끝내세요.',
    '깨질 수 있는 특수문자, 희귀 기호, 장식 문자, 표 문자는 쓰지 마세요.',
    '맵 콜아웃은 "A 사이트", "B 메인"처럼 일반 한글과 ASCII만 사용하세요.',
    '',
    JSON.stringify(analysisData, null, 2),
  ].join('\n');
}

function sanitizeModelContent(content) {
  return content
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function getApiKeyCandidates() {
  return [...new Set([
    process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY,
    process.env.NVIDIA_NIM_FALLBACK_API_KEY,
  ].filter(Boolean))];
}

function selectApiKey() {
  const apiKeys = getApiKeyCandidates();
  if (apiKeys.length === 0) {
    const error = new Error('NVIDIA_NIM_API_KEY_MISSING');
    error.code = 'NVIDIA_NIM_API_KEY_MISSING';
    throw error;
  }

  const now = Date.now();
  let nearestAvailableAt = Infinity;

  for (let offset = 0; offset < apiKeys.length; offset += 1) {
    const index = (preferredApiKeyIndex + offset) % apiKeys.length;
    const apiKey = apiKeys[index];
    const blockedUntil = blockedApiKeys.get(apiKey) || 0;

    if (blockedUntil <= now) {
      preferredApiKeyIndex = index;
      return { apiKey, index };
    }

    nearestAvailableAt = Math.min(nearestAvailableAt, blockedUntil);
  }

  throw createLimitedError(
    'NVIDIA_NIM_KEY_UNAVAILABLE',
    Number.isFinite(nearestAvailableAt) ? nearestAvailableAt - now : RATE_LIMIT_WINDOW_MS
  );
}

function blockApiKey(apiKey, index, status) {
  const apiKeys = getApiKeyCandidates();
  const blockedUntil = status === 429 ? Date.now() + RATE_LIMIT_WINDOW_MS : Number.POSITIVE_INFINITY;
  blockedApiKeys.set(apiKey, blockedUntil);

  if (apiKeys.length > 1) {
    preferredApiKeyIndex = (index + 1) % apiKeys.length;
    console.warn('NVIDIA NIM 키 실패: 다음 요청부터 다른 키를 사용합니다.');
  }
}

function createCacheKey(prompt, maxTokens) {
  return createHash('sha256')
    .update(`${DEFAULT_NIM_MODEL}\n${maxTokens}\n${prompt}`)
    .digest('hex');
}

function getCachedResponse(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt >= getCacheTtlMs()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return {
    ...cached.response,
    cached: true,
  };
}

function cacheResponse(cacheKey, response) {
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }

  responseCache.set(cacheKey, {
    response,
    createdAt: Date.now(),
  });
}

async function requestChatCompletion(apiKey, model, prompt, maxTokens = 900) {
  const response = await axios.post(
    NIM_CHAT_COMPLETIONS_URL,
    {
      model,
      messages: [
        {
          role: 'system',
          content: '당신은 발로란트 전적을 읽고 실전적인 피드백을 주는 코치입니다.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.35,
      top_p: 0.9,
      max_tokens: maxTokens,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 45000,
    }
  );

  const content = sanitizeModelContent(response.data?.choices?.[0]?.message?.content || '');
  if (!content) {
    const error = new Error('NVIDIA_NIM_EMPTY_RESPONSE');
    error.code = 'NVIDIA_NIM_EMPTY_RESPONSE';
    throw error;
  }

  return {
    content,
    model: response.data?.model || model,
  };
}

async function performSingleNimRequest(prompt, maxTokens, cacheKey) {
  if (activeRequestCount >= getMaxConcurrentRequests()) {
    throw createLimitedError('NVIDIA_NIM_BUSY', 5000);
  }

  const { apiKey, index } = selectApiKey();
  enforceLocalRateLimit();
  activeRequestCount += 1;

  try {
    const response = await requestChatCompletion(apiKey, DEFAULT_NIM_MODEL, prompt, maxTokens);
    cacheResponse(cacheKey, response);
    return response;
  } catch (error) {
    if (error.code?.startsWith?.('NVIDIA_NIM_')) {
      throw error;
    }

    const status = error.response?.status;
    if (status === 401 || status === 403) {
      blockApiKey(apiKey, index, status);
      const authError = new Error('NVIDIA_NIM_AUTH_FAILED');
      authError.code = 'NVIDIA_NIM_AUTH_FAILED';
      throw authError;
    }

    if (status === 429) {
      blockApiKey(apiKey, index, status);
      const rateLimitError = new Error('NVIDIA_NIM_RATE_LIMITED');
      rateLimitError.code = 'NVIDIA_NIM_RATE_LIMITED';
      throw rateLimitError;
    }

    if (status === 502 || status === 503 || status === 504 || error.code === 'ECONNABORTED') {
      console.error('NVIDIA NIM 호출 지연:', status || error.code);
      const timeoutError = new Error('NVIDIA_NIM_TIMEOUT');
      timeoutError.code = 'NVIDIA_NIM_TIMEOUT';
      throw timeoutError;
    }

    console.error('NVIDIA NIM 호출 실패:', status || error.message);
    const apiError = new Error('NVIDIA_NIM_REQUEST_FAILED');
    apiError.code = 'NVIDIA_NIM_REQUEST_FAILED';
    throw apiError;
  } finally {
    activeRequestCount -= 1;
  }
}

async function generateNimReview(prompt, maxTokens, context) {
  enforceCommandCooldown(context);

  const cacheKey = createCacheKey(prompt, maxTokens);
  const cachedResponse = getCachedResponse(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = performSingleNimRequest(prompt, maxTokens, cacheKey);
  inFlightRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export async function generateValorantAiReview(analysisData, context = {}) {
  return generateNimReview(createPrompt(analysisData), 900, context);
}

export async function generateValorantFocusedReview(analysisData, context = {}) {
  return generateNimReview(createFocusedPrompt(analysisData), 1200, context);
}
