(() => {
  const TRACKS = [
    "Intermission",
    "Acorn Heights","Airship Fortress","Boo Cinema","Bowser's Castle","Cheep Cheep Falls",
    "Choco Mountain","Crown City","Dandelion Depths","Desert Hills","Dino Dino Jungle",
    "DK Pass","DK Spaceport","Dry Bones Burnout","Faraway Oasis","Great ? Block Ruins",
    "Koopa Troopa Beach","Mario Circuit","Mario Bros. Circuit","Moo Moo Meadows",
    "Peach Beach","Peach Stadium","Rainbow Road","Salty Salty Speedway","Shy Guy Bazaar",
    "Sky-High Sundae","Starview Peak","Toad's Factory","Wario Shipyard","Wario Stadium","Whistlestop Summit"
  ];
  const SCORE_MAP = {
    12: [15,12,10,9,8,7,6,5,4,3,2,1],
    11: [15,12,10,9,8,7,6,5,4,3,2],
    10: [15,12,10,9,8,7,6,5,4,3]
  };
  const STORAGE_CURRENT = 'mkwt_lounge_current_v1';
  const STORAGE_SESSIONS = 'mkwt_lounge_sessions_v1';
  const SESSION_PAGE_SIZE = 10;
  window.MKWT_LOUNGE_STORAGE = { current: STORAGE_CURRENT, sessions: STORAGE_SESSIONS };

  const $ = (id) => document.getElementById(id);
  const state = { lobbySize: 12, current: null, sessions: [], chart: null, lastTrackStats: [], lastSelectedTrack: null, trackSortKey: 'avg', trackSortDir: 'desc', sessionPage: 1 };

  function read(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; }
  }
  function write(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }
  function setStatus(msg, ok=true){
    const el = $('status');
    if(!el) return;
    el.textContent = msg || '';
    el.className = 'muted ' + (msg ? (ok ? 'ok' : 'bad') : '');
  }
  function currentTs(){ return new Date().toISOString(); }
  function fmtDate(iso){
    try{ return new Date(iso).toLocaleString(); }catch(e){ return iso || '–'; }
  }
  function getPoints(lobbySize, placement){
    const arr = SCORE_MAP[Number(lobbySize)] || SCORE_MAP[12];
    const idx = Number(placement) - 1;
    return Number.isInteger(idx) && idx >= 0 && idx < arr.length ? arr[idx] : null;
  }
  function makeFreshMogi(){
    return { created_at: currentTs(), races: [], totalPoints: 0, disconnects: 0, saved: false };
  }
  function loadAll(){
    state.sessions = read(STORAGE_SESSIONS, []);
    state.current = read(STORAGE_CURRENT, null) || makeFreshMogi();
    if (!Array.isArray(state.current.races)) state.current = makeFreshMogi();
  }
  function persist(){
    write(STORAGE_CURRENT, state.current);
    write(STORAGE_SESSIONS, state.sessions);
  }
  function updatePlacementOptions(){
    const sel = $('placementSelect');
    const lobby = Number(state.lobbySize) || 12;
    const prev = Number(sel.value || 0);
    sel.innerHTML = '<option value="">Select placement</option>' + Array.from({length:lobby}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    if(prev && prev <= lobby) sel.value = String(prev);
    $('scorePreview').textContent = `Points: ${SCORE_MAP[lobby].join(' / ')}`;
    document.querySelectorAll('#lobbyGroup .navAction').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.lobby) === lobby));
  }
  function renderCurrent(){
    const races = state.current.races || [];
    $('sumRaceCount').textContent = `${races.length} / 12`;
    $('sumPoints').textContent = String(races.reduce((a,r)=>a + Number(r.points || 0), 0));
    $('sumAvg').textContent = races.length ? (races.reduce((a,r)=>a + Number(r.points || 0), 0) / races.length).toFixed(2) : '0.00';
    $('sumDcs').textContent = String(races.filter(r => r.disconnect).length);
    $('sumRemain').textContent = String(Math.max(0, 12 - races.length));

    const body = $('currentMogiBody');
    if(!races.length){
      body.innerHTML = '<tr><td colspan="6" class="muted">No races tracked yet.</td></tr>';
      return;
    }
    body.innerHTML = races.map((r, idx) => `
      <tr>
        <td>${idx+1}</td>
        <td>${escapeHtml(r.track)}</td>
        <td>${r.lobbySize}p</td>
        <td>${r.disconnect ? 'DC' : r.placement}</td>
        <td>${r.points}</td>
        <td>${r.disconnect ? '<span class="badge">Disconnect</span>' : 'Normal'}</td>
      </tr>`).join('');
  }
  
  function sortTrackStats(stats){
    const rows = stats.slice();
    const mul = state.trackSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (state.trackSortKey === 'count') {
        const d = (a.count - b.count);
        if (d !== 0) return mul * d;
        const d2 = (a.avg - b.avg);
        if (d2 !== 0) return mul * d2;
        return a.track.localeCompare(b.track, 'de');
      }
      const d = (a.avg - b.avg);
      if (d !== 0) return mul * d;
      const d2 = (a.count - b.count);
      if (d2 !== 0) return mul * d2;
      return a.track.localeCompare(b.track, 'de');
    });
    return rows;
  }
  function updateSortButtons(){
    const perfBtn = $('btnSortPerformance');
    const playedBtn = $('btnSortPlayed');
    if(!perfBtn || !playedBtn) return;
    const perfActive = state.trackSortKey === 'avg';
    const playedActive = state.trackSortKey === 'count';
    perfBtn.classList.toggle('active', perfActive);
    playedBtn.classList.toggle('active', playedActive);
    perfBtn.textContent = perfActive ? `Performance ${state.trackSortDir === 'desc' ? '↓' : '↑'}` : 'Performance';
    playedBtn.textContent = playedActive ? `Most played ${state.trackSortDir === 'desc' ? '↓' : '↑'}` : 'Most played';
  }
  function setTrackSort(key){
    if(state.trackSortKey === key){
      state.trackSortDir = state.trackSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      state.trackSortKey = key;
      state.trackSortDir = 'desc';
    }
    refresh();
  }

function aggregateTrackStats(){
    const bucket = new Map(TRACKS.map(t => [t, []]));
    for(const session of state.sessions){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        if(!bucket.has(race.track)) bucket.set(race.track, []);
        bucket.get(race.track).push(Number(race.points || 0));
      }
    }
    return TRACKS.map(track => {
      const vals = bucket.get(track) || [];
      const count = vals.length;
      const sum = vals.reduce((a,b)=>a+b,0);
      return {
        track,
        avg: count ? sum / count : 0,
        count,
      };
    });
  }
  function renderTrackInsight(trackName){
    state.lastSelectedTrack = trackName || null;
    const el = $('trackInsight');
    if(!el) return;
    const stat = state.lastTrackStats.find(s => s.track === trackName);
    if(!stat){
      el.innerHTML = '<div class="muted">Click on a track bar to see AVG points and times played.</div>';
      return;
    }
    el.innerHTML = `
      <div class="trackInsightHeader">
        <div>
          <div class="trackInsightTitle">${escapeHtml(stat.track)}</div>
          <div class="muted">Track details from saved Mogis</div>
        </div>
      </div>
      <div class="trackInsightGrid">
        <div class="statBox"><div class="statLabel">AVG points</div><div class="statValue">${stat.count ? stat.avg.toFixed(2) : '–'}</div></div>
        <div class="statBox"><div class="statLabel">Times played</div><div class="statValue">${stat.count}</div></div>
      </div>`;
  }
  function renderSessions(){
    const wrap = $('sessionList');
    const pageInfo = $('sessionPageInfo');
    const paginationRow = $('sessionPaginationRow');
    const prevBtn = $('btnSessionPrev');
    const nextBtn = $('btnSessionNext');
    if(!state.sessions.length){
      wrap.innerHTML = '<div class="muted">No saved Mogis yet.</div>';
      if(pageInfo) pageInfo.textContent = 'Page 1';
      if(prevBtn) prevBtn.disabled = true;
      if(nextBtn) nextBtn.disabled = true;
      if(paginationRow) paginationRow.hidden = true;
      return;
    }
    const items = state.sessions
      .map((s, originalIndex) => ({ ...s, __originalIndex: originalIndex }))
      .sort((a,b)=>String(b.completed_at||'').localeCompare(String(a.completed_at||'')));
    const maxPage = Math.max(1, Math.ceil(items.length / SESSION_PAGE_SIZE));
    if(state.sessionPage > maxPage) state.sessionPage = maxPage;
    if(state.sessionPage < 1) state.sessionPage = 1;
    const from = (state.sessionPage - 1) * SESSION_PAGE_SIZE;
    const pageItems = items.slice(from, from + SESSION_PAGE_SIZE);

    if(pageInfo) pageInfo.textContent = `Page ${state.sessionPage} / ${maxPage}`;
    if(prevBtn) prevBtn.disabled = state.sessionPage <= 1;
    if(nextBtn) nextBtn.disabled = state.sessionPage >= maxPage;
    if(paginationRow) paginationRow.hidden = items.length <= SESSION_PAGE_SIZE;

    wrap.innerHTML = pageItems.map((s, idx) => {
      const points = (s.races || []).reduce((a,r)=>a + Number(r.points || 0), 0);
      const count = (s.races || []).length;
      const dcs = (s.races || []).filter(r => r.disconnect).length;
      const details = (s.races || []).map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.track)}</td>
          <td>${r.lobbySize}p</td>
          <td>${r.disconnect ? 'DC' : r.placement}</td>
          <td>${r.points}</td>
          <td>${r.disconnect ? 'Disconnect' : 'Normal'}</td>
        </tr>`).join('');
      return `
        <div class="sessionCard">
          <div class="sessionCardHead">
            <div>
              <div class="sessionTitle">${escapeHtml(fmtDate(s.completed_at || s.created_at))}</div>
              <div class="muted">${count} races · ${points} points · Avg ${count ? (points/count).toFixed(2) : '0.00'} · DCs ${dcs}</div>
            </div>
            <div class="sessionActions">
              <button class="infoBtn" type="button" data-session-toggle="${idx}" aria-expanded="false" title="Show matches">?</button>
              <button class="navAction navAction--sm danger" type="button" data-session-delete="${s.__originalIndex}" title="Delete Mogi">Delete</button>
            </div>
          </div>
          <div class="sessionDetails" id="sessionDetails-${idx}" hidden>
            <div class="tableWrap">
              <table>
                <thead><tr><th>#</th><th>Track</th><th>Lobby</th><th>Placement</th><th>Points</th><th>Type</th></tr></thead>
                <tbody>${details}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-session-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-session-toggle');
        const panel = $(`sessionDetails-${id}`);
        const open = !panel.hasAttribute('hidden');
        if(open){
          panel.setAttribute('hidden', 'hidden');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          panel.removeAttribute('hidden');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    wrap.querySelectorAll('[data-session-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-delete'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        deleteMogi(originalIndex);
      });
    });
  }
  function renderChart(stats){
    const sortedStats = sortTrackStats(stats);
    state.lastTrackStats = sortedStats;
    updateSortButtons();
    const labels = sortedStats.map(s => s.track);
    const values = sortedStats.map(s => Number(s.avg.toFixed(2)));
    const ctx = $('chartTrackAvg');
    if(state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Average points', data: values, borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, max: 15, ticks: { color: getCss('--text') } },
          y: { ticks: { color: getCss('--text'), autoSkip: false } }
        },
        plugins: { legend: { display: false } },
        onClick: (_, elements) => {
          if(!elements?.length) return;
          const idx = elements[0].index;
          const track = labels[idx];
          renderTrackInsight(track);
        }
      }
    });
  }
  function getCss(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff'; }
  function refresh(){
    renderCurrent();
    const stats = aggregateTrackStats();
    renderSessions();
    renderChart(stats);
    renderTrackInsight(state.lastSelectedTrack && stats.some(s => s.track === state.lastSelectedTrack) ? state.lastSelectedTrack : null);
    persist();
  }
  function maybeCompleteMogi(){
    if((state.current.races || []).length < 12) return;
    const finished = {
      ...state.current,
      completed_at: currentTs(),
      saved: true,
    };
    state.sessions.push(finished);
    state.sessionPage = 1;
    state.current = makeFreshMogi();
    setStatus('Mogi completed and saved as one session.', true);
    refresh();
  }
  function saveRace({disconnect=false}){
    const track = $('trackSelect').value;
    const placement = Number($('placementSelect').value || 0);
    const lobbySize = Number(state.lobbySize || 12);
    if(!track){ setStatus('Please select a track.', false); return; }
    if((state.current.races || []).length >= 12){ setStatus('This Mogi already has 12 races. Start a new Mogi.', false); return; }
    let points, effectivePlacement;
    if(disconnect){
      points = 1;
      effectivePlacement = null;
    } else {
      if(!placement){ setStatus('Please select a placement.', false); return; }
      points = getPoints(lobbySize, placement);
      effectivePlacement = placement;
      if(points == null){ setStatus('Invalid placement for this lobby size.', false); return; }
    }
    state.current.races.push({
      track,
      lobbySize,
      placement: effectivePlacement,
      points,
      disconnect,
      created_at: currentTs()
    });
    $('trackSelect').value = '';
    $('placementSelect').value = '';
    setStatus(disconnect ? 'DC saved with 1 point. It is excluded from track stats.' : 'Race tracked.', true);
    refresh();
    maybeCompleteMogi();
  }
  function undoLast(){
    if(!(state.current.races || []).length){ setStatus('Nothing to undo.', false); return; }
    state.current.races.pop();
    setStatus('Last entry removed.', true);
    refresh();
  }
  function newMogi(){
    state.current = makeFreshMogi();
    setStatus('New Mogi started.', true);
    refresh();
  }
  function deleteMogi(index){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    const label = fmtDate(session.completed_at || session.created_at);
    const ok = window.confirm(`Delete saved Mogi from ${label}?`);
    if(!ok) return;
    state.sessions.splice(index, 1);
    setStatus('Saved Mogi deleted.', true);
    refresh();
  }
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function bind(){
    document.querySelectorAll('#lobbyGroup .navAction').forEach(btn => btn.addEventListener('click', () => {
      state.lobbySize = Number(btn.dataset.lobby || 12);
      updatePlacementOptions();
    }));
    $('btnSortPerformance')?.addEventListener('click', () => setTrackSort('avg'));
    $('btnSortPlayed')?.addEventListener('click', () => setTrackSort('count'));
    $('btnSaveRace').addEventListener('click', () => saveRace({disconnect:false}));
    $('btnDisconnect').addEventListener('click', () => saveRace({disconnect:true}));
    $('btnUndo').addEventListener('click', undoLast);
    $('btnNewMogi').addEventListener('click', newMogi);
    $('btnSessionPrev')?.addEventListener('click', () => { if(state.sessionPage <= 1) return; state.sessionPage -= 1; renderSessions(); persist(); });
    $('btnSessionNext')?.addEventListener('click', () => { const maxPage = Math.max(1, Math.ceil(state.sessions.length / SESSION_PAGE_SIZE)); if(state.sessionPage >= maxPage) return; state.sessionPage += 1; renderSessions(); persist(); });
    window.addEventListener('storage', () => { loadAll(); refresh(); });
  }
  loadAll();
  updatePlacementOptions();
  bind();
  refresh();
})();
