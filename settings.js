const $ = id => document.getElementById(id);
const statusEls = Array.from(document.querySelectorAll('[data-status="shared"]'));
function setStatus(t, ok=true){ window.MKWT?.setStatus?.(statusEls, t, ok); }
function setPasswordStatus(t, ok=true){
  const el = $("pwStatus");
  const text = String(t || "").trim();
  if(window.MKWT?.showToast){
    if(el){
      el.textContent = "";
      el.className = "muted statusSpaceSmall hidden";
      el.hidden = true;
    }
    window.MKWT.showToast(text, ok);
    return;
  }
  if(!el) return;
  el.hidden = !text;
  el.textContent = text;
  el.className = "muted statusSpaceSmall " + (text ? (ok ? "ok" : "bad") : "hidden");
}
const STORAGE_KEYS = window.MKWT?.storageKeys || { theme:'mkwt_theme', minVrFilter:'mkwt_min_vr_filter', lastMode:'mkwt_last_mode' };
const SETTINGS_MKCENTRAL_PLAYER_KEY = 'mkwt_mkcentral_player_ref_v1';
const SETTINGS_PROFILE_ICON_KEY = 'mkwt_profile_icon_slug_v1';
const WW_VR_ONBOARDING_KEY_PREFIX = "mkwt_ww_vr_onboarding_done_v1";
const SETTINGS_ICON_MANIFEST_URL = 'combo_icon_map.json';
const SETTINGS_DEFAULT_PROFILE_ICON_SLUG = "mario";
const ACCOUNT_DEFAULT_THEME = "dark";

const SETTINGS_FIELDS = [
  { inputId: "settingsNickname", stateId: "settingsNicknameState" },
  { inputId: "settingsVr", stateId: "settingsVrState" },
  { inputId: "settingsMkcentralPlayer", stateId: "settingsMkcentralState" },
  { inputId: "settingsTheme", stateId: "settingsThemeState", accountOnly: true },
  { inputId: "settingsMinVr", stateId: "settingsMinVrState" }
];

let settingsEditMode = false;
let settingsSnapshot = null;
let profileIconSlug = SETTINGS_DEFAULT_PROFILE_ICON_SLUG;
let profileIconManifest = null;
let profileIconLoadPromise = null;
let profileIconEntries = [];

function settingsText(value, fallback="-"){
  const text = String(value ?? "").trim();
  return text || fallback;
}

function markWorldWideVrOnboardingDone(){
  if(!SESSION?.user?.id) return;
  try{ localStorage.setItem(`${WW_VR_ONBOARDING_KEY_PREFIX}:${SESSION.user.id}`, "1"); }catch(e){}
}

function getSelectedThemeLabel(){
  const sel = $("settingsTheme");
  if(!sel) return "-";
  const option = sel.options?.[sel.selectedIndex];
  return option?.textContent?.trim() || settingsText(sel.value);
}

function getProfileInitials(name){
  const text = settingsText(name, "M");
  const words = text.split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) || "M";
  const second = words.length > 1 ? words[1].charAt(0) : "";
  return (first + second).toUpperCase();
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function normalizeProfileIconSlug(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function getProfileIconRecord(slug = profileIconSlug){
  const normalized = normalizeProfileIconSlug(slug);
  if(!normalized || !profileIconManifest?.characters) return null;
  return profileIconManifest.characters[normalized] || null;
}

function profileIconThumbPath(entry){
  const rawPath = settingsText(entry?.path, "");
  const fileName = rawPath.replace(/\\/g, "/").split("/").pop();
  return fileName ? `assets/picker-icons/characters/${fileName}` : rawPath;
}

async function loadProfileIconManifest(){
  if(profileIconManifest) return profileIconManifest;
  if(profileIconLoadPromise) return profileIconLoadPromise;

  profileIconLoadPromise = fetch(SETTINGS_ICON_MANIFEST_URL, { cache: "no-store" })
    .then(async response => {
      if(!response.ok) throw new Error("Profile icons could not be loaded.");
      const manifest = await response.json();
      const characters = manifest?.characters || {};
      profileIconManifest = manifest;
      profileIconEntries = Object.values(characters)
        .filter(entry => entry?.slug && entry?.path && entry?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return profileIconManifest;
    })
    .finally(() => {
      profileIconLoadPromise = null;
    });

  return profileIconLoadPromise;
}

function loadProfileIconSetting(){
  try{
    profileIconSlug = normalizeProfileIconSlug(window.MKWT?.readStorage?.(SETTINGS_PROFILE_ICON_KEY, "") || "") || SETTINGS_DEFAULT_PROFILE_ICON_SLUG;
  }catch(e){
    profileIconSlug = SETTINGS_DEFAULT_PROFILE_ICON_SLUG;
  }
}

function clearLocalSettingKey(key){
  try{ localStorage.removeItem(key); }catch(e){}
}

function saveProfileIconSetting(){
  try{
    if(profileIconSlug){
      window.MKWT?.writeStorage?.(SETTINGS_PROFILE_ICON_KEY, profileIconSlug);
    }else{
      localStorage.removeItem(SETTINGS_PROFILE_ICON_KEY);
    }
  }catch(e){}
}

function renderProfileIcon(){
  const mark = $("settingsProfileInitials");
  if(!mark) return;

  const nickname = settingsText($("settingsNickname")?.value, "M");
  const record = getProfileIconRecord();
  const editable = settingsEditMode;

  mark.disabled = !editable;
  mark.classList.toggle("isEditable", editable);
  mark.classList.toggle("hasIcon", !!record);
  mark.setAttribute("aria-label", editable ? "Choose profile icon" : "Profile icon");

  if(record){
    mark.innerHTML = `<img src="${escapeHtml(profileIconThumbPath(record))}" alt="${escapeHtml(record.name)}" loading="lazy" decoding="async">`;
    mark.title = editable ? `Change profile icon (${record.name})` : `Profile icon: ${record.name}`;
  }else{
    mark.innerHTML = `<span class="settingsProfileMarkLabel">${escapeHtml(getProfileInitials(nickname))}</span>`;
    mark.title = editable ? "Choose profile icon" : "Profile initials";
  }
  renderEditProfileIcon();
}

function renderEditProfileIcon(){
  const source = $("settingsProfileInitials");
  const target = $("settingsEditProfileIcon");
  if(!source || !target) return;

  target.innerHTML = source.innerHTML;
  target.classList.toggle("hasIcon", source.classList.contains("hasIcon"));
  target.classList.toggle("isEditable", settingsEditMode);
  target.disabled = !settingsEditMode;
  target.title = source.title || "Choose profile icon";
  target.setAttribute("aria-label", settingsEditMode ? "Choose profile icon" : "Profile icon");
}

function renderSettingsIconGrid(){
  const grid = $("settingsIconGrid");
  if(!grid) return;

  const initials = getProfileInitials($("settingsNickname")?.value);
  const initialSelected = !profileIconSlug;
  const initialButton = `
    <button class="settingsIconOption ${initialSelected ? "is-selected" : ""}" type="button" data-icon-slug="" aria-pressed="${initialSelected ? "true" : "false"}">
      <span class="settingsIconCube settingsIconCube--initial"><span>${escapeHtml(initials)}</span></span>
      <span class="settingsIconName">Initial</span>
    </button>`;

  const iconButtons = profileIconEntries.map(entry => {
    const slug = normalizeProfileIconSlug(entry.slug);
    const selected = slug === profileIconSlug;
    return `
      <button class="settingsIconOption ${selected ? "is-selected" : ""}" type="button" data-icon-slug="${escapeHtml(slug)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="settingsIconCube"><img src="${escapeHtml(profileIconThumbPath(entry))}" alt="" loading="lazy" decoding="async"></span>
        <span class="settingsIconName">${escapeHtml(entry.name)}</span>
      </button>`;
  }).join("");

  grid.innerHTML = initialButton + iconButtons;
  grid.querySelectorAll(".settingsIconOption").forEach(button => {
    button.addEventListener("click", () => {
      profileIconSlug = normalizeProfileIconSlug(button.dataset.iconSlug || "");
      syncSettingsReadView();
      renderSettingsIconGrid();
      closeSettingsIconDialog();
    });
  });
}

async function openSettingsIconDialog(){
  if(!settingsEditMode) return;
  const overlay = $("settingsIconOverlay");
  if(!overlay) return;
  try{
    await loadProfileIconManifest();
  }catch(e){
    setStatus(e?.message || "Profile icons could not be loaded.", false);
    return;
  }
  renderSettingsIconGrid();
  overlay.hidden = false;
  setTimeout(() => {
    try{
      overlay.querySelector(".settingsIconOption.is-selected")?.focus();
    }catch(e){}
  }, 0);
}

function closeSettingsIconDialog(){
  const overlay = $("settingsIconOverlay");
  if(overlay) overlay.hidden = true;
}

function syncSettingsReadView(){
  const nickname = settingsText($("settingsNickname")?.value, "Not set");
  const vr = settingsText($("settingsVr")?.value, "Not set");
  const mkcentral = settingsText($("settingsMkcentralPlayer")?.value, "Not set");
  const minVrRaw = String($("settingsMinVr")?.value || "").trim();
  const minVr = parseInt(minVrRaw, 10);
  const statsFilter = Number.isFinite(minVr) && minVr > 0 ? `Below ${minVr}` : "Off";

  if($("settingsProfileNameDisplay")) $("settingsProfileNameDisplay").textContent = nickname;
  if($("settingsThemeRead")) $("settingsThemeRead").textContent = getSelectedThemeLabel();
  if($("settingsMinVrRead")) $("settingsMinVrRead").textContent = statsFilter;
  renderProfileIcon();

  if($("settingsProfileMetaDisplay")){
    const parts = [
      `VR ${vr}`,
      mkcentral !== "Not set" ? `MKC ${mkcentral}` : "MKC not set"
    ];
    $("settingsProfileMetaDisplay").textContent = parts.join(" | ");
  }
}

function isAccountMode(){
  return !!(window.SESSION && window.SESSION.user);
}

function captureSettingsSnapshot(){
  return {
    nickname: String($("settingsNickname")?.value || ""),
    vr: String($("settingsVr")?.value || ""),
    mkcentralPlayer: String($("settingsMkcentralPlayer")?.value || ""),
    theme: String($("settingsTheme")?.value || ACCOUNT_DEFAULT_THEME),
    minVr: String($("settingsMinVr")?.value || ""),
    profileIconSlug
  };
}

function restoreSettingsSnapshot(snapshot){
  if(!snapshot) return;
  if($("settingsNickname")) $("settingsNickname").value = snapshot.nickname || "";
  if($("settingsVr")) $("settingsVr").value = snapshot.vr || "";
  if($("settingsMkcentralPlayer")) $("settingsMkcentralPlayer").value = snapshot.mkcentralPlayer || "";
  if($("settingsTheme")){
    $("settingsTheme").value = snapshot.theme || ACCOUNT_DEFAULT_THEME;
    applyThemeValue($("settingsTheme").value);
  }
  if($("settingsMinVr")) $("settingsMinVr").value = snapshot.minVr || "";
  profileIconSlug = normalizeProfileIconSlug(snapshot.profileIconSlug || "");
  syncSettingsReadView();
}

function setFieldLockedState(field){
  const input = $(field.inputId);
  const state = $(field.stateId);
  if(!input) return;

  const lockedByAccount = !!field.accountOnly && !isAccountMode();
  const editable = settingsEditMode && !lockedByAccount;

  input.disabled = !editable;
  input.classList.toggle("isEditing", editable);
  input.classList.toggle("isSaved", !editable);

  if(state){
    state.textContent = lockedByAccount ? "Login required" : (editable ? "Editing..." : "Saved");
    state.classList.toggle("editing", editable);
    state.classList.toggle("saved", !editable);
  }
}

function refreshSettingsEditUi(){
  SETTINGS_FIELDS.forEach(setFieldLockedState);

  const editBtn = $("btnEditSettings");
  const saveBtn = $("btnSaveSettings");
  const cancelBtn = $("btnCancelSettings");
  const card = document.querySelector(".settingsCard");
  const editPanel = $("settingsEditPanel");
  const editOverlay = $("settingsEditOverlay");

  card?.classList.toggle("isEditing", settingsEditMode);
  if(editPanel) editPanel.hidden = !settingsEditMode;
  if(editOverlay) editOverlay.hidden = !settingsEditMode;
  if(editBtn){
    editBtn.hidden = settingsEditMode;
    editBtn.disabled = settingsEditMode;
    editBtn.classList.toggle("hidden", settingsEditMode);
  }
  if(saveBtn){
    saveBtn.hidden = !settingsEditMode;
    saveBtn.disabled = !settingsEditMode;
    saveBtn.classList.toggle("hidden", !settingsEditMode);
  }
  if(cancelBtn){
    cancelBtn.hidden = !settingsEditMode;
    cancelBtn.disabled = !settingsEditMode;
    cancelBtn.classList.toggle("hidden", !settingsEditMode);
  }
  renderEditProfileIcon();
  syncSettingsReadView();
}

function beginSettingsEdit(){
  settingsSnapshot = captureSettingsSnapshot();
  settingsEditMode = true;
  refreshSettingsEditUi();
  setTimeout(() => {
    try{
      $("settingsNickname")?.focus();
      $("settingsNickname")?.select?.();
    }catch(e){}
  }, 0);
}

function cancelSettingsEdit(){
  if(!settingsEditMode) return;
  closeSettingsIconDialog();
  restoreSettingsSnapshot(settingsSnapshot);
  settingsEditMode = false;
  refreshSettingsEditUi();
  setStatus("Changes discarded.");
}

function finishSettingsSave(){
  settingsSnapshot = captureSettingsSnapshot();
  settingsEditMode = false;
  refreshSettingsEditUi();
  syncSettingsReadView();
}


// ========= Theme (local setting, affects the whole UI) =========
function applyThemeValue(t){
  try{
    document.documentElement.dataset.theme = (t && String(t).trim()) ? String(t).trim() : ACCOUNT_DEFAULT_THEME;
  }catch(e){}
}
function loadThemeSetting(){
  try{
    const t = window.MKWT?.readStorage?.(STORAGE_KEYS.theme, ACCOUNT_DEFAULT_THEME) || ACCOUNT_DEFAULT_THEME;
    const sel = $("settingsTheme");
    if (sel) sel.value = t;
    applyThemeValue(t);
  }catch(e){
    applyThemeValue(ACCOUNT_DEFAULT_THEME);
  }
}
function saveThemeSetting(){
  try{
    const sel = $("settingsTheme");
    const t = (sel && sel.value) ? sel.value : ACCOUNT_DEFAULT_THEME;
    window.MKWT?.writeStorage?.(STORAGE_KEYS.theme, t);
    applyThemeValue(t);
    return t;
  }catch(e){}
  return ACCOUNT_DEFAULT_THEME;
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

function loadMkcentralSetting(){
  try{
    const input = $("settingsMkcentralPlayer");
    if(input) input.value = window.MKWT?.readStorage?.(SETTINGS_MKCENTRAL_PLAYER_KEY, "") || "";
  }catch(e){}
}

function extractMkcentralPlayerId(value){
  const raw = String(value || "").trim();
  if(!raw) return "";
  if(/^\d+$/.test(raw)) return raw;
  const match = raw.match(/PlayerDetails\/(\d+)/i);
  return match ? match[1] : "";
}

function saveMkcentralSetting(){
  try{
    const raw = String($("settingsMkcentralPlayer")?.value || "").trim();
    const normalized = extractMkcentralPlayerId(raw);
    if(normalized){
      window.MKWT?.writeStorage?.(SETTINGS_MKCENTRAL_PLAYER_KEY, normalized);
      if($("settingsMkcentralPlayer")) $("settingsMkcentralPlayer").value = normalized;
    }
    else localStorage.removeItem(SETTINGS_MKCENTRAL_PLAYER_KEY);
    return normalized;
  }catch(e){
    return "";
  }
}



const INFO_TEXT = {
  currentVr:
    "Adjust your current VR here after a disconnect, correction, or similar reason. Existing matches keep the VR values they were saved with, so old results are not rewritten.",
  mkcentralId:
    [
      '<p class="settingsInfoText">Paste either your MKCentral player ID or the full PlayerDetails URL.</p>',
      '<div class="settingsInfoExample" aria-label="MKCentral PlayerDetails URL example">',
      '<span class="settingsInfoUrl">https://lounge.mkcentral.com/mkworld/PlayerDetails/</span>',
      '<mark class="settingsInfoId">78188</mark>',
      '<span class="settingsInfoUrl">?season=2&amp;p=24</span>',
      '</div>',
      '<p class="settingsInfoHint">The highlighted number is the ID MKWT uses.</p>'
    ].join(""),
  minVrFilter:
    "This filter removes low-VR outliers from your stats. Any match where your VR total before or after the game is below the threshold will be excluded from charts and averages. Set it to 0, or leave it empty, to disable the filter.",
  theme:
    "Choose a visual style for the whole app. Logged-in accounts sync their selected theme across devices, while Guest stays locked to Dendo Denim.",
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
    currentVr: { title: 'Current VR', body: INFO_TEXT.currentVr },
    mkcentralId: { title: 'MKCentral ID', bodyHtml: INFO_TEXT.mkcentralId },
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
    b.classList.remove("hidden");
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
      setTopInfo({emailText:"Guest mode (local)", currentVrText:"-", matchCountText:"-"});
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
    loadMkcentralSetting();
    loadProfileIconSetting();
    const count = guestCount();
    setTopInfo({ emailText: "Guest mode (local)", currentVrText: String(gp?.current_vr ?? "-"), matchCountText: String(count) });
    setStatus("Guest mode (saved locally)");
    return;
  }

  // Prefer profiles.id (most common in your project). If that column doesn't exist, fallback to profiles.user_id.
  let { data, error } = await supabaseClient
    .from("profiles")
    .select("nickname,current_vr,mkcentral_player_id,theme_preference,profile_icon_slug")
    .eq("id", SESSION.user.id)
    .maybeSingle();

  if (error && String(error.message || "").includes("column profiles.id")) {
    ({ data, error } = await supabaseClient
      .from("profiles")
      .select("nickname,current_vr,mkcentral_player_id,theme_preference,profile_icon_slug")
      .eq("user_id", SESSION.user.id)
      .maybeSingle());
  }

  if(error){ setStatus(error.message, false); return }

  $("settingsNickname").value = data?.nickname || "";
  $("settingsVr").value = (data?.current_vr ?? "");
  const cloudTheme = String(data?.theme_preference || "").trim();
  if(cloudTheme){
    window.MKWT?.writeStorage?.(STORAGE_KEYS.theme, cloudTheme);
    if($("settingsTheme")) $("settingsTheme").value = cloudTheme;
    applyThemeValue(cloudTheme);
  }
  const mkcentralPlayerId = String(data?.mkcentral_player_id || "").trim();
  if(mkcentralPlayerId){
    window.MKWT?.writeStorage?.(SETTINGS_MKCENTRAL_PLAYER_KEY, mkcentralPlayerId);
    if($("settingsMkcentralPlayer")) $("settingsMkcentralPlayer").value = mkcentralPlayerId;
  }else{
    clearLocalSettingKey(SETTINGS_MKCENTRAL_PLAYER_KEY);
    if($("settingsMkcentralPlayer")) $("settingsMkcentralPlayer").value = "";
  }

  const cloudIconSlug = normalizeProfileIconSlug(data?.profile_icon_slug || "");
  if(cloudIconSlug){
    profileIconSlug = cloudIconSlug;
    saveProfileIconSetting();
  }else{
    clearLocalSettingKey(SETTINGS_PROFILE_ICON_KEY);
    profileIconSlug = SETTINGS_DEFAULT_PROFILE_ICON_SLUG;
  }

  // Top card: Current VR + Matches count
  try{
    setTopInfo({ currentVrText: String(data?.current_vr ?? "-") });
    const { count } = await supabaseClient
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", SESSION.user.id);
    if (typeof count === "number") setTopInfo({ matchCountText: String(count) });
  }catch(e){}
}


async function saveSettings(){
  if(!settingsEditMode) return;

  const mkcentralRaw = String($("settingsMkcentralPlayer")?.value || "").trim();
  const mkcentralId = extractMkcentralPlayerId(mkcentralRaw);
  if(mkcentralRaw && !mkcentralId){
    setStatus("Enter a valid MKCentral player ID or PlayerDetails URL.", false);
    return;
  }

  // Apply + save local UI settings only when Save is pressed
  const selectedTheme = saveThemeSetting();
  const minVr = saveMinVrSetting();
  const mkcentral = saveMkcentralSetting();
  const mkcentralText = mkcentral ? " | MKCentral saved" : " | MKCentral cleared";

  const nickname = $("settingsNickname").value.trim();
  const vr = parseInt($("settingsVr").value,10);

  // Guest: store profile locally (no cloud)
  if (isGuest()){
    if(nickname && Number.isFinite(vr)){
      window.MKWT?.saveGuestProfile?.({ nickname, current_vr: vr });
      setTopInfo({ currentVrText: String(vr) });
    }
    saveProfileIconSetting();
    finishSettingsSave();
    setStatus(`Saved locally${minVr>0 ? ` (Min VR: ${minVr})` : ""}${mkcentralText}.`);
    return;
  }

  const payload = {
    id: SESSION.user.id,          // primary key in your current schema
    mkcentral_player_id: mkcentralId || null,
    profile_icon_slug: profileIconSlug || SETTINGS_DEFAULT_PROFILE_ICON_SLUG,
    theme_preference: selectedTheme || ACCOUNT_DEFAULT_THEME,
    updated_at: new Date().toISOString()
  };
  if(nickname) payload.nickname = nickname;
  if(Number.isFinite(vr)) payload.current_vr = vr;

  // Prefer upsert so it works whether the row exists or not.
  let { error } = await supabaseClient
    .from("profiles")
    .upsert(payload);

  // Fallback if this project uses profiles.user_id instead of profiles.id
  if (error && String(error.message || "").includes("column profiles.id")) {
    ({ error } = await supabaseClient
      .from("profiles")
      .upsert({
        user_id: SESSION.user.id,
        mkcentral_player_id: mkcentralId || null,
        profile_icon_slug: profileIconSlug || SETTINGS_DEFAULT_PROFILE_ICON_SLUG,
        theme_preference: selectedTheme || ACCOUNT_DEFAULT_THEME,
        ...(nickname ? { nickname } : {}),
        ...(Number.isFinite(vr) ? { current_vr: vr } : {}),
        updated_at: new Date().toISOString()
      }));
  }

  if(error){ setStatus(error.message, false); return }

  if(Number.isFinite(vr)){
    setTopInfo({ currentVrText: String(vr) });
    markWorldWideVrOnboardingDone();
  }
  saveProfileIconSetting();
  finishSettingsSave();
  setStatus(`Saved${minVr>0 ? ` (Min VR: ${minVr})` : ""}${mkcentralText}`);
}


/* ========= NAV ACTIONS ========= */
// Nav actions (Export / Import / Logout) are wired by the shared nav script at the bottom.

/* ========= INIT ========= */
$("btnSaveSettings").onclick = saveSettings;
$("btnEditSettings").onclick = beginSettingsEdit;
$("btnCancelSettings").onclick = cancelSettingsEdit;
$("settingsProfileInitials")?.addEventListener("click", openSettingsIconDialog);
$("settingsEditProfileIcon")?.addEventListener("click", openSettingsIconDialog);
$("settingsEditClose")?.addEventListener("click", cancelSettingsEdit);
$("settingsEditOverlay")?.addEventListener("click", (e) => {
  if(e.target === $("settingsEditOverlay")) cancelSettingsEdit();
});
$("settingsIconClose")?.addEventListener("click", closeSettingsIconDialog);
$("settingsIconOverlay")?.addEventListener("click", (e) => {
  if(e.target === $("settingsIconOverlay")) closeSettingsIconDialog();
});

$("btnChangePassword").onclick = () => {
  openPwModal();
};

async function submitPasswordChange() {
  const p1 = String($("pwNew").value || "");
  const p2 = String($("pwConfirmInput").value || "");

  setPasswordStatus("", true);

  if(p1.length < 6){
    setPasswordStatus("Password must be at least 6 characters.", false);
    return;
  }
  if(p1 !== p2){
    setPasswordStatus("Passwords do not match.", false);
    return;
  }

  try{
    setPasswordStatus("Updating password...", true);
    const { error } = await supabaseClient.auth.updateUser({ password: p1 });
    if(error){ setPasswordStatus(error.message, false); return; }
    $("pwNew").value = "";
    $("pwConfirmInput").value = "";
    setPasswordStatus("Password updated.", true);
    // Close after a short moment
    setTimeout(closePwModal, 600);
  }catch(e){
    setPasswordStatus("Password update failed: " + (e?.message || e), false);
  }
}

$("pwCancel").onclick = closePwModal;
$("pwClose").onclick = closePwModal;
$("pwForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await submitPasswordChange();
});

function openPwModal(){
  $("pwOverlay").hidden = false;
  setPasswordStatus("", true);
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
  if(e.key !== "Escape") return;
  if($("settingsIconOverlay") && !$("settingsIconOverlay").hidden){
    closeSettingsIconDialog();
    return;
  }
  if($("settingsEditOverlay") && !$("settingsEditOverlay").hidden){
    cancelSettingsEdit();
    return;
  }
  if($("pwOverlay") && !$("pwOverlay").hidden) closePwModal();
});


function applyAuthVisibility(){
  const authed = !!(window.SESSION && window.SESSION.user);
  const btnLogout = document.getElementById("btnLogout");
  const btnChangePw = document.getElementById("btnChangePassword");
  const accountTitle = document.getElementById("settingsAccountTitle");
  const accountHint = document.getElementById("settingsAccountHint");
  const accountInfo = document.getElementById("settingsAccountInfo");
  const themeSel = document.getElementById("settingsTheme");
  const themeHelp = document.getElementById("themeHelp");

  if (!authed){
    // Guest mode: keep settings visible, but lock account-only controls
    if (btnChangePw){
      btnChangePw.disabled = true;
      btnChangePw.hidden = true;
      btnChangePw.classList.add("hidden");
      btnChangePw.style.opacity = "0.55";
      btnChangePw.style.cursor = "not-allowed";
      btnChangePw.title = "Login required";
      btnChangePw.onclick = ()=>{};
    }
    if (accountTitle) accountTitle.textContent = "Login";
    if (accountHint) accountHint.textContent = "";
    if (accountInfo) accountInfo.hidden = true;

    if (themeSel){
      themeSel.value = "dendo";
    }
    if (themeHelp){
      themeHelp.textContent = "Theme changes require login (Guest is locked to Dendo Denim).";
    }

    // Turn Logout into Login
    if (btnLogout){
      btnLogout.textContent = "Login";
      btnLogout.hidden = false;
      btnLogout.classList.remove("danger");
      btnLogout.classList.remove("btn2");
      btnLogout.classList.remove("hidden");
      btnLogout.classList.add("btn");
      // keep button styling unified with the rest of the app
      btnLogout.onclick = ()=>{ window.location.href = "login.html"; };
    }
  } else {
    // Logged-in: enable everything
    if (btnChangePw){
      btnChangePw.hidden = false;
      btnChangePw.classList.remove("hidden");
      btnChangePw.disabled = false;
      btnChangePw.style.opacity = "";
      btnChangePw.style.cursor = "";
      btnChangePw.title = "";
    }
    if (accountTitle) accountTitle.textContent = "Account";
    if (accountHint) accountHint.textContent = "";
    if (accountInfo) accountInfo.hidden = false;
    if (themeHelp){
      themeHelp.textContent = "Applies after you press Save and syncs to your account across devices.";
    }
    if (btnLogout){
      btnLogout.textContent = "Logout";
      btnLogout.hidden = false;
      btnLogout.classList.remove("btn");
      btnLogout.classList.remove("hidden");
      btnLogout.classList.add("danger");
      btnLogout.classList.remove("btn2");
      }
  }

  refreshSettingsEditUi();
}

(async()=>{
  await requireAuth();
  applyAuthVisibility();
  loadMinVrSetting();
  await loadProfile();
  try{ await loadProfileIconManifest(); }catch(e){}

  // Theme: account can pick, guest is locked to Dendo Denim
  if (window.SESSION && window.SESSION.user){
    loadThemeSetting();
  } else {
    try{ document.documentElement.dataset.theme = "dendo"; }catch(e){}
    try{ const sel = document.getElementById("settingsTheme"); if(sel){ sel.value="dendo"; } }catch(e){}
  }

  settingsSnapshot = captureSettingsSnapshot();
  settingsEditMode = false;
  refreshSettingsEditUi();
})();
