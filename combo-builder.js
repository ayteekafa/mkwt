(() => {
  const DATA_URL = "combo_builder_data.json";
  const ICON_MANIFEST_URL = "combo_icon_map.json";
  const STORAGE_KEY = "mkwt_combo_builder_selection_v1";
  const DEFAULT_SELECTION = {
    character: "Mario",
    vehicle: "Standard Kart",
  };
  const CHARACTER_NAME_ALIASES = {
    Swooper: "Swoop",
    Fishbone: "Fish Bone",
  };
  const VEHICLE_NAME_ALIASES = {
    "B-Dasher": "B Dasher",
  };
  const STAT_GROUPS = [
    {
      key: "speed",
      title: "Speed Surfaces",
      className: "cbStatGroup--speed",
      stats: ["onRoadSpeed", "offRoadSpeed", "waterSpeed"],
    },
    {
      key: "tech",
      title: "Drive Feel",
      className: "cbStatGroup--tech",
      stats: ["acceleration", "miniTurbo", "coinCurve"],
    },
    {
      key: "handling",
      title: "Handling Surfaces",
      className: "cbStatGroup--handling",
      stats: ["onRoadHandling", "offRoadHandling", "waterHandling"],
    },
    {
      key: "survival",
      title: "Weight & Safety",
      className: "cbStatGroup--survival",
      stats: ["weight", "invincibility"],
    },
  ];
  const REFERENCE_COLORS = {
    selected: { stroke: "#4e7cff", fill: "rgba(78,124,255,.12)" },
    feather: { stroke: "#4cc490", fill: "rgba(76,196,144,.12)" },
    heavy: { stroke: "#ff9749", fill: "rgba(255,151,73,.12)" },
  };
  const ONLINE_META_GROUPS = [
    {
      label: "On-Road Lightweight",
      tag: "ON-L-4",
      characters: ["Toadette", "Nabbit"],
      vehicles: ["Baby Blooper"],
    },
    {
      label: "On-Road Lightweight",
      tag: "ON-L-2",
      characters: ["Toadette", "Nabbit"],
      vehicles: ["Mach Rocket", "R.O.B. H.O.G."],
    },
    {
      label: "Flyweight",
      tag: "ON-L-4",
      characters: ["Baby Peach", "Baby Daisy", "Swoop", "Para-Biddybud"],
      vehicles: ["Baby Blooper"],
    },
    {
      label: "On-Road Featherweight",
      tag: "ON-L-4",
      characters: ["Baby Mario", "Goomba", "Spike"],
      vehicles: ["Baby Blooper"],
    },
    {
      label: "Flyweight",
      tag: "ON-L-2",
      characters: ["Baby Peach", "Baby Daisy", "Swoop", "Para-Biddybud"],
      vehicles: ["Mach Rocket", "R.O.B. H.O.G."],
    },
    {
      label: "On-Road Featherweight",
      tag: "ON-L-2",
      characters: ["Baby Mario", "Goomba", "Spike"],
      vehicles: ["Mach Rocket", "R.O.B. H.O.G."],
    },
  ];

  const $ = (id) => document.getElementById(id);
  let builderData = null;
  let iconManifest = null;
  let coinChart = null;
  let currentSelection = { ...DEFAULT_SELECTION };
  let compareSelection = null;
  let filterState = {};
  let similarComboMap = new Map();
  let allCombos = [];
  let comboPickerBackdrop = null;
  let comboPickerScrollY = 0;
  let comboPickerBindingsReady = false;
  let activeComboLetterPicker = null;
  let comboPickerIconWarmupPromise = null;
  let comboPickerIconRefreshQueued = false;
  const comboPickerReadyPaths = new Set();

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function canonicalName(value, aliasMap = {}) {
    const text = cleanText(value);
    return aliasMap[text] || text;
  }

  function setStatus(message, ok = true) {
    const el = $("cbStatus");
    if (!el) return;
    const text = cleanText(message);
    if (window.MKWT?.setStatus) {
      window.MKWT.setStatus(el, text, ok);
      el.classList.add("hidden");
      el.hidden = true;
    } else {
      el.textContent = text;
      el.className = "muted" + (text ? (ok ? " ok" : " bad") : "");
      el.hidden = !text;
      el.classList.toggle("hidden", !text);
    }
  }

  function readStoredSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SELECTION };
      const parsed = JSON.parse(raw);
      return {
        character: canonicalName(parsed?.character, CHARACTER_NAME_ALIASES) || DEFAULT_SELECTION.character,
        vehicle: canonicalName(parsed?.vehicle, VEHICLE_NAME_ALIASES) || DEFAULT_SELECTION.vehicle,
      };
    } catch (e) {
      return { ...DEFAULT_SELECTION };
    }
  }

  function saveStoredSelection(selection) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch (e) {}
  }

  function normalizeSelection(selection) {
    return {
      character: canonicalName(selection?.character, CHARACTER_NAME_ALIASES) || DEFAULT_SELECTION.character,
      vehicle: canonicalName(selection?.vehicle, VEHICLE_NAME_ALIASES) || DEFAULT_SELECTION.vehicle,
    };
  }

  function sortByName(a, b) {
    return cleanText(a?.name).localeCompare(cleanText(b?.name), "en", { sensitivity: "base" });
  }

  function fmtNumber(value, digits = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return num.toLocaleString("en-GB", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function fmtPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return `${num.toFixed(2)}%`;
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
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

  async function loadData() {
    const [dataResponse, iconResponse] = await Promise.all([
      fetch(DATA_URL, { cache: "no-store" }),
      fetch(ICON_MANIFEST_URL, { cache: "no-store" }),
    ]);
    if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
    builderData = await dataResponse.json();
    iconManifest = iconResponse.ok
      ? await iconResponse.json()
      : { characters: {}, vehicles: {} };
  }

  function getCharacterOptions() {
    return [...(builderData?.characters || [])].sort(sortByName);
  }

  function getVehicleOptions() {
    return [...(builderData?.vehicles || [])].sort(sortByName);
  }

  function findCharacter(name) {
    const target = canonicalName(name, CHARACTER_NAME_ALIASES);
    return (builderData?.characters || []).find((entry) => cleanText(entry.name) === target) || null;
  }

  function findVehicle(name) {
    const target = canonicalName(name, VEHICLE_NAME_ALIASES);
    return (builderData?.vehicles || []).find((entry) => cleanText(entry.name) === target) || null;
  }

  function populateSelect(selectId, options, selectedName) {
    const select = $(selectId);
    if (!select) return;
    select.innerHTML = options
      .map((entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</option>`)
      .join("");
    const canonicalSelected = selectId.includes("Character")
      ? canonicalName(selectedName, CHARACTER_NAME_ALIASES)
      : canonicalName(selectedName, VEHICLE_NAME_ALIASES);
    const hasSelection = options.some((entry) => cleanText(entry.name) === cleanText(canonicalSelected));
    select.value = hasSelection ? canonicalSelected : (options[0]?.name || "");
    refreshComboPickers();
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

  function comboGlyphLetters(name) {
    const words = cleanText(name).split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    }
    const token = words[0] || "?";
    return token.slice(0, 2).toUpperCase();
  }

  function iconRecord(type, slug) {
    const pool = type === "character"
      ? iconManifest?.characters
      : iconManifest?.vehicles;
    return slug ? pool?.[slug] || null : null;
  }

  function iconMarkup(type, name, slug, extraClass = "") {
    const letters = comboGlyphLetters(name);
    const src = comboPickerIconPath(type, name);
    const className = ["cbGlyph", `cbGlyph--${type}`, extraClass].filter(Boolean).join(" ");
    return `
      <span class="${escapeHtml(className)}" data-icon-key="${escapeHtml(slug || "")}" data-has-image="${src ? "true" : "false"}" aria-hidden="true">
        <span class="cbGlyphFallback">${escapeHtml(letters)}</span>
        ${src ? `<img alt="" loading="lazy" src="${escapeHtml(src)}" />` : ""}
      </span>
    `;
  }

  function readComboPickerOptions(selectEl) {
    return Array.from(selectEl?.options || [])
      .filter((option) => option.value)
      .map((option) => ({
        value: option.value,
        label: cleanText(option.textContent || option.label || option.value),
      }));
  }

  function selectedComboPickerLabel(selectEl, placeholder = "") {
    const selected = selectEl?.selectedOptions?.[0];
    if (selectEl?.value && selected) return cleanText(selected.textContent || selected.label || selectEl.value);
    return placeholder;
  }

  function comboPickerLetters(options) {
    const letters = options
      .map((option) => cleanText(option.label || option.value).charAt(0).toUpperCase())
      .filter((letter) => /^[A-Z0-9]$/.test(letter));
    return Array.from(new Set(letters)).sort((a, b) => a.localeCompare(b));
  }

  function filterComboPickerOptions(options, letter) {
    if (!letter || letter === "all") return options;
    return options.filter((option) => cleanText(option.label || option.value).charAt(0).toUpperCase() === letter);
  }

  function groupComboPickerOptions(options) {
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

  function comboPickerIconPath(kind, value) {
    const entry = kind === "character" ? findCharacter(value) : findVehicle(value);
    const slug = entry?.slug || entry?.iconKey || "";
    const record = iconRecord(kind, slug);
    const rawPath = cleanText(record?.path || "");
    const fileName = rawPath.split(/[\\/]/).pop();
    if (fileName) return `assets/picker-icons/${kind === "character" ? "characters" : "vehicles"}/${fileName}`;
    return rawPath;
  }

  function scheduleComboPickerRefresh() {
    if (comboPickerIconRefreshQueued) return;
    comboPickerIconRefreshQueued = true;
    requestAnimationFrame(() => {
      comboPickerIconRefreshQueued = false;
      refreshComboPickers();
    });
  }

  function preloadComboPickerIconPath(src) {
    if (!src || comboPickerReadyPaths.has(src)) return Promise.resolve(src);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        comboPickerReadyPaths.add(src);
        scheduleComboPickerRefresh();
        resolve(src);
      };
      img.onerror = () => resolve("");
      img.decoding = "async";
      img.loading = "eager";
      img.src = src;
    });
  }

  function preloadComboPickerIcons() {
    if (comboPickerIconWarmupPromise) return comboPickerIconWarmupPromise;
    const paths = [];
    for (const character of builderData?.characters || []) {
      const path = comboPickerIconPath("character", character.name);
      if (path) paths.push(path);
    }
    for (const vehicle of builderData?.vehicles || []) {
      const path = comboPickerIconPath("vehicle", vehicle.name);
      if (path) paths.push(path);
    }
    comboPickerIconWarmupPromise = Promise.allSettled([...new Set(paths)].map(preloadComboPickerIconPath));
    return comboPickerIconWarmupPromise;
  }

  function scheduleComboPickerIconWarmup() {
    const run = () => preloadComboPickerIcons();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      window.setTimeout(run, 250);
    }
  }

  function comboPickerIconSlot(kind, value) {
    const slot = document.createElement("span");
    slot.className = "trackPicker__iconSlot cbPickerIconSlot";
    slot.setAttribute("aria-hidden", "true");
    const src = comboPickerIconPath(kind, value);
    if (src && comboPickerReadyPaths.has(src)) {
      const img = document.createElement("img");
      img.className = "trackPicker__icon cbPickerIcon";
      img.src = src;
      img.alt = "";
      img.width = 24;
      img.height = 24;
      img.decoding = "async";
      img.loading = "eager";
      slot.appendChild(img);
      return slot;
    }
    if (src) preloadComboPickerIconPath(src);
    const fallback = document.createElement("span");
    fallback.className = "trackPicker__iconFallback";
    fallback.textContent = comboGlyphLetters(value);
    slot.appendChild(fallback);
    return slot;
  }

  function refreshComboPickers() {
    document.querySelectorAll(".cbComboPicker").forEach((root) => {
      const select = $(root.dataset.selectId || "");
      const valueEl = root.querySelector(".trackPicker__value");
      const trigger = root.querySelector(".trackPicker__trigger");
      if (!select || !valueEl || !trigger) return;
      const text = selectedComboPickerLabel(select, root.dataset.placeholder || "Select");
      valueEl.textContent = text;
      trigger.title = text;
      trigger.classList.toggle("is-placeholder", !select.value);
      const panel = root.querySelector(".trackPicker__panel");
      if (panel && !panel.hidden) renderComboPickerPanel(root);
    });
  }

  function closeComboPickers(exceptRoot = null) {
    if (!exceptRoot) activeComboLetterPicker = null;
    document.querySelectorAll(".cbComboPicker").forEach((root) => {
      if (exceptRoot && root === exceptRoot) return;
      root.classList.remove("is-open");
      root.querySelector(".trackPicker__trigger")?.setAttribute("aria-expanded", "false");
      const panel = root.querySelector(".trackPicker__panel");
      if (panel) panel.hidden = true;
    });
    if (!exceptRoot) {
      if (comboPickerBackdrop) comboPickerBackdrop.hidden = true;
      document.documentElement.classList.remove("trackPickerScrollLocked");
      document.body.classList.remove("trackPickerScrollLocked");
      document.body.style.top = "";
      if (comboPickerScrollY) window.scrollTo(0, comboPickerScrollY);
      comboPickerScrollY = 0;
    }
  }

  function alignComboPickerPanel(root) {
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
    const desiredWidth = Number(root.dataset.panelWidth || 760);
    const panelWidth = Math.min(isMobile ? 760 : desiredWidth, viewport.width - (margin * 2));
    panel.style.width = `${Math.round(panelWidth)}px`;
    panel.style.left = `${Math.round(viewport.offsetLeft + ((viewport.width - panelWidth) / 2))}px`;
    const rect = panel.getBoundingClientRect();
    const preferredTop = viewport.offsetTop + ((viewport.height - rect.height) / 2);
    const maxTop = viewport.offsetTop + viewport.height - rect.height - margin;
    panel.style.top = `${Math.round(Math.max(viewport.offsetTop + margin, Math.min(preferredTop, maxTop)))}px`;
  }

  function setComboLetterFilter(root, letter, focusLetter = false) {
    const select = $(root?.dataset?.selectId || "");
    const panel = root?.querySelector?.(".trackPicker__panel");
    if (!root || !select || !panel || panel.hidden) return false;
    const letters = comboPickerLetters(readComboPickerOptions(select));
    const requested = letter && letter !== "all" ? String(letter).trim().charAt(0).toUpperCase() : "all";
    const next = requested !== "all" && letters.includes(requested) ? requested : "all";
    if ((root.dataset.letterFilter || "all") === next) return false;
    root.dataset.letterFilter = next;
    renderComboPickerPanel(root);
    alignComboPickerPanel(root);
    if (focusLetter) {
      requestAnimationFrame(() => root.querySelector(`[data-letter-filter="${CSS.escape(next)}"]`)?.focus?.());
    }
    return true;
  }

  function resetComboLetterFilter(root, focusAll = true) {
    if (!root || (root.dataset.letterFilter || "all") === "all") return false;
    return setComboLetterFilter(root, "all", focusAll);
  }

  function applyComboLetterFilterFromPoint(clientX, clientY) {
    if (!activeComboLetterPicker) return;
    const target = document.elementFromPoint(clientX, clientY);
    const button = target?.closest?.("[data-letter-filter]");
    if (!button || !activeComboLetterPicker.querySelector(".trackPicker__panel")?.contains(button)) return;
    setComboLetterFilter(activeComboLetterPicker, button.dataset.letterFilter || "all");
  }

  function applyComboKeyboardLetterFilter(root, key) {
    const select = $(root?.dataset?.selectId || "");
    if (!root || !select) return false;
    const letter = String(key || "").trim().charAt(0).toUpperCase();
    if (!/^[A-Z0-9]$/.test(letter)) return false;
    if (!comboPickerLetters(readComboPickerOptions(select)).includes(letter)) return false;
    return setComboLetterFilter(root, letter, true);
  }

  function findOpenComboPickerRoot() {
    return Array.from(document.querySelectorAll(".cbComboPicker"))
      .find((root) => !root.querySelector(".trackPicker__panel")?.hidden) || null;
  }

  function renderComboPickerPanel(root) {
    const select = $(root.dataset.selectId || "");
    const panel = root.querySelector(".trackPicker__panel");
    if (!select || !panel) return;
    const kind = root.dataset.kind || "character";
    const options = readComboPickerOptions(select);
    const letters = comboPickerLetters(options);
    const currentLetter = letters.includes(root.dataset.letterFilter || "") ? root.dataset.letterFilter : "all";
    root.dataset.letterFilter = currentLetter;
    const visibleOptions = filterComboPickerOptions(options, currentLetter);
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
      setComboLetterFilter(root, button.dataset.letterFilter || "all");
    });
    rail.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const button = event.target.closest("[data-letter-filter]");
      if (!button) return;
      event.preventDefault();
      if ((root.dataset.letterFilter || "all") !== "all") {
        resetComboLetterFilter(root);
        return;
      }
      setComboLetterFilter(root, button.dataset.letterFilter || "all");
    });
    rail.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-letter-filter]")) return;
      event.preventDefault();
      activeComboLetterPicker = root;
      applyComboLetterFilterFromPoint(event.clientX, event.clientY);
    });

    const trackArea = document.createElement("div");
    trackArea.className = "trackPicker__trackArea";
    const groupsEl = document.createElement("div");
    groupsEl.className = "trackPicker__groups";
    for (const group of groupComboPickerOptions(visibleOptions)) {
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
        item.appendChild(comboPickerIconSlot(kind, option.value));
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

  function openComboPicker(root) {
    closeComboPickers(root);
    root.dataset.letterFilter = "all";
    preloadComboPickerIcons();
    renderComboPickerPanel(root);
    const panel = root.querySelector(".trackPicker__panel");
    const trigger = root.querySelector(".trackPicker__trigger");
    if (!panel || !trigger) return;
    panel.hidden = false;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    if (!comboPickerBackdrop) {
      comboPickerBackdrop = document.createElement("div");
      comboPickerBackdrop.className = "trackPickerBackdrop cbPickerBackdrop";
      comboPickerBackdrop.hidden = true;
      document.body.appendChild(comboPickerBackdrop);
      comboPickerBackdrop.addEventListener("click", () => closeComboPickers());
    }
    comboPickerScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add("trackPickerScrollLocked");
    document.body.classList.add("trackPickerScrollLocked");
    document.body.style.top = `-${comboPickerScrollY}px`;
    comboPickerBackdrop.hidden = false;
    alignComboPickerPanel(root);
  }

  function initComboPickers() {
    const configs = [
      { id: "cbCharacterSelect", kind: "character", placeholder: "Character", width: 760 },
      { id: "cbVehicleSelect", kind: "vehicle", placeholder: "Vehicle", width: 760 },
      { id: "cbCompareCharacterSelect", kind: "character", placeholder: "Compare character", width: 760 },
      { id: "cbCompareVehicleSelect", kind: "vehicle", placeholder: "Compare vehicle", width: 760 },
    ];
    for (const config of configs) {
      const select = $(config.id);
      if (!select || select.dataset.cbPickerReady === "1") continue;
      select.dataset.cbPickerReady = "1";
      select.classList.add("trackNativeSelect", "cbNativeSelect");
      const root = document.createElement("div");
      root.className = "trackPicker loungePicker cbComboPicker trackPicker--track";
      root.dataset.selectId = config.id;
      root.dataset.kind = config.kind;
      root.dataset.placeholder = config.placeholder;
      root.dataset.panelWidth = String(config.width || 760);
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

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        if (panel.hidden) openComboPicker(root);
        else closeComboPickers();
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!panel.hidden && (root.dataset.letterFilter || "all") !== "all") {
          resetComboLetterFilter(root);
          return;
        }
        if (panel.hidden) openComboPicker(root);
        else closeComboPickers();
      });
      panel.addEventListener("click", (event) => {
        event.stopPropagation();
        const optionButton = event.target.closest("[data-value]");
        if (!optionButton) return;
        select.value = optionButton.dataset.value || "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeComboPickers();
        refreshComboPickers();
        trigger.focus();
      });
      select.addEventListener("change", refreshComboPickers);
      const observer = new MutationObserver(refreshComboPickers);
      observer.observe(select, { childList: true, subtree: true, characterData: true });
      refreshComboPickers();
    }

    if (!comboPickerBindingsReady) {
      comboPickerBindingsReady = true;
      document.addEventListener("click", (event) => {
        if (event.target.closest(".cbComboPicker") || event.target.closest(".trackPicker__panel")) return;
        closeComboPickers();
      });
      document.addEventListener("pointermove", (event) => {
        if (!activeComboLetterPicker) return;
        event.preventDefault();
        applyComboLetterFilterFromPoint(event.clientX, event.clientY);
      }, { passive: false });
      document.addEventListener("pointerup", () => {
        activeComboLetterPicker = null;
      });
      document.addEventListener("pointercancel", () => {
        activeComboLetterPicker = null;
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (findOpenComboPickerRoot()) {
            event.preventDefault();
            event.stopPropagation();
          }
          closeComboPickers();
          return;
        }
        const openRoot = findOpenComboPickerRoot();
        if (!openRoot) return;
        const target = event.target;
        const isTextTarget = target?.matches?.("input, textarea, select") || target?.isContentEditable;
        if (isTextTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key.length === 1 && /^[a-z0-9]$/i.test(event.key)) {
          if (applyComboKeyboardLetterFilter(openRoot, event.key)) event.preventDefault();
          return;
        }
        if ((event.key === "Enter" || event.key === " ")
          && !target?.closest?.(".trackPicker__option, .trackPicker__trigger")
          && resetComboLetterFilter(openRoot)) {
          event.preventDefault();
        }
      });
      window.addEventListener("resize", () => closeComboPickers());
    }
  }

  function currentComboContext() {
    const selection = resolveSelection();
    const character = findCharacter(selection.character);
    const vehicle = findVehicle(selection.vehicle);
    if (!character || !vehicle) return null;
    return {
      selection,
      character,
      vehicle,
      combinedStats: buildCombinedStats(character, vehicle),
    };
  }

  function combineStats(leftStats, rightStats) {
    const result = {};
    for (const key of builderData.statKeys || []) {
      result[key] = Number(leftStats?.[key] || 0) + Number(rightStats?.[key] || 0);
    }
    return result;
  }

  function totalStats(stats) {
    return (builderData.statKeys || []).reduce((sum, key) => sum + Number(stats?.[key] || 0), 0);
  }

  function statMaximum(key) {
    return Number(builderData?.statMaxima?.[key] || 0);
  }

  function initFilterState() {
    filterState = {};
    for (const key of builderData?.statKeys || []) {
      filterState[key] = "";
    }
  }

  function statSignature(stats) {
    return (builderData.statKeys || []).map((key) => Number(stats?.[key] || 0)).join("|");
  }

  function buildCombinedStats(character, vehicle) {
    return combineStats(character?.stats || {}, vehicle?.stats || {});
  }

  function pickDefaultCompareSelection(baseSelection) {
    const normalizedBase = normalizeSelection(baseSelection);
    const vehicles = getVehicleOptions();
    const fallbackVehicle = vehicles.find((entry) => cleanText(entry.name) !== cleanText(normalizedBase.vehicle));
    if (fallbackVehicle) {
      return {
        character: normalizedBase.character,
        vehicle: fallbackVehicle.name,
      };
    }
    const characters = getCharacterOptions();
    const fallbackCharacter = characters.find((entry) => cleanText(entry.name) !== cleanText(normalizedBase.character));
    return {
      character: fallbackCharacter?.name || normalizedBase.character,
      vehicle: normalizedBase.vehicle,
    };
  }

  function ensureCompareSelection(baseSelection = currentSelection) {
    if (!compareSelection) {
      compareSelection = pickDefaultCompareSelection(baseSelection);
    }
    compareSelection = normalizeSelection(compareSelection);
    const base = normalizeSelection(baseSelection);
    if (!findCharacter(compareSelection.character) || !findVehicle(compareSelection.vehicle)) {
      compareSelection = pickDefaultCompareSelection(base);
    }
    return compareSelection;
  }

  function populateCompareSelects() {
    ensureCompareSelection(currentSelection);
    populateSelect("cbCompareCharacterSelect", getCharacterOptions(), compareSelection.character);
    populateSelect("cbCompareVehicleSelect", getVehicleOptions(), compareSelection.vehicle);
  }

  function invincibilityFrames(level) {
    const safeLevel = Math.max(0, Math.min(21, Math.round(Number(level) || 0)));
    return 100 + (safeLevel * 4);
  }

  function invincibilitySeconds(level) {
    return invincibilityFrames(level) / 60;
  }

  function precomputeSimilarCombos() {
    similarComboMap = new Map();
    allCombos = [];
    for (const character of builderData?.characters || []) {
      for (const vehicle of builderData?.vehicles || []) {
        const stats = buildCombinedStats(character, vehicle);
        const signature = statSignature(stats);
        const comboEntry = {
          characterName: character.name,
          characterSlug: character.slug || character.iconKey || "",
          characterClass: character.class,
          specialization: character.specialization,
          fullClass: character.fullClass,
          vehicleName: vehicle.name,
          vehicleSlug: vehicle.slug || vehicle.iconKey || "",
          vehicleType: vehicle.type,
          vehicleTag: vehicle.tag,
          vehicleClass: vehicle.vehicleClass,
          stats,
          statTotal: totalStats(stats),
          signature,
        };
        allCombos.push(comboEntry);
        const list = similarComboMap.get(signature) || [];
        list.push(comboEntry);
        similarComboMap.set(signature, list);
      }
    }
    for (const [signature, list] of similarComboMap.entries()) {
      similarComboMap.set(signature, list.sort((a, b) => {
        const charDiff = cleanText(a.characterName).localeCompare(cleanText(b.characterName), "en", { sensitivity: "base" });
        if (charDiff !== 0) return charDiff;
        return cleanText(a.vehicleName).localeCompare(cleanText(b.vehicleName), "en", { sensitivity: "base" });
      }));
    }
  }

  function findReferenceGroup(targetClass, specialization) {
    const groups = builderData?.characterGroups || [];
    const exact = groups.find(
      (entry) =>
        cleanText(entry.characterClass) === cleanText(targetClass) &&
        cleanText(entry.specialization) === cleanText(specialization)
    );
    if (exact) {
      return { ...exact, fallback: false };
    }
    const classAverage = (builderData?.characterClassAverages || []).find(
      (entry) => cleanText(entry.characterClass) === cleanText(targetClass)
    );
    if (classAverage) {
      return {
        ...classAverage,
        specialization: "Mixed",
        fullClass: `${targetClass} average`,
        fallback: true,
      };
    }
    return null;
  }

  function getCoinCurveValues(level) {
    const clamped = Math.max(0, Math.min(15, Math.round(Number(level) || 0)));
    const key = String(clamped);
    return (builderData?.coinCurveByLevel?.[key] || builderData?.coinCurveByLevel?.["0"] || []).map(Number);
  }

  function renderSourceMeta() {
    const meta = builderData?.meta;
    if (!meta) return;
    const generatedAt = meta.generatedAt ? new Date(meta.generatedAt) : null;
    const dateText = generatedAt && !Number.isNaN(generatedAt.getTime())
      ? generatedAt.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Unknown";
    setText("cbSourceMeta", `Sheet snapshot from ${dateText}. Source: Google Sheets stat archive.`);
  }

  function renderMeta(character, vehicle, combinedStats) {
    setText("cbMetaSize", character?.size || "-");
    setText("cbMetaClass", character?.class || "-");
    setText("cbMetaSpec", character?.specialization || "-");
    setText("cbMetaVehicleType", vehicle?.type || "-");
    setText("cbMetaVehicleClass", vehicle?.vehicleClass || "-");
    setText("cbMetaVehicleTag", vehicle?.tag || "-");
    setText("cbMetaTotal", fmtNumber(totalStats(combinedStats), 0));
    setText("cbMetaCoinCurve", `${fmtNumber(combinedStats.coinCurve, 0)} / ${fmtNumber(builderData?.statMaxima?.coinCurve, 0)}`);
  }

  function renderCurrentComboPreview(character, vehicle, combinedStats) {
    const iconHost = $("cbCurrentComboIcons");
    if (iconHost) {
      iconHost.innerHTML = `
        ${iconMarkup("character", character?.name || "Character", character?.slug || character?.iconKey || "", "cbGlyph--large")}
        ${iconMarkup("vehicle", vehicle?.name || "Vehicle", vehicle?.slug || vehicle?.iconKey || "", "cbGlyph--large")}
      `;
    }
    setText("cbCurrentComboTitle", `${character?.name || "-"} + ${vehicle?.name || "-"}`);
    setText(
      "cbCurrentComboMeta",
      `${character?.fullClass || character?.class || "-"} | ${character?.specialization || "-"} | ${vehicle?.vehicleClass || vehicle?.type || "-"} | Total ${fmtNumber(totalStats(combinedStats), 0)}`
    );
  }

  function renderInvincibilityDialog(combinedStats) {
    const level = Math.max(0, Math.min(statMaximum("invincibility"), Math.round(Number(combinedStats?.invincibility || 0))));
    const frames = invincibilityFrames(level);
    const seconds = invincibilitySeconds(level);
    setText("cbInvLevel", `${fmtNumber(level, 0)} / ${fmtNumber(statMaximum("invincibility"), 0)}`);
    setText("cbInvFrames", `${fmtNumber(frames, 0)} frames`);
    setText("cbInvSeconds", `${seconds.toFixed(3)} s`);
  }

  function renderGroupedStats(combinedStats) {
    const host = $("cbStatsGroups");
    if (!host) return;
    host.innerHTML = STAT_GROUPS.map((group) => {
      const groupTotal = group.stats.reduce((sum, key) => sum + Number(combinedStats?.[key] || 0), 0);
      const groupMax = group.stats.reduce((sum, key) => sum + Number(builderData?.statMaxima?.[key] || 0), 0);
      const rows = group.stats.map((key) => {
        const label = builderData.statLabels?.[key] || key;
        const value = Number(combinedStats?.[key] || 0);
        const max = Number(builderData?.statMaxima?.[key] || 0);
        const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
        const infoButton = key === "invincibility"
          ? `<button class="cbInfoBtn" id="btnOpenInvincibilityInfo" type="button" title="Show invincibility duration">!</button>`
          : "";
        return `
          <div class="cbStatRow">
            <div class="cbStatHead">
              <div class="cbStatLabelWrap">
                <div class="cbStatLabel">${escapeHtml(label)}</div>
                ${infoButton}
              </div>
              <div class="cbStatValue">${escapeHtml(fmtNumber(value, 0))} / ${escapeHtml(fmtNumber(max, 0))}</div>
            </div>
            <div class="cbStatBar"><div class="cbStatBarFill" style="width:${pct.toFixed(2)}%"></div></div>
          </div>
        `;
      }).join("");
      return `
        <div class="cbStatGroup ${group.className}">
          <div class="cbGroupHead">
            <div>
              <div class="cbGroupTitle">${escapeHtml(group.title)}</div>
              ${group.meta ? `<div class="cbGroupMeta">${escapeHtml(group.meta)}</div>` : ""}
            </div>
            <div class="cbGroupTotal">${escapeHtml(fmtNumber(groupTotal, 0))} / ${escapeHtml(fmtNumber(groupMax, 0))}</div>
          </div>
          <div class="cbGroupRows">
            ${rows}
          </div>
        </div>
      `;
    }).join("");
    renderInvincibilityDialog(combinedStats);
    $("btnOpenInvincibilityInfo")?.addEventListener("click", () => openDialog("cbInvincibilityDialog"));
  }

  function activeFilters() {
    return (builderData?.statKeys || [])
      .map((key) => {
        const raw = cleanText(filterState?.[key] ?? "");
        if (!raw) return null;
        const parsed = Math.max(0, Math.min(statMaximum(key), Math.round(Number(raw))));
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return {
          key,
          min: parsed,
          max: statMaximum(key),
          label: builderData?.statLabels?.[key] || key,
        };
      })
      .filter(Boolean);
  }

  function renderFilterControls() {
    const host = $("cbFilterGroups");
    if (!host) return;
    host.innerHTML = STAT_GROUPS.map((group) => {
      const rows = group.stats.map((key) => {
        const label = builderData?.statLabels?.[key] || key;
        const max = statMaximum(key);
        const rawValue = cleanText(filterState?.[key] ?? "");
        const value = Math.max(0, Math.min(max, Math.round(Number(rawValue) || 0)));
        const isActive = value > 0;
        const pct = isActive ? (value / Math.max(max, 1)) * 100 : 0;
        const ticks = Array.from({ length: max }, (_, index) => `<span${index < value ? " class=\"is-active\"" : ""}></span>`).join("");
        const barHelp = `${label}: click or swipe to set a minimum. Clear ignores this stat.`;
        return `
          <div class="cbStatRow cbFilterRow${isActive ? " is-active" : ""}" data-stat-row="${escapeHtml(key)}">
            <div class="cbStatHead">
              <div class="cbStatLabelWrap">
                <span class="cbStatLabel">${escapeHtml(label)}</span>
              </div>
              <button class="cbFilterClear${isActive ? "" : " is-hidden"}" data-stat-clear="${escapeHtml(key)}" type="button" aria-hidden="${isActive ? "false" : "true"}" tabindex="${isActive ? "0" : "-1"}" title="Clear ${escapeHtml(label)} filter">Clear</button>
              <div class="cbStatValue">
                <span class="cbFilterBarValue">${escapeHtml(isActive ? fmtNumber(value, 0) : "Any")}</span>
                <span class="cbFilterBarMax">/ ${escapeHtml(fmtNumber(max, 0))}</span>
              </div>
            </div>
            <button
              class="cbFilterBar${isActive ? " is-active" : ""}"
              type="button"
              role="slider"
              aria-label="${escapeHtml(label)} minimum"
              aria-valuemin="0"
              aria-valuemax="${escapeHtml(max)}"
              aria-valuenow="${escapeHtml(value)}"
              aria-valuetext="${escapeHtml(isActive ? `${value} of ${max}` : "Any")}"
              data-stat-key="${escapeHtml(key)}"
              data-stat-max="${escapeHtml(max)}"
              title="${escapeHtml(barHelp)}"
            >
              <span class="cbStatBar cbFilterBarTrack" aria-hidden="true">
                <span class="cbStatBarFill cbFilterBarFill" style="width:${pct.toFixed(2)}%"></span>
                <span class="cbFilterBarTicks">${ticks}</span>
              </span>
            </button>
          </div>
        `;
      }).join("");
      return `
        <div class="cbStatGroup cbFilterGroup ${group.className}">
          <div class="cbGroupHead">
            <div class="cbGroupTitle">${escapeHtml(group.title)}</div>
          </div>
          <div class="cbGroupRows cbFilterRows">${rows}</div>
        </div>
      `;
    }).join("");

    const updateFilterBar = (bar, parsed) => {
      const max = Math.max(1, Number(bar.dataset?.statMax) || statMaximum(bar.dataset?.statKey));
      const value = Math.max(0, Math.min(max, Math.round(Number(parsed) || 0)));
      const isActive = value > 0;
      const pct = isActive ? (value / max) * 100 : 0;
      const row = bar.closest(".cbFilterRow");
      const valueEl = row?.querySelector(".cbFilterBarValue");
      const fillEl = bar.querySelector(".cbFilterBarFill");
      const clearEl = row?.querySelector("[data-stat-clear]");
      row?.classList.toggle("is-active", isActive);
      bar.classList.toggle("is-active", isActive);
      bar.setAttribute("aria-valuenow", String(value));
      bar.setAttribute("aria-valuetext", isActive ? `${value} of ${max}` : "Any");
      if (valueEl) valueEl.textContent = isActive ? fmtNumber(value, 0) : "Any";
      if (fillEl) fillEl.style.width = `${pct.toFixed(2)}%`;
      if (clearEl) {
        clearEl.classList.toggle("is-hidden", !isActive);
        clearEl.setAttribute("aria-hidden", isActive ? "false" : "true");
        clearEl.tabIndex = isActive ? 0 : -1;
      }
      bar.querySelectorAll(".cbFilterBarTicks span").forEach((tick, index) => {
        tick.classList.toggle("is-active", index < value);
      });
    };

    const clearFilterPreview = (bar) => {
      const key = bar.dataset?.statKey;
      if (!key) return;
      const current = Math.max(0, Math.min(statMaximum(key), Math.round(Number(filterState?.[key] || 0))));
      const row = bar.closest(".cbFilterRow");
      row?.classList.remove("is-preview");
      updateFilterBar(bar, current);
    };

    const updateFilterPreview = (bar, value) => {
      const key = bar.dataset?.statKey;
      if (!key) return;
      const max = Math.max(1, Number(bar.dataset?.statMax) || statMaximum(key));
      const parsed = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
      const row = bar.closest(".cbFilterRow");
      const valueEl = row?.querySelector(".cbFilterBarValue");
      row?.classList.add("is-preview");
      if (valueEl) valueEl.textContent = fmtNumber(parsed, 0);
    };

    const valueFromPointer = (bar, event, dragRect = null) => {
      const key = bar.dataset?.statKey;
      const rect = dragRect || bar.getBoundingClientRect();
      const max = Math.max(1, Number(bar.dataset?.statMax) || statMaximum(key));
      const stepWidth = rect.width ? rect.width / max : 0;
      const raw = stepWidth ? (event.clientX - rect.left) / stepWidth : 0;
      return Math.max(0, Math.min(max, Math.round(raw)));
    };

    let filterResultsFrame = 0;
    const scheduleFilterResults = () => {
      if (filterResultsFrame) return;
      if (typeof requestAnimationFrame !== "function") {
        renderFilterResults();
        return;
      }
      filterResultsFrame = requestAnimationFrame(() => {
        filterResultsFrame = 0;
        renderFilterResults();
      });
    };

    const updateFilter = (key, value, bar = null) => {
      const max = statMaximum(key);
      const parsed = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
      const nextValue = Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
      if (filterState[key] === nextValue) return;
      filterState[key] = nextValue;
      if (bar) updateFilterBar(bar, parsed);
      scheduleFilterResults();
    };

    host.querySelectorAll(".cbFilterBar[data-stat-key]").forEach((bar) => {
      let activePointerId = null;
      let activeDragRect = null;
      const updateFromPointer = (event, dragRect = null) => {
        const key = bar.dataset?.statKey;
        if (!key) return;
        event.preventDefault();
        updateFilter(key, valueFromPointer(bar, event, dragRect), bar);
      };

      bar.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        clearFilterPreview(bar);
        activePointerId = event.pointerId;
        activeDragRect = bar.getBoundingClientRect();
        bar.setPointerCapture?.(event.pointerId);
        updateFromPointer(event, activeDragRect);
      });

      bar.addEventListener("pointermove", (event) => {
        if (activePointerId === event.pointerId) {
          updateFromPointer(event, activeDragRect);
          return;
        }
        if (activePointerId === null && event.pointerType === "mouse") {
          updateFilterPreview(bar, valueFromPointer(bar, event));
        }
      });

      const endPointer = (event) => {
        if (activePointerId !== event.pointerId) return;
        updateFromPointer(event, activeDragRect);
        activePointerId = null;
        activeDragRect = null;
        bar.releasePointerCapture?.(event.pointerId);
      };

      bar.addEventListener("pointerup", endPointer);
      bar.addEventListener("pointercancel", (event) => {
        if (activePointerId !== event.pointerId) return;
        activePointerId = null;
        activeDragRect = null;
        bar.releasePointerCapture?.(event.pointerId);
      });

      bar.addEventListener("pointerleave", (event) => {
        if (activePointerId === event.pointerId) return;
        clearFilterPreview(bar);
      });

      bar.addEventListener("click", (event) => {
        event.preventDefault();
      });

      bar.addEventListener("keydown", (event) => {
        const key = bar.dataset?.statKey;
        if (!key) return;
        const max = Math.max(1, Number(bar.dataset?.statMax) || statMaximum(key));
        const current = Math.max(0, Math.min(max, Math.round(Number(filterState?.[key] || 0))));
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          updateFilter(key, Math.min(max, current + 1), bar);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          updateFilter(key, Math.max(0, current - 1), bar);
        } else if (event.key === "Home" || event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          updateFilter(key, 0, bar);
        } else if (event.key === "End") {
          event.preventDefault();
          updateFilter(key, max, bar);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          updateFilter(key, current > 0 ? 0 : Math.ceil(max / 2), bar);
        }
      });
    });

    host.querySelectorAll("[data-stat-clear]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset?.statClear;
        if (!key) return;
        const bar = button.closest(".cbFilterRow")?.querySelector(".cbFilterBar[data-stat-key]");
        updateFilter(key, 0, bar);
      });
    });
  }

  function comboFilterSortScore(combo, filters) {
    return filters.reduce((sum, filter) => sum + Number(combo?.stats?.[filter.key] || 0), 0);
  }

  function renderFilterResults() {
    const host = $("cbFilterResultsList");
    const summary = $("cbFilterSummary");
    if (!host || !summary) return;

    const filters = activeFilters();
    if (!filters.length) {
      summary.textContent = "Add at least one minimum stat to see results.";
      host.innerHTML = `<div class="cbEmpty">Add at least one minimum stat to see results.</div>`;
      return;
    }

    const matches = allCombos
      .filter((combo) => filters.every((filter) => Number(combo?.stats?.[filter.key] || 0) >= filter.min))
      .sort((a, b) => {
        const scoreDiff = comboFilterSortScore(b, filters) - comboFilterSortScore(a, filters);
        if (scoreDiff !== 0) return scoreDiff;
        const totalDiff = Number(b.statTotal || 0) - Number(a.statTotal || 0);
        if (totalDiff !== 0) return totalDiff;
        const charDiff = cleanText(a.characterName).localeCompare(cleanText(b.characterName), "en", { sensitivity: "base" });
        if (charDiff !== 0) return charDiff;
        return cleanText(a.vehicleName).localeCompare(cleanText(b.vehicleName), "en", { sensitivity: "base" });
      });

    const filterText = filters.map((filter) => `${filter.label} ${filter.min}/${filter.max}`).join(" | ");
    summary.textContent = `${matches.length} combo${matches.length === 1 ? "" : "s"} match: ${filterText}.`;

    if (!matches.length) {
      host.innerHTML = `<div class="cbEmpty">No combos currently reach every minimum in this filter set.</div>`;
      return;
    }

    host.innerHTML = matches.map((entry) => {
      const statChips = filters.map((filter) => `
        <span class="cbResultStatChip">${escapeHtml(filter.label)} ${escapeHtml(fmtNumber(entry.stats?.[filter.key] || 0, 0))}/${escapeHtml(fmtNumber(filter.max, 0))}</span>
      `).join("");
      return `
        <div class="cbSimilarCard">
          <div class="cbSimilarMain">
            <div class="cbSimilarIcons">
              ${iconMarkup("character", entry.characterName, entry.characterSlug)}
              ${iconMarkup("vehicle", entry.vehicleName, entry.vehicleSlug)}
            </div>
            <div class="cbSimilarText">
              <div class="cbSimilarTitle">${escapeHtml(entry.characterName)} + ${escapeHtml(entry.vehicleName)}</div>
              <div class="cbSimilarMeta">${escapeHtml(entry.fullClass || entry.characterClass)} | ${escapeHtml(entry.vehicleClass || entry.vehicleType || "Vehicle")} | ${escapeHtml(entry.vehicleTag || "-")} | Total ${escapeHtml(fmtNumber(entry.statTotal, 0))}</div>
              <div class="cbResultStats">${statChips}</div>
            </div>
          </div>
          <div class="cbSimilarBadge">Match</div>
        </div>
      `;
    }).join("");
  }

  function renderSimilarButton(combinedStats) {
    const btn = $("btnOpenSimilarCombos");
    if (!btn) return;
    const matches = similarComboMap.get(statSignature(combinedStats)) || [];
    btn.disabled = matches.length === 0;
    btn.hidden = matches.length === 0;
    btn.classList.toggle("hidden", matches.length === 0);
    btn.classList.toggle("is-visible", matches.length > 0);
    btn.setAttribute("aria-label", matches.length ? `Show ${matches.length} similar combos` : "No similar combos");
    const valueEl = $("cbSimilarNoticeValue");
    if (valueEl) valueEl.textContent = fmtNumber(matches.length, 0);
  }

  function compareDiffClass(diff) {
    if (diff > 0) return "cbCompareDelta cbCompareDelta--up";
    if (diff < 0) return "cbCompareDelta cbCompareDelta--down";
    return "cbCompareDelta";
  }

  function formatDiff(diff) {
    if (!Number.isFinite(diff)) return "-";
    if (diff > 0) return `+${fmtNumber(diff, 0)}`;
    return fmtNumber(diff, 0);
  }

  function compareSummaryCard(label, value, meta, extraClass = "") {
    return `
      <div class="cbCompareSummaryCard ${escapeHtml(extraClass)}">
        <div class="cbCompareSummaryLabel">${escapeHtml(label)}</div>
        <div class="cbCompareSummaryValue">${escapeHtml(value)}</div>
        <div class="cbCompareSummaryMeta">${escapeHtml(meta)}</div>
      </div>
    `;
  }

  function compareMeterState(diff) {
    if (diff > 0) return "up";
    if (diff < 0) return "down";
    return "equal";
  }

  function compareDisplayValue(key, value) {
    const safe = Number(value || 0);
    if (key === "invincibility") return `Lv ${fmtNumber(safe, 0)}`;
    if (key === "coinCurve") return fmtNumber(safe, 2);
    return fmtNumber(safe, 0);
  }

  function compareRowMarkup(key, label, baseValue, compareValue) {
    const safeBase = Number(baseValue || 0);
    const safeCompare = Number(compareValue || 0);
    const diff = safeCompare - safeBase;
    const state = compareMeterState(diff);
    const max = Math.max(1, statMaximum(key), safeBase, safeCompare);
    const basePct = Math.max(0, Math.min(100, (safeBase / max) * 100));
    const comparePct = Math.max(0, Math.min(100, (safeCompare / max) * 100));
    const deltaLeft = Math.min(basePct, comparePct);
    const deltaWidth = Math.abs(comparePct - basePct);
    const rowHelp = `${label}: selected ${compareDisplayValue(key, safeBase)}, compare ${compareDisplayValue(key, safeCompare)}, delta ${formatDiff(diff)}.`;

    return `
      <div class="cbCompareRow cbCompareRow--${escapeHtml(state)}" title="${escapeHtml(rowHelp)}">
        <div class="cbCompareRowTop">
          <div class="cbCompareRowLabel">${escapeHtml(label)}</div>
          <div class="${compareDiffClass(diff)}">${escapeHtml(formatDiff(diff))}</div>
        </div>
        <div class="cbCompareMeter">
          <div class="cbCompareMeterTrack"></div>
          <div class="cbCompareMeterBase" style="width:${basePct.toFixed(2)}%"></div>
          <div class="cbCompareMeterCompare cbCompareMeterCompare--${escapeHtml(state)}" style="width:${comparePct.toFixed(2)}%"></div>
          <div class="cbCompareMeterDelta cbCompareMeterDelta--${escapeHtml(state)}" style="left:${deltaLeft.toFixed(2)}%; width:${deltaWidth.toFixed(2)}%"></div>
          <div class="cbCompareMeterMarker cbCompareMeterMarker--base" style="left:${basePct.toFixed(2)}%"></div>
          <div class="cbCompareMeterMarker cbCompareMeterMarker--compare cbCompareMeterMarker--${escapeHtml(state)}" style="left:${comparePct.toFixed(2)}%"></div>
        </div>
        <div class="cbCompareRowValues">
          <div class="cbCompareValueCard">
            <div class="cbCompareValueLabel">Selected</div>
            <div class="cbCompareValueNumber">${escapeHtml(compareDisplayValue(key, safeBase))}</div>
          </div>
          <div class="cbCompareValueCard cbCompareValueCard--target">
            <div class="cbCompareValueLabel">Compare</div>
            <div class="cbCompareValueNumber">${escapeHtml(compareDisplayValue(key, safeCompare))}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCompareDialog() {
    const baseContext = currentComboContext();
    const currentCard = $("cbCompareCurrentCard");
    const targetCard = $("cbCompareTargetCard");
    const summaryHost = $("cbCompareSummary");
    const groupsHost = $("cbCompareGroups");
    if (!baseContext || !currentCard || !targetCard || !summaryHost || !groupsHost) return;

    compareSelection = normalizeSelection({
      character: $("cbCompareCharacterSelect")?.value || compareSelection?.character,
      vehicle: $("cbCompareVehicleSelect")?.value || compareSelection?.vehicle,
    });
    ensureCompareSelection(baseContext.selection);

    const compareCharacter = findCharacter(compareSelection.character);
    const compareVehicle = findVehicle(compareSelection.vehicle);
    if (!compareCharacter || !compareVehicle) {
      summaryHost.innerHTML = `<div class="cbEmpty">Compare combo could not be resolved.</div>`;
      groupsHost.innerHTML = `<div class="cbEmpty">Compare combo could not be resolved.</div>`;
      return;
    }

    const compareStats = buildCombinedStats(compareCharacter, compareVehicle);

    currentCard.innerHTML = `
      <div class="cbCompareComboLabel">Selected combo</div>
      <div class="cbCompareComboMain">
        <div class="cbCompareComboIcons">
          ${iconMarkup("character", baseContext.character.name, baseContext.character.slug || baseContext.character.iconKey || "", "cbGlyph--large")}
          ${iconMarkup("vehicle", baseContext.vehicle.name, baseContext.vehicle.slug || baseContext.vehicle.iconKey || "", "cbGlyph--large")}
        </div>
        <div class="cbCompareComboText">
          <div class="cbCompareComboTitle">${escapeHtml(baseContext.character.name)} + ${escapeHtml(baseContext.vehicle.name)}</div>
          <div class="cbCompareComboMeta">${escapeHtml(baseContext.character.fullClass || baseContext.character.class || "-")} | ${escapeHtml(baseContext.vehicle.vehicleClass || baseContext.vehicle.type || "-")} | Total ${escapeHtml(fmtNumber(totalStats(baseContext.combinedStats), 0))}</div>
        </div>
      </div>
    `;

    targetCard.innerHTML = `
      <div class="cbCompareComboLabel">Compare combo</div>
      <div class="cbCompareComboMain">
        <div class="cbCompareComboIcons">
          ${iconMarkup("character", compareCharacter.name, compareCharacter.slug || compareCharacter.iconKey || "", "cbGlyph--large")}
          ${iconMarkup("vehicle", compareVehicle.name, compareVehicle.slug || compareVehicle.iconKey || "", "cbGlyph--large")}
        </div>
        <div class="cbCompareComboText">
          <div class="cbCompareComboTitle">${escapeHtml(compareCharacter.name)} + ${escapeHtml(compareVehicle.name)}</div>
          <div class="cbCompareComboMeta">${escapeHtml(compareCharacter.fullClass || compareCharacter.class || "-")} | ${escapeHtml(compareVehicle.vehicleClass || compareVehicle.type || "-")} | Total ${escapeHtml(fmtNumber(totalStats(compareStats), 0))}</div>
        </div>
      </div>
    `;

    const totalDelta = totalStats(compareStats) - totalStats(baseContext.combinedStats);
    const coinDelta = Number(compareStats.coinCurve || 0) - Number(baseContext.combinedStats.coinCurve || 0);
    const statEntries = (builderData?.statKeys || []).map((key) => ({
      key,
      label: builderData?.statLabels?.[key] || key,
      diff: Number(compareStats?.[key] || 0) - Number(baseContext.combinedStats?.[key] || 0),
    }));
    const topGain = [...statEntries].sort((a, b) => b.diff - a.diff)[0];
    const topLoss = [...statEntries].sort((a, b) => a.diff - b.diff)[0];

    summaryHost.innerHTML = [
      compareSummaryCard("Stat total delta", formatDiff(totalDelta), totalDelta === 0 ? "Same full total" : "Compare minus selected", totalDelta > 0 ? "cbCompareSummaryCard--up" : totalDelta < 0 ? "cbCompareSummaryCard--down" : ""),
      compareSummaryCard("Coin curve delta", formatDiff(coinDelta), `Selected ${fmtNumber(baseContext.combinedStats.coinCurve, 0)} vs compare ${fmtNumber(compareStats.coinCurve, 0)}`, coinDelta > 0 ? "cbCompareSummaryCard--up" : coinDelta < 0 ? "cbCompareSummaryCard--down" : ""),
      compareSummaryCard("Biggest gain", topGain?.label || "-", topGain ? formatDiff(topGain.diff) : "-", topGain?.diff > 0 ? "cbCompareSummaryCard--up" : ""),
      compareSummaryCard("Biggest loss", topLoss?.label || "-", topLoss ? formatDiff(topLoss.diff) : "-", topLoss?.diff < 0 ? "cbCompareSummaryCard--down" : ""),
    ].join("");

    groupsHost.innerHTML = STAT_GROUPS.map((group) => {
      const rows = group.stats.map((key) => {
        const label = builderData?.statLabels?.[key] || key;
        const baseValue = Number(baseContext.combinedStats?.[key] || 0);
        const compareValue = Number(compareStats?.[key] || 0);
        return compareRowMarkup(key, label, baseValue, compareValue);
      }).join("");
      return `
        <div class="cbCompareGroup ${group.className}">
          <div class="cbCompareGroupHead">
            <div>
              <div class="cbCompareGroupTitle">${escapeHtml(group.title)}</div>
              ${group.meta ? `<div class="cbCompareGroupMeta">${escapeHtml(group.meta)}</div>` : ""}
            </div>
          </div>
          <div class="cbCompareRows">
            ${rows}
          </div>
        </div>
      `;
    }).join("");
  }

  function openCompareDialog() {
    ensureCompareSelection(currentSelection);
    populateCompareSelects();
    renderCompareDialog();
    openDialog("cbCompareDialog");
  }

  function renderSimilarDialog(character, vehicle, combinedStats) {
    const signature = statSignature(combinedStats);
    const matches = [...(similarComboMap.get(signature) || [])];
    const host = $("cbSimilarList");
    if (!host) return;

    const selectedKey = `${cleanText(character.name)}|${cleanText(vehicle.name)}`;
    matches.sort((a, b) => {
      const aSelected = `${cleanText(a.characterName)}|${cleanText(a.vehicleName)}` === selectedKey ? 1 : 0;
      const bSelected = `${cleanText(b.characterName)}|${cleanText(b.vehicleName)}` === selectedKey ? 1 : 0;
      return bSelected - aSelected;
    });

    setText("cbSimilarTitle", `${matches.length} exact match${matches.length === 1 ? "" : "es"}`);

    if (!matches.length) {
      host.innerHTML = `<div class="cbEmpty">No similar combos found for the current build.</div>`;
      return;
    }

    host.innerHTML = matches.map((entry) => {
      const isActive = cleanText(entry.characterName) === cleanText(character.name) && cleanText(entry.vehicleName) === cleanText(vehicle.name);
      return `
        <div class="cbSimilarCard${isActive ? " cbSimilarCard--active" : ""}">
          <div class="cbSimilarMain">
            <div class="cbSimilarIcons">
              ${iconMarkup("character", entry.characterName, entry.characterSlug)}
              ${iconMarkup("vehicle", entry.vehicleName, entry.vehicleSlug)}
            </div>
            <div class="cbSimilarText">
              <div class="cbSimilarTitle">${escapeHtml(entry.characterName)} + ${escapeHtml(entry.vehicleName)}</div>
              <div class="cbSimilarMeta">${escapeHtml(entry.fullClass || entry.characterClass)} | ${escapeHtml(entry.vehicleClass || entry.vehicleType || "Vehicle")}</div>
            </div>
          </div>
          <div class="cbSimilarBadge">${isActive ? "Current" : "Exact match"}</div>
        </div>
      `;
    }).join("");
  }

  function referenceLabel(reference) {
    if (!reference) return "-";
    if (reference.fallback) {
      return `${reference.characterClass} average`;
    }
    return reference.fullClass || `${reference.characterClass} ${reference.specialization}`;
  }

  function renderReferenceCards(selectedStats, featherReference, heavyReference, vehicle) {
    const selectedCurve = Number(selectedStats.coinCurve || 0);
    setText("cbSelectedCurveValue", `${fmtNumber(selectedCurve, 0)} / ${fmtNumber(builderData?.statMaxima?.coinCurve, 0)}`);
    setText("cbSelectedCurveMeta", "");

    const featherCurve = Number(featherReference?.stats?.coinCurve || 0) + Number(vehicle?.stats?.coinCurve || 0);
    const heavyCurve = Number(heavyReference?.stats?.coinCurve || 0) + Number(vehicle?.stats?.coinCurve || 0);

    setText("cbFeatherCurveValue", `${fmtNumber(featherCurve, 0)} / ${fmtNumber(builderData?.statMaxima?.coinCurve, 0)}`);
    setText("cbFeatherCurveMeta", "");
    setText("cbHeavyCurveValue", `${fmtNumber(heavyCurve, 0)} / ${fmtNumber(builderData?.statMaxima?.coinCurve, 0)}`);
    setText("cbHeavyCurveMeta", "");
  }

  function applyComboSelection(characterName, vehicleName) {
    const characterSelect = $("cbCharacterSelect");
    const vehicleSelect = $("cbVehicleSelect");
    if (!characterSelect || !vehicleSelect) return;
    characterSelect.value = canonicalName(characterName, CHARACTER_NAME_ALIASES);
    vehicleSelect.value = canonicalName(vehicleName, VEHICLE_NAME_ALIASES);
    renderBuilder();
    $("cbCurrentCombo")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function chooseGroupCombo(group, { characterName = "", vehicleName = "" } = {}) {
    const safeCharacters = (group?.characters || []).map((name) => canonicalName(name, CHARACTER_NAME_ALIASES));
    const safeVehicles = (group?.vehicles || []).map((name) => canonicalName(name, VEHICLE_NAME_ALIASES));
    const current = resolveSelection();
    const nextCharacter = canonicalName(characterName || "", CHARACTER_NAME_ALIASES) || (safeCharacters.includes(current.character) ? current.character : safeCharacters[0]);
    const nextVehicle = canonicalName(vehicleName || "", VEHICLE_NAME_ALIASES) || (safeVehicles.includes(current.vehicle) ? current.vehicle : safeVehicles[0]);
    if (!nextCharacter || !nextVehicle) return null;
    return { character: nextCharacter, vehicle: nextVehicle };
  }

  function findComboEntry(characterName, vehicleName) {
    const normalizedCharacter = canonicalName(characterName, CHARACTER_NAME_ALIASES);
    const normalizedVehicle = canonicalName(vehicleName, VEHICLE_NAME_ALIASES);
    return allCombos.find((entry) =>
      cleanText(entry.characterName) === cleanText(normalizedCharacter) &&
      cleanText(entry.vehicleName) === cleanText(normalizedVehicle)
    ) || null;
  }

  function renderOnlineMetaTiers() {
    const host = $("cbMetaTierGrid");
    if (!host) return;
    const rows = ONLINE_META_GROUPS.map((group) => {
      const entries = [];
      for (const characterName of group.characters) {
        for (const vehicleName of group.vehicles) {
          const combo = findComboEntry(characterName, vehicleName);
          if (combo) entries.push(combo);
        }
      }
      return { ...group, entries };
    }).filter((group) => group.entries.length);

    if (!rows.length) {
      host.innerHTML = `<div class="cbEmpty">No S-rank snapshot available right now.</div>`;
      return;
    }

    host.innerHTML = rows.map((group) => `
      <section class="cbMetaTier cbMetaTier--row">
        <div class="cbMetaTierHead cbMetaTierHead--split">
          <div>
            <div class="cbMetaTierLabel">${escapeHtml(group.label)}</div>
          </div>
        </div>
        <div class="cbMetaGroupRow">
          <div class="cbMetaGroupBlock">
            <div class="cbMetaGroupLabel">Characters</div>
            <div class="cbMetaGroupIcons">
              ${group.characters.map((characterName) => {
                const match = group.entries.find((entry) => cleanText(entry.characterName) === cleanText(canonicalName(characterName, CHARACTER_NAME_ALIASES)));
                if (!match) return "";
                return `
                  <button class="cbMetaIconBtn" type="button" title="${escapeHtml(match.characterName)}" data-meta-group="${escapeHtml(group.tag)}" data-meta-character="${escapeHtml(match.characterName)}">
                    ${iconMarkup("character", match.characterName, match.characterSlug, "cbGlyph--large")}
                  </button>
                `;
              }).join("")}
            </div>
          </div>
          <div class="cbMetaGroupBlock cbMetaGroupBlock--vehicles">
            <div class="cbMetaGroupLabel">Karts / Bikes</div>
            <div class="cbMetaGroupIcons">
              ${group.vehicles.map((vehicleName) => {
                const match = group.entries.find((entry) => cleanText(entry.vehicleName) === cleanText(canonicalName(vehicleName, VEHICLE_NAME_ALIASES)));
                if (!match) return "";
                return `
                  <button class="cbMetaIconBtn cbMetaIconBtn--vehicle" type="button" title="${escapeHtml(match.vehicleName)}" data-meta-group="${escapeHtml(group.tag)}" data-meta-vehicle="${escapeHtml(match.vehicleName)}">
                    ${iconMarkup("vehicle", match.vehicleName, match.vehicleSlug, "cbGlyph--large")}
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      </section>
    `).join("");

    host.querySelectorAll("[data-meta-character]").forEach((button) => {
      button.addEventListener("click", () => {
        const group = rows.find((entry) => entry.tag === button.dataset.metaGroup);
        const combo = chooseGroupCombo(group, { characterName: button.dataset.metaCharacter });
        if (combo) applyComboSelection(combo.character, combo.vehicle);
      });
    });

    host.querySelectorAll("[data-meta-vehicle]").forEach((button) => {
      button.addEventListener("click", () => {
        const group = rows.find((entry) => entry.tag === button.dataset.metaGroup);
        const combo = chooseGroupCombo(group, { vehicleName: button.dataset.metaVehicle });
        if (combo) applyComboSelection(combo.character, combo.vehicle);
      });
    });
  }

  function renderCoinChart(character, vehicle, selectedStats, featherReference, heavyReference) {
    const labels = builderData.coinCounts || [];
    const selectedCurve = getCoinCurveValues(selectedStats.coinCurve);
    const featherStats = combineStats(featherReference?.stats || {}, vehicle?.stats || {});
    const heavyStats = combineStats(heavyReference?.stats || {}, vehicle?.stats || {});
    const featherCurve = getCoinCurveValues(featherStats.coinCurve);
    const heavyCurve = getCoinCurveValues(heavyStats.coinCurve);

    renderReferenceCards(selectedStats, featherReference, heavyReference, vehicle);
    renderOnlineMetaTiers();

    const ctx = $("cbCoinChart");
    if (!ctx || !window.Chart) return;
    if (coinChart) coinChart.destroy();

    coinChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `${character.name} + ${vehicle.name}`,
            data: selectedCurve,
            borderColor: REFERENCE_COLORS.selected.stroke,
            backgroundColor: REFERENCE_COLORS.selected.fill,
            pointRadius: 2.5,
            pointHoverRadius: 4,
            borderWidth: 3,
            tension: 0.22,
          },
          {
            label: "Feather reference",
            data: featherCurve,
            borderColor: REFERENCE_COLORS.feather.stroke,
            backgroundColor: REFERENCE_COLORS.feather.fill,
            pointRadius: 2,
            pointHoverRadius: 3.5,
            borderDash: [8, 5],
            borderWidth: 2,
            tension: 0.22,
          },
          {
            label: "Heavy reference",
            data: heavyCurve,
            borderColor: REFERENCE_COLORS.heavy.stroke,
            backgroundColor: REFERENCE_COLORS.heavy.fill,
            pointRadius: 2,
            pointHoverRadius: 3.5,
            borderDash: [8, 5],
            borderWidth: 2,
            tension: 0.22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            labels: {
              color: "#d7deea",
              boxWidth: 18,
              boxHeight: 3,
              usePointStyle: false,
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${fmtPercent(context.parsed.y)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#a8b4ca" },
            title: {
              display: true,
              text: "Coins",
              color: "#a8b4ca",
              font: { weight: "700" },
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: 5.1,
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: {
              color: "#a8b4ca",
              callback(value) {
                return `${value}%`;
              },
            },
            title: {
              display: true,
              text: "Speed gain",
              color: "#a8b4ca",
              font: { weight: "700" },
            },
          },
        },
      },
    });
  }

  function resolveSelection() {
    const charSelect = $("cbCharacterSelect");
    const vehicleSelect = $("cbVehicleSelect");
    currentSelection = {
      character: canonicalName(charSelect?.value, CHARACTER_NAME_ALIASES) || DEFAULT_SELECTION.character,
      vehicle: canonicalName(vehicleSelect?.value, VEHICLE_NAME_ALIASES) || DEFAULT_SELECTION.vehicle,
    };
    saveStoredSelection(currentSelection);
    return currentSelection;
  }

  function renderBuilder() {
    if (!builderData) return;
    const selection = resolveSelection();
    const character = findCharacter(selection.character);
    const vehicle = findVehicle(selection.vehicle);
    if (!character || !vehicle) {
      setStatus("Combo Builder selection could not be resolved.", false);
      return;
    }

    setStatus("", true);
    const combinedStats = buildCombinedStats(character, vehicle);
    const featherReference = findReferenceGroup("Feather", character.specialization);
    const heavyReference = findReferenceGroup("Heavy", character.specialization);

    renderCurrentComboPreview(character, vehicle, combinedStats);
    renderMeta(character, vehicle, combinedStats);
    renderGroupedStats(combinedStats);
    renderSimilarButton(combinedStats);
    renderSimilarDialog(character, vehicle, combinedStats);
    renderCoinChart(character, vehicle, combinedStats, featherReference, heavyReference);
    if ($("cbCompareDialog")?.open) {
      populateCompareSelects();
      renderCompareDialog();
    }
  }

  function bindEvents() {
    $("cbCharacterSelect")?.addEventListener("change", renderBuilder);
    $("cbVehicleSelect")?.addEventListener("change", renderBuilder);
    $("btnOpenComboFilters")?.addEventListener("click", () => openDialog("cbFilterDialog"));
    $("btnOpenComboCompare")?.addEventListener("click", openCompareDialog);
    $("btnCloseComboCompare")?.addEventListener("click", () => closeDialog("cbCompareDialog"));
    $("cbCompareDialog")?.addEventListener("click", (event) => {
      if (event.target === $("cbCompareDialog")) closeDialog("cbCompareDialog");
    });
    $("cbCompareCharacterSelect")?.addEventListener("change", renderCompareDialog);
    $("cbCompareVehicleSelect")?.addEventListener("change", renderCompareDialog);
    $("btnCloseComboFilters")?.addEventListener("click", () => closeDialog("cbFilterDialog"));
    $("cbFilterDialog")?.addEventListener("click", (event) => {
      if (event.target === $("cbFilterDialog")) closeDialog("cbFilterDialog");
    });
    $("btnClearComboFilters")?.addEventListener("click", () => {
      initFilterState();
      renderFilterControls();
      renderFilterResults();
    });
    $("btnOpenSimilarCombos")?.addEventListener("click", () => openDialog("cbSimilarDialog"));
    $("btnCloseSimilarCombos")?.addEventListener("click", () => closeDialog("cbSimilarDialog"));
    $("cbSimilarDialog")?.addEventListener("click", (event) => {
      if (event.target === $("cbSimilarDialog")) closeDialog("cbSimilarDialog");
    });
    $("btnCloseInvincibilityDialog")?.addEventListener("click", () => closeDialog("cbInvincibilityDialog"));
    $("cbInvincibilityDialog")?.addEventListener("click", (event) => {
      if (event.target === $("cbInvincibilityDialog")) closeDialog("cbInvincibilityDialog");
    });
  }

  async function init() {
    try {
      await loadData();
      precomputeSimilarCombos();
      initFilterState();
      renderSourceMeta();
      currentSelection = readStoredSelection();
      populateSelect("cbCharacterSelect", getCharacterOptions(), currentSelection.character);
      populateSelect("cbVehicleSelect", getVehicleOptions(), currentSelection.vehicle);
      initComboPickers();
      scheduleComboPickerIconWarmup();
      renderFilterControls();
      renderFilterResults();
      bindEvents();
      renderBuilder();
    } catch (error) {
      setStatus(`Combo Builder failed to load: ${error.message || error}`, false);
      const statsGrid = $("cbStatsGroups");
      if (statsGrid) statsGrid.innerHTML = `<div class="cbEmpty">Combo Builder data is currently unavailable.</div>`;
      setText("cbSourceMeta", "Builder data could not be loaded.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

