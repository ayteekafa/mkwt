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
  const NON_LOUNGE_FORMAT_TAG = 'Non-Lounge';
  const LOUNGE_FORMAT_TAGS = {
    12: ['FFA', '2v2', '3v3', '4v4', '6v6', 'SQ2v2', 'SQ3v3', 'SQ4v4', 'SQ6v6', NON_LOUNGE_FORMAT_TAG],
    24: ['FFA', '2v2', '3v3', '4v4', '6v6', '8v8', '12v12', 'SQ2v2', 'SQ3v3', 'SQ4v4', 'SQ6v6', 'SQ8v8', 'SQ12v12', NON_LOUNGE_FORMAT_TAG]
  };
  const ALL_LOUNGE_FORMAT_TAGS = new Set(Object.values(LOUNGE_FORMAT_TAGS).flat());
  const LOUNGE_TIER_CODES = ['X', 'S', 'A', 'AB', 'B', 'BC', 'C', 'CD', 'D', 'DE', 'E', 'EF', 'F'];
  const LOUNGE_TIER_TAGS = LOUNGE_TIER_CODES.map(code => `Tier ${code}`);
  const LOUNGE_TIER_ORDER = new Map(LOUNGE_TIER_CODES.map((code, index) => [`Tier ${code}`, index]));
  const STORAGE_CURRENT = PAGE_CONFIG.storageSuffix === '12' ? 'mkwt_lounge_current_v1' : `mkwt_lounge${PAGE_CONFIG.storageSuffix}_current_v1`;
  const STORAGE_SESSIONS = PAGE_CONFIG.storageSuffix === '12' ? 'mkwt_lounge_sessions_v1' : `mkwt_lounge${PAGE_CONFIG.storageSuffix}_sessions_v1`;
  const MKCENTRAL_SETTINGS_KEY = 'mkwt_mkcentral_player_ref_v1';
  const MKCENTRAL_SEASON = PAGE_CONFIG.mkcentralSeason;
  const MKCENTRAL_PLAYER_COUNT = PAGE_CONFIG.mkcentralPlayerCount;
  const MKCENTRAL_MOGI_DB_FIELDS = [
    'mkcentral_event_id',
    'mkcentral_event_name',
    'mkcentral_table_url',
    'mkcentral_tier',
    'mkcentral_table_rank',
    'mkcentral_table_score',
    'mkcentral_mmr_before',
    'mkcentral_mmr_delta',
    'mkcentral_mmr_after',
    'mkcentral_event_created_at',
    'mkcentral_synced_at',
    'mkcentral_sync_status',
    'mkcentral_confidence_label',
    'mkcentral_confidence_note',
    'mkcentral_confidence_score',
  ].join(', ');
  const LOUNGE_MOGI_SELECT = [
    'id',
    'created_at',
    'completed_at',
    'updated_at',
    'status',
    'total_points',
    'race_count',
    'disconnects',
    'player_count',
    'lounge_format_tag',
    'lounge_format_source',
    'lounge_tier',
    'stats_excluded',
    'mkcentral_format_tag',
    MKCENTRAL_MOGI_DB_FIELDS,
  ].join(', ');
  const SESSION_PAGE_SIZE = 10;
  const SUGGESTION_MIN_PLAYS = 10;
  const LOUNGE_TIER_STATS_TRACK_MIN_PLAYS = 10;
  const SESSION_FORECAST_MIN_PLAYS = 5;
  const AVG_GAIN_THRESHOLD = PAGE_CONFIG.playerCount === 24 ? 6 : 6.83;
  const SCORE_TONE_CLASSES = [
    'scoreTone--darkred',
    'scoreTone--red',
    'scoreTone--orange',
    'scoreTone--yellow',
    'scoreTone--green',
    'scoreTone--blue',
    'scoreTone--lightblue'
  ];
  const SCORE_TONE_COLORS = {
    'scoreTone--darkred': { fill: 'rgba(76,13,24,.82)', border: 'rgb(102,22,34)' },
    'scoreTone--red': { fill: 'rgba(142,38,43,.82)', border: 'rgb(174,49,53)' },
    'scoreTone--orange': { fill: 'rgba(168,83,28,.82)', border: 'rgb(196,101,34)' },
    'scoreTone--yellow': { fill: 'rgba(184,145,38,.84)', border: 'rgb(211,171,52)' },
    'scoreTone--green': { fill: 'rgba(43,126,57,.84)', border: 'rgb(56,154,69)' },
    'scoreTone--blue': { fill: 'rgba(42,91,156,.84)', border: 'rgb(55,115,190)' },
    'scoreTone--lightblue': { fill: 'rgba(53,139,170,.84)', border: 'rgb(72,169,204)' }
  };
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
    compareChart: null,
    showCompareChart: false,
    trackSortKey: 'avg',
    trackSortDir: 'desc',
    sessionPage: 1,
    openSessionDetails: {},
    openSessionTagEditors: {},
    sessionTagDrafts: {},
    sessionTierDrafts: {},
    editingSessionIndex: null,
    raceEdit: null,
    mkcentralMatches: {},
    mkcentralPlayerId: ''
  };
  let loungeClient = null;
  let loungeSession = null;
  let cloudMode = false;
  let isBound = false;
  let routeFiltersBound = false;
  let stratsMetaIntermissions = null;
  let trackIconPaths = new Map();
  const loungePickerIconReadyPaths = new Set();
  const loungePickerIconFailedPaths = new Set();
  const loungePickerIconPreloadPromises = new Map();
  let loungePickerIconWarmupPromise = null;
  let loungePickerIconRefreshQueued = false;
  let chartFilterBindingsReady = false;
  let entryStatusHideTimer = null;
  let entryStatusExitTimer = null;
  let pendingDeleteMogiIndex = null;

  function read(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; }
  }
  function write(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }
  function cleanProfileText(value){
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function profileDisplayLabel(name, fallback = 'Account'){
    return `Profile: ${cleanProfileText(name) || fallback}`;
  }
  async function loadAccountProfileName(session, client){
    const cached = cleanProfileText(window.PROFILE?.nickname);
    if(cached) return cached;
    const userId = session?.user?.id || '';
    if(client && userId){
      try{
        let { data, error } = await client
          .from('profiles')
          .select('nickname')
          .eq('id', userId)
          .maybeSingle();
        if(error && String(error.message || '').includes('column profiles.id')){
          ({ data, error } = await client
            .from('profiles')
            .select('nickname')
            .eq('user_id', userId)
            .maybeSingle());
        }
        if(!error && data){
          window.PROFILE = { ...(window.PROFILE || {}), ...data };
          const nickname = cleanProfileText(data.nickname);
          if(nickname) return nickname;
        }
      }catch(e){
        console.warn('[lounge] profile name lookup skipped', e?.message || e);
      }
    }
    return cleanProfileText(session?.user?.user_metadata?.nickname)
      || cleanProfileText(session?.user?.user_metadata?.name)
      || '';
  }
  function clearHeroStatus(){
    const el = $('status');
    if(!el) return;
    el.textContent = '';
    el.className = 'muted statusLine hidden';
    el.hidden = true;
  }
  function setStatus(msg, ok=true, autoHide=true){
    clearHeroStatus();
    setEntryStatus(msg, ok, autoHide);
  }
  function setEntryStatus(msg, ok=true, autoHide=true){
    const el = $('entryStatus');
    const has = !!String(msg || '').trim();
    if(entryStatusHideTimer){
      clearTimeout(entryStatusHideTimer);
      entryStatusHideTimer = null;
    }
    if(entryStatusExitTimer){
      clearTimeout(entryStatusExitTimer);
      entryStatusExitTimer = null;
    }
    if(window.MKWT?.showToast){
      if(el){
        el.textContent = '';
        el.className = 'entryStatus hidden';
        el.hidden = true;
      }
      window.MKWT.showToast(has ? String(msg) : '', ok, { autoHide });
      return;
    }
    if(!el) return;
    if(!has){
      el.textContent = '';
      el.className = 'entryStatus hidden';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = msg || '';
    el.className = 'entryStatus ' + (ok ? 'ok' : 'bad');
    requestAnimationFrame(() => {
      if(el.textContent === String(msg)) el.classList.add('is-visible');
    });
    if(has && autoHide){
      const currentMsg = String(msg);
      entryStatusHideTimer = setTimeout(() => {
        if(el.textContent !== currentMsg) return;
        el.classList.remove('is-visible');
        entryStatusHideTimer = null;
        entryStatusExitTimer = setTimeout(() => {
          if(el.textContent !== currentMsg) return;
          el.textContent = '';
          el.className = 'entryStatus hidden';
          el.hidden = true;
          entryStatusExitTimer = null;
        }, 220);
      }, 2000);
    }
  }
  function closeChartFilterMenus(exceptRoot = null){
    if(window.MKWT_UI?.closeFilterMenus){
      window.MKWT_UI.closeFilterMenus('chart', exceptRoot);
      return;
    }
    document.querySelectorAll('.chartFilter').forEach((root) => {
      if(exceptRoot && root === exceptRoot) return;
      const btn = root.querySelector('.chartFilterBtn');
      const menu = root.querySelector('.chartFilterMenu');
      if(menu) menu.hidden = true;
      if(btn) btn.setAttribute('aria-expanded', 'false');
    });
  }
  function bindGlobalChartFilterClosers(){
    if(window.MKWT_UI?.bindGlobalFilterClosers){
      window.MKWT_UI.bindGlobalFilterClosers('chart');
      return;
    }
    if(chartFilterBindingsReady) return;
    chartFilterBindingsReady = true;
    document.addEventListener('click', (event) => {
      if(event.target.closest('.chartFilter')) return;
      closeChartFilterMenus();
    });
    document.addEventListener('keydown', (event) => {
      if(event.key === 'Escape') closeChartFilterMenus();
    });
  }
  function bindChartFilterToggle(btnId, menuId){
    const btn = $(btnId);
    const menu = $(menuId);
    if(!btn || !menu) return;
    if(window.MKWT_UI?.bindFilterToggle){
      window.MKWT_UI.bindFilterToggle(btn, menu, { type: 'chart' });
      return;
    }
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const root = btn.closest('.chartFilter');
      const willOpen = menu.hidden;
      closeChartFilterMenus(root);
      menu.hidden = !willOpen;
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    menu.addEventListener('click', (event) => event.stopPropagation());
  }
  function bindSwipeNavigation(target, { onLeft, onRight, threshold = 56 } = {}){
    if(!target) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    target.addEventListener('touchstart', (event) => {
      if(event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }, { passive: true });
    target.addEventListener('touchend', (event) => {
      if(!tracking || event.changedTouches.length !== 1) return;
      tracking = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if(Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return;
      if(dx < 0 && typeof onLeft === 'function') onLeft();
      if(dx > 0 && typeof onRight === 'function') onRight();
    }, { passive: true });
  }
  function currentTs(){ return new Date().toISOString(); }
  function fmtDate(iso){
    try{ return new Date(iso).toLocaleString(); }catch(e){ return iso || '-'; }
  }
  function fmtDelta(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return '-';
    return `${n > 0 ? '+' : ''}${Math.round(n)}`;
  }
  function fmtMmr(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return '-';
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
  function normalizeLoungeFormatTag(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    const compact = raw.replace(/[\s_-]+/g, '').toLowerCase();
    if(compact === 'nonlounge') return NON_LOUNGE_FORMAT_TAG;
    if(compact === 'ffa') return 'FFA';
    let match = compact.match(/^sq(\d{1,2})v(\d{1,2})$/);
    if(match){
      const tag = `SQ${Number(match[1])}v${Number(match[2])}`;
      return ALL_LOUNGE_FORMAT_TAGS.has(tag) ? tag : '';
    }
    match = compact.match(/^(\d{1,2})v(\d{1,2})$/);
    if(match){
      const tag = `${Number(match[1])}v${Number(match[2])}`;
      return ALL_LOUNGE_FORMAT_TAGS.has(tag) ? tag : '';
    }
    return '';
  }
  function pageLoungeFormatTags(){
    return LOUNGE_FORMAT_TAGS[PAGE_CONFIG.playerCount] || LOUNGE_FORMAT_TAGS[12];
  }
  function sessionFormatTag(session){
    return normalizeLoungeFormatTag(session?.loungeFormatTag || session?.matchFormatTag || session?.lounge_format_tag || '');
  }
  function normalizeLoungeTierTag(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    const withoutPrefix = raw.replace(/^tier\s+/i, '').trim();
    const code = withoutPrefix.replace(/[\s_-]+/g, '').toUpperCase();
    if(!code || code === 'OTHER' || /^\d{5,}$/.test(code)) return '';
    if(!/^[A-Z]{1,3}$/.test(code)) return '';
    return `Tier ${code}`;
  }
  function sessionTierTag(session){
    return normalizeLoungeTierTag(session?.loungeTier || session?.lounge_tier || session?.tierTag || session?.tier || '');
  }
  function sessionMkcentralFormatTag(session, match = null){
    return normalizeLoungeFormatTag(match?.format || session?.mkcentralFormatTag || session?.mkcentral_format_tag || '');
  }
  function sessionFormatSource(session){
    return String(session?.loungeFormatSource || session?.lounge_format_source || '').trim().toLowerCase();
  }
  function isNonLoungeSession(session){
    return sessionFormatTag(session) === NON_LOUNGE_FORMAT_TAG;
  }
  function normalizeStatsExcluded(session){
    return session?.statsExcluded === true || session?.stats_excluded === true;
  }
  function sessionStatsExcluded(session){
    return isNonLoungeSession(session) && normalizeStatsExcluded(session);
  }
  function isSquadQueueFormatTag(tag){
    return /^SQ\d+v\d+$/i.test(String(tag || '').trim());
  }
  function formatTagClass(tag){
    const normalized = normalizeLoungeFormatTag(tag);
    if(normalized === NON_LOUNGE_FORMAT_TAG) return 'sessionFormatTag--nonLounge';
    if(isSquadQueueFormatTag(normalized)) return 'sessionFormatTag--sq';
    return '';
  }
  function formatTagPillHtml(tag, className = 'sessionFormatTag'){
    const normalized = normalizeLoungeFormatTag(tag);
    if(!normalized) return '';
    return `<span class="${className} ${formatTagClass(normalized)}">${escapeHtml(normalized)}</span>`;
  }
  function tierTagPillHtml(tag, className = 'sessionFormatTag sessionTierTag'){
    const normalized = normalizeLoungeTierTag(tag);
    if(!normalized) return '';
    return `<span class="${className}">${escapeHtml(normalized)}</span>`;
  }
  function compareLoungeTierTags(a, b){
    const ai = LOUNGE_TIER_ORDER.has(a) ? LOUNGE_TIER_ORDER.get(a) : LOUNGE_TIER_ORDER.size;
    const bi = LOUNGE_TIER_ORDER.has(b) ? LOUNGE_TIER_ORDER.get(b) : LOUNGE_TIER_ORDER.size;
    return ai - bi || a.localeCompare(b, 'en', { numeric: true });
  }
  function collectLoungeTierTags(){
    const seen = new Set(LOUNGE_TIER_TAGS);
    const add = (value) => {
      const normalized = normalizeLoungeTierTag(value);
      if(normalized) seen.add(normalized);
    };
    [...(state.sessions || []), state.current].forEach(session => add(sessionTierTag(session)));
    const payload = readMkcentralPayload();
    (payload?.events || []).forEach(event => add(mkcentralGroupValue(event, 'tier')));
    return Array.from(seen).sort(compareLoungeTierTags);
  }
  function sessionTagMismatchWithMkcentral(session, match = null){
    const localTag = sessionFormatTag(session);
    if(localTag === NON_LOUNGE_FORMAT_TAG) return false;
    const mkcTag = sessionMkcentralFormatTag(session, match);
    if(!mkcTag) return false;
    if(localTag) return localTag !== mkcTag;
    return sessionFormatSource(session) === 'manual';
  }
  function sessionTagMismatchMessage(session, match = null){
    const localTag = sessionFormatTag(session) || 'No tag';
    const mkcTag = sessionMkcentralFormatTag(session, match) || 'Unknown';
    return `MKCentral matched this Mogi as ${mkcTag}, but the local tag is ${localTag}. Check whether this session still syncs as intended.`;
  }
  function normalizeMkcentralFormat(value){
    const raw = String(value || '').trim();
    if(!raw || /^\d{5,}$/.test(raw)) return 'Other';
    const normalized = normalizeLoungeFormatTag(raw);
    if(normalized) return normalized;
    const compact = raw.replace(/\s+/g, '').toUpperCase();
    const sq = compact.match(/^SQ(\d+)V(\d+)$/);
    if(sq) return `SQ${Number(sq[1])}v${Number(sq[2])}`;
    const versus = compact.match(/^(\d+)V(\d+)$/);
    if(versus) return `${Number(versus[1])}v${Number(versus[2])}`;
    return compact || 'Other';
  }
  function normalizeMkcentralTier(value){
    const raw = String(value || '').trim();
    if(!raw || /^\d{5,}$/.test(raw)) return 'Other';
    return raw.toUpperCase() || 'Other';
  }
  function parseMkcentralEventLabel(label){
    const text = String(label || '');
    return {
      format: normalizeMkcentralFormat((text.match(/\b(SQ\s*\d+v\d+|FFA|\d+v\d+)\b/i) || [])[1]),
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
  function currentEntryTagParts(){
    const parts = [];
    const lobby = currentLobbySize();
    if(PAGE_CONFIG.allowLobbyTags && lobby !== PAGE_CONFIG.playerCount) parts.push(`${lobby}p`);
    if(state.entryDisconnect) parts.push('DC');
    return parts;
  }
  function updateTagExpandToggle(){
    const btn = $('btnTagToggle');
    if(!btn) return;
    const parts = currentEntryTagParts();
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.textContent = parts.length ? `Tags: ${parts.join(' + ')}` : 'Tags';
    btn.classList.toggle('active', isOpen || parts.length > 0);
  }
  function setTagsOpen(open){
    const btn = $('btnTagToggle');
    if(!btn) return;
    const isOpen = !!open;
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.closest('.actionStrip')?.classList.toggle('is-tags-open', isOpen);
    updateTagExpandToggle();
  }
  function toggleTagsOpen(){
    const btn = $('btnTagToggle');
    setTagsOpen(btn?.getAttribute('aria-expanded') !== 'true');
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
    updateTagExpandToggle();
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
    updateTrackSuggestionButton();
    if($('trackSuggestionDialog')?.open){
      if(state.entryMode === 'track' || isIntermissionSuggestionMode()) renderTrackSuggestionDialog();
      else closeTrackSuggestionDialog();
    }
    try{ window.MKWT_LOUNGE_PICKERS?.refreshAll?.(); }catch(e){}
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
  function cleanTrackText(value){
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function canonicalTrackName(value){
    const raw = cleanTrackText(value);
    if(!raw) return '';
    const lower = raw.toLowerCase();
    const exact = COURSE_TRACKS.find(track => track.toLowerCase() === lower);
    if(exact) return exact;
    const compact = lower.replace(/[^a-z0-9]+/g, '');
    const fuzzy = COURSE_TRACKS.find((track) => track.toLowerCase().replace(/[^a-z0-9]+/g, '') === compact);
    return fuzzy || raw;
  }
  function trackAbbrev(trackName){
    const words = canonicalTrackName(trackName).split(/[\s'.?-]+/).filter(Boolean);
    return (words.slice(0, 2).map(word => word[0]).join('') || '?').toUpperCase();
  }
  async function loadTrackIconMap(){
    try{
      const res = await fetch('track_icon_map.json');
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      trackIconPaths = new Map(Object.entries(json || {}).map(([key, value]) => [cleanTrackText(key), String(value || '')]));
    }catch(e){
      console.warn('[lounge] failed to load track_icon_map.json', e);
      trackIconPaths = new Map();
    }
  }
  function getTrackIconPath(trackName){
    const canonical = canonicalTrackName(trackName);
    return trackIconPaths.get(canonical) || trackIconPaths.get(cleanTrackText(trackName)) || '';
  }
  function pickerIconPathFromSource(iconPath, group){
    const cleanPath = cleanTrackText(iconPath).replace(/\\/g, '/');
    const fileName = cleanPath.split('/').pop();
    return fileName ? `assets/picker-icons/${group}/${fileName}` : '';
  }
  function getTrackPickerIconPath(trackName){
    const iconPath = getTrackIconPath(trackName);
    return pickerIconPathFromSource(iconPath, 'tracks') || iconPath;
  }
  function scheduleLoungePickerIconRefresh(){
    if(loungePickerIconRefreshQueued) return;
    loungePickerIconRefreshQueued = true;
    requestAnimationFrame(() => {
      loungePickerIconRefreshQueued = false;
      try{ window.MKWT_LOUNGE_PICKERS?.refreshTrackPickers?.(); }catch(e){}
    });
  }
  function preloadLoungePickerIconPath(iconPath){
    if(!iconPath || loungePickerIconReadyPaths.has(iconPath) || loungePickerIconFailedPaths.has(iconPath)){
      return Promise.resolve(loungePickerIconReadyPaths.has(iconPath));
    }
    if(loungePickerIconPreloadPromises.has(iconPath)) return loungePickerIconPreloadPromises.get(iconPath);
    const promise = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.onload = async () => {
        try{ await img.decode?.(); }catch(e){}
        loungePickerIconReadyPaths.add(iconPath);
        scheduleLoungePickerIconRefresh();
        resolve(true);
      };
      img.onerror = () => {
        loungePickerIconFailedPaths.add(iconPath);
        resolve(false);
      };
      img.src = iconPath;
    });
    loungePickerIconPreloadPromises.set(iconPath, promise);
    return promise;
  }
  function preloadLoungePickerIcons(){
    if(loungePickerIconWarmupPromise) return loungePickerIconWarmupPromise;
    const paths = [...new Set(COURSE_TRACKS.map(getTrackPickerIconPath).filter(Boolean))];
    loungePickerIconWarmupPromise = Promise.allSettled(paths.map(preloadLoungePickerIconPath));
    return loungePickerIconWarmupPromise;
  }
  function scheduleLoungePickerIconWarmup(){
    const schedule = window.MKWT_scheduleIdleTask;
    if(typeof schedule === 'function') schedule(preloadLoungePickerIcons, 350, 1800);
    else window.setTimeout(preloadLoungePickerIcons, 350);
  }
  function trackIconMarkup(trackName, extraClass = ''){
    const canonical = canonicalTrackName(trackName);
    const iconPath = getTrackIconPath(trackName);
    const className = `raceTrackIcon${extraClass ? ` ${extraClass}` : ''}`;
    if(iconPath){
      return `<img class="${className}" src="${escapeHtml(iconPath)}" alt="${escapeHtml(canonical || trackName || 'Track')}" loading="lazy" decoding="async">`;
    }
    return `<span class="raceTrackIconFallback${extraClass ? ` ${extraClass}` : ''}" aria-label="${escapeHtml(canonical || trackName || 'Track')}">${escapeHtml(trackAbbrev(canonical || trackName))}</span>`;
  }
  function singleTrackVisualHtml(trackName){
    const canonical = canonicalTrackName(trackName);
    return `<div class="raceTrackVisual" title="${escapeHtml(canonical || trackName || '')}">${trackIconMarkup(canonical || trackName)}</div>`;
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
      const res = await fetch('strats.json');
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
  function isPlainIntermissionTrack(value){
    return String(value || '').trim() === 'Intermission';
  }
  function use12pIntermissionNoRepickRule(){
    return PAGE_CONFIG.playerCount === 12 && !PAGE_CONFIG.allowIntermissionRoutes;
  }
  function is12pIntermissionNoRepickRace(race){
    return use12pIntermissionNoRepickRule()
      && (isPlainIntermissionTrack(race?.track) || isIntermissionRace(race));
  }
  function routePartsFromRace(race){
    const start = String(race?.intermissionStart || race?.intermission_start || '').trim();
    const end = String(race?.intermissionEnd || race?.intermission_end || '').trim();
    if(start && end) return { start, end };
    return parseRouteLabel(race?.track) || { start: '', end: '' };
  }
  function use24pRouteRepickRules(){
    return PAGE_CONFIG.playerCount === 24 && PAGE_CONFIG.allowIntermissionRoutes;
  }
  function isPeachStadiumRainbowRoute(start, end){
    return canonicalTrackName(start) === 'Peach Stadium' && canonicalTrackName(end) === 'Rainbow Road';
  }
  function trackRepickKey(trackName){
    const track = canonicalTrackName(trackName);
    if(!track) return '';
    return track === 'Rainbow Road' ? 'special|rainbow-road' : `track|${track}`;
  }
  function routeRepickKey(start, end){
    const destination = canonicalTrackName(end);
    if(!destination) return '';
    if(isPeachStadiumRainbowRoute(start, end)) return 'special|rainbow-road';
    return `intermission-destination|${destination}`;
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
        return `
          <div class="raceRouteVisual" title="${escapeHtml(routeLabel(start, end))}">
            <div class="raceRouteNode" title="${escapeHtml(start)}">${trackIconMarkup(start)}</div>
            <div class="raceRouteArrow" aria-hidden="true">&rarr;</div>
            <div class="raceRouteNode raceRouteNode--destiny" title="${escapeHtml(end)}">${trackIconMarkup(end)}</div>
          </div>`;
      }
    }
    return singleTrackVisualHtml(displayRaceLabel(race));
  }
  function raceTypeLabel(race){
    const parts = [];
    if(race?.disconnect) parts.push('DC');
    if(race?.repick) parts.push('Repick');
    if(isIntermissionRace(race)) parts.push('Intermission');
    return parts.length ? parts.join(' / ') : 'Normal';
  }
  function raceTypeCellHtml(race){
    return `<td>${escapeHtml(raceTypeLabel(race))}</td>`;
  }
  function ordinalLabel(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n <= 0) return '-';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if(mod10 === 1 && mod100 !== 11) return `${n}st`;
    if(mod10 === 2 && mod100 !== 12) return `${n}nd`;
    if(mod10 === 3 && mod100 !== 13) return `${n}rd`;
    return `${n}th`;
  }
  function raceEntryMetaHtml(race){
    const lobby = `${Number(race?.lobbySize || PAGE_CONFIG.playerCount)}p`;
    const type = raceTypeLabel(race);
    const sub = type === 'Normal' ? '' : type;
    return `<td class="raceMetaCell raceMetaCell--entry"><span class="raceCompactMeta raceCompactMeta--entry"><span class="raceCompactMeta__main">${escapeHtml(lobby)}</span>${sub ? `<span class="raceCompactMeta__sub">${escapeHtml(sub)}</span>` : ''}</span></td>`;
  }
  function raceResultMetaHtml(race){
    const placement = ordinalLabel(race?.placement);
    const points = Number(race?.points || 0);
    return `<td class="raceMetaCell raceMetaCell--result"><span class="raceCompactMeta raceCompactMeta--result"><span class="raceCompactMeta__main">${escapeHtml(placement)}</span><span class="raceCompactMeta__sub">${escapeHtml(String(points))}p</span></span></td>`;
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
    return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''} data-base-label="${escapeHtml(display)}">${escapeHtml(display)}</option>`;
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
    const used = new Set();
    races.forEach((race) => {
      if(is12pIntermissionNoRepickRace(race)){
        return;
      }
      if(!isIntermissionRace(race)){
        const track = use24pRouteRepickRules() ? canonicalTrackName(race?.track) : String(race?.track || '').trim();
        if(track) used.add(track);
        return;
      }
      if(use24pRouteRepickRules()){
        const route = routePartsFromRace(race);
        if(isPeachStadiumRainbowRoute(route.start, route.end)) used.add('Rainbow Road');
      }
    });
    return used;
  }
  function currentIntermissionDestinySet(start){
    const routeStart = String(start || '').trim();
    const useDestinationRules = use24pRouteRepickRules();
    if(!useDestinationRules && !routeStart) return new Set();
    const races = state.current?.races || [];
    const used = new Set();
    races.forEach((race) => {
      if(isIntermissionRace(race)){
        const route = routePartsFromRace(race);
        if(useDestinationRules || route.start === routeStart){
          const destination = useDestinationRules ? canonicalTrackName(route.end) : route.end;
          if(destination) used.add(destination);
        }
        return;
      }
      if(useDestinationRules && canonicalTrackName(race?.track) === 'Rainbow Road'){
        used.add('Rainbow Road');
      }
    });
    return used;
  }
  function markPlayedOptions(select, usedValues){
    if(!select) return;
    const selected = String(select.value || '');
    const used = usedValues instanceof Set ? usedValues : new Set();
    const options = Array.from(select.options || []);
    const valueOptions = options.filter((option) => String(option.value || '').trim());

    options.forEach((option) => {
      if(!String(option.value || '').trim()){
        const baseLabel = option.dataset.baseLabel || option.textContent || '';
        option.dataset.baseLabel = baseLabel;
        option.textContent = baseLabel;
        option.classList.remove('loungeOptionUsed');
        delete option.dataset.repick;
        option.selected = !selected;
      }
    });

    valueOptions.forEach((option) => {
      const value = String(option.value || '').trim();
      const rawLabel = option.dataset.baseLabel || option.textContent || value;
      const baseLabel = String(rawLabel).replace(/\s+\(Repick\)$/i, '');
      const isRepick = used.has(value);
      option.dataset.baseLabel = baseLabel;
      option.textContent = baseLabel;
      option.classList.toggle('loungeOptionUsed', isRepick);
      if(isRepick) option.dataset.repick = '1';
      else delete option.dataset.repick;
      option.selected = value === selected;
    });

    select.value = selected;
  }
  function updatePlayedOptionHints(){
    markPlayedOptions($('trackSelect'), currentTrackSet());
    if(PAGE_CONFIG.allowIntermissionRoutes){
      markPlayedOptions($('intermissionEndSelect'), currentIntermissionDestinySet($('intermissionStartSelect')?.value || ''));
    }
    try{ window.MKWT_LOUNGE_PICKERS?.refreshAll?.(); }catch(e){}
  }
  function initLoungePickers(){
    const configs = [
      { id: 'trackSelect', kind: 'track' },
      { id: 'intermissionStartSelect', kind: 'track' },
      { id: 'intermissionEndSelect', kind: 'track' },
      { id: 'placementSelect', kind: 'number', columns: PAGE_CONFIG.playerCount >= 24 ? 6 : 4, width: PAGE_CONFIG.playerCount >= 24 ? 430 : 360 },
      { id: 'savedRaceEditTrackSelect', kind: 'track' },
      { id: 'savedRaceEditStartSelect', kind: 'track' },
      { id: 'savedRaceEditEndSelect', kind: 'track' },
      { id: 'savedRaceEditPlacementSelect', kind: 'number', columns: PAGE_CONFIG.playerCount >= 24 ? 6 : 4, width: PAGE_CONFIG.playerCount >= 24 ? 430 : 360 }
    ];
    const selects = configs
      .map((config) => ({ ...config, selectEl: $(config.id) }))
      .filter((config) => config.selectEl);
    if(!selects.length) return;

    const pickers = new Map();
    const backdrop = document.createElement('div');
    backdrop.className = 'trackPickerBackdrop loungePickerBackdrop';
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    let scrollLockY = 0;
    let scrollLocked = false;
    let activeLetterPicker = null;

    const pulseLetterFilterHaptic = () => {
      const nav = window.navigator;
      if(!nav || typeof nav.vibrate !== 'function') return;
      const isTouchDevice = Number(nav.maxTouchPoints || 0) > 0;
      const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
      if(!isTouchDevice && !isCoarsePointer) return;
      try{ nav.vibrate(8); }catch(e){}
    };

    const lockPageScroll = () => {
      if(scrollLocked) return;
      scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add('trackPickerScrollLocked');
      document.body.classList.add('trackPickerScrollLocked');
      document.body.style.top = `-${scrollLockY}px`;
      scrollLocked = true;
    };
    const unlockPageScroll = () => {
      if(!scrollLocked) return;
      document.documentElement.classList.remove('trackPickerScrollLocked');
      document.body.classList.remove('trackPickerScrollLocked');
      document.body.style.top = '';
      window.scrollTo(0, scrollLockY);
      scrollLocked = false;
    };
    const showBackdrop = () => {
      backdrop.hidden = false;
      backdrop.classList.add('is-visible');
      lockPageScroll();
    };
    const hideBackdrop = () => {
      backdrop.classList.remove('is-visible');
      backdrop.hidden = true;
      unlockPageScroll();
    };

    const stripRepickSuffix = (value) => String(value || '').replace(/\s+\(Repick\)$/i, '').trim();
    const getSelectLabel = (selectEl) => {
      const ariaLabel = selectEl.getAttribute('aria-label');
      if(ariaLabel) return ariaLabel.trim();
      const label = selectEl.closest('label');
      const labelText = Array.from(label?.children || [])
        .find((child) => child.tagName === 'SPAN' && !child.classList.contains('trackPicker__value'))
        ?.textContent;
      return (labelText || '').trim();
    };
    const getPlaceholderText = (selectEl) => {
      const labelText = getSelectLabel(selectEl);
      if(labelText) return labelText;
      const placeholder = Array.from(selectEl.options || []).find((option) => !String(option.value || '').trim());
      return (placeholder?.textContent || 'Select').trim();
    };
    const getOptionLabel = (option) => {
      return stripRepickSuffix(option?.dataset?.baseLabel || option?.textContent || option?.value || '');
    };
    const getTriggerText = (selectEl) => {
      const value = String(selectEl.value || '').trim();
      if(!value) return getPlaceholderText(selectEl);
      const selected = selectEl.selectedOptions?.[0];
      return getOptionLabel(selected) || value;
    };
    const readOptions = (selectEl) => {
      return Array.from(selectEl.options || [])
        .filter((option) => String(option.value || '').trim())
        .map((option) => ({
          value: String(option.value || '').trim(),
          label: getOptionLabel(option),
          repick: option.dataset?.repick === '1' || option.classList.contains('loungeOptionUsed')
        }))
        .sort((a, b) => String(a.value).localeCompare(String(b.value), 'de'));
    };
    const readNumberOptions = (selectEl) => {
      return Array.from(selectEl.options || [])
        .filter((option) => String(option.value || '').trim())
        .map((option) => ({ value: String(option.value || '').trim(), label: option.textContent || option.value }));
    };
    const isIntermissionEndPicker = (picker) => {
      const selectEl = picker?.selectEl;
      if(!selectEl) return false;
      const id = String(selectEl.id || '').trim();
      if(/intermission.*end|end.*intermission/i.test(id)) return true;
      const placeholder = Array.from(selectEl.options || []).find((option) => !String(option.value || '').trim());
      const placeholderText = String(placeholder?.textContent || placeholder?.label || '').trim();
      const aria = String(selectEl.getAttribute('aria-label') || '').trim();
      return [placeholderText, aria].some((text) => /intermission\s*end/i.test(text));
    };
    const isFilteredIntermissionEndPicker = (picker, options, activeLetter) => {
      if(activeLetter !== 'all' || !isIntermissionEndPicker(picker)) return false;
      const optionCount = new Set((options || []).map((option) => String(option.value || option.label || '').trim()).filter(Boolean)).size;
      return optionCount > 0 && optionCount < COURSE_TRACKS.length;
    };
    const getTrackLetter = (option) => {
      const text = String(option?.value || option?.label || '').trim();
      return (text.charAt(0) || '?').toUpperCase();
    };
    const getTrackLetters = (options) => {
      return Array.from(new Set(options.map(getTrackLetter).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'de'));
    };
    const isIntermissionOption = (value) => String(value || '').trim() === 'Intermission';
    const hasIntermissionOption = (options) => {
      return options.some((option) => isIntermissionOption(option.value));
    };
    const getRailLetters = (letters, options) => {
      if(!hasIntermissionOption(options) || !letters.includes('I')) return letters;
      return ['I', ...letters.filter((letter) => letter !== 'I')];
    };
    const getActiveTrackLetter = (picker, letters) => {
      const current = picker.letterFilter || 'all';
      if(current !== 'all' && !letters.includes(current)){
        picker.letterFilter = 'all';
        return 'all';
      }
      return current;
    };
    const filterTrackOptionsByLetter = (options, letter) => {
      if(!letter || letter === 'all') return options;
      return options.filter((option) => getTrackLetter(option) === letter);
    };
    const groupOptions = (options) => {
      const groups = [];
      for(const option of options){
        const label = getTrackLetter(option);
        let group = groups.find((item) => item.label === label);
        if(!group){
          group = { label, options: [] };
          groups.push(group);
        }
        group.options.push(option);
      }
      return groups;
    };
    const createIconSlot = (trackName) => {
      const slot = document.createElement('span');
      slot.className = 'trackPicker__iconSlot';
      slot.setAttribute('aria-hidden', 'true');
      if(isIntermissionOption(trackName)){
        slot.classList.add('trackPicker__iconSlot--intermission');
        const intermissionIcon = document.createElement('span');
        intermissionIcon.className = 'trackPicker__intermissionIcon';
        intermissionIcon.textContent = 'X';
        slot.appendChild(intermissionIcon);
        return slot;
      }
      const iconPath = getTrackPickerIconPath(trackName);
      if(iconPath && loungePickerIconReadyPaths.has(iconPath)){
        const img = document.createElement('img');
        img.className = 'trackPicker__icon';
        img.src = iconPath;
        img.alt = '';
        img.width = 24;
        img.height = 24;
        img.decoding = 'async';
        img.loading = 'eager';
        slot.appendChild(img);
        return slot;
      }
      const fallback = document.createElement('span');
      fallback.className = 'trackPicker__iconFallback';
      fallback.textContent = trackAbbrev(trackName);
      slot.appendChild(fallback);
      return slot;
    };

    const closeAll = (exceptPicker = null) => {
      if(!exceptPicker) activeLetterPicker = null;
      for(const picker of pickers.values()){
        if(picker === exceptPicker) continue;
        picker.root.classList.remove('is-open');
        picker.trigger.setAttribute('aria-expanded', 'false');
        picker.panel.hidden = true;
        picker.panel.style.left = '';
        picker.panel.style.top = '';
        picker.panel.style.width = '';
      }
      if(!exceptPicker) hideBackdrop();
    };
    const alignPanel = (picker) => {
      picker.panel.style.left = '';
      picker.panel.style.top = '';
      picker.panel.style.width = '';
      const viewport = window.visualViewport || {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0
      };
      const isMobile = viewport.width < 760;
      const margin = isMobile ? 10 : 16;
      const desiredWidth = picker.kind === 'number'
        ? (picker.width || 390)
        : (isMobile ? 760 : 900);
      const panelWidth = Math.min(desiredWidth, viewport.width - (margin * 2));
      const centeredLeft = viewport.offsetLeft + ((viewport.width - panelWidth) / 2);
      picker.panel.style.width = `${Math.round(panelWidth)}px`;
      picker.panel.style.left = `${Math.round(centeredLeft)}px`;
      const panelRect = picker.panel.getBoundingClientRect();
      const preferredTop = viewport.offsetTop + ((viewport.height - panelRect.height) / 2);
      const maxTop = viewport.offsetTop + viewport.height - panelRect.height - margin;
      const top = Math.max(viewport.offsetTop + margin, Math.min(preferredTop, maxTop));
      picker.panel.style.top = `${Math.round(top)}px`;
    };
    const renderPanel = (picker) => {
      const { selectEl, panel } = picker;
      panel.innerHTML = '';
      if(picker.kind === 'number'){
        const grid = document.createElement('div');
        grid.className = 'numberPicker__grid';
        grid.style.setProperty('--number-picker-cols', String(picker.columns || 4));
        for(const option of readNumberOptions(selectEl)){
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'numberPicker__option';
          if(['1', '2', '3'].includes(option.value)) item.classList.add(`numberPicker__option--place${option.value}`);
          item.dataset.value = option.value;
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', selectEl.value === option.value ? 'true' : 'false');
          item.textContent = option.label;
          grid.appendChild(item);
        }
        panel.appendChild(grid);
        return;
      }

      const allOptions = readOptions(selectEl);
      const letters = getTrackLetters(allOptions);
      const activeLetter = getActiveTrackLetter(picker, letters);
      const visibleOptions = filterTrackOptionsByLetter(allOptions, activeLetter);
      picker.root?.classList.toggle('trackPicker--letterFiltered', activeLetter !== 'all');
      picker.root?.classList.toggle('trackPicker--intermissionEndFiltered', isFilteredIntermissionEndPicker(picker, allOptions, activeLetter));
      const railLetters = getRailLetters(letters, allOptions);
      const letterCount = railLetters.length + 1;
      panel.style.setProperty('--track-picker-letter-count', String(letterCount));
      panel.style.setProperty('--track-picker-mobile-height', `${32 + (letterCount * 24) + ((letterCount - 1) * 4)}px`);

      const layout = document.createElement('div');
      layout.className = 'trackPicker__layout';
      const rail = document.createElement('div');
      rail.className = 'trackPicker__letterRail';
      rail.setAttribute('aria-label', 'Track letter filter');
      const appendLetterButton = (label, value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'trackPicker__letterBtn';
        if(value === 'all') button.classList.add('trackPicker__letterBtn--all');
        if(value === 'I' && hasIntermissionOption(allOptions)) button.classList.add('trackPicker__letterBtn--intermission');
        if(activeLetter === value) button.classList.add('is-active');
        button.dataset.letterFilter = value;
        button.setAttribute('aria-pressed', activeLetter === value ? 'true' : 'false');
        button.textContent = label;
        rail.appendChild(button);
      };
      appendLetterButton('All', 'all');
      railLetters.forEach((letter) => appendLetterButton(letter === 'I' && hasIntermissionOption(allOptions) ? 'IM!' : letter, letter));
      rail.addEventListener('click', (event) => {
        const letterButton = event.target.closest?.('[data-letter-filter]');
        if(!letterButton) return;
        event.preventDefault();
        applyLetterFilter(picker, letterButton.dataset.letterFilter || 'all', true);
      });
      rail.addEventListener('keydown', (event) => {
        if(event.key !== 'Enter' && event.key !== ' ') return;
        const letterButton = event.target.closest?.('[data-letter-filter]');
        if(!letterButton) return;
        event.preventDefault();
        if((picker.letterFilter || 'all') !== 'all'){
          resetLetterFilterToAll(picker);
          return;
        }
        applyLetterFilter(picker, letterButton.dataset.letterFilter || 'all');
      });
      rail.addEventListener('pointerdown', (event) => {
        if(!event.target.closest?.('[data-letter-filter]')) return;
        event.preventDefault();
        activeLetterPicker = picker;
        applyLetterFilterFromPoint(event.clientX, event.clientY, true);
      });

      const trackArea = document.createElement('div');
      trackArea.className = 'trackPicker__trackArea';
      const groupsEl = document.createElement('div');
      groupsEl.className = 'trackPicker__groups';
      for(const group of groupOptions(visibleOptions)){
        const groupEl = document.createElement('div');
        groupEl.className = 'trackPicker__group';
        const head = document.createElement('div');
        head.className = 'trackPicker__groupLabel';
        head.textContent = group.label;
        groupEl.appendChild(head);
        for(const option of group.options){
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'trackPicker__option';
          if(option.repick) item.classList.add('trackPicker__option--repick');
          item.dataset.value = option.value;
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', selectEl.value === option.value ? 'true' : 'false');
          item.title = option.repick ? `${option.value} - Repick` : option.value;
          item.appendChild(createIconSlot(option.value));
          const text = document.createElement('span');
          text.className = 'trackPicker__optionText';
          text.textContent = option.label || option.value;
          item.appendChild(text);
          if(option.repick){
            const badge = document.createElement('span');
            badge.className = 'trackPicker__repickBadge';
            badge.textContent = 'Repick';
            item.appendChild(badge);
          }
          groupEl.appendChild(item);
        }
        groupsEl.appendChild(groupEl);
      }
      if(!groupsEl.children.length){
        const empty = document.createElement('div');
        empty.className = 'trackPicker__empty';
        empty.textContent = 'No tracks';
        groupsEl.appendChild(empty);
      }
      trackArea.appendChild(groupsEl);
      layout.appendChild(rail);
      layout.appendChild(trackArea);
      panel.appendChild(layout);
    };
    const refreshPicker = (picker) => {
      const text = getTriggerText(picker.selectEl);
      picker.valueEl.textContent = text;
      picker.trigger.title = text;
      picker.trigger.classList.toggle('is-placeholder', !picker.selectEl.value);
      if(!picker.panel.hidden) renderPanel(picker);
    };
    const resetLetterFilterToAll = (picker, focusAll = true) => {
      if(!picker || picker.kind !== 'track' || picker.panel.hidden) return false;
      if((picker.letterFilter || 'all') === 'all') return false;
      picker.letterFilter = 'all';
      renderPanel(picker);
      alignPanel(picker);
      if(focusAll){
        window.requestAnimationFrame(() => {
          picker.panel.querySelector('[data-letter-filter="all"]')?.focus?.();
        });
      }
      return true;
    };
    const applyKeyboardLetterFilter = (picker, key) => {
      if(!picker || picker.kind !== 'track' || picker.panel.hidden) return false;
      const letter = String(key || '').trim().charAt(0).toUpperCase();
      if(!/^[A-Z0-9]$/.test(letter)) return false;
      const letters = getTrackLetters(readOptions(picker.selectEl));
      if(!letters.includes(letter)) return false;
      applyLetterFilter(picker, letter);
      window.requestAnimationFrame(() => {
        picker.panel.querySelector(`[data-letter-filter="${CSS.escape(letter)}"]`)?.focus?.();
      });
      return true;
    };
    const findOpenPicker = () => {
      return Array.from(pickers.values()).find((picker) => !picker.panel.hidden) || null;
    };
    const applyLetterFilter = (picker, letter, withHaptic = false) => {
      if(!picker || picker.kind !== 'track' || picker.panel.hidden) return;
      const next = letter || 'all';
      if((picker.letterFilter || 'all') === next) return;
      picker.letterFilter = next;
      renderPanel(picker);
      alignPanel(picker);
      if(withHaptic) pulseLetterFilterHaptic();
    };
    const applyLetterFilterFromPoint = (clientX, clientY, withHaptic = false) => {
      if(!activeLetterPicker) return;
      const target = document.elementFromPoint(clientX, clientY);
      const button = target?.closest?.('[data-letter-filter]');
      if(!button || !activeLetterPicker.panel.contains(button)) return;
      applyLetterFilter(activeLetterPicker, button.dataset.letterFilter || 'all', withHaptic);
    };
    const openPicker = (picker) => {
      closeAll(picker);
      if(picker.kind === 'track') picker.letterFilter = 'all';
      if(picker.kind === 'track') preloadLoungePickerIcons();
      renderPanel(picker);
      picker.panel.hidden = false;
      picker.root.classList.add('is-open');
      picker.trigger.setAttribute('aria-expanded', 'true');
      alignPanel(picker);
      showBackdrop();
    };
    const togglePicker = (picker) => {
      if(picker.panel.hidden) openPicker(picker);
      else closeAll();
    };
    const eventInsideAnyPicker = (event) => {
      const target = event.target;
      if(!target) return false;
      for(const picker of pickers.values()){
        if(picker.root.contains(target) || picker.panel.contains(target)) return true;
      }
      return false;
    };

    for(const config of selects){
      const selectEl = config.selectEl;
      if(selectEl.dataset.loungePickerReady === '1') continue;
      selectEl.dataset.loungePickerReady = '1';
      selectEl.classList.add('trackNativeSelect', 'loungeNativeSelect');
      const fieldLabel = selectEl.closest('label');
      const labelText = getSelectLabel(selectEl);
      if(fieldLabel) fieldLabel.classList.add('loungePickerLabel');
      const root = document.createElement('div');
      root.className = `trackPicker loungePicker ${config.kind === 'number' ? 'trackPicker--number' : 'trackPicker--track'}`;
      root.dataset.selectId = selectEl.id;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'trackPicker__trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      if(labelText) trigger.setAttribute('aria-label', labelText);
      const valueEl = document.createElement('span');
      valueEl.className = 'trackPicker__value';
      trigger.appendChild(valueEl);
      const chevron = document.createElement('span');
      chevron.className = 'trackPicker__chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = 'v';
      trigger.appendChild(chevron);
      const panel = document.createElement('div');
      panel.className = 'trackPicker__panel';
      if(config.kind === 'number') panel.classList.add('trackPicker__panel--number');
      panel.setAttribute('role', 'listbox');
      panel.hidden = true;
      root.appendChild(trigger);
      root.appendChild(panel);
      selectEl.insertAdjacentElement('afterend', root);
      const picker = { ...config, selectEl, root, trigger, valueEl, panel };
      pickers.set(selectEl.id, picker);
      trigger.addEventListener('click', () => togglePicker(picker));
      trigger.addEventListener('keydown', (event) => {
        if(event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if(!picker.panel.hidden && picker.kind === 'track' && (picker.letterFilter || 'all') !== 'all'){
          resetLetterFilterToAll(picker);
          return;
        }
        togglePicker(picker);
      });
      panel.addEventListener('click', (event) => {
        event.stopPropagation();
        const optionButton = event.target.closest?.('[data-value]');
        if(!optionButton) return;
        selectEl.value = optionButton.dataset.value || '';
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        closeAll();
        refreshPicker(picker);
        trigger.focus();
      });
      selectEl.addEventListener('change', () => refreshPicker(picker));
      const observer = new MutationObserver(() => refreshPicker(picker));
      observer.observe(selectEl, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'data-repick', 'data-base-label']
      });
      refreshPicker(picker);
    }
    document.addEventListener('click', (event) => {
      if(!eventInsideAnyPicker(event)) closeAll();
    });
    document.addEventListener('pointermove', (event) => {
      if(!activeLetterPicker) return;
      event.preventDefault();
      applyLetterFilterFromPoint(event.clientX, event.clientY, true);
    }, { passive: false });
    document.addEventListener('pointerup', () => { activeLetterPicker = null; });
    document.addEventListener('pointercancel', () => { activeLetterPicker = null; });
    backdrop.addEventListener('click', () => closeAll());
    document.addEventListener('keydown', (event) => {
      if(event.key === 'Escape'){
        if(findOpenPicker()){
          event.preventDefault();
          event.stopPropagation();
        }
        closeAll();
        return;
      }
      const openPicker = findOpenPicker();
      if(!openPicker) return;
      const target = event.target;
      const isTextTarget = target?.matches?.('input, textarea, select') || target?.isContentEditable;
      if(isTextTarget || event.altKey || event.ctrlKey || event.metaKey) return;
      if(event.key.length === 1 && /^[a-z0-9]$/i.test(event.key)){
        if(applyKeyboardLetterFilter(openPicker, event.key)) event.preventDefault();
        return;
      }
      if((event.key === 'Enter' || event.key === ' ')
        && !target?.closest?.('.trackPicker__option, .numberPicker__option, .trackPicker__trigger')
        && resetLetterFilterToAll(openPicker)){
        event.preventDefault();
      }
    });
    window.addEventListener('resize', () => closeAll());

    window.MKWT_LOUNGE_PICKERS = {
      refreshAll(){
        for(const picker of pickers.values()) refreshPicker(picker);
      },
      refreshTrackPickers(){
        for(const picker of pickers.values()){
          if(picker.kind === 'track') refreshPicker(picker);
        }
      },
      closeAll
    };
  }
  function getSuggestedTrackStats(limit = 6){
    const used = currentTrackSet();
    const trackRows = aggregateTrackStats('tracks')
      .filter((stat) => COURSE_TRACKS.includes(stat.track))
      .filter((stat) => Number(stat.count || 0) >= SUGGESTION_MIN_PLAYS)
      .filter((stat) => !used.has(stat.track))
      .map((stat) => ({ ...stat, kind: 'track', label: stat.track }));
    const routeRows = PAGE_CONFIG.playerCount === 24 && PAGE_CONFIG.allowIntermissionRoutes
      ? aggregateTrackStats('im_routes')
        .map((stat) => {
          const route = parseRouteLabel(stat.track);
          return route ? { ...stat, ...route, kind: 'route', label: stat.track } : null;
        })
        .filter(Boolean)
        .filter((stat) => Number(stat.count || 0) >= SUGGESTION_MIN_PLAYS)
        .filter((stat) => !entryAlreadyUsed({
          track: stat.label,
          raceKind: 'intermission',
          intermissionStart: stat.start,
          intermissionEnd: stat.end,
        }))
      : [];
    return [...trackRows, ...routeRows]
      .sort((a, b) => {
        const avgDiff = Number(b.avg || 0) - Number(a.avg || 0);
        if(avgDiff !== 0) return avgDiff;
        const countDiff = Number(b.count || 0) - Number(a.count || 0);
        if(countDiff !== 0) return countDiff;
        return String(a.label || a.track || '').localeCompare(String(b.label || b.track || ''), 'de');
      })
      .slice(0, limit);
  }
  function isIntermissionSuggestionMode(){
    return PAGE_CONFIG.playerCount === 24 && PAGE_CONFIG.allowIntermissionRoutes && state.entryMode === 'intermission';
  }
  function getSuggestedIntermissionRouteStats(limit = 3){
    return aggregateTrackStats('im_routes')
      .map((stat) => {
        const route = parseRouteLabel(stat.track);
        return route ? { ...stat, ...route, kind: 'route', label: stat.track } : null;
      })
      .filter(Boolean)
      .filter((stat) => Number(stat.count || 0) > 0)
      .filter((stat) => !entryAlreadyUsed({
        track: stat.label,
        raceKind: 'intermission',
        intermissionStart: stat.start,
        intermissionEnd: stat.end,
      }))
      .sort((a, b) => {
        const avgDiff = Number(b.avg || 0) - Number(a.avg || 0);
        if(avgDiff !== 0) return avgDiff;
        const countDiff = Number(b.count || 0) - Number(a.count || 0);
        if(countDiff !== 0) return countDiff;
        return String(a.label || '').localeCompare(String(b.label || ''), 'de');
      })
      .slice(0, limit);
  }
  function updateTrackSuggestionButton(){
    const btn = $('btnTrackSuggestions');
    if(!btn) return;
    const show = state.entryMode === 'track' || isIntermissionSuggestionMode();
    const label = btn.querySelector('.compareAction__label');
    if(label) label.textContent = isIntermissionSuggestionMode() ? 'Suggested Routes' : 'Suggested Tracks';
    btn.hidden = !show;
    btn.disabled = !show;
    btn.title = isIntermissionSuggestionMode() ? 'Suggested intermission routes' : 'Suggested tracks';
    btn.setAttribute('aria-label', isIntermissionSuggestionMode() ? 'Suggested intermission routes' : 'Suggested tracks');
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  function closeTrackSuggestionDialog(){
    const dialog = $('trackSuggestionDialog');
    if(!dialog) return;
    if(typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  function suggestedRouteVisualHtml(start, end){
    return `
      <span class="suggestTrackRoute" title="${escapeHtml(routeLabel(start, end))}">
        <span class="suggestTrackRoute__node">${trackIconMarkup(start, 'suggestTrackRouteIcon')}</span>
        <span class="suggestTrackRoute__arrow" aria-hidden="true">&rarr;</span>
        <span class="suggestTrackRoute__node">${trackIconMarkup(end, 'suggestTrackRouteIcon')}</span>
      </span>`;
  }
  function selectSuggestedIntermissionRoute(start, end){
    const routeStart = String(start || '').trim();
    const routeEnd = String(end || '').trim();
    if(!PAGE_CONFIG.allowIntermissionRoutes || !routeStart || !routeEnd) return false;
    setEntryMode('intermission');
    const startSel = $('intermissionStartSelect');
    const endSel = $('intermissionEndSelect');
    if(!startSel || !endSel) return false;
    startSel.value = routeStart;
    startSel.dispatchEvent(new Event('change', { bubbles: true }));
    if(endSel.value !== routeEnd && !Array.from(endSel.options || []).some((option) => option.value === routeEnd)){
      const { startToEnds } = buildRouteMaps();
      fillRouteSelect(
        endSel,
        'Intermission end',
        Array.from(startToEnds.get(routeStart) || []),
        routeEnd,
        (value) => getDestinyGroup(routeStart, value)
      );
    }
    endSel.value = routeEnd;
    endSel.dispatchEvent(new Event('change', { bubbles: true }));
    updatePlayedOptionHints();
    try{ window.MKWT_LOUNGE_PICKERS?.refreshAll?.(); }catch(e){}
    return true;
  }
  function renderTrackSuggestionDialog(){
    const body = $('trackSuggestionGrid');
    const meta = $('trackSuggestionMeta');
    if(!body || !meta) return;
    const title = $('trackSuggestionDialog')?.querySelector('h3');
    if(title) title.textContent = isIntermissionSuggestionMode() ? 'Suggested Intermissions' : 'Suggested Tracks';
    body.classList.toggle('suggestTrackGrid--routes', isIntermissionSuggestionMode());
    if(isIntermissionSuggestionMode()){
      const rows = getSuggestedIntermissionRouteStats(3);
      meta.textContent = 'Top intermission routes from your saved 24p Mogis. Each suggestion shows start and end track.';
      if(!rows.length){
        body.innerHTML = '<div class="muted">No saved intermission routes to suggest yet.</div>';
        return;
      }
      body.innerHTML = rows.map((stat, index) => {
        const titleText = `${index + 1}. ${stat.label} - ${stat.avg.toFixed(2)} AVG - ${stat.count} plays`;
        const aria = `${stat.label}, average ${stat.avg.toFixed(2)} points, ${stat.count} plays`;
        return `
          <button class="suggestTrackButton suggestTrackButton--route" data-suggest-route-start="${escapeHtml(stat.start)}" data-suggest-route-end="${escapeHtml(stat.end)}" type="button" title="${escapeHtml(titleText)}" aria-label="${escapeHtml(aria)}">
            ${suggestedRouteVisualHtml(stat.start, stat.end)}
          </button>`;
      }).join('');
      return;
    }
    const explanation = PAGE_CONFIG.playerCount === 24 && PAGE_CONFIG.allowIntermissionRoutes
      ? `Available tracks and intermission routes are suggested from your individual performance. Each pick needs at least ${SUGGESTION_MIN_PLAYS} saved races before it can appear.`
      : `Available tracks you have not picked yet are suggested from your individual performance. A track needs at least ${SUGGESTION_MIN_PLAYS} saved races before it can appear.`;
    if(state.entryMode !== 'track'){
      meta.textContent = 'Suggestions are only available for 3-lap track picks.';
      body.innerHTML = '<div class="muted">Switch back to Track mode to see suggested tracks.</div>';
      return;
    }
    const rows = getSuggestedTrackStats(6);
    meta.textContent = explanation;
    if(!rows.length){
      body.innerHTML = '<div class="muted">No eligible suggested tracks yet.</div>';
      return;
    }
    body.innerHTML = rows.map((stat, index) => {
      const label = stat.label || stat.track || '';
      const isRoute = stat.kind === 'route';
      const title = `${index + 1}. ${label} - ${stat.avg.toFixed(2)} AVG - ${stat.count} plays`;
      const aria = `${label}, average ${stat.avg.toFixed(2)} points, ${stat.count} plays`;
      const attrs = isRoute
        ? `data-suggest-route-start="${escapeHtml(stat.start)}" data-suggest-route-end="${escapeHtml(stat.end)}"`
        : `data-suggest-track="${escapeHtml(stat.track)}"`;
      return `
        <button class="suggestTrackButton${isRoute ? ' suggestTrackButton--route' : ''}" ${attrs} type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(aria)}">
          ${isRoute ? suggestedRouteVisualHtml(stat.start, stat.end) : trackIconMarkup(stat.track, 'suggestTrackIcon')}
        </button>`;
    }).join('');
  }
  function openTrackSuggestionDialog(){
    renderTrackSuggestionDialog();
    const dialog = $('trackSuggestionDialog');
    if(!dialog) return;
    if(typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function entryAlreadyUsed(entry){
    const races = state.current?.races || [];
    if(use12pIntermissionNoRepickRule() && (isPlainIntermissionTrack(entry?.track) || entry?.raceKind === 'intermission')){
      return false;
    }
    if(use24pRouteRepickRules()){
      const key = entryKeyForRaceLike(entry);
      return !!key && races.some((race) => entryKeyForRaceLike(race) === key);
    }
    if(entry?.raceKind === 'intermission'){
      return races.some((race) => {
        if(!isIntermissionRace(race)) return false;
        const route = routePartsFromRace(race);
        return route.start === entry.intermissionStart && route.end === entry.intermissionEnd;
      });
    }
    return races.some((race) => !isIntermissionRace(race) && String(race?.track || '') === String(entry?.track || ''));
  }
  function entryKeyForRaceLike(race){
    if(is12pIntermissionNoRepickRace(race) || (use12pIntermissionNoRepickRule() && race?.raceKind === 'intermission')){
      return '';
    }
    if(use24pRouteRepickRules()){
      if(isIntermissionRace(race) || race?.raceKind === 'intermission'){
        const route = routePartsFromRace(race);
        return routeRepickKey(route.start, route.end) || `intermission|${String(race?.track || '').trim()}`;
      }
      return trackRepickKey(race?.track) || `track|${String(race?.track || '').trim()}`;
    }
    if(isIntermissionRace(race) || race?.raceKind === 'intermission'){
      const route = routePartsFromRace(race);
      return route.start && route.end ? `intermission|${route.start}|${route.end}` : `intermission|${String(race?.track || '').trim()}`;
    }
    return `track|${String(race?.track || '').trim()}`;
  }
  function applyAutoRepicks(races){
    const seen = new Set();
    return (races || []).map((race) => {
      const key = entryKeyForRaceLike(race);
      const repick = !!key && seen.has(key);
      if(key) seen.add(key);
      return { ...race, repick };
    });
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
    fillRouteSelect(startSel, 'Intermission start', starts, '');
    fillRouteSelect(endSel, 'Intermission end', ends, '');
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

    const fillStarts = (list, selected) => fillRouteSelect(startSel, 'Intermission start', list, selected);
    const fillEnds = (list, selected, start) => fillRouteSelect(
      endSel,
      'Intermission end',
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
  function scoreToneClassForTotal(total, hasData = true){
    const value = Number(total);
    if(!hasData || !Number.isFinite(value)) return '';
    const breakEven = AVG_GAIN_THRESHOLD * 12;
    if(value < 40) return 'scoreTone--darkred';
    if(value < 64) return 'scoreTone--red';
    if(value < breakEven - 6) return 'scoreTone--orange';
    if(value <= Math.ceil(breakEven)) return 'scoreTone--yellow';
    if(value < 95) return 'scoreTone--green';
    if(value < 135) return 'scoreTone--blue';
    return 'scoreTone--lightblue';
  }
  function scoreToneClassForAvg(avg, hasData = true){
    return scoreToneClassForTotal(Number(avg) * 12, hasData);
  }
  function clearScoreToneClasses(el){
    if(!el) return;
    el.classList.remove('avgGood', 'avgBad', ...SCORE_TONE_CLASSES);
  }
  function scoreToneColorsFromAvg(avg, hasData = true){
    const tone = scoreToneClassForAvg(avg, hasData);
    return SCORE_TONE_COLORS[tone] || { fill: 'rgba(255,255,255,.13)', border: getCss('--border') };
  }
  function toneAvgElement(el, avg, hasData){
    if(!el) return;
    clearScoreToneClasses(el);
    if(!hasData) {
      el.removeAttribute('title');
      return;
    }
    const tone = scoreToneClassForAvg(avg, hasData);
    if(tone) el.classList.add(tone);
    el.title = `Break-even AVG: ${AVG_GAIN_THRESHOLD.toFixed(2)}`;
  }
  function toneTotalElement(el, total, hasData){
    if(!el) return;
    clearScoreToneClasses(el);
    if(!hasData){
      el.removeAttribute('title');
      return;
    }
    const tone = scoreToneClassForTotal(total, hasData);
    if(tone) el.classList.add(tone);
    el.title = `Break-even total: ${(AVG_GAIN_THRESHOLD * 12).toFixed(0)}`;
  }
  function avgToneClass(avg, hasData){
    if(!hasData) return '';
    return scoreToneClassForAvg(avg, hasData);
  }
  function makeFreshMogi(){
    return {
      created_at: currentTs(),
      playerCount: PAGE_CONFIG.playerCount,
      races: [],
      totalPoints: 0,
      disconnects: 0,
      saved: false,
      loungeFormatTag: '',
      loungeFormatSource: '',
      loungeTier: '',
      statsExcluded: false,
      mkcentralFormatTag: '',
      mkcentralEventId: '',
      mkcentralEventName: '',
      mkcentralTableUrl: '',
      mkcentralTier: '',
      mkcentralTableRank: null,
      mkcentralTableScore: null,
      mkcentralMmrBefore: null,
      mkcentralMmrDelta: null,
      mkcentralMmrAfter: null,
      mkcentralEventCreatedAt: '',
      mkcentralSyncedAt: '',
      mkcentralSyncStatus: '',
      mkcentralConfidenceLabel: '',
      mkcentralConfidenceNote: '',
      mkcentralConfidenceScore: null,
    };
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
    if(candidate.formatTag) parts.push(`${candidate.formatTag} tag`);
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
  function mkcentralEventCreatedAt(event){
    return event?.table_verified_at || event?.created_at || event?.table_created_at || '';
  }
  function sessionMkcentralEventId(session){
    return String(session?.mkcentralEventId || session?.mkcentral_event_id || '').trim();
  }
  function mkcentralNullableNumber(value){
    const n = finiteNumber(value);
    return n == null ? null : n;
  }
  function mkcentralMatchFromSession(session, statusOverride = ''){
    const eventId = sessionMkcentralEventId(session);
    if(!eventId) return null;
    return {
      event_id: eventId,
      event_name: String(session?.mkcentralEventName || session?.mkcentral_event_name || ''),
      format: sessionMkcentralFormatTag(session),
      tier: String(session?.mkcentralTier || session?.mkcentral_tier || ''),
      table_url: String(session?.mkcentralTableUrl || session?.mkcentral_table_url || ''),
      table_rank: mkcentralNullableNumber(session?.mkcentralTableRank ?? session?.mkcentral_table_rank),
      table_score: mkcentralNullableNumber(session?.mkcentralTableScore ?? session?.mkcentral_table_score),
      mmr_before: mkcentralNullableNumber(session?.mkcentralMmrBefore ?? session?.mkcentral_mmr_before),
      mmr_delta: mkcentralNullableNumber(session?.mkcentralMmrDelta ?? session?.mkcentral_mmr_delta),
      mmr_after: mkcentralNullableNumber(session?.mkcentralMmrAfter ?? session?.mkcentral_mmr_after),
      created_at: String(session?.mkcentralEventCreatedAt || session?.mkcentral_event_created_at || ''),
      synced_at: String(session?.mkcentralSyncedAt || session?.mkcentral_synced_at || ''),
      sync_status: statusOverride || String(session?.mkcentralSyncStatus || session?.mkcentral_sync_status || 'linked'),
      confidence_label: String(session?.mkcentralConfidenceLabel || session?.mkcentral_confidence_label || 'Saved'),
      confidence_note: String(session?.mkcentralConfidenceNote || session?.mkcentral_confidence_note || 'Saved account link'),
      confidence_score: mkcentralNullableNumber(session?.mkcentralConfidenceScore ?? session?.mkcentral_confidence_score),
    };
  }
  function buildMkcentralMatchFromCandidate(candidate, status = 'matched'){
    const event = candidate?.event || {};
    const eventFormatTag = normalizeLoungeFormatTag(candidate?.eventFormatTag || mkcentralGroupValue(event, 'format'));
    const score = finiteNumber(candidate?.score);
    return {
      event_id: String(event?.id || ''),
      event_name: event?.event || event?.event_name || event?.raw_event || '',
      format: eventFormatTag || mkcentralGroupValue(event, 'format'),
      tier: mkcentralGroupValue(event, 'tier'),
      table_url: event?.table_url || '',
      table_rank: finiteNumber(event?.table_rank),
      table_score: finiteNumber(event?.table_score),
      mmr_before: finiteNumber(event?.mmr_before),
      mmr_delta: finiteNumber(event?.mmr_delta),
      mmr_after: finiteNumber(event?.mmr_after),
      created_at: mkcentralEventCreatedAt(event),
      synced_at: currentTs(),
      sync_status: status,
      confidence_label: score == null ? (status === 'linked' ? 'Saved' : 'Medium') : mkcentralConfidenceLabel(score),
      confidence_note: candidate ? buildMkcentralNote(candidate) : 'Saved account link',
      confidence_score: score,
      format_mismatch: !!candidate?.formatMismatch,
    };
  }
  function buildLinkedMkcentralMatch(session, originalIndex, event){
    const eventTime = eventTimestamp(mkcentralEventCreatedAt(event));
    const sessionTime = eventTimestamp(sessionFinishedAt(session));
    const hoursDiff = sessionTime && eventTime ? Math.abs(sessionTime - eventTime) / 3600000 : Infinity;
    const tableScore = finiteNumber(event?.table_score);
    const hasScore = tableScore != null;
    const pointsDiff = hasScore ? Math.abs(sessionTotalPoints(session) - tableScore) : Infinity;
    const localFormatTag = sessionFormatTag(session);
    const eventFormatTag = normalizeLoungeFormatTag(mkcentralGroupValue(event, 'format'));
    const status = (hasScore && pointsDiff > 10) || hoursDiff > 72 ? 'mismatch' : 'matched';
    const candidate = {
      score: mkcentralPointsScore(pointsDiff, hasScore) + mkcentralTimeScore(hoursDiff) + 12,
      pointsDiff,
      hoursDiff,
      sessionOrder: 0,
      eventOrder: 0,
      eventTime,
      formatTag: localFormatTag,
      eventFormatTag,
      formatMismatch: !!(localFormatTag && eventFormatTag && localFormatTag !== eventFormatTag),
      originalIndex,
      event,
    };
    const match = buildMkcentralMatchFromCandidate(candidate, status);
    match.confidence_note = status === 'mismatch'
      ? `Check sync: ${buildMkcentralNote(candidate)}`
      : `Linked by table ID. ${buildMkcentralNote(candidate)}`;
    return match;
  }
  function mkcentralSessionPatchFromMatch(match){
    return {
      mkcentralEventId: String(match?.event_id || ''),
      mkcentralEventName: String(match?.event_name || ''),
      mkcentralTableUrl: String(match?.table_url || ''),
      mkcentralTier: String(match?.tier || ''),
      mkcentralTableRank: mkcentralNullableNumber(match?.table_rank),
      mkcentralTableScore: mkcentralNullableNumber(match?.table_score),
      mkcentralMmrBefore: mkcentralNullableNumber(match?.mmr_before),
      mkcentralMmrDelta: mkcentralNullableNumber(match?.mmr_delta),
      mkcentralMmrAfter: mkcentralNullableNumber(match?.mmr_after),
      mkcentralEventCreatedAt: String(match?.created_at || ''),
      mkcentralSyncStatus: String(match?.sync_status || 'matched'),
      mkcentralConfidenceLabel: String(match?.confidence_label || ''),
      mkcentralConfidenceNote: String(match?.confidence_note || ''),
      mkcentralConfidenceScore: mkcentralNullableNumber(match?.confidence_score),
    };
  }
  function mkcentralDbPatchFromSession(session){
    return {
      mkcentral_event_id: sessionMkcentralEventId(session) || null,
      mkcentral_event_name: session?.mkcentralEventName || null,
      mkcentral_table_url: session?.mkcentralTableUrl || null,
      mkcentral_tier: session?.mkcentralTier || null,
      mkcentral_table_rank: mkcentralNullableNumber(session?.mkcentralTableRank),
      mkcentral_table_score: mkcentralNullableNumber(session?.mkcentralTableScore),
      mkcentral_mmr_before: mkcentralNullableNumber(session?.mkcentralMmrBefore),
      mkcentral_mmr_delta: mkcentralNullableNumber(session?.mkcentralMmrDelta),
      mkcentral_mmr_after: mkcentralNullableNumber(session?.mkcentralMmrAfter),
      mkcentral_event_created_at: session?.mkcentralEventCreatedAt || null,
      mkcentral_synced_at: session?.mkcentralSyncedAt || null,
      mkcentral_sync_status: session?.mkcentralSyncStatus || null,
      mkcentral_confidence_label: session?.mkcentralConfidenceLabel || null,
      mkcentral_confidence_note: session?.mkcentralConfidenceNote || null,
      mkcentral_confidence_score: mkcentralNullableNumber(session?.mkcentralConfidenceScore),
    };
  }
  function syncSessionMkcentralMetaToCloud(session){
    if(!isCloud() || !session?.cloud_id) return;
    const payload = {
      lounge_format_tag: sessionFormatTag(session) || null,
      lounge_format_source: sessionFormatSource(session) || null,
      lounge_tier: sessionTierTag(session) || null,
      mkcentral_format_tag: sessionMkcentralFormatTag(session) || null,
      ...mkcentralDbPatchFromSession(session),
    };
    updateCloudMogi(session, payload).catch((err) => {
      console.warn('[lounge] mkcentral meta cloud sync failed', err);
    });
  }
  function applyMkcentralMatchToSession(sessionIndex, match){
    const session = state.sessions[sessionIndex];
    if(!session || isNonLoungeSession(session)) return;
    let changed = false;
    const tag = normalizeLoungeFormatTag(match?.format);
    if(tag && sessionMkcentralFormatTag(session) !== tag){
      session.mkcentralFormatTag = tag;
      changed = true;
    }
    const currentTag = sessionFormatTag(session);
    const source = sessionFormatSource(session);
    if(tag && ((!currentTag && source !== 'manual') || source === 'mkcentral')){
      if(currentTag !== tag) changed = true;
      session.loungeFormatTag = tag;
      session.loungeFormatSource = 'mkcentral';
    }
    const tier = normalizeLoungeTierTag(match?.tier);
    const currentTier = sessionTierTag(session);
    if(tier && !currentTier){
      session.loungeTier = tier;
      changed = true;
    }
    const patch = mkcentralSessionPatchFromMatch(match);
    for(const [key, value] of Object.entries(patch)){
      const current = key.toLowerCase().includes('rank') || key.toLowerCase().includes('score') || key.toLowerCase().includes('mmr')
        ? mkcentralNullableNumber(session[key])
        : String(session[key] || '');
      const next = key.toLowerCase().includes('rank') || key.toLowerCase().includes('score') || key.toLowerCase().includes('mmr')
        ? mkcentralNullableNumber(value)
        : String(value || '');
      if(current !== next){
        session[key] = value;
        changed = true;
      }
    }
    if(changed){
      session.mkcentralSyncedAt = currentTs();
      session.updated_at = currentTs();
      syncSessionMkcentralMetaToCloud(session);
    }
    match.synced_at = session.mkcentralSyncedAt || match.synced_at || '';
  }
  function buildMkcentralCandidate(sessionItem, sessionOrder, event, eventOrder, sessionTotal, eventTotal){
    if(sessionItem.raceCount < 12) return null;

    const eventTime = event.__time || eventTimestamp(mkcentralEventCreatedAt(event));
    const hoursDiff = sessionItem.time && eventTime ? Math.abs(sessionItem.time - eventTime) / 3600000 : Infinity;
    if(hoursDiff > 72) return null;

    const tableScore = finiteNumber(event.table_score);
    const hasScore = tableScore != null;
    const pointsDiff = hasScore ? Math.abs(sessionItem.points - tableScore) : Infinity;
    const localFormatTag = normalizeLoungeFormatTag(sessionItem.formatTag);
    const eventFormatTag = normalizeLoungeFormatTag(mkcentralGroupValue(event, 'format'));
    const syncedFormatTag = normalizeLoungeFormatTag(sessionItem.mkcentralFormatTag);
    const allowSyncedOverride = syncedFormatTag && eventFormatTag && syncedFormatTag === eventFormatTag;
    if(localFormatTag && eventFormatTag && localFormatTag !== eventFormatTag && !allowSyncedOverride) return null;

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
    const formatScore = localFormatTag && eventFormatTag && localFormatTag === eventFormatTag ? 8 : 0;
    const score = pointsScore + timeScore + orderScore + sameDayScore + formatScore;
    if(score < 78) return null;

    return {
      score,
      pointsDiff,
      hoursDiff,
      sessionOrder,
      eventOrder,
      eventTime,
      formatTag: localFormatTag,
      eventFormatTag,
      formatMismatch: !!(localFormatTag && eventFormatTag && localFormatTag !== eventFormatTag),
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
      const match = buildMkcentralMatchFromCandidate(candidate, 'matched');
      applyMkcentralMatchToSession(candidate.originalIndex, match);
      state.mkcentralMatches[candidate.originalIndex] = match;
    });
  }
  function computeMkcentralMatches(){
    state.mkcentralMatches = {};
    const payload = readMkcentralPayload();
    if(!state.sessions.length) return;

    const hasPayload = !!(payload && Array.isArray(payload.events));
    const events = (payload?.events || [])
      .filter((event) => String(event?.id || '').trim())
      .filter((event) => !/^placement$/i.test(String(event?.event || '').trim()))
      .map((event, originalEventIndex) => ({
        ...event,
        __originalEventIndex: originalEventIndex,
        __time: eventTimestamp(mkcentralEventCreatedAt(event)),
      }))
      .sort((a, b) => a.__time - b.__time || String(a.id).localeCompare(String(b.id)));

    const eventsById = new Map(events.map((event) => [String(event.id), event]));
    const usedEventIds = new Set();
    const linkedSessionIndices = new Set();
    state.sessions.forEach((session, originalIndex) => {
      if(isNonLoungeSession(session)) return;
      const storedMatch = mkcentralMatchFromSession(session, hasPayload ? 'stale' : 'linked');
      if(!storedMatch) return;
      const event = eventsById.get(storedMatch.event_id);
      const match = event ? buildLinkedMkcentralMatch(session, originalIndex, event) : storedMatch;
      if(event) applyMkcentralMatchToSession(originalIndex, match);
      state.mkcentralMatches[originalIndex] = match;
      usedEventIds.add(storedMatch.event_id);
      linkedSessionIndices.add(originalIndex);
    });

    if(!events.length) return;

    const sessions = state.sessions
      .map((session, originalIndex) => ({
        session,
        originalIndex,
        time: eventTimestamp(sessionFinishedAt(session)),
        points: sessionTotalPoints(session),
        raceCount: sessionRaceCount(session),
        formatTag: sessionFormatTag(session),
        mkcentralFormatTag: sessionMkcentralFormatTag(session),
      }))
      .filter((item) => !isNonLoungeSession(item.session))
      .filter((item) => !linkedSessionIndices.has(item.originalIndex))
      .sort((a, b) => a.time - b.time || a.originalIndex - b.originalIndex);

    const unmatchedEvents = events.filter((event) => !usedEventIds.has(String(event.id)));

    if(!unmatchedEvents.length || !sessions.length) return;

    assignMkcentralMatchesWithOrder(sessions, unmatchedEvents);
  }
  function renderSessionMkcentral(match, session){
    if(!match) return '';
    const bits = [];
    const localTag = sessionFormatTag(session);
    const localTier = sessionTierTag(session);
    const matchFormat = normalizeLoungeFormatTag(match.format) || (match.format && match.format !== 'Other' ? match.format : '');
    const matchTier = normalizeLoungeTierTag(match.tier);
    const syncStatus = String(match.sync_status || '').toLowerCase();
    const statusLabel = syncStatus === 'mismatch' || syncStatus === 'stale'
      ? 'Check sync'
      : (syncStatus === 'linked' ? 'Saved match' : 'Matched');
    if(matchFormat) bits.push(`<span class="sessionMkcDatum">${escapeHtml(matchFormat)}</span>`);
    if(localTag && (!matchFormat || normalizeLoungeFormatTag(matchFormat) !== localTag)) bits.push(formatTagPillHtml(localTag, 'sessionMkcDatum sessionFormatTag'));
    if(matchTier) bits.push(`<span class="sessionMkcDatum">${escapeHtml(matchTier)}</span>`);
    if(localTier && localTier !== matchTier) bits.push(tierTagPillHtml(localTier, 'sessionMkcDatum sessionFormatTag sessionTierTag'));
    if(Number.isFinite(match.table_rank)) bits.push(`<span class="sessionMkcDatum">Place #${escapeHtml(String(match.table_rank))}</span>`);
    if(Number.isFinite(match.table_score)) bits.push(`<span class="sessionMkcDatum">${escapeHtml(String(match.table_score))} pts</span>`);
    if(Number.isFinite(match.mmr_delta)) bits.push(`<span class="sessionMkcDatum ${mkcentralGainClass(match.mmr_delta)}">${escapeHtml(fmtDelta(match.mmr_delta))}</span>`);
    if(Number.isFinite(match.mmr_after)) bits.push(`<span class="sessionMkcDatum">${escapeHtml(fmtMmr(match.mmr_after))} MMR</span>`);

    return `
      <div class="sessionMkcBlock">
        <div class="sessionMkcTop">
          <div class="sessionMkcState">
            <span class="sessionMkcMatched" title="${escapeHtml(match.confidence_note || '')}">${escapeHtml(statusLabel)}</span>
          </div>
          ${match.table_url ? `<a class="sessionMkcTableBtn" href="${escapeHtml(match.table_url)}" target="_blank" rel="noopener noreferrer">Open table</a>` : ''}
        </div>
        ${bits.length ? `<div class="sessionMkcMeta">${bits.join('')}</div>` : ''}
      </div>`;
  }
  function renderSessionMkcentralUnmatched(session, sessionIndex = null){
    const localTag = sessionFormatTag(session);
    const localTier = sessionTierTag(session);
    const nonLounge = localTag === NON_LOUNGE_FORMAT_TAG;
    const statsExcluded = sessionStatsExcluded(session);
    const toggleTitle = statsExcluded
      ? 'Hidden from all stats. The Mogi stays saved in history.'
      : 'Included in all stats.';
    const nonLoungeTag = Number.isInteger(sessionIndex)
      ? `<button class="sessionMkcMatched sessionMkcMatched--nonLounge sessionStatsToggle${statsExcluded ? ' is-excluded' : ''}" type="button" data-session-stats-toggle="${sessionIndex}" aria-pressed="${statsExcluded ? 'false' : 'true'}" title="${escapeHtml(toggleTitle)}"><span>${escapeHtml(NON_LOUNGE_FORMAT_TAG)}</span><span class="sessionStatsToggle__state">${statsExcluded ? 'Stats off' : 'Stats on'}</span></button>`
      : `<span class="sessionMkcMatched sessionMkcMatched--nonLounge">${escapeHtml(NON_LOUNGE_FORMAT_TAG)}</span>`;
    return `
      <div class="sessionMkcBlock sessionMkcBlock--unmatched${nonLounge ? ' sessionMkcBlock--nonLounge' : ''}">
        <div class="sessionMkcTop">
          <div class="sessionMkcState">
            ${nonLounge
              ? nonLoungeTag
              : '<button class="sessionMkcMatched sessionMkcMatched--unmatched" type="button" data-session-unsynced-info>Not synced</button>'}
          </div>
        </div>
        ${(!nonLounge && localTag) || localTier ? `<div class="sessionMkcMeta">${[
          localTag && !nonLounge ? formatTagPillHtml(localTag, 'sessionMkcDatum sessionFormatTag') : '',
          tierTagPillHtml(localTier, 'sessionMkcDatum sessionFormatTag sessionTierTag')
        ].filter(Boolean).join('')}</div>` : ''}
      </div>`;
  }
  function dbRaceToLocal(row){
    const dbKind = String(row.race_kind || '');
    return {
      id: row.id,
      cloud_id: row.id,
      race_number: row.race_number,
      track: row.track,
      raceKind: dbKind || (row.intermission_start && row.intermission_end ? 'intermission' : 'track'),
      intermissionStart: row.intermission_start || null,
      intermissionEnd: row.intermission_end || null,
      lobbySize: row.lobby_size,
      placement: row.placement,
      points: row.points,
      disconnect: !!row.disconnect,
      repick: false,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  function dbMogiToLocal(row, races){
    const localRaces = applyAutoRepicks((races || []).map(dbRaceToLocal).sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0)));
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
      loungeFormatTag: normalizeLoungeFormatTag(row.lounge_format_tag || ''),
      loungeFormatSource: String(row.lounge_format_source || '').trim(),
      loungeTier: normalizeLoungeTierTag(row.lounge_tier || ''),
      statsExcluded: !!row.stats_excluded,
      mkcentralFormatTag: normalizeLoungeFormatTag(row.mkcentral_format_tag || ''),
      mkcentralEventId: String(row.mkcentral_event_id || ''),
      mkcentralEventName: String(row.mkcentral_event_name || ''),
      mkcentralTableUrl: String(row.mkcentral_table_url || ''),
      mkcentralTier: String(row.mkcentral_tier || ''),
      mkcentralTableRank: finiteNumber(row.mkcentral_table_rank),
      mkcentralTableScore: finiteNumber(row.mkcentral_table_score),
      mkcentralMmrBefore: finiteNumber(row.mkcentral_mmr_before),
      mkcentralMmrDelta: finiteNumber(row.mkcentral_mmr_delta),
      mkcentralMmrAfter: finiteNumber(row.mkcentral_mmr_after),
      mkcentralEventCreatedAt: String(row.mkcentral_event_created_at || ''),
      mkcentralSyncedAt: String(row.mkcentral_synced_at || ''),
      mkcentralSyncStatus: String(row.mkcentral_sync_status || ''),
      mkcentralConfidenceLabel: String(row.mkcentral_confidence_label || ''),
      mkcentralConfidenceNote: String(row.mkcentral_confidence_note || ''),
      mkcentralConfidenceScore: finiteNumber(row.mkcentral_confidence_score),
      saved: row.status === 'completed',
    };
  }
  function raceToDbPayload(race, mogiId, raceNumber){
    const baseKind = race.raceKind === 'intermission' ? 'intermission' : 'track';
    return {
      mogi_id: mogiId,
      user_id: loungeSession.user.id,
      race_number: raceNumber,
      track: race.track,
      race_kind: baseKind,
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
    state.sessions = (read(STORAGE_SESSIONS, []) || []).map((session) => ({
      ...session,
      loungeFormatTag: sessionFormatTag(session),
      loungeFormatSource: sessionFormatSource(session),
      loungeTier: sessionTierTag(session),
      statsExcluded: normalizeStatsExcluded(session),
      mkcentralFormatTag: sessionMkcentralFormatTag(session),
      mkcentralEventId: sessionMkcentralEventId(session),
      mkcentralEventName: String(session?.mkcentralEventName || session?.mkcentral_event_name || ''),
      mkcentralTableUrl: String(session?.mkcentralTableUrl || session?.mkcentral_table_url || ''),
      mkcentralTier: String(session?.mkcentralTier || session?.mkcentral_tier || ''),
      mkcentralTableRank: finiteNumber(session?.mkcentralTableRank ?? session?.mkcentral_table_rank),
      mkcentralTableScore: finiteNumber(session?.mkcentralTableScore ?? session?.mkcentral_table_score),
      mkcentralMmrBefore: finiteNumber(session?.mkcentralMmrBefore ?? session?.mkcentral_mmr_before),
      mkcentralMmrDelta: finiteNumber(session?.mkcentralMmrDelta ?? session?.mkcentral_mmr_delta),
      mkcentralMmrAfter: finiteNumber(session?.mkcentralMmrAfter ?? session?.mkcentral_mmr_after),
      mkcentralEventCreatedAt: String(session?.mkcentralEventCreatedAt || session?.mkcentral_event_created_at || ''),
      mkcentralSyncedAt: String(session?.mkcentralSyncedAt || session?.mkcentral_synced_at || ''),
      mkcentralSyncStatus: String(session?.mkcentralSyncStatus || session?.mkcentral_sync_status || ''),
      mkcentralConfidenceLabel: String(session?.mkcentralConfidenceLabel || session?.mkcentral_confidence_label || ''),
      mkcentralConfidenceNote: String(session?.mkcentralConfidenceNote || session?.mkcentral_confidence_note || ''),
      mkcentralConfidenceScore: finiteNumber(session?.mkcentralConfidenceScore ?? session?.mkcentral_confidence_score),
      races: applyAutoRepicks(session?.races || [])
    }));
    state.current = read(STORAGE_CURRENT, null) || makeFreshMogi();
    if (!Array.isArray(state.current.races)) state.current = makeFreshMogi();
    else {
      state.current.loungeFormatTag = sessionFormatTag(state.current);
      state.current.loungeFormatSource = sessionFormatSource(state.current);
      state.current.loungeTier = sessionTierTag(state.current);
      state.current.statsExcluded = normalizeStatsExcluded(state.current);
      state.current.mkcentralFormatTag = sessionMkcentralFormatTag(state.current);
      state.current.mkcentralEventId = sessionMkcentralEventId(state.current);
      state.current.races = applyAutoRepicks(state.current.races || []);
    }
  }
  function persist(){
    if (isCloud()) return;
    write(STORAGE_CURRENT, state.current);
    write(STORAGE_SESSIONS, state.sessions);
  }
  async function loadCloud(){
    if (!isCloud()) return;
    const uid = loungeSession.user.id;

    const { data: mogis, error: mogiError } = await loungeClient
      .from('lounge_mogis')
      .select(LOUNGE_MOGI_SELECT)
      .eq('user_id', uid)
      .eq('player_count', PAGE_CONFIG.playerCount)
      .order('created_at', { ascending: false });
    if (mogiError) throw mogiError;

    const mogiIds = (mogis || []).map(mogi => mogi.id).filter(Boolean);
    if (!mogiIds.length) {
      state.current = makeFreshMogi();
      state.sessions = [];
      state.sessionPage = 1;
      state.openSessionDetails = {};
      state.openSessionTagEditors = {};
      state.sessionTagDrafts = {};
      state.sessionTierDrafts = {};
      state.editingSessionIndex = null;
      return;
    }

    const { data: races, error: raceError } = await loungeClient
      .from('lounge_races')
      .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at')
      .eq('user_id', uid)
      .in('mogi_id', mogiIds)
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
    state.openSessionTagEditors = {};
    state.sessionTagDrafts = {};
    state.sessionTierDrafts = {};
    state.editingSessionIndex = null;
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
        stats_excluded: false,
      })
      .select(LOUNGE_MOGI_SELECT)
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
    sel.innerHTML = '<option value="">Result</option>' + Array.from({length:lobby}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    if(prev && prev <= lobby) sel.value = String(prev);
    updateEntryTagButtons();
  }
  function renderCurrent(){
    const races = state.current.races || [];
    const statRaces = races.filter(r => !r.disconnect);
    const statPoints = statRaces.reduce((a,r)=>a + Number(r.points || 0), 0);
    const currentAvg = statRaces.length ? (statPoints / statRaces.length) : 0;
    const totalPoints = races.reduce((a,r)=>a + Number(r.points || 0), 0);
    const isComplete = races.length >= 12;
    const sumScore = $('sumScore');
    if(sumScore){
      sumScore.innerHTML = `<span>${escapeHtml(String(totalPoints))}p</span><span class="avgDivider">/</span><span>${escapeHtml(statRaces.length ? currentAvg.toFixed(2) : '0.00')} avg</span>`;
      clearScoreToneClasses(sumScore);
      const tone = scoreToneClassForAvg(currentAvg, statRaces.length > 0);
      if(tone) sumScore.classList.add(tone);
      if(statRaces.length > 0) sumScore.title = `Break-even AVG: ${AVG_GAIN_THRESHOLD.toFixed(2)}`;
      else sumScore.removeAttribute('title');
    }
    $('sumRemain').textContent = String(Math.max(0, 12 - races.length));
    const saveBtn = $('btnSaveRace');
    const dcBtn = $('btnDisconnect');
    const tagButtons = document.querySelectorAll('[data-lobby-tag], #btnDisconnect');
    if(saveBtn){
      saveBtn.textContent = isComplete ? 'Confirm Mogi' : 'Add';
      saveBtn.title = isComplete ? 'Open the result confirmation again' : '';
    }
    tagButtons.forEach((btn) => {
      btn.disabled = isComplete;
      if(isComplete) btn.title = 'Confirm this Mogi before changing race tags';
      else if(btn !== dcBtn) btn.removeAttribute('title');
    });
    if(!isComplete && dcBtn) updateEntryTagButtons();
    updatePlayedOptionHints();
    updateTrackSuggestionButton();
    if($('trackSuggestionDialog')?.open) renderTrackSuggestionDialog();

    const body = $('currentMogiBody');
    const currentCard = body?.closest('.foldCard');
    if(currentCard) currentCard.hidden = !races.length;
    if(!races.length){
      if(body) body.innerHTML = '<div class="muted">No races tracked yet.</div>';
      return;
    }
    if(!body) return;
    body.innerHTML = renderSessionRaceStrip(races, null, { source: 'current' });
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
    const label = state.trackSortKey === 'count' ? 'Most played' : 'Performance';
    const arrow = state.trackSortDir === 'desc' ? 'v' : '^';
    const value = $('trackPerfFilterValue');
    if(value) value.textContent = `${label} ${arrow}`;
    [
      ['avg', $('optTrackSortAvg')],
      ['count', $('optTrackSortCount')]
    ].forEach(([key, btn]) => {
      if(!btn) return;
      const active = state.trackSortKey === key;
      btn.classList.toggle('active', active);
      const meta = btn.querySelector('.chartFilterItemMeta');
      if(meta) meta.textContent = active ? arrow : '';
    });
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
    const meta = $('trackModeMeta');
    if(meta) meta.textContent = trackChartTitle();
    document.querySelectorAll('[data-track-mode]').forEach((btn) => {
      const active = btn.dataset.trackMode === state.trackChartMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function cycleTrackChartMode(direction){
    if(!PAGE_CONFIG.allowIntermissionRoutes) return;
    const modes = ['tracks', 'im_destiny', 'im_routes'];
    const index = modes.indexOf(state.trackChartMode);
    const nextIndex = direction === 'left'
      ? (index + 1) % modes.length
      : (index - 1 + modes.length) % modes.length;
    setTrackChartMode(modes[nextIndex]);
  }
  function placementModeLabel(mode = state.placementMode){
    if(mode === 'tracks') return 'Tracks';
    if(mode === 'intermission') return 'Intermission';
    return 'All';
  }
  function updatePlacementModeButtons(){
    const value = $('placementFilterValue');
    if(value) value.textContent = placementModeLabel();
    const meta = $('placementModeMeta');
    if(meta) meta.textContent = placementModeLabel();
    document.querySelectorAll('[data-placement-mode]').forEach((btn) => {
      const active = btn.dataset.placementMode === state.placementMode;
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
      if(sessionStatsExcluded(session)) continue;
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
  function loungeTierStatsSessions(){
    return (state.sessions || []).filter((session) => !sessionStatsExcluded(session) && sessionTierTag(session));
  }
  function mostPlayedLoungeTier(sessions = loungeTierStatsSessions()){
    const rows = new Map();
    for(const session of sessions){
      const tag = sessionTierTag(session);
      if(!tag) continue;
      const row = rows.get(tag) || { tag, count: 0, races: 0, points: 0 };
      row.count += 1;
      row.races += sessionRaceCount(session);
      row.points += sessionTotalPoints(session);
      rows.set(tag, row);
    }
    return Array.from(rows.values()).sort((a, b) => {
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if(countDiff !== 0) return countDiff;
      const raceDiff = Number(b.races || 0) - Number(a.races || 0);
      if(raceDiff !== 0) return raceDiff;
      return compareLoungeTierTags(a.tag, b.tag);
    })[0]?.tag || '';
  }
  function loungeTierRangeTags(centerTag){
    const normalized = normalizeLoungeTierTag(centerTag);
    if(!normalized) return [];
    const known = LOUNGE_TIER_TAGS.slice();
    const index = known.indexOf(normalized);
    if(index < 0) return [normalized];
    return [known[index - 1], normalized, known[index + 1]].filter(Boolean);
  }
  function loungeTierStatsTrackRows(sessions){
    const buckets = new Map();
    for(const session of sessions || []){
      for(const race of session.races || []){
        if(race?.disconnect) continue;
        const label = displayRaceLabel(race);
        if(!label) continue;
        const points = Number(race.points || 0);
        const row = buckets.get(label) || { track: label, count: 0, total: 0, avg: 0 };
        row.count += 1;
        row.total += points;
        row.avg = row.count ? row.total / row.count : 0;
        buckets.set(label, row);
      }
    }
    return Array.from(buckets.values());
  }
  function pickLoungeTierTrackStat(rows, direction = 'best'){
    const sorted = (rows || [])
      .filter((row) => Number(row?.count || 0) >= LOUNGE_TIER_STATS_TRACK_MIN_PLAYS)
      .slice()
      .sort((a, b) => {
      const avgDiff = direction === 'worst'
        ? Number(a.avg || 0) - Number(b.avg || 0)
        : Number(b.avg || 0) - Number(a.avg || 0);
      if(avgDiff !== 0) return avgDiff;
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if(countDiff !== 0) return countDiff;
      return String(a.track || '').localeCompare(String(b.track || ''), 'de');
    });
    return sorted[0] || null;
  }
  function buildLoungeTierStats(label, sessions, options = {}){
    const list = Array.isArray(sessions) ? sessions : [];
    const statRaces = list.flatMap((session) => (session.races || []).filter((race) => !race.disconnect));
    const raceCount = statRaces.length;
    const totalPoints = statRaces.reduce((sum, race) => sum + Number(race.points || 0), 0);
    const avgRace = raceCount ? totalPoints / raceCount : null;
    const avgMogi = avgRace == null ? null : avgRace * 12;
    const sessionPointTotals = list.map(sessionTotalPoints).filter((points) => Number.isFinite(points));
    const trackRows = loungeTierStatsTrackRows(list);
    return {
      label,
      tier: options.tier || '',
      focus: options.focus === true,
      mogis: list.length,
      races: raceCount,
      dcCount: list.reduce((sum, session) => sum + (session.races || []).filter((race) => race.disconnect).length, 0),
      totalPoints,
      avgRace,
      avgMogi,
      highest: sessionPointTotals.length ? Math.max(...sessionPointTotals) : null,
      lowest: sessionPointTotals.length ? Math.min(...sessionPointTotals) : null,
      uniqueTracks: trackRows.length,
      bestTrack: pickLoungeTierTrackStat(trackRows, 'best'),
      worstTrack: pickLoungeTierTrackStat(trackRows, 'worst'),
    };
  }
  function loungeTierStatsNumber(value, digits = 1){
    if(value == null || !Number.isFinite(Number(value))) return '-';
    const num = Number(value);
    return Number.isInteger(num) ? String(num) : num.toFixed(digits);
  }
  function loungeTierStatsPointsAvg(stat){
    return stat?.races ? `${loungeTierStatsNumber(stat.avgMogi, 0)} / ${loungeTierStatsNumber(stat.avgRace, 2)}` : '-';
  }
  function loungeTierStatsMetricHtml(label, value, tone = ''){
    return `
      <div class="loungeTierStatsMetric">
        <span>${escapeHtml(label)}</span>
        <b class="${escapeHtml(tone)}">${escapeHtml(value)}</b>
      </div>`;
  }
  function loungeTierStatsTrackHtml(label, row){
    const name = row?.track || 'Not enough data';
    const meta = row ? `${row.count} plays - ${loungeTierStatsNumber(row.avg, 2)} avg` : `Needs ${LOUNGE_TIER_STATS_TRACK_MIN_PLAYS} plays on one track.`;
    return `
      <div class="loungeTierStatsTrack">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(name)}</b>
        <small>${escapeHtml(meta)}</small>
      </div>`;
  }
  function loungeTierStatsCardHtml(stat, extraClass = ''){
    const hasData = stat.races > 0;
    const tone = avgToneClass(stat.avgRace || 0, hasData);
    return `
      <article class="loungeTierStatsCard${stat.focus ? ' is-focus' : ''}${extraClass ? ` ${extraClass}` : ''}">
        <header class="loungeTierStatsCard__head">
          <h4>${escapeHtml(stat.label)}</h4>
          ${stat.focus ? '<span>Most played</span>' : ''}
        </header>
        <div class="loungeTierStatsMetrics">
          ${loungeTierStatsMetricHtml('Mogis', String(stat.mogis || 0))}
          ${loungeTierStatsMetricHtml('Races', String(stat.races || 0))}
          ${loungeTierStatsMetricHtml('Points / AVG', loungeTierStatsPointsAvg(stat), tone)}
          ${loungeTierStatsMetricHtml('Tracks', String(stat.uniqueTracks || 0))}
          ${loungeTierStatsMetricHtml('Highest', loungeTierStatsNumber(stat.highest))}
          ${loungeTierStatsMetricHtml('Lowest', loungeTierStatsNumber(stat.lowest))}
          ${loungeTierStatsMetricHtml('DCs', String(stat.dcCount || 0))}
        </div>
        <div class="loungeTierStatsTracks">
          ${loungeTierStatsTrackHtml('Best track', stat.bestTrack)}
          ${loungeTierStatsTrackHtml('Worst track', stat.worstTrack)}
        </div>
      </article>`;
  }
  function renderLoungeTierStatsDialog(){
    const body = $('loungeTierStatsBody');
    const meta = $('loungeTierStatsMeta');
    if(!body) return;
    const tierSessions = loungeTierStatsSessions();
    const centerTag = mostPlayedLoungeTier(tierSessions);
    if(!centerTag){
      if(meta) meta.textContent = 'No saved Mogis with a tier tag yet.';
      body.innerHTML = '<div class="muted">Save or tag Mogis with a Lounge tier to see tier stats.</div>';
      return;
    }
    const rangeTags = loungeTierRangeTags(centerTag);
    const rangeTagSet = new Set(rangeTags);
    const sessionsForTag = (tag) => tierSessions.filter((session) => sessionTierTag(session) === tag);
    const combinedSessions = tierSessions.filter((session) => rangeTagSet.has(sessionTierTag(session)));
    const combined = buildLoungeTierStats('Selected tiers total', combinedSessions);
    const cards = rangeTags.map((tag) => buildLoungeTierStats(tag, sessionsForTag(tag), {
      tier: tag,
      focus: tag === centerTag,
    }));
    if(meta){
      meta.textContent = `Most played: ${centerTag}. Showing one tier above and below where available.`;
    }
    body.innerHTML = `
      <div class="loungeTierStatsSummary">
        ${loungeTierStatsCardHtml(combined, 'loungeTierStatsCard--summary')}
      </div>
      <div class="loungeTierStatsGrid">
        ${cards.map((stat) => loungeTierStatsCardHtml(stat)).join('')}
      </div>`;
  }
  function closeLoungeTierStatsDialog(){
    const dialog = $('loungeTierStatsDialog');
    if(!dialog) return;
    if(typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  function openLoungeTierStatsDialog(){
    renderLoungeTierStatsDialog();
    const dialog = $('loungeTierStatsDialog');
    if(!dialog) return;
    if(typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function scoreBreakEvenForLobby(lobbySize){
    const arr = SCORE_MAP[Number(lobbySize)] || SCORE_MAP[PAGE_CONFIG.playerCount] || SCORE_MAP[12];
    return arr.length ? arr.reduce((sum, value) => sum + Number(value || 0), 0) / arr.length : AVG_GAIN_THRESHOLD;
  }
  function forecastTrackLabelForRace(race){
    if(isIntermissionRace(race)){
      const { end } = routePartsFromRace(race);
      if(end) return canonicalTrackName(end);
    }
    const track = canonicalTrackName(race?.track || displayRaceLabel(race));
    return track || '';
  }
  function buildSessionForecastStats(){
    const buckets = new Map();
    for(const session of state.sessions || []){
      if(sessionStatsExcluded(session)) continue;
      for(const race of (session.races || [])){
        if(race?.disconnect) continue;
        const track = forecastTrackLabelForRace(race);
        const points = Number(race?.points);
        if(!track || !Number.isFinite(points)) continue;
        const row = buckets.get(track) || { count: 0, sum: 0 };
        row.count += 1;
        row.sum += points;
        buckets.set(track, row);
      }
    }
    for(const row of buckets.values()){
      row.avg = row.count ? row.sum / row.count : 0;
    }
    return buckets;
  }
  function computeSessionTrackForecast(session, forecastStats){
    const races = (session?.races || []).filter((race) => !race?.disconnect && forecastTrackLabelForRace(race));
    if(!races.length) return null;
    let projectedSum = 0;
    let breakEvenSum = 0;
    let actualSum = 0;
    let knownCount = 0;
    let neutralCount = 0;
    for(const race of races){
      const breakEven = scoreBreakEvenForLobby(race?.lobbySize || PAGE_CONFIG.playerCount);
      const track = forecastTrackLabelForRace(race);
      const stat = forecastStats.get(track);
      breakEvenSum += breakEven;
      actualSum += Number(race?.points || 0);
      if(stat && Number(stat.count || 0) >= SESSION_FORECAST_MIN_PLAYS){
        projectedSum += Number(stat.avg || 0);
        knownCount += 1;
      } else {
        projectedSum += breakEven;
        neutralCount += 1;
      }
    }
    const raceCount = races.length;
    const projectedAvg = projectedSum / raceCount;
    const projectedTotal = projectedAvg * raceCount;
    const breakEvenAvg = breakEvenSum / raceCount;
    const breakEvenTotal = breakEvenAvg * raceCount;
    const actualAvg = actualSum / raceCount;
    const forecastEpsilon = 0.005;
    const pool = projectedAvg < breakEvenAvg - forecastEpsilon ? 'unfavorable' : (projectedAvg > breakEvenAvg + forecastEpsilon ? 'favorable' : 'neutral');
    const actualGood = actualAvg >= breakEvenAvg;
    const beatProjection = actualAvg >= projectedAvg;
    const intro = pool === 'unfavorable'
      ? 'Track pool was unfavorable for you'
      : (pool === 'favorable' ? 'Track pool looked favorable' : 'Track pool looked neutral');
    let outcome = actualGood ? 'and you scored above break-even.' : 'and the Mogi landed below break-even.';
    if(pool === 'unfavorable'){
      outcome = actualGood
        ? 'but you still scored above break-even.'
        : (beatProjection ? 'you beat that projection, but stayed below break-even.' : 'the low score was likely partly track-driven.');
    } else if(pool === 'favorable'){
      outcome = beatProjection
        ? 'and you beat the projection.'
        : (actualGood ? 'but you landed below projection while still above break-even.' : 'but the Mogi landed below expectation.');
    }
    return {
      actualTotal: actualSum,
      actualAvg,
      projectedTotal,
      projectedAvg,
      breakEvenTotal,
      breakEvenAvg,
      knownCount,
      neutralCount,
      raceCount,
      pool,
      message: `${intro}: projected ${projectedAvg.toFixed(2)} avg, ${outcome}`,
    };
  }
  function renderSessionTrackForecastButton(forecast, originalIndex){
    if(!forecast) return '';
    return `
      <button class="compareAction compareAction--sm sessionForecastToggle" type="button" data-session-forecast-toggle="${originalIndex}" aria-haspopup="dialog" aria-controls="sessionForecastDialog" title="Track favorability forecast">
        <span class="compareAction__label">Track Forecast</span>
        <span class="sessionForecastToggle__value">${forecast.projectedAvg.toFixed(2)} avg</span>
      </button>`;
  }
  function sessionForecastPerformanceText(forecast){
    if(!forecast) return '';
    if(forecast.pool === 'unfavorable'){
      if(forecast.actualAvg >= forecast.breakEvenAvg) return 'The track pool was below break-even for you, but this Mogi still finished above break-even.';
      if(forecast.actualAvg >= forecast.projectedAvg) return 'The track pool was below break-even. You beat that projection, but the Mogi still stayed under break-even.';
      return 'The track pool was below break-even, so the low score was likely partly track-driven.';
    }
    if(forecast.pool === 'favorable'){
      if(forecast.actualAvg >= forecast.projectedAvg) return 'The track pool looked good for you, and your result beat the projection.';
      if(forecast.actualAvg >= forecast.breakEvenAvg) return 'The track pool looked good for you. You stayed above break-even, but under the projection.';
      return 'The track pool looked good for you, but the Mogi landed below both projection and break-even.';
    }
    return forecast.actualAvg >= forecast.breakEvenAvg
      ? 'The track pool was close to neutral, and your result finished above break-even.'
      : 'The track pool was close to neutral, but your result finished below break-even.';
  }
  function renderSessionForecastDialogBody(forecast){
    if(!forecast) return '<div class="muted">No forecast available for this Mogi.</div>';
    const neutralText = forecast.neutralCount
      ? `${forecast.neutralCount} map${forecast.neutralCount === 1 ? '' : 's'} had fewer than ${SESSION_FORECAST_MIN_PLAYS} saved races, so they counted as break-even.`
      : `Every map used here had at least ${SESSION_FORECAST_MIN_PLAYS} saved races.`;
    return `
      <div class="sessionForecastDialogStats">
        <div><span>Actual</span><b>${Math.round(forecast.actualTotal)}p</b><em>${forecast.actualAvg.toFixed(2)} avg</em></div>
        <div><span>Projected</span><b>${Math.round(forecast.projectedTotal)}p</b><em>${forecast.projectedAvg.toFixed(2)} avg</em></div>
        <div><span>Break-even</span><b>${Math.round(forecast.breakEvenTotal)}p</b><em>${forecast.breakEvenAvg.toFixed(2)} avg</em></div>
      </div>
      <p>The projected value is your expected average from the played maps: each map uses your saved average points on that map.</p>
      <p>${escapeHtml(neutralText)}</p>
      <p><strong>${escapeHtml(sessionForecastPerformanceText(forecast))}</strong></p>`;
  }
  function openSessionForecastDialog(originalIndex){
    const session = state.sessions[originalIndex];
    const dialog = $('sessionForecastDialog');
    const body = $('sessionForecastDialogBody');
    const meta = $('sessionForecastDialogMeta');
    if(!session || !dialog || !body) return;
    const forecast = computeSessionTrackForecast(session, buildSessionForecastStats());
    if(meta) meta.textContent = fmtDate(session.completed_at || session.created_at);
    body.innerHTML = renderSessionForecastDialogBody(forecast);
    if(typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function closeSessionForecastDialog(){
    const dialog = $('sessionForecastDialog');
    if(!dialog) return;
    if(typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  function aggregatePlacementStats(mode = 'all'){
    const maxPlacement = PAGE_CONFIG.playerCount;
    const counts = Array.from({ length: maxPlacement }, (_, i) => ({ placement: i + 1, count: 0 }));
    for(const session of state.sessions){
      if(sessionStatsExcluded(session)) continue;
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
      if(sessionStatsExcluded(session)) continue;
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
        <div class="statBox"><div class="statLabel">AVG points</div><div class="statValue ${avgToneClass(stat.avg, stat.count > 0)}">${stat.count ? stat.avg.toFixed(2) : '-'}</div></div>
        <div class="statBox"><div class="statLabel">Times played</div><div class="statValue">${stat.count}</div></div>
      </div>`;
  }
  function sessionRaceVisualHtml(race){
    if(isIntermissionRace(race)){
      const { start, end } = routePartsFromRace(race);
      if(start && end){
        return `
          <span class="sessionRaceRoute" aria-hidden="true">
            <span class="sessionRaceRoute__node">${trackIconMarkup(start, 'sessionRaceIcon')}</span>
            <span class="sessionRaceRoute__arrow">&rarr;</span>
            <span class="sessionRaceRoute__node sessionRaceRoute__node--end">${trackIconMarkup(end, 'sessionRaceIcon')}</span>
          </span>`;
      }
    }
    return `<span class="sessionRaceVisual">${trackIconMarkup(displayRaceLabel(race), 'sessionRaceIcon')}</span>`;
  }
  function sessionRaceTagsText(race){
    const tags = [];
    const lobby = Number(race?.lobbySize || PAGE_CONFIG.playerCount);
    if(PAGE_CONFIG.allowLobbyTags && lobby !== PAGE_CONFIG.playerCount) tags.push(`${lobby}p`);
    if(race?.disconnect) tags.push('DC');
    if(race?.repick) tags.push('Repick');
    return tags.join(' · ');
  }
  function renderSessionRaceStrip(races, sessionIndex, options = {}){
    const source = options.source === 'current' ? 'current' : 'saved';
    const editAttr = source === 'current'
      ? 'data-current-race-edit="true"'
      : `data-session-race-edit="${sessionIndex}"`;
    return `
      <div class="sessionRaceStripWrap">
        <div class="sessionRaceStrip" aria-label="Session races">
          ${(races || []).map((race, raceIndex) => {
            const label = displayRaceLabel(race) || `Race ${raceIndex + 1}`;
            const tags = sessionRaceTagsText(race);
            const placement = ordinalLabel(race?.placement);
            const points = Number(race?.points || 0);
            return `
              <button class="sessionRaceTile ${raceRowClass(race)}" type="button" ${editAttr} data-race-index="${raceIndex}" title="${escapeHtml(`${label} - ${placement} - ${points} pts${tags ? ` - ${tags}` : ''}`)}">
                <span class="sessionRaceTile__number">${raceIndex + 1}</span>
                ${sessionRaceVisualHtml(race)}
                <span class="sessionRaceTile__result">${escapeHtml(placement)} · ${escapeHtml(String(points))}p</span>
                ${tags ? `<span class="sessionRaceTile__tags">${escapeHtml(tags)}</span>` : '<span class="sessionRaceTile__tags">&nbsp;</span>'}
              </button>`;
          }).join('')}
        </div>
      </div>`;
  }
  function renderSessionTagEditor(session, sessionIndex, mkcMatch){
    const selected = draftSessionFormatTag(sessionIndex, session);
    const selectedTier = draftSessionTierTag(sessionIndex, session);
    const warning = sessionTagMismatchWithMkcentral(session, mkcMatch);
    const choices = pageLoungeFormatTags();
    const tierChoices = collectLoungeTierTags();
    return `
      <div class="sessionTagEditor" data-session-tag-editor="${sessionIndex}">
        <div class="sessionTagEditorSection">
          <div class="sessionTagEditorTitle">Format</div>
          <div class="sessionTagEditorGrid">
            ${choices.map((tag) => {
              const label = tag;
              const active = selected === tag;
              const extra = tag === NON_LOUNGE_FORMAT_TAG ? 'sessionTagChoice--nonLounge' : (isSquadQueueFormatTag(tag) ? 'sessionTagChoice--sq' : '');
              return `<button class="sessionTagChoice ${extra}${active ? ' active' : ''}" type="button" data-session-set-tag="${sessionIndex}" data-format-tag="${escapeHtml(tag)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="sessionTagEditorSection">
          <div class="sessionTagEditorTitle">Tier</div>
          <div class="sessionTagEditorGrid sessionTagEditorGrid--tier">
            <button class="sessionTagChoice sessionTierChoice${!selectedTier ? ' active' : ''}" type="button" data-session-set-tier="${sessionIndex}" data-tier-tag="" aria-pressed="${!selectedTier ? 'true' : 'false'}">No Tier</button>
            ${tierChoices.map((tag) => {
              const active = selectedTier === tag;
              return `<button class="sessionTagChoice sessionTierChoice${active ? ' active' : ''}" type="button" data-session-set-tier="${sessionIndex}" data-tier-tag="${escapeHtml(tag)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(tag)}</button>`;
            }).join('')}
          </div>
        </div>
        ${warning ? `<button class="sessionTagWarning" type="button" data-session-tag-warning="${sessionIndex}">Tag differs from MKCentral</button>` : ''}
      </div>`;
  }
  function draftSessionFormatTag(index, session){
    const key = String(index);
    if(Object.prototype.hasOwnProperty.call(state.sessionTagDrafts, key)){
      return normalizeLoungeFormatTag(state.sessionTagDrafts[key]);
    }
    return sessionFormatTag(session);
  }
  function draftSessionTierTag(index, session){
    const key = String(index);
    if(Object.prototype.hasOwnProperty.call(state.sessionTierDrafts, key)){
      return normalizeLoungeTierTag(state.sessionTierDrafts[key]);
    }
    return sessionTierTag(session);
  }
  function openSessionTagEditor(index, session){
    state.openSessionTagEditors[index] = true;
    state.sessionTagDrafts[index] = sessionFormatTag(session);
    state.sessionTierDrafts[index] = sessionTierTag(session);
    state.openSessionDetails[index] = true;
  }
  function closeSessionTagEditor(index){
    delete state.openSessionTagEditors[index];
    delete state.sessionTagDrafts[index];
    delete state.sessionTierDrafts[index];
  }
  async function setSavedSessionFormatTag(index, tag, tierTag = null){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    const normalized = normalizeLoungeFormatTag(tag);
    const normalizedTier = normalizeLoungeTierTag(tierTag);
    const mkcMatch = state.mkcentralMatches[index] || null;
    const mkcTag = sessionMkcentralFormatTag(session, mkcMatch);
    session.loungeFormatTag = normalized;
    session.loungeTier = normalizedTier;
    session.loungeFormatSource = normalized ? 'manual' : (mkcTag ? 'manual' : '');
    if(normalized !== NON_LOUNGE_FORMAT_TAG) session.statsExcluded = false;
    if(mkcTag) session.mkcentralFormatTag = mkcTag;
    session.updated_at = currentTs();
    try{
      if(isCloud() && session.cloud_id){
        setStatus('Saving tag...', true, false);
        await updateCloudMogi(session, {
          lounge_format_tag: normalized || null,
          lounge_format_source: sessionFormatSource(session) || null,
          lounge_tier: normalizedTier || null,
          stats_excluded: sessionStatsExcluded(session),
          mkcentral_format_tag: sessionMkcentralFormatTag(session) || null,
        });
      }
      const label = [normalized || 'No format', normalizedTier || 'No Tier'].join(' / ');
      const mismatch = sessionTagMismatchWithMkcentral(session, mkcMatch);
      setStatus(mismatch ? `${label} saved. Check MKCentral format.` : `${label} saved.`, !mismatch);
      closeSessionTagEditor(index);
      refresh();
    }catch(e){
      setStatus('Tag save failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  async function toggleSavedSessionStatsExcluded(index){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    if(!isNonLoungeSession(session)){
      setStatus('Only Non-Lounge Mogis can be toggled for stats.', false);
      return;
    }
    const next = !sessionStatsExcluded(session);
    session.statsExcluded = next;
    session.updated_at = currentTs();
    try{
      if(isCloud() && session.cloud_id){
        setStatus('Saving stats toggle...', true, false);
        await updateCloudMogi(session, { stats_excluded: next });
      }
      setStatus(
        next
          ? 'Non-Lounge hidden from all stats.'
          : 'Non-Lounge included in stats again.',
        true
      );
      refresh();
    }catch(e){
      session.statsExcluded = !next;
      setStatus('Stats toggle failed: ' + (e?.message || e), false);
      console.error(e);
      refresh();
    }
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
    const forecastStats = buildSessionForecastStats();

    wrap.innerHTML = pageItems.map((s, idx) => {
      const points = sessionTotalPoints(s);
      const count = (s.races || []).length;
      const dcs = (s.races || []).filter(r => r.disconnect).length;
      const avgValue = count ? (points / count) : 0;
      const avg = count ? avgValue.toFixed(2) : '0.00';
      const scoreTone = scoreToneClassForAvg(avgValue, count > 0);
      const flags = [];
      if(count !== 12) flags.push({ label: `${count}/12 races`, tone: '' });
      if(dcs > 0) flags.push({ label: `${dcs} DC${dcs === 1 ? '' : 's'}`, tone: 'sessionFlag--dc' });
      const originalIndex = s.__originalIndex;
      const mkcMatch = state.mkcentralMatches[originalIndex] || null;
      const isOpen = !!state.openSessionDetails[originalIndex];
      const tagEditorOpen = !!state.openSessionTagEditors[originalIndex];
      const tagWarning = sessionTagMismatchWithMkcentral(s, mkcMatch);
      const tagActionLabel = tagEditorOpen ? 'Save tag' : 'Change tag';
      const forecast = computeSessionTrackForecast(s, forecastStats);
      return `
        <div class="sessionCard ${isOpen ? 'is-open' : ''}" data-session-card="${originalIndex}" tabindex="0" role="button" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="sessionDetails-${originalIndex}">
          <div class="sessionCardHead">
            <div class="sessionCardMain">
              <div class="sessionTitle">${escapeHtml(fmtDate(s.completed_at || s.created_at))}</div>
              ${mkcMatch ? renderSessionMkcentral(mkcMatch, s) : renderSessionMkcentralUnmatched(s, originalIndex)}
              <div class="sessionScoreBlock ${scoreTone}" aria-label="Session points and average">
                <div class="sessionScoreRow">
                  <div class="sessionScoreValue ${scoreTone}"><span>${points}</span><span class="avgDivider">/</span><span>${avg}</span></div>
                  ${renderSessionTrackForecastButton(forecast, originalIndex)}
                </div>
              </div>
              ${flags.length ? `<div class="sessionSummaryFlags">${flags.map(flag => `<span class="sessionFlag ${flag.tone}">${escapeHtml(flag.label)}</span>`).join('')}</div>` : ''}
            </div>
          </div>
          <div class="sessionDetails" id="sessionDetails-${originalIndex}"${isOpen ? '' : ' hidden'}>
            ${renderSessionRaceStrip(s.races || [], originalIndex)}
            ${tagEditorOpen ? renderSessionTagEditor(s, originalIndex, mkcMatch) : ''}
            <div class="sessionDetailActions">
              <button class="sessionActionBtn sessionActionBtn--tag${tagEditorOpen ? ' active' : ''}${tagWarning ? ' sessionActionBtn--warning' : ''}" type="button" data-session-tag-action="${originalIndex}" title="${escapeHtml(tagActionLabel)}">${escapeHtml(tagActionLabel)}</button>
              ${tagWarning ? `<button class="sessionTagWarning sessionTagWarning--compact" type="button" data-session-tag-warning="${originalIndex}">Check tag</button>` : ''}
              <button class="sessionActionBtn sessionActionBtn--delete" type="button" data-session-delete="${originalIndex}" title="Delete Mogi">Delete Mogi</button>
            </div>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-session-card]').forEach(card => {
      const toggle = () => {
        const id = Number(card.getAttribute('data-session-card'));
        if(!Number.isInteger(id) || id < 0) return;
        const nextOpen = !state.openSessionDetails[id];
        state.openSessionDetails[id] = nextOpen;
        if(!nextOpen) closeSessionTagEditor(id);
        renderSessions();
      };
      card.addEventListener('click', (event) => {
        if(event.target.closest('button, a, input, select, textarea, label')) return;
        toggle();
      });
      card.addEventListener('keydown', (event) => {
        if(event.key !== 'Enter' && event.key !== ' ') return;
        if(event.target.closest('button, a, input, select, textarea, label')) return;
        event.preventDefault();
        toggle();
      });
    });

    wrap.querySelectorAll('[data-session-forecast-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-forecast-toggle'));
        if(!Number.isInteger(originalIndex) || originalIndex < 0) return;
        openSessionForecastDialog(originalIndex);
      });
    });

    wrap.querySelectorAll('[data-session-stats-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-stats-toggle'));
        if(!Number.isInteger(originalIndex) || originalIndex < 0) return;
        toggleSavedSessionStatsExcluded(originalIndex);
      });
    });

    wrap.querySelectorAll('[data-session-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-delete'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        openDeleteMogiConfirm(originalIndex);
      });
    });

    wrap.querySelectorAll('[data-session-tag-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-tag-action'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        const session = state.sessions[originalIndex];
        if(!session) return;
        if(state.openSessionTagEditors[originalIndex]){
          setSavedSessionFormatTag(
            originalIndex,
            draftSessionFormatTag(originalIndex, session),
            draftSessionTierTag(originalIndex, session)
          );
          return;
        }
        openSessionTagEditor(originalIndex, session);
        renderSessions();
      });
    });

    wrap.querySelectorAll('[data-session-set-tier]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-set-tier'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        state.sessionTierDrafts[originalIndex] = normalizeLoungeTierTag(btn.getAttribute('data-tier-tag') || '');
        state.openSessionTagEditors[originalIndex] = true;
        state.openSessionDetails[originalIndex] = true;
        renderSessions();
      });
    });

    wrap.querySelectorAll('[data-session-set-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-set-tag'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        state.sessionTagDrafts[originalIndex] = normalizeLoungeFormatTag(btn.getAttribute('data-format-tag') || '');
        state.openSessionTagEditors[originalIndex] = true;
        state.openSessionDetails[originalIndex] = true;
        renderSessions();
      });
    });

    wrap.querySelectorAll('[data-session-tag-warning]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-tag-warning'));
        const session = Number.isInteger(originalIndex) ? state.sessions[originalIndex] : null;
        if(!session) return;
        setStatus(sessionTagMismatchMessage(session, state.mkcentralMatches[originalIndex] || null), false);
      });
    });

    wrap.querySelectorAll('[data-session-race-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const originalIndex = Number(btn.getAttribute('data-session-race-edit'));
        const raceIndex = Number(btn.getAttribute('data-race-index'));
        if (!Number.isInteger(originalIndex) || originalIndex < 0) return;
        if (!Number.isInteger(raceIndex) || raceIndex < 0) return;
        openSavedRaceEdit(originalIndex, raceIndex);
      });
    });
    wrap.querySelectorAll('[data-session-unsynced-info]').forEach(btn => {
      btn.addEventListener('click', () => {
        setStatus('Sync in Lounge Stats to match this Mogi with MKCentral.', true);
      });
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
    const colors = sortedStats.map(s => scoreToneColorsFromAvg(s.avg, s.count > 0).fill);
    const borders = sortedStats.map(s => scoreToneColorsFromAvg(s.avg, s.count > 0).border);
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
  function updateCompareButton(){
    const btn = $('btnCompareWorldWide');
    if(!btn) return;
    btn.classList.toggle('active', state.showCompareChart);
  }
  function closeCompareDialog(){
    state.showCompareChart = false;
    updateCompareButton();
    const dialog = $('loungeCompareDialog');
    if(dialog?.open) dialog.close();
  }
  async function renderModeCompareChart(){
    const dialog = $('loungeCompareDialog');
    const panel = $('loungeComparePanel');
    const meta = $('loungeCompareMeta');
    const canvas = $('chartModeCompareLounge');
    const notesWrap = $('loungeCompareNotes');
    if(!panel || !meta || !canvas) return;
    if(dialog && !dialog.open){
      try{ dialog.showModal(); }catch(e){}
    }
    if(!window.MKWTModeCompare){
      meta.textContent = 'Comparison helper unavailable.';
      if(notesWrap) notesWrap.innerHTML = '';
      if(state.compareChart) state.compareChart.destroy();
      state.compareChart = null;
      return;
    }

    function renderCompareNotes(compareRows){
      if(!notesWrap) return;
      notesWrap.innerHTML = '';
      const notes = window.MKWTModeCompare?.buildComparisonNotes?.(compareRows, {
        primaryLabel: PAGE_CONFIG.title,
        secondaryLabel: 'World Wides',
        gapThreshold: 10,
        limit: 6,
      }) || [];
      if(!notes.length){
        const div = document.createElement('div');
        div.className = 'modeCompareNote muted';
        div.textContent = 'No major outliers right now. Shared maps look fairly balanced between both modes.';
        notesWrap.appendChild(div);
        return;
      }
      for(const note of notes){
        const div = document.createElement('div');
        div.className = 'modeCompareNote';
        const strong = document.createElement('b');
        strong.textContent = note.track;
        div.appendChild(strong);
        div.appendChild(document.createTextNode(`: ${note.text.replace(`${note.track}: `, '')}`));
        notesWrap.appendChild(div);
      }
    }

    const loungeRows = window.MKWTModeCompare.aggregateLoungeTrackRowsFromSessions(state.sessions || []);
    if(!loungeRows.length){
      meta.textContent = 'No saved Lounge track races yet. Save a few Mogis first.';
      if(notesWrap) notesWrap.innerHTML = '';
      if(state.compareChart) state.compareChart.destroy();
      state.compareChart = null;
      return;
    }

    meta.textContent = 'Loading World Wide comparison...';
    const worldRows = await window.MKWTModeCompare.loadWorldWideTrackRows({
      isGuest: !isCloud(),
      supabaseClient: loungeClient,
      session: loungeSession,
    });
    if(!worldRows.length){
      meta.textContent = 'No World Wide track data with placements found yet.';
      if(notesWrap) notesWrap.innerHTML = '';
      if(state.compareChart) state.compareChart.destroy();
      state.compareChart = null;
      return;
    }

    const compareRows = window.MKWTModeCompare.buildRankComparisonRows(loungeRows, worldRows, {
      primaryLabel: PAGE_CONFIG.title,
      secondaryLabel: 'World Wides',
      limit: 30,
      minCount: 10,
    });
    if(!compareRows.length){
      meta.textContent = `No shared tracks yet with at least 10 plays in both ${PAGE_CONFIG.title} and World Wides.`;
      if(notesWrap) notesWrap.innerHTML = '';
      if(state.compareChart) state.compareChart.destroy();
      state.compareChart = null;
      return;
    }

    const labels = compareRows.map(row => row.track);
    const loungeData = compareRows.map(row => Number(row.primaryPoints || 0));
    const worldData = compareRows.map(row => Number(row.secondaryPoints || 0));
    const maxPoints = Math.max(6, compareRows.length * 2);

    if(state.compareChart) state.compareChart.destroy();
    state.compareChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: PAGE_CONFIG.title,
            data: loungeData,
            backgroundColor: 'rgba(77,163,25,.82)',
            borderColor: 'rgb(77,163,25)',
            borderWidth: 1
          },
          {
            label: 'World Wides',
            data: worldData,
            backgroundColor: 'rgba(78,124,255,.82)',
            borderColor: 'rgb(78,124,255)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        interaction: { mode: 'nearest', axis: 'y', intersect: true },
        scales: {
          x: {
            min: 0,
            max: maxPoints,
            stacked: true,
            ticks: { color: getCss('--text'), callback: (value) => `${Number(value).toFixed(0)} pts` },
            title: { display: true, text: 'Hidden rank-point sum', color: getCss('--muted') }
          },
          y: { ticks: { color: getCss('--text'), autoSkip: false }, stacked: true }
        },
        plugins: {
          legend: { display: true, labels: { color: getCss('--text') } },
          tooltip: {
            callbacks: {
              title: (items) => items?.[0]?.label || '',
              label: (ctx) => {
                const row = compareRows[ctx.dataIndex];
                if(!row) return '';
                if(ctx.datasetIndex === 0){
                  return `${PAGE_CONFIG.title}: ${row.primaryPoints} pts (rank #${row.primaryRank}, avg pts ${row.primary.toFixed(2)}, ${row.primaryCount} races)`;
                }
                return `World Wides: ${row.secondaryPoints} pts (rank #${row.secondaryRank}, avg VR ? ${row.secondary.toFixed(2)}, ${row.secondaryCount} matches)`;
              },
              footer: (items) => {
                const row = compareRows[items?.[0]?.dataIndex];
                if(!row) return '';
                const stronger = row.pointGap >= 0 ? PAGE_CONFIG.title : 'World Wides';
                return `Total: ${row.totalPoints} pts | Gap: ${Math.abs(row.pointGap)} in favor of ${stronger}`;
              }
            }
          }
        }
      }
    });

    renderCompareNotes(compareRows);
    meta.textContent = `${window.MKWTModeCompare.comparisonMetaText(PAGE_CONFIG.title, 'World Wides', compareRows.length, 10)} Sorted by combined rank points.`;
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
        const hasAvg = row.count > 0;
        const avgValue = Number(row.avg || 0);
        const avg = hasAvg ? avgValue.toFixed(2) : '-';
        return `<div class="statBox"><div class="statLabel">${escapeHtml(row.label)}</div><div class="statValue">${row.count}</div><div class="muted">AVG <span class="${avgToneClass(avgValue, hasAvg)}">${avg}</span> points</div></div>`;
      });
      info.innerHTML = total
        ? `<div class="trackInsightGrid">${pieces.join('')}</div>`
        : '<div class="muted">No saved track or intermission races yet.</div>';
    }
  }
  function getCss(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff'; }

  function renderHeroSummary(stats){
    const sessions = (state.sessions || []).filter((session) => !sessionStatsExcluded(session));
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
    const pickBestStat = (rows) => (rows || []).filter(s => s.count >= 5).sort((a,b) => {
      const diff = b.avg - a.avg;
      if(diff !== 0) return diff;
      return b.count - a.count;
    })[0] || null;
    const bestTrack = pickBestStat(stats);
    const bestIntermission = PAGE_CONFIG.playerCount === 24 && PAGE_CONFIG.allowIntermissionRoutes
      ? pickBestStat(aggregateTrackStats('im_routes'))
      : null;
    const bestTrackName = $('heroBestTrackName');
    const bestTrackMeta = $('heroBestTrackMeta');
    const bestIntermissionName = $('heroBestIntermissionName');
    const bestIntermissionMeta = $('heroBestIntermissionMeta');
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
      clearScoreToneClasses(avgEl);
      if(tone) avgEl.classList.add(tone);
      avgEl.innerHTML = hasAvg
        ? `<span class="${tone}">${mogiAvg.toFixed(0)}</span><span class="avgDivider">/</span><span class="${tone}">${avgMogi.toFixed(2)}</span>`
        : '<span>0</span><span class="avgDivider">/</span><span>0.00</span>';
      avgEl.title = hasAvg ? `Mogi points ${mogiAvg.toFixed(0)} | Track AVG ${avgMogi.toFixed(2)}` : '';
    }
    if(raceCountEl) raceCountEl.textContent = String(raceCount);
    if(dcCountEl) dcCountEl.textContent = String(dcCount);
    if(highestEl){
      highestEl.textContent = highestPoints == null ? '-' : String(highestPoints);
      clearScoreToneClasses(highestEl);
      highestEl.removeAttribute('title');
    }
    if(lowestEl){
      lowestEl.textContent = lowestPoints == null ? '-' : String(lowestPoints);
      clearScoreToneClasses(lowestEl);
      lowestEl.removeAttribute('title');
    }
    if(bestTrackName) bestTrackName.textContent = bestTrack ? bestTrack.track : 'Not enough data';
    if(bestTrackMeta) bestTrackMeta.textContent = bestTrack ? `${bestTrack.avg.toFixed(2)} AVG - ${bestTrack.count} plays` : 'Needs 5 races on one track.';
    if(bestIntermissionName) bestIntermissionName.textContent = bestIntermission ? bestIntermission.track : 'Not enough data';
    if(bestIntermissionMeta) bestIntermissionMeta.textContent = bestIntermission ? `${bestIntermission.avg.toFixed(2)} AVG - ${bestIntermission.count} plays` : 'Needs 5 races on one route.';
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
    updateCompareButton();
    if(state.showCompareChart){
      renderModeCompareChart().catch((err) => {
        console.error('[lounge] compare chart failed', err);
        const meta = $('loungeCompareMeta');
        if(meta) meta.textContent = 'Comparison failed. Please try again.';
      });
    }
    persist();
  }
  function setMogiResultFormatTag(tag){
    const normalized = normalizeLoungeFormatTag(tag);
    if(!state.current) return;
    state.current.loungeFormatTag = state.current.loungeFormatTag === normalized ? '' : normalized;
    if(sessionFormatTag(state.current) !== NON_LOUNGE_FORMAT_TAG) state.current.statsExcluded = false;
    renderMogiResultFormatTags();
    if(!isCloud()) persist();
  }
  function setMogiResultTierTag(tag){
    const normalized = normalizeLoungeTierTag(tag);
    if(!state.current) return;
    state.current.loungeTier = sessionTierTag(state.current) === normalized ? '' : normalized;
    renderMogiResultFormatTags();
    if(!isCloud()) persist();
  }
  function renderMogiResultFormatTags(){
    const wrap = $('mogiResultFormatTags');
    if(!wrap) return;
    const selected = sessionFormatTag(state.current);
    const selectedTier = sessionTierTag(state.current);
    const renderFormatButton = (tag) => {
      const active = selected === tag;
      const extra = tag === NON_LOUNGE_FORMAT_TAG ? 'mogiResultFormatTag--nonLounge' : (isSquadQueueFormatTag(tag) ? 'mogiResultFormatTag--sq' : '');
      return `<button class="mogiResultFormatTag ${extra}${active ? ' active' : ''}" type="button" data-mogi-format-tag="${escapeHtml(tag)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(tag)}</button>`;
    };
    const renderTierButton = (tag) => {
      const active = selectedTier === tag;
      const label = tag || 'No Tier';
      return `<button class="mogiResultFormatTag mogiResultFormatTag--tier${active ? ' active' : ''}" type="button" data-mogi-tier-tag="${escapeHtml(tag)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
    };
    const renderGroup = (label, tags, modifier, renderButton = renderFormatButton) => {
      if(!tags.length) return '';
      return `
        <div class="mogiResultFormatGroup ${modifier}">
          <div class="mogiResultFormatGroupTitle">${escapeHtml(label)}</div>
          <div class="mogiResultFormatGroupTags">${tags.map(renderButton).join('')}</div>
        </div>`;
    };
    const tags = pageLoungeFormatTags();
    const standardTags = tags.filter((tag) => tag !== NON_LOUNGE_FORMAT_TAG && !isSquadQueueFormatTag(tag));
    const sqTags = tags.filter((tag) => tag !== NON_LOUNGE_FORMAT_TAG && isSquadQueueFormatTag(tag));
    const nonLoungeTags = tags.filter((tag) => tag === NON_LOUNGE_FORMAT_TAG);
    wrap.innerHTML = [
      renderGroup('Formats', standardTags, 'mogiResultFormatGroup--standard'),
      renderGroup('SQ', sqTags, 'mogiResultFormatGroup--sq'),
      renderGroup('Tier', ['', ...collectLoungeTierTags()], 'mogiResultFormatGroup--tier', renderTierButton),
      renderGroup('Non-Lounge', nonLoungeTags, 'mogiResultFormatGroup--nonLounge')
    ].join('');
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
    const raceStripEl = $('mogiResultRaceStrip');

    if(totalEl){
      totalEl.textContent = String(total);
      toneTotalElement(totalEl, total, races.length > 0);
    }
    if(metaEl) metaEl.innerHTML = `${races.length} races - <span class="${avgToneClass(Number(statAvg), statRaces.length > 0)}">${statAvg} AVG</span> - ${dcs} DCs`;
    renderMogiResultFormatTags();
    if(raceStripEl) {
      raceStripEl.innerHTML = renderSessionRaceStrip(races, null, { source: 'current' });
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
  function openMissingFormatConfirmDialog(){
    const dlg = $('mogiFormatConfirmDialog');
    if(!dlg) return false;
    if(typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    else dlg.setAttribute('open', '');
    return true;
  }
  function closeMissingFormatConfirmDialog(){
    const dlg = $('mogiFormatConfirmDialog');
    if(!dlg) return;
    if(typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  }
  async function maybeCompleteMogi(){
    if((state.current.races || []).length < 12) return;
    setStatus('Mogi complete. Confirm the result to save it.', true);
    openMogiResultDialog();
  }
  async function confirmMogiResult(options = {}){
    if((state.current.races || []).length < 12){ closeMogiResultDialog(); return; }
    const selectedTag = sessionFormatTag(state.current);
    const selectedTier = sessionTierTag(state.current);
    if(!selectedTag && !options.allowMissingTag){
      if(openMissingFormatConfirmDialog()) return;
      const ok = window.MKWT?.confirmAction
        ? await window.MKWT.confirmAction({
            eyebrow: 'Mogi format',
            title: 'Save without format?',
            body: 'This Mogi will be saved without a format tag.',
            confirmLabel: 'Continue',
            cancelLabel: 'Cancel',
            danger: false,
          })
        : window.confirm('Save without format?');
      if(!ok) return;
    }
    try {
      closeMissingFormatConfirmDialog();
      const finished = {
        ...state.current,
        loungeFormatTag: selectedTag,
        loungeTier: selectedTier,
        loungeFormatSource: selectedTag ? 'result' : '',
        statsExcluded: false,
        completed_at: currentTs(),
        saved: true,
      };
      if (isCloud() && state.current.cloud_id) {
        setStatus('Saving confirmed Mogi to cloud...', true);
        await updateCloudMogi(state.current, {
          status: 'completed',
          completed_at: finished.completed_at,
          lounge_format_tag: selectedTag || null,
          lounge_format_source: selectedTag ? 'result' : null,
          lounge_tier: selectedTier || null,
          stats_excluded: false,
          mkcentral_format_tag: sessionMkcentralFormatTag(finished) || null,
        });
      }
      state.sessions.push(finished);
      state.sessionPage = 1;
      state.current = makeFreshMogi();
      closeMogiResultDialog();
      setStatus(selectedTag ? `Mogi saved: ${[selectedTag, selectedTier].filter(Boolean).join(' / ')}` : 'Mogi completed and saved as one session.', true);
      refresh();
    } catch(e) {
      setStatus('Mogi confirm failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  async function saveRace(){
    try {
      setEntryStatus('', true, false);
      if((state.current.races || []).length >= 12){
        setEntryStatus('Confirm current Mogi first.', false);
        setStatus('This Mogi has 12 races. Confirm the result before starting another race.', true);
        openMogiResultDialog();
        return;
      }
      const entry = readEntrySelection();
      const placement = Number($('placementSelect').value || 0);
      if(entry.error || !placement){
        const missing = [];
        if(entry.error) missing.push(state.entryMode === 'intermission' ? 'intermission route' : 'track');
        if(!placement) missing.push('result');
        setEntryStatus(`Select ${missing.join(' and ')} first.`, false);
        return;
      }
      const duplicateEntry = entryAlreadyUsed(entry);
      const autoRepick = duplicateEntry;
      const lobbySize = currentLobbySize();
      const disconnect = !!state.entryDisconnect;
      const points = getPoints(lobbySize, placement);
      if(points == null){ setEntryStatus('Invalid result for this lobby size.', false); return; }
      const race = {
        track: entry.track,
        raceKind: entry.raceKind,
        intermissionStart: entry.intermissionStart,
        intermissionEnd: entry.intermissionEnd,
        lobbySize,
        placement,
        points,
        disconnect,
        repick: autoRepick,
        created_at: currentTs()
      };

      if (isCloud()) {
        setEntryStatus('Saving race...', true, false);
        const mogiId = await ensureCloudCurrentMogi();
        const raceNumber = (state.current.races || []).length + 1;
        const { data, error } = await loungeClient
          .from('lounge_races')
          .insert(raceToDbPayload(race, mogiId, raceNumber))
          .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at')
          .single();
        if (error) throw error;
        state.current.races = applyAutoRepicks([...(state.current.races || []), dbRaceToLocal(data)]);
        await updateCloudMogi(state.current);
      } else {
        state.current.races = applyAutoRepicks([...(state.current.races || []), race]);
      }

      if($('trackSelect')) $('trackSelect').value = '';
      if($('intermissionStartSelect')) $('intermissionStartSelect').value = '';
      if($('intermissionEndSelect')) $('intermissionEndSelect').value = '';
      state.lobbySize = PAGE_CONFIG.playerCount;
      state.entryDisconnect = false;
      if($('placementSelect')) $('placementSelect').value = '';
      updatePlacementOptions();
      if($('placementSelect')) $('placementSelect').value = '';
      resetIntermissionRouteFilters();
      updatePlayedOptionHints();
      try{ window.MKWT_LOUNGE_PICKERS?.refreshAll?.(); }catch(e){}
      const savedParts = [`Saved: ${displayRaceLabel(race)}`, `Result ${placement}`];
      if(disconnect) savedParts.push('DC');
      if(race.repick) savedParts.push('Repick');
      setEntryStatus(savedParts.join(' | '), true);
      refresh();
      await maybeCompleteMogi();
    } catch(e) {
      setEntryStatus('Race save failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  function clearRaceEntry(){
    const trackSelect = $('trackSelect');
    if(trackSelect) trackSelect.value = '';
    const startSelect = $('intermissionStartSelect');
    if(startSelect) startSelect.value = '';
    const endSelect = $('intermissionEndSelect');
    if(endSelect) endSelect.value = '';
    resetIntermissionRouteFilters();
    const placementSelect = $('placementSelect');
    if(placementSelect) placementSelect.value = '';
    state.lobbySize = PAGE_CONFIG.playerCount;
    state.entryDisconnect = false;
    setTagsOpen(false);
    updateEntryTagButtons();
    updatePlacementOptions();
    if(placementSelect) placementSelect.value = '';
    updatePlayedOptionHints();
    try{ window.MKWT_LOUNGE_PICKERS?.refreshAll?.(); }catch(e){}
    setEntryStatus('Entry cleared.', true);
  }
  async function undoLast(){
    if(!(state.current.races || []).length){ setEntryStatus('Nothing to undo.', false); return; }
    const last = state.current.races[state.current.races.length - 1];
    const label = displayRaceLabel(last) || 'Unknown track';
    const placement = ordinalLabel(last?.placement);
    const points = Number(last?.points || 0);
    const details = [
      `Track: ${label}`,
      `Placement: ${placement}`,
      `Points: ${Number.isFinite(points) ? points : 0} pts`,
    ];
    const lobby = Number(last?.lobbySize || PAGE_CONFIG.playerCount);
    if(PAGE_CONFIG.allowLobbyTags && lobby !== PAGE_CONFIG.playerCount) details.push(`Lobby: ${lobby}p`);
    if(last?.disconnect) details.push('Flag: DC');
    if(last?.repick) details.push('Flag: Repick');
    const body = `This will remove the last tracked race from the current Mogi.\n\nLast race:\n${details.join('\n')}`;
    const ok = window.MKWT?.confirmAction
      ? await window.MKWT.confirmAction({
          eyebrow: 'Undo race',
          title: 'Undo last race?',
          body,
          confirmLabel: 'Yes',
          cancelLabel: 'No',
          danger: true,
        })
      : window.confirm(`Undo last race?\n\n${body}`);
    if(!ok) return;
    try {
      const removedParts = [`Removed: ${displayRaceLabel(last) || 'race'}`];
      if(last?.placement) removedParts.push(`Result ${last.placement}`);
      if(PAGE_CONFIG.allowLobbyTags && lobby !== PAGE_CONFIG.playerCount) removedParts.push(`${lobby}p`);
      if(last?.disconnect) removedParts.push('DC');
      if(last?.repick) removedParts.push('Repick');
      if (isCloud() && last?.cloud_id) {
        setEntryStatus(`Removing: ${displayRaceLabel(last) || 'race'}...`, true, false);
        const { error } = await loungeClient
          .from('lounge_races')
          .delete()
          .eq('id', last.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (error) throw error;
      }
      state.current.races.pop();
      if (isCloud()) await updateCloudMogi(state.current);
      setEntryStatus(removedParts.join(' | '), true);
      refresh();
    } catch(e) {
      setEntryStatus('Undo failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  function closeDeleteMogiConfirm(){
    pendingDeleteMogiIndex = null;
    const dialog = $('mogiDeleteConfirmDialog');
    if(!dialog) return;
    if(typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  function openDeleteMogiConfirm(index){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    const label = fmtDate(session.completed_at || session.created_at);
    pendingDeleteMogiIndex = index;
    const text = $('mogiDeleteConfirmText');
    if(text) text.textContent = `Are you sure you want to delete this Mogi from ${label}?`;
    const dialog = $('mogiDeleteConfirmDialog');
    if(!dialog) return;
    if(typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  async function confirmDeleteMogi(){
    const index = pendingDeleteMogiIndex;
    closeDeleteMogiConfirm();
    if(!Number.isInteger(index) || index < 0) return;
    await deleteMogi(index);
  }
  function isAuthStorageKey(key){
    if(!key) return false;
    return key === 'mkwt_mode'
      || key === 'mkwt_last_mode'
      || key === 'mkwt_auth_storage'
      || (key.startsWith('sb-') && key.includes('auth-token'));
  }
  let cloudRefreshInFlight = null;
  let lastCloudFocusRefreshAt = 0;
  async function refreshCloudFromServer({ silent = true } = {}){
    if(!isCloud()) return;
    if(cloudRefreshInFlight) return cloudRefreshInFlight;
    cloudRefreshInFlight = (async () => {
      try {
        await loadCloud();
        refresh();
        if(!silent) setStatus('Cloud data refreshed.', true);
      } catch(e) {
        console.warn('[lounge] cloud refresh failed', e);
        if(!silent) setStatus('Cloud refresh failed: ' + (e?.message || e), false);
      } finally {
        cloudRefreshInFlight = null;
      }
    })();
    return cloudRefreshInFlight;
  }
  function scheduleCloudFocusRefresh(){
    if(!isCloud() || document.hidden) return;
    const now = Date.now();
    if(now - lastCloudFocusRefreshAt < 5000) return;
    lastCloudFocusRefreshAt = now;
    refreshCloudFromServer({ silent: true });
  }
  async function deleteMogi(index){
    const session = state.sessions[index];
    if(!session){ setStatus('Mogi not found.', false); return; }
    try {
      if (isCloud() && session.cloud_id) {
        setStatus('Deleting Mogi from cloud...', true);
        const { error: raceError } = await loungeClient
          .from('lounge_races')
          .delete()
          .eq('mogi_id', session.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (raceError) throw raceError;
        const { error } = await loungeClient
          .from('lounge_mogis')
          .delete()
          .eq('id', session.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (error) throw error;
      }
      state.sessions.splice(index, 1);
      if(state.editingSessionIndex === index) state.editingSessionIndex = null;
      state.openSessionDetails = {};
      state.openSessionTagEditors = {};
      state.sessionTagDrafts = {};
      state.sessionTierDrafts = {};
      state.raceEdit = null;
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
    const opts = ['<option value="">Result</option>'];
    for(let i = 1; i <= max; i += 1){
      opts.push(`<option value="${i}"${Number(placement) === i ? ' selected' : ''}>${i}</option>`);
    }
    return opts.join('');
  }
  function fillPlainSelect(select, placeholder, values, selected, labelForValue){
    if(!select) return;
    const list = Array.from(new Set((values || []).map(v => String(v || '').trim()).filter(Boolean)));
    const selectedValue = String(selected || '').trim();
    if(selectedValue && !list.includes(selectedValue)) list.unshift(selectedValue);
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + list
      .map(value => optionHtml(value, selectedValue, labelForValue ? labelForValue(value) : value))
      .join('');
    select.value = selectedValue && list.includes(selectedValue) ? selectedValue : '';
  }
  function refreshRaceEditPickers(){
    try{ window.MKWT_LOUNGE_PICKERS?.refreshAll?.(); }catch(e){}
  }
  function fillSavedRaceEditRouteSelects(startValue = '', endValue = ''){
    const startSel = $('savedRaceEditStartSelect');
    const endSel = $('savedRaceEditEndSelect');
    if(!startSel || !endSel) return;
    const { startToEnds, endToStarts } = buildRouteMaps();
    const allStarts = startToEnds.size ? Array.from(startToEnds.keys()) : COURSE_TRACKS;
    const allEnds = endToStarts.size ? Array.from(endToStarts.keys()) : COURSE_TRACKS;
    const starts = endValue ? Array.from(endToStarts.get(endValue) || []) : allStarts;
    const ends = startValue ? Array.from(startToEnds.get(startValue) || []) : allEnds;
    fillPlainSelect(startSel, 'Intermission start', starts, startValue);
    fillPlainSelect(endSel, 'Intermission end', ends, endValue, (end) => startValue ? getDestinyGroup(startValue, end) : end);
  }
  function setSavedRaceEditMode(mode){
    const useIntermission = PAGE_CONFIG.allowIntermissionRoutes && mode === 'intermission';
    if(state.raceEdit) state.raceEdit.mode = useIntermission ? 'intermission' : 'track';
    const modeToggle = $('savedRaceEditModeToggle');
    if(modeToggle) modeToggle.hidden = !PAGE_CONFIG.allowIntermissionRoutes;
    document.querySelectorAll('[data-race-edit-mode]').forEach((btn) => {
      const active = btn.dataset.raceEditMode === (useIntermission ? 'intermission' : 'track');
      btn.classList.toggle('isActive', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const trackFields = $('savedRaceEditTrackFields');
    const imFields = $('savedRaceEditIntermissionFields');
    if(trackFields) trackFields.hidden = useIntermission;
    if(imFields) imFields.hidden = !useIntermission;
    refreshRaceEditPickers();
  }
  function setSavedRaceEditLobby(size){
    if(!state.raceEdit) return;
    const next = Number(size);
    state.raceEdit.lobbySize = PAGE_CONFIG.allowLobbyTags && (next === 11 || next === 10) ? next : PAGE_CONFIG.playerCount;
    updateSavedRaceEditTagButtons();
    updateSavedRaceEditPlacementOptions();
  }
  function toggleSavedRaceEditDisconnect(){
    if(!state.raceEdit) return;
    state.raceEdit.disconnect = !state.raceEdit.disconnect;
    updateSavedRaceEditTagButtons();
  }
  function updateSavedRaceEditTagButtons(){
    const lobby = Number(state.raceEdit?.lobbySize || PAGE_CONFIG.playerCount);
    document.querySelectorAll('[data-race-edit-lobby]').forEach((btn) => {
      const size = Number(btn.dataset.raceEditLobby);
      btn.hidden = !PAGE_CONFIG.allowLobbyTags;
      const active = PAGE_CONFIG.allowLobbyTags && size === lobby;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const dcBtn = $('savedRaceEditDc');
    if(dcBtn){
      const active = !!state.raceEdit?.disconnect;
      dcBtn.classList.toggle('active', active);
      dcBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      dcBtn.textContent = active ? 'DC on' : 'DC';
    }
  }
  function updateSavedRaceEditPlacementOptions(){
    const select = $('savedRaceEditPlacementSelect');
    if(!select) return;
    const lobby = Number(state.raceEdit?.lobbySize || PAGE_CONFIG.playerCount);
    const previous = Number(select.value || state.raceEdit?.placement || 0);
    select.innerHTML = buildPlacementOptionsForLobby(lobby, previous);
    if(previous > lobby) select.value = '';
    updateSavedRaceEditPoints();
    refreshRaceEditPickers();
  }
  function updateSavedRaceEditPoints(){
    const pointsEl = $('savedRaceEditPoints');
    const placement = Number($('savedRaceEditPlacementSelect')?.value || 0);
    const lobby = Number(state.raceEdit?.lobbySize || PAGE_CONFIG.playerCount);
    const points = getPoints(lobby, placement);
    if(pointsEl) pointsEl.textContent = points == null ? '-' : String(points);
  }
  function closeSavedRaceEdit(){
    const dialog = $('savedRaceEditDialog');
    state.raceEdit = null;
    try{ window.MKWT_LOUNGE_PICKERS?.closeAll?.(); }catch(e){}
    if(!dialog) return;
    if(typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  function openRaceEdit(session, raceIndex, options = {}){
    const race = session?.races?.[raceIndex];
    if(!session || !race){ setStatus('Race not found.', false); return; }
    const dialog = $('savedRaceEditDialog');
    if(!dialog) return;
    const isIm = PAGE_CONFIG.allowIntermissionRoutes && isIntermissionRace(race);
    const route = routePartsFromRace(race);
    const trackName = isIm ? '' : displayRaceLabel(race);
    const lobbySize = Number(race.lobbySize || PAGE_CONFIG.playerCount);
    state.raceEdit = {
      source: options.source || 'saved',
      sessionIndex: options.sessionIndex ?? null,
      raceIndex,
      mode: isIm ? 'intermission' : 'track',
      lobbySize: PAGE_CONFIG.allowLobbyTags && (lobbySize === 11 || lobbySize === 10) ? lobbySize : PAGE_CONFIG.playerCount,
      placement: Number(race.placement || 0),
      disconnect: !!race.disconnect,
    };
    const meta = $('savedRaceEditMeta');
    if(meta) meta.textContent = options.source === 'current'
      ? `Current Mogi · Race ${raceIndex + 1}`
      : `${fmtDate(session.completed_at || session.created_at)} · Race ${raceIndex + 1}`;
    fillPlainSelect($('savedRaceEditTrackSelect'), 'Track', PAGE_CONFIG.allowIntermissionRoutes ? COURSE_TRACKS : TRACKS, trackName);
    fillSavedRaceEditRouteSelects(route.start || '', route.end || '');
    setSavedRaceEditMode(state.raceEdit.mode);
    updateSavedRaceEditTagButtons();
    const placementSel = $('savedRaceEditPlacementSelect');
    if(placementSel){
      placementSel.innerHTML = buildPlacementOptionsForLobby(state.raceEdit.lobbySize, state.raceEdit.placement);
      placementSel.value = state.raceEdit.placement ? String(state.raceEdit.placement) : '';
    }
    updateSavedRaceEditPoints();
    refreshRaceEditPickers();
    if(typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function openSavedRaceEdit(sessionIndex, raceIndex){
    openRaceEdit(state.sessions[sessionIndex], raceIndex, { source: 'saved', sessionIndex });
  }
  function openCurrentRaceEdit(raceIndex){
    openRaceEdit(state.current, raceIndex, { source: 'current' });
  }
  function readSavedRaceEditPayload(){
    if(!state.raceEdit) return { error: 'Editor not ready.' };
    const mode = PAGE_CONFIG.allowIntermissionRoutes && state.raceEdit.mode === 'intermission' ? 'intermission' : 'track';
    let track = '';
    let raceKind = 'track';
    let intermissionStart = null;
    let intermissionEnd = null;
    if(mode === 'intermission'){
      const start = String($('savedRaceEditStartSelect')?.value || '').trim();
      const end = String($('savedRaceEditEndSelect')?.value || '').trim();
      if(!start || !end) return { error: 'Select intermission route first.' };
      track = routeLabel(start, end);
      raceKind = 'intermission';
      intermissionStart = start;
      intermissionEnd = end;
    }else{
      track = String($('savedRaceEditTrackSelect')?.value || '').trim();
      if(!track) return { error: 'Select track first.' };
    }
    const lobbySize = Number(state.raceEdit.lobbySize || PAGE_CONFIG.playerCount);
    const placement = Number($('savedRaceEditPlacementSelect')?.value || 0);
    if(!placement) return { error: 'Select result first.' };
    const points = getPoints(lobbySize, placement);
    if(points == null) return { error: 'Invalid result for this lobby size.' };
    return {
      track,
      raceKind,
      intermissionStart,
      intermissionEnd,
      lobbySize,
      placement,
      points,
      disconnect: !!state.raceEdit.disconnect,
    };
  }
  async function saveEditedSessionRaces(session, normalizedRaces, options = {}){
    let savedRaces = normalizedRaces;
    if (isCloud() && session.cloud_id) {
      setStatus(options.statusText || 'Saving Mogi to cloud...', true, false);
      const { error: deleteError } = await loungeClient
        .from('lounge_races')
        .delete()
        .eq('mogi_id', session.cloud_id)
        .eq('user_id', loungeSession.user.id);
      if (deleteError) throw deleteError;

      const payload = normalizedRaces.map((race, i) => raceToDbPayload(race, session.cloud_id, i + 1));
      if (payload.length) {
        const { data, error: insertError } = await loungeClient
          .from('lounge_races')
          .insert(payload)
          .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at');
        if (insertError) throw insertError;
        savedRaces = applyAutoRepicks((data || []).map(dbRaceToLocal).sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0)));
      }
      const patch = options.patch || { status: 'completed', completed_at: session.completed_at || currentTs() };
      await updateCloudMogi({ ...session, races: savedRaces }, patch);
    }
    session.races = savedRaces;
    session.totalPoints = sessionTotalPoints(session);
    session.disconnects = savedRaces.filter(r => r.disconnect).length;
    session.updated_at = currentTs();
    return savedRaces;
  }
  async function saveSavedRaceEdit(){
    if(!state.raceEdit){ closeSavedRaceEdit(); return; }
    const { sessionIndex, raceIndex, source } = state.raceEdit;
    const isCurrent = source === 'current';
    const session = isCurrent ? state.current : state.sessions[sessionIndex];
    const sourceRace = session?.races?.[raceIndex];
    if(!session || !sourceRace){ setStatus('Race not found.', false); return; }
    const payload = readSavedRaceEditPayload();
    if(payload.error){ setStatus(payload.error, false); return; }
    const nextRaces = (session.races || []).map((race, index) => index === raceIndex ? {
      ...race,
      ...payload,
      updated_at: currentTs(),
    } : race);
    const normalizedRaces = applyAutoRepicks(nextRaces);
    try{
      if(isCurrent){
        await saveEditedSessionRaces(session, normalizedRaces, {
          statusText: 'Saving current Mogi...',
          patch: { status: 'active', completed_at: null },
        });
      }else{
        await saveEditedSessionRaces(session, normalizedRaces);
      }
      if(!isCloud()) persist();
      closeSavedRaceEdit();
      setStatus(`${isCurrent ? 'Current' : 'Saved'}: ${displayRaceLabel(session.races[raceIndex]) || 'Race'} | Result ${payload.placement}`, true);
      refresh();
      if(isCurrent && $('mogiResultDialog')?.open) renderMogiResultDialog();
    }catch(e){
      setStatus('Save failed: ' + (e?.message || e), false);
      console.error(e);
    }
  }
  function renderSessionViewRows(races){
    return (races || []).map((r, i) => `
        <tr class="${raceRowClass(r)}">
          <td>${i + 1}</td>
          <td>${displayRaceLabelHtml(r)}</td>
          ${raceResultMetaHtml(r)}
          ${raceEntryMetaHtml(r)}
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
            <option value="normal"${!r.disconnect ? ' selected' : ''}>Normal</option>
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
    const points = p == null ? '-' : p;
    if(pointsCell) pointsCell.textContent = String(points);
    row.className = [placementRowClass(placement), String(typeSel?.value || '').includes('disconnect') ? 'raceRow--dc' : ''].filter(Boolean).join(' ');
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
      const disconnect = type.includes('disconnect');
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
        disconnect,
        repick: false
      });
    }
    const normalizedRaces = applyAutoRepicks(races);
    try {
      if (isCloud() && session.cloud_id) {
        setStatus('Saving Mogi to cloud...', true);
        const { error: deleteError } = await loungeClient
          .from('lounge_races')
          .delete()
          .eq('mogi_id', session.cloud_id)
          .eq('user_id', loungeSession.user.id);
        if (deleteError) throw deleteError;

        const payload = normalizedRaces.map((race, i) => raceToDbPayload(race, session.cloud_id, i + 1));
        if (payload.length) {
          const { data, error: insertError } = await loungeClient
            .from('lounge_races')
            .insert(payload)
            .select('id, mogi_id, race_number, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect, created_at, updated_at');
          if (insertError) throw insertError;
          normalizedRaces.splice(
            0,
            normalizedRaces.length,
            ...applyAutoRepicks((data || []).map(dbRaceToLocal).sort((a, b) => Number(a.race_number || 0) - Number(b.race_number || 0)))
          );
        }
        await updateCloudMogi({ ...session, races: normalizedRaces }, { status: 'completed', completed_at: session.completed_at || currentTs() });
      }

      session.races = normalizedRaces;
      session.totalPoints = normalizedRaces.reduce((a, r) => a + Number(r.points || 0), 0);
      session.disconnects = normalizedRaces.filter(r => r.disconnect).length;
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
    const compareDialog = $('loungeCompareDialog');
    if(compareDialog){
      compareDialog.onclose = () => {
        state.showCompareChart = false;
        updateCompareButton();
      };
      compareDialog.oncancel = () => {
        state.showCompareChart = false;
        updateCompareButton();
      };
    }
    const suggestDialog = $('trackSuggestionDialog');
    if(suggestDialog){
      suggestDialog.oncancel = () => {};
      suggestDialog.addEventListener('click', (event) => {
        if(event.target === suggestDialog) closeTrackSuggestionDialog();
      });
    }
      document.querySelectorAll('[data-lobby-tag]').forEach(btn => btn.addEventListener('click', () => setLobbyTag(btn.dataset.lobbyTag)));
      let lastEntryModePointerDown = 0;
      document.querySelectorAll('[data-entry-mode]').forEach(btn => {
        btn.addEventListener('pointerdown', (event) => {
          if(event.pointerType === 'mouse') return;
          lastEntryModePointerDown = Date.now();
          event.preventDefault();
          setEntryMode(btn.dataset.entryMode);
        }, { passive: false });
        btn.addEventListener('click', () => {
          if(Date.now() - lastEntryModePointerDown < 500) return;
          setEntryMode(btn.dataset.entryMode);
        });
      });
      bindGlobalChartFilterClosers();
      bindChartFilterToggle('btnTrackPerfFilter', 'menuTrackPerfFilter');
      bindChartFilterToggle('btnPlacementFilter', 'menuPlacementFilter');
      document.querySelectorAll('[data-track-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeChartFilterMenus();
          setTrackSort(btn.dataset.trackSort);
        });
      });
      document.querySelectorAll('[data-track-mode]').forEach((btn) => {
        btn.addEventListener('click', () => setTrackChartMode(btn.dataset.trackMode));
      });
      bindSwipeNavigation($('trackPerfSwipeSurface'), {
        onLeft: () => cycleTrackChartMode('left'),
        onRight: () => cycleTrackChartMode('right')
      });
      $('btnCloseLoungeCompare')?.addEventListener('click', closeCompareDialog);
      $('btnCompareWorldWide')?.addEventListener('click', () => {
        if($('loungeCompareDialog')?.open){
          closeCompareDialog();
          return;
      }
      state.showCompareChart = true;
      updateCompareButton();
      renderModeCompareChart().catch((err) => {
        console.error('[lounge] compare chart failed', err);
        const meta = $('loungeCompareMeta');
        if(meta) meta.textContent = 'Comparison failed. Please try again.';
      });
    });
      document.querySelectorAll('[data-placement-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeChartFilterMenus();
          setPlacementMode(btn.dataset.placementMode);
        });
      });
      $('btnSaveRace').addEventListener('click', () => saveRace());
      $('btnClearEntry')?.addEventListener('click', clearRaceEntry);
      $('btnTagToggle')?.addEventListener('click', toggleTagsOpen);
      $('btnDisconnect').addEventListener('click', () => toggleDisconnectTag());
      $('btnUndo').addEventListener('click', undoLast);
      $('btnTrackSuggestions')?.addEventListener('click', () => {
        if($('trackSuggestionDialog')?.open){
          closeTrackSuggestionDialog();
          return;
        }
        openTrackSuggestionDialog();
      });
    $('btnLoungeTierStats')?.addEventListener('click', openLoungeTierStatsDialog);
    $('btnCloseLoungeTierStats')?.addEventListener('click', closeLoungeTierStatsDialog);
    $('loungeTierStatsDialog')?.addEventListener('click', (event) => {
      if(event.target === event.currentTarget) closeLoungeTierStatsDialog();
    });
    $('btnCloseTrackSuggestions')?.addEventListener('click', closeTrackSuggestionDialog);
    $('trackSuggestionGrid')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-suggest-track], [data-suggest-route-start]');
      if(!button) return;
      const routeStart = String(button.getAttribute('data-suggest-route-start') || '').trim();
      const routeEnd = String(button.getAttribute('data-suggest-route-end') || '').trim();
      if(routeStart && routeEnd){
        selectSuggestedIntermissionRoute(routeStart, routeEnd);
        closeTrackSuggestionDialog();
        return;
      }
        const track = String(button.getAttribute('data-suggest-track') || '').trim();
        if(!track || state.entryMode !== 'track') return;
        const select = $('trackSelect');
        if(select){
          select.value = track;
          select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeTrackSuggestionDialog();
    });
    const handleCurrentRaceEditClick = (event) => {
      const button = event.target.closest('[data-current-race-edit]');
      if(!button) return;
      const raceIndex = Number(button.getAttribute('data-race-index'));
      if(!Number.isInteger(raceIndex) || raceIndex < 0) return;
      openCurrentRaceEdit(raceIndex);
    };
    $('currentMogiBody')?.addEventListener('click', handleCurrentRaceEditClick);
    $('mogiResultRaceStrip')?.addEventListener('click', handleCurrentRaceEditClick);
    $('btnConfirmMogiResult')?.addEventListener('click', confirmMogiResult);
    $('mogiResultFormatTags')?.addEventListener('click', (event) => {
      const formatButton = event.target.closest('[data-mogi-format-tag]');
      if(formatButton){
        setMogiResultFormatTag(formatButton.getAttribute('data-mogi-format-tag'));
        return;
      }
      const tierButton = event.target.closest('[data-mogi-tier-tag]');
      if(tierButton) setMogiResultTierTag(tierButton.getAttribute('data-mogi-tier-tag'));
    });
    $('btnKeepMogiResult')?.addEventListener('click', () => {
      closeMogiResultDialog();
      setStatus('Result kept in the current Mogi. Confirm when ready.', true);
    });
    $('mogiResultDialog')?.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      setStatus('Confirm the result or choose Review to keep editing.', false);
    });
    $('btnCancelMissingFormat')?.addEventListener('click', closeMissingFormatConfirmDialog);
    $('btnConfirmMissingFormat')?.addEventListener('click', () => confirmMogiResult({ allowMissingTag: true }));
    $('mogiFormatConfirmDialog')?.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeMissingFormatConfirmDialog();
    });
    $('btnCancelDeleteMogi')?.addEventListener('click', closeDeleteMogiConfirm);
    $('btnConfirmDeleteMogi')?.addEventListener('click', confirmDeleteMogi);
    $('mogiDeleteConfirmDialog')?.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDeleteMogiConfirm();
    });
    $('mogiDeleteConfirmDialog')?.addEventListener('click', (event) => {
      if(event.target === event.currentTarget) closeDeleteMogiConfirm();
    });
    $('mogiFormatConfirmDialog')?.addEventListener('click', (event) => {
      if(event.target === $('mogiFormatConfirmDialog')) closeMissingFormatConfirmDialog();
    });
    $('btnCloseSessionForecast')?.addEventListener('click', closeSessionForecastDialog);
    $('sessionForecastDialog')?.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSessionForecastDialog();
    });
    $('sessionForecastDialog')?.addEventListener('click', (event) => {
      if(event.target === event.currentTarget) closeSessionForecastDialog();
    });
    const raceEditDialog = $('savedRaceEditDialog');
    raceEditDialog?.addEventListener('click', (event) => {
      if(event.target === raceEditDialog) closeSavedRaceEdit();
    });
    raceEditDialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSavedRaceEdit();
    });
    document.querySelectorAll('[data-race-edit-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setSavedRaceEditMode(btn.dataset.raceEditMode));
    });
    document.querySelectorAll('[data-race-edit-lobby]').forEach((btn) => {
      btn.addEventListener('click', () => setSavedRaceEditLobby(btn.dataset.raceEditLobby));
    });
    $('savedRaceEditDc')?.addEventListener('click', toggleSavedRaceEditDisconnect);
    $('savedRaceEditPlacementSelect')?.addEventListener('change', updateSavedRaceEditPoints);
    $('savedRaceEditStartSelect')?.addEventListener('change', () => {
      fillSavedRaceEditRouteSelects(
        $('savedRaceEditStartSelect')?.value || '',
        $('savedRaceEditEndSelect')?.value || ''
      );
      refreshRaceEditPickers();
    });
    $('savedRaceEditEndSelect')?.addEventListener('change', () => {
      fillSavedRaceEditRouteSelects(
        $('savedRaceEditStartSelect')?.value || '',
        $('savedRaceEditEndSelect')?.value || ''
      );
      refreshRaceEditPickers();
    });
    $('btnCancelSavedRaceEdit')?.addEventListener('click', closeSavedRaceEdit);
    $('btnSaveSavedRaceEdit')?.addEventListener('click', saveSavedRaceEdit);
    $('btnSessionPrev')?.addEventListener('click', () => { if(state.sessionPage <= 1) return; state.sessionPage -= 1; renderSessions(); persist(); });
    $('btnSessionNext')?.addEventListener('click', () => { const maxPage = Math.max(1, Math.ceil(state.sessions.length / SESSION_PAGE_SIZE)); if(state.sessionPage >= maxPage) return; state.sessionPage += 1; renderSessions(); persist(); });
    window.addEventListener('storage', (ev) => {
      if(isAuthStorageKey(ev.key)){
        location.reload();
        return;
      }
      if(isCloud()) return;
      loadAll();
      refresh();
    });
    document.addEventListener('visibilitychange', scheduleCloudFocusRefresh);
    window.addEventListener('focus', scheduleCloudFocusRefresh);
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
            if(info) info.textContent = profileDisplayLabel(await loadAccountProfileName(session, client));
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
            if(info) info.textContent = profileDisplayLabel('Guest', 'Guest');
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
    await loadTrackIconMap();
    scheduleLoungePickerIconWarmup();
    if(PAGE_CONFIG.allowIntermissionRoutes) await loadStratsMeta();
    setEntryMode('track');
    initIntermissionRouteFilters();
    updatePlacementOptions();
    initLoungePickers();
    bind();
    refresh();
    if((state.current?.races || []).length >= 12) openMogiResultDialog();
  }
  init();
})();
