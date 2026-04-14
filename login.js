// ===== Supabase =====
const SUPABASE_URL  = "https://imxlssgtzzdfgdscubdx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
const TURNSTILE_SITE_KEY = "0x4AAAAAACbMzpocodRPIf88";

const $ = (id) => (window.MKWT?.$ ? window.MKWT.$(id) : document.getElementById(id));
function setStatus(msg, ok=true){ window.MKWT?.setStatus?.($("status"), msg, ok); }

function createClient(storage){
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      storage: storage,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

// Backup keys for iOS PWA/Safari edge-cases.
const BACKUP_KEY_LOCAL = 'mkwt_backup_session_local_v1';
const BACKUP_KEY_SESS  = 'mkwt_backup_session_session_v1';
function writeBackup(stay, session){
  try{
    const payload = { access_token: session?.access_token, refresh_token: session?.refresh_token };
    if (!payload.access_token || !payload.refresh_token) return;
    if (stay) localStorage.setItem(BACKUP_KEY_LOCAL, JSON.stringify(payload));
    else sessionStorage.setItem(BACKUP_KEY_SESS, JSON.stringify(payload));
  }catch(e){}
}

let captchaWidgetId = null;
let captchaToken = "";
function renderCaptcha(){
  try{
    if (!window.turnstile) return;
    const box = $("captchaBox");
    if (!box) return;
    box.innerHTML = "";
    captchaToken = "";
    captchaWidgetId = window.turnstile.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token)=>{ captchaToken = token || ""; },
      "expired-callback": ()=>{ captchaToken=""; },
      "error-callback": ()=>{ captchaToken=""; }
    });
  }catch(e){
    console.warn(e);
  }
}

async function login(){
  const email = ($("email").value||"").trim();
  const password = $("password").value||"";
  if(!email || !password){ setStatus("Please enter email and password.", false); return; }
  if(!captchaToken){ setStatus("Please complete the captcha first.", false); return; }

  const stay = $("stay").checked;
  // Persist preference so other pages can prioritize the right storage.
  try{ localStorage.setItem('mkwt_auth_storage', stay ? 'local' : 'session'); }catch(e){}

  // Create client for chosen storage, but also explicitly set the session into the
  // intended storage to make "Stay logged" robust across browsers.
  const storage = stay ? localStorage : sessionStorage;
  const client = createClient(storage);

  $("btnLogin").disabled = true;
  try{
    setStatus("Signing in…", true);

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken }
    });
    if (error) throw error;

    // Ensure the session is stored in the intended storage.
    try{
      const s = data?.session;
      if (s?.access_token && s?.refresh_token) {
        // Save a lightweight backup to survive some iOS PWA storage quirks.
        writeBackup(stay, s);
        if (stay) {
          const cLocal = createClient(localStorage);
          await cLocal.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
          // Avoid stale parallel sessions.
          try{ await createClient(sessionStorage).auth.signOut(); }catch(e){}
          try{ sessionStorage.removeItem(BACKUP_KEY_SESS); }catch(e){}
        } else {
          const cSess = createClient(sessionStorage);
          await cSess.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
          // Avoid accidentally staying logged in via localStorage.
          try{ await createClient(localStorage).auth.signOut(); }catch(e){}
          try{ localStorage.removeItem(BACKUP_KEY_LOCAL); }catch(e){}
        }
      }
    }catch(e){
      // Non-fatal; fallback to default storage behavior.
      console.warn(e);
    }

    // mode: account
    try{ localStorage.setItem('mkwt_mode','account'); localStorage.setItem('mkwt_last_mode','account'); }catch(e){}

    // Offer to import Guest data if the account currently has 0 matches
    try{
      const guest = JSON.parse(localStorage.getItem("mkwt_guest_matches_v1") || "[]") || [];
      if (guest.length > 0 && data?.user?.id){
        const { count, error: cErr } = await client
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("user_id", data.user.id);
        if (!cErr && (count || 0) === 0){
          sessionStorage.setItem("mkwt_offer_import_guest", "1");
        }
      }
    }catch(e){}

    setStatus("✅ Logged in.", true);
    window.location.href = "tracker.html";
  }catch(e){
    setStatus("Login failed: " + (e?.message || e), false);
    try{ if (window.turnstile && captchaWidgetId!=null) window.turnstile.reset(captchaWidgetId); }catch(_){}
    captchaToken="";
  }finally{
    $("btnLogin").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  $("btnLogin").addEventListener("click", login);
  $("btnGuest").addEventListener("click", ()=>{
  try{
    localStorage.setItem("mkwt_last_mode","guest");
    localStorage.setItem("mkwt_mode","guest");
    const lp = localStorage.getItem("mkwt_last_page");
    if (lp) localStorage.removeItem("mkwt_last_page");
    window.location.href = lp || "tracker.html";
  }catch(e){ window.location.href="tracker.html"; }
});
  // Enter key
  $("password").addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });
});

// Turnstile loads async
window.onload = ()=>{ renderCaptcha(); };
