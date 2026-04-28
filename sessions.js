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

    const avg = (arr) => arr.length ? (arr.reduce((a,v)=>a+v,0)/arr.length) : null;
    return {
      interAvg: avg(inter),
      trackAvg: avg(track),
      interCount,
      trackCount,
      startVr,
      endVr,
      gain
    };
  }
  let sessionsDesc = [];
  let page = 1;
  const pageSize = 10;

  function renderPage(){
    const total = sessionsDesc.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(1, page), totalPages);

    const start = (page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const slice = sessionsDesc.slice(start, end);

    if ($("pageInfo")) $("pageInfo").textContent = page + " / " + totalPages;
    if ($("sessionCount")) $("sessionCount").textContent = String(total);

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

    let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
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

      html += `
        <div class="card sessCard">
          <div class="sessHeader">
            <div class="sessTitle">${rangeLine}</div>
            <div class="sessBadge ${gainClass}">Gain ${gainTxt}</div>
          </div>

          <div class="sessMeta">
            <div class="muted sessVR">VR <b class="sessNum">${startVr}</b> > <b class="sessNum">${endVr}</b></div>
          </div>

          <div class="muted sessGrid">
            <div class="label">Intermission</div>
            <div class="val"><b class="sessNum">${st.interCount}</b> - Avg <span class="sessAvg ${imAvgClass} sessNum">${imAvg}</span></div>

            <div class="label">Tracks (3 Laps)</div>
            <div class="val"><b class="sessNum">${st.trackCount}</b> - Avg <span class="sessAvg ${trAvgClass} sessNum">${trAvg}</span></div>
          </div>
        </div>
      `;
    }
    html += "</div>";
    list.innerHTML = html;
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
