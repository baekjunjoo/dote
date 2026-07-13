/* superdot-tts.js — Super Dot 검증 TTS 엔진 (독립 드롭인 모듈, 의존성 0)
 *
 * 기능:
 *  1) 문장 언어 자동 감지(한/영/일) → 언어별 최적 음성 자동 선택
 *  2) 음성 품질 자동 선별: Neural/Natural > Google > premium/enhanced (같은 언어 내 도중 교체 방지 캠시)
 *  3) 마이크 사용 중 음량 자동 감쇠 (OS가 통화 모드로 전환해 갑자기 커지는 문제 보정)
 *  4) 에코 가드: 방금 말한 TTS가 마이크로 재입력돼 인식 결과에 섞이는 것 차단
 *
 * 사용:
 *   SDTTS.configure({ uiLang:'ko', vol:100, volMic:50, rate:105, voice:'', mute:false });
 *   SDTTS.speak('안녕하세요');                       // 언어 감지 → 한국어 음성
 *   SDTTS.speak('Hello there');                     // → 영어 음성
 *   SDTTS.setMicActive(true);                       // 마이크 열 때 (이후 speak는 volMic 적용)
 *   if (SDTTS.isEcho(asrText)) return;              // ASR 최종 결과 필터에 삽입
 *   SDTTS.voices('ko');                             // 언어별 사용 가능 음성 목록(선택 UI용)
 *
 * 출처: baekjunjoo/superdot index.html — 실사용 검증 로직 그대로, I/O(설정·로그)만 모듈화.
 * 알려진 한계: 일부 OS 음성은 utterance.volume을 무시함(다른 음성 선택으로 회피),
 *             블루투스는 마이크 열림 시 통화 프로파일(HFP) 전환으로 소리 자체가 달라짐(기기 특성).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SDTTS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var cfg = { uiLang: 'ko', vol: 100, volMic: 50, rate: 105, voice: '', mute: false };
  var micActive = false;
  var byLang = {};                 // 언어별 선택 음성 캠시 (같은 언어 내 도중 교체 방지)
  var RECENT = [];                 // 에코 가드용 최근 발화
  var onLog = null;                // 선택: function(text) — 발화 로그 콜백(자막/aria-live 연동)

  /* ── 문장 언어 자동 감지 (한글/가나/라틴 → 없으면 UI 언어) ── */
  function detectTextLang(text) {
    var s = String(text || '');
    if (/[가-ퟣᄀ-ᇿ㄰-㆏]/.test(s)) return 'ko';
    if (/[぀-ヿ]/.test(s)) return 'ja';
    if (/[A-Za-z]/.test(s)) return 'en';
    return cfg.uiLang === 'en' ? 'en' : 'ko';
  }

  /* ── 음성 품질 점수 (Edge Natural/Neural 최상 > Google > premium 계열) ── */
  function ttsScore(v) {
    var n = (v.name || '').toLowerCase(), s = 0;
    if (/natural|neural/.test(n)) s += 80;
    if (/google/.test(n)) s += 60;
    if (/premium|enhanced|siri|yuna|sora|suhyun/.test(n)) s += 50;
    if (/online/.test(n)) s += 5;
    if (v.default) s += 1;
    return s;
  }

  function voicesForLang(code) {
    var all = [];
    try { all = speechSynthesis.getVoices() || []; } catch (e) {}
    return all.filter(function (v) {
      var l = (v.lang || '').toLowerCase(), n = (v.name || '').toLowerCase();
      if (code === 'en') return /^en/.test(l) || /english/.test(n);
      if (code === 'ja') return /^ja/.test(l) || /japanese|日本/.test(n);
      return /^ko/.test(l) || /korean|한국/.test(n);
    });
  }

  function pickVoiceFor(code) {
    var list = voicesForLang(code);
    if (cfg.voice) {                                   // 사용자가 고른 음성은 해당 언어에 한해 우선
      for (var i = 0; i < list.length; i++) if (list[i].name === cfg.voice) return (byLang[code] = list[i]);
    }
    var cached = byLang[code];                         // 같은 언어 내 도중 교체 방지
    if (cached) for (var j = 0; j < list.length; j++) if (list[j].name === cached.name) return cached;
    var best = null;
    for (var k = 0; k < list.length; k++) if (!best || ttsScore(list[k]) > ttsScore(best)) best = list[k];
    byLang[code] = best;
    return best;                                       // 없으면 null → 브라우저 기본 음성
  }

  /* ── 마이크 사용 중 음량 감쇠 ── */
  function ttsVol() {
    var base = (cfg.vol != null ? cfg.vol : 100) / 100;
    var mic = (cfg.volMic != null ? cfg.volMic : 50) / 100;
    return micActive ? Math.min(base, mic) : base;
  }

  /* ── 에코 가드: 최근 10초 발화와 유사한 인식 결과 차단 (포함 관계 또는 2-gram 70%↑) ── */
  function normEcho(s) { return String(s).toLowerCase().replace(/[\s.,!?…'"“”‘’~\-()]+/g, ''); }
  function isEcho(txt) {
    if (cfg.mute) return false;                        // 음소거면 에코 자체가 없음
    var n = normEcho(txt);
    if (n.length < 4) return false;
    var now = Date.now();
    for (var i = RECENT.length - 1; i >= 0; i--) {
      var r = RECENT[i];
      if (now - r.ts > 10000) break;
      var m = r.n;
      if (!m) continue;
      if (m.indexOf(n) >= 0 || n.indexOf(m) >= 0) return true;
      var hit = 0, tot = 0;
      for (var k = 0; k + 1 < n.length; k++) { tot++; if (m.indexOf(n.substr(k, 2)) >= 0) hit++; }
      if (tot >= 4 && hit / tot > 0.7) return true;
    }
    return false;
  }

  /* ── 발화 ── */
  function speak(text) {
    text = String(text == null ? '' : text);
    if (onLog) try { onLog(text); } catch (e) {}
    if (cfg.mute) return;
    RECENT.push({ n: normEcho(text), ts: Date.now() });
    if (RECENT.length > 8) RECENT.shift();
    try {
      speechSynthesis.cancel();                        // 최신 발화 우선(스크린리더 관례)
      var u = new SpeechSynthesisUtterance(text);
      var code = detectTextLang(text);
      u.lang = code === 'en' ? 'en-US' : (code === 'ja' ? 'ja-JP' : 'ko-KR');
      u.rate = (cfg.rate != null ? cfg.rate : 105) / 100;
      u.pitch = 1;
      u.volume = ttsVol();
      var v = pickVoiceFor(code);
      if (v) u.voice = v;
      speechSynthesis.speak(u);
      return u;
    } catch (e) {}
  }

  /* 음성 목록은 비동기 로드 — voiceschanged에서 캠시 무효화 */
  try { speechSynthesis.addEventListener('voiceschanged', function () { byLang = {}; }); } catch (e) {}

  return {
    speak: speak,
    isEcho: isEcho,
    detectTextLang: detectTextLang,
    setMicActive: function (on) { micActive = !!on; },
    configure: function (patch) { for (var k in patch) cfg[k] = patch[k]; byLang = {}; },
    getConfig: function () { var o = {}; for (var k in cfg) o[k] = cfg[k]; return o; },
    voices: function (code) { return voicesForLang(code || (cfg.uiLang === 'en' ? 'en' : 'ko')); },
    onLog: function (fn) { onLog = fn; },
    stop: function () { try { speechSynthesis.cancel(); } catch (e) {} }
  };
});
