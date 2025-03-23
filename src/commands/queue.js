import { Collection, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { valorantApi } from '../utils/valorantApi.js';

// 서버별 대기열 저장소 - 클라이언트 객체에 저장하도록 변경
// const waitingQueues = new Map(); // 이 줄 제거

// 서버별 멘션 역할 임시 저장소
const selectedRoles = new Map();

// 테스트 계정 정보 수정
const testAccounts = [
  {
    username: 'TestUser1',
    id: 'test1',
    toString: () => 'TestUser1',
    tag: 'test1',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    bot: false,
    voice: { channel: null },
    roles: new Map(),
    tier: 'Diamond 2'  // 추가: 기본 티어 정보
  },
  {
    username: 'TestUser2',
    id: 'test2',
    toString: () => 'TestUser2',
    tag: 'test2',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png',
    bot: false,
    voice: { channel: null },
    roles: new Map(),
    tier: 'Platinum 1'
  },
  {
    username: 'TestUser3',
    id: 'test3',
    toString: () => 'TestUser3',
    tag: 'test3',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/2.png',
    bot: false,
    voice: { channel: null },
    roles: new Map(),
    tier: 'Gold 3'
  },
  {
    username: 'TestUser4',
    id: 'test4',
    toString: () => 'TestUser4',
    tag: 'test4',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/3.png',
    bot: false,
    voice: { channel: null },
    roles: new Map(),
    tier: 'Ascendant 1'
  },
  {
    username: 'TestUser5',
    id: 'test5',
    toString: () => 'TestUser5',
    tag: 'test5',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/4.png',
    bot: false,
    voice: { channel: null },
    roles: new Map(),
    tier: 'Silver 2'
  },
  {
    username: 'TestUser6',
    id: 'test6',
    toString: () => 'TestUser6',
    tag: 'test6',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/5.png',
    bot: false,
    voice: { channel: null },
    roles: new Map(),
    tier: 'Immortal 1'
  }
];

// 대기열 생성
function createWaitingQueue(guildId, limit, message, isMentionEnabled = false) {
  // 글로벌 맵이 아닌 클라이언트 객체에 저장
  message.client.waitingQueues.set(guildId, {
    limit,
    message,
    participants: [],
    creatorId: message.author.id, // 선착순 생성자 ID
    isMentionEnabled,
    createdAt: Date.now(),
    voiceChannel: null,
    allJoined: false,
    title: message.embeds[0]?.title || ''
  });
  
  // 디버깅용 로그
  console.log(`선착순 생성됨: 서버(${guildId}), 생성자(${message.author.id}), 제목(${message.embeds[0]?.title || '제목 없음'})`);
}

// 대기열 가져오기
function getWaitingQueue(guildId, message) {
  return message.client.waitingQueues.get(guildId);
}

// 대기열 제거
function removeWaitingQueue(guildId, message) {
  message.client.waitingQueues.delete(guildId);
}

export const queueCommand = {
  name: ['ㅂ선착', 'ㅂ선착현황', 'ㅂ선착취소', 'ㅂ테스트참가', 'ㅂ선착멘션'],
  execute: async (message, args) => {
    // 클라이언트에 waitingQueues가 없으면 생성
    if (!message.client.waitingQueues) {
      message.client.waitingQueues = new Map();
    }

    const content = message.content;

    // 테스트 계정 참가 명령어
    if (content === 'ㅂ테스트참가') {
      const queue = getWaitingQueue(message.guild.id, message);
      
      if (!queue) {
        return message.reply('❌ 현재 진행 중인 선착순이 없습니다.');
      }

      // 관리자 권한 체크
      if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ 테스트 계정 추가는 관리자만 가능합니다.');
      }

      // 남은 자리 확인
      const remainingSlots = queue.limit - queue.participants.length;
      if (remainingSlots < 1) {
        return message.reply('❌ 더 이상 참가자를 추가할 수 없습니다.');
      }

      // 아직 참가하지 않은 테스트 계정 찾기
      const availableTestAccounts = testAccounts.filter(
        account => !queue.participants.some(p => p.id === account.id)
      );

      if (availableTestAccounts.length === 0) {
        return message.reply('❌ 더 이상 추가할 수 있는 테스트 계정이 없습니다.');
      }

      // 테스트 계정 추가 (최대 2개까지)
      const accountsToAdd = availableTestAccounts.slice(0, Math.min(2, remainingSlots));
      queue.participants.push(...accountsToAdd);
      
      // 임베드 업데이트
      updateQueueEmbed(queue, message);

      // 성공 메시지 전송
      await message.reply(`✅ 테스트 계정 ${accountsToAdd.length}개가 추가되었습니다: ${accountsToAdd.map(a => a.username).join(', ')}`);

      // 인원이 다 찼고 짝수일 때 내전 시작 확인
      if (queue.participants.length === queue.limit && queue.participants.length >= 2 && queue.participants.length % 2 === 0) {
        // 테스트 계정이 있을 때는 음성 채널 체크를 건너뛰고 바로 내전 시작
        const hasTestAccount = queue.participants.some(p => p.id.startsWith('test'));
        if (hasTestAccount) {
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('queue_start')
                .setLabel('랜덤 팀 구성')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('queue_manual')
                .setLabel('수동 팀 구성')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('queue_cancel')
                .setLabel('취소하기')
                .setStyle(ButtonStyle.Danger)
            );

            const customGameMsg = await message.channel.send({
              content: `${queue.participants.length}인 발로란트 내전을 시작하시겠습니까?\n⚠️ 선착순을 생성한 사용자(${message.author})만 버튼을 클릭할 수 있습니다.`,
              components: [row]
            });

            const buttonCollector = customGameMsg.createMessageComponentCollector({
              filter: i => {
                console.log(`버튼 클릭: 사용자 ID(${i.user.id}), 생성자 ID(${queue.creatorId}), 일치: ${i.user.id === queue.creatorId}`);
                return i.user.id === queue.creatorId;
              },
              time: 60000
            });

            buttonCollector.on('collect', async interaction => {
              if (interaction.customId === 'queue_start') {
                await interaction.deferUpdate();
                try {
                  const { teamA, teamB, tiers } = await organizeCustomGame(queue, message);
                  await createTeamVoiceChannels(
                    message.guild,
                    teamB, // 레드팀
                    teamA  // 블루팀
                  );

                  const teamEmbed = {
                    color: 0xFF4654,
                    title: '🎮 발로란트 내전 팀 구성',
                    fields: [
                      {
                        name: '🔵 아군 팀',
                        value: teamA.map(p => {
                          const tier = tiers.get(p.id)?.tier || 'Unknown';
                          return `${p.username} (${tier})`;
                        }).join('\n'),
                        inline: true
                      },
                      {
                        name: '🔴 적군 팀',
                        value: teamB.map(p => {
                          const tier = tiers.get(p.id)?.tier || 'Unknown';
                          return `${p.username} (${tier})`;
                        }).join('\n'),
                        inline: true
                      }
                    ],
                    footer: { text: '즐거운 게임 되세요! 🎉' }
                  };

                  await message.channel.send({ embeds: [teamEmbed] });
                  await customGameMsg.delete().catch(() => {});
                  removeWaitingQueue(message.guild.id, message);
                } catch (error) {
                  console.error('내전 설정 중 오류:', error);
                  await message.channel.send('❌ 내전 설정 중 오류가 발생했습니다.');
                }
              } else if (interaction.customId === 'queue_manual') {
                try {
                  // 참가자 목록으로 드롭다운 메뉴 생성
                  const participants = queue.participants.map((p, index) => {
                    return {
                      label: p.username.substring(0, 25), // Discord 드롭다운 최대 길이 제한
                      value: index.toString(),
                      description: p.tier ? `티어: ${p.tier}`.substring(0, 50) : '티어 정보 없음'
                    };
                  });

                  // 레드팀 선택 드롭다운
                  const redTeamSelect = new StringSelectMenuBuilder()
                    .setCustomId(`red_team_select_${message.guild.id}`)
                    .setPlaceholder('레드팀에 배정할 플레이어 선택')
                    .setMinValues(Math.floor(queue.participants.length / 2)) // 절반의 플레이어
                    .setMaxValues(Math.floor(queue.participants.length / 2))
                    .addOptions(participants);

                  const selectRow = new ActionRowBuilder().addComponents(redTeamSelect);

                  // 선택 UI 전송
                  await interaction.reply({
                    content: '🎮 레드팀에 배정할 플레이어를 선택하세요. 나머지는 자동으로 블루팀에 배정됩니다.',
                    components: [selectRow],
                    ephemeral: true
                  });
                } catch (error) {
                  console.error('수동 팀 구성 UI 생성 중 오류:', error);
                  await interaction.reply({
                    content: '❌ 수동 팀 구성 처리 중 오류가 발생했습니다.',
                    ephemeral: true
                  });
                }
              } else if (interaction.customId === 'queue_cancel') {
                await customGameMsg.delete().catch(() => {});
              }
            });

            buttonCollector.on('end', collected => {
              if (collected.size === 0) {
                customGameMsg.delete().catch(() => {});
              }
            });
        } else {
          await handleFullQueue(message, queue);
        }
      }
      return;
    }

    // 선착순 현황 확인
    if (content === 'ㅂ선착현황') {
      const queue = getWaitingQueue(message.guild.id, message);
      if (!queue) {
        return message.reply('진행 중인 선착순이 없습니다.');
      }

      const embed = {
        color: 0x0099ff,
        title: '🎮 ' + queue.message.embeds[0].title,
        description: `현재 인원: ${queue.participants.length}/${queue.limit}\n\n참가자:\n${queue.participants.map((p, index) => `${index + 1}. ${p.toString()}`).join('\n') || '아직 참가자가 없습니다.'}`,
        footer: {
          text: '✅ 반응을 눌러 참가하거나 ❌ 반응을 눌러 나갈 수 있습니다.'
        }
      };

      return message.reply({ embeds: [embed] });
    }

    // 선착순 취소
    else if (content === 'ㅂ선착취소') {
      const queue = getWaitingQueue(message.guild.id, message);
      
      if (!queue) {
        return message.reply('❌ 현재 진행 중인 선착순이 없습니다.');
      }

      // 권한 체크 수정
      const isServerOwner = message.guild.ownerId === message.author.id;  // 서버 소유자 체크
      const isAdmin = message.member.permissions.has('Administrator');     // 관리자 권한 체크
      const isCreator = queue.creatorId === message.author.id;           // 선착순 생성자 체크
      const isFirstParticipant = queue.participants.length > 0 && queue.participants[0].id === message.author.id;  // 첫 참가자 체크

      // 서버 소유자이거나 관리자이거나 생성자이거나 첫 참가자인 경우 취소 가능
      if (!isServerOwner && !isAdmin && !isCreator && !isFirstParticipant) {
        return message.reply('❌ 선착순 취소는 서버 소유자, 관리자, 생성자, 또는 첫 번째 참가자만 가능합니다.');
      }

      removeWaitingQueue(message.guild.id, message);
      return message.reply('✅ 선착순이 취소되었습니다.');
    }

    // 선착순 멘션
    else if (content === 'ㅂ선착멘션') {
      const queue = getWaitingQueue(message.guild.id, message);
      if (!queue) {
        return message.reply('❌ 진행 중인 선착순이 없습니다.');
      }
      
      if (queue.participants.length === 0) {
        return message.reply('❌ 현재 참가자가 없습니다.');
      }
      
      // 권한 체크 - 선착순 생성자나 관리자만 사용 가능
      const isAdmin = message.member.permissions.has('Administrator');
      const isCreator = queue.creatorId === message.author.id;
      
      if (!isAdmin && !isCreator) {
        return message.reply('❌ 선착순 멘션은 선착순 생성자나 관리자만 사용할 수 있습니다.');
      }
      
      // 참가자 멘션 생성
      const mentions = queue.participants.map(p => p.toString()).join(' ');
      
      // 제목과 참가자 수를 포함한 메시지 생성
      const title = queue.message.embeds[0].title || '선착순';
      
      await message.channel.send({
        content: `📢 **${title}** 참가자 전체 멘션 (${queue.participants.length}명)\n${mentions}`,
        allowedMentions: { users: queue.participants.map(p => p.id) }
      });
      
      return;
    }

    // 선착순 생성
    else {
      const args = content.split(' ');
      const limit = parseInt(args[1]);

      // 인원수 체크 (2~10명)
      if (!args[1] || isNaN(limit) || limit < 2 || limit > 101) {
        return message.reply('사용법: ㅂ선착 [인원수] [제목] [유저멘션여부]\n예시: ㅂ선착 10 발로란트내전 O\n(인원수는 2~101명까지 가능합니다)');
      }

      // 마지막 인자가 멘션 옵션인지 확인
      const mentionOption = args[args.length - 1].toUpperCase();
      const isMentionEnabled = mentionOption === 'O' || mentionOption === 'o';
      
      // 제목에서 멘션 옵션 제외
      const title = args.slice(2, mentionOption === 'O' || mentionOption === 'o' || mentionOption === 'X' ? -1 : undefined).join(' ');
      
      if (!title) {
        return message.reply('사용법: ㅂ선착 [인원수] [제목] [유저멘션여부]\n예시: ㅂ선착 10 발로란트내전 O');
      }

      // 이미 진행 중인 선착순이 있는지 확인
      if (getWaitingQueue(message.guild.id, message)) {
        return message.reply('이미 진행 중인 선착순이 있습니다.');
      }

      // 멘션이 활성화된 경우 역할 선택 메뉴 표시
      if (isMentionEnabled) {
        const roles = message.guild.roles.cache
          .filter(role => 
            role.name !== '@everyone' && 
            role.name !== '@here' &&
            !role.managed
          )
          .sort((a, b) => b.position - a.position)
          .first(25); // Discord는 최대 25개 옵션만 허용

        if (roles.size === 0) {
          return message.reply('❌ 멘션할 수 있는 역할이 없습니다.');
        }

        const row = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('role_select')
              .setPlaceholder('멘션할 역할을 선택하세요')
              .addOptions(
                roles.map(role => ({
                  label: role.name,
                  value: role.id,
                  description: `멤버 수: ${role.members.size}명`
                }))
              )
          );

        const selectMsg = await message.reply({
          content: '멘션할 역할을 선택해주세요 (30초 안에 선택)',
          components: [row]
        });

        try {
          const collector = selectMsg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id,
            time: 30000,
            max: 1
          });

          collector.on('collect', async interaction => {
            const roleId = interaction.values[0];
            await interaction.deferUpdate();
            await selectMsg.delete().catch(() => {});
            
            // 선택된 역할로 선착순 시작
            await handleQueueCreation(message, title, limit, true, roleId);
          });

          collector.on('end', async collected => {
            if (collected.size === 0) {
              await selectMsg.edit({
                content: '❌ 시간이 초과되었습니다. 다시 시도해주세요.',
                components: []
              });
              setTimeout(() => selectMsg.delete().catch(() => {}), 5000);
            }
          });
        } catch (error) {
          console.error('역할 선택 처리 중 오류:', error);
          await message.reply('❌ 역할 선택 중 오류가 발생했습니다.');
        }
      } else {
        // 멘션 없이 바로 선착순 시작 (10명 고정)
        await handleQueueCreation(message, title, limit, false);
      }
    }

    // client에 waitingQueues 저장 추가
    message.client.waitingQueues = message.client.waitingQueues;
  }
};

// 선착순 시작 함수
async function handleQueueCreation(message, title, limit, isMentionEnabled, roleId = null) {
  try {
    // 멘션이 활성화된 경우 역할 멘션 메시지 전송
    if (isMentionEnabled && roleId) {
      await message.channel.send(`<@&${roleId}>`);
    }

    const embed = {
      color: 0x0099ff,
      title: title || `${limit}인 선착순 모집 중!`,
      description: `현재 인원: 0/${limit}\n\n참가자:\n아직 참가자가 없습니다.`,
      footer: {
        text: '✅ 반응을 눌러 참가하거나 ❌ 반응을 눌러 나갈 수 있습니다.'
      }
    };

    const queueMessage = await message.channel.send({ embeds: [embed] });
    await queueMessage.react('✅');
    await queueMessage.react('❌');

    // 선착순 생성 및 생성자 자동 참가
    createWaitingQueue(message.guild.id, limit, queueMessage, isMentionEnabled);
    
    // 중요: 이 시점에서 큐를 다시 가져옵니다
    const queue = getWaitingQueue(message.guild.id, message);
    
    // 명시적으로 creatorId 설정 (중요)
    if (queue) {
      queue.creatorId = message.author.id;
      console.log(`선착순 생성자 ID 확인: ${queue.creatorId}`);
    }
    
    queue.participants.push(message.author);
    updateQueueEmbed(queue, message);

    // 반응 수집기 생성
    const filter = (reaction, user) => {
      return ['✅', '❌'].includes(reaction.emoji.name) && !user.bot;
    };

    const collector = queueMessage.createReactionCollector({ filter, time: 86400000 }); // 24시간 동안 유지

    collector.on('collect', async (reaction, user) => {
      try {
        const queue = getWaitingQueue(message.guild.id, message);
        if (!queue) return;

        if (reaction.emoji.name === '✅') {
          await reaction.users.remove(user);

          // 이미 참가한 사용자인지 확인
          if (queue.participants.some(p => p.id === user.id)) {
            return;
          }

          // 인원 수 제한 확인
          if (queue.participants.length >= queue.limit) {
            return;
          }

          queue.participants.push(user);
          updateQueueEmbed(queue, message);

          // 인원이 다 찼을 때
          if (queue.participants.length === queue.limit && queue.participants.length >= 2 && queue.participants.length % 2 === 0) {
            // 테스트 계정 포함 여부 확인
            const hasTestAccount = queue.participants.some(p => p.id.startsWith('test'));
            
            if (hasTestAccount) {
              // 테스트 계정이 있는 경우 음성 채널 체크 건너뛰기
              const row = new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId('queue_start')
                    .setLabel('랜덤 팀 구성')
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId('queue_manual')
                    .setLabel('수동 팀 구성')
                    .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                    .setCustomId('queue_cancel')
                    .setLabel('취소하기')
                    .setStyle(ButtonStyle.Danger)
                );

                const customGameMsg = await message.channel.send({
                  content: `${queue.participants.length}인 발로란트 내전을 시작하시겠습니까?\n⚠️ 선착순을 생성한 사용자(${message.author})만 버튼을 클릭할 수 있습니다.`,
                  components: [row]
                });

                const buttonCollector = customGameMsg.createMessageComponentCollector({
                  filter: i => {
                    console.log(`버튼 클릭: 사용자 ID(${i.user.id}), 생성자 ID(${queue.creatorId}), 일치: ${i.user.id === queue.creatorId}`);
                    return i.user.id === queue.creatorId;
                  },
                  time: 60000
                });

                buttonCollector.on('collect', async interaction => {
                  if (interaction.customId === 'queue_start') {
                    await interaction.deferUpdate();
                    try {
                      const { teamA, teamB, tiers } = await organizeCustomGame(queue, message);
                      await createTeamVoiceChannels(
                        message.guild,
                        teamB, // 레드팀
                        teamA  // 블루팀
                      );

                      const teamEmbed = {
                        color: 0xFF4654,
                        title: '🎮 발로란트 내전 팀 구성',
                        fields: [
                          {
                            name: '🔵 아군 팀',
                            value: teamA.map(p => {
                              const tier = tiers.get(p.id)?.tier || 'Unknown';
                              return `${p.username} (${tier})`;
                            }).join('\n'),
                            inline: true
                          },
                          {
                            name: '🔴 적군 팀',
                            value: teamB.map(p => {
                              const tier = tiers.get(p.id)?.tier || 'Unknown';
                              return `${p.username} (${tier})`;
                            }).join('\n'),
                            inline: true
                          }
                        ],
                        footer: { text: '즐거운 게임 되세요! 🎉' }
                      };

                      await message.channel.send({ embeds: [teamEmbed] });
                      await customGameMsg.delete().catch(() => {});
                      removeWaitingQueue(message.guild.id, message);
                    } catch (error) {
                      console.error('내전 설정 중 오류:', error);
                      await message.channel.send('❌ 내전 설정 중 오류가 발생했습니다.');
                    }
                  } else if (interaction.customId === 'queue_manual') {
                    try {
                      // 참가자 목록으로 드롭다운 메뉴 생성
                      const participants = queue.participants.map((p, index) => {
                        return {
                          label: p.username.substring(0, 25), // Discord 드롭다운 최대 길이 제한
                          value: index.toString(),
                          description: p.tier ? `티어: ${p.tier}`.substring(0, 50) : '티어 정보 없음'
                        };
                      });

                      // 레드팀 선택 드롭다운
                      const redTeamSelect = new StringSelectMenuBuilder()
                        .setCustomId(`red_team_select_${message.guild.id}`)
                        .setPlaceholder('레드팀에 배정할 플레이어 선택')
                        .setMinValues(Math.floor(queue.participants.length / 2)) // 절반의 플레이어
                        .setMaxValues(Math.floor(queue.participants.length / 2))
                        .addOptions(participants);

                      const selectRow = new ActionRowBuilder().addComponents(redTeamSelect);

                      // 선택 UI 전송
                      await interaction.reply({
                        content: '🎮 레드팀에 배정할 플레이어를 선택하세요. 나머지는 자동으로 블루팀에 배정됩니다.',
                        components: [selectRow],
                        ephemeral: true
                      });
                    } catch (error) {
                      console.error('수동 팀 구성 UI 생성 중 오류:', error);
                      await interaction.reply({
                        content: '❌ 수동 팀 구성 처리 중 오류가 발생했습니다.',
                        ephemeral: true
                      });
                    }
                  } else if (interaction.customId === 'queue_cancel') {
                    await customGameMsg.delete().catch(() => {});
                  }
                });

                buttonCollector.on('end', collected => {
                  if (collected.size === 0) {
                    customGameMsg.delete().catch(() => {});
                  }
                });
            } else {
              // 일반적인 경우 음성 채널 체크 포함
              const row = new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId('queue_start')
                    .setLabel('랜덤 팀 구성')
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId('queue_manual')
                    .setLabel('수동 팀 구성')
                    .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                    .setCustomId('queue_cancel')
                    .setLabel('취소하기')
                    .setStyle(ButtonStyle.Danger)
                );

                const customGameMsg = await message.channel.send({
                  content: `${queue.participants.length}인 발로란트 내전을 시작하시겠습니까?\n⚠️ 선착순을 생성한 사용자(${message.author})만 버튼을 클릭할 수 있습니다.`,
                  components: [row]
                });

                const buttonCollector = customGameMsg.createMessageComponentCollector({
                  filter: i => {
                    console.log(`버튼 클릭: 사용자 ID(${i.user.id}), 생성자 ID(${queue.creatorId}), 일치: ${i.user.id === queue.creatorId}`);
                    return i.user.id === queue.creatorId;
                  },
                  time: 60000
                });

                buttonCollector.on('collect', async interaction => {
                  if (interaction.customId === 'queue_start') {
                    await interaction.deferUpdate();
                    try {
                      const { teamA, teamB, tiers } = await organizeCustomGame(queue, message);
                      await createTeamVoiceChannels(
                        message.guild,
                        teamB, // 레드팀
                        teamA  // 블루팀
                      );

                      const teamEmbed = {
                        color: 0xFF4654,
                        title: '🎮 발로란트 내전 팀 구성',
                        fields: [
                          {
                            name: '🔵 아군 팀',
                            value: teamA.map(p => {
                              const tier = tiers.get(p.id)?.tier || 'Unknown';
                              return `${p.username} (${tier})`;
                            }).join('\n'),
                            inline: true
                          },
                          {
                            name: '🔴 적군 팀',
                            value: teamB.map(p => {
                              const tier = tiers.get(p.id)?.tier || 'Unknown';
                              return `${p.username} (${tier})`;
                            }).join('\n'),
                            inline: true
                          }
                        ],
                        footer: { text: '즐거운 게임 되세요! 🎉' }
                      };

                      await message.channel.send({ embeds: [teamEmbed] });
                      await customGameMsg.delete().catch(() => {});
                      removeWaitingQueue(message.guild.id, message);
                    } catch (error) {
                      console.error('내전 설정 중 오류:', error);
                      await message.channel.send('❌ 내전 설정 중 오류가 발생했습니다.');
                    }
                  } else if (interaction.customId === 'queue_manual') {
                    try {
                      // 참가자 목록으로 드롭다운 메뉴 생성
                      const participants = queue.participants.map((p, index) => {
                        return {
                          label: p.username.substring(0, 25), // Discord 드롭다운 최대 길이 제한
                          value: index.toString(),
                          description: p.tier ? `티어: ${p.tier}`.substring(0, 50) : '티어 정보 없음'
                        };
                      });

                      // 레드팀 선택 드롭다운
                      const redTeamSelect = new StringSelectMenuBuilder()
                        .setCustomId(`red_team_select_${message.guild.id}`)
                        .setPlaceholder('레드팀에 배정할 플레이어 선택')
                        .setMinValues(Math.floor(queue.participants.length / 2)) // 절반의 플레이어
                        .setMaxValues(Math.floor(queue.participants.length / 2))
                        .addOptions(participants);

                      const selectRow = new ActionRowBuilder().addComponents(redTeamSelect);

                      // 선택 UI 전송
                      await interaction.reply({
                        content: '🎮 레드팀에 배정할 플레이어를 선택하세요. 나머지는 자동으로 블루팀에 배정됩니다.',
                        components: [selectRow],
                        ephemeral: true
                      });
                    } catch (error) {
                      console.error('수동 팀 구성 UI 생성 중 오류:', error);
                      await interaction.reply({
                        content: '❌ 수동 팀 구성 처리 중 오류가 발생했습니다.',
                        ephemeral: true
                      });
                    }
                  } else if (interaction.customId === 'queue_cancel') {
                    await customGameMsg.delete().catch(() => {});
                  }
                });

                buttonCollector.on('end', collected => {
                  if (collected.size === 0) {
                    customGameMsg.delete().catch(() => {});
                  }
                });
            }
          }
        } else if (reaction.emoji.name === '❌') {
          await reaction.users.remove(user);
          const index = queue.participants.findIndex(p => p.id === user.id);
          if (index !== -1) {
            queue.participants.splice(index, 1);
            updateQueueEmbed(queue, message);
          }
        }
      } catch (error) {
        console.error('반응 처리 중 오류:', error);
      }
    });
  } catch (error) {
    console.error('선착순 생성 중 오류:', error);
    message.reply('❌ 선착순 생성 중 오류가 발생했습니다.');
  }
}

// 인원이 다 찼을 때 처리하는 함수
async function handleFullQueue(message, queue) {
  try {
    // 모든 참가자가 음성 채널에 있는지 확인
    const voiceMembers = message.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildVoice)
      .flatMap(c => Array.from(c.members.values()))
      .map(m => m.id);

    const allInVoice = queue.participants.every(p => voiceMembers.includes(p.id));

    if (allInVoice) {
      queue.allJoined = true;
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('queue_start')
            .setLabel('랜덤 팀 구성')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('queue_manual')
            .setLabel('수동 팀 구성')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('queue_cancel')
            .setLabel('취소하기')
            .setStyle(ButtonStyle.Danger)
        );

        const customGameMsg = await message.channel.send({
          content: `${queue.participants.length}인 발로란트 내전을 시작하시겠습니까?\n⚠️ 선착순을 생성한 사용자(${message.author})만 버튼을 클릭할 수 있습니다.`,
          components: [row]
        });

        const buttonCollector = customGameMsg.createMessageComponentCollector({
          filter: i => {
            console.log(`버튼 클릭: 사용자 ID(${i.user.id}), 생성자 ID(${queue.creatorId}), 일치: ${i.user.id === queue.creatorId}`);
            return i.user.id === queue.creatorId;
          },
          time: 60000
        });

        buttonCollector.on('collect', async interaction => {
          if (interaction.customId === 'queue_start') {
            await interaction.deferUpdate();
            try {
              const { teamA, teamB, tiers } = await organizeCustomGame(queue, message);
              await createTeamVoiceChannels(
                message.guild,
                teamB, // 레드팀
                teamA  // 블루팀
              );

              const teamEmbed = {
                color: 0xFF4654,
                title: '🎮 발로란트 내전 팀 구성',
                fields: [
                  {
                    name: '🔵 아군 팀',
                    value: teamA.map(p => {
                      const tier = tiers.get(p.id)?.tier || 'Unknown';
                      return `${p.username} (${tier})`;
                    }).join('\n'),
                    inline: true
                  },
                  {
                    name: '🔴 적군 팀',
                    value: teamB.map(p => {
                      const tier = tiers.get(p.id)?.tier || 'Unknown';
                      return `${p.username} (${tier})`;
                    }).join('\n'),
                    inline: true
                  }
                ],
                footer: { text: '즐거운 게임 되세요! 🎉' }
              };

              await message.channel.send({ embeds: [teamEmbed] });
              await customGameMsg.delete().catch(() => {});
              removeWaitingQueue(message.guild.id, message);
            } catch (error) {
              console.error('내전 설정 중 오류:', error);
              await message.channel.send('❌ 내전 설정 중 오류가 발생했습니다.');
            }
          } else if (interaction.customId === 'queue_manual') {
            try {
              // 참가자 목록으로 드롭다운 메뉴 생성
              const participants = queue.participants.map((p, index) => {
                return {
                  label: p.username.substring(0, 25), // Discord 드롭다운 최대 길이 제한
                  value: index.toString(),
                  description: p.tier ? `티어: ${p.tier}`.substring(0, 50) : '티어 정보 없음'
                };
              });

              // 레드팀 선택 드롭다운
              const redTeamSelect = new StringSelectMenuBuilder()
                .setCustomId(`red_team_select_${message.guild.id}`)
                .setPlaceholder('레드팀에 배정할 플레이어 선택')
                .setMinValues(Math.floor(queue.participants.length / 2)) // 절반의 플레이어
                .setMaxValues(Math.floor(queue.participants.length / 2))
                .addOptions(participants);

              const selectRow = new ActionRowBuilder().addComponents(redTeamSelect);

              // 선택 UI 전송
              await interaction.reply({
                content: '🎮 레드팀에 배정할 플레이어를 선택하세요. 나머지는 자동으로 블루팀에 배정됩니다.',
                components: [selectRow],
                ephemeral: true
              });
            } catch (error) {
              console.error('수동 팀 구성 UI 생성 중 오류:', error);
              await interaction.reply({
                content: '❌ 수동 팀 구성 처리 중 오류가 발생했습니다.',
                ephemeral: true
              });
            }
          } else if (interaction.customId === 'queue_cancel') {
            await customGameMsg.delete().catch(() => {});
          }
        });

        buttonCollector.on('end', collected => {
          if (collected.size === 0) {
            customGameMsg.delete().catch(() => {});
          }
        });
    }
  } catch (error) {
    console.error('대기열 처리 중 오류:', error);
  }
}

// 대기열 임베드 업데이트
function updateQueueEmbed(queue, message) {
  const participantsList = queue.participants.map((p, index) => 
    `${index + 1}. ${queue.isMentionEnabled ? p.toString() : p.username}`
  ).join('\n');

  const embed = {
    color: 0x0099ff,
    title: queue.message.embeds[0].title,
    description: queue.limit >= 2 && queue.limit % 2 === 0 ? 
      `현재 인원: ${queue.participants.length}/${queue.limit}\n\n참가자:\n${participantsList || '아직 참가자가 없습니다.'}` :
      `현재 인원: ${queue.participants.length}/${queue.limit}\n\n참가자:\n${participantsList || '아직 참가자가 없습니다.'}`,
    footer: {
      text: '✅ 반응을 눌러 참가하거나 ❌ 반응을 눌러 나갈 수 있습니다.'
    }
  };

  queue.message.edit({ embeds: [embed] });

  // 참가자가 0명이 되면 자동으로 선착순 취소
  if (queue.participants.length === 0) {
    const cancelEmbed = {
      color: 0xFF0000,
      title: queue.message.embeds[0].title,
      description: '❌ 참가자가 없어 선착순이 자동으로 취소되었습니다.',
      footer: {
        text: '새로운 선착순을 시작하려면 ㅂ선착 명령어를 사용하세요.'
      },
      timestamp: new Date()
    };

    queue.message.edit({ embeds: [cancelEmbed] });
    removeWaitingQueue(queue.message.guild.id, message);
  }
}

// 내전 팀 분배 함수
async function organizeCustomGame(queue, message) {
  const participants = queue.participants;
  const tiers = new Map();
  
  // 참가자들의 티어 정보 가져오기
  for (const participant of participants) {
    // 테스트 계정인 경우 미리 설정된 티어 사용
    if (participant.id.startsWith('test')) {
      const testAccount = testAccounts.find(a => a.id === participant.id);
      tiers.set(participant.id, {
        tier: testAccount.tier,
        rank: 50  // 기본 랭크 점수
      });
      continue;
    }

    const docRef = doc(db, 'valorant_accounts', message.guild.id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists() && docSnap.data()[participant.id]) {
      const userData = docSnap.data()[participant.id];
      try {
        const mmrData = await valorantApi.getMMR(userData.region, userData.puuid);
        tiers.set(participant.id, {
          tier: mmrData.current_data.currenttierpatched,
          rank: mmrData.current_data.ranking_in_tier
        });
      } catch (error) {
        console.error(`티어 정보 가져오기 실패 (${participant.username}):`, error);
        tiers.set(participant.id, { tier: 'Unknown', rank: 0 });
      }
    } else {
      tiers.set(participant.id, { tier: 'Unknown', rank: 0 });
    }
  }

  // 티어 점수 계산 (예: Iron 1 = 1, Bronze 1 = 4, Silver 1 = 7, ...)
  function calculateTierScore(tier, rank) {
    const tierScores = {
      'Iron': 1,
      'Bronze': 4,
      'Silver': 7,
      'Gold': 10,
      'Platinum': 13,
      'Diamond': 16,
      'Ascendant': 19,
      'Immortal': 22,
      'Radiant': 25
    };

    if (tier === 'Unknown') return 0;
    const baseTier = tier.split(' ')[0];
    const tierNumber = parseInt(tier.split(' ')[1]) || 1;
    return (tierScores[baseTier] || 0) + tierNumber - 1 + (rank / 100);
  }

  // 참가자들을 티어 점수로 정렬
  const sortedParticipants = [...participants].sort((a, b) => {
    const scoreA = calculateTierScore(tiers.get(a.id).tier, tiers.get(a.id).rank);
    const scoreB = calculateTierScore(tiers.get(b.id).tier, tiers.get(b.id).rank);
    return scoreB - scoreA;
  });

  // 팀 분배 (지퍼 방식: 1,10,2,9,3,8,4,7,5,6)
  const teamA = [];
  const teamB = [];
  sortedParticipants.forEach((participant, index) => {
    if (index % 4 === 0 || index % 4 === 3) {
      teamA.push(participant);
    } else {
      teamB.push(participant);
    }
  });

  return { teamA, teamB, tiers };
}

// 음성 채널 생성 및 이동 함수 수정
export async function createTeamVoiceChannels(guild, redTeam, blueTeam) {
  try {
    // 발로란트 카테고리 찾기
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('발로란트'));
    
    // 블루팀과 레드팀 채널 생성
    const blueChannel = await guild.channels.create({
      name: '🔵 블루팀',
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: Math.ceil(blueTeam.length)
    });

    const redChannel = await guild.channels.create({
      name: '🔴 레드팀',
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: Math.ceil(redTeam.length)
    });

    // 참가자들을 팀별 채널로 이동
    for (const participant of [...blueTeam, ...redTeam]) {
      // 테스트 계정은 건너뛰기
      if (participant.id.startsWith('test')) continue;

      try {
        const member = await guild.members.fetch(participant.id);
        if (member.voice.channel) {
          // 팀에 따라 적절한 채널로 이동
          const targetChannel = blueTeam.some(p => p.id === participant.id) ? blueChannel : redChannel;
          await member.voice.setChannel(targetChannel);
        }
      } catch (error) {
        console.error(`멤버 이동 실패 (${participant.username}):`, error);
      }
    }

    // 음성 채널 비었을 때 자동 삭제를 위한 이벤트 리스너 설정
    const checkAndDeleteChannel = async (channel) => {
      if (channel.members.size === 0) {
        try {
          await channel.delete();
          console.log(`빈 음성 채널 삭제됨: ${channel.name}`);
        } catch (error) {
          console.error('채널 삭제 중 오류:', error);
        }
      }
    };

    // 각 채널에 대한 이벤트 리스너 설정
    const voiceStateHandler = async (oldState, newState) => {
      // 블루팀 채널 체크
      if (oldState.channel?.id === blueChannel.id) {
        await checkAndDeleteChannel(blueChannel);
      }
      // 레드팀 채널 체크
      if (oldState.channel?.id === redChannel.id) {
        await checkAndDeleteChannel(redChannel);
      }
    };

    // 이벤트 리스너 등록
    guild.client.on('voiceStateUpdate', voiceStateHandler);

    // 30분 후에 이벤트 리스너 제거 (메모리 누수 방지)
    setTimeout(() => {
      guild.client.removeListener('voiceStateUpdate', voiceStateHandler);
      // 채널이 아직 존재하면 삭제
      if (guild.channels.cache.has(blueChannel.id)) {
        blueChannel.delete().catch(() => {});
      }
      if (guild.channels.cache.has(redChannel.id)) {
        redChannel.delete().catch(() => {});
      }
    }, 30 * 60 * 1000); // 30분

    return { blueChannel, redChannel };
  } catch (error) {
    console.error('음성 채널 생성/이동 중 오류:', error);
    throw error;
  }
} 