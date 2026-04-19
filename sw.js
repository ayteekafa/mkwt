// MKWT Service Worker (Safari-safe)
// Goal: cache static assets for speed/offline Guest, but NEVER serve redirected responses.
// Also: avoid precaching HTML during install to prevent Safari "redirected response" crash.
const CACHE = "mkwt-v246"; // bump to force refresh

const STATIC_ASSETS = [
  "/mkwt_theme_v3.css",
  "/mkwt_bootstrap.js",
  "/mkwt_core.js",
  "/mkwt_page_helpers.js",
  "/mkwt_public.js",
  "/tracker.css",
  "/tracker.js",
  "/tracker_suggestions.js",
  "/tracker_intermission.js",
  "/stats.css",
  "/stats.js",
  "/stats_ui.js",
  "/sessions.css",
  "/sessions.js",
  "/lounge.css",
  "/lounge.js",
  "/mkcentral.css",
  "/mkcentral.js",
  "/settings.css",
  "/settings.js",
  "/login.css",
  "/login.js",
  "/reset.css",
  "/reset.js",
  "/about.css",
  "/index.css",
  "/index.js",
  "/strats.json",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const normalizeNavPath = (pathname) => {
  let p = pathname || "/";
  // strip trailing slash (except root)
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "/" || p === "") return "/index.html";
  if (p.endsWith(".html")) return p;
  // pretty routes
  if (p === "/tracker") return "/tracker.html";
  if (p === "/stats") return "/stats.html";
  if (p === "/sessions") return "/sessions.html";
  if (p === "/lounge-24") return "/lounge-24.html";
  if (p === "/mkcentral") return "/mkcentral.html";
  if (p === "/lounge-stats") return "/lounge-stats.html";
  if (p === "/settings") return "/settings.html";
  if (p === "/login") return "/login.html";
  if (p === "/reset") return "/reset.html";
  return p;
};

async function safeFetchNoRedirect(input) {
  // Always bypass HTTP cache; we manage our own.
  let res = await fetch(input, { cache: "no-store" });
  // If server redirected, fetch the final URL directly and return that response.
  if (res && res.redirected && res.url) {
    res = await fetch(res.url, { cache: "no-store" });
  }
  return res;
}

async function cachePutIfSafe(cache, key, res) {
  if (!res) return;
  // Only cache successful, same-origin, non-redirected basic responses.
  if (!res.ok) return;
  if (res.redirected) return;
  if (res.type !== "basic") return;
  await cache.put(key, res.clone());
}

self.addEventListener("install", (e) => {
  // Do NOT precache navigations here (Safari can cache redirect responses during install).
  // We only precache static assets with safe fetches, and even that is optional.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const path of STATIC_ASSETS) {
      try {
        const url = new URL(path, self.location.origin).toString();
        const res = await safeFetchNoRedirect(url);
        await cachePutIfSafe(cache, path, res);
      } catch (_) {}
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Remove old caches, but keep the current one populated during install.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await caches.open(CACHE);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never interfere with Supabase (Account must stay fully network-live).
  if (url.hostname.endsWith("supabase.co")) return;

  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isNavigate = req.mode === "navigate";

  // Navigations: try cache of normalized .html, else network, then cache safe copy.
  if (isNavigate) {
    const path = normalizeNavPath(url.pathname);
    const normalizedUrl = new URL(path, self.location.origin).toString();

    e.respondWith((async () => {
      const cache = await caches.open(CACHE);

      const cached = await cache.match(path);
      if (cached) return cached;

      try {
        const res = await safeFetchNoRedirect(normalizedUrl);
        await cachePutIfSafe(cache, path, res);
        return res;
      } catch (err) {
        // Offline fallback: if we have index/tracker cached, prefer that.
        const fallback = await cache.match("/index.html") || await cache.match("/tracker.html");
        if (fallback) return fallback;
        throw err;
      }
    })());
    return;
  }

  // Static GETs: cache-first, then network, cache if safe.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;

    const res = await safeFetchNoRedirect(req);
    // Cache by request URL pathname for same-origin.
    await cachePutIfSafe(cache, req, res);
    return res;
  })());
});
