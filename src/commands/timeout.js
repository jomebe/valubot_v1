export const timeoutCommand = {
  name: 'ㅂ타임아웃',
  execute: async (message, args) => {
    // 관리자 권한 확인
    if (!message.member.permissions.has('MODERATE_MEMBERS')) {
      return message.reply('❌ 이 명령어는 관리자만 사용할 수 있습니다.');
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply('❌ 타임아웃할 멤버를 멘션해주세요.');
    }

    const duration = parseInt(args[1]);
    if (!duration || duration < 1 || duration > 60) {
      return message.reply('❌ 1~60 사이의 시간(분)을 입력해주세요.');
    }

    try {
      await target.timeout(duration * 60 * 1000, `${message.author.tag}님이 타임아웃`);
      return message.reply(`✅ ${target.user.tag}님을 ${duration}분 동안 타임아웃했습니다.`);
    } catch (error) {
      console.error('타임아웃 중 오류:', error);
      return message.reply('❌ 타임아웃 설정에 실패했습니다.');
    }
  }
}; 