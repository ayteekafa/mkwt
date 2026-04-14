const $ = id => document.getElementById(id);
const statusEls = Array.from(document.querySelectorAll('[data-status="shared"]'));
function setStatus(t, ok=true){ window.MKWT?.setStatus?.(statusEls, t, ok); }
const STORAGE_KEYS = window.MKWT?.storageKeys || { theme:'mkwt_theme', minVrFilter:'mkwt_min_vr_filter', lastMode:'mkwt_last_mode' };


// ========= Theme (local setting, affects the whole UI) =========
function applyThemeValue(t){
  try{
    document.documentElement.dataset.theme = (t && String(t).trim()) ? String(t).trim() : "dark";
  }catch(e){}
}
function loadThemeSetting(){
  try{
    const t = window.MKWT?.readStorage?.(STORAGE_KEYS.theme, "dark") || "dark";
    const sel = $("settingsTheme");
    if (sel) sel.value = t;
    applyThemeValue(t);
  }catch(e){
    applyThemeValue("dark");
  }
}
function saveThemeSetting(){
  try{
    const sel = $("settingsTheme");
    const t = (sel && sel.value) ? sel.value : "dark";
    window.MKWT?.writeStorage?.(STORAGE_KEYS.theme, t);
    applyThemeValue(t);
  }catch(e){}
}

// ========= Min-VR Filter (local setting, affects stats/sessions) =========
function loadMinVrSetting(){
  try{
    const v = window.MKWT?.readStorageInt?.(STORAGE_KEYS.minVrFilter, 0);
    $("settingsMinVr").value = (Number.isFinite(v) && v > 0) ? String(v) : "";
  }catch(e){
    try{ $("settingsMinVr").value = ""; }catch{}
  }
}

function saveMinVrSetting(){
  try{
    const raw = String($("settingsMinVr").value || "").trim();
    const v = raw === "" ? 0 : parseInt(raw, 10);
    const ok = Number.isFinite(v) && v > 0 ? v : 0;
    window.MKWT?.writeStorage?.(STORAGE_KEYS.minVrFilter, String(ok));
    return ok;
  }catch(e){
    return 0;
  }
}



const INFO_TEXT = {
  minVrFilter:
    "This filter removes low-VR outliers from your stats. Any match where your VR total before or after the game is below the threshold will be excluded from charts and averages. Set it to 0, or leave it empty, to disable the filter.",
  theme:
    "Choose a visual style for the whole app. The selected theme is stored locally and applied across tracker, stats, sessions, and settings.",
  account:
    "Changing your password is only available for logged-in accounts. Guest mode has no account credentials, so there is no password to change.",
  contact:
    "Want a free VIP account or have ideas to improve the website? Feel free to contact me on Discord."
};

function setTopInfo({emailText, currentVrText, matchCountText}){
  window.MKWT?.setTopInfo?.({ userInfo: emailText, currentVr: currentVrText, matchCount: matchCountText });
}

window.MKWT?.bindInfoOverlay?.({
  texts: {
    minVrFilter: { title: 'Info', body: INFO_TEXT.minVrFilter },
    theme: { title: 'Info', body: INFO_TEXT.theme },
    account: { title: 'Info', body: INFO_TEXT.account },
    contact: { title: 'Info', body: INFO_TEXT.contact }
  }
});

/* ========= AUTH ========= */

  // Settings override: Logout = always red (danger), Login = primary (active)
  function setNavAuthButton(mode){
    const b = document.getElementById("btnLogout");
    if(!b) return;
    b.style.display = "";
    if(mode === "account"){
      b.textContent = "Logout";
      b.classList.remove("active");
      b.classList.add("danger");
      try{ window.MKWT?.writeStorage?.(STORAGE_KEYS.lastMode, "account"); }catch(e){}
    }else{
      b.textContent = "Login";
      b.classList.remove("danger");
      b.classList.add("active");
    }
  }

async function requireAuth(){
  return window.mkwtRequireAuth({
    pageName: "settings.html",
    allowGuest: true,
    onAccount: async (session, client) => {
      supabaseClient = client;
      SESSION = session;
      try{ window.MKWT?.writeStorage?.('mkwt_mode','account'); }catch(e){}
      setTopInfo({emailText: "Signed in as: " + (maskEmail(session.user?.email) || "unknown")});
      try{ setNavAuthButton("account"); }catch(e){}
    },
    onGuest: async () => {
      window.supabaseClient = null;
      window.SESSION = null;
      setTopInfo({emailText:"Guest mode (local)", currentVrText:"–", matchCountText:"–"});
      try{ setNavAuthButton("guest"); }catch(e){}
    }
  });
}

/* ========= PROFILE ========= */
async function loadProfile(){
  if(!SESSION?.user?.id){
    // Guest: load local profile
    const gp = window.MKWT?.loadGuestProfile ? window.MKWT.loadGuestProfile() : { nickname:'Guest', current_vr:0 };
    $("settingsNickname").value = gp?.nickname || "Guest";
    $("settingsVr").value = (gp?.current_vr ?? "");
    const count = guestCount();
    setTopInfo({ emailText: "Guest mode (local)", currentVrText: String(gp?.current_vr ?? "–"), matchCountText: String(count) });
    setStatus("Guest mode (saved locally)");
    return;
  }

  // Prefer profiles.id (most common in your project). If that column doesn't exist, fallback to profiles.user_id.
  let { data, error } = await supabaseClient
    .from("profiles")
    .select("nickname,current_vr")
    .eq("id", SESSION.user.id)
    .maybeSingle();

  if (error && String(error.message || "").includes("column profiles.id")) {
    ({ data, error } = await supabaseClient
      .from("profiles")
      .select("nickname,current_vr")
      .eq("user_id", SESSION.user.id)
      .maybeSingle());
  }

  if(error){ setStatus(error.message); return }

  $("settingsNickname").value = data?.nickname || "";
  $("settingsVr").value = (data?.current_vr ?? "");

  // Top card: Current VR + Matches count
  try{
    setTopInfo({ currentVrText: String(data?.current_vr ?? "–") });
    const { count } = await supabaseClient
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", SESSION.user.id);
    if (typeof count === "number") setTopInfo({ matchCountText: String(count) });
  }catch(e){}
}


async function saveSettings(){
  // Apply + save local UI settings only when Save is pressed
  saveThemeSetting();
  const minVr = saveMinVrSetting();

  const nickname = $("settingsNickname").value.trim();
  const vr = parseInt($("settingsVr").value,10);

  // Guest: store profile locally (no cloud)
  if (isGuest()){
    if(nickname && Number.isFinite(vr)){
      window.MKWT?.saveGuestProfile?.({ nickname, current_vr: vr });
    }
    setStatus(`✅ Saved locally${minVr>0 ? ` (Min VR: ${minVr})` : ""}.`);
    return;
  }

  // Allow saving the filter even if nickname/VR are not filled.
  if(!nickname || !Number.isFinite(vr)){
    setStatus(`✅ Saved locally${minVr>0 ? ` (Min VR: ${minVr})` : " (Min VR: disabled)"}.`);
    return;
  }

  const payload = {
    id: SESSION.user.id,          // primary key in your current schema
    nickname,
    current_vr: vr,
    updated_at: new Date().toISOString()
  };

  // Prefer upsert so it works whether the row exists or not.
  let { error } = await supabaseClient
    .from("profiles")
    .upsert(payload);

  // Fallback if this project uses profiles.user_id instead of profiles.id
  if (error && String(error.message || "").includes("column profiles.id")) {
    ({ error } = await supabaseClient
      .from("profiles")
      .upsert({ user_id: SESSION.user.id, nickname, current_vr: vr, updated_at: new Date().toISOString() }));
  }

  if(error){ setStatus(error.message); return }

  setStatus(`✅ Saved${minVr>0 ? ` (Min VR: ${minVr})` : ""}`);
}


/* ========= NAV ACTIONS ========= */
// Nav actions (Export / Import / Logout) are wired by the shared nav script at the bottom.

/* ========= INIT ========= */
$("btnSaveSettings").onclick = saveSettings;

$("btnChangePassword").onclick = () => {
  openPwModal();
};

$("pwCancel").onclick = closePwModal;
$("pwClose").onclick = closePwModal;
$("pwConfirm").onclick = async () => {
  const p1 = String($("pwNew").value || "");
  const p2 = String($("pwConfirmInput").value || "");

  $("pwStatus").textContent = "";

  if(p1.length < 6){
    $("pwStatus").textContent = "Password must be at least 6 characters.";
    return;
  }
  if(p1 !== p2){
    $("pwStatus").textContent = "Passwords do not match.";
    return;
  }

  try{
    $("pwStatus").textContent = "Updating password…";
    const { error } = await supabaseClient.auth.updateUser({ password: p1 });
    if(error){ $("pwStatus").textContent = error.message; return; }
    $("pwNew").value = "";
    $("pwConfirmInput").value = "";
    $("pwStatus").textContent = "✅ Password updated.";
    setStatus("✅ Password updated.");
    // Close after a short moment
    setTimeout(closePwModal, 600);
  }catch(e){
    $("pwStatus").textContent = "Password update failed: " + (e?.message || e);
  }
};

function openPwModal(){
  $("pwOverlay").hidden = false;
  $("pwStatus").textContent = "";
  $("pwNew").value = "";
  $("pwConfirmInput").value = "";
  setTimeout(()=>{ try{$("pwNew").focus();}catch{} }, 0);
}

function closePwModal(){
  $("pwOverlay").hidden = true;
}

$("pwOverlay").addEventListener("click", (e)=>{
  if(e.target === $("pwOverlay")) closePwModal();
});

document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape" && !$("pwOverlay").hidden) closePwModal();
});


function applyAuthVisibility(){
  const authed = !!(window.SESSION && window.SESSION.user);
  const btnLogout = document.getElementById("btnLogout");
  const btnChangePw = document.getElementById("btnChangePassword");
  const themeSel = document.getElementById("settingsTheme");
  const themeHelp = document.getElementById("themeHelp");

  if (!authed){
    // Guest mode: keep settings visible, but lock account-only controls
    if (btnChangePw){
      btnChangePw.disabled = true;
      btnChangePw.style.opacity = "0.55";
      btnChangePw.style.cursor = "not-allowed";
      btnChangePw.title = "Login required";
      btnChangePw.onclick = ()=>{};
    }

    if (themeSel){
      themeSel.value = "dark";
      themeSel.disabled = true;
      themeSel.style.opacity = "0.65";
      themeSel.style.cursor = "not-allowed";
    }
    if (themeHelp){
      themeHelp.textContent = "Theme changes require login (Guest is locked to Midnight Matte).";
    }

    // Turn Logout into Login
    if (btnLogout){
      btnLogout.textContent = "Login";
      btnLogout.classList.remove("danger");
      btnLogout.classList.remove("btn2");
      btnLogout.classList.add("btn");
      // keep button styling unified with the rest of the app
      btnLogout.onclick = ()=>{ window.location.href = "login.html"; };
    }
  } else {
    // Logged-in: enable everything
    if (btnChangePw){
      btnChangePw.disabled = false;
      btnChangePw.style.opacity = "";
      btnChangePw.style.cursor = "";
      btnChangePw.title = "";
    }
    if (themeSel){
      themeSel.disabled = false;
      themeSel.style.opacity = "";
      themeSel.style.cursor = "";
    }
    if (themeHelp){
      themeHelp.textContent = "Applies after you press Save (stored locally on this device).";
    }
    if (btnLogout){
      btnLogout.textContent = "Logout";
      btnLogout.classList.remove("btn");
      btnLogout.classList.add("danger");
      btnLogout.classList.remove("btn2");
      }
  }
}

(async()=>{
  await requireAuth();
  applyAuthVisibility();
  await loadProfile();
  loadMinVrSetting();

  // Theme: account can pick, guest is locked to dark
  if (window.SESSION && window.SESSION.user){
    loadThemeSetting();
  } else {
    try{ document.documentElement.dataset.theme = "dark"; }catch(e){}
    try{ const sel = document.getElementById("settingsTheme"); if(sel){ sel.value="dark"; } }catch(e){}
  }
})();
