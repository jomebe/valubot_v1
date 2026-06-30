import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials, SlashCommandBuilder } from 'discord.js';
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
import { esportsCommand } from './commands/esports.js';
import { aiReviewCommand } from './commands/aiReview.js';
import { focusedReviewCommand } from './commands/focusedReview.js';

// 로그인/상점 명령어 (Riot 내부 API 사용)
import { loginCommand, logoutCommand } from './commands/login.js';
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

// JSON 바디 파서 및 CORS 설정
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigins = ['https://valubot-v1.pages.dev', 'http://localhost:3000', 'http://localhost:5000', 'http://localhost:10000', 'http://localhost:10001'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://valubot-v1.pages.dev');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
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

// Riot OAuth 콜백 API 엔드포인트
app.post('/api/auth/riot/callback', async (req, res) => {
  const { accessToken, idToken, state } = req.body;

  if (!state || !accessToken) {
    return res.status(400).json({
      success: false,
      error: '필수 인증 정보(state, accessToken)가 누락되었습니다.'
    });
  }

  try {
    const { validateAndUseState, saveRiotSession } = await import('./services/riotAuth.js');
    
    // 1. State 검증 및 Discord User ID 조회
    const discordUserId = validateAndUseState(state);
    if (!discordUserId) {
      return res.status(400).json({
        success: false,
        error: '만료되었거나 유효하지 않은 로그인 세션(state)입니다. 다시 /로그인을 시도해주세요.'
      });
    }

    // 2. Riot 인증 토큰 검증 및 세션 저장
    const result = await saveRiotSession(discordUserId, accessToken, idToken);
    
    console.log(`[Riot Callback] 성공: Discord ID ${discordUserId} -> Riot 계정 ${result.playerName}`);
    
    // 3. 디스코드 채널로 성공 메시지 피드백 전송
    try {
      const user = await client.users.fetch(discordUserId).catch(() => null);
      if (user) {
        await user.send(`✅ **라이엇 계정 연동 완료!**\n**${result.playerName}** 계정으로 로그인되었습니다. 이제 채널에서 \`/상점\` 또는 \`ㅂ상점\`을 사용하실 수 있습니다.`).catch(() => null);
      }
    } catch (msgErr) {
      // DM 전송 실패 무시
    }

    return res.json({
      success: true,
      playerName: result.playerName
    });
  } catch (error) {
    console.error('[Riot Callback] 오류:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || '인증 정보 처리 중 오류가 발생했습니다.'
    });
  }
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
    GatewayIntentBits.GuildMessageReactions,  // 선착순 반응 이모지용
    GatewayIntentBits.GuildVoiceStates  // 선착순 기능용
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction  // 캐시되지 않은 메시지의 반응 처리용
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
  ['ㅂ평가', aiReviewCommand],
  ['ㅂai평가', aiReviewCommand],
  ['ㅂ분석', aiReviewCommand],
  ['ㅂ집중평가', focusedReviewCommand],
  ['ㅂ전판평가', focusedReviewCommand],
  ['ㅂ타임아웃', timeoutCommand],
  ['ㅂ매치', matchCommand],
  ['ㅂ최근', matchCommand],
  // ['ㅂ상점', shopCommand],  // 이 줄 제거 또는 주석 처리
  // 별칭
  ['ㅂㄷㅇ', helpCommand],
  ['ㅂㄹㄷㅁ', randomMapCommand],
  ['ㅂ티어', tierCommand],
  ['ㅂㅌㅇ', tierCommand],
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
  ['ㅂ이스포츠', esportsCommand],
  ['ㅂ대회', esportsCommand],
  ['ㅂesports', esportsCommand],
  // 로그인/상점 명령어 (Riot 내부 API)
  // 주의: 개인 학습/연구 목적으로만 사용
  ['ㅂ로그인', { execute: loginCommand }],
  ['ㅂㄹㄱㅇ', { execute: loginCommand }],
  ['ㅂ로그아웃', { execute: logoutCommand }],
  ['ㅂㄹㄱㅇㅇ', { execute: logoutCommand }],
  ['ㅂ상점', { execute: storeCommand }],
  ['ㅂㅅㅈ', { execute: storeCommand }],
  ['ㅂ내상점', { execute: storeCommand }],
]);

const SLASH_COMMAND_CONFIGS = [
  { name: '도움', legacy: 'ㅂ도움', description: '발루봇 도움말을 확인합니다.' },
  { name: '발로등록', legacy: 'ㅂ발로등록', description: '발로란트 계정을 등록합니다.', optionType: 'register' },
  { name: '발로삭제', legacy: 'ㅂ발로삭제', description: '등록된 발로란트 계정을 삭제합니다.' },
  { name: '전적', legacy: 'ㅂ전적', description: '발로란트 전적을 확인합니다.', optionType: 'riotIdOptional' },
  { name: '발로', legacy: 'ㅂ발로', description: '등록된 계정 또는 입력 계정의 프로필을 조회합니다.', optionType: 'riotIdOptional' },
  { name: '랜덤맵', legacy: 'ㅂ랜덤맵', description: '무작위 발로란트 맵을 뽑습니다.' },
  { name: '통계', legacy: 'ㅂ통계', description: '최근 경기 통계를 확인합니다.', optionType: 'riotIdOptional' },
  { name: '평가', legacy: 'ㅂ평가', description: 'AI가 최근 전적을 분석해 발로란트 평가를 제공합니다.', optionType: 'riotIdOptional' },
  { name: '집중평가', legacy: 'ㅂ집중평가', description: 'AI가 직전 1경기를 전문적으로 집중 평가합니다.', optionType: 'riotIdOptional' },
  { name: '타임아웃', legacy: 'ㅂ타임아웃', description: '관리자 전용 타임아웃을 실행합니다.', optionType: 'timeout' },
  { name: '매치', legacy: 'ㅂ매치', description: '최근 매치 정보를 확인합니다.', optionType: 'riotIdOptional' },
  { name: '티어', legacy: 'ㅂ티어', description: '현재 티어를 확인합니다.', optionType: 'riotIdOptional' },
  { name: '리더보드', legacy: 'ㅂ리더보드', description: '서버 내 티어 랭킹을 확인합니다.' },
  { name: '비교', legacy: 'ㅂ비교', description: '두 플레이어의 전적을 비교합니다.', optionType: 'compare' },
  { name: '선착', legacy: 'ㅂ선착', description: '선착순을 생성합니다.', optionType: 'queue' },
  { name: '선착현황', legacy: 'ㅂ선착현황', description: '현재 선착순 상태를 확인합니다.' },
  { name: '선착취소', legacy: 'ㅂ선착취소', description: '진행 중인 선착순을 취소합니다.' },
  { name: '선착멘션', legacy: 'ㅂ선착멘션', description: '선착순 참가자를 멘션합니다.' },
  { name: '랜덤스킨', legacy: 'ㅂ랜덤스킨', description: '무작위 스킨을 선택합니다.', optionType: 'skin' },
  { name: '요원', legacy: 'ㅂ요원', description: '요원 정보를 조회합니다.', optionType: 'agent' },
  { name: '맵', legacy: 'ㅂ맵', description: '맵 정보를 조회합니다.', optionType: 'map' },
  { name: '무기', legacy: 'ㅂ무기', description: '무기 정보를 조회합니다.', optionType: 'weapon' },
  { name: '프리미어', legacy: 'ㅂ프리미어', description: '프리미어 정보를 확인합니다.', optionType: 'premier' },
  { name: '이스포츠', legacy: 'ㅂ이스포츠', description: '이스포츠 관련 정보를 확인합니다.', optionType: 'esports' },
  { name: '상점', legacy: 'ㅂ상점', description: '상점 정보를 조회합니다.' },
  { name: '로그인', legacy: 'ㅂ로그인', description: 'Riot 계정을 연결하여 로그인합니다.' },
  { name: '로그아웃', legacy: 'ㅂ로그아웃', description: 'Riot 계정 연결 정보를 삭제하고 로그아웃합니다.' },
];

const slashCommandMap = new Map(
  SLASH_COMMAND_CONFIGS.map((config) => [config.name, config])
);

const slashCommandPayload = SLASH_COMMAND_CONFIGS.map((config) => {
  const builder = new SlashCommandBuilder()
    .setName(config.name)
    .setDescription(config.description);

  switch (config.optionType) {
    case 'register':
      builder
        .addStringOption((option) =>
          option
            .setName('riot_id')
            .setDescription('등록할 닉네임#태그 (예: ddong#2262)')
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName('target_user')
            .setDescription('관리자용 대상 사용자 (선택)')
            .setRequired(false)
        );
      break;
    case 'riotIdOptional':
      builder.addStringOption((option) =>
        option
          .setName('riot_id')
          .setDescription('조회할 닉네임#태그 (비우면 내 등록 계정)')
          .setRequired(false)
      );
      break;
    case 'timeout':
      builder
        .addUserOption((option) =>
          option
            .setName('대상유저')
            .setDescription('타임아웃할 유저')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('시간')
            .setDescription('타임아웃 시간(분, 1~60)')
            .setMinValue(1)
            .setMaxValue(60)
            .setRequired(true)
        );
      break;
    case 'compare':
      builder
        .addUserOption((option) =>
          option
            .setName('상대_유저')
            .setDescription('서버에서 선택한 상대 유저 (발로등록 필요)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('상대_riot_id')
            .setDescription('상대 닉네임#태그 (유저 선택 대신 사용 가능)')
            .setRequired(false)
        )
        .addUserOption((option) =>
          option
            .setName('내_유저')
            .setDescription('내 쪽 유저 선택 (비우면 내 등록 계정)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('내_riot_id')
            .setDescription('내 닉네임#태그 (유저 선택 대신 사용 가능)')
            .setRequired(false)
        );
      break;
    case 'queue':
      builder
        .addIntegerOption((option) =>
          option
            .setName('인원수')
            .setDescription('모집 인원 수 (2~101)')
            .setMinValue(2)
            .setMaxValue(101)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('제목')
            .setDescription('선착순 제목 (예: 저녁배그)')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('멘션')
            .setDescription('역할 멘션 사용 여부')
            .addChoices(
              { name: 'O (멘션 사용)', value: 'O' },
              { name: 'X (멘션 없음)', value: 'X' }
            )
            .setRequired(false)
        );
      break;
    case 'skin':
      builder.addStringOption((option) =>
        option
          .setName('무기_또는_카테고리')
          .setDescription('예: 밴달, 팬텀, 라이플, 권총 (비우면 전체 랜덤)')
          .setRequired(false)
      );
      break;
    case 'agent':
      builder.addStringOption((option) =>
        option
          .setName('에이전트명')
          .setDescription('예: 제트, 레이나, 오멘')
          .setRequired(true)
      );
      break;
    case 'map':
      builder.addStringOption((option) =>
        option
          .setName('맵이름')
          .setDescription('예: 어센트, 바인드, 헤이븐')
          .setRequired(true)
      );
      break;
    case 'weapon':
      builder.addStringOption((option) =>
        option
          .setName('무기이름')
          .setDescription('예: 밴달, 팬텀, 오퍼')
          .setRequired(true)
      );
      break;
    case 'premier':
      builder
        .addStringOption((option) =>
          option
            .setName('팀이름')
            .setDescription('예: 다딱이들의모임')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('팀태그')
            .setDescription('예: daddk')
            .setRequired(true)
        );
      break;
    case 'esports':
      builder
        .addStringOption((option) =>
          option
            .setName('종류')
            .setDescription('실행할 이스포츠 명령')
            .addChoices(
              { name: '이벤트', value: '이벤트' },
              { name: '팀', value: '팀' },
              { name: '선수', value: '선수' },
              { name: '매치', value: '매치' },
              { name: '이벤트매치', value: '이벤트매치' }
            )
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('검색어')
            .setDescription('팀/선수 이름 또는 ID, 매치ID/이벤트ID')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('세부')
            .setDescription('팀/선수 명령의 세부 옵션')
            .addChoices(
              { name: '매치', value: '매치' },
              { name: '이적', value: '이적' }
            )
            .setRequired(false)
        );
      break;
    default:
      break;
  }

  return builder.toJSON();
});

async function registerSlashCommands() {
  try {
    const registerPromises = [...client.guilds.cache.values()].map((guild) =>
      guild.commands.set(slashCommandPayload)
    );

    await Promise.allSettled(registerPromises);
    console.log(`슬래시 명령어 등록 완료: ${client.guilds.cache.size}개 서버`);
  } catch (error) {
    console.error('슬래시 명령어 등록 실패:', error);
  }
}

function createSlashMessageAdapter(interaction, content, targetUser = null, targetMember = null) {
  let repliedOnce = false;

  const normalizeReplyPayload = (payload) => {
    if (typeof payload === 'string') {
      return { content: payload };
    }

    if (!payload || typeof payload !== 'object') {
      return { content: String(payload ?? '') };
    }

    return payload;
  };

  return {
    author: interaction.user,
    member: interaction.member,
    guild: interaction.guild,
    channel: interaction.channel,
    client: interaction.client,
    content,
    interaction,
    mentions: {
      users: {
        first: () => targetUser,
      },
      members: {
        first: () => targetMember,
      },
    },
    delete: async () => {},
    reply: async (payload) => {
      const normalized = normalizeReplyPayload(payload);

      if (!interaction.replied && !interaction.deferred && !repliedOnce) {
        repliedOnce = true;
        await interaction.reply(normalized);
        return interaction.fetchReply();
      }

      return interaction.followUp(normalized);
    },
  };
}

// Discord 클라이언트 에러 핸들링 (중요한 오류만)
client.on('error', (error) => {
  console.error('Discord 오류:', error.message);
});

// 디버그/경고 이벤트 비활성화 (리소스 절약)

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const args = message.content.split(' ');
  const commandName = args[0].toLowerCase();
  
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

  // 슬래시 명령어 등록
  await registerSlashCommands();
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
  if (interaction.isChatInputCommand()) {
    const slashConfig = slashCommandMap.get(interaction.commandName);

    if (!slashConfig) {
      return;
    }

    let rawArgs = '';
    let targetUser = null;
    let targetMember = null;
    let customArgs = null;
    let validationError = '';

    switch (slashConfig.optionType) {
      case 'register':
        rawArgs = interaction.options.getString('riot_id', true).trim();
        targetUser = interaction.options.getUser('target_user');
        targetMember = targetUser ? interaction.guild?.members?.cache.get(targetUser.id) || null : null;
        break;
      case 'riotIdOptional':
        rawArgs = interaction.options.getString('riot_id')?.trim() || '';
        break;
      case 'timeout': {
        targetUser = interaction.options.getUser('대상유저', true);
        targetMember = interaction.options.getMember('대상유저') || interaction.guild?.members?.cache.get(targetUser.id) || null;
        if (!targetMember && interaction.guild) {
          targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        }
        const duration = interaction.options.getInteger('시간', true);
        rawArgs = `<@${targetUser.id}> ${duration}`;
        break;
      }
      case 'compare': {
        const opponentUser = interaction.options.getUser('상대_유저');
        const opponentRiotId = interaction.options.getString('상대_riot_id')?.trim() || '';
        const myUser = interaction.options.getUser('내_유저');
        const myRiotId = interaction.options.getString('내_riot_id')?.trim() || '';

        const opponentToken = opponentUser ? `<@${opponentUser.id}>` : opponentRiotId;
        const myToken = myUser ? `<@${myUser.id}>` : myRiotId;

        if (!opponentToken) {
          validationError = '❌ `/비교`는 `상대_유저` 또는 `상대_riot_id` 중 하나를 입력해야 합니다.';
          break;
        }

        customArgs = myToken ? [myToken, opponentToken] : [opponentToken];
        rawArgs = customArgs.join(' ');
        break;
      }
      case 'queue': {
        const queueLimit = interaction.options.getInteger('인원수', true);
        const queueTitle = interaction.options
          .getString('제목', true)
          .trim()
          .replace(/\s+/g, ' ');
        const queueMention = interaction.options.getString('멘션') || 'X';
        rawArgs = `${queueLimit} ${queueTitle} ${queueMention}`;
        break;
      }
      case 'skin':
        rawArgs = interaction.options.getString('무기_또는_카테고리')?.trim() || '';
        break;
      case 'agent':
        rawArgs = interaction.options.getString('에이전트명', true).trim();
        break;
      case 'map':
        rawArgs = interaction.options.getString('맵이름', true).trim();
        break;
      case 'weapon':
        rawArgs = interaction.options.getString('무기이름', true).trim();
        break;
      case 'premier': {
        const teamName = interaction.options.getString('팀이름', true).trim();
        const teamTag = interaction.options.getString('팀태그', true).trim();
        rawArgs = `${teamName} ${teamTag}`;
        break;
      }
      case 'esports': {
        const kind = interaction.options.getString('종류', true).trim();
        const keyword = interaction.options.getString('검색어')?.trim() || '';
        const detail = interaction.options.getString('세부')?.trim() || '';
        rawArgs = [kind, keyword, detail].filter(Boolean).join(' ');
        break;
      }
      default:
        rawArgs = '';
        break;
    }

    if (validationError) {
      await interaction.reply({
        content: validationError,
        ephemeral: true,
      });
      return;
    }

    const legacyCommandName = slashConfig.legacy;
    const command = commands.get(legacyCommandName);

    if (!command) {
      await interaction.reply({
        content: `❌ 아직 슬래시에서 지원하지 않는 명령어입니다: ${interaction.commandName}`,
        ephemeral: true,
      });
      return;
    }

    const argText = targetUser
      ? `<@${targetUser.id}>${rawArgs ? ` ${rawArgs}` : ''}`
      : rawArgs;

    const args = customArgs || (argText ? argText.split(/\s+/) : []);
    const syntheticContent = `${legacyCommandName}${argText ? ` ${argText}` : ''}`;
    const slashMessage = createSlashMessageAdapter(
      interaction,
      syntheticContent,
      targetUser || null,
      targetMember || null
    );

    try {
      await command.execute(slashMessage, args);
    } catch (error) {
      console.error(`슬래시 명령어 실행 중 오류 (${legacyCommandName}):`, error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp('❌ 슬래시 명령어 실행 중 오류가 발생했습니다.');
      } else {
        await interaction.reply('❌ 슬래시 명령어 실행 중 오류가 발생했습니다.');
      }
    }

    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    
    // 토큰 등록 버튼 클릭 시 모달 열기
    if (customId.startsWith('login_token_btn_')) {
      const targetUserId = customId.split('_')[3];
      if (interaction.user.id !== targetUserId) {
        return interaction.reply({
          content: '❌ 본인의 로그인 세션만 등록할 수 있습니다.',
          ephemeral: true
        });
      }
      
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId(`login_modal_${targetUserId}`)
        .setTitle('라이엇 로그인 URL 입력');
        
      const urlInput = new TextInputBuilder()
        .setCustomId('redirect_url_input')
        .setLabel('리다이렉트된 URL 전체를 입력해주세요')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('http://localhost/redirect#access_token=...')
        .setRequired(true);
        
      const row = new ActionRowBuilder().addComponents(urlInput);
      modal.addComponents(row);
      
      await interaction.showModal(modal);
      return;
    }
    
    // 상점 새로고침 버튼
    if (customId.startsWith('store_refresh_')) {
      return handleStoreRefresh(interaction);
    }
    
    // 지갑 상세 버튼
    if (customId.startsWith('store_wallet_')) {
      return handleWalletDetail(interaction);
    }
  }

  // 모달 제출 처리
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    
    if (customId.startsWith('login_modal_')) {
      const targetUserId = customId.split('_')[2];
      if (interaction.user.id !== targetUserId) {
        return interaction.reply({
          content: '❌ 본인만 토큰을 등록할 수 있습니다.',
          ephemeral: true
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      const redirectUrl = interaction.fields.getTextInputValue('redirect_url_input')?.trim();
      
      try {
        const { validateAndSaveToken } = await import('./services/riotAuth.js');
        await validateAndSaveToken(targetUserId, redirectUrl);
        
        await interaction.editReply({
          content: '✅ **로그인 완료.** 이제 `/상점` 또는 `ㅂ상점`으로 오늘의 상점을 확인할 수 있어요.'
        });
      } catch (error) {
        console.error('로그인 모달 처리 오류:', error.message);
        await interaction.editReply({
          content: `❌ **로그인 실패:** ${error.message || '인증에 실패했습니다.'}`
        });
      }
      return;
    }
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
