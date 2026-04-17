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
  const MKCENTRAL_SETTINGS_KEY = 'mkwt_mkcentral_player_ref_v1';
  const MKCENTRAL_SEASON = '2';
  const MKCENTRAL_PLAYER_COUNT = '12';
  const SESSION_PAGE_SIZE = 10;
  const AVG_GAIN_THRESHOLD = 6.83;
  window.MKWT_LOUNGE_STORAGE = { current: STORAGE_CURRENT, sessions: STORAGE_SESSIONS };

  const $ = (id) => document.getElementById(id);
  const state = { lobbySize: 12, current: null, sessions: [], chart: null, placementChart: null, lastTrackStats: [], lastSelectedTrack: null, trackSortKey: 'avg', trackSortDir: 'desc', sessionPage: 1, openSessionDetails: {}, editingSessionIndex: null, mkcentralMatches: {}, mkcentralPlayerId: '' };
  let loungeClient = null;
  let loungeSession = null;
  let cloudMode = false;
  let isBound = false;

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
    const arr = SCORE_MAP[Number(lobbySize)] || SCORE_MAP[12];
    const idx = Number(placement) - 1;
    return Number.isInteger(idx) && idx >= 0 && idx < arr.length ? arr[idx] : null;
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
  function makeFreshMogi(){
    return { created_at: currentTs(), races: [], totalPoints: 0, disconnects: 0, saved: false };
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
      .select('id, created_at, completed_at, updated_at, status, total_points, race_count, disconnects')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (mogiError) throw mogiError;

    const { data: races, error: raceError } = await loungeClient
      .from('lounge_races')
      .select('id, mogi_id, race_number, track, lobby_size, placement, points, disconnect, created_at, updated_at')
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
        race_count: 0,
        total_points: 0,
        disconnects: 0,
      })
      .select('id, created_at, completed_at, updated_at, status, total_points, race_count, disconnects')
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
    const lobby = Number(state.lobbySize) || 12;
    const prev = Number(sel.value || 0);
    sel.innerHTML = '<option value="">Select placement</option>' + Array.from({length:lobby}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    if(prev && prev <= lobby) sel.value = String(prev);
    $('scorePreview').textContent = `Points: ${SCORE_MAP[lobby].join(' / ')}`;
    document.querySelectorAll('#lobbyGroup .navAction').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.lobby) === lobby));
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
    if(saveBtn){
      saveBtn.textContent = isComplete ? 'Confirm Mogi' : 'Track';
      saveBtn.title = isComplete ? 'Open the result confirmation again' : '';
    }
    if(dcBtn){
      dcBtn.disabled = isComplete;
      dcBtn.title = isComplete ? 'Confirm this Mogi before adding another race' : '';
    }

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
        <td>${r.placement ?? '–'}</td>
        <td>${r.points}</td>
        <td>${r.disconnect ? '<span class="badge">DC</span>' : 'Normal'}</td>
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
  function aggregatePlacementStats(){
    const counts = Array.from({ length: 12 }, (_, i) => ({ placement: i + 1, count: 0 }));
    for(const session of state.sessions){
      for(const race of (session.races || [])){
        if(race.disconnect) continue;
        const placement = Number(race.placement);
        if(Number.isInteger(placement) && placement >= 1 && placement <= 12) {
          counts[placement - 1].count += 1;
        }
      }
    }
    return counts;
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
    const sortedStats = sortTrackStats(stats);
    state.lastTrackStats = sortedStats;
    updateSortButtons();
    const labels = sortedStats.map(s => s.track);
    const values = sortedStats.map(s => Number(s.avg.toFixed(2)));
    const colors = sortedStats.map(s => s.avg >= AVG_GAIN_THRESHOLD ? 'rgba(77,163,25,0.85)' : 'rgba(255,80,80,0.85)');
    const borders = sortedStats.map(s => s.avg >= AVG_GAIN_THRESHOLD ? 'rgb(77,163,25)' : 'rgb(255,80,80)');
    const ctx = $('chartTrackAvg');
    if(state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Average points', data: values, backgroundColor: colors, borderColor: borders, borderWidth: 1 }] },
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
                return [`AVG points: ${avg}`, `Played: ${count}`];
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
    if(state.placementChart) state.placementChart.destroy();
    const labels = stats.map(s => String(s.placement));
    const values = stats.map(s => s.count);
    state.placementChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Placements', data: values, borderWidth: 1 }]
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
              label: (ctx) => `${ctx.parsed.y || 0} races`
            }
          }
        }
      }
    });
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
    if(mogiCountEl) mogiCountEl.textContent = String(mogiCount);
    if(avgEl) avgEl.textContent = avgMogi.toFixed(2);
    toneAvgElement(avgEl, avgMogi, raceCount > 0);
    if(raceCountEl) raceCountEl.textContent = String(raceCount);
    if(dcCountEl) dcCountEl.textContent = String(dcCount);
    if(bestTrackName) bestTrackName.textContent = bestTrack ? bestTrack.track : 'Not enough data';
    if(bestTrackMeta) bestTrackMeta.textContent = bestTrack ? `${bestTrack.avg.toFixed(2)} AVG · ${bestTrack.count} plays` : 'Best Track starts after 5 plays on one track.';
  }
  function refresh(){
    computeMkcentralMatches();
    renderCurrent();
    const stats = aggregateTrackStats();
    renderHeroSummary(stats);
    renderSessions();
    renderChart(stats);
    renderPlacementChart(aggregatePlacementStats());
    renderTrackInsight(state.lastSelectedTrack && stats.some(s => s.track === state.lastSelectedTrack) ? state.lastSelectedTrack : null);
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
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(race.track)}</td>
          <td>${race.lobbySize}p</td>
          <td>${race.placement ?? '–'}</td>
          <td>${race.points}</td>
          <td>${race.disconnect ? '<span class="badge">DC</span>' : 'Normal'}</td>
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
  async function saveRace({disconnect=false}){
    try {
      if((state.current.races || []).length >= 12){
        setStatus('This Mogi has 12 races. Confirm the result before starting another race.', true);
        openMogiResultDialog();
        return;
      }
      const track = $('trackSelect').value;
      const placement = Number($('placementSelect').value || 0);
      const lobbySize = Number(state.lobbySize || 12);
      if(!track){ setStatus('Please select a track.', false); return; }
      if(!placement){ setStatus('Please select a placement.', false); return; }
      const points = getPoints(lobbySize, placement);
      if(points == null){ setStatus('Invalid placement for this lobby size.', false); return; }
      const race = {
        track,
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
          .select('id, mogi_id, race_number, track, lobby_size, placement, points, disconnect, created_at, updated_at')
          .single();
        if (error) throw error;
        state.current.races.push(dbRaceToLocal(data));
        await updateCloudMogi(state.current);
      } else {
        state.current.races.push(race);
      }

      $('trackSelect').value = '';
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
    return TRACKS.map(track => `<option value="${escapeHtml(track)}"${track === selected ? ' selected' : ''}>${escapeHtml(track)}</option>`).join('');
  }
  function buildLobbyOptions(selected){
    return [12,11,10].map(size => `<option value="${size}"${Number(selected) === size ? ' selected' : ''}>${size}p</option>`).join('');
  }
  function buildPlacementOptionsForLobby(lobbySize, placement){
    const max = Number(lobbySize) || 12;
    const opts = ['<option value="">Select</option>'];
    for(let i = 1; i <= max; i += 1){
      opts.push(`<option value="${i}"${Number(placement) === i ? ' selected' : ''}>${i}</option>`);
    }
    return opts.join('');
  }
  function renderSessionViewRows(races){
    return (races || []).map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.track)}</td>
          <td>${r.lobbySize}p</td>
          <td>${r.placement ?? '–'}</td>
          <td>${r.points}</td>
          <td>${r.disconnect ? '<span class="badge">DC</span>' : 'Normal'}</td>
        </tr>`).join('');
  }
  function renderSessionEditRows(races){
    return (races || []).map((r, i) => `
      <tr data-edit-row="${i}">
        <td>${i + 1}</td>
        <td><select class="sessionEditSelect" data-edit-track>${buildTrackOptions(r.track)}</select></td>
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
    const lobby = Number(lobbySel?.value || 12);
    const prevPlacement = Number(placementSel?.value || 0);
    if(placementSel){
      placementSel.innerHTML = buildPlacementOptionsForLobby(lobby, prevPlacement);
      if(prevPlacement > lobby) placementSel.value = '';
    }
    const placement = Number(placementSel?.value || 0);
    const p = getPoints(lobby, placement);
    const points = p == null ? '–' : p;
    if(pointsCell) pointsCell.textContent = String(points);
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
      const lobbySize = Number(row.querySelector('[data-edit-lobby]')?.value || 12);
      const type = row.querySelector('[data-edit-type]')?.value || 'normal';
      const disconnect = type === 'disconnect';
      const placement = Number(row.querySelector('[data-edit-placement]')?.value || 0);
      if(!track){ setStatus('Each race needs a track.', false); return; }
      if(!placement){ setStatus('Each race needs a placement.', false); return; }
      const points = getPoints(lobbySize, placement);
      if(points == null){ setStatus('One edited race has an invalid placement.', false); return; }
      races.push({
        ...session.races[Number(row.getAttribute('data-edit-row'))],
        track,
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
            .select('id, mogi_id, race_number, track, lobby_size, placement, points, disconnect, created_at, updated_at');
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
    document.querySelectorAll('#lobbyGroup .navAction').forEach(btn => btn.addEventListener('click', () => {
      state.lobbySize = Number(btn.dataset.lobby || 12);
      updatePlacementOptions();
    }));
    $('btnSortPerformance')?.addEventListener('click', () => setTrackSort('avg'));
    $('btnSortPlayed')?.addEventListener('click', () => setTrackSort('count'));
    $('btnSaveRace').addEventListener('click', () => saveRace({disconnect:false}));
    $('btnDisconnect').addEventListener('click', () => saveRace({disconnect:true}));
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
          pageName: 'lounge.html',
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
    updatePlacementOptions();
    bind();
    refresh();
    if((state.current?.races || []).length >= 12) openMogiResultDialog();
  }
  init();
})();
