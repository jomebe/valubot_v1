import axios from 'axios';

// 맵 정보를 가져오는 함수
const fetchMaps = async () => {
  try {
    const response = await axios.get('https://valorant-api.com/v1/maps');
    const maps = response.data.data
      .filter(map => map.displayName !== 'The Range') // 연습장 제외
      .map(map => ({
        name: map.displayName,
        emoji: getMapEmoji(map.displayName),
        splash: map.splash,
        displayIcon: map.displayIcon
      }));
    return maps;
  } catch (error) {
    console.error('맵 정보 가져오기 실패:', error);
    return [];
  }
};

// 맵 이모지 매핑
const getMapEmoji = (mapName) => {
  const mapEmojis = {
    'Ascent': '🏰',
    'Split': '🌆',
    'Fracture': '🏚️',
    'Bind': '🏜️',
    'Breeze': '🏖️',
    'Lotus': '🌸',
    'Pearl': '🌊',
    'Haven': '⛩️',
    'Icebox': '❄️',
    'Sunset': '🌅'
  };
  return mapEmojis[mapName] || '🗺️';
};

// 맵 정보 캐시
let mapCache = null;

export const randomMapCommand = {
  name: ['ㅂ랜덤맵', 'ㅂㄹㄷㅁ'],
  execute: async (message, args) => {
    try {
      // 맵 정보가 없으면 가져오기
      if (!mapCache) {
        mapCache = await fetchMaps();
      }

      if (mapCache.length === 0) {
        return message.reply('❌ 맵 정보를 가져오는데 실패했습니다.');
      }

      let count = 1;
      if (args.length > 0) {
        count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > mapCache.length) {
          return message.reply(`❌ 1에서 ${mapCache.length} 사이의 숫자를 입력해주세요.`);
        }
      }

      // 맵 배열을 섞음
      const shuffledMaps = [...mapCache].sort(() => Math.random() - 0.5);
      const selectedMaps = shuffledMaps.slice(0, count);

      const embed = {
        color: 0xFF4654,
        title: '🎲 랜덤 맵 선택',
        description: selectedMaps.map((map, index) => 
          `${index + 1}. ${map.emoji} **${map.name}**`
        ).join('\n'),
        footer: {
          text: `${count}개의 맵이 선택되었습니다.`
        },
        timestamp: new Date()
      };

      // 맵 이미지 추가
      if (count === 1) {
        const selectedMap = selectedMaps[0];
        embed.image = {
          url: selectedMap.splash || selectedMap.displayIcon
        };
      }

      return message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('랜덤 맵 선택 중 오류:', error);
      return message.reply('❌ 맵 선택 중 오류가 발생했습니다.');
    }
  }
};