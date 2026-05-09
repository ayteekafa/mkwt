/* =========================================================
   MKWT Core - Shared logic for tracker, stats, sessions, settings
   ========================================================= */

// ========= Constants =========
const SUPABASE_URL  = "https://imxlssgtzzdfgdscubdx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
const SUPABASE_PROJECT_REF = "imxlssgtzzdfgdscubdx";
const GUEST_KEY = "mkwt_guest_matches_v1";
const BACKUP_SCHEMA_VERSION = 3;
const BACKUP_KEY_LOCAL = "mkwt_backup_session_local_v1";
const BACKUP_KEY_SESS  = "mkwt_backup_session_session_v1";
const RESTORE_SAFETY_BACKUP_KEY = "mkwt_last_restore_safety_backup_v1";
const GUEST_PROFILE_KEY = "mkwt_guest_profile_v1";
const GUEST_TIME_TRIAL_KEY = "mkwt_guest_time_trial_entries_v1";
const GUEST_CLAN_WARS_CURRENT_KEY = "mkwt_clan_wars_current_v1";
const GUEST_CLAN_WARS_MATCHES_KEY = "mkwt_clan_wars_matches_v1";
const THEME_KEY = "mkwt_theme";
const MIN_VR_FILTER_KEY = "mkwt_min_vr_filter";
const MKCENTRAL_PLAYER_KEY = "mkwt_mkcentral_player_ref_v1";
const PROFILE_ICON_KEY = "mkwt_profile_icon_slug_v1";
const MKCENTRAL_SCOPE_KEY = "mkwt_mkcentral_scope_v1";
const COMBO_BUILDER_SELECTION_KEY = "mkwt_combo_builder_selection_v1";
const LOUNGE_BACKUP_STORES = [
  { key: "12", playerCount: 12, currentKey: "mkwt_lounge_current_v1", sessionsKey: "mkwt_lounge_sessions_v1" },
  { key: "24", playerCount: 24, currentKey: "mkwt_lounge24_current_v1", sessionsKey: "mkwt_lounge24_sessions_v1" },
];
const MKCENTRAL_LOUNGE_BACKUP_FIELDS = [
  "mkcentral_event_id",
  "mkcentral_event_name",
  "mkcentral_table_url",
  "mkcentral_tier",
  "mkcentral_table_rank",
  "mkcentral_table_score",
  "mkcentral_mmr_before",
  "mkcentral_mmr_delta",
  "mkcentral_mmr_after",
  "mkcentral_event_created_at",
  "mkcentral_synced_at",
  "mkcentral_sync_status",
  "mkcentral_confidence_label",
  "mkcentral_confidence_note",
  "mkcentral_confidence_score",
].join(", ");
const LOUNGE_MOGI_BACKUP_SELECT = [
  "id",
  "created_at",
  "completed_at",
  "updated_at",
  "status",
  "total_points",
  "race_count",
  "disconnects",
  "player_count",
  "lounge_format_tag",
  "lounge_format_source",
  "lounge_tier",
  "stats_excluded",
  "mkcentral_format_tag",
  MKCENTRAL_LOUNGE_BACKUP_FIELDS,
].join(", ");

window.MKWT = window.MKWT || {};

// ========= Supabase client (shared, cached, lazy) =========
function authStorageForMode(mode){
  return mode === "session" ? sessionStorage : localStorage;
}

function authStorageHasToken(mode){
  const storage = authStorageForMode(mode);
  try{
    for(let i = 0; i < storage.length; i += 1){
      const key = storage.key(i);
      if(!key) continue;
      if(key === `sb-${SUPABASE_PROJECT_REF}-auth-token`) return true;
      if(key.startsWith(`sb-${SUPABASE_PROJECT_REF}-`) && key.includes("auth-token")) return true;
    }
  }catch(e){ /* safe to ignore */ }
  return false;
}

function getSupabaseClient({
  mode = "local",
  persistSession = true,
  autoRefreshToken = true,
  detectSessionInUrl = true,
} = {}){
  const cache = window.MKWT._supabaseClients || (window.MKWT._supabaseClients = {});
  const key = JSON.stringify({ mode, persistSession, autoRefreshToken, detectSessionInUrl });
  if(cache[key]) return cache[key];
  const auth = { persistSession, autoRefreshToken, detectSessionInUrl };
  if(mode === "local" || mode === "session"){
    auth.storage = authStorageForMode(mode);
  }
  if (!window.supabase?.createClient) {
    throw new Error("Supabase could not load. Please check your connection and reload the page.");
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth });
  cache[key] = client;
  return client;
}

window.MKWT.getSupabaseClient = getSupabaseClient;
window.MKWT.authStorageHasToken = authStorageHasToken;

function preferredAuthStorage(){
  try{ return (localStorage.getItem('mkwt_auth_storage') || 'local'); }catch(e){ return 'local'; }
}
function readBackup(which){
  const key = which === 'session' ? BACKUP_KEY_SESS : BACKUP_KEY_LOCAL;
  try{ return JSON.parse((which === 'session' ? sessionStorage : localStorage).getItem(key) || 'null'); }catch(e){ return null; }
}
async function tryRestoreFromBackup(){
  const pref = preferredAuthStorage();
  const b = readBackup(pref);
  if (!b?.access_token || !b?.refresh_token) return false;
  try{
    const c = getSupabaseClient({ mode: pref === "session" ? "session" : "local" });
    await c.auth.setSession({ access_token: b.access_token, refresh_token: b.refresh_token });
    return true;
  }catch(e){
    return false;
  }
}

// Shared session + client state (set by each page's requireAuth)
let supabaseClient = null;
let SESSION = null;

// ========= Guest (local) storage =========
function loadGuestMatches(){
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || "[]") || []; } catch(e){ return []; }
}
function saveGuestMatches(arr){
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(arr || [])); } catch(e){ /* safe to ignore */ }
}
function guestAddMatch(m){
  const arr = loadGuestMatches();
  arr.push(m);
  saveGuestMatches(arr);
  return m;
}
function guestUpdateMatch(id, patch){
  const arr = loadGuestMatches();
  const i = arr.findIndex(x=>x.id===id);
  if(i>=0){ arr[i] = { ...arr[i], ...patch }; saveGuestMatches(arr); return true; }
  return false;
}
function guestDeleteMatch(id){
  const arr = loadGuestMatches();
  const next = arr.filter(x=>x.id!==id);
  saveGuestMatches(next);
  return next.length !== arr.length;
}
function guestCount(){ return loadGuestMatches().length; }

function isGuest(){ return !SESSION || !SESSION.user; }

// ========= Utilities =========
function fingerprintMatch(r) {
  const created = r && r.created_at ? String(r.created_at) : "";
  return [
    created,
    String(r?.intermission ?? ""),
    String(r?.track ?? ""),
    String(r?.vr_change ?? ""),
    String(r?.opponents ?? ""),
    String(r?.placement ?? "")
  ].join("|");
}

function maskEmail(email){
  if(!email) return "-";
  const [local, domain] = email.split("@");
  if(!domain) return email;
  const vis = local.length <= 2 ? local : local[0] + ".".repeat(Math.min(local.length-2, 4)) + local[local.length-1];
  return vis + "@" + domain;
}

function setNavAuthButton(mode){
  const b = document.getElementById("btnLogout");
  if(!b) return;
  b.style.display = "";
  if(mode === "account"){
    b.textContent = "Logout";
    b.classList.remove("danger");
    b.classList.add("active");
    try{ localStorage.setItem("mkwt_last_mode","account"); }catch(e){ /* safe to ignore */ }
  }else{
    b.textContent = "Login";
    b.classList.remove("active");
    b.classList.add("danger");
  }
}

function applyThemeForMode(mode){
  try{
    const t = (mode === 'guest') ? 'dendo' : (localStorage.getItem('mkwt_theme') || 'dark');
    document.documentElement.dataset.theme = t;
    const themeColors = {
      light: '#f3f4f6',
      rose: '#f7f0f4',
      glacier: '#eef6ff',
      purple: '#07060b',
      green: '#04100b',
      red: '#0f0809',
      dendo: '#05060a',
      aurora: '#04100f',
      ember: '#120b0e',
      arcade: '#090b11',
      sunset: '#140c14'
    };
    const c = themeColors[t] || '#07080a';
    const m=document.querySelector('meta[name="theme-color"]');
    if(m) m.setAttribute('content', c);
  }catch(e){ /* safe to ignore */ }
}

async function syncAccountThemePreference(client, userId){
  try{
    if(!client || !userId) return null;
    let { data, error } = await client
      .from("profiles")
      .select("theme_preference,mkcentral_player_id,profile_icon_slug")
      .eq("id", userId)
      .maybeSingle();

    if (error && String(error.message || "").includes("column profiles.id")) {
      ({ data, error } = await client
        .from("profiles")
        .select("theme_preference,mkcentral_player_id,profile_icon_slug")
        .eq("user_id", userId)
        .maybeSingle());
    }

    if(error) return null;
    const mkcentralPlayerId = String(data?.mkcentral_player_id || "").trim();
    const profileIconSlug = String(data?.profile_icon_slug || "").trim();
    try{
      if(mkcentralPlayerId) localStorage.setItem(MKCENTRAL_PLAYER_KEY, mkcentralPlayerId);
      else localStorage.removeItem(MKCENTRAL_PLAYER_KEY);
    }catch(e){ /* safe to ignore */ }
    try{
      if(profileIconSlug) localStorage.setItem(PROFILE_ICON_KEY, profileIconSlug);
      else localStorage.removeItem(PROFILE_ICON_KEY);
    }catch(e){ /* safe to ignore */ }

    const theme = String(data?.theme_preference || "").trim();
    if(!theme){
      const localTheme = String(localStorage.getItem("mkwt_theme") || "").trim();
      if(!localTheme) return null;
      try{
        await client
          .from("profiles")
          .upsert({
            id: userId,
            theme_preference: localTheme,
            updated_at: new Date().toISOString()
          });
      }catch(e){ /* safe to ignore */ }
      return localTheme;
    }
    try{ localStorage.setItem("mkwt_theme", theme); }catch(e){ /* safe to ignore */ }
    applyThemeForMode("account");
    return theme;
  }catch(e){
    return null;
  }
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch{ /* safe to ignore */ } a.remove(); }, 0);
}
window.downloadTextFile = downloadTextFile;


function syncSharedSession(client, session){
  supabaseClient = client || null;
  SESSION = session || null;
  window.supabaseClient = supabaseClient;
  window.SESSION = SESSION;
}

async function resolveStoredSession({ tryBackupRestore = false, onDebug = null } = {}){
  let session = null;
  let error = null;

  if (authStorageHasToken("local")) {
    const clientLocal = getSupabaseClient({ mode: "local" });
    ({ data:{ session }, error } = await clientLocal.auth.getSession());
    if (error && typeof onDebug === "function") onDebug("getSession(local) error: " + JSON.stringify(error, null, 2));
    if (session) return { client: clientLocal, session, source: "local" };
  }

  if (authStorageHasToken("session")) {
    const clientSess = getSupabaseClient({ mode: "session" });
    ({ data:{ session }, error } = await clientSess.auth.getSession());
    if (error && typeof onDebug === "function") onDebug("getSession(session) error: " + JSON.stringify(error, null, 2));
    if (session) return { client: clientSess, session, source: "session" };
  }

  if (tryBackupRestore && await tryRestoreFromBackup()) {
    if (authStorageHasToken("local")) {
      const clientLocal = getSupabaseClient({ mode: "local" });
      ({ data:{ session } } = await clientLocal.auth.getSession());
      if (session) return { client: clientLocal, session, source: "backup-local" };
    }
    if (authStorageHasToken("session")) {
      const clientSess = getSupabaseClient({ mode: "session" });
      ({ data:{ session } } = await clientSess.auth.getSession());
      if (session) return { client: clientSess, session, source: "backup-session" };
    }
  }

  return { client: null, session: null, source: null };
}

window.mkwtRequireAuth = async function(options = {}){
  const {
    pageName = "app.html",
    allowGuest = false,
    tryBackupRestore = false,
    onDebug = null,
    onAccount = null,
    onGuest = null,
  } = options;

  const resolved = await resolveStoredSession({ tryBackupRestore, onDebug });
  if (resolved.session) {
    syncSharedSession(resolved.client, resolved.session);
    try { localStorage.setItem("mkwt_mode", "account"); } catch(e){ /* safe to ignore */ }
    await syncAccountThemePreference(resolved.client, resolved.session.user?.id || null);
    if (typeof onAccount === "function") await onAccount(resolved.session, resolved.client, resolved.source);
    return resolved.session;
  }

  if (!allowGuest) {
    try{
      localStorage.setItem("mkwt_mode", "unknown");
      localStorage.setItem("mkwt_last_page", location.pathname || pageName);
    }catch(e){ /* safe to ignore */ }
    window.location.replace("login.html");
    return null;
  }

  const last = (()=>{ try{ return localStorage.getItem("mkwt_last_mode") || ""; }catch(e){ return ""; } })();
  if (last !== "guest") {
    try{
      localStorage.setItem("mkwt_mode", "unknown");
      localStorage.setItem("mkwt_last_page", location.pathname || pageName);
    }catch(e){ /* safe to ignore */ }
    window.location.replace("login.html");
    return null;
  }

  window.IS_GUEST = true;
  syncSharedSession(null, null);
  try { localStorage.setItem("mkwt_mode", "guest"); } catch(e){ /* safe to ignore */ }
  if (typeof onGuest === "function") await onGuest();
  return null;
};

// ========= Shared Nav Actions (Export / Import / Logout) =========
(function(){
  const $id = (id)=>document.getElementById(id);

  async function ensureSession(){
    try{
      if (window.SESSION && window.SESSION.user) {
        SESSION = window.SESSION;
        supabaseClient = window.supabaseClient || supabaseClient;
        return;
      }
      if (!window.supabaseClient?.auth?.getSession) return;
      const { data } = await window.supabaseClient.auth.getSession();
      syncSharedSession(window.supabaseClient, data?.session || null);
    }catch(e){ console.warn(e); }
  }

  async function ensureProfile(){
    try{
      if (typeof window.loadProfile === "function") await window.loadProfile();
      if (!window.supabaseClient || !window.SESSION?.user) return;
      const columns = "nickname,current_vr,mkcentral_player_id,theme_preference,profile_icon_slug";
      let { data, error } = await supabaseClient
        .from("profiles")
        .select(columns)
        .eq("id", SESSION.user.id)
        .maybeSingle();
      if (error && String(error.message || "").includes("column profiles.id")) {
        ({ data, error } = await supabaseClient
          .from("profiles")
          .select(columns)
          .eq("user_id", SESSION.user.id)
          .maybeSingle());
      }
      if (!error) window.PROFILE = data || null;
    }catch(e){ console.warn(e); }
  }

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const safeReadJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e) {
      return fallback;
    }
  };
  const safeWriteJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch(e) { return false; }
  };
  const safeReadString = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch(e) {
      return fallback;
    }
  };
  const safeWriteString = (key, value) => {
    try {
      if (value == null || String(value).trim() === "") localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
      return true;
    } catch(e) {
      return false;
    }
  };
  const toIntOrNull = (value) => {
    if (value == null || String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  };
  const cleanString = (value) => String(value ?? "").trim();
  const sanitizeFilePart = (value) => cleanString(value || "user")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 64) || "user";

  function readLocalPreferencesForBackup(){
    const minVr = toIntOrNull(safeReadString(MIN_VR_FILTER_KEY, "0"));
    const comboSelection = safeReadJson(COMBO_BUILDER_SELECTION_KEY, null);
    return {
      theme: safeReadString(THEME_KEY, null),
      min_vr_filter: minVr && minVr > 0 ? minVr : 0,
      mkcentral_player_id: safeReadString(MKCENTRAL_PLAYER_KEY, null),
      profile_icon_slug: safeReadString(PROFILE_ICON_KEY, null),
      mkcentral_scope: safeReadString(MKCENTRAL_SCOPE_KEY, null),
      combo_builder_selection: comboSelection && typeof comboSelection === "object" ? comboSelection : null,
    };
  }

  function applyLocalPreferencesFromBackup(backup){
    const prefs = backup?.preferences || {};
    const profile = backup?.profile || {};
    if (hasOwn(prefs, "theme")) safeWriteString(THEME_KEY, prefs.theme);
    else if (hasOwn(profile, "theme_preference")) safeWriteString(THEME_KEY, profile.theme_preference);

    if (hasOwn(prefs, "min_vr_filter")) {
      const minVr = toIntOrNull(prefs.min_vr_filter);
      safeWriteString(MIN_VR_FILTER_KEY, minVr && minVr > 0 ? String(minVr) : "0");
    }

    if (hasOwn(prefs, "mkcentral_player_id")) safeWriteString(MKCENTRAL_PLAYER_KEY, prefs.mkcentral_player_id);
    else if (hasOwn(profile, "mkcentral_player_id")) safeWriteString(MKCENTRAL_PLAYER_KEY, profile.mkcentral_player_id);

    if (hasOwn(prefs, "profile_icon_slug")) safeWriteString(PROFILE_ICON_KEY, prefs.profile_icon_slug);
    else if (hasOwn(profile, "profile_icon_slug")) safeWriteString(PROFILE_ICON_KEY, profile.profile_icon_slug);

    if (hasOwn(prefs, "mkcentral_scope")) safeWriteString(MKCENTRAL_SCOPE_KEY, prefs.mkcentral_scope);

    if (hasOwn(prefs, "combo_builder_selection")) {
      if (prefs.combo_builder_selection && typeof prefs.combo_builder_selection === "object") {
        safeWriteJson(COMBO_BUILDER_SELECTION_KEY, prefs.combo_builder_selection);
      } else {
        try { localStorage.removeItem(COMBO_BUILDER_SELECTION_KEY); } catch(e) {}
      }
    }
  }

  function normalizeProfile(raw, prefs = {}){
    const currentVr = toIntOrNull(raw?.current_vr);
    return {
      nickname: cleanString(raw?.nickname) || null,
      current_vr: currentVr,
      mkcentral_player_id: cleanString(raw?.mkcentral_player_id ?? prefs.mkcentral_player_id) || null,
      theme_preference: cleanString(raw?.theme_preference ?? prefs.theme) || null,
      profile_icon_slug: cleanString(raw?.profile_icon_slug ?? prefs.profile_icon_slug) || null,
    };
  }

  function readGuestProfileForBackup(prefs){
    const profile = (window.MKWT?.loadGuestProfile ? window.MKWT.loadGuestProfile() : safeReadJson(GUEST_PROFILE_KEY, null)) || {};
    return normalizeProfile(profile, prefs);
  }

  function writeGuestProfileFromBackup(backup){
    const profile = normalizeProfile(backup?.profile || {}, backup?.preferences || {});
    if (!profile.nickname && profile.current_vr == null) return false;
    const payload = {
      nickname: profile.nickname || "Guest",
      current_vr: profile.current_vr == null ? 0 : profile.current_vr,
      created_at: backup?.profile?.created_at || new Date().toISOString(),
    };
    if (window.MKWT?.saveGuestProfile) window.MKWT.saveGuestProfile(payload);
    else safeWriteJson(GUEST_PROFILE_KEY, payload);
    return true;
  }

  function readMkcentralStatsCacheForBackup(prefs = {}, profile = {}){
    const playerId = cleanString(profile.mkcentral_player_id || prefs.mkcentral_player_id);
    if (!playerId) return { source: "local_storage", player_id: "", record_count: 0, records: [] };
    const prefix = `mkwt_mkcentral_${playerId}_`;
    const records = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix) || !key.endsWith("_v1")) continue;
        const payload = safeReadJson(key, null);
        if (payload && typeof payload === "object") records.push({ key, payload });
      }
    } catch(e) {
      return { source: "local_storage", player_id: playerId, record_count: records.length, records };
    }
    return { source: "local_storage", player_id: playerId, record_count: records.length, records };
  }

  function writeMkcentralStatsCacheFromBackup(backup){
    const payload = backup?.mkcentral_stats || backup?.mkcentralStats || null;
    const records = Array.isArray(payload?.records) ? payload.records : [];
    let written = 0;
    for (const record of records) {
      const key = cleanString(record?.key);
      if (!/^mkwt_mkcentral_\d+_[a-z0-9_-]+_v1$/i.test(key)) continue;
      if (!record?.payload || typeof record.payload !== "object") continue;
      if (safeWriteJson(key, record.payload)) written += 1;
    }
    return { written, skipped: !records.length };
  }

  function normalizeVrMatches(rawMatches){
    const sorted = (Array.isArray(rawMatches) ? rawMatches : [])
      .filter(Boolean)
      .slice()
      .sort((a, b) => String(a?.created_at || "").localeCompare(String(b?.created_at || "")));
    return sorted.map((raw) => {
      const vrChange = Number(raw?.vr_change ?? 0);
      const vrAfter = Number(raw?.vr_after);
      return {
        id: raw?.id ? String(raw.id) : "",
        created_at: raw?.created_at || new Date().toISOString(),
        intermission: raw?.intermission ?? null,
        track: raw?.track ?? "",
        vr_change: Number.isFinite(vrChange) ? vrChange : 0,
        vr_after: Number.isFinite(vrAfter) ? vrAfter : null,
        opponents: raw?.opponents ?? null,
        placement: raw?.placement ?? null,
      };
    });
  }

  function uniqueVrMatchesByFingerprint(rawMatches){
    const result = [];
    const seen = new Set();
    for (const match of normalizeVrMatches(rawMatches)) {
      const fp = fingerprintMatch(match);
      if (seen.has(fp)) continue;
      seen.add(fp);
      result.push(match);
    }
    return result;
  }

  function writeGuestMatchesFromBackup(rawMatches, { append = false } = {}){
    const incoming = normalizeVrMatches(rawMatches);
    const current = append ? loadGuestMatches() : [];
    const usedIds = new Set(current.map(match => String(match.id || "")));
    for (const match of incoming) {
      let id = match.id || `g_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      if (usedIds.has(id)) id = `${id}_${Math.random().toString(16).slice(2)}`;
      usedIds.add(id);
      current.push({ ...match, id });
    }
    saveGuestMatches(current);
    return { matches: incoming.length, total: current.length };
  }

  function readLocalLoungePayloadForStore(store){
    const sessions = safeReadJson(store.sessionsKey, []);
    return {
      source: "local_storage",
      playerCount: store.playerCount,
      current_mogi: safeReadJson(store.currentKey, null),
      session_count: Array.isArray(sessions) ? sessions.length : 0,
      sessions: Array.isArray(sessions) ? sessions : [],
    };
  }

  function withLegacyLoungeAlias(payload){
    const byPlayerCount = payload.by_player_count || {};
    const legacy = byPlayerCount["12"] || byPlayerCount["24"] || null;
    if (!legacy) return payload;
    return {
      ...payload,
      playerCount: legacy.playerCount,
      current_mogi: legacy.current_mogi,
      session_count: legacy.session_count,
      sessions: legacy.sessions,
    };
  }

  function readLocalLoungeBackups(){
    const byPlayerCount = {};
    for (const store of LOUNGE_BACKUP_STORES) {
      byPlayerCount[store.key] = readLocalLoungePayloadForStore(store);
    }
    const total = Object.values(byPlayerCount).reduce((sum, payload) => sum + Number(payload?.session_count || 0), 0);
    return withLegacyLoungeAlias({
      source: "local_storage",
      by_player_count: byPlayerCount,
      total_session_count: total,
    });
  }

  async function readLoungeCloudForBackup(playerCount){
    if (!window.supabaseClient || !window.SESSION?.user?.id) return null;
    const uid = window.SESSION.user.id;
    const loungePlayerCount = Number(playerCount || 12);

    const { data: mogis, error: mogiError } = await supabaseClient
      .from("lounge_mogis")
      .select(LOUNGE_MOGI_BACKUP_SELECT)
      .eq("user_id", uid)
      .eq("player_count", loungePlayerCount)
      .order("created_at", { ascending: false });
    if (mogiError) throw mogiError;

    const mogiIds = (mogis || []).map(mogi => mogi.id).filter(Boolean);
    const races = [];
    for (let i = 0; i < mogiIds.length; i += 100) {
      const batchIds = mogiIds.slice(i, i + 100);
      const { data, error } = await supabaseClient
        .from("lounge_races")
        .select("id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at")
        .eq("user_id", uid)
        .in("mogi_id", batchIds)
        .order("race_number", { ascending: true });
      if (error) throw error;
      races.push(...(data || []));
    }

    const racesByMogi = new Map();
    for (const race of races) {
      if (!racesByMogi.has(race.mogi_id)) racesByMogi.set(race.mogi_id, []);
      racesByMogi.get(race.mogi_id).push(race);
    }

    const toLocalRace = (race) => ({
      track: race.track,
      raceKind: race.race_kind || "track",
      intermissionStart: race.intermission_start || null,
      intermissionEnd: race.intermission_end || null,
      lobbySize: race.lobby_size,
      placement: race.placement,
      points: race.points,
      disconnect: !!race.disconnect,
      created_at: race.created_at,
    });
    const toLocalMogi = (mogi) => {
      const mogiRaces = (racesByMogi.get(mogi.id) || [])
        .slice()
        .sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0))
        .map(toLocalRace);
      return {
        created_at: mogi.created_at,
        playerCount: mogi.player_count || loungePlayerCount,
        races: mogiRaces,
        totalPoints: mogi.total_points,
        disconnects: mogi.disconnects,
        statsExcluded: !!mogi.stats_excluded,
        loungeFormatTag: mogi.lounge_format_tag || "",
        loungeFormatSource: mogi.lounge_format_source || "",
        loungeTier: mogi.lounge_tier || "",
        mkcentralFormatTag: mogi.mkcentral_format_tag || "",
        mkcentralEventId: mogi.mkcentral_event_id || "",
        mkcentralEventName: mogi.mkcentral_event_name || "",
        mkcentralTableUrl: mogi.mkcentral_table_url || "",
        mkcentralTier: mogi.mkcentral_tier || "",
        mkcentralTableRank: mogi.mkcentral_table_rank ?? null,
        mkcentralTableScore: mogi.mkcentral_table_score ?? null,
        mkcentralMmrBefore: mogi.mkcentral_mmr_before ?? null,
        mkcentralMmrDelta: mogi.mkcentral_mmr_delta ?? null,
        mkcentralMmrAfter: mogi.mkcentral_mmr_after ?? null,
        mkcentralEventCreatedAt: mogi.mkcentral_event_created_at || "",
        mkcentralSyncedAt: mogi.mkcentral_synced_at || "",
        mkcentralSyncStatus: mogi.mkcentral_sync_status || "",
        mkcentralConfidenceLabel: mogi.mkcentral_confidence_label || "",
        mkcentralConfidenceNote: mogi.mkcentral_confidence_note || "",
        mkcentralConfidenceScore: mogi.mkcentral_confidence_score ?? null,
        saved: mogi.status === "completed",
        completed_at: mogi.completed_at,
      };
    };

    const active = (mogis || []).find(mogi => mogi.status === "active");
    const sessions = (mogis || [])
      .filter(mogi => mogi.status === "completed")
      .map(toLocalMogi)
      .sort((a, b) => String(b.completed_at || b.created_at || "").localeCompare(String(a.completed_at || a.created_at || "")));

    return {
      source: "supabase",
      playerCount: loungePlayerCount,
      current_mogi: active ? toLocalMogi(active) : null,
      session_count: sessions.length,
      sessions,
    };
  }

  async function readAllLoungeCloudForBackup(){
    const byPlayerCount = {};
    for (const store of LOUNGE_BACKUP_STORES) {
      byPlayerCount[store.key] = await readLoungeCloudForBackup(store.playerCount);
    }
    const total = Object.values(byPlayerCount).reduce((sum, payload) => sum + Number(payload?.session_count || 0), 0);
    return withLegacyLoungeAlias({
      source: "supabase",
      by_player_count: byPlayerCount,
      total_session_count: total,
    });
  }

  function normalizeLoungePayload(raw, fallbackPlayerCount){
    if (!raw || typeof raw !== "object") return null;
    const playerCount = Number(raw.playerCount || raw.player_count || fallbackPlayerCount || 12);
    const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {
      source: raw.source || "backup",
      playerCount,
      current_mogi: raw.current_mogi ?? raw.currentMogi ?? null,
      session_count: sessions.length,
      sessions,
    };
  }

  function getLoungePayloadsFromBackup(backup){
    const root = backup?.lounge_tracker;
    const payloads = [];
    if (!root || typeof root !== "object") return payloads;
    const byPlayerCount = root.by_player_count || root.byPlayerCount;
    if (byPlayerCount && typeof byPlayerCount === "object") {
      for (const [key, raw] of Object.entries(byPlayerCount)) {
        const payload = normalizeLoungePayload(raw, Number(key));
        if (payload) payloads.push(payload);
      }
      return payloads;
    }
    const legacy = normalizeLoungePayload(root, Number(root.playerCount || root.player_count || 12));
    if (legacy) payloads.push(legacy);
    return payloads;
  }

  function writeLocalLoungePayloadsFromBackup(payloads){
    let sessions = 0;
    let current = 0;
    for (const payload of payloads || []) {
      const playerCount = Number(payload?.playerCount || payload?.player_count || 12);
      const store = LOUNGE_BACKUP_STORES.find(item => item.playerCount === playerCount) || LOUNGE_BACKUP_STORES[0];
      const normalized = normalizeLoungePayload(payload, store.playerCount);
      if (!normalized) continue;
      safeWriteJson(store.currentKey, normalized.current_mogi ?? null);
      safeWriteJson(store.sessionsKey, normalized.sessions || []);
      sessions += normalized.sessions.length;
      if (normalized.current_mogi) current += 1;
    }
    return { sessions, current };
  }

  function clanWarScoreMap(eventType){
    return eventType === "6v6v6v6"
      ? [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1]
      : [15,12,10,9,8,7,6,5,4,3,2,1];
  }

  function clanWarFieldTotal(eventType){
    return clanWarScoreMap(eventType).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function clanWarOwnPoints(placements, eventType){
    const map = clanWarScoreMap(eventType);
    return (placements || []).reduce((sum, place) => sum + Number(map[Number(place) - 1] || 0), 0);
  }

  function normalizeClanWarRace(raw){
    if (!raw || typeof raw !== "object") return null;
    const eventType = cleanString((raw.event_type ?? raw.eventType) || "6v6v6v6") === "6v6v6v6" ? "6v6v6v6" : "6v6";
    const placements = Array.isArray(raw.placements)
      ? raw.placements.map(Number).filter(Number.isFinite)
      : [];
    const track = cleanString(raw.track);
    if (!track || placements.length !== 6) return null;
    const raceKind = cleanString((raw.race_kind ?? raw.raceKind) || "track") === "intermission" ? "intermission" : "track";
    const now = new Date().toISOString();
    const fieldPoints = Number(raw.fieldPoints ?? raw.field_points ?? clanWarFieldTotal(eventType));
    const ownPoints = Number(raw.ownPoints ?? raw.own_points ?? clanWarOwnPoints(placements, eventType));
    return {
      id: raw.id ? String(raw.id) : "",
      raceNumber: Number(raw.raceNumber ?? raw.race_number ?? 1),
      eventType,
      raceKind,
      track,
      intermissionStart: raw.intermissionStart ?? raw.intermission_start ?? null,
      intermissionEnd: raw.intermissionEnd ?? raw.intermission_end ?? null,
      placements,
      maxPlacement: Number(raw.maxPlacement ?? raw.max_placement ?? (eventType === "6v6v6v6" ? 24 : 12)),
      ownPoints,
      opponentPoints: raw.opponentPoints ?? raw.opponent_points ?? (eventType === "6v6" ? fieldPoints - ownPoints : null),
      fieldPoints,
      dc: raw.dc === true,
      ruleWarning: cleanString(raw.ruleWarning ?? raw.rule_warning ?? ""),
      createdAt: raw.createdAt ?? raw.created_at ?? now,
    };
  }

  function summarizeClanWarMatch(match){
    const races = Array.isArray(match?.races) ? match.races : [];
    const ownTotal = races.reduce((sum, race) => sum + Number(race?.ownPoints || race?.own_points || 0), 0);
    const fieldTotal = races.reduce((sum, race) => sum + Number(race?.fieldPoints || race?.field_points || 0), 0);
    const eventType = cleanString((match?.eventType ?? match?.event_type) || "6v6") === "6v6v6v6" ? "6v6v6v6" : "6v6";
    return {
      ownTotal,
      fieldTotal,
      opponentTotal: eventType === "6v6" ? fieldTotal - ownTotal : null,
      raceCount: races.length,
      dcCount: races.filter(race => race?.dc === true).length,
    };
  }

  function normalizeClanWarMatch(raw){
    if (!raw || typeof raw !== "object") return null;
    const eventType = cleanString((raw.event_type ?? raw.eventType) || "6v6") === "6v6v6v6" ? "6v6v6v6" : "6v6";
    const races = (Array.isArray(raw.races) ? raw.races : []).map(normalizeClanWarRace).filter(Boolean)
      .sort((a, b) => Number(a.raceNumber || 0) - Number(b.raceNumber || 0));
    const now = new Date().toISOString();
    const summary = summarizeClanWarMatch({ eventType, races });
    return {
      id: raw.id ? String(raw.id) : "",
      eventType,
      status: cleanString(raw.status || (races.length >= 12 ? "completed" : "active")) === "completed" ? "completed" : "active",
      scopeType: "personal",
      clanId: null,
      createdAt: raw.createdAt ?? raw.created_at ?? now,
      completedAt: raw.completedAt ?? raw.completed_at ?? null,
      divisionTag: cleanString(raw.divisionTag ?? raw.division_tag ?? raw.clanDivisionTag ?? raw.clan_division_tag ?? ""),
      races,
      ...summary,
    };
  }

  function mergeClanWarMatches(matches){
    const seen = new Set();
    return (matches || []).filter(Boolean).filter((match) => {
      const key = match.id || `${match.eventType}|${match.createdAt}|${match.races?.length || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => String(b.completedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.createdAt || "")));
  }

  function isUuid(value){
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function readLocalClanWarsBackup(){
    const current = normalizeClanWarMatch(safeReadJson(GUEST_CLAN_WARS_CURRENT_KEY, null));
    const matches = mergeClanWarMatches((safeReadJson(GUEST_CLAN_WARS_MATCHES_KEY, []) || []).map(normalizeClanWarMatch).filter(Boolean));
    return {
      source: "local_storage",
      current_match: current,
      match_count: matches.length,
      matches,
    };
  }

  async function readAccountClanWarsBackup(){
    if (!window.supabaseClient || !window.SESSION?.user?.id) return { source: "supabase", current_match: null, match_count: 0, matches: [] };
    const uid = window.SESSION.user.id;
    const { data: matches, error: matchError } = await supabaseClient
      .from("clan_wars_matches")
      .select("id, event_type, status, own_total, opponent_total, field_total, race_count, dc_count, completed_at, created_at")
      .eq("owner_user_id", uid)
      .is("clan_id", null)
      .order("created_at", { ascending: false });
    if (matchError) throw matchError;

    const ids = (matches || []).map(match => match.id).filter(Boolean);
    const races = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batchIds = ids.slice(i, i + 100);
      const { data, error } = await supabaseClient
        .from("clan_wars_races")
        .select("id, match_id, race_number, event_type, race_kind, track, intermission_start, intermission_end, placements, max_placement, own_points, opponent_points, field_points, dc, rule_warning, created_at")
        .in("match_id", batchIds)
        .order("race_number", { ascending: true });
      if (error) throw error;
      races.push(...(data || []));
    }
    const racesByMatch = new Map();
    for (const race of races) {
      if (!racesByMatch.has(race.match_id)) racesByMatch.set(race.match_id, []);
      racesByMatch.get(race.match_id).push(race);
    }
    const normalized = mergeClanWarMatches((matches || []).map(match => normalizeClanWarMatch({
      id: match.id,
      event_type: match.event_type,
      status: match.status,
      completed_at: match.completed_at,
      created_at: match.created_at,
      races: (racesByMatch.get(match.id) || []).map(race => ({
        id: race.id,
        race_number: race.race_number,
        event_type: race.event_type,
        race_kind: race.race_kind,
        track: race.track,
        intermission_start: race.intermission_start,
        intermission_end: race.intermission_end,
        placements: race.placements,
        max_placement: race.max_placement,
        own_points: race.own_points,
        opponent_points: race.opponent_points,
        field_points: race.field_points,
        dc: race.dc,
        rule_warning: race.rule_warning,
        created_at: race.created_at,
      })),
    })));
    const active = normalized.find(match => match.status === "active") || null;
    const completed = normalized.filter(match => match.id !== active?.id);
    return {
      source: "supabase",
      current_match: active,
      match_count: completed.length,
      matches: completed,
    };
  }

  function getClanWarsPayloadFromBackup(backup){
    const present = !!(backup && (hasOwn(backup, "clan_wars") || hasOwn(backup, "clanWars")));
    const payload = backup?.clan_wars || backup?.clanWars || null;
    const current = normalizeClanWarMatch(payload?.current_match ?? payload?.currentMatch ?? null);
    const matches = mergeClanWarMatches((Array.isArray(payload?.matches) ? payload.matches : []).map(normalizeClanWarMatch).filter(Boolean));
    return {
      source: payload?.source || "backup",
      current_match: current,
      match_count: matches.length,
      matches,
      present,
    };
  }

  function countClanWarsBackupMatches(payload){
    if (!payload) return 0;
    return Number(payload.match_count || payload.matches?.length || 0) + (payload.current_match ? 1 : 0);
  }

  function writeLocalClanWarsFromBackup(clanWarsPayload){
    if (!clanWarsPayload?.present) return { matches: 0, current: 0, skipped: true };
    safeWriteJson(GUEST_CLAN_WARS_CURRENT_KEY, clanWarsPayload.current_match || null);
    safeWriteJson(GUEST_CLAN_WARS_MATCHES_KEY, clanWarsPayload.matches || []);
    return { matches: clanWarsPayload.matches?.length || 0, current: clanWarsPayload.current_match ? 1 : 0 };
  }

  async function restoreAccountClanWars(clanWarsPayload){
    if (!clanWarsPayload?.present) return { deleted: 0, inserted: 0, races: 0, skipped: true };
    const uid = SESSION.user.id;
    const allMatches = mergeClanWarMatches([clanWarsPayload.current_match, ...(clanWarsPayload.matches || [])]);
    if (countClanWarsBackupMatches(clanWarsPayload) > 0 && allMatches.length === 0) {
      throw new Error("Clan Wars backup entries are invalid. Existing Clan Wars data was not changed.");
    }

    const { data: existing, error: existingError } = await supabaseClient
      .from("clan_wars_matches")
      .select("id")
      .eq("owner_user_id", uid)
      .is("clan_id", null);
    if (existingError) throw existingError;
    const existingIds = (existing || []).map(row => row.id).filter(Boolean);
    for (let i = 0; i < existingIds.length; i += 100) {
      const batchIds = existingIds.slice(i, i + 100);
      const { error } = await supabaseClient.from("clan_wars_matches").delete().in("id", batchIds);
      if (error) throw error;
    }

    if (!allMatches.length) return { deleted: existingIds.length, inserted: 0, races: 0 };
    const matchRows = allMatches.map((match) => {
      const normalized = normalizeClanWarMatch(match);
      const summary = summarizeClanWarMatch(normalized);
      return {
        id: isUuid(normalized.id) ? normalized.id : undefined,
        owner_user_id: uid,
        clan_id: null,
        event_type: normalized.eventType,
        status: normalized.status,
        own_total: summary.ownTotal,
        opponent_total: normalized.eventType === "6v6" ? summary.opponentTotal : null,
        field_total: summary.fieldTotal,
        race_count: summary.raceCount,
        dc_count: summary.dcCount,
        created_by_user_id: uid,
        completed_at: normalized.completedAt,
        created_at: normalized.createdAt,
      };
    });
    const { data: insertedMatches, error: insertMatchError } = await supabaseClient
      .from("clan_wars_matches")
      .insert(matchRows)
      .select("id, created_at");
    if (insertMatchError) throw insertMatchError;

    const idByCreatedAt = new Map((insertedMatches || []).map(row => [row.created_at, row.id]));
    const raceRows = [];
    allMatches.forEach((match) => {
      const normalized = normalizeClanWarMatch(match);
      const matchId = isUuid(normalized.id) ? normalized.id : idByCreatedAt.get(normalized.createdAt);
      if (!matchId) return;
      normalized.races.forEach((race) => {
        raceRows.push({
          match_id: matchId,
          race_number: race.raceNumber,
          event_type: race.eventType,
          race_kind: race.raceKind,
          track: race.track,
          intermission_start: race.intermissionStart,
          intermission_end: race.intermissionEnd,
          placements: race.placements,
          max_placement: race.maxPlacement,
          own_points: race.ownPoints,
          opponent_points: race.opponentPoints,
          field_points: race.fieldPoints,
          dc: race.dc,
          rule_warning: race.ruleWarning || null,
          created_at: race.createdAt,
        });
      });
    });
    for (let i = 0; i < raceRows.length; i += 500) {
      const { error } = await supabaseClient.from("clan_wars_races").insert(raceRows.slice(i, i + 500));
      if (error) throw error;
    }
    return { deleted: existingIds.length, inserted: allMatches.length, races: raceRows.length };
  }

  function normalizeTimeTrialEntry(raw){
    if (!raw || typeof raw !== "object") return null;
    const trackName = cleanString(raw.track_name ?? raw.trackName ?? raw.track);
    const category = cleanString(raw.category || "shroom").toLowerCase();
    const timeText = cleanString(raw.time_text ?? raw.timeText ?? raw.time);
    const timeMs = Number(raw.time_ms ?? raw.timeMs);
    const characterName = cleanString(raw.character_name ?? raw.characterName);
    const kartName = cleanString(raw.kart_name ?? raw.kartName);
    if (!trackName || !["shroom", "shroomless"].includes(category) || !timeText || !Number.isFinite(timeMs)) return null;
    if (!characterName || !kartName) return null;
    const now = new Date().toISOString();
    return {
      id: raw.id ? String(raw.id) : "",
      track_name: trackName,
      category,
      time_text: timeText,
      time_ms: Math.round(timeMs),
      character_name: characterName,
      kart_name: kartName,
      created_at: raw.created_at || now,
      updated_at: raw.updated_at || raw.created_at || now,
    };
  }

  function normalizeTimeTrialEntries(rawEntries){
    const byRecord = new Map();
    for (const entry of (Array.isArray(rawEntries) ? rawEntries : [])) {
      const normalized = normalizeTimeTrialEntry(entry);
      if (!normalized) continue;
      byRecord.set(`${normalized.track_name.toLowerCase()}|${normalized.category}`, normalized);
    }
    return Array.from(byRecord.values())
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }

  function readGuestTimeTrialBackup(){
    const entries = normalizeTimeTrialEntries(safeReadJson(GUEST_TIME_TRIAL_KEY, []));
    return { source: "local_storage", entry_count: entries.length, raw_count: entries.length, entries };
  }

  async function readAccountTimeTrialBackup(){
    const entries = [];
    const chunk = 1000;
    let from = 0;
    while (true) {
      const to = from + chunk - 1;
      const { data, error } = await supabaseClient
        .from("time_trial_entries")
        .select("id, track_name, category, time_text, time_ms, character_name, kart_name, created_at, updated_at")
        .eq("user_id", SESSION.user.id)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      entries.push(...data);
      if (data.length < chunk) break;
      from += chunk;
    }
    const normalized = normalizeTimeTrialEntries(entries);
    return { source: "supabase", entry_count: normalized.length, raw_count: entries.length, entries: normalized };
  }

  function getTimeTrialPayloadFromBackup(backup){
    const present = !!(backup && (hasOwn(backup, "time_trial") || hasOwn(backup, "timeTrial")));
    const payload = backup?.time_trial || backup?.timeTrial || null;
    const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];
    const entries = normalizeTimeTrialEntries(rawEntries);
    return { source: payload?.source || "backup", entry_count: entries.length, raw_count: rawEntries.length, entries, present };
  }

  function writeGuestTimeTrialFromBackup(timeTrialPayload){
    if (!timeTrialPayload?.present) return { entries: 0, skipped: true };
    const entries = normalizeTimeTrialEntries(timeTrialPayload?.entries || []).map((entry) => ({
      ...entry,
      id: entry.id || `guest_tt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    }));
    safeWriteJson(GUEST_TIME_TRIAL_KEY, entries);
    return { entries: entries.length };
  }

  async function restoreAccountTimeTrial(timeTrialPayload){
    if (!timeTrialPayload?.present) return { deleted: 0, inserted: 0, entries: 0, skipped: true };
    const entries = normalizeTimeTrialEntries(timeTrialPayload?.entries || []);
    if (Number(timeTrialPayload?.raw_count || 0) > 0 && entries.length === 0) {
      throw new Error("Time Trial backup entries are invalid. Existing PBs were not changed.");
    }
    const uid = SESSION.user.id;
    const { data: existing, error: loadErr } = await supabaseClient
      .from("time_trial_entries")
      .select("id")
      .eq("user_id", uid);
    if (loadErr) throw loadErr;

    const existingIds = (existing || []).map(row => row.id).filter(Boolean);
    for (let i = 0; i < existingIds.length; i += 500) {
      const batchIds = existingIds.slice(i, i + 500);
      const { error } = await supabaseClient
        .from("time_trial_entries")
        .delete()
        .in("id", batchIds)
        .eq("user_id", uid);
      if (error) throw error;
    }

    let inserted = 0;
    for (let i = 0; i < entries.length; i += 500) {
      const batch = entries.slice(i, i + 500).map(entry => ({
        user_id: uid,
        track_name: entry.track_name,
        category: entry.category,
        time_text: entry.time_text,
        time_ms: entry.time_ms,
        character_name: entry.character_name,
        kart_name: entry.kart_name,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
      }));
      if (!batch.length) continue;
      const { error } = await supabaseClient.from("time_trial_entries").insert(batch);
      if (error) throw error;
      inserted += batch.length;
    }
    return { deleted: existingIds.length, inserted, entries: entries.length };
  }

  async function readAccountMatchesForBackup(){
    const allMatches = [];
    const chunk = 1000;
    let from = 0;
    while (true) {
      const to = from + chunk - 1;
      const { data, error } = await supabaseClient
        .from("matches")
        .select("id, created_at, intermission, track, vr_change, vr_after, opponents, placement")
        .eq("user_id", SESSION.user.id)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allMatches.push(...data);
      if (data.length < chunk) break;
      from += chunk;
    }
    return allMatches;
  }

  function getBackupMatches(backup){
    if (Array.isArray(backup)) return backup;
    if (Array.isArray(backup?.matches)) return backup.matches;
    if (Array.isArray(backup?.vr_tracker?.matches)) return backup.vr_tracker.matches;
    return null;
  }

  function normalizeBackupObject(parsed){
    if (Array.isArray(parsed)) {
      return { app: "MKWT", version: 1, schemaVersion: 1, mode: "legacy", matches: parsed, vr_tracker: { matches: parsed } };
    }
    if (!parsed || typeof parsed !== "object" || parsed.app !== "MKWT") {
      throw new Error("This file is not a valid MKWT backup.");
    }
    return parsed;
  }

  async function restoreVrMatchesCloud(rawMatches){
    const uniqueBackup = uniqueVrMatchesByFingerprint(rawMatches);
    const backupFp = new Set(uniqueBackup.map(fingerprintMatch));
    const existingKeepFp = new Set();
    const toDeleteIds = [];
    const chunk = 1000;
    let from = 0;

    while (true) {
      const to = from + chunk - 1;
      const { data, error } = await supabaseClient
        .from("matches")
        .select("id, created_at, intermission, track, vr_change, opponents, placement")
        .eq("user_id", SESSION.user.id)
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const row of data) {
        const fp = fingerprintMatch(row);
        if (!backupFp.has(fp)) { toDeleteIds.push(row.id); continue; }
        if (existingKeepFp.has(fp)) { toDeleteIds.push(row.id); continue; }
        existingKeepFp.add(fp);
      }
      if (data.length < chunk) break;
      from += chunk;
    }

    let deleted = 0;
    for (let i = 0; i < toDeleteIds.length; i += 500) {
      const batchIds = toDeleteIds.slice(i, i + 500);
      const { error } = await supabaseClient
        .from("matches")
        .delete()
        .in("id", batchIds)
        .eq("user_id", SESSION.user.id);
      if (error) throw error;
      deleted += batchIds.length;
    }

    const toInsert = [];
    for (const match of uniqueBackup) {
      const fp = fingerprintMatch(match);
      if (existingKeepFp.has(fp)) continue;
      toInsert.push({
        user_id: SESSION.user.id,
        created_at: match.created_at,
        intermission: match.intermission ?? null,
        track: match.track ?? null,
        vr_change: match.vr_change ?? 0,
        vr_after: match.vr_after ?? null,
        opponents: match.opponents ?? null,
        placement: match.placement ?? null,
      });
      existingKeepFp.add(fp);
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabaseClient.from("matches").insert(batch);
      if (error) throw error;
      inserted += batch.length;
    }
    return { backup: uniqueBackup.length, deleted, inserted };
  }

  async function getLatestVrAfterImport(){
    try{
      const { data, error } = await supabaseClient
        .from("matches")
        .select("vr_after, created_at")
        .eq("user_id", SESSION.user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!error && data?.[0] && Number.isFinite(Number(data[0].vr_after))) return Number(data[0].vr_after);
    }catch(e){ console.warn(e); }
    return null;
  }

  async function restoreAccountProfileFromBackup(backup, fallbackVr){
    const uid = SESSION.user.id;
    const prefs = backup?.preferences || {};
    const profile = normalizeProfile(backup?.profile || {}, prefs);
    const payload = {
      id: uid,
      updated_at: new Date().toISOString(),
    };
    if (profile.nickname) payload.nickname = profile.nickname;
    if (profile.current_vr != null) payload.current_vr = profile.current_vr;
    else if (fallbackVr != null) payload.current_vr = fallbackVr;
    if (hasOwn(backup?.profile, "mkcentral_player_id") || hasOwn(prefs, "mkcentral_player_id")) payload.mkcentral_player_id = profile.mkcentral_player_id;
    if (hasOwn(backup?.profile, "theme_preference") || hasOwn(prefs, "theme")) payload.theme_preference = profile.theme_preference;
    if (hasOwn(backup?.profile, "profile_icon_slug") || hasOwn(prefs, "profile_icon_slug")) payload.profile_icon_slug = profile.profile_icon_slug;

    if (Object.keys(payload).length <= 2) return { updated: false };
    const { error } = await supabaseClient.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    window.PROFILE = { ...(window.PROFILE || {}), ...payload };
    return { updated: true };
  }

  async function restoreLoungeCloud(loungePayload){
    if (!loungePayload || !window.supabaseClient || !window.SESSION?.user?.id) {
      return { mogis: 0, races: 0 };
    }

    const uid = window.SESSION.user.id;
    const loungePlayerCount = Number(loungePayload.playerCount || loungePayload.player_count || 12);
    const rawSessions = Array.isArray(loungePayload.sessions) ? loungePayload.sessions : [];
    const current = loungePayload.current_mogi && Array.isArray(loungePayload.current_mogi.races)
      ? loungePayload.current_mogi
      : null;

    function restoreRaceKey(race){
      return [
        race?.track || "",
        race?.raceKind || race?.race_kind || "",
        race?.intermissionStart || race?.intermission_start || "",
        race?.intermissionEnd || race?.intermission_end || "",
        race?.lobbySize ?? race?.lobby_size ?? "",
        race?.placement ?? "",
        race?.points ?? "",
        race?.disconnect === true ? "dc" : "",
      ].join("|");
    }

    function restoreSessionKey(raw){
      const eventId = raw?.mkcentralEventId || raw?.mkcentral_event_id;
      if (eventId) return `mkcentral:${loungePlayerCount}:${eventId}`;
      const rawRaces = Array.isArray(raw?.races) ? raw.races : [];
      return [
        "fingerprint",
        loungePlayerCount,
        raw?.created_at || "",
        raw?.completed_at || "",
        raw?.loungeFormatTag || raw?.matchFormatTag || raw?.lounge_format_tag || "",
        raw?.loungeTier || raw?.lounge_tier || raw?.tierTag || "",
        rawRaces.map(restoreRaceKey).join(";"),
      ].join("::");
    }

    const seenSessionKeys = new Set();
    const sessions = [];
    for (const session of rawSessions) {
      const key = restoreSessionKey(session);
      if (seenSessionKeys.has(key)) continue;
      seenSessionKeys.add(key);
      sessions.push(session);
    }

    function restorableRaces(raw, status){
      const rawRaces = Array.isArray(raw?.races) ? raw.races : [];
      if (!raw || rawRaces.length === 0) return null;
      const raceCount = Math.min(rawRaces.length, 12);
      const keptRaces = rawRaces.slice(0, raceCount);
      const totalPoints = keptRaces.reduce((sum, race) => sum + Number(race?.points || 0), 0);
      if (status === "completed" && raceCount !== 12) {
        throw new Error("Lounge backup contains an incomplete completed Mogi. Restore cancelled before cloud data changed.");
      }
      if (status === "completed" && totalPoints <= 0) {
        throw new Error("Lounge backup contains a 0-point completed Mogi. Restore cancelled before cloud data changed.");
      }
      return { rawRaces, raceCount, keptRaces, totalPoints };
    }

    for (const session of sessions) {
      restorableRaces(session, "completed");
    }
    if (current && current.races.length) {
      restorableRaces(current, "active");
    }

    const { data: existing, error: loadErr } = await supabaseClient
      .from("lounge_mogis")
      .select("id")
      .eq("user_id", uid)
      .eq("player_count", loungePlayerCount);
    if (loadErr) throw loadErr;

    const existingIds = (existing || []).map(row => row.id);
    for (let i = 0; i < existingIds.length; i += 100) {
      const batchIds = existingIds.slice(i, i + 100);
      const { error: raceDeleteErr } = await supabaseClient
        .from("lounge_races")
        .delete()
        .in("mogi_id", batchIds)
        .eq("user_id", uid);
      if (raceDeleteErr) throw raceDeleteErr;

      const { error: mogiDeleteErr } = await supabaseClient
        .from("lounge_mogis")
        .delete()
        .in("id", batchIds)
        .eq("user_id", uid);
      if (mogiDeleteErr) throw mogiDeleteErr;
    }

    let mogis = 0;
    let races = 0;
    const insertedIds = [];

    async function insertMogi(raw, status){
      const restorable = restorableRaces(raw, status);
      if (!restorable) return;

      const { raceCount, keptRaces, totalPoints } = restorable;
      const disconnects = keptRaces.filter(race => !!race?.disconnect).length;
      const createdAt = raw.created_at || new Date().toISOString();
      const completedAt = status === "completed" ? (raw.completed_at || createdAt) : null;

      const { data: mogi, error: mogiErr } = await supabaseClient
        .from("lounge_mogis")
        .insert({
          user_id: uid,
          created_at: createdAt,
          completed_at: completedAt,
          status,
          player_count: Number(raw.playerCount || raw.player_count || loungePlayerCount),
          total_points: totalPoints,
          race_count: raceCount,
          disconnects,
          stats_excluded: !!(raw.statsExcluded ?? raw.stats_excluded),
          lounge_format_tag: raw.loungeFormatTag || raw.matchFormatTag || raw.lounge_format_tag || null,
          lounge_format_source: raw.loungeFormatSource || raw.lounge_format_source || null,
          lounge_tier: raw.loungeTier || raw.lounge_tier || raw.tierTag || null,
          mkcentral_format_tag: raw.mkcentralFormatTag || raw.mkcentral_format_tag || null,
          mkcentral_event_id: raw.mkcentralEventId || raw.mkcentral_event_id || null,
          mkcentral_event_name: raw.mkcentralEventName || raw.mkcentral_event_name || null,
          mkcentral_table_url: raw.mkcentralTableUrl || raw.mkcentral_table_url || null,
          mkcentral_tier: raw.mkcentralTier || raw.mkcentral_tier || null,
          mkcentral_table_rank: raw.mkcentralTableRank ?? raw.mkcentral_table_rank ?? null,
          mkcentral_table_score: raw.mkcentralTableScore ?? raw.mkcentral_table_score ?? null,
          mkcentral_mmr_before: raw.mkcentralMmrBefore ?? raw.mkcentral_mmr_before ?? null,
          mkcentral_mmr_delta: raw.mkcentralMmrDelta ?? raw.mkcentral_mmr_delta ?? null,
          mkcentral_mmr_after: raw.mkcentralMmrAfter ?? raw.mkcentral_mmr_after ?? null,
          mkcentral_event_created_at: raw.mkcentralEventCreatedAt || raw.mkcentral_event_created_at || null,
          mkcentral_synced_at: raw.mkcentralSyncedAt || raw.mkcentral_synced_at || null,
          mkcentral_sync_status: raw.mkcentralSyncStatus || raw.mkcentral_sync_status || null,
          mkcentral_confidence_label: raw.mkcentralConfidenceLabel || raw.mkcentral_confidence_label || null,
          mkcentral_confidence_note: raw.mkcentralConfidenceNote || raw.mkcentral_confidence_note || null,
          mkcentral_confidence_score: raw.mkcentralConfidenceScore ?? raw.mkcentral_confidence_score ?? null,
        })
        .select("id")
        .single();
      if (mogiErr) throw mogiErr;
      insertedIds.push(mogi.id);
      mogis++;

      const raceRows = keptRaces.map((race, index) => {
        const disconnect = !!race?.disconnect;
        return {
          mogi_id: mogi.id,
          user_id: uid,
          race_number: index + 1,
          track: String(race?.track || ""),
          race_kind: String(race?.raceKind || race?.race_kind || "track"),
          intermission_start: race?.intermissionStart || race?.intermission_start || null,
          intermission_end: race?.intermissionEnd || race?.intermission_end || null,
          lobby_size: Number(race?.lobbySize ?? race?.lobby_size ?? loungePlayerCount),
          placement: race?.placement == null || race?.placement === "" ? null : Number(race.placement),
          points: Number(race?.points ?? (disconnect ? 1 : 0)),
          disconnect,
          created_at: race?.created_at || createdAt,
        };
      });

      if (raceRows.length) {
        const { error: raceErr } = await supabaseClient.from("lounge_races").insert(raceRows);
        if (raceErr) {
          try {
            await supabaseClient
              .from("lounge_mogis")
              .delete()
              .eq("id", mogi.id)
              .eq("user_id", uid);
          } catch(cleanupErr) {
            console.warn("Lounge restore single-mogi cleanup failed:", cleanupErr);
          }
          throw raceErr;
        }
        races += raceRows.length;
      }
    }

    try {
      for (const session of sessions) {
        await insertMogi(session, "completed");
      }
      if (current && current.races.length) {
        await insertMogi(current, "active");
      }
    } catch(e) {
      if (insertedIds.length) {
        try {
          await supabaseClient
            .from("lounge_races")
            .delete()
            .in("mogi_id", insertedIds)
            .eq("user_id", uid);
          await supabaseClient
            .from("lounge_mogis")
            .delete()
            .in("id", insertedIds)
            .eq("user_id", uid);
        } catch(cleanupErr) {
          console.warn("Lounge restore partial cleanup failed:", cleanupErr);
        }
      }
      throw e;
    }

    return { mogis, races };
  }

  function buildBackupSummary(vrCount, loungePayloads, timeTrialCount, clanWarsCount = 0){
    const loungeText = (loungePayloads || [])
      .map(payload => `${payload.playerCount}p ${payload.session_count || payload.sessions?.length || 0}`)
      .join(", ");
    return `WW ${vrCount} | Lounge ${loungeText || "0"} | TT ${timeTrialCount} | CW ${Number(clanWarsCount || 0)}`;
  }

  function countBackupLoungeMogis(loungePayloads){
    return (loungePayloads || []).reduce((sum, payload) => {
      const sessions = Array.isArray(payload?.sessions) ? payload.sessions.length : Number(payload?.session_count || 0);
      const active = payload?.current_mogi && Array.isArray(payload.current_mogi.races) && payload.current_mogi.races.length ? 1 : 0;
      return sum + Math.max(0, Number(sessions || 0)) + active;
    }, 0);
  }

  function formatLoungePayloadCounts(loungePayloads){
    const parts = (loungePayloads || []).map((payload) => {
      const playerCount = Number(payload?.playerCount || payload?.player_count || 12);
      const sessions = Array.isArray(payload?.sessions) ? payload.sessions.length : Number(payload?.session_count || 0);
      const active = payload?.current_mogi && Array.isArray(payload.current_mogi.races) && payload.current_mogi.races.length ? 1 : 0;
      const total = Math.max(0, Number(sessions || 0)) + active;
      return `${playerCount}p ${total}`;
    }).filter(Boolean);
    return parts.length ? parts.join(", ") : "0";
  }

  async function readCurrentAccountRestoreCounts(){
    const uid = window.SESSION?.user?.id;
    if (!window.supabaseClient || !uid) return null;

    const [matchesRes, loungeRes, timeTrialRes, clanWarsRes] = await Promise.all([
      supabaseClient.from("matches").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabaseClient.from("lounge_mogis").select("player_count, status, stats_excluded").eq("user_id", uid),
      supabaseClient.from("time_trial_entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabaseClient.from("clan_wars_matches").select("id", { count: "exact", head: true }).eq("owner_user_id", uid).is("clan_id", null),
    ]);
    if (matchesRes.error) throw matchesRes.error;
    if (loungeRes.error) throw loungeRes.error;
    if (timeTrialRes.error) throw timeTrialRes.error;
    if (clanWarsRes.error) throw clanWarsRes.error;

    const loungeRows = Array.isArray(loungeRes.data) ? loungeRes.data : [];
    return {
      ww: Number(matchesRes.count || 0),
      lounge: loungeRows.length,
      lounge12: loungeRows.filter(row => Number(row.player_count) === 12).length,
      lounge24: loungeRows.filter(row => Number(row.player_count) === 24).length,
      loungeExcluded: loungeRows.filter(row => row.stats_excluded === true).length,
      tt: Number(timeTrialRes.count || 0),
      clanWars: Number(clanWarsRes.count || 0),
    };
  }

  function formatCurrentAccountCounts(counts){
    if (!counts) return "Current account: could not be checked.";
    const excluded = counts.loungeExcluded ? `, ${counts.loungeExcluded} excluded` : "";
    return `Current account: WW ${counts.ww} | Lounge ${counts.lounge} (${counts.lounge12}x 12p, ${counts.lounge24}x 24p${excluded}) | TT ${counts.tt} | CW ${counts.clanWars}`;
  }

  function buildRestoreWarnings({ backupMatches, loungePayloads, timeTrialPayload, clanWarsPayload, currentCounts } = {}){
    if (!currentCounts) return [];
    const warnings = [];
    const backupLounge = countBackupLoungeMogis(loungePayloads);
    if (Number(backupMatches || 0) < currentCounts.ww) {
      warnings.push(`WW backup has fewer matches (${backupMatches}) than the account (${currentCounts.ww}).`);
    }
    if (backupLounge < currentCounts.lounge) {
      warnings.push(`Lounge backup has fewer Mogis (${backupLounge}) than the account (${currentCounts.lounge}).`);
    }
    if (timeTrialPayload?.present && Number(timeTrialPayload.entry_count || 0) < currentCounts.tt) {
      warnings.push(`Time Trial backup has fewer PBs (${timeTrialPayload.entry_count || 0}) than the account (${currentCounts.tt}).`);
    }
    if (clanWarsPayload?.present && countClanWarsBackupMatches(clanWarsPayload) < currentCounts.clanWars) {
      warnings.push(`Clan Wars backup has fewer matches (${countClanWarsBackupMatches(clanWarsPayload)}) than the account (${currentCounts.clanWars}).`);
    }
    return warnings;
  }

  async function createAccountRestoreSafetyBackup(){
    const exportedAt = new Date().toISOString();
    const preferences = readLocalPreferencesForBackup();
    const allMatches = await readAccountMatchesForBackup();
    let loungeBackup = readLocalLoungeBackups();
    try {
      loungeBackup = await readAllLoungeCloudForBackup() || loungeBackup;
    } catch(e) {
      console.warn("Lounge safety backup cloud fallback:", e);
    }
    const timeTrialBackup = await readAccountTimeTrialBackup();
    const clanWarsBackup = await readAccountClanWarsBackup();
    const profile = normalizeProfile(window.PROFILE || {}, preferences);
    const mkcentralStats = readMkcentralStatsCacheForBackup(preferences, profile);
    const backup = {
      app: "MKWT",
      version: BACKUP_SCHEMA_VERSION,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exported_at: exportedAt,
      mode: "account-safety-before-restore",
      user: { id: SESSION.user.id, email: SESSION.user.email || null },
      profile,
      preferences,
      vr_tracker: {
        source: "supabase",
        match_count: allMatches.length,
        matches: allMatches,
      },
      lounge_tracker: loungeBackup,
      mkcentral_stats: mkcentralStats,
      time_trial: timeTrialBackup,
      clan_wars: clanWarsBackup,
      matches: allMatches,
    };
    const filename = `mkwt_safety_before_restore_${sanitizeFilePart(profile.nickname || "account")}_${exportedAt.replace(/[:.]/g, "-")}.json`;
    window.downloadTextFile(filename, JSON.stringify(backup, null, 2));
    try {
      localStorage.setItem(RESTORE_SAFETY_BACKUP_KEY, JSON.stringify({
        filename,
        exported_at: exportedAt,
        summary: buildBackupSummary(allMatches.length, getLoungePayloadsFromBackup(backup), timeTrialBackup.entry_count, countClanWarsBackupMatches(clanWarsBackup)),
      }));
    } catch(e) { /* safe to ignore */ }
    return { filename, backup };
  }

  window.exportBackupJSON = async function(){
    try{
      if (typeof window.setStatus === "function") window.setStatus("Creating backup...", true);
      await ensureSession();
      await ensureProfile();

      const exportedAt = new Date().toISOString();
      const preferences = readLocalPreferencesForBackup();

      if (!window.SESSION?.user) {
        const guestMatches = loadGuestMatches();
        const loungeBackup = readLocalLoungeBackups();
        const timeTrialBackup = readGuestTimeTrialBackup();
        const clanWarsBackup = readLocalClanWarsBackup();
        const guestProfile = readGuestProfileForBackup(preferences);
        const mkcentralStats = readMkcentralStatsCacheForBackup(preferences, guestProfile);
        const backup = {
          app: "MKWT",
          version: BACKUP_SCHEMA_VERSION,
          schemaVersion: BACKUP_SCHEMA_VERSION,
          exported_at: exportedAt,
          mode: "guest",
          profile: guestProfile,
          preferences,
          vr_tracker: {
            source: "local_storage",
            match_count: guestMatches.length,
            matches: guestMatches,
          },
          lounge_tracker: loungeBackup,
          mkcentral_stats: mkcentralStats,
          time_trial: timeTrialBackup,
          clan_wars: clanWarsBackup,
          matches: guestMatches,
        };
        const filename = `mkwt_backup_guest_${exportedAt.slice(0, 10)}.json`;
        downloadTextFile(filename, JSON.stringify(backup, null, 2));
        const summary = buildBackupSummary(guestMatches.length, getLoungePayloadsFromBackup(backup), timeTrialBackup.entry_count, countClanWarsBackupMatches(clanWarsBackup));
        if (typeof window.setStatus === "function") window.setStatus(`Guest backup created (${summary}).`, true);
        return;
      }

      const allMatches = await readAccountMatchesForBackup();
      let loungeBackup = readLocalLoungeBackups();
      try {
        loungeBackup = await readAllLoungeCloudForBackup() || loungeBackup;
      } catch(e) {
        console.warn("Lounge cloud export fallback:", e);
      }
      const timeTrialBackup = await readAccountTimeTrialBackup();
      const clanWarsBackup = await readAccountClanWarsBackup();
      const profile = normalizeProfile(window.PROFILE || {}, preferences);
      const mkcentralStats = readMkcentralStatsCacheForBackup(preferences, profile);
      const backup = {
        app: "MKWT",
        version: BACKUP_SCHEMA_VERSION,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exported_at: exportedAt,
        mode: "account",
        user: { id: SESSION.user.id, email: SESSION.user.email || null },
        profile,
        preferences,
        vr_tracker: {
          source: "supabase",
          match_count: allMatches.length,
          matches: allMatches,
        },
        lounge_tracker: loungeBackup,
        mkcentral_stats: mkcentralStats,
        time_trial: timeTrialBackup,
        clan_wars: clanWarsBackup,
        matches: allMatches,
      };

      const filename = `mkwt_backup_${sanitizeFilePart(profile.nickname || "account")}_${exportedAt.slice(0, 10)}.json`;
      window.downloadTextFile(filename, JSON.stringify(backup, null, 2));
      const summary = buildBackupSummary(allMatches.length, getLoungePayloadsFromBackup(backup), timeTrialBackup.entry_count, countClanWarsBackupMatches(clanWarsBackup));
      if (typeof window.setStatus === "function") window.setStatus(`Backup created (${summary}).`, true);
    } catch(e){
      if (typeof window.setStatus === "function") window.setStatus("Backup failed: " + (e?.message || e), false);
      if (typeof window.setDebug === "function") window.setDebug(e?.stack || String(e));
      console.error(e);
    }
  };

  function ensureBackupConfirmDialog(){
    if (typeof document === "undefined" || !document.body) return null;
    let dialog = document.getElementById("mkwtBackupConfirmDialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "mkwtBackupConfirmDialog";
    dialog.className = "mkwtConfirmDialog";
    dialog.innerHTML = `
      <form class="mkwtConfirmDialog__panel">
        <div class="mkwtConfirmDialog__eyebrow" data-mkwt-confirm-eyebrow>Backup import</div>
        <h2 class="mkwtConfirmDialog__title" id="mkwtBackupConfirmTitle" data-mkwt-confirm-title></h2>
        <p class="mkwtConfirmDialog__body" data-mkwt-confirm-body></p>
        <div class="mkwtConfirmDialog__actions">
          <button class="btn2" data-mkwt-confirm-cancel type="button">Cancel</button>
          <button class="danger" data-mkwt-confirm-accept type="submit">Restore backup</button>
        </div>
      </form>
    `;
    dialog.setAttribute("aria-labelledby", "mkwtBackupConfirmTitle");
    document.body.appendChild(dialog);
    return dialog;
  }

  function confirmBackupAction({ eyebrow = "Backup import", title, body, confirmLabel = "Continue", cancelLabel = "Cancel", danger = true } = {}){
    const fallbackText = `${title || "Confirm"}\n\n${body || ""}`.trim();
    if (typeof window.HTMLDialogElement === "undefined" || !window.HTMLDialogElement.prototype.showModal) {
      return Promise.resolve(Boolean(window.confirm(fallbackText)));
    }

    const dialog = ensureBackupConfirmDialog();
    if (!dialog) return Promise.resolve(Boolean(window.confirm(fallbackText)));

    const form = dialog.querySelector("form");
    const titleEl = dialog.querySelector("[data-mkwt-confirm-title]");
    const bodyEl = dialog.querySelector("[data-mkwt-confirm-body]");
    const eyebrowEl = dialog.querySelector("[data-mkwt-confirm-eyebrow]");
    const confirmBtn = dialog.querySelector("[data-mkwt-confirm-accept]");
    const cancelBtn = dialog.querySelector("[data-mkwt-confirm-cancel]");
    if (!form || !titleEl || !bodyEl || !confirmBtn || !cancelBtn) {
      return Promise.resolve(Boolean(window.confirm(fallbackText)));
    }

    if (eyebrowEl) eyebrowEl.textContent = eyebrow || "Confirm";
    titleEl.textContent = title || "Confirm";
    bodyEl.textContent = body || "";
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = danger ? "danger" : "btn";
    cancelBtn.textContent = cancelLabel;

    return new Promise((resolve) => {
      let done = false;
      const previousFocus = document.activeElement;

      function cleanup(){
        form.removeEventListener("submit", onSubmit);
        cancelBtn.removeEventListener("click", onCancelClick);
        dialog.removeEventListener("cancel", onCancel);
        dialog.removeEventListener("click", onBackdropClick);
        dialog.removeEventListener("close", onClose);
      }

      function finish(ok){
        if (done) return;
        done = true;
        cleanup();
        if (dialog.open) dialog.close(ok ? "confirm" : "cancel");
        if (previousFocus && typeof previousFocus.focus === "function") {
          requestAnimationFrame(() => {
            try{ previousFocus.focus({ preventScroll: true }); }catch{ /* safe to ignore */ }
          });
        }
        resolve(Boolean(ok));
      }

      function onSubmit(ev){
        ev.preventDefault();
        finish(true);
      }

      function onCancelClick(){
        finish(false);
      }

      function onCancel(ev){
        ev.preventDefault();
        finish(false);
      }

      function onBackdropClick(ev){
        if (ev.target === dialog) finish(false);
      }

      function onClose(){
        finish(dialog.returnValue === "confirm");
      }

      form.addEventListener("submit", onSubmit);
      cancelBtn.addEventListener("click", onCancelClick);
      dialog.addEventListener("cancel", onCancel);
      dialog.addEventListener("click", onBackdropClick);
      dialog.addEventListener("close", onClose);

      try {
        dialog.returnValue = "";
        dialog.showModal();
        requestAnimationFrame(() => {
          try{ cancelBtn.focus({ preventScroll: true }); }catch{ /* safe to ignore */ }
        });
      } catch(e) {
        cleanup();
        resolve(Boolean(window.confirm(fallbackText)));
      }
    });
  }

  window.MKWT.confirmAction = confirmBackupAction;

  window.importBackupJSON = async function(file){
    try{
      if (!file) return;
      await ensureSession();

      const text = await file.text();
      const parsed = JSON.parse(text || "{}");
      const backup = normalizeBackupObject(parsed);
      const backupMatches = getBackupMatches(backup);
      if (!Array.isArray(backupMatches)) throw new Error("Backup has no match list.");
      const loungePayloads = getLoungePayloadsFromBackup(backup);
      const timeTrialPayload = getTimeTrialPayloadFromBackup(backup);
      const clanWarsPayload = getClanWarsPayloadFromBackup(backup);
      const legacyArrayImport = Array.isArray(parsed);

      if (!window.SESSION?.user) {
        const guestMatchCount = normalizeVrMatches(backupMatches).length;
        const loungeCount = loungePayloads.reduce((sum, payload) => sum + Number(payload?.session_count || payload?.sessions?.length || 0), 0);
        const ttLabel = timeTrialPayload.present ? String(timeTrialPayload.entry_count) : "kept";
        const cwLabel = clanWarsPayload.present ? String(countClanWarsBackupMatches(clanWarsPayload)) : "kept";
        const ok = legacyArrayImport ? true : await confirmBackupAction({
          title: "Import backup into Guest mode?",
          body:
            `WW matches: ${guestMatchCount}\n` +
            `Lounge Mogis: ${loungeCount}\n` +
            `Time Trial PBs: ${ttLabel}\n` +
            `Clan Wars matches: ${cwLabel}\n\n` +
            `Guest data in this browser will be replaced.`,
          confirmLabel: "Import backup",
          danger: true,
        });
        if (!ok) return;

        const vrResult = writeGuestMatchesFromBackup(backupMatches, { append: legacyArrayImport });
        const loungeResult = writeLocalLoungePayloadsFromBackup(loungePayloads);
        const ttResult = writeGuestTimeTrialFromBackup(timeTrialPayload);
        const cwResult = writeLocalClanWarsFromBackup(clanWarsPayload);
        if (!legacyArrayImport) {
          writeGuestProfileFromBackup(backup);
          applyLocalPreferencesFromBackup(backup);
          writeMkcentralStatsCacheFromBackup(backup);
        }
        const action = legacyArrayImport ? "Legacy guest import added" : "Guest restore complete";
        if (typeof window.setStatus === "function") {
          window.setStatus(`${action}. WW ${vrResult.matches} | Lounge ${loungeResult.sessions} | TT ${ttResult.skipped ? "kept" : ttResult.entries} | CW ${cwResult.skipped ? "kept" : cwResult.matches}. Reloading...`, true);
        }
        setTimeout(() => location.reload(), 350);
        return;
      }

      if (backup.mode === "guest") {
        const okGuest = await confirmBackupAction({
          title: "Import Guest backup?",
          body:
            `This looks like a Guest backup.\n\n` +
            `Import it into the currently signed-in account?\n` +
            `Only this account will be changed.`,
          confirmLabel: "Import into account",
          danger: true,
        });
        if (!okGuest) return;
      }

      const uniqueBackup = uniqueVrMatchesByFingerprint(backupMatches);
      const loungeCount = countBackupLoungeMogis(loungePayloads);
      const ttLabel = timeTrialPayload.present ? String(timeTrialPayload.entry_count) : "kept";
      const cwLabel = clanWarsPayload.present ? String(countClanWarsBackupMatches(clanWarsPayload)) : "kept";
      let currentCounts = null;
      try {
        currentCounts = await readCurrentAccountRestoreCounts();
      } catch(e) {
        console.warn("Could not read current account counts before restore:", e);
      }
      const warnings = buildRestoreWarnings({
        backupMatches: uniqueBackup.length,
        loungePayloads,
        timeTrialPayload,
        clanWarsPayload,
        currentCounts,
      });
      const ok = await confirmBackupAction({
        title: "Restore from backup?",
        body:
          `Backup file: WW ${uniqueBackup.length} | Lounge ${loungeCount} (${formatLoungePayloadCounts(loungePayloads)}) | TT ${ttLabel} | CW ${cwLabel}\n` +
          `${formatCurrentAccountCounts(currentCounts)}\n\n` +
          `${warnings.length ? `Warning:\n${warnings.join("\n")}\n\n` : ""}` +
          `A safety backup of the current account will be downloaded before anything is replaced.`,
        confirmLabel: "Restore backup",
        danger: true,
      });
      if (!ok) return;

      if (warnings.length) {
        const okRisk = await confirmBackupAction({
          title: "Backup has fewer saved items",
          body:
            `${warnings.join("\n")}\n\n` +
            `Continuing can remove current cloud rows. Only continue if this is the exact backup you want to restore.`,
          confirmLabel: "Replace anyway",
          danger: true,
        });
        if (!okRisk) return;
      }

      if (typeof window.setStatus === "function") window.setStatus("Creating safety backup before restore...", true);
      try {
        const safety = await createAccountRestoreSafetyBackup();
        if (typeof window.setStatus === "function") window.setStatus(`Safety backup downloaded: ${safety.filename}`, true);
      } catch(e) {
        const okNoSafety = await confirmBackupAction({
          title: "Safety backup failed",
          body:
            `The current account could not be exported before restore:\n` +
            `${e?.message || e}\n\n` +
            `Restoring without a safety backup is risky.`,
          confirmLabel: "Continue without safety backup",
          danger: true,
        });
        if (!okNoSafety) {
          if (typeof window.setStatus === "function") window.setStatus("Restore cancelled. Safety backup failed.", false);
          return;
        }
      }

      if (typeof window.setStatus === "function") window.setStatus("Restoring backup...", true);
      const vrResult = await restoreVrMatchesCloud(uniqueBackup);

      let loungeRestored = { mogis: 0, races: 0 };
      for (const payload of loungePayloads) {
        const restored = await restoreLoungeCloud(payload);
        loungeRestored.mogis += restored.mogis;
        loungeRestored.races += restored.races;
      }
      const restoredCounts = await readCurrentAccountRestoreCounts();
      if (restoredCounts && restoredCounts.lounge !== loungeCount) {
        throw new Error(`Restore verification failed: backup has ${loungeCount} Lounge Mogis, cloud now has ${restoredCounts.lounge}.`);
      }

      const ttResult = await restoreAccountTimeTrial(timeTrialPayload);
      const cwResult = await restoreAccountClanWars(clanWarsPayload);
      applyLocalPreferencesFromBackup(backup);
      writeMkcentralStatsCacheFromBackup(backup);
      const latestVr = await getLatestVrAfterImport();
      await restoreAccountProfileFromBackup(backup, latestVr);

      if (typeof window.setStatus === "function") window.setStatus(
        `Restore complete. WW ${vrResult.backup} | Lounge ${loungeRestored.mogis} | TT ${ttResult.skipped ? "kept" : ttResult.inserted} | CW ${cwResult.skipped ? "kept" : cwResult.inserted}. Reloading...`,
        true
      );
      setTimeout(()=>location.reload(), 350);
    } catch(e){
      if (typeof window.setStatus === "function") window.setStatus("Import failed: " + (e?.message || e), false);
      if (typeof window.setDebug === "function") window.setDebug(e?.stack || String(e));
      console.error(e);
    }
  };

  function wireNav(){
    const btnExport = $id("btnExport");
    const btnLogout = $id("btnLogout");
    const fileImport = $id("fileImport");

    function clearSupabaseTokens(storage){
      try{
        const keys = [];
        for(let i=0;i<storage.length;i++){
          const k = storage.key(i);
          if(!k) continue;
          if(k.startsWith("sb-") && k.includes("auth-token")) keys.push(k);
          if(k === "mkwt_post_login_redirect") keys.push(k);
        }
        keys.forEach(k=>{ try{ storage.removeItem(k); }catch{ /* safe to ignore */ } });
      }catch{ /* safe to ignore */ }
    }

    async function hardLogout(){
      try{ await window.supabaseClient?.auth?.signOut?.(); }catch(e){ console.warn(e); }
      try{ syncSharedSession(null, null); }catch(e){ /* safe to ignore */ }
      clearSupabaseTokens(localStorage);
      clearSupabaseTokens(sessionStorage);
      location.replace("login.html");
    }

    if (btnExport) btnExport.onclick = null;
    if (btnLogout) btnLogout.onclick = null;
    if (fileImport) fileImport.onchange = null;

    btnExport?.addEventListener("click", () => window.exportBackupJSON());
    fileImport?.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (file) window.importBackupJSON(file);
      ev.target.value = "";
    });
    btnLogout?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hardLogout();
    }, { capture: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireNav);
  else wireNav();
})();

// Service Worker registration is handled by mkwt_public.js (loaded on all pages).
