import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { valorantApi } from '../utils/valorantApi.js';
import { db } from '../config/firebase.js';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';

// 인기 팀 ID 매핑 (검색어 정규화 → 팀 ID)
// VLR.gg에서 직접 확인된 ID만 포함
const POPULAR_TEAMS = {
  // 한국/아시아 (검증 완료)
  'geng': 17, 'gen': 17, 'genesesports': 17, 'geng에스포츠': 17,
  'drx': 8185, 'drxkorea': 8185,
  't1': 14, 't1korea': 14,
  'prx': 624, 'paperrex': 624,
  
  // 북미 (검증 완료)
  'sentinels': 2, 'sen': 2,
  
  // EU (검증 완료)
  'heretics': 1001, 'th': 1001, 'teamheretics': 1001,
  
  // 추가 인기팀 (필요시 ID 확인 후 추가)
  'loud': 6961,
  'fnatic': 2593,
  'nrg': 1034,
  'edg': 11676, 'edwardgaming': 11676,
  'liquid': 474, 'teamliquid': 474
};

// 인기 선수 ID 매핑 (VLR.gg에서 직접 확인된 ID만 포함)
const POPULAR_PLAYERS = {
  // 북미
  'tenz': 9,
  
  // 한국 (자주 검색되는 선수들 추가 가능)
  'texture': 30583,
  'meteor': 18078
};

// 검색어 정규화 (소문자, 공백/특수문자 제거)
function normalizeSearch(text) {
  return text.toLowerCase()
    .replace(/[\s\-._]/g, '')  // 공백과 특수문자 제거
    .replace(/[^a-z0-9가-힣]/g, '');  // 영문 소문자, 숫자, 한글 완성형만 남김
}

// 지역 코드 → 한글 매핑
const REGION_MAP = {
  'kr': '한국', 'jp': '일본', 'br': '브라질', 'eu': '유럽',
  'na': '북미', 'se': '동남아', 'id': '인도네시아', 'th': '태국',
  'vn': '베트남', 'un': '중동/아프리카', 'no': '북유럽',
  'ph': '필리핀', 'sg': '싱가포르', 'tw': '대만', 'cn': '중국',
  'in': '인도', 'tr': '터키', 'ru': '러시아', 'oce': '오세아니아',
  'latam': '라틴아메리카', 'la': '라틴아메리카'
};

// 날짜 포맷팅 헬퍼
function formatDate(dateStr) {
  if (!dateStr) return '정보 없음';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

// 날짜만 간단하게 포맷
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// 이벤트 상태 이모지
function getStatusEmoji(status) {
  if (!status) return '⬜';
  const s = status.toLowerCase();
  if (s.includes('live') || s.includes('ongoing') || s.includes('running')) return '🔴';
  if (s.includes('upcoming') || s.includes('scheduled')) return '🟡';
  if (s.includes('completed') || s.includes('finished') || s.includes('ended')) return '✅';
  return '⬜';
}

// ========= Firebase 캐시 함수들 =========

// Firebase에서 팀 ID 조회
async function getTeamIdFromCache(normalizedName) {
  try {
    if (!db) return null;
    const docRef = doc(db, 'esports_teams', normalizedName);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data().id : null;
  } catch (error) {
    console.error('Firebase 팀 조회 실패:', error);
    return null;
  }
}

// Firebase에 팀 ID 저장
async function saveTeamIdToCache(normalizedName, teamId, teamName) {
  try {
    if (!db) return;
    await setDoc(doc(db, 'esports_teams', normalizedName), {
      id: teamId,
      name: teamName,
      updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Firebase 팀 저장 실패:', error);
  }
}

// Firebase에서 선수 ID 조회
async function getPlayerIdFromCache(normalizedName) {
  try {
    if (!db) return null;
    const docRef = doc(db, 'esports_players', normalizedName);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data().id : null;
  } catch (error) {
    console.error('Firebase 선수 조회 실패:', error);
    return null;
  }
}

// Firebase에 선수 ID 저장
async function savePlayerIdToCache(normalizedName, playerId, playerName) {
  try {
    if (!db) return;
    await setDoc(doc(db, 'esports_players', normalizedName), {
      id: playerId,
      name: playerName,
      updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Firebase 선수 저장 실패:', error);
  }
}

// ========= 메인 명령어 핸들러 =========

export const esportsCommand = {
  name: ['ㅂ이스포츠', 'ㅂ대회', 'ㅂesports'],
  execute: async (message, args) => {
    try {
      const subCommand = args[0]?.toLowerCase();

      // 서브커맨드 없으면 사용법 안내
      if (!subCommand) {
        return await showHelp(message);
      }

      // 이벤트 목록
      if (subCommand === '이벤트' || subCommand === '대회' || subCommand === 'events') {
        return await showEvents(message);
      }

      // 팀 정보
      if (subCommand === '팀' || subCommand === 'team') {
        const input = args[1];
        if (!input) {
          return message.reply('❌ 팀 이름 또는 ID를 입력해주세요.\n예시: `ㅂ이스포츠 팀 GenG` 또는 `ㅂ이스포츠 팀 17`');
        }

        // 숫자면 ID로, 아니면 이름으로 검색
        const isNumeric = /^\d+$/.test(input);
        let teamId = input;

        if (!isNumeric) {
          // 이름으로 팀 검색
          teamId = await searchTeamByName(message, input);
          if (!teamId) return; // 검색 실패 or 취소
        }

        const subSub = args[2]?.toLowerCase();
        if (subSub === '매치' || subSub === '경기') {
          return await showTeamMatches(message, teamId);
        }
        if (subSub === '이적' || subSub === '로스터') {
          return await showTeamTransactions(message, teamId);
        }
        return await showTeam(message, teamId);
      }

      // 선수 정보
      if (subCommand === '선수' || subCommand === 'player') {
        const input = args[1];
        if (!input) {
          return message.reply('❌ 선수 이름 또는 ID를 입력해주세요.\n예시: `ㅂ이스포츠 선수 텍스쳐` 또는 `ㅂ이스포츠 선수 123`');
        }

        // 숫자면 ID로, 아니면 이름으로 검색
        const isNumeric = /^\d+$/.test(input);
        let playerId = input;

        if (!isNumeric) {
          // 이름으로 선수 검색
          playerId = await searchPlayerByName(message, input);
          if (!playerId) return; // 검색 실패 or 취소
        }

        const subSub = args[2]?.toLowerCase();
        if (subSub === '매치' || subSub === '경기') {
          return await showPlayerMatches(message, playerId);
        }
        return await showPlayer(message, playerId);
      }

      // 매치 상세
      if (subCommand === '매치' || subCommand === 'match') {
        const matchId = args[1];
        if (!matchId) {
          return message.reply('❌ 매치 ID를 입력해주세요.\n예시: `ㅂ이스포츠 매치 123`');
        }
        return await showMatch(message, matchId);
      }

      // 이벤트 매치 목록
      if (subCommand === '이벤트매치') {
        const eventId = args[1];
        if (!eventId) {
          return message.reply('❌ 이벤트 ID를 입력해주세요.\n예시: `ㅂ이스포츠 이벤트매치 123`');
        }
        return await showEventMatches(message, eventId);
      }

      // 알 수 없는 서브커맨드
      return message.reply(
        `❌ 알 수 없는 명령어입니다.\n\n` +
        `**사용 가능한 명령어:**\n` +
        `• \`ㅂ이스포츠\` - 사용법 보기\n` +
        `• \`ㅂ이스포츠 이벤트\` - 대회 목록\n` +
        `• \`ㅂ이스포츠 팀 [이름/ID]\` - 팀 정보\n` +
        `• \`ㅂ이스포츠 선수 [이름/ID]\` - 선수 정보\n` +
        `• \`ㅂ이스포츠 매치 [ID]\` - 매치 정보`
      );

    } catch (error) {
      console.error('이스포츠 명령어 오류:', error);
      
      if (error.response?.status === 404) {
        return message.reply('❌ 해당 정보를 찾을 수 없습니다. ID를 확인해주세요.');
      }
      if (error.response?.status === 429) {
        return message.reply('❌ API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
      }
      return message.reply('❌ 이스포츠 정보를 가져오는데 실패했습니다.');
    }
  }
};

// ========= 서브커맨드 함수들 =========

// 팀 이름으로 검색 (Firebase 캐시 + 하드코딩만)
async function searchTeamByName(message, searchName) {
  const normalized = normalizeSearch(searchName);
  console.log(`🔍 팀 검색: "${searchName}" → 정규화: "${normalized}"`);
  
  // 1단계: 하드코딩된 인기 팀에서 검색 (최우선)
  if (POPULAR_TEAMS[normalized]) {
    console.log(`✅ 하드코딩 매칭: ${normalized} → ID ${POPULAR_TEAMS[normalized]}`);
    return POPULAR_TEAMS[normalized];
  }

  // 2단계: 부분 매칭 시도 (하드코딩된 팀만)
  for (const [key, id] of Object.entries(POPULAR_TEAMS)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      console.log(`✅ 부분 매칭: ${normalized} ↔ ${key} → ID ${id}`);
      return id;
    }
  }

  // 3단계: Firebase 캐시에서 검색 (학습된 데이터)
  const cachedId = await getTeamIdFromCache(normalized);
  if (cachedId) {
    console.log(`📦 Firebase 캐시 매칭: ${normalized} → ID ${cachedId}`);
    return cachedId;
  }

  console.log(`❌ 팀을 찾을 수 없음: ${normalized}`);
  // 찾을 수 없음 - VLR.gg에서 ID 찾으라고 안내
  await message.reply(
    `❌ "${searchName}"를 찾을 수 없습니다.\n\n` +
    `💡 **팀 ID 찾는 방법:**\n` +
    `1. https://www.vlr.gg/ 접속\n` +
    `2. 팀 이름으로 검색\n` +
    `3. URL에서 ID 확인 (vlr.gg/team/**14**/t1)\n` +
    `4. \`ㅂ대회 팀 14\` 입력하면 다음부터 이름으로 검색 가능\n\n` +
    `📌 **인기 팀 ID:**\n` +
    `• T1: \`14\` | GenG: \`17\` | DRX: \`8185\`\n` +
    `• PRX: \`624\` | SEN: \`2\` | LOUD: \`6961\`\n` +
    `• Fnatic: \`2593\` | NRG: \`1034\` | TH: \`1001\``
  );
  return null;
}

// 선수 이름으로 검색 (Firebase 캐시 + 하드코딩만)
async function searchPlayerByName(message, searchName) {
  const normalized = normalizeSearch(searchName);
  console.log(`🔍 선수 검색: "${searchName}" → 정규화: "${normalized}"`);
  
  // 1단계: 하드코딩된 인기 선수에서 검색 (최우선)
  if (POPULAR_PLAYERS[normalized]) {
    console.log(`✅ 하드코딩 매칭: ${normalized} → ID ${POPULAR_PLAYERS[normalized]}`);
    return POPULAR_PLAYERS[normalized];
  }

  // 2단계: 부분 매칭 시도 (하드코딩된 선수만)
  for (const [key, id] of Object.entries(POPULAR_PLAYERS)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      console.log(`✅ 부분 매칭: ${normalized} ↔ ${key} → ID ${id}`);
      return id;
    }
  }

  // 3단계: Firebase 캐시에서 검색 (학습된 데이터)
  const cachedId = await getPlayerIdFromCache(normalized);
  if (cachedId) {
    console.log(`📦 Firebase 캐시 매칭: ${normalized} → ID ${cachedId}`);
    return cachedId;
  }

  console.log(`❌ 선수를 찾을 수 없음: ${normalized}`);

  // 찾을 수 없음 - VLR.gg에서 ID 찾으라고 안내
  await message.reply(
    `❌ "${searchName}"를 찾을 수 없습니다.\n\n` +
    `💡 **선수 ID 찾는 방법:**\n` +
    `1. https://www.vlr.gg/ 접속\n` +
    `2. 선수 이름으로 검색\n` +
    `3. URL에서 ID 확인 (vlr.gg/player/**773**)\n` +
    `4. \`ㅂ대회 선수 773\` 입력하면 다음부터 이름으로 검색 가능\n\n` +
    `📌 **인기 선수 ID:**\n` +
    `• TenZ: \`9\` | Texture: \`30583\` | Meteor: \`18078\``
  );
  return null;
}

// ========= 도움말 =========

// 사용법 안내
async function showHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle('📖 이스포츠 명령어 사용법')
    .setColor(0xFF4654)
    .setDescription('VCT 대회, 팀, 선수 정보를 조회할 수 있습니다.')
    .addFields(
      {
        name: '🏆 대회/이벤트 조회',
        value: 
          '`ㅂ이스포츠 이벤트` - 진행 중인 대회 목록\n' +
          '`ㅂ이스포츠 이벤트매치 123` - 대회의 매치 목록\n' +
          '💡 먼저 이벤트 목록에서 ID를 확인하세요',
        inline: false
      },
      {
        name: '👥 팀 정보 조회',
        value: 
          '`ㅂ이스포츠 팀 GenG` - 인기 팀 이름 검색\n' +
          '`ㅂ이스포츠 팀 17` - 팀 ID로 조회 (권장)\n' +
          '`ㅂ이스포츠 팀 17 매치` - 팀의 최근 경기\n' +
          '💡 이름 검색은 인기팀 또는 이전 조회한 팀만 가능',
        inline: false
      },
      {
        name: '🎮 선수 정보 조회',
        value: 
          '`ㅂ이스포츠 선수 9` - 선수 ID로 조회 (권장)\n' +
          '`ㅂ이스포츠 선수 TenZ` - 인기 선수 이름 검색\n' +
          '`ㅂ이스포츠 선수 9 매치` - 선수의 최근 경기\n' +
          '💡 이름 검색은 인기 선수 또는 이전 조회한 선수만 가능',
        inline: false
      },
      {
        name: '⚔️ 매치 정보 조회',
        value: 
          '`ㅂ이스포츠 매치 123456` - 매치 상세 정보\n' +
          '💡 이벤트/팀/선수 조회 시 매치 ID가 표시됩니다',
        inline: false
      },
      {
        name: '🔍 ID 찾는 방법',
        value: 
          '1️⃣ **인기 팀/선수**: 이름으로 바로 검색 (GenG, T1, DRX, PRX, SEN)\n' +
          '2️⃣ **VLR.gg 검색**: vlr.gg → 검색 → URL의 숫자가 ID\n' +
          '   예: vlr.gg/team/**14**/t1\n' +
          '3️⃣ **자동 저장**: ID로 한 번 조회하면 다음부터 이름으로 검색 가능',
        inline: false
      },
      {
        name: '⚡ 빠른 예시',
        value: 
          '`ㅂ이스포츠` - 이 도움말 보기\n' +
          '`ㅂ이스포츠 이벤트` - 대회 목록\n' +
          '`ㅂ이스포츠 팀 14` - T1 팀 정보 (ID로 조회)\n' +
          '`ㅂ이스포츠 팀 t1` - 이제 이름으로도 조회 가능',
        inline: false
      }
    )
    .setFooter({ text: '명령어 별칭: ㅂ대회, ㅂesports | 응답까지 최대 30초 소요' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// 이벤트 목록 표시
async function showEvents(message) {
  const loadingMsg = await message.reply('🔍 이스포츠 이벤트를 조회하는 중... (최대 30초 소요)');

  try {
    const events = await valorantApi.getEsportsEvents();

    if (!events || events.length === 0) {
      return loadingMsg.edit({ content: '❌ 현재 이벤트 정보가 없습니다.' });
    }

    // 최대 10개 이벤트 표시
    const displayEvents = events.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle('🏆 발로란트 이스포츠 이벤트')
      .setColor(0xFF4654)
      .setDescription(
        displayEvents.map((event, idx) => {
          const status = getStatusEmoji(event.status);
          const name = event.title || event.name || event.short_name || '이름 없음';
          const id = event.id || '';
          const regionCode = event.region || '';
          const regionName = REGION_MAP[regionCode] || regionCode;
          const region = regionCode ? ` | 🌍 ${regionName}` : '';
          const price = event.price && event.price !== '$0' ? ` | 💰 ${event.price}` : '';
          const startDate = formatDateShort(event.dates?.start);
          const endDate = formatDateShort(event.dates?.end);
          const dates = startDate ? `📅 ${startDate} ~ ${endDate}` : '';
          return `${status} **${idx + 1}. ${name}**\nID: \`${id}\`${region}${price}\n${dates}`;
        }).join('\n\n')
      )
      .setFooter({ text: `총 ${events.length}개 이벤트 중 ${displayEvents.length}개 표시 • ㅂ이스포츠 이벤트매치 [ID]로 매치 조회` })
      .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [embed] });
    
  } catch (error) {
    console.error('이벤트 조회 오류:', error);
    
    let errorMsg = '❌ 이벤트 정보를 불러올 수 없습니다.';
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 이벤트 매치 목록 표시
async function showEventMatches(message, eventId) {
  const loadingMsg = await message.reply('🔍 이벤트 매치를 조회하는 중... (최대 30초 소요)');

  try {
    const matches = await valorantApi.getEsportsEventMatches(eventId);

    if (!matches || matches.length === 0) {
      return loadingMsg.edit({ content: '❌ 해당 이벤트의 매치 정보가 없습니다.' });
    }

    const displayMatches = matches.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 이벤트 매치 목록 (ID: ${eventId})`)
      .setColor(0xFF4654)
      .setDescription(
        displayMatches.map((match, idx) => {
          const team1 = match.teams?.[0]?.name || '팀 1';
          const team2 = match.teams?.[1]?.name || '팀 2';
          const score1 = match.teams?.[0]?.score ?? '-';
          const score2 = match.teams?.[1]?.score ?? '-';
          const winner1 = match.teams?.[0]?.is_winner ? ' 🏆' : '';
          const winner2 = match.teams?.[1]?.is_winner ? ' 🏆' : '';
          const matchId = match.id || '';
          const date = formatDate(match.date);
          const series = match.series ? ` | ${match.series}` : '';
          const eventName = match.event ? `🏆 ${match.event}` : '';
          return `**${idx + 1}. ${team1}${winner1} vs ${team2}${winner2}**\n스코어: ${score1} - ${score2} | ID: \`${matchId}\`${series}\n${eventName ? `${eventName} | ` : ''}📅 ${date}`;
        }).join('\n\n')
      )
      .setFooter({ text: `총 ${matches.length}개 매치 중 ${displayMatches.length}개 표시 • ㅂ이스포츠 매치 [ID]로 상세 조회` })
      .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [embed] });
    
  } catch (error) {
    console.error('이벤트 매치 조회 오류:', error);
    
    let errorMsg = '❌ 이벤트 매치 정보를 불러올 수 없습니다.';
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 매치 상세 표시
async function showMatch(message, matchId) {
  const loadingMsg = await message.reply('🔍 매치 정보를 조회하는 중... (최대 30초 소요)');

  try {
    const match = await valorantApi.getEsportsMatch(matchId);

    if (!match) {
      return loadingMsg.edit({ content: '❌ 매치 정보를 찾을 수 없습니다.' });
    }

  const team1 = match.teams?.[0] || {};
  const team2 = match.teams?.[1] || {};
  const meta = match.metadata || {};

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${team1.name || '팀 1'} vs ${team2.name || '팀 2'}`)
    .setColor(0xFF4654)
    .addFields(
      {
        name: '📊 시리즈 스코어',
        value: `**${team1.name || '팀 1'}** (ID: \`${team1.id || '?'}\`): ${team1.score ?? '-'}\n**${team2.name || '팀 2'}** (ID: \`${team2.id || '?'}\`): ${team2.score ?? '-'}`,
        inline: true
      },
      {
        name: '📅 날짜',
        value: formatDate(meta.date || match.date),
        inline: true
      },
      {
        name: '📍 상태 / 포맷',
        value: `${getStatusEmoji(meta.status)} ${meta.status || '정보 없음'} | ${meta.format || ''}`,
        inline: true
      }
    );

  // 패치 정보
  if (meta.patch) {
    embed.addFields({ name: '🔧 패치', value: meta.patch, inline: true });
  }

  // 맵(게임)별 결과 + 선수 통계
  if (match.games && match.games.length > 0) {
    for (let idx = 0; idx < match.games.length; idx++) {
      const game = match.games[idx];
      const mapName = game.map || '알 수 없음';
      const t1 = game.teams?.[0] || {};
      const t2 = game.teams?.[1] || {};
      const winner1 = t1.is_winner ? ' 🏆' : '';
      const winner2 = t2.is_winner ? ' 🏆' : '';

      let mapText = `${team1.name}${winner1}: ${t1.score ?? '-'} (T:${t1.score_t ?? '-'} / CT:${t1.score_ct ?? '-'})\n${team2.name}${winner2}: ${t2.score ?? '-'} (T:${t2.score_t ?? '-'} / CT:${t2.score_ct ?? '-'})`;

      // 선수 통계 표시 (\ud300별 상위 MVP)
      const allPlayers = [];
      [t1, t2].forEach(t => {
        if (t.players) {
          t.players.forEach(p => {
            allPlayers.push({
              name: p.player?.name || '?',
              id: p.player?.id || '',
              team: t === t1 ? team1.name : team2.name,
              agent: p.agent || '?',
              rating: p.stats?.rating ?? 0,
              kda: `${p.stats?.kills ?? 0}/${p.stats?.deaths ?? 0}/${p.stats?.assists ?? 0}`,
              acs: p.stats?.acs ?? 0
            });
          });
        }
      });

      if (allPlayers.length > 0) {
        // 레이팅 순으로 상위 5명
        allPlayers.sort((a, b) => b.rating - a.rating);
        const topPlayers = allPlayers.slice(0, 5);
        mapText += '\n\n🎯 **MVP 선수:**\n' + topPlayers.map(p => 
          `\`${p.name}\` (ID:\`${p.id}\`) ${p.agent} | R:${p.rating} ACS:${p.acs} KDA:${p.kda}`
        ).join('\n');
      }

      embed.addFields({ name: `🗺️ 맵 ${idx + 1}: ${mapName}`, value: mapText });
    }
  }

  // 이벤트 정보
  if (meta.event) {
    const eventInfo = meta.event.title || meta.event.name || '정보 없음';
    const series = meta.event.series ? `\n${meta.event.series}` : '';
    embed.addFields({
      name: '🏆 이벤트',
      value: `${eventInfo}${series}`,
      inline: false
    });
  }

  embed.setFooter({ text: `매치 ID: ${matchId} • VLR.gg 기반` });
  embed.setTimestamp();

  await loadingMsg.edit({ content: null, embeds: [embed] });
  
  } catch (error) {
    console.error('매치 조회 오류:', error);
    
    let errorMsg = '❌ 매치 정보를 불러올 수 없습니다.';
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'NOT_FOUND') {
      errorMsg = `❌ 매치 ID \`${matchId}\`를 찾을 수 없습니다.`;
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 팀 정보 표시
async function showTeam(message, teamId) {
  const loadingMsg = await message.reply('🔍 팀 정보를 조회하는 중... (최대 30초 소요)');

  try {
    // ID 유효성 검사
    if (!teamId || teamId === 'null' || teamId === 'undefined') {
      return loadingMsg.edit({ content: '❌ 유효하지 않은 팀 ID입니다.' });
    }

    const team = await valorantApi.getEsportsTeam(teamId);

    if (!team) {
      return loadingMsg.edit({ content: '❌ 팀 정보를 찾을 수 없습니다.' });
    }

  // Firebase에 팀 정보 저장 (다음 검색을 위해)
  if (team.name) {
    const normalized = normalizeSearch(team.name);
    await saveTeamIdToCache(normalized, teamId, team.name);
  }

  // Firebase에 로스터 선수들 정보도 저장 (자동 학습)
  if (team.roster && team.roster.length > 0) {
    const players = team.roster.filter(p => p.role === 'player');
    for (const player of players) {
      if (player.id && (player.alias || player.name)) {
        const playerName = player.alias || player.name;
        const normalizedPlayer = normalizeSearch(playerName);
        await savePlayerIdToCache(normalizedPlayer, player.id, playerName);
        console.log(`✅ 선수 저장: ${playerName} (ID: ${player.id})`);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`👥 ${team.name || '팀 이름 없음'}`)
    .setColor(0xFF4654);

  if (team.logo) {
    embed.setThumbnail(team.logo);
  }

  if (team.tag) {
    embed.addFields({ name: '🏷️ 태그', value: team.tag, inline: true });
  }

  if (team.country) {
    const countryName = typeof team.country === 'object' ? team.country.name : team.country;
    embed.addFields({ name: '🌍 국가', value: countryName || '정보 없음', inline: true });
  }

  // 소셜 링크
  if (team.socials && team.socials.length > 0) {
    const socialText = team.socials.slice(0, 3).map(s => {
      const icon = s.platform === 'twitter' ? '🐦' : s.platform === 'twitch' ? '🟣' : '🔗';
      return `${icon} [${s.platform}](${s.url})`;
    }).join(' | ');
    embed.addFields({ name: '🔗 소셜', value: socialText, inline: true });
  }

  // 로스터 정보 (API 응답은 roster 배열)
  if (team.roster && team.roster.length > 0) {
    const players = team.roster.filter(p => p.role === 'player');
    const staff = team.roster.filter(p => p.role !== 'player');

    if (players.length > 0) {
      const roster = players.slice(0, 10).map(p => {
        const name = p.alias || p.name || '알 수 없음';
        const captain = p.is_captain ? ' ⭐' : '';
        const flag = p.country_code ? `:flag_${p.country_code}:` : '';
        const playerId = p.id ? ` (ID: \`${p.id}\`)` : '';
        return `• ${flag} **${name}**${captain}${playerId}`;
      }).join('\n');
      embed.addFields({ name: `🎮 선수 (${players.length}명)`, value: roster });
    }

    if (staff.length > 0) {
      const staffText = staff.slice(0, 5).map(s => {
        const name = s.alias || s.name || '알 수 없음';
        const role = s.role ? ` (${s.role})` : '';
        const staffId = s.id ? ` - ID: \`${s.id}\`` : '';
        return `• ${name}${role}${staffId}`;
      }).join('\n');
      embed.addFields({ name: '📋 스탭', value: staffText });
    }
  }

  embed.setFooter({ text: `팀 ID: ${teamId} • ㅂ이스포츠 팀 ${teamId} 매치 / 이적` });
  embed.setTimestamp();

  await loadingMsg.edit({ content: null, embeds: [embed] });
  
  } catch (error) {
    console.error('팀 조회 오류:', error);
    
    let errorMsg = '❌ 팀 정보를 불러올 수 없습니다.';
    
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다.\n잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다.\n잠시 후 다시 시도해주세요.';
    } else if (error.message === 'NOT_FOUND') {
      errorMsg = 
        `❌ 팀 ID \`${teamId}\`를 찾을 수 없습니다.\n\n` +
        `💡 **올바른 팀 ID 찾기:**\n` +
        `1. https://www.vlr.gg/ 접속\n` +
        `2. 팀 이름으로 검색\n` +
        `3. URL에서 ID 확인 (vlr.gg/team/**123**)\n\n` +
        `📌 **인기 팀 예시:**\n` +
        `• \`ㅂ이스포츠 팀 14\` - T1\n` +
        `• \`ㅂ이스포츠 팀 17\` - Gen.G\n` +
        `• \`ㅂ이스포츠 팀 geng\` - 이름으로 검색도 가능`;
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 팀 매치 표시
async function showTeamMatches(message, teamId) {
  const loadingMsg = await message.reply('🔍 팀 매치 정보를 조회하는 중... (최대 30초 소요)');

  try {
    const matches = await valorantApi.getEsportsTeamMatches(teamId);

    if (!matches || matches.length === 0) {
      return loadingMsg.edit({ content: '❌ 해당 팀의 매치 정보가 없습니다.' });
    }

    const displayMatches = matches.slice(0, 10);

    // 매치 데이터에서 팀 이름 추출 (API 호출 추가 없이)
    let teamName = `팀 ${teamId}`;
    if (displayMatches.length > 0) {
      const firstMatch = displayMatches[0];
      if (firstMatch.teams) {
        const team = firstMatch.teams.find(t => String(t.id) === String(teamId));
        if (team?.name) teamName = team.name;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${teamName} 최근 매치`)
      .setColor(0xFF4654)
      .setDescription(
      displayMatches.map((match, idx) => {
        const team1 = match.teams?.[0]?.name || '팀 1';
        const team2 = match.teams?.[1]?.name || '팀 2';
        const score1 = match.teams?.[0]?.score ?? '-';
        const score2 = match.teams?.[1]?.score ?? '-';
        const winner1 = match.teams?.[0]?.is_winner ? ' 🏆' : '';
        const winner2 = match.teams?.[1]?.is_winner ? ' 🏆' : '';
        const date = formatDate(match.date);
        const event = match.event || '';
        const series = match.series ? ` | ${match.series}` : '';
        return `**${idx + 1}. ${team1}${winner1} ${score1} - ${score2} ${team2}${winner2}**\n${event ? `🏆 ${event}${series} | ` : ''}📅 ${date}`;
      }).join('\n\n')
    )
    .setFooter({ text: `총 ${matches.length}개 매치 중 ${displayMatches.length}개 표시` })
    .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [embed] });
    
  } catch (error) {
    console.error('팀 매치 조회 오류:', error);
    
    let errorMsg = '❌ 팀 매치 정보를 불러올 수 없습니다.';
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 팀 이적 정보 표시
async function showTeamTransactions(message, teamId) {
  const loadingMsg = await message.reply('🔍 팀 이적 정보를 조회하는 중...');

  try {
    const transactions = await valorantApi.getEsportsTeamTransactions(teamId);

    if (!transactions || transactions.length === 0) {
      return loadingMsg.edit({ content: '❌ 해당 팀의 이적 정보가 없습니다.' });
    }

    // 이적 정보에서 팀 이름 추출 (API 호출 추가 없이)
    let teamName = `팀 ${teamId}`;
    if (transactions.length > 0 && transactions[0].team?.name) {
      teamName = transactions[0].team.name;
    }

    const displayTransactions = transactions.slice(0, 15);

  const embed = new EmbedBuilder()
    .setTitle(`🔄 ${teamName} 이적/변동 내역`)
    .setColor(0xFF4654)
    .setDescription(
      displayTransactions.map((tx, idx) => {
        const player = tx.player || tx.name || '알 수 없음';
        const type = tx.type || tx.action || '이동';
        const date = formatDate(tx.date);
        const typeEmoji = type.toLowerCase().includes('join') || type.toLowerCase().includes('add') ? '🟢' :
                         type.toLowerCase().includes('leave') || type.toLowerCase().includes('remove') ? '🔴' : '🔄';
        return `${typeEmoji} **${player}** - ${type}\n📅 ${date}`;
      }).join('\n\n')
    )
    .setFooter({ text: `총 ${transactions.length}개 변동 중 ${displayTransactions.length}개 표시` })
    .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [embed] });
    
  } catch (error) {
    console.error('팀 이적 정보 조회 오류:', error);
    
    let errorMsg = '❌ 팀 이적 정보를 불러올 수 없습니다.';
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 선수 정보 표시
async function showPlayer(message, playerId) {
  const loadingMsg = await message.reply('🔍 선수 정보를 조회하는 중... (최대 30초 소요)');

  try {
    // ID 유효성 검사
    if (!playerId || playerId === 'null' || playerId === 'undefined') {
      return loadingMsg.edit({ content: '❌ 유효하지 않은 선수 ID입니다.' });
    }

    const player = await valorantApi.getEsportsPlayer(playerId);

    if (!player) {
      return loadingMsg.edit({ content: '❌ 선수 정보를 찾을 수 없습니다.' });
    }

  // Firebase에 선수 정보 저장 (다음 검색을 위해)
  if (player.name) {
    const normalized = normalizeSearch(player.name);
    await savePlayerIdToCache(normalized, playerId, player.name);
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${player.name || player.ign || '선수 이름 없음'}`)
    .setColor(0xFF4654);

  if (player.avatar) {
    embed.setThumbnail(player.avatar);
  }

  const fields = [];

  if (player.real_name) {
    fields.push({ name: '👤 실명', value: player.real_name, inline: true });
  }

  if (player.country) {
    const countryName = typeof player.country === 'object' ? player.country.name : player.country;
    fields.push({ name: '🌍 국가', value: countryName || '정보 없음', inline: true });
  }

  // 현재 소속팀
  if (player.current_teams && player.current_teams.length > 0) {
    const teams = player.current_teams.map(t => t.name).join(', ');
    fields.push({ name: '👥 현재 소속팀', value: teams, inline: true });
  }

  // 이전 소속팀
  if (player.past_teams && player.past_teams.length > 0) {
    const pastTeams = player.past_teams.slice(0, 5).map(t => t.name).join(', ');
    fields.push({ name: '📋 이전 소속팀', value: pastTeams, inline: true });
  }

  // 소셜 링크
  if (player.socials && player.socials.length > 0) {
    const socialText = player.socials.slice(0, 3).map(s => {
      const icon = s.platform === 'twitter' ? '🐦' : s.platform === 'twitch' ? '🟣' : '🔗';
      return `${icon} [${s.platform}](${s.url})`;
    }).join(' | ');
    fields.push({ name: '🔗 소셜', value: socialText });
  }

  // 요원별 통계 (agent_stats)
  if (player.agent_stats && player.agent_stats.length > 0) {
    const topAgents = player.agent_stats.slice(0, 3);
    const statsText = topAgents.map(a => {
      const s = a.stats || {};
      return `**${a.agent}** (${a.usage?.count || 0}경기)\n레이팅: ${s.rating ?? '-'} | ACS: ${s.acs ?? '-'} | K/D: ${s.kd ?? '-'} | ADR: ${s.adr ?? '-'}`;
    }).join('\n');
    fields.push({ name: '📊 요원별 통계 (최근)', value: statsText });
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  embed.setFooter({ text: `선수 ID: ${playerId} • ㅂ이스포츠 선수 ${playerId} 매치` });
  embed.setTimestamp();

  await loadingMsg.edit({ content: null, embeds: [embed] });
  
  } catch (error) {
    console.error('선수 조회 오류:', error);
    
    let errorMsg = '❌ 선수 정보를 불러올 수 없습니다.';
    
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다.\n잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다.\n잠시 후 다시 시도해주세요.';
    } else if (error.message === 'NOT_FOUND') {
      errorMsg = 
        `❌ 선수 ID \`${playerId}\`를 찾을 수 없습니다.\n\n` +
        `💡 **올바른 선수 ID 찾기:**\n` +
        `1. https://www.vlr.gg/ 접속\n` +
        `2. 선수 이름으로 검색\n` +
        `3. URL에서 ID 확인 (vlr.gg/player/**123**)\n\n` +
        `📌 또는 \`ㅂ이스포츠 선수 [이름]\`으로 검색해보세요.`;
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 선수 매치 표시
async function showPlayerMatches(message, playerId) {
  const loadingMsg = await message.reply('🔍 선수 매치 정보를 조회하는 중... (최대 30초 소요)');

  try {
    const matches = await valorantApi.getEsportsPlayerMatches(playerId);

    if (!matches || matches.length === 0) {
      return loadingMsg.edit({ content: '❌ 해당 선수의 매치 정보가 없습니다.' });
    }

    // 매치 데이터에서 선수 이름 추출 (API 호출 추가 없이)
    let playerName = `선수 ${playerId}`;
    // 매치 데이터엔 선수 이름이 없어서 ID만 표시
    
    const displayMatches = matches.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${playerName} 최근 매치`)
      .setColor(0xFF4654)
      .setDescription(
        displayMatches.map((match, idx) => {
          const team1 = match.teams?.[0]?.name || '팀 1';
          const team2 = match.teams?.[1]?.name || '팀 2';
          const score1 = match.teams?.[0]?.score ?? '-';
          const score2 = match.teams?.[1]?.score ?? '-';
          const winner1 = match.teams?.[0]?.is_winner ? ' 🏆' : '';
          const winner2 = match.teams?.[1]?.is_winner ? ' 🏆' : '';
          const date = formatDate(match.date);
          const event = match.event || '';
          const series = match.series ? ` | ${match.series}` : '';
          return `**${idx + 1}. ${team1}${winner1} ${score1} - ${score2} ${team2}${winner2}**\n${event ? `🏆 ${event}${series} | ` : ''}📅 ${date}`;
        }).join('\n\n')
      )
      .setFooter({ text: `총 ${matches.length}개 매치 중 ${displayMatches.length}개 표시` })
      .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [embed] });
    
  } catch (error) {
    console.error('선수 매치 조회 오류:', error);
    
    let errorMsg = '❌ 선수 매치 정보를 불러올 수 없습니다.';
    if (error.message === 'API_TIMEOUT') {
      errorMsg = '⏱️ API 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message === 'RATE_LIMIT') {
      errorMsg = '⚠️ API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    await loadingMsg.edit({ content: errorMsg });
  }
}

// 이스포츠 도움말 표시
async function showEsportsHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 이스포츠 명령어 도움말')
    .setColor(0xFF4654)
    .setDescription('VLR.gg 기반 발로란트 이스포츠 정보를 조회합니다.')
    .addFields(
      {
        name: '📋 이벤트/대회',
        value:
          '`ㅂ이스포츠` - 현재 이벤트 목록 조회\n' +
          '`ㅂ이스포츠 이벤트매치 [이벤트ID]` - 이벤트 매치 조회'
      },
      {
        name: '⚔️ 매치',
        value:
          '`ㅂ이스포츠 매치 [매치ID]` - 매치 상세 정보 조회'
      },
      {
        name: '👥 팀',
        value:
          '`ㅂ이스포츠 팀 [팀이름/ID]` - 팀 정보 조회\n' +
          '`ㅂ이스포츠 팀 [팀이름/ID] 매치` - 팀 최근 매치 조회\n' +
          '`ㅂ이스포츠 팀 [팀이름/ID] 이적` - 팀 이적/변동 조회\n' +
          '예: `ㅂ대회 팀 GenG` 또는 `ㅂ대회 팀 1001`'
      },
      {
        name: '🎮 선수',
        value:
          '`ㅂ이스포츠 선수 [선수이름/ID]` - 선수 정보 조회\n' +
          '`ㅂ이스포츠 선수 [선수이름/ID] 매치` - 선수 매치 조회\n' +
          '예: `ㅂ대회 선수 텍스쳐` 또는 `ㅂ대회 선수 1144`'
      },
      {
        name: '💡 단축 명령어',
        value: '`ㅂ대회`, `ㅂesports` 도 사용 가능합니다.'
      },
      {
        name: '🔍 ID 찾는 방법',
        value:
          '• **이벤트 ID**: `ㅂ이스포츠` 명령어로 확인\n' +
          '• **매치 ID**: `ㅂ이스포츠 이벤트매치 [ID]`로 확인\n' +
          '• **팀/선수 ID**: `ㅂ이스포츠 매치 [ID]`에서 확인\n' +
          '• VLR.gg URL에서도 확인 가능 (vlr.gg/team/**123** → ID: 123)'
      }
    )
    .setFooter({ text: 'VLR.gg 데이터 기반 • Henrik API v4.6.0' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
