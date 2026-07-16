/* Dote 스모크 테스트 — 로드 체크포인트 + 점자 검증 벡터.
   실행: npm test  (jsdom 필요, package.json devDependency)
   실패 시 exit 1. index.html을 file://로 로드하고 전역 스코프를 검사한다. */
"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const errs = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
  url: "file://" + ROOT + "/index.html",
});
dom.window.addEventListener("error", e => errs.push(e.error && e.error.stack || e.message));

const fails = [];
function check(name, cond, got) {
  if (cond) { console.log("  ok  " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (got !== undefined ? "  got: " + got : "")); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

setTimeout(() => {
  const w = dom.window, d = w.document;

  // ── 로드 체크포인트 ──
  check("DOTE_VERSION 존재", typeof w.DOTE_VERSION === "string" && w.DOTE_VERSION.length > 0, w.DOTE_VERSION);
  check("블록 렌더 >=10", d.querySelectorAll("#blocks .block").length >= 10, d.querySelectorAll("#blocks .block").length);
  check("템플릿 8종", (w.PAGE_TEMPLATES || []).length === 8, (w.PAGE_TEMPLATES || []).length);
  check("SDTTS 로드", !!w.SDTTS);
  check("Auth 로드", !!w.Auth);
  check("KB(한국점자) 로드", !!w.KB);
  check("EB(eBraille) 로드", !!w.EB);
  check("JS 에러 0", errs.length === 0, errs.length + (errs[0] ? " / " + errs[0] : ""));

  // ── 점자 검증 벡터 (기본 grade=g2, 깨지면 안 됨) ──
  const KB = w.KB;
  if (KB) {
    KB.setGrade("g2");
    const V = {
      "팔다": [[1,4,5],[2],[2,4]],
      "것이다": [[4,5,6],[2,3,4],[1,3,5],[2,4]],
      "working": [[5],[2,4,5,6],[3,4,6]],
      "그리고": [[1],[1,3,6]],
    };
    for (const [word, want] of Object.entries(V)) {
      const got = KB.brailleCells(word);
      check("점자 " + word, eq(got, want), JSON.stringify(got) + " want " + JSON.stringify(want));
    }
  }

  console.log(fails.length ? "\nFAIL: " + fails.length + "개 실패" : "\nPASS: 전체 통과");
  process.exit(fails.length ? 1 : 0);
}, 3000);

setTimeout(() => { console.log("\nFAIL: 타임아웃(스크립트 로드 안 됨)"); process.exit(1); }, 10000).unref();
