# Valubot (발로봇)

VALORANT 전적 조회 및 데일리 샵(상점) 확인 기능 등을 지원하는 디스코드 봇입니다.

## 주요 기능

1. **오늘의 상점 조회 (Daily Shop Checker)**
   - `/상점`, `ㅂ상점`, `ㅂㅅㅈ`
   - 디스코드 계정과 연동된 라이엇 계정의 당일 발로란트 상점 스킨 목록(4개), 가격(VP), 이미지, 남은 초기화 시간을 확인합니다.
2. **라이엇 계정 로그인 (연동)**
   - `/로그인`, `ㅂ로그인`, `ㅂㄹㄱㅇ`
   - 디스코드 버튼 클릭을 통해 공식 라이엇 로그인(QR 로그인 포함) 후 자동으로 계정이 연동되는 완전 자동화된 로그인 흐름을 사용합니다.
3. **라이엇 계정 로그아웃 (연동 해제)**
   - `/로그아웃`, `ㅂ로그아웃`, `ㅂㄹㄱㅇㅇ`
   - 연동된 라이엇 토큰 및 계정 세션 정보를 봇에서 즉시 영구 삭제합니다.

## 보안 요구사항 및 토큰 저장 방식

- **비밀번호 저장 없음**: 사용자의 라이엇 ID 및 비밀번호는 절대 묻지도, 저장하지도 않습니다.
- **데이터 최소화**: 상점 조회를 위한 PUUID, 리전, 암호화된 액세스 토큰 및 엔타이틀먼트 토큰만 디스크에 저장합니다.
- **안전한 암호화**: 디스크에 저장되는 모든 민감한 라이엇 토큰 필드는 `ENCRYPTION_KEY`를 이용해 **AES-256-CBC** 방식으로 암호화되어 안전하게 보관됩니다.
- **개인정보 유출 방지**:
  - `/로그인` 명령어 응답은 디스코드의 **에페메럴(비공개) 메시지**로 처리됩니다.
  - 접두사 명령어(`ㅂ로그인`) 사용 시 공용 채널에 민감한 정보가 노출되지 않도록 **DM(개인 메시지)**으로 로그인 링크가 전송됩니다.

## 설정 및 실행 방법

### 1. 환경 변수 설정
프로젝트 루트 디렉토리에 `.env` 파일을 만들고 아래 내용을 작성합니다. (템플릿은 `.env.example`을 참고하세요)

```env
# 디스코드 봇 토큰 (필수)
DISCORD_TOKEN=your_discord_bot_token

# HenrikDev 발로란트 API 키 (옵션 - 전적 조회용)
VALORANT_API_KEY=your_henrikdev_api_key

# 세션 데이터 암호화용 비밀키 (필수)
# 임의의 무작위 텍스트나 문자열을 지정하세요. 저장되는 라이엇 토큰들을 암호화하는 데 사용됩니다.
ENCRYPTION_KEY=your_secure_random_string_here
```

### 2. 패키지 설치
```bash
npm install
```

### 3. 실행
- **개발 환경 (Nodemon 실행)**:
  ```bash
  npm run dev
  ```
- **프로덕션 환경**:
  ```bash
  npm start
  ```

## 호스팅 로그인 콜백 설정 (Cloudflare Pages)

이 프로젝트는 편리하고 안전한 로그인 연동을 위해 Cloudflare Pages와 연동하여 동작하는 자동 로그인 콜백을 지원합니다.

### 1. Cloudflare Pages 배포 설정
Riot Developer / RSO 애플리케이션 심사를 대비해 다음과 같이 Cloudflare Pages 프로젝트를 설정합니다.

- **프로젝트 이름 (Project name)**: `valubot-v1`
- **프로덕션 URL (Production URL)**: `https://valubot-v1.pages.dev`
- **루트 디렉터리 (Root directory)**: `callback-site`
- **빌드 명령 (Build command)**: `(비워둠/사용안함)`
- **출력 디렉터리 (Output directory)**: `.` (루트 디렉터리 `callback-site` 전체를 서빙)

### 2. Riot RSO 연동 및 심사용 필수 URL 정보
Riot 개발자 포털의 RSO 신청 양식(Application form) 작성 시 아래의 주소들을 기재해 주세요:

- **개인정보 처리방침 URL (Privacy Policy URL)**: `https://valubot-v1.pages.dev/privacy`
- **이용 약관 URL (Terms of Service URL)**: `https://valubot-v1.pages.dev/terms`
- **리다이렉트 URI (Redirect URI)**: `https://valubot-v1.pages.dev/auth/callback`
- **로그아웃 후 리다이렉트 URI (Post Logout Redirect URI)**: `https://valubot-v1.pages.dev/`
- **디스코드 봇 초대 URL (Discord Invite URL)**: `https://discord.com/oauth2/authorize?client_id=1348997551352840203&permissions=8&integration_type=0&scope=bot`
  - *Note: RSO 심사용 초대 링크이며 관리자 권한(permissions=8)을 요구합니다.*
  - *TODO (권장): 추후 프로덕션 환경 투입 시, 최소 권한 원칙(Least Privilege)에 따라 관리자 권한을 제거하고, 슬래시 명령어 활성화를 위해 `applications.commands` 스코프를 추가한 최소 권한 초대 링크(예: `scope=bot%20applications.commands&permissions=X` 형식)로 대체하세요.*

### 3. 백엔드 주소 설정
- 실제 봇을 서비스에 투입할 때는 `callback-site/config.js` 파일을 열어 `window.VALUBOT_BACKEND_URL` 값을 봇의 실제 백엔드 외부 API 주소(예: `https://valubot-v1-vqc9.onrender.com`)로 설정하고 저장소에 푸시하면 됩니다.
