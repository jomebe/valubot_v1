import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';
import { valorantApi } from '../utils/valorantApi.js';

export const profileCommand = {
  name: ['ㅂ발로', 'ㅂㅂㄹ'],
  execute: async (message, args) => {
    try {
      let name, tag;

      // 인자가 없으면 등록된 계정 검색
      if (args.length === 0) {
        const guildId = message.guild.id;
        const userId = message.author.id;
        const docRef = doc(db, 'valorant_accounts', guildId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists() || !docSnap.data()[userId]) {
          return message.reply('❌ 등록된 계정이 없습니다. `ㅂ발로등록 닉네임#태그` 명령어로 계정을 등록해주세요.');
        }

        const userData = docSnap.data()[userId];
        name = userData.valorantName;
        tag = userData.valorantTag;
      } else {
        const fullId = args[0];
        if (!fullId.includes('#')) {
          return message.reply('❌ 올바른 형식이 아닙니다. (예: 닉네임#태그)');
        }
        [name, tag] = fullId.split('#');
      }

      const loadingMsg = await message.reply('🔍 계정 정보를 검색중입니다...');

      const accountData = await valorantApi.getAccount(name, tag);
      const mmrData = await valorantApi.getMMR(accountData.region, accountData.puuid);
      const matches = await valorantApi.getMatches(accountData.region, name, tag, 5);

      const embed = {
        color: 0xFF4654,
        title: `${name}#${tag}님의 프로필`,
        thumbnail: {
          url: accountData.card.small
        },
        fields: [
          {
            name: '🎮 계정 정보',
            value: 
              `레벨: ${accountData.account_level}\n` +
              `지역: ${accountData.region.toUpperCase()}\n` +
              `최근 접속: ${new Date(accountData.last_update).toLocaleDateString('ko-KR')}`,
            inline: true
          },
          {
            name: '🏆 현재 티어',
            value: 
              `${mmrData.current_data.currenttierpatched}\n` +
              `${mmrData.current_data.ranking_in_tier} RR\n` +
              `최고 티어: ${mmrData.highest_rank.patched_tier}`,
            inline: true
          }
        ],
        timestamp: new Date()
      };

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('프로필 검색 중 오류:', error);
      return message.reply('❌ 계정 정보를 가져오는데 실패했습니다.');
    }
  }
}; 