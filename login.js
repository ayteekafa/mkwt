// ===== Supabase =====
const SUPABASE_URL = "https://imxlssgtzzdfgdscubdx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";

const $ = (id) => (window.MKWT?.$ ? window.MKWT.$(id) : document.getElementById(id));
const CLIENT_CACHE = {};

function setStatus(msg, ok = true) {
  window.MKWT?.setStatus?.($("status"), msg, ok);
}

function createClient(storage, key) {
  if (CLIENT_CACHE[key]) return CLIENT_CACHE[key];
  CLIENT_CACHE[key] = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      storage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return CLIENT_CACHE[key];
}

function getClient(mode) {
  return createClient(mode === "session" ? sessionStorage : localStorage, mode === "session" ? "session" : "local");
}

function clearSupabaseKeys(storage) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      if (key.startsWith("sb-") && key.includes("auth-token")) keys.push(key);
    }
    keys.forEach((key) => {
      try { storage.removeItem(key); } catch (e) {}
    });
  } catch (e) {}
}

const BACKUP_KEY_LOCAL = "mkwt_backup_session_local_v1";
const BACKUP_KEY_SESS = "mkwt_backup_session_session_v1";

function writeBackup(stay, session) {
  try {
    const payload = {
      access_token: session?.access_token,
      refresh_token: session?.refresh_token,
    };
    if (!payload.access_token || !payload.refresh_token) return;
    if (stay) localStorage.setItem(BACKUP_KEY_LOCAL, JSON.stringify(payload));
    else sessionStorage.setItem(BACKUP_KEY_SESS, JSON.stringify(payload));
  } catch (e) {}
}

async function syncSessionToPreferredStorage(stay, session) {
  writeBackup(stay, session);
  if (!session?.access_token || !session?.refresh_token) return;

  if (stay) {
    const localClient = getClient("local");
    await localClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    clearSupabaseKeys(sessionStorage);
    try { sessionStorage.removeItem(BACKUP_KEY_SESS); } catch (e) {}
  } else {
    const sessionClient = getClient("session");
    await sessionClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    clearSupabaseKeys(localStorage);
    try { localStorage.removeItem(BACKUP_KEY_LOCAL); } catch (e) {}
  }
}

async function maybeOfferGuestImport(client, userId) {
  try {
    const guest = JSON.parse(localStorage.getItem("mkwt_guest_matches_v1") || "[]") || [];
    if (!guest.length || !userId) return;

    const { count, error } = await client
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!error && (count || 0) === 0) {
      sessionStorage.setItem("mkwt_offer_import_guest", "1");
    }
  } catch (e) {}
}

async function finalizeLogin(stay, session, user) {
  try {
    localStorage.setItem("mkwt_auth_storage", stay ? "local" : "session");
  } catch (e) {}

  const storage = stay ? localStorage : sessionStorage;
  const client = getClient(stay ? "local" : "session");
  await syncSessionToPreferredStorage(stay, session);

  try {
    localStorage.setItem("mkwt_mode", "account");
    localStorage.setItem("mkwt_last_mode", "account");
  } catch (e) {}

  await maybeOfferGuestImport(client, user?.id || session?.user?.id || null);
  setStatus("Logged in.", true);
  window.location.href = "tracker.html";
}

async function login() {
  const email = ($("email").value || "").trim();
  const password = $("password").value || "";
  const stay = $("stay").checked;

  if (!email || !password) {
    setStatus("Please enter email and password.", false);
    return;
  }

  $("btnLogin").disabled = true;
  try {
    setStatus("Signing in...", true);

    const client = getClient(stay ? "local" : "session");
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    await finalizeLogin(stay, data?.session, data?.user);
  } catch (e) {
    setStatus("Login failed: " + (e?.message || e), false);
  } finally {
    $("btnLogin").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("loginForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    login();
  });
  $("btnGuest").addEventListener("click", () => {
    try {
      localStorage.setItem("mkwt_last_mode", "guest");
      localStorage.setItem("mkwt_mode", "guest");
      const lastPage = localStorage.getItem("mkwt_last_page");
      if (lastPage) localStorage.removeItem("mkwt_last_page");
      window.location.href = lastPage || "tracker.html";
    } catch (e) {
      window.location.href = "tracker.html";
    }
  });

});
