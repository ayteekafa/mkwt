(() => {
  const DATA_URL = "item_distribution_data.json";
  const DEFAULT_MODE = "12p";
  const $ = (id) => document.getElementById(id);

  let distributionData = null;
  let currentMode = DEFAULT_MODE;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function loadData() {
    return fetch(DATA_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        distributionData = data;
      });
  }

  function itemRecord(itemId) {
    return distributionData?.items?.[itemId] || null;
  }

  function modeRecord(mode) {
    return distributionData?.modes?.[mode] || null;
  }

  function iconChipMarkup(itemId) {
    const item = itemRecord(itemId);
    if (!item) return "";
    const isWide = itemId === "dash_food";
    return `
      <div class="itemDistIconChip${isWide ? " itemDistIconChip--wide" : ""}" title="${escapeHtml(item.name)}" aria-label="${escapeHtml(item.name)}">
        <img src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.name)}" loading="eager" />
      </div>
    `;
  }

  function renderOverview() {
    const mode = modeRecord(currentMode);
    if (!mode) return;
    const notes = distributionData?.source?.notes || [];
    const source = distributionData?.source || {};
    const sourceMeta = $("itemDistSourceMeta");
    const overviewTitle = $("itemDistOverviewTitle");
    const overviewSubtitle = $("itemDistOverviewSubtitle");
    const bandCount = $("itemDistBandCount");

    if (sourceMeta) {
      const metaParts = [source.scope, notes[0]].filter(Boolean);
      sourceMeta.innerHTML = `
        ${metaParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('<span>&middot;</span>')}
      `;
    }
    if (overviewTitle) overviewTitle.textContent = mode.title || "-";
    if (overviewSubtitle) overviewSubtitle.textContent = mode.subtitle || "-";
    if (bandCount) bandCount.textContent = String((mode.bands || []).length);
  }

  function renderBands() {
    const mode = modeRecord(currentMode);
    const grid = $("itemDistBandGrid");
    if (!grid || !mode) return;
    grid.innerHTML = (mode.bands || []).map((band) => {
      return `
        <article class="itemDistBandCard">
          <div class="itemDistBandHead">
            <div class="itemDistBandLabel">${escapeHtml(band.label)}</div>
          </div>
          <div class="itemDistIconList">
            ${band.items.map(iconChipMarkup).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function setMode(mode) {
    if (!distributionData?.modes?.[mode]) return;
    currentMode = mode;
    const is12 = mode === "12p";
    $("btnItemMode12")?.classList.toggle("active", is12);
    $("btnItemMode24")?.classList.toggle("active", !is12);
    $("btnItemMode12")?.setAttribute("aria-selected", String(is12));
    $("btnItemMode24")?.setAttribute("aria-selected", String(!is12));
    renderOverview();
    renderBands();
  }

  function bindEvents() {
    $("btnItemMode12")?.addEventListener("click", () => setMode("12p"));
    $("btnItemMode24")?.addEventListener("click", () => setMode("24p"));
  }

  async function init() {
    try {
      await loadData();
      bindEvents();
      setMode(DEFAULT_MODE);
    } catch (error) {
      const message = `Item Distribution failed to load: ${error.message || error}`;
      const targets = ["itemDistBandGrid"];
      targets.forEach((id) => {
        const el = $(id);
        if (el) el.innerHTML = `<div class="cbEmpty">${escapeHtml(message)}</div>`;
      });
      $("itemDistSourceMeta") && ($("itemDistSourceMeta").textContent = message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
