import { db } from '../config/firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const unregisterCommand = {
  name: 'ㅂ발로삭제',
  execute: async (message, args) => {
    try {
      const guildId = message.guild.id;
      const userId = message.author.id;

      // Firebase에서 현재 데이터 가져오기
      const docRef = doc(db, 'valorant_accounts', guildId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return message.reply('❌ 등록된 계정이 없습니다.');
      }

      const guildData = docSnap.data();

      // 사용자의 계정이 있는지 확인
      if (!guildData[userId]) {
        return message.reply('❌ 등록된 계정이 없습니다.');
      }

      // 계정 정보 삭제
      delete guildData[userId];

      // Firebase에 업데이트된 데이터 저장
      await setDoc(docRef, guildData);

      return message.reply('✅ 발로란트 계정이 삭제되었습니다.');
    } catch (error) {
      console.error('계정 삭제 중 오류:', error);
      return message.reply('❌ 계정 삭제에 실패했습니다.');
    }
  }
}; 