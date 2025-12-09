🚀 WebRTC P2P 화상 채팅 프로젝트
1. 📌 프로젝트 소개

본 프로젝트는 WebRTC(Web Real-Time Communication) 기술을 기반으로
브라우저 간 P2P(Peer-to-Peer) 직접 연결을 통해 실시간 화상 채팅을 구현한 애플리케이션입니다.

시그널링(SDP·ICE 교환)에만 서버 사용

실제 오디오/비디오/데이터는 서버를 거치지 않고 브라우저 간 직접 교환

서버 부하 최소화 + 지연 시간 단축

2. 🏗️ 아키텍처 및 기술 스택
구분	기술 스택	설명
🎨 프론트엔드	React.js(Vite), HTML5 Media API, CSS	UI 구성, 카메라·마이크 접근, WebRTC 컨트롤
🛰️ 백엔드 (시그널링)	Node.js, Express, Socket.IO	SDP/ICE 메시지 교환 중개
🔗 핵심 통신	WebRTC (RTCPeerConnection, RTCDataChannel)	P2P 미디어/데이터 전송
3. ✨ 구현 기능
📹 1) 실시간 화상·음성 채팅

브라우저 간 P2P 연결을 통해 지연 없는 실시간 스트리밍 제공.

🖥️ 2) 화면 공유

전체 화면 또는 특정 창/탭을 선택하여 상대에게 스트리밍.

📁 3) 파일 전송

RTCDataChannel을 이용한 서버를 거치지 않는 직접 파일 전송.

🚪 4) 채팅방 관리 (Room ID 기반)

Room ID 생성·입장·퇴장 및 사용자 수 제어.

🧹 5) 자동 방 삭제 로직 개선

마지막 사용자가 퇴장하면 서버가 방을 즉시 삭제 → Room ID 재사용 가능.

4. ⚙️ 개발 환경 설정 및 실행 방법

WebRTC 테스트는 두 개 이상의 브라우저 또는 기기가 필요합니다.

A. 📦 의존성 설치
# 프로젝트 루트(webrtc-p2p-vite)
npm install

# 서버(server) 폴더
cd server
npm install

B. ▶️ 실행 방법

총 2~3개의 터미널이 필요합니다.

1) 🛰️ 백엔드 시그널링 서버 실행 (포트 3001)
npm start

2) 🌐 프론트엔드 개발 서버 실행 (포트 5173)
npm run dev

C. 🌍 외부 접속 테스트 (Ngrok 사용)

WebRTC는 보안 환경(HTTPS)에서만 정상 동작하므로
외부 기기 테스트 시 Ngrok을 이용합니다.

ngrok http 3001


Ngrok이 제공하는 HTTPS 주소를 시그널링 서버 URL로 사용합니다.
예) https://your-ngrok-id.ngrok-free.app

5. 🧩 기술적 이슈 및 해결 과정
이슈 유형	문제	해결 방법
🔐 HTTPS 문제	로컬 서버 HTTP 환경이라 WebRTC 작동 X	Ngrok으로 HTTPS 터널링 제공
🧱 기능 버그	마지막 사용자가 나가도 방이 남아 ID 재사용 불가	Socket.IO 로직 수정 → 사용자 수 체크 후 즉시 방 삭제
🌐 NAT 문제	일부 네트워크 환경에서 P2P 연결 실패	STUN 기본 적용 / 향후 TURN 서버 도입 계획
6. 🔮 향후 개선 계획
🌐 1) TURN 서버 구축

NAT/방화벽 환경에서도 안정적인 연결 보장

미디어 릴레이 서버로 WebRTC 품질 향상

🔑 2) 인증/보안 강화

JWT 기반 인증

방 입장 권한 관리 및 사용자 검증

📡 3) 서버 확장성

Socket.IO 클러스터링 도입

시그널링 서버 스케일 아웃
