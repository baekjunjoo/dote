/* ═══ Dote 페이지 템플릿 — dotpad-templates 스킬의 선언적 스펙 방식 적용 ═══
   전역 렉시컬 스코프(nb, newPage, openPage, announce, RULES 등)를 공유한다. */
"use strict";

const PAGE_TEMPLATES=[
  {icon:"📋",name:"회의록",desc:"안건 · 논의 · 결정 · 액션 아이템",
   make(){const d=new Date();return{title:`회의록 ${d.getMonth()+1}월 ${d.getDate()}일`,icon:"📋",blocks:[
     nb("p","일시: 　참석: "),
     nb("h2","안건"),nb("ul",""),nb("ul",""),
     nb("h2","논의 내용"),nb("p",""),
     nb("h2","결정 사항"),nb("ul",""),
     nb("h2","액션 아이템"),nb("todo",""),nb("todo","")]};}},
  {icon:"✅",name:"데일리 플랜",desc:"오늘의 우선순위와 메모",
   make(){const d=new Date();return{title:`${d.getMonth()+1}월 ${d.getDate()}일 플랜`,icon:"✅",blocks:[
     nb("h2","오늘의 최우선"),nb("todo",""),
     nb("h2","할 일"),nb("todo",""),nb("todo",""),nb("todo",""),
     nb("divider"),
     nb("h2","메모"),nb("p","")]};}},
  {icon:"🗓️",name:"주간 계획",desc:"월–금 요일별 할 일",
   make(){return{title:"주간 계획",icon:"🗓️",blocks:
     ["월요일","화요일","수요일","목요일","금요일"].flatMap(day=>[nb("h2",day),nb("todo","")])
     .concat([nb("divider"),nb("h2","이번 주 회고"),nb("p","")])};}},
  {icon:"📚",name:"독서 노트",desc:"핵심 문장 · 내 생각 · 실천",
   make(){return{title:"독서 노트",icon:"📚",blocks:[
     nb("p","저자: 　출판: "),
     nb("h2","핵심 문장"),nb("quote",""),
     nb("h2","내 생각"),nb("p",""),
     nb("h2","실천할 것"),nb("todo","")]};}},
  {icon:"🎓",name:"강의 노트",desc:"핵심 개념 · 질문 · 복습",
   make(){return{title:"강의 노트",icon:"🎓",blocks:[
     nb("p","과목: 　강사: 　날짜: "),
     nb("h2","핵심 개념"),nb("ul",""),nb("ul",""),
     nb("h2","질문"),nb("todo",""),
     nb("toggle","복습 정리 (접어두기)"),
     Object.assign(nb("p",""),{indent:1})]};}},
  {icon:"🎯",name:"프로젝트 개요",desc:"목표 · 마일스톤 · 리스크",
   make(){return{title:"프로젝트 개요",icon:"🎯",blocks:[
     nb("callout","한 줄 요약: "),
     nb("h2","목표"),nb("ul",""),
     nb("h2","마일스톤"),nb("todo",""),nb("todo",""),
     nb("divider"),
     nb("h2","리스크"),nb("ul","")]};}},
  {icon:"💡",name:"브레인스톰",desc:"자유 발산 → 다음 단계 수렴",
   make(){return{title:"브레인스톰",icon:"💡",blocks:[
     nb("callout","주제: "),
     nb("h2","아이디어"),nb("ul",""),nb("ul",""),nb("ul",""),
     nb("h2","다음 단계"),nb("todo","")]};}},
  {icon:"🧪",name:"시연 준비",desc:"DotPad 시연 체크리스트 (demo-playbook)",
   make(){return{title:"시연 준비",icon:"🧪",blocks:[
     nb("callout","장소: 　일시: 　브라우저: Chrome/Edge (Safari·Firefox 불가)"),
     nb("h2","전날 준비"),
     nb("todo","\"버전\" 음성 명령으로 배포 확인"),
     nb("todo","TTS 음성·마이크 감쇠 동작 확인"),
     nb("todo","DotPad 충전 + 페어링 + 표시 확인"),
     nb("todo","오프라인 대비 — 현장 인터넷 불확실하면 사전 로드"),
     nb("todo","시연 콘텐츠 준비"),
     nb("h2","현장 세팅"),
     nb("todo","블루투스 스피커 금지 — 유선/내장 스피커 사용"),
     nb("todo","NVDA 참석자 있으면 음성 안내 끄기 (이중발화 방지)"),
     nb("toggle","트러블슈팅 (접어두기)"),
     Object.assign(nb("p","BLE 안 붙음: 블루투스 꺼다 켜기 → 재페어링. 미매칭 발생: \"미매칭 목록\"으로 클립보드 복사 후 전달. 화면만 바뀌고 기기 그대로: 기기 전원 재시작 후 재연결."),{indent:1})]};}},
];

function applyTemplate(t){
  const spec=t.make();
  const p=newPage(null,spec.title);
  p.icon=spec.icon;p.blocks=spec.blocks;
  const dlg=document.getElementById("tplDlg");if(dlg&&dlg.open)dlg.close();
  openPage(p.id);
  announce(`${t.name} 템플릿으로 새 페이지를 만들었습니다. 블록 ${spec.blocks.length}개. 제목부터 확인하세요.`);
}

/* ── 템플릿 선택 다이얼로그 (키보드·스크린리더 완결) ── */
function openTplDlg(){
  let dlg=document.getElementById("tplDlg");
  if(!dlg){
    dlg=document.createElement("dialog");dlg.id="tplDlg";
    dlg.setAttribute("aria-label","페이지 템플릿 선택");
    dlg.innerHTML='<div class="dlg-pad"><h2>페이지 템플릿</h2><div id="tplList"></div></div>';
    document.body.appendChild(dlg);
    const st=document.createElement("style");
    st.textContent=`#tplDlg{width:400px;max-width:92vw}
#tplList{display:flex;flex-direction:column;gap:2px}
#tplList button{width:100%;display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:var(--r-md);text-align:left;transition:background var(--tr)}
#tplList button:hover,#tplList button:focus-visible{background:var(--accentSoft)}
#tplList .t-ico{width:32px;height:32px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);display:grid;place-items:center;font-size:16px;flex:none}
#tplList .t-name{font-size:14px;font-weight:500;color:var(--text)}
#tplList .t-desc{font-size:11.5px;color:var(--textDim)}`;
    document.head.appendChild(st);
    const list=dlg.querySelector("#tplList");
    PAGE_TEMPLATES.forEach((t,i)=>{
      const b=document.createElement("button");
      b.innerHTML=`<span class="t-ico" aria-hidden="true">${t.icon}</span><span><div class="t-name">${t.name}</div><div class="t-desc">${t.desc}</div></span>`;
      b.setAttribute("aria-label",`${t.name} 템플릿, ${t.desc}. ${i+1}/${PAGE_TEMPLATES.length}`);
      b.addEventListener("click",()=>applyTemplate(t));
      list.appendChild(b);
    });
    dlg.addEventListener("keydown",e=>{                 /* ↑↓ 순환 이동 */
      if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
      e.preventDefault();
      const bs=[...list.querySelectorAll("button")];
      const i=bs.indexOf(document.activeElement);
      const n=e.key==="ArrowDown"?(i+1)%bs.length:(i-1+bs.length)%bs.length;
      bs[n].focus();
    });
  }
  dlg.showModal();
  const first=dlg.querySelector("#tplList button");if(first)first.focus();
  announce(`페이지 템플릿 ${PAGE_TEMPLATES.length}개. 위아래 화살표로 이동, 엔터로 선택, 이스케이프로 닫기. 첫 번째: ${PAGE_TEMPLATES[0].name}.`);
}

/* ── 사이드바 버튼 + 음성 명령 ── */
(function(){
  const nav=document.querySelector(".sidebar-nav");
  if(nav){
    const b=document.createElement("button");b.className="nav-item";b.id="tplBtn";
    b.innerHTML='<span class="nav-ico" aria-hidden="true">▤</span><span>템플릿</span>';
    b.addEventListener("click",openTplDlg);
    nav.appendChild(b);
  }
  RULES.push(
    {kw:[["템플릿",6]],run(){openTplDlg();}},
    ...PAGE_TEMPLATES.map(t=>({kw:[[t.name+" 템플릿",9]],run(){applyTemplate(t);}}))
  );
  window.openTplDlg=openTplDlg;window.PAGE_TEMPLATES=PAGE_TEMPLATES;   /* 디버깅·테스트용 */
})();
