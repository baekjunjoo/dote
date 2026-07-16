/* ═══ DotPad 시뮬레이터 — Dote 시나리오 러너 ═══
 * 실행: JSDOM_PATH=<jsdom경로> node test/dotpad-sim.js   (jsdom이 로컬에 있으면 생략 가능)
 * 모의 SDK·디코더·체커는 test/lib/dotpad-mock.js (재사용 라이브러리).
 * 검증 계약(CLAUDE.md): 콜백 선등록 → Connected 게이트 → 행단위 전송 → 점형 일치
 *                       → 행 차분·keep-alive → 팬/F1~F4 → 다중 기기 미러링
 */
"use strict";
const {JSDOM}=require(process.env.JSDOM_PATH||"jsdom");
const {createMockSdk,rowsToCells,makeChecker}=require("./lib/dotpad-mock.js");
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"..");

const dom=new JSDOM(fs.readFileSync(path.join(dir,"index.html"),"utf8"),{
  runScripts:"dangerously",resources:"usable",pretendToBeVisual:true,
  url:"file://"+dir+"/index.html"
});
const w=dom.window,d=w.document;
const t=makeChecker();
const wait=ms=>new Promise(r=>setTimeout(r,ms));

setTimeout(async()=>{
try{
  console.log("═ DotPad 시뮬레이터 검증 ═  앱:",w.DOTE_VERSION);
  Object.defineProperty(w.navigator,"bluetooth",{value:{},configurable:true});
  const sim=createMockSdk();
  w.BLE.loadSDK=()=>Promise.resolve(sim.module);      /* 모의 SDK 주입 */

  /* [1] 연결·게이트 */
  console.log("\n[1] 연결·게이트");
  w.BLE.connect();
  await wait(150);
  t.ok("setCallBack이 connect보다 먼저",sim.order.callbackSetAt<sim.order.connectCalledAt,JSON.stringify(sim.order));
  t.ok("Connected 후 전송 시작",sim.log.length>0);
  t.ok("connected 플래그",w.BLE.connected===true);
  t.ok("그래픽 lineId 1–10만",sim.log.filter(x=>x.mode==="GraphicMode").every(x=>x.lineId>=1&&x.lineId<=10));
  t.ok("텍스트 lineId 0",sim.log.filter(x=>x.mode==="TextMode").every(x=>x.lineId===0));
  t.ok("그래픽 hex=30바이트(60자)",sim.log.filter(x=>x.mode==="GraphicMode").every(x=>x.hex.length===60));

  /* [2] 점자 내용 일치 — 기기 화면 상태(행 차분 누적) vs 점역 결과 */
  console.log("\n[2] 점자 내용 일치");
  const ta=d.querySelectorAll("#blocks .block textarea")[1];  /* 기존 내용과 다른 블록·문장 사용 */
  ta.focus();
  const MSG="도트 시뮬레이터 점검 문장";
  ta.value=MSG;ta.dispatchEvent(new w.Event("input",{bubbles:true}));
  await wait(400);
  const sent=rowsToCells(sim.deviceState());
  const expect=w.KB.brailleCells(MSG).map(x=>[...x].sort((a,b)=>a-b));
  t.ok("전송 점형 == KB.brailleCells",JSON.stringify(sent)===JSON.stringify(expect),
    "sent="+JSON.stringify(sent.slice(0,4))+" expect="+JSON.stringify(expect.slice(0,4)));

  /* [3] keep-alive → 정지 후 행 차분 (keep-alive 재전송과 분리해 측정) */
  console.log("\n[3] keep-alive·행 차분");
  sim.log.length=0;
  await wait(1300);
  t.ok("keep-alive 1초 내 1행 이상",sim.log.filter(x=>x.mode==="GraphicMode").length>=1);
  clearInterval(w.BLE._ka);w.BLE._ka=null;
  sim.log.length=0;
  ta.value=MSG;ta.dispatchEvent(new w.Event("input",{bubbles:true}));  /* 동일 내용 재입력 */
  await wait(300);
  const dup=sim.log.filter(x=>x.mode==="GraphicMode").length;
  /* 동일 내용 소량 재전송(≤1행)은 keep-alive와 같은 멱등 동작 — 핵심은 10행 대량 재전송 방지 */
  t.ok("무변경 시 대량 재전송 없음(≤1행)",dup<=1,dup+"행 전송됨");

  /* [4] DotPad 키 → 앱 동작 */
  console.log("\n[4] DotPad 키");
  const status=()=>d.getElementById("statusLine").textContent;
  sim.fireKey("PanningRight");await wait(50);
  t.ok("Pan 오른쪽 → 블록 이동 안내",/\d+\/\d+|문서의 끝/.test(status()),status());
  sim.fireKey("KeyFunction1");await wait(50);
  t.ok("F1 → 위치 읽기",/페이지, 블록/.test(status()),status());
  sim.fireKey("KeyFunction2");await wait(50);
  t.ok("F2 → 블록 메뉴 열림",d.getElementById("slashMenu").classList.contains("open"));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  sim.fireKey("KeyFunction4");await wait(50);
  t.ok("F4 → 전체 읽기",status().length>10);

  /* [5] 다중 기기 미러링 */
  console.log("\n[5] 다중 기기");
  sim.log.length=0;
  w.BLE.connect();                                    /* 두 번째 기기 추가 */
  await wait(150);
  t.ok("기기 2대 등록",w.BLE.devs.length===2,w.BLE.devs.length+"대");
  t.ok("연결 버튼 라벨",/2대/.test(d.getElementById("bleBtn").textContent),d.getElementById("bleBtn").textContent);
  const devIds=new Set(sim.log.map(x=>x.dev&&x.dev.id));
  t.ok("전체 재전송이 두 기기 모두에 도달",devIds.size===2,[...devIds].join(","));
  w.BLE.onMessage("Disconnected",w.BLE.devs[0]);      /* 부분 해제 */
  t.ok("1대 해제 후 1대 유지",w.BLE.devs.length===1&&w.BLE.connected===true);
  w.BLE.disconnect();
  await wait(50);
  t.ok("전체 해제",w.BLE.connected===false&&w.BLE.devs.length===0);

  process.exit(t.summary());
}catch(e){console.error("하네스 오류:",e.stack.split("\n").slice(0,4).join("\n"));process.exit(2);}
},2500);
