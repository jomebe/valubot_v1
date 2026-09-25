import { generateValorantAiReview } from '../src/services/nvidiaNim.js';

const started = Date.now();
try {
  const result = await generateValorantAiReview({
    player: { riotId: 'test#KR1' },
    sample: { games: 1, wins: 1, losses: 0, winRate: 100 },
    performance: { kd: 1.2, kda: 1.6, adr: 145, acs: 215, headshotRate: 24 },
    agents: [],
    maps: [],
    recentMatches: []
  });
  console.log('SMOKE_OK', Date.now() - started, result.model, result.content.length);
  console.log(result.content.slice(0, 200).replace(/\n/g, ' '));
} catch (error) {
  console.log('SMOKE_ERR', Date.now() - started, error.code || error.message);
  process.exitCode = 1;
}