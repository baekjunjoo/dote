/* ═══ Dote 클라우드 — Supabase 이메일 로그인 + 문서 동기화 ═══
   - RLS: docs 테이블은 본인 행(user_id = auth.uid())만 읽기/쓰기 가능
   - 동기화 전략: 최신 수정본 우선(LWW). 로그인 시 원격이 더 새로우면 내려받고, 아니면 올린다.
   - 이후에는 save()마다 2초 디바운스로 자동 업로드. 오프라인이면 조용히 로컬 전용으로 동작.
   - 모든 상태 변화는 announce()로 음성·점자·상태줄에 안내(tactile-ux: 무음 금지). */
"use strict";
(function(){
const SB_URL="https://ilzptifmkdncllsujdms.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsenB0aWZta2RuY2xsc3VqZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTMyODMsImV4cCI6MjA5OTU2OTI4M30.iB1kmWou6pAybDw_osgnucK3aMVV5E4ljmRLhgXXvDs"; /* anon 공개 키(RLS로 보호) */
let SB=null,user=null,pushT=null,pulling=false;

function slot(){return document.getElementById("userSlot");}
function setSlot(){
  const s=slot();if(!s)return;
  if(user){s.textContent=user.email;s.setAttribute("aria-label",`로그인됨: ${user.email}. 계정 메뉴 열기`);}
  else{s.textContent="로그인";s.setAttribute("aria-label","로그인");}
}
function latestLocal(){let t=0;state.pages.forEach(p=>{if(p.updated&&p.updated>t)t=p.updated;});return t;}

/* ── 계정 다이얼로그 ── */
const dlg=document.createElement("dialog");
dlg.id="authDlg";dlg.setAttribute("aria-label","계정");
const inputCss="width:100%;background:var(--surface);border:1px solid var(--borderStrong);border-radius:8px;padding:9px 12px;font-size:14px;color:var(--text);caret-color:var(--accent)";
dlg.innerHTML='<div class="dlg-pad" style="min-width:340px">'
 +'<h2>계정</h2>'
 +'<div id="authForm">'
 +'<label for="authEmail" style="display:block;font-size:13px;margin:8px 0 4px">이메일</label>'
 +'<input id="authEmail" type="email" autocomplete="email" style="'+inputCss+'">'
 +'<label for="authPw" style="display:block;font-size:13px;margin:10px 0 4px">비밀번호 (6자 이상)</label>'
 +'<input id="authPw" type="password" autocomplete="current-password" style="'+inputCss+'">'
 +'<div style="display:flex;gap:8px;margin-top:14px">'
 +'<button class="btn-cta" id="authLogin">로그인</button>'
 +'<button class="btn" id="authSignup" style="border:1px solid var(--border)">회원가입</button>'
 +'<button class="btn" id="authClose" style="border:1px solid var(--border)">닫기</button></div>'
 +'<p style="font-size:11px;color:var(--textDim);margin-top:12px">문서는 내 계정에만 저장되며 다른 사람은 볼 수 없습니다. 로그인하면 다른 기기에서도 같은 문서를 쓸 수 있어요.</p></div>'
 +'<div id="authIn" style="display:none">'
 +'<p id="authWho" style="font-size:13px;color:var(--textMuted);margin-bottom:12px"></p>'
 +'<div style="display:flex;gap:8px">'
 +'<button class="btn" id="authSync" style="border:1px solid var(--border)">지금 동기화</button>'
 +'<button class="btn-cta" id="authLogout">로그아웃</button>'
 +'<button class="btn" id="authClose2" style="border:1px solid var(--border)">닫기</button></div></div></div>';
document.body.appendChild(dlg);
const $a=s=>dlg.querySelector(s);

function open(){
  if(!SB){announce("클라우드 모듈이 아직 준비되지 않았습니다. 네트워크를 확인하세요.");return;}
  if(user){
    $a("#authForm").style.display="none";$a("#authIn").style.display="";
    $a("#authWho").textContent=`${user.email} 계정으로 로그인되어 있습니다.`;
    dlg.showModal();announce(`계정. ${user.email}. 지금 동기화, 로그아웃 버튼이 있습니다.`);
  }else{
    $a("#authForm").style.display="";$a("#authIn").style.display="none";
    dlg.showModal();$a("#authEmail").focus();
    announce("로그인. 이메일과 비밀번호를 입력하세요. 처음이면 회원가입 버튼을 누르세요.");
  }
}

async function login(signup){
  const email=$a("#authEmail").value.trim(),pw=$a("#authPw").value;
  if(!email||!pw){announce("이메일과 비밀번호를 입력하세요.");return;}
  announce(signup?"가입 중입니다. 잠시만요.":"로그인 중입니다. 잠시만요.");
  try{
    const r=signup
      ?await SB.auth.signUp({email,password:pw})
      :await SB.auth.signInWithPassword({email,password:pw});
    if(r.error){announce((signup?"가입 실패: ":"로그인 실패: ")+r.error.message);return;}
    if(signup&&!r.data.session){announce("가입 확인 메일을 보냈습니다. 메일함에서 도트가 보낸 메일을 열어 링크를 누른 다음, 여기로 돌아와 로그인해 주세요.");dlg.close();return;}
    user=r.data.user;setSlot();dlg.close();
    announce(`${user.email} 계정으로 로그인했습니다. 문서를 동기화합니다.`);
    await pull();
  }catch(e){announce("네트워크 오류로 로그인하지 못했습니다.");}
}
async function logout(){
  try{await SB.auth.signOut();}catch(e){}
  user=null;setSlot();dlg.close();
  announce("로그아웃했습니다. 문서는 이 기기에 그대로 남아 있습니다.");
}

/* ── 동기화: 페이지 단위 병합 ──
   문서 전체 LWW는 다기기 부분 수정을 유실시킴(1주 페르소나 테스트 🔴).
   → 페이지 id별로 updated가 큰 쪽을 채택하고, 삭제는 묘비(tombstone)로 전파해
     다른 기기에서 지운 페이지가 부활하지 않게 한다. 같은 페이지를 양쪽에서 고친
     경우만 페이지 단위 최신 우선(블록 단위 병합은 범위 외). */
function loadTombs(){try{return JSON.parse(localStorage.getItem("dote_tombs")||"{}");}catch(e){return{};}}
function saveTombs(t){try{localStorage.setItem("dote_tombs",JSON.stringify(t));}catch(e){}}
function mergeDocs(localPages,localTombs,remote){
  const rPages=(remote&&remote.pages)||[];
  const rTombs=(remote&&remote.tombs)||{};
  const tombs={};
  for(const id in localTombs)tombs[id]=localTombs[id];
  for(const id in rTombs)if(!tombs[id]||rTombs[id]>tombs[id])tombs[id]=rTombs[id];
  const byId={};
  localPages.forEach(p=>{byId[p.id]=p;});
  let pulled=0;
  rPages.forEach(rp=>{
    const lp=byId[rp.id];
    if(!lp||(rp.updated||0)>(lp.updated||0)){if(!lp||JSON.stringify(lp)!==JSON.stringify(rp))pulled++;byId[rp.id]=rp;}
  });
  const pages=Object.values(byId).filter(p=>!(tombs[p.id]&&tombs[p.id]>=(p.updated||0)));
  const cut=Date.now()-30*24*3600*1000;                /* 30일 지난 묘비 정리 */
  for(const id in tombs)if(tombs[id]<cut)delete tombs[id];
  return {pages,tombs,pulled};
}
async function pull(){
  if(!SB||!user)return;
  try{
    const {data,error}=await SB.from("docs").select("data,updated_at").eq("user_id",user.id).maybeSingle();
    if(error){announce("동기화 확인에 실패했습니다: "+error.message);return;}
    const remote=data&&data.data?data.data:null;
    const r=mergeDocs(state.pages,loadTombs(),remote);
    pulling=true;
    state.pages=r.pages;
    if(!state.pages.length)newPage(null);
    if(!state.pages.find(p=>p.id===state.cur))
      state.cur=(remote&&remote.cur&&state.pages.find(p=>p.id===remote.cur))?remote.cur:state.pages[0].id;
    state.focusIdx=0;
    saveTombs(r.tombs);
    renderAll();save();
    pulling=false;
    await pushNow();                                   /* 병합 결과를 클라우드에 반영 */
    announce(r.pulled
      ?`동기화 완료. 다른 기기에서 수정한 페이지 ${r.pulled}개를 반영했습니다.`
      :"동기화 완료. 모든 기기가 같은 상태입니다.");
  }catch(e){pulling=false;announce("동기화 중 오류가 발생했습니다.");}
}
async function pushNow(){
  if(!SB||!user)return;
  try{
    await SB.from("docs").upsert({user_id:user.id,data:{pages:state.pages,cur:state.cur,tombs:loadTombs()},updated_at:new Date().toISOString()});
  }catch(e){}
}
function schedulePush(){
  if(!user||pulling)return;
  clearTimeout(pushT);
  pushT=setTimeout(()=>{
    if(navigator.onLine===false){trySyncRegister();return;}   /* 오프라인: 복귀 시 처리 */
    pushNow();
  },2000);
}

/* ── 오프라인 복귀 자동 동기화 (1주 테스트: 지하철 시나리오 마무리) ──
   오프라인 편집은 로컬에 쌓이고, 복귀 즉시 pull(페이지 병합)로 양방향 동기화.
   백그라운드 탭이면 SW Background Sync가 대신 깨운다. */
function trySyncRegister(){
  try{
    if("serviceWorker"in navigator&&"SyncManager"in window)
      navigator.serviceWorker.ready.then(r=>r.sync.register("dote-sync")).catch(()=>{});
  }catch(e){}
}
window.addEventListener("offline",()=>{
  announce("오프라인입니다. 문서는 이 기기에 저장되며, 연결되면 자동으로 동기화합니다.");
});
window.addEventListener("online",()=>{
  if(user){announce("온라인에 다시 연결되었습니다. 문서를 동기화합니다.");pull();}
  else announce("온라인에 다시 연결되었습니다.");
});
if("serviceWorker"in navigator&&navigator.serviceWorker.addEventListener){
  navigator.serviceWorker.addEventListener("message",e=>{
    if(e.data&&e.data.type==="dote-sync"&&user)pull();
  });
}

/* save() 훅: 로컬 저장 때마다 클라우드 예약 저장(2초 디바운스) */
const _save=save;
save=function(){_save();schedulePush();};

/* 삭제 전파: 삭제 시각을 묘비로 기록 → 다른 기기에서 부활 방지 */
const _del=delPage;
delPage=function(id){
  const before=state.pages.map(p=>p.id);
  _del(id);
  const now=new Set(state.pages.map(p=>p.id));
  const t=loadTombs();let ch=false;
  before.forEach(pid=>{if(!now.has(pid)){t[pid]=Date.now();ch=true;}});
  if(ch){saveTombs(t);schedulePush();}
};

/* 음성 명령 */
RULES.push(
  {kw:[["로그인",7],["계정",5]],run(){open();}},
  {kw:[["로그아웃",9]],run(){user?logout():announce("로그인되어 있지 않습니다.");}},
  {kw:[["동기화",7],["클라우드 저장",8]],run(){user?(pushNow(),announce("클라우드에 저장했습니다.")):announce("먼저 로그인하세요.");}}
);

$a("#authLogin").addEventListener("click",()=>login(false));
$a("#authSignup").addEventListener("click",()=>login(true));
$a("#authClose").addEventListener("click",()=>dlg.close());
$a("#authClose2").addEventListener("click",()=>dlg.close());
$a("#authLogout").addEventListener("click",logout);
$a("#authSync").addEventListener("click",async()=>{await pushNow();announce("클라우드에 저장했습니다.");});
$a("#authPw").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();login(false);}});

window.Auth={open,logout,pushNow,mergeDocs,get user(){return user;}};   /* mergeDocs는 테스트용 노출 */

/* supabase-js 로드 → 세션 복원(재방문 시 자동 로그인 상태) */
const sc=document.createElement("script");
sc.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
sc.onload=async()=>{
  SB=window.supabase.createClient(SB_URL,SB_KEY);
  try{
    const {data}=await SB.auth.getSession();
    if(data&&data.session){user=data.session.user;setSlot();announce(`${user.email} 계정으로 로그인되어 있습니다.`);pull();}
  }catch(e){}
};
sc.onerror=()=>{};                                   /* 오프라인: 로컬 전용으로 동작 */
document.body.appendChild(sc);
setSlot();
})();
