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
  const uptime = process.uptime();
  const uptimeFormatted = `${Math.floor(uptime / 86400)}일 ${Math.floor((uptime % 86400) / 3600)}시간 ${Math.floor((uptime % 3600) / 60)}분`;
  
  res.json({
    status: 'online',
    uptime: uptimeFormatted,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
    },
    guilds: client.guilds.cache.size,
    lastPing: new Date().toISOString()
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
  // 사용자가 팀 선택 및 확인 버튼을 눌렀을 때 권한 확인
  if ((interaction.isStringSelectMenu() || interaction.isButton()) && 
      (interaction.customId.startsWith('red_team_select_') || 
       interaction.customId.startsWith('confirm_teams_') ||
       interaction.customId.startsWith('cancel_teams_'))) {
    
    const guildId = interaction.customId.split('_').pop();
    const queue = client.waitingQueues?.get(guildId);
    
    console.log(`팀 선택 인터랙션: 사용자 ID(${interaction.user.id}), 큐 존재: ${!!queue}, 생성자 ID: ${queue?.creatorId}`);
    
    // 큐가 없거나 생성자가 아닌 경우
    if (!queue || interaction.user.id !== queue.creatorId) {
      try {
        return await interaction.reply({
          content: '❌ 선착순을 생성한 사용자만 팀 구성을 진행할 수 있습니다.',
          ephemeral: true
        });
      } catch (error) {
        // 이미 응답된 경우 무시
        console.error('인터랙션 응답 중 오류:', error);
      }
    }
  }
  
  // StringSelectMenu 이벤트 처리 (레드팀 선택)
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('red_team_select_')) {
    try {
      const guildId = interaction.customId.split('_').pop();
      const queue = client.waitingQueues?.get(guildId);
      
      if (!queue) {
        return interaction.reply({ 
          content: '❌ 선착순이 종료되었거나 찾을 수 없습니다.', 
          ephemeral: true 
        });
      }
      
      // 선택된 인덱스로 레드팀 구성
      const redTeamIndices = interaction.values.map(value => parseInt(value));
      const redTeam = redTeamIndices.map(idx => queue.participants[idx]);
      
      // 블루팀은 레드팀에 선택되지 않은 플레이어들
      const blueTeam = queue.participants.filter((_, idx) => !redTeamIndices.includes(idx));
      
      // 팀 확인 임베드 생성
      const teamEmbed = {
        color: 0xFF4654,
        title: '🎮 수동 팀 구성 확인',
        fields: [
          {
            name: '🔵 블루팀',
            value: blueTeam.map(p => p.username).join('\n'),
            inline: true
          },
          {
            name: '🔴 레드팀',
            value: redTeam.map(p => p.username).join('\n'),
            inline: true
          }
        ]
      };
      
      // 확인 버튼 생성
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_teams_${guildId}`)
            .setLabel('팀 구성 확정')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`cancel_teams_${guildId}`)
            .setLabel('취소')
            .setStyle(ButtonStyle.Danger)
        );
      
      // 임시로 팀 정보 저장
      queue.tempTeams = { redTeam, blueTeam };
      
      // 확인 UI 전송
      await interaction.update({
        content: '아래 팀 구성을 확인하고 진행하세요:',
        embeds: [teamEmbed],
        components: [confirmRow]
      });
    } catch (error) {
      console.error('팀 선택 처리 중 오류:', error);
      await interaction.reply({ 
        content: '❌ 팀 구성 중 오류가 발생했습니다.', 
        ephemeral: true 
      });
    }
  }
  
  // 팀 확정 버튼 처리
  if (interaction.isButton() && interaction.customId.startsWith('confirm_teams_')) {
    try {
      // 중복 클릭 방지를 위해 버튼 비활성화
      const disabledRow = ActionRowBuilder.from(interaction.message.components[0])
        .setComponents(
          interaction.message.components[0].components.map(component => {
            const button = ButtonBuilder.from(component);
            return button.setDisabled(true);
          })
        );
      
      // 즉시 UI 업데이트하여 버튼 비활성화
      await interaction.update({
        content: '🔧 팀 구성 중...',
        components: [disabledRow]
      });
      
      const guildId = interaction.customId.split('_').pop();
      const queue = client.waitingQueues?.get(guildId);
      
      if (!queue || !queue.tempTeams) {
        return interaction.editReply({ 
          content: '❌ 선착순이 종료되었거나 팀 정보를 찾을 수 없습니다.'
        });
      }
      
      const { redTeam, blueTeam } = queue.tempTeams;
      
      // 팀 정보 임베드
      const teamEmbed = {
        color: 0xFF4654,
        title: '🎮 발로란트 내전 팀 구성 (수동)',
        fields: [
          {
            name: '🔵 블루팀',
            value: blueTeam.map(p => p.username).join('\n'),
            inline: true
          },
          {
            name: '🔴 레드팀',
            value: redTeam.map(p => p.username).join('\n'),
            inline: true
          }
        ],
        footer: { text: '즐거운 게임 되세요! 🎉' }
      };
      
      // 채널 생성 및 이동
      const guild = interaction.guild;
      await createTeamVoiceChannels(guild, redTeam, blueTeam);
      
      // 팀 구성 메시지 전송
      await interaction.message.channel.send({ embeds: [teamEmbed] });
      
      // 인터랙션 응답 완료
      await interaction.editReply({
        content: '✅ 팀이 구성되었습니다!',
        embeds: [],
        components: []
      });
      
      // 대기열 초기화
      client.waitingQueues.delete(guildId);
    } catch (error) {
      console.error('팀 구성 확정 중 오류:', error);
      await interaction.editReply({ 
        content: '❌ 팀 확정 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 취소 버튼도 중복 클릭 방지
  if (interaction.isButton() && interaction.customId.startsWith('cancel_teams_')) {
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0])
      .setComponents(
        interaction.message.components[0].components.map(component => {
          const button = ButtonBuilder.from(component);
          return button.setDisabled(true);
        })
      );
    
    await interaction.update({
      content: '❌ 팀 구성이 취소되었습니다.',
      embeds: [],
      components: [disabledRow]
    });
    
    // 3초 후 버튼 제거
    setTimeout(async () => {
      try {
        await interaction.editReply({
          content: '❌ 팀 구성이 취소되었습니다.',
          embeds: [],
          components: []
        });
      } catch (error) {
        console.error('메시지 업데이트 실패:', error);
      }
    }, 3000);
  }
});

// 자동 핑 코드 - CloudType용으로 수정
setInterval(async () => {
  try {
    // 자체 서버에 핑 요청 보내기
    const response = await axios.get(`http://localhost:${PORT}/keep-alive`);
    console.log('Keep-alive ping 성공:', response.data);
    
    // 외부 URL 핑
    if (process.env.CLOUDTYPE_URL) {
      const externalResponse = await axios.get(`${process.env.CLOUDTYPE_URL}/keep-alive`);
      console.log('외부 ping 성공:', externalResponse.data);
    }
  } catch (error) {
    console.error('Keep-alive ping 실패:', error.message);
  }
}, 2 * 60 * 1000); // 2분마다 실행 