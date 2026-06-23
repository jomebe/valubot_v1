/**
 * 상점 관련 유틸리티 함수
 * 스킨 UUID → 이름/이미지 변환
 */

import axios from 'axios';

// 스킨 데이터 캐시
let skinCache = null;
let skinCacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

// 가격 데이터 캐시
let priceCache = new Map();

// VP 통화 ID
const VP_CURRENCY_ID = '85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741';
// Radianite 통화 ID
const RADIANITE_ID = 'e59aa87c-4cbf-517a-5983-6e81511be9b7';

// 티어 정보
const TIER_INFO = {
  '12683d76-48d7-84a3-4e09-6985794f0445': { 
    name: 'Select', 
    emoji: '🔘', 
    color: '#5a9fe2',
    icon: 'https://media.valorant-api.com/contenttiers/12683d76-48d7-84a3-4e09-6985794f0445/displayicon.png'
  },
  '0cebb8be-46d7-c12a-d306-e9907bfc5a25': { 
    name: 'Deluxe', 
    emoji: '💚', 
    color: '#009587',
    icon: 'https://media.valorant-api.com/contenttiers/0cebb8be-46d7-c12a-d306-e9907bfc5a25/displayicon.png'
  },
  '60bca009-4182-7998-dee7-b8a2558dc369': { 
    name: 'Premium', 
    emoji: '💜', 
    color: '#d1548d',
    icon: 'https://media.valorant-api.com/contenttiers/60bca009-4182-7998-dee7-b8a2558dc369/displayicon.png'
  },
  'e046854e-406c-37f4-6607-19a9ba8426fc': { 
    name: 'Exclusive', 
    emoji: '💛', 
    color: '#f5955b',
    icon: 'https://media.valorant-api.com/contenttiers/e046854e-406c-37f4-6607-19a9ba8426fc/displayicon.png'
  },
  '411e4a55-4e59-7757-41f0-86a53f101bb5': { 
    name: 'Ultra', 
    emoji: '🟡', 
    color: '#fad663',
    icon: 'https://media.valorant-api.com/contenttiers/411e4a55-4e59-7757-41f0-86a53f101bb5/displayicon.png'
  }
};

/**
 * 모든 스킨 데이터 가져오기 (캐싱)
 */
async function fetchAllSkins() {
  // 캐시 확인
  if (skinCache && Date.now() - skinCacheTimestamp < CACHE_DURATION) {
    return skinCache;
  }

  try {
    console.log('스킨 데이터 가져오는 중...');
    
    // Valorant API에서 스킨 정보 가져오기
    const [skinsResponse, bundlesResponse] = await Promise.all([
      axios.get('https://valorant-api.com/v1/weapons/skins?language=ko-KR'),
      axios.get('https://valorant-api.com/v1/bundles?language=ko-KR')
    ]);

    const skins = {};
    
    // 스킨 레벨별로 매핑
    for (const skin of skinsResponse.data.data) {
      // 기본 스킨 제외 (Standard 스킨)
      if (skin.displayName.includes('표준')) continue;

      // 각 레벨 저장
      for (const level of skin.levels) {
        skins[level.uuid] = {
          uuid: level.uuid,
          skinUuid: skin.uuid,
          name: skin.displayName,
          levelName: level.displayName,
          icon: level.displayIcon || skin.displayIcon,
          tier: skin.contentTierUuid,
          assetPath: skin.assetPath
        };
      }

      // 크로마(색상 변형)도 저장
      for (const chroma of skin.chromas) {
        if (!skins[chroma.uuid]) {
          skins[chroma.uuid] = {
            uuid: chroma.uuid,
            skinUuid: skin.uuid,
            name: skin.displayName,
            chromaName: chroma.displayName,
            icon: chroma.displayIcon || chroma.fullRender || skin.displayIcon,
            tier: skin.contentTierUuid
          };
        }
      }
    }

    // 번들 정보도 캐시
    const bundles = {};
    for (const bundle of bundlesResponse.data.data) {
      bundles[bundle.uuid] = {
        uuid: bundle.uuid,
        name: bundle.displayName,
        icon: bundle.displayIcon,
        description: bundle.description
      };
    }

    skinCache = { skins, bundles };
    skinCacheTimestamp = Date.now();
    
    console.log(`스킨 ${Object.keys(skins).length}개 로드 완료`);
    return skinCache;
    
  } catch (error) {
    console.error('스킨 데이터 로드 실패:', error);
    throw new Error('스킨 정보를 가져오는데 실패했습니다.');
  }
}

/**
 * 스킨 UUID로 스킨 정보 가져오기
 */
async function getSkinInfo(skinUuid) {
  const data = await fetchAllSkins();
  return data.skins[skinUuid] || null;
}

/**
 * 번들 UUID로 번들 정보 가져오기
 */
async function getBundleInfo(bundleUuid) {
  const data = await fetchAllSkins();
  return data.bundles[bundleUuid] || null;
}

/**
 * 티어 정보 가져오기
 */
function getTierInfo(tierUuid) {
  return TIER_INFO[tierUuid] || { name: 'Unknown', emoji: '❓', color: '#808080', icon: null };
}

/**
 * 가격 매핑 (offers 데이터 사용)
 */
function mapPrices(offersData) {
  priceCache.clear();
  
  if (offersData?.Offers) {
    for (const offer of offersData.Offers) {
      const vpCost = offer.Cost?.[VP_CURRENCY_ID];
      if (vpCost !== undefined) {
        priceCache.set(offer.OfferID, vpCost);
      }
    }
  }
  
  return priceCache;
}

/**
 * 스킨 가격 가져오기
 */
function getSkinPrice(skinUuid) {
  return priceCache.get(skinUuid) || null;
}

/**
 * 상점 데이터 포맷팅
 */
async function formatStorefront(storefrontData, offersData = null) {
  // 가격 매핑
  if (offersData) {
    mapPrices(offersData);
  }

  // SkinsPanelLayout에서 직접 가격 정보 추출 및 매핑
  const priceMap = new Map();
  if (storefrontData?.SkinsPanelLayout?.SingleItemStoreOffers) {
    for (const offer of storefrontData.SkinsPanelLayout.SingleItemStoreOffers) {
      const cost = offer.Cost?.[VP_CURRENCY_ID];
      if (cost !== undefined) {
        priceMap.set(offer.OfferID, cost);
      }
    }
  }

  const result = {
    dailyOffers: [],
    featuredBundle: null,
    remainingTime: 0
  };

  // 데일리 상점 (4개 스킨)
  if (storefrontData?.SkinsPanelLayout) {
    const panel = storefrontData.SkinsPanelLayout;
    result.remainingTime = panel.SingleItemOffersRemainingDurationInSeconds;

    for (const skinUuid of panel.SingleItemOffers) {
      const skinInfo = await getSkinInfo(skinUuid);
      const tierInfo = getTierInfo(skinInfo?.tier);
      const price = priceMap.get(skinUuid) || getSkinPrice(skinUuid);

      result.dailyOffers.push({
        uuid: skinUuid,
        name: skinInfo?.name || '알 수 없는 스킨',
        icon: skinInfo?.icon || null,
        tier: tierInfo,
        price: price || '가격 불명'
      });
    }
  }

  // 피처드 번들
  if (storefrontData.FeaturedBundle?.Bundle) {
    const bundle = storefrontData.FeaturedBundle;
    const bundleInfo = await getBundleInfo(bundle.Bundle.DataAssetID);

    result.featuredBundle = {
      uuid: bundle.Bundle.DataAssetID,
      name: bundleInfo?.name || '알 수 없는 번들',
      icon: bundleInfo?.icon || null,
      price: bundle.Bundle.Items?.reduce((sum, item) => sum + (item.BasePrice || 0), 0) || 0,
      remainingTime: bundle.BundleRemainingDurationInSeconds
    };
  }

  return result;
}

/**
 * 보유 스킨 포맷팅
 */
async function formatOwnedSkins(entitlementsData) {
  const ownedSkins = [];

  if (entitlementsData?.Entitlements) {
    for (const entitlement of entitlementsData.Entitlements) {
      const skinInfo = await getSkinInfo(entitlement.ItemID);
      
      if (skinInfo) {
        const tierInfo = getTierInfo(skinInfo.tier);
        
        ownedSkins.push({
          uuid: entitlement.ItemID,
          name: skinInfo.name,
          icon: skinInfo.icon,
          tier: tierInfo
        });
      }
    }
  }

  // 티어별로 정렬 (Ultra > Exclusive > Premium > Deluxe > Select)
  const tierOrder = ['Ultra', 'Exclusive', 'Premium', 'Deluxe', 'Select', 'Unknown'];
  ownedSkins.sort((a, b) => {
    const aIndex = tierOrder.indexOf(a.tier.name);
    const bIndex = tierOrder.indexOf(b.tier.name);
    return aIndex - bIndex;
  });

  return ownedSkins;
}

/**
 * 남은 시간 포맷팅
 */
function formatRemainingTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분 후`;
  }
  return `${minutes}분 후`;
}

/**
 * 지갑 정보 포맷팅
 */
function formatWallet(walletData) {
  return {
    vp: walletData?.Balances?.[VP_CURRENCY_ID] || 0,
    radianite: walletData?.Balances?.[RADIANITE_ID] || 0
  };
}

export {
  fetchAllSkins,
  getSkinInfo,
  getBundleInfo,
  getTierInfo,
  mapPrices,
  getSkinPrice,
  formatStorefront,
  formatOwnedSkins,
  formatRemainingTime,
  formatWallet,
  TIER_INFO
};
