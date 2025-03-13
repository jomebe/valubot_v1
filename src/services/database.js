import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { saveJsonToFile, loadJsonFromFile } from '../utils/fileManager.js';
import { FILE_PATHS, DEFAULT_GUILD_SETTINGS } from '../config/constants.js';

export async function saveAttendanceData(data) {
  try {
    await setDoc(doc(db, 'data', 'attendance'), data);
    saveJsonToFile(FILE_PATHS.ATTENDANCE, data);
    console.log('출석 데이터 저장 완료 (Firebase + 로컬)');
  } catch (error) {
    console.error('출석 데이터 저장 중 오류:', error);
  }
}

export async function loadAttendanceData() {
  try {
    const docRef = doc(db, 'data', 'attendance');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      saveJsonToFile(FILE_PATHS.ATTENDANCE, data);
      return data;
    }
    
    const localData = loadJsonFromFile(FILE_PATHS.ATTENDANCE);
    if (localData) {
      await setDoc(docRef, localData);
      return localData;
    }
    
    return {};
  } catch (error) {
    console.error('출석 데이터 로드 중 오류:', error);
    return {};
  }
}

// 비슷한 패턴으로 다른 데이터 처리 함수들도 추가 

// 서버별 설정 저장
export async function saveGuildSettings(guildId, settings) {
  // 로컬 저장
  saveJsonToFile(`${FILE_PATHS.GUILD_SETTINGS}_${guildId}.json`, settings);

  if (!db) {
    console.warn('Firebase가 초기화되지 않았습니다. 로컬에만 저장됩니다.');
    return true;
  }

  try {
    console.log(`서버 설정 저장 시도 (${guildId})`);
    await setDoc(doc(db, `guilds/${guildId}`), settings);
    console.log('저장 성공');
    return true;
  } catch (error) {
    console.error('저장 실패:', error);
    return false;
  }
}

// 서버별 설정 로드
export async function loadGuildSettings(guildId) {
  if (!db) {
    console.warn('Firebase가 초기화되지 않았습니다. 기본 설정을 사용합니다.');
    return { ...DEFAULT_GUILD_SETTINGS };
  }

  try {
    console.log(`서버 설정 로드 시도 (${guildId})`);
    const docRef = doc(db, `guilds/${guildId}`);
    let settings = { ...DEFAULT_GUILD_SETTINGS };
    
    try {
      const docSnap = await getDoc(docRef);
      console.log('문서 스냅샷:', docSnap.exists() ? '존재함' : '존재하지 않음');
      
      if (docSnap.exists()) {
        settings = { ...settings, ...docSnap.data() };
        console.log(`서버 설정 로드 성공 (${guildId})`);
      } else {
        console.log(`새로운 서버 설정 생성 중 (${guildId})`);
        try {
          await setDoc(docRef, settings);
          console.log('새 설정 저장 성공');
        } catch (saveError) {
          console.error('새 설정 저장 실패:', saveError);
        }
      }
    } catch (firebaseError) {
      console.warn(`Firebase 작업 실패 (${guildId}):`, firebaseError);
      
      // 로컬 파일 사용
      const localSettings = loadJsonFromFile(`${FILE_PATHS.GUILD_SETTINGS}_${guildId}.json`);
      if (localSettings) {
        settings = { ...settings, ...localSettings };
        console.log('로컬 설정 사용');
      }
    }

    return settings;
  } catch (error) {
    console.error(`설정 로드 중 치명적 오류 (${guildId}):`, error);
    return { ...DEFAULT_GUILD_SETTINGS };
  }
} 