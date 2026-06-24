/**
 * 상점 명령어 (ㅂ상점)
 * 로그인된 사용자의 데일리 스킨 상점 조회
 * 
 * ⚠️ 경고: 개인 학습/연구 목적으로만 사용
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { 
  getUserSession, 
  getStorefront, 
  getWallet,
  logoutUser
} from '../services/riotAuth.js';
import { buildLoginPayload } from './login.js';
import { 
  formatStorefront, 
  formatRemainingTime, 
  formatWallet,
  getTierInfo 
} from '../utils/storeUtils.js';

/**
 * 상점 명령어 처리
 */
export async function storeCommand(message) {
  const userId = message.author.id;
  const isSlash = !!message.interaction;

  try {
    // 로그인 확인
    const session = getUserSession(userId);
    
    if (!session) {
      const { embeds, components } = buildLoginPayload(userId);
      embeds[0].setTitle('🔒 로그인 세션 만료');
      embeds[0].setDescription(
        '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.\n\n' +
        embeds[0].data.description
      );
      return message.reply({ embeds, components, ephemeral: isSlash });
    }

    // 로딩 메시지
    const loadingEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🔄 상점 조회 중...')
      .setDescription(`**${session.playerName}**님의 상점을 불러오는 중입니다...`)
      .setTimestamp();

    const loadingMsg = await message.reply({ embeds: [loadingEmbed] });

    // 상점 & 가격 데이터 조회
    const [storefrontData, walletData] = await Promise.all([
      getStorefront(userId),
      getWallet(userId)
    ]);

    // 데이터 포맷팅
    const store = await formatStorefront(storefrontData);
    const wallet = formatWallet(walletData);

    // 메인 Embed 생성
    const mainEmbed = new EmbedBuilder()
      .setColor(0xFD4554)
      .setAuthor({ 
        name: `${session.playerName}`, 
        iconURL: message.author.displayAvatarURL({ extension: 'png', size: 128 })
      })
      .setTitle('🛒 오늘의 상점')
      .setDescription(`⏱️ **${formatRemainingTime(store.remainingTime)}** 후 초기화`)
      .addFields(
        { 
          name: '💰 보유 포인트', 
          value: `<:vp:1234> **${wallet.vp.toLocaleString()}** VP | <:rp:1234> **${wallet.radianite}** RP`, 
          inline: false 
        }
      )
      .setTimestamp();

    // 스킨별 Embed 생성
    const skinEmbeds = [];
    
    for (const skin of store.dailyOffers) {
      const tierInfo = skin.tier;
      
      const skinEmbed = new EmbedBuilder()
        .setColor(tierInfo.color || '#FD4554')
        .setAuthor({
          name: skin.name,
          iconURL: tierInfo.icon || null
        })
        .setDescription(`💵 **${skin.price?.toLocaleString() || '???'}** VP\n\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003`)
        .setThumbnail(skin.icon || 'https://media.valorant-api.com/weapons/29a0cfab-485b-f5d5-779a-b59f85e204a8/displayicon.png');

      skinEmbeds.push(skinEmbed);
    }

    // 버튼 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`store_refresh_${userId}`)
          .setStyle(ButtonStyle.Primary)
          .setLabel('새로고침')
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId(`store_wallet_${userId}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('포인트 상세')
          .setEmoji('💰')
      );

    // 응답 전송
    await loadingMsg.edit({ 
      embeds: [mainEmbed, ...skinEmbeds],
      components: [row]
    });

  } catch (error) {
    console.error('상점 조회 오류:', error);

    const errMsg = error.message || '';
    const isAuthError = errMsg.includes('만료') || errMsg.includes('로그인') || errMsg.includes('unauthorized') || errMsg.includes('401') || errMsg.includes('token') || errMsg.includes('auth');

    if (isAuthError) {
      logoutUser(userId);
      const { embeds, components } = buildLoginPayload(userId);
      embeds[0].setTitle('🔒 로그인 세션 만료');
      embeds[0].setDescription(
        '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.\n\n' +
        embeds[0].data.description
      );

      if (typeof loadingMsg !== 'undefined') {
        try {
          await loadingMsg.edit({ embeds, components });
          return;
        } catch (e) {
          // ignore
        }
      }
      await message.reply({ embeds, components, ephemeral: isSlash });
    } else {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ 상점 조회 실패')
        .setDescription('상점 정보를 가져오는 중 오류가 발생했습니다.')
        .setTimestamp();

      if (typeof loadingMsg !== 'undefined') {
        try {
          await loadingMsg.edit({ embeds: [errorEmbed], components: [] });
          return;
        } catch (e) {
          // ignore
        }
      }
      await message.reply({ embeds: [errorEmbed], ephemeral: isSlash });
    }
  }
}

/**
 * 상점 새로고침 버튼 처리
 */
export async function handleStoreRefresh(interaction) {
  const userId = interaction.customId.split('_')[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ 
      content: '본인만 새로고침할 수 있습니다.', 
      ephemeral: true 
    });
  }

  await interaction.deferUpdate();

  try {
    const session = getUserSession(userId);
    
    if (!session) {
      logoutUser(userId);
      const { embeds, components } = buildLoginPayload(userId);
      embeds[0].setTitle('🔒 로그인 세션 만료');
      embeds[0].setDescription(
        '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.\n\n' +
        embeds[0].data.description
      );
      return interaction.followUp({ 
        embeds, 
        components,
        ephemeral: true 
      });
    }

    // 상점 데이터 다시 조회
    const [storefrontData, walletData] = await Promise.all([
      getStorefront(userId),
      getWallet(userId)
    ]);

    const store = await formatStorefront(storefrontData);
    const wallet = formatWallet(walletData);

    // Embed 재생성
    const mainEmbed = new EmbedBuilder()
      .setColor(0xFD4554)
      .setAuthor({ 
        name: `${session.playerName}`, 
        iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
      })
      .setTitle('🛒 오늘의 상점')
      .addFields(
        { 
          name: '💰 보유 포인트', 
          value: `**${wallet.vp.toLocaleString()}** VP | **${wallet.radianite}** RP`, 
          inline: false 
        }
      )
      .setFooter({ text: '🔄 방금 새로고침됨' })
      .setTimestamp();

    const skinEmbeds = [];
    
    for (const skin of store.dailyOffers) {
      const tierInfo = skin.tier;
      
      const skinEmbed = new EmbedBuilder()
        .setColor(tierInfo.color || '#FD4554')
        .setAuthor({
          name: skin.name,
          iconURL: tierInfo.icon || null
        })
        .setDescription(`💵 **${skin.price?.toLocaleString() || '???'}** VP\n\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003`)
        .setThumbnail(skin.icon || 'https://media.valorant-api.com/weapons/29a0cfab-485b-f5d5-779a-b59f85e204a8/displayicon.png');

      skinEmbeds.push(skinEmbed);
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`store_refresh_${userId}`)
          .setStyle(ButtonStyle.Primary)
          .setLabel('새로고침')
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId(`store_wallet_${userId}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('포인트 상세')
          .setEmoji('💰')
      );

    await interaction.editReply({ 
      embeds: [mainEmbed, ...skinEmbeds],
      components: [row]
    });

  } catch (error) {
    console.error('상점 새로고침 오류:', error);
    const errMsg = error.message || '';
    const isAuthError = errMsg.includes('만료') || errMsg.includes('로그인') || errMsg.includes('unauthorized') || errMsg.includes('401') || errMsg.includes('token') || errMsg.includes('auth');

    if (isAuthError) {
      logoutUser(userId);
      const { embeds, components } = buildLoginPayload(userId);
      embeds[0].setTitle('🔒 로그인 세션 만료');
      embeds[0].setDescription(
        '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.\n\n' +
        embeds[0].data.description
      );
      await interaction.followUp({ 
        embeds, 
        components,
        ephemeral: true 
      });
    } else {
      await interaction.followUp({ 
        content: '상점 정보를 새로고침하는 중 오류가 발생했습니다.', 
        ephemeral: true 
      });
    }
  }
}

/**
 * 지갑 상세 버튼 처리
 */
export async function handleWalletDetail(interaction) {
  const userId = interaction.customId.split('_')[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ 
      content: '본인만 확인할 수 있습니다.', 
      ephemeral: true 
    });
  }

  try {
    const session = getUserSession(userId);
    
    if (!session) {
      logoutUser(userId);
      const { embeds, components } = buildLoginPayload(userId);
      embeds[0].setTitle('🔒 로그인 세션 만료');
      embeds[0].setDescription(
        '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.\n\n' +
        embeds[0].data.description
      );
      return interaction.reply({ 
        embeds, 
        components,
        ephemeral: true 
      });
    }

    const walletData = await getWallet(userId);
    const wallet = formatWallet(walletData);

    const walletEmbed = new EmbedBuilder()
      .setColor(0xFAD663)
      .setTitle('💰 포인트 상세')
      .setDescription(`**${session.playerName}**님의 보유 포인트`)
      .addFields(
        { name: '발로란트 포인트 (VP)', value: `**${wallet.vp.toLocaleString()}**`, inline: true },
        { name: '레디어나이트 포인트 (RP)', value: `**${wallet.radianite}**`, inline: true }
      )
      .setFooter({ text: '포인트는 게임 내에서 구매할 수 있습니다.' })
      .setTimestamp();

    await interaction.reply({ embeds: [walletEmbed], ephemeral: true });

  } catch (error) {
    console.error('지갑 조회 오류:', error);
    const errMsg = error.message || '';
    const isAuthError = errMsg.includes('만료') || errMsg.includes('로그인') || errMsg.includes('unauthorized') || errMsg.includes('401') || errMsg.includes('token') || errMsg.includes('auth');

    if (isAuthError) {
      logoutUser(userId);
      const { embeds, components } = buildLoginPayload(userId);
      embeds[0].setTitle('🔒 로그인 세션 만료');
      embeds[0].setDescription(
        '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.\n\n' +
        embeds[0].data.description
      );
      await interaction.reply({ 
        embeds, 
        components,
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: '지갑 정보를 조회하는 중 오류가 발생했습니다.', 
        ephemeral: true 
      });
    }
  }
}

export default {
  storeCommand,
  handleStoreRefresh,
  handleWalletDetail
};
