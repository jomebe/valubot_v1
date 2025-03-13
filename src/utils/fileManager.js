import fs from 'fs';
import path from 'path';
import { FILE_PATHS } from '../config/constants.js';

export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function cleanupTempFolder(tempDir) {
  try {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > 1800000) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`temp 폴더 정리 완료: ${cleanedCount}개 파일 삭제됨`);
    }
  } catch (error) {
    console.error('temp 폴더 정리 중 오류:', error);
  }
}

export function saveJsonToFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`파일 저장 중 오류 (${filePath}):`, error);
    return false;
  }
}

export function loadJsonFromFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`파일 로드 중 오류 (${filePath}):`, error);
    return null;
  }
} 