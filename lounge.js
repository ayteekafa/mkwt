(() => {
  const COURSE_TRACKS = [
    "Acorn Heights","Airship Fortress","Boo Cinema","Bowser's Castle","Cheep Cheep Falls",
    "Choco Mountain","Crown City","Dandelion Depths","Desert Hills","Dino Dino Jungle",
    "DK Pass","DK Spaceport","Dry Bones Burnout","Faraway Oasis","Great ? Block Ruins",
    "Koopa Troopa Beach","Mario Circuit","Mario Bros. Circuit","Moo Moo Meadows",
    "Peach Beach","Peach Stadium","Rainbow Road","Salty Salty Speedway","Shy Guy Bazaar",
    "Sky-High Sundae","Starview Peak","Toad's Factory","Wario Shipyard","Wario Stadium","Whistlestop Summit"
  ];
  const PAGE_CONFIG = (() => {
    const ds = document.body?.dataset || {};
    const requestedCount = Number(ds.loungePlayerCount || 12);
    const playerCount = requestedCount === 24 ? 24 : 12;
    return {
      playerCount,
      storageSuffix: String(ds.loungeStorageSuffix || (playerCount === 24 ? '24' : '12')),
      pageName: String(ds.loungePageName || (playerCount === 24 ? 'lounge-24.html' : 'lounge.html')),
      title: String(ds.loungeTitle || (playerCount === 24 ? 'Lounge 24p' : 'Lounge 12p')),
      allowIntermissionRoutes: String(ds.loungeAllowIntermission || '').toLowerCase() === 'true',
      allowLobbyTags: String(ds.loungeLobbyTags || (playerCount === 24 ? 'false' : 'true')).toLowerCase() !== 'false',
      mkcentralSeason: String(ds.loungeMkcentralSeason || '2'),
      mkcentralPlayerCount: String(ds.loungeMkcentralPlayerCount || playerCount),
    };
  })();
  const TRACKS = PAGE_CONFIG.allowIntermissionRoutes ? COURSE_TRACKS : ["Intermission", ...COURSE_TRACKS];
  const SCORE_MAP = {
    12: [15,12,10,9,8,7,6,5,4,3,2,1],
    11: [15,12,10,9,8,7,6,5,4,3,2],
    10: [15,12,10,9,8,7,6,5,4,3],
    24: [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1]
  };
  const STORAGE_CURRENT = PAGE_CONFIG.storageSuffix === '12' ? 'mkwt_lounge_current_v1' : `mkwt_lounge${PAGE_CONFIG.storageSuffix}_current_v1`;
  const STORAGE_SESSIONS = PAGE_CONFIG.storageSuffix === '12' ? 'mkwt_lounge_sessions_v1' : `mkwt_lounge${PAGE_CONFIG.storageSuffix}_sessions_v1`;
  const MKCENTRAL_SETTINGS_KEY = 'mkwt_mkcentral_player_ref_v1';
  const MKCENTRAL_SEASON = PAGE_CONFIG.mkcentralSeason;
  const MKCENTRAL_PLAYER_COUNT = PAGE_CONFIG.mkcentralPlayerCount;
  const SESSION_PAGE_SIZE = 10;
  const AVG_GAIN_THRESHOLD = PAGE_CONFIG.playerCount === 24 ? 6 : 6.83;
  window.MKWT_LOUNGE_STORAGE = { current: STORAGE_CURRENT, sessions: STORAGE_SESSIONS };
  window.MKWT_LOUNGE_CONFIG = PAGE_CONFIG;

  const $ = (id) => document.getElementById(id);
  const state = {
    lobbySize: PAGE_CONFIG.playerCount,
    entryMode: 'track',
    entryDisconnect: false,
    current: null,
    sessions: [],
    chart: null,
    placementChart: null,
    typePieChart: null,
    trackChartMode: 'tracks',
    placementMode: 'all',
    lastTrackStats: [],
    lastSelectedTrack: null,
    trackSortKey: 'avg',
    trackSortDir: 'desc',
    sessionPage: 1,
    openSessionDetails: {},
    editingSessionIndex: null,
    mkcentralMatches: {},
    mkcentralPlayerId: ''
  };
  let loungeClient = null;
  let loungeSession = null;
  let cloudMode = false;
  let isBound = false;
  let routeFiltersBound = false;
  let stratsMetaIntermissions = null;

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
    el.className = 'muted statusLine ' + (msg ? (ok ? 'ok' : 'bad') : '');
    el.hidden = !msg;
  }
  function currentTs(){ return new Date().toISOString(); }
  function fmtDate(iso){
    try{ return new Date(iso).toLocaleString(); }catch(e){ return iso || '–'; }
  }
  function fmtDelta(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return 'â€“';
    return `${n > 0 ? '+' : ''}${Math.round(n)}`;
  }
  function fmtMmr(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return 'â€“';
    return n.toLocaleString('en-US');
  }
  function finiteNumber(value){
    if(value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function extractMkcentralPlayerId(value){
    const raw = String(value || '').trim();
    if(/^\d+$/.test(raw)) return raw;
    const match = raw.match(/PlayerDetails\/(\d+)/i);
    return match ? match[1] : '';
  }
  function normalizeMkcentralFormat(value){
    const raw = String(value || '').trim();
    if(!raw || /^\d{5,}$/.test(raw)) return 'Other';
    const upper = raw.toUpperCase();
    if(upper === 'FFA') return 'FFA';
    if(/^\d+V\d+$/.test(upper)) return upper;
    return upper || 'Other';
  }
  function normalizeMkcentralTier(value){
    const raw = String(value || '').trim();
    if(!raw || /^\d{5,}$/.test(raw)) return 'Other';
    return raw.toUpperCase() || 'Other';
  }
  function parseMkcentralEventLabel(label){
    const text = String(label || '');
    return {
      format: normalizeMkcentralFormat((text.match(/\b(FFA|\d+v\d+)\b/i) || [])[1]),
      tier: normalizeMkcentralTier((text.match(/\bTier\s+([A-Z]+)\b/i) || [])[1]),
    };
  }
  function mkcentralGroupValue(event, key){
    const normalizer = key === 'tier' ? normalizeMkcentralTier : normalizeMkcentralFormat;
    const direct = normalizer(event?.[key]);
    if(direct !== 'Other') return direct;
    const parsed = parseMkcentralEventLabel(event?.raw_event || event?.event || event?.event_name || '');
    return normalizer(parsed[key]);
  }
  function mkcentralDataKey(playerId){
    return `mkwt_mkcentral_${playerId}_season${MKCENTRAL_SEASON}_p${MKCENTRAL_PLAYER_COUNT}_v1`;
  }
  function eventTimestamp(value){
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
  }
  function sessionFinishedAt(session){
    return session?.completed_at || session?.updated_at || session?.created_at || '';
  }
  function sessionTotalPoints(session){
    return (session?.races || []).reduce((sum, race) => sum + Number(race?.points || 0), 0);
  }
  function sessionRaceCount(session){
    return Array.isArray(session?.races) ? session.races.length : 0;
  }
  function mkcentralGainClass(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n === 0) return 'sessionMkcGainFlat';
    return n > 0 ? 'sessionMkcGainGood' : 'sessionMkcGainBad';
  }
  function getPoints(lobbySize, placement){
    const arr = SCORE_MAP[Number(lobbySize)] || SCORE_MAP[PAGE_CONFIG.playerCount] || SCORE_MAP[12];
    const idx = Number(placement) - 1;
    return Number.isInteger(idx) && idx >= 0 && idx < arr.length ? arr[idx] : null;
  }
  function currentLobbySize(){
    if(!PAGE_CONFIG.allowLobbyTags) return PAGE_CONFIG.playerCount;
    const lobby = Number(state.lobbySize);
    return lobby === 11 || lobby === 10 ? lobby : 12;
  }
  function updateEntryTagButtons(){
    const lobby = currentLobbySize();
    document.querySelectorAll('[data-lobby-tag]').forEach((btn) => {
      const active = Number(btn.dataset.lobbyTag) === lobby;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const dcBtn = $('btnDisconnect');
    if(dcBtn){
      const active = !!state.entryDisconnect;
      dcBtn.classList.toggle('active', active);
      dcBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      dcBtn.textContent = active ? 'DC on' : 'DC';
      dcBtn.title = active ? 'DC tag active' : 'DC tag off';
    }
  }
  function setLobbyTag(size){
    if(!PAGE_CONFIG.allowLobbyTags) return;
    const next = Number(size);
    state.lobbySize = currentLobbySize() === next ? 12 : next;
    updatePlacementOptions();
  }
  function toggleDisconnectTag(){
    state.entryDisconnect = !state.entryDisconnect;
    updateEntryTagButtons();
  }
  function setEntryMode(mode){
    state.entryMode = mode === 'intermission' && PAGE_CONFIG.allowIntermissionRoutes ? 'intermission' : 'track';
    document.querySelectorAll('[data-entry-mode]').forEach((btn) => {
      const active = btn.dataset.entryMode === state.entryMode;
      btn.classList.toggle('isActive', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const trackFields = $('trackEntryFields');
    const intermissionFields = $('intermissionEntryFields');
    if(trackFields) trackFields.hidden = state.entryMode !== 'track';
    if(intermissionFields) intermissionFields.hidden = state.entryMode !== 'intermission';
  }
  function routeLabel(start, end){
    return `${start} -> ${end}`;
  }
  function parseRouteLabel(value){
    const match = String(value || '').match(/^\s*(.*?)\s*->\s*(.*?)\s*$/);
    if(!match) return null;
    const start = match[1].trim();
    const end = match[2].trim();
    return start && end ? { start, end } : null;
  }
  function getIntermissionRoutes(){
    try{
      if(typeof INTERMISSION_ROUTES !== 'undefined' && Array.isArray(INTERMISSION_ROUTES)) return INTERMISSION_ROUTES;
    }catch(e){}
    return [];
  }
  function normalizeRouteKey(start, end){
    const s = String(start || '').trim();
    const e = String(end || '').trim();
    return s && e ? `${s}\u2192${e}` : '';
  }
  async function loadStratsMeta(){
    if(stratsMetaIntermissions) return stratsMetaIntermissions;
    try{
      const res = await fetch('strats.json', { cache: 'no-cache' });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      stratsMetaIntermissions = json?.META?.INTERMISSIONS || {};
    }catch(e){
      console.warn('[lounge] failed to load strats.json META', e);
      stratsMetaIntermissions = {};
    }
    window.MKWT_STRATS_META_INTERMISSIONS = stratsMetaIntermissions;
    return stratsMetaIntermissions;
  }
  function getDestinyGroup(start, end){
    const key = normalizeRouteKey(start, end);
    const meta = key ? stratsMetaIntermissions?.[key] : null;
    const group = String(meta?.destiny_group || '').trim();
    return group || String(end || '').trim();
  }
  function isIntermissionRace(race){
    return race?.raceKind === 'intermission'
      || race?.race_kind === 'intermission'
      || (!!race?.intermissionStart && !!race?.intermissionEnd)
      || (!!race?.intermission_start && !!race?.intermission_end);
  }
  function routePartsFromRace(race){
    const start = String(race?.intermissionStart || race?.intermission_start || '').trim();
    const end = String(race?.intermissionEnd || race?.intermission_end || '').trim();
    if(start && end) return { start, end };
    return parseRouteLabel(race?.track) || { start: '', end: '' };
  }
  function displayRaceLabel(race){
    if(isIntermissionRace(race)){
      const { start, end } = routePartsFromRace(race);
      if(start && end) return routeLabel(start, end);
    }
    return race?.track || '';
  }
  function displayRaceLabelHtml(race){
    if(isIntermissionRace(race)){
      const { start, end } = routePartsFromRace(race);
      if(start && end){
        const destiny = getDestinyGroup(start, end) || end;
        return `
          <div class="routeStack">
            <div class="routeStackLine"><span class="routeStackLabel">Start</span><span>${escapeHtml(start)}</span></div>
            <div class="routeStackLine"><span class="routeStackLabel">Destiny</span><span>${escapeHtml(destiny)}</span></div>
          </div>`;
      }
    }
    return escapeHtml(displayRaceLabel(race));
  }
  function raceTypeLabel(race){
    const parts = [];
    if(race?.disconnect) parts.push('DC');
    if(isIntermissionRace(race)) parts.push('Intermission');
    return parts.length ? parts.join(' / ') : 'Normal';
  }
  function raceTypeCellHtml(race){
    return `<td>${escapeHtml(raceTypeLabel(race))}</td>`;
  }
  function readEntrySelection(){
    if(state.entryMode === 'intermission' && PAGE_CONFIG.allowIntermissionRoutes){
      const start = $('intermissionStartSelect')?.value || '';
      const end = $('intermissionEndSelect')?.value || '';
      if(!start || !end) return { error: 'Please select intermission start and end.' };
      return {
        track: routeLabel(start, end),
        raceKind: 'intermission',
        intermissionStart: start,
        intermissionEnd: end,
      };
    }
    const track = $('trackSelect')?.value || '';
    if(!track) return { error: 'Please select a track.' };
    return {
      track,
      raceKind: 'track',
      intermissionStart: null,
      intermissionEnd: null,
    };
  }
  function sortedUnique(list){
    return Array.from(new Set((list || []).map(v => String(v || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'de'));
  }
  function optionHtml(value, selected, label){
    const display = label || value;
    return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(display)}</option>`;
  }
  function fillRouteSelect(select, placeholder, list, selected, labelForValue){
    if(!select) return;
    const values = sortedUnique(list);
    const safeSelected = selected && values.includes(selected) ? selected : '';
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values
      .map(value => optionHtml(value, safeSelected, labelForValue ? labelForValue(value) : value))
      .join('');
    select.value = safeSelected;
    updatePlayedOptionHints();
  }
  function currentTrackSet(){
    const races = state.current?.races || [];
    return new Set(races
      .filter(race => !isIntermissionRace(race))
      .map(race => String(race?.track || '').trim())
      .filter(Boolean));
  }
  function currentIntermissionDestinySet(start){
    const routeStart = String(start || '').trim();
    if(!routeStart) return new Set();
    const races = state.current?.races || [];
    return new Set(races
      .filter(isIntermissionRace)
      .map(routePartsFromRace)
      .filter(route => route.start === routeStart)
      .map(route => route.end)
      .filter(Boolean));
  }
  function markPlayedOptions(select, usedValues){
    if(!select) return;
    const selected = String(select.value || '');
    const used = usedValues instanceof Set ? usedValues : new Set();
    Array.from(select.options || []).forEach((option) => {
      const value = String(option.value || '').trim();
      if(!option.dataset.baseLabel) option.dataset.baseLabel = option.textContent || '';
      const isUsed = !!value && used.has(value) && value !== selected;
      option.classList.toggle('loungeOptionUsed', isUsed);
      option.disabled = isUsed;
      option.textContent = isUsed ? `${option.dataset.baseLabel} - played` : option.dataset.baseLabel;
    });
  }
  function updatePlayedOptionHints(){
    markPlayedOptions($('trackSelect'), currentTrackSet());
    if(PAGE_CONFIG.allowIntermissionRoutes){
      markPlayedOptions($('intermissionEndSelect'), currentIntermissionDestinySet($('intermissionStartSelect')?.value || ''));
    }
  }
  function entryAlreadyUsed(entry){
    const races = state.current?.races || [];
    if(entry?.raceKind === 'intermission'){
      return races.some((race) => {
        if(!isIntermissionRace(race)) return false;
        const route = routePartsFromRace(race);
        return route.start === entry.intermissionStart && route.end === entry.intermissionEnd;
      });
    }
    return races.some((race) => !isIntermissionRace(race) && String(race?.track || '') === String(entry?.track || ''));
  }
  function buildRouteMaps(){
    const metaRoutes = Object.values(stratsMetaIntermissions || {})
      .map(meta => ({ from: meta?.start, to: meta?.destiny }))
      .filter(route => route.from && route.to);
    const routes = [...getIntermissionRoutes(), ...metaRoutes];
    const startToEnds = new Map();
    const endToStarts = new Map();
    for(const route of routes){
      const start = String(route?.from || '').trim();
      const end = String(route?.to || '').trim();
      if(!start || !end) continue;
      if(!startToEnds.has(start)) startToEnds.set(start, new Set());
      if(!endToStarts.has(end)) endToStarts.set(end, new Set());
      startToEnds.get(start).add(end);
      endToStarts.get(end).add(start);
    }
    return { startToEnds, endToStarts };
  }
  function resetIntermissionRouteFilters(){
    if(!PAGE_CONFIG.allowIntermissionRoutes) return;
    const startSel = $('intermissionStartSelect');
    const endSel = $('intermissionEndSelect');
    if(!startSel || !endSel) return;
    const { startToEnds, endToStarts } = buildRouteMaps();
    const starts = startToEnds.size ? Array.from(startToEnds.keys()) : COURSE_TRACKS;
    const ends = endToStarts.size ? Array.from(endToStarts.keys()) : COURSE_TRACKS;
    fillRouteSelect(startSel, 'Select start', starts, '');
    fillRouteSelect(endSel, 'Select end', ends, '');
  }
  function initIntermissionRouteFilters(){
    if(!PAGE_CONFIG.allowIntermissionRoutes || routeFiltersBound) return;
    const startSel = $('intermissionStartSelect');
    const endSel = $('intermissionEndSelect');
    if(!startSel || !endSel) return;
    routeFiltersBound = true;

    const { startToEnds, endToStarts } = buildRouteMaps();
    const allStarts = startToEnds.size ? Array.from(startToEnds.keys()) : COURSE_TRACKS;
    const allEnds = endToStarts.size ? Array.from(endToStarts.keys()) : COURSE_TRACKS;
    let syncing = false;

    const fillStarts = (list, selected) => fillRouteSelect(startSel, 'Select start', list, selected);
    const fillEnds = (list, selected, start) => fillRouteSelect(
      endSel,
      'Select end',
      list,
      selected,
      (end) => start ? getDestinyGroup(start, end) : end
    );
    const resetBoth = () => {
      fillStarts(allStarts, '');
      fillEnds(allEnds, '', '');
    };

    startSel.addEventListener('change', () => {
      if(syncing) return;
      syncing = true;
      const start = startSel.value;
      const previousEnd = endSel.value;
      if(!start){
        resetBoth();
      }else{
        const allowedEnds = Array.from(startToEnds.get(start) || []);
        fillEnds(allowedEnds, previousEnd, start);
      }
      syncing = false;
      updatePlayedOptionHints();
    });

    endSel.addEventListener('change', () => {
      if(syncing) return;
      syncing = true;
      const end = endSel.value;
      const previousStart = startSel.value;
      if(!end){
        resetBoth();
      }else{
        const allowedStarts = Array.from(endToStarts.get(end) || []);
        fillStarts(allowedStarts, previousStart);
        if(startSel.value){
          fillEnds(Array.from(startToEnds.get(startSel.value) || []), end, startSel.value);
        }
      }
      syncing = false;
      updatePlayedOptionHints();
    });

    resetBoth();
  }
  function placementRowClass(placement){
    const place = Number(placement);
    if(place === 1) return 'raceRow raceRow--gold';
    if(place === 2) return 'raceRow raceRow--silver';
    if(place === 3) return 'raceRow raceRow--bronze';
    return 'raceRow raceRow--dark';
  }
  function raceRowClass(race){
    const classes = [placementRowClass(race?.placement)];
    if(race?.disconnect) classes.push('raceRow--dc');
    return classes.join(' ');
  }
  function placementChartFill(placement){
    const place = Number(placement);
    if(place === 1) return 'rgba(255,205,70,.74)';
    if(place === 2) return 'rgba(210,220,232,.68)';
    if(place === 3) return 'rgba(205,128,70,.70)';
    return 'rgba(255,255,255,.13)';
  }
  function placementChartBorder(placement){
    const place = Number(placement);
    if(place === 1) return 'rgba(255,205,70,1)';
    if(place === 2) return 'rgba(230,238,248,.95)';
    if(place === 3) return 'rgba(222,145,82,.95)';
    return getCss('--border');
  }
  function toneAvgElement(el, avg, hasData){
    if(!el) return;
    el.classList.remove('avgGood', 'avgBad');
    if(!hasData) {
      el.removeAttribute('title');
      return;
    }
    el.classList.add(avg < AVG_GAIN_THRESHOLD ? 'avgBad' : 'avgGood');
    el.title = `Break-even AVG: ${AVG_GAIN_THRESHOLD.toFixed(2)}`;
  }
  function avgToneClass(avg, hasData){
    if(!hasData) return '';
    return avg < AVG_GAIN_THRESHOLD ? 'avgBad' : 'avgGood';
  }
  function makeFreshMogi(){
    return { created_at: currentTs(), playerCount: PAGE_CONFIG.playerCount, races: [], totalPoints: 0, disconnects: 0, saved: false };
  }
  function isCloud(){
    return cloudMode && loungeClient && loungeSession?.user?.id;
  }
  function summarizeRaces(races){
    const list = Array.isArray(races) ? races : [];
    return {
      race_count: list.length,
      total_points: list.reduce((a, r) => a + Number(r.points || 0), 0),
      disconnects: list.filter(r => r.disconnect).length,
    };
  }
  function readMkcentralPayload(){
    try{
      const playerId = extractMkcentralPlayerId(localStorage.getItem(MKCENTRAL_SETTINGS_KEY) || '');
      state.mkcentralPlayerId = playerId || '';
      if(!playerId) return null;
      const payload = read(mkcentralDataKey(playerId), null);
      return payload && Array.isArray(payload.events) ? payload : null;
    }catch(e){
      state.mkcentralPlayerId = '';
      return null;
    }
  }
  function mkcentralTimeScore(hours){
    if(!Number.isFinite(hours)) return 0;
    if(hours <= 0.5) return 52;
    if(hours <= 2) return 44;
    if(hours <= 6) return 30;
    if(hours <= 12) return 20;
    if(hours <= 24) return 12;
    if(hours <= 72) return 5;
    return 0;
  }
  function mkcentralPointsScore(diff, hasScore){
    if(!hasScore || !Number.isFinite(diff)) return 0;
    if(diff === 0) return 54;
    if(diff <= 2) return 44;
    if(diff <= 5) return 34;
    if(diff <= 10) return 22;
    if(diff <= 15) return 12;
    if(diff <= 25) return 5;
    return 0;
  }
  function mkcentralOrderScore(sessionOrder, eventOrder, sessionTotal, eventTotal){
    if(sessionTotal <= 1 || eventTotal <= 1) return 8;
    const sessionRatio = sessionOrder / Math.max(1, sessionTotal - 1);
    const eventRatio = eventOrder / Math.max(1, eventTotal - 1);
    const diff = Math.abs(sessionRatio - eventRatio);
    if(diff <= 0.015) return 18;
    if(diff <= 0.04) return 12;
    if(diff <= 0.08) return 8;
    if(diff <= 0.15) return 4;
    return 0;
  }
  function mkcentralConfidenceLabel(score){
    if(score >= 95) return 'High';
    if(score >= 78) return 'Medium';
    return 'Low';
  }
  function buildMkcentralNote(candidate){
    const parts = [];
    if(Number.isFinite(candidate.pointsDiff)){
      parts.push(candidate.pointsDiff === 0 ? 'same score' : `${candidate.pointsDiff} pts off`);
    }
    if(Number.isFinite(candidate.hoursDiff)){
      parts.push(candidate.hoursDiff < 1 ? 'time < 1h' : `${candidate.hoursDiff.toFixed(1)}h off`);
    }
    return parts.length ? `Auto-match: ${parts.join(' | ')}` : 'Auto-match';
  }
  function dateKeyFromTimestamp(timestamp){
    if(!Number.isFinite(timestamp) || timestamp <= 0) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  function buildMkcentralCandidate(sessionItem, sessionOrder, event, eventOrder, sessionTotal, eventTotal){
    if(sessionItem.raceCount < 12) return null;

    const eventTime = event.__time || eventTimestamp(event.table_verified_at || event.created_at || event.table_created_at);
    const hoursDiff = sessionItem.time && eventTime ? Math.abs(sessionItem.time - eventTime) / 3600000 : Infinity;
    if(hoursDiff > 72) return null;

    const tableScore = finiteNumber(event.table_score);
    const hasScore = tableScore != null;
    const pointsDiff = hasScore ? Math.abs(sessionItem.points - tableScore) : Infinity;

    if(hasScore){
      if(pointsDiff > 10) return null;
      if(pointsDiff > 5 && hoursDiff > 6) return null;
      if(pointsDiff > 2 && hoursDiff > 24) return null;
    }else if(hoursDiff > 4){
      return null;
    }

    let pointsScore = 0;
    if(hasScore){
      if(pointsDiff === 0) pointsScore = 70;
      else if(pointsDiff <= 2) pointsScore = 54;
      else if(pointsDiff <= 5) pointsScore = 34;
      else pointsScore = 16;
    }

    let timeScore = 0;
    if(hoursDiff <= 0.5) timeScore = 32;
    else if(hoursDiff <= 2) timeScore = 24;
    else if(hoursDiff <= 6) timeScore = 16;
    else if(hoursDiff <= 12) timeScore = 10;
    else if(hoursDiff <= 24) timeScore = 5;

    let orderScore = 0;
    if(sessionTotal <= 1 || eventTotal <= 1){
      orderScore = 8;
    }else{
      const sessionRatio = sessionOrder / Math.max(1, sessionTotal - 1);
      const eventRatio = eventOrder / Math.max(1, eventTotal - 1);
      const orderDiff = Math.abs(sessionRatio - eventRatio);
      if(orderDiff <= 0.015) orderScore = 14;
      else if(orderDiff <= 0.04) orderScore = 10;
      else if(orderDiff <= 0.08) orderScore = 6;
      else if(orderDiff <= 0.15) orderScore = 2;
    }

    const sameDayScore = sessionItem.time && eventTime && dateKeyFromTimestamp(sessionItem.time) === dateKeyFromTimestamp(eventTime) ? 6 : 0;
    const score = pointsScore + timeScore + orderScore + sameDayScore;
    if(score < 78) return null;

    return {
      score,
      pointsDiff,
      hoursDiff,
      sessionOrder,
      eventOrder,
      eventTime,
      originalIndex: sessionItem.originalIndex,
      event,
    };
  }
  function assignMkcentralMatchesWithOrder(sessions, events){
    const dp = Array.from({ length: sessions.length + 1 }, () => Array(events.length + 1).fill(0));
    const choice = Array.from({ length: sessions.length + 1 }, () => Array(events.length + 1).fill(null));

    for(let i = 1; i <= sessions.length; i += 1){
      for(let j = 1; j <= events.length; j += 1){
        const candidate = buildMkcentralCandidate(
          sessions[i - 1],
          i - 1,
          events[j - 1],
          j - 1,
          sessions.length,
          events.length
        );

        let best = dp[i - 1][j];
        let bestChoice = 'skip-session';

        if(dp[i][j - 1] > best){
          best = dp[i][j - 1];
          bestChoice = 'skip-event';
        }

        if(candidate){
          const matchScore = dp[i - 1][j - 1] + candidate.score;
          if(matchScore > best){
            best = matchScore;
            bestChoice = candidate;
          }
        }

        dp[i][j] = best;
        choice[i][j] = bestChoice;
      }
    }

    let i = sessions.length;
    let j = events.length;
    const matches = [];
    while(i > 0 && j > 0){
      const picked = choice[i][j];
      if(picked === 'skip-session'){
        i -= 1;
      }else if(picked === 'skip-event'){
        j -= 1;
      }else if(picked && typeof picked === 'object'){
        matches.push(picked);
        i -= 1;
        j -= 1;
      }else{
        break;
      }
    }

    matches.reverse().forEach((candidate) => {
      const eventId = String(candidate.event?.id || '');
      if(!eventId) return;
      state.mkcentralMatches[candidate.originalIndex] = {
        event_id: eventId,
        event_name: candidate.event.event || '',
        format: mkcentralGroupValue(candidate.event, 'format'),
        tier: mkcentralGroupValue(candidate.event, 'tier'),
        table_url: candidate.event.table_url || '',
        table_rank: finiteNumber(candidate.event.table_rank),
        table_score: finiteNumber(candidate.event.table_score),
        mmr_before: finiteNumber(candidate.event.mmr_before),
        mmr_delta: finiteNumber(candidate.event.mmr_delta),
        mmr_after: finiteNumber(candidate.event.mmr_after),
        created_at: candidate.event.table_verified_at || candidate.event.created_at || candidate.event.table_created_at || '',
        confidence_label: mkcentralConfidenceLabel(candidate.score),
        confidence_note: buildMkcentralNote(candidate),
        confidence_score: candidate.score,
      };
    });
  }
  function computeMkcentralMatches(){
    state.mkcentralMatches = {};
    const payload = readMkcentralPayload();
    if(!payload || !state.sessions.length) return;

    const events = (payload.events || [])
      .filter((event) => String(event?.id || '').trim())
      .filter((event) => !/^placement$/i.test(String(event?.event || '').trim()))
      .map((event, originalEventIndex) => ({
        ...event,
        __originalEventIndex: originalEventIndex,
        __time: eventTimestamp(event.table_verified_at || event.created_at || event.table_created_at),
      }))
      .sort((a, b) => a.__time - b.__time || String(a.id).localeCompare(String(b.id)));

    const sessions = state.sessions
      .map((session, originalIndex) => ({
        session,
        originalIndex,
        time: eventTimestamp(sessionFinishedAt(session)),
        points: sessionTotalPoints(session),
        raceCount: sessionRaceCount(session),
      }))
      .sort((a, b) => a.time - b.time || a.originalIndex - b.originalIndex);

    if(!events.length || !sessions.length) return;

    assignMkcentralMatchesWithOrder(sessions, events);
  }
  function renderSessionMkcentral(match){
    if(!match) return '';
    const bits = [];
    if(match.format && match.format !== 'Other') bits.push(`<span>${escapeHtml(match.format)}</span>`);
    if(match.tier && match.tier !== 'Other') bits.push(`<span>Tier ${escapeHtml(match.tier)}</span>`);
    if(Number.isFinite(match.table_rank)) bits.push(`<span>Place #${escapeHtml(String(match.table_rank))}</span>`);
    if(Number.isFinite(match.table_score)) bits.push(`<span>${escapeHtml(String(match.table_score))} pts</span>`);
    if(Number.isFinite(match.mmr_delta)) bits.push(`<span class="${mkcentralGainClass(match.mmr_delta)}">${escapeHtml(fmtDelta(match.mmr_delta))}</span>`);
    if(Number.isFinite(match.mmr_after)) bits.push(`<span>${escapeHtml(fmtMmr(match.mmr_after))} MMR</span>`);
    if(match.table_url) bits.push(`<a class="sessionMkcLink" href="${escapeHtml(match.table_url)}" target="_blank" rel="noopener noreferrer">Table</a>`);

    return `
      <div class="sessionMkcMeta">
        <span class="badge">MKCentral</span>
        ${bits.join('')}
      </div>
      <div class="sessionMkcHint muted">${escapeHtml(match.confidence_note || `Auto-match ${match.confidence_label}`)}</div>`;
  }
  function dbRaceToLocal(row){
    return {
      id: row.id,
      cloud_id: row.id,
      race_number: row.race_number,
      track: row.track,
      raceKind: row.race_kind || (row.intermission_start && row.intermission_end ? 'intermission' : 'track'),
      intermissionStart: row.intermission_start || null,
      intermissionEnd: row.intermission_end || null,
      lobbySize: row.lobby_size,
      placement: row.placement,
      points: row.points,
      disconnect: !!row.disconnect,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  function dbMogiToLocal(row, races){
    const localRaces = (races || []).map(dbRaceToLocal).sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0));
    return {
      id: row.id,
      cloud_id: row.id,
      created_at: row.created_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
      playerCount: row.player_count || PAGE_CONFIG.playerCount,
      races: localRaces,
      totalPoints: row.total_points,
      disconnects: row.disconnects,
      saved: row.status === 'completed',
    };
  }
  function raceToDbPayload(race, mogiId, raceNumber){
    return {
      mogi_id: mogiId,
      user_id: loungeSession.user.id,
      race_number: raceNumber,
      track: race.track,
      race_kind: race.raceKind || 'track',
      intermission_start: race.intermissionStart || null,
      intermission_end: race.intermissionEnd || null,
      lobby_size: race.lobbySize,
      placement: race.placement,
      points: race.points,
      disconnect: !!race.disconnect,
      created_at: race.created_at || currentTs(),
    };
  }
  function loadAll(){
    state.sessions = read(STORAGE_SESSIONS, []);
    state.current = read(STORAGE_CURRENT, null) || makeFreshMogi();
    if (!Array.isArray(state.current.races)) state.current = makeFreshMogi();
  }
  function persist(){
    if (isCloud()) return;
    write(STORAGE_CURRENT, state.current);
    write(STORAGE_SESSIONS, state.sessions);
  }
  async function loadCloud(){
    if (!isCloud()) return;
    const uid = loungeSession.user.id;
    setStatus('Loading cloud lounge...', true);

    const { data: mogis, error: mogiError } = await loungeClient
      .from('lounge_mogis')
      .select('id, created_at, completed_at, updated_at, status, total_points, race_count, disconnects, player_count')
      .eq('user_id', uid)
      .eq('player_count', PAGE_CONFIG.playerCount)
      .order('created_at', { ascending: false });
    if (mogiError) throw mogiError;

    const { data: races, error: raceError } = await loungeClient
      .from('lounge_races')
      .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at')
      .eq('user_id', uid)
      .order('race_number', { ascending: true });
    if (raceError) throw raceError;

    const racesByMogi = new Map();
    for (const race of races || []) {
      if (!racesByMogi.has(race.mogi_id)) racesByMogi.set(race.mogi_id, []);
      racesByMogi.get(race.mogi_id).push(race);
    }

    const active = (mogis || []).find(m => m.status === 'active');
    state.current = active ? dbMogiToLocal(active, racesByMogi.get(active.id)) : makeFreshMogi();
    state.sessions = (mogis || [])
      .filter(m => m.status === 'completed')
      .map(m => dbMogiToLocal(m, racesByMogi.get(m.id)))
      .sort((a, b) => String(b.completed_at || b.created_at || '').localeCompare(String(a.completed_at || a.created_at || '')));
    state.sessionPage = 1;
    state.openSessionDetails = {};
    state.editingSessionIndex = null;
    setStatus('Cloud lounge ready.', true);
  }
  async function ensureCloudCurrentMogi(){
    if (!isCloud()) return null;
    if (state.current?.cloud_id) return state.current.cloud_id;

    const { data, error } = await loungeClient
      .from('lounge_mogis')
      .insert({
        user_id: loungeSession.user.id,
        status: 'active',
        player_count: PAGE_CONFIG.playerCount,
        race_count: 0,
        total_points: 0,
        disconnects: 0,
      })
      .select('id, created_at, completed_at, updated_at, status, total_points, race_count, disconnects, player_count')
      .single();
    if (error) throw error;
    state.current = dbMogiToLocal(data, []);
    return data.id;
  }
  async function updateCloudMogi(mogi, patch = {}){
    if (!isCloud() || !mogi?.cloud_id) return;
    const summary = summarizeRaces(mogi.races);
    const payload = {
      ...summary,
      ...patch,
    };
    const { error } = await loungeClient
      .from('lounge_mogis')
      .update(payload)
      .eq('id', mogi.cloud_id)
      .eq('user_id', loungeSession.user.id);
    if (error) throw error;
  }
  function updatePlacementOptions(){
    const sel = $('placementSelect');
    if(!sel) return;
    const lobby = currentLobbySize();
    const prev = Number(sel.value || 0);
    sel.innerHTML = '<option value="">Select placement</option>' + Array.from({length:lobby}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    if(prev && prev <= lobby) sel.value = String(prev);
    updateEntryTagButtons();
  }
  function renderCurrent(){
    const races = state.current.races || [];
    const statRaces = races.filter(r => !r.disconnect);
    const statPoints = statRaces.reduce((a,r)=>a + Number(r.points || 0), 0);
    const currentAvg = statRaces.length ? (statPoints / statRaces.length) : 0;
    const isComplete = races.length >= 12;
    $('sumRaceCount').textContent = `${races.length} / 12`;
    $('sumPoints').textContent = String(races.reduce((a,r)=>a + Number(r.points || 0), 0));
    const sumAvg = $('sumAvg');
    if(sumAvg) sumAvg.textContent = statRaces.length ? currentAvg.toFixed(2) : '0.00';
    toneAvgElement(sumAvg, currentAvg, statRaces.length > 0);
    $('sumDcs').textContent = String(races.filter(r => r.disconnect).length);
    $('sumRemain').textContent = String(Math.max(0, 12 - races.length));
    const saveBtn = $('btnSaveRace');
    const dcBtn = $('btnDisconnect');
    const tagButtons = document.querySelectorAll('[data-lobby-tag], #btnDisconnect');
    if(saveBtn){
      saveBtn.textContent = isComplete ? 'Confirm Mogi' : 'Track';
      saveBtn.title = isComplete ? 'Open the result confirmation again' : '';
    }
    tagButtons.forEach((btn) => {
      btn.disabled = isComplete;
      if(isComplete) btn.title = 'Confirm this Mogi before changing race tags';
      else if(btn !== dcBtn) btn.removeAttribute('title');
    });
    if(!isComplete && dcBtn) updateEntryTagButtons();
    updatePlayedOptionHints();

    const body = $('currentMogiBody');
    if(!races.length){
      body.innerHTML = '<tr><td colspan="6" class="muted">No races tracked yet.</td></tr>';
      return;
    }
    body.innerHTML = races.map((r, idx) => `
      <tr class="${raceRowClass(r)}">
        <td>${idx+1}</td>
        <td>${displayRaceLabelHtml(r)}</td>
        <td>${r.lobbySize}p</td>
        <td>${r.placement ?? '–'}</td>
        <td>${r.points}</td>
        ${raceTypeCellHtml(r)}
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
  function trackChartTitle(mode = state.trackChartMode){
    if(mode === 'im_destiny') return 'Intermission Destiny';
    if(mode === 'im_routes') return 'Intermission Separated';
    return 'Tracks';
  }
  function updateTrackModeButtons(){
    const map = {
      tracks: 'btnPerfTracks',
      im_destiny: 'btnPerfImDestiny',
      im_routes: 'btnPerfImRoutes'
    };
    Object.entries(map).forEach(([mode, id]) => {
      const btn = $(id);
      if(!btn) return;
      const active = state.trackChartMode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function setTrackChartMode(mode){
    if(mode !== 'tracks' && !PAGE_CONFIG.allowIntermissionRoutes) mode = 'tracks';
    if(!['tracks', 'im_destiny', 'im_routes'].includes(mode)) mode = 'tracks';
    state.trackChartMode = mode;
    state.lastSelectedTrack = null;
    refresh();
  }
  function updatePlacementModeButtons(){
    const map = {
      all: 'btnPlacementAll',
      tracks: 'btnPlacementTracks',
      intermission: 'btnPlacementIntermission'
    };
    Object.entries(map).forEach(([mode, id]) => {
      const btn = $(id);
      if(!btn) return;
      const active = state.placementMode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function setPlacementMode(mode){
    if(mode !== 'all' && !PAGE_CONFIG.allowIntermissionRoutes) mode = 'all';
    if(!['all', 'tracks', 'intermission'].includes(mode)) mode = 'all';
    state.placementMode = mode;
    refresh();
  }

  function shouldIncludeRaceForMode(race, mode){
    const im = isIntermissionRace(race);
    if(mode === 'tracks') return !im;
    if(mode === 'intermission' || mode === 'im_destiny' || mode === 'im_routes') return im;
    return true;
  }
  function racePerformanceLabel(race, mode){
    if(mode === 'im_destiny'){
      const { start, end } = routePartsFromRace(race);
      return start && end ? getDestinyGroup(start, end) : displayRaceLabel(race);
    }
    if(mode === 'im_routes') return displayRaceLabel(race);
    return race?.track || displayRaceLabel(race);
  }
  function aggregateTrackStats(mode = 'tracks'){
    const seedTracks = mode === 'tracks' ? COURSE_TRACKS : [];
    const bucket = new Map(seedTracks.map(t => [t, []]));
    for(const session of state.sessions){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        if(!shouldIncludeRaceForMode(race, mode)) continue;
        const label = racePerformanceLabel(race, mode);
        if(!label) continue;
        if(!bucket.has(label)) bucket.set(label, []);
        bucket.get(label).push(Number(race.points || 0));
      }
    }
    return Array.from(bucket.keys()).map(track => {
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
  function aggregatePlacementStats(mode = 'all'){
    const maxPlacement = PAGE_CONFIG.playerCount;
    const counts = Array.from({ length: maxPlacement }, (_, i) => ({ placement: i + 1, count: 0 }));
    for(const session of state.sessions){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        if(!shouldIncludeRaceForMode(race, mode)) continue;
        const placement = Number(race.placement);
        if(Number.isInteger(placement) && placement >= 1 && placement <= maxPlacement) {
          counts[placement - 1].count += 1;
        }
      }
    }
    return counts;
  }
  function aggregateTypeDistribution(){
    const rows = {
      tracks: { label: 'Tracks', count: 0, sum: 0 },
      intermission: { label: 'Intermission', count: 0, sum: 0 }
    };
    for(const session of state.sessions){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        const key = isIntermissionRace(race) ? 'intermission' : 'tracks';
        rows[key].count += 1;
        rows[key].sum += Number(race.points || 0);
      }
    }
    return [rows.tracks, rows.intermission].map(row => ({
      ...row,
      avg: row.count ? row.sum / row.count : 0
    }));
  }
  function renderTrackInsight(trackName){
    state.lastSelectedTrack = trackName || null;
    const el = $('trackInsight');
    if(!el) return;
    const stat = state.lastTrackStats.find(s => s.track === trackName);
    if(!stat){
      el.innerHTML = '<div class="muted">Click on a bar to see AVG points and times played.</div>';
      return;
    }
    el.innerHTML = `
      <div class="trackInsightHeader">
        <div>
          <div class="trackInsightTitle">${escapeHtml(stat.track)}</div>
          <div class="muted">${escapeHtml(trackChartTitle())} details from saved Mogis</div>
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
      const points = sessionTotalPoints(s);
      const count = (s.races || []).length;
      const dcs = (s.races || []).filter(r => r.disconnect).length;
      const originalIndex = s.__originalIndex;
      const mkcMatch = state.mkcentralMatches[originalIndex] || null;
      const isEditing = state.editingSessionIndex === originalIndex;
      const isOpen = !!state.openSessionDetails[originalIndex] || isEditing;
      const details = isEditing
        ? `
          <div class="sessionEditor" data-session-editor="${originalIndex}">
            <div class="tableWrap">
              <table>
                <thead><tr><th>#</th><th>Track</th><th>Lobby</th><th>Placement</th><th>Points</th><th>Type</th></tr></thead>
                <tbody>${renderSessionEditRows(s.races || [])}</tbody>
              </table>
            </div>
            <div class="sessionEditActions">
              <button class="navAction navAction--sm active" type="button" data-session-save="${originalIndex}">Save changes</button>
              <button class="navAction navAction--sm" type="button" data-session-cancel="${originalIndex}">Cancel</button>
            </div>
          </div>`
        : `
          <div class="tableWrap">
            <table>
              <thead><tr><th>#</th><th>Track</th><th>Lobby</th><th>Placement</th><th>Points</th><th>Type</th></tr></thead>
              <tbody>${renderSessionViewRows(s.races || [])}</tbody>
            </table>
          </div>`;
      return `
        <div class="sessionCard">
          <div class="sessionCardHead">
            <div>
              <div class="sessionTitle">${escapeHtml(fmtDate(s.completed_at || s.created_at))}</div>
              ${mkcMatch ? renderSessionMkcentral(mkcMatch) : ''}
              <div class="muted">${count} races · ${points} points · Avg ${count ? (points/count).toFixed(2) : '0.00'} · DCs ${dcs}</div>
            </div>
            <div class="sessionActions">
              <button class="infoBtn" type="button" data-session-toggle="${originalIndex}" aria-expanded="${isOpen ? 'true' : 'false'}" title="Show matches">?</button>
              <button class="navAction navAction--sm" type="button" data-session-edit="${originalIndex}">${isEditing ? 'Editing' : 'Edit'}</button>
              <button class="navAction navAction--sm danger" type="button" data-session-delete="${originalIndex}" title="Delete Mogi">Delete</button>
            </div>
          </div>
          <div class="sessionDetails" id="sessionDetails-${originalIndex}"${isOpen ? '' : ' hidden'}>
            ${details}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-session-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-session-toggle'));
        if(state.editingSessionIndex === id) return;
        state.openSessionDetails[id] = !state.openSessionDetails[id];
        renderSessions();
      });
    });

    wrap.querySelectorAll('[data-session-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-delete'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        deleteMogi(originalIndex);
      });
    });

    wrap.querySelectorAll('[data-session-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-edit'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        if(state.editingSessionIndex === originalIndex) return;
        startEditMogi(originalIndex);
      });
    });

    wrap.querySelectorAll('[data-session-cancel]').forEach(btn => {
      btn.addEventListener('click', cancelEditMogi);
    });

    wrap.querySelectorAll('[data-session-save]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-save'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        saveEditedMogi(originalIndex);
      });
    });

    wrap.querySelectorAll('.sessionEditor [data-edit-row]').forEach(row => {
      row.querySelector('[data-edit-lobby]')?.addEventListener('change', () => updateEditRow(row));
      row.querySelector('[data-edit-placement]')?.addEventListener('change', () => updateEditRow(row));
      row.querySelector('[data-edit-type]')?.addEventListener('change', () => updateEditRow(row));
      updateEditRow(row);
    });
  }
  function renderChart(stats){
    const ctx = $('chartTrackAvg');
    if(!ctx) return;
    const sortedStats = sortTrackStats(stats).slice(0, 30);
    state.lastTrackStats = sortedStats;
    updateSortButtons();
    updateTrackModeButtons();
    const labels = sortedStats.map(s => s.track);
    const values = sortedStats.map(s => Number(s.avg.toFixed(2)));
    const colors = sortedStats.map(s => s.avg >= AVG_GAIN_THRESHOLD ? 'rgba(77,163,25,0.85)' : 'rgba(255,80,80,0.85)');
    const borders = sortedStats.map(s => s.avg >= AVG_GAIN_THRESHOLD ? 'rgb(77,163,25)' : 'rgb(255,80,80)');
    if(state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: `Average points (${trackChartTitle()})`, data: values, backgroundColor: colors, borderColor: borders, borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, max: 15, ticks: { color: getCss('--text') } },
          y: { ticks: { color: getCss('--text'), autoSkip: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const stat = sortedStats[ctx.dataIndex];
                const avg = Number(stat?.avg || 0).toFixed(2);
                const count = Number(stat?.count || 0);
                return [`${trackChartTitle()}`, `AVG points: ${avg}`, `Played: ${count}`];
              }
            }
          }
        },
        onClick: (_, elements) => {
          if(!elements?.length) return;
          const idx = elements[0].index;
          const track = labels[idx];
          renderTrackInsight(track);
        }
      }
    });
  }
  function renderPlacementChart(stats){
    const ctx = $('chartPlacementDist');
    if(!ctx) return;
    updatePlacementModeButtons();
    if(state.placementChart) state.placementChart.destroy();
    const labels = stats.map(s => String(s.placement));
    const values = stats.map(s => s.count);
    const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
    const fills = stats.map(s => placementChartFill(s.placement));
    const borders = stats.map(s => placementChartBorder(s.placement));
    state.placementChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Placements',
          data: values,
          backgroundColor: fills,
          borderColor: borders,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Placement', color: getCss('--muted') }, ticks: { color: getCss('--text') } },
          y: { beginAtZero: true, ticks: { color: getCss('--text'), precision: 0 } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const count = Number(ctx.parsed.y || 0);
                const chance = total ? (count / total * 100).toFixed(1) : '0.0';
                return [
                  `${count} races`,
                  `Chance: ${chance}% (${count} / ${total} tracked races)`
                ];
              }
            }
          }
        }
      }
    });
  }
  function renderTypePieChart(rows){
    const ctx = $('chartTypePie');
    const info = $('typePieInfo');
    if(!ctx) return;
    const dataRows = rows || aggregateTypeDistribution();
    const values = dataRows.map(row => row.count);
    const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
    const colors = ['rgba(77,163,25,.82)', 'rgba(58,116,215,.82)'];
    const borders = ['rgb(77,163,25)', 'rgb(58,116,215)'];
    if(state.typePieChart) state.typePieChart.destroy();
    state.typePieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: dataRows.map(row => row.label),
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: getCss('--text') } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const row = dataRows[ctx.dataIndex];
                const count = Number(row?.count || 0);
                const chance = total ? (count / total * 100).toFixed(1) : '0.0';
                const avg = count ? Number(row.avg || 0).toFixed(2) : '-';
                return [`${count} races (${chance}%)`, `AVG points: ${avg}`];
              }
            }
          }
        }
      }
    });
    if(info){
      const pieces = dataRows.map(row => {
        const avg = row.count ? Number(row.avg || 0).toFixed(2) : '-';
        return `<div class="statBox"><div class="statLabel">${escapeHtml(row.label)}</div><div class="statValue">${row.count}</div><div class="muted">AVG ${avg} points</div></div>`;
      });
      info.innerHTML = total
        ? `<div class="trackInsightGrid">${pieces.join('')}</div>`
        : '<div class="muted">No saved track or intermission races yet.</div>';
    }
  }
  function getCss(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff'; }

  function renderHeroSummary(stats){
    const sessions = state.sessions || [];
    const mogiCount = sessions.length;
    const statRaces = sessions.flatMap(session => (session.races || []).filter(r => !r.disconnect));
    const raceCount = statRaces.length;
    const dcCount = sessions.reduce((sum, session) => sum + (session.races || []).filter(r => r.disconnect).length, 0);
    const totalPoints = statRaces.reduce((sum, race) => sum + Number(race.points || 0), 0);
    const avgMogi = raceCount ? (totalPoints / raceCount) : 0;
    const sessionPointTotals = sessions
      .map(sessionTotalPoints)
      .filter(points => Number.isFinite(points));
    const highestPoints = sessionPointTotals.length ? Math.max(...sessionPointTotals) : null;
    const lowestPoints = sessionPointTotals.length ? Math.min(...sessionPointTotals) : null;
    const bestTrack = (stats || []).filter(s => s.count >= 5).sort((a,b) => {
      const diff = b.avg - a.avg;
      if(diff !== 0) return diff;
      return b.count - a.count;
    })[0] || null;
    const bestTrackName = $('heroBestTrackName');
    const bestTrackMeta = $('heroBestTrackMeta');
    const mogiCountEl = $('heroMogiCount');
    const avgEl = $('heroMogiAvg');
    const raceCountEl = $('heroRaceCount');
    const dcCountEl = $('heroDcCount');
    const highestEl = $('heroHighestPoints');
    const lowestEl = $('heroLowestPoints');
    if(mogiCountEl) mogiCountEl.textContent = String(mogiCount);
    if(avgEl){
      const hasAvg = raceCount > 0;
      const mogiAvg = avgMogi * 12;
      const tone = avgToneClass(avgMogi, hasAvg);
      avgEl.classList.remove('avgGood', 'avgBad');
      avgEl.innerHTML = hasAvg
        ? `<span class="${tone}">${avgMogi.toFixed(2)}</span><span class="avgDivider">/</span><span class="${tone}">${mogiAvg.toFixed(0)}</span>`
        : '<span>0.00</span><span class="avgDivider">/</span><span>0</span>';
      avgEl.title = hasAvg ? `Track AVG ${avgMogi.toFixed(2)} | Mogi AVG ${mogiAvg.toFixed(0)}` : '';
    }
    if(raceCountEl) raceCountEl.textContent = String(raceCount);
    if(dcCountEl) dcCountEl.textContent = String(dcCount);
    if(highestEl) highestEl.textContent = highestPoints == null ? '-' : String(highestPoints);
    if(lowestEl) lowestEl.textContent = lowestPoints == null ? '-' : String(lowestPoints);
    if(bestTrackName) bestTrackName.textContent = bestTrack ? bestTrack.track : 'Not enough data';
    if(bestTrackMeta) bestTrackMeta.textContent = bestTrack ? `${bestTrack.avg.toFixed(2)} AVG · ${bestTrack.count} plays` : 'Best Track starts after 5 plays on one track.';
  }
  function refresh(){
    computeMkcentralMatches();
    renderCurrent();
    const heroStats = aggregateTrackStats('tracks');
    const chartStats = aggregateTrackStats(state.trackChartMode);
    renderHeroSummary(heroStats);
    renderSessions();
    renderChart(chartStats);
    renderPlacementChart(aggregatePlacementStats(state.placementMode));
    renderTypePieChart(aggregateTypeDistribution());
    renderTrackInsight(state.lastSelectedTrack && chartStats.some(s => s.track === state.lastSelectedTrack) ? state.lastSelectedTrack : null);
    persist();
  }
  function renderMogiResultDialog(){
    const races = (state.current?.races || []).slice(0, 12);
    const total = races.reduce((sum, race) => sum + Number(race.points || 0), 0);
    const dcs = races.filter(r => r.disconnect).length;
    const statRaces = races.filter(r => !r.disconnect);
    const statPoints = statRaces.reduce((sum, race) => sum + Number(race.points || 0), 0);
    const statAvg = statRaces.length ? (statPoints / statRaces.length).toFixed(2) : '0.00';
    const totalEl = $('mogiResultTotal');
    const metaEl = $('mogiResultMeta');
    const rowsEl = $('mogiResultRows');

    if(totalEl) totalEl.textContent = String(total);
    if(metaEl) metaEl.textContent = `${races.length} races · ${statAvg} AVG · ${dcs} DCs`;
    if(rowsEl) {
      rowsEl.innerHTML = races.map((race, idx) => `
        <tr class="${raceRowClass(race)}">
          <td>${idx + 1}</td>
          <td>${displayRaceLabelHtml(race)}</td>
          <td>${race.lobbySize}p</td>
          <td>${race.placement ?? '–'}</td>
          <td>${race.points}</td>
          ${raceTypeCellHtml(race)}
        </tr>`).join('');
    }
  }
  function openMogiResultDialog(){
    if((state.current?.races || []).length < 12) return;
    renderMogiResultDialog();
    const dlg = $('mogiResultDialog');
    if(!dlg) return;
    if(typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function closeMogiResultDialog(){
    const dlg = $('mogiResultDialog');
    if(!dlg) return;
    if(typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  }
  async function maybeCompleteMogi(){
    if((state.current.races || []).length < 12) return;
    setStatus('Mogi complete. Confirm the result to save it.', true);
    openMogiResultDialog();
  }
  async function confirmMogiResult(){
    if((state.current.races || []).length < 12){ closeMogiResultDialog(); return; }
    try {
      const finished = {
        ...state.current,
        completed_at: currentTs(),
        saved: true,
      };
      if (isCloud() && state.current.cloud_id) {
        setStatus('Saving confirmed Mogi to cloud...', true);
        await updateCloudMogi(state.current, {
          status: 'completed',
          completed_at: finished.completed_at,
        });
      }
      state.sessions.push(finished);
      state.sessionPage = 1;
      state.current = makeFreshMogi();
      closeMogiResultDialog();
      setStatus('Mogi completed and saved as one session.', true);
      refresh();
    } catch(e) {
      setStatus('Mogi confirm failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  async function saveRace(){
    try {
      if((state.current.races || []).length >= 12){
        setStatus('This Mogi has 12 races. Confirm the result before starting another race.', true);
        openMogiResultDialog();
        return;
      }
      const entry = readEntrySelection();
      if(entry.error){ setStatus(entry.error, false); return; }
      if(entryAlreadyUsed(entry)){
        setStatus(entry.raceKind === 'intermission'
          ? 'This intermission route was already used in this Mogi.'
          : 'This track was already used in this Mogi.',
          false);
        updatePlayedOptionHints();
        return;
      }
      const placement = Number($('placementSelect').value || 0);
      const lobbySize = currentLobbySize();
      const disconnect = !!state.entryDisconnect;
      if(!placement){ setStatus('Please select a placement.', false); return; }
      const points = getPoints(lobbySize, placement);
      if(points == null){ setStatus('Invalid placement for this lobby size.', false); return; }
      const race = {
        track: entry.track,
        raceKind: entry.raceKind,
        intermissionStart: entry.intermissionStart,
        intermissionEnd: entry.intermissionEnd,
        lobbySize,
        placement,
        points,
        disconnect,
        created_at: currentTs()
      };

      if (isCloud()) {
        setStatus('Saving race to cloud...', true);
        const mogiId = await ensureCloudCurrentMogi();
        const raceNumber = (state.current.races || []).length + 1;
        const { data, error } = await loungeClient
          .from('lounge_races')
          .insert(raceToDbPayload(race, mogiId, raceNumber))
          .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at')
          .single();
        if (error) throw error;
        state.current.races.push(dbRaceToLocal(data));
        await updateCloudMogi(state.current);
      } else {
        state.current.races.push(race);
      }

      if($('trackSelect')) $('trackSelect').value = '';
      if($('intermissionStartSelect')) $('intermissionStartSelect').value = '';
      if($('intermissionEndSelect')) $('intermissionEndSelect').value = '';
      resetIntermissionRouteFilters();
      updatePlayedOptionHints();
      state.lobbySize = PAGE_CONFIG.playerCount;
      state.entryDisconnect = false;
      updatePlacementOptions();
      $('placementSelect').value = '';
      setStatus(disconnect ? 'Race tracked with DC tag. Stats ignore DC races.' : 'Race tracked.', true);
      refresh();
      await maybeCompleteMogi();
    } catch(e) {
      setStatus('Race save failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  async function undoLast(){
    if(!(state.current.races || []).length){ setStatus('Nothing to undo.', false); return; }
    try {
      const last = state.current.races[state.current.races.length - 1];
      if (isCloud() && last?.cloud_id) {
        setStatus('Removing race from cloud...', true);
        const { error } = await loungeClient
          .from('lounge_races')
          .delete()
          .eq('id', last.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (error) throw error;
      }
      state.current.races.pop();
      if (isCloud()) await updateCloudMogi(state.current);
      setStatus('Last entry removed.', true);
      refresh();
    } catch(e) {
      setStatus('Undo failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  async function deleteMogi(index){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    const label = fmtDate(session.completed_at || session.created_at);
    const ok = window.confirm(`Delete saved Mogi from ${label}?`);
    if(!ok) return;
    try {
      if (isCloud() && session.cloud_id) {
        setStatus('Deleting Mogi from cloud...', true);
        const { error } = await loungeClient
          .from('lounge_mogis')
          .delete()
          .eq('id', session.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (error) throw error;
      }
      state.sessions.splice(index, 1);
      if(state.editingSessionIndex === index) state.editingSessionIndex = null;
      delete state.openSessionDetails[index];
      setStatus('Saved Mogi deleted.', true);
      refresh();
    } catch(e) {
      setStatus('Delete failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function buildTrackOptions(selected){
    const options = TRACKS.slice();
    if(selected && !options.includes(selected)) options.unshift(selected);
    return options.map(track => `<option value="${escapeHtml(track)}"${track === selected ? ' selected' : ''}>${escapeHtml(track)}</option>`).join('');
  }
  function buildLobbyOptions(selected){
    const sizes = PAGE_CONFIG.allowLobbyTags ? [12,11,10] : [PAGE_CONFIG.playerCount];
    return sizes.map(size => `<option value="${size}"${Number(selected) === size ? ' selected' : ''}>${size}p</option>`).join('');
  }
  function buildPlacementOptionsForLobby(lobbySize, placement){
    const max = Number(lobbySize) || PAGE_CONFIG.playerCount;
    const opts = ['<option value="">Select</option>'];
    for(let i = 1; i <= max; i += 1){
      opts.push(`<option value="${i}"${Number(placement) === i ? ' selected' : ''}>${i}</option>`);
    }
    return opts.join('');
  }
  function renderSessionViewRows(races){
    return (races || []).map((r, i) => `
        <tr class="${raceRowClass(r)}">
          <td>${i + 1}</td>
          <td>${displayRaceLabelHtml(r)}</td>
          <td>${r.lobbySize}p</td>
          <td>${r.placement ?? '–'}</td>
          <td>${r.points}</td>
          ${raceTypeCellHtml(r)}
        </tr>`).join('');
  }
  function renderSessionEditRows(races){
    return (races || []).map((r, i) => `
      <tr class="${raceRowClass(r)}" data-edit-row="${i}">
        <td>${i + 1}</td>
        <td><select class="sessionEditSelect" data-edit-track>${buildTrackOptions(displayRaceLabel(r))}</select></td>
        <td><select class="sessionEditSelect" data-edit-lobby>${buildLobbyOptions(r.lobbySize)}</select></td>
        <td><select class="sessionEditSelect" data-edit-placement>${buildPlacementOptionsForLobby(r.lobbySize, r.placement)}</select></td>
        <td class="muted" data-edit-points>${Number(r.points || 0)}</td>
        <td>
          <select class="sessionEditSelect" data-edit-type>
            <option value="normal"${r.disconnect ? '' : ' selected'}>Normal</option>
            <option value="disconnect"${r.disconnect ? ' selected' : ''}>Disconnect</option>
          </select>
        </td>
      </tr>`).join('');
  }
  function updateEditRow(row){
    if(!row) return;
    const lobbySel = row.querySelector('[data-edit-lobby]');
    const placementSel = row.querySelector('[data-edit-placement]');
    const typeSel = row.querySelector('[data-edit-type]');
    const pointsCell = row.querySelector('[data-edit-points]');
    const lobby = Number(lobbySel?.value || PAGE_CONFIG.playerCount);
    const prevPlacement = Number(placementSel?.value || 0);
    if(placementSel){
      placementSel.innerHTML = buildPlacementOptionsForLobby(lobby, prevPlacement);
      if(prevPlacement > lobby) placementSel.value = '';
    }
    const placement = Number(placementSel?.value || 0);
    const p = getPoints(lobby, placement);
    const points = p == null ? '–' : p;
    if(pointsCell) pointsCell.textContent = String(points);
    row.className = [placementRowClass(placement), typeSel?.value === 'disconnect' ? 'raceRow--dc' : ''].filter(Boolean).join(' ');
  }
  function startEditMogi(index){
    state.editingSessionIndex = index;
    state.openSessionDetails[index] = true;
    refresh();
  }
  function cancelEditMogi(){
    state.editingSessionIndex = null;
    refresh();
  }
  async function saveEditedMogi(index){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    const wrap = document.querySelector(`[data-session-editor="${index}"]`);
    if(!wrap){ setStatus('Editor not found.', false); return; }
    const rows = Array.from(wrap.querySelectorAll('[data-edit-row]'));
    const races = [];
    for(const row of rows){
      const track = row.querySelector('[data-edit-track]')?.value || '';
      const lobbySize = Number(row.querySelector('[data-edit-lobby]')?.value || PAGE_CONFIG.playerCount);
      const type = row.querySelector('[data-edit-type]')?.value || 'normal';
      const disconnect = type === 'disconnect';
      const placement = Number(row.querySelector('[data-edit-placement]')?.value || 0);
      if(!track){ setStatus('Each race needs a track.', false); return; }
      if(!placement){ setStatus('Each race needs a placement.', false); return; }
      const points = getPoints(lobbySize, placement);
      if(points == null){ setStatus('One edited race has an invalid placement.', false); return; }
      const sourceRace = session.races[Number(row.getAttribute('data-edit-row'))] || {};
      const route = parseRouteLabel(track);
      races.push({
        ...sourceRace,
        track,
        raceKind: route ? 'intermission' : 'track',
        intermissionStart: route?.start || null,
        intermissionEnd: route?.end || null,
        lobbySize,
        placement,
        points,
        disconnect
      });
    }
    try {
      if (isCloud() && session.cloud_id) {
        setStatus('Saving Mogi to cloud...', true);
        const { error: deleteError } = await loungeClient
          .from('lounge_races')
          .delete()
          .eq('mogi_id', session.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (deleteError) throw deleteError;

        const payload = races.map((race, i) => raceToDbPayload(race, session.cloud_id, i + 1));
        if (payload.length) {
          const { data, error: insertError } = await loungeClient
            .from('lounge_races')
            .insert(payload)
            .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at');
          if (insertError) throw insertError;
          races.splice(0, races.length, ...(data || []).map(dbRaceToLocal).sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0)));
        }
        await updateCloudMogi({ ...session, races }, { status: 'completed', completed_at: session.completed_at || currentTs() });
      }

      session.races = races;
      session.totalPoints = races.reduce((a, r) => a + Number(r.points || 0), 0);
      session.disconnects = races.filter(r => r.disconnect).length;
      session.updated_at = currentTs();
      state.editingSessionIndex = null;
      setStatus('Saved Mogi updated.', true);
      refresh();
    } catch(e) {
      setStatus('Save failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  function bind(){
    if (isBound) return;
    isBound = true;
    document.querySelectorAll('[data-lobby-tag]').forEach(btn => btn.addEventListener('click', () => setLobbyTag(btn.dataset.lobbyTag)));
    document.querySelectorAll('[data-entry-mode]').forEach(btn => btn.addEventListener('click', () => setEntryMode(btn.dataset.entryMode)));
    $('btnSortPerformance')?.addEventListener('click', () => setTrackSort('avg'));
    $('btnSortPlayed')?.addEventListener('click', () => setTrackSort('count'));
    $('btnPerfTracks')?.addEventListener('click', () => setTrackChartMode('tracks'));
    $('btnPerfImDestiny')?.addEventListener('click', () => setTrackChartMode('im_destiny'));
    $('btnPerfImRoutes')?.addEventListener('click', () => setTrackChartMode('im_routes'));
    $('btnPlacementAll')?.addEventListener('click', () => setPlacementMode('all'));
    $('btnPlacementTracks')?.addEventListener('click', () => setPlacementMode('tracks'));
    $('btnPlacementIntermission')?.addEventListener('click', () => setPlacementMode('intermission'));
    $('btnSaveRace').addEventListener('click', () => saveRace());
    $('btnDisconnect').addEventListener('click', () => toggleDisconnectTag());
    $('btnUndo').addEventListener('click', undoLast);
    $('btnConfirmMogiResult')?.addEventListener('click', confirmMogiResult);
    $('btnKeepMogiResult')?.addEventListener('click', () => {
      closeMogiResultDialog();
      setStatus('Result kept in the current Mogi. Confirm when ready.', true);
    });
    $('mogiResultDialog')?.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      setStatus('Confirm the result or choose Review to keep editing.', false);
    });
    $('btnSessionPrev')?.addEventListener('click', () => { if(state.sessionPage <= 1) return; state.sessionPage -= 1; renderSessions(); persist(); });
    $('btnSessionNext')?.addEventListener('click', () => { const maxPage = Math.max(1, Math.ceil(state.sessions.length / SESSION_PAGE_SIZE)); if(state.sessionPage >= maxPage) return; state.sessionPage += 1; renderSessions(); persist(); });
    window.addEventListener('storage', () => { if(isCloud()) return; loadAll(); refresh(); });
  }
  async function init(){
    try {
      if (typeof window.mkwtRequireAuth === 'function') {
        let authHandled = false;
        await window.mkwtRequireAuth({
          pageName: PAGE_CONFIG.pageName,
          allowGuest: true,
          tryBackupRestore: true,
          onAccount: async (session, client) => {
            authHandled = true;
            loungeClient = client;
            loungeSession = session;
            cloudMode = true;
            try{ applyThemeForMode('account'); }catch(e){}
            try{ setNavAuthButton('account'); }catch(e){}
            const info = $('userInfo');
            if (info) info.textContent = 'Cloud lounge: ' + (typeof maskEmail === 'function' ? maskEmail(session.user?.email) : (session.user?.email || 'Account'));
            await loadCloud();
          },
          onGuest: async () => {
            authHandled = true;
            loungeClient = null;
            loungeSession = null;
            cloudMode = false;
            try{ applyThemeForMode('guest'); }catch(e){}
            try{ setNavAuthButton('guest'); }catch(e){}
            const info = $('userInfo');
            if (info) info.textContent = 'Guest lounge (local)';
            loadAll();
          },
        });
        if (!authHandled && !state.current) loadAll();
      } else {
        cloudMode = false;
        loadAll();
      }
    } catch(e) {
      cloudMode = false;
      loadAll();
      setStatus('Cloud lounge unavailable. Local mode loaded.', false);
      console.error(e);
    }
    if(PAGE_CONFIG.allowIntermissionRoutes) await loadStratsMeta();
    setEntryMode('track');
    initIntermissionRouteFilters();
    updatePlacementOptions();
    bind();
    refresh();
    if((state.current?.races || []).length >= 12) openMogiResultDialog();
  }
  init();
})();
