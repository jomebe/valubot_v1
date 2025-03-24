FROM node:18

# 필수 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm install

# 소스 코드 복사
COPY . .

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=10000

# 포트 노출
EXPOSE 10000

# 애플리케이션 실행
CMD ["node", "src/index.js"] 