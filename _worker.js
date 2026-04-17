const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

async function handleMkcentralPlayer(request) {
  const url = new URL(request.url);
  const playerId = String(url.searchParams.get("playerId") || "").trim();
  const season = String(url.searchParams.get("season") || "2").trim();
  const p = String(url.searchParams.get("p") || "12").trim();

  if (!/^\d{1,10}$/.test(playerId)) {
    return json(400, { ok: false, error: "Invalid MKCentral player ID." });
  }
  if (season !== "2") {
    return json(400, { ok: false, error: "Only season 2 is enabled for this test." });
  }
  if (p !== "12") {
    return json(400, { ok: false, error: "Only 12 player stats are enabled for this test." });
  }

  const target = `https://lounge.mkcentral.com/mkworld/PlayerDetails/${playerId}?season=${season}&p=${p}`;
  try {
    const res = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "MKWT MKCentral sync test (+https://mkwt.app)",
      },
      cf: { cacheTtl: 30, cacheEverything: false },
    });

    const html = await res.text();
    if (!res.ok) {
      return json(res.status, {
        ok: false,
        error: `MKCentral returned HTTP ${res.status}.`,
        status: res.status,
        url: target,
      });
    }

    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  } catch (e) {
    return json(502, {
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
    const res = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "MKWT MKCentral sync test (+https://mkwt.app)",
      },
      cf: { cacheTtl: 30, cacheEverything: false },
    });

    const html = await res.text();
    if (!res.ok) {
      return json(res.status, {
        ok: false,
        error: `MKCentral returned HTTP ${res.status}.`,
        status: res.status,
        url: target,
      });
    }

    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  } catch (e) {
    return json(502, {
      ok: false,
      error: e?.message || "Could not fetch MKCentral table.",
      url: target,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/mkcentral-player") {
      return handleMkcentralPlayer(request);
    }

    if (url.pathname === "/api/mkcentral-table") {
      return handleMkcentralTable(request);
    }

    return env.ASSETS.fetch(request);
  },
};
