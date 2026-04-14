// ===== Suggestion (next Intermission start) =====
function getLastSuggestedTrack() {
  try { return localStorage.getItem('mkwt_last_next_start') || ''; } catch(e) { return ''; }
}

// Only special-case requested by user:
// - Rainbow Road is never suggested as next Intermission start
// - If Rainbow Road was the last selected/played target track, suggest Peach Stadium instead
function normalizeSuggestedStart(name){
  const n = (name || "").trim();
  if (!n) return "";
  const lower = n.toLowerCase();
  if (lower.startsWith("rainbow road")) return "Peach Stadium";
  if (lower === "rainbow road") return "Peach Stadium";
  return n;
}

function setLastSuggestedTrack(name) {
  try {
    const normalized = normalizeSuggestedStart(name);
    if (!normalized) { localStorage.removeItem('mkwt_last_next_start'); return; }
    localStorage.setItem('mkwt_last_next_start', String(normalized));
  } catch(e) {}
}

// Store the timestamp of the newest match so we can decide whether a suggestion is
// fresh enough to auto-fill (default: 10 minutes).
function getLastMatchTimestamp(){
  try {
    const raw = localStorage.getItem('mkwt_last_match_ts');
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch(e) { return 0; }
}

function setLastMatchTimestamp(ts){
  try {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) { localStorage.removeItem('mkwt_last_match_ts'); return; }
    localStorage.setItem('mkwt_last_match_ts', String(Math.floor(n)));
  } catch(e) {}
}

function isLastMatchFresh(maxAgeMs){
  const ms = (typeof maxAgeMs === 'number' ? maxAgeMs : 10 * 60 * 1000);
  const t = getLastMatchTimestamp();
  if (!t) return false;
  return (Date.now() - t) <= ms;
}

function getFreshSuggestedNextStart(){
  // Only auto-fill if the newest match is recent enough (default: 10 minutes).
  if (!isLastMatchFresh()) return '';
  return (getSuggestedNextStart?.() || '');
}

function autoPrefillIntermissionStartIfFresh(){
  try {
    const startEl = document.getElementById('intermission');
    const endEl   = document.getElementById('track');
    if (!startEl || !endEl) return;
    // Only prefill if the user hasn't already chosen something.
    if ((startEl.value || '') !== '') return;
    const suggested = getFreshSuggestedNextStart();
    if (!suggested) return;
    // Only if the option exists in the current allowed list.
    const opt = startEl.querySelector(`option[value="${CSS.escape(suggested)}"]`);
    if (!opt) return;
    startEl.value = suggested;
    // Trigger existing filtering so End adapts automatically.
    startEl.dispatchEvent(new Event('change', { bubbles: true }));
  } catch(e) {}
}


function getSuggestedNextStart() {
  // Always return the normalized suggestion (never Rainbow Road)
  return normalizeSuggestedStart(getLastSuggestedTrack());
}

// If a "suggested next start" exists AND it is currently allowed,
// we move that track to the very top of the Intermission-start dropdown (right under the placeholder).
// No special values, no prefixes, no extra "Suggestion" option.
function applyStartSuggestionOrdering(selectEl){
  try {
    const isStartSelect = (selectEl?.id === 'intermission' || selectEl?.id === 'editIntermission');
    if (!isStartSelect) return;
    const suggested = (getSuggestedNextStart?.() || '');
    if (!suggested) return;
    const opt = selectEl.querySelector(`option[value="${CSS.escape(suggested)}"]`);
    if (!opt) return; // suggested not in current allowed list
    // Move right after placeholder (index 1)
    const placeholderOpt = selectEl.querySelector('option[value=""]');
    if (!placeholderOpt) return;
    if (opt === placeholderOpt.nextSibling) return;
    selectEl.insertBefore(opt, placeholderOpt.nextSibling);
  } catch(e) {}
}

// Refresh the *displayed* Suggestion option in the Intermission start dropdown
// without resetting the user's current selections or the existing filter logic.
function refreshSuggestionOptionInStartSelect(selectEl){
  // Legacy name kept to avoid touching existing call sites.
  // Ensures EXACTLY ONE highlighted suggested option (★) at the top (if allowed) without changing values.
  try {
    const isStartSelect = (selectEl?.id === 'intermission' || selectEl?.id === 'editIntermission');
    if (!isStartSelect) return;

    const suggested = (getSuggestedNextStart?.() || '');
    const placeholderOpt = selectEl.querySelector('option[value=""]');

    // Remove any previous visual markers so old suggestions never linger.
    for (const opt of Array.from(selectEl.querySelectorAll('option'))){
      if (opt.value === '') continue;
      if (opt.textContent && opt.textContent.startsWith('★ ')) {
        opt.textContent = opt.textContent.slice(2);
      }
      if (opt.dataset) delete opt.dataset.suggested;
    }

    if (!suggested) return;
    const opt = selectEl.querySelector(`option[value="${CSS.escape(suggested)}"]`);
    if (!opt || !placeholderOpt) return; // not allowed / not present

    opt.textContent = `★ ${suggested}`;
    opt.dataset.suggested = '1';
    if (opt !== placeholderOpt.nextSibling) {
      selectEl.insertBefore(opt, placeholderOpt.nextSibling);
    }
  } catch(e) {}
}

// Read the currently top-most match's *target track* from the rendered table.
// - If the match is an intermission match, this is the End track.
// - If it's a normal 3-lap match, this is the Track value.
function getTopMatchTargetTrackFromTable(){
  try {
    const firstTr = document.querySelector('#rows tr');
    if (!firstTr) return '';

    const cells = firstTr.children;
    if (!cells || cells.length < 4) return '';

    const interCell = cells[2];
    const trackCell = cells[3];

    // Intermission row: End is the 2nd .value within .intermission-stack
    const stack = interCell?.querySelector?.('.intermission-stack');
    if (stack) {
      const vals = stack.querySelectorAll('.value');
      const end = vals?.[1]?.textContent?.trim?.() || '';
      return end;
    }

    // Normal row: Track is the track cell's text
    return (trackCell?.textContent || '').trim();
  } catch(e) {
    return '';
  }
}
  // ========= Fehler sichtbar machen =========
  window.addEventListener("error", (e) => {
    const msg = "JS Error: " + (e.message || e.type);
    document.getElementById("status").textContent = msg;
    document.getElementById("debug").textContent = (e.error?.stack || "");
  });

  // ========= Helpers =========
  const $ = (id) => document.getElementById(id);
  const $status = $("status");
  const $debug  = $("debug");
  const $rows   = $("rows");

