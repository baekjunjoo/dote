/* ═══ Dote 페이지 템플릿 2.0 — 4세트 18종 + 접근성 엔진 (dotpad-templates 스킬 스펙 방식) ═══
   전역 렉시컬 스코프(nb, newPage, openPage, announce, RULES, state, curPage, focusBlock,
   visibleIdx, renderBlocks, BLE, Reader 등)를 공유한다.

   엔진 기능(모두 AA 정합 — 상태 변화는 announce, 키보드 단독 조작, 색 의존 없음):
   1) 변수 자동 채움: {오늘날짜} {요일} {연도} {시간}
   2) 적용 직후 첫 입력 칸 포커스 + 무엇을 쓸지 음성 가이드
   3) 블록 글자 수 제한(limit): 초과/복귀 실시간 음성 경고 (자소서·보도자료)
   4) 정답 가림 퀴즈: 닫힌 토글의 하위 내용을 전체 읽기·연속 읽기·팬이 건너뜀,
      Alt+Enter 또는 음성 "정답"으로 열고 닫기 */
"use strict";

/* ── 변수 치환 ── */
function tplVar(s){
  const d=new Date(),z=n=>String(n).padStart(2,"0");
  const yo=["일","월","화","수","목","금","토"][d.getDay()];
  return String(s)
    .replace(/\{오늘날짜\}/g,`${d.getMonth()+1}월 ${d.getDate()}일`)
    .replace(/\{요일\}/g,yo+"요일")
    .replace(/\{연도\}/g,String(d.getFullYear()))
    .replace(/\{시간\}/g,`${z(d.getHours())}:${z(d.getMinutes())}`);
}
const tb=(type,text,extra)=>Object.assign(nb(type,tplVar(text||"")),extra||{});

/* ── 템플릿 정의: cat(세트) · guide(적용 직후 안내) · blocks ── */
const PAGE_TEMPLATES=[
  /* ───── 학생 세트 ───── */
  {cat:"학생",icon:"🎓",name:"강의 노트",desc:"핵심 개념 · 질문 · 복습",
   guide:"과목과 강사 이름부터 채우세요.",
   make(){return{title:"강의 노트 {오늘날짜}",icon:"🎓",blocks:[
     tb("p","과목: 　강사: 　{오늘날짜} {요일}"),
     tb("h2","핵심 개념"),tb("ul",""),tb("ul",""),
     tb("h2","질문"),tb("todo",""),
     tb("toggle","복습 정리 (접어두기)",{open:false}),
     tb("p","",{indent:1})]};}},
  {cat:"학생",icon:"🗂️",name:"과제 트래커",desc:"과목별 과제 · 마감일 · 진행 상태",
   guide:"첫 과제의 과목과 마감일을 쓰세요. 마감일은 몇 월 며칠 형식으로 쓰면 찾기 쉽습니다.",
   make(){return{title:"과제 트래커",icon:"🗂️",blocks:[
     tb("callout","작성법: 과제마다 할 일 블록 하나. \"과목 - 과제명 - 마감 0월 0일\" 순서로."),
     tb("h2","이번 주 마감"),tb("todo",""),tb("todo",""),
     tb("h2","다음 주 이후"),tb("todo",""),
     tb("h2","제출 완료"),
     tb("p","완료한 과제는 체크하면 남은 할 일에서 사라집니다.")]};}},
  {cat:"학생",icon:"📝",name:"학습지",desc:"문항 자동 번호 · 정답지 분리 · BRF 출력용",
   guide:"1번 문항부터 쓰세요. 문항 사이 빈 줄은 점자 출력 시 문항 구분이 됩니다.",
   make(){return{title:"학습지",icon:"📝",blocks:[
     tb("p","단원: 　이름: "),
     tb("h2","문항"),
     tb("ol",""),tb("p",""),
     tb("ol",""),tb("p",""),
     tb("ol",""),tb("p",""),
     tb("divider"),
     tb("toggle","정답지 (학생 배포 전 확인)",{open:false}),
     tb("ol","",{indent:1}),tb("ol","",{indent:1}),tb("ol","",{indent:1})]};}},
  {cat:"학생",icon:"❓",name:"시험 대비 퀴즈",desc:"문제/정답 가림 — 닷패드 셀프 퀴즈",
   guide:"토글 블록에 문제를 쓰고, 그 아래 들여쓰기 블록에 정답을 쓰세요. 정답은 알트 엔터 또는 정답이라고 말하면 열립니다.",
   make(){return{title:"시험 대비 퀴즈",icon:"❓",blocks:[
     tb("callout","사용법: 문제를 읽고 답을 떠올린 뒤, 알트 엔터로 정답 확인. 전체 읽기와 연속 읽기는 닫힌 정답을 건너뜁니다."),
     tb("toggle","문제 1: ",{open:false}),
     tb("p","정답: ",{indent:1}),
     tb("toggle","문제 2: ",{open:false}),
     tb("p","정답: ",{indent:1}),
     tb("toggle","문제 3: ",{open:false}),
     tb("p","정답: ",{indent:1})]};}},
  {cat:"학생",icon:"📚",name:"독서 노트",desc:"핵심 문장 · 내 생각 · 실천",
   guide:"저자와 출판사부터 채우세요.",
   make(){return{title:"독서 노트",icon:"📚",blocks:[
     tb("p","저자: 　출판: "),
     tb("h2","핵심 문장"),tb("quote",""),
     tb("h2","내 생각"),tb("p",""),
     tb("h2","실천할 것"),tb("todo","")]};}},

  /* ───── 취업 세트 ───── */
  {cat:"취업",icon:"✍️",name:"자기소개서",desc:"문항별 글자 수 제한 · 초과 시 실시간 경고",
   guide:"회사와 직무를 채우고 문항 1의 답변 칸에 쓰세요. 500자를 넘으면 바로 알려드립니다. 제한은 상황에 맞게 블록마다 다르게 두었습니다.",
   make(){return{title:"자기소개서",icon:"✍️",blocks:[
     tb("p","회사: 　직무: 　마감: "),
     tb("h2","문항 1 (500자)"),
     tb("p","",{limit:500}),
     tb("h2","문항 2 (700자)"),
     tb("p","",{limit:700}),
     tb("h2","문항 3 (1000자)"),
     tb("p","",{limit:1000}),
     tb("divider"),
     tb("h2","소재 메모"),tb("ul","")]};}},
  {cat:"취업",icon:"🎤",name:"면접 준비",desc:"예상 질문/답변 가림 — 셀프 모의면접",
   guide:"토글에 예상 질문을, 아래 들여쓰기 블록에 준비한 답변을 쓰세요. 답변은 알트 엔터로 확인합니다.",
   make(){return{title:"면접 준비",icon:"🎤",blocks:[
     tb("callout","사용법: 질문만 훑으며 소리 내어 답해보고, 알트 엔터로 준비 답변과 비교하세요."),
     tb("h2","공통 질문"),
     tb("toggle","1분 자기소개를 해보세요.",{open:false}),
     tb("p","",{indent:1}),
     tb("toggle","지원 동기가 무엇인가요?",{open:false}),
     tb("p","",{indent:1}),
     tb("h2","직무 질문"),
     tb("toggle","",{open:false}),
     tb("p","",{indent:1})]};}},
  {cat:"취업",icon:"📮",name:"지원 현황 트래커",desc:"회사별 상태 라벨 — 지원함/서류/면접/결과",
   guide:"첫 회사 이름과 상태를 쓰세요. 상태는 줄 맨 앞에 지원함, 서류통과, 면접, 최종 중 하나로 시작하면 점자와 음성에서 바로 구분됩니다.",
   make(){return{title:"지원 현황",icon:"📮",blocks:[
     tb("callout","형식: \"상태 - 회사 - 직무 - 다음 일정\" (예: 면접 - 도트 - 프론트엔드 - 5월 3일 2차)"),
     tb("h2","진행 중"),tb("ul",""),tb("ul",""),
     tb("h2","할 일"),tb("todo",""),
     tb("h2","완료·불합"),tb("p","")]};}},

  /* ───── 라이프 세트 ───── */
  {cat:"라이프",icon:"🔁",name:"습관 트래커",desc:"주간 습관 체크 — 음성 완료와 궁합",
   guide:"습관 이름을 요일 아래 할 일 칸에 쓰세요. 매일 남은 할 일이라고 물으면 오늘 체크할 습관이 나옵니다.",
   make(){return{title:"습관 트래커 {오늘날짜} 주",icon:"🔁",blocks:[
     tb("callout","사용법: 아래 요일마다 같은 습관을 적어두고, 한 날 끝나면 \"1번 완료\"처럼 말로 체크하세요."),
     ...["월","화","수","목","금","토","일"].flatMap(day=>[tb("h3",day+"요일"),tb("todo","")]),
     tb("divider"),
     tb("h2","이번 주 돌아보기"),tb("p","")]};}},
  {cat:"라이프",icon:"🎯",name:"목표 플래너",desc:"분기 목표 → 이번 달 → 이번 주",
   guide:"분기 목표 한 줄부터 쓰세요. 개요라고 말하면 목표 구조를 훑을 수 있습니다.",
   make(){return{title:"목표 플래너 {연도}",icon:"🎯",blocks:[
     tb("h2","분기 목표"),tb("p",""),
     tb("h2","이번 달"),tb("todo",""),tb("todo",""),
     tb("h2","이번 주"),tb("todo",""),
     tb("divider"),
     tb("h2","점검 메모"),tb("p","")]};}},
  {cat:"라이프",icon:"🙏",name:"감사 일기",desc:"하루 세 줄 — 받아쓰기와 궁합",
   guide:"오늘 감사한 것 첫 번째 칸입니다. 받아쓰기 시작이라고 말하면 말로 쓸 수 있습니다.",
   make(){return{title:"감사 일기 {오늘날짜}",icon:"🙏",blocks:[
     tb("p","{오늘날짜} {요일}"),
     tb("h2","오늘 감사한 세 가지"),
     tb("ol",""),tb("ol",""),tb("ol",""),
     tb("h2","오늘의 한 문장"),tb("quote","")]};}},
  {cat:"라이프",icon:"🧳",name:"여행 체크리스트",desc:"짐 · 이동 경로 · 비상 정보",
   guide:"목적지와 날짜부터 채우세요. 비상 정보는 맨 아래에 있습니다 — 개요라고 말하면 섹션으로 바로 이동할 수 있습니다.",
   make(){return{title:"여행 준비",icon:"🧳",blocks:[
     tb("p","목적지: 　날짜: 　동행: "),
     tb("h2","짐 싸기"),tb("todo","지팡이·보조기기 충전기"),tb("todo",""),tb("todo",""),
     tb("h2","이동 경로"),
     tb("ol",""),tb("ol",""),
     tb("h2","예약 확인"),tb("todo",""),
     tb("h2","비상 정보"),
     tb("callout","숙소 주소·전화: "),
     tb("callout","현지 도움 요청 연락처: ")]};}},

  /* ───── 업무 세트 ───── */
  {cat:"업무",icon:"📋",name:"회의록",desc:"안건 · 논의 · 결정 · 액션 아이템",
   guide:"참석자를 채우고 안건부터 쓰세요. 회의록 시작이라고 말하면 음성 자동 기록도 됩니다.",
   make(){return{title:"회의록 {오늘날짜}",icon:"📋",blocks:[
     tb("p","일시: {오늘날짜} {시간}　참석: "),
     tb("h2","안건"),tb("ul",""),tb("ul",""),
     tb("h2","논의 내용"),tb("p",""),
     tb("h2","결정 사항"),tb("ul",""),
     tb("h2","액션 아이템"),tb("todo",""),tb("todo","")]};}},
  {cat:"업무",icon:"📰",name:"보도자료",desc:"제목·리드문(300자 제한)·본문·문의처",
   guide:"헤드라인부터 쓰세요. 리드문은 300자 제한이라 넘으면 바로 알려드립니다.",
   make(){return{title:"보도자료 {오늘날짜}",icon:"📰",blocks:[
     tb("p","배포일: {오늘날짜}　엠바고: "),
     tb("h2","헤드라인"),
     tb("p","",{limit:80}),
     tb("h2","리드문 (300자)"),
     tb("p","",{limit:300}),
     tb("h2","본문"),tb("p",""),tb("p",""),
     tb("h2","인용"),tb("quote",""),
     tb("h2","문의"),tb("p","홍보팀 　전화: 　메일: ")]};}},
  {cat:"업무",icon:"🎯",name:"프로젝트 개요",desc:"목표 · 마일스톤 · 리스크",
   guide:"한 줄 요약부터 채우세요.",
   make(){return{title:"프로젝트 개요",icon:"🎯",blocks:[
     tb("callout","한 줄 요약: "),
     tb("h2","목표"),tb("ul",""),
     tb("h2","마일스톤"),tb("todo",""),tb("todo",""),
     tb("divider"),
     tb("h2","리스크"),tb("ul","")]};}},
  {cat:"업무",icon:"✅",name:"데일리 플랜",desc:"오늘의 우선순위와 메모",
   guide:"오늘의 최우선 한 가지부터 쓰세요.",
   make(){return{title:"{오늘날짜} 플랜",icon:"✅",blocks:[
     tb("h2","오늘의 최우선"),tb("todo",""),
     tb("h2","할 일"),tb("todo",""),tb("todo",""),tb("todo",""),
     tb("divider"),
     tb("h2","메모"),tb("p","")]};}},
  {cat:"업무",icon:"🗓️",name:"주간 계획",desc:"월–금 요일별 할 일",
   guide:"월요일 할 일부터 쓰세요.",
   make(){return{title:"주간 계획",icon:"🗓️",blocks:
     ["월요일","화요일","수요일","목요일","금요일"].flatMap(day=>[tb("h2",day),tb("todo","")])
     .concat([tb("divider"),tb("h2","이번 주 회고"),tb("p","")])};}},
  {cat:"업무",icon:"💡",name:"브레인스톰",desc:"자유 발산 → 다음 단계 수렴",
   guide:"주제를 채우고 아이디어를 쏟아내세요.",
   make(){return{title:"브레인스톰",icon:"💡",blocks:[
     tb("callout","주제: "),
     tb("h2","아이디어"),tb("ul",""),tb("ul",""),tb("ul",""),
     tb("h2","다음 단계"),tb("todo","")]};}},
  {cat:"업무",icon:"🧪",name:"시연 준비",desc:"DotPad 시연 체크리스트 (demo-playbook)",
   guide:"전날 준비 체크리스트부터 확인하세요.",
   make(){return{title:"시연 준비",icon:"🧪",blocks:[
     tb("callout","장소: 　일시: 　브라우저: Chrome/Edge (Safari·Firefox 불가)"),
     tb("h2","전날 준비"),
     tb("todo","\"버전\" 음성 명령으로 배포 확인"),
     tb("todo","TTS 음성·마이크 감쇠 동작 확인"),
     tb("todo","DotPad 충전 + 페어링 + 표시 확인"),
     tb("todo","오프라인 대비 — 현장 인터넷 불확실하면 사전 로드"),
     tb("todo","시연 콘텐츠 준비"),
     tb("h2","현장 세팅"),
     tb("todo","블루투스 스피커 금지 — 유선/내장 스피커 사용"),
     tb("todo","NVDA 참석자 있으면 음성 안내 끄기 (이중발화 방지)"),
     tb("toggle","트러블슈팅 (접어두기)",{open:false}),
     tb("p","BLE 안 붙음: 블루투스 꺼다 켜기 → 재페어링. 미매칭 발생: \"미매칭 목록\"으로 클립보드 복사 후 전달. 화면만 바뀌고 기기 그대로: 기기 전원 재시작 후 재연결.",{indent:1})]};}},
];

/* ── 적용: 첫 입력 칸 포커스 + 가이드 낭독 ── */
function firstInputIdx(blocks){
  for(let i=0;i<blocks.length;i++){
    const b=blocks[i],txt=(b.text||"").trim();
    if(["divider","page","h1","h2","h3"].includes(b.type))continue;
    if(txt===""||/[:：]$/.test(txt))return i;          /* 빈 칸 또는 "라벨: " 꼴 */
  }
  return 0;
}
function applyTemplate(t){
  const spec=t.make();
  const p=newPage(null,tplVar(spec.title));
  p.icon=spec.icon;p.blocks=spec.blocks;
  const dlg=document.getElementById("tplDlg");if(dlg&&dlg.open)dlg.close();
  openPage(p.id);
  const fi=firstInputIdx(spec.blocks);
  setTimeout(()=>{try{focusBlock(fi);}catch(e){}},50);
  announce(`${t.name} 템플릿 적용. ${t.guide||"첫 입력 칸입니다."}`);
}
window.applyTemplate=applyTemplate;

/* ── 템플릿 선택 다이얼로그: 2단계(세트 → 템플릿) — 스크린리더 탐색 부담 최소화 ──
   1단계: 세트 4개만 낭독 → 엔터로 진입. 2단계: 해당 세트 템플릿만.
   백스페이스/왼쪽 화살표 = 세트 목록으로, Esc = 닫기. */
const TPL_CATS=[...new Set(PAGE_TEMPLATES.map(t=>t.cat))];
const TPL_CAT_ICONS={"학생":"🎓","취업":"💼","라이프":"🌱","업무":"🏢"};
function tplsOf(cat){return PAGE_TEMPLATES.filter(t=>t.cat===cat);}
function openTplDlg(cat){
  let dlg=document.getElementById("tplDlg");
  if(!dlg){
    dlg=document.createElement("dialog");dlg.id="tplDlg";
    dlg.setAttribute("aria-label","페이지 템플릿 선택");
    dlg.innerHTML='<div class="dlg-pad"><h2 id="tplHead">페이지 템플릿</h2><div id="tplList"></div></div>';
    document.body.appendChild(dlg);
    const st=document.createElement("style");
    st.textContent=`#tplDlg{width:420px;max-width:92vw}
#tplList{display:flex;flex-direction:column;gap:2px;max-height:420px;overflow-y:auto}
#tplList button{width:100%;display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:var(--r-md);text-align:left;transition:background var(--tr)}
#tplList button:hover,#tplList button:focus-visible{background:var(--accentSoft)}
#tplList .t-ico{width:32px;height:32px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);display:grid;place-items:center;font-size:16px;flex:none}
#tplList .t-name{font-size:14px;font-weight:500;color:var(--text)}
#tplList .t-desc{font-size:11.5px;color:var(--textDim)}
#tplList .t-cnt{font-size:11px;font-family:var(--font-mono);color:var(--textDim);margin-left:4px}
#tplList .t-back .t-ico{background:transparent;border:none}
#tplList .t-back .t-name{color:var(--textDim);font-weight:400}`;
    document.head.appendChild(st);
    const list=dlg.querySelector("#tplList"),head=dlg.querySelector("#tplHead");
    /* 1단계: 세트 목록 */
    dlg._cats=function(){
      dlg.dataset.cat="";head.textContent="페이지 템플릿";
      list.innerHTML="";
      TPL_CATS.forEach((c,i)=>{
        const ts=tplsOf(c);
        const b=document.createElement("button");
        b.innerHTML=`<span class="t-ico" aria-hidden="true">${TPL_CAT_ICONS[c]||"▤"}</span><span><div class="t-name">${c} 세트<span class="t-cnt">${ts.length}</span></div><div class="t-desc">${ts.map(t=>t.name).join(" · ")}</div></span>`;
        b.setAttribute("aria-label",`${c} 세트, 템플릿 ${ts.length}개: ${ts.map(t=>t.name).join(", ")}. ${i+1}/${TPL_CATS.length}`);
        b.addEventListener("click",()=>dlg._tpls(c));
        list.appendChild(b);
      });
      const f=list.querySelector("button");if(f)f.focus();
      announce(`페이지 템플릿. 세트 ${TPL_CATS.length}개 — ${TPL_CATS.join(", ")}. 위아래 화살표로 이동, 엔터로 세트를 여세요.`);
    };
    /* 2단계: 선택한 세트의 템플릿 */
    dlg._tpls=function(c){
      dlg.dataset.cat=c;head.textContent=c+" 세트";
      list.innerHTML="";
      const back=document.createElement("button");back.className="t-back";
      back.innerHTML='<span class="t-ico" aria-hidden="true">←</span><span><div class="t-name">세트 목록으로</div></span>';
      back.setAttribute("aria-label","뒤로. 세트 목록으로 돌아가기");
      back.addEventListener("click",()=>dlg._cats());
      list.appendChild(back);
      const ts=tplsOf(c);
      ts.forEach((t,i)=>{
        const b=document.createElement("button");
        b.innerHTML=`<span class="t-ico" aria-hidden="true">${t.icon}</span><span><div class="t-name">${t.name}</div><div class="t-desc">${t.desc}</div></span>`;
        b.setAttribute("aria-label",`${t.name} 템플릿. ${t.desc}. ${i+1}/${ts.length}`);
        b.addEventListener("click",()=>applyTemplate(t));
        list.appendChild(b);
      });
      const first=list.querySelectorAll("button")[1];if(first)first.focus();
      announce(`${c} 세트, 템플릿 ${ts.length}개. 첫 번째: ${ts[0].name}. 백스페이스를 누르면 세트 목록으로 돌아갑니다.`);
    };
    dlg.addEventListener("keydown",e=>{
      if((e.key==="Backspace"||e.key==="ArrowLeft")&&dlg.dataset.cat){e.preventDefault();dlg._cats();return;}
      if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
      e.preventDefault();
      const bs=[...list.querySelectorAll("button")];
      const i=bs.indexOf(document.activeElement);
      bs[e.key==="ArrowDown"?(i+1)%bs.length:(i-1+bs.length)%bs.length].focus();
    });
  }
  try{dlg.showModal();}catch(e){dlg.setAttribute("open","");}
  if(cat&&TPL_CATS.includes(cat))dlg._tpls(cat);else dlg._cats();
}

/* ── 엔진: 글자 수 제한 실시간 경고 (limit 블록) ── */
(function(){
  const _oi=onInput;
  onInput=function(e,i){
    const b=curPage().blocks[i];
    const wasOver=!!(b&&b.limit&&(b.text||"").length>b.limit);
    _oi(e,i);
    if(!b||!b.limit)return;
    const len=(b.text||"").length,over=len>b.limit;
    if(over&&!wasOver)announce(`글자 수 제한 ${b.limit}자를 넘었습니다. 현재 ${len}자.`);
    else if(!over&&wasOver)announce(`제한 ${b.limit}자 안으로 돌아왔습니다. 현재 ${len}자.`);
  };
})();

/* ── 엔진: 정답 가림 퀴즈 — 닫힌 토글의 하위를 읽기 경로에서 제외 ──
   visibleIdx()는 이미 닫힌 토글의 하위를 건너뛴다(블록 탐색·팬 폴백에 적용됨).
   여기서는 전체 읽기(F4·음성)와 연속 읽기(Reader)도 같은 규칙을 따르게 한다. */
(function(){
  function visibleText(){
    const p=curPage();
    return visibleIdx().map(i=>p.blocks[i]).filter(b=>b.text&&b.text.trim()).map(b=>b.text);
  }
  /* 음성 "전체 읽어" — 기존 규칙(점수 7)보다 높은 8로 가시 블록만 낭독 */
  RULES.push({kw:[["전체 읽어",8],["전부 읽어",8],["다 읽어",7]],run(){
    announce(pTitle(curPage())+". "+visibleText().join(". "));
  }});
  /* DotPad F4 */
  const _ok=BLE.onKey;
  BLE.onKey=function(key){
    if(key==="KeyFunction4"&&!(window.Reader&&window.Reader.on)){
      announce(pTitle(curPage())+". "+visibleText().join(". "));
      return;
    }
    _ok.call(BLE,key);
  };
  /* 연속 읽기: 닫힌 정답은 점자 정독에서도 건너뜀 */
  if(window.Reader){
    Reader.build=function(){
      const out=[],p=curPage();
      visibleIdx().forEach(i=>{
        const b=p.blocks[i];
        if(!b.text||!b.text.trim())return;
        if(out.length){out.push([]);out.push([]);}
        KB.brailleCells(b.text).forEach(c=>out.push(c));
      });
      return out;
    };
  }
  /* Alt+Enter = 포커스한 토글 열기/닫기 (퀴즈 정답 확인) */
  const _bk=blockKey;
  blockKey=function(e,i){
    if(e.altKey&&e.key==="Enter"){
      const b=curPage().blocks[i];
      if(b&&b.type==="toggle"){
        e.preventDefault();
        b.open=!b.open;renderBlocks();focusBlock(i);save();
        announce(b.open?"정답 열림.":"정답 닫힘.");
        return;
      }
    }
    _bk(e,i);
  };
  /* 음성 "정답"/"정답 보여줘" = 현재 또는 직전 토글 열기 토글 */
  RULES.push({kw:[["정답",8],["정답 보여",9],["답 보여",8]],run(){
    const p=curPage();let i=state.focusIdx;
    while(i>=0&&p.blocks[i]&&p.blocks[i].type!=="toggle")i--;
    const b=p.blocks[i];
    if(!b){announce("근처에 토글 문제가 없습니다.");return;}
    b.open=!b.open;renderBlocks();focusBlock(i);save();
    announce(b.open?`정답 열림. ${p.blocks[i+1]&&p.blocks[i+1].text?p.blocks[i+1].text:""}`:"정답 닫힘.");
  }});
})();

/* ── 사이드바 버튼 + 음성 명령 ── */
(function(){
  const nav=document.querySelector(".sidebar-nav");
  if(nav&&!document.getElementById("tplBtn")){
    const b=document.createElement("button");b.className="nav-item";b.id="tplBtn";
    b.innerHTML='<span class="nav-ico" aria-hidden="true">▤</span><span>템플릿</span>';
    b.addEventListener("click",openTplDlg);
    nav.appendChild(b);
  }
  RULES.push(
    {kw:[["템플릿",6]],run(){openTplDlg();}},
    ...TPL_CATS.map(c=>({kw:[[c+" 템플릿",8],[c+" 세트",8]],run(){openTplDlg(c);}})),
    ...PAGE_TEMPLATES.map(t=>({kw:[[t.name+" 템플릿",9]],run(){applyTemplate(t);}}))
  );
  window.openTplDlg=openTplDlg;window.PAGE_TEMPLATES=PAGE_TEMPLATES;   /* 디버깅·테스트용 */
})();
