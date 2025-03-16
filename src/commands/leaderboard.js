import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';
import { valorantApi } from '../utils/valorantApi.js';

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

// 티어 숫자 매핑
const tierNumberOrder = {
  '1': 1,
  '2': 2,
  '3': 3
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
          const mmrData = await valorantApi.getMMR(userData.region, userData.puuid);
          
          // API에서 티어 정보 추출
          const currentTierPatched = mmrData.current_data.currenttierpatched || 'Unranked';
          let currentTier = 'Unranked';
          let currentNumber = '';
          
          // 티어와 숫자 분리 (예: "Diamond 2" -> tier="Diamond", number="2")
          const tierParts = currentTierPatched.split(' ');
          if (tierParts.length > 0) {
            currentTier = tierParts[0];
            currentNumber = tierParts.length > 1 ? tierParts[1] : '';
          }
          
          players.push({
            discordId: userId,
            name: userData.valorantName,
            tag: userData.valorantTag,
            tier: currentTier,
            tierNumber: currentNumber,
            rr: mmrData.current_data.ranking_in_tier || 0,
            peakTier: mmrData.highest_rank?.patched_tier || 'Unranked',
            fullTier: currentTierPatched
          });
        } catch (error) {
          console.error(`${userData.valorantName}#${userData.valorantTag} 정보 조회 실패:`, error);
        }
      }

      // 티어 순으로 정렬 (수정된 정렬 로직)
      players.sort((a, b) => {
        // 티어 순서 비교
        const aTierValue = tierOrder[a.tier] || 0;
        const bTierValue = tierOrder[b.tier] || 0;
        
        if (aTierValue !== bTierValue) {
          return bTierValue - aTierValue; // 높은 티어가 먼저
        }
        
        // 같은 티어면 티어 숫자 비교 (Diamond 3 > Diamond 2 > Diamond 1)
        const aTierNumber = parseInt(a.tierNumber) || 0;
        const bTierNumber = parseInt(b.tierNumber) || 0;
        
        if (aTierNumber !== bTierNumber) {
          return bTierNumber - aTierNumber; // 높은 숫자가 먼저
        }
        
        // 티어 숫자까지 같으면 RR 비교
        return b.rr - a.rr; // 높은 RR이 먼저
      });

      if (players.length === 0) {
        return loadingMsg.edit('❌ 티어 정보를 가져올 수 있는 계정이 없습니다.');
      }

      const embed = {
        color: 0xFF4654,
        title: '🏆 발로란트 티어 리더보드',
        description: players.map((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} <@${player.discordId}> - ${player.fullTier} (${player.rr}RR)\n┗ 최고 티어: ${player.peakTier}`;
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