// MKWT Service Worker (Safari-safe)
// Goal: cache static assets for speed/offline Guest, but NEVER serve redirected responses.
// Also: avoid precaching HTML during install to prevent Safari "redirected response" crash.
const CACHE = "mkwt-v573"; // bump to force refresh

const STATIC_ASSETS = [
  "/mkwt_theme_v3.css",
  "/mkwt_bootstrap.js",
  "/mkwt_core.js",
  "/mkwt_page_helpers.js",
  "/mkwt_public.js",
  "/mkwt_report.js",
  "/mkwt_mode_compare.js",
  "/tracker.css",
  "/tracker.js",
  "/tracker_suggestions.js",
  "/tracker_intermission.js",
  "/time-trial.css",
  "/time-trial.js?v=20260510",
  "/combo-builder.css",
  "/combo-builder.js",
  "/combo_builder_data.json",
  "/combo_icon_map.json",
  "/track_icon_map.json",
  "/item-distribution.css",
  "/item-distribution.js",
  "/item_distribution_data.json",
  "/stats.css",
  "/stats.js",
  "/stats_ui.js",
  "/sessions.css",
  "/sessions.js",
  "/lounge.css",
  "/lounge.js",
  "/clan-wars.css?v=20260514c",
  "/clan-wars.js?v=20260514d",
  "/clan-wars-stats.js",
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
  "/icons/mkwt-dendo-192.png",
  "/icons/mkwt-dendo-512.png",
  "/assets/picker-icons/characters/rocky-wrench.png",
  "/assets/picker-icons/characters/wiggler.png",
  "/assets/picker-icons/characters/king-boo.png",
  "/assets/picker-icons/characters/wario.png",
  "/assets/picker-icons/characters/lakitu.png",
];

const PWA_ICON_ASSETS = [
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/favicon.ico",
  "/og-card.png",
];

const PICKER_ICON_ASSETS = [
  "/assets/picker-icons/characters/baby-daisy.png",
  "/assets/picker-icons/characters/baby-luigi.png",
  "/assets/picker-icons/characters/baby-mario.png",
  "/assets/picker-icons/characters/baby-peach.png",
  "/assets/picker-icons/characters/baby-rosalina.png",
  "/assets/picker-icons/characters/birdo.png",
  "/assets/picker-icons/characters/bowser.png",
  "/assets/picker-icons/characters/bowser-jr.png",
  "/assets/picker-icons/characters/cataquack.png",
  "/assets/picker-icons/characters/chargin-chuck.png",
  "/assets/picker-icons/characters/cheep-cheep.png",
  "/assets/picker-icons/characters/coin-coffer.png",
  "/assets/picker-icons/characters/conkdor.png",
  "/assets/picker-icons/characters/cow.png",
  "/assets/picker-icons/characters/daisy.png",
  "/assets/picker-icons/characters/dolphin.png",
  "/assets/picker-icons/characters/donkey-kong.png",
  "/assets/picker-icons/characters/dry-bones.png",
  "/assets/picker-icons/characters/fish-bone.png",
  "/assets/picker-icons/characters/goomba.png",
  "/assets/picker-icons/characters/hammer-bro.png",
  "/assets/picker-icons/characters/king-boo.png",
  "/assets/picker-icons/characters/koopa-troopa.png",
  "/assets/picker-icons/characters/lakitu.png",
  "/assets/picker-icons/characters/luigi.png",
  "/assets/picker-icons/characters/mario.png",
  "/assets/picker-icons/characters/monty-mole.png",
  "/assets/picker-icons/characters/nabbit.png",
  "/assets/picker-icons/characters/para-biddybud.png",
  "/assets/picker-icons/characters/pauline.png",
  "/assets/picker-icons/characters/peach.png",
  "/assets/picker-icons/characters/peepa.png",
  "/assets/picker-icons/characters/penguin.png",
  "/assets/picker-icons/characters/pianta.png",
  "/assets/picker-icons/characters/piranha-plant.png",
  "/assets/picker-icons/characters/pokey.png",
  "/assets/picker-icons/characters/rocky-wrench.png",
  "/assets/picker-icons/characters/rosalina.png",
  "/assets/picker-icons/characters/shy-guy.png",
  "/assets/picker-icons/characters/sidestepper.png",
  "/assets/picker-icons/characters/snowman.png",
  "/assets/picker-icons/characters/spike.png",
  "/assets/picker-icons/characters/stingby.png",
  "/assets/picker-icons/characters/swoop.png",
  "/assets/picker-icons/characters/toad.png",
  "/assets/picker-icons/characters/toadette.png",
  "/assets/picker-icons/characters/waluigi.png",
  "/assets/picker-icons/characters/wario.png",
  "/assets/picker-icons/characters/wiggler.png",
  "/assets/picker-icons/characters/yoshi.png",
  "/assets/picker-icons/tracks/AF.png",
  "/assets/picker-icons/tracks/AH.png",
  "/assets/picker-icons/tracks/BC.png",
  "/assets/picker-icons/tracks/BCM.png",
  "/assets/picker-icons/tracks/CC.png",
  "/assets/picker-icons/tracks/CCF.png",
  "/assets/picker-icons/tracks/CM.png",
  "/assets/picker-icons/tracks/DBB.png",
  "/assets/picker-icons/tracks/DD.png",
  "/assets/picker-icons/tracks/DDJ.png",
  "/assets/picker-icons/tracks/DH.png",
  "/assets/picker-icons/tracks/DKP.png",
  "/assets/picker-icons/tracks/DKS.png",
  "/assets/picker-icons/tracks/FO.png",
  "/assets/picker-icons/tracks/GBR.png",
  "/assets/picker-icons/tracks/KTB.png",
  "/assets/picker-icons/tracks/MBC.png",
  "/assets/picker-icons/tracks/MC.png",
  "/assets/picker-icons/tracks/MMM.png",
  "/assets/picker-icons/tracks/PB.png",
  "/assets/picker-icons/tracks/PS.png",
  "/assets/picker-icons/tracks/RR.png",
  "/assets/picker-icons/tracks/SGB.png",
  "/assets/picker-icons/tracks/SHS.png",
  "/assets/picker-icons/tracks/SSS.png",
  "/assets/picker-icons/tracks/SVP.png",
  "/assets/picker-icons/tracks/TF.png",
  "/assets/picker-icons/tracks/WS.png",
  "/assets/picker-icons/tracks/WSS.png",
  "/assets/picker-icons/tracks/WSY.png",
  "/assets/picker-icons/vehicles/baby-blooper.png",
  "/assets/picker-icons/vehicles/b-dasher.png",
  "/assets/picker-icons/vehicles/biddybuggy.png",
  "/assets/picker-icons/vehicles/big-horn.png",
  "/assets/picker-icons/vehicles/billdozer.png",
  "/assets/picker-icons/vehicles/blastronaut-iii.png",
  "/assets/picker-icons/vehicles/bowser-bruiser.png",
  "/assets/picker-icons/vehicles/bumble-v.png",
  "/assets/picker-icons/vehicles/carpet-flyer.png",
  "/assets/picker-icons/vehicles/chargin-truck.png",
  "/assets/picker-icons/vehicles/cloud-9.png",
  "/assets/picker-icons/vehicles/cute-scoot.png",
  "/assets/picker-icons/vehicles/dolphin-dasher.png",
  "/assets/picker-icons/vehicles/dread-sled.png",
  "/assets/picker-icons/vehicles/fin-twin.png",
  "/assets/picker-icons/vehicles/funky-dorrie.png",
  "/assets/picker-icons/vehicles/hot-rod.png",
  "/assets/picker-icons/vehicles/hyper-pipe.png",
  "/assets/picker-icons/vehicles/junkyard-hog.png",
  "/assets/picker-icons/vehicles/li-l-dumpy.png",
  "/assets/picker-icons/vehicles/lobster-roller.png",
  "/assets/picker-icons/vehicles/loco-moto.png",
  "/assets/picker-icons/vehicles/mach-rocket.png",
  "/assets/picker-icons/vehicles/mecha-trike.png",
  "/assets/picker-icons/vehicles/pipe-frame.png",
  "/assets/picker-icons/vehicles/plushbuggy.png",
  "/assets/picker-icons/vehicles/rally-bike.png",
  "/assets/picker-icons/vehicles/rallygator.png",
  "/assets/picker-icons/vehicles/rally-kart.png",
  "/assets/picker-icons/vehicles/reel-racer.png",
  "/assets/picker-icons/vehicles/ribbit-revster.png",
  "/assets/picker-icons/vehicles/roadster-royale.png",
  "/assets/picker-icons/vehicles/r-o-b-h-o-g.png",
  "/assets/picker-icons/vehicles/standard-bike.png",
  "/assets/picker-icons/vehicles/standard-kart.png",
  "/assets/picker-icons/vehicles/stellar-sled.png",
  "/assets/picker-icons/vehicles/tiny-titan.png",
  "/assets/picker-icons/vehicles/tune-thumper.png",
  "/assets/picker-icons/vehicles/w-twin-chopper.png",
  "/assets/picker-icons/vehicles/zoom-buggy.png",
];

const PRECACHE_ASSETS = Array.from(new Set([
  ...STATIC_ASSETS,
  ...PWA_ICON_ASSETS,
  ...PICKER_ICON_ASSETS,
]));

const APP_SHELL_PAGES = [
  "/index.html",
  "/about.html",
  "/login.html",
  "/reset.html",
  "/tracker.html",
  "/time-trial.html",
  "/combo-builder.html",
  "/item-distribution.html",
  "/stats.html",
  "/sessions.html",
  "/settings.html",
  "/lounge.html",
  "/lounge-24.html",
  "/lounge-stats.html",
  "/clan-wars.html",
  "/clan-wars-stats.html",
  "/mkcentral.html",
];

const normalizeNavPath = (pathname) => {
  let p = pathname || "/";
  // strip trailing slash (except root)
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "/" || p === "") return "/index.html";
  if (p.endsWith(".html")) return p;
  // pretty routes
  if (p === "/tracker") return "/tracker.html";
  if (p === "/lounge") return "/lounge.html";
  if (p === "/time-trial") return "/time-trial.html";
  if (p === "/combo-builder") return "/combo-builder.html";
  if (p === "/item-distribution") return "/item-distribution.html";
  if (p === "/stats") return "/stats.html";
  if (p === "/sessions") return "/sessions.html";
  if (p === "/lounge-24") return "/lounge-24.html";
  if (p === "/clan-wars") return "/clan-wars.html";
  if (p === "/clan-wars-stats") return "/clan-wars-stats.html";
  if (p === "/mkcentral") return "/mkcentral.html";
  if (p === "/lounge-stats") return "/lounge-stats.html";
  if (p === "/settings") return "/settings.html";
  if (p === "/about") return "/about.html";
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
  try {
    await cache.put(key, res.clone());
  } catch (_) {}
}

self.addEventListener("install", (e) => {
  // Precache static app shell assets and direct .html pages only.
  // We avoid pretty-route URLs so Safari never sees redirected install responses.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const path of [...PRECACHE_ASSETS, ...APP_SHELL_PAGES]) {
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
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
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

      try {
        const preload = await e.preloadResponse;
        if (preload && preload.ok && !preload.redirected && preload.type === "basic") {
          await cachePutIfSafe(cache, path, preload);
          return preload;
        }
        const res = await safeFetchNoRedirect(normalizedUrl);
        await cachePutIfSafe(cache, path, res);
        return res;
      } catch (err) {
        // Offline fallback: serve the normalized page first, then fall back to core entry pages.
        const fallback =
          await cache.match(path) ||
          await cache.match("/login.html") ||
          await cache.match("/index.html") ||
          await cache.match("/tracker.html");
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

