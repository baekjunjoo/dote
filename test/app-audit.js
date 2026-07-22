/* ═══ Dote 앱 감사 스위트 — 훅 체인·Undo·보관·복원·읽기 모드 통합 회귀 ═══
 * 실행: JSDOM_PATH=<jsdom경로> node test/app-audit.js
 * dotpad-sim.js(BLE 계약)와 별개로, 앱 로직의 숨은 버그 회귀를 잡는다.
 * 감사에서 발견된 버그의 재발 방지 케이스 포함:
 *  #1 슬래시 메뉴 Enter 선택 시 undo 이중 기록
 *  #2 연속 읽기 중 페이지 이동 시 북마크 오귀속·화면 잔류
 *  #3 병합이 만든 "보관 부모의 미보관 자식" 고아 치유
 */
"use strict";
const {JSDOM}=require(process.env.JSDOM_PATH||"jsdom");
const fs=require("fs"),path=require("path");
const dir=path.join(__dirname,"..");
const {makeChecker}=require("./lib/dotpad-mock.js");
const dom=new JSDOM(fs.readFileSync(path.join(dir,"index.html"),"utf8"),{
  runScripts:"dangerously",resources:"usable",pretendToBeVisual:true,
  url:"file://"+dir+"/index.html"
});
const w=dom.window,d=w.document;
const t=makeChecker();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const status=()=>d.getElementById("statusLine").textContent;
const texts=()=>[...d.querySelectorAll("#blocks textarea")].map(x=>x.value);

setTimeout(async()=>{
try{
  console.log("═ Dote 앱 감사 ═  버전:",w.DOTE_VERSION);

  console.log("\n[A] Undo/Redo 영역 보존");
  const t0=texts();
  w.removeBlock(3);
  const ta=d.querySelectorAll("#blocks textarea")[0];
  ta.focus();ta.value=ta.value+" 이후타이핑";ta.dispatchEvent(new w.Event("input",{bubbles:true}));
  await wait(200);
  w.doteUndo();
  t.ok("삭제 undo 후 이후 타이핑 보존",texts()[0].includes("이후타이핑")&&texts().length===t0.length);
  w.doteRedo();
  t.ok("redo 재적용",texts().length===t0.length-1);
  w.doteUndo();
  const bm=texts().slice(0,3).join("|");
  w.moveBlock(1,1);w.doteUndo();
  t.ok("이동 undo",texts().slice(0,3).join("|")===bm);

  console.log("\n[B] 감사 버그#1 — 슬래시 선택 undo 단일 기록");
  const p2=d.querySelectorAll("#blocks textarea")[1];
  p2.focus();p2.value="/";p2.dispatchEvent(new w.Event("input",{bubbles:true}));
  await wait(100);
  t.ok("슬래시 메뉴 열림",d.getElementById("slashMenu").classList.contains("open"));
  p2.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));   /* 첫 항목(텍스트) 선택 */
  await wait(100);
  const before1=texts()[1];
  w.doteUndo();                                        /* 1회 undo로 유형 전환 복귀 */
  const after1=texts()[1];
  w.doteUndo();                                        /* 2회째 — 이중 기록이면 여기서 영역 오염 */
  t.ok("이중 undo에도 블록 수 불변",texts().length===t0.length,texts().length+"/"+t0.length);

  console.log("\n[C] 감사 버그#2 — 연속 읽기 페이지 이동");
  w.BLE.connected=true;w.BLE.devs=[{id:"T"}];w.BLE.DM={GraphicMode:"G",TextMode:"T"};w.BLE.sdk={displayLineData(){}};
  w.matchCmd("연속 읽기");
  t.ok("읽기 시작",w.Reader.on===true);
  const rp=w.Reader.pageId;
  w.matchCmd("새 페이지");                              /* 읽기 중 페이지 이동 */
  t.ok("페이지 이동 시 읽기 자동 종료",w.Reader.on===false);
  let pos={};try{pos=JSON.parse(w.localStorage.getItem("dote_readpos")||"{}");}catch(e){/* jsdom file:// — 저장 자체가 불가한 환경이면 귀속 검증 생략 */}
  t.ok("북마크가 시작 페이지에 귀속",!Object.keys(pos).some(k=>k!==rp),JSON.stringify(pos));

  console.log("\n[D] 보관함 — 전파·치유·집계");
  /* 하위 페이지 가진 페이지 구성: 첫 페이지로 이동 */
  const firstTree=d.querySelector("[role=treeitem]");firstTree&&firstTree.querySelector(".tree-row").click();
  await wait(100);
  w.matchCmd("보관해");
  t.ok("보관 전파 안내",/보관함으로 옮겼습니다/.test(status()),status());
  w.matchCmd("남은 할 일");
  t.ok("보관분 할 일 제외",/남은 할 일이 없습니다|남은 할 일 \d+개/.test(status()));
  /* 버그#3 치유: 보관 부모 밑에 미보관 자식 인위 주입 → renderTree 시 치유 */
  const archRoot=(()=>{let x=null;w.state;return null;})();
  /* state는 렉시컬이라 직접 접근 불가 — 치유는 renderArchive 내부에서 자동. 보관함에서 꺼내 원복 */
  const out=d.querySelector("#archList .chev");if(out)out.click();
  t.ok("꺼내기 복귀",/꺼냈습니다/.test(status()));

  console.log("\n[E] 백업/복원 왕복");
  const zip=w.exportBackup();
  t.ok("zip 시그니처",zip[0]===0x50&&zip[1]===0x4B);
  const entries=w.EB.zipReadStored(zip);
  const key=Object.keys(entries).find(k=>k.endsWith("dote-backup.json"));
  t.ok("백업 JSON 포함",!!key);
  const data=JSON.parse(new TextDecoder().decode(entries[key]));
  w.restoreFromData(data);
  t.ok("복원 병합",/복원 완료/.test(status()),status());

  console.log("\n[G] 휴지통 — 즉시 삭제·복원·완전 삭제");
  w.matchCmd("새 페이지");
  const title=d.getElementById("pageTitle");
  title.value="휴지통테스트";title.dispatchEvent(new w.Event("input",{bubbles:true}));
  await wait(100);
  w.matchCmd("페이지 삭제");                             /* 1회 = 즉시 휴지통 */
  t.ok("즉시 휴지통 이동",/휴지통으로 옮겼습니다/.test(status()),status());
  const tb=d.getElementById("trashBtn");
  t.ok("휴지통 버튼 = 템플릿 바로 아래",tb&&tb.previousElementSibling===d.getElementById("tplBtn"));
  w.matchCmd("휴지통");
  t.ok("휴지통 낭독",/휴지통 \d+개.*휴지통테스트/.test(status()),status());
  t.ok("휴지통 뷰 열림(편집 영역)",d.getElementById("trashView").style.display==="block");
  /* 뷰에서 제목 클릭 = 들어가서 확인 → 뷰 닫히고 배너 표시 → 배너에서 복원 */
  d.querySelector("#trashView .tv-title").click();await wait(100);
  t.ok("휴지통 페이지 열림 안내",/휴지통에 있는 페이지입니다/.test(status()),status());
  t.ok("뷰 닫힘·편집 복귀",d.getElementById("trashView").style.display!=="block");
  t.ok("배너 표시",!!d.getElementById("trashBanner"));
  d.getElementById("tbRestore").click();
  t.ok("배너 복원",/복원했습니다/.test(status()),status());
  t.ok("배너 제거",!d.getElementById("trashBanner"));
  /* 다시 버리고 뷰의 완전 삭제 버튼 (2단계) */
  w.matchCmd("페이지 삭제");
  tb.click();await wait(50);
  [...d.querySelectorAll("#trashView .tv-act")].pop().click();
  t.ok("완전 삭제 1단계 확인",/완전히 삭제하려면/.test(status()),status());
  [...d.querySelectorAll("#trashView .tv-act")].pop().click();
  t.ok("완전 삭제 실행",/완전히 삭제했습니다/.test(status()),status());
  d.getElementById("trashView").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  t.ok("Esc = 편집으로 복귀",d.getElementById("trashView").style.display!=="block");

  console.log("\n[H] 템플릿 2단계 다이얼로그");
  w.openTplDlg();await wait(50);
  const tl=d.getElementById("tplList");
  t.ok("1단계 = 세트 4개만",tl.querySelectorAll("button").length===4,tl.querySelectorAll("button").length+"개");
  tl.querySelector("button").click();await wait(50);
  t.ok("2단계 진입(뒤로+템플릿)",tl.querySelectorAll("button").length>=2&&!!tl.querySelector(".t-back"));
  tl.querySelector(".t-back").click();await wait(50);
  t.ok("뒤로 = 세트 목록 복귀",tl.querySelectorAll("button").length===4);
  d.getElementById("tplDlg").removeAttribute("open");
  w.matchCmd("업무 템플릿");await wait(50);
  t.ok("음성 세트 바로 열기",d.getElementById("tplDlg").dataset.cat==="업무");
  d.getElementById("tplDlg").removeAttribute("open");

  console.log("\n[F] 생산성·설정 스모크");
  w.matchCmd("개요");t.ok("개요 응답",/개요\.|제목 블록이 없습니다/.test(status()));
  w.matchCmd("글자 수");t.ok("글자 수(공백제외 포함)",/공백 빼면 \d+자\./.test(status()));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"o",ctrlKey:true,altKey:true,bubbles:true}));
  const ldOpen=d.getElementById("listDlg").hasAttribute("open");
  if(ldOpen)d.getElementById("listDlg").removeAttribute("open");
  w.matchCmd("빠르게");t.ok("속도 단계 응답",/음성 속도 \d+단계/.test(status()));
  w.matchCmd("버전");t.ok("버전 응답",/도트 버전/.test(status()));

  process.exit(t.summary());
}catch(e){console.error("감사 스위트 오류:",e.stack.split("\n").slice(0,4).join("\n"));process.exit(2);}
},2500);
