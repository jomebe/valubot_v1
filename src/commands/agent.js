import axios from 'axios';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// 여러 API 엔드포인트 시도 (대체 URL 포함)
const API_ENDPOINTS = [
  'https://valorant-api.com/v1/agents',
  'https://dash.valorant-api.com/v1/agents',
  'https://api.henrikdev.xyz/valorant/v1/agents'
];

// 한글 에이전트 이름 매핑
const agentNameMapping = {
  // 듀얼리스트
  '제트': 'Jett',
  '레이즈': 'Raze',
  '레이나': 'Reyna',
  '요루': 'Yoru',
  '피닉스': 'Phoenix',
  '네온': 'Neon',
  '아이소': 'Iso',
  
  // 센티널
  '세이지': 'Sage',
  '사이퍼': 'Cypher',
  '킬조이': 'Killjoy',
  '체임버': 'Chamber',
  '데드락': 'Deadlock',
  
  // 컨트롤러
  '브림스톤': 'Brimstone',
  '오멘': 'Omen',
  '바이퍼': 'Viper',
  '아스트라': 'Astra',
  '하버': 'Harbor',
  '클로브': 'Clove',
  
  // 이니시에이터
  '소바': 'Sova',
  '브리치': 'Breach',
  '스카이': 'Skye',
  '케이오': 'KAY/O',
  '페이드': 'Fade',
  '게코': 'Gekko'
};

// 역할 한글 번역
const roleTranslation = {
  'Duelist': '듀얼리스트',
  'Sentinel': '센티널',
  'Controller': '컨트롤러',
  'Initiator': '이니시에이터'
};

// 텍스트 길이 제한 함수
function limitTextLength(text, maxLength = 200) {
  if (!text) return '정보 없음';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 에이전트 명령어
export const agentCommand = {
  name: 'ㅂ요원',
  aliases: ['ㅂ에이전트', 'ㅂㅇㅇ'],
  description: '발로란트 에이전트 정보를 보여줍니다.',
  async execute(message, args) {
    try {
      // 인자가 없으면 사용법 안내
      if (!args.length) {
        return message.reply('❓ 사용법: `ㅂ요원 [에이전트 이름]` (예: `ㅂ요원 제트`)');
      }
      
      // 로딩 메시지 전송
      const loadingMsg = await message.reply('🔍 에이전트 정보를 찾는 중입니다...');
      
      // 에이전트 이름 처리
      const agentNameInput = args.join(' ').toLowerCase();
      let agentNameEnglish = '';
      
      // 한글 이름을 영어로 변환
      for (const [koreanName, englishName] of Object.entries(agentNameMapping)) {
        if (koreanName.toLowerCase() === agentNameInput) {
          agentNameEnglish = englishName;
          break;
        }
      }
      
      // 영어 이름으로 직접 검색 (한글 매핑에 없는 경우)
      if (!agentNameEnglish) {
        agentNameEnglish = agentNameInput;
      }
      
      // 여러 API 엔드포인트 시도
      let response = null;
      let agents = [];
      let apiSuccess = false;
      
      for (const endpoint of API_ENDPOINTS) {
        try {
          console.log(`API 엔드포인트 시도: ${endpoint}`);
          response = await axios.get(`${endpoint}?language=ko-KR`, {
            timeout: 5000 // 5초 타임아웃 설정
          });
          
          if (response.data && response.data.data && response.data.data.length > 0) {
            apiSuccess = true;
            console.log(`API 요청 성공: ${endpoint}`);
            break;
          }
        } catch (error) {
          console.error(`API 엔드포인트 실패: ${endpoint}`, error.message);
          continue; // 다음 엔드포인트 시도
        }
      }
      
      if (!apiSuccess) {
        return loadingMsg.edit('❌ 에이전트 정보를 가져오는데 실패했습니다. 서버 연결을 확인해주세요.');
      }
      
      // 에이전트 찾기 (플레이어블 에이전트만)
      agents = response.data.data.filter(agent => agent.isPlayableCharacter);
      
      // 이름으로 에이전트 찾기
      const agent = agents.find(agent => 
        agent.displayName.toLowerCase() === agentNameInput || 
        agent.displayName.toLowerCase().includes(agentNameInput) ||
        agent.displayName.toLowerCase() === agentNameEnglish.toLowerCase() ||
        agent.displayName.toLowerCase().includes(agentNameEnglish.toLowerCase())
      );
      
      if (!agent) {
        return loadingMsg.edit(`❌ '${args.join(' ')}' 에이전트를 찾을 수 없습니다. 이름을 확인해주세요.`);
      }
      
      // 이미지 임베드
      const imageEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(agent.displayName)
        .setImage(agent.fullPortrait || agent.displayIcon);
      
      // 정보 임베드
      const infoEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(`${roleTranslation[agent.role.displayName] || agent.role.displayName}`)
        .setDescription(limitTextLength(agent.description, 250))
        .setThumbnail(agent.displayIcon)
        .addFields(
          { name: '📊 역할', value: roleTranslation[agent.role.displayName] || agent.role.displayName, inline: true },
          { name: '🌟 특성', value: limitTextLength(agent.role.description, 150), inline: true }
        )
        .setFooter({ text: '발로란트 에이전트 정보' })
        .setTimestamp();
      
      // 스킬 임베드 생성 (각 스킬마다 별도 임베드)
      const skillEmbeds = [];
      if (agent.abilities && agent.abilities.length > 0) {
        // 슬롯 순서대로 정렬
        const slotOrder = { 'Q': 0, 'E': 1, 'C': 2, 'X': 3 };
        const sortedAbilities = [...agent.abilities].sort((a, b) => {
          return (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99);
        });
        
        // 각 능력에 대한 별도 임베드 생성
        sortedAbilities.forEach(ability => {
          if (ability.displayName && ability.description) {
            const emojiPrefix = ability.slot === 'X' ? '⚡' : '🔸';
            
            const skillEmbed = new EmbedBuilder()
              .setColor(0xFF4654)
              .setTitle(`${emojiPrefix} ${ability.slot}: ${ability.displayName}`)
              .setDescription(limitTextLength(ability.description, 150));
            
            // 아이콘이 있으면 썸네일로 추가
            if (ability.displayIcon) {
              skillEmbed.setThumbnail(ability.displayIcon);
            }
            
            skillEmbeds.push(skillEmbed);
          }
        });
      }
      
      // 모든 임베드 합치기 (최대 10개까지만 가능)
      const allEmbeds = [imageEmbed, infoEmbed, ...skillEmbeds].slice(0, 10);
      
      // 임베드 전송
      await loadingMsg.edit({ 
        content: null, 
        embeds: allEmbeds
      });
      
    } catch (error) {
      console.error('에이전트 명령어 처리 중 오류:', error);
      message.reply('❌ 에이전트 정보를 가져오는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
  }
}; 