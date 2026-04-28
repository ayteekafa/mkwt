(() => {
  const SUPABASE_URL = "https://imxlssgtzzdfgdscubdx.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
  const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  const GUEST_ENTRIES_KEY = "mkwt_guest_time_trial_entries_v1";
  const COMBO_BUILDER_DATA_URL = "combo_builder_data.json";
  const COMBO_ICON_MANIFEST_URL = "combo_icon_map.json";
  const COMBO_BUILDER_SELECTION_KEY = "mkwt_combo_builder_selection_v1";
  const CATEGORY_LABELS = { shroom: "Shroom", shroomless: "Shroomless" };
  const COMBO_CHARACTER_ALIASES = {
    Swooper: "Swoop",
    Fishbone: "Fish Bone",
  };
  const COMBO_VEHICLE_ALIASES = {
    "B-Dasher": "B Dasher",
  };
  const COMBO_STAT_LABELS = {
    onRoadSpeed: "Road Spd",
    offRoadSpeed: "Off-Road",
    waterSpeed: "Water Spd",
    acceleration: "Accel",
    miniTurbo: "Mini-Turbo",
    weight: "Weight",
    coinCurve: "Coins",
    onRoadHandling: "Road Hnd",
    offRoadHandling: "Off-Road Hnd",
    waterHandling: "Water Hnd",
    invincibility: "Inv",
  };
  const COMBO_STAT_ORDER = [
    "onRoadSpeed",
    "offRoadSpeed",
    "waterSpeed",
    "acceleration",
    "miniTurbo",
    "weight",
    "coinCurve",
    "onRoadHandling",
    "offRoadHandling",
    "waterHandling",
    "invincibility",
  ];
  const TT_HIGHLIGHT_BANDS = [
    { key: "gold", max: 2000 },
    { key: "silver", max: 4000 },
    { key: "bronze", max: 5500 },
  ];
  const TRACK_ALIASES = new Map([
    ["Great Block Ruins", "Great ? Block Ruins"],
    ["Mario Bros Circuit", "Mario Bros. Circuit"],
  ]);
  const TRACKS_FALLBACK = [
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

  const $ = (id) => document.getElementById(id);

  let publicClient = null;
  let supabaseClient = null;
  let SESSION = null;
  let PROFILE = null;
  let isUpdatingWr = false;
  let trackOrder = TRACKS_FALLBACK.slice();
  let worldRecords = [];
  let entries = [];
  let characters = [];
  let karts = [];
  let editingEntryId = null;
  let entryCategoryFilter = "all";
  let wrCategoryFilter = "all";
  let ttFilterBindingsReady = false;
  let trackIconPaths = new Map();
  let comboBuilderData = null;
  let comboIconManifest = { characters: {}, vehicles: {} };
  let comboCharacterMap = new Map();
  let comboVehicleMap = new Map();
  let currentWrComboContext = null;
  let currentComboInfoContext = null;
  const PUBLIC_AUTH_STORAGE = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function themeCssValue(name, fallback) {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function canonicalTrackName(value) {
    const raw = cleanText(value);
    return TRACK_ALIASES.get(raw) || raw;
  }

  function trackAbbrev(trackName) {
    const words = canonicalTrackName(trackName).split(/\s+/).filter(Boolean);
    const chars = words.slice(0, 3).map((word) => word[0]).join("");
    return chars || "?";
  }

  async function loadTrackIconMap() {
    try {
      const response = await fetch("track_icon_map.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const map = new Map();
      for (const [trackName, iconPath] of Object.entries(payload || {})) {
        const cleanPath = cleanText(iconPath);
        if (!cleanPath) continue;
        map.set(canonicalTrackName(trackName), encodeURI(cleanPath));
      }
      trackIconPaths = map;
    } catch (e) {
      trackIconPaths = new Map();
    }
  }

  function canonicalComboCharacterName(value) {
    const raw = cleanText(value);
    return COMBO_CHARACTER_ALIASES[raw] || raw;
  }

  function canonicalComboVehicleName(value) {
    const raw = cleanText(value);
    return COMBO_VEHICLE_ALIASES[raw] || raw;
  }

  function comboLookupKey(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[.']/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
  }

  function comboIconLetters(value) {
    const words = cleanText(value).split(/\s+/).filter(Boolean);
    if (words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    return (words[0] || "?").slice(0, 2).toUpperCase();
  }

  function statLabel(key) {
    return COMBO_STAT_LABELS[key] || comboBuilderData?.statLabels?.[key] || key;
  }

  function formatCompactNumber(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    const fixed = num.toFixed(digits);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function invincibilityFrames(level) {
    const safeLevel = Math.max(0, Math.min(21, Math.round(Number(level) || 0)));
    return 100 + (safeLevel * 4);
  }

  function invincibilitySeconds(level) {
    return invincibilityFrames(level) / 60;
  }

  function comboMetaText(combo) {
    if (!combo) return "-";
    const parts = [
      combo.character?.fullClass || combo.character?.class || "",
      combo.character?.specialization || "",
      combo.vehicle?.vehicleClass || combo.vehicle?.type || "",
      `Total ${formatCompactNumber(combo.total, 0)}`,
    ].filter(Boolean);
    return parts.join(" | ");
  }

  function comboIconPath(type, slug) {
    if (!slug) return "";
    const pool = type === "character" ? comboIconManifest?.characters : comboIconManifest?.vehicles;
    const raw = cleanText(pool?.[slug]?.path || "");
    return raw ? encodeURI(raw) : "";
  }

  function comboIconMarkup(type, name, slug) {
    const src = comboIconPath(type, slug);
    if (src) {
      return `<img class="ttComboIcon ttComboIcon--${escapeHtml(type)}" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" loading="eager" decoding="async" fetchpriority="high" />`;
    }
    return `<span class="ttComboIconFallback" title="${escapeHtml(name)}">${escapeHtml(comboIconLetters(name))}</span>`;
  }

  function comboInfoButtonMarkup(entryId, title) {
    return `<button class="ttInfoBtn ttInfoBtn--combo" data-entry-action="combo-info" data-entry-id="${escapeHtml(entryId)}" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">!</button>`;
  }

  function trackIconMarkup(trackName, extraClass = "") {
    const iconPath = trackIconPaths.get(canonicalTrackName(trackName));
    if (iconPath) {
      return `<img class="ttTrackIcon ${escapeHtml(extraClass)}" src="${escapeHtml(iconPath)}" alt="${escapeHtml(trackName)}" title="${escapeHtml(trackName)}" loading="eager" decoding="async" fetchpriority="high" />`;
    }
    return `<div class="ttTrackIconFallback ${escapeHtml(extraClass)}" title="${escapeHtml(trackName)}">${escapeHtml(trackAbbrev(trackName))}</div>`;
  }

  function renderEntryComboMarkup(entry, placement) {
    const combo = resolveComboStats(entry.character_name, entry.kart_name);
    const button = combo ? comboInfoButtonMarkup(entry.id, "Show combo stats") : "";
    const charIcon = comboIconMarkup(
      "character",
      combo?.character?.name || entry.character_name || "Character",
      combo?.character?.slug || combo?.character?.iconKey || ""
    );
    const vehicleIcon = comboIconMarkup(
      "vehicle",
      combo?.vehicle?.name || entry.kart_name || "Kart",
      combo?.vehicle?.slug || combo?.vehicle?.iconKey || ""
    );
    return `
      <div class="ttComboStack ${placement === "mobile" ? "ttComboStack--mobile" : ""}">
        <div class="ttComboTopRow">
          <div class="ttComboIcons">
            ${charIcon}
            ${vehicleIcon}
          </div>
          ${button}
        </div>
        <div class="ttSetupValue" title="${escapeHtml(entry.character_name)}">${escapeHtml(entry.character_name)}</div>
        <div class="ttSetupSubValue" title="${escapeHtml(entry.kart_name)}">${escapeHtml(entry.kart_name)}</div>
      </div>
    `;
  }

  async function loadComboAssets() {
    try {
      const [dataResponse, iconResponse] = await Promise.all([
        fetch(COMBO_BUILDER_DATA_URL, { cache: "no-store" }),
        fetch(COMBO_ICON_MANIFEST_URL, { cache: "no-store" }),
      ]);
      if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
      comboBuilderData = await dataResponse.json();
      comboIconManifest = iconResponse.ok
        ? await iconResponse.json()
        : { characters: {}, vehicles: {} };
      comboCharacterMap = new Map();
      comboVehicleMap = new Map();
      for (const character of comboBuilderData?.characters || []) {
        comboCharacterMap.set(comboLookupKey(character.name), character);
      }
      for (const vehicle of comboBuilderData?.vehicles || []) {
        comboVehicleMap.set(comboLookupKey(vehicle.name), vehicle);
      }
    } catch (e) {
      comboBuilderData = null;
      comboIconManifest = { characters: {}, vehicles: {} };
      comboCharacterMap = new Map();
      comboVehicleMap = new Map();
    }
  }

  function resolveComboStats(characterName, vehicleName) {
    if (!comboBuilderData) return null;
    const canonicalCharacter = canonicalComboCharacterName(characterName);
    const canonicalVehicle = canonicalComboVehicleName(vehicleName);
    const character = comboCharacterMap.get(comboLookupKey(canonicalCharacter));
    const vehicle = comboVehicleMap.get(comboLookupKey(canonicalVehicle));
    if (!character || !vehicle) return null;
    const stats = {};
    for (const key of comboBuilderData?.statKeys || []) {
      stats[key] = Number(character?.stats?.[key] || 0) + Number(vehicle?.stats?.[key] || 0);
    }
    const invLevel = Math.max(0, Math.min(21, Math.round(Number(stats.invincibility || 0))));
    const total = (comboBuilderData?.statKeys || []).reduce((sum, key) => sum + Number(stats[key] || 0), 0);
    return {
      character,
      vehicle,
      stats,
      total,
      invincibilityLevel: invLevel,
      invincibilityFrames: invincibilityFrames(invLevel),
      invincibilitySeconds: invincibilitySeconds(invLevel),
    };
  }

  function openComboBuilderForCombo(combo) {
    if (!combo?.character?.name || !combo?.vehicle?.name) return;
    try {
      localStorage.setItem(COMBO_BUILDER_SELECTION_KEY, JSON.stringify({
        character: combo.character.name,
        vehicle: combo.vehicle.name,
      }));
    } catch (e) {}
    window.location.href = "combo-builder.html";
  }

  function fillComboInfoDialog(combo, titleText, subtitleText) {
    if (!combo) return;
    const title = $("ttComboInfoTitle");
    const subtitle = $("ttComboInfoSubtitle");
    const lead = $("ttComboInfoLead");
    const icons = $("ttComboInfoIcons");
    const namesTitle = $("ttComboInfoNamesTitle");
    const namesMeta = $("ttComboInfoNamesMeta");
    const grid = $("ttComboInfoGrid");
    const openBuilderBtn = $("btnOpenComboBuilderFromComboInfo");

    if (title) title.textContent = titleText || "Combo stats";
    if (subtitle) subtitle.textContent = subtitleText || "Current combo breakdown.";
    if (icons) {
      icons.innerHTML = `
        ${comboIconMarkup("character", combo.character.name, combo.character.slug || combo.character.iconKey || "")}
        ${comboIconMarkup("vehicle", combo.vehicle.name, combo.vehicle.slug || combo.vehicle.iconKey || "")}
      `;
    }
    if (namesTitle) namesTitle.textContent = `${combo.character.name} + ${combo.vehicle.name}`;
    if (namesMeta) namesMeta.textContent = comboMetaText(combo);
    if (lead) lead.classList.remove("hidden");
    if (grid) {
      grid.innerHTML = COMBO_STAT_ORDER.map((key) => {
        const value = Number(combo.stats?.[key] || 0);
        const max = Number(comboBuilderData?.statMaxima?.[key] || 0);
        const primary = key === "invincibility"
          ? `Lv ${formatCompactNumber(value, 0)}`
          : `${formatCompactNumber(value, value % 1 ? 2 : 0)} / ${formatCompactNumber(max, 0)}`;
        const meta = key === "invincibility"
          ? `${formatCompactNumber(combo.invincibilityFrames, 0)}f | ${combo.invincibilitySeconds.toFixed(3)}s`
          : "";
        return `
          <div class="ttComboInfoStat">
            <div class="ttComboInfoStatLabel">${escapeHtml(statLabel(key))}</div>
            <div class="ttComboInfoStatValue">${escapeHtml(primary)}</div>
            ${meta ? `<div class="ttComboInfoStatMeta">${escapeHtml(meta)}</div>` : ""}
          </div>
        `;
      }).join("");
    }
    if (openBuilderBtn) {
      openBuilderBtn.classList.remove("hidden");
      openBuilderBtn.disabled = false;
    }
  }

  function openComboInfoDialogForEntry(entryId) {
    const entry = entries.find((item) => String(item.id) === String(entryId));
    if (!entry) return;
    const combo = resolveComboStats(entry.character_name, entry.kart_name);
    if (!combo) {
      setStatus("No combo builder stats are available for this entry yet.", false);
      return;
    }
    currentComboInfoContext = combo;
    fillComboInfoDialog(combo, entry.track_name, `${categoryLabel(entry.category)} personal combo`);
    openDialog("ttComboInfoDialog");
  }

  function openWrComboInfoDialog() {
    const context = currentWrComboContext;
    if (!context) return;
    const combo = resolveComboStats(context.characterName, context.vehicleName);
    if (!combo) {
      setStatus("No combo builder stats are available for this WR combo yet.", false);
      return;
    }
    currentComboInfoContext = combo;
    fillComboInfoDialog(combo, `${context.trackName} WR combo`, `${categoryLabel(context.category)} current record setup`);
    closeDialog("ttWrInfoDialog");
    openDialog("ttComboInfoDialog");
  }

  function isGuest() {
    return !(SESSION && SESSION.user);
  }

  function setStatus(message, ok = true) {
    const el = $("ttStatus");
    if (!el) return;
    const hasText = !!cleanText(message);
    if (window.MKWT?.setStatus) {
      window.MKWT.setStatus(el, hasText ? String(message) : "", ok);
    } else {
      el.textContent = hasText ? String(message) : "";
    }
    el.classList.toggle("hidden", !hasText);
  }

  function setUpdateBusy(active) {
    isUpdatingWr = !!active;
    const btn = $("btnRefreshTimeTrialWr");
    if (!btn) return;
    btn.disabled = isUpdatingWr || isGuest();
    if (isGuest()) {
      btn.textContent = "Login to update WRs";
    } else {
      btn.textContent = isUpdatingWr ? "Updating WRs..." : "Update WRs";
    }
  }

  function openDialog(id) {
    const dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  function closeDialog(id) {
    const dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function createPublicClient() {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: PUBLIC_AUTH_STORAGE,
        storageKey: "mkwt-time-trial-public-auth",
      },
    });
  }

  function loadGuestEntries() {
    try {
      const raw = localStorage.getItem(GUEST_ENTRIES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveGuestEntries(nextEntries) {
    try {
      localStorage.setItem(GUEST_ENTRIES_KEY, JSON.stringify(nextEntries || []));
    } catch (e) {}
  }

  function parseTimeMs(rawValue) {
    const raw = cleanText(rawValue);
    const match = raw.match(/^(?:(\d+)')?(\d{1,2})"(\d{3})$/) || raw.match(/^(?:(\d+):)?(\d{1,2})\.(\d{3})$/);
    if (!match) return null;
    const minutes = Number(match[1] || 0);
    const seconds = Number(match[2] || 0);
    const millis = Number(match[3] || 0);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(millis)) return null;
    if (seconds < 0 || seconds > 59 || millis < 0 || millis > 999) return null;
    return ((minutes * 60) + seconds) * 1000 + millis;
  }

  function formatTimeMs(ms) {
    const total = Number(ms);
    if (!Number.isFinite(total)) return "-";
    const safe = Math.max(0, Math.round(total));
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const millis = safe % 1000;
    if (minutes > 0) {
      return `${minutes}'${String(seconds).padStart(2, "0")}"${String(millis).padStart(3, "0")}`;
    }
    return `${seconds}"${String(millis).padStart(3, "0")}`;
  }

  function formatDiffMs(diffMs) {
    const value = Number(diffMs);
    if (!Number.isFinite(value)) return "-";
    if (value === 0) return "+0\"000";
    const sign = value < 0 ? "-" : "+";
    return sign + formatTimeMs(Math.abs(value));
  }

  function diffClass(diffMs) {
    const value = Number(diffMs);
    if (!Number.isFinite(value)) return "";
    if (value < 0) return "ttDiff ttDiff--ahead";
    if (value > 0) return "ttDiff ttDiff--behind";
    return "ttDiff ttDiff--equal";
  }

  function diffBandKey(diffMs) {
    const value = Number(diffMs);
    if (!Number.isFinite(value)) return "";
    const behindMs = Math.max(0, value);
    const band = TT_HIGHLIGHT_BANDS.find((entry) => behindMs <= entry.max);
    return band?.key || "";
  }

  function categoryLabel(value) {
    return CATEGORY_LABELS[String(value || "").toLowerCase()] || cleanText(value);
  }

  function categoryChip(value) {
    const key = String(value || "").toLowerCase();
    return `<span class="ttCategoryChip ttCategoryChip--${key}">${categoryLabel(key)}</span>`;
  }

  function diffBandClass(diffMs) {
    const key = diffBandKey(diffMs);
    return key ? `ttEntryCard--band-${key}` : "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function fmtDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const normalized = {
      ...entry,
      track_name: canonicalTrackName(entry.track_name || entry.track || ""),
      category: String(entry.category || "").toLowerCase(),
      time_text: cleanText(entry.time_text || entry.time || ""),
      time_ms: Number(entry.time_ms),
      character_name: cleanText(entry.character_name || ""),
      kart_name: cleanText(entry.kart_name || ""),
    };
    return normalized;
  }

  function recordKey(trackName, category) {
    return `${canonicalTrackName(trackName)}|${String(category || "").toLowerCase()}`;
  }

  function categoryMatchesFilter(category) {
    if (entryCategoryFilter === "all") return true;
    return String(category || "").toLowerCase() === entryCategoryFilter;
  }

  function getFilteredEntriesForProfile(worldRecordMap = buildWorldRecordMap()) {
    const filteredRows = entries.filter((entry) => categoryMatchesFilter(entry.category));
    filteredRows.sort((a, b) => compareEntriesForProfile(a, b, worldRecordMap));
    return filteredRows;
  }

  function computeTimeTrialSummary(sourceEntries, worldRecordMap = buildWorldRecordMap()) {
    const list = Array.isArray(sourceEntries) ? sourceEntries : [];
    const shroomCount = list.filter((entry) => entry.category === "shroom").length;
    const shroomlessCount = list.filter((entry) => entry.category === "shroomless").length;
    let closest = null;

    for (const entry of list) {
      const wr = worldRecordMap.get(recordKey(entry.track_name, entry.category));
      if (!wr || !Number.isFinite(entry.time_ms) || !Number.isFinite(wr.wr_time_ms)) continue;
      const diff = entry.time_ms - wr.wr_time_ms;
      const abs = Math.abs(diff);
      if (!closest || abs < closest.abs) {
        closest = {
          abs,
          diff,
          track_name: entry.track_name,
          category: entry.category,
        };
      }
    }

    return {
      entryCount: list.length,
      shroomCount,
      shroomlessCount,
      closest,
    };
  }

  function ttFilterLabel(value) {
    return ({
      all: "All",
      shroom: "Shroom",
      shroomless: "Shroomless",
    })[String(value || "").toLowerCase()] || "All";
  }

  function closeTtFilterMenus(exceptRoot = null) {
    document.querySelectorAll(".chartFilter").forEach((root) => {
      if (exceptRoot && root === exceptRoot) return;
      const btn = root.querySelector(".chartFilterBtn");
      const menu = root.querySelector(".chartFilterMenu");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function bindGlobalTtFilterClosers() {
    if (ttFilterBindingsReady) return;
    ttFilterBindingsReady = true;
    document.addEventListener("click", (event) => {
      if (event.target.closest(".chartFilter")) return;
      closeTtFilterMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeTtFilterMenus();
    });
  }

  function bindTtFilterToggle(btnId, menuId) {
    const btn = $(btnId);
    const menu = $(menuId);
    if (!btn || !menu) return;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const root = btn.closest(".chartFilter");
      const willOpen = menu.hidden;
      closeTtFilterMenus(root);
      menu.hidden = !willOpen;
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
  }

  function updateEntryFilterButtons() {
    document.querySelectorAll("#menuTtEntryFilter [data-tt-filter]").forEach((button) => {
      const active = String(button.getAttribute("data-tt-filter") || "") === entryCategoryFilter;
      button.classList.toggle("active", active);
    });
    const valueEl = $("ttEntryFilterValue");
    if (valueEl) valueEl.textContent = ttFilterLabel(entryCategoryFilter);
  }

  function setEntryCategoryFilter(nextFilter) {
    const key = String(nextFilter || "all").toLowerCase();
    entryCategoryFilter = ["all", "shroom", "shroomless"].includes(key) ? key : "all";
    updateEntryFilterButtons();
    closeTtFilterMenus();
    renderEntries();
  }

  function updateWrFilterButtons() {
    document.querySelectorAll("#menuTtWrFilter [data-tt-wr-filter]").forEach((button) => {
      const active = String(button.getAttribute("data-tt-wr-filter") || "") === wrCategoryFilter;
      button.classList.toggle("active", active);
    });
    const valueEl = $("ttWrFilterValue");
    if (valueEl) valueEl.textContent = ttFilterLabel(wrCategoryFilter);
  }

  function setWrCategoryFilter(nextFilter) {
    const key = String(nextFilter || "all").toLowerCase();
    wrCategoryFilter = ["all", "shroom", "shroomless"].includes(key) ? key : "all";
    updateWrFilterButtons();
    closeTtFilterMenus();
    renderWorldRecords();
  }

  function buildWorldRecordMap() {
    const map = new Map();
    for (const record of worldRecords) {
      map.set(recordKey(record.track_name, record.category), record);
    }
    return map;
  }

  function getEntryDiffMs(entry, worldRecordMap) {
    const wr = worldRecordMap.get(recordKey(entry.track_name, entry.category));
    if (!wr || !Number.isFinite(entry?.time_ms) || !Number.isFinite(wr?.wr_time_ms)) return null;
    return entry.time_ms - wr.wr_time_ms;
  }

  function getEntrySortStamp(entry) {
    const raw = entry?.updated_at || entry?.created_at || "";
    const stamp = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function compareEntriesForProfile(a, b, worldRecordMap) {
    const aDiff = getEntryDiffMs(a, worldRecordMap);
    const bDiff = getEntryDiffMs(b, worldRecordMap);
    const aHasDiff = Number.isFinite(aDiff);
    const bHasDiff = Number.isFinite(bDiff);

    if (aHasDiff && bHasDiff && aDiff !== bDiff) return aDiff - bDiff;
    if (aHasDiff !== bHasDiff) return aHasDiff ? -1 : 1;

    const aStamp = getEntrySortStamp(a);
    const bStamp = getEntrySortStamp(b);
    if (aStamp !== bStamp) return bStamp - aStamp;

    return compareTrackOrder(a, b);
  }

  function compareTrackOrder(a, b) {
    const order = new Map(trackOrder.map((track, index) => [track, index]));
    const aTrack = canonicalTrackName(a.track_name || a.track || a.trackName || "");
    const bTrack = canonicalTrackName(b.track_name || b.track || b.trackName || "");
    const aIndex = order.has(aTrack) ? order.get(aTrack) : Number.MAX_SAFE_INTEGER;
    const bIndex = order.has(bTrack) ? order.get(bTrack) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    if (aTrack !== bTrack) return aTrack.localeCompare(bTrack);
    const aCategory = String(a.category || "");
    const bCategory = String(b.category || "");
    if (aCategory === bCategory) return 0;
    if (aCategory === "shroom") return -1;
    if (bCategory === "shroom") return 1;
    return aCategory.localeCompare(bCategory);
  }

  function populateSelect(selectEl, items, placeholder, mapper) {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    selectEl.appendChild(first);
    for (const item of items || []) {
      const mapped = mapper ? mapper(item) : { value: String(item), label: String(item) };
      const option = document.createElement("option");
      option.value = mapped.value;
      option.textContent = mapped.label;
      selectEl.appendChild(option);
    }
    if (current && Array.from(selectEl.options).some((opt) => opt.value === current)) {
      selectEl.value = current;
    }
  }

  function refreshTrackSelect() {
    populateSelect($("ttTrack"), trackOrder, "Select track", (track) => ({
      value: track,
      label: track,
    }));
  }

  function updateWrInfo() {
    const info = $("ttWrInfo");
    if (!info) return;
    if (!worldRecords.length) {
      info.textContent = "No WR data in the database yet. Open WR and press Update WRs after login.";
      return;
    }
    const latest = worldRecords.reduce((max, record) => {
      const value = record?.fetched_at ? new Date(record.fetched_at).getTime() : 0;
      return value > max ? value : max;
    }, 0);
    const trackCount = new Set(worldRecords.map((record) => canonicalTrackName(record.track_name))).size;
    info.textContent = `${worldRecords.length} WR rows across ${trackCount} tracks - last update ${latest ? fmtDateTime(latest) : "-"}`;
  }

  function renderSummary() {
    const summary = computeTimeTrialSummary(entries);

    $("ttStatEntries").textContent = String(summary.entryCount);
    $("ttStatEntriesMeta").textContent = isGuest() ? "Guest local PB rows" : "Cloud PB rows";
    $("ttStatShroom").textContent = String(summary.shroomCount);
    $("ttStatShroomMeta").textContent = "Saved PBs";
    $("ttStatShroomless").textContent = String(summary.shroomlessCount);
    $("ttStatShroomlessMeta").textContent = "Saved PBs";

    if (summary.closest) {
      $("ttStatClosest").textContent = formatDiffMs(summary.closest.diff);
      $("ttStatClosest").className = `statValue ${diffClass(summary.closest.diff)}`.trim();
      $("ttStatClosestMeta").textContent = `${summary.closest.track_name} - ${categoryLabel(summary.closest.category)}`;
    } else {
      $("ttStatClosest").textContent = "-";
      $("ttStatClosest").className = "statValue";
      $("ttStatClosestMeta").textContent = "No WR comparison yet";
    }
  }

  function renderWorldRecords() {
    const body = $("ttWrRows");
    if (!body) return;
    const rows = worldRecords
      .filter((record) => wrCategoryFilter === "all" ? true : record.category === wrCategoryFilter)
      .slice()
      .sort(compareTrackOrder);

    if (!rows.length) {
      body.innerHTML = '<div class="ttEmptyState">No world record data yet.</div>';
      return;
    }

    body.innerHTML = rows.map((record) => {
      const combo = resolveComboStats(record.character_name, record.kart_name);
      const comboIcons = combo ? `
        <div class="ttWrComboIcons">
          ${comboIconMarkup("character", combo.character.name, combo.character.slug || combo.character.iconKey || "")}
          ${comboIconMarkup("vehicle", combo.vehicle.name, combo.vehicle.slug || combo.vehicle.iconKey || "")}
        </div>
      ` : "";
      const comboMeta = [record.character_name || "-", record.kart_name || "-"].filter(Boolean).join(" + ");
      return `
        <article class="ttWrCard">
          <div class="ttWrCardHead">
            <div class="ttWrTrackLead">
              <div class="ttWrTrackVisual">
                ${trackIconMarkup(record.track_name, "ttTrackIcon--wrCard")}
              </div>
              <div class="ttWrTrackMeta">
                <div class="ttWrTrackName">${escapeHtml(record.track_name)}</div>
                <div class="ttWrTrackSubline">${categoryChip(record.category)}</div>
              </div>
            </div>
            <div class="ttWrTimeBlock">
              <div class="ttWrCardLabel">WR</div>
              <div class="ttWrCardTime">${escapeHtml(record.wr_time_text)}</div>
            </div>
          </div>
          <div class="ttWrCardBody">
            <div class="ttWrMetric">
              <div class="ttWrMetricLabel">Holder</div>
              <div class="ttWrMetricValue">${escapeHtml(record.holder_name)}</div>
            </div>
            <div class="ttWrMetric ttWrMetric--combo">
              <div class="ttWrMetricLabel">Combo</div>
              <div class="ttWrMetricValue ttWrMetricValue--combo">
                ${comboIcons}
                <span class="ttWrComboNames">${escapeHtml(comboMeta)}</span>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function resetEditMode() {
    editingEntryId = null;
    const title = $("ttEntryDialogTitle");
    const subtitle = $("ttEntryDialogSubtitle");
    const saveBtn = $("btnSaveTimeTrial");
    if (title) title.textContent = "Track Time Trial";
    if (subtitle) subtitle.textContent = "Save one PB per track and category.";
    if (saveBtn) saveBtn.textContent = "Save PB";
  }

  function beginEditEntry(entryId) {
    const entry = entries.find((item) => String(item.id) === String(entryId));
    if (!entry) return;
    editingEntryId = String(entry.id);
    if ($("ttTrack")) $("ttTrack").value = entry.track_name || "";
    if ($("ttCategory")) $("ttCategory").value = entry.category || "shroom";
    if ($("ttTime")) $("ttTime").value = entry.time_text || "";
    if ($("ttCharacter")) $("ttCharacter").value = entry.character_name || "";
    if ($("ttKart")) $("ttKart").value = entry.kart_name || "";
    const title = $("ttEntryDialogTitle");
    const subtitle = $("ttEntryDialogSubtitle");
    const saveBtn = $("btnSaveTimeTrial");
    if (title) title.textContent = "Edit Time Trial PB";
    if (subtitle) subtitle.textContent = "Update your saved PB and keep the WR diff in sync.";
    if (saveBtn) saveBtn.textContent = "Update PB";
    setStatus("", true);
    openDialog("ttEntryDialog");
  }

  function openWrInfoDialogForEntry(entryId) {
    const entry = entries.find((item) => String(item.id) === String(entryId));
    if (!entry) return;
    const wr = buildWorldRecordMap().get(recordKey(entry.track_name, entry.category));
    if (!wr) {
      setStatus("No current WR data is available for this entry yet.", false);
      return;
    }

    const title = $("ttWrInfoTitle");
    const subtitle = $("ttWrInfoSubtitle");
    const grid = $("ttWrInfoGrid");
    const wrCombo = resolveComboStats(wr.character_name, wr.kart_name);
    const wrComboStatsBtn = $("btnOpenWrComboStats");
    const wrComboBuilderBtn = $("btnOpenComboBuilderFromWrInfo");
    const wrComboLead = wrCombo ? `
      <div class="ttWrInfoComboLead">
        <div class="ttWrInfoComboIcons">
          ${comboIconMarkup("character", wrCombo.character.name, wrCombo.character.slug || wrCombo.character.iconKey || "")}
          ${comboIconMarkup("vehicle", wrCombo.vehicle.name, wrCombo.vehicle.slug || wrCombo.vehicle.iconKey || "")}
        </div>
        <div class="ttWrInfoComboNames">
          <div class="ttWrInfoComboTitle">${escapeHtml(wr.character_name || "-")} + ${escapeHtml(wr.kart_name || "-")}</div>
          <div class="ttWrInfoComboMeta">${escapeHtml(wr.holder_name || "-")} current WR setup</div>
        </div>
      </div>
    ` : "";
    if (title) title.textContent = entry.track_name;
    if (subtitle) subtitle.textContent = `${categoryLabel(entry.category)} current WR details`;
    if (grid) {
      grid.innerHTML = `
        ${wrComboLead}
        <div class="ttWrInfoItem">
          <div class="ttWrInfoLabel">WR Time</div>
          <div class="ttWrInfoValue">${escapeHtml(wr.wr_time_text || "-")}</div>
        </div>
        <div class="ttWrInfoItem">
          <div class="ttWrInfoLabel">Holder</div>
          <div class="ttWrInfoValue">${escapeHtml(wr.holder_name || "-")}</div>
        </div>
      `;
    }
    currentWrComboContext = wrCombo ? {
      trackName: entry.track_name,
      category: entry.category,
      characterName: wr.character_name,
      vehicleName: wr.kart_name,
    } : null;
    if (wrComboStatsBtn) {
      wrComboStatsBtn.classList.toggle("hidden", !wrCombo);
      wrComboStatsBtn.disabled = !wrCombo;
    }
    if (wrComboBuilderBtn) {
      wrComboBuilderBtn.classList.toggle("hidden", !wrCombo);
      wrComboBuilderBtn.disabled = !wrCombo;
    }
    openDialog("ttWrInfoDialog");
  }

  function renderEntries() {
    const body = $("ttEntryRows");
    if (!body) return;
    const map = buildWorldRecordMap();
    const rows = entries.slice();
    const filteredRows = getFilteredEntriesForProfile(map);

    if (!rows.length) {
      body.innerHTML = '<div class="ttEmptyState">No saved Time Trial PBs yet. Press Track PB to add your first time.</div>';
      renderSummary();
      return;
    }

    if (!filteredRows.length) {
      body.innerHTML = '<div class="ttEmptyState">No saved PBs for this category yet.</div>';
      renderSummary();
      return;
    }

    body.innerHTML = filteredRows.map((entry) => {
      const wr = map.get(recordKey(entry.track_name, entry.category));
      const diff = getEntryDiffMs(entry, map);
      const diffText = diff == null ? "-" : formatDiffMs(diff);
      const comboDesktopMarkup = renderEntryComboMarkup(entry, "desktop");
      const comboMobileMarkup = renderEntryComboMarkup(entry, "mobile");
      return `
        <article class="ttEntryCard ${diffBandClass(diff)}">
          <div class="ttEntryRow">
            <div class="ttEntryCell ttEntryCell--main">
              <div class="ttTrackIconWrap">${trackIconMarkup(entry.track_name)}</div>
            </div>
            <div class="ttEntryCell ttEntryCell--timings">
              <div class="ttTimeStack">
                <div class="ttTimePrimary">${escapeHtml(entry.time_text)}</div>
                <div class="ttTimeDiffRow">
                  <div class="ttTimeSecondary ${diffClass(diff)}">${escapeHtml(diffText)}</div>
                  ${wr ? `<button class="ttInfoBtn" data-entry-action="wr-info" data-entry-id="${escapeHtml(entry.id)}" type="button" title="Current WR holder info" aria-label="Current WR holder info">!</button>` : ""}
                </div>
              </div>
              <div class="ttTimeStack ttTimeStack--wr">
                <div class="ttWrValue">${escapeHtml(wr?.wr_time_text || "-")}</div>
              </div>
              <div class="ttTimeStack ttTimeStack--setupMobile">
                ${comboMobileMarkup}
              </div>
            </div>
            <div class="ttEntryCell ttEntryCell--setup">
              ${comboDesktopMarkup}
            </div>
            <div class="ttEntryCell ttEntryCell--action">
              <div class="ttEntryActionGroup">
                <button class="btn2 ttActionBtn" data-entry-action="edit" data-entry-id="${escapeHtml(entry.id)}" type="button">Edit</button>
                <button class="btn2 danger ttActionBtn ttDeleteBtn" data-entry-action="delete" data-entry-id="${escapeHtml(entry.id)}" type="button">Delete</button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    renderSummary();
  }

  async function loadProfileInfo() {
    if (isGuest()) {
      $("ttUserInfo").textContent = "Guest Time Trial profile (local only)";
      setUpdateBusy(false);
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("nickname")
        .eq("id", SESSION.user.id)
        .maybeSingle();
      if (error) throw error;
      PROFILE = data || null;
      const label = cleanText(data?.nickname) || "Account";
      $("ttUserInfo").textContent = `${label} - ${typeof maskEmail === "function" ? maskEmail(SESSION.user?.email) : cleanText(SESSION.user?.email)}`;
    } catch (e) {
      $("ttUserInfo").textContent = cleanText(SESSION.user?.email) || "Signed in";
    }
    setUpdateBusy(false);
  }

  async function loadCatalog() {
    const [{ data: charData, error: charError }, { data: kartData, error: kartError }] = await Promise.all([
      publicClient.from("time_trial_characters").select("name,sort_order").order("sort_order", { ascending: true }),
      publicClient.from("time_trial_karts").select("name,vehicle_type,sort_order").order("sort_order", { ascending: true }),
    ]);

    if (charError) throw charError;
    if (kartError) throw kartError;

    characters = (Array.isArray(charData) ? charData : [])
      .slice()
      .sort((a, b) => cleanText(a?.name).localeCompare(cleanText(b?.name), undefined, { sensitivity: "base" }));
    karts = (Array.isArray(kartData) ? kartData : [])
      .slice()
      .sort((a, b) => cleanText(a?.name).localeCompare(cleanText(b?.name), undefined, { sensitivity: "base" }));

    populateSelect($("ttCharacter"), characters, "Select character", (item) => ({
      value: item.name,
      label: item.name,
    }));
    populateSelect($("ttKart"), karts, "Select kart", (item) => ({
      value: item.name,
      label: `${item.name} (${item.vehicle_type})`,
    }));
    refreshTrackSelect();
  }

  async function loadWorldRecords() {
    const { data, error } = await publicClient
      .from("time_trial_world_records")
      .select("*");
    if (error) throw error;

    worldRecords = (Array.isArray(data) ? data : [])
      .map((record) => ({
        ...record,
        track_name: canonicalTrackName(record.track_name),
        category: String(record.category || "").toLowerCase(),
        wr_time_ms: Number(record.wr_time_ms),
      }))
      .sort(compareTrackOrder);

    const recordTracks = Array.from(new Set(worldRecords.map((record) => canonicalTrackName(record.track_name))));
    if (recordTracks.length) {
      const merged = Array.from(new Set([...recordTracks, ...TRACKS_FALLBACK]));
      trackOrder = merged.sort((a, b) => compareTrackOrder({ track_name: a, category: "shroom" }, { track_name: b, category: "shroom" }));
      refreshTrackSelect();
    }

    updateWrInfo();
    renderWorldRecords();
    renderEntries();
  }

  async function loadEntries() {
    if (isGuest()) {
      entries = loadGuestEntries().map(normalizeEntry).filter(Boolean);
      renderEntries();
      return;
    }

    const { data, error } = await supabaseClient
      .from("time_trial_entries")
      .select("*")
      .eq("user_id", SESSION.user.id);

    if (error) throw error;
    entries = (Array.isArray(data) ? data : []).map(normalizeEntry).filter(Boolean);
    renderEntries();
  }

  function validateForm() {
    const track = canonicalTrackName($("ttTrack")?.value || "");
    const category = String($("ttCategory")?.value || "").toLowerCase();
    const rawTimeText = cleanText($("ttTime")?.value || "");
    const characterName = cleanText($("ttCharacter")?.value || "");
    const kartName = cleanText($("ttKart")?.value || "");
    const timeMs = parseTimeMs(rawTimeText);
    const timeText = Number.isFinite(timeMs) ? formatTimeMs(timeMs) : rawTimeText;

    if (!track) throw new Error("Please select a track.");
    if (!["shroom", "shroomless"].includes(category)) throw new Error("Please select a valid category.");
    if (timeMs == null) throw new Error("Enter a valid time like 1'54\"321 or 1:54.321.");
    if (!characterName) throw new Error("Please select a character.");
    if (!kartName) throw new Error("Please select a kart.");

    return { track, category, timeText, timeMs, characterName, kartName };
  }

  function clearForm() {
    if ($("ttTrack")) $("ttTrack").value = "";
    if ($("ttCategory")) $("ttCategory").value = "shroom";
    if ($("ttTime")) $("ttTime").value = "";
    if ($("ttCharacter")) $("ttCharacter").value = "";
    if ($("ttKart")) $("ttKart").value = "";
    resetEditMode();
  }

  async function saveEntry() {
    try {
      const payload = validateForm();
      const editingEntry = editingEntryId
        ? entries.find((entry) => String(entry.id) === String(editingEntryId))
        : null;
      const existing = entries.find((entry) =>
        recordKey(entry.track_name, entry.category) === recordKey(payload.track, payload.category)
        && String(entry.id) !== String(editingEntryId || "")
      );
      const now = new Date().toISOString();
      if (existing) {
        throw new Error("A PB for this track and category already exists.");
      }

      if (isGuest()) {
        const next = loadGuestEntries();
        if (editingEntry) {
          const index = next.findIndex((entry) => String(entry.id) === String(editingEntry.id));
          if (index >= 0) {
            next[index] = {
              ...next[index],
              track_name: payload.track,
              category: payload.category,
              time_text: payload.timeText,
              time_ms: payload.timeMs,
              character_name: payload.characterName,
              kart_name: payload.kartName,
              updated_at: now,
            };
          }
        } else {
          next.push({
            id: `guest_tt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            track_name: payload.track,
            category: payload.category,
            time_text: payload.timeText,
            time_ms: payload.timeMs,
            character_name: payload.characterName,
            kart_name: payload.kartName,
            created_at: now,
            updated_at: now,
          });
        }
        saveGuestEntries(next);
      } else {
        if (editingEntry) {
          const { error } = await supabaseClient
            .from("time_trial_entries")
            .update({
              track_name: payload.track,
              category: payload.category,
              time_text: payload.timeText,
              time_ms: payload.timeMs,
              character_name: payload.characterName,
              kart_name: payload.kartName,
              updated_at: now,
            })
            .eq("id", editingEntry.id)
            .eq("user_id", SESSION.user.id);
          if (error) throw error;
        } else {
          const { error } = await supabaseClient
            .from("time_trial_entries")
            .upsert(
              {
              user_id: SESSION.user.id,
              track_name: payload.track,
              category: payload.category,
              time_text: payload.timeText,
              time_ms: payload.timeMs,
              character_name: payload.characterName,
              kart_name: payload.kartName,
              updated_at: now,
              },
              { onConflict: "user_id,track_name,category" }
            );
          if (error) throw error;
        }
      }

      clearForm();
      closeDialog("ttEntryDialog");
      setStatus(editingEntry ? "PB updated." : "PB saved.", true);
      await loadEntries();
    } catch (e) {
      setStatus(e?.message || "Could not save the PB.", false);
    }
  }

  async function deleteEntry(entryId) {
    if (!entryId) return;
    if (!confirm("Delete this Time Trial PB?")) return;

    try {
      if (isGuest()) {
        const next = loadGuestEntries().filter((entry) => String(entry.id) !== String(entryId));
        saveGuestEntries(next);
      } else {
        const { error } = await supabaseClient
          .from("time_trial_entries")
          .delete()
          .eq("id", entryId)
          .eq("user_id", SESSION.user.id);
        if (error) throw error;
      }

      setStatus("PB removed.", true);
      await loadEntries();
    } catch (e) {
      setStatus(e?.message || "Could not delete the PB.", false);
    }
  }

  async function fetchTimeTrialApi(path, label) {
    const urls = [path];
    if (LOCAL_HOSTNAMES.has(location.hostname)) {
      urls.push(`http://127.0.0.1:8788${path}`);
    }

    let lastStatus = 0;
    let lastError = "";

    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        lastStatus = response.status;
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.ok) return payload;
        lastError = payload?.error || `HTTP ${response.status}`;
        if (LOCAL_HOSTNAMES.has(location.hostname) && !url.startsWith("http://127.0.0.1:8788")) {
          continue;
        }
        if (response.status !== 404) break;
      } catch (e) {
        lastError = e?.message || "Network error";
      }
    }

    if (LOCAL_HOSTNAMES.has(location.hostname) && lastStatus === 404) {
      throw new Error(`Live Server cannot run ${label}. Run tools/mkcentral-local-proxy.ps1 in PowerShell, then press Update WRs again.`);
    }
    if (LOCAL_HOSTNAMES.has(location.hostname)) {
      throw new Error(`Local MKWT proxy is not reachable. Run tools/mkcentral-local-proxy.ps1 in PowerShell. Last error: ${lastError}`);
    }
    throw new Error(lastError || "Time Trial sync failed.");
  }

  async function fetchTimeTrialIndex() {
    return fetchTimeTrialApi(`/api/time-trial-index?t=${Date.now()}`, "/api/time-trial-index");
  }

  async function fetchTimeTrialTrack(trackName) {
    return fetchTimeTrialApi(`/api/time-trial-track?track=${encodeURIComponent(trackName)}&t=${Date.now()}`, "/api/time-trial-track");
  }

  function parseTrackListFromIndex(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const navLists = Array.from(doc.querySelectorAll("#navbox ul"));
    const targetList = navLists.find((list) => cleanText(list.querySelector("li b u")?.textContent) === "WR History");
    if (!targetList) return TRACKS_FALLBACK.slice();

    const tracks = Array.from(targetList.querySelectorAll('a[href*="display.php?track="]'))
      .map((anchor) => {
        try {
          const url = new URL(anchor.getAttribute("href"), "https://mkwrs.com/mkworld/");
          return canonicalTrackName(url.searchParams.get("track") || anchor.textContent);
        } catch (e) {
          return canonicalTrackName(anchor.textContent);
        }
      })
      .filter((name) => name && !/\(glitch\)/i.test(name));

    return tracks.length ? Array.from(new Set(tracks)) : TRACKS_FALLBACK.slice();
  }

  function parseShroomCategory(raw) {
    const digits = String(raw || "").match(/\d+/g);
    if (!digits || !digits.length) return null;
    const total = digits.reduce((sum, value) => sum + Number(value || 0), 0);
    return total > 0 ? "shroom" : "shroomless";
  }

  function findHeadingTable(doc, headingText) {
    const heading = Array.from(doc.querySelectorAll("h2")).find((node) => cleanText(node.textContent).toLowerCase() === headingText.toLowerCase());
    if (!heading) return null;
    let cursor = heading.nextElementSibling;
    while (cursor) {
      if (cursor.matches && cursor.matches("table.wr")) return cursor;
      cursor = cursor.nextElementSibling;
    }
    return null;
  }

  function tableHeaders(table) {
    const headerRow = table?.querySelector("tr");
    const map = new Map();
    Array.from(headerRow?.querySelectorAll("th") || []).forEach((cell, index) => {
      const key = cleanText(cell.textContent).toLowerCase();
      if (key) map.set(key, index);
    });
    return map;
  }

  function cellText(cells, headerMap, fallbackIndex, headerKey) {
    const byHeader = headerMap?.has(headerKey) ? headerMap.get(headerKey) : fallbackIndex;
    return cleanText(cells[byHeader]?.textContent || "");
  }

  function parseTrackPage(trackName, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const historyTable = findHeadingTable(doc, "History");
    const currentTable = findHeadingTable(doc, "Current WR:");
    const bestByCategory = new Map();

    function considerRow(cells, headerMap) {
      if (!cells || cells.length < 4) return;
      const timeText = cellText(cells, headerMap, 1, "time");
      const holderName = cellText(cells, headerMap, 2, "player");
      const shrooms = cellText(cells, headerMap, 9, "shrooms");
      const characterName = cellText(cells, headerMap, 10, "character");
      const kartName = cellText(cells, headerMap, 11, "kart");
      const lastRecordedAt = cellText(cells, headerMap, 0, "date");
      const category = parseShroomCategory(shrooms);
      const timeMs = parseTimeMs(timeText);
      if (!category || !Number.isFinite(timeMs) || !holderName) return;

      const key = category;
      const nextRecord = {
        track_name: canonicalTrackName(trackName),
        category,
        wr_time_text: timeText,
        wr_time_ms: timeMs,
        holder_name: holderName,
        character_name: characterName || null,
        kart_name: kartName || null,
        last_recorded_at: /^\d{4}-\d{2}-\d{2}$/.test(lastRecordedAt) ? lastRecordedAt : null,
        source_url: `https://mkwrs.com/mkworld/display.php?track=${encodeURIComponent(trackName)}`,
      };

      const current = bestByCategory.get(key);
      if (!current || nextRecord.wr_time_ms < current.wr_time_ms) {
        bestByCategory.set(key, nextRecord);
      }
    }

    const historyHeaders = tableHeaders(historyTable);
    for (const row of Array.from(historyTable?.querySelectorAll("tr") || [])) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length) considerRow(cells, historyHeaders);
    }

    if (!bestByCategory.size && currentTable) {
      const currentHeaders = tableHeaders(currentTable);
      for (const row of Array.from(currentTable.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length) considerRow(cells, currentHeaders);
      }
    }

    return Array.from(bestByCategory.values());
  }

  async function fetchTrackPages(tracks) {
    const queue = tracks.slice();
    const results = [];
    const errors = [];
    const workerCount = Math.min(6, queue.length);

    async function consume() {
      while (queue.length) {
        const track = queue.shift();
        try {
          const payload = await fetchTimeTrialTrack(track);
          results.push({ track, html: payload.html });
        } catch (e) {
          errors.push(`${track}: ${e?.message || e}`);
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => consume()));
    return { results, errors };
  }

  async function updateWorldRecords() {
    if (isGuest()) {
      setStatus("Login to update WR data in the cloud database.", false);
      return;
    }

    try {
      setUpdateBusy(true);
      setStatus("Fetching mkwrs.com track list...", true);

      const indexPayload = await fetchTimeTrialIndex();
      const fetchedTracks = parseTrackListFromIndex(indexPayload.html);
      trackOrder = fetchedTracks.length ? fetchedTracks : TRACKS_FALLBACK.slice();
      refreshTrackSelect();

      setStatus(`Fetching ${trackOrder.length} WR track pages...`, true);
      const fetchedPages = await fetchTrackPages(trackOrder);
      if (fetchedPages.errors.length) {
        throw new Error(`Could not fetch all track pages. ${fetchedPages.errors[0]}`);
      }

      const records = [];
      for (const page of fetchedPages.results) {
        const parsed = parseTrackPage(page.track, page.html);
        if (!parsed.length) {
          throw new Error(`Could not parse WR data for ${page.track}.`);
        }
        records.push(...parsed);
      }

      if (!records.length) {
        throw new Error("No world records were parsed from mkwrs.com.");
      }

      setStatus(`Writing ${records.length} WR rows to Supabase...`, true);
      const { data, error } = await supabaseClient.rpc("refresh_time_trial_world_records", {
        p_records: records,
      });
      if (error) throw error;

      setStatus(`WR database updated. ${Number(data || records.length)} rows refreshed.`, true);
      await loadWorldRecords();
      await loadEntries();
    } catch (e) {
      setStatus(e?.message || "Could not update world records.", false);
    } finally {
      setUpdateBusy(false);
    }
  }

  async function initAuth() {
    await window.mkwtRequireAuth({
      pageName: "time-trial.html",
      allowGuest: true,
      onAccount: async (session, client) => {
        SESSION = session;
        supabaseClient = client;
        window.SESSION = session;
        window.supabaseClient = client;
        try {
          localStorage.setItem("mkwt_mode", "account");
        } catch (e) {}
      },
      onGuest: async () => {
        SESSION = null;
        supabaseClient = null;
        window.SESSION = null;
        window.supabaseClient = null;
        try {
          localStorage.setItem("mkwt_mode", "guest");
        } catch (e) {}
      },
    });
  }

  async function init() {
    publicClient = createPublicClient();
    await initAuth();
    await loadTrackIconMap();
    await loadComboAssets();
    await loadProfileInfo();
    await loadCatalog();
    await loadWorldRecords();
    await loadEntries();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindGlobalTtFilterClosers();
    bindTtFilterToggle("btnTtEntryFilter", "menuTtEntryFilter");
    bindTtFilterToggle("btnTtWrFilter", "menuTtWrFilter");
    $("btnOpenTimeTrialForm")?.addEventListener("click", () => {
      clearForm();
      setStatus("", true);
      openDialog("ttEntryDialog");
    });
    $("btnCloseTimeTrialForm")?.addEventListener("click", () => {
      clearForm();
      closeDialog("ttEntryDialog");
    });
    $("btnCancelTimeTrial")?.addEventListener("click", () => {
      clearForm();
      closeDialog("ttEntryDialog");
    });
    $("btnOpenWrDialog")?.addEventListener("click", () => openDialog("ttWrDialog"));
    $("btnCloseWrDialog")?.addEventListener("click", () => closeDialog("ttWrDialog"));
    $("btnCloseWrInfoDialog")?.addEventListener("click", () => closeDialog("ttWrInfoDialog"));
    $("btnCloseComboInfoDialog")?.addEventListener("click", () => closeDialog("ttComboInfoDialog"));
    $("btnOpenWrComboStats")?.addEventListener("click", openWrComboInfoDialog);
    $("btnOpenComboBuilderFromWrInfo")?.addEventListener("click", () => {
      const context = currentWrComboContext;
      if (!context) return;
      const combo = resolveComboStats(context.characterName, context.vehicleName);
      if (!combo) return;
      openComboBuilderForCombo(combo);
    });
    $("btnOpenComboBuilderFromComboInfo")?.addEventListener("click", () => {
      if (!currentComboInfoContext) return;
      openComboBuilderForCombo(currentComboInfoContext);
    });
    $("btnSaveTimeTrial")?.addEventListener("click", saveEntry);
    $("btnClearTimeTrial")?.addEventListener("click", () => {
      clearForm();
      setStatus("", true);
    });
    $("btnRefreshTimeTrialWr")?.addEventListener("click", updateWorldRecords);
    document.querySelectorAll("#menuTtEntryFilter [data-tt-filter]").forEach((button) => {
      button.addEventListener("click", () => setEntryCategoryFilter(button.getAttribute("data-tt-filter")));
    });
    document.querySelectorAll("#menuTtWrFilter [data-tt-wr-filter]").forEach((button) => {
      button.addEventListener("click", () => setWrCategoryFilter(button.getAttribute("data-tt-wr-filter")));
    });
    $("ttEntryRows")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-entry-id]");
      if (!button) return;
      const entryId = button.getAttribute("data-entry-id");
      const action = button.getAttribute("data-entry-action");
      if (action === "edit") {
        beginEditEntry(entryId);
        return;
      }
      if (action === "wr-info") {
        openWrInfoDialogForEntry(entryId);
        return;
      }
      if (action === "combo-info") {
        openComboInfoDialogForEntry(entryId);
        return;
      }
      deleteEntry(entryId);
    });
    document.querySelectorAll(".ttDialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          clearForm();
          if (dialog.id) closeDialog(dialog.id);
        }
      });
    });
    updateEntryFilterButtons();
    updateWrFilterButtons();
    init().catch((error) => {
      console.error(error);
      setStatus(error?.message || "Could not load Time Trial data.", false);
      setUpdateBusy(false);
    });
  });
})();
