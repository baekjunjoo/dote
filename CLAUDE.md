# Dote — 점으로 쓰는 노트

시각장애인이 완전히 사용 가능한 노션형 워크스페이스. 스크린리더·키보드·음성·DotPad 촉각 출력을 모두 지원하는 PWA.

## 배포

- **자동 배포**: main 푸시 → GitHub Pages(https://baekjunjoo.github.io/dote/) + Cloudflare Workers(https://dote.mason-db0.workers.dev/) 동시 반영. 배포 약 40초.
- **필수 규칙**: JS/HTML/manifest/icon 등 자산을 바꾸면 반드시 `sw.js`의 캠시 버전(`dote-vNN`)을 올린다. 안 올리면 기존 사용자에게 예전 파일이 서빙된다.
- 새 정적 파일을 추가하면 `sw.js`의 CORE 배열에도 추가.

## 아키텍처 — 클래식 스크립트 전역 공유 (중요)

번들러 없음. 모든 파일이 클래식 `<script>`로 로드되며 **전역 렉시컬 스코프를 공유**한다:

- 로드 순서: `braille.js`(KB) → `ebraille.js`(EB) → index.html 인라인(앱 본체) → `dotpad.js` → `templates.js`·`superdot-tts.js`·`auth.js`(dotpad.js가 동적 로드)
- 뒤에 로드된 스크립트는 앞의 **전역 function 선언을 재할당**(훅)하고 `let/const` 전역(state, RULES, panOfs, ttsOn, micOn 등)을 읽고 쓸 수 있다.
- 이미 훅 된 함수: `announce`, `echoGuard`, `matchCmd`, `renderBraille`, `renderTree`, `toggleMic`, `queueBraille`, `onInput`, `save`. 새 훅을 만들 때는 `const _orig=fn; fn=function(){...}` 패턴 유지.
- index.html을 재배포할 때 인라인 스크립트 전역 이름을 바꾸면 모듈들이 깨진다.

### dotpad.js 섹션 구성 (파일 상단 목차 주석과 동일하게 유지할 것)
[0] superdot-tts · [1] voice-io · [2] 미매칭 로그 · [3] RULES+회의록 · [4] BLE(다중 기기 미러링) · [5] 앱 훅 · [6] templates.js · [7] 실시간 점자 · [8] UI IIFE(미리보기·저시력·고대비·확대·속도·복원 버튼 + [9]내보내기 [10]온보딩 [11]업데이트 알림 [12]설치 [13]모바일 [14]auth 로드) · [15] 생산성(개요·할일·오늘·Reader) · [16] 유지관리(영역 Undo/Redo·백업 zip·보관함·복원·글자수·용량 경고)
훅 체인 순서는 dotpad.js 상단 주석 참조. 새 훅 추가 시 그 목차·체인 주석을 함께 갱신한다.

## DotPad SDK 계약 (실기기 검증 — 의미 변경 금지)

- `setCallBack`은 **connectBleDevice 전에** 등록. 콜백 시그니처 `(device, code, data)` / `(device, key, detail)`.
- `onMessage`에서 `"Connected"` 수신 후에만 전송 시작. `connectBleDevice`는 DotDevice 또는 null 반환.
- 전송은 행단위 `displayLineData(lineId, startCell, hexData, DisplayMode, device)`만 사용. 그래픽 행 lineId 1–10, 텍스트 라인 lineId 0. DisplayMode는 문자열 "GraphicMode"/"TextMode".
- 셀 인코딩: bit = y%4 + (x%2)*4, 60×40 → 10행×30바이트. keep-alive 1초 1행 재전송, 행 차분 전송, setTimeout(0) 마이크로배치.
- 멀티라인 점자: 그래픽 60×40 = 20셀×10줄(셀 피치 3×4px). 텍스트 라인 20셀 = 상태(블록위치 M-D)만.
- DotPad 키: Pan=블록 이동, F1=위치 읽기, F2=블록 메뉴, F3=트리 그래픽, F4=전체 읽기.

## 점자 (korean-braille / ebraille)

- `KB.brailleCells(str)`→점 배열, `KB.dotsToByte`, `KB.strToTextCells`, `KB.setGrade("g1"|"g2")`, `EB.buildEbrl`(eBraille 1.0 OCF, mimetype STORED 선행), `EB.textToBraille`.
- 검증 벡터(깨지면 안 됨, 기본 grade=g2): 팔다=[[1,4,5],[2],[2,4]] · 것이다=⠸⠎⠕⠊ · working=⠐⠺⠬ · 그리고=[[1],[1,3,6]]

## 클라우드 (Supabase)

- 프로젝트 ref `ilzptifmkdncllsujdms` (서울, 무료). URL·anon 키는 auth.js에 (anon 키는 공개용, RLS로 보호).
- 테이블 `public.docs(user_id uuid PK → auth.users, data jsonb, updated_at)`. RLS: 본인 행만 CRUD.
- 동기화: LWW(최신 수정본 우선). 로그인 시 pull, 이후 save()마다 2초 디바운스 upsert. 오프라인이면 조용히 로컬 전용.
- 로컬 저장 키: `dote2` (pages+cur), `dote_miss`, `dote_tts_rate`.

## 비시각 UX 원칙 (tactile-ux — 모든 기능에 적용)

1. **무음 금지**: 모든 상태 변화는 `announce(msg)` 호출 (aria-live + 상태줄 + TTS 삼중 피드백).
2. TTS 끄면 aria-live만 남김 (스크린리더 이중발화 방지).
3. 파괴적 동작은 2단계 확인 (페이지 삭제 = 4초 내 재실행).
4. 읽기 목적 점자는 블록 처음부터, 입력 중에만 커서 추적.
5. 새 UI는 반드시 키보드 단독 조작 가능 + 레이블/aria 완비.

## 수정 금지·주의

- `superdot-tts.js`: 수정 금지. 원본은 baekjunjoo/superdot — 로직 변경 시 원본과 동기화할 것.
- `DotPadSDK-3.0.0.js`: 공식 SDK 사본, 수정 금지.
- `braille.js`/`ebraille.js`: korean-braille·ebraille-format 스킬 래퍼 — 수정 시 위 검증 벡터 확인.
- 음성 명령 추가는 `RULES.push({kw:[["문구",점수]],run(){}})` — 임계값 3, 기존 문구와 포함 관계 충돌 주의.

## 테스트

jsdom 스모크 테스트 패턴 (푸시 전 권장):
```bash
npm i jsdom
node -e '
const {JSDOM}=require("jsdom");const fs=require("fs");
const dom=new JSDOM(fs.readFileSync("index.html","utf8"),{runScripts:"dangerously",resources:"usable",pretendToBeVisual:true,url:"file://"+process.cwd()+"/index.html"});
setTimeout(()=>{const w=dom.window,d=w.document;
  console.log(w.DOTE_VERSION, d.querySelectorAll("#blocks .block").length, (w.PAGE_TEMPLATES||[]).length, !!w.SDTTS, !!w.Auth);
  process.exit(0);},2500);'
```
DotPad 시뮬레이터(실기기 없이 BLE 계약 검증): `JSDOM_PATH=<jsdom경로> node test/dotpad-sim.js`
— 연결 게이트, 점형 일치, 행 차분, keep-alive, 팬/F1~F4, 다중 기기 미러링 18항목.
앱 감사 스위트(훅·Undo·보관·복원·읽기 회귀): `JSDOM_PATH=<jsdom경로> node test/app-audit.js` — 18항목. 구조 변경 후 두 스위트 모두 통과 필수.

체크포인트: DOTE_VERSION 최신, 블록 렌더 ≥10, 템플릿 8, SDTTS·Auth 로드. jsdom은 file:// localStorage·showModal·scrollIntoView가 없으므로 방어 코드 필수(이미 적용됨).

## 문서

- PRD: Cowork 세션 outputs의 `PRD-Dote-접근성-워크스페이스.md` (v0.2)
- 향후 계획: Cloudflare Workers를 대표 주소로, Supabase 기반 협업 기능 확장
