import axios from 'axios';

// API 응답 캐시
const cache = {
  accounts: new Map(),
  mmr: new Map(),
  matches: new Map(),
  agents: null,  // 요원 정보 캐시
  tiers: null    // 티어 정보 캐시
};

// 캐시 유효 시간 (5분)
const CACHE_DURATION = 5 * 60 * 1000;

// API 호출 함수들
export const valorantApi = {
  // 계정 정보 조회
  async getAccount(name, tag) {
    try {
      const cacheKey = `${name}#${tag}`;
      const cached = cache.accounts.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }

      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        { 
          headers: { 
            'Authorization': process.env.VALORANT_API_KEY 
          },
          validateStatus: status => status < 500 // 404도 정상적인 응답으로 처리
        }
      );

      // API 에러 응답 처리
      if (response.status === 404) {
        throw new Error(`플레이어를 찾을 수 없습니다: ${name}#${tag}`);
      }
      
      if (response.status === 429) {
        throw new Error('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
      }

      if (!response.data.data) {
        throw new Error(`API 응답 오류: ${JSON.stringify(response.data)}`);
      }

      const data = response.data.data;
      cache.accounts.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`플레이어를 찾을 수 없습니다: ${name}#${tag}`);
      }
      if (error.response?.status === 429) {
        throw new Error('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
      }
      console.error('계정 정보 조회 실패:', error);
      throw new Error('계정 정보를 가져오는데 실패했습니다.');
    }
  },

  // MMR 정보 조회
  async getMMR(region, puuid) {
    const cacheKey = `${region}:${puuid}`;
    const cached = cache.mmr.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const response = await axios.get(
      `https://api.henrikdev.xyz/valorant/v2/by-puuid/mmr/${region}/${puuid}`,
      { headers: { 'Authorization': process.env.VALORANT_API_KEY } }
    );

    const data = response.data.data;
    cache.mmr.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  },

  // 매치 기록 조회
  async getMatches(region, name, tag, size = 5) {
    const cacheKey = `${region}:${name}#${tag}:${size}`;
    const cached = cache.matches.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const response = await axios.get(
      `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${size}`,
      { headers: { 'Authorization': process.env.VALORANT_API_KEY } }
    );

    const data = response.data.data;
    cache.matches.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  },

  // 캐시 정리 (1시간마다 실행)
  cleanCache() {
    const now = Date.now();
    
    [cache.accounts, cache.mmr, cache.matches].forEach(cacheMap => {
      for (const [key, value] of cacheMap.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
          cacheMap.delete(key);
        }
      }
    });
  },

  // 요원 정보 가져오기
  async getAgents() {
    if (cache.agents) {
      return cache.agents;
    }

    try {
      const response = await axios.get('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
      const agents = {};
      response.data.data.forEach(agent => {
        agents[agent.displayName] = agent.displayIcon;
      });
      cache.agents = agents;
      return agents;
    } catch (error) {
      console.error('요원 정보 가져오기 실패:', error);
      return {};
    }
  },

  // 티어 아이콘 가져오기
  async getTierIcons() {
    if (cache.tiers) {
      return cache.tiers;
    }

    try {
      const response = await axios.get('https://valorant-api.com/v1/competitivetiers');
      const tiers = {};
      const latestTier = response.data.data[response.data.data.length - 1];
      
      latestTier.tiers.forEach(tier => {
        tiers[tier.tierName] = tier.largeIcon;
      });
      cache.tiers = tiers;
      return tiers;
    } catch (error) {
      console.error('티어 정보 가져오기 실패:', error);
      return {};
    }
  }
};

// 주기적으로 캐시 정리
setInterval(() => valorantApi.cleanCache(), 60 * 60 * 1000); 