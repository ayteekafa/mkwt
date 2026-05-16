// ========= UI Helpers =========
  const $ = (id) => document.getElementById(id);
  const $status = $("status");
  const $debug = $("debug");

  function setStatus(msg, ok=false){ window.MKWT?.setStatus?.($status, msg, ok); }
  function dbg(msg){ window.MKWT?.setDebug?.($debug, msg); }

  // ========= Global Settings =========
  // Filters out "early" low-VR matches from ALL session calculations.
  // Stored locally (no DB changes): localStorage key "mkwt_min_vr_filter".
  const getMinVrFilter = () => (window.MKWT?.getMinVrFilter ? window.MKWT.getMinVrFilter() : 0);
  const passesMinVrFilter = (match, minVr) => (window.MKWT?.passesMinVrFilter ? window.MKWT.passesMinVrFilter(match, minVr) : true);

    // ========= Supabase (localStorage + sessionStorage) =========


  // active client for this page (set by requireAuth)
  window.supabaseClient = null;
  window.SESSION = null;

  // ===== Guest (local) storage =====


  async function requireAuth(){
    return window.mkwtRequireAuth({
      pageName: "sessions.html",
      allowGuest: true,
      onAccount: async (session, client) => {
        supabaseClient = client;
        SESSION = session;
        try{ localStorage.setItem('mkwt_mode','account'); }catch(e){}
        const ui = document.getElementById("userInfo");
        if (ui) ui.textContent = maskEmail(session.user?.email) || "Logged in";
        try{ setNavAuthButton("account"); }catch(e){}
      },
      onGuest: async () => {
        window.IS_GUEST = true;
        window.supabaseClient = null;
        window.SESSION = null;
        const ui = document.getElementById("userInfo");
        if (ui) ui.textContent = "Guest (local)";
        try{ setNavAuthButton("guest"); }catch(e){}
      }
    });
  }
async function requireSession(){
    const sess = await requireAuth();
    // Guest mode is allowed ONLY if user chose it (mkwt_last_mode = 'guest')
    if (!sess) {
      const last = (()=>{ try{ return localStorage.getItem('mkwt_last_mode') || ''; }catch(e){ return ''; } })();
      if (last !== 'guest') {
        try{ localStorage.setItem('mkwt_mode','unknown'); localStorage.setItem('mkwt_last_page', location.pathname || 'sessions.html'); }catch(e){}
        window.location.replace('login.html');
        return null;
      }
      window.IS_GUEST = true;
      window.supabaseClient = null;
      window.SESSION = null;
      try{ localStorage.setItem('mkwt_mode','guest'); }catch(e){}
      const ui = document.getElementById("userInfo");
      if (ui) ui.textContent = "Guest (local)";
      try{ setNavAuthButton("guest"); }catch(e){}
      return null;
    }
    const email = maskEmail(sess.user?.email) || "Logged in";
    if ($("userInfo")) $("userInfo").textContent = email;
    try{ setNavAuthButton("account"); }catch(e){}
    return sess;
  }

  async function getAllMatchesAsc(){
    // same approach as stats: paginated fetch, chronological
    const all = [];
    // Guest: use local matches
    if (isGuest()) {
      let g = loadGuestMatches().slice().sort((a,b)=> String(a.created_at||"").localeCompare(String(b.created_at||"")) || String(a.id||"").localeCompare(String(b.id||"")));
      const minVr = (typeof getMinVrFilter === "function") ? getMinVrFilter() : 0;
      if (minVr > 0 && typeof passesMinVrFilter === "function") g = g.filter(m => passesMinVrFilter(m, minVr));
      return g;
    }
    try {
      let page = 0;
      const pageSize = 1000;
      while (page < 50) { // safety cap
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabaseClient.from("matches").select("*").order("created_at", { ascending: true }).range(from, to);
        if (error) throw error;
        if (Array.isArray(data) && data.length) all.push(...data);
        if (!Array.isArray(data) || data.length < pageSize) break;
        page++;
      }
    } catch (e) {
      console.warn("[sessions] load matches failed", e);
      setStatus("Could not load matches.", false);
    }
    const minVr = getMinVrFilter();
    if (minVr > 0) {
      return all.filter(m => passesMinVrFilter(m, minVr));
    }
    return all;
  }

  function safeDate(d){
    const dt = (d ? new Date(d) : null);
    return (dt && !isNaN(dt)) ? dt : null;
  }

  function fmtDT(dt){
    try {
      return dt.toLocaleString();
    } catch {
      return "";
    }
  }

  function fmtDuration(ms){
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (minutes < 1) return "<1m";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest}m`;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }

  function groupSessions(matchesAsc, gapMinutes=45){
    const gapMs = gapMinutes * 60 * 1000;
    const sessions = [];
    let cur = null;

    for (const m of (matchesAsc || [])) {
      const dt = safeDate(m?.created_at);
      if (!dt) continue;

      if (!cur) {
        cur = { matches: [m], start: dt, end: dt };
        sessions.push(cur);
        continue;
      }

      const prevEnd = cur.end;
      if (!prevEnd || (dt.getTime() - prevEnd.getTime()) > gapMs) {
        cur = { matches: [m], start: dt, end: dt };
        sessions.push(cur);
      } else {
        cur.matches.push(m);
        cur.end = dt;
      }
    }

    return sessions;
  }

  function computeSessionStats(sess){
    const ms = sess?.matches || [];
    const inter = [];
    const track = [];
    let interCount = 0, trackCount = 0;

    // start/end VR: use vr_after/vr_before if present, otherwise derive from vr_after sequence
    let startVr = null;
    let endVr = null;

    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const hasInter = (m?.intermission != null && String(m.intermission).trim() !== "");
      const delta = Number(m?.vr_change);
      if (Number.isFinite(delta)) {
        if (hasInter) { inter.push(delta); interCount++; }
        else { track.push(delta); trackCount++; }
      } else {
        // still count type even if delta missing
        if (hasInter) interCount++; else trackCount++;
      }

      const after = Number(m?.vr_after);
      const before = Number(m?.vr_before);
      if (i === 0) {
        if (Number.isFinite(before)) startVr = before;
        else if (Number.isFinite(after) && Number.isFinite(delta)) startVr = after - delta;
        else if (Number.isFinite(after)) startVr = after; // fallback
      }
      if (i === ms.length - 1) {
        if (Number.isFinite(after)) endVr = after;
        else if (Number.isFinite(before)) endVr = before; // fallback
      }
    }

    // If we have only after values, we can improve startVr by using (end of first) - delta if possible
    if (startVr != null && endVr == null) endVr = startVr;
    const gain = (startVr != null && endVr != null) ? (endVr - startVr) : null;
    const playtimeMs = (sess?.start && sess?.end) ? Math.max(0, sess.end.getTime() - sess.start.getTime()) : 0;

    const avg = (arr) => arr.length ? (arr.reduce((a,v)=>a+v,0)/arr.length) : null;
    return {
      interAvg: avg(inter),
      trackAvg: avg(track),
      interCount,
      trackCount,
      startVr,
      endVr,
      gain,
      playtimeMs,
      playtimeText: fmtDuration(playtimeMs)
    };
  }

  function cleanTrackKey(value){
    return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function sessionTrackKey(match){
    return cleanTrackKey(match?.track);
  }

  function buildTrackForecastStats(matchesAsc){
    const buckets = new Map();
    for (const match of (matchesAsc || [])) {
      const key = sessionTrackKey(match);
      const delta = Number(match?.vr_change);
      if (!key || !Number.isFinite(delta)) continue;
      const row = buckets.get(key) || { count: 0, sum: 0 };
      row.count += 1;
      row.sum += delta;
      buckets.set(key, row);
    }
    for (const row of buckets.values()) {
      row.avg = row.count ? row.sum / row.count : 0;
    }
    return buckets;
  }

  function signedNumber(value, digits = 2){
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const text = digits == null ? String(Math.round(n)) : n.toFixed(digits);
    return n > 0 ? `+${text}` : text;
  }

  function computeSessionForecast(sess, st){
    const matches = (sess?.matches || []).filter(match => sessionTrackKey(match));
    if (!matches.length) return null;
    let projectedSum = 0;
    let neutralCount = 0;
    let knownCount = 0;
    for (const match of matches) {
      const stat = trackForecastStats.get(sessionTrackKey(match));
      if (stat && Number(stat.count || 0) >= FORECAST_MIN_PLAYS) {
        projectedSum += Number(stat.avg || 0);
        knownCount += 1;
      } else {
        neutralCount += 1;
      }
    }
    const projectedAvg = projectedSum / matches.length;
    const actualTotal = Number.isFinite(Number(st?.gain))
      ? Number(st.gain)
      : matches.reduce((sum, match) => sum + (Number.isFinite(Number(match?.vr_change)) ? Number(match.vr_change) : 0), 0);
    const actualAvg = matches.length ? actualTotal / matches.length : null;
    const forecastEpsilon = 0.005;
    const pool = projectedAvg < -forecastEpsilon ? "unfavorable" : (projectedAvg > forecastEpsilon ? "favorable" : "neutral");
    const actualGood = Number(actualAvg) >= 0;
    const beatProjection = Number(actualAvg) >= projectedAvg;
    const intro = pool === "unfavorable"
      ? "Track pool was unfavorable for you"
      : (pool === "favorable" ? "Track pool looked favorable" : "Track pool looked neutral");
    let outcome = actualGood ? "and you finished above break-even." : "and the result landed below break-even.";
    if (pool === "unfavorable") {
      outcome = actualGood
        ? "but you still finished above break-even."
        : (beatProjection ? "you beat that projection, but stayed below break-even." : "the bad result was likely partly track-driven.");
    } else if (pool === "favorable") {
      outcome = beatProjection
        ? "and you beat the projection."
        : (actualGood ? "but you landed below projection while still above break-even." : "but the result landed below expectation.");
    }
    return {
      projectedAvg,
      actualTotal,
      actualAvg,
      neutralCount,
      knownCount,
      trackCount: matches.length,
      pool,
      message: `${intro}: projected ${signedNumber(projectedAvg)} VR avg, ${outcome}`,
    };
  }

  function renderSessionForecast(forecast, open){
    if (!forecast) return "";
    const neutralNote = forecast.neutralCount
      ? `<div class="sessionForecastNote">${forecast.neutralCount} track${forecast.neutralCount === 1 ? "" : "s"} under ${FORECAST_MIN_PLAYS} plays counted as neutral.</div>`
      : "";
    return `
      <div class="sessionForecast">
        <button class="sessionForecastToggle" type="button" data-session-forecast-toggle aria-expanded="${open ? "true" : "false"}">
          <span class="sessionForecastToggle__label">Track Forecast</span>
          <span class="sessionForecastToggle__value">${signedNumber(forecast.projectedAvg)} avg</span>
        </button>
        <div class="sessionForecastPanel"${open ? "" : " hidden"}>
          <div class="sessionForecastGrid">
            <div><span>Actual</span><b>${signedNumber(forecast.actualTotal, 0)} total</b><em>${signedNumber(forecast.actualAvg)} avg</em></div>
            <div><span>Projected</span><b>${signedNumber(forecast.projectedAvg)} avg</b><em>0 VR break-even</em></div>
            <div><span>Known maps</span><b>${forecast.knownCount}/${forecast.trackCount}</b><em>${FORECAST_MIN_PLAYS}+ plays</em></div>
          </div>
          <p>${forecast.message}</p>
          ${neutralNote}
        </div>
      </div>`;
  }

  const FORECAST_MIN_PLAYS = 5;
  let trackForecastStats = new Map();
  let openForecasts = {};
  let sessionsDesc = [];
  let page = 1;
  const pageSize = 10;

  function renderSessionSummary(){
    const total = sessionsDesc.length;
    const allStats = sessionsDesc.map(computeSessionStats);
    const totalMatches = sessionsDesc.reduce((sum, sess) => sum + ((sess?.matches || []).length), 0);
    const totalPlaytime = allStats.reduce((sum, st) => sum + Number(st.playtimeMs || 0), 0);
    const avgMatches = total ? (totalMatches / total) : null;
    const avgPlaytime = total ? (totalPlaytime / total) : null;

    if ($("summaryTotalSessions")) $("summaryTotalSessions").textContent = total ? String(total) : "-";
    if ($("summaryAvgMatches")) $("summaryAvgMatches").textContent = avgMatches == null ? "-" : avgMatches.toFixed(1);
    if ($("summaryAvgPlaytime")) $("summaryAvgPlaytime").textContent = avgPlaytime == null ? "-" : fmtDuration(avgPlaytime);
  }

  function renderPage(){
    const total = sessionsDesc.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(1, page), totalPages);

    const start = (page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const slice = sessionsDesc.slice(start, end);

    if ($("pageInfo")) $("pageInfo").textContent = page + " / " + totalPages;
    if ($("sessionCount")) $("sessionCount").textContent = String(total);
    renderSessionSummary();

    const list = $("sessionList");
    if (!list) return;

    if (!slice.length) {
      list.innerHTML = '<div class="muted">No sessions yet.</div>';
      return;
    }

    // Render compact, clean cards

      const classForVal = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return "muted";
        if (n > 0) return "ok";
        if (n < 0) return "bad";
        return "muted";
      };

    let html = '<div class="sessStack">';
    for (let i = 0; i < slice.length; i++) {
      const s = slice[i];
      const st = computeSessionStats(s);
      const gain = st.gain;
      const gainTxt = (gain == null) ? "-" : ((gain >= 0 ? "+" : "") + gain);
      const gainClass = (gain == null) ? "muted" : (gain >= 0 ? "ok" : "bad");

      // One bold time range line
      let rangeLine = "Session";
      try {
        const d = s.start;
        const date = d ? d.toLocaleDateString() : "";
        const t1 = d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const t2 = s.end ? s.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        rangeLine = (date ? (date + " ") : "") + (t1 && t2 ? (t1 + "-" + t2) : "");
        if (!rangeLine.trim()) rangeLine = "Session";
      } catch {}

      const startVr = st.startVr == null ? "-" : st.startVr;
      const endVr = st.endVr == null ? "-" : st.endVr;

      const imAvg = st.interAvg == null ? "-" : st.interAvg.toFixed(2);
      const trAvg = st.trackAvg == null ? "-" : st.trackAvg.toFixed(2);
      const imAvgClass = classForVal(imAvg);
      const trAvgClass = classForVal(trAvg);
      const matchCount = (s.matches || []).length;
      const sessionNo = total - (start + i);
      const forecast = computeSessionForecast(s, st);
      const forecastKey = String(start + i);
      const forecastOpen = !!openForecasts[forecastKey];

      html += `
        <div class="card sessCard">
          <div class="sessHeader">
            <div>
              <div class="sessKicker">Session #${sessionNo}</div>
              <div class="sessTitle">${rangeLine}</div>
            </div>
            <div class="sessBadge ${gainClass}">Gain ${gainTxt}</div>
          </div>

          <div class="sessStatsGrid">
            <div class="sessMetric">
              <span>Matches</span>
              <b class="sessNum">${matchCount}</b>
            </div>
            <div class="sessMetric">
              <span>Playtime</span>
              <b class="sessNum">${st.playtimeText}</b>
            </div>
            <div class="sessMetric sessMetric--wide">
              <span>VR</span>
              <b><span class="sessNum">${startVr}</span> <span class="sessArrow">-></span> <span class="sessNum">${endVr}</span></b>
            </div>
            <div class="sessMetric sessModeStat">
              <span>Intermission</span>
              <b class="sessNum">${st.interCount}</b>
              <em>Avg <strong class="${imAvgClass} sessNum">${imAvg}</strong></em>
            </div>
            <div class="sessMetric sessModeStat">
              <span>3-Lap tracks</span>
              <b class="sessNum">${st.trackCount}</b>
              <em>Avg <strong class="${trAvgClass} sessNum">${trAvg}</strong></em>
            </div>
          </div>
          ${renderSessionForecast(forecast, forecastOpen)}
        </div>
      `;
    }
    html += "</div>";
    list.innerHTML = html;

    list.querySelectorAll("[data-session-forecast-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".sessCard");
        const cards = Array.from(list.querySelectorAll(".sessCard"));
        const localIndex = cards.indexOf(card);
        if (localIndex < 0) return;
        const key = String(start + localIndex);
        openForecasts[key] = !openForecasts[key];
        renderPage();
      });
    });
  }

  function wirePager(){
    $("btnPrev")?.addEventListener("click", () => { page--; renderPage(); });
    $("btnNext")?.addEventListener("click", () => { page++; renderPage(); });
  }

  async function main(){
    if (!window.supabase?.createClient) { setStatus("Supabase could not load (CDN blocked).", false); return; }
    wirePager();
    await requireSession();

    setStatus("Loading matches...", true);
    const matchesAsc = await getAllMatchesAsc();
    trackForecastStats = buildTrackForecastStats(matchesAsc);
    openForecasts = {};

    if (!Array.isArray(matchesAsc) || matchesAsc.length === 0) {
      setStatus("No matches yet.", true);
      sessionsDesc = [];
      renderPage();
      return;
    }

    // group and reverse (newest first)
    const sessions = groupSessions(matchesAsc, 45);
    sessionsDesc = sessions.map(s => ({ ...s })).reverse();

    setStatus("Ready.", true);
    renderPage();
  }

  main();
