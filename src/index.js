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

// __dirname 설정 (ES 모듈에서 사용하기 위함)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 환경변수 설정 (.env 파일 경로 지정)
dotenv.config({ path: join(__dirname, '../.env') });

// 환경 변수 로드 확인
console.log('환경 변수 파일 경로:', join(__dirname, '../.env'));
console.log('환경 변수 로드 상태:');
[
  'DISCORD_TOKEN',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID'
].forEach(key => {
  console.log(`${key}: ${process.env[key] ? '설정됨' : '미설정'}`);
});

// 토큰 확인 로그
console.log('Token loaded:', process.env.DISCORD_TOKEN ? '토큰이 있습니다' : '토큰이 없습니다');
console.log('현재 작업 디렉토리:', process.cwd());
console.log('env 파일 경로:', join(__dirname, '../.env'));

// Express 서버 설정
const app = express();
const PORT = process.env.PORT || 10000;

// 상태 체크 엔드포인트 추가
app.get('/', (req, res) => {
  res.send({
    status: 'online',
    timestamp: new Date().toISOString(),
    botName: client.user?.tag || 'Valubot',
    guilds: client.guilds.cache.size
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


// 디스코드 클라이언트 생성
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates
  ]
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
]);

client.on('ready', () => {
  console.log(`봇이 준비되었습니다: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.toLowerCase();
  const args = content.split(' ');
  const commandName = args[0];
  
  // 명령어 실행
  const command = commands.get(commandName);
  if (command) {
    try {
      console.log(`명령어 실행: ${commandName}`); // 디버깅용 로그
      await command.execute(message, args.slice(1));
    } catch (error) {
      console.error('명령어 실행 중 오류:', error);
      message.reply('❌ 명령어 실행 중 오류가 발생했습니다.');
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
  console.log(`봇이 준비되었습니다: ${client.user.tag}`);
  
  try {
    // 모든 서버의 설정 로드
    for (const guild of client.guilds.cache.values()) {
      try {
        const settings = await loadGuildSettings(guild.id);
        guildSettings.set(guild.id, settings);
        console.log(`서버 설정 로드 완료: ${guild.name} (${guild.id})`);
      } catch (guildError) {
        console.error(`서버 설정 로드 실패 (${guild.id}):`, guildError);
        // 실패한 서버는 기본 설정 사용
        guildSettings.set(guild.id, { ...DEFAULT_GUILD_SETTINGS });
      }
    }
    
    console.log(`${client.guilds.cache.size}개 서버의 설정 로드 시도 완료`);
    
  } catch (error) {
    console.error('서버 설정 로드 중 오류:', error);
  }
  
  // 봇이 오프라인이어도 작동할 수 있도록 기본 설정 확인
  for (const guild of client.guilds.cache.values()) {
    if (!guildSettings.has(guild.id)) {
      guildSettings.set(guild.id, { ...DEFAULT_GUILD_SETTINGS });
    }
  }

  // Express 서버 시작
  app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
  });
});

// Discord 봇 로그인
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Discord 봇 로그인 실패:', err);
});

// Discord 봇 로그인 위에 추가
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  if (interaction.customId === 'show_random_skins') {
    // 이 부분 전체 삭제
  }
});

// 새로운 자동 핑 코드 추가
setInterval(async () => {
  try {
    // 외부 URL로 직접 핑 요청 보내기
    const pingUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:10000';
    const response = await axios.get(`${pingUrl}/keep-alive`);
    console.log('Keep-alive ping 성공:', response.data);
  } catch (error) {
    console.error('Keep-alive ping 실패:', error.message);
  }
}, 5 * 60 * 1000); // 5분마다 실행 