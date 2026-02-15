// NOTE (iOS Safari): never serve a cached Response that was produced by a redirect
// (Safari can error with: "Response served by service worker has redirections").
const CACHE = "mkwt-v113";
const ASSETS = [  "/tracker.html",
  "/index.html",
  "/login.html",
  "/reset.html",
  "/sessions.html",
  "/settings.html",
  "/stats.html",
  "/mkwt_nav_snippet.html",
  "/mkwt_shared.css",
  "/mkwt_theme_v3.css",
  "/strats.json",
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

  // Normalize "pretty" URLs to their real .html files to avoid redirects.
  // Safari iOS can error if a Service Worker serves a redirected response.
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigate = e.request.mode === "navigate" && isSameOrigin;

  const normalizeNavPath = (pathname) => {
    let p = pathname || "/";
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    if (p === "/" || p === "") return "/index.html";
    if (p.endsWith(".html")) return p;
    if (p === "/tracker") return "/tracker.html";
    if (p === "/stats") return "/stats.html";
    if (p === "/sessions") return "/sessions.html";
    if (p === "/settings") return "/settings.html";
    if (p === "/login") return "/login.html";
    if (p === "/reset") return "/reset.html";
    return p;
  };

  const safeFetchNoRedirect = async (reqOrUrl) => {
    let res = await fetch(reqOrUrl, { cache: "no-store" });
    if (res && res.redirected && res.url) {
      res = await fetch(res.url, { cache: "no-store" });
    }
    return res;
  };

  // Navigations: serve normalized .html to avoid redirects, cache-first for offline Guest.
  if (isNavigate) {
    const normalizedPath = normalizeNavPath(url.pathname);
    const normalizedUrl = new URL(normalizedPath, self.location.origin).toString();
    e.respondWith(
      caches.match(normalizedPath).then(async cached => {
        if (cached) return cached;
        const res = await safeFetchNoRedirect(normalizedUrl);
        if (res && res.ok && !res.redirected && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(normalizedPath, copy));
        }
        return res;
      })
    );
    return;
  }

  // Other same-origin GET requests: cache-first (static assets).
  if (isSameOrigin) {
    e.respondWith(
      caches.match(e.request).then(async cached => {
        if (cached) return cached;
        const res = await safeFetchNoRedirect(e.request);
        if (res && res.ok && !res.redirected && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    );
  }
});
