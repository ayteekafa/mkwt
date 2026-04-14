  function setStatus(msg, ok=false){
    const has = !!(msg && String(msg).trim());
    if (window.MKWT?.setStatus) window.MKWT.setStatus($status, has ? String(msg) : '', ok);
    if ($status) $status.classList.toggle('hidden', !has);
  }
  function setDebug(msg){ window.MKWT?.setDebug?.($debug, msg); }
  function show(el, on){ el.classList.toggle("hidden", !on); }

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


  // ========= VR Δ <-> VR nach Match Sync =========
  // ========= Edit VR Δ <-> new total VR Sync =========
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

    const d = Number(elDelta.value);
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

    const a = Number(elAfter.value);
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
    const d = Number(elDelta.value);
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
    const a = Number(elAfter.value);
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

// All Intermission combinations (Start -> End). Used to filter the dropdowns.
// NOTE: keep spelling identical to TRACKS.

  // ========= Supabase (FIX: localStorage + sessionStorage unterstützen) =========


  // Backup session tokens for iOS PWA/Safari edge-cases where the Supabase
  // storage entry may not be restored reliably after the app is killed.

  // wird nach requireAuth() gesetzt


  // ===== Guest (local) storage =====

  // NOTE: Use the page-local SESSION as the source of truth.
  // window.SESSION is exposed for shared navbar actions, but should not be relied on here.

  // ========= Guest Profile (local) =========
  const GUEST_PROFILE_KEY = "mkwt_guest_profile_v1";
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
        $("userInfo").textContent = "Profile: –";
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
        setStatus("✅ Guest profile saved.", true);
        await refreshAll();
        return;
      }

      setStatus("Creating profile…", true);

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

      setStatus("✅ Profile created.", true);
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

async function loadMatches() {
  $rows.innerHTML = `<tr><td colspan="10" class="muted">Loading…</td></tr>`;
  const $cards = $("matchCards");
  if ($cards) $cards.innerHTML = `<div class="muted">Loading…</div>`;

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
    $rows.innerHTML = `<tr><td colspan="10" class="muted">Error loading.</td></tr>`;
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
    $rows.innerHTML = `<tr><td colspan="10" class="muted">No matches yet.</td></tr>`;
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
      const intermissionCellHtml = isIntermission
        ? `<div class="intermission-stack"><div class="label">Start</div><div class="value">${escapeHtml(intermission)}</div><div class="label">End</div><div class="value">${escapeHtml(track)}</div></div>`
        : `<span class="intermission-placeholder">—</span>`;
      const trackCellHtml = isIntermission
        ? `<span class="track-placeholder">—</span>`
        : escapeHtml(track || '—');
      const delta = Number(r.vr_change || 0);
      const vrAfter = (r.vr_after ?? null);
      const vrNow = (vrAfter == null ? "" : Number(vrAfter));
      const opp = Number(r.opponents || 0);
      const place = Number(r.placement || 0);
      const perf = (opp ? (delta / opp) : 0);
      const perfStr = opp ? perf.toFixed(2) : "";
      const canDelete = (currentPage === 1 && idx === 0); // only newest match can be deleted
      return `
        <tr>
          <td>${matchNo}</td>
          <td>${created}</td>
          <td>${intermissionCellHtml}</td>
          <td>${trackCellHtml}</td>
          <td class="${delta>=0?'ok':'bad'}">${delta}</td>
          <td>${vrNow}</td>
          <td>${opp||""}</td>
          <td>${place||""}</td>
          <td>
            <button class="iconBtn" title="Bearbeiten" data-action="edit" data-id="${r.id}">✏️</button>
            ${canDelete ? `<button class="iconBtn danger" title="Delete" data-action="del" data-id="${r.id}">🗑️</button>` : ""}
          </td>
        </tr>`;
    
}).join("");

  // Mobile cards (same data, cleaner layout)
  if ($cards) {
    $cards.innerHTML = data.map((r, idx) => {
      const matchNo = totalMatches - (from + idx);
      const d = r.created_at ? new Date(r.created_at) : null;
      const createdShort = d ? d.toLocaleString("en-US", { year:"numeric", month:"2-digit", day:"2-digit", hour:"numeric", minute:"2-digit", hour12:true }) : "";
      const intermission = (r.intermission ?? "") ? String(r.intermission) : "";
      const track = (r.track ?? "") ? String(r.track) : "";
      const isIntermission = !!intermission;

const startName = intermission || "—";
const endName = track || "—";

const trackHtml = isIntermission
  ? `<div class="mcard__track--im" title="${escapeHtml(startName)} → ${escapeHtml(endName)}">
       <div class="imLine" title="${escapeHtml(startName)}">${escapeHtml(startName)}</div>
       <div class="imArrow">→</div>
       <div class="imLine" title="${escapeHtml(endName)}">${escapeHtml(endName)}</div>
     </div>`
  : `<div class="mcard__track" title="${escapeHtml(endName)}">${escapeHtml(endName)}</div>`;
      const delta = Number(r.vr_change || 0);
      const vrAfter = (r.vr_after ?? null);
      const vrNow = (vrAfter == null ? "—" : String(Number(vrAfter)));
      const deltaStr = (delta > 0 ? `+${delta}` : `${delta}`);
      const deltaCls = delta >= 0 ? "mcard__vrDelta--pos" : "mcard__vrDelta--neg";
      const canDelete = (currentPage === 1 && idx === 0);

      const hasPlace = (r.placement != null && r.placement !== "" && Number(r.placement) > 0);
      const hasOpp = (r.opponents != null && r.opponents !== "" && Number(r.opponents) > 0);

      // Every match shows an info button. Popover always contains Date/Time,
      // and additionally Placement/Opponents only if provided.
      const infoBtnHtml = `<button class="mcard__infoBtn" title="Info" data-action="info">i</button>`;

      const infoLine = (hasPlace && hasOpp)
        ? `<span class="infoLine"><strong>Place</strong>: ${escapeHtml(String(r.placement))} <span class="sep">•</span> <strong>Opp</strong>: ${escapeHtml(String(r.opponents))}</span>`
        : (hasPlace
            ? `<span class="infoLine"><strong>Place</strong>: ${escapeHtml(String(r.placement))}</span>`
            : `<span class="infoLine"><strong>Opp</strong>: ${escapeHtml(String(r.opponents))}</span>`
          );

      const infoPopHtml = `
        <div class="mcard__infoPop" hidden>
          <div class="row"><span class="infoLine"><strong>Date</strong>: ${escapeHtml(createdShort || "—")}</span></div>
          ${ (hasPlace || hasOpp) ? `<div class="row">${infoLine}</div>` : `` }
        </div>`;

      return `
        <div class="mcard ${isIntermission ? "mcard--im" : ""}" data-match-id="${r.id}">
          <div class="mcard__meta mcard__meta--tl"><span>#${matchNo}</span>${infoBtnHtml}</div>
          ${infoPopHtml}

          <div class="mcard__main">
            ${trackHtml}
            <div class="mcard__vr">
              <span class="mcard__vrTotal">${escapeHtml(vrNow)}</span>
              <span class="mcard__vrDelta ${deltaCls}">(${escapeHtml(deltaStr)})</span>
            </div>
          </div>

          <div class="mcard__actions">
            <button class="mcard__btn" title="Edit" data-action="edit" data-id="${r.id}">✎</button>
            ${canDelete ? `<button class="mcard__btn" title="Delete" data-action="del" data-id="${r.id}">🗑</button>` : ``}
          </div>
        </div>`;
    }).join("");
  }


  // Klick-Handler für Edit & Delete (Table)
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
    $cards.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        if (action === "edit") await openEditDialog(id);
        if (action === "del") await deleteMatch(id);
        if (action === "info") {
          const card = btn.closest('.mcard');
          if (!card) return;
          const pop = card.querySelector('.mcard__infoPop');
          if (!pop) return;
          // close other open pops
          $cards.querySelectorAll('.mcard__infoPop:not([hidden])').forEach(el => { if (el !== pop) el.hidden = true; });
          pop.hidden = !pop.hidden;
          return;
        }
      });
    });
    // close info popovers on outside tap
    $cards.addEventListener("click", (e) => {
      const isInfo = e.target && (e.target.closest && e.target.closest(".mcard__infoBtn"));
      const isAction = e.target && (e.target.closest && e.target.closest(".mcard__actions"));
      if (isInfo || isAction) return;
      $cards.querySelectorAll(".mcard__infoPop:not([hidden])").forEach(el => el.hidden = true);
    });

  }
}

  async function saveMatch() {
    const btn = $("btnSaveMatch");
    btn.disabled = true;

    try {
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

        if (!track) { setStatus("Please select a track.", false); return; }
    if (mode === "intermission" && !intermission) { setStatus("Please select an intermission start.", false); return; }
      if (!Number.isFinite(vr_change_in) && !Number.isFinite(vr_after_in)) { setStatus("Please enter VR Δ or the VR after the match.", false); return; }

      let opponents = null;
      if (opponentsRaw !== "") {
        opponents = parseInt(opponentsRaw, 10);
        if (!Number.isFinite(opponents) || opponents < 1 || opponents > 23) {
          setStatus("Opponents must be 1–23.", false);
          return;
        }
      }

      let placement = null;
      if (placementRaw !== "") {
        placement = parseInt(placementRaw, 10);
        if (!Number.isFinite(placement) || placement < 1 || placement > 24) {
          setStatus("Placement must be 1–24.", false);
          return;
        }
      }

      setStatus("Saving match…", true);

      const baseVr = (PROFILE?.current_vr ?? 8500);
      let vr_after;
      let vr_change;
      if (Number.isFinite(vr_after_in)) {
        vr_after = vr_after_in;
        vr_change = vr_after - baseVr;
        // Sync UI, falls beides gefüllt war
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
        setStatus("Failed to save match: " + insErr.message, false);
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
      try { $('vrChange').value = ''; } catch(e) {}
      try { $('vrAfterInput').value = ''; } catch(e) {}
      try { $('opponents').value = ''; } catch(e) {}
      try { $('placement').value = ''; } catch(e) {}
      const newVr = vr_after;

      if (isGuest()) {
        setStatus("✅ Match saved (Guest).", true);
      } else {
        const { error: upErr } = await supabaseClient
          .from("profiles")
          .update({ current_vr: newVr, updated_at: new Date().toISOString() })
          .eq("id", SESSION.user.id);

        if (upErr) {
          setStatus("⚠️ Match saved, but VR update failed: " + upErr.message, false);
          setDebug(JSON.stringify(upErr, null, 2));
        } else {
          setStatus("✅ Match saved. VR updated.", true);
        }
      }


      await refreshAll();
    } finally {
      btn.disabled = false;
    }
  }

  async function loadProfile() {
    PROFILE = null;
    $("statCurrentVr").textContent = "–";

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
      try { $("statCurrentVr").textContent = String(gp.current_vr ?? "–"); } catch(e) {}

      // full header stats from guest matches (same as account features)
      try {
        const g = loadGuestMatches();
        updateGuestHeaderStats(gp, g);
      } catch(e) {}
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
  try { $("userInfo").textContent = "Profile: " + (PROFILE?.nickname || "–"); } catch(e) {}
$("statCurrentVr").textContent = String(PROFILE.current_vr ?? "–");
    try { await updateProfileQuickStats(); } catch(e) {}
  }

  
  // ========= Profile Quick Stats (Header Card) =========
  function fmtNum(n){
    if (!Number.isFinite(n)) return "–";
    // keep it gamer-clean (no decimals for VR)
    return String(Math.round(n));
  }
  function fmtSigned(n, decimals=1){
    if (!Number.isFinite(n)) return "–";
    const sign = (n > 0) ? "+" : (n < 0) ? "−" : "";
    const v = Math.abs(n).toFixed(decimals);
    return sign + v;
  }

  function fmtSignedInt(n){
    if (!Number.isFinite(n)) return "–";
    const sign = (n > 0) ? "+" : (n < 0) ? "−" : "";
    return sign + String(Math.abs(Math.round(n)));
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

      // Best Track (3-lap only): highest avg VR change
      const sums = new Map();
      for (const r of arr){
        // 3-lap entries have intermission === null
        if (r?.intermission != null) continue;
        const t = String(r?.track || '').trim();
        const d = Number(r?.vr_change);
        if (!t || !Number.isFinite(d)) continue;
        const cur = sums.get(t) || { sum:0, count:0 };
        cur.sum += d;
        cur.count += 1;
        sums.set(t, cur);
      }
      let best = null;
      for (const [track, {sum, count}] of sums.entries()){
        if (!count) continue;
        const a = sum / count;
        if (!best || a > best.avg) best = { track, avg: a, count };
      }
      if (!best){
        $("bestTrackName").textContent = "–";
        $("bestTrackMeta").textContent = "–";
      } else {
        const avgTxt = fmtSigned(best.avg, 1) + " VR avg";
        const runsTxt = best.count === 1 ? "1 run" : `${best.count} runs`;
        $("bestTrackName").textContent = best.track;
        $("bestTrackMeta").textContent = `${avgTxt} • ${runsTxt}`;
      }

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
        $("statHighestVr").textContent = "–";
        $("statAvg50Vr").textContent = "–";
        $("statMatchCount").textContent = "–";
        $("bestTrackName").textContent = "–";
        $("bestTrackMeta").textContent = "–";
        $("statWinStreak").textContent = "–";
        $("statLoseStreak").textContent = "–";
        $("statMaxGain").textContent = "–";
        $("statMaxLoss").textContent = "–";
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
    $("statMatchCount").textContent = (typeof resCount.count === "number") ? String(resCount.count) : "–";

    if (resHighest.error) throw resHighest.error;
    const highest = Number(resHighest.data?.[0]?.vr_after);
    $("statHighestVr").textContent = fmtNum(highest);

    if (resLastMonth.error) throw resLastMonth.error;
    const vals = (resLastMonth.data || []).map(r => Number(r.vr_after)).filter(Number.isFinite);
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0) / vals.length) : NaN;
    $("statAvg50Vr").textContent = fmtNum(avg);

    // Best Track (3-Lap only): highest average VR Δ
    // For performance we use the most recent 2000 3-lap matches (single request).
    const { data: lapData, error: lapErr } = await supabaseClient
      .from("matches")
      .select("track, vr_change")
      .eq("user_id", SESSION.user.id)
      .is("intermission", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (lapErr) throw lapErr;

    const sums = new Map(); // track -> {sum,count}
    for (const r of (lapData || [])){
      const t = String(r.track || "").trim();
      const d = Number(r.vr_change);
      if (!t || !Number.isFinite(d)) continue;
      const cur = sums.get(t) || { sum:0, count:0 };
      cur.sum += d;
      cur.count += 1;
      sums.set(t, cur);
    }

    let best = null; // {track, avg, count}
    for (const [track, {sum, count}] of sums.entries()){
      if (!count) continue;
      const a = sum / count;
      if (!best || a > best.avg) best = { track, avg: a, count };
    }

    if (!best){
      $("bestTrackName").textContent = "–";
      $("bestTrackMeta").textContent = "–";
      try { $("statWinStreak").textContent = "–"; } catch(_){ }
      try { $("statLoseStreak").textContent = "–"; } catch(_){ }
      try { $("statMaxGain").textContent = "–"; } catch(_){ }
      try { $("statMaxLoss").textContent = "–"; } catch(_){ }
    } else {
      const avgTxt = fmtSigned(best.avg, 1) + " VR avg";
      const runsTxt = best.count === 1 ? "1 run" : `${best.count} runs`;
      $("bestTrackName").textContent = best.track;
      $("bestTrackMeta").textContent = `${avgTxt} • ${runsTxt}`;
    }

    // Win/Lose streak (ALL-TIME longest) + Max gain/loss (all-time)
    // We must consider *all* tracked matches (can be > 1000), so we fetch paginated.
    const all = [];
    const chunk = 1000;
    let from = 0;
    while (true) {
      const to = from + chunk - 1;
      const { data, error } = await supabaseClient
        .from("matches")
        .select("id, created_at, vr_change")
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
    const { maxWin, maxLose, maxGain, maxLoss } = calcStreaksAndExtremes(asc);

    $("statWinStreak").textContent  = String(maxWin);
    $("statLoseStreak").textContent = String(maxLose);
    $("statMaxGain").textContent = fmtSignedInt(maxGain);
    $("statMaxLoss").textContent = fmtSignedInt(maxLoss);


  } catch(e){
    // keep UI stable if stats query fails
    try{
      $("statHighestVr").textContent = "–";
      $("statAvg50Vr").textContent = "–";
      $("statMatchCount").textContent = "–";
      $("bestTrackName").textContent = "–";
      $("bestTrackMeta").textContent = "–";
    } catch(_){}
    setDebug("Header stats error: " + (e?.message || e));
  }
}

  // ========= Refresh / Init =========
  async function refreshAll() {
  setStatus("", true);

  // Pagination-Cache reset (WICHTIG!)
  totalMatches = null;
  currentPage = 1;

  await loadProfile();

    if (!PROFILE) {
      show($("setupCard"), true);
      show($("matchCard"), false);
      show($("listCard"), false);
      // removed ready pill
      $("statCurrentVr").textContent = "–";
      return;
    }

    show($("setupCard"), false);
    show($("matchCard"), true);
    show($("listCard"), true);

    // removed ready pill

    $("statCurrentVr").textContent = String(PROFILE.current_vr ?? "–");
    // IMPORTANT: Don't run cloud header stats in Guest mode.
    // In Guest, compute header stats from localStorage matches.
    if (isGuest()) {
      try { updateGuestHeaderStats(PROFILE, loadGuestMatches()); } catch(e) {}
    } else {
      try { await updateProfileQuickStats(); } catch(e) {}
    }
    // Re-sync inputs with new base VR
    try { syncFromDelta(); syncFromAfter(); } catch(e) {}
    await loadMatches();
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

async function openEditDialog(id) {
  try {
    setStatus("", true);
    EDIT_ROW = await fetchMatchById(id);
    if (!EDIT_ROW) {
      setStatus("Match not found (or no permission).", false);
      return;
    }

    $("editMeta").textContent =
      "ID: " + EDIT_ROW.id + " • " +
      (EDIT_ROW.created_at ? new Date(EDIT_ROW.created_at).toLocaleString() : "");

    $("editIntermission").value = "";
    $("editTrack").value = "";
    // Reset edit selects to full options (no leftover filtered combos)
    // Uses the existing bidirectional filter logic via change-events.
    try {
      $("editIntermission").dispatchEvent(new Event("change", { bubbles: true }));
      $("editTrack").dispatchEvent(new Event("change", { bubbles: true }));
    } catch(e) {}

    // Mode UI (Intermission vs 3-Lap)
    try { setEditMode((EDIT_ROW.intermission ?? "") ? "intermission" : "3lap"); } catch(e) {}

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

    editDlg.showModal();
  } catch (e) {
    setStatus("Failed to open editor: " + (e?.message || e), false);
    setDebug(e?.stack || "");
  }
}

function closeDlg(){
  if (editDlg.open) editDlg.close();
  EDIT_ROW = null;
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
    if (!Number.isFinite(vr_change_in) && !Number.isFinite(vr_after_in)) { setStatus("Please enter VR Δ or the new total VR.", false); return; }

    let opponents = null;
    if (opponentsRaw !== "") {
      opponents = parseInt(opponentsRaw, 10);
      if (!Number.isFinite(opponents) || opponents < 1 || opponents > 23) {
        setStatus("Opponents must be 1–23.", false);
        return;
      }
    }

    let placement = null;
    if (placementRaw !== "") {
      placement = parseInt(placementRaw, 10);
      if (!Number.isFinite(placement) || placement < 1 || placement > 24) {
        setStatus("Placement must be 1–24.", false);
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

    setStatus("Saving changes…", true);

    // 1) Match updaten + updated row zurückholen (wichtig: array!)
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
        setStatus("⚠️ Match updated, but profile VR sync failed: " + upProfErr.message, false);
        setDebug(JSON.stringify(upProfErr, null, 2));
        closeDlg();
        await refreshAll();
        return;
      }
    }

    setStatus("✅ Changes saved.", true);
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

    const ok = confirm(
      `Delete match?\n\nTrack: ${row.track}\nVR Δ: ${row.vr_change}\nZeit: ${row.created_at ? new Date(row.created_at).toLocaleString() : ""}`
    );
    if (!ok) return;

    setStatus("Deleting match…", true);

    if (isGuest()) {
      const okDel = guestDeleteMatch(id);
      if (!okDel) { setStatus("Delete failed: match not found.", false); return; }
	      // Guest mode ends here (no Supabase writes)
	      totalMatches = null;
	      setStatus("✅ Match deleted.", true);
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
      setStatus("⚠️ Match deleted, but profile VR sync failed: " + upProfErr.message, false);
      setDebug(JSON.stringify(upProfErr, null, 2));
    } else {
      setStatus("✅ Match deleted. VR adjusted.", true);
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
  // Buttons
  $("btnCreateProfile")?.addEventListener("click", createProfile);
  $("btnSaveMatch")?.addEventListener("click", saveMatch);

  // Live-Sync der Eingabefelder
  $("vrChange")?.addEventListener("input", syncFromDelta);
  $("vrAfterInput")?.addEventListener("input", syncFromAfter);

  $("btnClear")?.addEventListener("click", () => {
    const a = $("intermission");
    const b = $("track");
    a.value = "";
    b.value = "";
    // IMPORTANT: trigger the intermission filter logic to repopulate BOTH dropdowns
    // back to the full 30-track list when placeholders are selected.
    a.dispatchEvent(new Event("change", { bubbles: true }));
    b.dispatchEvent(new Event("change", { bubbles: true }));

    $("vrChange").value = "";
    $("vrAfterInput").value = "";
    $("opponents").value = "";
    $("placement").value = "";
    setStatus("", true);
    setDebug("");
  });
    $("btnPrev")?.addEventListener("click", async () => {
  if (currentPage <= 1) return;
  currentPage--;
  await loadMatches();
    
  });

    $("btnNext")?.addEventListener("click", async () => {
  // wenn wir totalMatches kennen, nicht über maxPage hinaus
  if (totalMatches != null) {
    const maxPage = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));
    if (currentPage >= maxPage) return;
  }

  currentPage++;
  await loadMatches();
    });
    // ===== Dialog Buttons (PART 7) =====
    $("btnCloseDlg")?.addEventListener("click", closeDlg);
    $("btnCancelDlg")?.addEventListener("click", closeDlg);
    $("btnSaveDlg")?.addEventListener("click", saveEditDialog);

    // Optional: ESC / Klick auf Backdrop -> schließt Dialog
    $("editDlg")?.addEventListener("cancel", (e) => { e.preventDefault(); closeDlg(); });

    function fixDatalistReopen(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;

    el.addEventListener("focus", () => {
        // Kurz leeren → Browser vergisst den Filter
        const v = el.value;
        el.value = "";
        requestAnimationFrame(() => el.value = v);
    });
    }

    // Für beide Felder aktivieren
    fixDatalistReopen("editPlacement");
    fixDatalistReopen("editOpponents");

  // Start
  (async () => {
    try {
      setDebug("App starting…");

    // Selects (Intermission/Track + Edit-Dialog) befüllen
    initSelects();

    // Guest mode is allowed: continue even without a session.
    await requireAuth();
    await refreshAll();

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
            const ok = confirm(`Import your Guest data into this account?\n\nGuest matches found: ${guest.length}\n\nOK = Import & clear Guest data\nCancel = Keep Guest data locally`);
            if (ok) {
              setStatus("Importing Guest data…", true);
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
              setStatus(`✅ Imported ${inserted} matches from Guest.`, true);
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
    const labelIntermission = document.getElementById("labelIntermissionStart");
    const labelTrack = document.getElementById("labelTrack");
    const trackPlaceholder = document.getElementById("trackPlaceholder");
    const intermissionSel = document.getElementById("intermission");

    function setMode(mode){
      modeBtns.forEach(b => {
        const active = b.dataset.mode === mode;
        b.classList.toggle("isActive", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });

      const isIntermission = (mode === "intermission");
      if (isIntermission) { try { resetIntermissionSelects(); } catch(e) {}
      try { refreshSuggestionOptionInStartSelect(intermissionSel); } catch(e) {}
      try { autoPrefillIntermissionStartIfFresh(); } catch(e) {} }

      // IMPORTANT:
      // The Track <select id="track"> is shared between Intermission-End and 3-Lap Track.
      // If the user previously selected an Intermission Start, the existing filter logic
      // can leave the Track dropdown in a filtered state unless we explicitly reset it.
      // Requirement: when switching to Track mode, clear the Track selection and restore
      // the full, unfiltered list.
      if (!isIntermission) {
        const trackSel = document.getElementById("track");
        // Clear start + trigger the existing bidirectional filter reset.
        if (intermissionSel) {
          intermissionSel.value = "";
          try { intermissionSel.dispatchEvent(new Event("change", { bubbles: true })); } catch(e) {}
        }
        // Clear track selection as requested.
        if (trackSel) {
          trackSel.value = "";
          try { trackSel.dispatchEvent(new Event("change", { bubbles: true })); } catch(e) {}
        }
      }
      if (fieldIntermission) fieldIntermission.style.display = isIntermission ? "" : "none";
      // intermissionSel is already cleared above (and change-dispatched) when leaving Intermission.
      if (labelIntermission) labelIntermission.textContent = "Intermission start";
      if (labelTrack) labelTrack.textContent = isIntermission ? "Intermission end" : "Track";
      if (trackPlaceholder) trackPlaceholder.textContent = isIntermission ? "Intermission end" : "Track";

      // Strategy ? icon should only appear when the current selection is valid.
      try { updateStratAvailability(); } catch(e) {}
    }

    modeBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode || "intermission")));
    // Default: Intermission (current behavior)
    setMode("intermission");

	    // --- Strategy popup (single element; content from strats.json) ---
	    let STRATS = null;
	    const stratPopup = document.getElementById('stratPopup');
	    const stratPopupBody = document.getElementById('stratPopupBody');
	    const stratBtnTrack = document.getElementById('stratBtnTrack');
	    const infoBtnVrAfter = document.getElementById('infoBtnVrAfter');
	    const infoBtnVrAfterEdit = document.getElementById('infoBtnVrAfterEdit');
	    const trackSel = document.getElementById('track');
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
	        const key = `${start}→${end}`;
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
	      if (!shouldShow && stratPopup && stratPopup.classList.contains('isOpen')) closePopup();
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
	      if (stratPopup && stratPopup.classList.contains('isOpen')) openPopup(document.getElementById(stratPopup.dataset.anchor) || stratBtnTrack );
	    });
	    trackSel && trackSel.addEventListener('change', ()=>{
	      try { updateStratAvailability(); } catch(e) {}
	      if (stratPopup && stratPopup.classList.contains('isOpen')) openPopup(document.getElementById(stratPopup.dataset.anchor) || stratBtnTrack );
	    });

	    loadStrats().finally(()=>{
	      try { updateStratAvailability(); } catch(e) {}
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

    // Edit dialog: same negative toggle for VR Δ
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

function setEditMode(mode){
  const bI = document.getElementById('editModeIntermission');
  const b3 = document.getElementById('editMode3lap');
  const fieldStart = document.getElementById('editIntermissionField');
  const lblTrack = document.getElementById('editTrackLabel');
  const isInter = (mode === 'intermission');
  if (bI) bI.classList.toggle('isActive', isInter);
  if (b3) b3.classList.toggle('isActive', !isInter);
  if (fieldStart) fieldStart.style.display = isInter ? '' : 'none';
  if (lblTrack) lblTrack.textContent = isInter ? 'Intermission end' : 'Track';
  // store on dialog for save
  const dlg = document.getElementById('editDlg');
  if (dlg) dlg.dataset.mode = isInter ? 'intermission' : '3lap';
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#editModeIntermission, #editMode3lap');
  if (!btn) return;
  setEditMode(btn.dataset.mode);
});
