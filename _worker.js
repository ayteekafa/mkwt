const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const PRODUCTION_HOST = "mkwt.app";
const CANONICAL_REDIRECT_HOST = "www.mkwt.app";
const HSTS_VALUE = "max-age=31536000; includeSubDomains; preload";
const LEGACY_ASSET_PREFIXES = [
  ["/Track Icons MKW Transparent/", "/assets/track-icons/transparent/"],
  ["/Track Icons MKW/", "/assets/track-icons/boxed/"],
  ["/combo-icons/", "/assets/combo-icons/"],
];

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function shouldRedirectToCanonical(url) {
  return url.protocol === "https:" && url.hostname === CANONICAL_REDIRECT_HOST;
}

function redirectToCanonical(url) {
  const next = new URL(url.toString());
  next.hostname = PRODUCTION_HOST;
  return Response.redirect(next.toString(), 301);
}

function shouldAttachHsts(url) {
  return url.protocol === "https:" && (url.hostname === PRODUCTION_HOST || url.hostname === CANONICAL_REDIRECT_HOST);
}

function rewriteLegacyAssetUrl(url) {
  const decodedPath = decodeURIComponent(url.pathname || "");
  for (const [legacyPrefix, modernPrefix] of LEGACY_ASSET_PREFIXES) {
    if (decodedPath.startsWith(legacyPrefix)) {
      const next = new URL(url.toString());
      next.pathname = `${modernPrefix}${decodedPath.slice(legacyPrefix.length)}`;
      return next;
    }
  }
  return null;
}

function withSecurityHeaders(response, requestUrl) {
  if (!shouldAttachHsts(requestUrl)) return response;
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", HSTS_VALUE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSeasonName(season, label) {
  const cleaned = cleanText(label);
  if (cleaned) return cleaned;
  return season === "0" ? "Preseason" : `Season ${season}`;
}

async function fetchMkcentralHtml(target) {
  const res = await fetch(target, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "MKWT MKCentral sync (+https://mkwt.app)",
    },
    cf: { cacheTtl: 30, cacheEverything: false },
  });
  const html = await res.text();
  if (!res.ok) {
    const err = new Error(`MKCentral returned HTTP ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return html;
}

async function fetchMkwrsHtml(target) {
  const res = await fetch(target, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "MKWT Time Trial sync (+https://mkwt.app)",
    },
    cf: { cacheTtl: 30, cacheEverything: false },
  });
  const html = await res.text();
  if (!res.ok) {
    const err = new Error(`MKWorld WRs returned HTTP ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return html;
}

async function handleMkcentralOptions() {
  try {
    const indexHtml = await fetchMkcentralHtml("https://lounge.mkcentral.com/mkworld?season=2&p=12");
    const seasonMap = new Map();
    const seasonRe = /href="\/mkworld\?season=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = seasonRe.exec(indexHtml))) {
      const season = match[1];
      seasonMap.set(season, normalizeSeasonName(season, match[2]));
    }
    if (!seasonMap.size) {
      seasonMap.set("0", "Preseason");
      seasonMap.set("1", "Season 1");
      seasonMap.set("2", "Season 2");
    }

    const options = [];
    for (const [season, seasonName] of Array.from(seasonMap.entries()).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      let html = indexHtml;
      if (season !== "2") {
        html = await fetchMkcentralHtml(`https://lounge.mkcentral.com/mkworld?season=${season}`);
      }
      const pMatches = Array.from(html.matchAll(new RegExp(`href="/mkworld\\?season=${season}(?:&amp;|&)p=(12|24)"`, "gi")))
        .map((m) => m[1]);
      const counts = Array.from(new Set(pMatches)).sort((a, b) => Number(a) - Number(b));
      if (counts.length) {
        for (const playerCount of counts) {
          options.push({ season, seasonName, playerCount, split: true });
        }
      } else {
        options.push({ season, seasonName, playerCount: "12", split: false });
      }
    }

    return json(200, { ok: true, options });
  } catch (e) {
    return json(e?.status || 502, {
      ok: false,
      error: e?.message || "Could not fetch MKCentral seasons.",
    });
  }
}

async function handleMkcentralPlayer(request) {
  const url = new URL(request.url);
  const playerId = String(url.searchParams.get("playerId") || "").trim();
  const season = String(url.searchParams.get("season") || "2").trim();
  const p = String(url.searchParams.get("p") || "").trim();

  if (!/^\d{1,10}$/.test(playerId)) {
    return json(400, { ok: false, error: "Invalid MKCentral player ID." });
  }
  if (!/^\d{1,4}$/.test(season)) {
    return json(400, { ok: false, error: "Invalid MKCentral season." });
  }
  if (p && p !== "12" && p !== "24") {
    return json(400, { ok: false, error: "Invalid MKCentral player count." });
  }

  const target = `https://lounge.mkcentral.com/mkworld/PlayerDetails/${playerId}?season=${season}${p ? `&p=${p}` : ""}`;
  try {
    const html = await fetchMkcentralHtml(target);

    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  } catch (e) {
    return json(e?.status || 502, {
      ok: false,
      error: e?.message || "Could not fetch MKCentral.",
      url: target,
    });
  }
}

async function handleMkcentralTable(request) {
  const url = new URL(request.url);
  const tableId = String(url.searchParams.get("tableId") || "").trim();

  if (!/^\d{1,12}$/.test(tableId)) {
    return json(400, { ok: false, error: "Invalid MKCentral table ID." });
  }

  const target = `https://lounge.mkcentral.com/mkworld/TableDetails/${tableId}`;
  try {
    const html = await fetchMkcentralHtml(target);

    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  } catch (e) {
    return json(e?.status || 502, {
      ok: false,
      error: e?.message || "Could not fetch MKCentral table.",
      url: target,
    });
  }
}

async function handleTimeTrialIndex() {
  const target = "https://mkwrs.com/mkworld/";
  try {
    const html = await fetchMkwrsHtml(target);
    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  } catch (e) {
    return json(e?.status || 502, {
      ok: false,
      error: e?.message || "Could not fetch MKWorld WR index.",
      url: target,
    });
  }
}

async function handleTimeTrialTrack(request) {
  const url = new URL(request.url);
  const track = String(url.searchParams.get("track") || "").trim();

  if (!track || track.length > 120) {
    return json(400, { ok: false, error: "Invalid track name." });
  }

  const target = `https://mkwrs.com/mkworld/display.php?track=${encodeURIComponent(track)}`;
  try {
    const html = await fetchMkwrsHtml(target);
    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  } catch (e) {
    return json(e?.status || 502, {
      ok: false,
      error: e?.message || "Could not fetch MKWorld WR track page.",
      url: target,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (shouldRedirectToCanonical(url)) {
      return withSecurityHeaders(redirectToCanonical(url), url);
    }

    const legacyAssetUrl = rewriteLegacyAssetUrl(url);
    if (legacyAssetUrl) {
      const rewrittenRequest = new Request(legacyAssetUrl.toString(), request);
      return withSecurityHeaders(await env.ASSETS.fetch(rewrittenRequest), legacyAssetUrl);
    }

    if (url.pathname === "/api/mkcentral-player") {
      return withSecurityHeaders(await handleMkcentralPlayer(request), url);
    }

    if (url.pathname === "/api/mkcentral-options") {
      return withSecurityHeaders(await handleMkcentralOptions(), url);
    }

    if (url.pathname === "/api/mkcentral-table") {
      return withSecurityHeaders(await handleMkcentralTable(request), url);
    }

    if (url.pathname === "/api/time-trial-index") {
      return withSecurityHeaders(await handleTimeTrialIndex(), url);
    }

    if (url.pathname === "/api/time-trial-track") {
      return withSecurityHeaders(await handleTimeTrialTrack(request), url);
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request), url);
  },
};
