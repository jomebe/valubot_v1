import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { valorantApi } from '../utils/valorantApi.js';
import { generateValorantAiReview } from '../services/nvidiaNim.js';

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

  const guildId = message.guild.id;
  const userId = message.author.id;
  const docRef = doc(db, 'valorant_accounts', guildId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists() || !docSnap.data()[userId]) {
    throw new Error('REGISTERED_ACCOUNT_MISSING');
  }

  const userData = docSnap.data()[userId];
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

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topCounts(counts, limit = 3) {
  return Object.entries(counts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function buildAnalysisData({ account, mmr, matches, name, tag }) {
  const playerMatches = matches
    .map((match) => ({
      match,
      player: findPlayer(match, name, tag),
    }))
    .filter(({ player }) => player);

  const competitiveMatches = playerMatches.filter(({ match }) => match.metadata?.mode === 'Competitive');
  const selectedMatches = competitiveMatches.length >= 3 ? competitiveMatches : playerMatches;

  if (selectedMatches.length === 0) {
    throw new Error('MATCH_DATA_MISSING');
  }

  const totals = selectedMatches.reduce((sum, { match, player }) => {
    const stats = player.stats || {};
    const rounds = match.metadata?.rounds_played || 0;
    const won = didPlayerWin(match, player);

    sum.kills += stats.kills || 0;
    sum.deaths += stats.deaths || 0;
    sum.assists += stats.assists || 0;
    sum.score += stats.score || 0;
    sum.damage += player.damage_made || 0;
    sum.headshots += stats.headshots || 0;
    sum.bodyshots += stats.bodyshots || 0;
    sum.legshots += stats.legshots || 0;
    sum.rounds += rounds;
    sum.wins += won ? 1 : 0;
    return sum;
  }, {
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    damage: 0,
    headshots: 0,
    bodyshots: 0,
    legshots: 0,
    rounds: 0,
    wins: 0,
  });

  const gameCount = selectedMatches.length;
  const losses = gameCount - totals.wins;
  const totalShots = totals.headshots + totals.bodyshots + totals.legshots;
  const agentCounts = countBy(selectedMatches, ({ player }) => player.character || 'Unknown');

  const mapStats = selectedMatches.reduce((stats, { match, player }) => {
    const mapName = match.metadata?.map || 'Unknown';
    if (!stats[mapName]) {
      stats[mapName] = { wins: 0, losses: 0 };
    }

    if (didPlayerWin(match, player)) {
      stats[mapName].wins += 1;
    } else {
      stats[mapName].losses += 1;
    }

    return stats;
  }, {});

  const currentTier = mmr?.current_data?.currenttierpatched || '정보 없음';
  const rankingInTier = mmr?.current_data?.ranking_in_tier;

  return {
    player: {
      riotId: `${name}#${tag}`,
      region: account.region?.toUpperCase() || 'UNKNOWN',
      accountLevel: account.account_level || 0,
      currentTier,
      rr: Number.isFinite(rankingInTier) ? rankingInTier : null,
      highestTier: mmr?.highest_rank?.patched_tier || '정보 없음',
    },
    sample: {
      label: competitiveMatches.length >= 3 ? '최근 경쟁전' : '최근 전체 매치',
      games: gameCount,
      wins: totals.wins,
      losses,
      winRate: Math.round((totals.wins / gameCount) * 100),
    },
    performance: {
      totalKda: `${totals.kills}/${totals.deaths}/${totals.assists}`,
      avgKills: Number((totals.kills / gameCount).toFixed(1)),
      avgDeaths: Number((totals.deaths / gameCount).toFixed(1)),
      avgAssists: Number((totals.assists / gameCount).toFixed(1)),
      kd: totals.deaths > 0 ? Number((totals.kills / totals.deaths).toFixed(2)) : 'Perfect',
      kda: totals.deaths > 0 ? Number(((totals.kills + totals.assists) / totals.deaths).toFixed(2)) : 'Perfect',
      adr: totals.rounds > 0 ? Math.round(totals.damage / totals.rounds) : 0,
      acs: totals.rounds > 0 ? Math.round(totals.score / totals.rounds) : 0,
      headshotRate: totalShots > 0 ? Math.round((totals.headshots / totalShots) * 100) : 0,
    },
    agents: topCounts(agentCounts),
    maps: Object.entries(mapStats)
      .map(([map, result]) => ({
        map,
        games: result.wins + result.losses,
        wins: result.wins,
        losses: result.losses,
      }))
      .sort((mapA, mapB) => mapB.games - mapA.games)
      .slice(0, 4),
    recentMatches: selectedMatches.slice(0, 5).map(({ match, player }) => {
      const rounds = match.metadata?.rounds_played || 0;
      const stats = player.stats || {};

      return {
        result: didPlayerWin(match, player) ? '승리' : '패배',
        mode: match.metadata?.mode || 'Unknown',
        map: match.metadata?.map || 'Unknown',
        agent: player.character || 'Unknown',
        score: `${match.teams?.red?.rounds_won || 0}:${match.teams?.blue?.rounds_won || 0}`,
        kda: `${stats.kills || 0}/${stats.deaths || 0}/${stats.assists || 0}`,
        adr: rounds > 0 ? Math.round((player.damage_made || 0) / rounds) : 0,
        acs: rounds > 0 ? Math.round((stats.score || 0) / rounds) : 0,
      };
    }),
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
    case 'NVIDIA_NIM_API_KEY_MISSING':
      return '❌ NVIDIA NIM API 키가 설정되지 않았습니다. `NVIDIA_NIM_API_KEY` 환경변수를 설정해주세요.';
    case 'NVIDIA_NIM_AUTH_FAILED':
      return '❌ NVIDIA NIM 인증에 실패했습니다. API 키가 올바른지 확인해주세요.';
    case 'NVIDIA_NIM_LOCAL_RATE_LIMIT':
    case 'NVIDIA_NIM_RATE_LIMITED':
      return '❌ AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    case 'NVIDIA_NIM_EMPTY_RESPONSE':
    case 'NVIDIA_NIM_REQUEST_FAILED':
      return '❌ AI 평가를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.';
    case 'NVIDIA_NIM_TIMEOUT':
      return '❌ NVIDIA NIM 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 더 작은 모델로 설정해주세요.';
    default:
      if (error.response?.status === 404) {
        return '❌ 플레이어를 찾을 수 없습니다.';
      }
      if (error.response?.status === 429) {
        return '❌ 전적 API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      }
      return '❌ AI 평가 중 오류가 발생했습니다.';
  }
}

function truncateDiscordText(text, maxLength) {
  const characters = Array.from(text || '');
  if (characters.length <= maxLength) {
    return text;
  }

  return `${characters.slice(0, maxLength - 3).join('').trimEnd()}...`;
}

export const aiReviewCommand = {
  name: ['ㅂ평가', 'ㅂai평가', 'ㅂ분석'],
  execute: async (message, args) => {
    let loadingMsg = null;

    try {
      const { name, tag } = await resolvePlayer(message, args);
      loadingMsg = await message.reply('🤖 최근 전적을 모아서 AI 평가를 생성중입니다...');

      const account = await valorantApi.getAccount(name, tag);
      const [mmrResult, matches] = await Promise.all([
        valorantApi.getMMR(account.region, account.puuid).catch(() => null),
        valorantApi.getMatches(account.region, name, tag, 10),
      ]);

      if (!Array.isArray(matches) || matches.length === 0) {
        throw new Error('MATCH_DATA_MISSING');
      }

      const analysisData = buildAnalysisData({
        account,
        mmr: mmrResult,
        matches,
        name,
        tag,
      });
      const aiReview = await generateValorantAiReview(analysisData);

      const embed = {
        color: 0xFF4654,
        title: `🤖 AI 발로란트 평가 - ${name}#${tag}`,
        description: truncateDiscordText(aiReview.content, 3800),
        fields: [
          {
            name: '📊 분석 기준',
            value:
              `${analysisData.sample.label} ${analysisData.sample.games}게임 ` +
              `(${analysisData.sample.wins}승 ${analysisData.sample.losses}패, 승률 ${analysisData.sample.winRate}%)\n` +
              `K/D ${analysisData.performance.kd} · ADR ${analysisData.performance.adr} · ACS ${analysisData.performance.acs} · HS ${analysisData.performance.headshotRate}%`,
            inline: false,
          },
        ],
        footer: {
          text: `NVIDIA NIM: ${aiReview.model}`,
        },
        timestamp: new Date(),
      };

      await loadingMsg.edit({
        content: null,
        embeds: [embed],
      });
    } catch (error) {
      console.error('AI 평가 명령어 오류:', error.response?.data || error.message);
      const errorMessage = getErrorMessage(error);

      if (loadingMsg) {
        return loadingMsg.edit(errorMessage);
      }

      return message.reply(errorMessage);
    }
  },
};
