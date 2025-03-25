import axios from 'axios';
import { EmbedBuilder } from 'discord.js';

// 여러 API 엔드포인트 시도 (대체 URL 포함)
const API_ENDPOINTS = [
  'https://valorant-api.com/v1/weapons',
  'https://dash.valorant-api.com/v1/weapons'
];

// 한글 무기 이름 매핑
const weaponNameMapping = {
  // 라이플
  '밴달': 'Vandal',
  '반달': 'Vandal',
  '팬텀': 'Phantom',
  '불독': 'Bulldog',
  '가디언': 'Guardian',
  
  // 기관단총
  '스팅어': 'Stinger',
  '스펙터': 'Spectre',
  
  // 산탄총
  '버키': 'Bucky',
  '저지': 'Judge',
  
  // 스나이퍼
  '마샬': 'Marshal',
  '오퍼레이터': 'Operator',
  '오퍼': 'Operator',
  
  // 권총
  '클래식': 'Classic',
  '쇼티': 'Shorty',
  '프렌지': 'Frenzy',
  '고스트': 'Ghost',
  '쉐리프': 'Sheriff',
  
  // 중화기
  '아레스': 'Ares',
  '오딘': 'Odin',
  
  // 근접무기
  '택티컬 나이프': 'Tactical Knife',
  '나이프': 'Tactical Knife'
};

// 무기 카테고리 한글 번역
const categoryTranslation = {
  'Rifle': '라이플',
  'SMG': '기관단총',
  'Shotgun': '산탄총',
  'Sniper': '스나이퍼',
  'Pistol': '권총',
  'Heavy': '중화기',
  'Melee': '근접무기'
};

// 텍스트 길이 제한 함수
function limitTextLength(text, maxLength = 200) {
  if (!text) return '정보 없음';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 무기 명령어
export const weaponCommand = {
  name: 'ㅂ무기',
  aliases: ['ㅂㅁㄱ'],
  description: '발로란트 무기 정보를 보여줍니다.',
  async execute(message, args) {
    try {
      // 인자가 없으면 사용법 안내
      if (!args.length) {
        return message.reply('❓ 사용법: `ㅂ무기 [무기 이름]` (예: `ㅂ무기 밴달`)');
      }
      
      // 로딩 메시지 전송
      const loadingMsg = await message.reply('🔍 무기 정보를 찾는 중입니다...');
      
      // 무기 이름 처리
      const weaponNameInput = args.join(' ').toLowerCase();
      let weaponNameEnglish = '';
      
      // 한글 이름을 영어로 변환
      for (const [koreanName, englishName] of Object.entries(weaponNameMapping)) {
        if (koreanName.toLowerCase() === weaponNameInput) {
          weaponNameEnglish = englishName;
          break;
        }
      }
      
      // 영어 이름으로 직접 검색 (한글 매핑에 없는 경우)
      if (!weaponNameEnglish) {
        weaponNameEnglish = weaponNameInput;
      }
      
      // 여러 API 엔드포인트 시도
      let response = null;
      let weapons = [];
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
        return loadingMsg.edit('❌ 무기 정보를 가져오는데 실패했습니다. 서버 연결을 확인해주세요.');
      }
      
      // 무기 데이터 가져오기
      weapons = response.data.data;
      
      // 이름으로 무기 찾기
      const weapon = weapons.find(weapon => 
        weapon.displayName.toLowerCase() === weaponNameInput || 
        weapon.displayName.toLowerCase().includes(weaponNameInput) ||
        weapon.displayName.toLowerCase() === weaponNameEnglish.toLowerCase() ||
        weapon.displayName.toLowerCase().includes(weaponNameEnglish.toLowerCase())
      );
      
      if (!weapon) {
        return loadingMsg.edit(`❌ '${args.join(' ')}' 무기를 찾을 수 없습니다. 이름을 확인해주세요.`);
      }
      
      // 무기 정보 임베드 생성
      const weaponEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(weapon.displayName)
        .setDescription(weapon.shopData?.categoryText || '정보 없음')
        .setImage(weapon.displayIcon)
        .setThumbnail(weapon.killStreamIcon || weapon.displayIcon)
        .addFields(
          { name: '📊 카테고리', value: categoryTranslation[weapon.category?.split('::')[1]] || weapon.category || '정보 없음', inline: true },
          { name: '💰 가격', value: weapon.shopData?.cost ? `${weapon.shopData.cost} 크레딧` : '정보 없음', inline: true }
        )
        .setFooter({ text: '발로란트 무기 정보' })
        .setTimestamp();
      
      // 무기 스탯 정보 추가
      if (weapon.weaponStats) {
        const stats = weapon.weaponStats;
        
        // 발사 속도, 장탄수, 재장전 시간
        weaponEmbed.addFields(
          { name: '🔫 발사 속도', value: stats.fireRate ? `${stats.fireRate.toFixed(2)} 발/초` : '정보 없음', inline: true },
          { name: '📦 장탄수', value: stats.magazineSize ? `${stats.magazineSize}발` : '정보 없음', inline: true },
          { name: '⏱️ 재장전 시간', value: stats.reloadTimeSeconds ? `${stats.reloadTimeSeconds.toFixed(2)}초` : '정보 없음', inline: true }
        );
        
        // 데미지 정보
        if (stats.damageRanges && stats.damageRanges.length > 0) {
          const damageRange = stats.damageRanges[0]; // 첫 번째 데미지 범위
          
          weaponEmbed.addFields(
            { name: '💥 데미지 (머리/몸통/다리)', value: `${damageRange.headDamage}/${damageRange.bodyDamage}/${damageRange.legDamage}`, inline: true },
            { name: '📏 유효 사거리', value: `${damageRange.rangeStartMeters}-${damageRange.rangeEndMeters}m`, inline: true }
          );
        }
      }
      
      // 무기 스킨 정보 임베드 생성
      const skinsEmbed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(`${weapon.displayName} - 기본 스킨`)
        .setImage(weapon.displayIcon);
      
      // 임베드 배열 생성
      const embeds = [weaponEmbed, skinsEmbed];
      
      // 임베드 전송
      await loadingMsg.edit({ 
        content: null, 
        embeds: embeds
      });
      
    } catch (error) {
      console.error('무기 명령어 처리 중 오류:', error);
      message.reply('❌ 무기 정보를 가져오는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
  }
}; 