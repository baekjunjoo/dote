/* ═══ Dote 보강 모듈 — dotpad-dev·voice-io·offline-matcher·tactile-ux 스킬 이식 ═══
   index.html 뒤에 로드되어 전역 렉시컬 스코프(state, RULES, announce 등)를 공유·확장한다. */
"use strict";
const DOTE_VERSION="0.10.0 (2026-07-14)";

/* ───────────── [0] superdot-tts: 검증된 자연스러운 TTS 모듈 로드 ───────────── */
(function(){
  const s=document.createElement("script");s.src="superdot-tts.js";
  s.onload=()=>{
    SDTTS.configure({uiLang:"ko",vol:100,volMic:50,rate:105});
    SDTTS.setMicActive(micOn);
  };
  document.body.appendChild(s);
})();

/* ─────────── [1] voice-io: TTS 언어 감지·음성 선택·정밀 에코 가드 ─────────── */
function detectTextLang(s){
  if(/[가-힣]/.test(s))return "ko";
  if(/[぀-ヿ]/.test(s))return "ja";
  if(/[A-Za-z]/.test(s))return "en";
  return "ko";
}
const _voiceCache={};
function pickVoiceFor(code){
  if(_voiceCache[code])return _voiceCache[code];
  try{
    const pre=code==="en"?"en":(code==="ja"?"ja":"ko");
    const vs=speechSynthesis.getVoices().filter(v=>v.lang&&v.lang.toLowerCase().startsWith(pre));
    if(!vs.length)return null;
    const score=v=>/natural|neural/i.test(v.name)?3:(/google/i.test(v.name)?2:(/premium/i.test(v.name)?1:0));
    vs.sort((a,b)=>score(b)-score(a));
    _voiceCache[code]=vs[0];                       /* 같은 언어 내 음성 고정(도중 교체 방지) */
    return vs[0];
  }catch(e){return null;}
}
if("speechSynthesis"in window)speechSynthesis.addEventListener("voiceschanged",()=>{for(const k in _voiceCache)delete _voiceCache[k];});

/* 에코 가드: SDTTS 우선(발화 이력 자체 관리), 미로드 시 검증 로직 폴백 */
function normEcho(s){return String(s).toLowerCase().replace(/[\s.,!?…'"“”‘’~\-()]+/g,"");}
echoGuard=function(txt){
  if(window.SDTTS)return SDTTS.isEcho(txt);
  const n=normEcho(txt);if(n.length<4)return false;
  const now=Date.now();
  for(let i=recentTTS.length-1;i>=0;i--){
    const r=recentTTS[i];if(now-r.t>10000)break;
    const m=normEcho(r.s);if(!m)continue;
    if(m.indexOf(n)>=0||n.indexOf(m)>=0)return true;
    let hit=0,tot=0;
    for(let k=0;k+1<n.length;k++){tot++;if(m.indexOf(n.substr(k,2))>=0)hit++;}
    if(tot>=4&&hit/tot>0.7)return true;
  }
  return false;
};

/* announce 교체: aria-live·상태줄 유지, 발화는 superdot-tts(언어감지·음성선별·감쇠) 우선 */
announce=function(msg){
  const live=document.getElementById("live");
  live.textContent="";requestAnimationFrame(()=>live.textContent=msg);
  document.getElementById("statusLine").textContent=msg;
  if(!ttsOn)return;
  if(window.SDTTS){SDTTS.speak(msg);return;}
  if("speechSynthesis"in window){                   /* SDTTS 미로드 폴백 */
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(msg);
    const code=detectTextLang(msg);
    u.lang=code==="en"?"en-US":(code==="ja"?"ja-JP":"ko-KR");
    const v=pickVoiceFor(code);if(v)u.voice=v;
    if(micOn)u.volume=.5;
    speechSynthesis.speak(u);
    recentTTS.push({t:Date.now(),s:msg});
    if(recentTTS.length>8)recentTTS.shift();
  }
};

/* ─────────── [2] offline-matcher: 미매칭 로그(캅 100) — 성장 루프 ─────────── */
function missLog(){try{return JSON.parse(localStorage.getItem("dote_miss")||"[]");}catch(e){return[];}}
function missAdd(t){
  const l=missLog();l.push({t:Date.now(),s:t});
  while(l.length>100)l.shift();
  try{localStorage.setItem("dote_miss",JSON.stringify(l));}catch(e){}
}
const _origMatch=matchCmd;
matchCmd=function(text){
  const ok=_origMatch(text);
  if(!ok)missAdd(text);                             /* 사전 보강 데이터로 축적 */
  return ok;
};

/* ─────────── [3] tactile-ux: 버전 확인·미매칭 목록·DotPad 음성 명령 ─────────── */
RULES.push(
  {kw:[["버전",6],["version",6]],run(){announce(`도트 버전 ${DOTE_VERSION}.`);}},
  {kw:[["미매칭 목록",8],["못 알아들은",7]],run(){
    const l=missLog();
    if(!l.length){announce("미매칭 기록이 없습니다.");return;}
    const recent=l.slice(-5).map(x=>x.s).join(". ");
    announce(`미매칭 ${l.length}건. 최근: ${recent}`);
    try{navigator.clipboard.writeText(l.map(x=>x.s).join("\n"));}catch(e){}
  }},
  {kw:[["닷패드 연결",8],["닷 패드 연결",8],["dotpad",6]],run(){BLE.connect();}},
  {kw:[["닷패드 해제",8],["닷 패드 해제",8]],run(){BLE.disconnect();}},
  /* korean-braille: 점자 등급 전환 (g2 약자 ↔ g1 풀어쓰기) */
  {kw:[["약자로",7],["점자 약자",8]],run(){KB.setGrade("g2");refreshBrailleLine();announce("점자 약자 모드. 한국 점자 약자와 UEB 2급으로 표시합니다.");}},
  {kw:[["풀어쓰기",8],["점자 풀어",7],["1급으로",6]],run(){KB.setGrade("g1");refreshBrailleLine();announce("점자 풀어쓰기 모드. 자모 단위로 표시합니다.");}},
  /* ebraille-format 보완: 유니코드 점자 텍스트(.txt) 내보내기 */
  {kw:[["점자 텍스트",9],["점자 티엑스티",8]],run(){exportBrailleTxt();}},
  /* dotpad-templates minutes: 회의록 기록 모드 (문장 단위 자동 보존) */
  {kw:[["회의록 시작",9],["회의록 기록",8]],run(){minutesStart();}},
  {kw:[["회의록 끝",9],["회의록 그만",9],["회의록 종료",9]],run(){minutesStop();}}
);
/* ── 회의록 기록: 전용 인식기 — 문장마다 [HH:MM] 블록으로 자동 저장 ── */
let minutesRecog=null;
function minutesStart(){
  if(minutesRecog){announce("이미 회의록 기록 중입니다.");return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){announce("이 브라우저는 음성 인식을 지원하지 않습니다. 크롬 또는 엣지를 사용하세요.");return;}
  if(micOn)toggleMic();                              /* 명령 마이크와 충돌 방지 */
  const d=new Date(),z=n=>String(n).padStart(2,"0");
  const p=newPage(null,`회의록 ${d.getMonth()+1}월 ${d.getDate()}일 ${z(d.getHours())}:${z(d.getMinutes())}`);
  p.icon="📋";p.blocks=[nb("p","일시: "+d.toLocaleString("ko-KR")),nb("h2","기록")];
  openPage(p.id);
  minutesRecog=new SR();minutesRecog.lang="ko-KR";minutesRecog.continuous=true;minutesRecog.interimResults=false;
  minutesRecog.onresult=e=>{
    const t=e.results[e.results.length-1][0].transcript.trim();
    if(!t||echoGuard(t))return;                      /* TTS 에코 폐기 */
    if(/회의록\s?(끝|그만|종료)/.test(t)){minutesStop();return;}
    const now=new Date(),ts=`[${z(now.getHours())}:${z(now.getMinutes())}] `;
    curPage().blocks.push(nb("p",ts+t));             /* 문장 단위 자동 보존 */
    renderBlocks();state.focusIdx=curPage().blocks.length-1;
    queueBraille(t);touch();
  };
  minutesRecog.onend=()=>{if(minutesRecog)try{minutesRecog.start();}catch(e){}};
  minutesRecog.onerror=ev=>{if(ev.error==="not-allowed"){minutesRecog=null;announce("마이크 권한이 필요합니다.");}};
  try{minutesRecog.start();
    if(window.SDTTS)SDTTS.setMicActive(true);        /* 기록 중 TTS 감쇠 */
    announce("회의록 기록 시작. 문장마다 시각과 함께 자동 저장됩니다. 멈추려면 회의록 끝.");
  }catch(e){minutesRecog=null;announce("음성 인식을 시작할 수 없습니다.");}
}
function minutesStop(){
  if(!minutesRecog){announce("기록 중인 회의록이 없습니다.");return;}
  const r=minutesRecog;minutesRecog=null;try{r.onend=null;r.stop();}catch(e){}
  if(window.SDTTS)SDTTS.setMicActive(micOn);
  const n=Math.max(0,curPage().blocks.length-2);
  announce(`회의록 기록 끝. ${n}개 문장을 저장했습니다.`);
}
window.minutesStart=minutesStart;window.minutesStop=minutesStop;
function refreshBrailleLine(){
  const b=curPage().blocks[state.focusIdx];
  renderBraille(b?b.text:"");
}
function exportBrailleTxt(){
  const p=curPage();
  const lines=p.blocks.filter(b=>b.text&&b.text.trim()).map(b=>EB.textToBraille(b.text));
  if(!lines.length){announce("내보낼 내용이 없습니다.");return;}
  const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=pTitle(p)+".brl.txt";a.click();URL.revokeObjectURL(a.href);
  announce(`${pTitle(p)} 문서를 유니코드 점자 텍스트로 내보냈습니다. ${lines.length}줄.`);
}

/* ─────────── [4] dotpad-dev: DotPad BLE 드라이버 ───────────
   계약(실기기 검증 — 의미 변경 금지):
   - 행단위 displayLineData만 사용(전체 전송 금지), keep-alive 1초, 마이크로배치(setTimeout 0)
   - 그래픽 셀 인코딩: bit = y%4 + (x%2)*4, 행우선 10행×30셀
   - onMessage 'Connected' 수신 후에만 전송 시작
   - 1순위 공식 SDK(./DotPadSDK-3.0.0.js), 없으면 안내 후 중단(그레이스풀) */
const BLE={
  connected:false,sdk:null,dev:null,DM:null,
  lastRows:[],_ka:null,_flushT:null,_lastTextHex:"",
  buf:new Uint8Array(60*40),

  encodeRows(){                                     /* 60×40 → 10행×30바이트 (검증 인코딩) */
    const rows=[];
    for(let gy=0;gy<10;gy++){
      const row=new Uint8Array(30);
      for(let gx=0;gx<30;gx++){
        const px=gx*2,py=gy*4;let b=0;
        for(let r=0;r<4;r++){
          if(this.buf[(py+r)*60+px])b|=(1<<r);
          if(this.buf[(py+r)*60+px+1])b|=(1<<(r+4));
        }
        row[gx]=b;
      }
      rows.push(row);
    }
    return rows;
  },
  toHex(bytes){let h="";for(let i=0;i<bytes.length;i++){const x=bytes[i].toString(16).toUpperCase();h+=(x.length<2?"0":"")+x;}return h;},

  loadSDK(){
    if(this._sdkP)return this._sdkP;
    const paths=["./DotPadSDK-3.0.0.js","./DotPadSDK-3_0_0.js","./dotpadsdk.js"];
    let p=Promise.reject(new Error("no sdk"));
    paths.forEach(path=>{p=p.catch(()=>import(path));});
    return this._sdkP=p;
  },
  connect(){
    if(this.connected){announce("닷패드가 이미 연결되어 있습니다.");return;}
    if(!navigator.bluetooth){announce("이 브라우저는 웹 블루투스를 지원하지 않습니다. 크롬 또는 엣지에서 열어주세요.");return;}
    announce("닷패드를 찾는 중입니다. 잠시만요.");   /* 무음 무시 금지 */
    this.loadSDK().then(m=>{
      if(!this.sdk){
        this.sdk=new m.DotPadSDK();
        this.DM=m.DisplayMode;
        /* 콜백은 연결 전에 등록 — Connected 메시지 누락 방지. 시그니처 (device, code/key, data) */
        this.sdk.setCallBack((dev,code)=>this.onMessage(code),(dev,key)=>this.onKey(key));
      }
      return new m.DotPadScanner().startBleScan();
    }).then(d=>{
      if(!d){announce("기기 선택이 취소되었습니다.");return;}
      announce("연결 중입니다. 잠시만요.");
      return this.sdk.connectBleDevice(d);
    }).then(dev=>{
      if(dev)this.dev=dev;                            /* Connected 안내는 onMessage에서 */
      else if(dev===null)announce("닷패드 연결에 실패했습니다. 기기 전원과 블루투스를 확인하세요.");
    }).catch(e=>{
      if(String(e.message).includes("no sdk"))
        announce("닷패드 SDK 파일을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.");
      else announce("닷패드 연결에 실패했습니다. "+(e.message||""));
    });
  },
  disconnect(){
    if(!this.connected){announce("연결된 닷패드가 없습니다.");return;}
    try{this.sdk.disconnect(this.dev);}catch(e){}
    this._teardown();announce("닷패드 연결을 해제했습니다.");
  },
  _teardown(){
    this.connected=false;this.dev=null;this.lastRows=[];this._lastTextHex="";
    if(this._ka){clearInterval(this._ka);this._ka=null;}
    const b=document.getElementById("bleBtn");if(b){b.setAttribute("aria-pressed","false");b.textContent="DotPad 연결";}
  },
  onMessage(code){
    if(code==="Connected"){                          /* BoardInfo 동기화 후에만 전송 시작 */
      this.connected=true;
      const b=document.getElementById("bleBtn");if(b){b.setAttribute("aria-pressed","true");b.textContent="DotPad 연결됨";}
      announce("닷패드 연결됨. 팬 키로 블록 이동, 에프원 위치 읽기, 에프포 전체 읽기.");  /* 로드 인트로에 키 사용법 */
      this.pushAll();
      this._ka=setInterval(()=>{                     /* keep-alive: 1초마다 1행 재전송 */
        if(!this.connected)return;
        const r=(this._kaRow=((this._kaRow||0)+1)%10);
        const rows=this.encodeRows();
        try{this.sdk.displayLineData(r+1,0,this.toHex(rows[r]),this.DM.GraphicMode,this.dev);}catch(e){}
      },1000);
    }else if(code==="Disconnected"||code==="ConnectedFail"){
      this._teardown();
      announce(code==="Disconnected"?"닷패드 연결이 끊어졌습니다.":"닷패드 연결에 실패했습니다.");
    }
  },
  onKey(key){
    if(!this.connected)return;
    if(key==="PanningRight")navBlock(1);
    else if(key==="PanningLeft")navBlock(-1);
    else if(key==="KeyFunction1"){                   /* F1 = 위치 다시 읽기 관례 */
      const p=curPage(),b=p.blocks[state.focusIdx];
      announce(`${pTitle(p)} 페이지, 블록 ${state.focusIdx+1}/${p.blocks.length}, ${b?TYPES[b.type]:""}. ${b&&b.text?b.text:"빈 블록"}`);
    }
    else if(key==="KeyFunction2"){openSlash(state.focusIdx);}
    else if(key==="KeyFunction3"){const t=document.querySelector('[role="treeitem"]');if(t){t.focus();this.drawTree();announce("페이지 트리로 이동. 촉각 계층도를 표시합니다.");}}
    else if(key==="KeyFunction4"){const p=curPage();announce(pTitle(p)+". "+p.blocks.map(b=>b.text).filter(Boolean).join(". "));}
    else announce("잠시만요.");                       /* 무시되는 입력도 응답 */
  },

  /* 렌더 → 전송: 마이크로배치 + 행 차분 (빈 프레임·과전송 방지) */
  requestPush(){
    if(!this.connected||this._flushT!=null)return;
    this._flushT=setTimeout(()=>{this._flushT=null;if(this.connected)this._push();},0);
  },
  _push(){
    const rows=this.encodeRows();
    for(let r=0;r<10;r++){
      const hex=this.toHex(rows[r]);
      if(this.lastRows[r]===hex)continue;             /* 변경 행만 전송 */
      this.lastRows[r]=hex;
      try{this.sdk.displayLineData(r+1,0,hex,this.DM.GraphicMode,this.dev);}catch(e){}
    }
  },
  pushText(text){                                     /* 텍스트 라인 20셀 (korean-braille 점역) */
    if(!this.connected)return;
    try{
      const cells=KB.strToTextCells(text||"");
      const hex=this.toHex(cells);
      if(hex===this._lastTextHex)return;
      this._lastTextHex=hex;
      this.sdk.displayLineData(0,0,hex,this.DM.TextMode,this.dev);
    }catch(e){}
  },

  /* 텍스트 라인(20셀) = 상태 표시: 블록 위치 + 작성일 */
  pushStatus(){
    if(!this.connected)return;
    const p=curPage(),d=new Date(p.created||Date.now());
    this.pushText(`${state.focusIdx+1}/${p.blocks.length} ${d.getMonth()+1}-${d.getDate()}`);
  },
  /* 그래픽 영역(60×40) = 멀티라인 점자: 20셀×10줄, 셀 피치 3×4px (페이지 방식) */
  pushDoc(text){
    if(!this.connected)return;
    this.buf.fill(0);
    const POS={1:[0,0],2:[0,1],3:[0,2],4:[1,0],5:[1,1],6:[1,2],7:[0,3],8:[1,3]};
    const cells=text?KB.brailleCells(text):[];
    /* 타이핑 실시간 추적: 200셀 초과 시 마지막 페이지(줄 정렬) 표시 */
    const start=cells.length>200?Math.ceil((cells.length-200)/20)*20:0;
    const win=cells.slice(start,start+200);
    win.forEach((dots,i)=>{
      const cx=(i%20)*3,cy=Math.floor(i/20)*4;
      dots.forEach(dt=>{const q=POS[dt];if(q)this.set(cx+q[0],cy+q[1]);});
    });
    this.requestPush();
  },

  /* 페이지 트리 계층도 → 촉각 그래픽 (F3에서 일시 표시) */
  drawTree(){
    this.buf.fill(0);
    const flat=[];
    const walk=(pid,depth)=>{state.pages.filter(p=>p.parentId===pid).forEach(p=>{flat.push({p,depth});walk(p.id,depth+1);});};
    walk(null,0);
    flat.slice(0,10).forEach((n,i)=>{
      const y=i*4,x=n.depth*6;
      if(n.p.id===state.cur){                         /* 현재 페이지: 4×3 솔리드 마커 */
        for(let dy=0;dy<3;dy++)for(let dx=0;dx<4;dx++)this.set(x+dx,y+dy);
      }
      for(let dx=0;dx<Math.min(20,60-x-6);dx++){      /* 제목 바(2px 두께) */
        this.set(x+6+dx,y);this.set(x+6+dx,y+1);
      }
    });
    this.requestPush();
  },
  set(x,y){if(x>=0&&x<60&&y>=0&&y<40)this.buf[y*60+x]=1;},
  pushAll(){this.lastRows=[];this._lastTextHex="";
    const b=curPage().blocks[state.focusIdx];
    this.pushDoc(b?b.text:"");this.pushStatus();}
};

window.BLE=BLE;window.DOTE_VERSION=DOTE_VERSION;   /* 콘솔 디버깅·테스트용 노출 */

/* ─────────── [5] 앱 훅: 연결 버튼 + 상태 연동 ─────────── */
(function(){
  const btn=document.createElement("button");
  btn.className="btn";btn.id="bleBtn";btn.setAttribute("aria-pressed","false");
  btn.textContent="DotPad 연결";
  btn.addEventListener("click",()=>BLE.connected?BLE.disconnect():BLE.connect());
  const help=document.getElementById("helpBtn");
  help.parentNode.insertBefore(btn,help);

  /* 점자 라인 갱신 시 실기기 갱신: 본문→멀티라인 점자, 상태→텍스트 라인 */
  const _rb=renderBraille;
  renderBraille=function(text){_rb(text);BLE.pushDoc(text);BLE.pushStatus();};
  /* 페이지 전환·트리 변경 시 상태 라인 갱신 */
  const _rt=renderTree;
  renderTree=function(){_rt();if(BLE.connected)BLE.pushStatus();};

  /* 마이크 토글 시 SDTTS 감쇠 연동 */
  const _tm=toggleMic;
  toggleMic=function(){_tm();if(window.SDTTS)SDTTS.setMicActive(micOn);};
  const mic=document.getElementById("micBtn");
  if(mic){const nm=mic.cloneNode(true);mic.parentNode.replaceChild(nm,mic);nm.addEventListener("click",()=>toggleMic());}

  /* ── [6] 페이지 템플릿 모듈 로드 ── */
  const ts=document.createElement("script");ts.src="templates.js";document.body.appendChild(ts);
})();

/* ─────────── [7] 실시간 점자: 리딩엣지 스로틀 + 입력 커서 추적 ───────────
   기존 250ms 디바운스는 연속 타이핑 동안 갱신이 멈춤(타자마다 타이머 리셋).
   → 즉시 1회 렌더 + 이후 120ms 간격 보장(트레일링)으로 키 입력마다 점자가 올라온다.
   입력에서 발생한 갱신은 점자 창(panOfs)이 텍스트 끝(커서 위치)을 따라가고,
   포커스 이동·음성 낭독 등 읽기 목적 갱신은 기존대로 블록 처음부터 보여준다(tactile-ux).
   DotPad 실기기는 renderBraille 훅 → pushDoc(행 차분 전송)이라 같은 리듬으로 갱신된다. */
let _brFollow=false,_brLast=0,_brT2=null;
const _origOnInput=onInput;
onInput=function(e,i){_brFollow=true;try{_origOnInput(e,i);}finally{_brFollow=false;}};
queueBraille=function(text){
  const follow=_brFollow;
  const run=()=>{
    _brLast=Date.now();
    if(follow){
      const n=text?KB.brailleCells(text).length:0;
      panOfs=n>20?Math.floor((n-1)/20)*20:0;          /* 커서가 있는 마지막 20셀 창 */
    }
    renderBraille(text||"");
  };
  if(_brT2){clearTimeout(_brT2);_brT2=null;}
  const el=Date.now()-_brLast;
  if(el>=120)run();
  else _brT2=setTimeout(run,120-el);                  /* 연속 타이핑 중에도 120ms마다 갱신 */
};

/* ─────────── [8] UI 개편: 점자바 숨김 · 설정(TTS 속도) · 사용자 슬롯 ─────────── */
(function(){
  /* 하단 점자 시뮬레이션 바 숨김 — 렌더 파이프라인(DotPad 전송·aria)은 그대로 유지 */
  const bb=document.getElementById("brailleBar");if(bb)bb.style.display="none";

  /* 사이드바 로고 → 사용자 슬롯: 로그인하면 이메일 표시 (auth.js가 갱신) */
  const wi=document.querySelector(".workspace-icon");
  if(wi){
    wi.innerHTML="";wi.style.width="auto";wi.style.overflow="visible";
    const u=document.createElement("button");
    u.id="userSlot";u.textContent="로그인";u.setAttribute("aria-label","로그인");
    u.style.cssText="font-size:12px;color:var(--textMuted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:var(--surface)";
    wi.appendChild(u);
    u.addEventListener("click",()=>{if(window.Auth)Auth.open();else announce("로그인 모듈을 불러오는 중입니다. 잠시 후 다시 시도하세요.");});
  }

  /* 설정: TTS 속도 (localStorage 유지, SDTTS 즉시 반영) */
  const RATE_KEY="dote_tts_rate";
  function getRate(){let v=105;try{v=parseInt(localStorage.getItem(RATE_KEY)||"105",10);}catch(e){}return isNaN(v)?105:Math.min(200,Math.max(60,v));}
  function setRate(v){
    v=Math.min(200,Math.max(60,v));
    try{localStorage.setItem(RATE_KEY,String(v));}catch(e){}
    if(window.SDTTS)SDTTS.configure({rate:v});
    const el=document.getElementById("rateVal");if(el)el.textContent=v+"%";
    const rr=document.getElementById("rateRange");if(rr&&Number(rr.value)!==v)rr.value=v;
    return v;
  }
  /* SDTTS 로드 완료 시 저장된 속도 적용 */
  const _iv=setInterval(()=>{if(window.SDTTS){SDTTS.configure({rate:getRate()});clearInterval(_iv);}},300);
  setTimeout(()=>clearInterval(_iv),10000);

  const dlg=document.createElement("dialog");
  dlg.id="setDlg";dlg.setAttribute("aria-label","설정");
  dlg.innerHTML='<div class="dlg-pad" style="min-width:320px">'
    +'<h2>설정</h2>'
    +'<label for="rateRange" style="display:block;font-size:13px;margin-bottom:6px">음성 안내 속도 <strong id="rateVal"></strong></label>'
    +'<input type="range" id="rateRange" min="60" max="200" step="5" style="width:100%;accent-color:var(--accent)" aria-label="음성 안내 속도, 60에서 200퍼센트, 좌우 화살표로 조절">'
    +'<div style="display:flex;gap:8px;margin-top:14px">'
    +'<button class="btn" id="rateTest" style="border:1px solid var(--border)">들어보기</button>'
    +'<button class="btn-cta" id="setClose">닫기</button></div></div>';
  document.body.appendChild(dlg);
  const rr=dlg.querySelector("#rateRange");
  rr.value=getRate();dlg.querySelector("#rateVal").textContent=getRate()+"%";
  rr.addEventListener("input",()=>setRate(Number(rr.value)));
  rr.addEventListener("change",()=>announce(`음성 속도 ${rr.value}퍼센트`));
  dlg.querySelector("#rateTest").addEventListener("click",()=>announce(`현재 속도 ${getRate()}퍼센트로 안내합니다. 점으로 쓰는 노트, 도트.`));
  dlg.querySelector("#setClose").addEventListener("click",()=>dlg.close());
  function openSettings(){rr.value=getRate();dlg.showModal();rr.focus();announce(`설정 열림. 음성 속도 ${getRate()}퍼센트. 좌우 화살표로 조절, 이스케이프로 닫기.`);}
  window.openSettings=openSettings;

  /* 사이드바 하단 설정 버튼 */
  const foot=document.querySelector(".sidebar-footer");
  if(foot){const b=document.createElement("button");b.className="nav-item";
    b.innerHTML='<span class="nav-ico" aria-hidden="true">⚙</span><span>설정</span>';
    b.addEventListener("click",openSettings);foot.appendChild(b);}

  RULES.push(
    {kw:[["설정",6],["세팅",6]],run(){openSettings();}},
    {kw:[["빠르게",6],["속도 올려",7]],run(){const v=setRate(getRate()+15);announce(`음성 속도 ${v}퍼센트`);}},
    {kw:[["느리게",6],["속도 내려",7]],run(){const v=setRate(getRate()-15);announce(`음성 속도 ${v}퍼센트`);}}
  );

  /* ── [9] 클라우드(Supabase) 로그인·동기화 모듈 로드 ── */
  const as=document.createElement("script");as.src="auth.js";document.body.appendChild(as);
})();
