import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';

export const statsCommand = {
  name: ['ㅂ통계', 'ㅂㅌㄱ'],
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

      const loadingMsg = await message.reply('🔍 통계를 검색중입니다...');

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

      // 매치 히스토리 가져오기 (최근 10게임)
      const matchesResponse = await axios.get(
        `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?filter=competitive`,
        {
          headers: {
            'Authorization': process.env.VALORANT_API_KEY
          }
        }
      );

      const matches = matchesResponse.data.data;
      
      // 통계 계산
      let totalKills = 0;
      let totalDeaths = 0;
      let totalAssists = 0;
      let totalDamage = 0;
      let totalHeadshots = 0;
      let totalBodyshots = 0;
      let totalLegshots = 0;
      let wins = 0;
      let totalRounds = 0;

      matches.forEach(match => {
        const player = match.players.all_players.find(p => 
          p.name.toLowerCase() === name.toLowerCase() && 
          p.tag.toLowerCase() === tag.toLowerCase()
        );

        if (player) {
          totalKills += player.stats.kills;
          totalDeaths += player.stats.deaths;
          totalAssists += player.stats.assists;
          totalDamage += player.damage_made;
          totalHeadshots += player.stats.headshots;
          totalBodyshots += player.stats.bodyshots;
          totalLegshots += player.stats.legshots;
          
          if (player.team === match.teams.red.has_won ? 'Red' : 'Blue') {
            wins++;
          }
          
          totalRounds += match.metadata.rounds_played;
        }
      });

      // 평균 계산
      const avgKDA = ((totalKills + totalAssists) / totalDeaths).toFixed(2);
      const avgDamage = Math.round(totalDamage / matches.length);
      const winRate = ((wins / matches.length) * 100).toFixed(1);
      const avgCombatScore = Math.round(totalDamage / totalRounds);
      
      // 정확도 계산
      const totalShots = totalHeadshots + totalBodyshots + totalLegshots;
      const headshotPercentage = ((totalHeadshots / totalShots) * 100).toFixed(1);
      const bodyshotPercentage = ((totalBodyshots / totalShots) * 100).toFixed(1);
      const legshotPercentage = ((totalLegshots / totalShots) * 100).toFixed(1);

      const embed = {
        color: 0xFF4654,
        title: `📊 ${name}#${tag}님의 최근 ${matches.length}게임 통계`,
        fields: [
          {
            name: '🎯 평균 성적',
            value: 
              `K/D/A: ${totalKills}/${totalDeaths}/${totalAssists}\n` +
              `KDA: ${avgKDA}\n` +
              `평균 데미지: ${avgDamage}`,
            inline: true
          },
          {
            name: '💯 정확도',
            value: 
              `헤드샷: ${headshotPercentage}%\n` +
              `바디샷: ${bodyshotPercentage}%\n` +
              `레그샷: ${legshotPercentage}%`,
            inline: true
          },
          {
            name: '📈 전적',
            value: 
              `승률: ${winRate}%\n` +
              `${wins}승 ${matches.length - wins}패\n` +
              `평균 전투 점수: ${avgCombatScore}`,
            inline: true
          }
        ],
        timestamp: new Date()
      };

      await loadingMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('통계 검색 중 오류:', error.response?.data || error);
      
      if (error.response?.status === 404 || error.message === 'Account not found') {
        return message.reply('❌ 플레이어를 찾을 수 없습니다.');
      } else if (error.response?.status === 429) {
        return message.reply('❌ 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
      return message.reply('❌ 통계 정보를 가져오는데 실패했습니다.');
    }
  }
}; 