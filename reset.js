const SUPABASE_URL  = "https://imxlssgtzzdfgdscubdx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth:{
    storage: sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const $ = (id)=>document.getElementById(id);
function setStatus(msg, ok=true){
  const el = $("status");
  el.textContent = msg || "";
  el.style.color = ok ? "var(--muted)" : "#ff6b6b";
}

async function ensureRecoverySession(){
  // When coming from the Supabase recovery email, the session is parsed from the URL.
  try{
    const { data, error } = await client.auth.getSession();
    if (error) console.warn(error);
    if (data?.session) return true;
  }catch(e){ console.warn(e); }

  // Give the SDK a moment in case the URL parsing is still in progress.
  const start = Date.now();
  while(Date.now()-start < 2000){
    await new Promise(r=>setTimeout(r, 150));
    try{
      const { data } = await client.auth.getSession();
      if (data?.session) return true;
    }catch{}
  }
  return false;
}

$("btnSet").onclick = async () => {
  const p1 = String($("p1").value || "");
  const p2 = String($("p2").value || "");

  if(p1.length < 6){ setStatus("Password must be at least 6 characters.", false); return; }
  if(p1 !== p2){ setStatus("Passwords do not match.", false); return; }

  setStatus("Updating password…");

  const ok = await ensureRecoverySession();
  if(!ok){
    setStatus("Reset session not found. Please open the newest reset email again.", false);
    return;
  }

  const { error } = await client.auth.updateUser({ password: p1 });
  if(error){ setStatus(error.message, false); return; }

  setStatus("✅ Password updated. Redirecting to login…");
  setTimeout(()=>location.replace("login.html"), 900);
};

// On load: just show a hint.
setStatus("Open this page from your reset email link.");
