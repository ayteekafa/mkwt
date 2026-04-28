const INTERMISSION_ROUTES = [
  {"from":"Acorn Heights","to":"Boo Cinema"},{"from":"Acorn Heights","to":"Dandelion Depths"},{"from":"Acorn Heights","to":"Dry Bones Burnout"},{"from":"Acorn Heights","to":"Mario Circuit"},{"from":"Acorn Heights","to":"Toad's Factory"},
  {"from":"Airship Fortress","to":"Bowser's Castle"},{"from":"Airship Fortress","to":"Dry Bones Burnout"},{"from":"Airship Fortress","to":"Shy Guy Bazaar"},{"from":"Airship Fortress","to":"Toad's Factory"},{"from":"Airship Fortress","to":"Wario Stadium"},
  {"from":"Boo Cinema","to":"Acorn Heights"},{"from":"Boo Cinema","to":"Dandelion Depths"},{"from":"Boo Cinema","to":"Dry Bones Burnout"},{"from":"Boo Cinema","to":"Mario Circuit"},{"from":"Boo Cinema","to":"Starview Peak"},
  {"from":"Bowser's Castle","to":"Airship Fortress"},{"from":"Bowser's Castle","to":"Choco Mountain"},{"from":"Bowser's Castle","to":"Dry Bones Burnout"},{"from":"Bowser's Castle","to":"Mario Circuit"},{"from":"Bowser's Castle","to":"Toad's Factory"},{"from":"Bowser's Castle","to":"Wario Stadium"},
  {"from":"Cheep Cheep Falls","to":"Choco Mountain"},{"from":"Cheep Cheep Falls","to":"Dandelion Depths"},{"from":"Cheep Cheep Falls","to":"DK Pass"},{"from":"Cheep Cheep Falls","to":"Faraway Oasis"},{"from":"Cheep Cheep Falls","to":"Moo Moo Meadows"},{"from":"Cheep Cheep Falls","to":"Peach Stadium"},{"from":"Cheep Cheep Falls","to":"Salty Salty Speedway"},{"from":"Cheep Cheep Falls","to":"Starview Peak"},{"from":"Cheep Cheep Falls","to":"Wario Shipyard"},
  {"from":"Choco Mountain","to":"Bowser's Castle"},{"from":"Choco Mountain","to":"Cheep Cheep Falls"},{"from":"Choco Mountain","to":"Crown City"},{"from":"Choco Mountain","to":"Mario Bros. Circuit"},{"from":"Choco Mountain","to":"Moo Moo Meadows"},{"from":"Choco Mountain","to":"Peach Stadium"},{"from":"Choco Mountain","to":"Shy Guy Bazaar"},{"from":"Choco Mountain","to":"Toad's Factory"},{"from":"Choco Mountain","to":"Wario Stadium"},{"from":"Choco Mountain","to":"Whistlestop Summit"},
  {"from":"Crown City","to":"Choco Mountain"},{"from":"Crown City","to":"Desert Hills"},{"from":"Crown City","to":"DK Spaceport"},{"from":"Crown City","to":"Faraway Oasis"},{"from":"Crown City","to":"Koopa Troopa Beach"},{"from":"Crown City","to":"Mario Bros. Circuit"},{"from":"Crown City","to":"Moo Moo Meadows"},{"from":"Crown City","to":"Peach Stadium"},{"from":"Crown City","to":"Wario Stadium"},{"from":"Crown City","to":"Whistlestop Summit"},
  {"from":"Dandelion Depths","to":"Acorn Heights"},{"from":"Dandelion Depths","to":"Boo Cinema"},{"from":"Dandelion Depths","to":"Cheep Cheep Falls"},{"from":"Dandelion Depths","to":"DK Pass"},{"from":"Dandelion Depths","to":"Mario Circuit"},{"from":"Dandelion Depths","to":"Moo Moo Meadows"},{"from":"Dandelion Depths","to":"Sky-High Sundae"},{"from":"Dandelion Depths","to":"Starview Peak"},{"from":"Dandelion Depths","to":"Toad's Factory"},
  {"from":"Desert Hills","to":"Crown City"},{"from":"Desert Hills","to":"Mario Bros. Circuit"},{"from":"Desert Hills","to":"Shy Guy Bazaar"},{"from":"Desert Hills","to":"Whistlestop Summit"},{"from":"Desert Hills","to":"Koopa Troopa Beach"},
  {"from":"Dino Dino Jungle","to":"Faraway Oasis"},{"from":"Dino Dino Jungle","to":"Great ? Block Ruins"},{"from":"Dino Dino Jungle","to":"Koopa Troopa Beach"},{"from":"Dino Dino Jungle","to":"Peach Beach"},{"from":"Dino Dino Jungle","to":"Salty Salty Speedway"},
  {"from":"DK Pass","to":"Dandelion Depths"},{"from":"DK Pass","to":"Moo Moo Meadows"},{"from":"DK Pass","to":"Salty Salty Speedway"},{"from":"DK Pass","to":"Sky-High Sundae"},{"from":"DK Pass","to":"Starview Peak"},{"from":"DK Pass","to":"Wario Shipyard"},{"from":"DK Pass","to":"Cheep Cheep Falls"},
  {"from":"DK Spaceport","to":"Crown City"},{"from":"DK Spaceport","to":"Koopa Troopa Beach"},{"from":"DK Spaceport","to":"Whistlestop Summit"},{"from":"DK Spaceport","to":"Peach Stadium"},{"from":"DK Spaceport","to":"Desert Hills"},{"from":"DK Spaceport","to":"Mario Bros. Circuit"},
  {"from":"Dry Bones Burnout","to":"Acorn Heights"},{"from":"Dry Bones Burnout","to":"Airship Fortress"},{"from":"Dry Bones Burnout","to":"Boo Cinema"},{"from":"Dry Bones Burnout","to":"Bowser's Castle"},{"from":"Dry Bones Burnout","to":"Mario Circuit"},{"from":"Dry Bones Burnout","to":"Moo Moo Meadows"},{"from":"Dry Bones Burnout","to":"Toad's Factory"},{"from":"Dry Bones Burnout","to":"Wario Stadium"},
  {"from":"Faraway Oasis","to":"Cheep Cheep Falls"},{"from":"Faraway Oasis","to":"Crown City"},{"from":"Faraway Oasis","to":"Dino Dino Jungle"},{"from":"Faraway Oasis","to":"Great ? Block Ruins"},{"from":"Faraway Oasis","to":"Koopa Troopa Beach"},{"from":"Faraway Oasis","to":"Peach Beach"},{"from":"Faraway Oasis","to":"Peach Stadium"},{"from":"Faraway Oasis","to":"Salty Salty Speedway"},
  {"from":"Great ? Block Ruins","to":"Dino Dino Jungle"},{"from":"Great ? Block Ruins","to":"Faraway Oasis"},{"from":"Great ? Block Ruins","to":"Peach Beach"},{"from":"Great ? Block Ruins","to":"Salty Salty Speedway"},{"from":"Great ? Block Ruins","to":"Koopa Troopa Beach"},
  {"from":"Koopa Troopa Beach","to":"Crown City"},{"from":"Koopa Troopa Beach","to":"Faraway Oasis"},{"from":"Koopa Troopa Beach","to":"DK Spaceport"},{"from":"Koopa Troopa Beach","to":"Dino Dino Jungle"},{"from":"Koopa Troopa Beach","to":"Peach Stadium"},
  {"from":"Mario Bros. Circuit","to":"Choco Mountain"},{"from":"Mario Bros. Circuit","to":"Crown City"},{"from":"Mario Bros. Circuit","to":"Desert Hills"},{"from":"Mario Bros. Circuit","to":"Shy Guy Bazaar"},{"from":"Mario Bros. Circuit","to":"Toad's Factory"},{"from":"Mario Bros. Circuit","to":"Wario Stadium"},{"from":"Mario Bros. Circuit","to":"Whistlestop Summit"},
  {"from":"Mario Circuit","to":"Acorn Heights"},{"from":"Mario Circuit","to":"Boo Cinema"},{"from":"Mario Circuit","to":"Bowser's Castle"},{"from":"Mario Circuit","to":"Dandelion Depths"},{"from":"Mario Circuit","to":"Dry Bones Burnout"},{"from":"Mario Circuit","to":"Moo Moo Meadows"},{"from":"Mario Circuit","to":"Starview Peak"},{"from":"Mario Circuit","to":"Toad's Factory"},{"from":"Mario Circuit","to":"Peach Stadium"},
  {"from":"Moo Moo Meadows","to":"Cheep Cheep Falls"},{"from":"Moo Moo Meadows","to":"Choco Mountain"},{"from":"Moo Moo Meadows","to":"Crown City"},{"from":"Moo Moo Meadows","to":"Dandelion Depths"},{"from":"Moo Moo Meadows","to":"DK Pass"},{"from":"Moo Moo Meadows","to":"Dry Bones Burnout"},{"from":"Moo Moo Meadows","to":"Mario Circuit"},{"from":"Moo Moo Meadows","to":"Peach Stadium"},{"from":"Moo Moo Meadows","to":"Toad's Factory"},
  {"from":"Peach Beach","to":"Dino Dino Jungle"},{"from":"Peach Beach","to":"Faraway Oasis"},{"from":"Peach Beach","to":"Great ? Block Ruins"},{"from":"Peach Beach","to":"Salty Salty Speedway"},{"from":"Peach Beach","to":"Wario Shipyard"},
  {"from":"Peach Stadium","to":"Cheep Cheep Falls"},{"from":"Peach Stadium","to":"Choco Mountain"},{"from":"Peach Stadium","to":"Crown City"},{"from":"Peach Stadium","to":"Faraway Oasis"},{"from":"Peach Stadium","to":"Koopa Troopa Beach"},{"from":"Peach Stadium","to":"Moo Moo Meadows"},{"from":"Peach Stadium","to":"Toad's Factory"},{"from":"Peach Stadium","to":"Rainbow Road"},
  {"from":"Rainbow Road","to":"Peach Stadium"},
  {"from":"Salty Salty Speedway","to":"Cheep Cheep Falls"},{"from":"Salty Salty Speedway","to":"Dino Dino Jungle"},{"from":"Salty Salty Speedway","to":"DK Pass"},{"from":"Salty Salty Speedway","to":"Faraway Oasis"},{"from":"Salty Salty Speedway","to":"Great ? Block Ruins"},{"from":"Salty Salty Speedway","to":"Peach Beach"},{"from":"Salty Salty Speedway","to":"Wario Shipyard"},
  {"from":"Shy Guy Bazaar","to":"Airship Fortress"},{"from":"Shy Guy Bazaar","to":"Choco Mountain"},{"from":"Shy Guy Bazaar","to":"Desert Hills"},{"from":"Shy Guy Bazaar","to":"Mario Bros. Circuit"},{"from":"Shy Guy Bazaar","to":"Wario Stadium"},
  {"from":"Sky-High Sundae","to":"Dandelion Depths"},{"from":"Sky-High Sundae","to":"DK Pass"},{"from":"Sky-High Sundae","to":"Starview Peak"},{"from":"Sky-High Sundae","to":"Wario Shipyard"},{"from":"Sky-High Sundae","to":"Cheep Cheep Falls"},{"from":"Sky-High Sundae","to":"Salty Salty Speedway"},
  {"from":"Starview Peak","to":"Boo Cinema"},{"from":"Starview Peak","to":"Cheep Cheep Falls"},{"from":"Starview Peak","to":"Dandelion Depths"},{"from":"Starview Peak","to":"DK Pass"},{"from":"Starview Peak","to":"Mario Circuit"},{"from":"Starview Peak","to":"Sky-High Sundae"},{"from":"Starview Peak","to":"Wario Shipyard"},
  {"from":"Toad's Factory","to":"Acorn Heights"},{"from":"Toad's Factory","to":"Airship Fortress"},{"from":"Toad's Factory","to":"Bowser's Castle"},{"from":"Toad's Factory","to":"Choco Mountain"},{"from":"Toad's Factory","to":"Dandelion Depths"},{"from":"Toad's Factory","to":"Dry Bones Burnout"},{"from":"Toad's Factory","to":"Mario Bros. Circuit"},{"from":"Toad's Factory","to":"Mario Circuit"},{"from":"Toad's Factory","to":"Moo Moo Meadows"},{"from":"Toad's Factory","to":"Peach Stadium"},{"from":"Toad's Factory","to":"Wario Stadium"},
  {"from":"Wario Shipyard","to":"Cheep Cheep Falls"},{"from":"Wario Shipyard","to":"DK Pass"},{"from":"Wario Shipyard","to":"Peach Beach"},{"from":"Wario Shipyard","to":"Salty Salty Speedway"},{"from":"Wario Shipyard","to":"Sky-High Sundae"},{"from":"Wario Shipyard","to":"Starview Peak"},
  {"from":"Wario Stadium","to":"Airship Fortress"},{"from":"Wario Stadium","to":"Bowser's Castle"},{"from":"Wario Stadium","to":"Choco Mountain"},{"from":"Wario Stadium","to":"Crown City"},{"from":"Wario Stadium","to":"Dry Bones Burnout"},{"from":"Wario Stadium","to":"Mario Bros. Circuit"},{"from":"Wario Stadium","to":"Shy Guy Bazaar"},{"from":"Wario Stadium","to":"Toad's Factory"},
  {"from":"Whistlestop Summit","to":"Choco Mountain"},{"from":"Whistlestop Summit","to":"Crown City"},{"from":"Whistlestop Summit","to":"Desert Hills"},{"from":"Whistlestop Summit","to":"DK Spaceport"},{"from":"Whistlestop Summit","to":"Mario Bros. Circuit"},{"from":"Whistlestop Summit","to":"Koopa Troopa Beach"}
];
function buildRouteIndex(routes){
  const startToEnds = new Map();
  const endToStarts = new Map();
  for (const r of routes){
    if (!startToEnds.has(r.from)) startToEnds.set(r.from, new Set());
    startToEnds.get(r.from).add(r.to);
    if (!endToStarts.has(r.to)) endToStarts.set(r.to, new Set());
    endToStarts.get(r.to).add(r.from);
  }
  return { startToEnds, endToStarts };
}

const ROUTE_INDEX = buildRouteIndex(INTERMISSION_ROUTES);

function fillTrackSelect(selectEl, placeholder){
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder || "-";
  selectEl.appendChild(opt0);

  // Deterministic ordering:
  // - If this is an Intermission-start select, put EXACTLY ONE suggested track (latest match target)
  //   right under the placeholder and mark it visually (â˜…), but keep value as the raw track name.
  // - Under that: all other tracks in strict alphabetical order, excluding the suggested track.
  // - Never keep/accumulate old suggestions because we rebuild the options from scratch every time.
  const suggested = (getSuggestedNextStart?.() || '');
  const isStartSelect = (selectEl?.id === 'intermission' || selectEl?.id === 'editIntermission');

  const sortedAll = [...TRACKS].sort((a,b)=>String(a).localeCompare(String(b)));

  if (isStartSelect && suggested && sortedAll.includes(suggested)){
    const o = document.createElement('option');
    o.value = suggested;
    o.textContent = `Suggested: ${suggested}`;
    o.dataset.suggested = '1';
    selectEl.appendChild(o);
  }

  for (const t of sortedAll){
    if (isStartSelect && suggested && t === suggested) continue;
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    selectEl.appendChild(o);
  }
}

// ========= Intermission dropdown filtering (bidirectional) =========
// Rules:
// - If user picks Start (A), End dropdown only shows valid destinations for A.
// - If user picks End (B), Start dropdown only shows valid starts that can reach B.
// - Clearing a field resets the opposite dropdown back to the full TRACKS list.

const _startsToEnds = new Map();   // from -> Set(to)
const _endsToStarts = new Map();   // to   -> Set(from)

(function buildIntermissionMaps(){
  for (const r of INTERMISSION_ROUTES){
    if (!_startsToEnds.has(r.from)) _startsToEnds.set(r.from, new Set());
    _startsToEnds.get(r.from).add(r.to);

    if (!_endsToStarts.has(r.to)) _endsToStarts.set(r.to, new Set());
    _endsToStarts.get(r.to).add(r.from);
  }
})();

function fillTrackSelectFromList(selectEl, placeholder, list){
  // Keeps placeholder, then fills only the provided list.
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder || "-";
  selectEl.appendChild(opt0);

  const arr = Array.isArray(list) ? list : [];
  const suggested = (getSuggestedNextStart?.() || '');
  const isStartSelect = (selectEl?.id === 'intermission' || selectEl?.id === 'editIntermission');

  // Always keep the non-suggested part strictly alphabetical.
  const sorted = [...arr].sort((a,b)=>String(a).localeCompare(String(b)));

  // EXACTLY ONE suggested option at the top (only if currently allowed by the filter).
  if (isStartSelect && suggested && sorted.includes(suggested)){
    const o = document.createElement('option');
    o.value = suggested;
    o.textContent = `Suggested: ${suggested}`;
    o.dataset.suggested = '1';
    selectEl.appendChild(o);
  }

  for (const t of sorted){
    if (isStartSelect && suggested && t === suggested) continue;
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    selectEl.appendChild(o);
  }
}

// Apply special end-display suffixes (Reverse / Water Section / Beach Section / etc.)
// ONLY for the Intermission End dropdown display.
// Values stay unchanged (e.g., "DK Pass"), only the option text is adjusted.
function applySpecialEndLabelsToSelect(endSelectEl, startVal){
  try {
    if (!endSelectEl) return;
    const start = String(startVal || '').trim();
    const metaIM = (window.MKWT_STRATS_META_INTERMISSIONS && typeof window.MKWT_STRATS_META_INTERMISSIONS === 'object')
      ? window.MKWT_STRATS_META_INTERMISSIONS
      : null;
    const opts = Array.from(endSelectEl.querySelectorAll('option'));
    for (const opt of opts){
      if (!opt || opt.value === '') continue;
      const end = String(opt.value);
      let label = end;
      if (start && metaIM){
        const k = `${start}>${end}`;
        const m = metaIM[k];
        // Use the same naming/grouping as the Intermission Destiny chart.
        // DISPLAY-ONLY: option.value (and saved data) stays as the plain end track.
        const dg = (m && m.destiny_group) ? String(m.destiny_group).trim() : '';
        if (dg) label = dg;
      }
      opt.textContent = label;
    }
  } catch(e) {}
}

function updateIntermissionPair(startEl, endEl, startPlaceholder, endPlaceholder){
  // Bidirectional filtering with loop-prevention.
  let isSyncing = false;

  function syncFromStart(){
    if (isSyncing) return;
    isSyncing = true;
    const startVal = startEl.value;
    const prevEnd  = endEl.value;

    // If Start is cleared (default), BOTH selects should return to full options.
    // Also clear the counterpart value to avoid "remembering" a filtered state.
    if (!startVal){
      fillTrackSelect(startEl, startPlaceholder);
      fillTrackSelect(endEl, endPlaceholder);
      startEl.value = "";
      endEl.value = "";
      isSyncing = false;
      return;
    }

    const allowed = Array.from(_startsToEnds.get(startVal) || []).sort();
    fillTrackSelectFromList(endEl, endPlaceholder, allowed);

    // Only visual: show special variants (Reverse/Water/etc.) in the End dropdown.
    applySpecialEndLabelsToSelect(endEl, startVal);

    // Preserve previous selection if still valid; otherwise clear.
    endEl.value = allowed.includes(prevEnd) ? prevEnd : "";
    isSyncing = false;
  }

  function syncFromEnd(){
    if (isSyncing) return;
    isSyncing = true;
    const endVal   = endEl.value;
    const prevStart = startEl.value;

    // If End is cleared (default), BOTH selects should return to full options.
    // Also clear the counterpart value to avoid "remembering" a filtered state.
    if (!endVal){
      fillTrackSelect(startEl, startPlaceholder);
      fillTrackSelect(endEl, endPlaceholder);
      startEl.value = "";
      endEl.value = "";
      isSyncing = false;
      return;
    }

    const allowed = Array.from(_endsToStarts.get(endVal) || []).sort();
    fillTrackSelectFromList(startEl, startPlaceholder, allowed);
    startEl.value = allowed.includes(prevStart) ? prevStart : "";
    isSyncing = false;
  }

  startEl.addEventListener("change", syncFromStart);
  endEl.addEventListener("change", syncFromEnd);

  // Initial state: full lists
  fillTrackSelect(startEl, startPlaceholder);
  fillTrackSelect(endEl, endPlaceholder);
}

function initSelects(){
  // Intermission (create form)
  updateIntermissionPair(
    $("intermission"),
    $("track"),
    " ",
    " "
  );

  // Intermission (edit dialog)
  updateIntermissionPair(
    $("editIntermission"),
    $("editTrack"),
    " ",
    " "
  );
}

// Reset helper for create-form Intermission selects (values + full options + suggestion)
// Uses the existing bidirectional filter logic via change-events.
function resetIntermissionSelects(){
  const a = $("intermission");
  const b = $("track");
  if (!a || !b) return;
  a.value = "";
  b.value = "";
  try {
    a.dispatchEvent(new Event("change", { bubbles: true }));
    b.dispatchEvent(new Event("change", { bubbles: true }));
  } catch(e) {}
}
