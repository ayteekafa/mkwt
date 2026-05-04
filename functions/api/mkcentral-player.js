const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(status, payload){
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

async function fetchMkcentralHtml(target){
  const res = await fetch(target, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "MKWT MKCentral sync (+https://mkwt.app)",
    },
    cf: { cacheTtl: 30, cacheEverything: false },
  });

  const html = await res.text();
  if(!res.ok){
    const err = new Error(`MKCentral returned HTTP ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return html;
}

export async function onRequestGet({ request }){
  const url = new URL(request.url);
  const playerId = String(url.searchParams.get("playerId") || "").trim();
  const season = String(url.searchParams.get("season") || "2").trim();
  const p = String(url.searchParams.get("p") || "").trim();

  if(!/^\d{1,10}$/.test(playerId)){
    return json(400, { ok: false, error: "Invalid MKCentral player ID." });
  }
  if(!/^\d{1,4}$/.test(season)){
    return json(400, { ok: false, error: "Invalid MKCentral season." });
  }
  if(p && p !== "12" && p !== "24"){
    return json(400, { ok: false, error: "Invalid MKCentral player count." });
  }

  const target = `https://lounge.mkcentral.com/mkworld/PlayerDetails/${playerId}?season=${season}${p ? `&p=${p}` : ""}`;
  try{
    const html = await fetchMkcentralHtml(target);

    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  }catch(e){
    return json(e?.status || 502, {
      ok: false,
      error: e?.message || "Could not fetch MKCentral.",
      url: target,
    });
  }
}
