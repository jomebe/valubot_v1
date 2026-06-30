import { db } from '../config/firebase.js';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import axios from 'axios';

export const registerCommand = {
  name: 'ㅂ발로등록',
  execute: async (message, args) => {
    try {
      // 관리자 권한 확인
      const isAdmin = message.member.permissions.has('Administrator');
      
      let discordUser = message.author;
      let valorantId;

      // 인자 처리
      if (args.length < 1) {
        return message.reply('사용법:\n일반 사용자: ㅂ발로등록 닉네임#태그\n관리자: ㅂ발로등록 디스코드닉네임 발로란트닉네임#태그');
      }

      if (isAdmin && args.length >= 2) {
        // 관리자가 다른 사용자 계정 등록 (첫 인자는 대상 사용자)
        const mentionedUser = message.mentions.users.first() ||
                            message.guild.members.cache.find(m =>
                              m.user.tag.toLowerCase() === args[0].toLowerCase() ||
                              m.displayName.toLowerCase() === args[0].toLowerCase() ||
                              m.user.username.toLowerCase() === args[0].toLowerCase()
                            )?.user;

        if (mentionedUser) {
          discordUser = mentionedUser;
          valorantId = args.slice(1).join(' ');
        } else {
          // 관리자가 자기 계정을 등록하는 경우도 공백 닉네임 지원
          valorantId = args.join(' ');
        }
      } else {
        // 일반적인 자기 계정 등록 (공백 닉네임 지원)
        valorantId = args.join(' ');
      }

      valorantId = valorantId.trim();

      if (!valorantId.includes('#')) {
        return message.reply('❌ 올바른 형식이 아닙니다. (예: 닉네임#태그)');
      }

      const [name, tag] = valorantId.split('#');

      // 이미 등록된 계정이 있는지 확인
      const guildId = message.guild.id;
      const userId = discordUser.id;
      const docRef = doc(db, 'valorant_accounts', guildId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists() && docSnap.data()[userId]) {
        return message.reply(`❌ ${discordUser.tag}님은 이미 발로란트 계정이 등록되어 있습니다.`);
      }

      const loadingMsg = await message.reply('🔍 계정을 확인중입니다...');
      
      // 계정 정보 가져오기 (Henrik API 시도 및 라이엇 공식 API 폴백)
      let accountData = null;
      let region = null;
      let currentTier = 'Unranked';

      try {
        const accountResponse = await axios.get(
          `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
          {
            headers: {
              'Authorization': process.env.VALORANT_API_KEY
            }
          }
        );

        if (accountResponse.data.status === 200 && accountResponse.data.data) {
          accountData = accountResponse.data.data;
          region = accountData.region.toLowerCase();
        } else {
          throw new Error('Account not found on Henrik API');
        }
      } catch (henrikError) {
        console.warn('Henrik API 조회 실패, 라이엇 공식 API 폴백 시도:', henrikError.message);
        
        if (process.env.RIOT_API_KEY) {
          const routings = ['asia', 'americas', 'europe'];
          let foundPuuid = null;
          let foundRegion = null;
          
          for (const routing of routings) {
            try {
              const riotAccountResponse = await axios.get(
                `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
                {
                  headers: {
                    'X-Riot-Token': process.env.RIOT_API_KEY
                  }
                }
              );
              if (riotAccountResponse.data && riotAccountResponse.data.puuid) {
                foundPuuid = riotAccountResponse.data.puuid;
                
                const shardResponse = await axios.get(
                  `https://${routing}.api.riotgames.com/riot/account/v1/active-shards/by-game/val/by-puuid/${foundPuuid}`,
                  {
                    headers: {
                      'X-Riot-Token': process.env.RIOT_API_KEY
                    }
                  }
                );
                foundRegion = shardResponse.data.activeShard.toLowerCase();
                break;
              }
            } catch (e) {
              console.log(`Riot API routing ${routing} failed:`, e.response?.status || e.message);
            }
          }
          
          if (foundPuuid && foundRegion) {
            accountData = {
              puuid: foundPuuid,
              region: foundRegion,
              account_level: 0,
              card: { id: '' }
            };
            region = foundRegion;
          } else {
            throw henrikError;
          }
        } else {
          throw henrikError;
        }
      }

      // MMR 정보 가져오기 (실패 시 Unranked 기본값 설정 및 진행)
      try {
        const mmrResponse = await axios.get(
          `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
          {
            headers: {
              'Authorization': process.env.VALORANT_API_KEY
            }
          }
        );
        if (mmrResponse.data?.data?.current_data?.currenttierpatched) {
          currentTier = mmrResponse.data.data.current_data.currenttierpatched.split(' ')[0];
        }
      } catch (mmrError) {
        console.warn('MMR 정보 가져오기 실패 (Unranked 기본값 사용):', mmrError.message);
      }

      // 현재 서버의 계정 데이터 가져오기
      let guildData = {};
      if (docSnap.exists()) {
        guildData = docSnap.data();
      }

      // 계정 정보 저장
      guildData[userId] = {
        discordTag: discordUser.tag,
        valorantName: name,
        valorantTag: tag,
        region: region,
        puuid: accountData.puuid,
        currentTier: currentTier,
        accountLevel: accountData.account_level,
        cardId: accountData.card?.id,
        updatedAt: new Date().toISOString()
      };

      // Firebase에 저장
      await setDoc(docRef, guildData);

      const embed = {
        color: 0xFF4654,
        title: `✅ 발로란트 계정 등록 완료`,
        thumbnail: {
          url: accountData.card?.small || 'https://i.imgur.com/G53MXS3.png'
        },
        description: `${discordUser}님의 발로란트 계정이 등록되었습니다.`,
        fields: [
          {
            name: '디스코드 계정',
            value: discordUser.tag,
            inline: true
          },
          {
            name: '발로란트 계정',
            value: `${name}#${tag}`,
            inline: true
          },
          {
            name: '🎮 계정 정보',
            value: `레벨: ${accountData.account_level}\n지역: ${region.toUpperCase()}\n티어: ${currentTier}`,
            inline: true
          }
        ],
        footer: {
          text: '이제 ㅂ발로 명령어만 입력해도 자동으로 이 계정이 검색됩니다.'
        },
        timestamp: new Date()
      };

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('Valorant API 오류:', error.response?.data || error);
      
      const apiErrors = error.response?.data?.errors;
      const hasCode24 = apiErrors && apiErrors.some(e => e.code === 24);
      
      if (hasCode24) {
        return message.reply('❌ 플레이어는 존재하나, 최근 게임 기록이 없어 정보를 가져올 수 없습니다. 게임(데스매치 등 아무 모드나)을 최소 1판 플레이한 후 다시 등록해주세요.');
      }
      
      if (error.response?.status === 404 || error.message === 'Account not found') {
        return message.reply('❌ 플레이어를 찾을 수 없습니다. 닉네임과 태그를 확인해주세요.');
      } else if (error.response?.status === 429) {
        return message.reply('❌ 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else if (error.response?.status === 401) {
        return message.reply('❌ API 인증에 실패했습니다. 관리자에게 문의해주세요.');
      }
      return message.reply('❌ 계정 정보를 가져오는데 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }
}; 