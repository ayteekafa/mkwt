(() => {
  const SETTINGS_KEY = "mkwt_mkcentral_player_ref_v1";
  const SCOPE_KEY = "mkwt_mkcentral_scope_v1";
  const DEFAULT_PLAYER_REF = "";
  const DEFAULT_SCOPE = { season: "2", playerCount: "12", split: true, seasonName: "Season 2" };
  const SEASON_START_DATES = { "2": "2026-02-01" };
  const AVG_MOGI_MINUTES = 42;
  const MKWORLD_RANK_COLORS = {
    Grandmaster: { color: "#a3022c", bg: "rgba(163, 2, 44, 0.18)" },
    Master: { color: "#9370db", bg: "rgba(147, 112, 219, 0.18)" },
    Diamond: { color: "#b9f2ff", bg: "rgba(185, 242, 255, 0.16)" },
    Ruby: { color: "#d51c5e", bg: "rgba(213, 28, 94, 0.18)" },
    Sapphire: { color: "#286cd3", bg: "rgba(40, 108, 211, 0.20)" },
    Platinum: { color: "#3fabb8", bg: "rgba(63, 171, 184, 0.18)" },
    Gold: { color: "#f1c232", bg: "rgba(241, 194, 50, 0.18)" },
    Silver: { color: "#cccccc", bg: "rgba(204, 204, 204, 0.15)" },
    Bronze: { color: "#b45f06", bg: "rgba(180, 95, 6, 0.18)" },
    Iron: { color: "#817876", bg: "rgba(129, 120, 118, 0.18)" },
  };
  const MKWORLD_RANKS_BY_PLAYER_COUNT = {
    "12": [
      rankDef("Grandmaster", 14000),
      rankDef("Master", 13500),
      rankDef("Diamond", 12000),
      rankDef("Ruby", 10500),
      rankDef("Sapphire", 9000),
      rankDef("Platinum", 7500),
      rankDef("Gold", 6000),
      rankDef("Silver", 4000),
      rankDef("Bronze", 2000),
      rankDef("Iron", 0),
    ],
    "24": [
      rankDef("Grandmaster", 15500),
      rankDef("Master", 14500),
      rankDef("Diamond", 12000),
      rankDef("Ruby", 10500),
      rankDef("Sapphire", 9000),
      rankDef("Platinum", 7500),
      rankDef("Gold", 6000),
      rankDef("Silver", 4000),
      rankDef("Bronze", 2000),
      rankDef("Iron", 0),
    ],
  };
  const SUPABASE_URL = "https://imxlssgtzzdfgdscubdx.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
  const $ = (id) => document.getElementById(id);

  let chartDelta = null;
  let chartMmr = null;
  let chartWeeklyMmr = null;
  let supabaseClient = null;
  let SESSION = null;
  let activeScope = { ...DEFAULT_SCOPE };
  let pendingScope = { ...DEFAULT_SCOPE };
  let scopeOptionsCache = null;
  let isUpdating = false;
  let lastRenderedPayload = null;
  const LOUNGE_TRACKS = [
    "Acorn Heights",
    "Airship Fortress",
    "Boo Cinema",
    "Bowser's Castle",
    "Cheep Cheep Falls",
    "Choco Mountain",
    "Crown City",
    "Dandelion Depths",
    "Desert Hills",
    "Dino Dino Jungle",
    "DK Pass",
    "DK Spaceport",
    "Dry Bones Burnout",
    "Faraway Oasis",
    "Great ? Block Ruins",
    "Koopa Troopa Beach",
    "Mario Circuit",
    "Mario Bros. Circuit",
    "Moo Moo Meadows",
    "Peach Beach",
    "Peach Stadium",
    "Rainbow Road",
    "Salty Salty Speedway",
    "Shy Guy Bazaar",
    "Sky-High Sundae",
    "Starview Peak",
    "Toad's Factory",
    "Wario Shipyard",
    "Wario Stadium",
    "Whistlestop Summit",
  ];
  const LOUNGE_TRACKER_STORAGE = {
    "12": "mkwt_lounge_sessions_v1",
    "24": "mkwt_lounge24_sessions_v1",
  };
  const loungeTrackerChartsState = {
    mode: "12",
    sessionsByMode: { "12": [], "24": [] },
    trackSortKey: "avg",
    trackSortDir: "desc",
    trackMode: "tracks",
    placementMode: "all",
    placementItem: "",
    lastTrackStats: [],
    lastSelectedTrack: null,
    trackChart: null,
    placementChart: null,
    intermissionMeta: null,
  };
  const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

  function rankDef(name, min){
    return { name, min, ...MKWORLD_RANK_COLORS[name] };
  }

  function setStatus(message, ok = true){
    const el = $("mkcStatus");
    if(!el) return;
    el.textContent = message || "";
    el.className = "muted statusLine " + (message ? (ok ? "ok" : "bad") : "");
  }

  function setUpdateBusy(active){
    isUpdating = !!active;
    const updateBtn = $("btnUpdateMkc");
    const runBtn = $("btnRunMkcUpdate");
    if(updateBtn){
      updateBtn.disabled = isUpdating;
      updateBtn.textContent = isUpdating ? "Updating..." : "Update data";
    }
    if(runBtn){
      runBtn.disabled = isUpdating;
      runBtn.textContent = isUpdating ? "Updating..." : "Update selected";
    }
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

  function normalizeScope(scope){
    const raw = scope && typeof scope === "object" ? scope : {};
    const season = String(raw.season ?? DEFAULT_SCOPE.season).replace(/[^\d]/g, "") || DEFAULT_SCOPE.season;
    const playerCount = String(raw.playerCount || raw.p || DEFAULT_SCOPE.playerCount).replace(/[^\d]/g, "") || DEFAULT_SCOPE.playerCount;
    const split = raw.split === true || raw.split === "true" || (season === "2" && (playerCount === "12" || playerCount === "24"));
    const seasonName = cleanText(raw.seasonName || (season === "0" ? "Preseason" : `Season ${season}`));
    return { season, playerCount, split, seasonName };
  }

  function scopeKey(scope = activeScope){
    const s = normalizeScope(scope);
    return `${s.season}:${s.split ? s.playerCount : "all"}`;
  }

  function scopeStorageSuffix(scope = activeScope){
    const s = normalizeScope(scope);
    return `season${s.season}_${s.split ? `p${s.playerCount}` : "all"}`;
  }

  function scopeLabel(scope = activeScope){
    const s = normalizeScope(scope);
    return `${s.seasonName}${s.split ? ` / ${s.playerCount}p` : ""}`;
  }

  function readScope(){
    return normalizeScope(readJson(SCOPE_KEY, DEFAULT_SCOPE));
  }

  function writeScope(scope){
    activeScope = normalizeScope(scope);
    writeJson(SCOPE_KEY, activeScope);
    setScopeDisplay();
  }

  function setScopeDisplay(){
    const el = $("mkcScopeEyebrow");
    if(el) el.textContent = `MKCentral ${scopeLabel(activeScope)}`;
  }

  function setPlayerDisplay(playerRef){
    const idEl = $("mkcPlayerDisplay");
    const nameEl = $("mkcPlayerNameDisplay");
    if(!idEl) return "";
    const playerId = extractPlayerId(playerRef);
    idEl.dataset.playerId = playerId;
    idEl.textContent = playerId || "ID not set";
    idEl.classList.toggle("isEmpty", !playerId);
    if(nameEl){
      nameEl.textContent = "MKCentral Player";
      nameEl.classList.toggle("isEmpty", !playerId);
    }
    return playerId;
  }

  function setLastUpdateDisplay(value){
    const el = $("mkcLastUpdateDisplay");
    if(el) el.textContent = value ? fmtDate(value) : "-";
  }

  function makeSupabaseClient(storage){
    if (window.MKWT?.getSupabaseClient) {
      return window.MKWT.getSupabaseClient({ mode: storage === sessionStorage ? "session" : "local" });
    }
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

    const hasLocal = window.MKWT?.authStorageHasToken ? window.MKWT.authStorageHasToken("local") : true;
    const hasSession = window.MKWT?.authStorageHasToken ? window.MKWT.authStorageHasToken("session") : true;

    if (hasLocal) {
      const localClient = makeSupabaseClient(localStorage);
      let { data, error } = await localClient.auth.getSession();
      if(!error && data?.session){
        supabaseClient = localClient;
        SESSION = data.session;
        return { client: supabaseClient, session: SESSION };
      }
    }

    if (hasSession) {
      const sessionClient = makeSupabaseClient(sessionStorage);
      const { data, error } = await sessionClient.auth.getSession();
      if(!error && data?.session){
        supabaseClient = sessionClient;
        SESSION = data.session;
        return { client: supabaseClient, session: SESSION };
      }
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

  function dataKey(playerId, scope = activeScope){
    return `mkwt_mkcentral_${playerId}_${scopeStorageSuffix(scope)}_v1`;
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

  function finiteNumber(value){
    if(value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parsedNumber(value){
    if(typeof value === "number") return Number.isFinite(value) ? value : null;
    return parseNumber(value);
  }

  function normalizeEventNumbers(event){
    if(!event || typeof event !== "object") return event;
    return {
      ...event,
      mmr_delta: parsedNumber(event.mmr_delta),
      mmr_after: parsedNumber(event.mmr_after),
      mmr_before: parsedNumber(event.mmr_before),
      table_rank: parsedNumber(event.table_rank),
      table_score: parsedNumber(event.table_score),
    };
  }

  function isSuspiciousGroupLabel(value){
    const raw = cleanText(value);
    return !raw || /^\d{5,}$/.test(raw);
  }

  function normalizeGroupLabel(value, key){
    const raw = cleanText(value);
    if(key === "format"){
      const upper = raw.toUpperCase();
      if(/^FFA$/.test(upper)) return "FFA";
      if(/^\d+V\d+$/.test(upper)) return upper;
      if(isSuspiciousGroupLabel(raw)) return "Other";
      return upper || "Other";
    }
    if(key === "tier"){
      const upper = raw.toUpperCase();
      if(isSuspiciousGroupLabel(upper)) return "Other";
      return upper || "Other";
    }
    return raw || "Other";
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

  function fmtDurationMinutes(value){
    const totalMinutes = Math.max(0, Math.round(Number(value) || 0));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if(hours && minutes) return `${hours}h ${minutes}m`;
    if(hours) return `${hours}h`;
    return `${minutes}m`;
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

  function fmtDateShort(value){
    if(!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if(!Number.isFinite(date.getTime())) return String(value);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
    });
  }

  function toLocalDateKey(value){
    const date = value instanceof Date ? value : new Date(value);
    if(!Number.isFinite(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dateFromKey(key){
    const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function addDays(date, days){
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
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

  function getMkworldRank(value){
    if(value == null || value === "") return null;
    const n = Number(value);
    if(!Number.isFinite(n)) return null;
    const ranks = MKWORLD_RANKS_BY_PLAYER_COUNT[normalizeScope(activeScope).playerCount] || MKWORLD_RANKS_BY_PLAYER_COUNT["12"];
    return ranks.find((rank) => n >= rank.min) || null;
  }

  function readDl(dl){
    const out = {};
    if(!dl) return out;
    dl.querySelectorAll("dt").forEach((dt) => {
      let dd = dt.nextElementSibling;
      while(dd && dd.tagName?.toLowerCase() !== "dd") dd = dd.nextElementSibling;
      if(!dd){
        const parent = dt.parentElement;
        if(parent){
          const localDd = Array.from(parent.children).find((child) => child.tagName?.toLowerCase() === "dd");
          if(localDd) dd = localDd;
        }
      }
      const key = cleanText(dt.textContent);
      if(key) out[key] = cleanText(dd?.textContent || "");
    });
    return out;
  }

  function readAllDls(doc){
    return Array.from(doc.querySelectorAll("dl")).reduce((acc, dl) => Object.assign(acc, readDl(dl)), {});
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

  function eventGroupLabel(event, key){
    const label = normalizeGroupLabel(event?.[key], key);
    if(label !== "Other") return label;
    const parsed = parseEventLabel(event?.raw_event || event?.event || "");
    return normalizeGroupLabel(parsed[key], key);
  }

  function parsePlayerPage(html, scope = activeScope){
    const selectedScope = normalizeScope(scope);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = cleanText(doc.querySelector("title")?.textContent || "");
    const playerName = title.replace(/\s*-\s*(?:Season\s+\d+|Preseason)\s*$/i, "") || "MKCentral player";
    const dls = Array.from(doc.querySelectorAll("dl"));
    const profile = readDl(dls[0]);
    const summaryHeading = `${selectedScope.playerCount} Player Events`;
    const summary = readDl(nextDlAfterHeading(doc, summaryHeading) || nextDlAfterHeading(doc, "12 Player Events") || dls[1]);
    const events = [];
    for(const table of Array.from(doc.querySelectorAll("table"))){
      const headerRow = Array.from(table.querySelectorAll("tr")).find((row) => row.querySelectorAll("th").length >= 3);
      if(!headerRow) continue;
      const headers = Array.from(headerRow.querySelectorAll("th")).map((th) => cleanText(th.textContent).toLowerCase());
      const eventIdx = headers.findIndex((text) => text.includes("event"));
      const timeIdx = headers.findIndex((text) => text.includes("time"));
      const deltaIdx = headers.findIndex((text) => text.includes("delta"));
      const mmrIdx = headers.findIndex((text) => text === "mmr" || text.includes("new mmr"));
      if(eventIdx < 0 || timeIdx < 0 || deltaIdx < 0 || mmrIdx < 0) continue;

      Array.from(table.querySelectorAll("tr")).forEach((row) => {
        if(row === headerRow || row.querySelector("th")) return;
        const cells = Array.from(row.querySelectorAll("td"));
        if(cells.length <= Math.max(eventIdx, timeIdx, deltaIdx, mmrIdx)) return;
        const eventCell = cells[eventIdx];
        const link = eventCell?.querySelector("a");
        const label = cleanText(link?.textContent || eventCell?.textContent || "");
        const href = link?.getAttribute("href") || "";
        const id = (href.match(/TableDetails\/(\d+)/i)?.[1] || label.match(/ID:\s*(\d+)/i)?.[1] || "").trim();
        if(!id || !label) return;
        const parsed = parseEventLabel(label);
        const timeAttr = cells[timeIdx]?.querySelector("[data-time]")?.getAttribute("data-time") || cleanText(cells[timeIdx]?.textContent);
        const createdAt = normalizeIsoTime(timeAttr);
        const mmrDeltaText = cleanText(cells[deltaIdx]?.textContent);
        const mmrAfterText = cleanText(cells[mmrIdx]?.textContent);
        const event = {
          id,
          event: parsed.title,
          raw_event: label,
          format: parsed.format,
          tier: parsed.tier,
          created_at: createdAt,
          mmr_delta: parseDelta(mmrDeltaText),
          mmr_after: parseNumber(mmrAfterText),
          table_url: `https://lounge.mkcentral.com/mkworld/TableDetails/${id}`,
        };
        if(parsedNumber(event.mmr_delta) != null || parsedNumber(event.mmr_after) != null) events.push(normalizeEventNumbers(event));
      });
      if(events.length) break;
    }

    return { playerName, profile, summary, events };
  }

  function parseTablePage(html, tableId, playerId, playerName){
    const doc = new DOMParser().parseFromString(html, "text/html");
    const meta = readAllDls(doc);
    const normalizedPlayerName = cleanText(playerName).toLowerCase();
    let playerRow = null;

    for(const table of Array.from(doc.querySelectorAll("table"))){
      const headerRow = Array.from(table.querySelectorAll("tr")).find((row) => row.querySelectorAll("th").length >= 4);
      if(!headerRow) continue;
      const headers = Array.from(headerRow.querySelectorAll("th")).map((th) => cleanText(th.textContent).toLowerCase());
      const rankIdx = headers.findIndex((text) => text.includes("rank"));
      const playerIdx = headers.findIndex((text) => text.includes("player"));
      const scoreIdx = headers.findIndex((text) => text.includes("score"));
      const beforeIdx = headers.findIndex((text) => text.includes("previous") && text.includes("mmr"));
      const deltaIdx = headers.findIndex((text) => text.includes("change") || text.includes("delta"));
      const afterIdx = headers.findIndex((text) => text.includes("new") && text.includes("mmr"));
      const needed = [rankIdx, playerIdx, scoreIdx, beforeIdx, deltaIdx, afterIdx];
      if(needed.some((idx) => idx < 0)) continue;

      for(const row of Array.from(table.querySelectorAll("tr"))){
        if(row === headerRow) continue;
        const cells = Array.from(row.querySelectorAll("th,td"));
        if(cells.length <= Math.max(...needed)) continue;
        const playerCell = cells[playerIdx];
        const link = playerCell?.querySelector(`a[href*="/PlayerDetails/${playerId}"]`) || playerCell?.querySelector('a[href*="/PlayerDetails/"]');
        const href = link?.getAttribute("href") || "";
        const rowPlayerId = (href.match(/PlayerDetails\/(\d+)/i)?.[1] || "").trim();
        const rowPlayerName = cleanText(link?.textContent || playerCell?.textContent || "");
        const samePlayer = rowPlayerId === String(playerId) || (!!normalizedPlayerName && rowPlayerName.toLowerCase() === normalizedPlayerName);
        if(!samePlayer) continue;

        playerRow = {
          table_rank: parseNumber(cells[rankIdx]?.textContent),
          table_score: parseNumber(cells[scoreIdx]?.textContent),
          mmr_before: parseNumber(cells[beforeIdx]?.textContent),
          mmr_delta: parseDelta(cells[deltaIdx]?.textContent),
          mmr_after: parseNumber(cells[afterIdx]?.textContent),
          table_player_name: rowPlayerName || playerName || "",
        };
        break;
      }
      if(playerRow) break;
    }

    return {
      id: String(tableId || "").trim(),
      table_id: String(tableId || "").trim(),
      table_rank: playerRow?.table_rank ?? null,
      table_score: playerRow?.table_score ?? null,
      mmr_before: playerRow?.mmr_before ?? null,
      mmr_delta: playerRow?.mmr_delta ?? null,
      mmr_after: playerRow?.mmr_after ?? null,
      table_player_name: playerRow?.table_player_name || playerName || "",
      format: cleanText(meta["Format"]).toUpperCase() || "",
      tier: cleanText(meta["Tier"]).toUpperCase() || "",
      table_created_at: normalizeIsoTime(meta["Time Created"] || ""),
      table_verified_at: normalizeIsoTime(meta["Time Verified"] || ""),
    };
  }

  function mergeEvents(existingEvents, incomingEvents){
    const map = new Map();
    for(const event of existingEvents || []) map.set(String(event.id), normalizeEventNumbers(event));
    let added = 0;
    let updated = 0;
    for(const event of incomingEvents || []){
      const key = String(event.id);
      if(map.has(key)) updated += 1;
      else added += 1;
      map.set(key, normalizeEventNumbers({ ...(map.get(key) || {}), ...event }));
    }
    const events = Array.from(map.values()).sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return da - db || String(a.id).localeCompare(String(b.id));
    });
    return { events, added, updated };
  }

  async function fetchMkcentralApi(path, label){
    const urls = [path];
    if(LOCAL_HOSTNAMES.has(location.hostname)){
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
        if(LOCAL_HOSTNAMES.has(location.hostname) && !url.startsWith("http://127.0.0.1:8788")){
          continue;
        }
        if(res.status !== 404) break;
      }catch(e){
        lastError = e?.message || "Network error";
      }
    }

    if(LOCAL_HOSTNAMES.has(location.hostname) && lastStatus === 404){
      throw new Error(`Live Server cannot run ${label}. Run tools/mkcentral-local-proxy.ps1 in PowerShell, then press Update data again.`);
    }
    if(LOCAL_HOSTNAMES.has(location.hostname)){
      throw new Error(`Local MKCentral proxy is not reachable. Run tools/mkcentral-local-proxy.ps1 in PowerShell. Last error: ${lastError}`);
    }
    throw new Error(lastError || "MKCentral sync failed.");
  }

  async function fetchMkcentralOptions(){
    const path = `/api/mkcentral-options?t=${Date.now()}`;
    try{
      const data = await fetchMkcentralApi(path, "/api/mkcentral-options");
      if(Array.isArray(data.options) && data.options.length){
        scopeOptionsCache = data.options.map(normalizeScope);
        return scopeOptionsCache;
      }
    }catch(e){
      console.warn("MKCentral option sync failed, using fallback options:", e);
    }
    scopeOptionsCache = [
      { season: "0", playerCount: "12", split: false, seasonName: "Preseason" },
      { season: "1", playerCount: "12", split: false, seasonName: "Season 1" },
      { season: "2", playerCount: "12", split: true, seasonName: "Season 2" },
      { season: "2", playerCount: "24", split: true, seasonName: "Season 2" },
    ].map(normalizeScope);
    return scopeOptionsCache;
  }

  async function fetchMkcentral(playerId, scope = activeScope){
    const selectedScope = normalizeScope(scope);
    const p = selectedScope.split ? `&p=${encodeURIComponent(selectedScope.playerCount)}` : "";
    const path = `/api/mkcentral-player?playerId=${encodeURIComponent(playerId)}&season=${encodeURIComponent(selectedScope.season)}${p}&t=${Date.now()}`;
    return fetchMkcentralApi(path, "/api/mkcentral-player");
  }

  async function fetchMkcentralTable(tableId){
    const path = `/api/mkcentral-table?tableId=${encodeURIComponent(tableId)}&t=${Date.now()}`;
    return fetchMkcentralApi(path, "/api/mkcentral-table");
  }

  async function enrichEventsWithTableDetails(events, playerId, playerName){
    const nextEvents = Array.isArray(events) ? events.slice() : [];
    const targets = nextEvents.filter((event) => {
      const tableId = String(event?.id || "").trim();
      if(!tableId) return false;
      return finiteNumber(event.table_rank) == null
        || finiteNumber(event.table_score) == null
        || finiteNumber(event.mmr_before) == null
        || !cleanText(event.table_player_name)
        || isSuspiciousGroupLabel(event.format)
        || isSuspiciousGroupLabel(event.tier);
    });

    if(!targets.length){
      return { events: nextEvents, enriched: 0, failed: 0 };
    }

    let enriched = 0;
    let failed = 0;
    const batchSize = 4;

    for(let index = 0; index < targets.length; index += batchSize){
      const batch = targets.slice(index, index + batchSize);
      const rangeStart = index + 1;
      const rangeEnd = index + batch.length;
      setStatus(`Updating MKCentral table details ${rangeStart}-${rangeEnd} / ${targets.length}...`, true);

      const results = await Promise.all(batch.map(async (event) => {
        try{
          const fetched = await fetchMkcentralTable(event.id);
          const parsed = parseTablePage(fetched.html, event.id, playerId, playerName);
          return { ok: true, eventId: String(event.id), parsed };
        }catch(error){
          return { ok: false, eventId: String(event.id), error };
        }
      }));

      results.forEach((result) => {
        const eventIndex = nextEvents.findIndex((event) => String(event?.id || "") === result.eventId);
        if(eventIndex < 0) return;
        if(result.ok){
          const parsed = result.parsed || {};
          nextEvents[eventIndex] = {
            ...nextEvents[eventIndex],
            ...parsed,
            format: normalizeGroupLabel(parsed.format || nextEvents[eventIndex].format, "format"),
            tier: normalizeGroupLabel(parsed.tier || nextEvents[eventIndex].tier, "tier"),
          };
          if(finiteNumber(parsed.table_rank) != null || finiteNumber(parsed.table_score) != null) enriched += 1;
        }else{
          failed += 1;
        }
      });
    }

    return { events: nextEvents, enriched, failed };
  }

  function getStoredPayload(playerId, scope = activeScope){
    const selectedScope = normalizeScope(scope);
    return readJson(dataKey(playerId, selectedScope), {
      playerId,
      season: selectedScope.season,
      playerCount: selectedScope.playerCount,
      split: selectedScope.split,
      scopeLabel: scopeLabel(selectedScope),
      playerName: "",
      profile: {},
      summary: {},
      events: [],
      updated_at: "",
      source_url: "",
    });
  }

  function getStatEvents(events){
    return (events || [])
      .map(normalizeEventNumbers)
      .filter((event) => !/^placement$/i.test(String(event.event || "")))
      .filter((event) => parsedNumber(event.mmr_delta) != null);
  }

  function sum(values){
    return values.reduce((acc, value) => acc + Number(value || 0), 0);
  }

  function avgScore(events){
    const scores = (events || []).map((event) => finiteNumber(event.table_score)).filter((score) => score != null);
    return scores.length ? sum(scores) / scores.length : null;
  }

  function winrateStats(events){
    const deltas = (events || []).map((event) => finiteNumber(event.mmr_delta)).filter((delta) => delta != null);
    const wins = deltas.filter((v) => v > 0).length;
    const losses = deltas.filter((v) => v < 0).length;
    const neutral = deltas.filter((v) => v === 0).length;
    return {
      count: deltas.length,
      wins,
      losses,
      neutral,
      winrate: (wins + losses) ? wins / (wins + losses) * 100 : null,
    };
  }

  function calcDerived(events, profile, summary){
    const statEvents = getStatEvents(events);
    const deltas = statEvents.map((event) => Number(event.mmr_delta));
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
    const last30 = statEvents.slice(-30);
    const last50 = statEvents.slice(-50);
    const last50Mmr = last50.map((event) => Number(event.mmr_after)).filter(Number.isFinite);
    const allWinrate = winrateStats(statEvents);
    const last10Winrate = winrateStats(last10);
    const last30Winrate = winrateStats(last30);
    const bestEvent = statEvents.slice().sort((a, b) => Number(b.mmr_delta) - Number(a.mmr_delta))[0] || null;
    const worstEvent = statEvents.slice().sort((a, b) => Number(a.mmr_delta) - Number(b.mmr_delta))[0] || null;
    const scoreEvents = statEvents.filter((event) => finiteNumber(event.table_score) != null);
    const highestScoreEvent = scoreEvents.slice().sort((a, b) => finiteNumber(b.table_score) - finiteNumber(a.table_score))[0] || null;
    const lowestScoreEvent = scoreEvents.slice().sort((a, b) => finiteNumber(a.table_score) - finiteNumber(b.table_score))[0] || null;

    return {
      eventCount: statEvents.length,
      currentMmr,
      peakMmr,
      startMmr,
      totalGain: total,
      avgGain: statEvents.length ? total / statEvents.length : null,
      avgGainLast10: last10.length ? sum(last10.map((event) => event.mmr_delta)) / last10.length : null,
      avgGainLast30: last30.length ? sum(last30.map((event) => event.mmr_delta)) / last30.length : null,
      winrate: allWinrate.winrate,
      wins: allWinrate.wins,
      losses: allWinrate.losses,
      neutral: allWinrate.neutral,
      winrateAll: allWinrate,
      winrateLast10: last10Winrate,
      winrateLast30: last30Winrate,
      last10Gain: sum(last10.map((event) => event.mmr_delta)),
      last10Count: last10.length,
      last30Count: last30.length,
      last50MmrAvg: last50Mmr.length ? sum(last50Mmr) / last50Mmr.length : null,
      last50Count: last50.length,
      seasonMinutes: statEvents.length * AVG_MOGI_MINUTES,
      bestEvent,
      worstEvent,
      highestScoreEvent,
      lowestScoreEvent,
      officialEvents: parseNumber(summary?.["Events Played"]),
      officialAvgScore: parseNumber(summary?.["Average Score"]) ?? avgScore(statEvents),
      officialAvgScoreNoSq: parseNumber(summary?.["Average Score (No SQ)"]),
      officialAvgLast10: parseNumber(summary?.["Average Score (Last 10)"]) ?? avgScore(last10),
      avgScoreLast30: avgScore(last30),
      avgScoreCounts: {
        all: statEvents.filter((event) => finiteNumber(event.table_score) != null).length,
        last10: last10.filter((event) => finiteNumber(event.table_score) != null).length,
        last30: last30.filter((event) => finiteNumber(event.table_score) != null).length,
      },
      officialWinRateText: summary?.["Win Rate"] || "",
    };
  }

  function groupedRows(events, key){
    const map = new Map();
    getStatEvents(events).forEach((event) => {
      const label = eventGroupLabel(event, key);
      const row = map.get(label) || { label, count: 0, total: 0, wins: 0, losses: 0 };
      const delta = parsedNumber(event.mmr_delta);
      if(delta == null) return;
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
    })).sort((a, b) => {
      if(key === "format"){
        const order = ["FFA", "2V2", "3V3", "4V4", "OTHER"];
        const ai = order.indexOf(String(a.label).toUpperCase());
        const bi = order.indexOf(String(b.label).toUpperCase());
        const av = ai === -1 ? order.length : ai;
        const bv = bi === -1 ? order.length : bi;
        return av - bv || b.count - a.count || b.avg - a.avg || a.label.localeCompare(b.label);
      }
      if(key === "tier"){
        const order = ["X", "S", "A", "AB", "B", "BC", "C", "CD", "D", "DE", "E", "F", "OTHER"];
        const ai = order.indexOf(String(a.label).toUpperCase());
        const bi = order.indexOf(String(b.label).toUpperCase());
        const av = ai === -1 ? order.length : ai;
        const bv = bi === -1 ? order.length : bi;
        return av - bv || a.label.localeCompare(b.label, "en", { numeric: true }) || b.count - a.count || b.avg - a.avg;
      }
      return b.count - a.count || b.avg - a.avg || a.label.localeCompare(b.label);
    });
  }

  function card(label, value, meta = "", cls = "", cardCls = "", style = ""){
    return `<div class="mkcStat ${cardCls}"${style ? ` style="${style}"` : ""}>
      <div class="mkcStatLabel">${escapeHtml(label)}</div>
      <div class="mkcStatValue ${cls}">${escapeHtml(value)}</div>
      <div class="mkcStatMeta">${escapeHtml(meta)}</div>
    </div>`;
  }

  function rankCard(label, mmrValue, meta = "", extraClass = ""){
    const rank = getMkworldRank(mmrValue);
    const displayValue = (mmrValue == null || mmrValue === "") ? "-" : fmtNumber(mmrValue);
    if(!rank) return card(label, displayValue, meta, "", extraClass);
    const style = `--rank-color:${rank.color};--rank-bg:${rank.bg};`;
    return `<div class="mkcStat mkcStatRanked ${extraClass}" style="${style}">
      <div class="mkcStatTop">
        <div class="mkcStatLabel">${escapeHtml(label)}</div>
        <div class="mkcRankBadge">${escapeHtml(rank.name)}</div>
      </div>
      <div class="mkcStatValue">${escapeHtml(displayValue)}</div>
      <div class="mkcStatMeta">${escapeHtml(meta)}</div>
    </div>`;
  }

  function mobileOverviewCard(derived){
    const rankTone = (value) => {
      const rank = getMkworldRank(value);
      return rank ? ` style="--rank-color:${rank.color};--rank-bg:${rank.bg};"` : "";
    };
    const mmrCell = (label, value, meta = "") => `
      <div class="mkcOverviewMmrCell"${rankTone(value)}>
        <div class="mkcOverviewMmrLabel">${escapeHtml(label)}</div>
        <div class="mkcOverviewMmrValue">${escapeHtml(value == null ? "-" : fmtNumber(value))}</div>
        <div class="mkcOverviewMmrMeta">${escapeHtml(meta || rankName(value) || "-")}</div>
      </div>`;
    const metric = (label, value, meta = "", valueCls = "") => `
      <div class="mkcOverviewMetric">
        <div class="mkcOverviewMetricLabel">${escapeHtml(label)}</div>
        <div class="mkcOverviewMetricValue ${escapeHtml(valueCls)}">${escapeHtml(value)}</div>
        <div class="mkcOverviewMetricMeta">${escapeHtml(meta)}</div>
      </div>`;
    return `<div class="mkcMobileOverview card">
      <div class="mkcOverviewHead">
        <div class="mkcOverviewTitle">Lounge Summary</div>
        <div class="mkcOverviewSubtitle">${escapeHtml(scopeLabel(activeScope))}</div>
      </div>
      <div class="mkcOverviewMmr">
        ${mmrCell("Current", derived.currentMmr, `Start ${fmtNumber(derived.startMmr)}`)}
        ${mmrCell("Peak", derived.peakMmr, "Peak MMR")}
        ${mmrCell("Last 50", derived.last50MmrAvg, `${derived.last50Count} events avg`)}
      </div>
      <div class="mkcOverviewMetrics">
        ${metric("Events", fmtNumber(derived.eventCount), derived.officialEvents ? `Official ${fmtNumber(derived.officialEvents)}` : "Local synced")}
        ${metric("Season Hours", fmtDurationMinutes(derived.seasonMinutes), `${derived.eventCount} mogis x ${AVG_MOGI_MINUTES}m`)}
        ${metric("Avg Gain", derived.avgGain == null ? "-" : fmtSigned(derived.avgGain), `${derived.eventCount} events | all`, gainClass(derived.avgGain))}
        ${metric("Total Gain", fmtDelta(derived.totalGain), "Merged local history", gainClass(derived.totalGain))}
        ${metric("Winrate", derived.winrate == null ? "-" : fmtPct(derived.winrate), `${derived.wins} W / ${derived.losses} L / ${derived.neutral} even`)}
        ${metric("Avg Score", derived.officialAvgScore == null ? "-" : fmtNumber(derived.officialAvgScore, 1), derived.avgScoreCounts.all ? `${derived.avgScoreCounts.all} scored events` : "Official MKCentral")}
      </div>
      <div class="mkcOverviewMetrics mkcOverviewMetricsTight">
        ${metric("Best Gain", fmtDelta(derived.bestEvent?.mmr_delta), derived.bestEvent?.event || "-", gainClass(derived.bestEvent?.mmr_delta))}
        ${metric("Worst Gain", fmtDelta(derived.worstEvent?.mmr_delta), derived.worstEvent?.event || "-", gainClass(derived.worstEvent?.mmr_delta))}
        ${metric("High pts", scoreValue(derived.highestScoreEvent), derived.highestScoreEvent?.event || "-")}
        ${metric("Low pts", scoreValue(derived.lowestScoreEvent), derived.lowestScoreEvent?.event || "-")}
      </div>
    </div>`;
  }

  function eventComboCard(bestEvent, worstEvent, highestScoreEvent, lowestScoreEvent){
    const row = (label, event) => {
      const delta = event ? fmtDelta(event.mmr_delta) : "-";
      return `<div class="mkcEventComboRow">
        <div class="mkcEventComboValue ${gainClass(event?.mmr_delta)}">${escapeHtml(delta)}</div>
        <div class="mkcEventComboMeta">
          <span class="mkcEventComboTag">${escapeHtml(label)}</span>
          ${escapeHtml(event?.event || "-")}
        </div>
      </div>`;
    };
    const point = (label, event) => {
      const score = finiteNumber(event?.table_score);
      const title = event?.event ? ` title="${escapeHtml(event.event)}"` : "";
      return `<span class="mkcEventPoint"${title}><span>${escapeHtml(label)}</span><b>${escapeHtml(score == null ? "-" : fmtNumber(score))}</b></span>`;
    };
    return `<div class="mkcStat mkcEventCombo mkcStatCompactMobile mkcStatDesktopOnly">
      <div class="mkcStatLabel">Best / Worst Gain</div>
      <div class="mkcEventComboRows">
        ${row("Best", bestEvent)}
        ${row("Worst", worstEvent)}
      </div>
      <div class="mkcEventPointsMini">
        ${point("High pts", highestScoreEvent)}
        ${point("Low pts", lowestScoreEvent)}
      </div>
    </div>`;
  }

  function activityCard(derived){
    const officialText = derived.officialEvents ? `Official: ${fmtNumber(derived.officialEvents)}` : "Local synced";
    return `<div class="mkcStat mkcEventCombo mkcStatCompactMobile mkcStatDesktopOnly">
      <div class="mkcStatLabel">Events / Season Hours</div>
      <div class="mkcEventComboRows">
        <div class="mkcEventComboRow">
          <div class="mkcEventComboValue">${escapeHtml(fmtNumber(derived.eventCount))}</div>
          <div class="mkcEventComboMeta">
            <span class="mkcEventComboTag">Events</span>
            ${escapeHtml(officialText)}
          </div>
        </div>
        <div class="mkcEventComboRow">
          <div class="mkcEventComboValue">${escapeHtml(fmtDurationMinutes(derived.seasonMinutes))}</div>
          <div class="mkcEventComboMeta">
            <span class="mkcEventComboTag">Season Hours</span>
            ${escapeHtml(`${derived.eventCount} mogis x ${AVG_MOGI_MINUTES}m`)}
          </div>
        </div>
      </div>
    </div>`;
  }

  function avgScoreCard(derived){
    const options = [
      {
        key: "all",
        label: "All",
        value: derived.officialAvgScore,
        meta: derived.avgScoreCounts.all ? `${derived.avgScoreCounts.all} events` : "Official MKCentral",
      },
      {
        key: "l10",
        label: "Last 10",
        value: derived.officialAvgLast10,
        meta: derived.avgScoreCounts.last10 ? `${derived.avgScoreCounts.last10} events` : "Last 10",
      },
      {
        key: "l30",
        label: "Last 30",
        value: derived.avgScoreLast30,
        meta: derived.avgScoreCounts.last30 ? `${derived.avgScoreCounts.last30} events` : "Last 30",
      },
    ];
    const first = options[0];
    const buttons = options.map((option, index) => {
      const valueText = option.value == null ? "-" : fmtNumber(option.value, 1);
      return `<button class="mkcScoreTab${index === 0 ? " active" : ""}" type="button" data-value="${escapeHtml(valueText)}" data-meta="${escapeHtml(option.meta)}">${escapeHtml(option.label)}</button>`;
    }).join("");
    return `<div class="mkcStat mkcScoreStat mkcStatCompactMobile mkcStatDesktopOnly">
      <div class="mkcStatTop">
        <div class="mkcStatLabel">Avg Score</div>
        <div class="mkcScoreTabs">${buttons}</div>
      </div>
      <div class="mkcStatValue mkcScoreValue">${escapeHtml(first.value == null ? "-" : fmtNumber(first.value, 1))}</div>
      <div class="mkcStatMeta mkcScoreMeta">${escapeHtml(first.meta)}</div>
    </div>`;
  }

  function avgGainCard(derived){
    const options = [
      {
        label: "All",
        value: derived.avgGain,
        format: "signed",
        meta: `${derived.eventCount} events | per event`,
      },
      {
        label: "L10",
        value: derived.avgGainLast10,
        format: "signed",
        meta: `${derived.last10Count} events | per event`,
      },
      {
        label: "L30",
        value: derived.avgGainLast30,
        format: "signed",
        meta: `${derived.last30Count} events | per event`,
      },
      {
        label: "Total",
        value: derived.totalGain,
        format: "delta",
        meta: "Merged local history",
      },
    ];
    const first = options[0];
    const formatGainValue = (option) => option.value == null ? "-" : (option.format === "delta" ? fmtDelta(option.value) : fmtSigned(option.value));
    const firstValue = formatGainValue(first);
    const buttons = options.map((option, index) => {
      const valueText = formatGainValue(option);
      return `<button class="mkcScoreTab${index === 0 ? " active" : ""}" type="button" data-value="${escapeHtml(valueText)}" data-meta="${escapeHtml(option.meta)}" data-value-class="${escapeHtml(gainClass(option.value))}">${escapeHtml(option.label)}</button>`;
    }).join("");
    return `<div class="mkcStat mkcScoreStat mkcStatCompactMobile mkcStatDesktopOnly">
      <div class="mkcStatTop">
        <div class="mkcStatLabel">Avg Gain</div>
        <div class="mkcScoreTabs">${buttons}</div>
      </div>
      <div class="mkcStatValue mkcScoreValue ${gainClass(first.value)}">${escapeHtml(firstValue)}</div>
      <div class="mkcStatMeta mkcScoreMeta">${escapeHtml(first.meta)}</div>
    </div>`;
  }

  function winrateCard(derived){
    const meta = (stats) => `${stats.wins} W / ${stats.losses} L / ${stats.neutral} even`;
    const options = [
      { label: "All", value: derived.winrateAll?.winrate, meta: meta(derived.winrateAll) },
      { label: "L10", value: derived.winrateLast10?.winrate, meta: meta(derived.winrateLast10) },
      { label: "L30", value: derived.winrateLast30?.winrate, meta: meta(derived.winrateLast30) },
    ];
    const first = options[0];
    const buttons = options.map((option, index) => {
      const valueText = option.value == null ? "-" : fmtPct(option.value);
      return `<button class="mkcScoreTab${index === 0 ? " active" : ""}" type="button" data-value="${escapeHtml(valueText)}" data-meta="${escapeHtml(option.meta)}">${escapeHtml(option.label)}</button>`;
    }).join("");
    return `<div class="mkcStat mkcScoreStat mkcStatCompactMobile mkcStatDesktopOnly">
      <div class="mkcStatTop">
        <div class="mkcStatLabel">Winrate</div>
        <div class="mkcScoreTabs">${buttons}</div>
      </div>
      <div class="mkcStatValue mkcScoreValue">${escapeHtml(first.value == null ? "-" : fmtPct(first.value))}</div>
      <div class="mkcStatMeta mkcScoreMeta">${escapeHtml(first.meta)}</div>
    </div>`;
  }

  function bindScoreTabs(){
    document.querySelectorAll(".mkcScoreTab").forEach((button) => {
      button.addEventListener("click", () => {
        const cardEl = button.closest(".mkcScoreStat");
        if(!cardEl) return;
        cardEl.querySelectorAll(".mkcScoreTab").forEach((tab) => tab.classList.toggle("active", tab === button));
        const valueEl = cardEl.querySelector(".mkcScoreValue");
        const metaEl = cardEl.querySelector(".mkcScoreMeta");
        if(valueEl){
          valueEl.textContent = button.dataset.value || "-";
          valueEl.className = `mkcStatValue mkcScoreValue ${button.dataset.valueClass || ""}`.trim();
        }
        if(metaEl) metaEl.textContent = button.dataset.meta || "";
      });
    });
  }

  function renderCards(payload){
    const cards = $("mkcCards");
    if(!cards) return;
    const derived = calcDerived(payload.events || [], payload.profile || {}, payload.summary || {});
    cards.innerHTML = [
      mobileOverviewCard(derived),
      rankCard("Current MMR", derived.currentMmr, `Start est. ${fmtNumber(derived.startMmr)}`, "mkcStatMmrTop mkcStatDesktopOnly"),
      rankCard("Peak MMR", derived.peakMmr, "Official if available", "mkcStatMmrTop mkcStatDesktopOnly"),
      rankCard("Avg Last 50", derived.last50MmrAvg, `${derived.last50Count} events | average MMR`, "mkcStatMmrTop mkcStatDesktopOnly"),
      activityCard(derived),
      avgGainCard(derived),
      winrateCard(derived),
      eventComboCard(derived.bestEvent, derived.worstEvent, derived.highestScoreEvent, derived.lowestScoreEvent),
      avgScoreCard(derived),
    ].join("");
    bindScoreTabs();
  }

  function setMkcReportEnabled(enabled){
    const btn = $("btnDownloadMkcImage");
    if(btn) btn.disabled = !enabled;
  }

  function rankName(value){
    return getMkworldRank(value)?.name || "";
  }

  function scoreValue(event){
    const score = finiteNumber(event?.table_score);
    return score == null ? "-" : fmtNumber(score);
  }

  function buildMkcReportItems(payload){
    const derived = calcDerived(payload.events || [], payload.profile || {}, payload.summary || {});
    const positiveColor = cssVar("--chart-positive-stroke", "#4da319");
    const negativeColor = cssVar("--chart-negative-stroke", "#ff5050");
    return [
      { label: "Current MMR", value: fmtNumber(derived.currentMmr), meta: rankName(derived.currentMmr) },
      { label: "Peak MMR", value: fmtNumber(derived.peakMmr), meta: rankName(derived.peakMmr) },
      { label: "Avg Last 50", value: fmtNumber(derived.last50MmrAvg), meta: `${derived.last50Count} events | ${rankName(derived.last50MmrAvg)}` },
      { label: "Events", value: fmtNumber(derived.eventCount), meta: `${fmtDurationMinutes(derived.seasonMinutes)} season` },
      { label: "Avg Gain", value: fmtSigned(derived.avgGain, 2), meta: "per event", color: derived.avgGain >= 0 ? positiveColor : negativeColor },
      { label: "Winrate", value: fmtPct(derived.winrate), meta: `${derived.wins} W / ${derived.losses} L` },
      { label: "Avg Score", value: fmtNumber(derived.officialAvgScore, 1), meta: "official MKCentral" },
      { label: "Best Gain", value: fmtDelta(derived.bestEvent?.mmr_delta), meta: derived.bestEvent?.event || "", color: positiveColor },
      { label: "Worst Gain", value: fmtDelta(derived.worstEvent?.mmr_delta), meta: derived.worstEvent?.event || "", color: negativeColor },
      { label: "High pts", value: scoreValue(derived.highestScoreEvent), meta: derived.highestScoreEvent?.event || "" },
      { label: "Low pts", value: scoreValue(derived.lowestScoreEvent), meta: derived.lowestScoreEvent?.event || "" },
    ];
  }

  async function downloadMkcReport(){
    const payload = lastRenderedPayload;
    if(!payload || !Array.isArray(payload.events) || !payload.events.length) return;
    const btn = $("btnDownloadMkcImage");
    const previous = btn?.textContent || "Download image";
    try{
      if(!window.MKWTReport?.downloadImage) throw new Error("Report exporter unavailable.");
      if(btn){
        btn.disabled = true;
        btn.textContent = "Preparing...";
      }
      await window.MKWTReport.downloadImage({
        title: "MKWT Lounge Stats",
        subtitle: `${payload.playerName || "MKCentral Player"} | ${scopeLabel(activeScope)} | ${payload.events.length} events`,
        filename: `mkwt-lounge-stats-${scopeStorageSuffix(activeScope)}-${new Date().toISOString().slice(0,10)}.jpg`,
        stats: buildMkcReportItems(payload),
        charts: [
          { title: "MMR History", canvasId: "chartMkcMmr" },
          { title: "Weekly Average MMR", canvasId: "chartMkcWeeklyMmr" },
          { title: "Daily Play Time", canvasId: "chartMkcDelta" },
        ],
        width: 2500,
        columns: 3,
        chartHeight: 500,
        quality: 0.86,
      });
      setStatus("Image report downloaded.", true);
    }catch(e){
      setStatus("Image export failed: " + (e?.message || e), false);
    }finally{
      if(btn){
        btn.textContent = previous;
        btn.disabled = !(lastRenderedPayload?.events || []).length;
      }
    }
  }

  function bindMkcReport(){
    $("btnDownloadMkcImage")?.addEventListener("click", downloadMkcReport);
    setMkcReportEnabled(false);
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

  function clearCharts(){
    chartDelta?.destroy();
    chartMmr?.destroy();
    chartWeeklyMmr?.destroy();
    chartDelta = null;
    chartMmr = null;
    chartWeeklyMmr = null;
    ["chartMkcDelta", "chartMkcMmr", "chartMkcWeeklyMmr"].forEach((id) => {
      const canvas = $(id);
      const ctx = canvas?.getContext?.("2d");
      if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    const chartMeta = $("mkcChartMeta");
    if(chartMeta) chartMeta.textContent = `No synced events for ${scopeLabel(activeScope)}.`;
  }

  function cssVar(name, fallback){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function firstEventDate(events){
    const times = getStatEvents(events)
      .map((event) => new Date(event.created_at || event.table_verified_at || event.table_created_at || "").getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return times.length ? new Date(times[0]) : null;
  }

  function seasonStartDate(events){
    const known = SEASON_START_DATES[normalizeScope(activeScope).season];
    return dateFromKey(known) || firstEventDate(events) || new Date();
  }

  function colorWithAlpha(hex, alpha){
    const source = String(hex || "").trim();
    const rgbMatch = source.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if(rgbMatch){
      return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${alpha})`;
    }
    const raw = source.replace("#", "");
    if(!/^[0-9a-f]{6}$/i.test(raw)) return `rgba(255,255,255,${alpha})`;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function loungeTrackerModeLabel(mode = loungeTrackerChartsState.mode){
    return String(mode) === "24" ? "Lounge 24p" : "Lounge 12p";
  }

  function loungeTrackerPlayerCount(mode = loungeTrackerChartsState.mode){
    return String(mode) === "24" ? 24 : 12;
  }

  function loungeTrackerAllowsIntermission(mode = loungeTrackerChartsState.mode){
    return String(mode) === "24";
  }

  function loungeTrackerAvgThreshold(mode = loungeTrackerChartsState.mode){
    return String(mode) === "24" ? 6 : 6.83;
  }

  function loungeTrackerStorageKey(mode = loungeTrackerChartsState.mode){
    return LOUNGE_TRACKER_STORAGE[String(mode)] || LOUNGE_TRACKER_STORAGE["12"];
  }

  function loungeTrackerRouteLabel(start, end){
    return `${start} -> ${end}`;
  }

  function parseLoungeTrackerRoute(value){
    const match = String(value || "").match(/^\s*(.*?)\s*->\s*(.*?)\s*$/);
    if(!match) return null;
    const start = cleanText(match[1]);
    const end = cleanText(match[2]);
    return start && end ? { start, end } : null;
  }

  function isLoungeTrackerIntermissionRace(race){
    return race?.raceKind === "intermission"
      || race?.race_kind === "intermission"
      || (!!race?.intermissionStart && !!race?.intermissionEnd)
      || (!!race?.intermission_start && !!race?.intermission_end);
  }

  function loungeTrackerRouteParts(race){
    const start = cleanText(race?.intermissionStart || race?.intermission_start || "");
    const end = cleanText(race?.intermissionEnd || race?.intermission_end || "");
    if(start && end) return { start, end };
    return parseLoungeTrackerRoute(race?.track) || { start: "", end: "" };
  }

  async function loadLoungeTrackerIntermissionMeta(){
    if(loungeTrackerChartsState.intermissionMeta) return loungeTrackerChartsState.intermissionMeta;
    try{
      const res = await fetch("strats.json", { cache: "no-cache" });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      loungeTrackerChartsState.intermissionMeta = json?.META?.INTERMISSIONS || {};
    }catch(e){
      console.warn("Lounge Stats intermission meta failed to load:", e);
      loungeTrackerChartsState.intermissionMeta = {};
    }
    return loungeTrackerChartsState.intermissionMeta;
  }

  function loungeTrackerDestinyGroup(start, end){
    const key = start && end ? `${start} -> ${end}` : "";
    const meta = key ? loungeTrackerChartsState.intermissionMeta?.[key] : null;
    const group = cleanText(meta?.destiny_group || "");
    return group || cleanText(end || "");
  }

  function loungeTrackerShouldIncludeRace(race, mode){
    const isIntermission = isLoungeTrackerIntermissionRace(race);
    if(mode === "tracks") return !isIntermission;
    if(mode === "intermission" || mode === "im_destiny" || mode === "im_routes") return isIntermission;
    return true;
  }

  function loungeTrackerPerformanceLabel(race, mode){
    if(mode === "im_destiny"){
      const { start, end } = loungeTrackerRouteParts(race);
      return start && end ? loungeTrackerDestinyGroup(start, end) : cleanText(race?.track || "");
    }
    if(mode === "im_routes"){
      const { start, end } = loungeTrackerRouteParts(race);
      return start && end ? loungeTrackerRouteLabel(start, end) : cleanText(race?.track || "");
    }
    return cleanText(race?.track || "");
  }

  function normalizeLoungeTrackerRace(race, playerCount){
    const route = parseLoungeTrackerRoute(race?.track);
    return {
      id: race?.id || "",
      track: cleanText(race?.track || ""),
      raceKind: cleanText(race?.raceKind || race?.race_kind || (route ? "intermission" : "track")) || "track",
      intermissionStart: cleanText(race?.intermissionStart || race?.intermission_start || route?.start || ""),
      intermissionEnd: cleanText(race?.intermissionEnd || race?.intermission_end || route?.end || ""),
      lobbySize: finiteNumber(race?.lobbySize ?? race?.lobby_size) ?? playerCount,
      placement: finiteNumber(race?.placement),
      points: finiteNumber(race?.points) ?? 0,
      disconnect: !!race?.disconnect,
      created_at: normalizeIsoTime(race?.created_at || ""),
    };
  }

  function normalizeLoungeTrackerSession(session, playerCount){
    const races = Array.isArray(session?.races) ? session.races.map((race) => normalizeLoungeTrackerRace(race, playerCount)) : [];
    return {
      id: session?.id || "",
      created_at: normalizeIsoTime(session?.created_at || ""),
      completed_at: normalizeIsoTime(session?.completed_at || ""),
      updated_at: normalizeIsoTime(session?.updated_at || ""),
      playerCount,
      races,
    };
  }

  function dbLoungeTrackerRaceToLocal(row, playerCount){
    return normalizeLoungeTrackerRace({
      id: row.id,
      track: row.track,
      race_kind: row.race_kind,
      intermission_start: row.intermission_start,
      intermission_end: row.intermission_end,
      lobby_size: row.lobby_size,
      placement: row.placement,
      points: row.points,
      disconnect: row.disconnect,
      created_at: row.created_at,
    }, playerCount);
  }

  function dbLoungeTrackerMogiToLocal(row, races, playerCount){
    return normalizeLoungeTrackerSession({
      id: row.id,
      created_at: row.created_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
      races: (races || []).sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0)).map((race) => dbLoungeTrackerRaceToLocal(race, playerCount)),
    }, playerCount);
  }

  function readStoredLoungeTrackerSessions(mode){
    const playerCount = loungeTrackerPlayerCount(mode);
    const raw = readJson(loungeTrackerStorageKey(mode), []);
    return Array.isArray(raw) ? raw.map((session) => normalizeLoungeTrackerSession(session, playerCount)) : [];
  }

  async function fetchCloudLoungeTrackerSessions(mode){
    const resolved = await resolveSession();
    if(!resolved.client || !resolved.session?.user?.id) return null;
    const uid = resolved.session.user.id;
    const playerCount = loungeTrackerPlayerCount(mode);

    const { data: mogis, error: mogiError } = await resolved.client
      .from("lounge_mogis")
      .select("id, created_at, completed_at, updated_at, status, player_count")
      .eq("user_id", uid)
      .eq("player_count", playerCount)
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    if(mogiError) throw mogiError;
    if(!(mogis || []).length) return [];

    const { data: races, error: raceError } = await resolved.client
      .from("lounge_races")
      .select("id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at")
      .eq("user_id", uid)
      .in("mogi_id", mogis.map((mogi) => mogi.id))
      .order("race_number", { ascending: true });
    if(raceError) throw raceError;

    const racesByMogi = new Map();
    for(const race of races || []){
      if(!racesByMogi.has(race.mogi_id)) racesByMogi.set(race.mogi_id, []);
      racesByMogi.get(race.mogi_id).push(race);
    }

    return (mogis || []).map((mogi) => dbLoungeTrackerMogiToLocal(mogi, racesByMogi.get(mogi.id), playerCount));
  }

  async function loadLoungeTrackerSessions(mode){
    const localSessions = readStoredLoungeTrackerSessions(mode);
    try{
      const cloudSessions = await fetchCloudLoungeTrackerSessions(mode);
      if(Array.isArray(cloudSessions) && cloudSessions.length) return cloudSessions;
    }catch(e){
      console.warn(`Lounge Stats ${loungeTrackerModeLabel(mode)} cloud session load failed:`, e);
    }
    return localSessions;
  }

  function getLoungeTrackerSessions(mode = loungeTrackerChartsState.mode){
    return loungeTrackerChartsState.sessionsByMode[String(mode)] || [];
  }

  function aggregateLoungeTrackerTrackStats(mode = loungeTrackerChartsState.trackMode, loungeMode = loungeTrackerChartsState.mode){
    const bucket = new Map((mode === "tracks" ? LOUNGE_TRACKS : []).map((track) => [track, []]));
    for(const session of getLoungeTrackerSessions(loungeMode)){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        if(!loungeTrackerShouldIncludeRace(race, mode)) continue;
        const label = loungeTrackerPerformanceLabel(race, mode);
        if(!label) continue;
        if(!bucket.has(label)) bucket.set(label, []);
        bucket.get(label).push(Number(race.points || 0));
      }
    }
    return Array.from(bucket.keys()).map((track) => {
      const values = bucket.get(track) || [];
      const count = values.length;
      const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);
      return {
        track,
        avg: count ? sum / count : 0,
        count,
      };
    });
  }

  function aggregateLoungeTrackerPlacementStats(mode = loungeTrackerChartsState.placementMode, loungeMode = loungeTrackerChartsState.mode, selectedLabel = loungeTrackerChartsState.placementItem){
    const effectiveMode = loungeTrackerEffectivePlacementMode(mode, loungeMode);
    const maxPlacement = loungeTrackerPlayerCount(loungeMode);
    const counts = Array.from({ length: maxPlacement }, (_, index) => ({ placement: index + 1, count: 0 }));
    for(const session of getLoungeTrackerSessions(loungeMode)){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        if(!loungeTrackerShouldIncludeRace(race, effectiveMode)) continue;
        if(selectedLabel){
          const label = loungeTrackerPlacementRaceLabel(race, effectiveMode, loungeMode);
          if(label !== selectedLabel) continue;
        }
        const placement = Number(race.placement);
        if(Number.isInteger(placement) && placement >= 1 && placement <= maxPlacement){
          counts[placement - 1].count += 1;
        }
      }
    }
    return counts;
  }

  function sortLoungeTrackerTrackStats(stats){
    const rows = stats.slice();
    const mul = loungeTrackerChartsState.trackSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if(loungeTrackerChartsState.trackSortKey === "count"){
        const countDiff = a.count - b.count;
        if(countDiff !== 0) return mul * countDiff;
        const avgDiff = a.avg - b.avg;
        if(avgDiff !== 0) return mul * avgDiff;
        return a.track.localeCompare(b.track, "de");
      }
      const avgDiff = a.avg - b.avg;
      if(avgDiff !== 0) return mul * avgDiff;
      const countDiff = a.count - b.count;
      if(countDiff !== 0) return mul * countDiff;
      return a.track.localeCompare(b.track, "de");
    });
    return rows;
  }

  function loungeTrackerTrackModeLabel(mode = loungeTrackerChartsState.trackMode){
    if(mode === "im_destiny") return "Intermission Destiny";
    if(mode === "im_routes") return "Intermission Separated";
    return "Tracks";
  }

  function loungeTrackerPlacementModeLabel(mode = loungeTrackerChartsState.placementMode){
    if(mode === "tracks") return "Tracks";
    if(mode === "intermission") return "Intermission";
    return "All";
  }

  function loungeTrackerEffectivePlacementMode(mode = loungeTrackerChartsState.placementMode, loungeMode = loungeTrackerChartsState.mode){
    return loungeTrackerAllowsIntermission(loungeMode)
      ? (["all", "tracks", "intermission"].includes(mode) ? mode : "all")
      : "tracks";
  }

  function loungeTrackerPlacementItemType(mode = loungeTrackerChartsState.placementMode, loungeMode = loungeTrackerChartsState.mode){
    return loungeTrackerEffectivePlacementMode(mode, loungeMode) === "intermission" ? "routes" : "tracks";
  }

  function loungeTrackerPlacementItemLabel(type = loungeTrackerPlacementItemType(), value = loungeTrackerChartsState.placementItem){
    const clean = cleanText(value || "");
    if(clean) return clean;
    return type === "routes" ? "All routes" : "All tracks";
  }

  function loungeTrackerPlacementRaceLabel(race, mode = loungeTrackerChartsState.placementMode, loungeMode = loungeTrackerChartsState.mode){
    const effectiveMode = loungeTrackerEffectivePlacementMode(mode, loungeMode);
    if(effectiveMode === "intermission"){
      const { start, end } = loungeTrackerRouteParts(race);
      return start && end ? loungeTrackerRouteLabel(start, end) : cleanText(race?.track || "");
    }
    return cleanText(race?.track || "");
  }

  function collectLoungeTrackerPlacementItems(mode = loungeTrackerChartsState.placementMode, loungeMode = loungeTrackerChartsState.mode){
    const effectiveMode = loungeTrackerEffectivePlacementMode(mode, loungeMode);
    const type = loungeTrackerPlacementItemType(mode, loungeMode);
    const counts = new Map();
    const order = type === "tracks" ? [...LOUNGE_TRACKS] : [];
    for(const session of getLoungeTrackerSessions(loungeMode)){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        if(!loungeTrackerShouldIncludeRace(race, effectiveMode)) continue;
        const label = loungeTrackerPlacementRaceLabel(race, effectiveMode, loungeMode);
        if(!label) continue;
        counts.set(label, (counts.get(label) || 0) + 1);
        if(type === "routes" && !order.includes(label)) order.push(label);
      }
    }
    const labels = order.filter((label) => counts.has(label));
    if(type === "routes"){
      labels.sort((a, b) => a.localeCompare(b, "de"));
    }
    return labels.map((label) => ({ label, count: counts.get(label) || 0 }));
  }

  function destroyLoungeTrackerCharts(){
    loungeTrackerChartsState.trackChart?.destroy();
    loungeTrackerChartsState.placementChart?.destroy();
    loungeTrackerChartsState.trackChart = null;
    loungeTrackerChartsState.placementChart = null;
  }

  function rankChartBorder(value){
    return getMkworldRank(value)?.color || "rgba(255,255,255,.28)";
  }

  function rankChartBackground(value, alpha = 0.72){
    const rank = getMkworldRank(value);
    return rank ? colorWithAlpha(rank.color, alpha) : "rgba(255,255,255,.16)";
  }

  function buildDailyPlaySeries(events){
    const countsByDay = new Map();
    getStatEvents(events).forEach((event) => {
      const key = toLocalDateKey(event.created_at);
      if(!key) return;
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });

    const startDate = seasonStartDate(events);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const labels = [];
    const dateKeys = [];
    const mogis = [];
    const minutes = [];

    for(let cursor = new Date(startDate); cursor <= today; cursor.setDate(cursor.getDate() + 1)){
      const day = new Date(cursor);
      const key = toLocalDateKey(day);
      const count = countsByDay.get(key) || 0;
      dateKeys.push(key);
      labels.push(fmtDateShort(day));
      mogis.push(count);
      minutes.push(count * AVG_MOGI_MINUTES);
    }

    return { labels, dateKeys, mogis, minutes };
  }

  function eventMmrBefore(event, after){
    const before = parsedNumber(event.mmr_before);
    if(before != null) return before;
    const delta = parsedNumber(event.mmr_delta);
    return after != null && delta != null ? after - delta : null;
  }

  function buildWeeklyMmrSeries(events){
    const statEvents = getStatEvents(events)
      .map(normalizeEventNumbers)
      .map((event) => ({
        ...event,
        __time: new Date(event.created_at || event.table_verified_at || event.table_created_at || "").getTime(),
      }))
      .filter((event) => Number.isFinite(event.__time))
      .sort((a, b) => a.__time - b.__time || String(a.id).localeCompare(String(b.id)));

    const startDate = seasonStartDate(events) || (statEvents[0] ? new Date(statEvents[0].__time) : new Date());
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstKnown = statEvents.find((event) => {
      const after = parsedNumber(event.mmr_after);
      return after != null || eventMmrBefore(event, after) != null;
    });
    let lastKnownMmr = null;
    if(firstKnown){
      const after = parsedNumber(firstKnown.mmr_after);
      lastKnownMmr = eventMmrBefore(firstKnown, after) ?? after;
    }

    const labels = [];
    const values = [];
    const meta = [];
    const colors = [];
    const borders = [];
    let eventIndex = 0;
    let weekNumber = 1;

    for(let cursor = new Date(startDate); cursor <= today; cursor = addDays(cursor, 7)){
      const weekStart = new Date(cursor);
      const weekEnd = addDays(weekStart, 6);
      weekEnd.setHours(23, 59, 59, 999);
      const visibleEnd = weekEnd > today ? today : weekEnd;

      while(eventIndex < statEvents.length && statEvents[eventIndex].__time < weekStart.getTime()){
        const event = statEvents[eventIndex];
        const delta = parsedNumber(event.mmr_delta);
        let after = parsedNumber(event.mmr_after);
        if(after == null && lastKnownMmr != null && delta != null) after = lastKnownMmr + delta;
        if(after != null) lastKnownMmr = after;
        eventIndex += 1;
      }

      const snapshots = [];
      const weekEvents = [];
      if(lastKnownMmr != null) snapshots.push(lastKnownMmr);

      while(eventIndex < statEvents.length && statEvents[eventIndex].__time <= weekEnd.getTime()){
        const event = statEvents[eventIndex];
        const delta = parsedNumber(event.mmr_delta);
        let after = parsedNumber(event.mmr_after);
        const before = eventMmrBefore(event, after);
        if(!snapshots.length && before != null) snapshots.push(before);
        if(after == null && lastKnownMmr != null && delta != null) after = lastKnownMmr + delta;
        if(after != null){
          snapshots.push(after);
          lastKnownMmr = after;
        }
        weekEvents.push(event);
        eventIndex += 1;
      }

      const paused = weekEvents.length === 0;
      const value = snapshots.length
        ? snapshots.reduce((sum, item) => sum + item, 0) / snapshots.length
        : null;

      labels.push(`W${weekNumber}`);
      values.push(value);
      meta.push({
        week: weekNumber,
        range: `${fmtDateShort(weekStart)}-${fmtDateShort(visibleEnd)}`,
        events: weekEvents.length,
        paused,
      });
      colors.push(value == null ? "rgba(255,255,255,.16)" : rankChartBackground(value, paused ? 0.45 : 0.72));
      borders.push(value == null ? "rgba(255,255,255,.28)" : rankChartBorder(value));
      weekNumber += 1;
    }

    return { labels, values, meta, colors, borders };
  }

  function renderCharts(events){
    if(typeof Chart === "undefined") return;
    const statEvents = getStatEvents(events);
    const dailySeries = buildDailyPlaySeries(events);
    const weeklySeries = buildWeeklyMmrSeries(events);
    const labels = statEvents.map((event, index) => String(index + 1));
    const deltas = statEvents.map((event) => parsedNumber(event.mmr_delta));
    const mmr = statEvents.map((event) => parsedNumber(event.mmr_after));
    const chartMeta = $("mkcChartMeta");
    if(chartMeta) chartMeta.textContent = `Estimated daily play time from ${fmtDateShort(seasonStartDate(events))} to ${fmtDateShort(new Date())}. 1 mogi = ${AVG_MOGI_MINUTES} minutes.`;

    const textColor = cssVar("--text", "#fff");
    const gridColor = cssVar("--border", "rgba(255,255,255,.2)");
    const tooltipTitle = (items) => {
      const event = statEvents[items?.[0]?.dataIndex];
      return event ? `${event.event} (${fmtDate(event.created_at)})` : "";
    };
    const dailyTooltipTitle = (items) => {
      const key = dailySeries.dateKeys[items?.[0]?.dataIndex];
      const date = dateFromKey(key);
      return date ? date.toLocaleDateString("de-DE", {
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }) : "";
    };
    const dailyHours = dailySeries.minutes.map((value) => Number((value / 60).toFixed(2)));
    const mmrColors = mmr.map((value) => rankChartBorder(value));
    const fallbackMmrColor = mmrColors.find(Boolean) || "rgba(255,255,255,.28)";

    chartDelta?.destroy();
    chartDelta = new Chart($("chartMkcDelta"), {
      type: "bar",
      data: {
        labels: dailySeries.labels,
        datasets: [{
          label: "Daily Play Time",
          data: dailyHours,
          backgroundColor: cssVar("--chart-split-a-fill", "rgba(78,124,255,.82)"),
          borderColor: cssVar("--chart-split-a-stroke", "rgb(78,124,255)"),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true }, grid: { color: gridColor } },
          y: {
            ticks: {
              color: textColor,
              callback: (value) => `${value}h`,
            },
            grid: { color: gridColor },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: dailyTooltipTitle,
              label: (ctx) => `Play time: ${fmtDurationMinutes(dailySeries.minutes[ctx.dataIndex])}`,
              afterLabel: (ctx) => `Mogis: ${dailySeries.mogis[ctx.dataIndex]}`,
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
          pointHoverRadius: 4,
          pointBackgroundColor: mmrColors,
          pointBorderColor: mmrColors,
          pointHoverBackgroundColor: mmrColors,
          pointHoverBorderColor: mmrColors,
          borderColor: fallbackMmrColor,
          segment: {
            borderColor: (ctx) => rankChartBorder(ctx.p1?.parsed?.y ?? ctx.p0?.parsed?.y),
          },
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
              afterLabel: (ctx) => {
                const rank = getMkworldRank(ctx.parsed.y);
                return rank ? `Rank: ${rank.name}` : "";
              },
            },
          },
        },
      },
    });

    chartWeeklyMmr?.destroy();
    const weeklyCanvas = $("chartMkcWeeklyMmr");
    if(weeklyCanvas){
      chartWeeklyMmr = new Chart(weeklyCanvas, {
        type: "bar",
        data: {
          labels: weeklySeries.labels,
          datasets: [{
            label: "Weekly Average MMR",
            data: weeklySeries.values,
            backgroundColor: weeklySeries.colors,
            borderColor: weeklySeries.borders,
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: { color: textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
              grid: { color: gridColor },
            },
            y: {
              beginAtZero: false,
              ticks: { color: textColor },
              grid: { color: gridColor },
              title: { display: true, text: "Average MMR", color: textColor },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const item = items?.[0];
                  const meta = weeklySeries.meta[item?.dataIndex];
                  return meta ? `Week ${meta.week} (${meta.range})` : "";
                },
                label: (ctx) => Number.isFinite(ctx.parsed.y)
                  ? `Average MMR: ${fmtNumber(ctx.parsed.y)}`
                  : "Average MMR: -",
                afterLabel: (ctx) => {
                  const meta = weeklySeries.meta[ctx.dataIndex];
                  if(!meta) return "";
                  const rank = getMkworldRank(ctx.parsed.y);
                  const rankLine = rank ? `Rank: ${rank.name}` : "";
                  const eventLine = meta.paused
                    ? "Paused week: carried from previous week"
                    : `Events: ${meta.events}`;
                  return rankLine ? [rankLine, eventLine] : eventLine;
                },
              },
            },
          },
        },
      });
    }
  }

  function updateLoungeTrackerModeButtons(){
    const is24 = loungeTrackerChartsState.mode === "24";
    const effectivePlacementMode = loungeTrackerEffectivePlacementMode();
    const modeValue = $("mkcLoungeModeFilterValue");
    if(modeValue) modeValue.textContent = loungeTrackerModeLabel();
    document.querySelectorAll("[data-mkc-lounge-mode]").forEach((button) => {
      const active = button.getAttribute("data-mkc-lounge-mode") === loungeTrackerChartsState.mode;
      button.classList.toggle("active", active);
    });

    const pager = $("mkcLoungeTrackPager");
    if(pager) pager.hidden = !is24;

    const placementFilterRoot = $("mkcLoungePlacementFilterRoot");
    if(placementFilterRoot) placementFilterRoot.hidden = !is24;

    const trackMeta = $("mkcLoungeTrackModeMeta");
    if(trackMeta) trackMeta.textContent = loungeTrackerTrackModeLabel();

    const placementMeta = $("mkcLoungePlacementMeta");
    if(placementMeta) {
      placementMeta.textContent = effectivePlacementMode === "intermission" ? "Intermission" : effectivePlacementMode === "all" ? "All" : "Tracks";
    }

    document.querySelectorAll("[data-mkc-track-mode]").forEach((button) => {
      const active = button.getAttribute("data-mkc-track-mode") === loungeTrackerChartsState.trackMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const trackSortLabel = loungeTrackerChartsState.trackSortKey === "count" ? "Most played" : "Performance";
    const trackSortArrow = loungeTrackerChartsState.trackSortDir === "desc" ? "v" : "^";
    const trackFilterValue = $("mkcLoungeTrackFilterValue");
    if(trackFilterValue) trackFilterValue.textContent = `${trackSortLabel} ${trackSortArrow}`;
    [
      ["avg", $("optMkcLoungeTrackSortAvg")],
      ["count", $("optMkcLoungeTrackSortCount")],
    ].forEach(([key, button]) => {
      if(!button) return;
      const active = loungeTrackerChartsState.trackSortKey === key;
      button.classList.toggle("active", active);
      const meta = button.querySelector(".mkcTrackerFilterMeta");
      if(meta) meta.textContent = active ? trackSortArrow : "";
    });

    const placementFilterValue = $("mkcLoungePlacementFilterValue");
    if(placementFilterValue) placementFilterValue.textContent = loungeTrackerPlacementModeLabel();
    document.querySelectorAll("[data-mkc-placement-mode]").forEach((button) => {
      const active = button.getAttribute("data-mkc-placement-mode") === loungeTrackerChartsState.placementMode;
      button.classList.toggle("active", active);
    });

    const placementItemFilterValue = $("mkcLoungePlacementItemFilterValue");
    if(placementItemFilterValue) {
      placementItemFilterValue.textContent = loungeTrackerPlacementItemLabel();
    }
    const placementItemFilterRoot = $("mkcLoungePlacementItemFilterRoot");
    if(placementItemFilterRoot) {
      placementItemFilterRoot.hidden = is24 && effectivePlacementMode === "all";
    }
  }

  function closeLoungeTrackerMenus(){
    [
      ["btnMkcLoungeModeFilter", "menuMkcLoungeModeFilter"],
      ["btnMkcLoungeTrackFilter", "menuMkcLoungeTrackFilter"],
      ["btnMkcLoungePlacementFilter", "menuMkcLoungePlacementFilter"],
      ["btnMkcLoungePlacementItemFilter", "menuMkcLoungePlacementItemFilter"],
    ].forEach(([buttonId, menuId]) => {
      const button = $(buttonId);
      const menu = $(menuId);
      if(button) button.setAttribute("aria-expanded", "false");
      if(menu) menu.hidden = true;
    });
  }

  function toggleLoungeTrackerMenu(buttonId, menuId){
    const button = $(buttonId);
    const menu = $(menuId);
    if(!button || !menu) return;
    const nextOpen = menu.hidden;
    closeLoungeTrackerMenus();
    menu.hidden = !nextOpen;
    button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  }

  function renderLoungeTrackerInsight(trackName){
    loungeTrackerChartsState.lastSelectedTrack = trackName || null;
    const el = $("mkcLoungeTrackInsight");
    if(!el) return;
    const stat = loungeTrackerChartsState.lastTrackStats.find((entry) => entry.track === trackName);
    if(!stat){
      el.innerHTML = '<div class="muted">Click on a bar to see AVG points and times played.</div>';
      return;
    }
    el.innerHTML = `
      <div class="mkcTrackerInsightTitle">${escapeHtml(stat.track)}</div>
      <div class="mkcTrackerInsightMeta">${escapeHtml(loungeTrackerTrackModeLabel())} details from saved ${escapeHtml(loungeTrackerModeLabel())} Mogis</div>
      <div class="mkcTrackerInsightGrid">
        <div class="mkcTrackerInsightStat">
          <span class="mkcTrackerInsightLabel">AVG points</span>
          <span class="mkcTrackerInsightValue">${stat.count ? stat.avg.toFixed(2) : "-"}</span>
        </div>
        <div class="mkcTrackerInsightStat">
          <span class="mkcTrackerInsightLabel">Times played</span>
          <span class="mkcTrackerInsightValue">${stat.count}</span>
        </div>
      </div>
    `;
  }

  function renderLoungeTrackerPlacementInsight(message, selectedLabel = ""){
    const el = $("mkcLoungePlacementInsight");
    if(!el) return;
    if(message){
      el.innerHTML = `<div class="muted">${escapeHtml(message)}</div>`;
      return;
    }
    const effectiveMode = loungeTrackerEffectivePlacementMode();
    if(effectiveMode === "all"){
      el.innerHTML = `<div class="muted">${escapeHtml(`All saved races in ${loungeTrackerModeLabel()} Mogis.`)}</div>`;
      return;
    }
    const type = loungeTrackerPlacementItemType();
    const label = selectedLabel
      ? `${selectedLabel} placements in saved ${loungeTrackerModeLabel()} Mogis`
      : `${type === "routes" ? "All intermission routes" : "All tracks"} in saved ${loungeTrackerModeLabel()} Mogis`;
    el.innerHTML = `<div class="muted">${escapeHtml(label)}</div>`;
  }

  function renderLoungeTrackerTrackChart(stats){
    const canvas = $("chartMkcLoungeTrack");
    if(!canvas || typeof Chart === "undefined") return;
    const sortedStats = sortLoungeTrackerTrackStats(stats).slice(0, 30);
    loungeTrackerChartsState.lastTrackStats = sortedStats;
    if(!sortedStats.length){
      loungeTrackerChartsState.trackChart?.destroy();
      loungeTrackerChartsState.trackChart = null;
      renderLoungeTrackerInsight(null);
      const emptyMode = loungeTrackerTrackModeLabel();
      const insight = $("mkcLoungeTrackInsight");
      if(insight){
        insight.innerHTML = `<div class="muted">No saved ${escapeHtml(emptyMode)} data found yet for ${escapeHtml(loungeTrackerModeLabel())}.</div>`;
      }
      return;
    }

    const positiveStroke = cssVar("--chart-positive-stroke", "#4da319");
    const negativeStroke = cssVar("--chart-negative-stroke", "#ff5050");
    const neutralStroke = cssVar("--chart-split-a-stroke", "#4e7cff");
    const positiveFill = colorWithAlpha(positiveStroke, 0.78);
    const negativeFill = colorWithAlpha(negativeStroke, 0.76);
    const neutralFill = colorWithAlpha(neutralStroke, 0.58);
    const threshold = loungeTrackerAvgThreshold();

    const labels = sortedStats.map((row) => row.track);
    const values = sortedStats.map((row) => Number(row.avg.toFixed(2)));
    const fills = sortedStats.map((row) => row.count === 0 ? neutralFill : row.avg >= threshold ? positiveFill : negativeFill);
    const borders = sortedStats.map((row) => row.count === 0 ? neutralStroke : row.avg >= threshold ? positiveStroke : negativeStroke);

    loungeTrackerChartsState.trackChart?.destroy();
    loungeTrackerChartsState.trackChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: `Average points (${loungeTrackerTrackModeLabel()})`,
          data: values,
          backgroundColor: fills,
          borderColor: borders,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            max: 15,
            ticks: { color: cssVar("--text", "#fff") },
            grid: { color: cssVar("--border", "rgba(255,255,255,.18)") },
          },
          y: {
            ticks: { color: cssVar("--text", "#fff"), autoSkip: false },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const row = sortedStats[ctx.dataIndex];
                return [
                  `${loungeTrackerTrackModeLabel()}`,
                  `AVG points: ${Number(row?.avg || 0).toFixed(2)}`,
                  `Played: ${Number(row?.count || 0)}`,
                ];
              },
            },
          },
        },
        onClick: (_, elements) => {
          if(!elements?.length) return;
          const selected = labels[elements[0].index];
          renderLoungeTrackerInsight(selected);
        },
      },
    });
  }

  function loungePlacementFill(placement){
    const place = Number(placement);
    if(place === 1) return "rgba(255,205,70,.74)";
    if(place === 2) return "rgba(210,220,232,.68)";
    if(place === 3) return "rgba(205,128,70,.70)";
    return colorWithAlpha(cssVar("--chart-split-a-stroke", "#4e7cff"), 0.58);
  }

  function loungePlacementBorder(placement){
    const place = Number(placement);
    if(place === 1) return "rgba(255,205,70,1)";
    if(place === 2) return "rgba(230,238,248,.95)";
    if(place === 3) return "rgba(222,145,82,.95)";
    return cssVar("--chart-split-a-stroke", "#4e7cff");
  }

  function renderLoungeTrackerPlacementChart(stats){
    const canvas = $("chartMkcLoungePlacement");
    if(!canvas || typeof Chart === "undefined") return;
    if(!stats.some((row) => Number(row.count || 0) > 0)){
      loungeTrackerChartsState.placementChart?.destroy();
      loungeTrackerChartsState.placementChart = null;
      renderLoungeTrackerPlacementInsight(`No saved placement data found for ${loungeTrackerPlacementItemLabel()} in ${loungeTrackerModeLabel()}.`);
      return;
    }
    renderLoungeTrackerPlacementInsight("", loungeTrackerChartsState.placementItem);
    const labels = stats.map((row) => String(row.placement));
    const values = stats.map((row) => Number(row.count || 0));
    const total = values.reduce((sum, value) => sum + value, 0);

    loungeTrackerChartsState.placementChart?.destroy();
    loungeTrackerChartsState.placementChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Placements",
          data: values,
          backgroundColor: stats.map((row) => loungePlacementFill(row.placement)),
          borderColor: stats.map((row) => loungePlacementBorder(row.placement)),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: "Placement", color: cssVar("--muted", "#aab2c5") },
            ticks: { color: cssVar("--text", "#fff") },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: cssVar("--text", "#fff"), precision: 0 },
            grid: { color: cssVar("--border", "rgba(255,255,255,.18)") },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const count = Number(ctx.parsed.y || 0);
                const chance = total ? ((count / total) * 100).toFixed(1) : "0.0";
                return [
                  `${count} races`,
                  `Chance: ${chance}% (${count} / ${total} tracked races)`,
                ];
              },
            },
          },
        },
      },
    });
  }

  function renderLoungeTrackerSection(){
    updateLoungeTrackerModeButtons();
    const meta = $("mkcLocalTrackerMeta");
    const sessions = getLoungeTrackerSessions();
    const races = sessions.flatMap((session) => session.races || []);
    const nonDcCount = races.filter((race) => !race.disconnect).length;
    if(meta){
      meta.textContent = sessions.length
        ? `${loungeTrackerModeLabel()} from saved tracker Mogis: ${sessions.length} Mogis / ${nonDcCount} non-DC races.`
        : `No saved ${loungeTrackerModeLabel()} tracker Mogis found yet in this browser/account.`;
    }
    if(!sessions.length || !races.length){
      destroyLoungeTrackerCharts();
      renderLoungeTrackerInsight(null);
      renderLoungeTrackerPlacementInsight(`No saved ${loungeTrackerModeLabel()} tracker Mogis found yet in this browser/account.`);
      return;
    }

    const trackStats = aggregateLoungeTrackerTrackStats(loungeTrackerChartsState.trackMode, loungeTrackerChartsState.mode);
    const placementMode = loungeTrackerEffectivePlacementMode(loungeTrackerChartsState.placementMode, loungeTrackerChartsState.mode);
    const placementItems = collectLoungeTrackerPlacementItems(placementMode, loungeTrackerChartsState.mode);
    if(loungeTrackerChartsState.placementItem && !placementItems.some((entry) => entry.label === loungeTrackerChartsState.placementItem)){
      loungeTrackerChartsState.placementItem = "";
    }
    const placementItemFilterValue = $("mkcLoungePlacementItemFilterValue");
    if(placementItemFilterValue){
      placementItemFilterValue.textContent = loungeTrackerPlacementItemLabel(
        loungeTrackerPlacementItemType(placementMode, loungeTrackerChartsState.mode),
        loungeTrackerChartsState.placementItem
      );
    }
    const placementItemMenu = $("menuMkcLoungePlacementItemFilter");
    if(placementItemMenu){
      const allLabel = loungeTrackerPlacementItemType(placementMode, loungeTrackerChartsState.mode) === "routes" ? "All routes" : "All tracks";
      const rows = [
        `<button class="mkcTrackerFilterItem${!loungeTrackerChartsState.placementItem ? " active" : ""}" data-mkc-placement-item="" type="button"><span>${escapeHtml(allLabel)}</span></button>`,
        ...placementItems.map((entry) => `<button class="mkcTrackerFilterItem${loungeTrackerChartsState.placementItem === entry.label ? " active" : ""}" data-mkc-placement-item="${escapeHtml(entry.label)}" type="button"><span>${escapeHtml(entry.label)}</span><span class="mkcTrackerFilterMeta">${entry.count}</span></button>`),
      ];
      placementItemMenu.innerHTML = rows.join("");
      placementItemMenu.querySelectorAll("[data-mkc-placement-item]").forEach((button) => {
        button.addEventListener("click", () => {
          closeLoungeTrackerMenus();
          setLoungeTrackerPlacementItem(button.getAttribute("data-mkc-placement-item"));
        });
      });
    }
    const placementStats = aggregateLoungeTrackerPlacementStats(placementMode, loungeTrackerChartsState.mode, loungeTrackerChartsState.placementItem);
    renderLoungeTrackerTrackChart(trackStats);
    renderLoungeTrackerPlacementChart(placementStats);
    const selectedTrack = loungeTrackerChartsState.lastSelectedTrack;
    if(selectedTrack && trackStats.some((row) => row.track === selectedTrack)) renderLoungeTrackerInsight(selectedTrack);
    else renderLoungeTrackerInsight(null);
  }

  function setLoungeTrackerMode(mode){
    const next = String(mode) === "24" ? "24" : "12";
    loungeTrackerChartsState.mode = next;
    loungeTrackerChartsState.lastSelectedTrack = null;
    loungeTrackerChartsState.placementItem = "";
    if(!loungeTrackerAllowsIntermission(next)){
      loungeTrackerChartsState.trackMode = "tracks";
      loungeTrackerChartsState.placementMode = "all";
    }
    closeLoungeTrackerMenus();
    renderLoungeTrackerSection();
  }

  function setLoungeTrackerTrackMode(mode){
    if(!loungeTrackerAllowsIntermission()) mode = "tracks";
    if(!["tracks", "im_destiny", "im_routes"].includes(mode)) mode = "tracks";
    loungeTrackerChartsState.trackMode = mode;
    loungeTrackerChartsState.lastSelectedTrack = null;
    renderLoungeTrackerSection();
  }

  function setLoungeTrackerTrackSort(key){
    if(loungeTrackerChartsState.trackSortKey === key){
      loungeTrackerChartsState.trackSortDir = loungeTrackerChartsState.trackSortDir === "desc" ? "asc" : "desc";
    }else{
      loungeTrackerChartsState.trackSortKey = key === "count" ? "count" : "avg";
      loungeTrackerChartsState.trackSortDir = "desc";
    }
    renderLoungeTrackerSection();
  }

  function setLoungeTrackerPlacementMode(mode){
    if(!loungeTrackerAllowsIntermission()) mode = "all";
    if(!["all", "tracks", "intermission"].includes(mode)) mode = "all";
    loungeTrackerChartsState.placementMode = mode;
    loungeTrackerChartsState.placementItem = "";
    renderLoungeTrackerSection();
  }

  function setLoungeTrackerPlacementItem(value){
    loungeTrackerChartsState.placementItem = cleanText(value || "");
    renderLoungeTrackerSection();
  }

  function bindLoungeTrackerControls(){
    $("btnMkcLoungeModeFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLoungeTrackerMenu("btnMkcLoungeModeFilter", "menuMkcLoungeModeFilter");
    });
    $("btnMkcLoungeTrackFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLoungeTrackerMenu("btnMkcLoungeTrackFilter", "menuMkcLoungeTrackFilter");
    });
    $("btnMkcLoungePlacementFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLoungeTrackerMenu("btnMkcLoungePlacementFilter", "menuMkcLoungePlacementFilter");
    });
    $("btnMkcLoungePlacementItemFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLoungeTrackerMenu("btnMkcLoungePlacementItemFilter", "menuMkcLoungePlacementItemFilter");
    });
    document.querySelectorAll("[data-mkc-lounge-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        closeLoungeTrackerMenus();
        setLoungeTrackerMode(button.getAttribute("data-mkc-lounge-mode"));
      });
    });
    document.querySelectorAll("[data-mkc-track-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        closeLoungeTrackerMenus();
        setLoungeTrackerTrackSort(button.getAttribute("data-mkc-track-sort"));
      });
    });
    document.querySelectorAll("[data-mkc-track-mode]").forEach((button) => {
      button.addEventListener("click", () => setLoungeTrackerTrackMode(button.getAttribute("data-mkc-track-mode")));
    });
    document.querySelectorAll("[data-mkc-placement-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        closeLoungeTrackerMenus();
        setLoungeTrackerPlacementMode(button.getAttribute("data-mkc-placement-mode"));
      });
    });
    document.addEventListener("click", (event) => {
      const modeRoot = $("mkcLoungeModeFilterRoot");
      const trackRoot = $("mkcLoungeTrackFilterRoot");
      const placementRoot = $("mkcLoungePlacementFilterRoot");
      const placementItemRoot = $("mkcLoungePlacementItemFilterRoot");
      if(modeRoot?.contains(event.target) || trackRoot?.contains(event.target) || placementRoot?.contains(event.target) || placementItemRoot?.contains(event.target)) return;
      closeLoungeTrackerMenus();
    });
  }

  async function loadLoungeTrackerChartData(){
    try{
      await loadLoungeTrackerIntermissionMeta();
      const [sessions12, sessions24] = await Promise.all([
        loadLoungeTrackerSessions("12"),
        loadLoungeTrackerSessions("24"),
      ]);
      loungeTrackerChartsState.sessionsByMode["12"] = sessions12;
      loungeTrackerChartsState.sessionsByMode["24"] = sessions24;
      renderLoungeTrackerSection();
    }catch(e){
      console.warn("Lounge tracker chart data failed to load:", e);
      loungeTrackerChartsState.sessionsByMode["12"] = [];
      loungeTrackerChartsState.sessionsByMode["24"] = [];
      renderLoungeTrackerSection();
    }
  }

  function render(payload){
    setScopeDisplay();
    if(!payload || !Array.isArray(payload.events) || !payload.events.length){
      lastRenderedPayload = payload || null;
      setMkcReportEnabled(false);
      const nameEl = $("mkcPlayerNameDisplay");
      if(nameEl){
        nameEl.textContent = payload?.playerName || "MKCentral Player";
        nameEl.classList.toggle("isEmpty", !payload?.playerName);
      }
      setLastUpdateDisplay(payload?.updated_at || "");
      const emptyText = payload?.updated_at
        ? `Synced ${escapeHtml(scopeLabel(activeScope))}: no MKCentral events found.`
        : `No local Lounge Stats data yet for ${escapeHtml(scopeLabel(activeScope))}. Press Update data and sync this season from MKCentral.`;
      $("mkcCards").innerHTML = `<div class="mkcEmpty">${emptyText}</div>`;
      renderGroupTable("mkcTypeRows", []);
      renderGroupTable("mkcTierRows", []);
      renderEvents([]);
      clearCharts();
      return;
    }
    const nameEl = $("mkcPlayerNameDisplay");
    if(nameEl){
      nameEl.textContent = payload.playerName || "MKCentral Player";
      nameEl.classList.remove("isEmpty");
    }
    lastRenderedPayload = payload;
    setLastUpdateDisplay(payload.updated_at);
    renderCards(payload);
    renderGroupTable("mkcTypeRows", groupedRows(payload.events, "format"));
    renderGroupTable("mkcTierRows", groupedRows(payload.events, "tier"));
    renderEvents(payload.events);
    renderCharts(payload.events);
    setMkcReportEnabled(true);
  }

  async function loadInitialPlayerRef(){
    const localRef = readStorage(SETTINGS_KEY, "");
    const cloudRef = await readCloudPlayerRef();
    const preferredRef = cloudRef || localRef || DEFAULT_PLAYER_REF;
    const normalized = extractPlayerId(preferredRef);
    if(normalized) writeStorage(SETTINGS_KEY, normalized);
    return normalized || preferredRef;
  }

  function renderScopeChoices(options){
    const box = $("mkcScopeChoices");
    if(!box) return;
    const selectedKey = scopeKey(pendingScope);
    box.innerHTML = (options || []).map((option) => {
      const scope = normalizeScope(option);
      const active = scopeKey(scope) === selectedKey;
      return `<button class="mkcScopeChoice${active ? " active" : ""}" type="button" data-scope="${escapeHtml(scopeKey(scope))}">
        <strong>${escapeHtml(scopeLabel(scope))}</strong>
        <span>${scope.split ? `${escapeHtml(scope.playerCount)}p leaderboard` : "combined season page"}</span>
      </button>`;
    }).join("");
    box.querySelectorAll("[data-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-scope");
        const found = (scopeOptionsCache || []).find((option) => scopeKey(option) === key);
        if(found) pendingScope = normalizeScope(found);
        renderScopeChoices(scopeOptionsCache || []);
      });
    });
  }

  async function openUpdateDialog(){
    if(isUpdating) return;
    pendingScope = normalizeScope(activeScope);
    const dialog = $("mkcUpdateDialog");
    const choices = $("mkcScopeChoices");
    if(choices) choices.innerHTML = '<div class="muted">Loading MKCentral seasons...</div>';
    if(dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "open");
    const options = await fetchMkcentralOptions();
    if(!options.some((option) => scopeKey(option) === scopeKey(pendingScope))){
      options.push(pendingScope);
    }
    renderScopeChoices(options);
  }

  function closeUpdateDialog(){
    const dialog = $("mkcUpdateDialog");
    if(dialog?.close) dialog.close();
    else dialog?.removeAttribute("open");
  }

  async function update(scope = activeScope){
    if(isUpdating) return;
    const playerId = String($("mkcPlayerDisplay")?.dataset?.playerId || "").trim();
    if(!playerId){
      setStatus("Set your MKCentral Player ID in Settings first.", false);
      return;
    }
    setUpdateBusy(true);
    writeStorage(SETTINGS_KEY, playerId);
    const previousScopeKey = scopeKey(activeScope);
    writeScope(scope);
    render(previousScopeKey === scopeKey(activeScope) ? getStoredPayload(playerId, activeScope) : null);

    try{
      setStatus(`Updating local Lounge Stats from MKCentral ${scopeLabel(activeScope)}...`, true);
      const fetched = await fetchMkcentral(playerId, activeScope);
      const parsed = parsePlayerPage(fetched.html, activeScope);
      const incomingEvents = parsed.events || [];
      if(!incomingEvents.length){
        const next = {
          playerId,
          season: activeScope.season,
          playerCount: activeScope.playerCount,
          split: activeScope.split,
          scopeLabel: scopeLabel(activeScope),
          playerName: parsed.playerName,
          profile: parsed.profile,
          summary: parsed.summary,
          events: [],
          updated_at: fetched.fetched_at || new Date().toISOString(),
          source_url: fetched.url || "",
        };
        writeJson(dataKey(playerId, activeScope), next);
        render(next);
        setStatus(`No MKCentral events found for ${scopeLabel(activeScope)}. Cleared local cache for this selection.`, true);
        return;
      }
      const current = getStoredPayload(playerId, activeScope);
      const merged = mergeEvents(current.events || [], incomingEvents);
      if(!merged.events.length){
        const next = {
          playerId,
          season: activeScope.season,
          playerCount: activeScope.playerCount,
          split: activeScope.split,
          scopeLabel: scopeLabel(activeScope),
          playerName: parsed.playerName,
          profile: parsed.profile,
          summary: parsed.summary,
          events: [],
          updated_at: fetched.fetched_at || new Date().toISOString(),
          source_url: fetched.url || "",
        };
        writeJson(dataKey(playerId, activeScope), next);
        render(next);
        setStatus(`No MKCentral events found for ${scopeLabel(activeScope)}. Nothing to sync.`, true);
        return;
      }
      const enriched = await enrichEventsWithTableDetails(merged.events, playerId, parsed.playerName);
      const next = {
        playerId,
        season: activeScope.season,
        playerCount: activeScope.playerCount,
        split: activeScope.split,
        scopeLabel: scopeLabel(activeScope),
        playerName: parsed.playerName,
        profile: parsed.profile,
        summary: parsed.summary,
        events: enriched.events.map(normalizeEventNumbers),
        updated_at: fetched.fetched_at || new Date().toISOString(),
        source_url: fetched.url || "",
      };
      writeJson(dataKey(playerId, activeScope), next);
      render(next);
      setStatus(`Synced ${scopeLabel(activeScope)}. Total events: ${enriched.events.length}. New: ${merged.added}. Table details refreshed: ${enriched.enriched}.${enriched.failed ? ` ${enriched.failed} table pages could not be read.` : ""}`, true);
    }catch(e){
      setStatus(e?.message || "Update failed.", false);
      console.error(e);
    }finally{
      setUpdateBusy(false);
    }
  }

  async function init(){
    bindMkcReport();
    bindLoungeTrackerControls();
    activeScope = readScope();
    pendingScope = normalizeScope(activeScope);
    setScopeDisplay();
    const savedRef = await loadInitialPlayerRef();
    const playerId = setPlayerDisplay(savedRef);
    if(playerId) render(getStoredPayload(playerId, activeScope));
    else render(null);
    await loadLoungeTrackerChartData();
    $("btnUpdateMkc")?.addEventListener("click", openUpdateDialog);
    $("btnRunMkcUpdate")?.addEventListener("click", async () => {
      closeUpdateDialog();
      await update(pendingScope);
    });
    $("btnCloseMkcUpdate")?.addEventListener("click", closeUpdateDialog);
    $("btnCancelMkcUpdate")?.addEventListener("click", closeUpdateDialog);
    $("mkcUpdateDialog")?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeUpdateDialog();
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
