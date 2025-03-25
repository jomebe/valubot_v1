import axios from 'axios';
import { EmbedBuilder } from 'discord.js';

// 발로란트 API 엔드포인트
const VALORANT_WEAPONS_API = 'https://valorant-api.com/v1/weapons';

// 스킨 가격 정보 (등급별 일반적인 가격)
const skinPrices = {
  'Deluxe': '1275 VP',
  'Premium': '1775 VP',
  'Exclusive': '2175 VP',
  'Ultra': '2475 VP',
  'Select': '875 VP'
};

export const randomSkinCommand = {
  name: 'ㅂ랜덤스킨',
  aliases: ['ㅂㄹㄷㅅㅋ', 'ㅂ스킨'],
  description: '발로란트의 모든 스킨 중에서 랜덤으로 하나를 선택합니다.',
  async execute(message, args) {
    try {
      // 로딩 메시지 전송
      const loadingMsg = await message.reply('🔍 랜덤 스킨을 찾는 중입니다...');
      
      // 도움말 표시
      if (args.length > 0 && ['도움말', '도움', 'help', '?'].includes(args[0].toLowerCase())) {
        const helpEmbed = new EmbedBuilder()
          .setColor(0xFF4654)
          .setTitle('🎮 랜덤 스킨 명령어 도움말')
          .setDescription('발로란트의 모든 스킨 중에서 랜덤으로 하나를 선택합니다.')
          .addFields(
            { name: '기본 사용법', value: '`ㅂ랜덤스킨` - 모든 무기 중에서 랜덤 스킨 선택' },
            { name: '무기별 필터링', value: '`ㅂ랜덤스킨 밴달` - 밴달 무기의 스킨만 랜덤으로 선택' },
            { name: '카테고리별 필터링', value: '`ㅂ랜덤스킨 라이플` - 라이플 종류의 무기 스킨만 랜덤으로 선택' },
            { name: '사용 가능한 무기 종류', value: '밴달, 팬텀, 오퍼, 셰리프, 고스트, 클래식, 불독, 가디언, 마샬, 저지, 버키, 스펙터, 스팅어, 프렌지, 아레스, 오딘, 쇼티, 나이프' },
            { name: '사용 가능한 카테고리', value: '라이플, 권총, 저격총, 샷건, 기관단총, 기관총' }
          )
          .setFooter({ text: '단축 명령어: ㅂㄹㄷㅅㅋ, ㅂ스킨' });
        
        return message.reply({ embeds: [helpEmbed] });
      }
      
      // 무기 종류 필터링 (선택 사항)
      let weaponType = null;
      if (args.length > 0) {
        const weaponArg = args[0].toLowerCase();
        // 밴달 (Vandal)
        if (['밴달', 'vandal', '반달', '벤달'].includes(weaponArg)) {
          weaponType = 'Vandal';
        } 
        // 팬텀 (Phantom)
        else if (['팬텀', 'phantom', '팬톰'].includes(weaponArg)) {
          weaponType = 'Phantom';
        } 
        // 아웃로 (Outlaw)
        else if (['아웃로', 'outlaw', '아웃로우'].includes(weaponArg)) {
          weaponType = 'Outlaw';
        }
        // 나머지 무기들...
        else if (['오퍼', 'operator', '오페', '오퍼레이터'].includes(weaponArg)) {
          weaponType = 'Operator';
        } else if (['셰리프', 'sheriff'].includes(weaponArg)) {
          weaponType = 'Sheriff';
        } else if (['스펙터', 'spectre'].includes(weaponArg)) {
          weaponType = 'Spectre';
        } else if (['가디언', 'guardian'].includes(weaponArg)) {
          weaponType = 'Guardian';
        } else if (['마샬', 'marshal'].includes(weaponArg)) {
          weaponType = 'Marshal';
        } else if (['고스트', 'ghost'].includes(weaponArg)) {
          weaponType = 'Ghost';
        } else if (['클래식', 'classic'].includes(weaponArg)) {
          weaponType = 'Classic';
        } else if (['불독', 'bulldog'].includes(weaponArg)) {
          weaponType = 'Bulldog';
        } else if (['저지', 'judge'].includes(weaponArg)) {
          weaponType = 'Judge';
        } else if (['버키', 'bucky'].includes(weaponArg)) {
          weaponType = 'Bucky';
        } else if (['프렌지', 'frenzy'].includes(weaponArg)) {
          weaponType = 'Frenzy';
        } else if (['아레스', 'ares'].includes(weaponArg)) {
          weaponType = 'Ares';
        } else if (['오딘', 'odin'].includes(weaponArg)) {
          weaponType = 'Odin';
        } else if (['쇼티', 'shorty'].includes(weaponArg)) {
          weaponType = 'Shorty';
        } else if (['스팅어', 'stinger'].includes(weaponArg)) {
          weaponType = 'Stinger';
        } else if (['나이프', 'knife', '칼'].includes(weaponArg)) {
          weaponType = 'Melee';
        }
      }
      
      // 발로란트 API에서 무기 정보 가져오기
      const response = await axios.get(VALORANT_WEAPONS_API);
      
      if (!response.data || !response.data.data || response.data.data.length === 0) {
        return loadingMsg.edit('❌ 무기 정보를 가져오는데 실패했습니다. 나중에 다시 시도해주세요.');
      }
      
      // 디버깅: 사용 가능한 모든 무기 이름 확인
      console.log('사용 가능한 무기 목록:', response.data.data.map(weapon => weapon.displayName));
      
      // 아웃로 무기 확인
      const outlawWeapon = response.data.data.find(weapon => 
        weapon.displayName.includes('Outlaw') || 
        weapon.displayName.toLowerCase().includes('outlaw')
      );
      
      if (outlawWeapon) {
        console.log('아웃로 무기 찾음:', outlawWeapon.displayName);
      } else {
        console.log('아웃로 무기를 찾을 수 없습니다.');
      }
      
      // 무기 데이터 필터링
      let weapons = response.data.data;
      
      if (args.length > 0) {
        const weaponArg = args[0].toLowerCase();
        
        if (weaponType) {
          // 특정 무기 타입만 필터링
          weapons = weapons.filter(weapon => 
            weapon.displayName.includes(weaponType) || 
            (weaponType === 'Melee' && weapon.category.includes('Melee'))
          );
          
          if (weapons.length === 0) {
            return loadingMsg.edit(`❌ '${weaponType}' 무기를 찾을 수 없습니다. 다른 무기 이름을 입력해주세요.`);
          }
        }
        
        // 무기 카테고리 필터링
        else if (['라이플', 'rifle', '소총'].includes(weaponArg)) {
          weapons = weapons.filter(weapon => 
            weapon.category.includes('Rifle') || 
            ['Vandal', 'Phantom', 'Bulldog', 'Guardian'].includes(weapon.displayName)
          );
        } else if (['권총', 'pistol', '핸드건'].includes(weaponArg)) {
          weapons = weapons.filter(weapon => 
            weapon.category.includes('Pistol') || 
            ['Classic', 'Shorty', 'Frenzy', 'Ghost', 'Sheriff'].includes(weapon.displayName)
          );
        }
      }
      
      // 랜덤 무기 선택
      const randomWeapon = weapons[Math.floor(Math.random() * weapons.length)];
      
      // 기본 스킨 제외한 스킨 목록 가져오기
      const skins = randomWeapon.skins.filter(skin => 
        !skin.displayName.includes('Standard') && 
        !skin.displayName.includes('기본') &&
        skin.displayIcon
      );
      
      if (skins.length === 0) {
        return loadingMsg.edit(`❌ '${randomWeapon.displayName}'의 스킨을 찾을 수 없습니다. 다른 무기를 선택해주세요.`);
      }
      
      // 랜덤 스킨 선택
      const randomSkin = skins[Math.floor(Math.random() * skins.length)];
      
      // 스킨 정보 임베드 생성
      const embed = new EmbedBuilder()
        .setColor(0xFF4654)
        .setTitle(`🎮 랜덤 스킨: ${randomSkin.displayName}`)
        .setDescription(`무기: ${randomWeapon.displayName}`)
        .setTimestamp();
      
      // 스킨 이미지 추가
      if (randomSkin.displayIcon) {
        embed.setImage(randomSkin.displayIcon);
      } else if (randomSkin.chromas && randomSkin.chromas.length > 0 && randomSkin.chromas[0].fullRender) {
        embed.setImage(randomSkin.chromas[0].fullRender);
      }
      
      // 스킨 등급 정보 추가
      if (randomSkin.contentTierUuid) {
        try {
          const tierResponse = await axios.get(`https://valorant-api.com/v1/contenttiers/${randomSkin.contentTierUuid}`);
          if (tierResponse.data && tierResponse.data.data) {
            const tierData = tierResponse.data.data;
            
            // 등급 정보 (인라인)
            embed.addFields({ 
              name: '등급', 
              value: tierData.devName || '알 수 없음',
              inline: true 
            });
            
            // 가격 정보 (인라인)
            if (tierData && tierData.devName && skinPrices[tierData.devName]) {
              embed.addFields({ 
                name: '가격', 
                value: skinPrices[tierData.devName] || '가격 정보 없음',
                inline: true
              });
            }
            
            // 색상 설정 - 안전하게 처리
            try {
              if (tierData.highlightColor) {
                const colorHex = tierData.highlightColor.replace('#', '');
                const colorInt = parseInt(colorHex, 16);
                
                // 유효한 색상 범위인지 확인 (0 - 16777215)
                if (colorInt >= 0 && colorInt <= 0xFFFFFF) {
                  embed.setColor(colorInt);
                } else {
                  // 기본 발로란트 색상 사용
                  embed.setColor(0xFF4654);
                }
              } else {
                // 기본 발로란트 색상 사용
                embed.setColor(0xFF4654);
              }
            } catch (colorError) {
              console.error('색상 설정 오류:', colorError);
              // 기본 발로란트 색상 사용
              embed.setColor(0xFF4654);
            }
          }
        } catch (tierError) {
          console.error('스킨 등급 정보 가져오기 실패:', tierError);
        }
      }
      
      // 스킨 테마 정보 추가
      if (randomSkin.themeUuid) {
        try {
          const themeResponse = await axios.get(`https://valorant-api.com/v1/themes/${randomSkin.themeUuid}`);
          if (themeResponse.data && themeResponse.data.data && themeResponse.data.data.displayName) {
            embed.addFields({ 
              name: '테마', 
              value: themeResponse.data.data.displayName,
              inline: true
            });
          }
        } catch (themeError) {
          console.error('스킨 테마 정보 가져오기 실패:', themeError);
        }
      }
      
      // 빈 필드 추가 (줄바꿈 효과)
      embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
      
      // 레벨과 크로마 정보도 인라인으로 표시
      if (randomSkin.levels && randomSkin.levels.length > 1) {
        embed.addFields({ 
          name: '레벨', 
          value: `${randomSkin.levels.length}단계 업그레이드`,
          inline: true
        });
      }
      
      if (randomSkin.chromas && randomSkin.chromas.length > 1) {
        embed.addFields({ 
          name: '크로마', 
          value: `${randomSkin.chromas.length}개 색상 변형`,
          inline: true
        });
      }
      
      // 임베드 전송
      await loadingMsg.edit({ content: null, embeds: [embed] });
      
    } catch (error) {
      console.error('랜덤 스킨 명령어 처리 중 오류:', error);
      
      // 오류 유형에 따른 메시지
      if (error.response) {
        if (error.response.status === 404) {
          return loadingMsg.edit('❌ 발로란트 API에서 정보를 찾을 수 없습니다.');
        } else if (error.response.status === 429) {
          return loadingMsg.edit('❌ 너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.');
        } else {
          return loadingMsg.edit(`❌ API 오류 (${error.response.status}): 나중에 다시 시도해주세요.`);
        }
      }
      
      return loadingMsg.edit('❌ 랜덤 스킨을 가져오는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
  }
}; 