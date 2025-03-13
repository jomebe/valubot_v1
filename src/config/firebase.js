import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ES 모듈에서 __dirname 사용하기 위한 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 환경 변수 로드 (.env 파일 경로 지정)
dotenv.config({ path: join(__dirname, '../../.env') });

// 환경 변수 로드 확인
console.log('Firebase 환경 변수 확인:');
Object.keys(process.env).forEach(key => {
  if (key.startsWith('FIREBASE_')) {
    console.log(`${key}: ${process.env[key] ? '설정됨' : '미설정'}`);
  }
});

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Firebase 초기화
let db = null;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log('Firebase 초기화 성공');
  console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
} catch (error) {
  console.error('Firebase 초기화 실패:', error);
  console.error('Firebase Config:', JSON.stringify(firebaseConfig, null, 2));
}

export { db }; 