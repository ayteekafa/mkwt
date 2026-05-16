  // ========= UI Helpers =========
  const $ = (id) => document.getElementById(id);

  let chartFilterBindingsReady = false;
  function closeChartFilterMenus(exceptRoot = null){
    if(window.MKWT_UI?.closeFilterMenus){
      window.MKWT_UI.closeFilterMenus("chart", exceptRoot);
      return;
    }
    document.querySelectorAll(".chartFilter").forEach((root) => {
      if(exceptRoot && root === exceptRoot) return;
      const btn = root.querySelector(".chartFilterBtn");
      const menu = root.querySelector(".chartFilterMenu");
      if(menu) menu.hidden = true;
      if(btn) btn.setAttribute("aria-expanded", "false");
    });
  }
  function bindGlobalChartFilterClosers(){
    if(window.MKWT_UI?.bindGlobalFilterClosers){
      window.MKWT_UI.bindGlobalFilterClosers("chart");
      return;
    }
    if(chartFilterBindingsReady) return;
    chartFilterBindingsReady = true;
    document.addEventListener("click", (event) => {
      if(event.target.closest(".chartFilter")) return;
      closeChartFilterMenus();
    });
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape") closeChartFilterMenus();
    });
  }
  function bindChartFilterToggle(btnId, menuId){
    const btn = freshButton(btnId);
    const menu = $(menuId);
    if(!btn || !menu) return null;
    if(window.MKWT_UI?.bindFilterToggle){
      return window.MKWT_UI.bindFilterToggle(btn, menu, { type: "chart" });
    }
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const root = btn.closest(".chartFilter");
      const willOpen = menu.hidden;
      closeChartFilterMenus(root);
      menu.hidden = !willOpen;
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
    return btn;
  }
  function bindSwipeNavigation(target, { onLeft, onRight, threshold = 56 } = {}){
    if(!target) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    target.addEventListener("touchstart", (event) => {
      if(event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }, { passive: true });
    target.addEventListener("touchend", (event) => {
      if(!tracking || event.changedTouches.length !== 1) return;
      tracking = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if(Math.abs(dx) < threshold) return;
      if(Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if(dx < 0) onLeft?.();
      else onRight?.();
    }, { passive: true });
    target.addEventListener("touchcancel", () => { tracking = false; }, { passive: true });
  }
  const $status = $("status");
  const $debug = $("debug");

  function setStatus(msg, ok=false){
    const text = String(msg || "").trim();
    if(window.MKWT?.showToast){
      if($status){
        $status.textContent = "";
        $status.className = "muted hidden";
        $status.hidden = true;
      }
      window.MKWT.showToast(text, ok);
      return;
    }
    if(!$status) return;
    $status.hidden = !text;
    $status.className = "muted " + (text ? (ok ? "ok" : "bad") : "hidden");
    $status.textContent = text;
  }
  function setDebug(msg){ $debug.textContent = msg || ""; }

  // ========= Backup / Restore / Logout (wie b_new_v2) =========


  window.addEventListener("error", (e) => {
    setStatus("JS Error: " + (e.message || e.type), false);
    setDebug(e.error?.stack || "");
  });

  let PROFILE = null;
  let matchesAsc = [];

  function cssVar(name, fallback){
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  let STRATS_META_INTERMISSIONS = null;

  // ========= Global Settings =========
  // Filters out "early" low-VR matches from ALL stats calculations.
  // Stored locally (no DB changes): localStorage key "mkwt_min_vr_filter".
  const getMinVrFilter = () => (window.MKWT?.getMinVrFilter ? window.MKWT.getMinVrFilter() : 0);

  const passesMinVrFilter = (match, minVr) => (window.MKWT?.passesMinVrFilter ? window.MKWT.passesMinVrFilter(match, minVr) : true);

  async function loadStratsMeta(){
    if (STRATS_META_INTERMISSIONS) return STRATS_META_INTERMISSIONS;
    try{
      const res = await fetch("strats.json");
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
        try{ setNavAuthButton("account"); }catch(e){}
      },
      onGuest: async () => {
        window.IS_GUEST = true;
        window.supabaseClient = null;
        window.SESSION = null;
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
    $("currentVr").textContent = String(PROFILE?.current_vr ?? "-");
  }

  // ========= Data Fetch =========
  async function getAllMatchesAsc() {
    // Fetches all matches in pages; Supabase often limits requests to 1000 rows.
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

        const root = getComputedStyle(document.documentElement);
        const fill = (root.getPropertyValue('--chart-label-fill') || '#fff').trim();
        const stroke = (root.getPropertyValue('--chart-label-stroke') || 'rgba(0,0,0,0.35)').trim();

        for (let i=0; i<meta.data.length; i++){
          const arc = meta.data[i];
          const v = Number(data[i] || 0);
          if (!Number.isFinite(v) || v <= 0) continue;

          const pct = (v / total) * 100;
          // skip tiny slices
          if (pct < 5) continue;

          const txt = Math.round(pct) + "%";

          const { startAngle, endAngle, innerRadius, outerRadius, x, y } = arc.getProps(
            ["startAngle","endAngle","innerRadius","outerRadius","x","y"],
            true
          );
          const angle = (startAngle + endAngle) / 2;
          const r = innerRadius + (outerRadius - innerRadius) * 0.58;
          const tx = x + Math.cos(angle) * r;
          const ty = y + Math.sin(angle) * r;
          const fontSize = clamp(Math.round(outerRadius * 0.14), 17, 25);

          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.24));
          ctx.strokeStyle = stroke;
          ctx.shadowColor = "rgba(0,0,0,0.36)";
          ctx.shadowBlur = 5;
          ctx.shadowOffsetY = 1;
          ctx.strokeText(txt, tx, ty);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = fill;
          ctx.fillText(txt, tx, ty);
          ctx.restore();
        }
      } catch (e) {
        console.warn("[stats] piePercentLabelsPlugin error", e);
      }
    }
  };

// ========= Charts =========
  let chartVr = null, chartPerf = null, chartPie5 = null, chartItTr = null, chartWeekly = null, chartBuckets = null, chartModeCompareWw = null;
  let wwCompareOpen = false;
  // Chart 1 window state
  let vrWindowMode = "all";
  let vrDeckPanel = 0;
  let analysisDeckPanel = 0;
  const VR_HISTORY_MAX_POINTS = 360;

  // Chart 5 window state
  let pie5WindowMode = "all";
  let weeklyModeState = "vravg";
  let perfModeState = "tracks";
  let perfSortKeyState = "avg";
  let perfSortDirState = "desc";

  function freshButton(id){
    const btn = $(id);
    if(!btn || !btn.parentNode) return btn;
    const next = btn.cloneNode(true);
    btn.parentNode.replaceChild(next, btn);
    return next;
  }

function destroyCharts(){
    chartVr?.destroy(); chartPerf?.destroy(); chartPie5?.destroy(); chartItTr?.destroy(); chartWeekly?.destroy(); chartBuckets?.destroy(); chartModeCompareWw?.destroy();
    chartVr = chartPerf = chartPie5 = chartItTr = chartWeekly = chartBuckets = chartModeCompareWw = null;
  }

  function setStatsChartEmpty(canvasId, message = ""){
    const canvas = $(canvasId);
    if(!canvas) return;
    const wrap = canvas.closest(".chartWrapCompare, .chartWrapBuckets, .pie-wrap, .chartWrapC2, .chartWrapIm, .chartWrap, .bar-wrap") || canvas.parentElement;
    if(!wrap) return;
    let next = wrap.nextElementSibling;
    while(next?.classList?.contains("chartEmptyNotice") && next.dataset.forChart === canvasId){
      const remove = next;
      next = next.nextElementSibling;
      remove.remove();
    }
    const text = String(message || "").replace(/\s+/g, " ").trim();
    if(!text){
      canvas.hidden = false;
      wrap.classList.remove("isChartEmpty");
      return;
    }
    try{
      const ctx = canvas.getContext?.("2d");
      if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }catch{}
    canvas.hidden = false;
    wrap.classList.add("isChartEmpty");
    const notice = document.createElement("div");
    notice.className = "chartEmptyNotice";
    notice.dataset.forChart = canvasId;
    notice.setAttribute("role", "status");
    notice.textContent = text;
    wrap.insertAdjacentElement("afterend", notice);
  }

  function buildCharts(matchesAsc) {
    destroyCharts();
    bindGlobalChartFilterClosers();
    const chartPalette = {
      neutralFill: cssVar("--chart-neutral-fill", "rgba(140,140,140,0.25)"),
      neutralStroke: cssVar("--chart-neutral-stroke", "rgba(140,140,140,0.5)"),
      positiveFill: cssVar("--chart-positive-fill", "rgba(60,190,120,0.85)"),
      positiveStroke: cssVar("--chart-positive-stroke", "rgb(60,190,120)"),
      negativeFill: cssVar("--chart-negative-fill", "rgba(255,80,80,0.85)"),
      negativeStroke: cssVar("--chart-negative-stroke", "rgb(255,80,80)"),
      splitAFill: cssVar("--chart-split-a-fill", "rgba(78,124,255,.82)"),
      splitAStroke: cssVar("--chart-split-a-stroke", "rgb(78,124,255)"),
      splitBFill: cssVar("--chart-split-b-fill", "rgba(255,186,77,.80)"),
      splitBStroke: cssVar("--chart-split-b-stroke", "rgb(255,186,77)"),
      linePrimary: cssVar("--chart-line-primary", "rgb(77,163,255)"),
      linePrimaryFill: cssVar("--chart-line-primary-fill", "rgba(77,163,255,.16)"),
      lineSecondary: cssVar("--chart-line-secondary", "rgba(255,255,255,0.90)"),
      lineSecondaryFill: cssVar("--chart-line-secondary-fill", "rgba(255,255,255,0.15)"),
      breakEven: cssVar("--chart-break-even", "rgba(255,180,0,0.85)"),
      breakEvenText: cssVar("--chart-break-even-text", "rgba(255,180,0,0.90)"),
      separator: cssVar("--chart-separator", "rgba(43,108,255,0.45)"),
    };

    function updateAnalysisDeckUi(){
      const isSweetspot = analysisDeckPanel === 1;
      const track = $("analysisDeckTrack");
      if(track) track.style.transform = isSweetspot ? "translateX(-50%)" : "translateX(0%)";
      document.querySelectorAll("#analysisDeckPager [data-analysis-panel]").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.analysisPanel) === analysisDeckPanel);
      });
      const title = $("analysisDeckTitle");
      if(title) title.textContent = isSweetspot ? "VR Performance Sweetspot" : "Tracks & Intermissions";
      const meta = $("analysisDeckMeta");
      if(meta) meta.textContent = "";
      const pieFilter = $("pieFilterRoot");
      const bucketFilter = $("bucketFilterRoot");
      if(pieFilter) pieFilter.hidden = isSweetspot;
      if(bucketFilter) bucketFilter.hidden = !isSweetspot;
      const info = $("btnAnalysisDeckInfo");
      if(info) info.dataset.info = isSweetspot ? "buckets" : "trackDistribution";
    }

    function setAnalysisDeckPanel(panel){
      analysisDeckPanel = Math.max(0, Math.min(1, Number(panel) || 0));
      closeChartFilterMenus();
      updateAnalysisDeckUi();
      requestAnimationFrame(() => {
        try{ chartPie5?.resize(); }catch{}
        try{ chartBuckets?.resize(); }catch{}
      });
    }

    function bindAnalysisDeckNav(){
      document.querySelectorAll("#analysisDeckPager [data-analysis-panel]").forEach((btn) => {
        const next = btn.cloneNode(true);
        btn.parentNode.replaceChild(next, btn);
        btn = next;
        btn.addEventListener("click", () => setAnalysisDeckPanel(btn.dataset.analysisPanel));
      });
      const viewport = $("analysisDeckViewport");
      if(viewport && viewport.dataset.swipeBound !== "1"){
        viewport.dataset.swipeBound = "1";
        bindSwipeNavigation(viewport, {
          onLeft: () => { if(analysisDeckPanel < 1) setAnalysisDeckPanel(analysisDeckPanel + 1); },
          onRight: () => { if(analysisDeckPanel > 0) setAnalysisDeckPanel(analysisDeckPanel - 1); }
        });
      }
      updateAnalysisDeckUi();
    }
    bindAnalysisDeckNav();

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

    // Average VR for the selected window, calculated from the VR history.
    const vrNumsFull = vrSeriesFull.map(Number).filter(Number.isFinite);
    let weeklyMode = weeklyModeState;


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

    function prepareVrDisplayWindow(mode){
      const raw = getVrWindow(mode);
      const count = raw?.vr?.length || 0;
      if(!count) return { ...raw, sampled: false, pointRanges: [] };
      const pointRanges = raw.indices.map((globalIdx, localIdx) => ({
        count: 1,
        startLocal: localIdx,
        endLocal: localIdx,
        startGlobal: globalIdx,
        endGlobal: globalIdx
      }));
      if(mode !== "all" || count <= VR_HISTORY_MAX_POINTS){
        return { ...raw, sampled: false, pointRanges };
      }

      const bucketSize = Math.ceil(count / VR_HISTORY_MAX_POINTS);
      const labels = [];
      const vr = [];
      const indices = [];
      const matches = [];
      const sampledRanges = [];

      for(let start = 0; start < count; start += bucketSize){
        const end = Math.min(count, start + bucketSize) - 1;
        const slice = raw.vr.slice(start, end + 1).map(Number).filter(Number.isFinite);
        if(!slice.length) continue;
        const avg = slice.reduce((a, v) => a + v, 0) / slice.length;
        labels.push(raw.labels[end]);
        vr.push(Number(avg.toFixed(2)));
        indices.push(raw.indices[end]);
        matches.push(raw.matches[end]);
        sampledRanges.push({
          count: end - start + 1,
          startLocal: start,
          endLocal: end,
          startGlobal: raw.indices[start],
          endGlobal: raw.indices[end]
        });
      }

      return {
        indices,
        labels,
        vr,
        matches,
        sampled: true,
        bucketSize,
        rawCount: count,
        pointRanges: sampledRanges
      };
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
      el.textContent = (avg == null || !Number.isFinite(Number(avg))) ? "-" : Number(avg).toFixed(1);
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
      if (!canvas) { console.warn("[stats] chartVr canvas missing - skip Chart 1"); return; }

      const w = prepareVrDisplayWindow(mode);
      if (!w.vr.length) {
        try{ chartVr?.destroy(); }catch{}
        chartVr = null;
        setStatsChartEmpty("chartVr", matchesAsc.length ? "No races in this view yet." : "No World Wide matches yet.");
        return;
      }
      setStatsChartEmpty("chartVr", "");

      // Step/treppe line: always 10 segments over the *filtered* window (10% buckets), same logic as before.
      const stepLine = computeStepAverage10(w.vr);

      const { autoMin, autoMax } = computeAutoY(w.vr);
      const idxMap = w.indices || [];
      const rangeMap = w.pointRanges || [];
      const vrDatasetLabel = w.sampled ? "VR (sampled)" : "VR";

      const tooltipTitleForVr = (items) => {
        const it = items?.[0];
        if (!it) return "";
        const localIdx = Math.max(0, Number(it.dataIndex));
        const range = rangeMap[localIdx];
        if(w.sampled && range && range.count > 1){
          return `Matches ${range.startGlobal + 1}-${range.endGlobal + 1}`;
        }
        const globalIdx = (idxMap[localIdx] != null) ? idxMap[localIdx] : localIdx;
        const m = matchesAsc[globalIdx];
        const dt = m?.created_at ? new Date(m.created_at) : null;
        const when = dt && !isNaN(dt) ? dt.toLocaleString() : "";
        return "Match " + String(globalIdx + 1) + (when ? (" . " + when) : "");
      };

      const tooltipLabelForVr = (ctx) => {
        const lbl = ctx.dataset?.label || "";
        if (lbl === "Step Avg") {
          const y = Number(ctx.parsed.y);
          return "Step Avg: " + (Number.isFinite(y) ? y.toFixed(1) : "-");
        }
        const localIdx = Math.max(0, Number(ctx.dataIndex));
        const range = rangeMap[localIdx];
        if(w.sampled && range && range.count > 1){
          const y = Number(ctx.parsed.y);
          return [
            "VR Avg: " + (Number.isFinite(y) ? y.toFixed(1) : "-"),
            `Sampled from ${range.count} matches`
          ];
        }
        const globalIdx = (idxMap[localIdx] != null) ? idxMap[localIdx] : localIdx;
        const m = matchesAsc[globalIdx];
        const t = (m?.intermission ? (String(m.intermission) + " > " + String(m.track || "")) : String(m?.track || ""));
        const afterTxt = Number.isFinite(Number(m?.vr_after)) ? (" (vr_after)") : "";
        return "VR: " + Number(ctx.parsed.y).toFixed(0) + afterTxt + (t ? (" . " + t) : "");
      };

      if (!chartVr){
        chartVr = new Chart(canvas, {
          type: "line",
          data: {
            labels: w.labels,
            datasets: [
              {
                label: vrDatasetLabel,
                data: w.vr,
                tension: 0.15,
                pointRadius: 0,
                pointHitRadius: 12,
                borderWidth: 1.5,
                borderColor: chartPalette.linePrimary,
                backgroundColor: chartPalette.linePrimaryFill
              },
              {
                label: "Step Avg",
                data: stepLine,
                tension: 0,
                pointRadius: 0,
                pointHitRadius: 12,
                borderDash: [6,6],
                stepped: "after",
                borderWidth: 3,
                borderColor: chartPalette.lineSecondary,
                backgroundColor: chartPalette.lineSecondaryFill
              }
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
                  title: tooltipTitleForVr,
                  label: tooltipLabelForVr
                }
              }
            }
          }
        });
      } else {
        chartVr.data.labels = w.labels;
        chartVr.data.datasets[0].data = w.vr;
        chartVr.data.datasets[0].label = vrDatasetLabel;
        chartVr.data.datasets[1].data = stepLine;
        chartVr.options.scales.y.min = autoMin;
        chartVr.options.scales.y.max = autoMax;

        // update tooltip mapping for this window
        chartVr.options.plugins.tooltip.callbacks.title = tooltipTitleForVr;
        chartVr.options.plugins.tooltip.callbacks.label = tooltipLabelForVr;
        chartVr.update();
      }
    }

    const $vrDeckTitle = $("vrDeckTitle");
    const $vrDeckMeta = $("vrDeckMeta");
    const $vrDeckTrack = $("vrDeckTrack");
    const $vrDeckInfo = $("btnVrDeckInfo");
    const $vrDeckValue = $("vrDeckFilterValue");

    const weeklyModeLabel = (mode) => mode === "gains" ? "Gain" : "Average";
    const vrWindowLabel = (mode) => mode === "month" ? "Last month" : mode === "week" ? "Last week" : "Overall";

    function updateVrDeckFilterItems(){
      const vrMap = { all: "optVrAll", month: "optVrMonth", week: "optVrWeek" };
      Object.entries(vrMap).forEach(([mode, id]) => {
        const item = $(id);
        if(item) item.classList.toggle("active", vrDeckPanel === 0 && vrWindowMode === mode);
      });
      const weeklyMap = { vravg: "optWeeklyVrAvg", gains: "optWeeklyGains" };
      Object.entries(weeklyMap).forEach(([mode, id]) => {
        const item = $(id);
        if(item) item.classList.toggle("active", vrDeckPanel === 1 && weeklyMode === mode);
      });
    }

    function updateVrDeckUi(){
      if($vrDeckTrack){
        $vrDeckTrack.style.transform = vrDeckPanel === 1 ? "translateX(-50%)" : "translateX(0%)";
      }
      document.querySelectorAll("[data-vr-panel]").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.vrPanel) === vrDeckPanel);
      });
      document.querySelectorAll("[data-vr-filter-set]").forEach((section) => {
        const name = section.getAttribute("data-vr-filter-set");
        section.hidden = (vrDeckPanel === 0 ? "vr" : "weekly") !== name;
      });
      if(vrDeckPanel === 0){
        if($vrDeckTitle) $vrDeckTitle.textContent = "VR History";
        if($vrDeckMeta) $vrDeckMeta.textContent = "";
        if($vrDeckInfo) $vrDeckInfo.dataset.info = "vrHistory";
        if($vrDeckValue) $vrDeckValue.textContent = vrWindowLabel(vrWindowMode || "all");
      } else {
        if($vrDeckTitle) $vrDeckTitle.textContent = "VR History (Weekly)";
        if($vrDeckMeta) $vrDeckMeta.textContent = "";
        if($vrDeckInfo) $vrDeckInfo.dataset.info = "weekly";
        if($vrDeckValue) $vrDeckValue.textContent = weeklyModeLabel(weeklyMode);
      }
      updateVrDeckFilterItems();
    }

    function setVrDeckPanel(panel){
      vrDeckPanel = Math.max(0, Math.min(1, Number(panel) || 0));
      updateVrDeckUi();
    }

    const setMode = (mode) => {
      vrWindowMode = mode;
      renderVrChart(mode);
      updateAvgVrUI(mode);
      updateVrDeckUi();
    };
    renderVrChart(vrWindowMode || "all");
    updateAvgVrUI(vrWindowMode || "all");
    bindChartFilterToggle("btnVrDeckFilter", "menuVrDeckFilter");
    freshButton("optVrAll")?.addEventListener("click", () => { setVrDeckPanel(0); setMode("all"); closeChartFilterMenus(); });
    freshButton("optVrMonth")?.addEventListener("click", () => { setVrDeckPanel(0); setMode("month"); closeChartFilterMenus(); });
    freshButton("optVrWeek")?.addEventListener("click", () => { setVrDeckPanel(0); setMode("week"); closeChartFilterMenus(); });
    document.querySelectorAll("[data-vr-panel]").forEach((btn) => {
      btn.addEventListener("click", () => setVrDeckPanel(btn.dataset.vrPanel));
    });
    bindSwipeNavigation($("vrDeckViewport"), {
      onLeft: () => { if(vrDeckPanel < 1) setVrDeckPanel(vrDeckPanel + 1); },
      onRight: () => { if(vrDeckPanel > 0) setVrDeckPanel(vrDeckPanel - 1); }
    });
    updateVrDeckUi();


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
      const route = (start && end) ? (start + " > " + end) : start;
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
    const specialDestinyGroups = new Map(); // special destiny_group -> {sum,n,wins,losses}

    function routeKeyCandidates(start, end){
      const s = String(start||"").trim();
      const e = String(end||"").trim();
      if(!s || !e) return [];
      return [`${s}\u2192${e}`, `${s}>${e}`, `${s} -> ${e}`];
    }
    function lookupRouteMeta(start, end){
      for(const key of routeKeyCandidates(start, end)){
        if(Object.prototype.hasOwnProperty.call(metaIM, key)) return metaIM[key];
      }
      return null;
    }
    function cleanMetaLabel(value){
      const label = String(value ?? "").trim();
      if(!label || label.toLowerCase() === "null" || label.toLowerCase() === "undefined") return "";
      return label;
    }
    function getDestinyGroup(start, end){
      const meta = lookupRouteMeta(start, end);
      const group = cleanMetaLabel(meta?.destiny_group);
      if (group) return group;
      return String(end||"").trim(); // fallback
    }
    function getSpecialDestinyGroup(start, end){
      const meta = lookupRouteMeta(start, end);
      if(!meta || !meta.is_special) return "";
      const plainEnd = String(end || "").trim().toLowerCase();
      const group = cleanMetaLabel(meta.destiny_group);
      const tag = cleanMetaLabel(meta.special_tag);
      const groupDiffers = !!group && group.toLowerCase() !== plainEnd;
      const tagDiffers = !!tag && tag.toLowerCase() !== plainEnd;
      return groupDiffers ? group : (tagDiffers ? tag : "");
    }
    function addPerformanceRowGroup(map, label, delta){
      if(!label || !Number.isFinite(delta)) return;
      const g = map.get(label) || { sum: 0, n: 0, wins: 0, losses: 0 };
      g.sum += delta; g.n += 1;
      if (delta > 0) g.wins += 1;
      else if (delta < 0) g.losses += 1;
      map.set(label, g);
    }

    for (const m of onlyIM){
      const start = String(m.intermission ?? "").trim();
      const end = String(m.track ?? "").trim();
      const dg = getDestinyGroup(start, end);
      if(!dg) continue;

      const delta = Number(m.vr_change);
      addPerformanceRowGroup(destinyGroups, dg, delta);
      addPerformanceRowGroup(specialDestinyGroups, getSpecialDestinyGroup(start, end), delta);
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

    let perfMode = perfModeState;     // tracks | im_destiny | im_special_destiny | im_routes
    let perfSortKey = perfSortKeyState;     // avg | win | count | alpha
    let perfSortDir = perfSortDirState;    // desc | asc
    let perfRowsLast = [];
    const perfModeLabelMap = {
      tracks: "Tracks",
      im_destiny: "Destiny",
      im_special_destiny: "Special",
      im_routes: "Separated"
    };
    const perfSortLabelMap = {
      avg: "VR gain",
      win: "Win rate",
      count: "Plays",
      alpha: "A-Z"
    };
    const perfModeOrder = ["tracks", "im_destiny", "im_special_destiny", "im_routes"];

    function perfSortLabel(){
      const dir = perfSortDir === "desc" ? "↓" : "↑";
      return `${perfSortLabelMap[perfSortKey] || "VR gain"} ${dir}`;
    }

    function updatePerfUi(){
      const meta = $("perfModeMeta");
      if(meta) meta.textContent = "";
      const filterValue = $("perfFilterValue");
      if(filterValue) filterValue.textContent = perfSortLabel();
      document.querySelectorAll("[data-perf-mode]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.perfMode === perfMode);
      });
      document.querySelectorAll("#menuPerfFilter .chartFilterItem").forEach((item) => {
        const key = item.dataset.key;
        const active = key === perfSortKey;
        item.classList.toggle("active", active);
        const metaEl = item.querySelector(".chartFilterItemMeta");
        if(metaEl) metaEl.textContent = active ? (perfSortDir === "desc" ? "↓" : "↑") : "";
      });
    }

    function setPerfMode(mode){
      if(!perfModeOrder.includes(mode)) return;
      perfMode = mode;
      perfModeState = mode;
      updatePerfUi();
      renderPerfChart();
    }

    function setPerfSort(key){
      if (perfSortKey === key) {
        perfSortDir = (perfSortDir === "desc") ? "asc" : "desc";
      } else {
        perfSortKey = key;
        perfSortDir = (key === "alpha") ? "asc" : "desc";
      }
      perfSortKeyState = perfSortKey;
      perfSortDirState = perfSortDir;
      updatePerfUi();
      renderPerfChart();
    }

    function bindPerfButtons(){
      bindChartFilterToggle("btnPerfFilter", "menuPerfFilter");
      freshButton("optPerfAvg")?.addEventListener("click", () => { setPerfSort("avg"); closeChartFilterMenus(); });
      freshButton("optPerfWin")?.addEventListener("click", () => { setPerfSort("win"); closeChartFilterMenus(); });
      freshButton("optPerfCount")?.addEventListener("click", () => { setPerfSort("count"); closeChartFilterMenus(); });
      freshButton("optPerfAlpha")?.addEventListener("click", () => { setPerfSort("alpha"); closeChartFilterMenus(); });
      document.querySelectorAll("[data-perf-mode]").forEach((btn) => {
        btn.addEventListener("click", () => setPerfMode(btn.dataset.perfMode));
      });
      bindSwipeNavigation($("perfSwipeSurface"), {
        onLeft: () => {
          const idx = perfModeOrder.indexOf(perfMode);
          if(idx < perfModeOrder.length - 1) setPerfMode(perfModeOrder[idx + 1]);
        },
        onRight: () => {
          const idx = perfModeOrder.indexOf(perfMode);
          if(idx > 0) setPerfMode(perfModeOrder[idx - 1]);
        }
      });
    }

    function updatePerfSelectedByIndex(i){
      if(!$perfSel) return;
      if(i == null || i < 0 || i >= perfRowsLast.length){
        $perfSel.textContent = "";
        return;
      }
      const r = perfRowsLast[i];
      const wrTxt = (r.win == null) ? "-" : (Number(r.win).toFixed(1) + "%");
      $perfSel.textContent = `${r.label}  .  Avg VR change: ${Number(r.avg).toFixed(2)} (matches: ${r.count})  .  Win rate: ${wrTxt}`;
    }

    function renderPerfChart(){
      if(!perfCanvas){
        console.warn("[stats] chartPerf canvas missing - skip Performance chart");
        return;
      }

      let baseRows = [];
      let title = "";
      let cap = null;

      if(perfMode === "tracks"){
        baseRows = rowsFromTrackGroups();
        title = "Avg VR change (Tracks)";
        cap = null; // show all
      } else if(perfMode === "im_destiny"){
        baseRows = rowsFromImMap(destinyGroups);
        title = "Avg VR change (Intermission Destiny)";
        cap = 40;
      } else if(perfMode === "im_special_destiny"){
        baseRows = rowsFromImMap(specialDestinyGroups);
        title = "Avg VR change (Special Destinies)";
        cap = 40;
      } else {
        baseRows = rowsFromImMap(imGroups);
        title = "Avg VR change (Intermission Separated)";
        cap = 40;
      }

      if(!baseRows.length){
        if($perfSel) $perfSel.textContent = "";
        try { chartPerf?.destroy(); } catch {}
        chartPerf = null;
        perfRowsLast = [];
        setStatsChartEmpty("chartPerf", "No data for this chart yet.");
        return;
      }
      setStatsChartEmpty("chartPerf", "");

      const rows = sortPerfRows(baseRows, perfSortKey, perfSortDir);
      perfRowsLast = cap ? rows.slice(0, cap) : rows;

      const labels = perfRowsLast.map(r => r.label);
      const dataArr = perfRowsLast.map(r => r.avg);

      const bg = dataArr.map(v => {
        const n = Number(v);
        if (!Number.isFinite(n)) return chartPalette.neutralFill;
        return n < 0 ? chartPalette.negativeFill : chartPalette.positiveFill;
      });
      const br = dataArr.map(v => {
        const n = Number(v);
        if (!Number.isFinite(n)) return chartPalette.neutralStroke;
        return n < 0 ? chartPalette.negativeStroke : chartPalette.positiveStroke;
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
                  const wrTxt = (r.win == null) ? "-" : (Number(r.win).toFixed(1) + "%");
                  return [
                    `Avg VR change: ${Number(r.avg).toFixed(2)} (matches: ${r.count})`,
                    `Win rate: ${wrTxt}`
                  ];
                }
              }
            }
          }
        }
      });

      updatePerfSelectedByIndex(null);
    }

    const perfCompareCanvas = $("chartModeCompareWw");
    const $wwCompareDialog = $("wwCompareDialog");
    const $wwComparePanel = $("wwComparePanel");
    const $wwCompareMeta = $("wwCompareMeta");
    const $wwCompareNotes = $("wwCompareNotes");

    function setWwCompareStatus(message){
      if(!$wwCompareMeta) return;
      const text = String(message || "").trim();
      $wwCompareMeta.textContent = text;
      $wwCompareMeta.hidden = !text;
      $wwCompareMeta.classList.toggle("hidden", !text);
    }

    function clearWwCompareChart(message){
      if($wwCompareNotes){
        $wwCompareNotes.innerHTML = "";
        $wwCompareNotes.hidden = true;
      }
      try{ chartModeCompareWw?.destroy(); }catch{}
      chartModeCompareWw = null;
      setWwCompareStatus("");
      setStatsChartEmpty("chartModeCompareWw", message || "No comparison data yet.");
    }

    function updateWwCompareButton(){
      const btn = $("btnCompareLounge");
      if(!btn) return;
      btn.classList.toggle("active", wwCompareOpen);
    }

    function closeWwCompareDialog(){
      wwCompareOpen = false;
      updateWwCompareButton();
      if($wwCompareDialog?.open) $wwCompareDialog.close();
    }

    function renderWwCompareNotes(compareRows, secondaryLabel){
      if(!$wwCompareNotes) return;
      $wwCompareNotes.innerHTML = "";
      const notes = window.MKWTModeCompare?.buildComparisonNotes?.(compareRows, {
        primaryLabel: "World Wides",
        secondaryLabel,
        gapThreshold: 10,
        limit: 6,
      }) || [];
      if(!notes.length){
        const div = document.createElement("div");
        div.className = "modeCompareNote muted";
        div.textContent = "No major outliers right now. Shared maps look fairly balanced between both modes.";
        $wwCompareNotes.appendChild(div);
        $wwCompareNotes.hidden = false;
        return;
      }
      for(const note of notes){
        const div = document.createElement("div");
        div.className = "modeCompareNote";
        const strong = document.createElement("b");
        strong.textContent = `"${note.track}"`;
        div.appendChild(strong);
        div.appendChild(document.createTextNode(` strong in ${note.strongerLabel} but weak in ${note.weakerLabel}.`));
        $wwCompareNotes.appendChild(div);
      }
      $wwCompareNotes.hidden = false;
    }

    async function renderWwCompareChart(){
      if(!$wwComparePanel || !$wwCompareMeta || !perfCompareCanvas) return;
      if($wwCompareDialog && !$wwCompareDialog.open){
        try{ $wwCompareDialog.showModal(); }catch{}
      }
      if(!window.MKWTModeCompare){
        clearWwCompareChart("Comparison helper unavailable.");
        return;
      }

      const worldRows = window.MKWTModeCompare.aggregateWorldWideTrackRows(matchesAsc);
      if(!worldRows.length){
        clearWwCompareChart("Track comparison needs World Wide races with placement data.");
        return;
      }

      const loungeLabel = "Lounge 12p";
      setWwCompareStatus(`Loading ${loungeLabel} comparison...`);
      const loungeRows = await window.MKWTModeCompare.loadLoungeTrackRowsByPlayerCount({
        playerCount: 12,
        isGuest: isGuest(),
        supabaseClient,
        session: SESSION,
      });
      if(!loungeRows?.length){
        clearWwCompareChart(`No saved ${loungeLabel} track data found yet.`);
        return;
      }

      const compareRows = window.MKWTModeCompare.buildRankComparisonRows(worldRows, loungeRows, {
        primaryLabel: "World Wides",
        secondaryLabel: loungeLabel,
        limit: 30,
        minCount: 10,
      });
      if(!compareRows.length){
        clearWwCompareChart(`No shared tracks yet with at least 10 plays in both World Wides and ${loungeLabel}.`);
        return;
      }

      const labels = compareRows.map((row) => row.track);
      const worldData = compareRows.map((row) => Number(row.primaryPoints || 0));
      const loungeCompareData = compareRows.map((row) => Number(row.secondaryPoints || 0));
      const maxPoints = Math.max(6, compareRows.length * 2);

      try{ chartModeCompareWw?.destroy(); }catch{}
      setStatsChartEmpty("chartModeCompareWw", "");
      setWwCompareStatus("");
      chartModeCompareWw = new Chart(perfCompareCanvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "World Wides",
              data: worldData,
              backgroundColor: chartPalette.splitAFill,
              borderColor: chartPalette.splitAStroke,
              borderWidth: 1,
            },
            {
              label: loungeLabel,
              data: loungeCompareData,
              backgroundColor: chartPalette.splitBFill,
              borderColor: chartPalette.splitBStroke,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          interaction: { mode: "nearest", axis: "y", intersect: true },
          scales: {
            x: {
              min: 0,
              max: maxPoints,
              stacked: true,
              ticks: { callback: (value) => Number(value).toFixed(0) },
            },
            y: { ticks: { autoSkip: false }, stacked: true },
          },
          plugins: {
            legend: { display: true },
            tooltip: {
              callbacks: {
                title: (items) => items?.[0]?.label || "",
                label: (ctx) => {
                  const row = compareRows[ctx.dataIndex];
                  if(!row) return "";
                  if(ctx.datasetIndex === 0){
                    return `World Wides: ${row.primaryPoints} pts (rank #${row.primaryRank}, avg VR change ${row.primary.toFixed(2)}, ${row.primaryCount} matches)`;
                  }
                  return `${loungeLabel}: ${row.secondaryPoints} pts (rank #${row.secondaryRank}, avg pts ${row.secondary.toFixed(2)}, ${row.secondaryCount} races)`;
                },
                footer: (items) => {
                  const row = compareRows[items?.[0]?.dataIndex];
                  if(!row) return "";
                  const stronger = row.pointGap >= 0 ? "World Wides" : loungeLabel;
                  return `Total: ${row.totalPoints} pts | Gap: ${Math.abs(row.pointGap)} in favor of ${stronger}`;
                },
              },
            },
          },
        },
      });

      renderWwCompareNotes(compareRows, loungeLabel);
      setWwCompareStatus("");
    }

    // Defaults
    bindPerfButtons();
    updatePerfUi();
    renderPerfChart();
    updateWwCompareButton();
    const $closeWwCompare = freshButton("btnCloseWwCompare");
    if($wwCompareDialog){
      $wwCompareDialog.onclose = () => {
        wwCompareOpen = false;
        updateWwCompareButton();
      };
      $wwCompareDialog.oncancel = () => {
        wwCompareOpen = false;
        updateWwCompareButton();
      };
    }
    $closeWwCompare?.addEventListener("click", closeWwCompareDialog);
    freshButton("btnCompareLounge")?.addEventListener("click", async () => {
      if($wwCompareDialog?.open){
        closeWwCompareDialog();
        return;
      }
      wwCompareOpen = true;
      updateWwCompareButton();
      try{
        await renderWwCompareChart();
      }catch(err){
        console.error("[stats] compare chart failed", err);
        clearWwCompareChart("Comparison failed. Please try again.");
      }
    });
    if(wwCompareOpen){
      renderWwCompareChart().catch((err) => {
        console.error("[stats] compare chart failed", err);
        clearWwCompareChart("Comparison failed. Please try again.");
      });
    }


// --- Diagramm 5: Track Distribution (Pie) + Avg gain / Winrate ---
    try{
      const pieCanvas = $("chartPie5");
      if(!pieCanvas){
        console.warn("[stats] chartPie5 canvas missing - skip Chart 5");
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

          $("c5AvgAll").textContent = (avgAll == null) ? "-" : (avgAll >= 0 ? "+" : "") + avgAll.toFixed(1);
          $("c5WinAll").textContent = (wrAll == null) ? "-" : wrAll.toFixed(1) + "%";

          $("c5AvgTrack").textContent = (avgTr == null) ? "-" : (avgTr >= 0 ? "+" : "") + avgTr.toFixed(1);
          $("c5AvgIm").textContent = (avgIm == null) ? "-" : (avgIm >= 0 ? "+" : "") + avgIm.toFixed(1);

          $("c5WinTrack").textContent = (wrTr == null) ? "-" : wrTr.toFixed(1) + "%";
          $("c5WinIm").textContent = (wrIm == null) ? "-" : wrIm.toFixed(1) + "%";
          const trShare = total ? (trCount / total * 100) : null;
          const imShare = total ? (imCount / total * 100) : null;
          if($("c5ShareAll")) $("c5ShareAll").textContent = total ? `${total} matches` : "-";
          if($("c5ShareTrack")) $("c5ShareTrack").textContent = trShare == null ? "-" : `${trShare.toFixed(1)}% share`;
          if($("c5ShareIm")) $("c5ShareIm").textContent = imShare == null ? "-" : `${imShare.toFixed(1)}% share`;

          // Pie
          if(!total){
            try{ chartPie5?.destroy(); }catch{}
            chartPie5 = null;
            setStatsChartEmpty("chartPie5", "No matches in this view yet.");
            return;
          }
          if (typeof Chart === "undefined") {
            console.warn("[stats] Chart.js not loaded - skip Chart 5");
            return;
          }

          try{ chartPie5?.destroy(); }catch{}
          setStatsChartEmpty("chartPie5", "");
          chartPie5 = new Chart(pieCanvas, {
            type: "pie",
            data: {
              labels: ["Intermission", "Tracks"],
              datasets: [{
                data: [imCount, trCount],
                backgroundColor: [chartPalette.splitBFill, chartPalette.splitAFill],
                borderColor: [chartPalette.splitBStroke, chartPalette.splitAStroke],
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const v = Number(ctx.parsed);
                      const pct = total ? (v/total*100) : 0;
                      return `${ctx.label}: ${v} (${pct.toFixed(1)}%)`;
                    }
                  }
                },
                legend: { display: false }
              }
            },
            plugins: [piePercentLabelsPlugin]
          });
        };

        const setPie5Window = (mode) => {
          pie5WindowMode = mode;
          const pieMeta = $("pieFilterMeta");
          const pieValue = $("pieFilterValue");
          const labels = { all: "Overall", month: "Last month", week: "Last week" };
          document.querySelectorAll("#menuPieFilter .chartFilterItem").forEach((item) => {
            item.classList.toggle("active", item.dataset.value === mode);
          });
          if(pieMeta) pieMeta.textContent = "";
          if(pieValue) pieValue.textContent = labels[mode] || "Overall";
          renderChart5();
        };

        bindChartFilterToggle("btnPieFilter", "menuPieFilter");
        freshButton("optPieAll")?.addEventListener("click", ()=> { setPie5Window("all"); closeChartFilterMenus(); });
        freshButton("optPieMonth")?.addEventListener("click", ()=> { setPie5Window("month"); closeChartFilterMenus(); });
        freshButton("optPieWeek")?.addEventListener("click", ()=> { setPie5Window("week"); closeChartFilterMenus(); });

        // Default
        setPie5Window(pie5WindowMode || "all");
      }
    }catch(err){
      console.warn("[stats] Chart 5 failed", err);
    }
    // --- Chart 6: VR History (Weekly) ---
    try{
      const c6 = $("chartWeekly");
      if (c6) {
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
              range: (start && end) ? (fmtDateUTC(start) + "-" + fmtDateUTC(end)) : wk,
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
            hint.textContent = "";
            return;
          }
          const m = weeklyData.meta[index];
          hint.textContent = `${m.weekLabel} (${m.range}) . Played ${m.matches} matches . Sessions ${m.sessions} (${m.avgPerSession.toFixed(1)} / session)`;
        }

        function c6Datasets(){
          if(weeklyMode === "vravg"){
            return [{
              label: "VR Average",
              data: weeklyData.vrAvgArr,
              backgroundColor: chartPalette.splitAFill,
              borderColor: chartPalette.splitAStroke,
              borderWidth: 0
            }];
          }
          return [
            {
              label: "Track avg change",
              data: weeklyData.trackAvgArr,
              backgroundColor: chartPalette.splitAFill,
              borderColor: chartPalette.splitAStroke,
              borderWidth: 0
            },
            {
              label: "Intermission avg change",
              data: weeklyData.imAvgArr,
              backgroundColor: chartPalette.splitBFill,
              borderColor: chartPalette.splitBStroke,
              borderWidth: 0
            }
          ];
        }

        function c6YTitle(){
          return (weeklyMode === "vravg") ? "VR (weekly average)" : "Avg VR change (per match)";
        }

        function buildChart(){
          chartWeekly?.destroy();
          if(!weeklyData.labels.length){
            chartWeekly = null;
            setStatsChartEmpty("chartWeekly", "No weekly data yet.");
            setC6Hint(null);
            return;
          }
          setStatsChartEmpty("chartWeekly", "");
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
                      return m ? (m.weekLabel + " . " + m.range) : "";
                    },
                    afterBody: (items) => {
                      const i = items?.[0]?.dataIndex;
                      const m = weeklyData.meta[i];
                      if(!m) return "";
                      return [
                        "Played " + m.matches + " times this week",
                        "Sessions: " + m.sessions + " . " + m.avgPerSession.toFixed(1) + " matches / session"
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

        function setWeeklyMode(mode){
          weeklyMode = mode;
          weeklyModeState = mode;
          buildChart();
          updateVrDeckUi();
        }
        freshButton("optWeeklyVrAvg")?.addEventListener("click", () => { setVrDeckPanel(1); setWeeklyMode("vravg"); closeChartFilterMenus(); });
        freshButton("optWeeklyGains")?.addEventListener("click", () => { setVrDeckPanel(1); setWeeklyMode("gains"); closeChartFilterMenus(); });

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
    b.label = `${b.min}-${b.max}`;
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
      ctx.strokeStyle = chartPalette.breakEven;
      ctx.setLineDash([8,6]);
      ctx.stroke();

      // Label near the y=0 intersection (if visible), else near bottom
      const labelY = (y0 >= ca.top && y0 <= ca.bottom) ? (y0 - 6) : (ca.bottom - 6);
      ctx.setLineDash([]);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = chartPalette.breakEvenText;
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
            ctx.strokeStyle = chartPalette.separator;
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
          const parts = lbl.split("-");
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
          return `${a}-${bFinal}`;
        }catch(e){ return lbl; }
      }
function renderBuckets(){
        if(!bucketCanvas){
          console.warn("[stats] chartBuckets canvas missing - skip VR Performance Sweetspot");
          return;
        }

        const rows = bucketAgg.stats;
        const hasBucketData = rows.some((row) => Number(row.count || 0) > 0 || Number(row.countTr || 0) > 0 || Number(row.countIm || 0) > 0);
        if(!hasBucketData){
          try{ chartBuckets?.destroy(); }catch{}
          chartBuckets = null;
          setStatsChartEmpty("chartBuckets", "No data for this chart yet.");
          if($bucketSel) $bucketSel.textContent = "";
          return;
        }
        setStatsChartEmpty("chartBuckets", "");
        const labels = rows.map(r=>r.label);
        const data = rows.map(r=>modeValue(r));

        // simple color coding by sign
        const bg = data.map(v => (Number(v) < 0 ? chartPalette.negativeFill : chartPalette.positiveFill));
        const br = data.map(v => (Number(v) < 0 ? chartPalette.negativeStroke : chartPalette.positiveStroke));

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
                borderColor: chartPalette.lineSecondary,
                backgroundColor: chartPalette.lineSecondaryFill,
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
                    const pctStr = (cVal > 0) ? (delta / cVal * 100).toFixed(1) + "%" : "-";
                    const modeLabel = (mode === "track") ? "Tracks" : (mode === "im" ? "Intermission" : "Overall");
                    const avgT = (r.avgNetTotal >= 0 ? "+" : "") + r.avgNetTotal.toFixed(2);
                    const avgTr = (r.avgNetTracks >= 0 ? "+" : "") + r.avgNetTracks.toFixed(2);
                    const avgIm = (r.avgNetIm >= 0 ? "+" : "") + r.avgNetIm.toFixed(2);

                    const wrO = (r.winrateOverall == null) ? "-" : r.winrateOverall.toFixed(1) + "%";
                    const wrTr = (r.winrateTracks == null) ? "-" : r.winrateTracks.toFixed(1) + "%";
                    const wrIm = (r.winrateIm == null) ? "-" : r.winrateIm.toFixed(1) + "%";

                    if(mode === "track"){
                      const c = r.countTr ?? 0;
                      const wr = (r.winrateTracks == null) ? "-" : r.winrateTracks.toFixed(1) + "%";
                      const a = (r.avgNetTracks >= 0 ? "+" : "") + r.avgNetTracks.toFixed(2);
                      return [
                        `Matches (Tracks): ${c}`,
                        `Î” vs Avg-zone (Tracks): ${deltaStr} (${pctStr})`,
                        `Avg Net Gain (Tracks): ${a}`,
                        `Winrate (Tracks): ${wr}`
                      ];
                    }
                    if(mode === "im"){
                      const c = r.countIm ?? 0;
                      const wr = (r.winrateIm == null) ? "-" : r.winrateIm.toFixed(1) + "%";
                      const a = (r.avgNetIm >= 0 ? "+" : "") + r.avgNetIm.toFixed(2);
                      return [
                        `Matches (Intermission): ${c}`,
                        `Î” vs Avg-zone (Intermission): ${deltaStr} (${pctStr})`,
                        `Avg Net Gain (Intermission): ${a}`,
                        `Winrate (Intermission): ${wr}`
                      ];
                    }
                    return [
                      `Matches: ${r.count}`,
                      `Î” vs Avg-zone (Overall): ${deltaStr} (${pctStr})`,
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

        // Pinned details for selected VR bucket.
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
          const wrO = (r.winrateOverall == null) ? "-" : r.winrateOverall.toFixed(1) + "%";
          const wrTr = (r.winrateTracks == null) ? "-" : r.winrateTracks.toFixed(1) + "%";
          const wrIm = (r.winrateIm == null) ? "-" : r.winrateIm.toFixed(1) + "%";
          const mode = (window.__bucketMode || "overall");
          if(mode === "track"){
            $bucketSel.textContent = `VR_before ${r.label} . Tracks ${r.countTr||0} matches . AvgNet ${avgTr} . WR ${wrTr}`;
            return;
          }
          if(mode === "im"){
            $bucketSel.textContent = `VR_before ${r.label} . Intermission ${r.countIm||0} matches . AvgNet ${avgIm} . WR ${wrIm}`;
            return;
          }
          $bucketSel.textContent =
            `VR_before ${r.label} . Matches ${r.count} . AvgNet ${avgT} . WR ${wrO} . TrackAvg ${avgTr} (WR ${wrTr}) . IMAvg ${avgIm} (WR ${wrIm})`;
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
        const labels = { overall: "Overall", track: "Track", im: "Intermission" };
        document.querySelectorAll("#menuBucketFilter .chartFilterItem").forEach((item) => {
          item.classList.toggle("active", item.dataset.value === mode);
        });
        if($("bucketFilterMeta")) $("bucketFilterMeta").textContent = "";
        if($("bucketFilterValue")) $("bucketFilterValue").textContent = labels[mode] || "Overall";
        renderBuckets();
      }

      bindChartFilterToggle("btnBucketFilter", "menuBucketFilter");
      freshButton("optBucketOverall")?.addEventListener("click", ()=> { setBucketMode("overall"); closeChartFilterMenus(); });
      freshButton("optBucketTrack")?.addEventListener("click", ()=> { setBucketMode("track"); closeChartFilterMenus(); });
      freshButton("optBucketIm")?.addEventListener("click", ()=> { setBucketMode("im"); closeChartFilterMenus(); });

      // default active state based on persisted mode
      const m = window.__bucketMode || "overall";
      setBucketMode(m);
    }catch(err){
      console.warn("[stats] VR Performance Sweetspot failed", err);
    }

}
  async function refreshAll(){
    try {
      setStatus("Loading data...", true);
      await loadProfile();
      await loadStratsMeta();

      matchesAsc = await getAllMatchesAsc();
      $("matchCount").textContent = String(matchesAsc.length);

      if (matchesAsc.length === 0) {
  $("matchCount").textContent = "0";
  buildCharts([]); // zeigt leeres Chart mit Default-Range 3000-11000
  setStatus("No matches yet.", false);
  return;
}

      buildCharts(matchesAsc);
      setStatus("Done.", true);
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
