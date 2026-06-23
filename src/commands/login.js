/**
 * 로그인 / 로그아웃 명령어
 * 라이엇 공식 인증 페이지를 통한 토큰 등록 및 연결 삭제
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getUserSession, logoutUser } from '../services/riotAuth.js';

// 라이엇 클라이언트 로그인 URL (localhost로 리다이렉트되어 토큰 노출)
const RIOT_LOGIN_URL = 'https://auth.riotgames.com/authorize?client_id=riot-client&redirect_uri=http%3A%2F%2Flocalhost%2Fredirect&response_type=token%20id_token&scope=openid%20link%20ban&nonce=1';

/**
 * 로그인 명령어 처리
 */
export async function loginCommand(message) {
  const userId = message.author.id;
  const isSlash = !!message.interaction;

  try {
    // 이미 로그인되어 있는 경우 기존 세션 표시
    const existingSession = getUserSession(userId);
    if (existingSession) {
      const embed = new EmbedBuilder()
        .setColor(0xFD4554)
        .setTitle('⚠️ 이미 로그인되어 있음')
        .setDescription(`**${existingSession.playerName}** 계정으로 이미 로그인되어 있습니다.\n\n로그아웃하려면 \`/로그아웃\` 또는 \`ㅂ로그아웃\`을 사용하세요.`)
        .setTimestamp();

      return message.reply({ embeds: [embed], ephemeral: isSlash });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFD4554)
      .setTitle('🔑 라이엇 계정 연결')
      .setDescription(
        '아래 **라이엇 로그인** 버튼을 클릭하여 공식 로그인 페이지로 이동하세요.\n' +
        '(Riot Mobile QR 코드 로그인을 포함한 모든 정상 로그인을 지원합니다)\n\n' +
        '1. 로그인을 완료하면 주소창이 `http://localhost/redirect#access_token=...` 형태로 리다이렉트됩니다.\n' +
        '2. 해당 페이지는 접속할 수 없는 빈 페이지로 나오는 것이 정상이니 안심하셔도 됩니다.\n' +
        '3. 주소창의 **URL 전체**를 복사하세요.\n' +
        '4. 아래 **토큰 등록하기** 버튼을 누르고 복사한 주소를 입력창에 붙여넣어 주세요.'
      )
      .setFooter({ text: '⚠️ 주의: 복사한 토큰 주소는 절대 타인에게 공유하지 마세요!' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('라이엇 로그인')
        .setURL(RIOT_LOGIN_URL)
        .setEmoji('🔗'),
      new ButtonBuilder()
        .setCustomId(`login_token_btn_${userId}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel('토큰 등록하기')
        .setEmoji('📥')
    );

    if (isSlash) {
      // 슬래시 명령어인 경우 에페메럴(비공개)로 응답
      await message.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    } else {
      // 일반 대화방 접두사 명령어인 경우 DM으로 발송하여 개인정보 노출 최소화
      const publicEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📱 로그인 안내')
        .setDescription('개인정보 보호를 위해 **DM(개인 메시지)**으로 로그인 링크를 전송했습니다. DM을 확인해주세요!')
        .setFooter({ text: '서버에 메시지가 남지 않도록 DM으로 진행됩니다.' });

      await message.reply({ embeds: [publicEmbed] });

      try {
        const dmChannel = await message.author.createDM();
        await dmChannel.send({
          embeds: [embed],
          components: [row]
        });
      } catch (dmError) {
        console.error('DM 전송 실패:', dmError);
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ DM 전송 실패')
          .setDescription('DM을 전송할 수 없습니다. 디스코드 설정에서 **[서버 멤버가 보내는 개인 메시지 허용]**이 켜져 있는지 확인해주세요.');
        
        await message.reply({ embeds: [errorEmbed] });
      }
    }

  } catch (error) {
    console.error('로그인 커맨드 실행 오류:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ 로그인 처리 오류')
      .setDescription('로그인 프로세스를 준비하는 중 오류가 발생했습니다.')
      .setTimestamp();

    await message.reply({ embeds: [errorEmbed], ephemeral: isSlash });
  }
}

/**
 * 로그아웃 명령어 처리
 */
export async function logoutCommand(message) {
  const userId = message.author.id;
  const isSlash = !!message.interaction;

  const session = getUserSession(userId);
  if (!session) {
    const embed = new EmbedBuilder()
      .setColor(0xFD4554)
      .setTitle('⚠️ 로그인 상태가 아님')
      .setDescription('현재 로그인되어 있지 않습니다.\n\n`/로그인` 또는 `ㅂ로그인`으로 먼저 로그인해주세요.')
      .setTimestamp();

    return message.reply({ embeds: [embed], ephemeral: isSlash });
  }

  // 연결 정보 삭제
  logoutUser(userId);

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ 로그아웃 완료')
    .setDescription('로그아웃 완료. 저장된 Riot 연결 정보를 삭제했어요.')
    .setTimestamp();

  await message.reply({ embeds: [embed], ephemeral: isSlash });
}

export default {
  loginCommand,
  logoutCommand
};
