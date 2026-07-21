/* Dote 서비스 워커 — 오프라인 우선 (PRD §7: 점역·편집은 네트워크 없이 동작) */
const C = "dote-v33";
const CORE = ["./", "index.html", "braille.js", "ebraille.js", "dotpad.js", "templates.js", "superdot-tts.js", "auth.js", "DotPadSDK-3.0.0.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable.png", "apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Background Sync: 오프라인 편집 후 백그라운드에서 연결 복귀 시 클라이언트를 깨워 동기화 */
self.addEventListener("sync", e => {
  if (e.tag === "dote-sync") e.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: "dote-sync" })))
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = e.request.url;
  if (u.includes("supabase.co")) return;              /* API 요청은 캐시 우회 */
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok && (u.startsWith(self.location.origin) || u.includes("fonts.googleapis") || u.includes("fonts.gstatic") || u.includes("cdn.jsdelivr.net"))) {
        caches.open(C).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
