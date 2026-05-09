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
  let chartMkcModeCompare = null;
  let supabaseClient = null;
  let SESSION = null;
  let activeScope = { ...DEFAULT_SCOPE };
  let pendingScope = { ...DEFAULT_SCOPE };
  let scopeOptionsCache = null;
  let isUpdating = false;
  let lastRenderedPayload = null;
  let mkcCompareOpen = false;
  let mkcSummaryWindowState = "all";
  let mkcSummaryFilterBound = false;
  let mkcMmrDeckPanel = 0;
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
  const NON_LOUNGE_FORMAT_TAG = "Non-Lounge";
  const LOUNGE_TIER_CODES = ["X", "S", "A", "AB", "B", "BC", "C", "CD", "D", "DE", "E", "F"];
  const LOUNGE_TIER_TAGS = LOUNGE_TIER_CODES.map((code) => `Tier ${code}`);
  const LOUNGE_TIER_ORDER = new Map(LOUNGE_TIER_TAGS.map((tag, index) => [tag, index]));
  const LOUNGE_TRACKER_CHART_MODES = ["tracks", "im_destiny", "im_special_destiny", "im_routes", "placement"];
  const LOUNGE_TRACKER_INTERMISSION_MODES = new Set(["im_destiny", "im_special_destiny", "im_routes"]);
  const loungeTrackerChartsState = {
    mode: "12",
    sessionsByMode: { "12": [], "24": [] },
    trackSortKey: "avg",
    trackSortDir: "desc",
    trackMode: "tracks",
    placementMode: "all",
    placementItem: "",
    tierFilter: "",
    panel: "track",
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

  const MKC_INFO_TEXTS = {
    mkcMmrHistory: {
      title: "MMR History",
      body: "Shows your MMR after each saved MKCentral event."
    },
    mkcWeeklyMmr: {
      title: "Weekly Average MMR",
      body: "Shows your MMR by week, so the trend is easier to read."
    },
    mkcPlayTime: {
      title: "Daily Play Time",
      body: "Estimates how much Lounge time each day represents."
    },
    mkcTrackerCharts: {
      title: "Lounge Tracker Charts",
      body: "Uses your saved Lounge tracker Mogis. Switch between 12p and 24p at the top."
    },
    mkcTrackPerformance: {
      title: "Track Performance",
      body: "Shows where you score best. Use the buttons to switch chart mode and the filter to sort."
    },
    mkcPlacementDistribution: {
      title: "Placement Distribution",
      body: "Shows how often you land in each placement. Filter by tracks, intermissions, or one selected track."
    },
    mkcModeCompare: {
      title: "Compare Stats",
      body: "Compares shared tracks between Lounge and World Wides. When both colored bars are high and even, you are strong and consistent on that track in both modes. If one side is much lower, review that track in that mode and look for what feels different."
    }
  };

  window.MKWT?.bindInfoOverlay?.({
    texts: MKC_INFO_TEXTS,
    titleFallback: "Info"
  });

  function setStatus(message, ok = true){
    const el = $("mkcStatus");
    const text = String(message || "").trim();
    if(window.MKWT?.showToast){
      if(el){
        el.textContent = "";
        el.className = "muted statusLine hidden";
        el.hidden = true;
      }
      window.MKWT.showToast(text, ok);
      return;
    }
    if(!el) return;
    el.hidden = !text;
    el.textContent = text;
    el.className = "muted statusLine " + (text ? (ok ? "ok" : "bad") : "hidden");
  }

  function bindSwipeNavigation(target, { onLeft, onRight, threshold = 56 } = {}){
    if(!target || target.dataset.swipeBound === "1") return;
    target.dataset.swipeBound = "1";
    let startX = 0;
    let startY = 0;
    let tracking = false;
    target.addEventListener("touchstart", (event) => {
      if(event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }, { passive: true });
    target.addEventListener("touchend", (event) => {
      if(!tracking || event.changedTouches.length !== 1) return;
      tracking = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if(Math.abs(dx) < threshold) return;
      if(Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if(dx < 0) onLeft?.();
      else onRight?.();
    }, { passive: true });
    target.addEventListener("touchcancel", () => { tracking = false; }, { passive: true });
  }

  function resizeMkcChart(chart){
    try{ chart?.resize?.(); }catch{}
  }

  function setMkcChartEmpty(canvasId, message = ""){
    const canvas = $(canvasId);
    if(!canvas) return;
    const wrap = canvas.closest(".mkcChartWrap, .mkcChartWrapCompare");
    if(!wrap) return;
    Array.from(wrap.children).forEach((child) => {
      if(child.classList?.contains("mkcChartEmpty")) child.remove();
    });
    let next = wrap.nextElementSibling;
    while(next?.classList?.contains("mkcChartEmpty") && next.dataset.forChart === canvasId){
      const remove = next;
      next = next.nextElementSibling;
      remove.remove();
    }
    const text = cleanText(message || "");
    if(!text){
      try{
        const ctx = canvas.getContext?.("2d");
        if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }catch{}
      canvas.hidden = false;
      wrap.classList.remove("isEmpty");
      return;
    }
    try{
      const ctx = canvas.getContext?.("2d");
      if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }catch{}
    canvas.hidden = false;
    wrap.classList.remove("isEmpty");
    const empty = document.createElement("div");
    empty.className = "mkcChartEmpty";
    empty.dataset.forChart = canvasId;
    empty.setAttribute("role", "status");
    empty.textContent = text;
    wrap.insertAdjacentElement("afterend", empty);
  }

  function renderLoungeTrackerEmptyNotice(targetId, message){
    const el = $(targetId);
    if(!el) return;
    const text = cleanText(message || "");
    if(!text){
      el.classList.remove("mkcTrackerInsight--empty");
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.classList.add("mkcTrackerInsight--empty");
    el.innerHTML = `<div>${escapeHtml(text)}</div>`;
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

  function setLastUpdateDisplay(value, eventCount = null){
    const el = $("mkcLastUpdateDisplay");
    if(!el) return;
    const count = Number(eventCount);
    const hasCount = Number.isFinite(count);
    const mogiText = hasCount ? `${fmtNumber(count)} ${count === 1 ? "mogi" : "mogis"}` : "";
    const dateText = value ? fmtDate(value) : "";
    el.textContent = dateText && mogiText ? `${dateText} · ${mogiText}` : (dateText || mogiText || "-");
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
    let hasAccount = false;
    try{
      const resolved = await resolveSession();
      if(!resolved.session?.user?.id || !resolved.client) return { hasAccount: false, value: "" };
      hasAccount = true;

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
      return { hasAccount: true, value: String(data?.mkcentral_player_id || "").trim() };
    }catch(e){
      console.warn("MKCentral cloud player id load failed:", e);
      return { hasAccount, value: "" };
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

  function normalizeLoungeStatsFormatTag(value){
    const raw = cleanText(value);
    if(!raw) return "";
    return raw.replace(/[\s_-]+/g, "").toLowerCase() === "nonlounge" ? NON_LOUNGE_FORMAT_TAG : raw;
  }

  function normalizeLoungeStatsTierTag(value){
    const raw = cleanText(value);
    if(!raw) return "";
    const code = raw.replace(/^tier\s+/i, "").replace(/[\s_-]+/g, "").toUpperCase();
    if(!code || code === "OTHER" || /^\d{5,}$/.test(code) || !/^[A-Z]{1,3}$/.test(code)) return "";
    return `Tier ${code}`;
  }

  function loungeTrackerSessionTier(session){
    return normalizeLoungeStatsTierTag(session?.loungeTier || session?.lounge_tier || session?.tierTag || session?.tier || "");
  }

  function loungeTrackerSessionStatsExcluded(session){
    const tag = normalizeLoungeStatsFormatTag(session?.loungeFormatTag || session?.lounge_format_tag || "");
    const excluded = session?.statsExcluded === true || session?.stats_excluded === true;
    return tag === NON_LOUNGE_FORMAT_TAG && excluded;
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

  function avgScoreBreakEven(scope = activeScope){
    return normalizeScope(scope).playerCount === "24" ? 72 : 82;
  }

  function avgScoreToneClass(value){
    if(value == null || value === "") return "";
    const score = Number(value);
    if(!Number.isFinite(score)) return "";
    const delta = score - avgScoreBreakEven();
    if(delta <= -12) return "scoreTone--darkred";
    if(delta <= -5) return "scoreTone--red";
    if(delta < -1) return "scoreTone--orange";
    if(Math.abs(delta) <= 1) return "scoreTone--green";
    if(delta < 6) return "scoreTone--blue";
    return "scoreTone--lightblue";
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
      ${meta ? `<div class="mkcStatMeta">${escapeHtml(meta)}</div>` : ""}
    </div>`;
  }

  function rankBadgeGlowClass(rank){
    if(!rank) return "";
    return ["Silver", "Gold", "Platinum", "Sapphire", "Ruby", "Diamond", "Master", "Grandmaster"].includes(rank.name)
      ? " mkcRankBadgeGlow"
      : "";
  }

  function rankCard(label, mmrValue, meta = "", extraClass = ""){
    const rank = getMkworldRank(mmrValue);
    const displayValue = (mmrValue == null || mmrValue === "") ? "-" : fmtNumber(mmrValue);
    if(!rank) return card(label, displayValue, meta, "", extraClass);
    const style = `--rank-color:${rank.color};--rank-bg:${rank.bg};`;
    return `<div class="mkcStat mkcStatRanked ${extraClass}" style="${style}">
      <div class="mkcStatTop">
        <div class="mkcStatLabel">${escapeHtml(label)}</div>
        <div class="mkcRankBadge${rankBadgeGlowClass(rank)}">${escapeHtml(rank.name)}</div>
      </div>
      <div class="mkcStatValue">${escapeHtml(displayValue)}</div>
      ${meta ? `<div class="mkcStatMeta">${escapeHtml(meta)}</div>` : ""}
    </div>`;
  }

  function eventTitle(event){
    if(!event) return "";
    const parts = [];
    const title = cleanText(event.event);
    const tier = cleanText(event.tier);
    const format = cleanText(event.format);
    if(title) parts.push(title);
    [tier, format].forEach((value) => {
      if(value && !parts.some((part) => part.toLowerCase().includes(value.toLowerCase()))) parts.push(value);
    });
    return parts.length ? ` title="${escapeHtml(parts.join(" · "))}"` : "";
  }

  function eventComboCard(bestEvent, worstEvent){
    const row = (label, event) => {
      const deltaValue = parsedNumber(event?.mmr_delta);
      const delta = deltaValue == null ? "-" : fmtNumber(Math.abs(deltaValue));
      return `<div class="mkcEventComboRow mkcEventComboRow--tight"${eventTitle(event)}>
        <div class="mkcEventComboValue ${gainClass(event?.mmr_delta)}">${escapeHtml(delta)}</div>
        <div class="mkcEventComboMeta">
          <span class="mkcEventComboTag">${escapeHtml(label)}</span>
        </div>
      </div>`;
    };
    return `<div class="mkcStat mkcEventCombo mkcStatCompactMobile">
      <div class="mkcStatLabel">Best / Worst Gain</div>
      <div class="mkcGainPair">
        ${row("Best", bestEvent)}
        ${row("Worst", worstEvent)}
      </div>
    </div>`;
  }

  function pointsCard(highestScoreEvent, lowestScoreEvent){
    const point = (label, event) => {
      const score = finiteNumber(event?.table_score);
      return `<div class="mkcMiniStat"${eventTitle(event)}>
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(score == null ? "-" : fmtNumber(score))}</b>
      </div>`;
    };
    return `<div class="mkcStat mkcEventCombo mkcStatCompactMobile">
      <div class="mkcStatLabel">Points</div>
      <div class="mkcMiniValueGrid">
        ${point("High", highestScoreEvent)}
        ${point("Low", lowestScoreEvent)}
      </div>
    </div>`;
  }

  function summaryWindowData(derived){
    const mode = ["all", "l10", "l30"].includes(mkcSummaryWindowState) ? mkcSummaryWindowState : "all";
    const labels = { all: "All", l10: "L10", l30: "L30" };
    const winStats = mode === "l10" ? derived.winrateLast10 : mode === "l30" ? derived.winrateLast30 : derived.winrateAll;
    const scoreCounts = derived.avgScoreCounts || {};
    const count = mode === "l10" ? derived.last10Count : mode === "l30" ? derived.last30Count : derived.eventCount;
    const scoreCount = mode === "l10" ? scoreCounts.last10 : mode === "l30" ? scoreCounts.last30 : scoreCounts.all;
    return {
      mode,
      label: labels[mode],
      count,
      avgGain: mode === "l10" ? derived.avgGainLast10 : mode === "l30" ? derived.avgGainLast30 : derived.avgGain,
      winrate: winStats?.winrate,
      wins: winStats?.wins || 0,
      losses: winStats?.losses || 0,
      neutral: winStats?.neutral || 0,
      avgScore: mode === "l10" ? derived.officialAvgLast10 : mode === "l30" ? derived.avgScoreLast30 : derived.officialAvgScore,
      scoreCount: scoreCount || 0,
    };
  }

  function avgScoreCard(summary){
    const meta = summary.scoreCount ? `${fmtNumber(summary.scoreCount)} events` : summary.label;
    const score = finiteNumber(summary.avgScore);
    const breakEven = avgScoreBreakEven();
    const title = score == null
      ? `Break even: ${fmtNumber(breakEven, 1)} avg score`
      : `Break even: ${fmtNumber(breakEven, 1)} avg score. Current: ${fmtNumber(score, 1)}.`;
    return `<div class="mkcStat mkcScoreStat mkcScoreStat--avgScore mkcStatCompactMobile" data-mkc-break-even="${escapeHtml(breakEven)}" data-mkc-score="${escapeHtml(score == null ? "" : score)}" title="${escapeHtml(title)}" tabindex="0" role="button" aria-label="${escapeHtml(title)}">
      <div class="mkcStatLabel">Avg Score</div>
      <div class="mkcStatValue mkcAvgScoreValue ${escapeHtml(avgScoreToneClass(score))}">${escapeHtml(score == null ? "-" : fmtNumber(score, 1))}</div>
      <div class="mkcStatMeta">${escapeHtml(meta)}</div>
    </div>`;
  }

  function showAvgScoreBreakEvenHint(target){
    const card = target?.closest?.(".mkcScoreStat--avgScore");
    if(!card) return;
    const breakEven = Number(card.dataset.mkcBreakEven);
    const score = Number(card.dataset.mkcScore);
    if(!Number.isFinite(breakEven)) return;
    let text = `Break even: ${fmtNumber(breakEven, 1)} avg score.`;
    if(Number.isFinite(score)){
      const delta = score - breakEven;
      if(Math.abs(delta) <= 0.05) text += " Right on break even.";
      else text += ` ${fmtNumber(Math.abs(delta), 1)} ${delta > 0 ? "over" : "under"} break even.`;
    }
    if(window.MKWT?.showToast) window.MKWT.showToast(text, true, { timeout: 2600 });
    else card.title = text;
  }

  function bindMkcScoreHints(){
    document.addEventListener("click", (event) => {
      if(event.target?.closest?.(".mkcScoreStat--avgScore")) showAvgScoreBreakEvenHint(event.target);
    });
    document.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      if(!event.target?.closest?.(".mkcScoreStat--avgScore")) return;
      event.preventDefault();
      showAvgScoreBreakEvenHint(event.target);
    });
  }

  function avgGainCard(summary){
    return `<div class="mkcStat mkcScoreStat mkcStatCompactMobile">
      <div class="mkcStatLabel">Avg Gain</div>
      <div class="mkcStatValue ${gainClass(summary.avgGain)}">${escapeHtml(summary.avgGain == null ? "-" : fmtSigned(summary.avgGain))}</div>
      <div class="mkcStatMeta">${escapeHtml(`${fmtNumber(summary.count)} events`)}</div>
    </div>`;
  }

  function winrateCard(summary){
    const neutralText = summary.neutral > 0 ? ` / ${summary.neutral} even` : "";
    return `<div class="mkcStat mkcScoreStat mkcStatCompactMobile">
      <div class="mkcStatLabel">Winrate</div>
      <div class="mkcStatValue">${escapeHtml(summary.winrate == null ? "-" : fmtPct(summary.winrate))}</div>
      <div class="mkcStatMeta">${escapeHtml(`${summary.wins} W / ${summary.losses} L${neutralText}`)}</div>
    </div>`;
  }

  function closeMkcSummaryFilter(){
    const menu = $("menuMkcSummaryFilter");
    const btn = $("btnMkcSummaryFilter");
    if(menu) menu.hidden = true;
    if(btn) btn.setAttribute("aria-expanded", "false");
  }

  function updateMkcSummaryFilterUi(hasData = false){
    const labels = { all: "All", l10: "L10", l30: "L30" };
    const root = $("mkcSummaryFilterRoot");
    if(root) root.hidden = !hasData;
    if(!hasData) closeMkcSummaryFilter();
    const valueEl = $("mkcSummaryFilterValue");
    if(valueEl) valueEl.textContent = labels[mkcSummaryWindowState] || "All";
    document.querySelectorAll("[data-mkc-summary-window]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-mkc-summary-window") === mkcSummaryWindowState);
    });
  }

  function bindMkcSummaryFilter(){
    if(mkcSummaryFilterBound) return;
    mkcSummaryFilterBound = true;
    const btn = $("btnMkcSummaryFilter");
    const menu = $("menuMkcSummaryFilter");
    if(btn && menu && window.MKWT_UI?.bindFilterToggle){
      window.MKWT_UI.bindFilterToggle(btn, menu, { type: "mkcTracker" });
    }else{
      btn?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if(!menu) return;
        const willOpen = menu.hidden;
        closeMkcSummaryFilter();
        menu.hidden = !willOpen;
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    }
    $("menuMkcSummaryFilter")?.addEventListener("click", (event) => event.stopPropagation());
    document.querySelectorAll("[data-mkc-summary-window]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-mkc-summary-window") || "all";
        mkcSummaryWindowState = ["all", "l10", "l30"].includes(next) ? next : "all";
        if(window.MKWT_UI?.closeFilterMenus) window.MKWT_UI.closeFilterMenus("mkcTracker");
        else closeMkcSummaryFilter();
        if(lastRenderedPayload?.events?.length) renderCards(lastRenderedPayload);
        else updateMkcSummaryFilterUi(false);
      });
    });
    if(!window.MKWT_UI?.bindFilterToggle){
      document.addEventListener("click", (event) => {
        const root = $("mkcSummaryFilterRoot");
        if(root?.contains(event.target)) return;
        closeMkcSummaryFilter();
      });
      document.addEventListener("keydown", (event) => {
        if(event.key === "Escape") closeMkcSummaryFilter();
      });
    }
  }

  function renderCards(payload){
    const cards = $("mkcCards");
    if(!cards) return;
    const derived = calcDerived(payload.events || [], payload.profile || {}, payload.summary || {});
    const summary = summaryWindowData(derived);
    cards.innerHTML = [
      rankCard("Current", derived.currentMmr, "", "mkcStatMmrTop"),
      rankCard("Peak", derived.peakMmr, "", "mkcStatMmrTop"),
      rankCard("Avg50", derived.last50MmrAvg, "", "mkcStatMmrTop"),
      avgGainCard(summary),
      winrateCard(summary),
      eventComboCard(derived.bestEvent, derived.worstEvent),
      pointsCard(derived.highestScoreEvent, derived.lowestScoreEvent),
      avgScoreCard(summary),
    ].join("");
    updateMkcSummaryFilterUi(true);
  }

  function mkcComparePlayerCount(){
    const scope = normalizeScope(activeScope);
    if(scope.split && (scope.playerCount === "12" || scope.playerCount === "24")) return scope.playerCount;
    return String(loungeTrackerChartsState.mode || "12");
  }

  function updateMkcCompareButton(){
    const btn = $("btnCompareMkcStats");
    if(!btn) return;
    btn.classList.toggle("active", mkcCompareOpen);
  }

  function closeMkcCompareDialog(){
    mkcCompareOpen = false;
    updateMkcCompareButton();
    if($("mkcCompareDialog")?.open) $("mkcCompareDialog").close();
  }

  function setMkcCompareStatus(message){
    const meta = $("mkcCompareMeta");
    const text = String(message || "").trim();
    if(meta){
      meta.textContent = text;
      meta.hidden = !text;
      meta.classList.toggle("hidden", !text);
    }
  }

  function clearMkcCompareChart(message){
    const notes = $("mkcCompareNotes");
    setMkcCompareStatus(message);
    setMkcChartEmpty("chartModeCompareMkc", message || "No comparison data available yet.");
    if(notes){
      notes.innerHTML = "";
      notes.hidden = true;
    }
    try{ chartMkcModeCompare?.destroy(); }catch(e){}
    chartMkcModeCompare = null;
  }

  function renderMkcCompareNotes(compareRows, primaryLabel, secondaryLabel){
    const notesEl = $("mkcCompareNotes");
    if(!notesEl) return;
    notesEl.innerHTML = "";
    const notes = window.MKWTModeCompare?.buildComparisonNotes?.(compareRows, {
      primaryLabel,
      secondaryLabel,
      gapThreshold: 10,
      limit: 6,
    }) || [];
    if(!notes.length){
      const div = document.createElement("div");
      div.className = "mkcModeCompareNote muted";
      div.textContent = "Shared tracks look fairly even right now.";
      notesEl.appendChild(div);
      notesEl.hidden = false;
      return;
    }
    for(const note of notes){
      const div = document.createElement("div");
      div.className = "mkcModeCompareNote";
      const strong = document.createElement("b");
      strong.textContent = `"${note.track}"`;
      div.appendChild(strong);
      div.appendChild(document.createTextNode(` strong in ${note.strongerLabel} but weak in ${note.weakerLabel}.`));
      notesEl.appendChild(div);
    }
    notesEl.hidden = false;
  }

  async function renderMkcCompareChart(){
    const dialog = $("mkcCompareDialog");
    const canvas = $("chartModeCompareMkc");
    const meta = $("mkcCompareMeta");
    if(!canvas || !meta) return;
    if(dialog && !dialog.open){
      try{ dialog.showModal(); }catch(e){ dialog.setAttribute("open", "open"); }
    }
    if(!window.MKWTModeCompare){
      clearMkcCompareChart("Comparison helper unavailable.");
      return;
    }

    const playerCount = mkcComparePlayerCount();
    const loungeLabel = `Lounge ${playerCount}p`;
    setMkcCompareStatus(`Loading ${loungeLabel} comparison...`);
    await resolveSession();
    const authOptions = {
      isGuest: !SESSION?.user?.id || !supabaseClient,
      supabaseClient,
      session: SESSION,
    };
    const [loungeRows, worldRows] = await Promise.all([
      window.MKWTModeCompare.loadLoungeTrackRowsByPlayerCount({
        ...authOptions,
        playerCount: Number(playerCount),
      }),
      window.MKWTModeCompare.loadWorldWideTrackRows(authOptions),
    ]);

    if(!loungeRows?.length){
      clearMkcCompareChart(`No saved ${loungeLabel} track data found yet.`);
      return;
    }
    if(!worldRows?.length){
      clearMkcCompareChart("No saved World Wide track data found yet.");
      return;
    }

    const compareRows = window.MKWTModeCompare.buildRankComparisonRows(loungeRows, worldRows, {
      primaryLabel: loungeLabel,
      secondaryLabel: "World Wides",
      limit: 30,
      minCount: 10,
    });
    if(!compareRows.length){
      clearMkcCompareChart(`No shared tracks yet with at least 10 plays in both ${loungeLabel} and World Wides.`);
      return;
    }

    const labels = compareRows.map((row) => row.track);
    const loungeData = compareRows.map((row) => Number(row.primaryPoints || 0));
    const worldData = compareRows.map((row) => Number(row.secondaryPoints || 0));
    const maxPoints = Math.max(6, compareRows.length * 2);
    const splitAFill = colorWithAlpha(cssVar("--chart-split-a-stroke", "#4e7cff"), 0.68);
    const splitBFill = colorWithAlpha(cssVar("--chart-split-b-stroke", "#f6c945"), 0.66);

    setMkcChartEmpty("chartModeCompareMkc", "");
    try{ chartMkcModeCompare?.destroy(); }catch(e){}
    chartMkcModeCompare = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: loungeLabel,
            data: loungeData,
            backgroundColor: splitAFill,
            borderColor: cssVar("--chart-split-a-stroke", "#4e7cff"),
            borderWidth: 1,
          },
          {
            label: "World Wides",
            data: worldData,
            backgroundColor: splitBFill,
            borderColor: cssVar("--chart-split-b-stroke", "#f6c945"),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        interaction: { mode: "nearest", axis: "y", intersect: true },
        scales: {
          x: {
            min: 0,
            max: maxPoints,
            stacked: true,
            ticks: { callback: (value) => Number(value).toFixed(0) },
          },
          y: { ticks: { autoSkip: false }, stacked: true },
        },
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              title: (items) => items?.[0]?.label || "",
              label: (ctx) => {
                const row = compareRows[ctx.dataIndex];
                if(!row) return "";
                if(ctx.datasetIndex === 0){
                  return `${loungeLabel}: rank #${row.primaryRank}, avg ${fmtNumber(row.primary, 2)} pts, ${row.primaryCount} races`;
                }
                return `World Wides: rank #${row.secondaryRank}, avg ${fmtSigned(row.secondary, 2)} VR, ${row.secondaryCount} matches`;
              },
              footer: (items) => {
                const row = compareRows[items?.[0]?.dataIndex];
                if(!row) return "";
                const stronger = row.pointGap >= 0 ? loungeLabel : "World Wides";
                return `Edge: ${stronger}`;
              },
            },
          },
        },
      },
    });

    renderMkcCompareNotes(compareRows, loungeLabel, "World Wides");
    setMkcCompareStatus("");
  }

  function bindMkcCompare(){
    const dialog = $("mkcCompareDialog");
    if(dialog){
      dialog.onclose = () => {
        mkcCompareOpen = false;
        updateMkcCompareButton();
      };
      dialog.oncancel = () => {
        mkcCompareOpen = false;
        updateMkcCompareButton();
      };
    }
    $("btnCloseMkcCompare")?.addEventListener("click", closeMkcCompareDialog);
    $("btnCompareMkcStats")?.addEventListener("click", async () => {
      if(dialog?.open){
        closeMkcCompareDialog();
        return;
      }
      mkcCompareOpen = true;
      updateMkcCompareButton();
      try{
        await renderMkcCompareChart();
      }catch(err){
        console.error("[mkcentral] compare chart failed", err);
        clearMkcCompareChart("Comparison failed. Please try again.");
      }
    });
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
    setMkcChartEmpty("chartMkcDelta", "No play time data yet. Sync MKCentral events first.");
    setMkcChartEmpty("chartMkcMmr", "No MMR history yet. Sync MKCentral events first.");
    setMkcChartEmpty("chartMkcWeeklyMmr", "No weekly MMR data yet. Sync MKCentral events first.");
    const chartMeta = $("mkcChartMeta");
    if(chartMeta){
      chartMeta.textContent = "";
      chartMeta.classList.add("hidden");
    }
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
    const match = String(value || "").match(/^\s*(.*?)\s*(?:->|→|>)\s*(.*?)\s*$/);
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

  function loungeTrackerRouteKeyCandidates(start, end){
    const s = cleanText(start || "");
    const e = cleanText(end || "");
    return s && e ? [`${s}→${e}`, `${s}>${e}`, `${s} -> ${e}`] : [];
  }

  function loungeTrackerRouteMeta(start, end){
    const meta = loungeTrackerChartsState.intermissionMeta || {};
    for(const key of loungeTrackerRouteKeyCandidates(start, end)){
      if(Object.prototype.hasOwnProperty.call(meta, key)) return meta[key];
    }
    return null;
  }

  function loungeTrackerCleanMetaLabel(value){
    const label = cleanText(value || "");
    const lower = label.toLowerCase();
    return !label || lower === "null" || lower === "undefined" ? "" : label;
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
    const meta = loungeTrackerRouteMeta(start, end);
    const group = loungeTrackerCleanMetaLabel(meta?.destiny_group);
    return group || cleanText(end || "");
  }

  function loungeTrackerSpecialDestinyGroup(start, end){
    const meta = loungeTrackerRouteMeta(start, end);
    if(!meta?.is_special) return "";
    const plainEnd = cleanText(end || "").toLowerCase();
    const group = loungeTrackerCleanMetaLabel(meta.destiny_group);
    const tag = loungeTrackerCleanMetaLabel(meta.special_tag);
    if(group && group.toLowerCase() !== plainEnd) return group;
    if(tag && tag.toLowerCase() !== plainEnd) return tag;
    return start && end ? loungeTrackerRouteLabel(start, end) : group || tag;
  }

  function loungeTrackerShouldIncludeRace(race, mode){
    const isIntermission = isLoungeTrackerIntermissionRace(race);
    if(mode === "tracks") return !isIntermission;
    if(mode === "intermission" || mode === "im_destiny" || mode === "im_special_destiny" || mode === "im_routes") return isIntermission;
    return true;
  }

  function loungeTrackerPerformanceLabel(race, mode){
    if(mode === "im_destiny"){
      const { start, end } = loungeTrackerRouteParts(race);
      return start && end ? loungeTrackerDestinyGroup(start, end) : cleanText(race?.track || "");
    }
    if(mode === "im_special_destiny"){
      const { start, end } = loungeTrackerRouteParts(race);
      return start && end ? loungeTrackerSpecialDestinyGroup(start, end) : "";
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
      loungeFormatTag: normalizeLoungeStatsFormatTag(session?.loungeFormatTag || session?.lounge_format_tag || ""),
      loungeTier: loungeTrackerSessionTier(session),
      statsExcluded: session?.statsExcluded === true || session?.stats_excluded === true,
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
      lounge_format_tag: row.lounge_format_tag,
      lounge_tier: row.lounge_tier,
      stats_excluded: row.stats_excluded,
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
      .select("id, created_at, completed_at, updated_at, status, player_count, lounge_format_tag, lounge_tier, stats_excluded")
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

  function getLoungeTrackerStatSessions(mode = loungeTrackerChartsState.mode){
    const tierFilter = normalizeLoungeStatsTierTag(loungeTrackerChartsState.tierFilter);
    return getLoungeTrackerSessions(mode).filter((session) => {
      if(loungeTrackerSessionStatsExcluded(session)) return false;
      return !tierFilter || loungeTrackerSessionTier(session) === tierFilter;
    });
  }

  function compareLoungeTrackerTierTags(a, b){
    const ai = LOUNGE_TIER_ORDER.has(a) ? LOUNGE_TIER_ORDER.get(a) : LOUNGE_TIER_ORDER.size;
    const bi = LOUNGE_TIER_ORDER.has(b) ? LOUNGE_TIER_ORDER.get(b) : LOUNGE_TIER_ORDER.size;
    return ai - bi || a.localeCompare(b, "en", { numeric: true });
  }

  function collectLoungeTrackerTierOptions(mode = loungeTrackerChartsState.mode){
    const counts = new Map();
    for(const tag of LOUNGE_TIER_TAGS) counts.set(tag, 0);
    let noTierCount = 0;
    for(const session of getLoungeTrackerSessions(mode)){
      if(loungeTrackerSessionStatsExcluded(session)) continue;
      const tag = loungeTrackerSessionTier(session);
      if(tag) counts.set(tag, (counts.get(tag) || 0) + 1);
      else noTierCount += 1;
    }
    const tiers = Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => compareLoungeTrackerTierTags(a.tag, b.tag));
    return { tiers, noTierCount };
  }

  function aggregateLoungeTrackerTrackStats(mode = loungeTrackerChartsState.trackMode, loungeMode = loungeTrackerChartsState.mode){
    const bucket = new Map((mode === "tracks" ? LOUNGE_TRACKS : []).map((track) => [track, []]));
    for(const session of getLoungeTrackerStatSessions(loungeMode)){
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
    for(const session of getLoungeTrackerStatSessions(loungeMode)){
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
    if(mode === "im_special_destiny") return "Special Destinies";
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
    for(const session of getLoungeTrackerStatSessions(loungeMode)){
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
    if(chartMeta){
      const totalMogis = dailySeries.mogis.reduce((total, value) => total + (Number(value) || 0), 0);
      chartMeta.textContent = totalMogis
        ? `${fmtNumber(totalMogis)} mogis x ${AVG_MOGI_MINUTES}m = ${fmtDurationMinutes(totalMogis * AVG_MOGI_MINUTES)}`
        : "";
      chartMeta.classList.toggle("hidden", !totalMogis);
    }

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

    setMkcChartEmpty("chartMkcDelta", "");
    setMkcChartEmpty("chartMkcMmr", "");
    setMkcChartEmpty("chartMkcWeeklyMmr", "");
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
    updateMkcMmrDeckUi();
  }

  function updateMkcMmrDeckUi(){
    const isWeekly = mkcMmrDeckPanel === 1;
    const track = $("mkcMmrDeckTrack");
    if(track) track.style.transform = isWeekly ? "translateX(-50%)" : "translateX(0%)";
    document.querySelectorAll("#mkcMmrDeckPager [data-mkc-mmr-panel]").forEach((button) => {
      const active = Number(button.getAttribute("data-mkc-mmr-panel")) === mkcMmrDeckPanel;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const title = $("mkcMmrDeckTitle");
    if(title) title.textContent = isWeekly ? "Weekly Average MMR" : "MMR History";
    const info = $("btnMkcMmrDeckInfo");
    if(info) info.dataset.info = isWeekly ? "mkcWeeklyMmr" : "mkcMmrHistory";
    requestAnimationFrame(() => {
      resizeMkcChart(chartMmr);
      resizeMkcChart(chartWeeklyMmr);
    });
  }

  function setMkcMmrDeckPanel(panel){
    mkcMmrDeckPanel = Math.max(0, Math.min(1, Number(panel) || 0));
    closeLoungeTrackerMenus();
    updateMkcMmrDeckUi();
  }

  function bindMkcMmrDeckControls(){
    document.querySelectorAll("#mkcMmrDeckPager [data-mkc-mmr-panel]").forEach((button) => {
      button.addEventListener("click", () => setMkcMmrDeckPanel(button.getAttribute("data-mkc-mmr-panel")));
    });
    bindSwipeNavigation($("mkcMmrDeckViewport"), {
      onLeft: () => { if(mkcMmrDeckPanel < 1) setMkcMmrDeckPanel(mkcMmrDeckPanel + 1); },
      onRight: () => { if(mkcMmrDeckPanel > 0) setMkcMmrDeckPanel(mkcMmrDeckPanel - 1); },
    });
    updateMkcMmrDeckUi();
  }

  function loungeTrackerAvailableChartModes(mode = loungeTrackerChartsState.mode){
    const allowIntermission = loungeTrackerAllowsIntermission(mode);
    return LOUNGE_TRACKER_CHART_MODES.filter((chartMode) => allowIntermission || !LOUNGE_TRACKER_INTERMISSION_MODES.has(chartMode));
  }

  function loungeTrackerActiveChartMode(){
    if(loungeTrackerChartsState.panel === "placement") return "placement";
    return loungeTrackerAvailableChartModes().includes(loungeTrackerChartsState.trackMode)
      ? loungeTrackerChartsState.trackMode
      : "tracks";
  }

  function loungeTrackerChartModeTitle(mode = loungeTrackerActiveChartMode()){
    if(mode === "placement") return "Placement Distribution";
    if(mode === "im_destiny") return "Destiny Performance";
    if(mode === "im_special_destiny") return "Special Destiny Performance";
    if(mode === "im_routes") return "Separated Performance";
    return "Track Performance";
  }

  function updateLoungeTrackerDeckUi(){
    const activeMode = loungeTrackerActiveChartMode();
    const isPlacement = activeMode === "placement";
    const availableModes = loungeTrackerAvailableChartModes();
    const track = $("mkcLoungeDeckTrack");
    if(track) track.style.transform = isPlacement ? "translateX(-50%)" : "translateX(0%)";
    document.querySelectorAll("#mkcLoungeDeckPager [data-mkc-lounge-chart-mode]").forEach((button) => {
      const mode = button.getAttribute("data-mkc-lounge-chart-mode");
      const disabled = !availableModes.includes(mode);
      const active = !disabled && mode === activeMode;
      button.hidden = disabled;
      button.disabled = disabled;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
    const title = $("mkcLoungeDeckTitle");
    if(title) title.textContent = loungeTrackerChartModeTitle(activeMode);
    const info = $("btnMkcLoungeDeckInfo");
    if(info) info.dataset.info = isPlacement ? "mkcPlacementDistribution" : "mkcTrackPerformance";
    const trackActions = $("mkcLoungeTrackActions");
    const placementActions = $("mkcLoungePlacementActions");
    if(trackActions) trackActions.hidden = isPlacement;
    if(placementActions) placementActions.hidden = !isPlacement;
    requestAnimationFrame(() => {
      resizeMkcChart(loungeTrackerChartsState.trackChart);
      resizeMkcChart(loungeTrackerChartsState.placementChart);
    });
  }

  function setLoungeTrackerChartMode(mode){
    const next = LOUNGE_TRACKER_CHART_MODES.includes(mode) ? mode : "tracks";
    if(!loungeTrackerAvailableChartModes().includes(next)) return;
    if(next === "placement"){
      loungeTrackerChartsState.panel = "placement";
    }else{
      loungeTrackerChartsState.panel = "track";
      loungeTrackerChartsState.trackMode = next;
      loungeTrackerChartsState.lastSelectedTrack = null;
    }
    closeLoungeTrackerMenus();
    renderLoungeTrackerSection();
  }

  function stepLoungeTrackerChartMode(step){
    const modes = loungeTrackerAvailableChartModes();
    const current = loungeTrackerActiveChartMode();
    const currentIndex = Math.max(0, modes.indexOf(current));
    const nextIndex = currentIndex + step;
    if(nextIndex < 0 || nextIndex >= modes.length) return;
    setLoungeTrackerChartMode(modes[nextIndex]);
  }

  function bindLoungeTrackerDeckControls(){
    document.querySelectorAll("#mkcLoungeDeckPager [data-mkc-lounge-chart-mode]").forEach((button) => {
      button.addEventListener("click", () => setLoungeTrackerChartMode(button.getAttribute("data-mkc-lounge-chart-mode")));
    });
    bindSwipeNavigation($("mkcLoungeDeckViewport"), {
      onLeft: () => stepLoungeTrackerChartMode(1),
      onRight: () => stepLoungeTrackerChartMode(-1),
    });
    updateLoungeTrackerDeckUi();
  }

  function updateLoungeTrackerModeButtons(){
    const is24 = loungeTrackerChartsState.mode === "24";
    const effectivePlacementMode = loungeTrackerEffectivePlacementMode();
    document.querySelectorAll("[data-mkc-lounge-mode]").forEach((button) => {
      const active = button.getAttribute("data-mkc-lounge-mode") === loungeTrackerChartsState.mode;
      button.classList.toggle("active", active);
      button.classList.toggle("isActive", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const placementFilterRoot = $("mkcLoungePlacementFilterRoot");
    if(placementFilterRoot) placementFilterRoot.hidden = !is24;

    const trackMeta = $("mkcLoungeTrackModeMeta");
    if(trackMeta) trackMeta.textContent = loungeTrackerTrackModeLabel();

    const placementMeta = $("mkcLoungePlacementMeta");
    if(placementMeta) {
      placementMeta.textContent = effectivePlacementMode === "intermission" ? "Intermission" : effectivePlacementMode === "all" ? "All" : "Tracks";
    }

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
    updateLoungeTrackerDeckUi();
  }

  function closeLoungeTrackerMenus(){
    if(window.MKWT_UI?.closeFilterMenus){
      window.MKWT_UI.closeFilterMenus("mkcTracker");
      return;
    }
    [
      ["btnMkcLoungeTierFilter", "menuMkcLoungeTierFilter"],
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
    if(window.MKWT_UI?.toggleFilterMenu){
      window.MKWT_UI.toggleFilterMenu(buttonId, menuId, { type: "mkcTracker" });
      return;
    }
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
    el.classList.remove("mkcTrackerInsight--empty");
    const stat = loungeTrackerChartsState.lastTrackStats.find((entry) => entry.track === trackName);
    if(!stat){
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <div class="mkcTrackerInsightTitle">${escapeHtml(stat.track)}</div>
      <div class="mkcTrackerInsightMeta">${escapeHtml(loungeTrackerTrackModeLabel())} details from saved ${escapeHtml(loungeTrackerModeLabel())} Mogis</div>
      <div class="mkcTrackerInsightGrid">
        <div class="mkcTrackerInsightStat">
          <span class="mkcTrackerInsightLabel">AVG points</span>
          <span class="mkcTrackerInsightValue">${stat.count ? stat.avg.toFixed(2) : "-"}</span>
        </div>
        <div class="mkcTrackerInsightStat">
          <span class="mkcTrackerInsightLabel">Plays</span>
          <span class="mkcTrackerInsightValue">${stat.count}</span>
        </div>
      </div>
    `;
  }

  function renderLoungeTrackerPlacementInsight(message, selectedLabel = ""){
    const el = $("mkcLoungePlacementInsight");
    if(!el) return;
    el.classList.remove("mkcTrackerInsight--empty");
    if(message){
      el.hidden = false;
      el.innerHTML = `<div class="muted">${escapeHtml(message)}</div>`;
      return;
    }
    el.innerHTML = "";
    el.hidden = true;
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
      setMkcChartEmpty("chartMkcLoungeTrack", "");
      renderLoungeTrackerEmptyNotice("mkcLoungeTrackInsight", "No data for this chart yet.");
      return;
    }
    setMkcChartEmpty("chartMkcLoungeTrack", "");
    renderLoungeTrackerEmptyNotice("mkcLoungeTrackInsight", "");

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
      setMkcChartEmpty("chartMkcLoungePlacement", "");
      renderLoungeTrackerEmptyNotice("mkcLoungePlacementInsight", "No placement data for this chart yet.");
      return;
    }
    setMkcChartEmpty("chartMkcLoungePlacement", "");
    renderLoungeTrackerEmptyNotice("mkcLoungePlacementInsight", "");
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
    const savedSessions = getLoungeTrackerSessions();
    const tierOptions = collectLoungeTrackerTierOptions();
    const activeTier = normalizeLoungeStatsTierTag(loungeTrackerChartsState.tierFilter);
    if(activeTier && !tierOptions.tiers.some((entry) => entry.tag === activeTier)){
      loungeTrackerChartsState.tierFilter = "";
    }
    const selectedTier = normalizeLoungeStatsTierTag(loungeTrackerChartsState.tierFilter);
    const tierFilterValue = $("mkcLoungeTierFilterValue");
    if(tierFilterValue) tierFilterValue.textContent = selectedTier || "All tiers";
    const tierMenu = $("menuMkcLoungeTierFilter");
    if(tierMenu){
      const rows = [
        `<button class="mkcTrackerFilterItem${!selectedTier ? " active" : ""}" data-mkc-tier-filter="" type="button"><span>All tiers</span></button>`,
        ...tierOptions.tiers.map((entry) => `<button class="mkcTrackerFilterItem${selectedTier === entry.tag ? " active" : ""}" data-mkc-tier-filter="${escapeHtml(entry.tag)}" type="button"><span>${escapeHtml(entry.tag)}</span><span class="mkcTrackerFilterMeta">${entry.count}</span></button>`),
      ];
      tierMenu.innerHTML = rows.join("");
      tierMenu.querySelectorAll("[data-mkc-tier-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          closeLoungeTrackerMenus();
          setLoungeTrackerTierFilter(button.getAttribute("data-mkc-tier-filter"));
        });
      });
    }
    const sessions = getLoungeTrackerStatSessions();
    const races = sessions.flatMap((session) => session.races || []);
    const nonDcCount = races.filter((race) => !race.disconnect).length;
    if(meta){
      const tierText = selectedTier ? ` (${selectedTier})` : "";
      meta.textContent = sessions.length
        ? `${loungeTrackerModeLabel()}${tierText} from saved tracker Mogis: ${sessions.length} Mogis / ${nonDcCount} non-DC races.`
        : (savedSessions.length
          ? `No ${loungeTrackerModeLabel()} tracker Mogis match this stats filter.`
          : `No saved ${loungeTrackerModeLabel()} tracker Mogis found yet in this browser/account.`);
    }
    if(!sessions.length || !races.length){
      destroyLoungeTrackerCharts();
      const message = savedSessions.length
        ? `No ${loungeTrackerModeLabel()} Mogis are included in stats.`
        : `No saved ${loungeTrackerModeLabel()} Mogis yet.`;
      setMkcChartEmpty("chartMkcLoungeTrack", "");
      setMkcChartEmpty("chartMkcLoungePlacement", "");
      renderLoungeTrackerEmptyNotice("mkcLoungeTrackInsight", message);
      renderLoungeTrackerEmptyNotice("mkcLoungePlacementInsight", message);
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
    if(trackStats.length){
      const selectedTrack = loungeTrackerChartsState.lastSelectedTrack;
      if(selectedTrack && trackStats.some((row) => row.track === selectedTrack)) renderLoungeTrackerInsight(selectedTrack);
      else renderLoungeTrackerInsight(null);
    }
  }

  function setLoungeTrackerMode(mode){
    const next = String(mode) === "24" ? "24" : "12";
    loungeTrackerChartsState.mode = next;
    loungeTrackerChartsState.lastSelectedTrack = null;
    loungeTrackerChartsState.placementItem = "";
    if(!loungeTrackerAllowsIntermission(next)){
      loungeTrackerChartsState.trackMode = "tracks";
      loungeTrackerChartsState.placementMode = "all";
      if(loungeTrackerChartsState.panel !== "placement") loungeTrackerChartsState.panel = "track";
    }
    closeLoungeTrackerMenus();
    renderLoungeTrackerSection();
  }

  function setLoungeTrackerTrackMode(mode){
    if(!loungeTrackerAllowsIntermission()) mode = "tracks";
    if(!["tracks", "im_destiny", "im_special_destiny", "im_routes"].includes(mode)) mode = "tracks";
    loungeTrackerChartsState.panel = "track";
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

  function setLoungeTrackerTierFilter(value){
    loungeTrackerChartsState.tierFilter = normalizeLoungeStatsTierTag(value);
    loungeTrackerChartsState.lastSelectedTrack = null;
    loungeTrackerChartsState.placementItem = "";
    renderLoungeTrackerSection();
  }

  function bindLoungeTrackerControls(){
    $("btnMkcLoungeTierFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLoungeTrackerMenu("btnMkcLoungeTierFilter", "menuMkcLoungeTierFilter");
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
    document.querySelectorAll("[data-mkc-placement-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        closeLoungeTrackerMenus();
        setLoungeTrackerPlacementMode(button.getAttribute("data-mkc-placement-mode"));
      });
    });
    document.addEventListener("click", (event) => {
      const trackRoot = $("mkcLoungeTrackFilterRoot");
      const tierRoot = $("mkcLoungeTierFilterRoot");
      const placementRoot = $("mkcLoungePlacementFilterRoot");
      const placementItemRoot = $("mkcLoungePlacementItemFilterRoot");
      if(trackRoot?.contains(event.target) || tierRoot?.contains(event.target) || placementRoot?.contains(event.target) || placementItemRoot?.contains(event.target)) return;
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
      updateMkcSummaryFilterUi(false);
      const nameEl = $("mkcPlayerNameDisplay");
      if(nameEl){
        nameEl.textContent = payload?.playerName || "MKCentral Player";
        nameEl.classList.toggle("isEmpty", !payload?.playerName);
      }
      setLastUpdateDisplay(payload?.updated_at || "", Array.isArray(payload?.events) ? payload.events.length : null);
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
    setLastUpdateDisplay(payload.updated_at, payload.events.length);
    renderCards(payload);
    renderGroupTable("mkcTypeRows", groupedRows(payload.events, "format"));
    renderGroupTable("mkcTierRows", groupedRows(payload.events, "tier"));
    renderEvents(payload.events);
    renderCharts(payload.events);
  }

  async function loadInitialPlayerRef(){
    const localRef = readStorage(SETTINGS_KEY, "");
    const cloudRef = await readCloudPlayerRef();
    const preferredRef = cloudRef.hasAccount ? cloudRef.value : (localRef || DEFAULT_PLAYER_REF);
    const normalized = extractPlayerId(preferredRef);
    if(normalized) writeStorage(SETTINGS_KEY, normalized);
    else if(cloudRef.hasAccount){
      try{ localStorage.removeItem(SETTINGS_KEY); }catch(e){}
    }
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
    bindMkcSummaryFilter();
    bindMkcScoreHints();
    bindMkcCompare();
    bindMkcMmrDeckControls();
    bindLoungeTrackerDeckControls();
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
