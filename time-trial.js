(() => {
  const SUPABASE_URL = "https://imxlssgtzzdfgdscubdx.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGxzc2d0enpkZmdkc2N1YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2NDYsImV4cCI6MjA4MzY5ODY0Nn0.b5nRQ1ryAC4_TMrmC5qIXx7Gm2hDzrR51Z6RVks2Wg4";
  const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  const GUEST_ENTRIES_KEY = "mkwt_guest_time_trial_entries_v1";
  const WORLD_RECORDS_CACHE_KEY = "mkwt_time_trial_world_records_cache_v1";
  const COMBO_BUILDER_DATA_URL = "combo_builder_data.json";
  const COMBO_ICON_MANIFEST_URL = "combo_icon_map.json";
  const COMBO_BUILDER_SELECTION_KEY = "mkwt_combo_builder_selection_v1";
  const CATEGORY_LABELS = { shroom: "Shroom", shroomless: "Shroomless" };
  const WR_CHANGE_FIELDS = ["wr_time_text", "wr_time_ms", "holder_name", "character_name", "kart_name", "last_recorded_at"];
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
  let expandedEntryCards = new Set();
  let characters = [];
  let karts = [];
  let editingEntryId = null;
  let entryCategoryFilter = "all";
  let wrCategoryFilter = "all";
  let pendingWrNewRecordKeys = new Set();
  let ttFilterBindingsReady = false;
  let ttPickerBindingsReady = false;
  let ttPickerBackdrop = null;
  let ttPickerScrollY = 0;
  let activeTtLetterPicker = null;
  let ttStatusHideTimer = null;
  let ttStatusExitTimer = null;
  let trackIconPaths = new Map();
  let comboBuilderData = null;
  let comboIconManifest = { characters: {}, vehicles: {} };
  let comboCharacterMap = new Map();
  let comboVehicleMap = new Map();
  let currentWrComboContext = null;
  let currentComboInfoContext = null;
  const ttPickerIconReadyPaths = new Set();
  const ttPickerIconFailedPaths = new Set();
  const ttPickerIconPreloadPromises = new Map();
  let ttPickerIconWarmupPromise = null;
  let ttPickerIconWarmupKey = "";
  let ttPickerIconRefreshQueued = false;

  function pulseTimeTrialLetterHaptic() {
    const nav = window.navigator;
    if (!nav || typeof nav.vibrate !== "function") return;
    const isTouchDevice = Number(nav.maxTouchPoints || 0) > 0;
    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
    if (!isTouchDevice && !isCoarsePointer) return;
    try { nav.vibrate(8); } catch (e) {}
  }

  const PUBLIC_AUTH_STORAGE = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function profileDisplayLabel(name, fallback = "Account") {
    return `Profile: ${cleanText(name) || fallback}`;
  }

  function repairUtf8Mojibake(value) {
    const text = cleanText(value);
    const looksMisdecoded = Array.from(text).some((char, index, chars) => {
      const first = char.charCodeAt(0);
      const second = chars[index + 1]?.charCodeAt(0) || 0;
      return [0xc2, 0xc3, 0xe2, 0xe3].includes(first) && second >= 0x80 && second <= 0xbf;
    });
    if (!looksMisdecoded) return text;
    try {
      const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const hasAsianText = Array.from(decoded).some((char) => {
        const code = char.charCodeAt(0);
        return (code >= 0x3040 && code <= 0x30ff)
          || (code >= 0x3400 && code <= 0x9fff)
          || (code >= 0xac00 && code <= 0xd7af);
      });
      return hasAsianText ? cleanText(decoded) : text;
    } catch (e) {
      return text;
    }
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
    const withoutSkin = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const baseName = withoutSkin || raw;
    return COMBO_CHARACTER_ALIASES[raw] || COMBO_CHARACTER_ALIASES[baseName] || baseName;
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

  function pickerIconPathFromSource(iconPath, group) {
    const cleanPath = cleanText(iconPath).replace(/\\/g, "/");
    const fileName = cleanPath.split("/").pop();
    return fileName ? `assets/picker-icons/${group}/${fileName}` : "";
  }

  function trackPickerIconPath(trackName) {
    const sourcePath = trackIconPaths.get(canonicalTrackName(trackName)) || "";
    return pickerIconPathFromSource(sourcePath, "tracks") || sourcePath;
  }

  function comboPickerIconPath(type, slug) {
    const sourcePath = comboIconPath(type, slug);
    const group = type === "character" ? "characters" : "vehicles";
    return pickerIconPathFromSource(sourcePath, group) || sourcePath;
  }

  function scheduleTimeTrialPickerIconRefresh() {
    if (ttPickerIconRefreshQueued) return;
    ttPickerIconRefreshQueued = true;
    window.requestAnimationFrame(() => {
      ttPickerIconRefreshQueued = false;
      document.querySelectorAll(".ttPicker.is-open").forEach((root) => {
        renderTimeTrialPickerPanel(root);
        alignTimeTrialPickerPanel(root);
      });
    });
  }

  function preloadTimeTrialPickerIconPath(iconPath) {
    if (!iconPath || ttPickerIconReadyPaths.has(iconPath) || ttPickerIconFailedPaths.has(iconPath)) {
      return Promise.resolve(ttPickerIconReadyPaths.has(iconPath));
    }
    if (ttPickerIconPreloadPromises.has(iconPath)) return ttPickerIconPreloadPromises.get(iconPath);
    const promise = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      img.onload = async () => {
        try { await img.decode?.(); } catch (e) {}
        ttPickerIconReadyPaths.add(iconPath);
        scheduleTimeTrialPickerIconRefresh();
        resolve(true);
      };
      img.onerror = () => {
        ttPickerIconFailedPaths.add(iconPath);
        resolve(false);
      };
      img.src = iconPath;
    });
    ttPickerIconPreloadPromises.set(iconPath, promise);
    return promise;
  }

  function collectTimeTrialPickerIconPaths() {
    const paths = [];
    for (const track of trackOrder) {
      const src = trackPickerIconPath(track);
      if (src) paths.push(src);
    }
    for (const character of comboBuilderData?.characters || []) {
      const src = comboPickerIconPath("character", character.slug || character.iconKey || "");
      if (src) paths.push(src);
    }
    for (const vehicle of comboBuilderData?.vehicles || []) {
      const src = comboPickerIconPath("vehicle", vehicle.slug || vehicle.iconKey || "");
      if (src) paths.push(src);
    }
    return Array.from(new Set(paths));
  }

  function preloadTimeTrialPickerIcons() {
    const paths = collectTimeTrialPickerIconPaths();
    if (!paths.length) return Promise.resolve([]);
    const nextKey = paths.join("|");
    if (ttPickerIconWarmupPromise && ttPickerIconWarmupKey === nextKey) return ttPickerIconWarmupPromise;
    ttPickerIconWarmupKey = nextKey;
    ttPickerIconWarmupPromise = Promise.allSettled(paths.map(preloadTimeTrialPickerIconPath));
    return ttPickerIconWarmupPromise;
  }

  function scheduleTimeTrialPickerIconWarmup() {
    const run = () => preloadTimeTrialPickerIcons();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      window.setTimeout(run, 250);
    }
  }

  function comboIconMarkup(type, name, slug) {
    const src = comboPickerIconPath(type, slug);
    if (src) {
      return `<img class="ttComboIcon ttComboIcon--${escapeHtml(type)}" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" loading="lazy" decoding="async" fetchpriority="low" />`;
    }
    return `<span class="ttComboIconFallback" title="${escapeHtml(name)}">${escapeHtml(comboIconLetters(name))}</span>`;
  }

  function comboInfoButtonMarkup(entryId, title) {
    return `<button class="ttInfoBtn ttInfoBtn--combo" data-entry-action="combo-info" data-entry-id="${escapeHtml(entryId)}" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">!</button>`;
  }

  function trackIconMarkup(trackName, extraClass = "") {
    const iconPath = trackPickerIconPath(trackName);
    if (iconPath) {
      return `<img class="ttTrackIcon ${escapeHtml(extraClass)}" src="${escapeHtml(iconPath)}" alt="${escapeHtml(trackName)}" title="${escapeHtml(trackName)}" loading="lazy" decoding="async" fetchpriority="low" />`;
    }
    return `<div class="ttTrackIconFallback ${escapeHtml(extraClass)}" title="${escapeHtml(trackName)}">${escapeHtml(trackAbbrev(trackName))}</div>`;
  }

  function renderEntryComboMarkup(entry) {
    const combo = resolveComboStats(entry.character_name, entry.kart_name);
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
      <div class="ttComboStack" aria-label="Saved combo">
        <div class="ttComboTopRow">
          <div class="ttComboIcons" title="${escapeHtml([entry.character_name, entry.kart_name].filter(Boolean).join(" + "))}">
            ${charIcon}
            ${vehicleIcon}
          </div>
        </div>
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

  function setStatus(message, ok = true, autoHide = true) {
    const el = $("ttStatus");
    if (!el) return;
    const hasText = !!cleanText(message);
    if (ttStatusHideTimer) {
      clearTimeout(ttStatusHideTimer);
      ttStatusHideTimer = null;
    }
    if (ttStatusExitTimer) {
      clearTimeout(ttStatusExitTimer);
      ttStatusExitTimer = null;
    }
    if (!hasText) {
      el.textContent = "";
      el.className = "ttStatus hidden";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = String(message);
    el.className = `ttStatus ${ok ? "ok" : "bad"}`;
    requestAnimationFrame(() => {
      if (el.textContent === String(message)) el.classList.add("is-visible");
    });
    if (autoHide) {
      const currentMessage = String(message);
      ttStatusHideTimer = setTimeout(() => {
        if (el.textContent !== currentMessage) return;
        el.classList.remove("is-visible");
        ttStatusHideTimer = null;
        ttStatusExitTimer = setTimeout(() => {
          if (el.textContent !== currentMessage) return;
          el.textContent = "";
          el.className = "ttStatus hidden";
          el.hidden = true;
          ttStatusExitTimer = null;
        }, 220);
      }, 2000);
    }
  }

  function setUpdateBusy(active) {
    isUpdatingWr = !!active;
    const btn = $("btnRefreshTimeTrialWr");
    if (!btn) return;
    btn.disabled = isUpdatingWr;
    btn.textContent = isUpdatingWr ? "Updating WRs..." : "Update WRs";
  }

  function openDialog(id) {
    const dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  function closeDialog(id) {
    closeTimeTrialPickers();
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

  function isShroomCategory(value) {
    return String(value || "").toLowerCase() === "shroom";
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

  function safeDomId(value) {
    return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function entryActionsId(entryId) {
    return `ttEntryActions-${safeDomId(entryId)}`;
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

  function fmtDateOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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

  function normalizeWorldRecord(record) {
    if (!record || typeof record !== "object") return null;
    const normalized = {
      ...record,
      track_name: canonicalTrackName(record.track_name || record.track || ""),
      category: String(record.category || "").toLowerCase(),
      wr_time_text: cleanText(record.wr_time_text || ""),
      wr_time_ms: Number(record.wr_time_ms),
      holder_name: repairUtf8Mojibake(record.holder_name || ""),
      character_name: cleanText(record.character_name || "") || null,
      kart_name: cleanText(record.kart_name || "") || null,
      source_url: cleanText(record.source_url || ""),
      fetched_at: record.fetched_at || null,
    };
    if (!normalized.track_name || !isShroomCategory(normalized.category)) return null;
    if (!normalized.wr_time_text || !Number.isFinite(normalized.wr_time_ms)) return null;
    if (!normalized.holder_name) return null;
    return normalized;
  }

  function loadCachedWorldRecords() {
    try {
      const raw = localStorage.getItem(WORLD_RECORDS_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCachedWorldRecords(records) {
    try {
      localStorage.setItem(WORLD_RECORDS_CACHE_KEY, JSON.stringify(records || []));
    } catch (e) {}
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
      const diff = getEntryDiffMs(entry, worldRecordMap);
      if (!Number.isFinite(diff)) continue;
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
    if (window.MKWT_UI?.closeFilterMenus) {
      window.MKWT_UI.closeFilterMenus("chart", exceptRoot);
      return;
    }
    document.querySelectorAll(".chartFilter").forEach((root) => {
      if (exceptRoot && root === exceptRoot) return;
      const btn = root.querySelector(".chartFilterBtn");
      const menu = root.querySelector(".chartFilterMenu");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function bindGlobalTtFilterClosers() {
    if (window.MKWT_UI?.bindGlobalFilterClosers) {
      window.MKWT_UI.bindGlobalFilterClosers("chart");
      return;
    }
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
    if (window.MKWT_UI?.bindFilterToggle) {
      window.MKWT_UI.bindFilterToggle(btn, menu, { type: "chart" });
      return;
    }
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
    wrCategoryFilter = ["all", "shroom"].includes(key) ? key : "all";
    updateWrFilterButtons();
    closeTtFilterMenus();
    renderWorldRecords();
  }

  function updateTimeTrialCategoryToggle() {
    const current = String($("ttCategory")?.value || "shroom").toLowerCase() === "shroomless" ? "shroomless" : "shroom";
    if ($("ttCategory")) $("ttCategory").value = current;
    document.querySelectorAll("#ttCategoryToggle [data-tt-category]").forEach((button) => {
      const active = button.getAttribute("data-tt-category") === current;
      button.classList.toggle("isActive", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setTimeTrialCategory(nextCategory) {
    const key = String(nextCategory || "").toLowerCase() === "shroomless" ? "shroomless" : "shroom";
    if ($("ttCategory")) $("ttCategory").value = key;
    updateTimeTrialCategoryToggle();
  }

  function buildWorldRecordMap() {
    const map = new Map();
    for (const record of worldRecords) {
      if (!isShroomCategory(record.category)) continue;
      map.set(recordKey(record.track_name, record.category), record);
    }
    return map;
  }

  function getEntryWorldRecord(entry, worldRecordMap) {
    if (!isShroomCategory(entry?.category)) return null;
    return worldRecordMap.get(recordKey(entry.track_name, entry.category)) || null;
  }

  function normalizeWrChangeValue(record, field) {
    if (field === "wr_time_ms") {
      const value = Number(record?.[field]);
      return Number.isFinite(value) ? value : null;
    }
    if (field === "last_recorded_at") {
      return cleanText(record?.[field] || "").slice(0, 10);
    }
    return cleanText(record?.[field] || "");
  }

  function hasMeaningfulWrChange(currentRecord, nextRecord) {
    return WR_CHANGE_FIELDS.some((field) => normalizeWrChangeValue(currentRecord, field) !== normalizeWrChangeValue(nextRecord, field));
  }

  function collectChangedWorldRecordKeys(currentRecords, nextRecords) {
    const currentMap = new Map();
    for (const record of currentRecords || []) {
      if (!isShroomCategory(record?.category)) continue;
      currentMap.set(recordKey(record.track_name, record.category), record);
    }
    if (!currentMap.size) return [];

    const changedKeys = [];
    for (const record of nextRecords || []) {
      if (!isShroomCategory(record?.category)) continue;
      const key = recordKey(record.track_name, record.category);
      const currentRecord = currentMap.get(key);
      if (!currentRecord || hasMeaningfulWrChange(currentRecord, record)) {
        changedKeys.push(key);
      }
    }
    return changedKeys;
  }

  function getEntryDiffMs(entry, worldRecordMap) {
    const wr = getEntryWorldRecord(entry, worldRecordMap);
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
    populateSelect($("ttTrack"), trackOrder, "Track", (track) => ({
      value: track,
      label: track,
    }));
    refreshTimeTrialPickers();
  }

  function readPickerOptions(selectEl) {
    return Array.from(selectEl?.options || [])
      .filter((option) => option.value)
      .map((option) => ({
        value: option.value,
        label: cleanText(option.textContent || option.label || option.value),
      }));
  }

  function selectedPickerLabel(selectEl, placeholder = "") {
    const selected = selectEl?.selectedOptions?.[0];
    if (selectEl?.value && selected) return cleanText(selected.textContent || selected.label || selectEl.value);
    return placeholder || cleanText(selectEl?.options?.[0]?.textContent || "");
  }

  function pickerLetters(options) {
    const letters = options
      .map((option) => cleanText(option.label || option.value).charAt(0).toUpperCase())
      .filter((letter) => /^[A-Z0-9]$/.test(letter));
    return Array.from(new Set(letters)).sort((a, b) => a.localeCompare(b));
  }

  function filterPickerOptions(options, letter) {
    if (!letter || letter === "all") return options;
    return options.filter((option) => cleanText(option.label || option.value).charAt(0).toUpperCase() === letter);
  }

  function groupPickerOptions(options) {
    const groups = new Map();
    for (const option of options) {
      const letter = cleanText(option.label || option.value).charAt(0).toUpperCase() || "#";
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(option);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupOptions]) => ({ label, options: groupOptions }));
  }

  function pickerIconSlot(kind, value) {
    const slot = document.createElement("span");
    slot.className = "trackPicker__iconSlot ttPickerIconSlot";
    slot.setAttribute("aria-hidden", "true");
    let src = "";
    let fallbackText = "";

    if (kind === "track") {
      src = trackPickerIconPath(value);
      fallbackText = trackAbbrev(value);
    } else {
      const isCharacter = kind === "character";
      const combo = isCharacter
        ? comboCharacterMap.get(comboLookupKey(value))
        : comboVehicleMap.get(comboLookupKey(value));
      const slug = combo?.slug || combo?.iconKey || "";
      src = comboPickerIconPath(isCharacter ? "character" : "vehicle", slug);
      fallbackText = comboIconLetters(value);
    }

    if (src && ttPickerIconReadyPaths.has(src)) {
      const img = document.createElement("img");
      img.className = kind === "track" ? "trackPicker__icon" : "trackPicker__icon ttPickerComboIcon";
      img.src = src;
      img.alt = "";
      img.width = 24;
      img.height = 24;
      img.decoding = "async";
      img.loading = "eager";
      slot.appendChild(img);
      return slot;
    }

    if (src) preloadTimeTrialPickerIconPath(src);
    const fallback = document.createElement("span");
    fallback.className = "trackPicker__iconFallback";
    fallback.textContent = fallbackText || "?";
    slot.appendChild(fallback);
    return slot;
  }

  function refreshTimeTrialPickers() {
    document.querySelectorAll(".ttPicker").forEach((root) => {
      const select = $(root.dataset.selectId || "");
      const valueEl = root.querySelector(".trackPicker__value");
      const trigger = root.querySelector(".trackPicker__trigger");
      if (!select || !valueEl || !trigger) return;
      const text = selectedPickerLabel(select, root.dataset.placeholder || "Select");
      valueEl.textContent = text;
      trigger.title = text;
      trigger.classList.toggle("is-placeholder", !select.value);
      const panel = root.querySelector(".trackPicker__panel");
      if (panel && !panel.hidden) renderTimeTrialPickerPanel(root);
    });
  }

  function closeTimeTrialPickers(exceptRoot = null) {
    if (!exceptRoot) activeTtLetterPicker = null;
    document.querySelectorAll(".ttPicker").forEach((root) => {
      if (exceptRoot && root === exceptRoot) return;
      root.classList.remove("is-open");
      root.querySelector(".trackPicker__trigger")?.setAttribute("aria-expanded", "false");
      const panel = root.querySelector(".trackPicker__panel");
      if (panel) panel.hidden = true;
    });
    if (!exceptRoot) {
      if (ttPickerBackdrop) ttPickerBackdrop.hidden = true;
      document.documentElement.classList.remove("trackPickerScrollLocked");
      document.body.classList.remove("trackPickerScrollLocked");
      document.body.style.top = "";
      if (ttPickerScrollY) window.scrollTo(0, ttPickerScrollY);
      ttPickerScrollY = 0;
    }
  }

  function alignTimeTrialPickerPanel(root) {
    const panel = root.querySelector(".trackPicker__panel");
    if (!panel) return;
    panel.style.left = "";
    panel.style.top = "";
    panel.style.width = "";
    const viewport = window.visualViewport || {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
    };
    const isMobile = viewport.width < 760;
    const margin = isMobile ? 10 : 16;
    const desiredWidth = Number(root.dataset.panelWidth || 900);
    const panelWidth = Math.min(isMobile ? 760 : desiredWidth, viewport.width - (margin * 2));
    panel.style.width = `${Math.round(panelWidth)}px`;
    panel.style.left = `${Math.round(viewport.offsetLeft + ((viewport.width - panelWidth) / 2))}px`;
    const rect = panel.getBoundingClientRect();
    const preferredTop = viewport.offsetTop + ((viewport.height - rect.height) / 2);
    const maxTop = viewport.offsetTop + viewport.height - rect.height - margin;
    panel.style.top = `${Math.round(Math.max(viewport.offsetTop + margin, Math.min(preferredTop, maxTop)))}px`;
  }

  function setTimeTrialLetterFilter(root, letter, focusLetter = false, withHaptic = false) {
    const select = $(root?.dataset?.selectId || "");
    const panel = root?.querySelector?.(".trackPicker__panel");
    if (!root || !select || !panel || panel.hidden) return false;
    const letters = pickerLetters(readPickerOptions(select));
    const requested = letter && letter !== "all" ? String(letter).trim().charAt(0).toUpperCase() : "all";
    const next = requested !== "all" && letters.includes(requested) ? requested : "all";
    if ((root.dataset.letterFilter || "all") === next) return false;
    root.dataset.letterFilter = next;
    renderTimeTrialPickerPanel(root);
    alignTimeTrialPickerPanel(root);
    if (withHaptic) pulseTimeTrialLetterHaptic();
    if (focusLetter) {
      window.requestAnimationFrame(() => {
        root.querySelector(`[data-letter-filter="${CSS.escape(next)}"]`)?.focus?.();
      });
    }
    return true;
  }

  function resetTimeTrialLetterFilter(root, focusAll = true) {
    if (!root || (root.dataset.letterFilter || "all") === "all") return false;
    return setTimeTrialLetterFilter(root, "all", focusAll);
  }

  function applyTimeTrialLetterFilterFromPoint(clientX, clientY, withHaptic = false) {
    if (!activeTtLetterPicker) return;
    const target = document.elementFromPoint(clientX, clientY);
    const button = target?.closest?.("[data-letter-filter]");
    if (!button || !activeTtLetterPicker.querySelector(".trackPicker__panel")?.contains(button)) return;
    setTimeTrialLetterFilter(activeTtLetterPicker, button.dataset.letterFilter || "all", false, withHaptic);
  }

  function applyTimeTrialKeyboardLetterFilter(root, key) {
    const select = $(root?.dataset?.selectId || "");
    if (!root || !select) return false;
    const letter = String(key || "").trim().charAt(0).toUpperCase();
    if (!/^[A-Z0-9]$/.test(letter)) return false;
    if (!pickerLetters(readPickerOptions(select)).includes(letter)) return false;
    return setTimeTrialLetterFilter(root, letter, true);
  }

  function findOpenTimeTrialPickerRoot() {
    return Array.from(document.querySelectorAll(".ttPicker"))
      .find((root) => !root.querySelector(".trackPicker__panel")?.hidden) || null;
  }

  function renderTimeTrialPickerPanel(root) {
    const select = $(root.dataset.selectId || "");
    const panel = root.querySelector(".trackPicker__panel");
    if (!select || !panel) return;
    const kind = root.dataset.kind || "track";
    const options = readPickerOptions(select);
    const letters = pickerLetters(options);
    const currentLetter = letters.includes(root.dataset.letterFilter || "") ? root.dataset.letterFilter : "all";
    root.dataset.letterFilter = currentLetter;
    root.classList.toggle("trackPicker--letterFiltered", currentLetter !== "all");
    const visibleOptions = filterPickerOptions(options, currentLetter);
    const railLetters = ["all", ...letters];
    panel.innerHTML = "";
    panel.style.setProperty("--track-picker-letter-count", String(railLetters.length));
    panel.style.setProperty("--track-picker-mobile-height", `${32 + (railLetters.length * 24) + ((railLetters.length - 1) * 4)}px`);

    const layout = document.createElement("div");
    layout.className = "trackPicker__layout";
    const rail = document.createElement("div");
    rail.className = "trackPicker__letterRail";
    rail.setAttribute("aria-label", `${root.dataset.placeholder || "Picker"} filter`);

    railLetters.forEach((letter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trackPicker__letterBtn";
      if (letter === "all") button.classList.add("trackPicker__letterBtn--all");
      if (letter === currentLetter) button.classList.add("is-active");
      button.dataset.letterFilter = letter;
      button.setAttribute("aria-pressed", letter === currentLetter ? "true" : "false");
      button.textContent = letter === "all" ? "All" : letter;
      rail.appendChild(button);
    });

    rail.addEventListener("click", (event) => {
      const button = event.target.closest("[data-letter-filter]");
      if (!button) return;
      event.preventDefault();
      setTimeTrialLetterFilter(root, button.dataset.letterFilter || "all", false, true);
    });
    rail.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const button = event.target.closest("[data-letter-filter]");
      if (!button) return;
      event.preventDefault();
      if ((root.dataset.letterFilter || "all") !== "all") {
        resetTimeTrialLetterFilter(root);
        return;
      }
      setTimeTrialLetterFilter(root, button.dataset.letterFilter || "all");
    });
    rail.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-letter-filter]")) return;
      event.preventDefault();
      activeTtLetterPicker = root;
      applyTimeTrialLetterFilterFromPoint(event.clientX, event.clientY, true);
    });

    const trackArea = document.createElement("div");
    trackArea.className = "trackPicker__trackArea";
    const groupsEl = document.createElement("div");
    groupsEl.className = "trackPicker__groups";
    for (const group of groupPickerOptions(visibleOptions)) {
      const groupEl = document.createElement("div");
      groupEl.className = "trackPicker__group";
      const head = document.createElement("div");
      head.className = "trackPicker__groupLabel";
      head.textContent = group.label;
      groupEl.appendChild(head);
      for (const option of group.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "trackPicker__option";
        item.dataset.value = option.value;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", select.value === option.value ? "true" : "false");
        item.title = option.label;
        item.appendChild(pickerIconSlot(kind, option.value));
        const text = document.createElement("span");
        text.className = "trackPicker__optionText";
        text.textContent = option.label;
        item.appendChild(text);
        groupEl.appendChild(item);
      }
      groupsEl.appendChild(groupEl);
    }
    if (!groupsEl.children.length) {
      const empty = document.createElement("div");
      empty.className = "trackPicker__empty";
      empty.textContent = "No options";
      groupsEl.appendChild(empty);
    }
    trackArea.appendChild(groupsEl);
    layout.appendChild(rail);
    layout.appendChild(trackArea);
    panel.appendChild(layout);
  }

  function openTimeTrialPicker(root) {
    closeTimeTrialPickers(root);
    root.dataset.letterFilter = "all";
    preloadTimeTrialPickerIcons();
    renderTimeTrialPickerPanel(root);
    const panel = root.querySelector(".trackPicker__panel");
    const trigger = root.querySelector(".trackPicker__trigger");
    if (!panel || !trigger) return;
    panel.hidden = false;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    if (!ttPickerBackdrop) {
      ttPickerBackdrop = document.createElement("div");
      ttPickerBackdrop.className = "trackPickerBackdrop ttPickerBackdrop";
      ttPickerBackdrop.hidden = true;
      document.body.appendChild(ttPickerBackdrop);
      ttPickerBackdrop.addEventListener("click", () => closeTimeTrialPickers());
    }
    ttPickerScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add("trackPickerScrollLocked");
    document.body.classList.add("trackPickerScrollLocked");
    document.body.style.top = `-${ttPickerScrollY}px`;
    ttPickerBackdrop.hidden = false;
    alignTimeTrialPickerPanel(root);
  }

  function initTimeTrialPickers() {
    const configs = [
      { id: "ttTrack", kind: "track", placeholder: "Track", width: 900 },
      { id: "ttCharacter", kind: "character", placeholder: "Character", width: 760 },
      { id: "ttKart", kind: "vehicle", placeholder: "Kart", width: 760 },
    ];
    for (const config of configs) {
      const select = $(config.id);
      if (!select || select.dataset.ttPickerReady === "1") continue;
      select.dataset.ttPickerReady = "1";
      select.classList.add("trackNativeSelect", "ttNativeSelect");
      const root = document.createElement("div");
      root.className = "trackPicker loungePicker ttPicker trackPicker--track";
      root.dataset.selectId = config.id;
      root.dataset.kind = config.kind;
      root.dataset.placeholder = config.placeholder;
      root.dataset.panelWidth = String(config.width || 900);
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "trackPicker__trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", config.placeholder);
      const valueEl = document.createElement("span");
      valueEl.className = "trackPicker__value";
      trigger.appendChild(valueEl);
      const chevron = document.createElement("span");
      chevron.className = "trackPicker__chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "v";
      trigger.appendChild(chevron);
      const panel = document.createElement("div");
      panel.className = "trackPicker__panel";
      panel.setAttribute("role", "listbox");
      panel.hidden = true;
      root.appendChild(trigger);
      root.appendChild(panel);
      select.insertAdjacentElement("afterend", root);

      trigger.addEventListener("click", () => {
        if (panel.hidden) openTimeTrialPicker(root);
        else closeTimeTrialPickers();
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!panel.hidden && (root.dataset.letterFilter || "all") !== "all") {
          resetTimeTrialLetterFilter(root);
          return;
        }
        if (panel.hidden) openTimeTrialPicker(root);
        else closeTimeTrialPickers();
      });
      panel.addEventListener("click", (event) => {
        event.stopPropagation();
        const optionButton = event.target.closest("[data-value]");
        if (!optionButton) return;
        select.value = optionButton.dataset.value || "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeTimeTrialPickers();
        refreshTimeTrialPickers();
        trigger.focus();
      });
      select.addEventListener("change", refreshTimeTrialPickers);
      const observer = new MutationObserver(refreshTimeTrialPickers);
      observer.observe(select, { childList: true, subtree: true, characterData: true });
      refreshTimeTrialPickers();
    }

    if (!ttPickerBindingsReady) {
      ttPickerBindingsReady = true;
      document.addEventListener("click", (event) => {
        if (event.target.closest(".ttPicker") || event.target.closest(".trackPicker__panel")) return;
        closeTimeTrialPickers();
      });
      document.addEventListener("pointermove", (event) => {
        if (!activeTtLetterPicker) return;
        event.preventDefault();
        applyTimeTrialLetterFilterFromPoint(event.clientX, event.clientY, true);
      }, { passive: false });
      document.addEventListener("pointerup", () => {
        activeTtLetterPicker = null;
      });
      document.addEventListener("pointercancel", () => {
        activeTtLetterPicker = null;
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (findOpenTimeTrialPickerRoot()) {
            event.preventDefault();
            event.stopPropagation();
          }
          closeTimeTrialPickers();
          return;
        }
        const openRoot = findOpenTimeTrialPickerRoot();
        if (!openRoot) return;
        const target = event.target;
        const isTextTarget = target?.matches?.("input, textarea, select") || target?.isContentEditable;
        if (isTextTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key.length === 1 && /^[a-z0-9]$/i.test(event.key)) {
          if (applyTimeTrialKeyboardLetterFilter(openRoot, event.key)) event.preventDefault();
          return;
        }
        if ((event.key === "Enter" || event.key === " ")
          && !target?.closest?.(".trackPicker__option, .trackPicker__trigger")
          && resetTimeTrialLetterFilter(openRoot)) {
          event.preventDefault();
        }
      });
      window.addEventListener("resize", () => closeTimeTrialPickers());
    }
  }

  function updateWrInfo() {
    const info = $("ttWrInfo");
    if (!info) return;
    if (!worldRecords.length) {
      info.textContent = "WRs not loaded yet";
      return;
    }
    const latest = worldRecords.reduce((max, record) => {
      const value = record?.fetched_at ? new Date(record.fetched_at).getTime() : 0;
      return value > max ? value : max;
    }, 0);
    info.textContent = latest ? `WR updated ${fmtDateOnly(latest)}` : "WR cache loaded";
  }

  function renderSummary() {
    const summary = computeTimeTrialSummary(entries);

    if ($("ttStatShroom")) $("ttStatShroom").textContent = `${summary.shroomCount}/30`;
    if ($("ttStatShroomless")) $("ttStatShroomless").textContent = `${summary.shroomlessCount}/30`;

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
      .filter((record) => isShroomCategory(record.category))
      .filter((record) => wrCategoryFilter === "all" ? true : record.category === wrCategoryFilter)
      .slice()
      .sort(compareTrackOrder);

    if (!rows.length) {
      body.innerHTML = '<div class="ttEmptyState">No world record data yet.</div>';
      return;
    }

    const displayedNewKeys = new Set();
    body.innerHTML = rows.map((record) => {
      const key = recordKey(record.track_name, record.category);
      const newBadge = pendingWrNewRecordKeys.has(key)
        ? '<span class="ttWrNewBadge">NEW</span>'
        : "";
      if (newBadge) displayedNewKeys.add(key);
      const combo = resolveComboStats(record.character_name, record.kart_name);
      const comboMeta = [record.character_name || "-", record.kart_name || "-"].filter(Boolean).join(" + ");
      const comboIcons = combo ? `
        <div class="ttWrComboIcons" title="${escapeHtml(comboMeta)}" aria-label="${escapeHtml(comboMeta)}">
          ${comboIconMarkup("character", combo.character.name, combo.character.slug || combo.character.iconKey || "")}
          ${comboIconMarkup("vehicle", combo.vehicle.name, combo.vehicle.slug || combo.vehicle.iconKey || "")}
        </div>
      ` : "-";
      return `
        <article class="ttWrCard">
          <div class="ttWrCardHead">
            <div class="ttWrTrackLead">
              <div class="ttWrTrackVisual">
                ${trackIconMarkup(record.track_name, "ttTrackIcon--wrCard")}
              </div>
              <div class="ttWrTrackMeta">
                <div class="ttWrTrackName" title="${escapeHtml(record.track_name)}">${escapeHtml(record.track_name)}</div>
                <div class="ttWrTrackSubline">${categoryChip(record.category)}${newBadge}</div>
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
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");
    displayedNewKeys.forEach((key) => pendingWrNewRecordKeys.delete(key));
  }

  function resetEditMode() {
    editingEntryId = null;
    const title = $("ttEntryDialogTitle");
    const subtitle = $("ttEntryDialogSubtitle");
    const saveBtn = $("btnSaveTimeTrial");
    if (title) title.textContent = "Track Time Trial";
    if (subtitle) {
      subtitle.textContent = "Save one PB per track and category.";
      subtitle.classList.remove("hidden");
    }
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
    updateTimeTrialCategoryToggle();
    refreshTimeTrialPickers();
    const title = $("ttEntryDialogTitle");
    const subtitle = $("ttEntryDialogSubtitle");
    const saveBtn = $("btnSaveTimeTrial");
    if (title) title.textContent = "Edit Time Trial PB";
    if (subtitle) {
      subtitle.textContent = "";
      subtitle.classList.add("hidden");
    }
    if (saveBtn) saveBtn.textContent = "Update PB";
    setStatus("", true);
    openDialog("ttEntryDialog");
  }

  function openWrInfoDialogForEntry(entryId) {
    const entry = entries.find((item) => String(item.id) === String(entryId));
    if (!entry) return;
    if (!isShroomCategory(entry.category)) {
      setStatus("Shroomless PBs are not compared to shroom-only WR data.", false);
      return;
    }
    const wr = getEntryWorldRecord(entry, buildWorldRecordMap());
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

  function toggleEntryCard(entryId) {
    const id = String(entryId || "");
    if (!id) return;
    if (expandedEntryCards.has(id)) {
      expandedEntryCards.delete(id);
    } else {
      expandedEntryCards.add(id);
    }
    renderEntries();
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
      body.innerHTML = '<div class="ttEmptyState">No PBs for this category yet.</div>';
      renderSummary();
      return;
    }

    body.innerHTML = filteredRows.map((entry) => {
      const canCompareWr = isShroomCategory(entry.category);
      const wr = getEntryWorldRecord(entry, map);
      const diff = getEntryDiffMs(entry, map);
      const diffText = !canCompareWr ? "No WR compare" : diff == null ? "-" : formatDiffMs(diff);
      const wrTimeText = canCompareWr ? (wr?.wr_time_text || "-") : "Shroom only";
      const entryId = String(entry.id);
      const expanded = expandedEntryCards.has(entryId);
      const actionsId = entryActionsId(entryId);
      const comboMarkup = renderEntryComboMarkup(entry);
      const wrInfoButton = canCompareWr
        ? `<button class="btn2 ttActionBtn" data-entry-action="wr-info" data-entry-id="${escapeHtml(entryId)}" type="button">Show WR infos</button>`
        : '<button class="btn2 ttActionBtn" type="button" disabled title="Shroomless PBs are not compared to shroom-only WR data.">WR shroom only</button>';
      return `
        <article class="ttEntryCard ${diffBandClass(diff)} ${expanded ? "is-open" : ""}">
          <div
            aria-controls="${escapeHtml(actionsId)}"
            aria-expanded="${expanded ? "true" : "false"}"
            aria-label="Toggle actions for ${escapeHtml(entry.track_name)} ${escapeHtml(categoryLabel(entry.category))}"
            class="ttEntryRow"
            data-entry-toggle="${escapeHtml(entryId)}"
            role="button"
            tabindex="0"
          >
            <div class="ttEntryCell ttEntryCell--main">
              <div class="ttTrackIconWrap">${trackIconMarkup(entry.track_name)}</div>
            </div>
            <div class="ttEntryCell ttEntryCell--timings">
              <div class="ttTimeStack ttTimeStack--pb">
                <div class="ttTimePrimary">${escapeHtml(entry.time_text)}</div>
                <div class="ttTimeDiffRow">
                  <div class="ttTimeSecondary ${diffClass(diff)}">${escapeHtml(diffText)}</div>
                </div>
              </div>
              <div class="ttTimeStack ttTimeStack--wr">
                <div class="ttEntryMiniLabel">WR Time</div>
                <div class="ttWrValue">${escapeHtml(wrTimeText)}</div>
              </div>
            </div>
            <div class="ttEntryCell ttEntryCell--setup">
              ${comboMarkup}
            </div>
          </div>
          <div class="ttEntryExpanded" id="${escapeHtml(actionsId)}" ${expanded ? "" : "hidden"}>
            <div class="ttEntryExpandedMeta">
              <div class="ttEntryExpandedInfo">
                <span class="ttEntryExpandedLabel">WR Time</span>
                <strong>${escapeHtml(wrTimeText)}</strong>
              </div>
            </div>
            <div class="ttEntryActionGroup">
              ${wrInfoButton}
              <button class="btn2 ttActionBtn" data-entry-action="combo-info" data-entry-id="${escapeHtml(entryId)}" type="button">Show my combo</button>
              <button class="btn2 ttActionBtn" data-entry-action="edit" data-entry-id="${escapeHtml(entryId)}" type="button">Edit</button>
              <button class="btn2 danger ttActionBtn ttDeleteBtn" data-entry-action="delete" data-entry-id="${escapeHtml(entryId)}" type="button">Delete</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    renderSummary();
  }

  async function loadProfileInfo() {
    if (isGuest()) {
      $("ttUserInfo").textContent = profileDisplayLabel("Guest", "Guest");
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
      $("ttUserInfo").textContent = profileDisplayLabel(data?.nickname);
    } catch (e) {
      $("ttUserInfo").textContent = profileDisplayLabel("");
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

    populateSelect($("ttCharacter"), characters, "Character", (item) => ({
      value: item.name,
      label: item.name,
    }));
    populateSelect($("ttKart"), karts, "Kart", (item) => ({
      value: item.name,
      label: `${item.name} (${item.vehicle_type})`,
    }));
    refreshTrackSelect();
    preloadTimeTrialPickerIcons();
    refreshTimeTrialPickers();
  }

  async function loadWorldRecords() {
    worldRecords = loadCachedWorldRecords()
      .map(normalizeWorldRecord)
      .filter((record) => isShroomCategory(record.category))
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
    updateTimeTrialCategoryToggle();
    refreshTimeTrialPickers();
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
    const ok = window.MKWT?.confirmAction
      ? await window.MKWT.confirmAction({
          eyebrow: "Delete",
          title: "Delete Time Trial PB?",
          body: "This removes the saved PB for this track and category.",
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          danger: true,
        })
      : confirm("Delete this Time Trial PB?");
    if (!ok) return;

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
      expandedEntryCards.delete(String(entryId));
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

  function rowCellTexts(row) {
    return Array.from(row?.querySelectorAll("td") || []).map((cell) => cleanText(cell.textContent || ""));
  }

  function cellTextFromValues(values, headerMap, fallbackIndex, headerKey) {
    const byHeader = headerMap?.has(headerKey) ? headerMap.get(headerKey) : fallbackIndex;
    return cleanText(values?.[byHeader] || "");
  }

  function parseTrackPage(trackName, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const historyTable = findHeadingTable(doc, "History");
    const currentTable = findHeadingTable(doc, "Current WR:");
    const bestByCategory = new Map();

    function considerRow(values, headerMap, nextValues) {
      if (!values || values.length < 4) return;
      const splitCombination = headerMap?.has("combination") && !headerMap.has("character") && !headerMap.has("kart");
      const combinationIndex = headerMap?.has("combination") ? headerMap.get("combination") : values.length - 1;
      const timeText = cellTextFromValues(values, headerMap, 1, "time");
      const holderName = cellTextFromValues(values, headerMap, 2, "player");
      const characterName = splitCombination
        ? cleanText(values[combinationIndex] || "")
        : cellTextFromValues(values, headerMap, 10, "character");
      const kartName = splitCombination
        ? cleanText(nextValues?.[nextValues.length - 1] || "")
        : cellTextFromValues(values, headerMap, 11, "kart");
      const lastRecordedAt = cellTextFromValues(values, headerMap, 0, "date");
      const category = "shroom";
      const timeMs = parseTimeMs(timeText);
      if (!Number.isFinite(timeMs) || !holderName) return;

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
    const historyRows = Array.from(historyTable?.querySelectorAll("tr") || []);
    for (let index = 0; index < historyRows.length; index++) {
      const values = rowCellTexts(historyRows[index]);
      if (values.length) considerRow(values, historyHeaders, rowCellTexts(historyRows[index + 1]));
    }

    if (!bestByCategory.size && currentTable) {
      const currentHeaders = tableHeaders(currentTable);
      const currentRows = Array.from(currentTable.querySelectorAll("tr"));
      for (let index = 0; index < currentRows.length; index++) {
        const values = rowCellTexts(currentRows[index]);
        if (values.length) considerRow(values, currentHeaders, rowCellTexts(currentRows[index + 1]));
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
    try {
      setUpdateBusy(true);
      setStatus("Fetching mkwrs.com track list...", true, false);

      const indexPayload = await fetchTimeTrialIndex();
      const fetchedTracks = parseTrackListFromIndex(indexPayload.html);
      trackOrder = fetchedTracks.length ? fetchedTracks : TRACKS_FALLBACK.slice();
      refreshTrackSelect();

      setStatus(`Fetching ${trackOrder.length} WR track pages...`, true, false);
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

      const changedWrKeys = collectChangedWorldRecordKeys(worldRecords, records);
      const fetchedAt = new Date().toISOString();
      const normalizedRecords = records
        .map((record) => normalizeWorldRecord({ ...record, fetched_at: fetchedAt }))
        .filter(Boolean)
        .sort(compareTrackOrder);
      saveCachedWorldRecords(normalizedRecords);
      worldRecords = normalizedRecords;
      pendingWrNewRecordKeys = new Set(changedWrKeys);
      setStatus(`WR data refreshed locally. ${normalizedRecords.length} rows loaded.`, true);
      updateWrInfo();
      renderWorldRecords();
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
    scheduleTimeTrialPickerIconWarmup();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindGlobalTtFilterClosers();
    bindTtFilterToggle("btnTtEntryFilter", "menuTtEntryFilter");
    bindTtFilterToggle("btnTtWrFilter", "menuTtWrFilter");
    initTimeTrialPickers();
    updateTimeTrialCategoryToggle();
    $("btnOpenTimeTrialForm")?.addEventListener("click", () => {
      clearForm();
      setStatus("", true);
      refreshTimeTrialPickers();
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
    $("btnOpenWrDialog")?.addEventListener("click", () => {
      renderWorldRecords();
      openDialog("ttWrDialog");
    });
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
    document.querySelectorAll("#ttCategoryToggle [data-tt-category]").forEach((button) => {
      button.addEventListener("click", () => setTimeTrialCategory(button.getAttribute("data-tt-category")));
    });
    $("ttCategory")?.addEventListener("change", updateTimeTrialCategoryToggle);
    $("btnRefreshTimeTrialWr")?.addEventListener("click", updateWorldRecords);
    document.querySelectorAll("#menuTtEntryFilter [data-tt-filter]").forEach((button) => {
      button.addEventListener("click", () => setEntryCategoryFilter(button.getAttribute("data-tt-filter")));
    });
    document.querySelectorAll("#menuTtWrFilter [data-tt-wr-filter]").forEach((button) => {
      button.addEventListener("click", () => setWrCategoryFilter(button.getAttribute("data-tt-wr-filter")));
    });
    $("ttEntryRows")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-entry-action][data-entry-id]");
      if (button) {
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
        return;
      }
      const toggle = event.target.closest("[data-entry-toggle]");
      if (!toggle) return;
      toggleEntryCard(toggle.getAttribute("data-entry-toggle"));
    });
    $("ttEntryRows")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const toggle = event.target.closest("[data-entry-toggle]");
      if (!toggle) return;
      event.preventDefault();
      toggleEntryCard(toggle.getAttribute("data-entry-toggle"));
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
