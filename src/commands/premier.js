import { EmbedBuilder } from 'discord.js';
import axios from 'axios';

export const premierCommand = {
  name: ['ㅂ프리미어', 'ㅂ프리미어팀'],
  execute: async (message, args) => {
    // 팀 이름과 태그 확인
    if (args.length < 2) {
      return message.reply('❌ 팀 이름과 태그를 입력해주세요.\n예시: `ㅂ프리미어 다딱이들의모임 daddk`');
    }

    const teamTag = args.pop(); // 마지막 인자가 태그
    const teamName = args.join(' '); // 나머지가 팀 이름

    const loadingMsg = await message.reply('🔍 프리미어 팀 정보를 조회하는 중...');

    try {
      console.log(`팀 정보 조회: ${teamName} / ${teamTag}`);
      
      const url = `https://api.henrikdev.xyz/valorant/v1/premier/${encodeURIComponent(teamName)}/${encodeURIComponent(teamTag)}`;
      console.log('API URL:', url);
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': process.env.VALORANT_API_KEY
        }
      });

      console.log('API 응답 상태:', response.data.status);
      console.log('API 응답 데이터:', JSON.stringify(response.data, null, 2));

      if (response.data.status !== 200 || !response.data.data) {
        const errorMsg = response.data.errors?.[0]?.message || '팀을 찾을 수 없습니다';
        console.log('팀 조회 실패:', errorMsg);
        
        return loadingMsg.edit({
          content: `❌ **팀을 찾을 수 없습니다.**\n\n팀 이름: **${teamName}**\n팀 태그: **${teamTag}**\n\n오류: ${errorMsg}\n\n팀 이름과 태그를 정확히 입력했는지 확인해주세요.`,
          embeds: []
        });
      }

      const teamInfo = response.data.data;
      
      // Division 정보 (숫자로 오는 경우 처리)
      const divisionNames = [
        'Open 1', 'Open 2', 'Open 3', 'Open 4', 'Open 5',
        'Intermediate 1', 'Intermediate 2', 'Intermediate 3', 'Intermediate 4', 'Intermediate 5',
        'Advanced 1', 'Advanced 2', 'Advanced 3', 'Advanced 4', 'Advanced 5',
        'Elite', 'Contender'
      ];
      
      const divisionValue = teamInfo.placement?.division;
      let division = '정보 없음';
      
      if (typeof divisionValue === 'number') {
        division = divisionNames[divisionValue] || `Division ${divisionValue}`;
      } else if (typeof divisionValue === 'string') {
        const divisionMap = {
          'PREMIER_DIVISION_OPEN': 'Open',
          'PREMIER_DIVISION_INTERMEDIATE': 'Intermediate',
          'PREMIER_DIVISION_ADVANCED': 'Advanced',
          'PREMIER_DIVISION_ELITE': 'Elite',
          'PREMIER_DIVISION_CONTENDER': 'Contender'
        };
        division = divisionMap[divisionValue] || divisionValue;
      }

      const conference = teamInfo.placement?.conference || '정보 없음';
      const place = teamInfo.placement?.place || '정보 없음';

      // 통계
      const wins = teamInfo.stats?.wins || 0;
      const losses = teamInfo.stats?.losses || 0;
      const matches = teamInfo.stats?.matches || 0;
      const winRate = matches > 0 ? ((wins / matches) * 100).toFixed(1) : '0.0';

      // 멤버 정보
      const memberCount = teamInfo.member?.length || 0;
      const owner = teamInfo.member?.find(m => m.is_owner);
      const ownerName = owner ? `${owner.name}#${owner.tag}` : teamInfo.member?.[0] ? `${teamInfo.member[0].name}#${teamInfo.member[0].tag}` : '정보 없음';

      // Embed 생성
      const primaryColor = teamInfo.customization?.primary ? teamInfo.customization.primary.replace('#', '') : 'a338f7';
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${teamInfo.name} [${teamInfo.tag}]`)
        .setColor(parseInt(primaryColor, 16))
        .addFields(
          {
            name: '📊 디비전',
            value: `**${division}** - ${conference}`,
            inline: true
          },
          {
            name: '🎯 순위',
            value: `${place}위`,
            inline: true
          },
          {
            name: '👥 멤버',
            value: `${memberCount}명`,
            inline: true
          },
          {
            name: '📈 전적',
            value: `${wins}승 ${losses}패 (${winRate}%)`,
            inline: true
          },
          {
            name: '👑 오너',
            value: ownerName,
            inline: true
          },
          {
            name: '🎮 총 경기',
            value: `${matches}경기`,
            inline: true
          }
        )
        .setFooter({ text: 'Valorant Premier Team Info' })
        .setTimestamp();

      // 팀 이미지 (Henrik API는 이미지 URL 직접 제공)
      if (teamInfo.customization?.image) {
        embed.setThumbnail(teamInfo.customization.image);
      }

      // 멤버 목록 (전체 표시)
      if (teamInfo.member && teamInfo.member.length > 0) {
        const memberList = teamInfo.member
          .map((m, i) => `${i + 1}. ${m.name}#${m.tag}${m.is_owner ? ' 👑' : ''}`)
          .join('\n');
        
        embed.addFields({
          name: '👥 멤버 목록',
          value: memberList,
          inline: false
        });
      }

      await loadingMsg.edit({
        content: '',
        embeds: [embed]
      });

    } catch (error) {
      console.error('팀 정보 조회 오류:', error.response?.data || error.message);
      
      let errorMessage = '❌ **팀 정보를 조회하는 중 오류가 발생했습니다.**\n\n';
      
      if (error.response?.status === 404) {
        errorMessage += `팀 이름: **${teamName}**\n팀 태그: **${teamTag}**\n\n해당 팀을 찾을 수 없습니다. 팀 이름과 태그를 확인해주세요.`;
      } else if (error.response?.status === 429) {
        errorMessage += 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      } else {
        errorMessage += `오류 내용: ${error.response?.data?.errors?.[0]?.message || error.message}`;
      }

      await loadingMsg.edit({
        content: errorMessage,
        embeds: []
      });
    }
  }
};
