(() => {
  const SETTINGS_KEY = "mkwt_mkcentral_player_ref_v1";
  const DEFAULT_PLAYER_REF = "";
  const SEASON = "2";
  const PLAYER_COUNT = "12";
  const SUPABASE_URL = "https://imxlssgtzzdfgdscubdx.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
  const $ = (id) => document.getElementById(id);

  let chartDelta = null;
  let chartMmr = null;
  let supabaseClient = null;
  let SESSION = null;

  function setStatus(message, ok = true){
    const el = $("mkcStatus");
    if(!el) return;
    el.textContent = message || "";
    el.className = "muted statusLine " + (message ? (ok ? "ok" : "bad") : "");
  }

  function readStorage(key, fallback = ""){
    try{ return localStorage.getItem(key) ?? fallback; }catch(e){ return fallback; }
  }

  function writeStorage(key, value){
    try{ localStorage.setItem(key, String(value)); return true; }catch(e){ return false; }
  }

  function readJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      return fallback;
    }
  }

  function writeJson(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }catch(e){ return false; }
  }

  function makeSupabaseClient(storage){
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    });
  }

  async function resolveSession(){
    if(window.supabaseClient?.auth && window.SESSION?.user){
      supabaseClient = window.supabaseClient;
      SESSION = window.SESSION;
      return { client: supabaseClient, session: SESSION };
    }
    if(!window.supabase?.createClient) return { client: null, session: null };

    const localClient = makeSupabaseClient(localStorage);
    let { data, error } = await localClient.auth.getSession();
    if(!error && data?.session){
      supabaseClient = localClient;
      SESSION = data.session;
      return { client: supabaseClient, session: SESSION };
    }

    const sessionClient = makeSupabaseClient(sessionStorage);
    ({ data, error } = await sessionClient.auth.getSession());
    if(!error && data?.session){
      supabaseClient = sessionClient;
      SESSION = data.session;
      return { client: supabaseClient, session: SESSION };
    }

    supabaseClient = null;
    SESSION = null;
    return { client: null, session: null };
  }

  async function readCloudPlayerRef(){
    try{
      const resolved = await resolveSession();
      if(!resolved.session?.user?.id || !resolved.client) return "";

      let { data, error } = await resolved.client
        .from("profiles")
        .select("mkcentral_player_id")
        .eq("id", resolved.session.user.id)
        .maybeSingle();

      if(error && String(error.message || "").includes("column profiles.id")){
        ({ data, error } = await resolved.client
          .from("profiles")
          .select("mkcentral_player_id")
          .eq("user_id", resolved.session.user.id)
          .maybeSingle());
      }

      if(error) throw error;
      return String(data?.mkcentral_player_id || "").trim();
    }catch(e){
      console.warn("MKCentral cloud player id load failed:", e);
      return "";
    }
  }

  async function saveCloudPlayerRef(playerId){
    if(!playerId) return;
    try{
      const resolved = await resolveSession();
      if(!resolved.session?.user?.id || !resolved.client) return;
      const uid = resolved.session.user.id;
      const now = new Date().toISOString();

      let { data, error } = await resolved.client
        .from("profiles")
        .select("id")
        .eq("id", uid)
        .maybeSingle();

      if(error && String(error.message || "").includes("column profiles.id")){
        ({ data, error } = await resolved.client
          .from("profiles")
          .select("user_id")
          .eq("user_id", uid)
          .maybeSingle());
        if(error) throw error;

        if(data){
          ({ error } = await resolved.client
            .from("profiles")
            .update({
              mkcentral_player_id: playerId,
              updated_at: now,
            })
            .eq("user_id", uid));
        }else{
          ({ error } = await resolved.client
            .from("profiles")
            .insert({
              user_id: uid,
              mkcentral_player_id: playerId,
              updated_at: now,
            }));
        }
      }else{
        if(error) throw error;

        if(data){
          ({ error } = await resolved.client
            .from("profiles")
            .update({
              mkcentral_player_id: playerId,
              updated_at: now,
            })
            .eq("id", uid));
        }else{
          ({ error } = await resolved.client
            .from("profiles")
            .insert({
              id: uid,
              mkcentral_player_id: playerId,
              updated_at: now,
            }));
        }
      }

      if(error) throw error;
    }catch(e){
      console.warn("MKCentral cloud player id save failed:", e);
    }
  }

  function extractPlayerId(value){
    const raw = String(value || "").trim();
    if(/^\d+$/.test(raw)) return raw;
    const match = raw.match(/PlayerDetails\/(\d+)/i);
    return match ? match[1] : "";
  }

  function dataKey(playerId){
    return `mkwt_mkcentral_${playerId}_season${SEASON}_p${PLAYER_COUNT}_v1`;
  }

  function cleanText(value){
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseNumber(value){
    const raw = cleanText(value).replace(/,/g, "");
    const normalized = raw.replace(/[^\d.-]/g, "");
    if(!normalized || normalized === "-" || normalized === ".") return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  function parseDelta(value){
    return parseNumber(String(value || "").replace(/\u2212/g, "-"));
  }

  function normalizeIsoTime(value){
    const raw = String(value || "").trim();
    if(!raw) return "";
    const fixed = raw.replace(/\.(\d{3})\d+Z$/, ".$1Z");
    const date = new Date(fixed);
    return Number.isFinite(date.getTime()) ? date.toISOString() : raw;
  }

  function fmtNumber(value, decimals = 0){
    const n = Number(value);
    if(!Number.isFinite(n)) return "-";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtDelta(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return "-";
    return (n > 0 ? "+" : "") + fmtNumber(n, 0);
  }

  function fmtSigned(value, decimals = 2){
    const n = Number(value);
    if(!Number.isFinite(n)) return "-";
    return (n > 0 ? "+" : "") + fmtNumber(n, decimals);
  }

  function fmtPct(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return "-";
    return n.toFixed(1) + "%";
  }

  function fmtDate(value){
    if(!value) return "-";
    const date = new Date(value);
    if(!Number.isFinite(date.getTime())) return value;
    return date.toLocaleString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function gainClass(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n === 0) return "gainFlat";
    return n > 0 ? "gainGood" : "gainBad";
  }

  function readDl(dl){
    const out = {};
    if(!dl) return out;
    dl.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.parentElement?.querySelector("dd");
      const key = cleanText(dt.textContent);
      if(key) out[key] = cleanText(dd?.textContent || "");
    });
    return out;
  }

  function nextDlAfterHeading(doc, headingText){
    const heading = Array.from(doc.querySelectorAll("h3"))
      .find((el) => cleanText(el.textContent).toLowerCase() === headingText.toLowerCase());
    let node = heading?.nextElementSibling || null;
    while(node && node.tagName?.toLowerCase() !== "dl") node = node.nextElementSibling;
    return node || null;
  }

  function parseEventLabel(label){
    const title = cleanText(label).replace(/\s*\(ID:\s*\d+\)\s*$/i, "");
    const format = (title.match(/\b(FFA|\d+v\d+)\b/i)?.[1] || "Other").toUpperCase();
    const tier = title.match(/\bTier\s+([A-Z]+)\b/i)?.[1]?.toUpperCase() || "Other";
    return { title, format, tier };
  }

  function parsePlayerPage(html){
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = cleanText(doc.querySelector("title")?.textContent || "");
    const playerName = title.replace(/\s*-\s*Season\s+\d+\s*$/i, "") || "MKCentral player";
    const dls = Array.from(doc.querySelectorAll("dl"));
    const profile = readDl(dls[0]);
    const summary = readDl(nextDlAfterHeading(doc, "12 Player Events") || dls[1]);
    const rows = Array.from(doc.querySelectorAll("table tr")).filter((row) => !row.querySelector("th"));

    const events = rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if(cells.length < 4) return null;
      const link = cells[0].querySelector("a");
      const label = cleanText(link?.textContent || cells[0].textContent);
      const href = link?.getAttribute("href") || "";
      const id = (href.match(/TableDetails\/(\d+)/i)?.[1] || label.match(/ID:\s*(\d+)/i)?.[1] || "").trim();
      if(!id || !label) return null;
      const parsed = parseEventLabel(label);
      const timeAttr = cells[1].querySelector("[data-time]")?.getAttribute("data-time") || cleanText(cells[1].textContent);
      const createdAt = normalizeIsoTime(timeAttr);
      return {
        id,
        event: parsed.title,
        raw_event: label,
        format: parsed.format,
        tier: parsed.tier,
        created_at: createdAt,
        mmr_delta: parseDelta(cells[2].textContent),
        mmr_after: parseNumber(cells[3].textContent),
        table_url: `https://lounge.mkcentral.com/mkworld/TableDetails/${id}`,
      };
    }).filter(Boolean);

    return { playerName, profile, summary, events };
  }

  function mergeEvents(existingEvents, incomingEvents){
    const map = new Map();
    for(const event of existingEvents || []) map.set(String(event.id), event);
    let added = 0;
    let updated = 0;
    for(const event of incomingEvents || []){
      const key = String(event.id);
      if(map.has(key)) updated += 1;
      else added += 1;
      map.set(key, { ...(map.get(key) || {}), ...event });
    }
    const events = Array.from(map.values()).sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return da - db || String(a.id).localeCompare(String(b.id));
    });
    return { events, added, updated };
  }

  async function fetchMkcentral(playerId){
    const path = `/api/mkcentral-player?playerId=${encodeURIComponent(playerId)}&season=${SEASON}&p=${PLAYER_COUNT}&t=${Date.now()}`;
    const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
    const urls = [path];
    if(localHostnames.has(location.hostname)){
      urls.push(`http://127.0.0.1:8788${path}`);
    }

    let lastStatus = 0;
    let lastError = "";
    for(const url of urls){
      try{
        const res = await fetch(url, { cache: "no-store" });
        lastStatus = res.status;
        const payload = await res.json().catch(() => null);
        if(res.ok && payload?.ok) return payload;
        lastError = payload?.error || `HTTP ${res.status}`;
        if(localHostnames.has(location.hostname) && !url.startsWith("http://127.0.0.1:8788")){
          continue;
        }
        if(res.status !== 404) break;
      }catch(e){
        lastError = e?.message || "Network error";
      }
    }

    if(localHostnames.has(location.hostname) && lastStatus === 404){
      throw new Error("Live Server cannot run /api/mkcentral-player. Run tools/mkcentral-local-proxy.ps1 in PowerShell, then press Update data again.");
    }
    if(localHostnames.has(location.hostname)){
      throw new Error(`Local MKCentral proxy is not reachable. Run tools/mkcentral-local-proxy.ps1 in PowerShell. Last error: ${lastError}`);
    }
    throw new Error(lastError || "MKCentral sync failed.");
  }

  function getStoredPayload(playerId){
    return readJson(dataKey(playerId), {
      playerId,
      season: SEASON,
      playerCount: PLAYER_COUNT,
      playerName: "",
      profile: {},
      summary: {},
      events: [],
      updated_at: "",
      source_url: "",
    });
  }

  function getStatEvents(events){
    return (events || []).filter((event) => !/^placement$/i.test(String(event.event || "")));
  }

  function sum(values){
    return values.reduce((acc, value) => acc + Number(value || 0), 0);
  }

  function calcDerived(events, profile, summary){
    const statEvents = getStatEvents(events).filter((event) => Number.isFinite(event.mmr_delta));
    const deltas = statEvents.map((event) => Number(event.mmr_delta));
    const wins = deltas.filter((v) => v > 0).length;
    const losses = deltas.filter((v) => v < 0).length;
    const neutral = deltas.filter((v) => v === 0).length;
    const total = sum(deltas);
    const newest = statEvents[statEvents.length - 1] || null;
    const oldest = statEvents[0] || null;
    const currentMmr = parseNumber(profile?.MMR) ?? newest?.mmr_after ?? null;
    const officialPeak = parseNumber(profile?.["Peak MMR"]);
    const localPeak = Math.max(...statEvents.map((event) => event.mmr_after).filter(Number.isFinite));
    const peakMmr = Number.isFinite(officialPeak) ? officialPeak : (Number.isFinite(localPeak) ? localPeak : null);
    const startMmr = oldest && Number.isFinite(Number(oldest.mmr_after)) && Number.isFinite(Number(oldest.mmr_delta))
      ? Number(oldest.mmr_after) - Number(oldest.mmr_delta)
      : null;
    const last10 = statEvents.slice(-10);
    const last50 = statEvents.slice(-50);
    const bestEvent = statEvents.slice().sort((a, b) => Number(b.mmr_delta) - Number(a.mmr_delta))[0] || null;
    const worstEvent = statEvents.slice().sort((a, b) => Number(a.mmr_delta) - Number(b.mmr_delta))[0] || null;

    return {
      eventCount: statEvents.length,
      currentMmr,
      peakMmr,
      startMmr,
      totalGain: total,
      avgGain: statEvents.length ? total / statEvents.length : null,
      winrate: (wins + losses) ? wins / (wins + losses) * 100 : null,
      wins,
      losses,
      neutral,
      last10Gain: sum(last10.map((event) => event.mmr_delta)),
      last10Count: last10.length,
      last50Avg: last50.length ? sum(last50.map((event) => event.mmr_delta)) / last50.length : null,
      last50Count: last50.length,
      bestEvent,
      worstEvent,
      officialEvents: parseNumber(summary?.["Events Played"]),
      officialAvgScore: parseNumber(summary?.["Average Score"]),
      officialAvgScoreNoSq: parseNumber(summary?.["Average Score (No SQ)"]),
      officialAvgLast10: parseNumber(summary?.["Average Score (Last 10)"]),
      officialWinRateText: summary?.["Win Rate"] || "",
    };
  }

  function groupedRows(events, key){
    const map = new Map();
    getStatEvents(events).forEach((event) => {
      const label = cleanText(event[key]) || "Other";
      const row = map.get(label) || { label, count: 0, total: 0, wins: 0, losses: 0 };
      const delta = event.mmr_delta;
      if(!Number.isFinite(delta)) return;
      row.count += 1;
      row.total += delta;
      if(delta > 0) row.wins += 1;
      else if(delta < 0) row.losses += 1;
      map.set(label, row);
    });
    return Array.from(map.values()).map((row) => ({
      ...row,
      avg: row.count ? row.total / row.count : 0,
      winrate: (row.wins + row.losses) ? row.wins / (row.wins + row.losses) * 100 : null,
    })).sort((a, b) => b.count - a.count || b.avg - a.avg || a.label.localeCompare(b.label));
  }

  function card(label, value, meta = "", cls = ""){
    return `<div class="mkcStat">
      <div class="mkcStatLabel">${escapeHtml(label)}</div>
      <div class="mkcStatValue ${cls}">${escapeHtml(value)}</div>
      <div class="mkcStatMeta">${escapeHtml(meta)}</div>
    </div>`;
  }

  function renderCards(payload){
    const cards = $("mkcCards");
    if(!cards) return;
    const derived = calcDerived(payload.events || [], payload.profile || {}, payload.summary || {});
    cards.innerHTML = [
      card("Player", payload.playerName || "MKCentral", `S${SEASON} / ${PLAYER_COUNT}p`),
      card("Last Update", payload.updated_at ? fmtDate(payload.updated_at) : "-", "Local cache"),
      card("Current MMR", fmtNumber(derived.currentMmr), `Start est. ${fmtNumber(derived.startMmr)}`),
      card("Peak MMR", fmtNumber(derived.peakMmr), "Official if available"),
      card("Events", fmtNumber(derived.eventCount), derived.officialEvents ? `Official: ${fmtNumber(derived.officialEvents)}` : "Local synced"),
      card("Total Gain", fmtDelta(derived.totalGain), "Merged local history", gainClass(derived.totalGain)),
      card("Avg Gain", derived.avgGain == null ? "-" : fmtSigned(derived.avgGain), "Per event", gainClass(derived.avgGain)),
      card("Avg Last 50", derived.last50Avg == null ? "-" : fmtSigned(derived.last50Avg), `${derived.last50Count} events`, gainClass(derived.last50Avg)),
      card("Winrate", fmtPct(derived.winrate), `${derived.wins} W / ${derived.losses} L / ${derived.neutral} even`),
      card("Last 10 Gain", fmtDelta(derived.last10Gain), `${derived.last10Count} events`, gainClass(derived.last10Gain)),
      card("Best Event", derived.bestEvent ? fmtDelta(derived.bestEvent.mmr_delta) : "-", derived.bestEvent?.event || "", gainClass(derived.bestEvent?.mmr_delta)),
      card("Worst Event", derived.worstEvent ? fmtDelta(derived.worstEvent.mmr_delta) : "-", derived.worstEvent?.event || "", gainClass(derived.worstEvent?.mmr_delta)),
      card("Avg Score", derived.officialAvgScore == null ? "-" : fmtNumber(derived.officialAvgScore, 1), "Official MKCentral"),
      card("Avg Score L10", derived.officialAvgLast10 == null ? "-" : fmtNumber(derived.officialAvgLast10, 1), derived.officialWinRateText ? `Official WR ${derived.officialWinRateText}` : "Official MKCentral"),
    ].join("");
  }

  function renderGroupTable(id, rows){
    const body = $(id);
    if(!body) return;
    if(!rows.length){
      body.innerHTML = '<tr><td colspan="5" class="muted">No data yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${row.count}</td>
        <td class="${gainClass(row.total)}">${fmtDelta(row.total)}</td>
        <td class="${gainClass(row.avg)}">${fmtDelta(row.avg)}</td>
        <td>${fmtPct(row.winrate)}</td>
      </tr>
    `).join("");
  }

  function renderEvents(events){
    const body = $("mkcEventRows");
    const meta = $("mkcEventMeta");
    if(meta) meta.textContent = `${events.length} synced events. Showing newest 30.`;
    if(!body) return;
    const newest = (events || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 30);
    if(!newest.length){
      body.innerHTML = '<tr><td colspan="4" class="muted">No events synced yet.</td></tr>';
      return;
    }
    body.innerHTML = newest.map((event) => `
      <tr>
        <td><a href="${escapeHtml(event.table_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.event)}</a></td>
        <td>${escapeHtml(fmtDate(event.created_at))}</td>
        <td class="${gainClass(event.mmr_delta)}">${fmtDelta(event.mmr_delta)}</td>
        <td>${fmtNumber(event.mmr_after)}</td>
      </tr>
    `).join("");
  }

  function cssVar(name, fallback){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function renderCharts(events){
    if(typeof Chart === "undefined") return;
    const statEvents = getStatEvents(events).filter((event) => Number.isFinite(event.mmr_delta));
    const labels = statEvents.map((event, index) => String(index + 1));
    const deltas = statEvents.map((event) => event.mmr_delta);
    const mmr = statEvents.map((event) => event.mmr_after);
    const chartMeta = $("mkcChartMeta");
    if(chartMeta) chartMeta.textContent = statEvents.length ? `${statEvents.length} events, oldest to newest.` : "No event data yet.";

    const textColor = cssVar("--text", "#fff");
    const gridColor = cssVar("--border", "rgba(255,255,255,.2)");
    const tooltipTitle = (items) => {
      const event = statEvents[items?.[0]?.dataIndex];
      return event ? `${event.event} (${fmtDate(event.created_at)})` : "";
    };

    chartDelta?.destroy();
    chartDelta = new Chart($("chartMkcDelta"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "MMR Delta",
          data: deltas,
          backgroundColor: deltas.map((v) => v >= 0 ? "rgba(77,163,25,.82)" : "rgba(255,80,80,.82)"),
          borderColor: deltas.map((v) => v >= 0 ? "rgb(77,163,25)" : "rgb(255,80,80)"),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: tooltipTitle,
              label: (ctx) => `Delta: ${fmtDelta(ctx.parsed.y)}`,
              afterLabel: (ctx) => `MMR after: ${fmtNumber(statEvents[ctx.dataIndex]?.mmr_after)}`,
            },
          },
        },
      },
    });

    chartMmr?.destroy();
    chartMmr = new Chart($("chartMkcMmr"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "MMR",
          data: mmr,
          tension: 0.2,
          pointRadius: 0,
          pointHitRadius: 12,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: tooltipTitle,
              label: (ctx) => `MMR: ${fmtNumber(ctx.parsed.y)}`,
            },
          },
        },
      },
    });
  }

  function render(payload){
    if(!payload || !Array.isArray(payload.events) || !payload.events.length){
      $("mkcCards").innerHTML = '<div class="mkcEmpty">No local Lounge Stats data yet. Press Update data to pull Season 2 / 12p from MKCentral.</div>';
      renderGroupTable("mkcTypeRows", []);
      renderGroupTable("mkcTierRows", []);
      renderEvents([]);
      renderCharts([]);
      return;
    }
    renderCards(payload);
    renderGroupTable("mkcTypeRows", groupedRows(payload.events, "format"));
    renderGroupTable("mkcTierRows", groupedRows(payload.events, "tier"));
    renderEvents(payload.events);
    renderCharts(payload.events);
  }

  async function loadInitialPlayerRef(){
    const localRef = readStorage(SETTINGS_KEY, "");
    const cloudRef = await readCloudPlayerRef();
    const preferredRef = cloudRef || localRef || DEFAULT_PLAYER_REF;
    const normalized = extractPlayerId(preferredRef);
    if(normalized) writeStorage(SETTINGS_KEY, normalized);
    return normalized || preferredRef;
  }

  async function update(){
    const input = $("mkcPlayerInput");
    const ref = String(input?.value || "").trim();
    const playerId = extractPlayerId(ref);
    if(!playerId){
      setStatus("Enter a valid MKCentral player ID or PlayerDetails URL.", false);
      return;
    }
    writeStorage(SETTINGS_KEY, playerId);
    if(input) input.value = playerId;
    await saveCloudPlayerRef(playerId);

    try{
      setStatus("Updating local Lounge Stats from MKCentral Season 2 / 12p...", true);
      const fetched = await fetchMkcentral(playerId);
      const parsed = parsePlayerPage(fetched.html);
      const current = getStoredPayload(playerId);
      const merged = mergeEvents(current.events || [], parsed.events || []);
      const next = {
        playerId,
        season: SEASON,
        playerCount: PLAYER_COUNT,
        playerName: parsed.playerName,
        profile: parsed.profile,
        summary: parsed.summary,
        events: merged.events,
        updated_at: fetched.fetched_at || new Date().toISOString(),
        source_url: fetched.url || "",
      };
      writeJson(dataKey(playerId), next);
      render(next);
      setStatus(`Local data updated. Added ${merged.added} new events. Local total: ${merged.events.length}.`, true);
    }catch(e){
      setStatus(e?.message || "Update failed.", false);
      console.error(e);
    }
  }

  async function init(){
    const savedRef = await loadInitialPlayerRef();
    const input = $("mkcPlayerInput");
    if(input) input.value = savedRef;
    const playerId = extractPlayerId(savedRef);
    if(playerId) render(getStoredPayload(playerId));
    else render(null);
    $("btnUpdateMkc")?.addEventListener("click", update);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
