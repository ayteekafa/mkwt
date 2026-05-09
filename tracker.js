  function setStatus(msg, ok=false){
    const has = !!(msg && String(msg).trim());
    if (window.MKWT?.setStatus) {
      window.MKWT.setStatus($status, has ? String(msg) : '', ok);
      if ($status) {
        $status.textContent = '';
        $status.classList.add('hidden');
        $status.hidden = true;
      }
      return;
    }
    if ($status) $status.classList.toggle('hidden', !has);
  }
  let matchStatusHideTimer = null;
  let matchStatusExitTimer = null;
  function setMatchStatus(msg, ok=false, autoHide=true){
    const el = $("matchStatus");
    const has = !!(msg && String(msg).trim());
    if (matchStatusHideTimer) {
      clearTimeout(matchStatusHideTimer);
      matchStatusHideTimer = null;
    }
    if (matchStatusExitTimer) {
      clearTimeout(matchStatusExitTimer);
      matchStatusExitTimer = null;
    }
    if (!el) {
      setStatus(msg, ok);
      return;
    }
    if (!has) {
      el.textContent = "";
      el.className = "matchFormStatus hidden";
      return;
    }
    el.textContent = String(msg);
    el.className = "matchFormStatus " + (ok ? "ok" : "bad");
    requestAnimationFrame(() => {
      if (el.textContent === String(msg)) el.classList.add("is-visible");
    });
    if (has && autoHide) {
      const currentMsg = String(msg);
      matchStatusHideTimer = setTimeout(() => {
        if (el.textContent !== currentMsg) return;
        el.classList.remove("is-visible");
        matchStatusHideTimer = null;
        matchStatusExitTimer = setTimeout(() => {
          if (el.textContent !== currentMsg) return;
          el.textContent = "";
          el.className = "matchFormStatus hidden";
          matchStatusExitTimer = null;
        }, 220);
      }, 2000);
    }
  }
  function setDebug(msg){ window.MKWT?.setDebug?.($debug, msg); }
  function show(el, on){ el.classList.toggle("hidden", !on); }

  function setFieldValue(id, value, eventName = "change"){
    const el = $(id);
    if (!el) return;
    el.value = value;
    try { el.dispatchEvent(new Event(eventName, { bubbles: true })); } catch(e) {}
  }

  function ensureOption(selectEl, value, label){
    try{
      if(!selectEl || value == null) return;
      const v = String(value);
      if(!v) return;
      const existing = selectEl.querySelector(`option[value="${CSS.escape(v)}"]`);
      if(existing) return;
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = label || v;
      const placeholder = selectEl.querySelector('option[value=""]');
      if (placeholder && placeholder.nextSibling){
        selectEl.insertBefore(opt, placeholder.nextSibling);
      } else if (placeholder){
        selectEl.appendChild(opt);
      } else {
        selectEl.insertBefore(opt, selectEl.firstChild);
      }
    }catch(e){}
  }


  // ========= VR change <-> VR nach Match Sync =========
  // ========= Edit VR change <-> new total VR Sync =========
  let _syncingEditVr = false;

  function getEditBaseVr(){
    // base VR before this match = vr_after - vr_change (from stored snapshot)
    const after = Number(EDIT_ROW?.vr_after);
    const delta = Number(EDIT_ROW?.vr_change ?? 0);
    if (Number.isFinite(after)) return after - delta;

    // fallback if old rows had no vr_after: assume current profile VR minus old delta
    const cur = Number(PROFILE?.current_vr ?? 8500);
    return cur - delta;
  }

  function editSyncFromDelta(){
    if (_syncingEditVr) return;
    const elDelta = $("editVrChange");
    const elAfter = $("editVrAfter");
    if (!elDelta || !elAfter) return;

    const raw = String(elDelta.value || "").trim();
    if (!raw) { elAfter.value = ""; return; }
    const d = Number(raw);
    if (!Number.isFinite(d)) { elAfter.value = ""; return; }

    _syncingEditVr = true;
    elAfter.value = String(getEditBaseVr() + d);
    _syncingEditVr = false;
  }

  function editSyncFromAfter(){
    if (_syncingEditVr) return;
    const elDelta = $("editVrChange");
    const elAfter = $("editVrAfter");
    if (!elDelta || !elAfter) return;

    const raw = String(elAfter.value || "").trim();
    if (!raw) { elDelta.value = ""; return; }
    const a = Number(raw);
    if (!Number.isFinite(a)) { elDelta.value = ""; return; }

    _syncingEditVr = true;
    elDelta.value = String(a - getEditBaseVr());
    _syncingEditVr = false;
  }

  let _syncingVr = false;
  function getBaseVr(){
    return Number(PROFILE?.current_vr ?? 8500);
  }
  function syncFromDelta(){
    if (_syncingVr) return;
    const elDelta = $("vrChange");
    const elAfter = $("vrAfterInput");
    if (!elDelta || !elAfter) return;
    const raw = String(elDelta.value || "").trim();
    if (!raw) { elAfter.value = String(getBaseVr()); return; }
    const d = Number(raw);
    if (!Number.isFinite(d)) { elAfter.value = ""; return; }
    _syncingVr = true;
    elAfter.value = String(getBaseVr() + d);
    _syncingVr = false;
  }
  function syncFromAfter(){
    if (_syncingVr) return;
    const elDelta = $("vrChange");
    const elAfter = $("vrAfterInput");
    if (!elDelta || !elAfter) return;
    const raw = String(elAfter.value || "").trim();
    if (!raw) { elDelta.value = ""; return; }
    const a = Number(raw);
    if (!Number.isFinite(a)) { elDelta.value = ""; return; }
    _syncingVr = true;
    elDelta.value = String(a - getBaseVr());
    _syncingVr = false;
  }


function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

let trackIconPaths = new Map();
const trackIconReadyPaths = new Set();
const trackIconFailedPaths = new Set();
const trackIconPreloadPromises = new Map();
let trackPickerIconWarmupPromise = null;
let trackPickerIconRefreshQueued = false;

function cleanTrackText(value){
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function placementBannerClass(placement){
  const place = Number(placement);
  if (place === 1) return "trackerRow--gold";
  if (place === 2) return "trackerRow--silver";
  if (place === 3) return "trackerRow--bronze";
  return "";
}

function placementIconClass(placement){
  const place = Number(placement);
  if (place === 1) return "mcard__iconStage--gold";
  if (place === 2) return "mcard__iconStage--silver";
  return "";
}

// ========= Track-Liste =========
// Track names normalized to match the Intermission route JSON exactly.
const TRACKS = [
  "Acorn Heights","Airship Fortress","Boo Cinema","Bowser's Castle","Cheep Cheep Falls",
  "Choco Mountain","Crown City","Dandelion Depths","Desert Hills","Dino Dino Jungle",
  "DK Pass","DK Spaceport","Dry Bones Burnout","Faraway Oasis","Great ? Block Ruins",
  "Koopa Troopa Beach","Mario Circuit","Mario Bros. Circuit","Moo Moo Meadows",
  "Peach Beach","Peach Stadium","Rainbow Road","Salty Salty Speedway","Shy Guy Bazaar",
  "Sky-High Sundae","Starview Peak","Toad's Factory","Wario Shipyard","Wario Stadium",
  "Whistlestop Summit"
];

function canonicalTrackName(value){
  const raw = cleanTrackText(value);
  const exact = TRACKS.find((name) => name === raw);
  if (exact) return exact;
  const ci = TRACKS.find((name) => name.toLowerCase() === raw.toLowerCase());
  return ci || raw;
}

function trackAbbrev(trackName){
  const words = canonicalTrackName(trackName).split(/\s+/).filter(Boolean);
  return words.slice(0, 3).map((word) => word[0]).join("") || "?";
}

async function loadTrackIconMap() {
  try {
    const response = await fetch("track_icon_map.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const map = new Map();
    for (const [trackName, iconPath] of Object.entries(payload || {})) {
      const cleanPath = cleanTrackText(iconPath);
      if (!cleanPath) continue;
      map.set(canonicalTrackName(trackName), encodeURI(cleanPath));
    }
    trackIconPaths = map;
  } catch (e) {
    trackIconPaths = new Map();
  }
}

function getTrackIconPath(trackName){
  return trackIconPaths.get(canonicalTrackName(trackName)) || "";
}

function pickerIconPathFromSource(iconPath, group){
  const cleanPath = cleanTrackText(iconPath).replace(/\\/g, "/");
  const fileName = cleanPath.split("/").pop();
  return fileName ? `assets/picker-icons/${group}/${fileName}` : "";
}

function getTrackPickerIconPath(trackName){
  const iconPath = getTrackIconPath(trackName);
  return pickerIconPathFromSource(iconPath, "tracks") || iconPath;
}

function scheduleTrackPickerIconRefresh(){
  if (trackPickerIconRefreshQueued) return;
  trackPickerIconRefreshQueued = true;
  requestAnimationFrame(() => {
    trackPickerIconRefreshQueued = false;
    try { window.MKWT_TRACK_PICKERS?.refreshTrackPickers?.(); } catch(e) {}
  });
}

function preloadTrackIconPath(iconPath){
  if (!iconPath || trackIconReadyPaths.has(iconPath) || trackIconFailedPaths.has(iconPath)) {
    return Promise.resolve(trackIconReadyPaths.has(iconPath));
  }
  if (trackIconPreloadPromises.has(iconPath)) return trackIconPreloadPromises.get(iconPath);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = "low";
    img.onload = async () => {
      try { await img.decode?.(); } catch(e) {}
      trackIconReadyPaths.add(iconPath);
      scheduleTrackPickerIconRefresh();
      resolve(true);
    };
    img.onerror = () => {
      trackIconFailedPaths.add(iconPath);
      resolve(false);
    };
    img.src = iconPath;
  });

  trackIconPreloadPromises.set(iconPath, promise);
  return promise;
}

function preloadTrackPickerIcons(){
  if (trackPickerIconWarmupPromise) return trackPickerIconWarmupPromise;
  const paths = [...new Set(TRACKS.map(getTrackPickerIconPath).filter(Boolean))];
  trackPickerIconWarmupPromise = Promise.allSettled(paths.map(preloadTrackIconPath));
  return trackPickerIconWarmupPromise;
}

function trackIconMarkup(trackName, extraClass = "", withFoil = false) {
  const iconPath = getTrackIconPath(trackName);
  const classSuffix = extraClass ? ` ${escapeHtml(extraClass)}` : "";
  const safeTrack = escapeHtml(trackName);
  if (iconPath) {
    const safePath = escapeHtml(iconPath);
    const baseIcon = `<img class="mcard__routeIcon${classSuffix}" src="${safePath}" alt="${safeTrack}" title="${safeTrack}" loading="lazy" decoding="async" />`;
    if (!withFoil) return baseIcon;
    return `<span class="mcard__routeIconWrap">${baseIcon}<img class="mcard__routeIcon mcard__routeIconFoil" src="${safePath}" alt="" aria-hidden="true" loading="lazy" decoding="async" /></span>`;
  }
  const fallbackText = escapeHtml(trackAbbrev(trackName));
  const baseFallback = `<span class="mcard__routeIconFallback${classSuffix}" title="${safeTrack}">${fallbackText}</span>`;
  if (!withFoil) return baseFallback;
  return `<span class="mcard__routeIconWrap">${baseFallback}<span class="mcard__routeIconFallback mcard__routeIconFoil" aria-hidden="true">${fallbackText}</span></span>`;
}

const TRACK_PICKER_TEST_ENABLED = true;

function initTrackPickers(){
  if (!TRACK_PICKER_TEST_ENABLED) return;
  const pickerConfigs = [
    { id: "intermission", kind: "track" },
    { id: "track", kind: "track" },
    { id: "editIntermission", kind: "track" },
    { id: "editTrack", kind: "track" },
    { id: "opponents", kind: "number", values: Array.from({ length: 23 }, (_, index) => String(23 - index)), columns: 5, width: 390 },
    { id: "placement", kind: "number", values: Array.from({ length: 24 }, (_, index) => String(index + 1)), columns: 6, width: 430 },
    { id: "editOpponents", kind: "number", values: Array.from({ length: 23 }, (_, index) => String(23 - index)), columns: 5, width: 390 },
    { id: "editPlacement", kind: "number", values: Array.from({ length: 24 }, (_, index) => String(index + 1)), columns: 6, width: 430 }
  ];
  const selects = pickerConfigs
    .map((config) => ({ ...config, selectEl: document.getElementById(config.id) }))
    .filter((config) => config.selectEl);
  if (!selects.length) return;
  const pickers = new Map();
  const backdrop = document.createElement("div");
  backdrop.className = "trackPickerBackdrop";
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  let scrollLockY = 0;
  let scrollLocked = false;
  let activeLetterPicker = null;

  const lockPageScroll = () => {
    if (scrollLocked) return;
    scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add("trackPickerScrollLocked");
    document.body.classList.add("trackPickerScrollLocked");
    document.body.style.top = `-${scrollLockY}px`;
    scrollLocked = true;
  };

  const unlockPageScroll = () => {
    if (!scrollLocked) return;
    document.documentElement.classList.remove("trackPickerScrollLocked");
    document.body.classList.remove("trackPickerScrollLocked");
    document.body.style.top = "";
    window.scrollTo(0, scrollLockY);
    scrollLocked = false;
  };

  const showBackdrop = () => {
    backdrop.hidden = false;
    backdrop.classList.add("is-visible");
    lockPageScroll();
  };

  const hideBackdrop = () => {
    backdrop.classList.remove("is-visible");
    backdrop.hidden = true;
    unlockPageScroll();
  };

  const getSelectLabel = (selectEl) => {
    const label = document.querySelector(`label[for="${CSS.escape(selectEl.id)}"]`);
    return (label?.textContent || "Select track").trim();
  };

  const getTriggerText = (selectEl) => {
    const value = selectEl.value;
    if (!value) return getSelectLabel(selectEl);
    const selected = selectEl.selectedOptions?.[0];
    return (selected?.value || value).trim();
  };

  const readOptions = (selectEl) => {
    const options = Array.from(selectEl.options || [])
      .filter((option) => option.value)
      .map((option) => ({
        value: option.value,
        label: (option.textContent || option.value).replace(/^Suggested:\s*/i, "").trim(),
        suggested: option.dataset?.suggested === "1"
      }));

    return options.sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
      return String(a.value).localeCompare(String(b.value));
    });
  };

  const readNumberOptions = (picker) => {
    const values = Array.isArray(picker.values) ? picker.values : [];
    return values.map((value) => ({ value, label: value }));
  };

  const groupOptions = (options) => {
    const groups = [];
    const suggested = options.filter((option) => option.suggested);
    const regular = options.filter((option) => !option.suggested);

    if (suggested.length) groups.push({ label: "Suggested", options: suggested, suggested: true });

    for (const option of regular) {
      const label = (option.value || option.label || "?").trim().charAt(0).toUpperCase() || "?";
      let group = groups.find((item) => item.label === label);
      if (!group) {
        group = { label, options: [] };
        groups.push(group);
      }
      group.options.push(option);
    }
    return groups;
  };

  const getTrackLetter = (option) => {
    const text = String(option?.value || option?.label || "").trim();
    return (text.charAt(0) || "?").toUpperCase();
  };

  const getTrackLetters = (options) => {
    return Array.from(new Set(options.map(getTrackLetter).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  };

  const getActiveTrackLetter = (picker, letters) => {
    const current = picker.letterFilter || "all";
    if (current !== "all" && !letters.includes(current)) {
      picker.letterFilter = "all";
      return "all";
    }
    return current;
  };

  const filterTrackOptionsByLetter = (options, letter) => {
    if (!letter || letter === "all") return options;
    return options.filter((option) => getTrackLetter(option) === letter);
  };

  const createIconSlot = (trackName) => {
    const slot = document.createElement("span");
    slot.className = "trackPicker__iconSlot";
    slot.setAttribute("aria-hidden", "true");

    const iconPath = getTrackPickerIconPath(trackName);
    if (iconPath && trackIconReadyPaths.has(iconPath)) {
      const img = document.createElement("img");
      img.className = "trackPicker__icon";
      img.src = iconPath;
      img.alt = "";
      img.width = 24;
      img.height = 24;
      img.decoding = "async";
      img.loading = "eager";
      slot.appendChild(img);
      return slot;
    }

    const fallback = document.createElement("span");
    fallback.className = "trackPicker__iconFallback";
    fallback.textContent = trackAbbrev(trackName);
    slot.appendChild(fallback);
    return slot;
  };

  const closeAll = (exceptPicker = null) => {
    if (!exceptPicker) activeLetterPicker = null;
    for (const picker of pickers.values()) {
      if (picker === exceptPicker) continue;
      picker.root.classList.remove("is-open");
      picker.trigger.setAttribute("aria-expanded", "false");
      picker.panel.hidden = true;
      picker.panel.style.left = "";
      picker.panel.style.top = "";
      picker.panel.style.width = "";
    }
    if (!exceptPicker) hideBackdrop();
  };

  const applyLetterFilter = (picker, letter) => {
    if (!picker || picker.kind !== "track" || picker.panel.hidden) return;
    const next = letter || "all";
    if ((picker.letterFilter || "all") === next) return;
    picker.letterFilter = next;
    renderPanel(picker);
    alignPanel(picker);
  };

  const applyLetterFilterFromPoint = (clientX, clientY) => {
    if (!activeLetterPicker) return;
    const target = document.elementFromPoint(clientX, clientY);
    const button = target?.closest?.("[data-letter-filter]");
    if (!button || !activeLetterPicker.panel.contains(button)) return;
    applyLetterFilter(activeLetterPicker, button.dataset.letterFilter || "all");
  };

  const renderPanel = (picker) => {
    const { selectEl, panel } = picker;
    panel.innerHTML = "";

    if (picker.kind === "number") {
      const grid = document.createElement("div");
      grid.className = "numberPicker__grid";
      grid.style.setProperty("--number-picker-cols", String(picker.columns || 5));

      for (const option of readNumberOptions(picker)) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "numberPicker__option";
        if ((picker.id === "placement" || picker.id === "editPlacement") && ["1", "2", "3"].includes(option.value)) {
          item.classList.add(`numberPicker__option--place${option.value}`);
        }
        item.dataset.value = option.value;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", selectEl.value === option.value ? "true" : "false");
        item.textContent = option.label;
        grid.appendChild(item);
      }

      panel.appendChild(grid);
      return;
    }

    const allOptions = readOptions(selectEl);
    const letters = getTrackLetters(allOptions);
    const activeLetter = getActiveTrackLetter(picker, letters);
    const visibleOptions = filterTrackOptionsByLetter(allOptions, activeLetter);
    const letterCount = letters.length + 1;
    panel.style.setProperty("--track-picker-letter-count", String(letterCount));
    panel.style.setProperty("--track-picker-mobile-height", `${32 + (letterCount * 24) + ((letterCount - 1) * 4)}px`);

    const layout = document.createElement("div");
    layout.className = "trackPicker__layout";

    const rail = document.createElement("div");
    rail.className = "trackPicker__letterRail";
    rail.setAttribute("aria-label", "Track letter filter");

    const appendLetterButton = (label, value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trackPicker__letterBtn";
      if (value === "all") button.classList.add("trackPicker__letterBtn--all");
      if (activeLetter === value) button.classList.add("is-active");
      button.dataset.letterFilter = value;
      button.setAttribute("aria-pressed", activeLetter === value ? "true" : "false");
      button.textContent = label;
      rail.appendChild(button);
    };

    appendLetterButton("All", "all");
    for (const letter of letters) appendLetterButton(letter, letter);

    rail.addEventListener("click", (event) => {
      const letterButton = event.target.closest?.("[data-letter-filter]");
      if (!letterButton) return;
      event.preventDefault();
      applyLetterFilter(picker, letterButton.dataset.letterFilter || "all");
    });
    rail.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const letterButton = event.target.closest?.("[data-letter-filter]");
      if (!letterButton) return;
      event.preventDefault();
      if ((picker.letterFilter || "all") !== "all") {
        resetLetterFilterToAll(picker);
        return;
      }
      applyLetterFilter(picker, letterButton.dataset.letterFilter || "all");
    });
    rail.addEventListener("pointerdown", (event) => {
      if (!event.target.closest?.("[data-letter-filter]")) return;
      event.preventDefault();
      activeLetterPicker = picker;
      applyLetterFilterFromPoint(event.clientX, event.clientY);
    });

    const trackArea = document.createElement("div");
    trackArea.className = "trackPicker__trackArea";

    const groupsEl = document.createElement("div");
    groupsEl.className = "trackPicker__groups";

    for (const group of groupOptions(visibleOptions)) {
      const groupEl = document.createElement("div");
      groupEl.className = "trackPicker__group";
      if (group.suggested) groupEl.classList.add("trackPicker__group--suggested");

      const head = document.createElement("div");
      head.className = "trackPicker__groupLabel";
      head.textContent = group.label;
      groupEl.appendChild(head);

      for (const option of group.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "trackPicker__option";
        if (option.suggested) item.classList.add("trackPicker__option--suggested");
        item.dataset.value = option.value;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", selectEl.value === option.value ? "true" : "false");
        item.title = option.value;
        item.appendChild(createIconSlot(option.value));
        const text = document.createElement("span");
        text.className = "trackPicker__optionText";
        text.textContent = option.label || option.value;
        item.appendChild(text);
        groupEl.appendChild(item);
      }

      groupsEl.appendChild(groupEl);
    }

    if (!groupsEl.children.length) {
      const empty = document.createElement("div");
      empty.className = "trackPicker__empty";
      empty.textContent = "No tracks";
      groupsEl.appendChild(empty);
    }

    trackArea.appendChild(groupsEl);
    layout.appendChild(rail);
    layout.appendChild(trackArea);
    panel.appendChild(layout);
  };

  const refreshPicker = (picker) => {
    const text = getTriggerText(picker.selectEl);
    picker.valueEl.textContent = text;
    picker.trigger.title = text;
    picker.trigger.classList.toggle("is-placeholder", !picker.selectEl.value);
      if (!picker.panel.hidden) renderPanel(picker);
  };

  const resetLetterFilterToAll = (picker, focusAll = true) => {
    if (!picker || picker.kind !== "track" || picker.panel.hidden) return false;
    if ((picker.letterFilter || "all") === "all") return false;
    picker.letterFilter = "all";
    renderPanel(picker);
    alignPanel(picker);
    if (focusAll) {
      window.requestAnimationFrame(() => {
        picker.panel.querySelector('[data-letter-filter="all"]')?.focus?.();
      });
    }
    return true;
  };

  const applyKeyboardLetterFilter = (picker, key) => {
    if (!picker || picker.kind !== "track" || picker.panel.hidden) return false;
    const letter = String(key || "").trim().charAt(0).toUpperCase();
    if (!/^[A-Z0-9]$/.test(letter)) return false;
    const letters = getTrackLetters(readOptions(picker.selectEl));
    if (!letters.includes(letter)) return false;
    applyLetterFilter(picker, letter);
    window.requestAnimationFrame(() => {
      picker.panel.querySelector(`[data-letter-filter="${CSS.escape(letter)}"]`)?.focus?.();
    });
    return true;
  };

  const findOpenPicker = () => {
    return Array.from(pickers.values()).find((picker) => !picker.panel.hidden) || null;
  };

  const alignPanel = (picker) => {
    picker.panel.style.left = "";
    picker.panel.style.top = "";
    picker.panel.style.width = "";

    const viewport = window.visualViewport || {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0
    };
    const isMobile = viewport.width < 760;
    const margin = isMobile ? 10 : 16;
    const desiredWidth = picker.kind === "number"
      ? (picker.width || 390)
      : (isMobile ? 760 : 900);
    const panelWidth = Math.min(desiredWidth, viewport.width - (margin * 2));
    const centeredLeft = viewport.offsetLeft + ((viewport.width - panelWidth) / 2);
    picker.panel.style.width = `${Math.round(panelWidth)}px`;
    picker.panel.style.left = `${Math.round(centeredLeft)}px`;

    const panelRect = picker.panel.getBoundingClientRect();
    const preferredTop = viewport.offsetTop + ((viewport.height - panelRect.height) / 2);
    const maxTop = viewport.offsetTop + viewport.height - panelRect.height - margin;
    const top = Math.max(viewport.offsetTop + margin, Math.min(preferredTop, maxTop));
    picker.panel.style.top = `${Math.round(top)}px`;
  };

  const openPicker = (picker) => {
    closeAll(picker);
    if (picker.kind === "track") picker.letterFilter = "all";
    if (picker.kind === "track") preloadTrackPickerIcons();
    renderPanel(picker);
    picker.panel.hidden = false;
    picker.root.classList.add("is-open");
    picker.trigger.setAttribute("aria-expanded", "true");
    alignPanel(picker);
    showBackdrop();
  };

  const togglePicker = (picker) => {
    if (picker.panel.hidden) openPicker(picker);
    else closeAll();
  };

  for (const config of selects) {
    const selectEl = config.selectEl;
    if (selectEl.dataset.trackPickerReady === "1") continue;
    selectEl.dataset.trackPickerReady = "1";
    selectEl.classList.add("trackNativeSelect");

    const root = document.createElement("div");
    root.className = `trackPicker ${config.kind === "number" ? "trackPicker--number" : "trackPicker--track"}`;
    root.dataset.selectId = selectEl.id;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "trackPicker__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

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
    if (config.kind === "number") panel.classList.add("trackPicker__panel--number");
    panel.setAttribute("role", "listbox");
    panel.hidden = true;

    root.appendChild(trigger);
    root.appendChild(panel);
    selectEl.insertAdjacentElement("afterend", root);

    const picker = { ...config, selectEl, root, trigger, valueEl, panel };
    pickers.set(selectEl.id, picker);

    trigger.addEventListener("click", () => togglePicker(picker));
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!picker.panel.hidden && picker.kind === "track" && (picker.letterFilter || "all") !== "all") {
        resetLetterFilterToAll(picker);
        return;
      }
      togglePicker(picker);
    });

    panel.addEventListener("click", (event) => {
      const optionButton = event.target.closest?.("[data-value]");
      if (!optionButton) return;
      selectEl.value = optionButton.dataset.value || "";
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      closeAll();
      refreshPicker(picker);
      trigger.focus();
    });

    selectEl.addEventListener("change", () => refreshPicker(picker));

    const observer = new MutationObserver(() => refreshPicker(picker));
    observer.observe(selectEl, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-suggested"]
    });

    refreshPicker(picker);
  }

  document.addEventListener("click", (event) => {
    const insidePicker = event.target.closest?.(".trackPicker");
    if (!insidePicker) closeAll();
  });
  document.addEventListener("pointermove", (event) => {
    if (!activeLetterPicker) return;
    event.preventDefault();
    applyLetterFilterFromPoint(event.clientX, event.clientY);
  }, { passive: false });
  document.addEventListener("pointerup", () => {
    activeLetterPicker = null;
  });
  document.addEventListener("pointercancel", () => {
    activeLetterPicker = null;
  });
  backdrop.addEventListener("click", () => closeAll());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (findOpenPicker()) {
        event.preventDefault();
        event.stopPropagation();
      }
      closeAll();
      return;
    }
    const openPicker = findOpenPicker();
    if (!openPicker) return;
    const target = event.target;
    const isTextTarget = target?.matches?.("input, textarea, select") || target?.isContentEditable;
    if (isTextTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.length === 1 && /^[a-z0-9]$/i.test(event.key)) {
      if (applyKeyboardLetterFilter(openPicker, event.key)) event.preventDefault();
      return;
    }
    if ((event.key === "Enter" || event.key === " ")
      && !target?.closest?.(".trackPicker__option, .numberPicker__option, .trackPicker__trigger")
      && resetLetterFilterToAll(openPicker)) {
      event.preventDefault();
    }
  });
  window.addEventListener("resize", () => closeAll());

  window.MKWT_TRACK_PICKERS = {
    refreshAll(){
      for (const picker of pickers.values()) refreshPicker(picker);
    },
    refreshTrackPickers(){
      for (const picker of pickers.values()) {
        if (picker.kind === "track") refreshPicker(picker);
      }
    },
    closeAll
  };
}

// All Intermission combinations (Start -> End). Used to filter the dropdowns.
// NOTE: keep spelling identical to TRACKS.

  // ========= Supabase (FIX: support localStorage + sessionStorage) =========


  // Backup session tokens for iOS PWA/Safari edge-cases where the Supabase
  // storage entry may not be restored reliably after the app is killed.

  // wird nach requireAuth() gesetzt


  // ===== Guest (local) storage =====

  // NOTE: Use the page-local SESSION as the source of truth.
  // window.SESSION is exposed for shared navbar actions, but should not be relied on here.

  // ========= Guest Profile (local) =========
  const loadGuestProfile = () => (window.MKWT?.loadGuestProfile ? window.MKWT.loadGuestProfile() : { id:'guest', nickname:'Guest', current_vr:0, created_at:null });
  const saveGuestProfile = (p) => { try{ window.MKWT?.saveGuestProfile?.(p); }catch(e){} };
  function updateGuestCurrentVR(vr){
    try{
      const gp = loadGuestProfile();
      if(!gp) return;
      gp.current_vr = Number.isFinite(Number(vr)) ? Number(vr) : gp.current_vr;
      saveGuestProfile(gp);
    }catch(e){}
  }

  let PROFILE = null;

    // ===== Pagination =====
    const PAGE_SIZE = 7;
    let currentPage = 1;
    let totalMatches = null;
    const VR_ONBOARDING_KEY_PREFIX = "mkwt_ww_vr_onboarding_done_v1";
    let vrOnboardingPromptChecked = false;
    let vrOnboardingPromptOpen = false;

  // ========= Auth Guard (FIX: check localStorage ODER sessionStorage) =========


    async function requireAuth() {
    return window.mkwtRequireAuth({
      pageName: "tracker.html",
      allowGuest: true,
      tryBackupRestore: true,
      onDebug: (msg) => setDebug(msg),
      onAccount: async (session, client) => {
        supabaseClient = client;
        SESSION = session;
        try{ localStorage.setItem('mkwt_mode','account'); }catch(e){}
        try{ applyThemeForMode('account'); }catch(e){}
        $("userInfo").textContent = "Profile: -";
        try{ setNavAuthButton("account"); }catch(e){}
      },
      onGuest: async () => {
        window.IS_GUEST = true;
        SESSION = null;
        supabaseClient = null;
        window.supabaseClient = null;
        window.SESSION = null;
        try{ applyThemeForMode('guest'); }catch(e){}
        try { $("userInfo").textContent = "Guest (local)"; } catch(e){}
        try{ setNavAuthButton("guest"); }catch(e){}
      }
    });
  }


async function createProfile() {
    const btn = $("btnCreateProfile");
    btn.disabled = true;

    try {
      const nickname = $("setupNickname").value.trim();
      const vrRaw = $("setupVr").value;
      const current_vr = (vrRaw === "" ? 8500 : parseInt(vrRaw, 10));

      if (!nickname) { setStatus("Please enter a nickname.", false); return; }
      if (!Number.isFinite(current_vr)) { setStatus("Invalid VR value.", false); return; }

      // Guest profile is stored locally (no Supabase write)
      if (isGuest() || !supabaseClient || !SESSION?.user?.id) {
        saveGuestProfile({ nickname, current_vr, created_at: new Date().toISOString() });
        markVrOnboardingDone();
        setStatus("Guest profile saved.", true);
        await refreshAll();
        return;
      }

      setStatus("Creating profile...", true);

      const { error } = await supabaseClient.from("profiles").insert({
        id: SESSION.user.id,
        nickname,
        current_vr
      });

      if (error) {
        setStatus("Create profile failed: " + error.message, false);
        setDebug(JSON.stringify(error, null, 2));
        return;
      }

      setStatus("Profile created.", true);
      markVrOnboardingDone();
      await refreshAll();
    } finally {
      btn.disabled = false;
    }
  }


/* saveSettings removed (moved to settings.html) */


 // ========= Matches (Pagination) =========

async function getMatchesCount() {
  if (isGuest()) {
    return guestCount();
  }
  const { count, error } = await supabaseClient
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", SESSION.user.id);

  if (error) {
    setDebug("Count error: " + JSON.stringify(error, null, 2));
    return null;
  }
  return count ?? null;
}

function getVrOnboardingKey() {
  const id = SESSION?.user?.id || (isGuest() ? "guest" : "anon");
  return `${VR_ONBOARDING_KEY_PREFIX}:${id}`;
}

function isVrOnboardingDone() {
  try { return localStorage.getItem(getVrOnboardingKey()) === "1"; } catch(e) { return true; }
}

function markVrOnboardingDone() {
  try { localStorage.setItem(getVrOnboardingKey(), "1"); } catch(e) {}
}

function setVrOnboardingStatus(message, ok = false) {
  const el = $("vrOnboardingStatus");
  if (!el) return;
  const text = String(message || "").trim();
  el.textContent = text;
  el.classList.toggle("ok", !!ok && !!text);
}

function closeVrOnboardingDialog() {
  const dlg = $("vrOnboardingDlg");
  vrOnboardingPromptOpen = false;
  setVrOnboardingStatus("");
  try { if (dlg?.open) dlg.close(); } catch(e) {}
}

function openVrOnboardingDialog() {
  const dlg = $("vrOnboardingDlg");
  const input = $("onboardingVr");
  if (!dlg || typeof dlg.showModal !== "function") return;
  if (dlg.open || vrOnboardingPromptOpen) return;
  vrOnboardingPromptOpen = true;
  setVrOnboardingStatus("");
  if (input) {
    const current = Number(PROFILE?.current_vr);
    input.value = Number.isFinite(current) && current > 0 ? String(Math.round(current)) : "";
    input.placeholder = "8500";
  }
  dlg.showModal();
  setTimeout(() => input?.focus?.(), 40);
}

async function maybeShowVrOnboarding() {
  if (vrOnboardingPromptChecked || vrOnboardingPromptOpen) return;
  if (!PROFILE || isGuest() || !supabaseClient || !SESSION?.user?.id) return;
  if (isVrOnboardingDone()) return;

  vrOnboardingPromptChecked = true;
  const count = await getMatchesCount();
  if (count == null) return;
  if (count > 0) {
    markVrOnboardingDone();
    return;
  }
  openVrOnboardingDialog();
}

async function saveVrOnboarding() {
  const input = $("onboardingVr");
  const btn = $("btnVrOnboardingSave");
  const raw = String(input?.value || "").trim();
  const vr = raw === "" ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(vr) || vr < 0 || vr > 99999) {
    setVrOnboardingStatus("Please enter a valid VR value.");
    return;
  }

  try {
    if (btn) btn.disabled = true;
    setVrOnboardingStatus("Saving...", true);
    const { error } = await supabaseClient
      .from("profiles")
      .update({ current_vr: vr, updated_at: new Date().toISOString() })
      .eq("id", SESSION.user.id);
    if (error) throw error;

    if (PROFILE) PROFILE.current_vr = vr;
    try { $("statCurrentVr").textContent = String(vr); } catch(e) {}
    try { syncFromDelta(); syncFromAfter(); } catch(e) {}
    markVrOnboardingDone();
    closeVrOnboardingDialog();
    setMatchStatus("Starting VR saved. You can change it in Settings anytime.", true);
  } catch(e) {
    setVrOnboardingStatus("Could not save VR: " + (e?.message || e));
    setDebug(JSON.stringify(e, null, 2));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadMatches() {
  $rows.innerHTML = `<tr><td colspan="8" class="muted">Loading...</td></tr>`;
  const $cards = $("matchCards");
  if ($cards) $cards.innerHTML = `<div class="muted">Loading...</div>`;

  // Count nur holen wenn noch nicht da
  if (totalMatches == null) {
    totalMatches = await getMatchesCount();
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // We'll fill these either from Guest storage or Supabase.
  let data = null;
  let error = null;

	// Guest mode: load matches from localStorage and avoid any Supabase calls.
	if (isGuest()) {
	  const all = loadGuestMatches()
	    .slice()
	    .sort((a, b) => {
	      const ta = Date.parse(a.created_at || 0) || 0;
	      const tb = Date.parse(b.created_at || 0) || 0;
	      if (tb !== ta) return tb - ta;
	      // Tie-breaker for deterministic order.
	      const ia = String(a.id || "");
	      const ib = String(b.id || "");
	      return ib.localeCompare(ia);
	    });

	  totalMatches = all.length;
	  data = all.slice(from, to + 1);
	} else {
	  const res = await supabaseClient
	    .from("matches")
	    .select("id, created_at, intermission, track, vr_change, vr_after, opponents, placement")
	    .eq("user_id", SESSION.user.id)
	    // Deterministic ordering: created_at can collide (same second), so also order by id.
	    .order("created_at", { ascending: false })
	    .order("id", { ascending: false })
	    .range(from, to);
	  data = res.data;
	  error = res.error;
	}

  if (error) {
    setStatus("Failed to load matches: " + error.message, false);
    setDebug(JSON.stringify(error, null, 2));
    $rows.innerHTML = `<tr><td colspan="8" class="muted">Error loading.</td></tr>`;
    if ($cards) $cards.innerHTML = `<div class="muted">Error loading.</div>`;
    return;
  }


  // INIT/UPDATE_SUGGESTION_FROM_LATEST_MATCH:
  // Always keep Suggestion in sync with the newest (top) match.
  // Only do this on page 1 (which contains the newest match). Otherwise pagination
  // would overwrite the suggestion with older tracks.
  try {
    if (currentPage === 1) {
      const latest = (data && data.length && data[0] && data[0].track) ? String(data[0].track) : "";
      if (latest) {
        setLastSuggestedTrack(latest);
        try { setLastMatchTimestamp(Date.parse(data[0].created_at)); } catch(e) {}
      } else {
        // No matches left => remove suggestion
        try { localStorage.removeItem('mkwt_last_next_start'); } catch(e) {}
      }

      // Update the *visible* Suggestion option immediately in the create-form start select.
      // This avoids stale Suggestion labels after delete/restore without resetting filters.
      try { refreshSuggestionOptionInStartSelect($("intermission")); } catch(e) {}
    }
  } catch(e) {}

  if (!data || data.length === 0) {
    $rows.innerHTML = `<tr><td colspan="8" class="muted">No matches yet.</td></tr>`;
    if ($cards) $cards.innerHTML = `<div class="muted">No matches yet.</div>`;
    $("pageInfo").textContent = "Page 1";
    $("btnPrev").disabled = true;
    $("btnNext").disabled = true;
    return;
  }

  const maxPage = (totalMatches != null) ? Math.max(1, Math.ceil(totalMatches / PAGE_SIZE)) : null;
  $("pageInfo").textContent = maxPage ? `Page ${currentPage} / ${maxPage}` : `Page ${currentPage}`;
  $("btnPrev").disabled = (currentPage <= 1);
  $("btnNext").disabled = (maxPage != null) ? (currentPage >= maxPage) : (data.length < PAGE_SIZE);

  $rows.innerHTML = data.map((r, idx) => {
      const matchNo = totalMatches - (from + idx); // newest gets highest number
      const created = r.created_at ? new Date(r.created_at).toLocaleString("de-DE") : "";
      const intermission = (r.intermission ?? "") ? String(r.intermission) : "";
      const track = (r.track ?? "") ? String(r.track) : "";
      const isIntermission = !!intermission;
      const startName = intermission || "-";
      const endName = track || "-";
      const tracksCellHtml = isIntermission
        ? `<div class="matchTracksVisual matchTracksVisual--route" title="${escapeHtml(startName)} > ${escapeHtml(endName)}">
             <div class="matchTracksNode" title="${escapeHtml(startName)}">${trackIconMarkup(startName, "matchTrackIcon")}</div>
             <div class="matchTracksArrow" aria-hidden="true">&rarr;</div>
             <div class="matchTracksNode matchTracksNode--destiny" title="${escapeHtml(endName)}">${trackIconMarkup(endName, "matchTrackIcon")}</div>
           </div>`
        : `<div class="matchTracksVisual matchTracksVisual--single" title="${escapeHtml(endName)}">
             <div class="matchTracksNode" title="${escapeHtml(endName)}">${trackIconMarkup(endName, "matchTrackIcon")}</div>
           </div>`;
      const delta = Number(r.vr_change || 0);
      const vrAfter = (r.vr_after ?? null);
      const vrNow = (vrAfter == null ? "" : Number(vrAfter));
      const opp = Number(r.opponents || 0);
      const place = Number(r.placement || 0);
      const perf = (opp ? (delta / opp) : 0);
      const perfStr = opp ? perf.toFixed(2) : "";
      const canDelete = (currentPage === 1 && idx === 0); // only newest match can be deleted
      return `
          <tr class="${placementBannerClass(place)}">
            <td>${matchNo}</td>
            <td>${created}</td>
            <td class="matchTracksCell">${tracksCellHtml}</td>
            <td class="${delta>0?'ok':'bad'}">${delta}</td>
            <td>${vrNow}</td>
            <td>${opp||""}</td>
            <td>${place||""}</td>
            <td class="matchActionsCell">
              <div class="matchActionGroup">
                <button class="iconBtn" title="Edit" data-action="edit" data-id="${r.id}">Edit</button>
                ${canDelete ? `<button class="iconBtn danger" title="Delete" data-action="del" data-id="${r.id}">Delete</button>` : ""}
              </div>
            </td>
          </tr>`;

}).join("");

  // Mobile cards (same data, cleaner layout)
  if ($cards) {
    $cards.innerHTML = data.map((r, idx) => {
      const matchNo = totalMatches - (from + idx);
      const d = r.created_at ? new Date(r.created_at) : null;
      const createdShort = d ? d.toLocaleString("de-DE") : "";
      const intermission = (r.intermission ?? "") ? String(r.intermission) : "";
      const track = (r.track ?? "") ? String(r.track) : "";
      const isIntermission = !!intermission;

const startName = intermission || "-";
const endName = track || "-";

const trackHtml = isIntermission
  ? `<div class="mcard__route mcard__route--im" title="${escapeHtml(startName)} > ${escapeHtml(endName)}">
       <div class="mcard__routeNode" title="${escapeHtml(startName)}">${trackIconMarkup(startName, "", true)}</div>
       <div class="mcard__routeArrow" aria-hidden="true">&rarr;</div>
       <div class="mcard__routeNode mcard__routeNode--destiny" title="${escapeHtml(endName)}">${trackIconMarkup(endName, "", true)}</div>
     </div>`
  : `<div class="mcard__route" title="${escapeHtml(endName)}">
       <div class="mcard__routeNode" title="${escapeHtml(endName)}">${trackIconMarkup(endName, "", true)}</div>
     </div>`;
      const delta = Number(r.vr_change || 0);
      const vrAfter = (r.vr_after ?? null);
      const vrNow = (vrAfter == null ? "-" : String(Number(vrAfter)));
      const deltaStr = (delta > 0 ? `+${delta}` : `${delta}`);
      const deltaCls = delta > 0 ? "mcard__vrDelta--pos" : (delta < 0 ? "mcard__vrDelta--neg" : "mcard__vrDelta--neutral");
      const canDelete = (currentPage === 1 && idx === 0);
      const iconClass = placementIconClass(r.placement);

      const hasPlace = (r.placement != null && r.placement !== "" && Number(r.placement) > 0);
      const hasOpp = (r.opponents != null && r.opponents !== "" && Number(r.opponents) > 0);

      const detailRowsHtml = `
        <div class="mcard__detailRow">
          <span class="mcard__detailLabel">Date & time</span>
          <span class="mcard__detailValue">${escapeHtml(createdShort || "-")}</span>
        </div>
        <div class="mcard__detailRow">
          <span class="mcard__detailLabel">Placement</span>
          <span class="mcard__detailValue">${hasPlace ? escapeHtml(String(r.placement)) : "-"}</span>
        </div>
        <div class="mcard__detailRow">
          <span class="mcard__detailLabel">Opponents</span>
          <span class="mcard__detailValue">${hasOpp ? escapeHtml(String(r.opponents)) : "-"}</span>
        </div>`;

      return `
        <div class="mcard${isIntermission ? " mcard--im" : ""}" data-match-id="${r.id}" tabindex="0" aria-expanded="false">
          <div class="mcard__meta mcard__meta--tl"><span>#${matchNo}</span></div>

          <div class="mcard__main">
            <div class="mcard__iconStage${iconClass ? ` ${iconClass}` : ""}" aria-hidden="false">
              ${trackHtml}
            </div>
            <div class="mcard__vr">
              <span class="mcard__vrTotal">${escapeHtml(vrNow)}</span>
              <span class="mcard__vrDelta ${deltaCls}">(${escapeHtml(deltaStr)})</span>
            </div>
          </div>

          <div class="mcard__details" hidden>
            <div class="mcard__detailGrid">
              ${detailRowsHtml}
            </div>
            <div class="mcard__actions">
              <button class="mcard__btn" title="Edit" data-action="edit" data-id="${r.id}">Edit</button>
              ${canDelete ? `<button class="mcard__btn mcard__btn--danger" title="Delete" data-action="del" data-id="${r.id}">Delete</button>` : ``}
            </div>
          </div>
        </div>`;
    }).join("");
  }


  // Click handlers for Edit & Delete (table)
  $rows.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      if (action === "edit") await openEditDialog(id);
      if (action === "del") await deleteMatch(id);
    });
  });

  // Same handlers for mobile cards
  if ($cards) {
    const setCardExpanded = (card, expanded) => {
      if (!card) return;
      const details = card.querySelector(".mcard__details");
      if (!details) return;
      card.classList.toggle("is-expanded", expanded);
      card.setAttribute("aria-expanded", expanded ? "true" : "false");
      details.hidden = !expanded;
    };
    const toggleCard = (card) => {
      const willExpand = !card.classList.contains("is-expanded");
      $cards.querySelectorAll(".mcard.is-expanded").forEach((openCard) => {
        if (openCard !== card) setCardExpanded(openCard, false);
      });
      setCardExpanded(card, willExpand);
    };
    $cards.onclick = async (event) => {
      const actionButton = event.target.closest?.("button[data-action]");
      if (actionButton) {
        event.stopPropagation();
        const id = actionButton.getAttribute("data-id");
        const action = actionButton.getAttribute("data-action");
        if (action === "edit") await openEditDialog(id);
        if (action === "del") await deleteMatch(id);
        return;
      }
      const card = event.target.closest?.(".mcard");
      if (card) toggleCard(card);
    };
    $cards.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest?.("button")) return;
      const card = event.target.closest?.(".mcard");
      if (!card) return;
      event.preventDefault();
      toggleCard(card);
    };
  }
}

  async function saveMatch() {
    const btn = $("btnSaveMatch");
    btn.disabled = true;

    try {
      setMatchStatus("", true);
      const mode = document.querySelector(".modeBtn.isActive")?.dataset.mode || "intermission";
      const intermissionSel = $("intermission");
      const intermission = (mode === "intermission") ? (intermissionSel?.value || null) : null;
      const track = $("track").value;
      const vr_change_raw = $("vrChange").value;
      const vr_after_raw = $("vrAfterInput")?.value;
      const vr_change_in = (vr_change_raw === "" ? NaN : parseInt(vr_change_raw, 10));
      const vr_after_in = (vr_after_raw === "" || vr_after_raw == null ? NaN : parseInt(vr_after_raw, 10));
const opponentsRaw = $("opponents").value;
      const placementRaw = $("placement").value;

        if (!track) { setMatchStatus("Please select a track.", false); return; }
    if (mode === "intermission" && !intermission) { setMatchStatus("Please select an intermission start.", false); return; }
      if (!Number.isFinite(vr_change_in) && !Number.isFinite(vr_after_in)) { setMatchStatus("Please enter VR change or the VR after the match.", false); return; }

      let opponents = null;
      if (opponentsRaw !== "") {
        opponents = parseInt(opponentsRaw, 10);
        if (!Number.isFinite(opponents) || opponents < 1 || opponents > 23) {
          setMatchStatus("Opponents must be 1-23.", false);
          return;
        }
      }

      let placement = null;
      if (placementRaw !== "") {
        placement = parseInt(placementRaw, 10);
        if (!Number.isFinite(placement) || placement < 1 || placement > 24) {
          setMatchStatus("Placement must be 1-24.", false);
          return;
        }
      }

      setMatchStatus("Saving match...", true, false);

      const baseVr = (PROFILE?.current_vr ?? 8500);
      let vr_after;
      let vr_change;
      if (Number.isFinite(vr_after_in)) {
        vr_after = vr_after_in;
        vr_change = vr_after - baseVr;
        // Sync UI if both fields were filled
        try { if ($("vrChange")) $("vrChange").value = String(vr_change); } catch(e) {}
      } else {
        vr_change = vr_change_in;
        vr_after = baseVr + vr_change;
        try { if ($("vrAfterInput")) $("vrAfterInput").value = String(vr_after); } catch(e) {}
      }
let insErr = null;
      if (isGuest()) {
        const id = "g_" + Date.now() + "_" + Math.random().toString(16).slice(2);
        guestAddMatch({
          id,
          created_at: new Date().toISOString(),
          intermission,
          track,
          vr_change,
          vr_after,
          opponents,
          placement
        });
        // Keep guest profile's current VR in sync
        updateGuestCurrentVR(vr_after);
        try { if (PROFILE) PROFILE.current_vr = vr_after; } catch(e) {}
      } else {
        ({ error: insErr } = await supabaseClient.from("matches").insert({
          user_id: SESSION.user.id,
          intermission,
          track,
          vr_change,
          vr_after, // Snapshot: VR nach diesem Match
          opponents,
          placement
        }));
      }

      if (insErr) {
        setMatchStatus("Failed to save match: " + insErr.message, false);
        setDebug(JSON.stringify(insErr, null, 2));
        return;
      }


      // === Instant Placeholder Suggestion + Instant Clear (same behavior as Clear) ===
      // Do this immediately after the match insert succeeds, before any other network calls.
      try { setLastSuggestedTrack(track); } catch(e) {}
      try { setLastMatchTimestamp(Date.now()); } catch(e) {}
      try {
        const a = $('intermission');
        const b = $('track');
        if (a && b) {
          fillTrackSelect(a, ' ');
          fillTrackSelect(b, ' ');
          a.value = '';
          b.value = '';
          a.dispatchEvent(new Event('change', { bubbles: true }));
          b.dispatchEvent(new Event('change', { bubbles: true }));
          // Ensure placeholder/suggestion text reflects the new suggestion instantly
          if ((document.querySelector(".modeBtn.isActive")?.dataset.mode || "intermission") === "intermission") {
          refreshSuggestionOptionInStartSelect(a);
          // Auto-fill Start if the newest match is recent enough (<=10 minutes)
          autoPrefillIntermissionStartIfFresh();
        }
        }
      } catch(e) {}
      setFieldValue("vrChange", "", "input");
      setFieldValue("vrAfterInput", "", "input");
      setFieldValue("opponents", "");
      setFieldValue("placement", "");
      try { window.MKWT_TRACK_PICKERS?.refreshAll?.(); } catch(e) {}
      if (mode === "3lap") {
        try {
          const intermissionTab = document.querySelector('.modeBtn[data-mode="intermission"]');
          if (intermissionTab && !intermissionTab.classList.contains("isActive")) {
            intermissionTab.click();
          }
          refreshSuggestionOptionInStartSelect($("intermission"));
          autoPrefillIntermissionStartIfFresh();
          window.MKWT_TRACK_PICKERS?.refreshAll?.();
        } catch(e) {}
      }
      const newVr = vr_after;
      const savedTracksText = intermission ? `${intermission} -> ${track}` : track;
      const savedMatchMessage = `Saved: ${savedTracksText} | new total VR ${newVr}`;

      if (isGuest()) {
        setMatchStatus(savedMatchMessage, true);
      } else {
        const { error: upErr } = await supabaseClient
          .from("profiles")
          .update({ current_vr: newVr, updated_at: new Date().toISOString() })
          .eq("id", SESSION.user.id);

        if (upErr) {
          setMatchStatus("Warning: match saved, but VR update failed: " + upErr.message, false);
          setDebug(JSON.stringify(upErr, null, 2));
        } else {
          setMatchStatus(savedMatchMessage, true);
        }
      }

      await refreshAll();
    } finally {
      btn.disabled = false;
    }
  }

  async function loadProfile(options = {}) {
    const deferHeaderStats = !!options.deferHeaderStats;
    PROFILE = null;
    $("statCurrentVr").textContent = "-";

    // Guest mode: no Supabase client/session. Load local guest profile (or require setup).
    if (isGuest() || !supabaseClient || !SESSION?.user?.id) {
      const gp = loadGuestProfile();
      if (!gp) {
        PROFILE = null; // triggers setup modal
        try { $("userInfo").textContent = "Guest (setup required)"; } catch(e) {}
        return;
      }
      PROFILE = gp;
      try { $("userInfo").textContent = "Guest: " + (gp.nickname || "Guest"); } catch(e) {}
      try { $("statCurrentVr").textContent = String(gp.current_vr ?? "-"); } catch(e) {}

      // full header stats from guest matches (same as account features)
      if (!deferHeaderStats) {
        try {
          const g = loadGuestMatches();
          updateGuestHeaderStats(gp, g);
        } catch(e) {}
      }
      return;
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, nickname, current_vr")
      .eq("id", SESSION.user.id)
      .maybeSingle();

    if (error) {
      setStatus("Failed to load profile: " + error.message, false);
      setDebug(JSON.stringify(error, null, 2));
      return;
    }

    if (!data) {
      PROFILE = null;
      return;
    }

    PROFILE = data;

  // Anzeige im Header: Nickname
  try { $("userInfo").textContent = "Profile: " + (PROFILE?.nickname || "-"); } catch(e) {}
$("statCurrentVr").textContent = String(PROFILE.current_vr ?? "-");
    if (!deferHeaderStats) {
      try { await updateProfileQuickStats(); } catch(e) {}
    }
  }


  // ========= Profile Quick Stats (Header Card) =========
  function fmtNum(n){
    if (!Number.isFinite(n)) return "-";
    // keep it gamer-clean (no decimals for VR)
    return String(Math.round(n));
  }
  function fmtSigned(n, decimals=1){
    if (!Number.isFinite(n)) return "-";
    const sign = (n > 0) ? "+" : (n < 0) ? "-" : "";
    const v = Math.abs(n).toFixed(decimals);
    return sign + v;
  }

  function fmtSignedInt(n){
    if (!Number.isFinite(n)) return "-";
    const sign = (n > 0) ? "+" : (n < 0) ? "-" : "";
    return sign + String(Math.abs(Math.round(n)));
  }

  const BEST_VR_ENTRY_MIN_GAMES = 10;

  function wwIntermissionRouteLabel(row){
    const start = String(row?.intermission || "").trim();
    const end = String(row?.track || "").trim();
    return start && end ? `${start} -> ${end}` : "";
  }

  function bestAverageVrEntry(rows, kind){
    const sums = new Map();
    for (const r of (rows || [])){
      const d = Number(r?.vr_change);
      if (!Number.isFinite(d)) continue;
      const start = String(r?.intermission || "").trim();
      const label = kind === "intermission"
        ? wwIntermissionRouteLabel(r)
        : (!start ? String(r?.track || "").trim() : "");
      if (!label) continue;
      const cur = sums.get(label) || { sum:0, count:0 };
      cur.sum += d;
      cur.count += 1;
      sums.set(label, cur);
    }

    let best = null;
    for (const [name, {sum, count}] of sums.entries()){
      if (count < BEST_VR_ENTRY_MIN_GAMES) continue;
      const avg = sum / count;
      if (
        !best ||
        avg > best.avg ||
        (avg === best.avg && count > best.count) ||
        (avg === best.avg && count === best.count && name.localeCompare(best.name, "de") < 0)
      ){
        best = { name, avg, count };
      }
    }
    return best;
  }

  function renderBestVrEntry(nameId, metaId, best, emptyMeta){
    const nameEl = $(nameId);
    const metaEl = $(metaId);
    if (!nameEl || !metaEl) return;
    if (!best){
      nameEl.textContent = "-";
      metaEl.textContent = emptyMeta || "-";
      return;
    }
    const avgTxt = fmtSigned(best.avg, 1) + " VR avg";
    const runsTxt = `${best.count} runs`;
    nameEl.textContent = best.name;
    metaEl.textContent = `${avgTxt} . ${runsTxt}`;
  }

  function renderBestVrSummaries(rows){
    renderBestVrEntry(
      "bestTrackName",
      "bestTrackMeta",
      bestAverageVrEntry(rows, "track"),
      `Needs ${BEST_VR_ENTRY_MIN_GAMES} runs on one track.`
    );
    renderBestVrEntry(
      "bestIntermissionName",
      "bestIntermissionMeta",
      bestAverageVrEntry(rows, "intermission"),
      `Needs ${BEST_VR_ENTRY_MIN_GAMES} runs on one route.`
    );
  }

  function calcStreaksAndExtremes(matchesAsc){
    let maxWin = 0, maxLose = 0;
    let win = 0, lose = 0;
    let maxGain = Number.NEGATIVE_INFINITY;
    let maxLoss = Number.POSITIVE_INFINITY;

    for (const r of (matchesAsc || [])){
      const d = Number(r.vr_change);
      if (!Number.isFinite(d)) continue;

      if (d > maxGain) maxGain = d;
      if (d < maxLoss) maxLoss = d;

      if (d > 0){
        win += 1;
        lose = 0;
        if (win > maxWin) maxWin = win;
      } else {
        lose += 1;
        win = 0;
        if (lose > maxLose) maxLose = lose;
      }
    }
    if (maxGain === Number.NEGATIVE_INFINITY) maxGain = 0;
    if (maxLoss === Number.POSITIVE_INFINITY) maxLoss = 0;

    return { maxWin, maxLose, maxGain, maxLoss };
  }


  function calcCurrentStreaks(matchesDesc){
    // matchesDesc: newest -> oldest (DESC).
    // Win streak: consecutive vr_change > 0 from the most recent match backwards.
    // Lose streak: consecutive vr_change <= 0 from the most recent match backwards.
    let win = 0, lose = 0;
    if (!matchesDesc || !matchesDesc.length) return { winStreak: 0, loseStreak: 0 };

    const first = Number(matchesDesc[0]?.vr_change);
    if (!Number.isFinite(first)) return { winStreak: 0, loseStreak: 0 };

    if (first > 0){
      for (const r of matchesDesc){
        const d = Number(r?.vr_change);
        if (!Number.isFinite(d) || d <= 0) break;
        win += 1;
      }
    } else {
      for (const r of matchesDesc){
        const d = Number(r?.vr_change);
        if (!Number.isFinite(d) || d > 0) break;
        lose += 1;
      }
    }
    return { winStreak: win, loseStreak: lose };
  }


  function updateGuestHeaderStats(gp, matches){
    try{
      const arr = (matches || []).slice();
      // Match count
      $("statMatchCount").textContent = String(arr.length);

      // Highest VR
      const base = Number(gp?.current_vr) || 0;
      const highest = arr.reduce((m,x)=>{
        const v = Number(x?.vr_after);
        return Number.isFinite(v) ? Math.max(m, v) : m;
      }, base);
      $("statHighestVr").textContent = fmtNum(highest);

      // Average VR over last 30 days (same label as account)
      const cutoff = Date.now() - 30*24*60*60*1000;
      const vals = arr
        .filter(r=>{
          const t = Date.parse(r?.created_at || '');
          return Number.isFinite(t) ? (t >= cutoff) : false;
        })
        .map(r=>Number(r?.vr_after))
        .filter(Number.isFinite);
      const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : NaN;
      $("statAvg50Vr").textContent = fmtNum(avg);

      renderBestVrSummaries(arr);

      // Streaks & extremes (ALL-TIME across all tracked matches)
      // We compute the *longest* win/lose streak anywhere in the history.
      // This will still increase automatically when your current streak sets a new personal best.
      const asc = arr
        .filter(r=>Number.isFinite(Number(r?.vr_change)))
        .slice()
        .sort((a,b)=> (String(a.created_at||'').localeCompare(String(b.created_at||'')) || String(a.id||'').localeCompare(String(b.id||''))));

      const { maxWin, maxLose, maxGain, maxLoss } = calcStreaksAndExtremes(asc);

      $("statWinStreak").textContent = String(maxWin);
      $("statLoseStreak").textContent = String(maxLose);
      $("statMaxGain").textContent = fmtSignedInt(maxGain);
      $("statMaxLoss").textContent = fmtSignedInt(maxLoss);
    }catch(e){
      // keep stable
      try{
        $("statHighestVr").textContent = "-";
        $("statAvg50Vr").textContent = "-";
        $("statMatchCount").textContent = "-";
        renderBestVrSummaries([]);
        $("statWinStreak").textContent = "-";
        $("statLoseStreak").textContent = "-";
        $("statMaxGain").textContent = "-";
        $("statMaxLoss").textContent = "-";
      }catch(_){ }
    }
  }

  async function updateProfileQuickStats() {
  try{
    // Current VR (from profile)
    $("statCurrentVr").textContent = fmtNum(Number(PROFILE?.current_vr));

    // Fire the queries in parallel (faster load)
    const qCount = supabaseClient
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", SESSION.user.id);

    const qHighest = supabaseClient
      .from("matches")
      .select("vr_after")
      .eq("user_id", SESSION.user.id)
      .not("vr_after", "is", null)
      .order("vr_after", { ascending: false })
      .limit(1);

    const cutoffIso = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const qLastMonth = supabaseClient
      .from("matches")
      .select("vr_after")
      .eq("user_id", SESSION.user.id)
      .not("vr_after", "is", null)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(2000);

    const [resCount, resHighest, resLastMonth] = await Promise.all([qCount, qHighest, qLastMonth]);

    if (resCount.error) throw resCount.error;
    $("statMatchCount").textContent = (typeof resCount.count === "number") ? String(resCount.count) : "-";

    if (resHighest.error) throw resHighest.error;
    const highest = Number(resHighest.data?.[0]?.vr_after);
    $("statHighestVr").textContent = fmtNum(highest);

    if (resLastMonth.error) throw resLastMonth.error;
    const vals = (resLastMonth.data || []).map(r => Number(r.vr_after)).filter(Number.isFinite);
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0) / vals.length) : NaN;
    $("statAvg50Vr").textContent = fmtNum(avg);

    // Best Track / Intermission + win/loss streaks use all VR games, paginated.
    const all = [];
    const chunk = 1000;
    let from = 0;
    while (true) {
      const to = from + chunk - 1;
      const { data, error } = await supabaseClient
        .from("matches")
        .select("id, created_at, intermission, track, vr_change")
        .eq("user_id", SESSION.user.id)
        .not("vr_change", "is", null)
        // Deterministic ordering: created_at can collide (same second), so also order by id.
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < chunk) break;
      from += chunk;
    }

    const asc = all.filter(r=>Number.isFinite(Number(r?.vr_change)));
    renderBestVrSummaries(asc);
    const { maxWin, maxLose, maxGain, maxLoss } = calcStreaksAndExtremes(asc);

    $("statWinStreak").textContent  = String(maxWin);
    $("statLoseStreak").textContent = String(maxLose);
    $("statMaxGain").textContent = fmtSignedInt(maxGain);
    $("statMaxLoss").textContent = fmtSignedInt(maxLoss);


  } catch(e){
    // keep UI stable if stats query fails
    try{
      $("statHighestVr").textContent = "-";
      $("statAvg50Vr").textContent = "-";
      $("statMatchCount").textContent = "-";
      renderBestVrSummaries([]);
    } catch(_){}
    setDebug("Header stats error: " + (e?.message || e));
  }
}

  // ========= Refresh / Init =========
  let deferredRefreshToken = 0;
  function setMatchesLoadingState() {
    if ($rows) $rows.innerHTML = `<tr><td colspan="8" class="muted">Loading recent matches...</td></tr>`;
    const cards = $("matchCards");
    if (cards) cards.innerHTML = `<div class="muted">Loading recent matches...</div>`;
    try { $("pageInfo").textContent = "Loading..."; } catch(e) {}
    try { $("btnPrev").disabled = true; } catch(e) {}
    try { $("btnNext").disabled = true; } catch(e) {}
  }
  function scheduleAfterFirstPaint(fn) {
    const run = () => { Promise.resolve().then(fn).catch((e) => setDebug("Deferred load error: " + (e?.message || e))); };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 700 });
      return;
    }
    window.setTimeout(run, 80);
  }
  async function refreshAll(options = {}) {
  const deferHeavy = !!options.deferHeavy;
  const refreshToken = ++deferredRefreshToken;
  setStatus("", true);

  // Pagination-Cache reset (WICHTIG!)
  totalMatches = null;
  currentPage = 1;

  await loadProfile({ deferHeaderStats: deferHeavy });

    if (!PROFILE) {
      show($("setupCard"), true);
      show($("matchCard"), false);
      show($("listCard"), false);
      // removed ready pill
      $("statCurrentVr").textContent = "-";
      return;
    }

    show($("setupCard"), false);
    show($("matchCard"), true);
    show($("listCard"), true);

    // removed ready pill

    $("statCurrentVr").textContent = String(PROFILE.current_vr ?? "-");
    // Re-sync inputs with new base VR
    try { syncFromDelta(); syncFromAfter(); } catch(e) {}
    if (deferHeavy) {
      setMatchesLoadingState();
      scheduleAfterFirstPaint(async () => {
        if (refreshToken !== deferredRefreshToken) return;
        await loadMatches();
      });
      scheduleAfterFirstPaint(async () => {
        if (refreshToken !== deferredRefreshToken) return;
        if (isGuest()) {
          try { updateGuestHeaderStats(PROFILE, loadGuestMatches()); } catch(e) {}
        } else {
          try { await updateProfileQuickStats(); } catch(e) {}
        }
      });
      scheduleAfterFirstPaint(async () => {
        if (refreshToken !== deferredRefreshToken) return;
        await maybeShowVrOnboarding();
      });
      return;
    }
    await loadMatches();
    await maybeShowVrOnboarding();
  }
// ========= Edit / Delete =========
const editDlg = $("editDlg");
let EDIT_ROW = null;

async function fetchMatchById(id) {
  if (isGuest()) {
    const all = loadGuestMatches();
    return all.find(m => m.id === id) || null;
  }
  const { data, error } = await supabaseClient
    .from("matches")
    .select("id, created_at, intermission, track, vr_change, vr_after, opponents, placement")
    .eq("id", id)
    .eq("user_id", SESSION.user.id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function compareMatchesDesc(a, b){
  const ta = Date.parse(a?.created_at || 0) || 0;
  const tb = Date.parse(b?.created_at || 0) || 0;
  if (tb !== ta) return tb - ta;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

function targetTrackFromMatch(row){
  return row?.track ? String(row.track) : "";
}

async function fetchPreviousMatchTargetForEdit(row){
  if (!row) return "";
  if (isGuest()) {
    const all = loadGuestMatches().slice().sort(compareMatchesDesc);
    const index = all.findIndex(match => String(match.id) === String(row.id));
    return index >= 0 ? targetTrackFromMatch(all[index + 1]) : "";
  }

  const createdAt = row.created_at;
  if (!createdAt || !supabaseClient || !SESSION?.user?.id) return "";

  const { data, error } = await supabaseClient
    .from("matches")
    .select("id, created_at, track")
    .eq("user_id", SESSION.user.id)
    .lte("created_at", createdAt)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (error) {
    setDebug("Edit suggestion failed: " + JSON.stringify(error, null, 2));
    return "";
  }

  const sorted = (data || []).slice().sort(compareMatchesDesc);
  const index = sorted.findIndex(match => String(match.id) === String(row.id));
  if (index >= 0 && sorted[index + 1]) return targetTrackFromMatch(sorted[index + 1]);

  const older = await supabaseClient
    .from("matches")
    .select("id, created_at, track")
    .eq("user_id", SESSION.user.id)
    .lt("created_at", createdAt)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (older.error) {
    setDebug("Edit suggestion fallback failed: " + JSON.stringify(older.error, null, 2));
    return "";
  }
  return targetTrackFromMatch(older.data?.[0]);
}

async function openEditDialog(id) {
  try {
    setStatus("", true);
    EDIT_ROW = await fetchMatchById(id);
    if (!EDIT_ROW) {
      setStatus("Match not found (or no permission).", false);
      return;
    }

    $("editMeta").textContent =
      "ID: " + EDIT_ROW.id + " . " +
      (EDIT_ROW.created_at ? new Date(EDIT_ROW.created_at).toLocaleString() : "");

    try {
      setEditSuggestedNextStart(await fetchPreviousMatchTargetForEdit(EDIT_ROW));
    } catch(e) {
      clearEditSuggestedNextStart();
      setDebug("Edit suggestion failed: " + (e?.message || e));
    }

    $("editIntermission").value = "";
    $("editTrack").value = "";
    // Reset edit selects to full options (no leftover filtered combos)
    // Uses the existing bidirectional filter logic via change-events.
    try {
      $("editIntermission").dispatchEvent(new Event("change", { bubbles: true }));
      $("editTrack").dispatchEvent(new Event("change", { bubbles: true }));
    } catch(e) {}

    // Mode UI (Intermission vs 3-Lap)
    try { setEditMode((EDIT_ROW.intermission ?? "") ? "intermission" : "3lap", { keepValues: true }); } catch(e) {}

    // Pre-fill selects with existing values so the edit form is never blank.
    try {
      const mode = (EDIT_ROW.intermission ?? "") ? "intermission" : "3lap";
      const startVal = (EDIT_ROW.intermission ?? "") ? String(EDIT_ROW.intermission) : "";
      const endVal   = (EDIT_ROW.track ?? "") ? String(EDIT_ROW.track) : "";

      // Ensure the values exist as options even if the current filter excludes them.
      if (startVal) ensureOption($("editIntermission"), startVal, startVal);
      if (endVal)   ensureOption($("editTrack"), endVal, endVal);

      if (mode === "intermission") {
        if (startVal) $("editIntermission").value = startVal;
        // Trigger existing bidirectional filtering to refresh allowed end options
        try { $("editIntermission").dispatchEvent(new Event("change", { bubbles: true })); } catch(e){}
      }

      // After filtering, ensure endVal is still selectable and then set it
      if (endVal) ensureOption($("editTrack"), endVal, endVal);
      if (endVal) $("editTrack").value = endVal;

      // Also refresh the star-suggestion label/order on the edit start select (if allowed)
      try { refreshSuggestionOptionInStartSelect($("editIntermission")); } catch(e){}
    } catch(e) {}

    $("editVrChange").value = (EDIT_ROW.vr_change ?? "");
    // keep edit negative-toggle button state in sync
    try {
      const b = document.getElementById("editVrSignToggle");
      const i = document.getElementById("editVrChange");
      if (b && i) setNegButtonState(b, i);
    } catch(e) {}
    if ($("editVrAfter")) $("editVrAfter").value = (EDIT_ROW.vr_after ?? "");
    // bind live sync (same behavior as add match)
    $("editVrChange")?.removeEventListener("input", editSyncFromDelta);
    $("editVrAfter")?.removeEventListener("input", editSyncFromAfter);
    $("editVrChange")?.addEventListener("input", editSyncFromDelta);
    $("editVrAfter")?.addEventListener("input", editSyncFromAfter);

    $("editOpponents").value = (EDIT_ROW.opponents ?? "");
    $("editPlacement").value = (EDIT_ROW.placement ?? "");
    try { window.MKWT_TRACK_PICKERS?.refreshAll?.(); } catch(e) {}

    editDlg.showModal();
  } catch (e) {
    setStatus("Failed to open editor: " + (e?.message || e), false);
    setDebug(e?.stack || "");
  }
}

function closeDlg(){
  try { window.MKWT_TRACK_PICKERS?.closeAll?.(); } catch(e) {}
  if (editDlg.open) editDlg.close();
  try { clearEditSuggestedNextStart(); } catch(e) {}
  EDIT_ROW = null;
}

function resetEditRouteFields(){
  const start = $("editIntermission");
  const track = $("editTrack");
  if (start) {
    try { fillTrackSelect(start, " "); } catch(e) {}
    start.value = "";
  }
  if (track) {
    try { fillTrackSelect(track, " "); } catch(e) {}
    track.value = "";
  }
  try { window.MKWT_TRACK_PICKERS?.refreshTrackPickers?.(); } catch(e) {}
}

function clearEditDialogFields(){
  resetEditRouteFields();
  setFieldValue("editOpponents", "");
  setFieldValue("editPlacement", "");
  try { window.MKWT_TRACK_PICKERS?.refreshAll?.(); } catch(e) {}
  setStatus("", true);
  setDebug("");
}

async function saveEditDialog(){
  if (!EDIT_ROW) return;

  const btn = $("btnSaveDlg");
  btn.disabled = true;

  try {
    const mode = document.getElementById("editDlg")?.dataset.mode || ((EDIT_ROW?.intermission ?? "") ? "intermission" : "3lap");
    const intermission = (mode === "intermission") ? ($("editIntermission").value || null) : null;
    const track = $("editTrack").value;
    const vrChangeRaw = $("editVrChange").value;
    const vrAfterRaw  = $("editVrAfter") ? $("editVrAfter").value : "";
    const vr_change_in = (vrChangeRaw === "" ? NaN : parseInt(vrChangeRaw, 10));
    const vr_after_in  = (vrAfterRaw === ""  ? NaN : parseInt(vrAfterRaw, 10));
    const opponentsRaw = $("editOpponents").value;
    const placementRaw = $("editPlacement").value;

    if (!track) { setStatus("Please select a track.", false); return; }
    if (mode === "intermission" && !intermission) { setStatus("Please select an intermission start.", false); return; }
    if (!Number.isFinite(vr_change_in) && !Number.isFinite(vr_after_in)) { setStatus("Please enter VR change or the new total VR.", false); return; }

    let opponents = null;
    if (opponentsRaw !== "") {
      opponents = parseInt(opponentsRaw, 10);
      if (!Number.isFinite(opponents) || opponents < 1 || opponents > 23) {
        setStatus("Opponents must be 1-23.", false);
        return;
      }
    }

    let placement = null;
    if (placementRaw !== "") {
      placement = parseInt(placementRaw, 10);
      if (!Number.isFinite(placement) || placement < 1 || placement > 24) {
        setStatus("Placement must be 1-24.", false);
        return;
      }
    }

    const baseVr = getEditBaseVr();

    let vr_change;
    let vr_after;

    if (Number.isFinite(vr_after_in)) {
      vr_after = vr_after_in;
      vr_change = vr_after - baseVr;
      // keep UI consistent
      try { $("editVrChange").value = String(vr_change); } catch(e) {}
    } else {
      vr_change = vr_change_in;
      vr_after = baseVr + vr_change;
      try { if ($("editVrAfter")) $("editVrAfter").value = String(vr_after); } catch(e) {}
    }

    const oldVr = (EDIT_ROW.vr_change ?? 0);
    const deltaVr = vr_change - oldVr; // profile VR adjustment

    setStatus("Saving changes...", true);

    // 1) Update match + fetch updated row again (important: array)
    let updatedRows = null, upMatchErr = null;
    if (isGuest()) {
      const ok = guestUpdateMatch(EDIT_ROW.id, { intermission, track, vr_change, vr_after, opponents, placement });
      if (!ok) upMatchErr = { message: "Match not found." };
      else updatedRows = [{ id: EDIT_ROW.id, vr_change, vr_after, intermission, track, opponents, placement }];
    } else {
      ({ data: updatedRows, error: upMatchErr } = await supabaseClient
        .from("matches")
        .update({ intermission, track, vr_change, vr_after, opponents, placement })
        .eq("id", EDIT_ROW.id)
        .eq("user_id", SESSION.user.id)
        .select("id, vr_change, vr_after, intermission, track, opponents, placement"));
    }

    if (upMatchErr) {
    setStatus("Match update failed: " + upMatchErr.message, false);
    setDebug(JSON.stringify(upMatchErr, null, 2));
    return;
    }

    if (!updatedRows || updatedRows.length === 0) {
    setStatus("Match was NOT changed (0 rows hit). Check user_id / RLS policy.", false);
    setDebug(
        "Update hit 0 rows.\n" +
        "EDIT_ROW.id=" + EDIT_ROW.id + "\n" +
        "SESSION.user.id=" + SESSION.user.id + "\n" +
        "Tip: In Supabase, verify matches.user_id is really your user."
    );
    return;
}

    if (!isGuest() && deltaVr !== 0) {
      await loadProfile();
      const fixed = (PROFILE?.current_vr ?? 8500) + deltaVr;

      const { error: upProfErr } = await supabaseClient
        .from("profiles")
        .update({ current_vr: fixed, updated_at: new Date().toISOString() })
        .eq("id", SESSION.user.id);

      if (upProfErr) {
        setStatus("Warning: match updated, but profile VR sync failed: " + upProfErr.message, false);
        setDebug(JSON.stringify(upProfErr, null, 2));
        closeDlg();
        await refreshAll();
        return;
      }
    }

    setStatus("Changes saved.", true);
    closeDlg();
    await refreshAll();

  } catch (e) {
    setStatus("Save failed: " + (e?.message || e), false);
    setDebug(e?.stack || "");
  } finally {
    btn.disabled = false;
  }
}

async function deleteMatch(id){
  try {
    const row = await fetchMatchById(id);
    if (!row) { setStatus("Match not found.", false); return; }

    const body = `Track: ${row.track}\nVR change: ${row.vr_change}\nTime: ${row.created_at ? new Date(row.created_at).toLocaleString() : ""}`;
    const ok = window.MKWT?.confirmAction
      ? await window.MKWT.confirmAction({
          eyebrow: "Delete",
          title: "Delete match?",
          body,
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          danger: true,
        })
      : confirm(`Delete match?\n\n${body}`);
    if (!ok) return;

    setStatus("Deleting match...", true);

    if (isGuest()) {
      const okDel = guestDeleteMatch(id);
      if (!okDel) { setStatus("Delete failed: match not found.", false); return; }
	      // Guest mode ends here (no Supabase writes)
	      totalMatches = null;
	      setStatus("Match deleted.", true);
	      await refreshAll();
	      return;
    } else {
      const { error: delErr } = await supabaseClient
        .from("matches")
        .delete()
        .eq("id", id)
        .eq("user_id", SESSION.user.id);

      if (delErr) {
        setStatus("Delete failed: " + delErr.message, false);
        setDebug(JSON.stringify(delErr, null, 2));
        return;
      }
    }

    // Profil-VR korrigieren: Einfluss dieses Matches entfernen
    const oldVr = (row.vr_change ?? 0);
    await loadProfile();
    const fixed = (PROFILE?.current_vr ?? 8500) - oldVr;

    const { error: upProfErr } = await supabaseClient
      .from("profiles")
      .update({ current_vr: fixed, updated_at: new Date().toISOString() })
      .eq("id", SESSION.user.id);

    if (upProfErr) {
      setStatus("Warning: match deleted, but profile VR sync failed: " + upProfErr.message, false);
      setDebug(JSON.stringify(upProfErr, null, 2));
    } else {
      setStatus("Match deleted. VR adjusted.", true);
    }

    // Make Suggestion update feel instant:
    // - Remove the deleted row from the table immediately (delete is only allowed for the newest row).
    // - Set suggestion to the new top-most match target track (end track for intermission, track for 3-lap).
    // This avoids waiting for refreshAll/network before the Suggestion option appears.
    try {
      const btn = document.querySelector(`button[data-action="del"][data-id="${id}"]`);
      const tr = btn ? btn.closest('tr') : null;
      if (tr && tr.parentElement) tr.parentElement.removeChild(tr);

      const nextTop = getTopMatchTargetTrackFromTable();
      if (nextTop) {
        setLastSuggestedTrack(nextTop);
      } else {
        try { localStorage.removeItem('mkwt_last_next_start'); } catch(e) {}
      }
      refreshSuggestionOptionInStartSelect($("intermission"));
    } catch(e) {}

    await refreshAll();
  } catch (e) {
    setStatus("Delete failed: " + (e?.message || e), false);
    setDebug(e?.stack || "");
  }
}

function setupSessionsDialog(){
  const btn = $("btnShowSessions");
  const dlg = $("sessionsDlg");
  const closeBtn = $("btnCloseSessionsDlg");
  const frame = $("sessionsFrame");
  if (!btn || !dlg || !frame) return;

  const closeDialog = () => {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  };

  btn.addEventListener("click", () => {
    frame.src = "sessions.html?embed=1&t=" + Date.now();
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  });
  closeBtn?.addEventListener("click", closeDialog);
  dlg.addEventListener("click", (event) => {
    if (event.target === dlg) closeDialog();
  });
}

function clearMatchRouteFields(){
  try { resetIntermissionSelects(); } catch(e) {}
  setFieldValue("intermission", "");
  setFieldValue("track", "");
  try { window.MKWT_TRACK_PICKERS?.refreshTrackPickers?.(); } catch(e) {}
}

  // Buttons
  $("btnCreateProfile")?.addEventListener("click", createProfile);
  $("btnSaveMatch")?.addEventListener("click", saveMatch);
  $("vrOnboardingForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveVrOnboarding();
  });
  $("btnVrOnboardingLater")?.addEventListener("click", () => {
    markVrOnboardingDone();
    closeVrOnboardingDialog();
    setMatchStatus("You can set your VR in Settings anytime.", true);
  });
  $("vrOnboardingDlg")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    markVrOnboardingDone();
    closeVrOnboardingDialog();
  });
  $("vrOnboardingDlg")?.addEventListener("click", (event) => {
    if (event.target !== $("vrOnboardingDlg")) return;
    markVrOnboardingDone();
    closeVrOnboardingDialog();
  });
  setupSessionsDialog();

  // Live-Sync der Eingabefelder
  $("vrChange")?.addEventListener("input", syncFromDelta);
  $("vrAfterInput")?.addEventListener("input", syncFromAfter);

  $("btnClear")?.addEventListener("click", () => {
    clearMatchRouteFields();
    setFieldValue("opponents", "");
    setFieldValue("placement", "");
    try { window.MKWT_TRACK_PICKERS?.refreshAll?.(); } catch(e) {}
    setStatus("", true);
    setMatchStatus("", true);
    setDebug("");
  });
    $("btnPrev")?.addEventListener("click", async () => {
  if (currentPage <= 1) return;
  currentPage--;
  await loadMatches();

  });

    $("btnNext")?.addEventListener("click", async () => {
  // If we know totalMatches, do not move beyond maxPage
  if (totalMatches != null) {
    const maxPage = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));
    if (currentPage >= maxPage) return;
  }

  currentPage++;
  await loadMatches();
    });
    // ===== Dialog Buttons (PART 7) =====
    $("btnCancelDlg")?.addEventListener("click", closeDlg);
    $("btnClearEditDlg")?.addEventListener("click", clearEditDialogFields);
    $("btnSaveDlg")?.addEventListener("click", saveEditDialog);

    // ESC / backdrop click closes dialog.
    $("editDlg")?.addEventListener("cancel", (e) => { e.preventDefault(); closeDlg(); });
    $("editDlg")?.addEventListener("click", (event) => {
      if (event.target !== $("editDlg")) return;
      if ($("editDlg")?.querySelector(".trackPicker.is-open")) {
        event.preventDefault();
        event.stopPropagation();
        try { window.MKWT_TRACK_PICKERS?.closeAll?.(); } catch(e) {}
        return;
      }
      closeDlg();
    });

  // Start
  (async () => {
    try {
      setDebug("App starting...");

    // Populate selects (Intermission/Track + edit dialog)
    initSelects();
    await loadTrackIconMap();
    preloadTrackPickerIcons();
    initTrackPickers();

    // Guest mode is allowed: continue even without a session.
    await requireAuth();
    await refreshAll({ deferHeavy: true });

    // Offer to import Guest data on first login (only if account has 0 matches)
    try {
      if (!isGuest() && sessionStorage.getItem("mkwt_offer_import_guest") === "1") {
        sessionStorage.removeItem("mkwt_offer_import_guest");
        const guest = loadGuestMatches();
        if (guest.length > 0) {
          const { count } = await supabaseClient
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("user_id", SESSION.user.id);
          if ((count || 0) === 0) {
            const ok = window.MKWT?.confirmAction
              ? await window.MKWT.confirmAction({
                  eyebrow: "Guest import",
                  title: "Import Guest data?",
                  body: `Guest matches found: ${guest.length}\n\nThis imports your local Guest matches into this account and clears the local Guest copy.`,
                  confirmLabel: "Import",
                  cancelLabel: "Keep local",
                  danger: false,
                })
              : confirm(`Import your Guest data into this account?\n\nGuest matches found: ${guest.length}\n\nOK = Import & clear Guest data\nCancel = Keep Guest data locally`);
            if (ok) {
              setStatus("Importing Guest data...", true);
              const batchSize = 500;
              let inserted = 0;
              for (let i=0; i<guest.length; i+=batchSize) {
                const batch = guest.slice(i, i+batchSize).map(m => ({
                  user_id: SESSION.user.id,
                  intermission: m.intermission ?? null,
                  track: m.track ?? "",
                  vr_change: Number(m.vr_change ?? 0),
                  vr_after: Number(m.vr_after ?? 0),
                  opponents: m.opponents ?? null,
                  placement: m.placement ?? null,
                  created_at: m.created_at || new Date().toISOString()
                }));
                const { error } = await supabaseClient.from("matches").insert(batch);
                if (error) throw error;
                inserted += batch.length;
              }
              saveGuestMatches([]); // clear guest after import to avoid duplicates
              setStatus(`Imported ${inserted} matches from Guest.`, true);
              await refreshAll();
            }
          }
        }
      }
    } catch(e) {
      setStatus("Guest import failed: " + (e?.message || e), false);
      setDebug(e?.stack || String(e));
    }

    setDebug("");
    } catch (e) {
      try { $("userInfo").textContent = "Init error"; } catch(_){ }
      try { setStatus("Init error: " + (e?.message || e), false); } catch(_) {}
      try { setDebug(e?.stack || String(e)); } catch(_) {}
      console.error(e);
    }
})();

(function(){
  function wireSelectAll(input){
    if (!input) return;
    input.addEventListener("focus", () => {
      input.dataset.prev = input.value || "";
      // iOS: select needs a tick after focus
      setTimeout(() => { try { input.select(); } catch(e){} }, 0);
    });
    input.addEventListener("blur", () => {
      if ((input.value || "").trim() === "") {
        input.value = input.dataset.prev || "";
      }
    });
  }

  function setNegButtonState(btn, input){
    if (!btn || !input) return;
    const isNeg = (input.value || "").startsWith("-");
    btn.classList.toggle("is-negative", isNeg);
  }

  document.addEventListener("DOMContentLoaded", () => {
    // --- Match mode toggle (Intermission vs 3-Lap) ---
    const modeBtns = Array.from(document.querySelectorAll(".modeBtn"));
    const fieldIntermission = document.getElementById("fieldIntermissionStart");
    const fieldTrack = document.getElementById("fieldTrack");
    const labelIntermission = document.getElementById("labelIntermissionStart");
    const labelTrack = document.getElementById("labelTrack");
    const trackPlaceholder = document.getElementById("trackPlaceholder");
    const intermissionSel = document.getElementById("intermission");
    const trackSel = document.getElementById("track");
    const destinyNotice = document.getElementById("intermissionDestinyNotice");
    const destinyNoticeValue = document.getElementById("intermissionDestinyNoticeValue");
    const resetCreateRouteFields = () => {
      try { resetIntermissionSelects(); } catch(e) {}
      if (intermissionSel) {
        intermissionSel.value = "";
        try { intermissionSel.dispatchEvent(new Event("change", { bubbles: true })); } catch(e) {}
      }
      if (trackSel) {
        trackSel.value = "";
        try { trackSel.dispatchEvent(new Event("change", { bubbles: true })); } catch(e) {}
      }
    };

    function setMode(mode, options = {}){
      const nextMode = mode || "intermission";
      const currentMode = document.querySelector(".modeBtn.isActive")?.dataset.mode || "";
      if (!options.force && currentMode === nextMode) return;

      modeBtns.forEach(b => {
        const active = b.dataset.mode === nextMode;
        b.classList.toggle("isActive", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });

      const isIntermission = (nextMode === "intermission");
      if (isIntermission) {
        try { resetIntermissionSelects(); } catch(e) {}
        try { autoPrefillIntermissionStartIfFresh(); } catch(e) {}
      }

      // IMPORTANT:
      // The Track <select id="track"> is shared between Intermission-End and 3-Lap Track.
      // If the user previously selected an Intermission Start, the existing filter logic
      // can leave the Track dropdown in a filtered state unless we explicitly reset it.
      // Requirement: when switching to Track mode, clear the Track selection and restore
      // the full, unfiltered list.
      if (!isIntermission) {
        resetCreateRouteFields();
      }
      if (fieldIntermission) fieldIntermission.style.display = isIntermission ? "" : "none";
      // intermissionSel is already cleared above (and change-dispatched) when leaving Intermission.
      if (labelIntermission) labelIntermission.textContent = "Intermission start";
      if (labelTrack) labelTrack.textContent = isIntermission ? "Intermission end" : "Track";
      if (trackPlaceholder) trackPlaceholder.textContent = isIntermission ? "Intermission end" : "Track";

      // Strategy ? icon should only appear when the current selection is valid.
      try { updateStratAvailability(); } catch(e) {}
      try { updateDestinyNotice(); } catch(e) {}
      try { window.MKWT_TRACK_PICKERS?.refreshTrackPickers?.(); } catch(e) {}
    }

    let lastModePointerDown = 0;
    modeBtns.forEach(b => {
      b.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;
        lastModePointerDown = Date.now();
        event.preventDefault();
        setMode(b.dataset.mode || "intermission");
      }, { passive: false });
      b.addEventListener("click", () => {
        if (Date.now() - lastModePointerDown < 500) return;
        setMode(b.dataset.mode || "intermission");
      });
    });
    // Default: Intermission (current behavior)
    setMode("intermission", { force: true });

	    // --- Strategy popup (single element; content from strats.json) ---
	    let STRATS = null;
	    const stratPopup = document.getElementById('stratPopup');
	    const stratPopupBody = document.getElementById('stratPopupBody');
	    const stratBtnTrack = document.getElementById('stratBtnTrack');
	    const infoBtnVrAfter = document.getElementById('infoBtnVrAfter');
	    const infoBtnVrAfterEdit = document.getElementById('infoBtnVrAfterEdit');
	    const mm = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);
	    const isCoarse = mm('(pointer: coarse)');
	    const canHover = mm('(hover: hover)');

	    async function loadStrats(){
	      try {
	        const r = await fetch('strats.json', { cache: 'no-store' });
	        if (!r.ok) throw new Error('HTTP ' + r.status);
	        STRATS = await r.json();
	        // Expose META for special end-display labels (used by Intermission End dropdown).
	        window.MKWT_STRATS_META_INTERMISSIONS = (STRATS && STRATS.META && STRATS.META.INTERMISSIONS) ? STRATS.META.INTERMISSIONS : {};
	      } catch (e) {
	        STRATS = null;
	        window.MKWT_STRATS_META_INTERMISSIONS = {};
	      }
	    }

	    function firstChar(s){
	      const v = String(s || '').trim();
	      return v ? v.charAt(0) : '';
	    }

	    function getStrategyText(){
	      const start = (intermissionSel && intermissionSel.value) ? intermissionSel.value : '';
	      const end = (trackSel && trackSel.value) ? trackSel.value : '';
	      // Intermission needs BOTH start + end.
	      if (start && end){
	        const key = `${start}>${end}`;
	        const t = STRATS && STRATS.INTERMISSIONS && STRATS.INTERMISSIONS[key];
	        return t || `coming soon [${firstChar(start)}:${firstChar(end)}]`;
	      }
	      // 3-Lap track: only when no start selected.
	      if (!start && end){
	        const t = STRATS && STRATS.TRACKS && STRATS.TRACKS[end];
	        return t || `coming soon [3:${firstChar(end)}]`;
	      }
	      return 'coming soon';
	    }

	    function getPopupText(anchor){
	      const popupKey = anchor && anchor.dataset ? anchor.dataset.popup : '';
	      if (popupKey === 'vrAfter'){
	        return 'New total VR can be corrected in Settings (e.g., after a disconnect).';
	      }
	      return getStrategyText();
	    }

	    function positionPopup(anchor){
	      if (!stratPopup || !anchor) return;
	      const r = anchor.getBoundingClientRect();
	      const pad = 8;
	      // default: below-right
	      let left = Math.min(window.innerWidth - pad, r.right + pad);
	      let top  = Math.min(window.innerHeight - pad, r.bottom + pad);
	      stratPopup.style.left = '0px';
	      stratPopup.style.top = '0px';
	      // measure
	      const w = stratPopup.offsetWidth || 220;
	      const h = stratPopup.offsetHeight || 60;
	      left = Math.min(left, window.innerWidth - w - pad);
	      top  = Math.min(top, window.innerHeight - h - pad);
	      // if not enough room below, try above
	      if (top < pad || (r.bottom + h + pad > window.innerHeight)){
	        const altTop = r.top - h - pad;
	        if (altTop >= pad) top = altTop;
	      }
	      stratPopup.style.left = Math.max(pad, left) + 'px';
	      stratPopup.style.top  = Math.max(pad, top) + 'px';
	    }

	    let currentAnchorBtn = null;
	    function openPopup(anchor){
	      if (!stratPopup || !stratPopupBody) return;
	      currentAnchorBtn = anchor || null;
	      stratPopupBody.textContent = getPopupText(anchor);
	      stratPopup.classList.add('isOpen');
	      stratPopup.setAttribute('aria-hidden', 'false');
	      positionPopup(anchor);
	      stratPopup.dataset.anchor = (anchor && anchor.id) ? anchor.id : '';
	    }
	    function closePopup(){
	      if (!stratPopup) return;
	      stratPopup.classList.remove('isOpen');
	      stratPopup.setAttribute('aria-hidden', 'true');
	      stratPopup.dataset.anchor = '';
	      currentAnchorBtn = null;
	    }
	    function togglePopup(anchor){
	      if (!stratPopup) return;
	      const open = stratPopup.classList.contains('isOpen');
	      if (open) closePopup();
	      else openPopup(anchor);
	    }

	    function updateStratAvailability(){
	      if (!stratBtnTrack) return;
	      const start = (intermissionSel && intermissionSel.value) ? intermissionSel.value : '';
	      const end = (trackSel && trackSel.value) ? trackSel.value : '';
	      const isIntermissionMode = fieldIntermission && fieldIntermission.style.display !== 'none';
	      // In Intermission mode we only want the ? when BOTH start+end are set.
	      // In 3-Lap mode we want the ? when a track is set.
	      const shouldShow = isIntermissionMode ? !!(start && end) : !!end;
	      stratBtnTrack.style.display = shouldShow ? '' : 'none';
	      stratBtnTrack.disabled = !shouldShow;
	      if (fieldTrack) fieldTrack.classList.toggle('hasActiveStrat', shouldShow);
	      if (!shouldShow && stratPopup && stratPopup.classList.contains('isOpen')) closePopup();
	    }

	    function selectedSpecialDestinyLabel(){
	      const start = (intermissionSel && intermissionSel.value) ? intermissionSel.value : '';
	      const end = (trackSel && trackSel.value) ? trackSel.value : '';
	      if (!start || !end) return '';
	      const metaIM = (window.MKWT_STRATS_META_INTERMISSIONS && typeof window.MKWT_STRATS_META_INTERMISSIONS === 'object')
	        ? window.MKWT_STRATS_META_INTERMISSIONS
	        : null;
	      const meta = (typeof lookupIntermissionRouteMeta === 'function')
	        ? lookupIntermissionRouteMeta(metaIM, start, end)
	        : null;
	      if (!meta) return '';
	      const plainEnd = String(end || '').trim();
	      const destinyGroup = String(meta.destiny_group || '').trim();
	      const specialTag = String(meta.special_tag || '').trim();
	      const groupIsDifferent = !!destinyGroup && destinyGroup.toLowerCase() !== plainEnd.toLowerCase();
	      const tagIsDifferent = !!specialTag && specialTag.toLowerCase() !== plainEnd.toLowerCase();
	      const labels = [];
	      if (groupIsDifferent) labels.push(destinyGroup);
	      if (tagIsDifferent) labels.push(specialTag);
	      labels.sort((a, b) => a.length - b.length);
	      return labels[0] || '';
	    }

	    function updateDestinyNotice(){
	      if (!destinyNotice) return;
	      const isIntermissionMode = fieldIntermission && fieldIntermission.style.display !== 'none';
	      const label = isIntermissionMode ? selectedSpecialDestinyLabel() : '';
	      if (!label){
	        destinyNotice.classList.remove('is-visible');
	        destinyNotice.classList.add('hidden');
	        destinyNotice.hidden = true;
	        destinyNotice.title = '';
	        if (destinyNoticeValue) destinyNoticeValue.textContent = '-';
	        return;
	      }
	      destinyNotice.hidden = false;
	      destinyNotice.classList.remove('hidden');
	      destinyNotice.title = label;
	      if (destinyNoticeValue) destinyNoticeValue.textContent = label;
	      requestAnimationFrame(() => destinyNotice.classList.add('is-visible'));
	    }

	    let lastPointerDown = 0;
	    function bindStratBtn(btn){
	      if (!btn) return;
	      // Touch / mobile emulation: use pointerdown so the first tap opens (avoids "tap-to-hover" behavior).
	      btn.addEventListener('pointerdown', (e)=>{
	        // Ignore mouse pointerdown on desktop; click/hover handles that.
	        if (e.pointerType === 'mouse' && canHover) return;
	        lastPointerDown = Date.now();
	        e.preventDefault();
	        e.stopPropagation();
	        togglePopup(btn);
	      }, { passive: false });

	      // Click works on desktop (and as a fallback everywhere)
	      btn.addEventListener('click', (e)=>{
	        // If pointerdown already handled this, don't immediately toggle again.
	        // BUT still stop the event so the document click-handler doesn't instantly close the popup.
	        if (Date.now() - lastPointerDown < 500) {
	          e.preventDefault();
	          e.stopPropagation();
	          return;
	        }
	        e.preventDefault();
	        e.stopPropagation();
	        togglePopup(btn);
	      });

	      // Hover only on real hover-capable, non-coarse pointer devices.
	      // This prevents "auto-open" when the ? button appears under the cursor
	      // in device emulation or touch-capable setups.
	      if (canHover && !isCoarse){
	        btn.addEventListener('mouseenter', ()=> openPopup(btn));
	        btn.addEventListener('mouseleave', ()=>{
	          // allow moving into popup without instantly closing
	          setTimeout(()=>{
	            if (!stratPopup) return;
	            const stillHover = stratPopup.matches(':hover') || btn.matches(':hover');
	            if (!stillHover) closePopup();
	          }, 80);
	        });
	      }
	    }
	    bindStratBtn(stratBtnTrack);
	    bindStratBtn(infoBtnVrAfter);
	    bindStratBtn(infoBtnVrAfterEdit);

	    if (stratPopup && !isCoarse){
	      stratPopup.addEventListener('mouseleave', ()=>{
	        setTimeout(()=>{
	          const stillHover = stratPopup.matches(':hover') || (currentAnchorBtn && currentAnchorBtn.matches && currentAnchorBtn.matches(':hover'));
	          if (!stillHover) closePopup();
	        }, 80);
	      });
	    }

	    function handleGlobalClose(e){
	      if (!stratPopup || !stratPopup.classList.contains('isOpen')) return;
	      // Keep open only when interacting with the ? button itself.
	      // Clicking anywhere else (including the popup body) closes it.
	      if (currentAnchorBtn && currentAnchorBtn.contains && currentAnchorBtn.contains(e.target)) return;
	      closePopup();
	    }
	    // pointerdown ensures mobile closes reliably (some environments delay/skip click).
	    document.addEventListener('pointerdown', handleGlobalClose, { passive: true });
	    document.addEventListener('click', handleGlobalClose);
	    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closePopup(); });
	    window.addEventListener('resize', ()=>{
	      if (!stratPopup || !stratPopup.classList.contains('isOpen')) return;
	      const anchorId = stratPopup.dataset.anchor;
	      const anchor = anchorId ? document.getElementById(anchorId) : null;
	      if (anchor) positionPopup(anchor);
	    });
	    intermissionSel && intermissionSel.addEventListener('change', ()=>{
	      try { updateStratAvailability(); } catch(e) {}
	      try { updateDestinyNotice(); } catch(e) {}
	      if (stratPopup && stratPopup.classList.contains('isOpen')) openPopup(document.getElementById(stratPopup.dataset.anchor) || stratBtnTrack );
	    });
	    trackSel && trackSel.addEventListener('change', ()=>{
	      try { updateStratAvailability(); } catch(e) {}
	      try { updateDestinyNotice(); } catch(e) {}
	      if (stratPopup && stratPopup.classList.contains('isOpen')) openPopup(document.getElementById(stratPopup.dataset.anchor) || stratBtnTrack );
	    });

	    loadStrats().finally(()=>{
	      try { updateStratAvailability(); } catch(e) {}
	      try { updateDestinyNotice(); } catch(e) {}
	      // If the user already selected a start/end before strats loaded,
	      // re-apply the visual special suffixes now.
	      try {
	        const s = (intermissionSel && intermissionSel.value) ? intermissionSel.value : '';
	        if (s) applySpecialEndLabelsToSelect(trackSel, s);
	      } catch(e) {}
	      try {
	        const es = document.getElementById('editIntermission');
	        const ee = document.getElementById('editTrack');
	        const s2 = (es && es.value) ? es.value : '';
	        if (s2) applySpecialEndLabelsToSelect(ee, s2);
	      } catch(e) {}
	    });

    const vr = document.getElementById("vrChange");
    const vrAfter = document.getElementById("vrAfterInput");
    const negBtn = document.getElementById("vrSignToggle");

    wireSelectAll(vr);
    wireSelectAll(vrAfter);

    if (negBtn && vr) {
      setNegButtonState(negBtn, vr);
      negBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!vr.value) {
          vr.focus();
          return;
        }
        vr.value = vr.value.startsWith("-") ? vr.value.slice(1) : ("-" + vr.value);
        setNegButtonState(negBtn, vr);
        vr.dispatchEvent(new Event("input", { bubbles: true }));
        vr.focus();
        setTimeout(() => { try { vr.select(); } catch(e){} }, 0);
      });

      // If user manually clears/changes value, keep button state in sync
      vr.addEventListener("input", () => setNegButtonState(negBtn, vr));
    }

    // Edit dialog: same negative toggle for VR change
    const editVr = document.getElementById("editVrChange");
    const editNegBtn = document.getElementById("editVrSignToggle");
    if (editNegBtn && editVr) {
      setNegButtonState(editNegBtn, editVr);
      editNegBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!editVr.value) {
          editVr.focus();
          return;
        }
        editVr.value = editVr.value.startsWith("-") ? editVr.value.slice(1) : ("-" + editVr.value);
        setNegButtonState(editNegBtn, editVr);
        editVr.dispatchEvent(new Event("input", { bubbles: true }));
        editVr.focus();
        setTimeout(() => { try { editVr.select(); } catch(e){} }, 0);
      });
      editVr.addEventListener("input", () => setNegButtonState(editNegBtn, editVr));
    }
  });
})();

function setEditMode(mode, options = {}){
  const bI = document.getElementById('editModeIntermission');
  const b3 = document.getElementById('editMode3lap');
  const fieldStart = document.getElementById('editIntermissionField');
  const lblTrack = document.getElementById('editTrackLabel');
  const dlg = document.getElementById('editDlg');
  const prevMode = dlg?.dataset.mode || '';
  const isInter = (mode === 'intermission');
  if (bI) bI.classList.toggle('isActive', isInter);
  if (b3) b3.classList.toggle('isActive', !isInter);
  if (fieldStart) fieldStart.style.display = isInter ? '' : 'none';
  if (lblTrack) lblTrack.textContent = isInter ? 'Intermission end' : 'Track';
  // store on dialog for save
  if (dlg) dlg.dataset.mode = isInter ? 'intermission' : '3lap';
  if (!isInter && !options.keepValues && prevMode !== '3lap') {
    resetEditRouteFields();
  }
  try { window.MKWT_TRACK_PICKERS?.refreshAll?.(); } catch(e) {}
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#editModeIntermission, #editMode3lap');
  if (!btn) return;
  setEditMode(btn.dataset.mode);
});
