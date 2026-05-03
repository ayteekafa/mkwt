(() => {
  const GUEST_WW_KEY = "mkwt_guest_matches_v1";
  const LOUNGE_SESSION_KEYS = {
    12: "mkwt_lounge_sessions_v1",
    24: "mkwt_lounge24_sessions_v1",
  };
  const NON_LOUNGE_FORMAT_TAG = "Non-Lounge";

  function readJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      return fallback;
    }
  }

  function finiteNumber(value){
    if(value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function cleanTrack(value){
    return String(value || "").trim();
  }

  function normalizeLoungeFormatTag(value){
    const raw = cleanTrack(value);
    if(!raw) return "";
    return raw.replace(/[\s_-]+/g, "").toLowerCase() === "nonlounge" ? NON_LOUNGE_FORMAT_TAG : raw;
  }

  function loungeSessionStatsExcluded(session){
    const tag = normalizeLoungeFormatTag(session?.loungeFormatTag || session?.lounge_format_tag || "");
    const excluded = session?.statsExcluded === true || session?.stats_excluded === true;
    return tag === NON_LOUNGE_FORMAT_TAG && excluded;
  }

  function isIntermissionRace(race){
    const kind = String(race?.raceKind || race?.race_kind || "").trim().toLowerCase();
    if(kind === "intermission") return true;
    return !!(
      cleanTrack(race?.intermissionStart || race?.intermission_start) ||
      cleanTrack(race?.intermissionEnd || race?.intermission_end)
    );
  }

  function normalizedFinishScore(placement, lobbySize){
    const place = finiteNumber(placement);
    const size = finiteNumber(lobbySize);
    if(place == null || size == null || size < 2 || place < 1 || place > size) return null;
    return ((size - place) / (size - 1)) * 100;
  }

  function addTrackMetric(map, track, value){
    if(!track || !Number.isFinite(value)) return;
    const row = map.get(track) || { track, sum: 0, count: 0 };
    row.sum += value;
    row.count += 1;
    map.set(track, row);
  }

  function finalizeRows(map){
    return Array.from(map.values())
      .map((row) => ({
        track: row.track,
        avg: row.count ? row.sum / row.count : 0,
        count: row.count || 0,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || b.avg - a.avg || a.track.localeCompare(b.track, "en"));
  }

  function aggregateWorldWideTrackRows(matches){
    const map = new Map();
    for(const match of matches || []){
      const track = cleanTrack(match?.track);
      const intermission = cleanTrack(match?.intermission);
      if(!track || intermission) continue;
      const vrGain = finiteNumber(match?.vr_change);
      if(vrGain == null) continue;
      addTrackMetric(map, track, vrGain);
    }
    return finalizeRows(map);
  }

  function aggregateLoungeTrackRowsFromRaces(races){
    const map = new Map();
    for(const race of races || []){
      if(!race || race.disconnect) continue;
      if(isIntermissionRace(race)) continue;
      const track = cleanTrack(race?.track);
      const points = finiteNumber(race?.points);
      if(points == null) continue;
      addTrackMetric(map, track, points);
    }
    return finalizeRows(map);
  }

  function aggregateLoungeTrackRowsFromSessions(sessions){
    const races = [];
    for(const session of sessions || []){
      if(loungeSessionStatsExcluded(session)) continue;
      for(const race of session?.races || []){
        races.push(race);
      }
    }
    return aggregateLoungeTrackRowsFromRaces(races);
  }

  function guestWorldWideMatches(){
    if(typeof window.loadGuestMatches === "function"){
      try{ return window.loadGuestMatches() || []; }catch(e){}
    }
    return readJson(GUEST_WW_KEY, []);
  }

  async function loadWorldWideTrackRows(options = {}){
    const { isGuest = true, supabaseClient = null, session = null } = options;
    if(isGuest || !supabaseClient || !session?.user?.id){
      return aggregateWorldWideTrackRows(guestWorldWideMatches());
    }

    const all = [];
    const pageSize = 1000;
    let from = 0;
    while(true){
      const { data, error } = await supabaseClient
        .from("matches")
        .select("track, intermission, vr_change, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if(error) throw error;
      const rows = Array.isArray(data) ? data : [];
      all.push(...rows);
      if(rows.length < pageSize) break;
      from += pageSize;
    }
    return aggregateWorldWideTrackRows(all);
  }

  function localLoungeSessions(playerCount){
    return readJson(LOUNGE_SESSION_KEYS[Number(playerCount)] || "", []);
  }

  async function loadLoungeTrackRowsByPlayerCount(options = {}){
    const {
      playerCount = 12,
      isGuest = true,
      supabaseClient = null,
      session = null,
    } = options;

    if(isGuest || !supabaseClient || !session?.user?.id){
      return aggregateLoungeTrackRowsFromSessions(localLoungeSessions(playerCount));
    }

    const mogis = [];
    const pageSize = 1000;
    let from = 0;
    while(true){
      const { data, error } = await supabaseClient
        .from("lounge_mogis")
        .select("id, lounge_format_tag, stats_excluded")
        .eq("user_id", session.user.id)
        .eq("player_count", Number(playerCount))
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if(error) throw error;
      const rows = Array.isArray(data) ? data : [];
      mogis.push(...rows);
      if(rows.length < pageSize) break;
      from += pageSize;
    }

    const mogiIds = mogis
      .filter((row) => !loungeSessionStatsExcluded(row))
      .map((row) => String(row.id || "").trim())
      .filter(Boolean);
    if(!mogiIds.length) return [];

    const races = [];
    const chunkSize = 200;
    for(let index = 0; index < mogiIds.length; index += chunkSize){
      const chunk = mogiIds.slice(index, index + chunkSize);
      const { data, error } = await supabaseClient
        .from("lounge_races")
        .select("mogi_id, track, race_kind, intermission_start, intermission_end, lobby_size, placement, points, disconnect")
        .eq("user_id", session.user.id)
        .in("mogi_id", chunk);
      if(error) throw error;
      races.push(...((data || []).map((row) => ({
        track: row.track,
        raceKind: row.race_kind,
        intermissionStart: row.intermission_start,
        intermissionEnd: row.intermission_end,
        lobbySize: row.lobby_size,
        placement: row.placement,
        points: row.points,
        disconnect: !!row.disconnect,
      }))));
    }

    return aggregateLoungeTrackRowsFromRaces(races);
  }

  function summarizeRows(rows){
    const playedTracks = (rows || []).filter((row) => Number(row?.count) > 0).length;
    const totalRaces = (rows || []).reduce((sum, row) => sum + Number(row?.count || 0), 0);
    return { playedTracks, totalRaces };
  }

  async function loadBestLoungeTrackRows(options = {}){
    const [rows12, rows24] = await Promise.all([
      loadLoungeTrackRowsByPlayerCount({ ...options, playerCount: 12 }),
      loadLoungeTrackRowsByPlayerCount({ ...options, playerCount: 24 }),
    ]);
    const summary12 = summarizeRows(rows12);
    const summary24 = summarizeRows(rows24);
    if(!summary12.totalRaces && !summary24.totalRaces){
      return { label: "Lounge", playerCount: null, rows: [] };
    }
    if(summary24.totalRaces > summary12.totalRaces){
      return { label: "Lounge 24p", playerCount: 24, rows: rows24 };
    }
    return { label: "Lounge 12p", playerCount: 12, rows: rows12 };
  }

  function sortPerformanceRows(rows){
    return [...(rows || [])].sort((a, b) => {
      const avgDiff = Number(b?.avg || 0) - Number(a?.avg || 0);
      if(avgDiff) return avgDiff;
      const countDiff = Number(b?.count || 0) - Number(a?.count || 0);
      if(countDiff) return countDiff;
      return String(a?.track || "").localeCompare(String(b?.track || ""), "en");
    });
  }

  function assignRankPoints(rows){
    const ranked = sortPerformanceRows(rows);
    const total = ranked.length;
    return ranked.map((row, index) => ({
      track: row.track,
      avg: Number(row.avg || 0),
      count: Number(row.count || 0),
      rank: index + 1,
      points: total - index,
    }));
  }

  function buildRankComparisonRows(primaryRows, secondaryRows, options = {}){
    const {
      primaryLabel = "Primary",
      secondaryLabel = "Secondary",
      limit = 30,
      minCount = 10,
    } = options;
    const primaryMap = new Map((primaryRows || []).map((row) => [row.track, row]));
    const secondaryMap = new Map((secondaryRows || []).map((row) => [row.track, row]));
    const sharedTracks = [];

    for(const track of primaryMap.keys()){
      if(!secondaryMap.has(track)) continue;
      const primary = primaryMap.get(track);
      const secondary = secondaryMap.get(track);
      if(Number(primary?.count || 0) < minCount) continue;
      if(Number(secondary?.count || 0) < minCount) continue;
      sharedTracks.push(track);
    }
    if(!sharedTracks.length) return [];

    const primaryRanked = assignRankPoints(sharedTracks.map((track) => primaryMap.get(track)));
    const secondaryRanked = assignRankPoints(sharedTracks.map((track) => secondaryMap.get(track)));
    const primaryRankMap = new Map(primaryRanked.map((row) => [row.track, row]));
    const secondaryRankMap = new Map(secondaryRanked.map((row) => [row.track, row]));

    const rows = sharedTracks.map((track) => {
      const primary = primaryRankMap.get(track);
      const secondary = secondaryRankMap.get(track);
      const primaryPoints = Number(primary?.points || 0);
      const secondaryPoints = Number(secondary?.points || 0);
      return {
        track,
        primaryLabel,
        secondaryLabel,
        primary: Number(primary?.avg || 0),
        secondary: Number(secondary?.avg || 0),
        primaryCount: Number(primary?.count || 0),
        secondaryCount: Number(secondary?.count || 0),
        primaryRank: Number(primary?.rank || 0),
        secondaryRank: Number(secondary?.rank || 0),
        primaryPoints,
        secondaryPoints,
        totalPoints: primaryPoints + secondaryPoints,
        pointGap: primaryPoints - secondaryPoints,
      };
    });

    rows.sort((a, b) => {
      const totalDiff = b.totalPoints - a.totalPoints;
      if(totalDiff) return totalDiff;
      const gapDiff = Math.abs(b.pointGap) - Math.abs(a.pointGap);
      if(gapDiff) return gapDiff;
      return a.track.localeCompare(b.track, "en");
    });

    return rows.slice(0, limit);
  }

  function buildComparisonNotes(rows, options = {}){
    const {
      primaryLabel = "Primary",
      secondaryLabel = "Secondary",
      gapThreshold = 10,
      limit = 6,
    } = options;

    return [...(rows || [])]
      .filter((row) => Math.abs(Number(row?.pointGap || 0)) > gapThreshold)
      .sort((a, b) => Math.abs(Number(b?.pointGap || 0)) - Math.abs(Number(a?.pointGap || 0)))
      .slice(0, limit)
      .map((row) => {
        const primaryWins = Number(row.pointGap || 0) > 0;
        const strongerLabel = primaryWins ? primaryLabel : secondaryLabel;
        const weakerLabel = primaryWins ? secondaryLabel : primaryLabel;
        const strongerPoints = primaryWins ? row.primaryPoints : row.secondaryPoints;
        const weakerPoints = primaryWins ? row.secondaryPoints : row.primaryPoints;
        const strongerRank = primaryWins ? row.primaryRank : row.secondaryRank;
        const weakerRank = primaryWins ? row.secondaryRank : row.primaryRank;
        return {
          track: row.track,
          strongerLabel,
          weakerLabel,
          gap: Math.abs(Number(row.pointGap || 0)),
          text: `${row.track}: strong in ${strongerLabel} (${strongerPoints} pts, rank #${strongerRank}) but much weaker in ${weakerLabel} (${weakerPoints} pts, rank #${weakerRank}).`,
        };
      });
  }

  function buildComparisonRows(primaryRows, secondaryRows, options = {}){
    const {
      primaryLabel = "Primary",
      secondaryLabel = "Secondary",
      limit = 30,
      sort = "delta_desc",
    } = options;
    const primaryMap = new Map((primaryRows || []).map((row) => [row.track, row]));
    const secondaryMap = new Map((secondaryRows || []).map((row) => [row.track, row]));
    const rows = [];

    for(const [track, primary] of primaryMap.entries()){
      const secondary = secondaryMap.get(track);
      if(!secondary) continue;
      rows.push({
        track,
        primaryLabel,
        secondaryLabel,
        primary: Number(primary.avg || 0),
        secondary: Number(secondary.avg || 0),
        primaryCount: Number(primary.count || 0),
        secondaryCount: Number(secondary.count || 0),
        delta: Number(primary.avg || 0) - Number(secondary.avg || 0),
      });
    }

    rows.sort((a, b) => {
      if(sort === "abs_delta_desc"){
        const diff = Math.abs(b.delta) - Math.abs(a.delta);
        if(diff) return diff;
      }else{
        const diff = b.delta - a.delta;
        if(diff) return diff;
      }
      const avgDiff = (b.primary + b.secondary) - (a.primary + a.secondary);
      if(avgDiff) return avgDiff;
      return a.track.localeCompare(b.track, "en");
    });

    return rows.slice(0, limit);
  }

  function comparisonMetaText(primaryLabel, secondaryLabel, sharedCount, minCount = 10){
    const count = Number(sharedCount || 0);
    if(count > 1){
      return `${primaryLabel} vs ${secondaryLabel}. Only shared tracks with at least ${minCount} plays in both modes are included. Each mode ranks that filtered pool by its own native performance, then converts ranks to points: best shared track gets ${count} points, last gets 1.`;
    }
    return `${primaryLabel} vs ${secondaryLabel}. Only shared tracks with at least ${minCount} plays in both modes are included. Each mode ranks that filtered pool by its own native performance, then converts ranks to points.`;
  }

  window.MKWTModeCompare = {
    normalizedFinishScore,
    aggregateWorldWideTrackRows,
    aggregateLoungeTrackRowsFromSessions,
    loadWorldWideTrackRows,
    loadLoungeTrackRowsByPlayerCount,
    loadBestLoungeTrackRows,
    buildRankComparisonRows,
    buildComparisonNotes,
    buildComparisonRows,
    comparisonMetaText,
  };
})();
