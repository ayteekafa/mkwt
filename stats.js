  // ========= UI Helpers =========
  const $ = (id) => document.getElementById(id);

  // ===== Button UI helpers (charts) =====
  function setActiveButton(btn){
    try{
      if(!btn) return;
      // Prefer a local button group (so Chart 3 tabs + mode buttons don't deactivate each other)
      const group = btn.closest('[data-btn-group]') || btn.closest('.chartBtns') || btn.parentElement;
      if(group){ group.querySelectorAll('button').forEach(b=>b.classList.remove('active')); }
      btn.classList.add('active');
    }catch(e){ console.warn('[stats] setActiveButton failed', e); }
  }

  function setActiveById(btnId){
    const b = $(btnId);
    if(b) setActiveButton(b);
  }
  const $status = $("status");
  const $debug = $("debug");

  function setStatus(msg, ok=false){
    $status.className = "muted " + (ok ? "ok" : "bad");
    $status.textContent = msg || "";
  }
  function setDebug(msg){ $debug.textContent = msg || ""; }

  // ========= Backup / Restore / Logout (wie b_new_v2) =========


  window.addEventListener("error", (e) => {
    setStatus("JS Error: " + (e.message || e.type), false);
    setDebug(e.error?.stack || "");
  });

  let PROFILE = null;
  let matchesAsc = [];

  let STRATS_META_INTERMISSIONS = null;

  // ========= Global Settings =========
  // Filters out "early" low-VR matches from ALL stats calculations.
  // Stored locally (no DB changes): localStorage key "mkwt_min_vr_filter".
  const getMinVrFilter = () => (window.MKWT?.getMinVrFilter ? window.MKWT.getMinVrFilter() : 0);

  const passesMinVrFilter = (match, minVr) => (window.MKWT?.passesMinVrFilter ? window.MKWT.passesMinVrFilter(match, minVr) : true);

  async function loadStratsMeta(){
    if (STRATS_META_INTERMISSIONS) return STRATS_META_INTERMISSIONS;
    try{
      const res = await fetch("strats.json", { cache: "no-cache" });
      if(!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      STRATS_META_INTERMISSIONS = j?.META?.INTERMISSIONS || {};
    }catch(err){
      console.warn("[stats] failed to load strats.json META", err);
      STRATS_META_INTERMISSIONS = {};
    }
    return STRATS_META_INTERMISSIONS;
  }


    async function requireAuth() {
    return window.mkwtRequireAuth({
      pageName: "stats.html",
      allowGuest: true,
      tryBackupRestore: true,
      onDebug: (msg) => setDebug(msg),
      onAccount: async (session, client) => {
        supabaseClient = client;
        SESSION = session;
        try{ localStorage.setItem('mkwt_mode','account'); }catch(e){}
        $("userInfo").textContent = "Signed in as: " + (maskEmail(session.user?.email) || "unknown");
        try{ setNavAuthButton("account"); }catch(e){}
      },
      onGuest: async () => {
        window.IS_GUEST = true;
        window.supabaseClient = null;
        window.SESSION = null;
        try { $("userInfo").textContent = "Guest (local)"; } catch(e){}
        try{ setNavAuthButton("guest"); }catch(e){}
      }
    });
  }

  async function loadProfile() {
    if (isGuest() || !supabaseClient || !SESSION?.user?.id) {
      const g = loadGuestMatches();
      let cur = 0;
      if (g.length > 0) {
        const last = g.slice().sort((a,b)=> String(a.created_at||"").localeCompare(String(b.created_at||"")) || String(a.id||"").localeCompare(String(b.id||""))).at(-1);
        cur = Number(last?.vr_after);
        if (!Number.isFinite(cur)) cur = 0;
      }
      PROFILE = { id: "guest", nickname: "Guest", current_vr: cur };
      $("currentVr").textContent = String(cur);
      return;
    }
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, nickname, current_vr")
      .eq("id", SESSION.user.id)
      .maybeSingle();

    if (error) throw error;
    PROFILE = data || null;
    $("currentVr").textContent = String(PROFILE?.current_vr ?? "–");
  }

  // ========= Data Fetch =========
  async function getAllMatchesAsc() {
    // holt alle Matches in Pages (Supabase limit max 1000 pro request ist üblich)
    const pageSize = 1000;
    let from = 0;
    let all = [];

    if (isGuest()) {
      all = loadGuestMatches().slice().sort((a,b)=> String(a.created_at||"").localeCompare(String(b.created_at||"")) || String(a.id||"").localeCompare(String(b.id||"")));
    } else while (true) {
      const { data, error } = await supabaseClient
        .from("matches")
        .select("id, created_at, intermission, track, vr_change, vr_after, opponents, placement")
        .eq("user_id", SESSION.user.id)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Apply optional Min-VR filter (removes low-VR outliers from stats only)
    const minVr = getMinVrFilter();
    if (minVr > 0) {
      all = all.filter(m => passesMinVrFilter(m, minVr));
    }
    return all;
  }

  // ========= Math Helpers =========
  function linearRegression(xs, ys) {
    // y = a + b*x
    const n = xs.length;
    if (n < 2) return { a: 0, b: 0 };

    let sumX=0, sumY=0, sumXY=0, sumXX=0;
    for (let i=0; i<n; i++){
      const x = xs[i], y = ys[i];
      sumX += x; sumY += y; sumXY += x*y; sumXX += x*x;
    }
    const denom = (n*sumXX - sumX*sumX);
    const b = denom === 0 ? 0 : (n*sumXY - sumX*sumY) / denom;
    const a = (sumY - b*sumX) / n;
    return { a, b };
  }

  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

  
  // ========= Chart.js Helpers =========
  // Draw percent labels directly inside pie slices (defensive: skips on empty/too small slices).
  const piePercentLabelsPlugin = {
    id: "piePercentLabels",
    afterDatasetsDraw(chart, args, pluginOptions) {
      try {
        if (!chart || chart.config?.type !== "pie") return;
        const ctx = chart.ctx;
        const ds = chart.data?.datasets?.[0];
        if (!ctx || !ds) return;
        const data = (ds.data || []).map(Number);
        const total = data.reduce((a,v)=>a + (Number.isFinite(v)?v:0), 0);
        if (!total) return;

        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

        for (let i=0; i<meta.data.length; i++){
          const arc = meta.data[i];
          const v = Number(data[i] || 0);
          if (!Number.isFinite(v) || v <= 0) continue;

          const pct = (v / total) * 100;
          // skip tiny slices
          if (pct < 5) continue;

          const label = String(chart.data.labels?.[i] ?? "");
          const txt = label + " " + Math.round(pct) + "%";

          const { startAngle, endAngle, innerRadius, outerRadius, x, y } = arc.getProps(
            ["startAngle","endAngle","innerRadius","outerRadius","x","y"],
            true
          );
          const angle = (startAngle + endAngle) / 2;
          const r = innerRadius + (outerRadius - innerRadius) * 0.55;
          const tx = x + Math.cos(angle) * r;
          const ty = y + Math.sin(angle) * r;

          // Theme-aware text colors (important for Light mode)
          const root = getComputedStyle(document.documentElement);
          ctx.lineWidth = 3;
          ctx.strokeStyle = (root.getPropertyValue('--chart-label-stroke') || 'rgba(0,0,0,0.35)').trim();
          ctx.strokeText(txt, tx, ty);
          ctx.fillStyle = (root.getPropertyValue('--chart-label-fill') || '#fff').trim();
          ctx.fillText(txt, tx, ty);
        }
        ctx.restore();
      } catch (e) {
        console.warn("[stats] piePercentLabelsPlugin error", e);
      }
    }
  };

// ========= Charts =========
  let chartVr = null, chartPerf = null, chartPie5 = null, chartItTr = null, chartWeekly = null, chartBuckets = null;
  // Chart 1 window state
  let vrWindowMode = "all";
  let vrButtonsWired = false;

  // Chart 4 window state
  let itWindowMode = "all";
  let itButtonsWired = false;

  // Chart 5 window state
  let pie5WindowMode = "all";
  let pie5ButtonsWired = false;

function destroyCharts(){
    chartVr?.destroy(); chartPerf?.destroy(); chartPie5?.destroy(); chartItTr?.destroy(); chartWeekly?.destroy(); chartBuckets?.destroy();
    chartVr = chartPerf = chartPie5 = chartItTr = chartWeekly = chartBuckets = null;
  }

  function buildCharts(matchesAsc) {
    destroyCharts();

    // --- Diagramm 1: VR Verlauf (chronologisch) ---
    // Prefer stored vr_after snapshots if available. This guarantees a 1:1 match with the tracker table.
    // Fallback: reconstruct from profile current_vr + deltas (older rows might have null vr_after).
    const currentVr = Number(PROFILE?.current_vr ?? 8500);

    const labels1 = [];
    const vrSeries = [];

    const hasAnyAfter = Array.isArray(matchesAsc) && matchesAsc.some(m => Number.isFinite(Number(m?.vr_after)));

    if (hasAnyAfter) {
      for (let i = 0; i < matchesAsc.length; i++) {
        labels1.push(String(i + 1));
        const v = Number(matchesAsc[i]?.vr_after);
        if (Number.isFinite(v)) {
          vrSeries.push(v);
        } else {
          const deltasUpToI = matchesAsc.slice(0, i + 1).map(m => Number(m?.vr_change || 0));
          const totalDeltaUpToI = deltasUpToI.reduce((a, b) => a + b, 0);
          const deltasAll = matchesAsc.map(m => Number(m?.vr_change || 0));
          const totalDeltaAll = deltasAll.reduce((a, b) => a + b, 0);
          const baseVr = currentVr - totalDeltaAll;
          vrSeries.push(baseVr + totalDeltaUpToI);
        }
      }
    } else {
      const deltas = (matchesAsc || []).map(m => Number(m?.vr_change || 0));
      const totalDelta = deltas.reduce((a, b) => a + b, 0);
      const baseVr = currentVr - totalDelta;
      let running = baseVr;
      for (let i = 0; i < (matchesAsc || []).length; i++) {
        running += Number(matchesAsc[i]?.vr_change || 0);
        labels1.push(String(i + 1));
        vrSeries.push(running);
      }
    }

    // --- Window + Step-Average (10 steps) ---
    const labels1Full = labels1;
    const vrSeriesFull = vrSeries;

    // Ø VR für aktuell ausgewähltes Fenster (aus VR-Verlauf berechnet)
    const vrNumsFull = vrSeriesFull.map(Number).filter(Number.isFinite);

    
    // === Time-based windows (Overall / Last month / Last week) for VR History (Chart 1) ===
    function getMatchTsMs(m){
      // Supports Supabase created_at, numeric timestamps, or ISO strings.
      const raw = (m?.created_at ?? m?.timestamp ?? m?.time ?? m?.date ?? null);
      if (raw == null) return null;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        // assume ms if large, else seconds
        return raw > 1e12 ? raw : raw * 1000;
      }
      const t = Date.parse(String(raw));
      return Number.isFinite(t) ? t : null;
    }

    function getWindowCutoff(days){
      const now = Date.now();
      return now - (days * 24 * 60 * 60 * 1000);
    }

    // Filter matches by time window (used by multiple charts).
    // NOTE: Matches without a valid timestamp are excluded for month/week to avoid mixing
    // legacy rows into the window. If that yields 0 results but there ARE matches and none
    // have timestamps, we gracefully fall back to the most recent rows so charts still render.
    function filterMatchesByDays(days, src){
      const arr = Array.isArray(src) ? src : matchesAsc;
      if(!Array.isArray(arr) || !arr.length) return [];
      const cutoff = getWindowCutoff(days);
      const out = [];
      let anyTs = false;
      for(const m of arr){
        const t = getMatchTsMs(m);
        if(t != null){
          anyTs = true;
          if(t >= cutoff) out.push(m);
        }
      }
      if(out.length) return out;

      // Fallback: if nothing has a timestamp, keep charts usable by taking a recent slice.
      if(!anyTs){
        const fallbackN = Math.min(arr.length, days >= 30 ? 100 : 50);
        return arr.slice(-fallbackN);
      }
      return [];
    }

    function getVrWindow(mode){
      // Returns arrays filtered by timestamp + an index map back into matchesAsc
      const n = matchesAsc.length;
      if (!n) return { indices: [], labels: [], vr: [], matches: [] };

      if (mode === "month" || mode === "week") {
        const days = (mode === "month") ? 30 : 7;
        const cutoff = getWindowCutoff(days);

        const indices = [];
        for (let i = 0; i < n; i++) {
          const t = getMatchTsMs(matchesAsc[i]);
          // For time filters we EXCLUDE items without valid timestamps (prevents wrong windows)
          if (t != null && t >= cutoff) indices.push(i);
        }

        const labels = indices.map(i => labels1Full[i]);
        const vr = indices.map(i => vrSeriesFull[i]);
        const matches = indices.map(i => matchesAsc[i]);

        return { indices, labels, vr, matches };
      }

      // overall
      const indices = Array.from({length:n}, (_,i)=>i);
      return { indices, labels: labels1Full, vr: vrSeriesFull, matches: matchesAsc };
    }

    function computeAvgForWindow(mode){
      const w = getVrWindow(mode);
      const arr = (w?.vr || []).map(Number).filter(Number.isFinite);
      if (!arr.length) return null;
      return arr.reduce((a,v)=>a+v,0) / arr.length;
    }

    function updateAvgVrUI(mode){
      const el = $("avgVrWindow");
      if (!el) return;
      const avg = computeAvgForWindow(mode);
      el.textContent = (avg == null || !Number.isFinite(Number(avg))) ? "–" : Number(avg).toFixed(1);
    }
function computeStepAverage10(vrArr, forcedBucketSize){
      const steps = 10;
      const n = vrArr.length;
      const out = new Array(n).fill(null);
      if (!n) return out;

      // bucket sizes
      let sizes = [];
      if (Number.isFinite(forcedBucketSize) && forcedBucketSize > 0 && n >= forcedBucketSize * steps) {
        sizes = new Array(steps).fill(forcedBucketSize);
      } else {
        const base = Math.floor(n / steps);
        const rem = n % steps;
        for (let i=0;i<steps;i++){
          sizes.push(base + (i < rem ? 1 : 0));
        }
      }

      let idx = 0;
      for (let s=0; s<steps; s++){
        const size = sizes[s] || 0;
        const start = idx;
        const end = Math.min(n, idx + size);
        if (end > start){
          const slice = vrArr.slice(start, end).map(Number).filter(Number.isFinite);
          const avg = slice.length ? (slice.reduce((a,v)=>a+v,0) / slice.length) : null;
          for (let k=start; k<end; k++) out[k] = avg;
        }
        idx = end;
      }
      if (idx < n){
        let last = null;
        for (let i=n-1;i>=0;i--){ if (out[i] != null){ last = out[i]; break; } }
        for (let k=idx;k<n;k++) out[k] = last;
      }
      return out;
    }

    function computeAutoY(vrNums){
      const DEFAULT_MIN = 3000;
      const DEFAULT_MAX = 11000;

      let autoMin = DEFAULT_MIN;
      let autoMax = DEFAULT_MAX;

      const clean = (vrNums || []).map(Number).filter(Number.isFinite);
      if (clean.length >= 2) {
        const yMin = Math.min(...clean);
        const yMax = Math.max(...clean);

        const range = Math.max(50, yMax - yMin);
        const pad = Math.ceil(range * 0.10);

        autoMin = Math.max(DEFAULT_MIN, yMin - pad);
        autoMax = Math.min(DEFAULT_MAX, yMax + pad);

        if (autoMax - autoMin < 50) {
          const mid = (autoMin + autoMax) / 2;
          autoMin = Math.max(DEFAULT_MIN, mid - 25);
          autoMax = Math.min(DEFAULT_MAX, mid + 25);
        }
      }
      return { autoMin, autoMax };
    }

    function renderVrChart(mode){
      const canvas = $("chartVr");
      if (!canvas) { console.warn("[stats] chartVr canvas missing – skip Chart 1"); return; }

      const w = getVrWindow(mode);
      if (!w.vr.length) { console.warn("[stats] no VR data – skip Chart 1"); return; }

      // Step/treppe line: always 10 segments over the *filtered* window (10% buckets), same logic as before.
      const stepLine = computeStepAverage10(w.vr);

      const { autoMin, autoMax } = computeAutoY(w.vr);
      const idxMap = w.indices || [];

      if (!chartVr){
        chartVr = new Chart(canvas, {
          type: "line",
          data: {
            labels: w.labels,
            datasets: [
              { label: "VR", data: w.vr, tension: 0.15, pointRadius: 0, pointHitRadius: 12, borderWidth: 1 },
              { label: "Step Avg", data: stepLine, tension: 0, pointRadius: 0, pointHitRadius: 12, borderDash: [6,6], stepped: "after", borderWidth: 3 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "nearest", intersect: false },
            scales: { y: { min: autoMin, max: autoMax } },
            plugins: {
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const it = items?.[0];
                    if (!it) return "";
                    const localIdx = Math.max(0, Number(it.dataIndex));
                    const globalIdx = (idxMap[localIdx] != null) ? idxMap[localIdx] : localIdx;
                    const m = matchesAsc[globalIdx];
                    const dt = m?.created_at ? new Date(m.created_at) : null;
                    const when = dt && !isNaN(dt) ? dt.toLocaleString() : "";
                    return "Match " + String(globalIdx + 1) + (when ? (" • " + when) : "");
                  },
                  label: (ctx) => {
                    const lbl = ctx.dataset?.label || "";
                    if (lbl === "Step Avg") {
                      const y = Number(ctx.parsed.y);
                      return "Step Avg: " + (Number.isFinite(y) ? y.toFixed(1) : "–");
                    }
                    const localIdx = Math.max(0, Number(ctx.dataIndex));
                    const globalIdx = (idxMap[localIdx] != null) ? idxMap[localIdx] : localIdx;
                    const m = matchesAsc[globalIdx];
                    const t = (m?.intermission ? (String(m.intermission) + " → " + String(m.track || "")) : String(m?.track || ""));
                    const afterTxt = Number.isFinite(Number(m?.vr_after)) ? (" (vr_after)") : "";
                    return "VR: " + Number(ctx.parsed.y).toFixed(0) + afterTxt + (t ? (" • " + t) : "");
                  }
                }
              }
            }
          }
        });
      } else {
        chartVr.data.labels = w.labels;
        chartVr.data.datasets[0].data = w.vr;
        chartVr.data.datasets[1].data = stepLine;
        chartVr.options.scales.y.min = autoMin;
        chartVr.options.scales.y.max = autoMax;

        // update tooltip mapping for this window
        chartVr.options.plugins.tooltip.callbacks.title = (items) => {
          const it = items?.[0];
          if (!it) return "";
          const localIdx = Math.max(0, Number(it.dataIndex));
          const globalIdx = (idxMap[localIdx] != null) ? idxMap[localIdx] : localIdx;
          const m = matchesAsc[globalIdx];
          const dt = m?.created_at ? new Date(m.created_at) : null;
          const when = dt && !isNaN(dt) ? dt.toLocaleString() : "";
          return "Match " + String(globalIdx + 1) + (when ? (" • " + when) : "");
        };
        chartVr.options.plugins.tooltip.callbacks.label = (ctx) => {
          const lbl = ctx.dataset?.label || "";
          if (lbl === "Step Avg") {
            const y = Number(ctx.parsed.y);
            return "Step Avg: " + (Number.isFinite(y) ? y.toFixed(1) : "–");
          }
          const localIdx = Math.max(0, Number(ctx.dataIndex));
          const globalIdx = (idxMap[localIdx] != null) ? idxMap[localIdx] : localIdx;
          const m = matchesAsc[globalIdx];
          const t = (m?.intermission ? (String(m.intermission) + " → " + String(m.track || "")) : String(m?.track || ""));
          const afterTxt = Number.isFinite(Number(m?.vr_after)) ? (" (vr_after)") : "";
          return "VR: " + Number(ctx.parsed.y).toFixed(0) + afterTxt + (t ? (" • " + t) : "");
        };
        chartVr.update();
      }
    }

    renderVrChart(vrWindowMode || "all");
    updateAvgVrUI(vrWindowMode || "all");
    setTimeout(function(){ setActiveById((vrWindowMode==="month")?"btnVr100":(vrWindowMode==="week")?"btnVr50":"btnVrAll"); }, 0);
    setActiveById((vrWindowMode==="month")?"btnVr100":(vrWindowMode==="week")?"btnVr50":"btnVrAll");

    if (!vrButtonsWired) {
      const setMode = (mode) => { vrWindowMode = mode; renderVrChart(mode); updateAvgVrUI(mode); };
      $("btnVrAll")?.addEventListener("click", (e) => { setActiveButton(e.target); setMode("all"); });
      $("btnVr100")?.addEventListener("click", (e) => { setActiveButton(e.target); setMode("month"); });
      $("btnVr50")?.addEventListener("click", (e) => { setActiveButton(e.target); setMode("week"); });
      vrButtonsWired = true;
    }

    
    // --- Performance (Unified): Tracks + Intermission (Destiny / Separated) ---
    // One chart, three mode buttons. Sort controls remain: avg | win | count | alpha.
    // Clicking the same sort again reverses (desc <-> asc).

    // --- Build data sets (overall, not window-filtered) ---
    const only3Laps = matchesAsc.filter(m => (m.intermission == null || String(m.intermission).trim() === ""));
    const onlyIM = matchesAsc.filter(m => (m.intermission != null && String(m.intermission).trim() !== ""));

    // Tracks (3 laps) groups
    const trackGroups = new Map(); // track -> {sum,n,wins,losses}
    for (const m of only3Laps){
      const track = String(m.track ?? "").trim();
      const delta = Number(m.vr_change);
      if (!track) continue;
      const g = trackGroups.get(track) || { sum: 0, n: 0, wins: 0, losses: 0 };
      if (Number.isFinite(delta)) {
        g.sum += delta; g.n += 1;
        if (delta > 0) g.wins += 1;
        else if (delta < 0) g.losses += 1; // 0 ignored for winrate denom
      }
      trackGroups.set(track, g);
    }

    // Intermission (Routes) groups
    const imGroups = new Map(); // route -> {sum,n,wins,losses}
    for (const m of onlyIM){
      const start = String(m.intermission ?? "").trim();
      const end = String(m.track ?? "").trim();
      const route = (start && end) ? (start + " → " + end) : start;
      const delta = Number(m.vr_change);
      if(!start || !end) continue;

      const g = imGroups.get(route) || { sum: 0, n: 0, wins: 0, losses: 0 };
      if (Number.isFinite(delta)){
        g.sum += delta; g.n += 1;
        if (delta > 0) g.wins += 1;
        else if (delta < 0) g.losses += 1;
      }
      imGroups.set(route, g);
    }

    // Intermission Destiny groups (from STRATS_META_INTERMISSIONS destiny_group)
    const metaIM = STRATS_META_INTERMISSIONS || {};
    const destinyGroups = new Map(); // destiny_group -> {sum,n,wins,losses}

    function normalizeRouteKey(start, end){
      const s = String(start||"").trim();
      const e = String(end||"").trim();
      if(!s || !e) return "";
      return `${s}→${e}`; // matches META keys
    }
    function getDestinyGroup(start, end){
      const k = normalizeRouteKey(start, end);
      const meta = metaIM[k];
      if (meta && meta.destiny_group) return meta.destiny_group;
      return String(end||"").trim(); // fallback
    }

    for (const m of onlyIM){
      const start = String(m.intermission ?? "").trim();
      const end = String(m.track ?? "").trim();
      const dg = getDestinyGroup(start, end);
      if(!dg) continue;

      const delta = Number(m.vr_change);
      const g = destinyGroups.get(dg) || { sum: 0, n: 0, wins: 0, losses: 0 };
      if (Number.isFinite(delta)){
        g.sum += delta; g.n += 1;
        if (delta > 0) g.wins += 1;
        else if (delta < 0) g.losses += 1;
      }
      destinyGroups.set(dg, g);
    }

    function computeWinPct(wins, losses){
      const denom = (wins || 0) + (losses || 0);
      return denom ? ((wins / denom) * 100) : null;
    }

    function rowsFromTrackGroups(){
      const rows = [];
      for (const [track,g] of trackGroups.entries()){
        const avg = g.n ? (g.sum / g.n) : 0;
        rows.push({
          label: track,
          avg,
          win: computeWinPct(g.wins, g.losses),
          count: g.n || 0,
          wins: g.wins || 0,
          losses: g.losses || 0
        });
      }
      return rows;
    }

    function rowsFromImMap(map){
      const rows = [];
      for (const [label,g] of map.entries()){
        const avg = g.n ? (g.sum / g.n) : 0;
        rows.push({
          label,
          avg,
          win: computeWinPct(g.wins, g.losses),
          count: g.n || 0,
          wins: g.wins || 0,
          losses: g.losses || 0
        });
      }
      return rows;
    }

    function sortPerfRows(rows, key, dir){
      const mul = (dir === "asc") ? 1 : -1;
      const safeNum = (v) => (v == null || !Number.isFinite(Number(v))) ? -Infinity : Number(v);
      rows.sort((a,b)=>{
        if(key === "alpha"){
          return mul * a.label.localeCompare(b.label, "de");
        }
        if(key === "count"){
          const d = (a.count - b.count);
          if(d !== 0) return mul * d;
          const d2 = (a.avg - b.avg);
          if(d2 !== 0) return mul * d2;
          return a.label.localeCompare(b.label, "de");
        }
        if(key === "win"){
          const da = safeNum(a.win), db = safeNum(b.win);
          const d = (da - db);
          if(d !== 0) return mul * d;
          const d2 = (a.avg - b.avg);
          if(d2 !== 0) return mul * d2;
          return a.label.localeCompare(b.label, "de");
        }
        // avg
        const d = (a.avg - b.avg);
        if(d !== 0) return mul * d;
        const da = safeNum(a.win), db = safeNum(b.win);
        const d2 = (da - db);
        if(d2 !== 0) return mul * d2;
        return a.label.localeCompare(b.label, "de");
      });
      return rows;
    }

    // --- Unified chart state ---
    const perfCanvas = $("chartPerf");
    const $perfSel = $("perfSelected");
    let chartPerf = null;

    let perfMode = "tracks";     // tracks | im_destiny | im_routes
    let perfSortKey = "avg";     // avg | win | count | alpha
    let perfSortDir = "desc";    // desc | asc
    let perfRowsLast = [];
    let perfWired = false;

    function setPerfMode(mode, btn){
      perfMode = mode;
      if(btn) setActiveButton(btn);
      renderPerfChart();
    }

    function setPerfSort(key, btn){
      if (perfSortKey === key) {
        perfSortDir = (perfSortDir === "desc") ? "asc" : "desc";
      } else {
        perfSortKey = key;
        perfSortDir = (key === "alpha") ? "asc" : "desc";
      }
      if(btn) setActiveButton(btn);
      renderPerfChart();
    }

    function updatePerfSelectedByIndex(i){
      if(!$perfSel) return;
      if(i == null || i < 0 || i >= perfRowsLast.length){
        $perfSel.textContent = "";
        return;
      }
      const r = perfRowsLast[i];
      const wrTxt = (r.win == null) ? "–" : (Number(r.win).toFixed(1) + "%");
      $perfSel.textContent = `${r.label}  •  Avg VR Δ: ${Number(r.avg).toFixed(2)} (matches: ${r.count})  •  Win rate: ${wrTxt}`;
    }

    function renderPerfChart(){
      if(!perfCanvas){
        console.warn("[stats] chartPerf canvas missing – skip Performance chart");
        return;
      }

      let baseRows = [];
      let title = "";
      let cap = null;

      if(perfMode === "tracks"){
        baseRows = rowsFromTrackGroups();
        title = "Ø VR Δ (Tracks)";
        cap = null; // show all
      } else if(perfMode === "im_destiny"){
        baseRows = rowsFromImMap(destinyGroups);
        title = "Ø VR Δ (Intermission Destiny)";
        cap = 40;
      } else {
        baseRows = rowsFromImMap(imGroups);
        title = "Ø VR Δ (Intermission Separated)";
        cap = 40;
      }

      if(!baseRows.length){
        if($perfSel) $perfSel.textContent = "No data for this mode yet.";
        try { chartPerf?.destroy(); } catch {}
        return;
      }

      const rows = sortPerfRows(baseRows, perfSortKey, perfSortDir);
      perfRowsLast = cap ? rows.slice(0, cap) : rows;

      const labels = perfRowsLast.map(r => r.label);
      const dataArr = perfRowsLast.map(r => r.avg);

      const bg = dataArr.map(v => {
        const n = Number(v);
        if (!Number.isFinite(n)) return "rgba(140,140,140,0.25)";
        return n < 0 ? "rgba(255,80,80,0.85)" : "rgba(60,190,120,0.85)";
      });
      const br = dataArr.map(v => {
        const n = Number(v);
        if (!Number.isFinite(n)) return "rgba(140,140,140,0.5)";
        return n < 0 ? "rgb(255,80,80)" : "rgb(60,190,120)";
      });

      try { chartPerf?.destroy(); } catch {}
      chartPerf = new Chart(perfCanvas, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: title,
            data: dataArr,
            backgroundColor: bg,
            borderColor: br,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          onClick: (evt, els) => {
            const first = els?.[0];
            if(!first) return;
            updatePerfSelectedByIndex(first.index);
          },
          scales: {
            x: { beginAtZero: true, ticks: { callback: (v)=> Number(v).toFixed(0) } },
            y: { ticks: { autoSkip: false } }
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => items?.[0]?.label ? items[0].label : "",
                label: (ctx) => {
                  const r = perfRowsLast[ctx.dataIndex];
                  const wrTxt = (r.win == null) ? "–" : (Number(r.win).toFixed(1) + "%");
                  return [
                    `Avg VR Δ: ${Number(r.avg).toFixed(2)} (matches: ${r.count})`,
                    `Win rate: ${wrTxt}`
                  ];
                }
              }
            }
          }
        }
      });

      updatePerfSelectedByIndex(null);

      if(!perfWired){
        // Mode buttons
        $("btnPerfTracks")?.addEventListener("click", (e)=> setPerfMode("tracks", e.target));
        $("btnPerfImDestiny")?.addEventListener("click", (e)=> setPerfMode("im_destiny", e.target));
        $("btnPerfImRoutes")?.addEventListener("click", (e)=> setPerfMode("im_routes", e.target));

        // Sort buttons (re-use existing IDs)
        $("btnC2SortAvg")?.addEventListener("click", (e) => setPerfSort("avg", e.target));
        $("btnC2SortWin")?.addEventListener("click", (e) => setPerfSort("win", e.target));
        $("btnC2SortCount")?.addEventListener("click", (e) => setPerfSort("count", e.target));
        $("btnC2SortAlpha")?.addEventListener("click", (e) => setPerfSort("alpha", e.target));

        perfWired = true;
      }
    }

    // Defaults
    setActiveById("btnPerfTracks");
    setActiveById("btnC2SortAvg");
    renderPerfChart();


// --- Diagramm 5: Track Distribution (Pie) + Avg gain / Winrate --- 
    try{
      const pieCanvas = $("chartPie5");
      if(!pieCanvas){
        console.warn("[stats] chartPie5 canvas missing – skip Chart 5");
      } else {
        const pickPie5Window = () => {
          if(pie5WindowMode === "month") return filterMatchesByDays(30);
          if(pie5WindowMode === "week") return filterMatchesByDays(7);
          return matchesAsc;
        };

        const calcWinratePct = (arr) => {
          let w = 0, l = 0;
          for(const m of arr){
            const v = Number(m?.vr_change);
            if(!Number.isFinite(v)) continue;
            if(v > 0) w++; else l++; // 0 counts as loss
          }
          const denom = w + l;
          return denom ? (w / denom * 100) : null;
        };

        const calcAvg = (arr) => {
          let sum = 0, n = 0;
          for(const m of arr){
            const v = Number(m?.vr_change);
            if(!Number.isFinite(v)) continue;
            sum += v; n++;
          }
          return n ? (sum / n) : null;
        };

        const renderChart5 = () => {
          const windowMatches = pickPie5Window();

          const isIm = (m) => (m?.intermission != null && String(m.intermission).trim() !== "");
          const isTr = (m) => (m?.track != null && String(m.track).trim() !== "") && !isIm(m);

          const imMatches = windowMatches.filter(isIm);
          const trMatches = windowMatches.filter(isTr);

          const imCount = imMatches.length;
          const trCount = trMatches.length;
          const total = imCount + trCount;

          // KPI text
          const avgAll = calcAvg(windowMatches);
          const wrAll = calcWinratePct(windowMatches);
          const avgTr = calcAvg(trMatches);
          const avgIm = calcAvg(imMatches);
          const wrTr = calcWinratePct(trMatches);
          const wrIm = calcWinratePct(imMatches);

          $("c5AvgAll").textContent = (avgAll == null) ? "–" : (avgAll >= 0 ? "+" : "") + avgAll.toFixed(1);
          $("c5WinAll").textContent = (wrAll == null) ? "–" : wrAll.toFixed(1) + "%";

          $("c5AvgTrack").textContent = (avgTr == null) ? "–" : (avgTr >= 0 ? "+" : "") + avgTr.toFixed(1);
          $("c5AvgIm").textContent = (avgIm == null) ? "–" : (avgIm >= 0 ? "+" : "") + avgIm.toFixed(1);

          $("c5WinTrack").textContent = (wrTr == null) ? "–" : wrTr.toFixed(1) + "%";
          $("c5WinIm").textContent = (wrIm == null) ? "–" : wrIm.toFixed(1) + "%";

          // Pie
          if(!total){
            try{ chartPie5?.destroy(); }catch{}
            chartPie5 = null;
            console.warn("[stats] no data for Chart 5 pie – skip");
            return;
          }
          if (typeof Chart === "undefined") {
            console.warn("[stats] Chart.js not loaded – skip Chart 5");
            return;
          }

          try{ chartPie5?.destroy(); }catch{}
          chartPie5 = new Chart(pieCanvas, {
            type: "pie",
            data: {
              labels: ["Intermission", "Tracks"],
              datasets: [{
                data: [imCount, trCount],
                backgroundColor: ["rgba(77,163,255,0.85)", "rgba(255,92,92,0.85)"],
                borderColor: ["rgb(77,163,255)", "rgb(255,92,92)"],
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                datalabels: {
                  display: true,
                  formatter: (value, ctx) => {
                    const data = (ctx.chart?.data?.datasets?.[0]?.data || []).map(n => Number(n) || 0);
                    const tot = data.reduce((a,b)=>a+b,0) || 1;
                    const pct = (Number(value)||0) / tot * 100;
                    return pct.toFixed(1) + "%";
                  },
                  font: { weight: "700" }
                },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const v = Number(ctx.parsed);
                      const pct = total ? (v/total*100) : 0;
                      return `${ctx.label}: ${v} (${pct.toFixed(1)}%)`;
                    }
                  }
                },
                legend: { position: "bottom" }
              }
            }
          });
        };

        const setPie5Window = (mode, btn) => {
          pie5WindowMode = mode;
          if(btn) setActiveButton(btn);
          renderChart5();
        };

        if(!pie5ButtonsWired){
          $("btnPie5All")?.addEventListener("click", (e)=> setPie5Window("all", e.target));
          $("btnPie5100")?.addEventListener("click", (e)=> setPie5Window("month", e.target));
          $("btnPie550")?.addEventListener("click", (e)=> setPie5Window("week", e.target));
          pie5ButtonsWired = true;
        }

        // Default
        setActiveById("btnPie5All");
        renderChart5();
      }
    }catch(err){
      console.warn("[stats] Chart 5 failed", err);
    }
    // --- Chart 6: VR History (Weekly) ---
    try{
      const c6 = $("chartWeekly");
      if (c6) {
        let weeklyMode = "vravg"; // "vravg" | "gains"
        let c6Pinned = null;

        function isoWeekKeyUTC(d){
          // ISO week based on UTC date
          const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          // Thursday in current week decides the year.
          const day = date.getUTCDay() || 7; // 1..7
          date.setUTCDate(date.getUTCDate() + 4 - day);
          const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
          const year = date.getUTCFullYear();
          return year + "-W" + String(weekNo).padStart(2,"0");
        }
        function isoWeekStartEndUTC(weekKey){
          // weekKey: YYYY-Www
          const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
          if(!m) return { start:null, end:null };
          const year = Number(m[1]);
          const week = Number(m[2]);
          // ISO week 1 is the week with Jan 4th in it.
          const jan4 = new Date(Date.UTC(year,0,4));
          const day = jan4.getUTCDay() || 7;
          const monday = new Date(jan4);
          monday.setUTCDate(jan4.getUTCDate() - (day-1) + (week-1)*7);
          const sunday = new Date(monday);
          sunday.setUTCDate(monday.getUTCDate()+6);
          return { start: monday, end: sunday };
        }
        function fmtDateUTC(d){
          if(!d) return "";
          const dd = String(d.getUTCDate()).padStart(2,"0");
          const mm = String(d.getUTCMonth()+1).padStart(2,"0");
          const yy = d.getUTCFullYear();
          return dd + "." + mm + "." + yy;
        }

        function buildWeekly(matchesAsc){
          const buckets = new Map(); // weekKey -> {matches:[]}
          // reconstruct VR if vr_after missing
          let prevVr = Number.isFinite(Number(PROFILE?.current_vr)) ? Number(PROFILE.current_vr) : null;

          for (let i=0;i<matchesAsc.length;i++){
            const m = matchesAsc[i];
            const t = new Date(m.created_at);
            if (Number.isNaN(t.getTime())) continue;
            const wk = isoWeekKeyUTC(t);
            if(!buckets.has(wk)) buckets.set(wk, { weekKey: wk, matches: [] });
            // compute before/after VR snapshots robustly
            const delta = Number(m.vr_change || 0);
            let after = Number.isFinite(Number(m.vr_after)) ? Number(m.vr_after) : null;
            let before = null;

            if (after != null) {
              before = after - delta;
              prevVr = after;
            } else if (prevVr != null) {
              before = prevVr;
              after = prevVr + delta;
              prevVr = after;
            }

            buckets.get(wk).matches.push({
              created_at: m.created_at,
              intermission: m.intermission,
              track: m.track,
              vr_change: delta,
              vr_before: before,
              vr_after: after
            });
          }

          const weekKeys = Array.from(buckets.keys()).sort();
          const labels = [];
          const vrAvgArr = [];
          const trackAvgArr = [];
          const imAvgArr = [];
          const meta = []; // per index

          for (let idx=0; idx<weekKeys.length; idx++){
            const wk = weekKeys[idx];
            const b = buckets.get(wk);
            const ms = b.matches.sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
            if(ms.length === 0) continue;

            // sessions in this week (gap >45min)
            let sessions = 1;
            for (let j=1;j<ms.length;j++){
              const t0 = new Date(ms[j-1].created_at).getTime();
              const t1 = new Date(ms[j].created_at).getTime();
              if (Number.isFinite(t0) && Number.isFinite(t1) && (t1 - t0) > 45*60*1000) sessions++;
            }
            const matchesCount = ms.length;
            const avgPerSession = sessions ? (matchesCount / sessions) : matchesCount;

            // VR Average (weekly): avg of [startVR(before first match), vr_after each match]
            const startVr = ms[0].vr_before;
            const afterList = ms.map(x => x.vr_after).filter(v => Number.isFinite(Number(v))).map(Number);
            let vrAvg = null;
            if (Number.isFinite(Number(startVr)) && afterList.length === ms.length) {
              const sum = afterList.reduce((a,b)=>a+b,0) + Number(startVr);
              vrAvg = sum / (ms.length + 1);
            } else if (afterList.length) {
              // fallback: average of available afterList
              vrAvg = afterList.reduce((a,b)=>a+b,0) / afterList.length;
            }

            // Track vs Intermission weekly avg delta
            const deltasTrack = [];
            const deltasIm = [];
            for (const x of ms){
              const d = Number(x.vr_change || 0);
              const isIm = !!(x.intermission && String(x.intermission).trim() !== "");
              if (isIm) deltasIm.push(d);
              else deltasTrack.push(d);
            }
            const trackAvg = deltasTrack.length ? (deltasTrack.reduce((a,b)=>a+b,0) / deltasTrack.length) : null;
            const imAvg = deltasIm.length ? (deltasIm.reduce((a,b)=>a+b,0) / deltasIm.length) : null;

            const { start, end } = isoWeekStartEndUTC(wk);
            const weekLabel = "Week " + (labels.length + 1);
            labels.push(weekLabel);
            vrAvgArr.push(vrAvg);
            trackAvgArr.push(trackAvg);
            imAvgArr.push(imAvg);
            meta.push({
              weekKey: wk,
              weekLabel,
              range: (start && end) ? (fmtDateUTC(start) + "–" + fmtDateUTC(end)) : wk,
              matches: matchesCount,
              sessions,
              avgPerSession
            });
          }

          return { labels, vrAvgArr, trackAvgArr, imAvgArr, meta };
        }

        const weeklyData = buildWeekly(matchesAsc);

        function setC6Hint(index){
          const hint = $("c6Hint");
          if(!hint) return;
          if(index == null || !weeklyData.meta[index]) {
            hint.textContent = "Tap a bar to pin details (mobile-friendly).";
            return;
          }
          const m = weeklyData.meta[index];
          hint.textContent = `${m.weekLabel} (${m.range}) • Played ${m.matches} matches • Sessions ${m.sessions} (${m.avgPerSession.toFixed(1)} / session)`;
        }

        function c6Datasets(){
          if(weeklyMode === "vravg"){
            return [{
              label: "VR Average",
              data: weeklyData.vrAvgArr,
              borderWidth: 0
            }];
          }
          return [
            { label: "Track avg Δ", data: weeklyData.trackAvgArr, borderWidth: 0 },
            { label: "Intermission avg Δ", data: weeklyData.imAvgArr, borderWidth: 0 }
          ];
        }

        function c6YTitle(){
          return (weeklyMode === "vravg") ? "VR (weekly average)" : "Avg VR change (per match)";
        }

        function buildChart(){
          chartWeekly?.destroy();
          chartWeekly = new Chart(c6.getContext("2d"), {
            type: "bar",
            data: { labels: weeklyData.labels, datasets: c6Datasets() },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 6, maxRotation: 0, minRotation: 0, callback: (v, i)=> (weeklyData.labels[i] ?? "") } },
                y: { beginAtZero: false, title: { display: true, text: c6YTitle() } }
              },
              plugins: {
                legend: { display: true },
                tooltip: {
                  callbacks: {
                    title: (items) => {
                      const i = items?.[0]?.dataIndex;
                      const m = weeklyData.meta[i];
                      return m ? (m.weekLabel + " • " + m.range) : "";
                    },
                    afterBody: (items) => {
                      const i = items?.[0]?.dataIndex;
                      const m = weeklyData.meta[i];
                      if(!m) return "";
                      return [
                        "Played " + m.matches + " times this week",
                        "Sessions: " + m.sessions + " • " + m.avgPerSession.toFixed(1) + " matches / session"
                      ];
                    }
                  }
                }
              },
              onClick: (evt, elements) => {
                if (!elements || !elements.length) {
                  c6Pinned = null;
                  setC6Hint(null);
                  return;
                }
                const i = elements[0].index;
                c6Pinned = (c6Pinned === i) ? null : i;
                setC6Hint(c6Pinned);
              }
            }
          });
          setC6Hint(c6Pinned);
        }

        function setWeeklyMode(mode, btn){
          weeklyMode = mode;
          if(btn) setActiveButton(btn);
          buildChart();
        }

        // wire buttons once
        $("btnWkVrAvg")?.addEventListener("click", (e)=> setWeeklyMode("vravg", e.target));
        $("btnWkGains")?.addEventListener("click", (e)=> setWeeklyMode("gains", e.target));

        // default
        setActiveById("btnWkVrAvg");
        buildChart();
      }
    }catch(err){
      console.warn("[stats] Chart 6 failed", err);
    }
    // --- Chart 7: VR Performance Sweetspot ---
    try{
      const bucketCanvas = $("chartBuckets");
      const $bucketSel = $("bucketSelected");

      // state lives across rebuilds
      window.__bucketMode = window.__bucketMode || "overall"; // overall | track | im

      function computeMatchSnapshots(matchesAsc){
        const currentVr = Number(PROFILE?.current_vr ?? 8500);

        const deltas = (matchesAsc || []).map(m => Number(m?.vr_change || 0));
        const totalDeltaAll = deltas.reduce((a,b)=>a+b,0);
        const baseVr = currentVr - totalDeltaAll;

        let running = baseVr;      // vr_before of first (if no vr_after exists)
        let lastAfter = null;      // last known vr_after snapshot

        const out = [];
        for (let i=0;i<(matchesAsc||[]).length;i++){
          const m = matchesAsc[i];
          const delta = Number(m?.vr_change || 0);
          const after = Number.isFinite(Number(m?.vr_after)) ? Number(m.vr_after) : null;

          let before = null;
          let useAfter = null;

          if (after != null){
            before = after - delta;
            useAfter = after;
            lastAfter = after;
            // keep running roughly consistent for next fallback
            running = after;
          } else if (lastAfter != null){
            before = lastAfter;
            useAfter = lastAfter + delta;
            lastAfter = useAfter;
            running = useAfter;
          } else {
            before = running;
            useAfter = running + delta;
            running = useAfter;
          }

          const isIm = (m?.intermission != null && String(m.intermission).trim() !== "");
          out.push({
            vr_before: before,
            vr_after: useAfter,
            vr_change: Number.isFinite(delta) ? delta : 0,
            isIntermission: !!isIm
          });
        }
        return out;
      }

      
function buildBuckets(center){
  // 10 buckets, 35 VR width each, split around center (avg VR)
  // Bucket 5 covers [center-35, center] and Bucket 6 covers [center+1, center+35]
  const c = Number(center);
  const step = 35;
  const buckets = [
    { key:"L5", min:c-5*step, max:c-4*step-1 },
    { key:"L4", min:c-4*step, max:c-3*step-1 },
    { key:"L3", min:c-3*step, max:c-2*step-1 },
    { key:"L2", min:c-2*step, max:c-1*step-1 },
    { key:"L1", min:c-1*step, max:c },
    { key:"R1", min:c+1,      max:c+1*step },
    { key:"R2", min:c+1*step+1, max:c+2*step },
    { key:"R3", min:c+2*step+1, max:c+3*step },
    { key:"R4", min:c+3*step+1, max:c+4*step },
    { key:"R5", min:c+4*step+1, max:c+5*step }
  ];
  buckets.forEach(b=>{
    b.label = `${b.min}–${b.max}`;
  });
  return buckets;
}

      function calcBucketStats(){
        const snaps = computeMatchSnapshots(matchesAsc);
        const befores = snaps.map(s=>Number(s.vr_before)).filter(Number.isFinite);
        const vrAvg = befores.length ? (befores.reduce((a,b)=>a+b,0)/befores.length) : Number(PROFILE?.current_vr ?? 8500);
        const center = Math.round(vrAvg);

        const buckets = buildBuckets(center);
        const stats = buckets.map(b=>({
          ...b,
          // totals
          count: 0, sum: 0, wins: 0,
          // tracks
          countTr: 0, sumTr: 0, winsTr: 0,
          // intermission
          countIm: 0, sumIm: 0, winsIm: 0
        }));

        function idxForBefore(v){
          for(let i=0;i<stats.length;i++){
            const b = stats[i];
            if (v >= b.min && v <= b.max) return i;
          }
          return -1;
        }

        for (const s of snaps){
          const vb = Number(s.vr_before);
          if(!Number.isFinite(vb)) continue;
          const i = idxForBefore(vb);
          if(i < 0) continue;

          const d = Number(s.vr_change);
          const win = d > 0; // 0 counts as loss
          const row = stats[i];

          row.count += 1;
          row.sum += d;
          if(win) row.wins += 1;

          if(s.isIntermission){
            row.countIm += 1;
            row.sumIm += d;
            if(win) row.winsIm += 1;
          } else {
            row.countTr += 1;
            row.sumTr += d;
            if(win) row.winsTr += 1;
          }
        }

        // finalize derived metrics
        stats.forEach(r=>{
          r.avgNetTotal = r.count ? (r.sum / r.count) : 0;
          r.avgNetTracks = r.countTr ? (r.sumTr / r.countTr) : 0;
          r.avgNetIm = r.countIm ? (r.sumIm / r.countIm) : 0;

          r.winrateOverall = r.count ? (r.wins / r.count * 100) : null;
          r.winrateTracks = r.countTr ? (r.winsTr / r.countTr * 100) : null;
          r.winrateIm = r.countIm ? (r.winsIm / r.countIm * 100) : null;
        });

        
// baseline = combined of the two buckets closest to average (L1 and R1)
const midA = stats[4];
const midB = stats[5];
function combineAvg(sumA, nA, sumB, nB){
  const n = (nA||0) + (nB||0);
  return n ? ((sumA||0) + (sumB||0)) / n : 0;
}
const baseline = {
  avgNetTotal: combineAvg(midA?.sum, midA?.count, midB?.sum, midB?.count),
  avgNetTracks: combineAvg(midA?.sumTr, midA?.countTr, midB?.sumTr, midB?.countTr),
  avgNetIm: combineAvg(midA?.sumIm, midA?.countIm, midB?.sumIm, midB?.countIm)
};

return { center, vrAvg, stats, baseline };
      }

      const zeroLinePlugin = {
        id: "zeroLineBuckets",
        afterDraw(chart){
          try{
            const y = chart.scales?.y;
            const ca = chart.chartArea;
            if(!y || !ca) return;
            const y0 = y.getPixelForValue(0);
            // only draw if 0 is within visible area
            if(y0 < ca.top || y0 > ca.bottom) return;

            const ctx = chart.ctx;
            ctx.save();

            // main zero line
            ctx.beginPath();
            ctx.moveTo(ca.left, y0);
            ctx.lineTo(ca.right, y0);
            ctx.lineWidth = 3;
            const root = getComputedStyle(document.documentElement);
            ctx.strokeStyle = (root.getPropertyValue('--chart-zero-line') || 'rgba(255,255,255,0.85)').trim();
            ctx.setLineDash([7,6]);
            ctx.stroke();

            ctx.restore();
          }catch(e){}
        }
      };

      
const centerDividerPlugin = {
  id: "centerDividerBuckets",
  afterDraw(chart){
    try{
      const x = chart.scales?.x;
      const ca = chart.chartArea;
      if(!x || !ca) return;

      // split is between bucket index 4 (L1) and 5 (R1)
      const iLeft = 4;
      const iRight = 5;

      const pL = x.getPixelForTick(iLeft);
      const pR = x.getPixelForTick(iRight);
      if(![pL,pR].every(Number.isFinite)) return;

      const boundary = (pL + pR) / 2;

      // also compute the wider "avg zone" span (two middle buckets) for subtle shading
      const pLPrev = x.getPixelForTick(iLeft-1);
      const pRNext = x.getPixelForTick(iRight+1);
      const leftEdge = Number.isFinite(pLPrev) ? (pLPrev + pL)/2 : ca.left;
      const rightEdge = Number.isFinite(pRNext) ? (pR + pRNext)/2 : ca.right;

      const ctx = chart.ctx;
      ctx.save();

      // subtle shading for the two middle buckets
      const root = getComputedStyle(document.documentElement);
      ctx.fillStyle = (root.getPropertyValue('--primary-soft') || 'rgba(43,108,255,0.12)').trim();
      ctx.fillRect(leftEdge, ca.top, rightEdge - leftEdge, ca.bottom - ca.top);

      // main divider line
      ctx.beginPath();
      ctx.moveTo(boundary, ca.top);
      ctx.lineTo(boundary, ca.bottom);
      ctx.lineWidth = 3;
      ctx.strokeStyle = (root.getPropertyValue('--primary-strong') || 'rgba(43,108,255,0.85)').trim();
      ctx.setLineDash([6,6]);
      ctx.stroke();

      // small labels
      ctx.setLineDash([]);
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = (root.getPropertyValue('--chart-muted') || 'rgba(255,255,255,0.55)').trim();
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText("VR < Avg", ca.left + 4, ca.top + 4);
      ctx.textAlign = "right";
      ctx.fillText("VR > Avg", ca.right - 4, ca.top + 4);

      ctx.restore();
    }catch(e){}
  }
};

      
// Draw a vertical "break-even" line where Avg Net Gain crosses y=0 (progress gets blocked).
const breakEvenXPlugin = {
  id: "breakEvenX",
  afterDraw(chart){
    try{
      const mode = (window.__bucketMode || "overall");
      // This line is meant to answer: "Where would I stabilize if I only played Tracks?"
      // So we only show it in Track-only mode.
      if(mode !== "track") return;
      const x = chart.scales?.x;
      const y = chart.scales?.y;
      const ca = chart.chartArea;
      const ds = chart.data?.datasets?.[0]?.data || [];
      if(!x || !y || !ca || ds.length < 2) return;

      // Find first adjacent pair that crosses 0
      let cross = null;
      for(let i=0;i<ds.length-1;i++){
        const a = Number(ds[i]);
        const b = Number(ds[i+1]);
        if(!Number.isFinite(a) || !Number.isFinite(b)) continue;
        if((a === 0) || (a < 0 && b > 0) || (a > 0 && b < 0)){
          cross = { i, a, b };
          break;
        }
      }
      if(!cross) return;

      const pA = x.getPixelForTick(cross.i);
      const pB = x.getPixelForTick(cross.i+1);
      if(!Number.isFinite(pA) || !Number.isFinite(pB) || pA === pB) return;

      // Linear interpolate x-position where value hits 0
      const t = (cross.a === 0) ? 0 : ((0 - cross.a) / (cross.b - cross.a));
      const px = pA + t * (pB - pA);

      const y0 = y.getPixelForValue(0);

      const ctx = chart.ctx;
      ctx.save();

      ctx.beginPath();
      ctx.moveTo(px, ca.top);
      ctx.lineTo(px, ca.bottom);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,180,0,0.85)";
      ctx.setLineDash([8,6]);
      ctx.stroke();

      // Label near the y=0 intersection (if visible), else near bottom
      const labelY = (y0 >= ca.top && y0 <= ca.bottom) ? (y0 - 6) : (ca.bottom - 6);
      ctx.setLineDash([]);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,180,0,0.90)";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Track-only expected VR", px, Math.max(ca.top + 14, labelY));

      ctx.restore();
    }catch(e){}
  }
};

const bucketSeparatorsPlugin = {
        id: "bucketSeparators",
        afterDraw(chart){
          try{
            const x = chart.scales?.x;
            const ca = chart.chartArea;
            if(!x || !ca) return;
            const ctx = chart.ctx;
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(43,108,255,0.45)";
            ctx.setLineDash([2,4]);
            // draw boundaries between every adjacent tick
            const nTicks = chart.data.labels?.length || 0;
            for(let i=0;i<nTicks-1;i++){
              const pA = x.getPixelForTick(i);
              const pB = x.getPixelForTick(i+1);
              if(!Number.isFinite(pA) || !Number.isFinite(pB)) continue;
              const boundary = (pA + pB) / 2;
              ctx.beginPath();
              ctx.moveTo(boundary, ca.top);
              ctx.lineTo(boundary, ca.bottom);
              ctx.stroke();
            }
            ctx.restore();
          }catch(e){}
        }
      };


      const bucketAgg = calcBucketStats();

      function modeValue(r){
        const m = window.__bucketMode || "overall";
        if(m === "track") return r.avgNetTracks;
        if(m === "im") return r.avgNetIm;
        return r.avgNetTotal;
      }

      
      function shortenRangeLabel(lbl){
        try{
          if(typeof lbl !== "string") return lbl;
          const parts = lbl.split("–");
          if(parts.length !== 2) return lbl;
          const a = parts[0].trim();
          const b = parts[1].trim();
          // if same leading digits, shorten right side to last 2-3 digits
          let k = 0;
          while(k < a.length && k < b.length && a[k] === b[k]) k++;
          const shared = a.slice(0, k);
          const bShort = (shared.length >= 2 && b.length - shared.length >= 2) ? b.slice(shared.length) : b;
          // keep readability: if bShort is too short, keep last 3 digits
          const bFinal = bShort.length < 2 ? b.slice(-3) : bShort;
          return `${a}–${bFinal}`;
        }catch(e){ return lbl; }
      }
function renderBuckets(){
        if(!bucketCanvas){
          console.warn("[stats] chartBuckets canvas missing – skip VR Performance Sweetspot");
          return;
        }

        const rows = bucketAgg.stats;
        const labels = rows.map(r=>r.label);
        const data = rows.map(r=>modeValue(r));

        // simple color coding by sign
        const bg = data.map(v => (Number(v) < 0 ? "rgba(255,80,80,0.85)" : "rgba(60,190,120,0.85)"));
        const br = data.map(v => (Number(v) < 0 ? "rgb(255,80,80)" : "rgb(60,190,120)"));

        try{ chartBuckets?.destroy(); }catch{}
        chartBuckets = new Chart(bucketCanvas, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                type: "bar",
                label: "Avg Net VR gain",
                data,
                backgroundColor: bg,
                borderColor: br,
                borderWidth: 1,
                order: 1
              },
              {
                type: "line",
                label: "Trend",
                data: data.slice(),
                borderColor: "rgba(255,255,255,0.90)",
                backgroundColor: "rgba(255,255,255,0.15)",
                pointRadius: 2,
                pointHoverRadius: 3,
                tension: 0.25,
                fill: false,
                borderWidth: 2,
                order: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "nearest", intersect: true },
            scales: {
              x: { ticks: { autoSkip: true, maxTicksLimit: 6, maxRotation: 0, minRotation: 0, callback: (v, i)=> shortenRangeLabel(labels[i] ?? "") } },
              y: { beginAtZero: false, ticks: { callback: (v)=> Number(v).toFixed(0) } }
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const i = items?.[0]?.dataIndex;
                    if(i == null) return "";
                    const r = bucketAgg.stats[i];
                    return `VR_before ${r.label}`;
                  },
                  label: (ctx) => {
                    const r = bucketAgg.stats[ctx.dataIndex];
                    const mode = (window.__bucketMode || "overall");
                    const base = bucketAgg.baseline;
                    const val = (mode === "track") ? r.avgNetTracks : (mode === "im" ? r.avgNetIm : r.avgNetTotal);
                    const cVal = (mode === "track") ? base.avgNetTracks : (mode === "im" ? base.avgNetIm : base.avgNetTotal);
                    const delta = (Number.isFinite(val) && Number.isFinite(cVal)) ? (val - cVal) : 0;
                    const deltaStr = (delta >= 0 ? "+" : "") + delta.toFixed(2);
                    const pctStr = (cVal > 0) ? (delta / cVal * 100).toFixed(1) + "%" : "–";
                    const modeLabel = (mode === "track") ? "Tracks" : (mode === "im" ? "Intermission" : "Overall");
                    const avgT = (r.avgNetTotal >= 0 ? "+" : "") + r.avgNetTotal.toFixed(2);
                    const avgTr = (r.avgNetTracks >= 0 ? "+" : "") + r.avgNetTracks.toFixed(2);
                    const avgIm = (r.avgNetIm >= 0 ? "+" : "") + r.avgNetIm.toFixed(2);

                    const wrO = (r.winrateOverall == null) ? "–" : r.winrateOverall.toFixed(1) + "%";
                    const wrTr = (r.winrateTracks == null) ? "–" : r.winrateTracks.toFixed(1) + "%";
                    const wrIm = (r.winrateIm == null) ? "–" : r.winrateIm.toFixed(1) + "%";

                    if(mode === "track"){
                      const c = r.countTr ?? 0;
                      const wr = (r.winrateTracks == null) ? "–" : r.winrateTracks.toFixed(1) + "%";
                      const a = (r.avgNetTracks >= 0 ? "+" : "") + r.avgNetTracks.toFixed(2);
                      return [
                        `Matches (Tracks): ${c}`,
                        `Δ vs Avg-zone (Tracks): ${deltaStr} (${pctStr})`,
                        `Avg Net Gain (Tracks): ${a}`,
                        `Winrate (Tracks): ${wr}`
                      ];
                    }
                    if(mode === "im"){
                      const c = r.countIm ?? 0;
                      const wr = (r.winrateIm == null) ? "–" : r.winrateIm.toFixed(1) + "%";
                      const a = (r.avgNetIm >= 0 ? "+" : "") + r.avgNetIm.toFixed(2);
                      return [
                        `Matches (Intermission): ${c}`,
                        `Δ vs Avg-zone (Intermission): ${deltaStr} (${pctStr})`,
                        `Avg Net Gain (Intermission): ${a}`,
                        `Winrate (Intermission): ${wr}`
                      ];
                    }
                    return [
                      `Matches: ${r.count}`,
                      `Δ vs Avg-zone (Overall): ${deltaStr} (${pctStr})`,
                      `Avg Net Gain Total: ${avgT}`,
                      `Winrate Overall: ${wrO}`,
                      `Winrate Tracks: ${wrTr}`,
                      `Winrate Intermission: ${wrIm}`,
                      `Avg Net Gain Tracks: ${avgTr}`,
                      `Avg Net Gain Intermission: ${avgIm}`
                    ];
                  }
                }
              }
            }
          },
          // Keep the visualization focused: zero-line + (Track-only) expected VR line + counts
          plugins: [zeroLinePlugin]
        });

        // mobile-friendly pinned text
        function setBucketSelected(i){
          if(!$bucketSel) return;
          if(i == null || !bucketAgg.stats[i]){
            $bucketSel.textContent = "";
            return;
          }
          const r = bucketAgg.stats[i];
          const avgT = (r.avgNetTotal >= 0 ? "+" : "") + r.avgNetTotal.toFixed(2);
          const avgTr = (r.avgNetTracks >= 0 ? "+" : "") + r.avgNetTracks.toFixed(2);
          const avgIm = (r.avgNetIm >= 0 ? "+" : "") + r.avgNetIm.toFixed(2);
          const wrO = (r.winrateOverall == null) ? "–" : r.winrateOverall.toFixed(1) + "%";
          const wrTr = (r.winrateTracks == null) ? "–" : r.winrateTracks.toFixed(1) + "%";
          const wrIm = (r.winrateIm == null) ? "–" : r.winrateIm.toFixed(1) + "%";
          const mode = (window.__bucketMode || "overall");
          if(mode === "track"){
            $bucketSel.textContent = `VR_before ${r.label} • Tracks ${r.countTr||0} matches • AvgNet ${avgTr} • WR ${wrTr}`;
            return;
          }
          if(mode === "im"){
            $bucketSel.textContent = `VR_before ${r.label} • Intermission ${r.countIm||0} matches • AvgNet ${avgIm} • WR ${wrIm}`;
            return;
          }
          $bucketSel.textContent =
            `VR_before ${r.label} • Matches ${r.count} • AvgNet ${avgT} • WR ${wrO} • TrackAvg ${avgTr} (WR ${wrTr}) • IMAvg ${avgIm} (WR ${wrIm})`;
        }

        chartBuckets.options.onClick = (evt, els) => {
          const first = els?.[0];
          if(!first){ setBucketSelected(null); return; }
          setBucketSelected(first.index);
        };

        setBucketSelected(null);
        chartBuckets.update();
      }

      function setBucketMode(mode, btn){
        window.__bucketMode = mode;
        if(btn) setActiveButton(btn);
        renderBuckets();
      }

      // wire buttons once (but safe even if re-run)
      $("btnBucketOverall")?.addEventListener("click", (e)=> setBucketMode("overall", e.target));
      $("btnBucketTrack")?.addEventListener("click", (e)=> setBucketMode("track", e.target));
      $("btnBucketIm")?.addEventListener("click", (e)=> setBucketMode("im", e.target));

      // default active state based on persisted mode
      const m = window.__bucketMode || "overall";
      setActiveById(m==="track" ? "btnBucketTrack" : m==="im" ? "btnBucketIm" : "btnBucketOverall");
      renderBuckets();
    }catch(err){
      console.warn("[stats] VR Performance Sweetspot failed", err);
    }

}
  async function refreshAll(){
    try {
      setStatus("Loading data…", true);
      await loadProfile();
      await loadStratsMeta();

      matchesAsc = await getAllMatchesAsc();
      $("matchCount").textContent = String(matchesAsc.length);

      if (matchesAsc.length === 0) {
  $("matchCount").textContent = "0";
  buildCharts([]); // zeigt leeres Chart mit Default-Range 3000–11000
  setStatus("No matches yet.", false);
  return;
}

      buildCharts(matchesAsc);
      setStatus("✅ Done.", true);
    } catch (e) {
      setStatus("Error: " + (e?.message || e), false);
      setDebug(e?.stack || "");
    }
  }
  // Nav actions are handled by the shared navbar script.

  // Start
  (async () => {
    // Guest mode is allowed: continue even without a session.
    await requireAuth();
    await refreshAll();
  })();
