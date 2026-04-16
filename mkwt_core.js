/* =========================================================
   MKWT Core – Shared logic for tracker, stats, sessions, settings
   ========================================================= */

// ========= Constants =========
const SUPABASE_URL  = "https://imxlssgtzzdfgdscubdx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
const GUEST_KEY = "mkwt_guest_matches_v1";
const BACKUP_KEY_LOCAL = "mkwt_backup_session_local_v1";
const BACKUP_KEY_SESS  = "mkwt_backup_session_session_v1";

// ========= Supabase client (localStorage + sessionStorage) =========
function makeClient(storage) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  });
}

const clientLocal = makeClient(localStorage);
const clientSess  = makeClient(sessionStorage);

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
    const c = pref === 'session' ? clientSess : clientLocal;
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
  if(!email) return "–";
  const [local, domain] = email.split("@");
  if(!domain) return email;
  const vis = local.length <= 2 ? local : local[0] + "•".repeat(Math.min(local.length-2, 4)) + local[local.length-1];
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
    const t = (mode === 'guest') ? 'dark' : (localStorage.getItem('mkwt_theme') || 'dark');
    document.documentElement.dataset.theme = t;
    const c=(t==='light')?'#f3f4f6':(t==='rose')?'#f7f0f4':(t==='purple')?'#05060a':(t==='green')?'#05060a':(t==='red')?'#05060a':(t==='dendo')?'#05060a':'#07080a';
    const m=document.querySelector('meta[name="theme-color"]');
    if(m) m.setAttribute('content', c);
  }catch(e){ /* safe to ignore */ }
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

  ({ data:{ session }, error } = await clientLocal.auth.getSession());
  if (error && typeof onDebug === "function") onDebug("getSession(local) error: " + JSON.stringify(error, null, 2));
  if (session) return { client: clientLocal, session, source: "local" };

  ({ data:{ session }, error } = await clientSess.auth.getSession());
  if (error && typeof onDebug === "function") onDebug("getSession(session) error: " + JSON.stringify(error, null, 2));
  if (session) return { client: clientSess, session, source: "session" };

  if (tryBackupRestore && await tryRestoreFromBackup()) {
    ({ data:{ session } } = await clientLocal.auth.getSession());
    if (session) return { client: clientLocal, session, source: "backup-local" };

    ({ data:{ session } } = await clientSess.auth.getSession());
    if (session) return { client: clientSess, session, source: "backup-session" };
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
      if (window.SESSION && window.SESSION.user) return;
      if (!window.supabaseClient?.auth?.getSession) return;
      const { data } = await supabaseClient.auth.getSession();
      window.SESSION = data?.session || null;
    }catch(e){ console.warn(e); }
  }

  async function ensureProfile(){
    try{
      if (typeof window.loadProfile === "function") { await window.loadProfile(); return; }
      if (!window.supabaseClient || !window.SESSION?.user) return;
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("nickname,current_vr")
        .or(`id.eq.${SESSION.user.id},user_id.eq.${SESSION.user.id}`)
        .maybeSingle();
      if (!error) window.PROFILE = data || null;
    }catch(e){ console.warn(e); }
  }

  async function readLoungeCloudForBackup(){
    if (!window.supabaseClient || !window.SESSION?.user?.id) return null;
    const uid = window.SESSION.user.id;

    const { data: mogis, error: mogiError } = await supabaseClient
      .from("lounge_mogis")
      .select("id, created_at, completed_at, updated_at, status, total_points, race_count, disconnects")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (mogiError) throw mogiError;

    const { data: races, error: raceError } = await supabaseClient
      .from("lounge_races")
      .select("id, mogi_id, race_number, track, lobby_size, placement, points, disconnect, created_at, updated_at")
      .eq("user_id", uid)
      .order("race_number", { ascending: true });
    if (raceError) throw raceError;

    const racesByMogi = new Map();
    for (const race of races || []) {
      if (!racesByMogi.has(race.mogi_id)) racesByMogi.set(race.mogi_id, []);
      racesByMogi.get(race.mogi_id).push(race);
    }

    const toLocalRace = (race) => ({
      track: race.track,
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
        races: mogiRaces,
        totalPoints: mogi.total_points,
        disconnects: mogi.disconnects,
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
      current_mogi: active ? toLocalMogi(active) : null,
      session_count: sessions.length,
      sessions,
    };
  }

  if (typeof window.exportBackupJSON !== "function") {
    window.exportBackupJSON = async function(){
      try{
        if (typeof window.setStatus === "function") window.setStatus("Creating backup…", true);
        await ensureSession();
        await ensureProfile();

        const exportedAt = new Date().toISOString();
        const loungeKeys = window.MKWT_LOUNGE_STORAGE || { current: 'mkwt_lounge_current_v1', sessions: 'mkwt_lounge_sessions_v1' };
        const safeReadJson = (key, fallback) => {
          try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
          } catch(e) {
            return fallback;
          }
        };
        const loungeCurrent = safeReadJson(loungeKeys.current, null);
        const loungeSessions = safeReadJson(loungeKeys.sessions, []);

        if (!window.SESSION?.user) {
          const guestMatches = loadGuestMatches();
          const backup = {
            app: "MKWT",
            version: 2,
            exported_at: exportedAt,
            mode: "guest",
            vr_tracker: {
              source: "local_storage",
              match_count: guestMatches.length,
              matches: guestMatches
            },
            lounge_tracker: {
              source: "local_storage",
              current_mogi: loungeCurrent,
              session_count: Array.isArray(loungeSessions) ? loungeSessions.length : 0,
              sessions: Array.isArray(loungeSessions) ? loungeSessions : []
            },
            matches: guestMatches
          };
          downloadTextFile("mkwt_guest_backup.json", JSON.stringify(backup, null, 2));
          if (typeof window.setStatus === "function") window.setStatus(`✅ Guest export created (${guestMatches.length} VR matches, ${(Array.isArray(loungeSessions) ? loungeSessions.length : 0)} Lounge Mogis).`, true);
          return;
        }

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

        let loungeBackup = {
          source: "local_storage",
          current_mogi: loungeCurrent,
          session_count: Array.isArray(loungeSessions) ? loungeSessions.length : 0,
          sessions: Array.isArray(loungeSessions) ? loungeSessions : []
        };
        try {
          loungeBackup = await readLoungeCloudForBackup() || loungeBackup;
        } catch(e) {
          console.warn("Lounge cloud export fallback:", e);
        }

        const backup = {
          app: "MKWT",
          version: 2,
          exported_at: exportedAt,
          user: { id: SESSION.user.id, email: SESSION.user.email || null },
          profile: {
            nickname: window.PROFILE?.nickname ?? null,
            current_vr: window.PROFILE?.current_vr ?? null
          },
          vr_tracker: {
            source: "supabase",
            match_count: allMatches.length,
            matches: allMatches
          },
          lounge_tracker: loungeBackup,
          matches: allMatches
        };

        const filename =
          `mkwt_backup_${String(window.PROFILE?.nickname || "user").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0,10)}.json`;

        window.downloadTextFile(filename, JSON.stringify(backup, null, 2));
        if (typeof window.setStatus === "function") window.setStatus(`✅ Backup created (${allMatches.length} VR matches, ${loungeBackup.session_count || 0} Lounge Mogis).`, true);
      } catch(e){
        if (typeof window.setStatus === "function") window.setStatus("Backup failed: " + (e?.message || e), false);
        if (typeof window.setDebug === "function") window.setDebug(e?.stack || String(e));
        console.error(e);
      }
    };
  }

  // Always override to ensure consistent navbar import behavior across pages.
  // TRUE RESTORE: dedupes by fingerprint, deletes DB rows not in backup, inserts missing rows
  async function restoreLoungeCloud(loungePayload){
    if (!loungePayload || !window.supabaseClient || !window.SESSION?.user?.id) {
      return { mogis: 0, races: 0 };
    }

    const uid = window.SESSION.user.id;
    const sessions = Array.isArray(loungePayload.sessions) ? loungePayload.sessions : [];
    const current = loungePayload.current_mogi && Array.isArray(loungePayload.current_mogi.races)
      ? loungePayload.current_mogi
      : null;

    const { data: existing, error: loadErr } = await supabaseClient
      .from("lounge_mogis")
      .select("id")
      .eq("user_id", uid);
    if (loadErr) throw loadErr;

    const existingIds = (existing || []).map(row => row.id);
    for (let i = 0; i < existingIds.length; i += 100) {
      const batchIds = existingIds.slice(i, i + 100);
      const { error } = await supabaseClient
        .from("lounge_mogis")
        .delete()
        .in("id", batchIds)
        .eq("user_id", uid);
      if (error) throw error;
    }

    let mogis = 0;
    let races = 0;

    async function insertMogi(raw, status){
      const rawRaces = Array.isArray(raw?.races) ? raw.races : [];
      if (!raw || (status === "active" && rawRaces.length === 0)) return;

      const raceCount = Math.min(rawRaces.length, 12);
      const keptRaces = rawRaces.slice(0, raceCount);
      const totalPoints = keptRaces.reduce((sum, race) => sum + Number(race?.points || 0), 0);
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
          total_points: totalPoints,
          race_count: raceCount,
          disconnects,
        })
        .select("id")
        .single();
      if (mogiErr) throw mogiErr;
      mogis++;

      const raceRows = keptRaces.map((race, index) => {
        const disconnect = !!race?.disconnect;
        return {
          mogi_id: mogi.id,
          user_id: uid,
          race_number: index + 1,
          track: String(race?.track || ""),
          lobby_size: Number(race?.lobbySize ?? race?.lobby_size ?? 12),
          placement: disconnect ? null : Number(race?.placement),
          points: Number(race?.points ?? (disconnect ? 1 : 0)),
          disconnect,
          created_at: race?.created_at || createdAt,
        };
      });

      if (raceRows.length) {
        const { error: raceErr } = await supabaseClient.from("lounge_races").insert(raceRows);
        if (raceErr) throw raceErr;
        races += raceRows.length;
      }
    }

    for (const session of sessions) {
      await insertMogi(session, "completed");
    }
    if (current && current.races.length) {
      await insertMogi(current, "active");
    }

    return { mogis, races };
  }

  window.importBackupJSON = async function(file){
    try{
      if (!file) return;

      await ensureSession();
      if (!window.SESSION?.user) {
        // Guest: import into local storage
        const text = await file.text();
        const parsed = JSON.parse(text || "{}");
        const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.matches) ? parsed.matches : (Array.isArray(parsed?.vr_tracker?.matches) ? parsed.vr_tracker.matches : []));
        if (!Array.isArray(incoming)) throw new Error("Invalid backup file.");
        const loungePayload = parsed?.lounge_tracker || null;
        if (loungePayload && typeof localStorage !== 'undefined') {
          try {
            if ('current_mogi' in loungePayload) localStorage.setItem((window.MKWT_LOUNGE_STORAGE?.current || 'mkwt_lounge_current_v1'), JSON.stringify(loungePayload.current_mogi ?? null));
            if (Array.isArray(loungePayload.sessions)) localStorage.setItem((window.MKWT_LOUNGE_STORAGE?.sessions || 'mkwt_lounge_sessions_v1'), JSON.stringify(loungePayload.sessions));
          } catch(e){}
        }
        const current = loadGuestMatches();
        const ids = new Set(current.map(m => String(m.id)));
        let added = 0;
        for (const raw of incoming) {
          if (!raw) continue;
          const m = {
            id: String(raw.id || ("g_" + Date.now() + "_" + Math.random().toString(16).slice(2))),
            created_at: raw.created_at || new Date().toISOString(),
            intermission: raw.intermission ?? null,
            track: raw.track ?? "",
            vr_change: Number(raw.vr_change ?? 0),
            vr_after: Number(raw.vr_after ?? 0),
            opponents: raw.opponents ?? null,
            placement: raw.placement ?? null
          };
          if (ids.has(m.id)) m.id = m.id + "_" + Math.random().toString(16).slice(2);
          ids.add(m.id);
          current.push(m);
          added++;
        }
        saveGuestMatches(current);
        if (typeof window.setStatus === "function") window.setStatus(`✅ Guest import complete. Added ${added} matches.`, true);
        try { if (typeof window.refreshAll === "function") window.refreshAll(); } catch(e) {}
        return;
      }

      const text = await file.text();
      const backup = JSON.parse(text);
      const backupMatches = Array.isArray(backup?.matches) ? backup.matches : (Array.isArray(backup?.vr_tracker?.matches) ? backup.vr_tracker.matches : null);
      const loungePayload = backup?.lounge_tracker || null;
      if (loungePayload && typeof localStorage !== 'undefined') {
        try {
          if ('current_mogi' in loungePayload) localStorage.setItem((window.MKWT_LOUNGE_STORAGE?.current || 'mkwt_lounge_current_v1'), JSON.stringify(loungePayload.current_mogi ?? null));
          if (Array.isArray(loungePayload.sessions)) localStorage.setItem((window.MKWT_LOUNGE_STORAGE?.sessions || 'mkwt_lounge_sessions_v1'), JSON.stringify(loungePayload.sessions));
        } catch(e){}
      }

      if (!backup || backup.app !== "MKWT" || !Array.isArray(backupMatches)) {
        if (typeof window.setStatus === "function") window.setStatus("❌ This file isn't a valid MKWT backup.", false);
        return;
      }

      // Deduplicate backup by fingerprint (keep first occurrence in chronological order)
      const sortedBackup = [...backupMatches].sort((a,b)=> String(a?.created_at||"").localeCompare(String(b?.created_at||"")));
      const uniqueBackup = [];
      const backupFp = new Set();
      for (const r of sortedBackup) {
        const fp = fingerprintMatch(r);
        if (!backupFp.has(fp)) { backupFp.add(fp); uniqueBackup.push(r); }
      }

      const loungeCount = Array.isArray(loungePayload?.sessions) ? loungePayload.sessions.length : 0;
      const ok = confirm(
        `Restore from backup?\n\n` +
        `Matches in file: ${uniqueBackup.length}\n\n` +
        `Lounge Mogis in file: ${loungeCount}\n\n` +
        `This will make your match history EXACTLY match the backup.\n` +
        `All matches and Lounge Mogis NOT in the backup will be deleted.`
      );
      if (!ok) return;

      if (typeof window.setStatus === "function") window.setStatus("Restoring… (VR + Lounge cloud)", true);

      // --- Load all existing matches ---
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

      // --- Delete extras ---
      let deleted = 0;
      const delBatchSize = 500;
      for (let i = 0; i < toDeleteIds.length; i += delBatchSize) {
        const batchIds = toDeleteIds.slice(i, i + delBatchSize);
        const { error } = await supabaseClient.from("matches").delete().in("id", batchIds);
        if (error) throw error;
        deleted += batchIds.length;
      }

      // --- Insert missing rows ---
      const toInsert = [];
      for (const r of uniqueBackup) {
        const fp = fingerprintMatch(r);
        if (!existingKeepFp.has(fp)) {
          toInsert.push({
            user_id: SESSION.user.id,
            created_at: r.created_at,
            intermission: r.intermission ?? null,
            track: r.track ?? null,
            vr_change: r.vr_change ?? 0,
            vr_after: r.vr_after ?? null,
            opponents: r.opponents ?? null,
            placement: r.placement ?? null,
          });
          existingKeepFp.add(fp);
        }
      }

      let inserted = 0;
      const insBatchSize = 500;
      for (let i = 0; i < toInsert.length; i += insBatchSize) {
        const batch = toInsert.slice(i, i + insBatchSize);
        const { error } = await supabaseClient.from("matches").insert(batch);
        if (error) throw error;
        inserted += batch.length;
      }

      const loungeRestored = await restoreLoungeCloud(loungePayload);

      // Update profile current_vr from latest match
      try{
        const { data: latestData, error: latestErr } = await supabaseClient
          .from("matches")
          .select("vr_after, created_at")
          .eq("user_id", SESSION.user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!latestErr && latestData && latestData[0] && Number.isFinite(Number(latestData[0].vr_after))) {
          const latestVr = Number(latestData[0].vr_after);
          const payload = { current_vr: latestVr, updated_at: new Date().toISOString() };
          let up = await supabaseClient.from("profiles").update(payload).or(`id.eq.${SESSION.user.id},user_id.eq.${SESSION.user.id}`);
          if (up?.error) {
            await supabaseClient.from("profiles").update(payload).eq("id", SESSION.user.id);
          }
        }
      }catch(e){ console.warn(e); }

      if (typeof window.setStatus === "function") window.setStatus(
        `✅ Restore complete. VR Backup: ${uniqueBackup.length} | Deleted: ${deleted} | Inserted: ${inserted} | Lounge Mogis: ${loungeRestored.mogis} | Lounge races: ${loungeRestored.races}. Reloading…`,
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
      try{ await clientLocal?.auth?.signOut?.(); }catch(e){ console.warn(e); }
      try{ await clientSess?.auth?.signOut?.(); }catch(e){ console.warn(e); }
      try{ await window.supabaseClient?.auth?.signOut?.(); }catch(e){ console.warn(e); }
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
