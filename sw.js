// MKWT Service Worker (Safari-safe)
// Keep cache behavior simple: generated app shell precache, fresh navigations in
// the background, and no caching for account/API/CDN traffic.
const CACHE = "mkwt-v576";
const CACHE_PREFIX = "mkwt-";

try {
  importScripts("/precache-manifest.js");
} catch (_) {}

const FALLBACK_PRECACHE = [
  "/",
  "/index.html",
  "/tracker.html",
  "/mkwt_bootstrap.js",
  "/mkwt_public.js",
  "/mkwt_theme_v3.css",
  "/manifest.webmanifest",
];

const PRECACHE = Array.isArray(self.__MKWTPRECACHE__) && self.__MKWTPRECACHE__.length
  ? self.__MKWTPRECACHE__
  : FALLBACK_PRECACHE;

const ROUTE_MAP = new Map([
  ["/", "/index.html"],
  ["", "/index.html"],
  ["/tracker", "/tracker.html"],
  ["/lounge", "/lounge.html"],
  ["/time-trial", "/time-trial.html"],
  ["/combo-builder", "/combo-builder.html"],
  ["/item-distribution", "/item-distribution.html"],
  ["/stats", "/stats.html"],
  ["/sessions", "/sessions.html"],
  ["/lounge-24", "/lounge-24.html"],
  ["/clan-wars", "/clan-wars.html"],
  ["/clan-wars-stats", "/clan-wars-stats.html"],
  ["/mkcentral", "/mkcentral.html"],
  ["/lounge-stats", "/lounge-stats.html"],
  ["/settings", "/settings.html"],
  ["/about", "/about.html"],
  ["/login", "/login.html"],
  ["/reset", "/reset.html"],
]);

function normalizeNavPath(pathname){
  let path = pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (ROUTE_MAP.has(path)) return ROUTE_MAP.get(path);
  if (path.endsWith(".html")) return path;
  return path;
}

function isSafeResponse(response){
  return !!response
    && response.ok
    && !response.redirected
    && (response.type === "basic" || response.type === "default");
}

async function cachePutIfSafe(cache, key, response){
  if (!isSafeResponse(response)) return;
  try {
    await cache.put(key, response.clone());
  } catch (_) {}
}

function sameOriginRequest(path){
  return new Request(new URL(path, self.location.origin).toString(), { credentials: "same-origin" });
}

async function fetchAndCache(cache, request, key){
  const response = await fetch(request);
  await cachePutIfSafe(cache, key, response);
  return response;
}

async function precacheAppShell(){
  const cache = await caches.open(CACHE);
  for (const entry of PRECACHE) {
    try {
      const request = sameOriginRequest(entry);
      const response = await fetch(request, { cache: "reload" });
      await cachePutIfSafe(cache, entry, response);
    } catch (_) {}
  }
}

async function handleNavigation(event){
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return fetch(request);

  const cache = await caches.open(CACHE);
  const path = normalizeNavPath(url.pathname);
  const cached = await cache.match(path);

  const updatePromise = (async () => {
    const preload = await event.preloadResponse;
    const fresh = isSafeResponse(preload)
      ? preload
      : await fetch(sameOriginRequest(path), { cache: "reload" });
    await cachePutIfSafe(cache, path, fresh);
    return fresh;
  })();

  if (cached) {
    event.waitUntil(updatePromise.catch(() => {}));
    return cached;
  }

  try {
    return await updatePromise;
  } catch (_) {
    return await cache.match("/index.html") || Response.error();
  }
}

async function cacheFirst(request, key){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key);
  if (cached) return cached;
  return fetchAndCache(cache, request, key);
}

async function staleWhileRevalidate(event, request, key){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key);
  const updatePromise = fetchAndCache(cache, request, key);
  if (cached) {
    event.waitUntil(updatePromise.catch(() => {}));
    return cached;
  }
  return updatePromise;
}

async function networkWithCacheFallback(request, key){
  const cache = await caches.open(CACHE);
  try {
    return await fetchAndCache(cache, request, key);
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

function isRootScriptOrStyle(pathname){
  return /^\/[^/]+\.(?:js|css)$/i.test(pathname);
}

function isJsonLike(pathname){
  return /\.(?:json|webmanifest)$/i.test(pathname);
}

function isDynamicRequest(url){
  return url.hostname.endsWith("supabase.co")
    || url.pathname.startsWith("/api/");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precacheAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (isDynamicRequest(url)) return;

  const key = `${url.pathname}${url.search || ""}`;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, key));
    return;
  }

  if (isRootScriptOrStyle(url.pathname) || isJsonLike(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request, key));
    return;
  }

  event.respondWith(networkWithCacheFallback(request, key));
});
