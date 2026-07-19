/* ═══ Dote 보강 모듈 — dotpad-dev·voice-io·offline-matcher·tactile-ux 스킬 이식 ═══
   index.html 뒤에 로드되어 전역 렉시컬 스코프(state, RULES, announce 등)를 공유·확장한다. */
"use strict";
const DOTE_VERSION="0.16.0 (2026-07-16)";

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
  {kw:[["닷패드 추가",9],["닷 패드 추가",9],["기기 추가",7]],run(){BLE.connect();}},   /* 교실 다대일 미러링 */
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
  devs:[],                                          /* 다대일 미러링: 연결된 모든 기기에 동일 출력 */
  lastRows:[],_ka:null,_flushT:null,_lastTextHex:"",
  buf:new Uint8Array(60*40),

  _sendAll(lineId,hex,mode){                        /* 모든 연결 기기에 행 전송 (기기별 실패 격리) */
    this.devs.forEach(d=>{try{this.sdk.displayLineData(lineId,0,hex,mode,d);}catch(e){}});
  },

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
    if(!navigator.bluetooth){announce("이 브라우저는 웹 블루투스를 지원하지 않습니다. 크롬 또는 엣지에서 열어주세요.");return;}
    announce(this.connected?"닷패드를 추가합니다. 기기를 선택하세요.":"닷패드를 찾는 중입니다. 잠시만요.");   /* 무음 무시 금지 · 교실 다대일 지원 */
    this.loadSDK().then(m=>{
      if(!this.sdk){
        this.sdk=new m.DotPadSDK();
        this.DM=m.DisplayMode;
        /* 콜백은 연결 전에 등록 — Connected 메시지 누락 방지. 시그니처 (device, code/key, data) */
        this.sdk.setCallBack((dev,code)=>this.onMessage(code,dev),(dev,key)=>this.onKey(key));
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
    this.devs.forEach(d=>{try{this.sdk.disconnect(d);}catch(e){}});
    this._teardown();announce("닷패드 연결을 모두 해제했습니다.");
  },
  _btnLabel(){
    const b=document.getElementById("bleBtn");if(!b)return;
    if(!this.connected){b.setAttribute("aria-pressed","false");b.textContent="DotPad 연결";}
    else{b.setAttribute("aria-pressed","true");b.textContent=this.devs.length>1?`DotPad ${this.devs.length}대 연결됨`:"DotPad 연결됨";}
  },
  _teardown(){
    this.connected=false;this.dev=null;this.devs=[];this.lastRows=[];this._lastTextHex="";
    if(this._ka){clearInterval(this._ka);this._ka=null;}
    this._btnLabel();
  },
  onMessage(code,dev){
    if(code==="Connected"){                          /* BoardInfo 동기화 후에만 전송 시작 */
      const d=dev||this.dev;
      if(d&&this.devs.indexOf(d)<0)this.devs.push(d);
      this.connected=this.devs.length>0;
      this.lastRows=[];this._lastTextHex="";         /* 새 기기에 전체 화면이 가도록 차분 캐시 무효화 */
      this._btnLabel();
      announce(this.devs.length>1
        ?`닷패드 ${this.devs.length}대 연결됨. 모든 기기에 같은 점자가 표시됩니다.`
        :"닷패드 연결됨. 팬 키로 블록 이동, 에프원 위치 읽기, 에프포 전체 읽기.");
      this.pushAll();
      if(!this._ka)this._ka=setInterval(()=>{        /* keep-alive: 1초마다 1행 재전송(전 기기) */
        if(!this.connected)return;
        const r=(this._kaRow=((this._kaRow||0)+1)%10);
        const rows=this.encodeRows();
        this._sendAll(r+1,this.toHex(rows[r]),this.DM.GraphicMode);
      },1000);
    }else if(code==="Disconnected"||code==="ConnectedFail"){
      if(dev){const ix=this.devs.indexOf(dev);if(ix>=0)this.devs.splice(ix,1);}
      if(!this.devs.length){this._teardown();
        announce(code==="Disconnected"?"닷패드 연결이 끊어졌습니다.":"닷패드 연결에 실패했습니다.");}
      else{this._btnLabel();announce(`닷패드 1대 연결 해제. ${this.devs.length}대 남음.`);}
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
      this._sendAll(r+1,hex,this.DM.GraphicMode);     /* 연결된 모든 기기에 미러링 */
    }
  },
  pushText(text){                                     /* 텍스트 라인 20셀 (korean-braille 점역) */
    if(!this.connected)return;
    try{
      const cells=KB.strToTextCells(text||"");
      const hex=this.toHex(cells);
      if(hex===this._lastTextHex)return;
      this._lastTextHex=hex;
      this._sendAll(0,hex,this.DM.TextMode);
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

  /* 마이크 토글 시 SDTTS 감쇠 연동 + 미지원 브라우저(아이폰 사파리 등) 대체 안내 */
  const _tm=toggleMic;
  toggleMic=function(){
    if(!micOn&&!(window.SpeechRecognition||window.webkitSpeechRecognition)){
      announce("이 브라우저는 음성 인식을 지원하지 않아요. 아이폰 사파리는 아직 음성 명령이 안 됩니다. 빗금 블록 메뉴와 키보드 단축키로 같은 기능을 쓸 수 있어요.");
      return;
    }
    _tm();if(window.SDTTS)SDTTS.setMicActive(micOn);
  };
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
  /* 점자 미리보기(시각): 기본 숨김, 설정에서 표시 가능 — 교사·부모 등 협력자의 검수용.
     렌더 파이프라인(DotPad 전송·aria)은 표시 여부와 무관하게 항상 동작 */
  const BB_KEY="dote_braille_bar";
  function bbOn(){try{return localStorage.getItem(BB_KEY)==="1";}catch(e){return false;}}
  function setBB(on){
    try{localStorage.setItem(BB_KEY,on?"1":"0");}catch(e){}
    const bb=document.getElementById("brailleBar");if(bb)bb.style.display=on?"":"none";
    const cb=document.getElementById("bbChk");if(cb)cb.checked=on;
  }
  setBB(bbOn());

  /* 저시력 모드: 확대·고대비·강한 포커스·컨트롤 상시 표시 (html.lv 클래스) */
  const LV_KEY="dote_lowvision";
  function lvOn(){try{return localStorage.getItem(LV_KEY)==="1";}catch(e){return false;}}
  function setLV(on){
    try{localStorage.setItem(LV_KEY,on?"1":"0");}catch(e){}
    document.documentElement.classList.toggle("lv",on);
    const c=document.getElementById("lvChk");if(c)c.checked=on;
  }
  setLV(lvOn());

  /* 다크 고대비: 검정 배경·흰 글자·옐로 포인트 (html.hc) */
  const HC_KEY="dote_highcontrast";
  function hcOn(){try{return localStorage.getItem(HC_KEY)==="1";}catch(e){return false;}}
  function setHC(on){
    try{localStorage.setItem(HC_KEY,on?"1":"0");}catch(e){}
    document.documentElement.classList.toggle("hc",on);
    const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=on?"#000000":"#FFFFFF";
    const c=document.getElementById("hcChk");if(c)c.checked=on;
  }
  setHC(hcOn());

  /* 확대 단계: 100~200% (25% 간격, zoom — 레이아웃 로직 유지한 채 전체 확대) */
  const ZM_KEY="dote_zoom";
  function zmGet(){let v=100;try{v=parseInt(localStorage.getItem(ZM_KEY)||"100",10);}catch(e){}if(isNaN(v))v=100;return Math.min(200,Math.max(100,Math.round(v/25)*25));}
  function zmSet(v){
    v=Math.min(200,Math.max(100,Math.round(v/25)*25));
    try{localStorage.setItem(ZM_KEY,String(v));}catch(e){}
    document.body.style.zoom=v/100;
    const el=document.getElementById("zoomVal");if(el)el.textContent=v+"%";
    const zr=document.getElementById("zoomRange");
    if(zr){if(Number(zr.value)!==v)zr.value=v;zr.setAttribute("aria-valuetext",v+"퍼센트");}
    return v;
  }
  zmSet(zmGet());

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

  /* 설정: TTS 속도 6단계 (localStorage에는 % 값 유지 — 기존 저장값은 가장 가까운 단계로 흡수)
     6단계(200%)는 스크린리더 고속 청취에 익숙한 헤비유저용 */
  const RATE_KEY="dote_tts_rate";
  const LEVELS=[80,95,105,130,160,200];               /* 1 매우 느림 ~ 6 최고 속도 */
  const LNAMES=["매우 느림","느림","보통","빠름","매우 빠름","최고 속도"];
  function lvlFromRate(r){let best=2,d=1e9;LEVELS.forEach((v,i)=>{const x=Math.abs(v-r);if(x<d){d=x;best=i;}});return best;}
  function getLevel(){let r=105;try{r=parseInt(localStorage.getItem(RATE_KEY)||"105",10);}catch(e){}if(isNaN(r))r=105;return lvlFromRate(r);}
  function lvlText(i){return `${i+1}단계 · ${LNAMES[i]}`;}
  function setLevel(i){
    i=Math.min(LEVELS.length-1,Math.max(0,i));
    try{localStorage.setItem(RATE_KEY,String(LEVELS[i]));}catch(e){}
    if(window.SDTTS)SDTTS.configure({rate:LEVELS[i]});
    const el=document.getElementById("rateVal");if(el)el.textContent=lvlText(i);
    const rr=document.getElementById("rateRange");
    if(rr){if(Number(rr.value)!==i+1)rr.value=i+1;rr.setAttribute("aria-valuetext",`${i+1}단계, ${LNAMES[i]}`);}
    return i;
  }
  /* SDTTS 로드 완료 시 저장된 단계 적용 */
  const _iv=setInterval(()=>{if(window.SDTTS){SDTTS.configure({rate:LEVELS[getLevel()]});clearInterval(_iv);}},300);
  setTimeout(()=>clearInterval(_iv),10000);

  const dlg=document.createElement("dialog");
  dlg.id="setDlg";dlg.setAttribute("aria-label","설정");
  dlg.innerHTML='<div class="dlg-pad" style="min-width:320px">'
    +'<h2>설정</h2>'
    +'<label for="rateRange" style="display:block;font-size:13px;margin-bottom:6px">음성 안내 속도 <strong id="rateVal"></strong></label>'
    +'<input type="range" id="rateRange" min="1" max="6" step="1" style="width:100%;accent-color:var(--accent)" aria-label="음성 안내 속도, 1단계 매우 느림부터 6단계 최고 속도까지, 좌우 화살표로 조절">'
    +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--textDim);margin-top:4px" aria-hidden="true"><span>매우 느림</span><span>느림</span><span>보통</span><span>빠름</span><span>매우 빠름</span><span>최고</span></div>'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:16px;cursor:pointer"><input type="checkbox" id="lvChk" style="accent-color:var(--accent);width:18px;height:18px">저시력 모드 <span style="font-size:11px;color:var(--textDim)">(큰 글자 · 강한 대비 · 굵은 포커스)</span></label>'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:10px;cursor:pointer"><input type="checkbox" id="hcChk" style="accent-color:var(--accent);width:18px;height:18px">다크 고대비 <span style="font-size:11px;color:var(--textDim)">(검정 배경 · 흰 글자 · 눈부심 감소)</span></label>'
    +'<label for="zoomRange" style="display:block;font-size:13px;margin:16px 0 6px">화면 확대 <strong id="zoomVal"></strong></label>'
    +'<input type="range" id="zoomRange" min="100" max="200" step="25" style="width:100%;accent-color:var(--accent)" aria-label="화면 확대, 100에서 200퍼센트, 좌우 화살표로 조절">'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:10px;cursor:pointer"><input type="checkbox" id="bbChk" style="accent-color:var(--accent);width:18px;height:18px">점자 미리보기 표시 <span style="font-size:11px;color:var(--textDim)">(화면 하단 · 교사·부모 검수용)</span></label>'
    +'<div style="display:flex;gap:8px;margin-top:14px">'
    +'<button class="btn" id="rateTest" style="border:1px solid var(--border)">들어보기</button>'
    +'<button class="btn-cta" id="setClose">닫기</button></div></div>';
  document.body.appendChild(dlg);
  const rr=dlg.querySelector("#rateRange");
  setLevel(getLevel());
  const bbc=dlg.querySelector("#bbChk");
  bbc.checked=bbOn();
  bbc.addEventListener("change",()=>{setBB(bbc.checked);announce(bbc.checked?"점자 미리보기를 화면에 표시합니다.":"점자 미리보기를 숨겼습니다.");});
  const lvc=dlg.querySelector("#lvChk");
  lvc.checked=lvOn();
  lvc.addEventListener("change",()=>{setLV(lvc.checked);announce(lvc.checked?"저시력 모드를 켰습니다. 글자가 커지고 대비가 강해집니다.":"저시력 모드를 껐습니다.");});
  const hcc=dlg.querySelector("#hcChk");
  hcc.checked=hcOn();
  hcc.addEventListener("change",()=>{setHC(hcc.checked);announce(hcc.checked?"다크 고대비를 켰습니다. 검정 배경에 흰 글자입니다.":"다크 고대비를 껐습니다.");});
  const zr=dlg.querySelector("#zoomRange");
  zmSet(zmGet());
  zr.addEventListener("input",()=>zmSet(Number(zr.value)));
  zr.addEventListener("change",()=>announce(`화면 확대 ${zr.value}퍼센트`));
  rr.addEventListener("input",()=>setLevel(Number(rr.value)-1));
  rr.addEventListener("change",()=>{const i=Number(rr.value)-1;announce(`음성 속도 ${i+1}단계, ${LNAMES[i]}`);});
  dlg.querySelector("#rateTest").addEventListener("click",()=>{const i=getLevel();announce(`${i+1}단계 ${LNAMES[i]} 속도로 안내합니다. 점으로 쓰는 노트, 도트.`);});
  dlg.querySelector("#setClose").addEventListener("click",()=>dlg.close());
  function openSettings(){const i=getLevel();rr.value=i+1;dlg.showModal();rr.focus();announce(`설정 열림. 음성 속도 ${i+1}단계 ${LNAMES[i]}. 좌우 화살표로 조절, 이스케이프로 닫기.`);}
  window.openSettings=openSettings;

  /* 사이드바 하단 설정 버튼 */
  const foot=document.querySelector(".sidebar-footer");
  if(foot){const b=document.createElement("button");b.className="nav-item";
    b.innerHTML='<span class="nav-ico" aria-hidden="true">⚙</span><span>설정</span>';
    b.addEventListener("click",openSettings);foot.appendChild(b);}

  RULES.push(
    {kw:[["설정",6],["세팅",6]],run(){openSettings();}},
    {kw:[["빠르게",6],["속도 올려",7]],run(){const i=setLevel(getLevel()+1);announce(`음성 속도 ${i+1}단계, ${LNAMES[i]}`);}},
    {kw:[["느리게",6],["속도 내려",7]],run(){const i=setLevel(getLevel()-1);announce(`음성 속도 ${i+1}단계, ${LNAMES[i]}`);}},
    {kw:[["점자 미리보기",9],["미리보기 켜",8],["미리보기 꺼",8]],run(){const on=!bbOn();setBB(on);announce(on?"점자 미리보기를 화면에 표시합니다.":"점자 미리보기를 숨겼습니다.");}},
    {kw:[["저시력",9],["큰 글자",8],["글자 크게",8]],run(){const on=!lvOn();setLV(on);announce(on?"저시력 모드를 켰습니다. 글자가 커지고 대비가 강해집니다.":"저시력 모드를 껐습니다.");}},
    {kw:[["고대비",9],["다크 모드",8],["검은 배경",8]],run(){const on=!hcOn();setHC(on);announce(on?"다크 고대비를 켰습니다. 검정 배경에 흰 글자입니다.":"다크 고대비를 껐습니다.");}},
    {kw:[["화면 확대",9],["확대해",7]],run(){const v=zmSet(zmGet()+25);announce(`화면 확대 ${v}퍼센트`);}},
    {kw:[["화면 축소",9],["축소해",7]],run(){const v=zmSet(zmGet()-25);announce(`화면 확대 ${v}퍼센트`);}}
  );

  /* ── [9] 내보내기 선택: BRF(한소네 등 점자정보단말기) · eBraille · 유니코드 점자 ── */
  const BRF_TABLE=" A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";
  function exportBrf(){
    const p=curPage();
    const blocks=p.blocks.filter(b=>b.text&&b.text.trim());
    if(!blocks.length){announce("내보낼 내용이 없습니다. 블록에 텍스트를 입력하세요.");return;}
    const lines=[];
    blocks.forEach(b=>{
      const cells=KB.brailleCells(b.text);
      let line="";
      cells.forEach(dots=>{
        let v=0;dots.forEach(d=>{if(d>=1&&d<=6)v|=(1<<(d-1));});   /* BRF는 6점 — 7·8점 제외 */
        line+=BRF_TABLE[v];
        if(line.length>=40){lines.push(line);line="";}             /* 표준 40셀 줄바꿈 */
      });
      if(line)lines.push(line);
      lines.push("");
    });
    const blob=new Blob([lines.join("\r\n")],{type:"text/plain"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=pTitle(p)+".brf";a.click();URL.revokeObjectURL(a.href);
    announce(`${pTitle(p)} 문서를 BRF 파일로 내보냈습니다. 한소네 등 점자정보단말기에서 열 수 있습니다.`);
  }
  window.exportBrf=exportBrf;

  const xd=document.createElement("dialog");
  xd.id="exportDlg";xd.setAttribute("aria-label","내보내기");
  xd.innerHTML='<div class="dlg-pad" style="min-width:360px">'
    +'<h2>내보내기</h2>'
    +'<p style="font-size:12px;color:var(--textMuted);margin-bottom:12px">사용하는 기기에 맞는 형식을 고르세요.</p>'
    +'<div style="display:flex;flex-direction:column;gap:8px">'
    +'<button class="btn" id="xBrf" style="border:1px solid var(--border);justify-content:flex-start;height:auto;padding:10px 12px;text-align:left">BRF 점자 파일<br><span style="font-size:11px;color:var(--textDim)">한소네 등 점자정보단말기 · 점자 프린터용 표준</span></button>'
    +'<button class="btn" id="xEbrl" style="border:1px solid var(--border);justify-content:flex-start;height:auto;padding:10px 12px;text-align:left">eBraille (.ebrl)<br><span style="font-size:11px;color:var(--textDim)">차세대 전자점자 표준 · 지원 기기·뷰어용</span></button>'
    +'<button class="btn" id="xTxt" style="border:1px solid var(--border);justify-content:flex-start;height:auto;padding:10px 12px;text-align:left">유니코드 점자 텍스트 (.txt)<br><span style="font-size:11px;color:var(--textDim)">화면에서 점자 모양 그대로 보기·공유용</span></button>'
    +'</div><button class="btn-cta" id="xClose" style="margin-top:14px">닫기</button></div>';
  document.body.appendChild(xd);
  xd.querySelector("#xBrf").addEventListener("click",()=>{xd.close();exportBrf();});
  xd.querySelector("#xEbrl").addEventListener("click",()=>{xd.close();exportEbrl();});
  xd.querySelector("#xTxt").addEventListener("click",()=>{xd.close();exportBrailleTxt();});
  xd.querySelector("#xClose").addEventListener("click",()=>xd.close());
  /* 기존 .ebrl 단일 버튼 → 형식 선택으로 교체 */
  const eb=document.getElementById("exportBtn");
  if(eb){
    const neb=eb.cloneNode(false);neb.textContent="내보내기";neb.id="exportBtn";
    eb.parentNode.replaceChild(neb,eb);
    neb.addEventListener("click",()=>{xd.showModal();
      announce("내보내기. 비알에프 점자 파일, 이브레일, 유니코드 점자 텍스트 중에서 고르세요. 한소네는 비알에프를 사용하세요.");
      xd.querySelector("#xBrf").focus();});
  }
  RULES.push(
    {kw:[["비알에프",9],["브레일 파일",7],["한소네",8]],run(){exportBrf();}}
  );

  /* ── [10] 첫 방문 접근성 온보딩: 스크린리더 여부 1회 질문 → 자체 TTS 기본값 분기 ── */
  let srSeen=true;
  try{srSeen=localStorage.getItem("dote_sr")!==null;}catch(e){}
  if(!srSeen){
    const sd=document.createElement("dialog");
    sd.id="srDlg";sd.setAttribute("aria-label","접근성 설정");
    sd.innerHTML='<div class="dlg-pad" style="min-width:340px;max-width:420px">'
      +'<h2>시작 전에 하나만 여쭐게요</h2>'
      +'<p style="font-size:14px;line-height:1.6;margin-bottom:6px">화면 낭독 프로그램(스크린리더)을 사용하고 계신가요?</p>'
      +'<p style="font-size:12px;color:var(--textMuted);margin-bottom:14px">사용 중이면 도트의 자체 음성 안내를 꺼서 목소리가 겹치지 않게 합니다. 사이드바 아래 음성 안내 버튼으로 언제든 바꿀 수 있어요.</p>'
      +'<div style="display:flex;gap:8px">'
      +'<button class="btn-cta" id="srYes">네, 사용 중이에요</button>'
      +'<button class="btn" id="srNo" style="border:1px solid var(--border)">아니요</button></div></div>';
    document.body.appendChild(sd);
    const pick=sr=>{
      try{localStorage.setItem("dote_sr",sr?"1":"0");}catch(e){}
      ttsOn=!sr;
      const b=document.getElementById("ttsBtn");
      if(b){b.setAttribute("aria-pressed",String(ttsOn));const s=b.querySelector("span:last-child");if(s)s.textContent=ttsOn?"음성 안내 켜짐":"음성 안내 꺼짐";}
      sd.close();
      announce(sr
        ?"자체 음성 안내를 껐습니다. 모든 안내는 스크린리더가 읽어드립니다. 빗금으로 블록 메뉴, 컨트롤 피 검색."
        :"음성 안내를 켰습니다. 도트. 빗금으로 블록 메뉴, 컨트롤 피 검색, 에프원 현재 위치.");
    };
    sd.querySelector("#srYes").addEventListener("click",()=>pick(true));
    sd.querySelector("#srNo").addEventListener("click",()=>pick(false));
    setTimeout(()=>{try{sd.showModal();sd.querySelector("#srYes").focus();}catch(e){}},400);
  }

  /* ── [11] PWA 업데이트 알림: 새 SW 설치 감지 → 안내 + "업데이트" 음성/새로고침으로 적용 ── */
  if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(!reg)return;
      setInterval(()=>reg.update().catch(()=>{}),60*60*1000);   /* 1시간마다 갱신 확인 */
      reg.addEventListener("updatefound",()=>{
        const nw=reg.installing;if(!nw)return;
        nw.addEventListener("statechange",()=>{
          if(nw.state==="installed"&&navigator.serviceWorker.controller){
            announce("도트 새 버전이 준비되었습니다. 새로고침하거나 업데이트라고 말하면 적용됩니다.");
          }
        });
      });
    }).catch(()=>{});
    RULES.push({kw:[["업데이트",8],["새 버전",8]],run(){announce("업데이트를 적용합니다. 잠시만요.");setTimeout(()=>location.reload(),700);}});
  }

  /* ── [12] 클라우드(Supabase) 로그인·동기화 모듈 로드 ── */
  const as=document.createElement("script");as.src="auth.js";document.body.appendChild(as);
})();

/* ─────────── [13] 생산성: 개요 탐색 · 할 일 집계 · DotPad 연속 읽기 ───────────
   비시각 생산성의 핵심 = "훑기"와 "다시 찾기".
   - 개요: 시맨틱 헤딩을 목차로 낭독·점프 (음성 "개요"/"N번 섹션", 키보드 Ctrl+Shift+O)
   - 할 일: 전 페이지의 미완료 todo 집계 (음성 "남은 할 일"/"N번 완료", 키보드 Ctrl+Shift+T)
   - 연속 읽기: 문서 전체를 DotPad 200셀 화면 단위로 정독, 위치 북마크 (팬 넘김·F2 종료) */
(function(){
  let lastList=null;                                  /* 직전 낭독 목록 — "N번" 후속 명령의 대상 */

  /* ── 1) 개요 ── */
  function outlineItems(){
    return curPage().blocks.map((b,i)=>({b,i}))
      .filter(x=>["h1","h2","h3"].includes(x.b.type)&&x.b.text.trim());
  }
  function readOutline(){
    const items=outlineItems();
    if(!items.length){announce("이 페이지에는 제목 블록이 없습니다. 샵 기호와 스페이스로 제목을 만들면 개요에 나옵니다.");return;}
    lastList={type:"outline",items};
    announce("개요. "+items.map((x,n)=>`${n+1}. ${x.b.text}`).join(". ")
      +". 이동하려면 몇 번 섹션이라고 말하세요.");
  }
  function jumpSection(n){
    const items=(lastList&&lastList.type==="outline")?lastList.items:outlineItems();
    const t=items[n-1];
    if(!t){announce(`${n}번 섹션이 없습니다. 섹션은 ${items.length}개입니다.`);return;}
    focusBlock(t.i);
    announce(`${n}번 섹션. ${t.b.text}`);
  }

  /* ── 2) 할 일 집계 + 오늘 페이지 ── */
  function todoItems(){
    const out=[];
    state.pages.forEach(p=>p.blocks.forEach((b,i)=>{
      if(b.type==="todo"&&!b.checked&&b.text&&b.text.trim())out.push({p,b,i});
    }));
    return out;
  }
  function readTodos(){
    const items=todoItems();
    if(!items.length){announce("남은 할 일이 없습니다. 전부 완료했습니다.");return;}
    lastList={type:"todo",items};
    const head=items.slice(0,10);
    announce(`남은 할 일 ${items.length}개. `
      +head.map((x,n)=>`${n+1}. ${x.b.text}, ${pTitle(x.p)}`).join(". ")
      +(items.length>10?". 이하 생략":"")+". 완료하려면 몇 번 완료.");
  }
  function completeTodo(n){
    if(!(lastList&&lastList.type==="todo")){announce("먼저 남은 할 일이라고 물어보세요.");return;}
    const t=lastList.items[n-1];
    if(!t){announce(`${n}번 할 일이 없습니다.`);return;}
    t.b.checked=true;
    if(t.p.id===state.cur)renderBlocks();
    save();
    announce(`완료. ${t.b.text}. 남은 할 일 ${todoItems().length}개.`);
  }
  function dailyPage(){
    const d=new Date(),title=`${d.getMonth()+1}월 ${d.getDate()}일`;
    let p=state.pages.find(x=>x.title===title);
    if(!p){
      p=newPage(null,title);p.icon="📅";
      p.blocks=[nb("h2","오늘 할 일"),nb("todo",""),nb("h2","메모"),nb("p","")];
    }
    openPage(p.id);
  }

  /* ── 공용 목록 다이얼로그 (개요·할 일 겸용, 키보드 단독 조작) ── */
  const ld=document.createElement("dialog");
  ld.id="listDlg";ld.setAttribute("aria-label","목록");
  ld.innerHTML='<div class="dlg-pad" style="min-width:380px;max-width:480px">'
    +'<h2 id="listTitle"></h2>'
    +'<ul id="listUl" role="listbox" tabindex="0" style="max-height:320px;overflow-y:auto;outline:none"></ul>'
    +'<p id="listHint" style="font-size:11px;color:var(--textDim);margin-top:10px"></p></div>';
  document.body.appendChild(ld);
  let ldItems=[],ldSel=0,ldMode="";
  function renderLd(){
    const ul=ld.querySelector("#listUl");ul.innerHTML="";
    ldItems.forEach((x,i)=>{
      const li=document.createElement("li");
      li.setAttribute("role","option");li.setAttribute("aria-selected",String(i===ldSel));
      li.style.cssText="padding:8px 10px;font-size:14px;cursor:pointer"
        +(i===ldSel?";background:var(--text);color:var(--bg)":"");
      li.textContent=(i+1)+". "+x.label;
      li.addEventListener("click",()=>{ldSel=i;renderLd();ldEnter();});
      ul.appendChild(li);
    });
  }
  function ldEnter(){
    const x=ldItems[ldSel];if(!x)return;
    ld.close();
    if(ldMode==="outline"){focusBlock(x.i);announce(`${ldSel+1}번 섹션. ${x.label}`);}
    else{openPage(x.p.id);focusBlock(x.i);announce(`이동. ${x.b.text}`);}
  }
  function ldComplete(){
    const x=ldItems[ldSel];if(!x||ldMode!=="todo")return;
    x.b.checked=true;
    if(x.p.id===state.cur)renderBlocks();
    save();
    ldItems.splice(ldSel,1);
    if(!ldItems.length){ld.close();announce("전부 완료했습니다.");return;}
    ldSel=Math.min(ldSel,ldItems.length-1);renderLd();
    announce(`완료. 남은 ${ldItems.length}개. 현재: ${ldItems[ldSel].label}`);
  }
  ld.addEventListener("keydown",e=>{
    if(e.key==="ArrowDown"){e.preventDefault();if(ldSel<ldItems.length-1){ldSel++;renderLd();announce(`${ldSel+1}. ${ldItems[ldSel].label}`);}}
    else if(e.key==="ArrowUp"){e.preventDefault();if(ldSel>0){ldSel--;renderLd();announce(`${ldSel+1}. ${ldItems[ldSel].label}`);}}
    else if(e.key==="Enter"){e.preventDefault();ldEnter();}
    else if(e.key===" "&&ldMode==="todo"){e.preventDefault();ldComplete();}
  });
  function openLd(mode){
    ldMode=mode;ldSel=0;
    if(mode==="outline"){
      const items=outlineItems();
      if(!items.length){announce("이 페이지에는 제목 블록이 없습니다. 샵 기호와 스페이스로 제목을 만들면 개요에 나옵니다.");return;}
      ldItems=items.map(x=>({label:x.b.text,i:x.i}));
      ld.querySelector("#listTitle").textContent="개요";
      ld.querySelector("#listHint").textContent="위아래 이동 · 엔터 이동 · 이스케이프 닫기";
    }else{
      const items=todoItems();
      if(!items.length){announce("남은 할 일이 없습니다.");return;}
      ldItems=items.map(x=>({label:`${x.b.text} — ${pTitle(x.p)}`,p:x.p,b:x.b,i:x.i}));
      ld.querySelector("#listTitle").textContent="남은 할 일";
      ld.querySelector("#listHint").textContent="위아래 이동 · 엔터 이동 · 스페이스 완료 · 이스케이프 닫기";
    }
    renderLd();
    try{ld.showModal();}catch(e){ld.setAttribute("open","");}   /* jsdom 등 showModal 부재 방어 */
    ld.querySelector("#listUl").focus();
    announce((mode==="outline"?"개요":"남은 할 일")+` ${ldItems.length}개. 1. ${ldItems[0].label}`);
  }
  window.openOutline=()=>openLd("outline");
  window.openTodos=()=>openLd("todo");
  /* 모바일(음성 미지원 iOS 등)·마우스 사용자용 진입점 */
  const nav=document.querySelector(".sidebar-nav");
  if(nav){
    const mk=(txt,ico,fn)=>{
      const b=document.createElement("button");b.className="nav-item";
      b.innerHTML=`<span class="nav-ico" aria-hidden="true">${ico}</span><span>${txt}</span>`;
      b.addEventListener("click",fn);nav.appendChild(b);
    };
    mk("개요","≡",()=>openLd("outline"));
    mk("남은 할 일","☑",()=>openLd("todo"));
  }
  /* Ctrl+Shift+O/T는 크롬 예약 단축키(북마크 관리자/탭 복원)라 페이지에 도달하지 않음 → Ctrl+Alt 조합 사용 */
  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==="o"){e.preventDefault();openLd("outline");}
    else if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==="t"){e.preventDefault();openLd("todo");}
  });

  /* ── 3) DotPad 연속 읽기 (정독 모드) ── */
  const Reader={
    on:false,cells:[],pos:0,
    _load(){try{return JSON.parse(localStorage.getItem("dote_readpos")||"{}");}catch(e){return{};}},
    _save(){try{const o=this._load();o[state.cur]=this.pos;localStorage.setItem("dote_readpos",JSON.stringify(o));}catch(e){}},
    build(){
      const out=[];
      curPage().blocks.forEach(b=>{
        if(!b.text||!b.text.trim())return;
        if(out.length){out.push([]);out.push([]);}     /* 블록 사이 빈 셀 2개 */
        KB.brailleCells(b.text).forEach(c=>out.push(c));
      });
      return out;
    },
    total(){return Math.ceil(this.cells.length/200);},
    start(){
      if(!BLE.connected){announce("연속 읽기는 닷패드 연결 후 사용할 수 있습니다. 닷패드 연결이라고 말해보세요.");return;}
      this.cells=this.build();
      if(!this.cells.length){announce("읽을 내용이 없습니다.");return;}
      const saved=this._load()[state.cur]||0;
      this.pos=(saved>0&&saved<this.cells.length)?saved:0;
      this.on=true;this.push();
      announce(`연속 읽기 시작. 전체 ${this.total()} 화면`
        +(this.pos?`, 지난번 위치 ${Math.floor(this.pos/200)+1}번째 화면부터 이어 읽습니다`:"")
        +". 팬 키로 화면 넘김, 에프원 위치, 에프투 종료.");
    },
    stop(){
      if(!this.on){announce("연속 읽기 중이 아닙니다.");return;}
      this.on=false;this._save();
      BLE.pushAll();                                   /* 일반 블록 모드 화면 복원 */
      announce("연속 읽기 끝. 읽던 위치를 저장했습니다.");
    },
    push(){
      if(!BLE.connected)return;
      BLE.buf.fill(0);
      const POS={1:[0,0],2:[0,1],3:[0,2],4:[1,0],5:[1,1],6:[1,2],7:[0,3],8:[1,3]};
      this.cells.slice(this.pos,this.pos+200).forEach((dots,i)=>{
        const cx=(i%20)*3,cy=Math.floor(i/20)*4;
        dots.forEach(dt=>{const q=POS[dt];if(q)BLE.set(cx+q[0],cy+q[1]);});
      });
      BLE.requestPush();
      try{BLE.pushText(`R ${Math.floor(this.pos/200)+1}/${this.total()}`);}catch(e){}
    },
    pan(dir){
      const next=this.pos+dir*200;
      if(next<0){announce("문서의 처음입니다.");return;}
      if(next>=this.cells.length){announce("문서의 끝입니다. 에프투로 종료하세요.");return;}
      this.pos=next;this.push();this._save();
      announce(`${Math.floor(this.pos/200)+1}번째 화면`);
    }
  };
  window.Reader=Reader;

  /* 연속 읽기 중 키·전송 라우팅 분리 */
  const _onKey=BLE.onKey.bind(BLE);
  BLE.onKey=function(key){
    if(Reader.on){
      if(key==="PanningRight")Reader.pan(1);
      else if(key==="PanningLeft")Reader.pan(-1);
      else if(key==="KeyFunction1")announce(`연속 읽기. ${Math.floor(Reader.pos/200)+1} / ${Reader.total()} 화면.`);
      else if(key==="KeyFunction2")Reader.stop();
      else announce("연속 읽기 중입니다. 팬 키로 넘기고 에프투로 종료.");
      return;
    }
    _onKey(key);
  };
  const _pushDoc=BLE.pushDoc.bind(BLE);
  BLE.pushDoc=function(text){if(Reader.on)return;_pushDoc(text);};
  const _pushStatus=BLE.pushStatus.bind(BLE);
  BLE.pushStatus=function(){if(Reader.on)return;_pushStatus();};

  /* ── 음성 명령: 숫자 후속 명령은 매처 앞단에서 정규식 처리 ── */
  const _mc=matchCmd;
  matchCmd=function(text){
    const t=String(text).replace(/\s/g,"");
    let m=t.match(/^(\d+)번(째)?섹션/);
    if(m){jumpSection(parseInt(m[1],10));return true;}
    m=t.match(/^(\d+)번(째)?(할일)?(완료|끝났어|끝|했어)/);
    if(m){completeTodo(parseInt(m[1],10));return true;}
    return _mc(text);
  };
  RULES.push(
    {kw:[["개요",8],["목차",8],["섹션 읽어",9]],run(){readOutline();}},
    {kw:[["남은 할 일",10],["할 일 뭐",10],["할 일 목록",10],["할일 목록",10],["할 일 읽어",10]],run(){readTodos();}},
    {kw:[["오늘 페이지",9],["오늘 노트",9],["데일리",8]],run(){dailyPage();}},
    {kw:[["연속 읽기",9],["정독",8],["이어 읽기",9]],run(){Reader.start();}},
    {kw:[["읽기 끝",9],["정독 끝",9],["연속 읽기 끝",10]],run(){Reader.stop();}}
  );

  /* 도움말 표에 항목 추가 */
  const ht=document.querySelector("#helpDlg table");
  if(ht){
    const r1=document.createElement("tr");
    r1.innerHTML="<td>Ctrl+Alt+O / Ctrl+Alt+T</td><td>개요 이동 / 남은 할 일 (스페이스로 완료)</td>";
    const r2=document.createElement("tr");
    r2.innerHTML='<td>음성 (생산성)</td><td>"개요" · "2번 섹션" · "남은 할 일" · "3번 완료" · "오늘 페이지" · "연속 읽기"</td>';
    ht.appendChild(r1);ht.appendChild(r2);
  }
})();
