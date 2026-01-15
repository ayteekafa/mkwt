const CACHE = "mkwt-v1";
const ASSETS = [
  "/",
  "/tracker.html",
  "/index.html",
  "/login.html",
  "/settings.html",
  "/stats.html",
  "/mkwt_nav_snippet.html",
  "/mkwt_shared.css",
  "/mkwt_theme_v3.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.hostname.endsWith("supabase.co")) return;
  if (e.request.method !== "GET") return;

  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        });
      })
    );
  }
});