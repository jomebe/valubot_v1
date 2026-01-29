/**
 * 로그인 명령어 (ㅂ로그인)
 * QR 코드를 통한 Riot 계정 로그인
 * 
 * ⚠️ 경고: 개인 학습/연구 목적으로만 사용
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { 
  createQRLoginSession, 
  pollQRLoginStatus, 
  loginWithCookie,
  getUserSession,
  logoutUser 
} from '../services/riotAuth.js';

// QR 폴링 인터벌 저장
const pollingIntervals = new Map();

/**
 * 로그인 명령어 처리
 */
export async function loginCommand(message) {
  const userId = message.author.id;

  try {
    // 이미 로그인된 경우
    const existingSession = getUserSession(userId);
    if (existingSession) {
      const embed = new EmbedBuilder()
        .setColor(0xFD4554)
        .setTitle('⚠️ 이미 로그인됨')
        .setDescription(`**${existingSession.playerName}**으로 이미 로그인되어 있습니다.\n\n로그아웃하려면 \`ㅂ로그아웃\`을 사용하세요.`)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 채널에 안내 메시지
    const channelEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('📱 로그인 안내')
      .setDescription('DM으로 QR 코드를 전송했습니다!\n개인정보 보호를 위해 DM에서 진행됩니다.')
      .setFooter({ text: '이 메시지는 본인만 볼 수 있습니다.' });

    await message.reply({ embeds: [channelEmbed] });

    // QR 세션 생성
    const qrSession = await createQRLoginSession(userId);
    
    if (!qrSession.success) {
      throw new Error('QR 세션 생성에 실패했습니다.');
    }

    // DM으로 QR 코드 전송
    try {
      const dmChannel = await message.author.createDM();
      
      const qrEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📱 라이엇 모바일로 로그인')
        .setDescription(
          '**발로봇에 로그인하려면 QR 코드를 스캔해주세요.**\n' +
          '또는 아래의 버튼을 눌러 로그인해주세요.\n\n' +
          '로그인하려면 라이엇 모바일 앱이 필요합니다.'
        )
        .addFields(
          { name: '⏱️ 유효 시간', value: '5분', inline: true },
          { name: '📍 상태', value: '대기 중...', inline: true }
        )
        .setFooter({ text: '⚠️ QR 코드를 다른 사람과 공유하지 마세요!' })
        .setTimestamp();

      // QR 코드 이미지 생성 (QR API 사용)
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrSession.qrUrl)}`;
      qrEmbed.setImage(qrImageUrl);

      // 버튼 생성
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('📱 모바일에서 열기')
            .setURL(qrSession.qrUrl)
            .setEmoji('🔗'),
          new ButtonBuilder()
            .setCustomId(`login_cancel_${userId}`)
            .setStyle(ButtonStyle.Danger)
            .setLabel('취소')
            .setEmoji('❌')
        );

      const dmMessage = await dmChannel.send({ 
        embeds: [qrEmbed],
        components: [row]
      });

      // 폴링 시작
      startPolling(userId, dmMessage, message);

    } catch (dmError) {
      // DM 전송 실패 (DM 차단된 경우)
      console.error('DM 전송 실패:', dmError);
      
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ DM 전송 실패')
        .setDescription('DM을 보낼 수 없습니다.\n\n서버 설정에서 **DM 허용**을 확인해주세요.')
        .setFooter({ text: '서버 설정 > 개인정보 보호 > DM 허용' });

      await message.reply({ embeds: [errorEmbed] });
    }

  } catch (error) {
    console.error('로그인 오류:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ 로그인 오류')
      .setDescription(error.message || '로그인 중 오류가 발생했습니다.')
      .setTimestamp();

    await message.reply({ embeds: [errorEmbed] });
  }
}

/**
 * 로그아웃 명령어 처리
 */
export async function logoutCommand(message) {
  const userId = message.author.id;

  const session = getUserSession(userId);
  
  if (!session) {
    const embed = new EmbedBuilder()
      .setColor(0xFD4554)
      .setTitle('⚠️ 로그인 필요')
      .setDescription('로그인되어 있지 않습니다.\n\n`ㅂ로그인`으로 먼저 로그인해주세요.')
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // 로그아웃 처리
  logoutUser(userId);
  
  // 폴링 중지
  stopPolling(userId);

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ 로그아웃 완료')
    .setDescription(`**${session.playerName}** 계정에서 로그아웃되었습니다.`)
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

/**
 * 폴링 시작
 */
function startPolling(userId, dmMessage, originalMessage) {
  // 기존 폴링 중지
  stopPolling(userId);

  let attempts = 0;
  const maxAttempts = 60; // 최대 5분 (5초 간격 * 60)

  const interval = setInterval(async () => {
    attempts++;

    try {
      const status = await pollQRLoginStatus(userId);

      if (status.status === 'completed') {
        // 로그인 성공
        stopPolling(userId);

        const successEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ 로그인 성공!')
          .setDescription(`**${status.playerName}**님, 환영합니다!\n\n이제 \`ㅂ상점\` 명령어로 상점을 확인할 수 있습니다.`)
          .setTimestamp();

        await dmMessage.edit({ 
          embeds: [successEmbed],
          components: [] 
        });

        // 원래 채널에도 알림
        const channelEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ 로그인 완료')
          .setDescription(`**${status.playerName}**님, 로그인에 성공했습니다!`)
          .setTimestamp();

        await originalMessage.channel.send({ embeds: [channelEmbed] });
        return;
      }

      // 최대 시도 횟수 초과
      if (attempts >= maxAttempts) {
        stopPolling(userId);

        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⏱️ 시간 초과')
          .setDescription('QR 코드가 만료되었습니다.\n\n다시 `ㅂ로그인`을 시도해주세요.')
          .setTimestamp();

        await dmMessage.edit({ 
          embeds: [timeoutEmbed],
          components: [] 
        });
      }

    } catch (error) {
      if (error.message.includes('만료')) {
        stopPolling(userId);

        const expiredEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⏱️ 세션 만료')
          .setDescription(error.message)
          .setTimestamp();

        await dmMessage.edit({ 
          embeds: [expiredEmbed],
          components: [] 
        });
      }
    }
  }, 5000); // 5초마다 폴링

  pollingIntervals.set(userId, interval);
}

/**
 * 폴링 중지
 */
function stopPolling(userId) {
  const interval = pollingIntervals.get(userId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(userId);
  }
}

/**
 * 로그인 취소 버튼 처리
 */
export async function handleLoginCancel(interaction) {
  const userId = interaction.customId.split('_')[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ 
      content: '본인만 취소할 수 있습니다.', 
      ephemeral: true 
    });
  }

  stopPolling(userId);
  logoutUser(userId);

  const cancelEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('❌ 로그인 취소됨')
    .setDescription('로그인이 취소되었습니다.')
    .setTimestamp();

  await interaction.update({ 
    embeds: [cancelEmbed],
    components: [] 
  });
}

export default {
  loginCommand,
  logoutCommand,
  handleLoginCancel
};
