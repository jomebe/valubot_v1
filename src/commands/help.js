import { COMMAND_ALIASES } from '../config/constants.js';

export const helpCommand = {
  name: 'ㅂ도움',
  aliases: ['ㅂㄷㅇ'],
  execute: async (message, args) => {
    const embed = {
      color: 0xFF4654,
      title: '🤖 발로봇 도움말',
      description: '사용 가능한 명령어 목록입니다.',
      fields: [
        {
          name: '📝 계정 관리',
          value: 
            '`ㅂ발로등록 닉네임#태그` - 발로란트 계정을 등록합니다.\n' +
            '`ㅂ발로삭제` - 등록된 발로란트 계정을 삭제합니다.'
        },
        {
          name: '🎮 게임 정보',
          value: 
            '`ㅂ전적 [닉네임#태그]` - 발로란트 전적을 확인합니다.\n' +
            '`ㅂ매치 [닉네임#태그]` - 최근 매치 정보를 확인합니다.\n' +
            '`ㅂ티어 [닉네임#태그]` - 현재 티어 정보를 확인합니다.\n' +
            '`ㅂ리더보드` - 서버 내 플레이어 랭킹을 확인합니다.'
        },
        {
          name: '🎲 유틸리티',
          value: 
            '`ㅂ랜덤맵 (ㅂㄹㄷㅁ)` - 무작위 발로란트 맵을 선택합니다.\n'
        },
        {
          name: '📊 통계',
          value: 
            '`ㅂ비교 [닉네임1] [닉네임2]` - 두 플레이어의 전적을 비교합니다.\n' +
            '`ㅂ통계` - 서버 내 통계를 확인합니다.'
        }
      ],
      footer: {
        text: '() 안의 명령어는 단축키입니다.'
      },
      timestamp: new Date()
    };

    return message.reply({ embeds: [embed] });
  }
}; 