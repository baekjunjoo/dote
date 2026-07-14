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
 +'<button class="btn" id="authClose" style="border:1px solid var(--border)">닫기</button></div></div>'
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
    if(signup&&!r.data.session){announce("확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 다시 로그인하세요.");dlg.close();return;}
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

/* ── 동기화 (LWW) ── */
async function pull(){
  if(!SB||!user)return;
  try{
    const {data,error}=await SB.from("docs").select("data,updated_at").eq("user_id",user.id).maybeSingle();
    if(error){announce("동기화 확인에 실패했습니다: "+error.message);return;}
    const remoteT=data?new Date(data.updated_at).getTime():0;
    if(data&&data.data&&data.data.pages&&data.data.pages.length&&remoteT>latestLocal()){
      pulling=true;
      state.pages=data.data.pages;
      state.cur=state.pages.find(p=>p.id===data.data.cur)?data.data.cur:state.pages[0].id;
      state.focusIdx=0;
      renderAll();save();
      pulling=false;
      announce(`클라우드 문서 ${state.pages.length}페이지를 불러왔습니다.`);
    }else{
      await pushNow();
      announce("이 기기의 문서를 클라우드에 저장했습니다.");
    }
  }catch(e){pulling=false;announce("동기화 중 오류가 발생했습니다.");}
}
async function pushNow(){
  if(!SB||!user)return;
  try{
    await SB.from("docs").upsert({user_id:user.id,data:{pages:state.pages,cur:state.cur},updated_at:new Date().toISOString()});
  }catch(e){}
}
function schedulePush(){
  if(!user||pulling)return;
  clearTimeout(pushT);pushT=setTimeout(pushNow,2000);
}

/* save() 훅: 로컬 저장 때마다 클라우드 예약 저장(2초 디바운스) */
const _save=save;
save=function(){_save();schedulePush();};

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

window.Auth={open,logout,pushNow,get user(){return user;}};

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
