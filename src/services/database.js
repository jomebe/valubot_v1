import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { saveJsonToFile, loadJsonFromFile } from '../utils/fileManager.js';
import { FILE_PATHS, DEFAULT_GUILD_SETTINGS } from '../config/constants.js';
import { getFirestore } from 'firebase/firestore';

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
    return true;
  }

  try {
    await setDoc(doc(db, `guilds/${guildId}`), settings);
    return true;
  } catch (error) {
    return false;
  }
}

// 서버별 설정 로드
export async function loadGuildSettings(guildId) {
  if (!db) {
    return { ...DEFAULT_GUILD_SETTINGS };
  }

  try {
    const docRef = doc(db, `guilds/${guildId}`);
    let settings = { ...DEFAULT_GUILD_SETTINGS };
    
    try {
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        settings = { ...settings, ...docSnap.data() };
      } else {
        try {
          await setDoc(docRef, settings);
        } catch (saveError) {
          // 저장 실패 시 무시
        }
      }
    } catch (firebaseError) {
      // 로컬 파일 사용
      const localSettings = loadJsonFromFile(`${FILE_PATHS.GUILD_SETTINGS}_${guildId}.json`);
      if (localSettings) {
        settings = { ...settings, ...localSettings };
      }
    }

    return settings;
  } catch (error) {
    return { ...DEFAULT_GUILD_SETTINGS };
  }
}

// 발로란트 계정 정보 가져오기
export async function getValorantAccount(userId) {
  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.valorantAccount || null;
    }
    
    return null;
  } catch (error) {
    console.error('발로란트 계정 정보 가져오기 실패:', error);
    return null;
  }
} 