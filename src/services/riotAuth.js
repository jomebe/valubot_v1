/**
 * Riot Games 인증 서비스
 * ⚠️ 경고: 이 코드는 개인 학습/연구 목적으로만 사용해야 합니다.
 * Riot Games 약관 위반 가능성이 있으며, 실제 서비스 배포는 권장하지 않습니다.
 */

import axios from 'axios';
import { saveUserSession, getUserSession as getStoredUserSession, deleteUserSession } from './authStore.js';

// 리전별 API 엔드포인트
const REGIONS = {
  'na': { pd: 'pd.na.a.pvp.net', glz: 'glz-na-1.na.a.pvp.net' },
  'eu': { pd: 'pd.eu.a.pvp.net', glz: 'glz-eu-1.eu.a.pvp.net' },
  'ap': { pd: 'pd.ap.a.pvp.net', glz: 'glz-ap-1.ap.a.pvp.net' },
  'kr': { pd: 'pd.kr.a.pvp.net', glz: 'glz-kr-1.kr.a.pvp.net' },
  'br': { pd: 'pd.br.a.pvp.net', glz: 'glz-br-1.br.a.pvp.net' },
  'latam': { pd: 'pd.latam.a.pvp.net', glz: 'glz-latam-1.latam.a.pvp.net' }
};

// 클라이언트 플랫폼 (Base64 인코딩)
const CLIENT_PLATFORM = 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

// User Agent
const USER_AGENT = 'RiotClient/70.0.0.5001641.4810659 rso-auth (Windows;10;;Professional, x64)';

/**
 * 클라이언트 버전 가져오기
 */
async function getClientVersion() {
  try {
    const response = await axios.get('https://valorant-api.com/v1/version');
    const data = response.data.data;
    return `${data.branch}-shipping-${data.buildVersion}-${data.version.slice(-6)}`;
  } catch (error) {
    console.error('클라이언트 버전 조회 실패:', error);
    return 'release-09.00-shipping-26-2624822';
  }
}

/**
 * UUID 생성 헬퍼
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * QR 로그인 세션 생성
 * Riot 서버에서 suuid와 cluster를 받아와서 QR URL 생성
 */
async function createQRLoginSession(discordUserId) {
  try {
    // 기존 세션 정리
    if (qrSessions.has(discordUserId)) {
      qrSessions.delete(discordUserId);
    }

    // 1. 인증 쿠키 초기화
    const initResponse = await axios.post(
      'https://auth.riotgames.com/api/v1/authorization',
      {
        client_id: 'riot-client',
        nonce: generateUUID(),
        redirect_uri: 'http://localhost/redirect',
        response_type: 'token id_token',
        scope: 'account openid'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT
        }
      }
    );

    // Set-Cookie 헤더에서 쿠키 추출
    const setCookies = initResponse.headers['set-cookie'] || [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
    
    // 2. authenticate.riotgames.com에서 suuid와 cluster 획득
    const authResponse = await axios.post(
      'https://authenticate.riotgames.com/api/v1/login',
      {
        clientId: 'riot-client',
        language: '',
        platform: 'windows',
        remember: false,
        riot_identity: {
          language: 'ko_KR',
          state: 'auth'
        },
        sdkVersion: '24.6.1.3774',
        type: 'auth'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Cookie': cookies
        }
      }
    );

    const authData = authResponse.data;
    console.log('Auth 응답:', JSON.stringify(authData, null, 2));
    
    // suuid와 cluster 추출
    const suuid = authData.suuid;
    const cluster = authData.cluster || 'kr1';
    
    if (!suuid) {
      throw new Error('Riot 서버에서 suuid를 받지 못했습니다.');
    }

    const timestamp = Date.now();
    
    // QR 코드 URL 생성 - Riot Mobile 앱 딥링크
    const qrLoginUrl = `https://qrlogin.riotgames.com/riotmobile?cluster=${cluster}&suuid=${suuid}&timestamp=${timestamp}`;

    // 응답 쿠키 병합
    const authCookies = authResponse.headers['set-cookie'] || [];
    const allCookies = [...setCookies, ...authCookies].map(c => c.split(';')[0]).join('; ');

    const session = {
      suuid,
      cluster,
      cookies: allCookies,
      qrUrl: qrLoginUrl,
      createdAt: timestamp,
      expiresAt: timestamp + (5 * 60 * 1000), // 5분
      status: 'pending'
    };

    qrSessions.set(discordUserId, session);

    return {
      success: true,
      qrUrl: qrLoginUrl,
      suuid,
      cluster,
      expiresIn: 300
    };

  } catch (error) {
    console.error('QR 세션 생성 실패:', error.response?.data || error.message);
    throw new Error('QR 로그인 세션을 생성할 수 없습니다.');
  }
}

/**
 * QR 로그인 상태 폴링
 * authenticate.riotgames.com의 login 상태 확인 (GET 요청)
 */
async function pollQRLoginStatus(discordUserId) {
  const session = qrSessions.get(discordUserId);
  
  if (!session) {
    return {
      success: false,
      status: 'error',
      message: '로그인 세션이 없습니다. ㅂ로그인을 다시 시도해주세요.'
    };
  }

  if (Date.now() > session.expiresAt) {
    qrSessions.delete(discordUserId);
    return {
      success: false,
      status: 'expired',
      message: 'QR 코드가 만료되었습니다. ㅂ로그인을 다시 시도해주세요.'
    };
  }

  if (session.status === 'completed') {
    return {
      success: true,
      status: 'completed',
      playerName: session.playerName
    };
  }

  try {
    // authenticate.riotgames.com에서 로그인 상태 확인 (GET 요청)
    const response = await axios.get(
      `https://authenticate.riotgames.com/api/v1/login?suuid=${session.suuid}&cluster=${session.cluster}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Cookie': session.cookies
        }
      }
    );

    const data = response.data;
    console.log('폴링 응답:', JSON.stringify(data, null, 2));

    // 로그인 성공 (type: success)
    if (data.type === 'success' && data.success?.login_token) {
      console.log('QR 로그인 성공! login_token 획득');
      return await completeQRLogin(discordUserId, session, data.success.login_token);
    }

    // 아직 대기 중 (type: auth)
    if (data.type === 'auth') {
      return {
        success: true,
        status: 'pending',
        message: 'QR 코드 스캔을 기다리는 중...'
      };
    }

    // 기타 응답
    return {
      success: true,
      status: 'pending',
      message: 'QR 코드 스캔을 기다리는 중...'
    };

  } catch (error) {
    console.error('폴링 오류:', error.response?.data || error.message);
    
    // 에러가 발생해도 세션이 유효하면 계속 대기
    return {
      success: true,
      status: 'pending',
      message: 'QR 코드 스캔을 기다리는 중...'
    };
  }
}

/**
 * QR 로그인 완료 처리
 */
async function completeQRLogin(discordUserId, session, loginToken) {
  try {
    // login_token으로 쿠키 로그인
    const cookieLoginResponse = await axios.post(
      'https://auth.riotgames.com/api/v1/login-token',
      {
        authentication_type: 'RiotAuth',
        code_verifier: '',
        login_token: loginToken,
        persist_login: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Cookie': session.cookies
        }
      }
    );

    // 새 쿠키 추출
    const newCookies = cookieLoginResponse.headers['set-cookie'] || [];
    const allCookies = [...session.cookies.split('; '), ...newCookies.map(c => c.split(';')[0])].join('; ');

    // 토큰 획득
    const tokenResponse = await axios.post(
      'https://auth.riotgames.com/api/v1/authorization',
      {
        client_id: 'riot-client',
        nonce: generateUUID(),
        redirect_uri: 'http://localhost/redirect',
        response_type: 'token id_token',
        scope: 'account openid'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Cookie': allCookies
        }
      }
    );

    const tokenData = tokenResponse.data;
    
    if (tokenData.type !== 'response' || !tokenData.response?.parameters?.uri) {
      throw new Error('토큰 응답이 올바르지 않습니다.');
    }

    const redirectUrl = tokenData.response.parameters.uri;
    return await completeLogin(discordUserId, { cookies: allCookies }, redirectUrl);

  } catch (error) {
    console.error('QR 로그인 완료 처리 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 로그인 완료 처리
 */
async function completeLogin(discordUserId, session, redirectUrl) {
  try {
    const tokens = extractTokensFromUrl(redirectUrl);
    const entitlements = await getEntitlementsToken(tokens.accessToken);
    const userInfo = await getUserInfo(tokens.accessToken);
    const region = await getRegion(tokens.accessToken, tokens.idToken);

    const sessionData = {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      entitlementsToken: entitlements,
      puuid: userInfo.puuid,
      playerName: userInfo.playerName,
      region: region,
      expiresAt: Date.now() + (55 * 60 * 1000),
      cookies: session.cookies
    };

    userSessions.set(discordUserId, sessionData);
    
    session.status = 'completed';
    session.playerName = userInfo.playerName;

    return {
      success: true,
      status: 'completed',
      playerName: userInfo.playerName
    };
  } catch (error) {
    console.error('로그인 완료 처리 실패:', error);
    throw error;
  }
}

/**
 * 쿠키 기반 로그인
 */
async function loginWithCookie(discordUserId, ssidCookie) {
  try {
    let cookieHeader = ssidCookie.trim();
    
    if (!cookieHeader.includes('=')) {
      cookieHeader = `ssid=${cookieHeader}`;
    }

    const response = await axios.get(
      'https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20openid&nonce=1',
      {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': USER_AGENT
        },
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400
      }
    );

    const redirectUrl = response.headers.location;
    
    if (!redirectUrl || redirectUrl.includes('/login') || !redirectUrl.includes('access_token=')) {
      throw new Error('쿠키가 만료되었거나 유효하지 않습니다.');
    }

    const tokens = extractTokensFromUrl(redirectUrl);
    const entitlements = await getEntitlementsToken(tokens.accessToken);
    const userInfo = await getUserInfo(tokens.accessToken);
    const region = await getRegion(tokens.accessToken, tokens.idToken);

    const sessionData = {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      entitlementsToken: entitlements,
      puuid: userInfo.puuid,
      playerName: userInfo.playerName,
      region: region,
      expiresAt: Date.now() + (55 * 60 * 1000),
      cookies: cookieHeader
    };

    userSessions.set(discordUserId, sessionData);

    return {
      success: true,
      playerName: userInfo.playerName,
      region
    };

  } catch (error) {
    if (error.response?.status === 303 || error.response?.status === 302) {
      const redirectUrl = error.response.headers.location;
      
      if (redirectUrl && redirectUrl.includes('access_token=')) {
        const tokens = extractTokensFromUrl(redirectUrl);
        const entitlements = await getEntitlementsToken(tokens.accessToken);
        const userInfo = await getUserInfo(tokens.accessToken);
        const region = await getRegion(tokens.accessToken, tokens.idToken);

        const sessionData = {
          accessToken: tokens.accessToken,
          idToken: tokens.idToken,
          entitlementsToken: entitlements,
          puuid: userInfo.puuid,
          playerName: userInfo.playerName,
          region: region,
          expiresAt: Date.now() + (55 * 60 * 1000),
          cookies: ssidCookie
        };

        userSessions.set(discordUserId, sessionData);

        return {
          success: true,
          playerName: userInfo.playerName,
          region
        };
      }
    }
    
    console.error('쿠키 로그인 실패:', error.message);
    throw new Error('로그인에 실패했습니다. 쿠키가 유효한지 확인해주세요.');
  }
}

/**
 * URL에서 토큰 추출
 */
function extractTokensFromUrl(url) {
  const decodedUrl = decodeURIComponent(url);
  
  let tokenPart = decodedUrl;
  if (decodedUrl.includes('#')) {
    tokenPart = decodedUrl.split('#')[1];
  } else if (decodedUrl.includes('?')) {
    tokenPart = decodedUrl.split('?')[1];
  }

  const accessTokenMatch = tokenPart.match(/access_token=([^&]+)/);
  const idTokenMatch = tokenPart.match(/id_token=([^&]+)/);
  
  if (!accessTokenMatch) {
    throw new Error('액세스 토큰을 찾을 수 없습니다.');
  }

  return {
    accessToken: accessTokenMatch[1],
    idToken: idTokenMatch ? idTokenMatch[1] : null
  };
}

/**
 * Entitlements 토큰 획득
 */
async function getEntitlementsToken(accessToken) {
  const response = await axios.post(
    'https://entitlements.auth.riotgames.com/api/token/v1',
    {},
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT
      }
    }
  );

  return response.data.entitlements_token;
}

/**
 * 사용자 정보 획득
 */
async function getUserInfo(accessToken) {
  const response = await axios.get(
    'https://auth.riotgames.com/userinfo',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': USER_AGENT
      }
    }
  );

  const data = response.data;
  return {
    puuid: data.sub,
    playerName: data.acct ? `${data.acct.game_name}#${data.acct.tag_line}` : 'Unknown'
  };
}

/**
 * 리전 정보 획득
 */
async function getRegion(accessToken, idToken) {
  try {
    const response = await axios.put(
      'https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant',
      { id_token: idToken },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT
        }
      }
    );

    return response.data.affinities?.live || 'kr';
  } catch (error) {
    console.error('리전 정보 획득 실패:', error.message);
    return 'kr';
  }
}

/**
 * 사용자 세션 확인 (authStore 연동)
 */
function getUserSession(discordUserId) {
  return getStoredUserSession(discordUserId);
}

/**
 * 사용자 로그아웃 (authStore 연동)
 */
function logoutUser(discordUserId) {
  return deleteUserSession(discordUserId);
}

/**
 * 리다이렉트 URL에서 토큰을 추출하고 검증 후 세션 저장
 */
async function validateAndSaveToken(discordUserId, redirectUrl) {
  try {
    const tokens = extractTokensFromUrl(redirectUrl);
    
    // 토큰 검증 단계: entitlements_token 및 사용자 정보 조회
    const entitlementsToken = await getEntitlementsToken(tokens.accessToken);
    const userInfo = await getUserInfo(tokens.accessToken);
    const region = await getRegion(tokens.accessToken, tokens.idToken);
    
    const resolvedRegion = region || 'kr';
    const expiresAt = Date.now() + (55 * 60 * 1000); // 55분 유효
    
    const sessionData = {
      puuid: userInfo.puuid,
      playerName: userInfo.playerName,
      region: resolvedRegion,
      expiresAt: expiresAt,
      accessToken: tokens.accessToken,
      entitlementsToken: entitlementsToken
    };
    
    saveUserSession(discordUserId, sessionData);
    
    return {
      success: true,
      playerName: userInfo.playerName,
      region: resolvedRegion
    };
  } catch (error) {
    console.error('인증 토큰 검증 실패:', error.message);
    throw new Error('올바른 라이엇 로그인 URL이 아니거나 토큰이 만료되었습니다.');
  }
}

/**
 * 상점 조회
 */
async function getStorefront(discordUserId) {
  const session = getUserSession(discordUserId);
  
  if (!session) {
    throw new Error('로그인이 필요합니다. 먼저 `ㅂ로그인`을 사용해주세요.');
  }

  const clientVersion = await getClientVersion();
  const regionData = REGIONS[session.region] || REGIONS['kr'];

  try {
    const response = await axios.get(
      `https://${regionData.pd}/store/v2/storefront/${session.puuid}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'X-Riot-Entitlements-JWT': session.entitlementsToken,
          'X-Riot-ClientVersion': clientVersion,
          'X-Riot-ClientPlatform': CLIENT_PLATFORM,
          'User-Agent': USER_AGENT
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('상점 조회 실패:', error.response?.data || error.message);
    
    if (error.response?.status === 400 || error.response?.status === 401) {
      deleteUserSession(discordUserId);
      throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
    }
    
    throw new Error('상점 정보를 가져오는데 실패했습니다.');
  }
}

/**
 * 가격 정보 조회
 */
async function getOffers(discordUserId) {
  const session = getUserSession(discordUserId);
  
  if (!session) {
    throw new Error('로그인이 필요합니다.');
  }

  const clientVersion = await getClientVersion();
  const regionData = REGIONS[session.region] || REGIONS['kr'];

  try {
    const response = await axios.get(
      `https://${regionData.pd}/store/v1/offers`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'X-Riot-Entitlements-JWT': session.entitlementsToken,
          'X-Riot-ClientVersion': clientVersion,
          'X-Riot-ClientPlatform': CLIENT_PLATFORM,
          'User-Agent': USER_AGENT
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('가격 조회 실패:', error);
    throw new Error('가격 정보를 가져오는데 실패했습니다.');
  }
}

/**
 * 지갑 조회
 */
async function getWallet(discordUserId) {
  const session = getUserSession(discordUserId);
  
  if (!session) {
    throw new Error('로그인이 필요합니다.');
  }

  const clientVersion = await getClientVersion();
  const regionData = REGIONS[session.region] || REGIONS['kr'];

  try {
    const response = await axios.get(
      `https://${regionData.pd}/store/v1/wallet/${session.puuid}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'X-Riot-Entitlements-JWT': session.entitlementsToken,
          'X-Riot-ClientVersion': clientVersion,
          'X-Riot-ClientPlatform': CLIENT_PLATFORM,
          'User-Agent': USER_AGENT
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('지갑 조회 실패:', error);
    if (error.response?.status === 400 || error.response?.status === 401) {
      deleteUserSession(discordUserId);
      throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
    }
    throw new Error('지갑 정보를 가져오는데 실패했습니다.');
  }
}

/**
 * 보유 스킨 조회
 */
async function getOwnedSkins(discordUserId) {
  const session = getUserSession(discordUserId);
  
  if (!session) {
    throw new Error('로그인이 필요합니다.');
  }

  const clientVersion = await getClientVersion();
  const regionData = REGIONS[session.region] || REGIONS['kr'];
  const SKIN_ITEM_TYPE = 'e7c63390-eda7-46e0-bb7a-a6abdacd2433';

  try {
    const response = await axios.get(
      `https://${regionData.pd}/store/v1/entitlements/${session.puuid}/${SKIN_ITEM_TYPE}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'X-Riot-Entitlements-JWT': session.entitlementsToken,
          'X-Riot-ClientVersion': clientVersion,
          'X-Riot-ClientPlatform': CLIENT_PLATFORM,
          'User-Agent': USER_AGENT
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('보유 스킨 조회 실패:', error);
    if (error.response?.status === 400 || error.response?.status === 401) {
      deleteUserSession(discordUserId);
      throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
    }
    throw new Error('보유 스킨 정보를 가져오는데 실패했습니다.');
  }
}

export {
  createQRLoginSession,
  pollQRLoginStatus,
  loginWithCookie,
  getUserSession,
  logoutUser,
  getStorefront,
  getOffers,
  getWallet,
  getOwnedSkins,
  getClientVersion,
  validateAndSaveToken
};
