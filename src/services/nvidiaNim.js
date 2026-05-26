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

async function requestChatCompletion(apiKey, model, analysisData) {
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
          content: createPrompt(analysisData),
        },
      ],
      temperature: 0.35,
      top_p: 0.9,
      max_tokens: 900,
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

export async function generateValorantAiReview(analysisData) {
  const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    const error = new Error('NVIDIA_NIM_API_KEY_MISSING');
    error.code = 'NVIDIA_NIM_API_KEY_MISSING';
    throw error;
  }

  enforceLocalRateLimit();

  const models = getModelCandidates();
  let lastError = null;

  for (const model of models) {
    try {
      return await requestChatCompletion(apiKey, model, analysisData);
    } catch (error) {
      if (error.code?.startsWith?.('NVIDIA_NIM_')) {
        throw error;
      }

      const status = error.response?.status;
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

      lastError = error;
      if (status === 502 || status === 503 || status === 504 || error.code === 'ECONNABORTED') {
        continue;
      }

      break;
    }
  }

  const status = lastError?.response?.status;
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
