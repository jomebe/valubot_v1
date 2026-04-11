import axios from 'axios';

// API 응답 캐시 (리소스 최적화)
const cache = {
  accounts: new Map(),
  mmr: new Map(),
  matches: new Map(),
  agents: null,  // 요원 정보 캐시
  tiers: null    // 티어 정보 캐시
};

// 캐시 유효 시간 (15분 - 기존 5분에서 증가)
const CACHE_DURATION = 15 * 60 * 1000;

// 캐시 최대 크기 (메모리 관리)
const MAX_CACHE_SIZE = 100;

// 캐시 정리 함수 (리소스 관리)
function cleanupCache(cacheMap) {
  if (cacheMap.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cacheMap.entries());
    // 가장 오래된 항목 절반 삭제
    entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2)).forEach(([key]) => {
      cacheMap.delete(key);
    });
  }
}

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

      // 캐시 정리 (메모리 관리)
      cleanupCache(cache.accounts);

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

    // 캐시 정리 (메모리 관리)
    cleanupCache(cache.mmr);

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

    // 캐시 정리 (메모리 관리)
    cleanupCache(cache.matches);

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

  // ======= Esports v2 VLR 엔드포인트 (v4.6.0) =======

  // VLR 이벤트 목록 조회
  async getEsportsEvents() {
    try {
      const response = await axios.get(
        'https://api.henrikdev.xyz/valorant/v2/esports/vlr/events',
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 이벤트 조회 실패:', error);
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      
      throw new Error('이스포츠 이벤트 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 이벤트 매치 목록 조회
  async getEsportsEventMatches(eventId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/events/${eventId}/matches`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 이벤트 매치 조회 실패:', error);
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      
      throw new Error('이벤트 매치 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 매치 상세 조회
  async getEsportsMatch(matchId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/matches/${matchId}`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 매치 상세 조회 실패:', error);
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      if (error.response?.status === 404) {
        throw new Error('NOT_FOUND');
      }
      
      throw new Error('매치 상세 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 팀 정보 조회
  async getEsportsTeam(teamId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/teams/${teamId}`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 팀 조회 실패:', error);
      
      // 클라이언트 타임아웃 또는 504 게이트웨이 타임아웃
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      if (error.response?.status === 404) {
        throw new Error('NOT_FOUND');
      }
      
      throw new Error('팀 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 팀 매치 조회
  async getEsportsTeamMatches(teamId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/teams/${teamId}/matches`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 팀 매치 조회 실패:', error);
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      
      throw new Error('팀 매치 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 팀 트랜잭션(이적) 조회
  async getEsportsTeamTransactions(teamId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/teams/${teamId}/transactions`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 팀 이적 정보 조회 실패:', error);
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      
      throw new Error('팀 이적 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 선수 정보 조회
  async getEsportsPlayer(playerId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/players/${playerId}`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 선수 조회 실패:', error);
      
      // 클라이언트 타임아웃 또는 504 게이트웨이 타임아웃
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      if (error.response?.status === 404) {
        throw new Error('NOT_FOUND');
      }
      
      throw new Error('선수 정보를 가져오는데 실패했습니다.');
    }
  },

  // VLR 선수 매치 조회
  async getEsportsPlayerMatches(playerId) {
    try {
      const response = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/esports/vlr/players/${playerId}/matches`,
        { 
          headers: { 'Authorization': process.env.VALORANT_API_KEY },
          timeout: 30000 // 30초 타임아웃
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('이스포츠 선수 매치 조회 실패:', error);
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
        throw new Error('API_TIMEOUT');
      }
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      
      throw new Error('선수 매치 정보를 가져오는데 실패했습니다.');
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