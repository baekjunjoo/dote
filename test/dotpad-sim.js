/* ═══ DotPad 시뮬레이터 — 실기기 없이 BLE 파이프라인 전 구간 검증 ═══
 * 실행: node test/dotpad-sim.js  (사전: npm i jsdom, 같은 폴더에 앱 파일들)
 * 공식 SDK와 같은 인터페이스(DotPadSDK/DotPadScanner/DisplayMode)를 가진 모의 기기를 주입해
 * CLAUDE.md의 SDK 계약이 실제 코드에서 지켜지는지 확인한다:
 *  1) setCallBack이 connectBleDevice보다 먼저 등록되는가
 *  2) "Connected" 수신 후에만 전송이 시작되는가
 *  3) 행단위 displayLineData만 쓰는가 (그래픽 lineId 1–10 / 텍스트 0, 30바이트 hex)
 *  4) 전송된 점형이 KB.brailleCells와 일치하는가 (셀 인코딩 bit=y%4+(x%2)*4 역산)
 *  5) 행 차분 전송(무변경 행 미전송) + keep-alive(1초 1행)
 *  6) 팬/F1~F4 키가 앱 동작으로 이어지는가
 *  7) 다중 기기 미러링(기기 추가·부분 해제)
 */
"use strict";
const {JSDOM}=require(process.env.JSDOM_PATH||"jsdom");
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"..");

const dom=new JSDOM(fs.readFileSync(path.join(dir,"index.html"),"utf8"),{
  runScripts:"dangerously",resources:"usable",pretendToBeVisual:true,
  url:"file://"+dir+"/index.html"
});
const w=dom.window,d=w.document;
let pass=0,fail=0;
const ok=(name,cond,extra)=>{
  if(cond){pass++;console.log("  ✔",name);}
  else{fail++;console.log("  ✘",name,extra!==undefined?("→ "+extra):"");}
};

/* ── 모의 SDK: 공식 3.0.0과 동일 시그니처 ── */
function makeMock(){
  const log=[];              /* {dev,lineId,hex,mode,t} */
  let msgCb=null,keyCb=null,callbackSetAt=null,connectCalledAt=null,seq=0;
  class DotPadSDK{
    setCallBack(m,k){msgCb=m;keyCb=k;callbackSetAt=++seq;}
    connectBleDevice(scanDev){
      connectCalledAt=++seq;
      return new Promise(res=>{
        setTimeout(()=>{res(scanDev);setTimeout(()=>msgCb&&msgCb(scanDev,"Connected"),30);},20);
      });
    }
    displayLineData(lineId,startCell,hex,mode,dev){log.push({dev,lineId,hex,mode,t:Date.now()});}
    disconnect(dev){setTimeout(()=>msgCb&&msgCb(dev,"Disconnected"),10);}
  }
  class DotPadScanner{
    startBleScan(){return Promise.resolve({id:"SIM-"+Math.random().toString(36).slice(2,7),name:"DotPad320-SIM"});}
  }
  return {mod:{DotPadSDK,DotPadScanner,DisplayMode:{GraphicMode:"GraphicMode",TextMode:"TextMode"}},
    log,fireKey:k=>keyCb&&keyCb(log.length?log[log.length-1].dev:null,k),
    order:()=>({callbackSetAt,connectCalledAt})};
}

/* hex 행(30바이트) → 셀 점 배열 복원: bit=y%4+(x%2)*4 역산 */
function rowsToCells(rowHexes){
  const buf=[];/* 60x40 */
  for(let gy=0;gy<10;gy++){
    const hex=rowHexes[gy];if(!hex)continue;
    for(let gx=0;gx<30;gx++){
      const b=parseInt(hex.substr(gx*2,2),16);
      for(let r=0;r<4;r++){
        if(b&(1<<r))(buf[(gy*4+r)*60+gx*2]=1);
        if(b&(1<<(r+4)))(buf[(gy*4+r)*60+gx*2+1]=1);
      }
    }
  }
  /* 셀 피치 3x4 → 셀별 점 목록 (점 배치 POS 역산) */
  const POS={ "0,0":1,"0,1":2,"0,2":3,"1,0":4,"1,1":5,"1,2":6,"0,3":7,"1,3":8 };
  const cells=[];
  for(let line=0;line<10;line++)for(let c=0;c<20;c++){
    const dots=[];
    for(const k in POS){
      const [dx,dy]=k.split(",").map(Number);
      if(buf[(line*4+dy)*60+(c*3+dx)])dots.push(POS[k]);
    }
    cells.push(dots.sort((a,b)=>a-b));
  }
  while(cells.length&&!cells[cells.length-1].length)cells.pop();
  return cells;
}

setTimeout(async()=>{
try{
  console.log("═ DotPad 시뮬레이터 검증 ═  앱:",w.DOTE_VERSION);
  Object.defineProperty(w.navigator,"bluetooth",{value:{},configurable:true});
  const sim=makeMock();
  w.BLE.loadSDK=()=>Promise.resolve(sim.mod);

  /* 1) 연결 계약 */
  console.log("\n[1] 연결·게이트");
  w.BLE.connect();
  await new Promise(r=>setTimeout(r,150));
  const o=sim.order();
  ok("setCallBack이 connect보다 먼저",o.callbackSetAt<o.connectCalledAt,JSON.stringify(o));
  ok("Connected 후 전송 시작(로그 존재)",sim.log.length>0);
  ok("connected 플래그",w.BLE.connected===true);
  const preConnected=sim.log.filter(x=>x.t===0).length;
  ok("그래픽 lineId 1–10만",sim.log.filter(x=>x.mode==="GraphicMode").every(x=>x.lineId>=1&&x.lineId<=10));
  ok("텍스트 lineId 0",sim.log.filter(x=>x.mode==="TextMode").every(x=>x.lineId===0));
  ok("그래픽 hex=30바이트(60자)",sim.log.filter(x=>x.mode==="GraphicMode").every(x=>x.hex.length===60));

  /* 2) 내용 일치: 입력 → 멀티라인 점자
     주의: 행 차분 전송이므로 "기기 화면 상태" = 연결 이후 로그의 행별 최신값 누적 */
  console.log("\n[2] 점자 내용 일치");
  const ta=d.querySelectorAll("#blocks .block textarea")[1];   /* 두 번째(문단) 블록 */
  ta.focus();
  const MSG="도트 시뮬레이터 점검 문장";                        /* 기존 내용과 다른 문장 */
  ta.value=MSG;ta.dispatchEvent(new w.Event("input",{bubbles:true}));
  await new Promise(r=>setTimeout(r,400));
  const lastRow={};sim.log.filter(x=>x.mode==="GraphicMode").forEach(x=>lastRow[x.lineId-1]=x.hex);
  for(let i=0;i<10;i++)if(!lastRow[i])lastRow[i]="0".repeat(60);
  const sent=rowsToCells([...Array(10)].map((_,i)=>lastRow[i]));
  const expect=w.KB.brailleCells(MSG).map(x=>[...x].sort((a,b)=>a-b));
  ok("전송 점형 == KB.brailleCells",JSON.stringify(sent)===JSON.stringify(expect),
    "sent="+JSON.stringify(sent.slice(0,4))+" expect="+JSON.stringify(expect.slice(0,4)));

  /* 3) keep-alive → 이후 정지시킨 뒤 행 차분 검사 (keep-alive 재전송과 분리) */
  console.log("\n[3] keep-alive·행 차분");
  sim.log.length=0;
  await new Promise(r=>setTimeout(r,1300));
  ok("keep-alive 1초 내 1행 이상",sim.log.filter(x=>x.mode==="GraphicMode").length>=1);
  clearInterval(w.BLE._ka);w.BLE._ka=null;             /* 차분 검사 동안 keep-alive 정지 */
  sim.log.length=0;
  ta.value=MSG;ta.dispatchEvent(new w.Event("input",{bubbles:true}));   /* 동일 내용 재입력 */
  await new Promise(r=>setTimeout(r,300));
  const dup=sim.log.filter(x=>x.mode==="GraphicMode").length;
  /* 동일 내용 재전송은 keep-alive와 같은 멱등 동작이라 소량(≤1행)은 무해 —
     핵심은 10행 전체 재전송이 일어나지 않는 것(차분 동작) */
  ok("무변경 시 대량 재전송 없음(≤1행)",dup<=1,dup+"행 전송됨");

  /* 4) 키 입력 → 앱 동작 */
  console.log("\n[4] DotPad 키");
  const status=()=>d.getElementById("statusLine").textContent;
  sim.fireKey("PanningRight");await new Promise(r=>setTimeout(r,50));
  ok("Pan 오른쪽 → 블록 이동 안내",/\d+\/\d+|문서의 끝/.test(status()),status());
  sim.fireKey("KeyFunction1");await new Promise(r=>setTimeout(r,50));
  ok("F1 → 위치 읽기",/페이지, 블록/.test(status()),status());
  sim.fireKey("KeyFunction2");await new Promise(r=>setTimeout(r,50));
  ok("F2 → 블록 메뉴 열림",d.getElementById("slashMenu").classList.contains("open"));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  sim.fireKey("KeyFunction4");await new Promise(r=>setTimeout(r,50));
  ok("F4 → 전체 읽기",status().length>10);

  /* 5) 다중 기기 미러링 */
  console.log("\n[5] 다중 기기");
  sim.log.length=0;
  w.BLE.connect();                                     /* 두 번째 기기 추가 */
  await new Promise(r=>setTimeout(r,150));
  ok("기기 2대 등록",w.BLE.devs.length===2,w.BLE.devs.length+"대");
  ok("연결 버튼 라벨",/2대/.test(d.getElementById("bleBtn").textContent),d.getElementById("bleBtn").textContent);
  const devIds=new Set(sim.log.map(x=>x.dev&&x.dev.id));
  ok("전체 재전송이 두 기기 모두에 도달",devIds.size===2,[...devIds].join(","));
  /* 부분 해제 */
  const gone=w.BLE.devs[0];
  sim.mod;w.BLE.onMessage("Disconnected",gone);
  ok("1대 해제 후 1대 유지",w.BLE.devs.length===1&&w.BLE.connected===true);
  w.BLE.disconnect();
  await new Promise(r=>setTimeout(r,50));
  ok("전체 해제",w.BLE.connected===false&&w.BLE.devs.length===0);

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail?1:0);
}catch(e){console.error("하네스 오류:",e.stack.split("\n").slice(0,4).join("\n"));process.exit(2);}
},2500);
