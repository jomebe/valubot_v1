import axios from 'axios';
import { EmbedBuilder } from 'discord.js';

// 여러 API 엔드포인트 시도 (대체 URL 포함)
const API_ENDPOINTS = [
  'https://valorant-api.com/v1/maps',
  'https://dash.valorant-api.com/v1/maps'
];

// 한글 맵 이름 매핑
const mapNameMapping = {
  '어센트': 'Ascent',
  '바인드': 'Bind',
  '브리즈': 'Breeze',
  '프랙처': 'Fracture',
  '헤이븐': 'Haven',
  '아이스박스': 'Icebox',
  '로터스': 'Lotus',
  '펄': 'Pearl',
  '스플릿': 'Split',
  '선셋': 'Sunset'
};

// 텍스트 길이 제한 함수
function limitTextLength(text, maxLength = 200) {
  if (!text) return '정보 없음';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 맵 명령어
export const mapCommand = {
  name: 'ㅂ맵',
  aliases: ['ㅂㅁ'],
  description: '발로란트 맵 정보를 보여줍니다.',
  async execute(message, args) {
    try {
      // 인자가 없으면 사용법 안내
      if (!args.length) {
        return message.reply('❓ 사용법: `ㅂ맵 [맵 이름]` (예: `ㅂ맵 어센트`)');
      }
      
      // 로딩 메시지 전송
      const loadingMsg = await message.reply('🔍 맵 정보를 찾는 중입니다...');
      
      // 맵 이름 처리
      const mapNameInput = args.join(' ').toLowerCase();
      let mapNameEnglish = '';
      
      // 한글 이름을 영어로 변환
      for (const [koreanName, englishName] of Object.entries(mapNameMapping)) {
        if (koreanName.toLowerCase() === mapNameInput) {
          mapNameEnglish = englishName;
          break;
        }
      }
      
      // 영어 이름으로 직접 검색 (한글 매핑에 없는 경우)
      if (!mapNameEnglish) {
        mapNameEnglish = mapNameInput;
      }
      
      // 여러 API 엔드포인트 시도
      let response = null;
      let maps = [];
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
        return loadingMsg.edit('❌ 맵 정보를 가져오는데 실패했습니다. 서버 연결을 확인해주세요.');
      }
      
      // 맵 데이터 가져오기
      maps = response.data.data;
      
      // 이름으로 맵 찾기
      const map = maps.find(map => 
        map.displayName.toLowerCase() === mapNameInput || 
        map.displayName.toLowerCase().includes(mapNameInput) ||
        map.displayName.toLowerCase() === mapNameEnglish.toLowerCase() ||
        map.displayName.toLowerCase().includes(mapNameEnglish.toLowerCase())
      );
      
      if (!map) {
        return loadingMsg.edit(`❌ '${args.join(' ')}' 맵을 찾을 수 없습니다. 이름을 확인해주세요.`);
      }
      
      // 맵 정보 임베드 생성
      const mapEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(map.displayName)
        .setDescription(map.narrativeDescription || '설명 없음')
        .setImage(map.splash || map.displayIcon)
        .setThumbnail(map.displayIcon)
        .addFields(
          { name: '📍 좌표', value: map.coordinates || '정보 없음', inline: true },
          { name: '🌐 위치', value: map.narrativeDescription ? limitTextLength(map.narrativeDescription, 100) : '정보 없음', inline: true }
        )
        .setFooter({ text: '발로란트 맵 정보' })
        .setTimestamp();
      
      // 미니맵 임베드 생성 (미니맵 이미지가 있는 경우)
      const minimapEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(`${map.displayName} - 미니맵`)
        .setImage(map.displayIcon);
      
      // 맵 레이아웃 임베드 생성 (레이아웃 이미지가 있는 경우)
      const layoutEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(`${map.displayName} - 레이아웃`)
        .setImage(map.listViewIcon || map.displayIcon);
      
      // 임베드 배열 생성
      const embeds = [mapEmbed];
      
      // 미니맵과 레이아웃 임베드 추가 (이미지가 다른 경우에만)
      if (map.displayIcon && map.displayIcon !== map.splash) {
        embeds.push(minimapEmbed);
      }
      
      if (map.listViewIcon && map.listViewIcon !== map.displayIcon && map.listViewIcon !== map.splash) {
        embeds.push(layoutEmbed);
      }
      
      // 임베드 전송
      await loadingMsg.edit({ 
        content: null, 
        embeds: embeds
      });
      
    } catch (error) {
      console.error('맵 명령어 처리 중 오류:', error);
      message.reply('❌ 맵 정보를 가져오는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
  }
}; 