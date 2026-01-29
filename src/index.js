import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import express from 'express';
import axios from 'axios';
import { helpCommand } from './commands/help.js';
import { registerCommand } from './commands/register.js';
import { randomMapCommand } from './commands/randomMap.js';
import { loadGuildSettings, saveGuildSettings } from './services/database.js';
import { DEFAULT_GUILD_SETTINGS, guildSettings } from './config/constants.js';
import { statsCommand } from './commands/stats.js';
import { timeoutCommand } from './commands/timeout.js';
import { unregisterCommand } from './commands/unregister.js';
import { matchCommand } from './commands/match.js';
import { tierCommand } from './commands/tier.js';
import { leaderboardCommand } from './commands/leaderboard.js';
import { profileCommand } from './commands/profile.js';
import { compareCommand } from './commands/compare.js';
import { recordCommand } from './commands/record.js';
import { queueCommand, createTeamVoiceChannels } from './commands/queue.js';
import { randomSkinCommand } from './commands/randomSkin.js';
import { agentCommand } from './commands/agent.js';
import { mapCommand } from './commands/map.js';
import { weaponCommand } from './commands/weapon.js';
import { premierCommand } from './commands/premier.js';

// 로그인/상점 명령어 (Riot 내부 API 사용)
import { loginCommand, logoutCommand, handleLoginCancel } from './commands/login.js';
import { storeCommand, handleStoreRefresh, handleWalletDetail } from './commands/store.js';

// __dirname 설정 (ES 모듈에서 사용하기 위함)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 환경변수 설정 (.env 파일 경로 지정)
// Render에서는 환경변수가 시스템에서 제공되므로 .env 파일이 없어도 됨
const envPath = join(__dirname, '../.env');
console.log('env 파일 경로 시도:', envPath);

// 개발 환경에서만 .env 파일 로드 시도
if (process.env.NODE_ENV !== 'production') {
  try {
    dotenv.config({ path: envPath });
    console.log('개발 환경: env 파일 로드 시도 완료');
  } catch (envError) {
    console.log('개발 환경: env 파일 로드 실패:', envError.message);
  }
} else {
  console.log('프로덕션 환경: 시스템 환경변수 사용');
}

// 환경 변수 로드 확인 (프로덕션에서는 최소 로깅)
if (process.env.NODE_ENV !== 'production') {
  console.log('환경 변수 로드 상태:', process.env.DISCORD_TOKEN ? 'OK' : 'MISSING');
}

// Express 서버 설정
const app = express();
const PORT = process.env.PORT || 10000;

// 상태 체크 엔드포인트 추가
app.get('/', (req, res) => {
  res.send({
    status: 'online',
    timestamp: new Date().toISOString(),
    botName: client?.user?.tag || 'Valubot',
    guilds: client?.guilds?.cache.size || 0
  });
});

// keep-alive 엔드포인트 추가
app.get('/keep-alive', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// 메모리 사용량 모니터링 엔드포인트 추가
app.get('/status', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'online',
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
    },
    timestamp: new Date().toISOString()
  });
});

// Express 서버를 즉시 시작 (Discord 봇 로그인 전에)
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});

// 디스코드 클라이언트 생성 (리소스 최적화: 필수 Intent만 사용)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates  // 선착순 기능용
  ],
  // 리소스 최적화 옵션
  sweepers: {
    messages: {
      interval: 300, // 5분마다 오래된 메시지 캐시 정리
      lifetime: 600  // 10분 이상 된 메시지 제거
    },
    users: {
      interval: 600, // 10분마다 사용자 캐시 정리
      filter: () => user => user.bot && user.id !== client.user?.id
    }
  },
  rest: {
    timeout: 15000 // API 타임아웃 15초
  }
});

// 발로란트 계정 저장소
const valorantAccounts = new Map();

// 명령어 모음
const commands = new Map([
  ['ㅂ도움', helpCommand],
  ['ㅂ발로등록', registerCommand],
  ['ㅂ발로삭제', unregisterCommand],
  ['ㅂ전적', recordCommand],
  ['ㅂ발로', profileCommand],
  ['ㅂ랜덤맵', randomMapCommand],
  ['ㅂ통계', statsCommand],
  ['ㅂ타임아웃', timeoutCommand],
  ['ㅂ매치', matchCommand],
  ['ㅂ최근', matchCommand],
  // ['ㅂ상점', shopCommand],  // 이 줄 제거 또는 주석 처리
  // 별칭
  ['ㅂㄷㅇ', helpCommand],
  ['ㅂㄹㄷㅁ', randomMapCommand],
  ['ㅂ티어', tierCommand],
  ['ㅂ랭크', tierCommand],
  ['ㅂ리더보드', leaderboardCommand],
  ['ㅂㄹㄷㅂㄷ', leaderboardCommand],
  ['ㅂㅌㄱ', statsCommand],
  ['ㅂ비교', compareCommand],
  ['ㅂ선착', queueCommand],
  ['ㅂ선착현황', queueCommand],
  ['ㅂ선착취소', queueCommand],
  ['ㅂ테스트참가', queueCommand],
  ['ㅂ선착멘션', queueCommand],
  ['ㅂ랜덤스킨', randomSkinCommand],
  ['ㅂㄹㄷㅅㅋ', randomSkinCommand],
  ['ㅂ스킨', randomSkinCommand],
  ['ㅂ요원', agentCommand],
  ['ㅂ에이전트', agentCommand],
  ['ㅂㅇㅇ', agentCommand],
  ['ㅂ맵', mapCommand],
  ['ㅂㅁ', mapCommand],
  ['ㅂ무기', weaponCommand],
  ['ㅂㅁㄱ', weaponCommand],
  ['ㅂ프리미어', premierCommand],
  ['ㅂ프리미어팀', premierCommand],
  // 로그인/상점 명령어 (Riot 내부 API)
  // 주의: 개인 학습/연구 목적으로만 사용
  ['ㅂ로그인', { execute: loginCommand }],
  ['ㅂ로그아웃', { execute: logoutCommand }],
  ['ㅂ상점', { execute: storeCommand }],
  ['ㅂ내상점', { execute: storeCommand }],
]);

// Discord 클라이언트 에러 핸들링 (중요한 오류만)
client.on('error', (error) => {
  console.error('Discord 오류:', error.message);
});

// 디버그/경고 이벤트 비활성화 (리소스 절약)

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.toLowerCase();
  const args = content.split(' ');
  const commandName = args[0];
  
  // 명령어 실행
  const command = commands.get(commandName);
  if (command) {
    try {
      await command.execute(message, args.slice(1));
    } catch (error) {
      console.error(`명령어 실행 중 오류 (${commandName}):`, error);
      console.error('오류 스택:', error.stack);
      try {
        await message.reply('❌ 명령어 실행 중 오류가 발생했습니다.');
      } catch (replyError) {
        console.error('응답 전송 실패:', replyError);
      }
    }
  }
});

// 봇이 새로운 서버에 참가했을 때
client.on('guildCreate', async (guild) => {
  try {
    // 서버 기본 설정 생성
    const settings = await loadGuildSettings(guild.id);
    guildSettings.set(guild.id, settings);
    
    // 환영 메시지 전송
    const systemChannel = guild.systemChannel;
    if (systemChannel) {
      const embed = {
        color: 0xFF4654,
        title: '👋 안녕하세요!',
        description: 
          '발로봇을 초대해주셔서 감사합니다!\n' +
          '`ㅂ도움` 명령어로 사용 가능한 기능들을 확인하실 수 있습니다.\n\n' +
          '관리자는 `ㅂ설정` 명령어로 봇의 설정을 변경할 수 있습니다.',
        timestamp: new Date()
      };
      
      await systemChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('서버 참가 처리 중 오류:', error);
  }
});

// 봇이 서버에서 추방되었을 때
client.on('guildDelete', (guild) => {
  // 서버 설정 제거
  guildSettings.delete(guild.id);
});

// 봇 시작 시 모든 서버의 설정 로드
client.once('ready', async () => {
  console.log(`봇 준비 완료: ${client.user.tag} (${client.guilds.cache.size}개 서버)`);
  
  try {
    // 모든 서버의 설정 로드 (로깅 최소화)
    for (const guild of client.guilds.cache.values()) {
      try {
        const settings = await loadGuildSettings(guild.id);
        guildSettings.set(guild.id, settings);
      } catch (guildError) {
        // 실패한 서버는 기본 설정 사용
        guildSettings.set(guild.id, { ...DEFAULT_GUILD_SETTINGS });
      }
    }
  } catch (error) {
    // 오류 시 기본 설정 사용
  }
  
  // 봇이 오프라인이어도 작동할 수 있도록 기본 설정 확인
  for (const guild of client.guilds.cache.values()) {
    if (!guildSettings.has(guild.id)) {
      guildSettings.set(guild.id, { ...DEFAULT_GUILD_SETTINGS });
    }
  }
});

// Discord 봇 로그인
console.log('Discord 봇 로그인 시도 중...');

// 로그인 타임아웃 설정 (30초)
const loginTimeout = setTimeout(() => {
  console.error('Discord 봇 로그인 타임아웃 (30초 경과)');
  console.error('가능한 원인: 네트워크 연결 문제, 잘못된 토큰, Discord API 문제');
  process.exit(1);
}, 30000);

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    clearTimeout(loginTimeout);
    console.log('Discord 봇 로그인 성공!');
  })
  .catch(err => {
    clearTimeout(loginTimeout);
    console.error('Discord 봇 로그인 실패:', err);
    console.error('로그인 오류 상세:', err.message);
    console.error('오류 코드:', err.code);
    process.exit(1); // 로그인 실패시 프로세스 종료
  });

// Discord 봇 로그인 위에 추가
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  
  // 로그인 취소 버튼
  if (customId.startsWith('login_cancel_')) {
    return handleLoginCancel(interaction);
  }
  
  // 상점 새로고침 버튼
  if (customId.startsWith('store_refresh_')) {
    return handleStoreRefresh(interaction);
  }
  
  // 지갑 상세 버튼
  if (customId.startsWith('store_wallet_')) {
    return handleWalletDetail(interaction);
  }
  
  if (interaction.customId === 'show_random_skins') {
    // 이 부분 전체 삭제
  }
});

// Keep-alive 핑 (14분마다 - Render 무료 티어 15분 sleep 방지, 리소스 절약)
setInterval(async () => {
  try {
    const pingUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:10000';
    await axios.get(`${pingUrl}/keep-alive`, { timeout: 5000 });
    // 로그 최소화로 리소스 절약
  } catch (error) {
    // 실패해도 무시 (다음 핑에서 복구됨)
  }
}, 14 * 60 * 1000); // 14분마다 실행 (기존 5분 -> 14분으로 변경) 