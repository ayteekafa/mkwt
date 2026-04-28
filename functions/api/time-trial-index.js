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

export async function onRequestGet(){
  const target = "https://mkwrs.com/mkworld/";

  try{
    const res = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "MKWT Time Trial sync (+https://mkwt.app)",
      },
      cf: { cacheTtl: 30, cacheEverything: false },
    });

    const html = await res.text();
    if(!res.ok){
      return json(res.status, {
        ok: false,
        error: `MKWorld WRs returned HTTP ${res.status}.`,
        url: target,
      });
    }

    return json(200, {
      ok: true,
      url: target,
      fetched_at: new Date().toISOString(),
      html,
    });
  }catch(e){
    return json(502, {
      ok: false,
      error: e?.message || "Could not fetch MKWorld WR index.",
      url: target,
    });
  }
}
