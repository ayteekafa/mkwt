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

async function readUtf8Html(res){
  const bytes = await res.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function onRequestGet({ request }){
  const url = new URL(request.url);
  const track = String(url.searchParams.get("track") || "").trim();

  if(!track || track.length > 120){
    return json(400, { ok: false, error: "Invalid track name." });
  }

  const target = `https://mkwrs.com/mkworld/display.php?track=${encodeURIComponent(track)}`;

  try{
    const res = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "MKWT Time Trial sync (+https://mkwt.app)",
      },
      cf: { cacheTtl: 30, cacheEverything: false },
    });

    const html = await readUtf8Html(res);
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
      error: e?.message || "Could not fetch MKWorld WR track page.",
      url: target,
    });
  }
}
