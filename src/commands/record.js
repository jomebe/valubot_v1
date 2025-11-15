import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';
import path from 'path';

// 요원 정보를 가져오는 함수
const fetchAgents = async () => {
  try {
    const response = await axios.get('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    const agents = {};
    response.data.data.forEach(agent => {
      agents[agent.displayName] = agent.displayIcon;
    });
    return agents;
  } catch (error) {
    console.error('요원 정보 가져오기 실패:', error);
    return {};
  }
};

// 요원 아이콘 캐시
let agentIcons = null;

export const recordCommand = {
  name: ['ㅂ전적'],
  execute: async (message, args) => {
    try {
      // 요원 정보가 없으면 가져오기
      if (!agentIcons) {
        agentIcons = await fetchAgents();
      }

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

      const loadingMsg = await message.reply('🔍 전적 정보를 검색중입니다...');

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

      // 매치 히스토리 가져오기 (최근 5개 매치)
      const matchesResponse = await axios.get(
        `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=5`,
        {
          headers: {
            'Authorization': process.env.VALORANT_API_KEY
          }
        }
      );

      const allMatches = matchesResponse.data.data;
      
      // 경쟁전만 필터링 (Competitive 모드만)
      const matches = allMatches.filter(match => 
        match.metadata.mode === 'Competitive'
      );

      // 경쟁전이 없는 경우
      if (matches.length === 0) {
        return loadingMsg.edit({
          content: '❌ 최근 5게임 중 경쟁전 기록이 없습니다.',
          embeds: []
        });
      }

      // 매치 정보를 처리하여 통계 계산
      let totalKills = 0;
      let totalDeaths = 0;
      let totalAssists = 0;
      let totalDamage = 0;
      let totalRounds = 0;
      let winCount = 0;
      let agentPlayCount = {};

      // 각 경기의 간략한 정보를 저장할 배열
      let matchSummaries = [];

      // 플레이어 데이터 추출
      matches.forEach(match => {
        const player = match.players.all_players.find(p => 
          p.name.toLowerCase() === name.toLowerCase() && 
          p.tag.toLowerCase() === tag.toLowerCase()
        );

        if (player) {
          // KDA 합산
          totalKills += player.stats.kills || 0;
          totalDeaths += player.stats.deaths || 0;
          totalAssists += player.stats.assists || 0;
          
          // 데미지 합산
          totalDamage += player.damage_made || 0;
          
          // 라운드 수 합산
          totalRounds += match.metadata.rounds_played || 0;
          
          // 승패 계산
          const playerTeam = player.team.toLowerCase();
          const isWin = match.teams && match.teams[playerTeam] ? 
            match.teams[playerTeam].has_won : false;
          if (isWin) {
            winCount++;
          }
          
          // 요원 플레이 횟수 계산
          if (player.character) {
            agentPlayCount[player.character] = (agentPlayCount[player.character] || 0) + 1;
          }

          // 경기 요약 정보 저장
          matchSummaries.push({
            agent: player.character || '알 수 없음',
            map: match.metadata.map || '알 수 없음',
            mode: match.metadata.mode || '일반',
            score: match.teams ? 
              `${match.teams.red?.rounds_won || 0}:${match.teams.blue?.rounds_won || 0}` : 
              '정보 없음',
            kda: `${player.stats.kills || 0}/${player.stats.deaths || 0}/${player.stats.assists || 0}`,
            result: isWin ? '승리' : '패배',
            date: new Date(match.metadata.game_start * 1000)
          });
        }
      });

      // 가장 많이 플레이한 요원 찾기
      let maxPlayCount = 0;
      let mostPlayedAgentName = "알 수 없음";
      
      for (const [agent, count] of Object.entries(agentPlayCount)) {
        if (count > maxPlayCount) {
          maxPlayCount = count;
          mostPlayedAgentName = agent;
        }
      }

      // 통계 계산
      const kdRatio = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : 'Perfect';
      const kdaRatio = totalDeaths > 0 ? ((totalKills + totalAssists) / totalDeaths).toFixed(2) : 'Perfect';
      const avgDamage = totalRounds > 0 ? Math.round(totalDamage / totalRounds) : 0;
      const winRate = matches.length > 0 ? Math.round((winCount / matches.length) * 100) : 0;

      // 최근 경기 요약 문자열 생성
      let recentMatchesText = matchSummaries.map((match, idx) => {
        const formattedDate = match.date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        return `${idx+1}. [${match.result}] ${match.agent} - ${match.map} (${match.kda}) ${formattedDate}`;
      }).join('\n');

      // 응답 생성
      const embed = {
        color: 0x3498DB,
        title: `${name}#${tag}의 최근 전적`,
        thumbnail: {
          url: accountData.card.small
        },
        fields: [
          {
            name: '📊 전적 개요',
            value: `최근 ${matches.length}게임: ${winCount}승 ${matches.length - winCount}패\n승률: ${winRate}%`,
            inline: true
          },
          {
            name: '🎯 킬/데스/어시스트',
            value: `K/D/A: ${totalKills}/${totalDeaths}/${totalAssists}\nK/D: ${kdRatio}\nKDA: ${kdaRatio}`,
            inline: true
          },
          {
            name: '💥 평균 데미지',
            value: `${avgDamage}/라운드`,
            inline: true
          },
          {
            name: '🦸 선호 요원',
            value: `${mostPlayedAgentName} (${maxPlayCount}회)`,
            inline: true
          },
          {
            name: `📜 최근 ${matches.length}경기`,
            value: recentMatchesText || '최근 경기 정보 없음'
          }
        ],
        footer: {
          text: `경쟁전 ${matches.length}게임 기준 통계 • 경쟁전만`
        },
        timestamp: new Date()
      };

      // 요원 아이콘 추가
      if (agentIcons[mostPlayedAgentName]) {
        embed.author = {
          name: mostPlayedAgentName,
          icon_url: agentIcons[mostPlayedAgentName]
        };
      }

      await loadingMsg.edit({ 
        content: null, 
        embeds: [embed]
      });

    } catch (error) {
      console.error('전적 검색 중 오류:', error.response?.data || error);
      
      if (error.response?.status === 404 || error.message === 'Account not found') {
        return message.reply('❌ 플레이어를 찾을 수 없습니다.');
      } else if (error.response?.status === 429) {
        return message.reply('❌ 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
      return message.reply('❌ 전적 정보를 가져오는데 실패했습니다.');
    }
  }
}; 