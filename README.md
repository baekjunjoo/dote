# Dote (dot + note)

시각장애인이 완전히 사용 가능한 노션형 노트 PWA.

- 스크린리더(NVDA/VoiceOver) + 키보드 완결 조작 — ARIA tree/grid, aria-live 안내, 무음 금지 원칙
- `/` 슬래시 블록 메뉴, 마크다운 단축, 토글·콜아웃·할 일 등 12종 블록
- 음성 명령·받아쓰기 (Web Speech, 에코 가드, 오프라인 키워드 매칭)
- 한국 점자 G2·UEB G2 점역 엔진 → 20셀 점자 라인 미리보기 (DotPad 시뮬레이션)
- eBraille 1.0 (.ebrl) 표준 내보내기
- 오프라인 동작(서비스 워커), 홈 화면 설치(PWA)

## 구조
- `index.html` — 앱 본체 (Tactile Light 디자인 시스템)
- `braille.js` — 검증된 한국 점자·UEB 점역 엔진 (표 값 수정 금지)
- `ebraille.js` — eBraille OCF 컨테이너 빌더
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA

배포: GitHub Pages (push 시 자동)
