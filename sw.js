/* ExamZen service worker - cache static shell + question data.
   Paths are relative to the SW scope so it works under a GitHub
   Pages project subpath (e.g. /Ssc-mock-/). */
const CACHE = "examzen-v5";
const PRECACHE = [
  "index.html",
  "login.html",
  "pricing.html",
  "buy-premium.html",
  "saved.html",
  "apply-coupon.html",
  "partner-dashboard.html",
  "admin-vault.html",
  "about-us.html",
  "contact-us.html",
  "privacy-policy.html",
  "refund-policy.html",
  "terms-conditions.html",
  "exams/index.html",
  "exams/portal.html",
  "series/index.html",
  "series/portal.html",
  "test/index.html",
  "result/index.html",
  "live-test/index.html",
  "css/style.css",
  "css/test.css",
  "js/utils.js",
  "js/auth.js",
  "js/store.js",
  "js/firebase-config.js",
  "js/test-engine.js",
  "data/catalog.json",
  "data/series.json",
  "manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const isHTML = req.mode === "navigate" || req.destination === "document" ||
                 (req.headers.get("accept") || "").includes("text/html");

  // Network-first for HTML pages and data JSON so users always get fresh
  // content after a deploy; fall back to cache when offline.
  if (isHTML || req.url.includes("/data/")) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match("index.html")))
    );
  } else {
    // Cache-first for static assets (versioned by the cache name above).
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
