// ===== Supabase =====
const SUPABASE_URL = "https://imxlssgtzzdfgdscubdx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";

const $ = (id) => (window.MKWT?.$ ? window.MKWT.$(id) : document.getElementById(id));
const CLIENT_CACHE = {};
const USERNAME_EMAIL_DOMAIN = "mkwt.local";
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const DEFAULT_APP_PAGE = "tracker.html";

function setStatus(msg, ok = true) {
  window.MKWT?.setStatus?.($("status"), msg, ok);
}

function createClient(storage, key) {
  if (CLIENT_CACHE[key]) return CLIENT_CACHE[key];
  if (!window.supabase?.createClient) {
    throw new Error("Supabase could not load. Please check your connection and reload the page.");
  }
  CLIENT_CACHE[key] = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
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

function resolveLoginEmail(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();

  const username = raw.replace(/^@+/, "").toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Please enter a valid username or email.");
  }
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

function normalizeAppPageTarget(value) {
  const fallback = DEFAULT_APP_PAGE;
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    let page = decodeURIComponent(url.pathname || "").replace(/^\/+/, "");
    if (!page || page === "index" || page === "index.html") page = fallback;
    if (!page.includes(".")) page += ".html";
    if (!/^[a-z0-9_-]+\.html$/i.test(page)) return fallback;
    return `${page}${url.search || ""}${url.hash || ""}`;
  } catch (e) {
    return fallback;
  }
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

async function syncCloudThemePreference(client, userId) {
  try {
    if (!client || !userId) return;
    let { data, error } = await client
      .from("profiles")
      .select("theme_preference")
      .eq("id", userId)
      .maybeSingle();
    if (error && String(error.message || "").includes("column profiles.id")) {
      ({ data, error } = await client
        .from("profiles")
        .select("theme_preference")
        .eq("user_id", userId)
        .maybeSingle());
    }
    if (error) return;
    const theme = String(data?.theme_preference || "").trim();
    if (theme) {
      try { localStorage.setItem("mkwt_theme", theme); } catch (e) {}
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

  await syncCloudThemePreference(client, user?.id || session?.user?.id || null);
  await maybeOfferGuestImport(client, user?.id || session?.user?.id || null);
  setStatus("Logged in.", true);
  window.location.href = normalizeAppPageTarget();
}

async function login() {
  const loginName = ($("email").value || "").trim();
  const password = $("password").value || "";
  const stay = $("stay").checked;

  if (!loginName || !password) {
    setStatus("Please enter username/email and password.", false);
    return;
  }

  $("btnLogin").disabled = true;
  try {
    setStatus("Signing in...", true);

    const email = resolveLoginEmail(loginName);
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
      window.location.href = normalizeAppPageTarget(lastPage);
    } catch (e) {
      window.location.href = DEFAULT_APP_PAGE;
    }
  });

});
