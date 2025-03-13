import { saveGuildSettings } from '../services/database.js';
import { guildSettings } from '../config/constants.js';

export const settingsCommand = {
  name: 'ㅂ설정',
  execute: async (message, args) => {
    // 관리자 권한 확인
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      return message.reply('❌ 이 명령어는 관리자만 사용할 수 있습니다.');
    }

    const guildId = message.guild.id;
    const settings = guildSettings.get(guildId);

    if (!args.length) {
      // 현재 설정 표시
      const embed = {
        color: 0xFF4654,
        title: '⚙️ 서버 설정',
        fields: [
          {
            name: '명령어 접두사',
            value: settings.prefix
          },
          {
            name: '로그 채널',
            value: settings.logChannel ? `<#${settings.logChannel}>` : '설정되지 않음'
          },
          {
            name: '환영 채널',
            value: settings.welcomeChannel ? `<#${settings.welcomeChannel}>` : '설정되지 않음'
          }
        ],
        timestamp: new Date()
      };

      return message.reply({ embeds: [embed] });
    }

    // 설정 변경
    const [setting, ...value] = args;
    
    switch (setting.toLowerCase()) {
      case '접두사':
        if (!value.length) return message.reply('❌ 새로운 접두사를 입력해주세요.');
        settings.prefix = value[0];
        break;
        
      case '로그채널':
        settings.logChannel = message.mentions.channels.first()?.id || null;
        break;
        
      case '환영채널':
        settings.welcomeChannel = message.mentions.channels.first()?.id || null;
        break;
        
      default:
        return message.reply('❌ 올바른 설정 항목을 입력해주세요.');
    }

    // 설정 저장
    await saveGuildSettings(guildId, settings);
    guildSettings.set(guildId, settings);

    return message.reply('✅ 설정이 변경되었습니다.');
  }
}; 