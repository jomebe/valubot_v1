import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import axios from 'axios';
import path from 'path';

const getMapImage = (mapName) => {
  try {
    return path.join('src', 'images', `${mapName}.jpg`);
  } catch (error) {
    console.error('맵 이미지 경로 오류:', error);
    return path.join('src', 'images', 'default.jpg');
  }
};

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

export const matchCommand = {
  name: ['ㅂ매치', 'ㅂㅁㅊ'],
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

      const loadingMsg = await message.reply('🔍 최근 매치를 검색중입니다...');

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

      // 매치 히스토리 가져오기
      const matchesResponse = await axios.get(
        `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=1`,
        {
          headers: {
            'Authorization': process.env.VALORANT_API_KEY
          }
        }
      );

      const match = matchesResponse.data.data[0];
      const player = match.players.all_players.find(p => 
        p.name.toLowerCase() === name.toLowerCase() && 
        p.tag.toLowerCase() === tag.toLowerCase()
      );

      if (!player) {
        throw new Error('Player not found in match');
      }

      const playerTeam = player.team.toLowerCase();
      const teamWon = match.teams[playerTeam].has_won;
      const gameMode = match.metadata.mode;
      const mapName = match.metadata.map;
      const score = `${match.teams.red.rounds_won} : ${match.teams.blue.rounds_won}`;

      // 데미지 계산
      const totalDamage = player.damage_made || 0;
      const roundsPlayed = match.metadata.rounds_played || 1;
      const avgDamage = Math.round(totalDamage / roundsPlayed);

      const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
      const kdaRatio = player.stats.deaths > 0 ? 
        ((player.stats.kills + player.stats.assists) / player.stats.deaths).toFixed(2) : 
        'Perfect';

      // 정확도 계산 (헤드샷, 바디샷, 레그샷 비율)
      const totalShots = player.stats.headshots + player.stats.bodyshots + player.stats.legshots;
      const headshotPercent = totalShots > 0 ? Math.round((player.stats.headshots / totalShots) * 100) : 0;
      const bodyshotPercent = totalShots > 0 ? Math.round((player.stats.bodyshots / totalShots) * 100) : 0;
      const legshotPercent = totalShots > 0 ? Math.round((player.stats.legshots / totalShots) * 100) : 0;

      const embed = {
        color: teamWon ? 0x57F287 : 0xED4245,
        title: `${teamWon ? '🎉 승리' : '😢 패배'} - ${mapName}`,
        thumbnail: {
          url: `attachment://${mapName}.jpg`
        },
        fields: [
          {
            name: '🎮 게임 정보',
            value: `모드: ${gameMode}\n스코어: ${score}`,
            inline: true
          },
          {
            name: '📊 개인 성적',
            value: `K/D/A: ${kda}\nKDA: ${kdaRatio}\n평균 데미지: ${avgDamage}`,
            inline: true
          },
          {
            name: '🎯 정확도',
            value: `헤드샷: ${headshotPercent}%\n바디샷: ${bodyshotPercent}%\n레그샷: ${legshotPercent}%`,
            inline: true
          }
        ],
        timestamp: new Date(match.metadata.game_start * 1000)
      };

      // 요원 정보 추가
      if (player.character) {
        embed.author = {
          name: player.character,
          icon_url: agentIcons[player.character] || 'https://i.imgur.com/G53MXS3.png'
        };
      }

      // 이미지 파일 첨부
      const mapImagePath = getMapImage(mapName);
      await loadingMsg.edit({ 
        content: null, 
        embeds: [embed],
        files: [{
          attachment: mapImagePath,
          name: `${mapName}.jpg`
        }]
      });

    } catch (error) {
      console.error('매치 검색 중 오류:', error.response?.data || error);
      
      if (error.response?.status === 404 || error.message === 'Account not found') {
        return message.reply('❌ 플레이어를 찾을 수 없습니다.');
      } else if (error.response?.status === 429) {
        return message.reply('❌ 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
      return message.reply('❌ 매치 정보를 가져오는데 실패했습니다.');
    }
  }
}; 