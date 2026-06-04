import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { valorantApi } from '../utils/valorantApi.js';
import { generateValorantFocusedReview } from '../services/nvidiaNim.js';

function parseRiotId(input) {
  if (!input) return null;

  const hashIndex = input.lastIndexOf('#');
  if (hashIndex <= 0 || hashIndex >= input.length - 1) {
    return null;
  }

  const name = input.slice(0, hashIndex).trim();
  const tag = input.slice(hashIndex + 1).trim();

  if (!name || !tag) {
    return null;
  }

  return { name, tag };
}

async function resolvePlayer(message, args) {
  const input = args.join(' ').trim();
  const riotId = parseRiotId(input);

  if (riotId) {
    return riotId;
  }

  if (input) {
    throw new Error('INVALID_RIOT_ID');
  }

  const docRef = doc(db, 'valorant_accounts', message.guild.id);
  const docSnap = await getDoc(docRef);
  const userData = docSnap.exists() ? docSnap.data()[message.author.id] : null;

  if (!userData) {
    throw new Error('REGISTERED_ACCOUNT_MISSING');
  }

  return {
    name: userData.valorantName,
    tag: userData.valorantTag,
  };
}

function findPlayer(match, name, tag) {
  return match.players?.all_players?.find((player) =>
    player.name?.toLowerCase() === name.toLowerCase()
    && player.tag?.toLowerCase() === tag.toLowerCase()
  ) || null;
}

function didPlayerWin(match, player) {
  const teamKey = player.team?.toLowerCase();
  return Boolean(teamKey && match.teams?.[teamKey]?.has_won);
}

function calculatePlayerStats(match, player) {
  const rounds = match.metadata?.rounds_played || 0;
  const stats = player.stats || {};
  const totalShots = (stats.headshots || 0) + (stats.bodyshots || 0) + (stats.legshots || 0);

  return {
    kda: `${stats.kills || 0}/${stats.deaths || 0}/${stats.assists || 0}`,
    kills: stats.kills || 0,
    deaths: stats.deaths || 0,
    assists: stats.assists || 0,
    kd: stats.deaths > 0 ? Number(((stats.kills || 0) / stats.deaths).toFixed(2)) : 'Perfect',
    kdaRatio: stats.deaths > 0 ? Number((((stats.kills || 0) + (stats.assists || 0)) / stats.deaths).toFixed(2)) : 'Perfect',
    damage: player.damage_made || 0,
    score: stats.score || 0,
    adr: rounds > 0 ? Math.round((player.damage_made || 0) / rounds) : 0,
    acs: rounds > 0 ? Math.round((stats.score || 0) / rounds) : 0,
    headshotRate: totalShots > 0 ? Math.round(((stats.headshots || 0) / totalShots) * 100) : 0,
    shots: {
      head: stats.headshots || 0,
      body: stats.bodyshots || 0,
      leg: stats.legshots || 0,
    },
  };
}

function buildScoreboard(match) {
  return (match.players?.all_players || [])
    .map((player) => {
      const rounds = match.metadata?.rounds_played || 0;
      const stats = player.stats || {};

      return {
        riotId: `${player.name}#${player.tag}`,
        team: player.team || 'Unknown',
        agent: player.character || 'Unknown',
        kda: `${stats.kills || 0}/${stats.deaths || 0}/${stats.assists || 0}`,
        score: stats.score || 0,
        acs: rounds > 0 ? Math.round((stats.score || 0) / rounds) : 0,
        adr: rounds > 0 ? Math.round((player.damage_made || 0) / rounds) : 0,
      };
    })
    .sort((playerA, playerB) => playerB.score - playerA.score);
}

function buildFocusedData({ account, mmr, match, player, name, tag }) {
  const scoreboard = buildScoreboard(match);
  const playerStats = calculatePlayerStats(match, player);
  const playerRank = scoreboard.findIndex((entry) => entry.riotId.toLowerCase() === `${name}#${tag}`.toLowerCase()) + 1;
  const teamScoreboard = scoreboard.filter((entry) => entry.team.toLowerCase() === player.team?.toLowerCase());
  const teamRank = teamScoreboard.findIndex((entry) => entry.riotId.toLowerCase() === `${name}#${tag}`.toLowerCase()) + 1;
  const playerTeamKey = player.team?.toLowerCase();
  const enemyTeamKey = playerTeamKey === 'red' ? 'blue' : 'red';

  return {
    player: {
      riotId: `${name}#${tag}`,
      region: account.region?.toUpperCase() || 'UNKNOWN',
      accountLevel: account.account_level || 0,
      currentTier: mmr?.current_data?.currenttierpatched || '정보 없음',
      rr: mmr?.current_data?.ranking_in_tier ?? null,
      highestTier: mmr?.highest_rank?.patched_tier || '정보 없음',
    },
    match: {
      result: didPlayerWin(match, player) ? '승리' : '패배',
      mode: match.metadata?.mode || 'Unknown',
      map: match.metadata?.map || 'Unknown',
      agent: player.character || 'Unknown',
      team: player.team || 'Unknown',
      rounds: match.metadata?.rounds_played || 0,
      score: `${match.teams?.red?.rounds_won || 0}:${match.teams?.blue?.rounds_won || 0}`,
      teamRounds: match.teams?.[playerTeamKey]?.rounds_won || 0,
      enemyRounds: match.teams?.[enemyTeamKey]?.rounds_won || 0,
      startedAt: match.metadata?.game_start ? new Date(match.metadata.game_start * 1000).toISOString() : null,
    },
    performance: {
      ...playerStats,
      lobbyRankByScore: playerRank || null,
      teamRankByScore: teamRank || null,
      lobbySize: scoreboard.length,
    },
    topLobbyPlayers: scoreboard.slice(0, 5),
    sameTeam: teamScoreboard,
  };
}

function getErrorMessage(error) {
  switch (error.code || error.message) {
    case 'REGISTERED_ACCOUNT_MISSING':
      return '❌ 등록된 계정이 없습니다. `ㅂ발로등록 닉네임#태그` 명령어로 계정을 등록해주세요.';
    case 'INVALID_RIOT_ID':
      return '❌ 올바른 형식이 아닙니다. (예: 닉네임#태그)';
    case 'MATCH_DATA_MISSING':
      return '❌ 최근 매치 기록을 찾을 수 없습니다.';
    case 'PLAYER_NOT_IN_MATCH':
      return '❌ 최근 매치에서 플레이어 정보를 찾을 수 없습니다.';
    case 'NVIDIA_NIM_API_KEY_MISSING':
      return '❌ NVIDIA NIM API 키가 설정되지 않았습니다. `NVIDIA_NIM_API_KEY` 환경변수를 설정해주세요.';
    case 'NVIDIA_NIM_AUTH_FAILED':
      return '❌ NVIDIA NIM 인증에 실패했습니다. API 키가 올바른지 확인해주세요.';
    case 'NVIDIA_NIM_LOCAL_RATE_LIMIT':
    case 'NVIDIA_NIM_RATE_LIMITED':
      return '❌ AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    case 'NVIDIA_NIM_TIMEOUT':
      return '❌ NVIDIA NIM 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.';
    case 'NVIDIA_NIM_EMPTY_RESPONSE':
    case 'NVIDIA_NIM_REQUEST_FAILED':
      return '❌ 집중 평가를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.';
    default:
      if (error.response?.status === 404) {
        return '❌ 플레이어를 찾을 수 없습니다.';
      }
      if (error.response?.status === 429) {
        return '❌ 전적 API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      }
      return '❌ 집중 평가 중 오류가 발생했습니다.';
  }
}

function truncateDiscordText(text, maxLength) {
  const characters = Array.from(text || '');
  if (characters.length <= maxLength) {
    return text;
  }

  return `${characters.slice(0, maxLength - 3).join('').trimEnd()}...`;
}

export const focusedReviewCommand = {
  name: ['ㅂ집중평가', 'ㅂ전판평가'],
  execute: async (message, args) => {
    let loadingMsg = null;

    try {
      const { name, tag } = await resolvePlayer(message, args);
      loadingMsg = await message.reply('🧠 전판 데이터를 모아서 집중 평가를 생성중입니다...');

      const account = await valorantApi.getAccount(name, tag);
      const [mmr, matches] = await Promise.all([
        valorantApi.getMMR(account.region, account.puuid).catch(() => null),
        valorantApi.getMatches(account.region, name, tag, 1),
      ]);

      if (!Array.isArray(matches) || matches.length === 0) {
        throw new Error('MATCH_DATA_MISSING');
      }

      const match = matches[0];
      const player = findPlayer(match, name, tag);
      if (!player) {
        throw new Error('PLAYER_NOT_IN_MATCH');
      }

      const focusedData = buildFocusedData({ account, mmr, match, player, name, tag });
      const focusedReview = await generateValorantFocusedReview(focusedData);

      const embed = {
        color: focusedData.match.result === '승리' ? 0x57F287 : 0xED4245,
        title: `🧠 전판 집중 평가 - ${name}#${tag}`,
        description: truncateDiscordText(focusedReview.content, 3600),
        fields: [
          {
            name: '📌 전판 요약',
            value:
              `${focusedData.match.result} · ${focusedData.match.map} · ${focusedData.match.agent} · ${focusedData.match.score}\n` +
              `K/D/A ${focusedData.performance.kda} · ADR ${focusedData.performance.adr} · ACS ${focusedData.performance.acs} · HS ${focusedData.performance.headshotRate}%\n` +
              `스코어 기준 팀 ${focusedData.performance.teamRankByScore || '?'}위 / 전체 ${focusedData.performance.lobbyRankByScore || '?'}위`,
            inline: false,
          },
        ],
        footer: {
          text: `NVIDIA NIM: ${focusedReview.model}`,
        },
        timestamp: new Date(),
      };

      await loadingMsg.edit({
        content: null,
        embeds: [embed],
      });
    } catch (error) {
      console.error('집중 평가 명령어 오류:', error.response?.data || error.message);
      const errorMessage = getErrorMessage(error);

      if (loadingMsg) {
        return loadingMsg.edit(errorMessage);
      }

      return message.reply(errorMessage);
    }
  },
};
