var KB=(function(){var module={exports:{}};
/* korean-braille — Super Dot 검증 점역 엔진 (개정 한국 점자 규정 약자·약어 + UEB Grade 2)
   원본: baekjunjoo/superdot index.html — 실기기·규정 검증값. 표의 값 수정 금지.
   사용: const B=require("./braille"); B.setGrade("g2"|"g1"); B.brailleCells("팠다") → [[점번호,...],...] */
var window={SD:{cfg:{grade:"g2"}}};var SD=window.SD;
var BRAILLE={a:[1],b:[1,2],c:[1,4],d:[1,4,5],e:[1,5],f:[1,2,4],g:[1,2,4,5],h:[1,2,5],i:[2,4],j:[2,4,5],k:[1,3],l:[1,2,3],m:[1,3,4],n:[1,3,4,5],o:[1,3,5],p:[1,2,3,4],q:[1,2,3,4,5],r:[1,2,3,5],s:[2,3,4],t:[2,3,4,5],u:[1,3,6],v:[1,2,3,6],w:[2,4,5,6],x:[1,3,4,6],y:[1,3,4,5,6],z:[1,3,5,6],'.':[2,5,6],',':[2],'-':[3,6],':':[2,5],'?':[2,3,6],'!':[2,3,5],"'":[3],'/':[3,4],' ':[]};
var NUMSIGN=[3,4,5,6],DIGITMAP={'1':'a','2':'b','3':'c','4':'d','5':'e','6':'f','7':'g','8':'h','9':'i','0':'j'};
function dotsToByte(dots){var b=0;for(var i=0;i<dots.length;i++)b|=(1<<(dots[i]-1));return b;}
/* ── 한국 점자 기본형 표 (초성/중성/종성, 약자 미적용) ──
   각 항목은 셀 배열(겹자모·된소리는 복수 셀). 초성 ㅇ은 무표기. */
var KCHO=[ [[4]], [[6],[4]], [[1,4]], [[2,4]], [[6],[2,4]], [[5]], [[1,5]], [[4,5]], [[6],[4,5]],
  [[6]], [[6],[6]], [], [[4,6]], [[6],[4,6]], [[5,6]], [[1,2,4]], [[1,2,5]], [[1,4,5]], [[2,4,5]] ];
var KJUNG=[ [[1,2,6]], [[1,2,3,5]], [[3,4,5]], [[3,4,5],[1,2,3,5]], [[2,3,4]], [[1,3,4,5]],
  [[1,5,6]], [[3,4]], [[1,3,6]], [[1,2,3,6]], [[1,2,3,6],[1,2,3,5]], [[1,3,4,5,6]], [[3,4,6]],
  [[1,3,4]], [[1,2,3,4]], [[1,2,3,4],[1,2,3,5]], [[1,3,4],[1,2,3,5]], [[1,4,6]], [[2,4,6]],
  [[2,4,5,6]], [[1,3,5]] ];
var KJONG=[ [], [[1]], [[1],[1]], [[1],[3]], [[2,5]], [[2,5],[1,3]], [[2,5],[3,5,6]], [[3,5]],
  [[2]], [[2],[1]], [[2],[2,6]], [[2],[1,2]], [[2],[3]], [[2],[2,3,6]], [[2],[2,5,6]], [[2],[3,5,6]],
  [[2,6]], [[1,2]], [[1,2],[3]], [[3]], [[3,4]], [[2,3,5,6]], [[1,3]], [[2,3]], [[2,3,5]],
  [[2,3,6]], [[2,5,6]], [[3,5,6]] ];

/* ══════════ 점자 변환기: 한국 점자 약자·약어(개정 한국 점자 규정) + UEB Grade 2 핵심 ══════════ */

/* ── 한국 점자 약자 데이터 (규정 제13~18항) ── */
// ㅏ 생략 약자 (제13항): cho index -> cells. ㄹ/ㅇ/ㅊ 제외, 된소리는 된소리표(6) 선행
var KR_A={0:[[1,2,4,6]],1:[[6],[1,2,4,6]],2:[[1,4]],3:[[2,4]],4:[[6],[2,4]],6:[[1,5]],7:[[4,5]],8:[[6],[4,5]],
          9:[[1,2,3]],10:[[6],[1,2,3]],12:[[4,6]],13:[[6],[4,6]],15:[[1,2,4]],16:[[1,2,5]],17:[[1,4,5]],18:[[2,4,5]]};
// 제14항 모음 제약 대상(나다마바자카타파하 + 된소리 짝)
var KR_A_VRESTRICT={2:1,3:1,4:1,6:1,7:1,8:1,12:1,13:1,15:1,16:1,17:1,18:1};
// 종성 분해: jong index -> 자음 토큰 배열
var JONG_PARTS=[[],['g'],['g','g'],['g','s'],['n'],['n','j'],['n','h'],['d'],['l'],['l','g'],['l','m'],
  ['l','b'],['l','s'],['l','t'],['l','p'],['l','h'],['m'],['b'],['b','s'],['s'],['ss'],['ng'],['j'],['ch'],['k'],['t'],['p'],['h']];
// 받침 단일 자음 점형
var JONG_DOT={g:[1],n:[2,5],d:[3,5],l:[2],m:[2,6],b:[1,2],s:[3],ss:[3,4],ng:[2,3,5,6],j:[1,3],ch:[2,3],k:[2,3,5],t:[2,3,6],p:[2,5,6],h:[3,5,6]};
// 라임 약자 (제15항): jung index + 첫 종성 토큰 -> 점형
var KR_RIME={'4g':[1,4,5,6],'4n':[2,3,4,5,6],'4l':[2,3,4,5],'6n':[1,6],'6l':[1,2,5,6],'6ng':[1,2,4,5,6],
  '8g':[1,3,4,6],'8n':[1,2,3,5,6],'8ng':[1,2,3,4,5,6],'13n':[1,2,4,5],'13l':[1,2,3,4,6],
  '18n':[1,3,5,6],'18l':[2,3,4,6],'20n':[1,2,3,4,5]};
// 약어 (제18항): 어두에서만, 긴 것 우선
var KR_ABBR=[['그리하여',[[1],[1,5,6]]],['그러므로',[[1],[2,6]]],['그러면',[[1],[2,5]]],['그런데',[[1],[1,3,4,5]]],
  ['그래서',[[1],[2,3,4]]],['그러나',[[1],[1,4]]],['그리고',[[1],[1,3,6]]]];

function isHangul(code){return code>=0xAC00&&code<=0xD7A3;}

/* 한 음절 -> 셀 배열. nextIsVowelSyll = 같은 단어 내 다음 음절 첫소리가 ㅇ */
function encodeKrSyllable(code,nextIsVowelSyll){
  var c=code-0xAC00,cho=(c/588)|0,jung=((c%588)/28)|0,jong=c%28;
  var parts=JONG_PARTS[jong],out=[],i;
  // 것/껏 (제13·16항)
  if(jung===4&&jong===19&&(cho===0||cho===1)){
    if(cho===1)out.push([6]);
    out.push([4,5,6]);out.push([2,3,4]);return out;
  }
  // ㅏ 생략 약자 (제13·14·16항)
  if(jung===0&&KR_A[cho]){
    var blocked=false;
    if(jong===0&&nextIsVowelSyll&&KR_A_VRESTRICT[cho])blocked=true;     // 제14항
    if(cho===17&&jong===20)blocked=true;                                // 제14항 붙임: 팠
    if(!blocked){
      var base=KR_A[cho];
      for(i=0;i<base.length;i++)out.push(base[i]);
      for(i=0;i<parts.length;i++)out.push(JONG_DOT[parts[i]]);
      return out;
    }
  }
  // 제17항: 성·썽·정·쩡·청 = ㅅ·ㅆ·ㅈ·ㅉ·ㅊ + 영(12456) 약자
  if(jung===4&&jong===21&&(cho===9||cho===10||cho===12||cho===13||cho===14)){
    var cc=KCHO[cho];
    for(i=0;i<cc.length;i++)out.push(cc[i]);
    out.push([1,2,4,5,6]);return out;
  }
  // 라임 약자 (제15항): 중성+첫 종성
  if(parts.length){
    var rime=KR_RIME[jung+''+parts[0]];
    if(rime){
      var choCells=KCHO[cho];
      for(i=0;i<choCells.length;i++)out.push(choCells[i]);
      out.push(rime);
      for(i=1;i<parts.length;i++)out.push(JONG_DOT[parts[i]]);
      return out;
    }
  }
  // 풀어쓰기 (자모)
  var seq=KCHO[cho].concat(KJUNG[jung]).concat(KJONG[jong]);
  for(i=0;i<seq.length;i++)out.push(seq[i]);
  return out;
}

/* ── UEB Grade 2 핵심 (통일영어점자 규정 제10장) ── */
var L={a:[1],b:[1,2],c:[1,4],d:[1,4,5],e:[1,5],f:[1,2,4],g:[1,2,4,5],h:[1,2,5],i:[2,4],j:[2,4,5],k:[1,3],l:[1,2,3],m:[1,3,4],n:[1,3,4,5],o:[1,3,5],p:[1,2,3,4],q:[1,2,3,4,5],r:[1,2,3,5],s:[2,3,4],t:[2,3,4,5],u:[1,3,6],v:[1,2,3,6],w:[2,4,5,6],x:[1,3,4,6],y:[1,3,4,5,6],z:[1,3,5,6]};
// 알파벳 단어 약자 + 온칸 단어 약자 + 하위 단어 약자 + 온칸 약자(단어로) + 어두 약자(단어로)
var EN_WORD={but:[L.b],can:[L.c],do:[L.d],every:[L.e],from:[L.f],go:[L.g],have:[L.h],just:[L.j],
  knowledge:[L.k],like:[L.l],more:[L.m],not:[L.n],people:[L.p],quite:[L.q],rather:[L.r],so:[L.s],
  that:[L.t],us:[L.u],very:[L.v],will:[L.w],it:[L.x],you:[L.y],as:[L.z],
  child:[[1,6]],shall:[[1,4,6]],this:[[1,4,5,6]],which:[[1,5,6]],out:[[1,2,5,6]],still:[[3,4]],
  and:[[1,2,3,4,6]],'for':[[1,2,3,4,5,6]],of:[[1,2,3,5,6]],the:[[2,3,4,6]],'with':[[2,3,4,5,6]],
  be:[[2,3]],enough:[[2,6]],were:[[2,3,5,6]],his:[[2,3,6]],'in':[[3,5]],was:[[3,5,6]],
  day:[[5],L.d],ever:[[5],L.e],father:[[5],L.f],here:[[5],L.h],know:[[5],L.k],lord:[[5],L.l],
  mother:[[5],L.m],name:[[5],L.n],one:[[5],L.o],part:[[5],L.p],question:[[5],L.q],right:[[5],L.r],
  some:[[5],L.s],time:[[5],L.t],under:[[5],L.u],work:[[5],L.w],young:[[5],L.y],
  there:[[5],[2,3,4,6]],character:[[5],[1,6]],through:[[5],[1,4,5,6]],where:[[5],[1,5,6]],ought:[[5],[1,2,5,6]],
  upon:[[4,5],L.u],word:[[4,5],L.w],these:[[4,5],[2,3,4,6]],those:[[4,5],[1,4,5,6]],whose:[[4,5],[1,5,6]],
  cannot:[[4,5,6],L.c],had:[[4,5,6],L.h],many:[[4,5,6],L.m],spirit:[[4,5,6],L.s],world:[[4,5,6],L.w],their:[[4,5,6],[2,3,4,6]]};
// 축어 (부록 1 핵심): 단어 -> 축약 글자열(내부 약자 재적용)
var EN_SHORT={about:'ab',above:'abv',according:'ac',across:'acr',after:'af',afternoon:'afn',afterward:'afw',
  again:'ag',against:'agst',almost:'alm',already:'alr',also:'al',although:'alth',altogether:'alt',always:'alw',
  because:'bec',before:'bef',behind:'beh',below:'bel',beneath:'ben',beside:'bes',between:'bet',beyond:'bey',
  blind:'bl',braille:'brl',children:'chn',conceive:'concv',could:'cd',deceive:'dcv',declare:'dcl',either:'ei',
  first:'fst',friend:'fr',good:'gd',great:'grt',herself:'herf',him:'hm',himself:'hmf',immediate:'imm',
  its:'xs',itself:'xf',letter:'lr',little:'ll',much:'mch',must:'mst',myself:'myf',necessary:'nec',neither:'nei',
  oneself:'onef',ourselves:'ourvs',paid:'pd',perceive:'percv',perhaps:'perh',quick:'qk',receive:'rcv',
  rejoice:'rjc',said:'sd',should:'shd',such:'sch',themselves:'themvs',thyself:'thyf',today:'td',
  together:'tgr',tomorrow:'tm',tonight:'tn',would:'wd',your:'yr',yourself:'yrf',yourselves:'yrvs'};
// 어미 묶음 약자 (10.8)
var EN_FINAL=[['ound',[[4,6],L.d]],['ance',[[4,6],L.e]],['sion',[[4,6],L.n]],['less',[[4,6],L.s]],['ount',[[4,6],L.t]],
  ['ence',[[5,6],L.e]],['ong',[[5,6],L.g]],['ful',[[5,6],L.l]],['tion',[[5,6],L.n]],['ness',[[5,6],L.s]],['ment',[[5,6],L.t]],['ity',[[5,6],L.y]]];
// 묶음 약자 (10.4/10.6): [패턴, 점형, 위치규칙] 규칙: any|mid|notstart
var EN_SEQ=[['and',[[1,2,3,4,6]],'any'],['for',[[1,2,3,4,5,6]],'any'],['the',[[2,3,4,6]],'any'],
  ['with',[[2,3,4,5,6]],'any'],['of',[[1,2,3,5,6]],'any'],
  ['ing',[[3,4,6]],'notstart'],['ch',[[1,6]],'any'],['gh',[[1,2,6]],'any'],['sh',[[1,4,6]],'any'],
  ['th',[[1,4,5,6]],'any'],['wh',[[1,5,6]],'any'],['ed',[[1,2,4,6]],'any'],['er',[[1,2,4,5,6]],'any'],
  ['ou',[[1,2,5,6]],'any'],['ow',[[2,4,6]],'any'],['ar',[[3,4,5]],'any'],['st',[[3,4]],'any'],
  ['ea',[[2]],'mid'],['bb',[[2,3]],'mid'],['cc',[[2,5]],'mid'],['ff',[[2,3,5]],'mid'],['gg',[[2,3,5,6]],'mid'],
  ['en',[[2,6]],'any'],['in',[[3,5]],'any']];
var EN_START=[['be',[[2,3]]],['con',[[2,5]]],['dis',[[2,5,6]]]];   // 어두 음절 근사 적용
var VOWELS={a:1,e:1,i:1,o:1,u:1};

// 단어 일부로도 쓸 수 있는 약자(어두 약자 등, 긴 것 우선)
var EN_PREFIX=['character','question','cannot','through','mother','spirit','father','world',
  'their','these','those','whose','under','where','there','right','young','ought','know','lord',
  'name','part','some','time','work','here','ever','word','upon','many','had','day','one'];
function encodeEnWord(word){          // word: 소문자, g2
  var out=[],i;
  if(EN_WORD[word]){return EN_WORD[word].slice();}
  if(EN_SHORT[word]){return encodeEnSeq(EN_SHORT[word],false);}
  var pre=[],rest=word,midStart=false;
  for(i=0;i<EN_PREFIX.length;i++){    // 어두 약자를 단어 접두로 (working = work+ing)
    var pk=EN_PREFIX[i];
    if(word.length>pk.length&&word.slice(0,pk.length)===pk){
      pre=EN_WORD[pk].slice();rest=word.slice(pk.length);midStart=true;break;
    }
  }
  var tail=[];
  for(i=0;i<EN_FINAL.length;i++){     // 어미 묶음: 앞에 글자가 있을 때만
    var f=EN_FINAL[i];
    if(rest.length>f[0].length&&rest.slice(-f[0].length)===f[0]){
      tail=f[1].slice();rest=rest.slice(0,-f[0].length);break;
    }
  }
  var head=[];
  if(!midStart){
    for(i=0;i<EN_START.length;i++){   // be/con/dis: 뒤가 자음이고 충분히 길 때만(음절 근사)
      var st=EN_START[i],p=st[0];
      if(rest.length>=p.length+2&&rest.slice(0,p.length)===p&&!VOWELS[rest[p.length]]){
        head=st[1].slice();rest=rest.slice(p.length);midStart=true;break;
      }
    }
  }
  return pre.concat(head).concat(encodeEnSeq(rest,midStart)).concat(tail);
}
function encodeEnSeq(str,midStart){   // 묶음 약자 greedy
  var out=[],i=0,n=str.length;
  while(i<n){
    var hit=null;
    for(var k=0;k<EN_SEQ.length;k++){
      var q=EN_SEQ[k],p=q[0];
      if(str.substr(i,p.length)!==p)continue;
      var atStart=(i===0&&!midStart);
      if(q[2]==='mid'&&(atStart||i+p.length>=n))continue;
      if(q[2]==='notstart'&&atStart)continue;
      hit=q;break;
    }
    if(hit){for(var c=0;c<hit[1].length;c++)out.push(hit[1][c]);i+=hit[0].length;}
    else{var cell=L[str[i]];if(cell)out.push(cell);i++;}
  }
  return out;
}

/* ── 통합 변환기: 문자열 -> 6점 셀 시퀀스 ── */
function brailleCells(str){
  var out=[],numMode=false,sl=String(str),n=sl.length,k=0;
  var grade=(window.SD&&SD.cfg.grade)||'g2';
  function prevHangul(idx){return idx>0&&isHangul(sl.charCodeAt(idx-1));}
  while(k<n){
    var ch=sl[k],code=ch.charCodeAt(0);
    if(isHangul(code)){
      numMode=false;
      // 약어 (제18항): 앞이 한글이 아닐 때만
      if(grade!=='g1'&&!prevHangul(k)){
        var hit=null;
        for(var a=0;a<KR_ABBR.length;a++){
          var w=KR_ABBR[a][0];
          if(sl.substr(k,w.length)===w){hit=KR_ABBR[a];break;}
        }
        if(hit){for(var c2=0;c2<hit[1].length;c2++)out.push(hit[1][c2]);k+=hit[0].length;continue;}
      }
      if(grade==='g1'){
        var c0=code-0xAC00,seq0=KCHO[(c0/588)|0].concat(KJUNG[((c0%588)/28)|0]).concat(KJONG[c0%28]);
        for(var q0=0;q0<seq0.length;q0++)out.push(seq0[q0]);k++;continue;
      }
      var nextVowel=false;
      if(k+1<n&&isHangul(sl.charCodeAt(k+1))){
        var nc=sl.charCodeAt(k+1)-0xAC00;
        if(((nc/588)|0)===11)nextVowel=true;       // 다음 첫소리 ㅇ
      }
      var cells=encodeKrSyllable(code,nextVowel);
      for(var c3=0;c3<cells.length;c3++)out.push(cells[c3]);
      k++;continue;
    }
    if(/[A-Za-z]/.test(ch)){
      numMode=false;
      var j=k;while(j<n&&/[A-Za-z]/.test(sl[j]))j++;
      var word=sl.slice(k,j);
      var caps=word.length>1&&word===word.toUpperCase()&&/[A-Z]/.test(word);
      if(caps)out.push([6]),out.push([6]);
      else if(/[A-Z]/.test(word[0]))out.push([6]);
      var lower=word.toLowerCase();
      var enc=(grade==='g1')?encodeEnSeqG1(lower):encodeEnWord(lower);
      for(var c4=0;c4<enc.length;c4++)out.push(enc[c4]);
      k=j;continue;
    }
    if(DIGITMAP[ch]){
      if(!numMode){out.push(NUMSIGN);numMode=true;}
      out.push(BRAILLE[DIGITMAP[ch]]);k++;continue;
    }
    numMode=false;
    out.push(BRAILLE[ch]||[]);k++;
  }
  return out;
}
function encodeEnSeqG1(str){var out=[];for(var i=0;i<str.length;i++){var c=L[str[i]];if(c)out.push(c);}return out;}
/* 문자열 -> 20셀 점자 바이트 배열 (한글/영문/숫자, dot1..8=bit0..7) */
function seqToTextCells(seq){
  var cells=[];
  for(var i=0;i<seq.length&&cells.length<20;i++)cells.push(dotsToByte(seq[i]));
  while(cells.length<20)cells.push(0);
  return cells;
}
function strToTextCells(str){return seqToTextCells(brailleCells(str));}


function setGrade(g){window.SD.cfg.grade=(g==="g1"?"g1":"g2");}
function toUnicodeBraille(s){var c=brailleCells(String(s)),o="";for(var i=0;i<c.length;i++)o+=String.fromCharCode(0x2800+dotsToByte(c[i]));return o;}
function unicodeToDots(ub){var out=[];for(var i=0;i<ub.length;i++){var v=ub.charCodeAt(i)-0x2800;if(v<0||v>255)continue;var d=[];for(var b=0;b<8;b++)if(v&(1<<b))d.push(b+1);out.push(d);}return out;}
if(typeof module!=="undefined")module.exports={brailleCells:brailleCells,dotsToByte:dotsToByte,seqToTextCells:seqToTextCells,strToTextCells:strToTextCells,setGrade:setGrade,toUnicodeBraille:toUnicodeBraille,unicodeToDots:unicodeToDots,KCHO:KCHO,KJUNG:KJUNG,KJONG:KJONG};
;return module.exports;})();
