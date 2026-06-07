import axios from 'axios';

const NIM_CHAT_COMPLETIONS_URL = process.env.NVIDIA_NIM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'deepseek-ai/deepseek-v4-pro';
const FALLBACK_NIM_MODEL = process.env.NVIDIA_NIM_FALLBACK_MODEL || DEFAULT_NIM_MODEL;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestTimestamps = [];

function getRateLimitPerMinute() {
  const parsed = Number(process.env.NVIDIA_NIM_RATE_LIMIT_PER_MINUTE || 40);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}

function enforceLocalRateLimit() {
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= getRateLimitPerMinute()) {
    const error = new Error('NVIDIA_NIM_LOCAL_RATE_LIMIT');
    error.code = 'NVIDIA_NIM_LOCAL_RATE_LIMIT';
    throw error;
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

function getModelCandidates() {
  return [...new Set([DEFAULT_NIM_MODEL, FALLBACK_NIM_MODEL])];
}

function getApiKeyCandidates() {
  return [...new Set([
    process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY,
    process.env.NVIDIA_NIM_FALLBACK_API_KEY,
  ].filter(Boolean))];
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

async function generateNimReview(prompt, maxTokens) {
  const apiKeys = getApiKeyCandidates();

  if (apiKeys.length === 0) {
    const error = new Error('NVIDIA_NIM_API_KEY_MISSING');
    error.code = 'NVIDIA_NIM_API_KEY_MISSING';
    throw error;
  }

  enforceLocalRateLimit();

  const models = getModelCandidates();
  let lastError = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
    const apiKey = apiKeys[keyIndex];
    let shouldTryNextKey = false;

    for (const model of models) {
      try {
        return await requestChatCompletion(apiKey, model, prompt, maxTokens);
      } catch (error) {
        if (error.code?.startsWith?.('NVIDIA_NIM_')) {
          throw error;
        }

        lastError = error;
        const status = error.response?.status;

        if (status === 401 || status === 403 || status === 429) {
          shouldTryNextKey = keyIndex < apiKeys.length - 1;
          break;
        }

        if (status === 502 || status === 503 || status === 504 || error.code === 'ECONNABORTED') {
          continue;
        }

        break;
      }
    }

    if (shouldTryNextKey) {
      console.warn('NVIDIA NIM 기본 키 실패: 백업 키로 재시도합니다.');
      continue;
    }

    if (lastError) {
      break;
    }
  }

  const status = lastError?.response?.status;
  if (status === 401 || status === 403) {
    const authError = new Error('NVIDIA_NIM_AUTH_FAILED');
    authError.code = 'NVIDIA_NIM_AUTH_FAILED';
    throw authError;
  }

  if (status === 429) {
    const rateLimitError = new Error('NVIDIA_NIM_RATE_LIMITED');
    rateLimitError.code = 'NVIDIA_NIM_RATE_LIMITED';
    throw rateLimitError;
  }

  if (status === 502 || status === 503 || status === 504 || lastError?.code === 'ECONNABORTED') {
    console.error('NVIDIA NIM 호출 지연:', status || lastError?.code);
    const timeoutError = new Error('NVIDIA_NIM_TIMEOUT');
    timeoutError.code = 'NVIDIA_NIM_TIMEOUT';
    throw timeoutError;
  }

  console.error('NVIDIA NIM 호출 실패:', status || lastError?.message);
  const apiError = new Error('NVIDIA_NIM_REQUEST_FAILED');
  apiError.code = 'NVIDIA_NIM_REQUEST_FAILED';
  throw apiError;
}

export async function generateValorantAiReview(analysisData) {
  return generateNimReview(createPrompt(analysisData), 900);
}

export async function generateValorantFocusedReview(analysisData) {
  return generateNimReview(createFocusedPrompt(analysisData), 1200);
}
