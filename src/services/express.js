import express from 'express';
import axios from 'axios';

export function setupExpressServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      uptime: process.uptime(),
      lastPing: new Date().toISOString()
    });
  });

  app.get('/keep-alive', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  app.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error('서버 시작 실패:', err);
      return;
    }
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
  });

  // Keep-alive ping
  setInterval(async () => {
    try {
      const response = await axios.get(`${process.env.RENDER_EXTERNAL_URL}/keep-alive`);
      console.log('Keep-alive ping 성공:', response.data);
    } catch (error) {
      console.error('Keep-alive ping 실패:', error);
    }
  }, 10 * 60 * 1000);
} 