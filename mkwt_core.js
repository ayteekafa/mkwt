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

  if (typeof window.exportBackupJSON !== "function") {
    window.exportBackupJSON = async function(){
      try{
        if (typeof window.setStatus === "function") window.setStatus("Creating backup…", true);
        await ensureSession();
        await ensureProfile();
        if (!window.SESSION?.user) {
          // Guest: export local matches
          const backup = {
            version: 1,
            exported_at: new Date().toISOString(),
            mode: "guest",
            matches: loadGuestMatches()
          };
          downloadTextFile("mkwt_guest_backup.json", JSON.stringify(backup, null, 2));
          if (typeof window.setStatus === "function") window.setStatus("✅ Guest export created.", true);
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

        const backup = {
          app: "MKWT",
          version: 1,
          exported_at: new Date().toISOString(),
          user: { id: SESSION.user.id, email: SESSION.user.email || null },
          profile: {
            nickname: window.PROFILE?.nickname ?? null,
            current_vr: window.PROFILE?.current_vr ?? null
          },
          matches: allMatches
        };

        const filename =
          `mkwt_backup_${String(window.PROFILE?.nickname || "user").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0,10)}.json`;

        window.downloadTextFile(filename, JSON.stringify(backup, null, 2));
        if (typeof window.setStatus === "function") window.setStatus(`✅ Backup created (${allMatches.length} matches).`, true);
      } catch(e){
        if (typeof window.setStatus === "function") window.setStatus("Backup failed: " + (e?.message || e), false);
        if (typeof window.setDebug === "function") window.setDebug(e?.stack || String(e));
        console.error(e);
      }
    };
  }

  // Always override to ensure consistent navbar import behavior across pages.
  // TRUE RESTORE: dedupes by fingerprint, deletes DB rows not in backup, inserts missing rows
  window.importBackupJSON = async function(file){
    try{
      if (!file) return;

      await ensureSession();
      if (!window.SESSION?.user) {
        // Guest: import into local storage
        const text = await file.text();
        const parsed = JSON.parse(text || "{}");
        const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.matches) ? parsed.matches : []);
        if (!Array.isArray(incoming)) throw new Error("Invalid backup file.");
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

      if (!backup || backup.app !== "MKWT" || !Array.isArray(backup.matches)) {
        if (typeof window.setStatus === "function") window.setStatus("❌ This file isn't a valid MKWT backup.", false);
        return;
      }

      // Deduplicate backup by fingerprint (keep first occurrence in chronological order)
      const sortedBackup = [...backup.matches].sort((a,b)=> String(a?.created_at||"").localeCompare(String(b?.created_at||"")));
      const uniqueBackup = [];
      const backupFp = new Set();
      for (const r of sortedBackup) {
        const fp = fingerprintMatch(r);
        if (!backupFp.has(fp)) { backupFp.add(fp); uniqueBackup.push(r); }
      }

      const ok = confirm(
        `Restore from backup?\n\n` +
        `Matches in file: ${uniqueBackup.length}\n\n` +
        `This will make your match history EXACTLY match the backup.\n` +
        `All matches NOT in the backup will be deleted.`
      );
      if (!ok) return;

      if (typeof window.setStatus === "function") window.setStatus("Restoring… (delete + dedupe + insert)", true);

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
        `✅ Restore complete. Backup: ${uniqueBackup.length} | Deleted: ${deleted} | Inserted: ${inserted}. Reloading…`,
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

// ========= Service Worker =========
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
