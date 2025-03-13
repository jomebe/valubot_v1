import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';

const getRankIcon = (tier) => {
  const rankIcons = {
    'Iron': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/3/largeicon.png',
    'Bronze': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/6/largeicon.png',
    'Silver': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/9/largeicon.png',
    'Gold': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/12/largeicon.png',
    'Platinum': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/15/largeicon.png',
    'Diamond': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/18/largeicon.png',
    'Ascendant': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/21/largeicon.png',
    'Immortal': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/24/largeicon.png',
    'Radiant': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/25/largeicon.png'
  };
  return rankIcons[tier] || 'https://i.imgur.com/G53MXS3.png';
};

export const tierCommand = {
  name: ['ㅂ티어', 'ㅂ랭크'],
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
        // 인자가 있으면 해당 계정 검색
        const fullId = args[0];
        if (!fullId.includes('#')) {
          return message.reply('❌ 올바른 형식이 아닙니다. (예: 닉네임#태그)');
        }
        [name, tag] = fullId.split('#');
      }

      const loadingMsg = await message.reply('🔍 티어 정보를 검색중입니다...');

      // 계정 정보 가져오기
      const accountResponse = await axios.get(
        `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        {
          headers: {
            'Authorization': process.env.VALORANT_API_KEY
          }
        }
      );

      if (accountResponse.data.status !== 200) {
        throw new Error('Account not found');
      }

      const accountData = accountResponse.data.data;
      const region = accountData.region.toLowerCase();

      // MMR 정보 가져오기
      const mmrResponse = await axios.get(
        `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        {
          headers: {
            'Authorization': process.env.VALORANT_API_KEY
          }
        }
      );

      const mmrData = mmrResponse.data.data;
      const currentTier = mmrData.current_data.currenttierpatched;
      const rankOnly = currentTier.split(' ')[0];
      const rankNumber = currentTier.split(' ')[1] || '';
      const rankProgress = mmrData.current_data.ranking_in_tier;
      const elo = mmrData.current_data.elo;

      const embed = {
        color: 0xFF4654,
        title: `${name}#${tag}님의 티어 정보`,
        thumbnail: {
          url: getRankIcon(rankOnly)
        },
        fields: [
          {
            name: '🏆 현재 티어',
            value: currentTier,
            inline: true
          },
          {
            name: '📊 티어 진행도',
            value: `${rankProgress}/100 RR`,
            inline: true
          },
          {
            name: '📈 ELO',
            value: elo.toString(),
            inline: true
          }
        ],
        footer: {
          text: `지역: ${region.toUpperCase()}`
        },
        timestamp: new Date()
      };

      // MMR 변화가 있으면 표시
      if (mmrData.current_data.mmr_change_to_last_game) {
        const mmrChange = mmrData.current_data.mmr_change_to_last_game;
        const changeSymbol = mmrChange > 0 ? '↑' : '↓';
        embed.fields.push({
          name: '📈 최근 MMR 변화',
          value: `${Math.abs(mmrChange)} ${changeSymbol}`,
          inline: true
        });
      }

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('티어 검색 중 오류:', error.response?.data || error);
      
      if (error.response?.status === 404 || error.message === 'Account not found') {
        return message.reply('❌ 플레이어를 찾을 수 없습니다.');
      } else if (error.response?.status === 429) {
        return message.reply('❌ 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
      return message.reply('❌ 티어 정보를 가져오는데 실패했습니다.');
    }
  }
}; 