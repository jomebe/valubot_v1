export const VOICE_SETTINGS = {
  CYCLE_ROLE_ID: process.env.VOICE_CYCLE_ROLE_ID,
  CYCLE_THRESHOLD: 6,
  RESET_INTERVAL: 5 * 60 * 1000,
  CREATOR_CHANNEL_ID: '1348216782132871220',
  TEMP_CATEGORY: '임시 음성채널'
};

export const FILE_PATHS = {
  VOICE_LOG: './voiceLog.json',
  VOLUME_SETTINGS: './volumeSettings.json',
  ATTENDANCE: './attendance.json',
  TIMEOUT_HISTORY: './timeoutHistory.json'
};

export const COMMAND_ALIASES = {
  'ㄷㅇ': 'ㅂ도움',
  'ㄹㄷㅁ': 'ㅂ랜덤맵',
  'ㅂㄹㄷㄹ': 'ㅂ발로등록',
  'ㅂㄹ': 'ㅂ발로',
  'ㅈㄱ': 'ㅂ전적',
  'ㅁㅊ': 'ㅂ매치',
  'ㄹㄷㅂㄷ': 'ㅂ리더보드',
  'ㅌㅇ': 'ㅂ티어',
  'ㅈㅈㅈ': 'ㅂ조준점',
  'ㅇㅇ': 'ㅂ요원',
  'ㅁㄱ': 'ㅂ무기',
  'ㅂㄱ': 'ㅂ비교'
};

// 서버별 기본 설정
export const DEFAULT_GUILD_SETTINGS = {
  prefix: 'ㅂ',
  language: 'ko',
  adminRoles: [],
  logChannel: null,
  welcomeChannel: null,
  autoRole: null
};

// 서버별 설정을 저장할 Map
export const guildSettings = new Map(); 