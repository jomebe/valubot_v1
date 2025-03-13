import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';

const tierOrder = {
  'Unranked': 0,
  'Iron': 1,
  'Bronze': 2,
  'Silver': 3,
  'Gold': 4,
  'Platinum': 5,
  'Diamond': 6,
  'Ascendant': 7,
  'Immortal': 8,
  'Radiant': 9
};

export const leaderboardCommand = {
  name: ['ㅂ리더보드', 'ㅂㄹㄷㅂㄷ'],
  execute: async (message, args) => {
    try {
      const loadingMsg = await message.reply('🏆 리더보드를 생성중입니다...');
      const guildId = message.guild.id;

      // 서버의 발로란트 계정 데이터 가져오기
      const docRef = doc(db, 'valorant_accounts', guildId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists() || Object.keys(docSnap.data()).length === 0) {
        return loadingMsg.edit('❌ 이 서버에 등록된 발로란트 계정이 없습니다.');
      }

      const accounts = docSnap.data();
      const players = [];

      // 각 계정의 티어 정보 가져오기
      for (const [userId, userData] of Object.entries(accounts)) {
        try {
          const response = await axios.get(
            `https://api.henrikdev.xyz/valorant/v2/mmr/${userData.region}/${encodeURIComponent(userData.valorantName)}/${encodeURIComponent(userData.valorantTag)}`,
            {
              headers: {
                'Authorization': process.env.VALORANT_API_KEY
              }
            }
          );

          if (response.data.status === 200) {
            const mmrData = response.data.data;
            const currentTier = mmrData.current_data.currenttierpatched.split(' ')[0];
            const currentNumber = mmrData.current_data.currenttierpatched.split(' ')[1] || '';
            
            players.push({
              discordId: userId,
              name: userData.valorantName,
              tag: userData.valorantTag,
              tier: currentTier,
              tierNumber: currentNumber,
              rr: mmrData.current_data.ranking_in_tier,
              peakTier: mmrData.highest_rank.patched_tier
            });
          }
        } catch (error) {
          console.error(`${userData.valorantName}#${userData.valorantTag} 정보 조회 실패:`, error);
        }
      }

      // 티어 순으로 정렬
      players.sort((a, b) => {
        if (tierOrder[a.tier] === tierOrder[b.tier]) {
          if (a.tierNumber === b.tierNumber) {
            return b.rr - a.rr;
          }
          return parseInt(b.tierNumber || '0') - parseInt(a.tierNumber || '0');
        }
        return tierOrder[b.tier] - tierOrder[a.tier];
      });

      if (players.length === 0) {
        return loadingMsg.edit('❌ 티어 정보를 가져올 수 있는 계정이 없습니다.');
      }

      const embed = {
        color: 0xFF4654,
        title: '🏆 발로란트 티어 리더보드',
        description: players.map((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const tierDisplay = player.tierNumber ? 
            `${player.tier} ${player.tierNumber}` : 
            player.tier;
          return `${medal} <@${player.discordId}> - ${tierDisplay} (${player.rr}RR)\n┗ 최고 티어: ${player.peakTier}`;
        }).join('\n\n'),
        footer: {
          text: `${message.guild.name} 서버의 리더보드 | 총 ${players.length}명`
        },
        timestamp: new Date()
      };

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('리더보드 생성 중 오류:', error);
      return message.reply('❌ 리더보드 생성 중 오류가 발생했습니다.');
    }
  }
}; 