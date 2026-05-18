(() => {
  const COURSE_TRACKS = [
    "Acorn Heights","Airship Fortress","Boo Cinema","Bowser's Castle","Cheep Cheep Falls",
    "Choco Mountain","Crown City","Dandelion Depths","Desert Hills","Dino Dino Jungle",
    "DK Pass","DK Spaceport","Dry Bones Burnout","Faraway Oasis","Great ? Block Ruins",
    "Koopa Troopa Beach","Mario Circuit","Mario Bros. Circuit","Moo Moo Meadows",
    "Peach Beach","Peach Stadium","Rainbow Road","Salty Salty Speedway","Shy Guy Bazaar",
    "Sky-High Sundae","Starview Peak","Toad's Factory","Wario Shipyard","Wario Stadium","Whistlestop Summit"
  ];
  const SCORE_MAP = {
    "6v6": [15,12,10,9,8,7,6,5,4,3,2,1],
    "6v6v6v6": [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1]
  };
  const EVENT_LABELS = { "6v6": "6v6", "6v6v6v6": "6v18" };
  const STORAGE_CURRENT = "mkwt_clan_wars_current_v1";
  const STORAGE_MATCHES = "mkwt_clan_wars_matches_v1";
  const STORAGE_ACTIVE_CLAN = "mkwt_clan_wars_active_clan_v1";
  const ACTIVE_CLAN_PERSONAL_SCOPE = "personal";
  const MAX_RACES = 12;
  const TEAM_SIZE = 6;
  const SAVED_MATCH_PAGE_SIZE = 8;
  const CLAN_RESTORE_TIMEOUT_MS = 4000;
  const MIN_TRACK_PLAYS_FOR_HIGHLIGHT = 10;
  const SUGGESTION_MIN_PLAYS = 10;
  const QUERY_BATCH_SIZE = 100;
  const CLOUD_RACE_PAGE_SIZE = 1000;
  const CLAN_ICON_BUCKET = "clan-icons";
  const CLAN_ICON_SIZE = 256;
  const CLAN_ICON_MAX_BYTES = 4 * 1024 * 1024;
  const CLAN_WARS_RACE_SELECT = "id, match_id, race_number, event_type, race_kind, track, intermission_start, intermission_end, placements, max_placement, own_points, opponent_points, field_points, dc, rule_warning, created_at, updated_at";
  const CLAN_WARS_MATCH_SELECT = "id, owner_user_id, clan_id, event_type, status, own_total, opponent_total, field_total, race_count, dc_count, division_tag, opponent_clan_name, created_by_user_id, completed_at, created_at, updated_at";
  const CLAN_MEMBER_SELECT = "user_id, role, status, display_name";
  const $ = (id) => document.getElementById(id);
  let trackIconPaths = new Map();
  const clanWarPickerIconReadyPaths = new Set();
  const clanWarPickerIconFailedPaths = new Set();
  const clanWarPickerIconPreloadPromises = new Map();
  let clanWarPickerIconWarmupPromise = null;
  let clanWarPickerIconRefreshQueued = false;
  let stratsMetaIntermissions = null;
  let clanWarPickerApi = null;
  let resultPickerApi = null;
  let activeClanLetterDrag = false;
  let clanJoinErrorTimer = 0;

  function pulseMobileLetterHaptic(){
    const nav = window.navigator;
    if(!nav || typeof nav.vibrate !== "function") return;
    const isTouchDevice = Number(nav.maxTouchPoints || 0) > 0;
    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
    if(!isTouchDevice && !isCoarsePointer) return;
    try{ nav.vibrate(8); }catch(e){}
  }

  const state = {
    mode: "guest",
    session: null,
    client: null,
    eventType: "6v6",
    selectedDivisionTag: "",
    raceKind: "track",
    entryStarted: false,
    entryDc: false,
    selectedPlacements: [],
    pendingPlacements: new Set(),
    editIndex: null,
    editMatchId: "",
    editEventType: "6v6",
    editRaceKind: "track",
    editPlacements: new Set(),
    editDc: false,
    current: null,
    matches: [],
    activeClan: null,
    memberNames: new Map(),
    iconUpload: {
      file: null,
      blob: null,
      previewUrl: "",
      busy: false,
    },
    clanSearch: {
      clans: [],
      query: "",
      selectedClanId: "",
      activeIndex: 0,
      letterFilter: "all",
      open: false,
      loading: false,
      error: "",
    },
    openMatchDetails: {},
    savedMatchPage: 1,
    savedMatchTotal: null,
    resultDialogMatchId: "",
    opponentNameMatchId: "",
    divisionStatsEventType: "6v6",
    divisionStatsMatches: null,
    divisionStatsFullAccountSource: false,
    loading: true,
  };

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function showToast(message, ok = true){
    if(window.MKWT?.showToast) window.MKWT.showToast(message, ok);
    else console[ok ? "log" : "warn"](message);
  }

  function resolveClanIconUrl(iconPath, version){
    const path = String(iconPath || "").trim();
    if(!state.client || !path) return "";
    try{
      const { data } = state.client.storage.from(CLAN_ICON_BUCKET).getPublicUrl(path);
      const url = data?.publicUrl || "";
      if(!url) return "";
      const v = Number(version || 0);
      return v > 0 ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(v)}` : url;
    }catch{
      return "";
    }
  }

  function clanIconInitial(name){
    return String(name || "?").trim().charAt(0).toUpperCase() || "?";
  }

  function clanIconHtml(clan, className = "", options = {}){
    const iconUrl = clan?.iconUrl || "";
    const showEmpty = options.showEmpty !== false;
    if(!iconUrl && !showEmpty) return "";
    const classes = ["clanIconFrame", className, iconUrl ? "has-image" : "is-empty"].filter(Boolean).join(" ");
    const priority = options.priority === "high";
    const body = iconUrl
      ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="${priority ? "eager" : "lazy"}" decoding="async" fetchpriority="${priority ? "high" : "low"}">`
      : `<span class="clanIconFrame__placeholder">${escapeHtml(clanIconInitial(clan?.name))}</span>`;
    return `<span class="${classes}" aria-hidden="true">${body}</span>`;
  }

  function clanScopeButtonHtml(clan){
    if(!clan?.id) return "No clan joined";
    return `${clanIconHtml(clan, "clanIconFrame--scope", { showEmpty: false, priority: "high" })}<span>${escapeHtml(clan.name)}</span>`;
  }

  window.setStatus = function(message, ok = true){
    showToast(message, ok);
  };

  function uid(){
    try{ return crypto.randomUUID(); }catch{ return `cw_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
  }

  function nowIso(){
    return new Date().toISOString();
  }

  function scoreMap(eventType = state.eventType){
    return SCORE_MAP[eventType] || SCORE_MAP["6v6"];
  }

  function maxPlacement(eventType = state.eventType){
    return scoreMap(eventType).length;
  }

  function fieldTotal(eventType = state.eventType){
    return scoreMap(eventType).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function teamCount(eventType = state.eventType){
    return normalizeEventType(eventType) === "6v6v6v6" ? 4 : 2;
  }

  function teamAverageThreshold(eventType = state.eventType){
    return fieldTotal(eventType) / teamCount(eventType);
  }

  function formatThreshold(value){
    const num = Number(value || 0);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  }

  function formatThresholdTarget(value){
    return `>${formatThreshold(value)}`;
  }

  function matchThresholdTotal(summary, eventType = state.eventType){
    const races = Number(summary?.raceCount || 0);
    const total = Number(summary?.fieldTotal || 0);
    if(races > 0 && total > 0) return total / teamCount(eventType);
    return teamAverageThreshold(eventType);
  }

  function scoreForPlacements(placements, eventType = state.eventType){
    const map = scoreMap(eventType);
    return (placements || []).reduce((sum, place) => sum + Number(map[Number(place) - 1] || 0), 0);
  }

  function normalizeEventType(value){
    return value === "6v6v6v6" ? "6v6v6v6" : "6v6";
  }

  function routeLabel(start, end){
    return `${start} -> ${end}`;
  }

  function safeReadJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    }catch{
      return fallback;
    }
  }

  function safeWriteJson(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(e){
      console.warn(e);
      showToast("Local storage is full or blocked.", false);
      return false;
    }
  }

  function activeClanStorageKey(){
    const uidValue = state.session?.user?.id || "guest";
    return `${STORAGE_ACTIVE_CLAN}_${uidValue}`;
  }

  function normalizeClan(raw){
    if(!raw || typeof raw !== "object") return null;
    const id = String(raw.id || raw.clan_id || "").trim();
    const name = String(raw.name || raw.clan_name || "").trim();
    if(!id || !name) return null;
    const rawDivisions = raw.divisions || raw.clan_divisions || [];
    const divisions = Array.isArray(rawDivisions)
      ? rawDivisions.map((item) => normalizeDivisionTag(typeof item === "string" ? item : item?.name)).filter(Boolean)
      : [];
    return {
      id,
      name,
      slug: String(raw.slug || raw.clan_slug || "").trim(),
      role: String(raw.role || raw.membership_role || "").trim(),
      createdByUserId: String(raw.created_by_user_id || raw.createdByUserId || "").trim(),
      iconPath: String(raw.icon_path || raw.iconPath || "").trim(),
      iconVersion: Number(raw.icon_version || raw.iconVersion || 0) || 0,
      iconUpdatedAt: String(raw.icon_updated_at || raw.iconUpdatedAt || "").trim(),
      iconUrl: resolveClanIconUrl(raw.icon_path || raw.iconPath, raw.icon_version || raw.iconVersion),
      divisions: Array.from(new Set(divisions)),
    };
  }

  function persistActiveClan(){
    if(state.mode !== "account") return;
    if(state.activeClan) safeWriteJson(activeClanStorageKey(), state.activeClan);
    else localStorage.removeItem(activeClanStorageKey());
  }

  function persistPersonalClanScope(){
    if(state.mode !== "account") return;
    safeWriteJson(activeClanStorageKey(), { scope: ACTIVE_CLAN_PERSONAL_SCOPE });
  }

  function isPersonalClanSelection(raw){
    return !!raw && typeof raw === "object" && raw.scope === ACTIVE_CLAN_PERSONAL_SCOPE;
  }

  function withTimeout(promise, timeoutMs, message){
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  function normalizeRace(raw){
    if(!raw || typeof raw !== "object") return null;
    const eventType = normalizeEventType(raw.eventType || raw.event_type);
    const placements = Array.isArray(raw.placements)
      ? raw.placements.map(Number).filter(Number.isFinite)
      : [];
    if(placements.length !== TEAM_SIZE) return null;
    const raceKind = raw.raceKind || raw.race_kind || "track";
    const track = String(raw.track || "").trim();
    if(!track) return null;
    return {
      id: raw.id || uid(),
      raceNumber: Number(raw.raceNumber || raw.race_number || 1),
      eventType,
      raceKind: raceKind === "intermission" ? "intermission" : "track",
      track,
      intermissionStart: raw.intermissionStart || raw.intermission_start || null,
      intermissionEnd: raw.intermissionEnd || raw.intermission_end || null,
      placements,
      maxPlacement: Number(raw.maxPlacement || raw.max_placement || maxPlacement(eventType)),
      ownPoints: Number(raw.ownPoints ?? raw.own_points ?? scoreForPlacements(placements, eventType)),
      opponentPoints: raw.opponentPoints ?? raw.opponent_points ?? null,
      fieldPoints: Number(raw.fieldPoints || raw.field_points || fieldTotal(eventType)),
      dc: raw.dc === true || raw.disconnect === true,
      ruleWarning: raw.ruleWarning || raw.rule_warning || "",
      createdAt: raw.createdAt || raw.created_at || nowIso(),
    };
  }

  function summarizeMatch(match){
    const races = Array.isArray(match?.races) ? match.races : [];
    const ownTotal = races.reduce((sum, race) => sum + Number(race.ownPoints || 0), 0);
    const eventType = normalizeEventType(match?.eventType || match?.event_type);
    const raceFieldTotal = fieldTotal(eventType);
    const field = races.reduce((sum, race) => sum + Number(race.fieldPoints || raceFieldTotal), 0);
    return {
      raceCount: races.length,
      ownTotal,
      fieldTotal: field,
      opponentTotal: eventType === "6v6" ? field - ownTotal : null,
      dcCount: races.filter((race) => race.dc).length,
    };
  }

  function normalizeMatch(raw){
    if(!raw || typeof raw !== "object") return null;
    const races = (Array.isArray(raw.races) ? raw.races : []).map(normalizeRace).filter(Boolean)
      .sort((a, b) => a.raceNumber - b.raceNumber);
    const eventType = normalizeEventType(raw.eventType || raw.event_type);
    const summary = summarizeMatch({ eventType, races });
    return {
      id: raw.id || uid(),
      eventType,
      status: raw.status === "completed" || races.length >= MAX_RACES ? "completed" : "active",
      scopeType: raw.scopeType || raw.scope_type || "personal",
      clanId: raw.clanId || raw.clan_id || null,
      ownerUserId: raw.ownerUserId || raw.owner_user_id || null,
      createdByUserId: raw.createdByUserId || raw.created_by_user_id || null,
      createdAt: raw.createdAt || raw.created_at || nowIso(),
      completedAt: raw.completedAt || raw.completed_at || null,
      divisionTag: normalizeDivisionTag(raw.divisionTag || raw.division_tag || raw.clanDivisionTag || raw.clan_division_tag || ""),
      opponentClanName: normalizeOpponentClanName(raw.opponentClanName || raw.opponent_clan_name || raw.enemyClanName || raw.enemy_clan_name || ""),
      races,
      ...summary,
    };
  }

  function normalizeOpponentClanName(value){
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 48);
  }

  function matchOpponentLabel(match){
    return normalizeOpponentClanName(match?.opponentClanName || match?.opponent_clan_name) || "Enemy";
  }

  function normalizeDivisionTag(value){
    return String(value || "").trim();
  }

  function divisionKey(tag){
    const normalized = normalizeDivisionTag(tag).toLowerCase();
    return normalized || "__clan__";
  }

  function divisionLabel(tag){
    return normalizeDivisionTag(tag) || "Clan";
  }

  function clanDivisionSlots(){
    if(!state.activeClan) return [];
    const divisions = Array.from(new Set((state.activeClan.divisions || []).map(normalizeDivisionTag).filter(Boolean)));
    if(divisions.length >= 2 && !divisions.some((division) => division.toLowerCase() === "mixed")){
      divisions.push("Mixed");
    }
    return divisions;
  }

  function hasDivisionSlots(){
    return !!state.activeClan && clanDivisionSlots().length > 0;
  }

  function matchHasActiveClanDivisions(match = null){
    const activeClanId = String(state.activeClan?.id || "");
    if(!activeClanId) return false;
    const matchClanId = String(match?.clanId || match?.clan_id || activeClanId);
    return matchClanId === activeClanId;
  }

  function divisionTagOptions(match = null){
    if(!matchHasActiveClanDivisions(match)) return [];
    return clanDivisionSlots();
  }

  function divisionTagPillHtml(tag){
    const normalized = normalizeDivisionTag(tag);
    return normalized ? `<span class="sessionFormatTag clanWarsDivisionPill">${escapeHtml(normalized)}</span>` : "";
  }

  function savedMatchMetaPillHtml(label, className = ""){
    const text = String(label || "").trim();
    return text ? `<span class="clanWarsSavedMetaPill${className ? ` ${className}` : ""}">${escapeHtml(text)}</span>` : "";
  }

  function currentList(){
    return state.current?.races || [];
  }

  function loadLocal(){
    state.current = normalizeMatch(safeReadJson(STORAGE_CURRENT, null));
    state.matches = (safeReadJson(STORAGE_MATCHES, []) || []).map(normalizeMatch).filter(Boolean);
    if(state.current) state.eventType = state.current.eventType;
    state.entryStarted = !!state.current?.races?.length;
    if(state.current?.status === "completed"){
      state.matches = mergeMatchList([state.current, ...state.matches]);
      state.current = null;
      state.entryStarted = false;
      persistLocal();
    }
  }

  function mergeMatchList(matches){
    const seen = new Set();
    return (matches || []).filter(Boolean).filter((match) => {
      if(seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function allLoadedMatches(){
    return mergeMatchList([state.current, ...state.matches]);
  }

  function trackerHeroSummary(){
    const matches = allLoadedMatches().filter((match) => Array.isArray(match?.races) && match.races.length);
    const activeMatchCount = matches.filter((match) => match.status === "active").length;
    const completedMatchCount = matches.filter((match) => match.status === "completed").length;
    const savedTotal = Number(state.savedMatchTotal);
    const matchCount = state.mode === "account" && Number.isFinite(savedTotal)
      ? savedTotal + activeMatchCount
      : matches.length;
    const matchTotals = matches.map((match) => Number(summarizeMatch(match).ownTotal || 0));
    const maxPoints = matchTotals.length ? Math.max(...matchTotals) : null;
    const avgPoints = matchTotals.length ? matchTotals.reduce((sum, value) => sum + value, 0) / matchTotals.length : null;
    const nonDcRaces = matches.flatMap((match) => match.races || []).filter((race) => !race.dc);
    const byTrack = new Map();
    nonDcRaces.forEach((race) => {
      if(race.raceKind === "intermission") return;
      const track = canonicalTrackName(race.track);
      if(!track || track === "Intermission") return;
      const key = trackKeyName(track);
      const row = byTrack.get(key) || { track, count: 0, total: 0, avg: 0 };
      row.count += 1;
      row.total += Number(race.ownPoints || 0);
      row.avg = row.count ? row.total / row.count : 0;
      byTrack.set(key, row);
    });
    const allDivisionQualified = Array.from(byTrack.values()).filter((row) => row.count >= MIN_TRACK_PLAYS_FOR_HIGHLIGHT);
    const best = allDivisionQualified.slice().sort((a, b) => {
      const avgDiff = Number(b.avg || 0) - Number(a.avg || 0);
      if(avgDiff !== 0) return avgDiff;
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if(countDiff !== 0) return countDiff;
      return String(a.track || "").localeCompare(String(b.track || ""), "en");
    })[0] || null;
    const worst = allDivisionQualified.slice().sort((a, b) => {
      const avgDiff = Number(a.avg || 0) - Number(b.avg || 0);
      if(avgDiff !== 0) return avgDiff;
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if(countDiff !== 0) return countDiff;
      return String(a.track || "").localeCompare(String(b.track || ""), "en");
    })[0] || null;
    const isPagedAccountSummary = state.mode === "account" && Number.isFinite(savedTotal) && savedTotal > completedMatchCount;
    return { matches: matchCount, races: nonDcRaces.length, maxPoints, avgPoints, best, worst, isPagedAccountSummary };
  }

  async function loadDivisionStatsMatchesFromCloud(){
    const uidValue = currentUserId();
    if(state.mode !== "account" || !state.client || !uidValue) return null;
    const columns = CLAN_WARS_MATCH_SELECT;
    const applyScope = (query) => {
      if(state.activeClan?.id) return query.eq("clan_id", state.activeClan.id);
      return query.is("clan_id", null).eq("owner_user_id", uidValue);
    };
    const activeQuery = applyScope(state.client
      .from("clan_wars_matches")
      .select(columns)
      .eq("status", "active")
      .order("created_at", { ascending: false }));
    const completedQuery = applyScope(state.client
      .from("clan_wars_matches")
      .select(columns)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1000));
    const [
      { data: activeRows, error: activeError },
      { data: completedRows, error: completedError },
    ] = await Promise.all([activeQuery, completedQuery]);
    if(activeError) throw activeError;
    if(completedError) throw completedError;
    const matchRows = mergeMatchList([...(activeRows || []), ...(completedRows || [])]);
    const ids = matchRows.map((row) => row.id).filter(Boolean);
    let raceRows = [];
    if(ids.length) raceRows = await loadRaceRowsForMatchIds(ids);
    const byMatch = new Map();
    raceRows.forEach((row) => {
      const list = byMatch.get(row.match_id) || [];
      list.push(dbRaceToLocal(row));
      byMatch.set(row.match_id, list);
    });
    const matches = matchRows.map((row) => dbMatchToLocal(row, byMatch.get(row.id) || []));
    await hydrateCloudDivisionTags(matches);
    await hydrateMemberNames(matches);
    return matches.filter((match) => !isEmptyActiveMatch(match));
  }

  function divisionStatsPickLabel(race){
    if(!race || race.dc) return "";
    if(race.raceKind === "intermission"){
      const start = canonicalTrackName(race.intermissionStart);
      const end = canonicalTrackName(race.intermissionEnd || race.track);
      if(start && end) return routeLabel(start, end);
    }
    const track = canonicalTrackName(race.track);
    return track && track !== "Intermission" ? track : "";
  }

  function buildDivisionStats(matches){
    const slotOptions = clanDivisionSlots();
    const slotIndex = new Map(slotOptions.map((tag, index) => [divisionKey(tag), index]));
    const groups = new Map();
    const ensureGroup = (tag) => {
      const normalized = normalizeDivisionTag(tag);
      const key = divisionKey(normalized);
      if(!groups.has(key)){
        groups.set(key, {
          key,
          tag: normalized,
          label: divisionLabel(normalized),
          sortIndex: slotIndex.has(key) ? slotIndex.get(key) : slotIndex.size + groups.size,
          matches: 0,
          races: 0,
          nonDcRaces: 0,
          dcCount: 0,
          uniqueTracks: 0,
          totalPoints: 0,
          racePoints: 0,
          maxPoints: null,
          marginTotal: 0,
          marginCount: 0,
          eventTypes: new Set(),
          tracks: new Map(),
          bestTrack: null,
          worstTrack: null,
        });
      }
      return groups.get(key);
    };

    slotOptions.forEach(ensureGroup);
    (matches || []).filter((match) => Array.isArray(match?.races) && match.races.length).forEach((match) => {
      const group = ensureGroup(match.divisionTag);
      const summary = summarizeMatch(match);
      const eventType = normalizeEventType(match.eventType);
      group.matches += 1;
      group.races += Number(summary.raceCount || 0);
      group.dcCount += Number(summary.dcCount || 0);
      group.totalPoints += Number(summary.ownTotal || 0);
      group.maxPoints = group.maxPoints == null ? Number(summary.ownTotal || 0) : Math.max(group.maxPoints, Number(summary.ownTotal || 0));
      group.eventTypes.add(eventType);

      const comparison = eventType === "6v6"
        ? Number(summary.opponentTotal || 0)
        : Number(matchThresholdTotal(summary, eventType));
      const margin = Number(summary.ownTotal || 0) - comparison;
      if(Number.isFinite(margin)){
        group.marginTotal += margin;
        group.marginCount += 1;
      }

      (match.races || []).forEach((race) => {
        if(race.dc) return;
        const points = Number(race.ownPoints || 0);
        group.nonDcRaces += 1;
        group.racePoints += points;
        const label = divisionStatsPickLabel(race);
        if(!label) return;
        const key = race.raceKind === "intermission"
          ? `route|${trackKeyName(label)}`
          : `track|${trackKeyName(label)}`;
        const trackRow = group.tracks.get(key) || { label, count: 0, total: 0, avg: 0 };
        trackRow.count += 1;
        trackRow.total += points;
        trackRow.avg = trackRow.count ? trackRow.total / trackRow.count : 0;
        group.tracks.set(key, trackRow);
      });
    });

    return Array.from(groups.values()).map((group) => {
      const rows = Array.from(group.tracks.values());
      const qualifiedRows = rows.filter((row) => Number(row.count || 0) >= MIN_TRACK_PLAYS_FOR_HIGHLIGHT);
      const sortBest = (a, b) => {
        const avgDiff = Number(b.avg || 0) - Number(a.avg || 0);
        if(avgDiff !== 0) return avgDiff;
        const countDiff = Number(b.count || 0) - Number(a.count || 0);
        if(countDiff !== 0) return countDiff;
        return String(a.label || "").localeCompare(String(b.label || ""), "en");
      };
      const sortWorst = (a, b) => {
        const avgDiff = Number(a.avg || 0) - Number(b.avg || 0);
        if(avgDiff !== 0) return avgDiff;
        const countDiff = Number(b.count || 0) - Number(a.count || 0);
        if(countDiff !== 0) return countDiff;
        return String(a.label || "").localeCompare(String(b.label || ""), "en");
      };
      return {
        ...group,
        uniqueTracks: rows.length,
        avgPoints: group.matches ? group.totalPoints / group.matches : null,
        avgRacePoints: group.nonDcRaces ? group.racePoints / group.nonDcRaces : null,
        avgMargin: group.marginCount ? group.marginTotal / group.marginCount : null,
        bestTrack: qualifiedRows.slice().sort(sortBest)[0] || null,
        worstTrack: qualifiedRows.slice().sort(sortWorst)[0] || null,
      };
    }).sort((a, b) => {
      const sortDiff = Number(a.sortIndex || 0) - Number(b.sortIndex || 0);
      if(sortDiff !== 0) return sortDiff;
      return String(a.label || "").localeCompare(String(b.label || ""), "en");
    });
  }

  function divisionStatsValue(value, digits = 1){
    if(value == null || !Number.isFinite(Number(value))) return "-";
    const num = Number(value);
    return Number.isInteger(num) ? String(num) : num.toFixed(digits);
  }

  function divisionStatsMetricHtml(label, value, tone = ""){
    return `
      <div class="clanWarsDivisionStatsMetric${tone ? ` ${tone}` : ""}">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(value)}</b>
      </div>
    `;
  }

  function divisionStatsTrackHtml(label, row){
    const title = row?.label || "Not enough data";
    const meta = row
      ? `${row.count} plays - ${divisionStatsValue(row.avg, 2)} avg`
      : `No track has ${MIN_TRACK_PLAYS_FOR_HIGHLIGHT} plays yet.`;
    return `
      <div class="clanWarsDivisionStatsTrack">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(title)}</b>
        <small>${escapeHtml(meta)}</small>
      </div>
    `;
  }

  function divisionStatsCardHtml(group){
    const eventType = normalizeEventType(state.divisionStatsEventType || "6v6");
    const eventTypes = EVENT_LABELS[eventType] || eventType;
    const marginTone = group.avgMargin > 0 ? "is-positive" : (group.avgMargin < 0 ? "is-negative" : "");
    return `
      <article class="clanWarsDivisionStatsCard">
        <header class="clanWarsDivisionStatsCard__head">
          <h3>${escapeHtml(group.label)}</h3>
          <span>${escapeHtml(eventTypes)}</span>
        </header>
        <div class="clanWarsDivisionStatsMetrics">
          ${divisionStatsMetricHtml("Wars", String(group.matches || 0))}
          ${divisionStatsMetricHtml("Races", String(group.races || 0))}
          ${divisionStatsMetricHtml("Tracks", String(group.uniqueTracks || 0))}
          ${divisionStatsMetricHtml("Avg pts", divisionStatsValue(group.avgPoints))}
          ${divisionStatsMetricHtml("Avg race", divisionStatsValue(group.avgRacePoints, 2))}
          ${divisionStatsMetricHtml("Max", divisionStatsValue(group.maxPoints))}
          ${divisionStatsMetricHtml("Margin", group.avgMargin == null ? "-" : formatSignedPoints(group.avgMargin), marginTone)}
          ${divisionStatsMetricHtml("DC", String(group.dcCount || 0))}
        </div>
        <div class="clanWarsDivisionStatsTracks">
          ${divisionStatsTrackHtml("Best track", group.bestTrack)}
          ${divisionStatsTrackHtml("Worst track", group.worstTrack)}
        </div>
      </article>
    `;
  }

  function renderDivisionStatsDialogContent(matches, options = {}){
    const body = $("cwDivisionStatsBody");
    const meta = $("cwDivisionStatsMeta");
    if(!body) return;
    const eventType = normalizeEventType(state.divisionStatsEventType || "6v6");
    updateDivisionStatsFilterButtons();
    const scopedMatches = (matches || []).filter((match) => (
      normalizeEventType(match?.eventType) === eventType
      && Array.isArray(match?.races)
      && match.races.length
    ));
    const totalRaces = scopedMatches.reduce((sum, match) => sum + Number(summarizeMatch(match).raceCount || 0), 0);
    const sourceNote = options.fullAccountSource ? "" : " - loaded data";
    const eventLabel = EVENT_LABELS[eventType] || eventType;
    if(meta) meta.textContent = `${eventLabel} - ${scopedMatches.length} wars - ${totalRaces} races${sourceNote}`;
    if(!scopedMatches.length && !clanDivisionSlots().length){
      body.innerHTML = `<div class="emptyState">No ${escapeHtml(eventLabel)} Clan Wars data yet.</div>`;
      return;
    }
    const stats = buildDivisionStats(scopedMatches);
    body.innerHTML = `
      <div class="clanWarsDivisionStatsGrid">
        ${stats.map(divisionStatsCardHtml).join("")}
      </div>
    `;
  }

  async function renderDivisionStatsDialog(){
    const body = $("cwDivisionStatsBody");
    const meta = $("cwDivisionStatsMeta");
    updateDivisionStatsFilterButtons();
    if(!state.divisionStatsMatches){
      if(body) body.innerHTML = '<div class="muted">Loading stats...</div>';
      if(meta) meta.textContent = "Loading stats...";
      let sourceMatches = allLoadedMatches();
      let fullAccountSource = false;
      try{
        const cloudMatches = await loadDivisionStatsMatchesFromCloud();
        if(Array.isArray(cloudMatches)){
          sourceMatches = mergeMatchList([...allLoadedMatches(), ...cloudMatches]);
          fullAccountSource = true;
        }
      }catch(e){
        console.warn("[clan-wars] division stats cloud load skipped", e?.message || e);
      }
      state.divisionStatsMatches = sourceMatches;
      state.divisionStatsFullAccountSource = fullAccountSource;
    }
    renderDivisionStatsDialogContent(state.divisionStatsMatches, { fullAccountSource: state.divisionStatsFullAccountSource });
  }

  function updateDivisionStatsFilterButtons(){
    const currentType = normalizeEventType(state.divisionStatsEventType || "6v6");
    document.querySelectorAll("[data-cw-division-stats-event]").forEach((button) => {
      const active = normalizeEventType(button.getAttribute("data-cw-division-stats-event") || "") === currentType;
      button.classList.toggle("active", active);
      button.classList.toggle("isActive", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function selectDivisionStatsEventType(value){
    const eventType = normalizeEventType(value);
    if(state.divisionStatsEventType === eventType) return;
    state.divisionStatsEventType = eventType;
    renderDivisionStatsDialogContent(state.divisionStatsMatches || allLoadedMatches(), {
      fullAccountSource: state.divisionStatsFullAccountSource,
    });
  }

  function closeDivisionStatsDialog(){
    const dialog = $("cwDivisionStatsDialog");
    if(!dialog) return;
    if(typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  async function openDivisionStatsDialog(){
    const dialog = $("cwDivisionStatsDialog");
    if(!dialog) return;
    state.divisionStatsEventType = "6v6";
    state.divisionStatsMatches = null;
    state.divisionStatsFullAccountSource = false;
    if(typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    await renderDivisionStatsDialog();
  }

  function formatHeroPoints(value){
    if(value == null || !Number.isFinite(Number(value))) return "-";
    const num = Number(value);
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  }

  function setHeroStatLabel(valueId, label, title = ""){
    const valueEl = $(valueId);
    const box = valueEl?.closest(".statBox");
    const labelEl = box?.querySelector(".statLabel");
    if(labelEl) labelEl.textContent = label;
    if(box) box.title = title;
  }

  function setHeroTrackHighlight(kind, row, isPaged = false){
    const nameEl = $(`cwHero${kind}TrackName`);
    const metaEl = $(`cwHero${kind}TrackMeta`);
    const noData = isPaged
      ? `Loaded matches: no track has ${MIN_TRACK_PLAYS_FOR_HIGHLIGHT} plays across all divisions yet.`
      : `No track has ${MIN_TRACK_PLAYS_FOR_HIGHLIGHT} plays across all divisions yet.`;
    if(nameEl){
      nameEl.textContent = row ? row.track : "Not enough data";
      nameEl.closest(".clanWarsHeroHighlight")?.classList.toggle("is-empty", !row);
    }
    if(metaEl){
      metaEl.textContent = row
        ? `${row.count} plays · ${Number(row.avg || 0).toFixed(2)} avg${isPaged ? " · loaded matches" : ""}`
        : noData;
    }
  }

  function renderHeroSummary(){
    const summary = trackerHeroSummary();
    const pagedTitle = summary.isPagedAccountSummary ? "Calculated from active matches plus the currently loaded saved-match page." : "";
    setHeroStatLabel("cwHeroMatchCount", "Matches", summary.isPagedAccountSummary ? "Total saved matches plus active matches." : "");
    setHeroStatLabel("cwHeroRaceCount", summary.isPagedAccountSummary ? "Loaded Races" : "Races", pagedTitle);
    setHeroStatLabel("cwHeroMaxPoints", summary.isPagedAccountSummary ? "Loaded Max" : "Max Pts", pagedTitle);
    setHeroStatLabel("cwHeroAvgPoints", summary.isPagedAccountSummary ? "Loaded Avg" : "Avg Pts", pagedTitle);
    const matchCount = $("cwHeroMatchCount");
    const raceCount = $("cwHeroRaceCount");
    const maxPoints = $("cwHeroMaxPoints");
    const avgPoints = $("cwHeroAvgPoints");
    if(matchCount) matchCount.textContent = String(summary.matches);
    if(raceCount) raceCount.textContent = String(summary.races);
    if(maxPoints) maxPoints.textContent = formatHeroPoints(summary.maxPoints);
    if(avgPoints) avgPoints.textContent = formatHeroPoints(summary.avgPoints);
    setHeroTrackHighlight("Best", summary.best, summary.isPagedAccountSummary);
    setHeroTrackHighlight("Worst", summary.worst, summary.isPagedAccountSummary);
  }

  function currentSuggestionScope(){
    return {
      eventType: normalizeEventType(state.eventType),
      clanId: String(state.activeClan?.id || ""),
      clanName: normalizeDivisionTag(state.activeClan?.name || ""),
      divisionTag: normalizeDivisionTag(state.selectedDivisionTag),
      userId: currentUserId(),
    };
  }

  function suggestionScopeLabel(scope = currentSuggestionScope()){
    const parts = [];
    if(scope.clanName) parts.push(scope.clanName);
    if(scope.divisionTag) parts.push(divisionLabel(scope.divisionTag));
    parts.push(EVENT_LABELS[scope.eventType] || scope.eventType);
    return parts.filter(Boolean).join(" - ");
  }

  function matchInSuggestionScope(match, scope = currentSuggestionScope()){
    if(!match || match.status !== "completed") return false;
    if(normalizeEventType(match.eventType) !== scope.eventType) return false;
    if(scope.clanId){
      if(String(match.clanId || "") !== scope.clanId) return false;
      if(scope.divisionTag && divisionKey(match.divisionTag) !== divisionKey(scope.divisionTag)) return false;
      return true;
    }
    if(match.clanId) return false;
    return state.mode !== "account" || !scope.userId || String(match.ownerUserId || "") === scope.userId;
  }

  async function loadSuggestionMatchesFromCloud(scope){
    if(state.mode !== "account" || !state.client || !scope?.userId) return null;
    const columns = CLAN_WARS_MATCH_SELECT;
    let query = state.client
      .from("clan_wars_matches")
      .select(columns)
      .eq("status", "completed")
      .eq("event_type", scope.eventType)
      .order("created_at", { ascending: false })
      .limit(1000);
    if(scope.clanId){
      query = query.eq("clan_id", scope.clanId);
      if(scope.divisionTag) query = query.eq("division_tag", scope.divisionTag);
    }else{
      query = query.is("clan_id", null).eq("owner_user_id", scope.userId);
    }
    const { data: rows, error } = await query;
    if(error) throw error;
    const ids = (rows || []).map((row) => row.id).filter(Boolean);
    let raceRows = [];
    if(ids.length) raceRows = await loadRaceRowsForMatchIds(ids);
    const byMatch = new Map();
    raceRows.forEach((row) => {
      const list = byMatch.get(row.match_id) || [];
      list.push(dbRaceToLocal(row));
      byMatch.set(row.match_id, list);
    });
    return (rows || []).map((row) => dbMatchToLocal(row, byMatch.get(row.id) || []));
  }

  function aggregateSuggestionRows(matches, scope = currentSuggestionScope()){
    const buckets = new Map();
    const addRow = (key, seed, points) => {
      if(!key || !Number.isFinite(points)) return;
      const row = buckets.get(key) || { ...seed, count: 0, total: 0, avg: 0 };
      row.count += 1;
      row.total += points;
      row.avg = row.count ? row.total / row.count : 0;
      buckets.set(key, row);
    };
    (matches || []).forEach((match) => {
      if(!matchInSuggestionScope(match, scope)) return;
      (match.races || []).forEach((race) => {
        if(race.dc) return;
        const points = Number(race.ownPoints || 0);
        if(race.raceKind === "intermission"){
          if(scope.eventType !== "6v6v6v6") return;
          const start = canonicalTrackName(race.intermissionStart);
          const end = canonicalTrackName(race.intermissionEnd || race.track);
          if(!start || !end) return;
          const label = routeLabel(start, end);
          addRow(`route|${trackKeyName(start)}|${trackKeyName(end)}`, {
            kind: "route",
            label,
            track: label,
            start,
            end,
          }, points);
          return;
        }
        const track = canonicalTrackName(race.track);
        if(!track || !COURSE_TRACKS.includes(track)) return;
        addRow(`track|${trackKeyName(track)}`, {
          kind: "track",
          label: track,
          track,
        }, points);
      });
    });
    return Array.from(buckets.values());
  }

  async function getSuggestedTrackStats(limit = 6){
    const scope = currentSuggestionScope();
    const sourceMatches = await loadSuggestionMatchesFromCloud(scope)
      || allLoadedMatches().filter((match) => matchInSuggestionScope(match, scope));
    const used = activeRepickKeys("", state.current, scope.eventType);
    return aggregateSuggestionRows(sourceMatches, scope)
      .filter((row) => Number(row.count || 0) >= SUGGESTION_MIN_PLAYS)
      .filter((row) => {
        const key = row.kind === "route" ? routeRepickKey(row.start, row.end) : trackRepickKey(row.track);
        return !key || !used.has(key);
      })
      .sort((a, b) => {
        const avgDiff = Number(b.avg || 0) - Number(a.avg || 0);
        if(avgDiff !== 0) return avgDiff;
        const countDiff = Number(b.count || 0) - Number(a.count || 0);
        if(countDiff !== 0) return countDiff;
        return String(a.label || a.track || "").localeCompare(String(b.label || b.track || ""), "de");
      })
      .slice(0, limit);
  }

  function updateTrackSuggestionButton(){
    const btn = $("btnCwTrackSuggestions");
    if(!btn) return;
    const enabled = state.entryStarted && canEditMatch(state.current) && !state.loading;
    btn.disabled = !enabled;
    btn.title = enabled
      ? `Suggested tracks for ${suggestionScopeLabel()}`
      : "Choose an editable match slot first";
  }

  function closeTrackSuggestionDialog(){
    const dialog = $("cwTrackSuggestionDialog");
    if(!dialog) return;
    if(typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function suggestedRouteVisualHtml(start, end){
    return `
      <span class="suggestTrackRoute" title="${escapeHtml(routeLabel(start, end))}">
        <span class="suggestTrackRoute__node">${trackIconMarkup(start, "suggestTrackRouteIcon")}</span>
        <span class="suggestTrackRoute__arrow" aria-hidden="true">-&gt;</span>
        <span class="suggestTrackRoute__node">${trackIconMarkup(end, "suggestTrackRouteIcon")}</span>
      </span>
    `;
  }

  function renderSuggestionRows(rows){
    const body = $("cwTrackSuggestionGrid");
    if(!body) return;
    if(!rows.length){
      body.innerHTML = '<div class="muted">No eligible suggested tracks yet.</div>';
      return;
    }
    body.innerHTML = rows.map((stat, index) => {
      const label = stat.label || stat.track || "";
      const isRoute = stat.kind === "route";
      const title = `${index + 1}. ${label} - ${Number(stat.avg || 0).toFixed(2)} AVG - ${stat.count} plays`;
      const aria = `${label}, average ${Number(stat.avg || 0).toFixed(2)} points, ${stat.count} plays`;
      const attrs = isRoute
        ? `data-cw-suggest-route-start="${escapeHtml(stat.start)}" data-cw-suggest-route-end="${escapeHtml(stat.end)}"`
        : `data-cw-suggest-track="${escapeHtml(stat.track)}"`;
      return `
        <button class="suggestTrackButton${isRoute ? " suggestTrackButton--route" : ""}" ${attrs} type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(aria)}">
          ${isRoute ? suggestedRouteVisualHtml(stat.start, stat.end) : trackIconMarkup(stat.track, "suggestTrackIcon")}
        </button>
      `;
    }).join("");
  }

  async function renderTrackSuggestionDialog(){
    const body = $("cwTrackSuggestionGrid");
    const meta = $("cwTrackSuggestionMeta");
    if(!body || !meta) return;
    const scope = currentSuggestionScope();
    meta.textContent = `Suggestions use ${suggestionScopeLabel(scope)} only. Each pick needs at least ${SUGGESTION_MIN_PLAYS} plays and already used picks are hidden.`;
    body.innerHTML = '<div class="muted">Loading suggestions...</div>';
    try{
      renderSuggestionRows(await getSuggestedTrackStats(6));
    }catch(e){
      console.error(e);
      body.innerHTML = '<div class="muted">Could not load suggestions.</div>';
      meta.textContent = e?.message || "Could not load suggestions.";
    }
  }

  async function openTrackSuggestionDialog(){
    const dialog = $("cwTrackSuggestionDialog");
    if(!dialog) return;
    if(typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    await renderTrackSuggestionDialog();
  }

  function selectSuggestedTrack(track){
    const value = canonicalTrackName(track);
    if(!value || !COURSE_TRACKS.includes(value)) return false;
    setRaceKind("track");
    const select = $("cwTrackSelect");
    if(!select) return false;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    markRepickOptions();
    refreshClanWarPickers();
    return true;
  }

  function selectSuggestedIntermissionRoute(start, end){
    const routeStart = canonicalTrackName(start);
    const routeEnd = canonicalTrackName(end);
    if(state.eventType !== "6v6v6v6" || !routeStart || !routeEnd) return false;
    setRaceKind("intermission");
    const startSelect = $("cwIntermissionStart");
    const endSelect = $("cwIntermissionEnd");
    if(!startSelect || !endSelect) return false;
    startSelect.value = routeStart;
    fillIntermissionRouteSelects("start");
    startSelect.value = routeStart;
    endSelect.value = routeEnd;
    endSelect.dispatchEvent(new Event("change", { bubbles: true }));
    updateDestinyNotice();
    refreshClanWarPickers();
    return true;
  }

  function savedMatchPageCount(total = state.savedMatchTotal){
    const raw = Number(total);
    const count = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    return Math.max(1, Math.ceil(count / SAVED_MATCH_PAGE_SIZE));
  }

  function clampSavedMatchPage(total = state.savedMatchTotal){
    const maxPage = savedMatchPageCount(total);
    state.savedMatchPage = Math.min(Math.max(1, state.savedMatchPage || 1), maxPage);
    return maxPage;
  }

  function renderSavedMatches(){
    const saved = mergeMatchList(state.matches.filter((match) => match.status === "completed"));
    const matchList = $("cwSavedMatchList");
    const pagerRow = $("cwSavedPagerRow");
    const pageInfo = $("cwSavedPageInfo");
    const prevBtn = $("btnCwSavedPrev");
    const nextBtn = $("btnCwSavedNext");
    const isAccount = state.mode === "account";
    const savedTotal = isAccount && Number.isFinite(Number(state.savedMatchTotal)) ? Number(state.savedMatchTotal) : saved.length;
    const maxPage = clampSavedMatchPage(savedTotal);

    if(!savedTotal){
      if(matchList) matchList.innerHTML = '<div class="emptyState">No saved Clan Wars matches yet.</div>';
      if(pageInfo) pageInfo.textContent = "Page 1";
      if(prevBtn) prevBtn.disabled = true;
      if(nextBtn) nextBtn.disabled = true;
      if(pagerRow) pagerRow.hidden = true;
      return;
    }

    const from = (state.savedMatchPage - 1) * SAVED_MATCH_PAGE_SIZE;
    const pageItems = isAccount ? saved : saved.slice(from, from + SAVED_MATCH_PAGE_SIZE);
    if(matchList) matchList.innerHTML = pageItems.map(matchRowHtml).join("");
    if(pageInfo) pageInfo.textContent = `Page ${state.savedMatchPage} / ${maxPage}`;
    if(prevBtn) prevBtn.disabled = state.savedMatchPage <= 1;
    if(nextBtn) nextBtn.disabled = state.savedMatchPage >= maxPage;
    if(pagerRow) pagerRow.hidden = savedTotal <= SAVED_MATCH_PAGE_SIZE;
  }

  function isEmptyActiveMatch(match){
    return !!match && match.status === "active" && !((match.races || []).length);
  }

  function isVisibleActiveMatch(match){
    return !!match && match.status === "active" && !isEmptyActiveMatch(match);
  }

  async function deleteCloudMatch(match){
    if(state.mode !== "account" || !state.client || !match?.id || !canEditMatch(match)) return false;
    const { error } = await state.client.from("clan_wars_matches").delete().eq("id", match.id);
    if(error) throw error;
    return true;
  }

  async function cleanupEmptyActiveMatches(matches){
    const emptyMatches = (matches || []).filter(isEmptyActiveMatch);
    if(!emptyMatches.length) return;
    const deletableIds = emptyMatches
      .filter((match) => canEditMatch(match))
      .map((match) => match.id)
      .filter(Boolean);
    if(!deletableIds.length) return;
    const { error } = await state.client.from("clan_wars_matches").delete().in("id", deletableIds);
    if(error) console.warn("[clan-wars] empty active match cleanup skipped", error.message || error);
  }

  function sameDivisionSlot(match, eventType, divisionTag){
    return normalizeEventType(match?.eventType) === normalizeEventType(eventType)
      && divisionKey(match?.divisionTag) === divisionKey(divisionTag);
  }

  function findActiveSlotMatch(eventType = state.eventType, divisionTag = state.selectedDivisionTag){
    return allLoadedMatches().find((match) => isVisibleActiveMatch(match) && sameDivisionSlot(match, eventType, divisionTag)) || null;
  }

  function findActiveDivisionMatch(divisionTag = state.selectedDivisionTag){
    return allLoadedMatches().find((match) => (
      isVisibleActiveMatch(match)
      && divisionKey(match?.divisionTag) === divisionKey(divisionTag)
    )) || null;
  }

  function activeClanMatches(){
    return allLoadedMatches().filter(isVisibleActiveMatch);
  }

  function setCurrentMatch(match){
    const previous = state.current;
    const pool = mergeMatchList([previous, ...state.matches]);
    state.current = match || null;
    state.matches = pool.filter((item) => !state.current || item.id !== state.current.id);
    if(match){
      state.eventType = normalizeEventType(match.eventType);
      state.selectedDivisionTag = normalizeDivisionTag(match.divisionTag);
    }
  }

  function currentUserId(){
    return String(state.session?.user?.id || "");
  }

  function canEditMatch(match = state.current){
    if(!match) return true;
    if(state.mode !== "account") return true;
    const uidValue = currentUserId();
    if(match.clanId || state.activeClan?.id){
      return !!uidValue && String(match.createdByUserId || "") === uidValue;
    }
    return !!uidValue && String(match.ownerUserId || "") === uidValue;
  }

  function currentProfileName(){
    const meta = state.session?.user?.user_metadata || {};
    return normalizeDivisionTag(window.PROFILE?.nickname)
      || normalizeDivisionTag(meta.nickname || meta.name || meta.full_name)
      || "You";
  }

  async function loadCurrentProfileName(){
    if(state.mode !== "account" || !state.client || !currentUserId()) return currentProfileName();
    if(!normalizeDivisionTag(window.PROFILE?.nickname)){
      const columns = "nickname";
      let { data, error } = await state.client
        .from("profiles")
        .select(columns)
        .eq("id", currentUserId())
        .maybeSingle();
      if((error && String(error.message || "").includes("column profiles.id")) || (!error && !data)){
        ({ data, error } = await state.client
          .from("profiles")
          .select(columns)
          .eq("user_id", currentUserId())
          .maybeSingle());
      }
      if(!error && data) window.PROFILE = { ...(window.PROFILE || {}), ...data };
    }
    const name = currentProfileName();
    state.memberNames.set(currentUserId(), name);
    return name;
  }

  function trackerNameFor(match){
    const trackerId = String(match?.createdByUserId || match?.ownerUserId || "");
    if(!trackerId) return "";
    if(state.memberNames instanceof Map && state.memberNames.has(trackerId)) return state.memberNames.get(trackerId);
    if(trackerId === currentUserId()){
      return currentProfileName();
    }
    return "Member";
  }

  function persistLocal(){
    if(state.mode !== "guest") return;
    safeWriteJson(STORAGE_CURRENT, state.current || null);
    safeWriteJson(STORAGE_MATCHES, mergeMatchList(state.matches));
  }

  function dbMatchToLocal(row, races){
    return normalizeMatch({
      id: row.id,
      owner_user_id: row.owner_user_id,
      clan_id: row.clan_id,
      event_type: row.event_type,
      status: row.status,
      ownTotal: row.own_total,
      opponentTotal: row.opponent_total,
      fieldTotal: row.field_total,
      raceCount: row.race_count,
      dcCount: row.dc_count,
      division_tag: row.division_tag,
      opponent_clan_name: row.opponent_clan_name,
      created_by_user_id: row.created_by_user_id,
      completed_at: row.completed_at,
      created_at: row.created_at,
      races,
    });
  }

  async function hydrateCloudDivisionTags(matches){
    const ids = (matches || []).map((match) => match.id).filter(Boolean);
    if(!ids.length || state.mode !== "account" || !state.client) return;
    const { data, error } = await state.client
      .from("clan_wars_matches")
      .select("id, division_tag")
      .in("id", ids);
    if(error) return;
    const byId = new Map(matches.map((match) => [match.id, match]));
    (data || []).forEach((row) => {
      const match = byId.get(row.id);
      if(match) match.divisionTag = normalizeDivisionTag(row.division_tag);
    });
  }

  function dbRaceToLocal(row){
    return normalizeRace({
      id: row.id,
      race_number: row.race_number,
      event_type: row.event_type,
      race_kind: row.race_kind,
      track: row.track,
      intermission_start: row.intermission_start,
      intermission_end: row.intermission_end,
      placements: row.placements,
      max_placement: row.max_placement,
      own_points: row.own_points,
      opponent_points: row.opponent_points,
      field_points: row.field_points,
      dc: row.dc,
      rule_warning: row.rule_warning,
      created_at: row.created_at,
    });
  }

  async function loadRaceRowsForMatchIds(ids = []){
    const rows = [];
    for(let i = 0; i < ids.length; i += QUERY_BATCH_SIZE){
      const batchIds = ids.slice(i, i + QUERY_BATCH_SIZE);
      let from = 0;
      while(true){
        const { data, error } = await state.client
          .from("clan_wars_races")
          .select(CLAN_WARS_RACE_SELECT)
          .in("match_id", batchIds)
          .order("match_id", { ascending: true })
          .order("race_number", { ascending: true })
          .range(from, from + CLOUD_RACE_PAGE_SIZE - 1);
        if(error) throw error;
        if(!data || !data.length) break;
        rows.push(...data);
        if(data.length < CLOUD_RACE_PAGE_SIZE) break;
        from += CLOUD_RACE_PAGE_SIZE;
      }
    }
    return rows;
  }

  async function loadClanDetails(clanId){
    if(!state.client || !clanId) return null;
    const { data: clan, error: clanError } = await state.client
      .from("clans")
      .select("id, name, slug, created_by_user_id, icon_path, icon_version, icon_updated_at")
      .eq("id", clanId)
      .eq("is_active", true)
      .maybeSingle();
    if(clanError) throw clanError;
    if(!clan) return null;

    const { data: membership, error: membershipError } = await state.client
      .from("clan_memberships")
      .select("role, status")
      .eq("clan_id", clan.id)
      .eq("user_id", state.session?.user?.id || "")
      .eq("status", "active")
      .maybeSingle();
    if(membershipError) throw membershipError;
    if(!membership) return null;

    const { data: divisions, error: divisionError } = await state.client
      .from("clan_divisions")
      .select("name")
      .eq("clan_id", clan.id)
      .order("name", { ascending: true });
    if(divisionError) throw divisionError;

    return normalizeClan({
      ...clan,
      role: membership.role,
      divisions: (divisions || []).map((item) => item.name),
    });
  }

  async function loadActiveMembershipClan(){
    const uidValue = currentUserId();
    if(state.mode !== "account" || !state.client || !uidValue) return null;
    const { data, error } = await state.client
      .from("clan_memberships")
      .select("clan_id")
      .eq("user_id", uidValue)
      .eq("status", "active");
    if(error) throw error;

    const clanIds = Array.from(new Set((data || [])
      .map((membership) => String(membership.clan_id || "").trim())
      .filter(Boolean)));
    for(const clanId of clanIds){
      const clan = await loadClanDetails(clanId);
      if(clan) return clan;
    }
    return null;
  }

  async function restoreActiveClan(){
    if(state.mode !== "account" || !state.client) return;
    const savedRaw = safeReadJson(activeClanStorageKey(), null);
    if(isPersonalClanSelection(savedRaw)){
      state.activeClan = null;
      return;
    }

    const saved = normalizeClan(savedRaw);
    if(saved?.id){
      try{
        state.activeClan = await loadClanDetails(saved.id);
        if(state.activeClan){
          persistActiveClan();
          return;
        }
      }catch(e){
        console.warn("[clan-wars] could not restore saved active clan", e);
      }
      state.activeClan = null;
      persistActiveClan();
    }

    try{
      state.activeClan = await withTimeout(
        loadActiveMembershipClan(),
        CLAN_RESTORE_TIMEOUT_MS,
        "Clan membership restore timed out."
      );
      if(state.activeClan) persistActiveClan();
    }catch(e){
      console.warn("[clan-wars] could not restore clan membership", e);
      state.activeClan = null;
    }
  }

  async function hydrateMemberNames(matches = []){
    if(state.mode !== "account" || !state.client) return;
    const ids = Array.from(new Set((matches || [])
      .flatMap((match) => [match?.createdByUserId, match?.ownerUserId])
      .map((id) => String(id || ""))
      .filter(Boolean)));
    const missing = ids.filter((id) => !state.memberNames.has(id));
    if(!missing.length) return;

    const clanIds = Array.from(new Set((matches || [])
      .map((match) => String(match?.clanId || ""))
      .filter(Boolean)));
    if(clanIds.length){
      try{
        const { data: memberships, error: membershipError } = await state.client
          .from("clan_memberships")
          .select("user_id, display_name")
          .in("clan_id", clanIds)
          .in("user_id", missing)
          .eq("status", "active");
        if(membershipError) throw membershipError;
        (memberships || []).forEach((member) => {
          const id = String(member.user_id || "");
          const name = normalizeDivisionTag(member.display_name);
          if(id && name) state.memberNames.set(id, name);
        });
      }catch(e){
        console.warn("[clan-wars] membership name lookup skipped", e?.message || e);
      }
    }

    const profileMissing = missing.filter((id) => !state.memberNames.has(id));
    if(!profileMissing.length) return;

    let profiles = [];
    let profileError = null;
    ({ data: profiles, error: profileError } = await state.client
      .from("profiles")
      .select("id, nickname")
      .in("id", profileMissing));
    if(profileError && String(profileError.message || "").includes("column profiles.id")){
      ({ data: profiles, error: profileError } = await state.client
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", profileMissing));
    }
    if(profileError){
      console.warn("[clan-wars] profile lookup skipped", profileError.message || profileError);
      return;
    }
    (profiles || []).forEach((profile) => {
      const id = String(profile.id || profile.user_id || "");
      if(id) state.memberNames.set(id, normalizeDivisionTag(profile.nickname) || "Member");
    });
    const unresolved = profileMissing.filter((id) => !state.memberNames.has(id));
    if(unresolved.length){
      const { data: fallbackProfiles, error: fallbackError } = await state.client
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", unresolved);
      if(fallbackError){
        console.warn("[clan-wars] profile fallback lookup skipped", fallbackError.message || fallbackError);
      }
      (fallbackProfiles || []).forEach((profile) => {
        const id = String(profile.user_id || "");
        if(id) state.memberNames.set(id, normalizeDivisionTag(profile.nickname) || "Member");
      });
    }
    if(currentUserId() && !state.memberNames.has(currentUserId())) await loadCurrentProfileName();
  }

  async function loadCloud(){
    const uidValue = state.session?.user?.id;
    if(!state.client || !uidValue) return;

    const columns = CLAN_WARS_MATCH_SELECT;
    const applyScope = (query) => {
      if(state.activeClan?.id) return query.eq("clan_id", state.activeClan.id);
      return query.is("clan_id", null).eq("owner_user_id", uidValue);
    };
    const completedFrom = (Math.max(1, state.savedMatchPage || 1) - 1) * SAVED_MATCH_PAGE_SIZE;
    const completedTo = completedFrom + SAVED_MATCH_PAGE_SIZE - 1;

    const activeQuery = applyScope(state.client
      .from("clan_wars_matches")
      .select(columns)
      .eq("status", "active")
      .order("created_at", { ascending: false }));
    const completedQuery = applyScope(state.client
      .from("clan_wars_matches")
      .select(columns, { count: "exact" })
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .range(completedFrom, completedTo));

    const [
      { data: activeRows, error: activeError },
      { data: completedRows, error: completedError, count: completedCount },
    ] = await Promise.all([activeQuery, completedQuery]);
    if(activeError) throw activeError;
    if(completedError) throw completedError;

    state.savedMatchTotal = Number(completedCount || 0);
    const maxSavedPage = savedMatchPageCount(state.savedMatchTotal);
    if(state.savedMatchPage > maxSavedPage){
      state.savedMatchPage = maxSavedPage;
      return loadCloud();
    }

    const matchRows = mergeMatchList([...(activeRows || []), ...(completedRows || [])]);

    const ids = (matchRows || []).map((row) => row.id);
    let raceRows = [];
    if(ids.length){
      raceRows = await loadRaceRowsForMatchIds(ids);
    }
    const byMatch = new Map();
    raceRows.forEach((row) => {
      const arr = byMatch.get(row.match_id) || [];
      arr.push(dbRaceToLocal(row));
      byMatch.set(row.match_id, arr);
    });
    let matches = (matchRows || []).map((row) => dbMatchToLocal(row, byMatch.get(row.id) || []));
    await hydrateCloudDivisionTags(matches);
    await hydrateMemberNames(matches);
    await cleanupEmptyActiveMatches(matches);
    matches = matches.filter((match) => !isEmptyActiveMatch(match));

    const activeMatches = matches.filter(isVisibleActiveMatch);
    let current = null;
    if(state.current?.id) current = activeMatches.find((match) => match.id === state.current.id) || null;
    if(!current && state.entryStarted){
      current = activeMatches.find((match) => sameDivisionSlot(match, state.eventType, state.selectedDivisionTag)) || null;
    }
    if(!current && !state.activeClan){
      current = activeMatches[0] || null;
    }
    state.current = current;
    state.matches = matches.filter((match) => match.id !== state.current?.id);
    if(state.current){
      state.eventType = state.current.eventType;
      state.selectedDivisionTag = normalizeDivisionTag(state.current.divisionTag);
    }
    state.entryStarted = !!state.current || (state.entryStarted && (!state.activeClan || !hasDivisionSlots() || !!state.selectedDivisionTag));
  }

  async function loadClanSuggestions(){
    if(state.mode !== "account" || !state.client) return [];
    state.clanSearch.loading = true;
    renderClanSuggestions();
    try{
      const { data: clans, error } = await state.client
        .from("clans")
        .select("id, name, slug, created_by_user_id, icon_path, icon_version, icon_updated_at")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if(error) throw error;
      const ids = (clans || []).map((clan) => clan.id);
      let divisionsByClan = new Map();
      if(ids.length){
        const { data: divisions, error: divisionError } = await state.client
          .from("clan_divisions")
          .select("clan_id, name")
          .in("clan_id", ids)
          .order("name", { ascending: true });
        if(divisionError) throw divisionError;
        (divisions || []).forEach((division) => {
          const list = divisionsByClan.get(division.clan_id) || [];
          list.push(division.name);
          divisionsByClan.set(division.clan_id, list);
        });
      }
      state.clanSearch.clans = (clans || []).map((clan) => normalizeClan({
        ...clan,
        divisions: divisionsByClan.get(clan.id) || [],
      })).filter(Boolean);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not load clans.", false);
    }finally{
      state.clanSearch.loading = false;
      renderClanSuggestions();
    }
    return state.clanSearch.clans;
  }

  async function loadClanMembers(){
    if(state.mode !== "account" || !state.client || !state.activeClan?.id) return [];
    let { data: memberships, error } = await state.client
      .from("clan_memberships")
      .select(CLAN_MEMBER_SELECT)
      .eq("clan_id", state.activeClan.id)
      .eq("status", "active");
    if(error && String(error.message || "").includes("display_name")){
      ({ data: memberships, error } = await state.client
        .from("clan_memberships")
        .select("user_id, role, status")
        .eq("clan_id", state.activeClan.id)
        .eq("status", "active"));
    }
    if(error) throw error;

    const ids = Array.from(new Set((memberships || []).map((member) => String(member.user_id || "")).filter(Boolean)));
    const profileById = new Map();
    if(ids.length){
      let { data: profiles, error: profileError } = await state.client
        .from("profiles")
        .select("id, nickname")
        .in("id", ids);
      if(profileError && String(profileError.message || "").includes("column profiles.id")){
        ({ data: profiles, error: profileError } = await state.client
          .from("profiles")
          .select("user_id, nickname")
          .in("user_id", ids));
      }
      if(profileError) console.warn("[clan-wars] member profile lookup skipped", profileError.message || profileError);
      (profiles || []).forEach((profile) => {
        const id = String(profile.id || profile.user_id || "");
        if(id) profileById.set(id, normalizeDivisionTag(profile.nickname) || "Member");
      });
    }

    const members = (memberships || []).map((member) => {
      const userId = String(member.user_id || "");
      const isCurrentUser = userId && userId === String(state.session?.user?.id || "");
      const membershipName = normalizeDivisionTag(member.display_name);
      return {
        id: userId,
        name: membershipName || profileById.get(userId) || (isCurrentUser ? currentProfileName() : "Member"),
        role: normalizeDivisionTag(member.role || "member") || "member",
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    members.forEach((member) => {
      if(member.id) state.memberNames.set(member.id, member.name);
    });
    return members;
  }

  function memberRowHtml(member){
    return `
      <div class="clanMemberRow">
        <span class="clanMemberName">${escapeHtml(member.name)}</span>
        <span class="clanMemberRole">${escapeHtml(member.role)}</span>
      </div>
    `;
  }

  async function openClanMembersDialog(){
    if(!state.activeClan?.id){
      showToast("Join a clan first.", false);
      return;
    }
    const dialog = $("cwMembersDialog");
    const body = $("cwMembersBody");
    if(!dialog || !body) return;
    body.innerHTML = '<div class="emptyState">Loading members...</div>';
    try{ dialog.showModal(); }catch{ dialog.setAttribute("open", ""); }
    try{
      const members = await loadClanMembers();
      body.innerHTML = members.length
        ? members.map(memberRowHtml).join("")
        : '<div class="emptyState">No members found.</div>';
    }catch(e){
      console.warn("[clan-wars] could not load clan members", e);
      body.innerHTML = '<div class="emptyState">Could not load members.</div>';
    }
    renderClanIconManager();
  }

  function canManageClanIcon(){
    if(state.mode !== "account" || !state.activeClan?.id || !currentUserId()) return false;
    const role = String(state.activeClan.role || "").toLowerCase();
    return role === "owner" || role === "admin" || state.activeClan.createdByUserId === currentUserId();
  }

  function revokeClanIconPreview(){
    if(state.iconUpload.previewUrl){
      URL.revokeObjectURL(state.iconUpload.previewUrl);
      state.iconUpload.previewUrl = "";
    }
  }

  function resetClanIconUpload(){
    revokeClanIconPreview();
    state.iconUpload.file = null;
    state.iconUpload.blob = null;
    state.iconUpload.busy = false;
    const input = $("cwClanIconFile");
    if(input) input.value = "";
    setClanIconStatus("");
  }

  function setClanIconStatus(message = "", ok = true){
    const status = $("cwClanIconStatus");
    if(!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", !!message && !ok);
  }

  function renderClanIconManager(){
    const manager = $("cwClanIconManager");
    if(!manager) return;
    const canManage = canManageClanIcon();
    manager.hidden = !state.activeClan?.id || !canManage;
    if(manager.hidden) return;

    const preview = $("cwClanIconPreview");
    const placeholder = $("cwClanIconPlaceholder");
    const chooseBtn = $("btnChooseClanIcon");
    const uploadBtn = $("btnUploadClanIcon");
    const meta = $("cwClanIconMeta");
    const previewUrl = state.iconUpload.previewUrl || state.activeClan?.iconUrl || "";

    if(preview){
      preview.src = previewUrl || "";
      preview.hidden = !previewUrl;
    }
    if(placeholder){
      placeholder.textContent = clanIconInitial(state.activeClan?.name);
      placeholder.hidden = !!previewUrl;
    }
    if(meta){
      meta.textContent = state.iconUpload.blob
        ? "Ready as a 256px clan icon."
        : (state.activeClan?.iconUrl ? "Current clan icon. Upload replaces it for everyone." : "Transparent icons keep their own silhouette.");
    }
    if(chooseBtn) chooseBtn.disabled = state.iconUpload.busy;
    if(uploadBtn) uploadBtn.disabled = state.iconUpload.busy || !state.iconUpload.blob;
  }

  async function decodeIconImage(file){
    if(window.createImageBitmap) return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try{
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    }finally{
      URL.revokeObjectURL(url);
    }
  }

  function imageHasTransparentPixels(image, width, height){
    const probeSize = 32;
    const canvas = document.createElement("canvas");
    canvas.width = probeSize;
    canvas.height = probeSize;
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if(!ctx) return false;
    ctx.clearRect(0, 0, probeSize, probeSize);
    ctx.drawImage(image, 0, 0, width, height, 0, 0, probeSize, probeSize);
    const data = ctx.getImageData(0, 0, probeSize, probeSize).data;
    for(let i = 3; i < data.length; i += 4){
      if(data[i] < 250) return true;
    }
    return false;
  }

  async function makeClanIconBlob(file){
    if(!file) throw new Error("Choose an image first.");
    if(!/^image\/(png|jpeg|webp)$/.test(file.type || "")) throw new Error("Use PNG, JPG, or WebP.");
    if(Number(file.size || 0) > CLAN_ICON_MAX_BYTES) throw new Error("Icon image is too large.");

    const image = await decodeIconImage(file);
    const width = Number(image.width || image.naturalWidth || 0);
    const height = Number(image.height || image.naturalHeight || 0);
    if(!width || !height) throw new Error("Could not read the image.");

    const canvas = document.createElement("canvas");
    canvas.width = CLAN_ICON_SIZE;
    canvas.height = CLAN_ICON_SIZE;
    const ctx = canvas.getContext("2d", { alpha: true });
    if(!ctx) throw new Error("Could not prepare the icon.");

    const hasTransparency = imageHasTransparentPixels(image, width, height);
    ctx.clearRect(0, 0, CLAN_ICON_SIZE, CLAN_ICON_SIZE);
    if(hasTransparency){
      const scale = Math.min(CLAN_ICON_SIZE / width, CLAN_ICON_SIZE / height);
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      const drawX = (CLAN_ICON_SIZE - drawWidth) / 2;
      const drawY = (CLAN_ICON_SIZE - drawHeight) / 2;
      ctx.drawImage(image, 0, 0, width, height, drawX, drawY, drawWidth, drawHeight);
    }else{
      const sourceSize = Math.min(width, height);
      const sourceX = Math.max(0, (width - sourceSize) / 2);
      const sourceY = Math.max(0, (height - sourceSize) / 2);
      ctx.save();
      ctx.beginPath();
      ctx.arc(CLAN_ICON_SIZE / 2, CLAN_ICON_SIZE / 2, CLAN_ICON_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, CLAN_ICON_SIZE, CLAN_ICON_SIZE);
      ctx.restore();
    }
    if(typeof image.close === "function") image.close();

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if(blob) resolve(blob);
        else reject(new Error("Could not create the icon file."));
      }, "image/webp", 0.9);
    });
  }

  async function handleClanIconFile(file){
    if(!file) return;
    try{
      setClanIconStatus("Preparing icon...");
      const blob = await makeClanIconBlob(file);
      revokeClanIconPreview();
      state.iconUpload.file = file;
      state.iconUpload.blob = blob;
      state.iconUpload.previewUrl = URL.createObjectURL(blob);
      setClanIconStatus("Ready to upload.");
      renderClanIconManager();
    }catch(e){
      state.iconUpload.file = null;
      state.iconUpload.blob = null;
      revokeClanIconPreview();
      setClanIconStatus(e?.message || "Could not prepare icon.", false);
      renderClanIconManager();
    }
  }

  async function uploadClanIcon(){
    if(!state.client || !state.activeClan?.id || !canManageClanIcon()){
      setClanIconStatus("Only clan admins can upload icons.", false);
      return;
    }
    if(!state.iconUpload.blob){
      setClanIconStatus("Choose an image first.", false);
      return;
    }
    state.iconUpload.busy = true;
    renderClanIconManager();
    try{
      const nextVersion = Math.floor(Date.now() / 1000);
      const uploadId = `${nextVersion}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${state.activeClan.id}/icon-${uploadId}.webp`;
      const { error: uploadError } = await state.client.storage
        .from(CLAN_ICON_BUCKET)
        .upload(path, state.iconUpload.blob, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        });
      if(uploadError) throw uploadError;

      const { data: updated, error: updateError } = await state.client
        .from("clans")
        .update({
          icon_path: path,
          icon_version: nextVersion,
          icon_updated_at: new Date().toISOString(),
        })
        .eq("id", state.activeClan.id)
        .select("id, name, slug, created_by_user_id, icon_path, icon_version, icon_updated_at")
        .single();
      if(updateError) throw updateError;

      const hydrated = normalizeClan({
        ...updated,
        role: state.activeClan.role,
        divisions: state.activeClan.divisions,
      });
      if(hydrated){
        state.activeClan = hydrated;
        persistActiveClan();
      }
      resetClanIconUpload();
      render();
      renderClanIconManager();
      showToast("Clan icon updated.", true);
    }catch(e){
      console.warn("[clan-wars] icon upload failed", e);
      state.iconUpload.busy = false;
      setClanIconStatus(e?.message || "Could not upload icon.", false);
      renderClanIconManager();
    }
  }

  function clanLetter(clan){
    const first = String(clan?.name || "#").trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : "#";
  }

  function queryFilteredClanSuggestions(){
    const query = String(state.clanSearch.query || "").trim().toLowerCase();
    const clans = state.clanSearch.clans || [];
    if(!query) return clans;
    return clans.filter((clan) => {
      const haystack = [clan.name, clan.slug, ...(clan.divisions || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function filteredClanSuggestions(){
    const clans = queryFilteredClanSuggestions();
    const letter = state.clanSearch.letterFilter || "all";
    if(letter === "all") return clans;
    return clans.filter((clan) => clanLetter(clan) === letter);
  }

  function setClanJoinError(message = "", autoHide = false){
    if(clanJoinErrorTimer){
      clearTimeout(clanJoinErrorTimer);
      clanJoinErrorTimer = 0;
    }
    state.clanSearch.error = String(message || "");
    const errorEl = $("cwClanError");
    if(!errorEl) return;
    errorEl.textContent = state.clanSearch.error;
    errorEl.hidden = !state.clanSearch.error;
    errorEl.classList.toggle("is-visible", !!state.clanSearch.error);
    if(state.clanSearch.error && autoHide){
      clanJoinErrorTimer = setTimeout(() => {
        clanJoinErrorTimer = 0;
        setClanJoinError("");
      }, 2000);
    }
  }

  function selectClanSuggestion(clan){
    if(!clan) return;
    state.clanSearch.selectedClanId = clan.id || "";
    state.clanSearch.query = "";
    state.clanSearch.open = false;
    state.clanSearch.error = "";
    setClanJoinError("");
    renderClanSuggestions();
    $("cwClanPassword")?.focus();
  }

  function setClanLetterFilter(letter, withHaptic = false){
    const next = letter || "all";
    if(state.clanSearch.letterFilter === next) return;
    state.clanSearch.letterFilter = next;
    state.clanSearch.activeIndex = 0;
    renderClanSuggestions();
    if(withHaptic) pulseMobileLetterHaptic();
  }

  function applyClanLetterFilterFromPoint(clientX, clientY){
    if(!activeClanLetterDrag) return;
    const rail = $("cwClanLetterRail");
    const target = document.elementFromPoint(clientX, clientY);
    const button = target?.closest?.("[data-cw-clan-letter]");
    if(!rail || !button || !rail.contains(button)) return;
    setClanLetterFilter(button.getAttribute("data-cw-clan-letter") || "all", true);
  }

  function setClanPickerOpen(open){
    state.clanSearch.open = !!open;
    if(!state.clanSearch.open) activeClanLetterDrag = false;
    renderClanSuggestions();
  }

  function eventInsideClanPicker(event){
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if(path.some((node) => node?.classList?.contains?.("clanJoinPickerField") || node?.id === "cwClanPickerPanel")) return true;
    return !!event.target.closest?.(".clanJoinPickerField");
  }

  function renderClanSuggestions(){
    const list = $("cwClanSuggestions");
    const panel = $("cwClanPickerPanel");
    const trigger = $("btnClanPicker");
    const value = $("cwClanValue");
    const rail = $("cwClanLetterRail");
    if(!list) return;
    const selectedClan = (state.clanSearch.clans || []).find((clan) => clan.id === state.clanSearch.selectedClanId);
    if(panel) panel.hidden = !state.clanSearch.open;
    if(trigger){
      trigger.setAttribute("aria-expanded", state.clanSearch.open ? "true" : "false");
      trigger.classList.toggle("is-placeholder", !selectedClan);
    }
    if(value) value.textContent = selectedClan?.name || "Choose clan";
    if(state.clanSearch.loading){
      if(rail) rail.innerHTML = "";
      list.innerHTML = '<div class="clanJoinEmpty">Loading clans...</div>';
      updateJoinButtonState();
      return;
    }
    const queriedClans = queryFilteredClanSuggestions();
    const letters = Array.from(new Set(queriedClans.map(clanLetter))).sort((a, b) => a.localeCompare(b));
    if(state.clanSearch.letterFilter !== "all" && !letters.includes(state.clanSearch.letterFilter)){
      state.clanSearch.letterFilter = "all";
    }
    if(rail){
      const activeLetter = state.clanSearch.letterFilter || "all";
      rail.innerHTML = ["all", ...letters].map((letter) => {
        const active = letter === activeLetter;
        return `<button class="${letter === "all" ? "trackPicker__letterBtn trackPicker__letterBtn--all" : "trackPicker__letterBtn"}${active ? " is-active" : ""}" type="button" data-cw-clan-letter="${escapeHtml(letter)}" aria-pressed="${active ? "true" : "false"}">${letter === "all" ? "All" : escapeHtml(letter)}</button>`;
      }).join("");
    }
    const clans = filteredClanSuggestions();
    if(!clans.length){
      list.innerHTML = '<div class="clanJoinEmpty">No clans found.</div>';
      updateJoinButtonState();
      return;
    }
    const activeIndex = Math.max(0, Math.min(state.clanSearch.activeIndex, clans.length - 1));
    state.clanSearch.activeIndex = activeIndex;
    const groups = new Map();
    clans.forEach((clan) => {
      const letter = clanLetter(clan);
      if(!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(clan);
    });
    let optionIndex = 0;
    list.innerHTML = Array.from(groups.entries()).map(([letter, groupClans]) => {
      const options = groupClans.map((clan) => {
        const selected = clan.id === state.clanSearch.selectedClanId;
        const active = optionIndex === activeIndex;
        const divisions = (clan.divisions || []).join(" / ");
        const html = `
          <button class="trackPicker__option clanJoinOption${active ? " is-active" : ""}" id="cwClanOption${optionIndex}" type="button" role="option" aria-selected="${selected ? "true" : "false"}" data-cw-clan-option="${escapeHtml(clan.id)}">
            ${clanIconHtml(clan, "clanIconFrame--option")}
            <span class="trackPicker__optionText clanJoinOption__name">${escapeHtml(clan.name)}</span>
            <span class="clanJoinOption__meta">${escapeHtml(divisions || "Clan")}</span>
          </button>
        `;
        optionIndex += 1;
        return html;
      }).join("");
      return `<div class="trackPicker__group"><div class="trackPicker__groupLabel">${escapeHtml(letter)}</div>${options}</div>`;
    }).join("");
    updateJoinButtonState();
  }

  function updateJoinButtonState(){
    const btn = $("btnJoinClanConfirm");
    if(!btn) return;
    const password = $("cwClanPassword")?.value || "";
    const selectedVisible = filteredClanSuggestions().some((clan) => clan.id === state.clanSearch.selectedClanId);
    btn.disabled = !selectedVisible || !password || state.clanSearch.loading;
  }

  async function openClanJoinDialog(){
    if(state.loading){
      showToast("Account is still loading. Try again in a moment.", false);
      return;
    }
    if(state.mode !== "account"){
      showToast("Join clan requires an account. Guest Clan Wars stay local and are included in backup export.", false);
      return;
    }
    const dialog = $("cwClanDialog");
    if(!dialog) return;
    state.clanSearch.query = "";
    state.clanSearch.selectedClanId = "";
    state.clanSearch.activeIndex = 0;
    state.clanSearch.letterFilter = "all";
    state.clanSearch.open = false;
    state.clanSearch.error = "";
    const password = $("cwClanPassword");
    if(password) password.value = "";
    setClanJoinError("");
    renderClanSuggestions();
    updateJoinButtonState();
    try{ dialog.showModal(); }catch{ dialog.setAttribute("open", ""); }
    await loadClanSuggestions();
    $("btnClanPicker")?.focus();
  }

  async function joinSelectedClan(){
    if(state.mode !== "account" || !state.client){
      showToast("Join clan requires an account.", false);
      return;
    }
    const clanId = state.clanSearch.selectedClanId;
    const password = $("cwClanPassword")?.value || "";
    if(!clanId){
      setClanJoinError("Choose a clan first.", true);
      state.clanSearch.open = true;
      renderClanSuggestions();
      return;
    }
    if(!password){
      setClanJoinError("Clan password is required.", true);
      $("cwClanPassword")?.focus();
      return;
    }
    const btn = $("btnJoinClanConfirm");
    if(btn) btn.disabled = true;
    try{
      const { data, error } = await state.client.rpc("join_clan_with_password", {
        p_clan_id: clanId,
        p_password: password,
      });
      if(error) throw error;
      const joined = normalizeClan(Array.isArray(data) ? data[0] : data);
      if(!joined) throw new Error("Could not join clan.");
      state.activeClan = await loadClanDetails(joined.id) || joined;
      persistActiveClan();
      $("cwClanDialog")?.close();
      await loadCloud();
      render();
      showToast(`Joined ${state.activeClan.name}. Clan matches are shown now.`, true);
    }catch(e){
      setClanJoinError(e?.message || "Could not join clan.", true);
      updateJoinButtonState();
    }
  }

  async function leaveClan(){
    if(!state.activeClan) return;
    const name = state.activeClan.name || "clan";
    state.activeClan = null;
    persistPersonalClanScope();
    try{
      if(state.mode === "account") await loadCloud();
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not load personal Clan Wars.", false);
    }
    render();
    showToast(`Left ${name}. Personal Clan Wars are shown again.`, true);
  }

  function fillSelect(select, options, selected = ""){
    if(!select) return;
    const previous = selected || select.value || "";
    select.innerHTML = "";
    options.forEach((item) => {
      const option = document.createElement("option");
      if(typeof item === "string"){
        option.value = item;
        option.textContent = item;
      }else{
        option.value = item.value;
        option.textContent = item.label;
        option.disabled = !!item.disabled;
      }
      select.appendChild(option);
    });
    if(previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
    else select.value = "";
  }

  async function loadTrackIconMap(){
    try{
      const res = await fetch("track_icon_map.json");
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      trackIconPaths = new Map(Object.entries(json || {}).map(([key, value]) => [String(key), String(value || "")]));
    }catch(e){
      console.warn("[clan-wars] failed to load track_icon_map.json", e);
      trackIconPaths = new Map();
    }
  }

  function pickerIconPathFromSource(iconPath){
    const match = String(iconPath || "").match(/\/([^/]+\.png)$/i);
    return match ? `assets/picker-icons/tracks/${match[1]}` : "";
  }

  function getTrackPickerIconPath(trackName){
    const source = trackIconPaths.get(String(trackName || "")) || "";
    return pickerIconPathFromSource(source) || source;
  }

  function scheduleClanWarPickerIconRefresh(){
    if(clanWarPickerIconRefreshQueued) return;
    clanWarPickerIconRefreshQueued = true;
    requestAnimationFrame(() => {
      clanWarPickerIconRefreshQueued = false;
      refreshClanWarPickers();
    });
  }

  function preloadClanWarPickerIconPath(iconPath){
    if(!iconPath || clanWarPickerIconReadyPaths.has(iconPath) || clanWarPickerIconFailedPaths.has(iconPath)){
      return Promise.resolve(clanWarPickerIconReadyPaths.has(iconPath));
    }
    if(clanWarPickerIconPreloadPromises.has(iconPath)) return clanWarPickerIconPreloadPromises.get(iconPath);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      img.onload = async () => {
        try{ await img.decode?.(); }catch(e){}
        clanWarPickerIconReadyPaths.add(iconPath);
        scheduleClanWarPickerIconRefresh();
        resolve(true);
      };
      img.onerror = () => {
        clanWarPickerIconFailedPaths.add(iconPath);
        resolve(false);
      };
      img.src = iconPath;
    });
    clanWarPickerIconPreloadPromises.set(iconPath, promise);
    return promise;
  }

  function preloadClanWarPickerIcons(){
    if(clanWarPickerIconWarmupPromise) return clanWarPickerIconWarmupPromise;
    const paths = [...new Set(COURSE_TRACKS.map(getTrackPickerIconPath).filter(Boolean))];
    clanWarPickerIconWarmupPromise = Promise.allSettled(paths.map(preloadClanWarPickerIconPath));
    return clanWarPickerIconWarmupPromise;
  }

  function getTrackIconPath(trackName){
    return trackIconPaths.get(String(trackName || "")) || "";
  }

  async function loadStratsMeta(){
    if(stratsMetaIntermissions) return stratsMetaIntermissions;
    try{
      const res = await fetch("strats.json");
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      stratsMetaIntermissions = json?.META?.INTERMISSIONS || {};
    }catch(e){
      console.warn("[clan-wars] failed to load strats.json META", e);
      stratsMetaIntermissions = {};
    }
    window.MKWT_STRATS_META_INTERMISSIONS = stratsMetaIntermissions;
    return stratsMetaIntermissions;
  }

  function trackAbbrev(trackName){
    return String(trackName || "")
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z0-9?]/g, "").charAt(0))
      .join("")
      .slice(0, 3)
      .toUpperCase() || "?";
  }

  function routeOptions(){
    let scriptRoutes = [];
    try{
      scriptRoutes = Array.isArray(window.INTERMISSION_ROUTES)
        ? window.INTERMISSION_ROUTES
        : (typeof INTERMISSION_ROUTES !== "undefined" && Array.isArray(INTERMISSION_ROUTES) ? INTERMISSION_ROUTES : []);
    }catch{
      scriptRoutes = [];
    }
    const metaRoutes = Object.values(stratsMetaIntermissions || {})
      .map((meta) => ({ start: meta?.start, end: meta?.destiny }))
      .filter((route) => route.start && route.end);
    const routes = [...scriptRoutes, ...metaRoutes]
      .map((route) => ({
        start: String(route.start || route.from || "").trim(),
        end: String(route.end || route.to || "").trim(),
      }))
      .filter((route) => route.start && route.end);
    const seen = new Set();
    return routes.filter((route) => {
      const key = `${trackKeyName(route.start)}→${trackKeyName(route.end)}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function trackKeyName(trackName){
    return String(trackName || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function canonicalTrackName(trackName){
    const raw = String(trackName || "").trim();
    if(!raw) return "";
    const key = trackKeyName(raw);
    return COURSE_TRACKS.find((track) => trackKeyName(track) === key) || raw;
  }

  function routeKeyCandidates(start, end){
    const s = String(start || "").trim();
    const e = String(end || "").trim();
    if(!s || !e) return [];
    return [`${s}→${e}`, `${s}>${e}`, `${s} -> ${e}`];
  }

  function lookupRouteMeta(start, end){
    const meta = stratsMetaIntermissions || window.MKWT_STRATS_META_INTERMISSIONS || {};
    for(const key of routeKeyCandidates(start, end)){
      if(Object.prototype.hasOwnProperty.call(meta, key)) return meta[key];
    }
    const startKey = trackKeyName(canonicalTrackName(start));
    const endKey = trackKeyName(canonicalTrackName(end));
    return Object.values(meta || {}).find((item) => (
      trackKeyName(canonicalTrackName(item?.start)) === startKey
      && trackKeyName(canonicalTrackName(item?.destiny)) === endKey
    )) || null;
  }

  function getDestinyGroup(start, end){
    const meta = lookupRouteMeta(start, end);
    const group = String(meta?.destiny_group || "").trim();
    return group || String(end || "").trim();
  }

  function selectedSpecialDestinyLabel(){
    const start = $("cwIntermissionStart")?.value || "";
    const end = $("cwIntermissionEnd")?.value || "";
    if(state.eventType !== "6v6v6v6" || state.raceKind !== "intermission" || !start || !end) return "";
    const meta = lookupRouteMeta(start, end);
    if(!meta) return "";
    const plainEnd = String(end || "").trim();
    const destinyGroup = String(meta.destiny_group || "").trim();
    const specialTag = String(meta.special_tag || "").trim();
    const labels = [];
    if(destinyGroup && destinyGroup.toLowerCase() !== plainEnd.toLowerCase()) labels.push(destinyGroup);
    if(specialTag && specialTag.toLowerCase() !== plainEnd.toLowerCase()) labels.push(specialTag);
    labels.sort((a, b) => a.length - b.length);
    return labels[0] || "";
  }

  function updateDestinyNotice(){
    const notice = $("cwDestinyNotice");
    const value = $("cwDestinyNoticeValue");
    if(!notice) return;
    const label = selectedSpecialDestinyLabel();
    if(!label){
      notice.hidden = true;
      notice.classList.remove("is-visible");
      notice.title = "";
      if(value) value.textContent = "-";
      return;
    }
    notice.hidden = false;
    notice.title = label;
    if(value) value.textContent = label;
    requestAnimationFrame(() => notice.classList.add("is-visible"));
  }

  function isPeachStadiumRainbowRoute(start, end){
    return canonicalTrackName(start) === "Peach Stadium" && canonicalTrackName(end) === "Rainbow Road";
  }

  function trackRepickKey(trackName){
    const track = canonicalTrackName(trackName);
    if(!track || track === "Intermission") return "";
    if(track === "Rainbow Road") return "special|rainbow-road";
    return `track|${track}`;
  }

  function routeRepickKey(start, end){
    const destination = canonicalTrackName(end);
    if(!destination) return "";
    if(isPeachStadiumRainbowRoute(start, destination)) return "special|rainbow-road";
    return `intermission-destination|${destination}`;
  }

  function raceRepickKey(race, eventTypeValue = state.eventType){
    const eventType = normalizeEventType(eventTypeValue);
    if(eventType === "6v6"){
      return race?.raceKind === "track" ? trackRepickKey(race.track) : "";
    }
    if(race?.raceKind === "intermission"){
      return routeRepickKey(race.intermissionStart, race.intermissionEnd || race.track);
    }
    return trackRepickKey(race?.track);
  }

  function fillTrackControls(){
    fillSelect($("cwTrackSelect"), state.eventType === "6v6"
      ? [{ value: "", label: "Track" }, "Intermission", ...COURSE_TRACKS]
      : [{ value: "", label: "Track" }, ...COURSE_TRACKS]);
    fillIntermissionRouteSelects();
    refreshClanWarPickers();
  }

  function uniqueSorted(values){
    return Array.from(new Set((values || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function uniqueStarts(endValue = ""){
    const routes = routeOptions();
    if(!routes.length) return COURSE_TRACKS;
    const endKey = trackKeyName(canonicalTrackName(endValue));
    const starts = routes
      .filter((route) => !endKey || trackKeyName(canonicalTrackName(route.end)) === endKey)
      .map((route) => route.start);
    return uniqueSorted(starts);
  }

  function uniqueEnds(startValue = ""){
    const routes = routeOptions();
    if(!routes.length) return COURSE_TRACKS;
    const startKey = trackKeyName(canonicalTrackName(startValue));
    const ends = routes
      .filter((route) => !startKey || trackKeyName(canonicalTrackName(route.start)) === startKey)
      .map((route) => route.end);
    return uniqueSorted(ends);
  }

  function routeOptionItems(values, startValue = ""){
    return (values || []).map((value) => ({
      value,
      label: startValue ? getDestinyGroup(startValue, value) : value,
    }));
  }

  function routePairExists(start, end){
    const routes = routeOptions();
    if(!routes.length || !start || !end) return true;
    const startKey = trackKeyName(canonicalTrackName(start));
    const endKey = trackKeyName(canonicalTrackName(end));
    return routes.some((route) => (
      trackKeyName(canonicalTrackName(route.start)) === startKey
      && trackKeyName(canonicalTrackName(route.end)) === endKey
    ));
  }

  function fillIntermissionRouteSelects(changed = ""){
    const startSelect = $("cwIntermissionStart");
    const endSelect = $("cwIntermissionEnd");
    if(!startSelect || !endSelect) return;
    let start = startSelect.value || "";
    let end = endSelect.value || "";
    if(start && end && !routePairExists(start, end)){
      if(changed === "end") start = "";
      else if(changed === "start") end = "";
      else{
        start = "";
        end = "";
      }
    }
    let starts = uniqueStarts(end);
    if(start && !starts.includes(start)) start = "";
    let ends = uniqueEnds(start);
    if(end && !ends.includes(end)){
      end = "";
      starts = uniqueStarts(end);
    }
    fillSelect(startSelect, [{ value: "", label: "Intermission start" }, ...starts], start);
    fillSelect(endSelect, [{ value: "", label: "Intermission end" }, ...routeOptionItems(ends, start)], end);
    markRepickOptions();
    updateDestinyNotice();
    refreshClanWarPickers();
  }

  function clearRepickMarks(select){
    Array.from(select?.options || []).forEach((option) => {
      option.dataset.repick = "";
      option.classList.remove("loungeOptionUsed");
    });
  }

  function markSelectRepicks(select, getKey){
    if(!select) return;
    const used = activeRepickKeys();
    clearRepickMarks(select);
    Array.from(select.options || []).forEach((option) => {
      const value = String(option.value || "").trim();
      if(!value) return;
      const key = getKey(value);
      if(!key || !used.has(key)) return;
      option.dataset.repick = "1";
      option.classList.add("loungeOptionUsed");
    });
  }

  function markRepickOptions(){
    const selectedStart = $("cwIntermissionStart")?.value || "";
    const selectedEnd = $("cwIntermissionEnd")?.value || "";
    markSelectRepicks($("cwTrackSelect"), (value) => trackRepickKey(value));
    markSelectRepicks($("cwIntermissionStart"), (value) => selectedEnd ? routeRepickKey(value, selectedEnd) : "");
    markSelectRepicks($("cwIntermissionEnd"), (value) => routeRepickKey(selectedStart, value));
  }

  function clearPlacements(){
    state.selectedPlacements = [];
    state.pendingPlacements = new Set();
    renderResultPicker();
  }

  function clearRaceEntry(){
    clearPlacements();
    resetEntryControlsAfterRace();
    state.entryDc = false;
    render();
  }

  function resetEntryControlsAfterRace(){
    const trackSelect = $("cwTrackSelect");
    if(trackSelect) trackSelect.value = "";
    const startSelect = $("cwIntermissionStart");
    if(startSelect) startSelect.value = "";
    const endSelect = $("cwIntermissionEnd");
    if(endSelect) endSelect.value = "";
    fillIntermissionRouteSelects();
    refreshClanWarPickers();
  }

  function resultValueText(values = state.selectedPlacements){
    const list = Array.isArray(values) ? values : Array.from(values || []);
    if(!list.length) return "Result";
    return list.slice().sort((a, b) => a - b).map((place) => String(place)).join(", ");
  }

  function updatePlacementOptions(){
    state.selectedPlacements = state.selectedPlacements.filter((place) => place >= 1 && place <= maxPlacement());
    state.pendingPlacements = new Set(Array.from(state.pendingPlacements || []).filter((place) => place >= 1 && place <= maxPlacement()));
    renderResultPicker();
  }

  function readPlacementValues(){
    const placements = state.selectedPlacements.map(Number).filter(Boolean);
    if(placements.length !== TEAM_SIZE) return { error: "Select 6 results." };
    const unique = new Set(placements);
    if(unique.size !== placements.length) return { error: "Each result can only be used once." };
    return { placements: placements.sort((a, b) => a - b) };
  }

  function renderResultPicker(){
    const valueEl = $("cwResultValue");
    const trigger = $("cwResultTrigger");
    if(valueEl) valueEl.textContent = resultValueText();
    if(trigger){
      trigger.title = state.selectedPlacements.length ? resultValueText() : "Result";
      trigger.classList.toggle("is-placeholder", !state.selectedPlacements.length);
    }
    const grid = $("cwResultGrid");
    if(grid){
      grid.innerHTML = "";
      grid.style.setProperty("--number-picker-cols", state.eventType === "6v6v6v6" ? "6" : "4");
      const max = maxPlacement();
      for(let place = 1; place <= max; place += 1){
        const button = document.createElement("button");
        button.type = "button";
        button.className = "numberPicker__option clanWarsResultOption";
        if([1, 2, 3].includes(place)) button.classList.add(`numberPicker__option--place${place}`);
        button.dataset.place = String(place);
        button.setAttribute("aria-selected", state.pendingPlacements.has(place) ? "true" : "false");
        button.textContent = String(place);
        grid.appendChild(button);
      }
    }
    const hint = $("cwResultPanelHint");
    if(hint) hint.textContent = `${state.pendingPlacements.size} / ${TEAM_SIZE} selected`;
    const ok = $("btnResultOk");
    if(ok) ok.disabled = state.pendingPlacements.size !== TEAM_SIZE;
  }

  function initResultPicker(){
    const root = $("cwResultPicker");
    const trigger = $("cwResultTrigger");
    const panel = $("cwResultPanel");
    const grid = $("cwResultGrid");
    if(!root || !trigger || !panel || !grid) return;

    const backdrop = document.createElement("div");
    backdrop.className = "trackPickerBackdrop loungePickerBackdrop clanWarsResultBackdrop";
    backdrop.hidden = true;
    document.body.appendChild(backdrop);
    let scrollLockY = 0;
    let scrollLocked = false;
    const lockPageScroll = () => {
      if(scrollLocked) return;
      scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add("trackPickerScrollLocked");
      document.body.classList.add("trackPickerScrollLocked");
      document.body.style.top = `-${scrollLockY}px`;
      scrollLocked = true;
    };
    const unlockPageScroll = () => {
      if(!scrollLocked) return;
      document.documentElement.classList.remove("trackPickerScrollLocked");
      document.body.classList.remove("trackPickerScrollLocked");
      document.body.style.top = "";
      window.scrollTo(0, scrollLockY);
      scrollLocked = false;
    };
    const alignPanel = () => {
      const viewport = window.visualViewport || {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0,
      };
      const margin = viewport.width < 760 ? 10 : 16;
      const desiredWidth = state.eventType === "6v6v6v6" ? 560 : 390;
      const width = Math.min(desiredWidth, viewport.width - (margin * 2));
      panel.style.width = `${Math.round(width)}px`;
      panel.style.left = `${Math.round(viewport.offsetLeft + ((viewport.width - width) / 2))}px`;
      const rect = panel.getBoundingClientRect();
      const top = Math.max(viewport.offsetTop + margin, Math.min(
        viewport.offsetTop + ((viewport.height - rect.height) / 2),
        viewport.offsetTop + viewport.height - rect.height - margin
      ));
      panel.style.top = `${Math.round(top)}px`;
    };
    const open = () => {
      clanWarPickerApi?.closeAll?.();
      state.pendingPlacements = new Set(state.selectedPlacements);
      renderResultPicker();
      panel.hidden = false;
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      backdrop.hidden = false;
      backdrop.classList.add("is-visible");
      alignPanel();
      lockPageScroll();
    };
    const close = () => {
      panel.hidden = true;
      panel.style.left = "";
      panel.style.top = "";
      panel.style.width = "";
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      backdrop.classList.remove("is-visible");
      backdrop.hidden = true;
      unlockPageScroll();
    };
    trigger.addEventListener("click", () => panel.hidden ? open() : close());
    trigger.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      panel.hidden ? open() : close();
    });
    grid.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-place]");
      if(!button) return;
      const place = Number(button.dataset.place || 0);
      if(!place) return;
      if(state.pendingPlacements.has(place)){
        state.pendingPlacements.delete(place);
      }else{
        if(state.pendingPlacements.size >= TEAM_SIZE){
          showToast("Select 6 results.", false);
          return;
        }
        state.pendingPlacements.add(place);
      }
      renderResultPicker();
    });
    $("btnResultClear")?.addEventListener("click", () => {
      state.pendingPlacements.clear();
      renderResultPicker();
    });
    $("btnResultCancel")?.addEventListener("click", close);
    $("btnResultOk")?.addEventListener("click", () => {
      if(state.pendingPlacements.size !== TEAM_SIZE){
        showToast("Select 6 results.", false);
        return;
      }
      state.selectedPlacements = Array.from(state.pendingPlacements).sort((a, b) => a - b);
      close();
      renderResultPicker();
    });
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
      if(event.key !== "Escape" || panel.hidden) return;
      event.preventDefault();
      close();
    });
    window.addEventListener("resize", () => {
      if(!panel.hidden) alignPanel();
    });
    resultPickerApi = { render: renderResultPicker, close };
    renderResultPicker();
  }

  function refreshClanWarPickers(){
    try{ clanWarPickerApi?.refreshAll?.(); }catch(e){}
  }

  function initClanWarPickers(){
    const pickerConfigs = [
      { id: "cwTrackSelect", kind: "track" },
      { id: "cwIntermissionStart", kind: "track" },
      { id: "cwIntermissionEnd", kind: "track" },
      { id: "cwEditTrackSelect", kind: "track" },
      { id: "cwEditIntermissionStart", kind: "track" },
      { id: "cwEditIntermissionEnd", kind: "track" },
    ];
    const resolveConfigs = () => pickerConfigs
      .map((config) => ({ ...config, selectEl: $(config.id) }))
      .filter((config) => config.selectEl);
    if(!resolveConfigs().length) return;

    const pickers = new Map();
    const backdrop = document.createElement("div");
    backdrop.className = "trackPickerBackdrop loungePickerBackdrop";
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    let openPicker = null;
    let scrollLockY = 0;
    let scrollLocked = false;
    let activeLetterPicker = null;

    const pulseLetterFilterHaptic = pulseMobileLetterHaptic;

    const lockPageScroll = () => {
      if(scrollLocked) return;
      scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add("trackPickerScrollLocked");
      document.body.classList.add("trackPickerScrollLocked");
      document.body.style.top = `-${scrollLockY}px`;
      scrollLocked = true;
    };
    const unlockPageScroll = () => {
      if(!scrollLocked) return;
      document.documentElement.classList.remove("trackPickerScrollLocked");
      document.body.classList.remove("trackPickerScrollLocked");
      document.body.style.top = "";
      window.scrollTo(0, scrollLockY);
      scrollLocked = false;
    };
    const showBackdrop = () => {
      backdrop.hidden = false;
      backdrop.classList.add("is-visible");
      lockPageScroll();
    };
    const hideBackdrop = () => {
      if(backdrop.hidden && !scrollLocked) return;
      backdrop.classList.remove("is-visible");
      backdrop.hidden = true;
      unlockPageScroll();
    };
    const getPlaceholderText = (selectEl) => {
      const option = Array.from(selectEl.options || []).find((item) => !String(item.value || "").trim());
      return (option?.textContent || selectEl.getAttribute("aria-label") || "Select").trim();
    };
    const getTriggerText = (selectEl) => {
      const value = String(selectEl.value || "").trim();
      if(!value) return getPlaceholderText(selectEl);
      return (selectEl.selectedOptions?.[0]?.textContent || value).trim();
    };
    const readOptions = (selectEl) => Array.from(selectEl.options || [])
      .filter((option) => String(option.value || "").trim())
      .map((option) => ({
        value: String(option.value || "").trim(),
        label: String(option.textContent || option.value || "").trim(),
        repick: option.dataset?.repick === "1" || option.classList.contains("loungeOptionUsed"),
      }));
    const cssEscape = (value) => window.CSS?.escape
      ? CSS.escape(String(value))
      : String(value).replace(/["\\]/g, "\\$&");
    const trackLetter = (option) => {
      const value = String(option?.value || option?.label || "").trim();
      return (value.charAt(0) || "?").toUpperCase();
    };
    const isIntermissionEndPicker = (picker) => {
      const selectEl = picker?.selectEl;
      if(!selectEl) return false;
      const id = String(selectEl.id || "").trim();
      if(/intermission.*end|end.*intermission/i.test(id)) return true;
      const placeholder = Array.from(selectEl.options || []).find((option) => !String(option.value || "").trim());
      const placeholderText = String(placeholder?.textContent || placeholder?.label || "").trim();
      const aria = String(selectEl.getAttribute("aria-label") || "").trim();
      return [placeholderText, aria].some((text) => /intermission\s*end/i.test(text));
    };
    const isFilteredIntermissionEndPicker = (picker, options, activeLetter) => {
      if(activeLetter !== "all" || !isIntermissionEndPicker(picker)) return false;
      const optionCount = new Set((options || []).map((option) => String(option.value || option.label || "").trim()).filter(Boolean)).size;
      return optionCount > 0 && optionCount < COURSE_TRACKS.length;
    };
    const groupedTrackOptions = (options, letterFilter) => {
      const visible = letterFilter && letterFilter !== "all"
        ? options.filter((option) => trackLetter(option) === letterFilter)
        : options;
      const groups = [];
      visible.forEach((option) => {
        const label = trackLetter(option);
        let group = groups.find((item) => item.label === label);
        if(!group){
          group = { label, options: [] };
          groups.push(group);
        }
        group.options.push(option);
      });
      return groups;
    };
    const createIconSlot = (trackName) => {
      const slot = document.createElement("span");
      slot.className = "trackPicker__iconSlot";
      slot.setAttribute("aria-hidden", "true");
      if(trackName === "Intermission"){
        slot.classList.add("trackPicker__iconSlot--intermission");
        const icon = document.createElement("span");
        icon.className = "trackPicker__intermissionIcon";
        icon.textContent = "X";
        slot.appendChild(icon);
        return slot;
      }
      const iconPath = getTrackPickerIconPath(trackName);
      if(iconPath && clanWarPickerIconReadyPaths.has(iconPath)){
        const img = document.createElement("img");
        img.className = "trackPicker__icon";
        img.src = iconPath;
        img.alt = "";
        img.width = 24;
        img.height = 24;
        img.decoding = "async";
        img.loading = "eager";
        slot.appendChild(img);
        return slot;
      }
      const fallback = document.createElement("span");
      fallback.className = "trackPicker__iconFallback";
      fallback.textContent = trackAbbrev(trackName);
      slot.appendChild(fallback);
      return slot;
    };
    const alignPanel = (picker) => {
      const viewport = window.visualViewport || {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0,
      };
      const margin = viewport.width < 760 ? 10 : 16;
      const desiredWidth = picker.kind === "number" ? (picker.width || 360) : (viewport.width < 760 ? 760 : 900);
      const width = Math.min(desiredWidth, viewport.width - (margin * 2));
      picker.panel.style.width = `${Math.round(width)}px`;
      picker.panel.style.left = `${Math.round(viewport.offsetLeft + ((viewport.width - width) / 2))}px`;
      const rect = picker.panel.getBoundingClientRect();
      const top = Math.max(viewport.offsetTop + margin, Math.min(
        viewport.offsetTop + ((viewport.height - rect.height) / 2),
        viewport.offsetTop + viewport.height - rect.height - margin
      ));
      picker.panel.style.top = `${Math.round(top)}px`;
    };
    const renderPanel = (picker) => {
      const { selectEl, panel } = picker;
      panel.innerHTML = "";
      if(picker.kind === "number"){
        const grid = document.createElement("div");
        grid.className = "numberPicker__grid";
        grid.style.setProperty("--number-picker-cols", String(picker.columns || 4));
        readOptions(selectEl).forEach((option) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "numberPicker__option";
          if(["1","2","3"].includes(option.value)) item.classList.add(`numberPicker__option--place${option.value}`);
          item.dataset.value = option.value;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", selectEl.value === option.value ? "true" : "false");
          item.textContent = option.label;
          grid.appendChild(item);
        });
        panel.appendChild(grid);
        return;
      }

      const options = readOptions(selectEl);
      const letters = Array.from(new Set(options.map(trackLetter))).sort((a, b) => a.localeCompare(b));
      if(picker.letterFilter && picker.letterFilter !== "all" && !letters.includes(picker.letterFilter)){
        picker.letterFilter = "all";
      }
      const hasIntermission = options.some((option) => option.value === "Intermission");
      const railLetters = hasIntermission && letters.includes("I") ? ["I", ...letters.filter((letter) => letter !== "I")] : letters;
      const activeLetter = picker.letterFilter || "all";
      picker.root?.classList.toggle("trackPicker--letterFiltered", activeLetter !== "all");
      picker.root?.classList.toggle("trackPicker--intermissionEndFiltered", isFilteredIntermissionEndPicker(picker, options, activeLetter));
      const layout = document.createElement("div");
      layout.className = "trackPicker__layout";
      const rail = document.createElement("div");
      rail.className = "trackPicker__letterRail";
      rail.setAttribute("aria-label", "Track letter filter");
      const letterValues = ["all", ...railLetters];
      panel.style.setProperty("--track-picker-letter-count", String(letterValues.length));
      panel.style.setProperty("--track-picker-mobile-height", `${34 + (letterValues.length * 24)}px`);
      letterValues.forEach((letter) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = letter === "all" ? "trackPicker__letterBtn trackPicker__letterBtn--all" : "trackPicker__letterBtn";
        if(letter === "I" && hasIntermission) button.classList.add("trackPicker__letterBtn--intermission");
        if(letter === activeLetter) button.classList.add("is-active");
        button.dataset.letterFilter = letter;
        button.setAttribute("aria-pressed", letter === activeLetter ? "true" : "false");
        button.textContent = letter === "all" ? "All" : (letter === "I" && hasIntermission ? "IM!" : letter);
        rail.appendChild(button);
      });
      rail.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-letter-filter]");
        if(!button) return;
        event.preventDefault();
        applyLetterFilter(picker, button.dataset.letterFilter || "all", true);
      });
      rail.addEventListener("keydown", (event) => {
        if(event.key !== "Enter" && event.key !== " ") return;
        const button = event.target.closest?.("[data-letter-filter]");
        if(!button) return;
        event.preventDefault();
        event.stopPropagation();
        if((picker.letterFilter || "all") !== "all"){
          resetLetterFilterToAll(picker);
          return;
        }
        applyLetterFilter(picker, button.dataset.letterFilter || "all");
      });
      rail.addEventListener("pointerdown", (event) => {
        if(!event.target.closest?.("[data-letter-filter]")) return;
        event.preventDefault();
        activeLetterPicker = picker;
        applyLetterFilterFromPoint(event.clientX, event.clientY, true);
      });
      const trackArea = document.createElement("div");
      trackArea.className = "trackPicker__trackArea";
      const groupsEl = document.createElement("div");
      groupsEl.className = "trackPicker__groups";
      groupedTrackOptions(options, activeLetter).forEach((group) => {
        const groupEl = document.createElement("div");
        groupEl.className = "trackPicker__group";
        const head = document.createElement("div");
        head.className = "trackPicker__groupLabel";
        head.textContent = group.label;
        groupEl.appendChild(head);
        group.options.forEach((option) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "trackPicker__option";
          if(option.repick) item.classList.add("trackPicker__option--repick");
          item.dataset.value = option.value;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", selectEl.value === option.value ? "true" : "false");
          item.title = option.repick ? `${option.value} - Repick` : option.value;
          item.appendChild(createIconSlot(option.value));
          const text = document.createElement("span");
          text.className = "trackPicker__optionText";
          text.textContent = option.label;
          item.appendChild(text);
          if(option.repick){
            const badge = document.createElement("span");
            badge.className = "trackPicker__repickBadge";
            badge.textContent = "Repick";
            item.appendChild(badge);
          }
          groupEl.appendChild(item);
        });
        groupsEl.appendChild(groupEl);
      });
      if(!groupsEl.children.length){
        const empty = document.createElement("div");
        empty.className = "trackPicker__empty";
        empty.textContent = "No tracks";
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
      picker.trigger.classList.toggle("is-placeholder", !picker.selectEl.value);
      if(!picker.panel.hidden) renderPanel(picker);
    };
    const resetLetterFilterToAll = (picker, focusAll = true) => {
      if(!picker || picker.kind !== "track" || picker.panel.hidden) return false;
      if((picker.letterFilter || "all") === "all") return false;
      picker.letterFilter = "all";
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
      if(!picker || picker.kind !== "track" || picker.panel.hidden) return false;
      const letter = String(key || "").trim().charAt(0).toUpperCase();
      if(!/^[A-Z0-9]$/.test(letter)) return false;
      const letters = Array.from(new Set(readOptions(picker.selectEl).map(trackLetter)));
      if(!letters.includes(letter)) return false;
      applyLetterFilter(picker, letter);
      window.requestAnimationFrame(() => {
        picker.panel.querySelector(`[data-letter-filter="${cssEscape(letter)}"]`)?.focus?.();
      });
      return true;
    };
    const findOpenPicker = () => Array.from(pickers.values()).find((picker) => !picker.panel.hidden) || null;
    const applyLetterFilter = (picker, letter, withHaptic = false) => {
      if(!picker || picker.kind !== "track" || picker.panel.hidden) return;
      const next = letter || "all";
      if((picker.letterFilter || "all") === next) return;
      picker.letterFilter = next;
      renderPanel(picker);
      alignPanel(picker);
      if(withHaptic) pulseLetterFilterHaptic();
    };
    const applyLetterFilterFromPoint = (clientX, clientY, withHaptic = false) => {
      if(!activeLetterPicker) return;
      const target = document.elementFromPoint(clientX, clientY);
      const button = target?.closest?.("[data-letter-filter]");
      if(!button || !activeLetterPicker.panel.contains(button)) return;
      applyLetterFilter(activeLetterPicker, button.dataset.letterFilter || "all", withHaptic);
    };
    const closeAll = () => {
      activeLetterPicker = null;
      if(!openPicker && backdrop.hidden) return;
      for(const picker of pickers.values()){
        picker.root.classList.remove("is-open");
        picker.trigger.setAttribute("aria-expanded", "false");
        picker.panel.hidden = true;
        picker.panel.style.left = "";
        picker.panel.style.top = "";
        picker.panel.style.width = "";
      }
      openPicker = null;
      hideBackdrop();
    };
    const openOne = (picker) => {
      closeAll();
      if(picker.kind === "track") picker.letterFilter = "all";
      if(picker.kind === "track") preloadClanWarPickerIcons();
      renderPanel(picker);
      picker.panel.hidden = false;
      picker.root.classList.add("is-open");
      picker.trigger.setAttribute("aria-expanded", "true");
      openPicker = picker;
      alignPanel(picker);
      showBackdrop();
    };
    const toggleOne = (picker) => {
      if(picker.panel.hidden) openOne(picker);
      else closeAll();
    };
    const eventInsideElementRect = (event, element) => {
      if(!event || !element || element.hidden) return false;
      const rect = element.getBoundingClientRect();
      if(!rect.width || !rect.height) return false;
      const clientX = Number(event.clientX);
      const clientY = Number(event.clientY);
      if(!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    };
    const eventInsidePicker = (event, picker) => {
      if(!event || !picker) return false;
      const target = event.target;
      if(target && (picker.root.contains(target) || picker.panel.contains(target))) return true;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if(path.some((node) => node?.nodeType === 1 && (picker.root.contains(node) || picker.panel.contains(node)))) return true;
      return eventInsideElementRect(event, picker.panel);
    };
    const eventInsideOpenPicker = (event) => openPicker && !openPicker.panel.hidden && eventInsidePicker(event, openPicker);

    const enhancePicker = (config) => {
      const selectEl = config.selectEl;
      const existing = pickers.get(selectEl.id);
      if(existing && existing.selectEl === selectEl){
        refreshPicker(existing);
        return;
      }
      if(existing){
        if(openPicker === existing) openPicker = null;
        if(activeLetterPicker === existing) activeLetterPicker = null;
        existing.root.remove();
        pickers.delete(selectEl.id);
      }
      if(selectEl.dataset.clanWarsPickerReady === "1") return;
      selectEl.dataset.clanWarsPickerReady = "1";
      selectEl.classList.add("trackNativeSelect", "loungeNativeSelect");
      const label = selectEl.closest("label");
      if(label) label.classList.add("loungePickerLabel");
      const root = document.createElement("div");
      root.className = `trackPicker loungePicker ${config.kind === "number" ? "trackPicker--number" : "trackPicker--track"}`;
      root.dataset.selectId = selectEl.id;
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "trackPicker__trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", selectEl.getAttribute("aria-label") || "Select");
      const valueEl = document.createElement("span");
      valueEl.className = "trackPicker__value";
      const chevron = document.createElement("span");
      chevron.className = "trackPicker__chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "v";
      trigger.appendChild(valueEl);
      trigger.appendChild(chevron);
      const panel = document.createElement("div");
      panel.className = "trackPicker__panel";
      if(config.kind === "number") panel.classList.add("trackPicker__panel--number");
      panel.setAttribute("role", "listbox");
      panel.hidden = true;
      root.appendChild(trigger);
      root.appendChild(panel);
      selectEl.insertAdjacentElement("afterend", root);
      const picker = { ...config, root, trigger, valueEl, panel };
      pickers.set(selectEl.id, picker);
      trigger.addEventListener("click", () => toggleOne(picker));
      trigger.addEventListener("keydown", (event) => {
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if(!picker.panel.hidden && picker.kind === "track" && (picker.letterFilter || "all") !== "all"){
          resetLetterFilterToAll(picker);
          return;
        }
        toggleOne(picker);
      });
      panel.addEventListener("click", (event) => {
        event.stopPropagation();
        const item = event.target.closest?.("[data-value]");
        if(!item) return;
        selectEl.value = item.dataset.value || "";
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        closeAll();
        refreshPicker(picker);
        trigger.focus();
      });
      selectEl.addEventListener("change", () => refreshPicker(picker));
      new MutationObserver(() => refreshPicker(picker)).observe(selectEl, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "data-repick", "data-base-label"],
      });
      refreshPicker(picker);
    };
    const pruneDetachedPickers = () => {
      for(const [id, picker] of pickers.entries()){
        if(document.body.contains(picker.selectEl)) continue;
        if(openPicker === picker) openPicker = null;
        if(activeLetterPicker === picker) activeLetterPicker = null;
        pickers.delete(id);
      }
    };
    const refreshAll = () => {
      pruneDetachedPickers();
      resolveConfigs().forEach(enhancePicker);
      for(const picker of pickers.values()) refreshPicker(picker);
    };
    refreshAll();

    document.addEventListener("click", (event) => {
      if(eventInsideOpenPicker(event)) return;
      const target = event.target;
      if(!target) return;
      for(const picker of pickers.values()){
        if(picker.root.contains(target) || picker.panel.contains(target)) return;
      }
      closeAll();
    });
    document.addEventListener("pointermove", (event) => {
      if(!activeLetterPicker) return;
      event.preventDefault();
      applyLetterFilterFromPoint(event.clientX, event.clientY, true);
    }, { passive:false });
    document.addEventListener("pointerup", () => {
      activeLetterPicker = null;
    });
    document.addEventListener("pointercancel", () => {
      activeLetterPicker = null;
    });
    backdrop.addEventListener("click", (event) => {
      if(eventInsideOpenPicker(event)) return;
      closeAll();
    });
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape"){
        if(findOpenPicker()){
          event.preventDefault();
          event.stopPropagation();
        }
        closeAll();
        return;
      }
      const picker = findOpenPicker();
      if(!picker) return;
      const target = event.target;
      const isTextTarget = target?.matches?.("input, textarea, select") || target?.isContentEditable;
      if(isTextTarget || event.altKey || event.ctrlKey || event.metaKey) return;
      if(event.key.length === 1 && /^[a-z0-9]$/i.test(event.key)){
        if(applyKeyboardLetterFilter(picker, event.key)) event.preventDefault();
        return;
      }
      if((event.key === "Enter" || event.key === " ")
        && !target?.closest?.(".trackPicker__option, .numberPicker__option, .trackPicker__trigger")
        && resetLetterFilterToAll(picker)){
        event.preventDefault();
      }
    });
    window.addEventListener("resize", closeAll);
    clanWarPickerApi = {
      refreshAll,
      closeAll,
    };
  }

  function setEventType(eventType){
    state.eventType = normalizeEventType(eventType);
    state.raceKind = "track";
    state.selectedPlacements = [];
    state.pendingPlacements = new Set();
    fillTrackControls();
    updatePlacementOptions();
    render();
  }

  function selectDivisionSlot(tag = ""){
    const normalized = normalizeDivisionTag(tag);
    state.selectedDivisionTag = normalized;
    const active = findActiveDivisionMatch(normalized);
    setCurrentMatch(active);
    state.entryStarted = true;
    clearPlacements();
    render();
    if(active && !canEditMatch(active)){
      showToast(`${divisionLabel(normalized)} has an active ${EVENT_LABELS[active.eventType]} match by ${trackerNameFor(active)}. You can view it read-only.`, false);
    }
  }

  async function startEventType(eventType){
    const next = normalizeEventType(eventType);
    if(state.activeClan){
      setCurrentMatch(null);
      state.selectedDivisionTag = "";
      state.entryStarted = false;
      setEventType(next);
      const slots = clanDivisionSlots();
      if(slots.length === 0) selectDivisionSlot("");
      return;
    }

    if(state.current?.races?.length && state.current.eventType !== next){
      const ok = window.MKWT?.confirmAction
        ? await window.MKWT.confirmAction({
          eyebrow: "Clan Wars",
          title: "Switch event type?",
          body: `This discards the active ${EVENT_LABELS[state.current.eventType]} match with ${state.current.races.length} saved races.`,
          confirmLabel: "Switch",
          cancelLabel: "Keep match",
          danger: true,
        })
        : window.confirm("Discard current match?");
      if(!ok) return;
      try{
        if(state.mode === "account"){
          const { error } = await state.client.from("clan_wars_matches").delete().eq("id", state.current.id);
          if(error) throw error;
        }
      }catch(e){
        console.error(e);
        showToast(e?.message || "Could not discard match.", false);
        return;
      }
      state.current = null;
      persistLocal();
    }
    state.entryStarted = true;
    state.selectedDivisionTag = "";
    setEventType(next);
  }

  function setRaceKind(kind){
    state.raceKind = state.eventType === "6v6v6v6" && kind === "intermission" ? "intermission" : "track";
    render();
  }

  function activeRepickKeys(skipRaceId = "", match = state.current, eventTypeValue = state.eventType){
    const keys = new Set();
    const eventType = normalizeEventType(eventTypeValue);
    (match?.races || []).forEach((race) => {
      if(skipRaceId && race.id === skipRaceId) return;
      if(race.eventType !== eventType) return;
      const key = raceRepickKey(race, eventType);
      if(key) keys.add(key);
    });
    return keys;
  }

  function repickWarningFor({ eventType, raceKind, track, intermissionStart, intermissionEnd, skipRaceId = "", match = state.current }){
    const normalizedEvent = normalizeEventType(eventType);
    const used = activeRepickKeys(skipRaceId, match, normalizedEvent);
    if(normalizedEvent === "6v6"){
      const key = raceKind === "track" ? trackRepickKey(track) : "";
      if(key && used.has(key)) return "Repick";
      return "";
    }
    const key = raceKind === "intermission"
      ? routeRepickKey(intermissionStart, intermissionEnd)
      : trackRepickKey(track);
    if(key && used.has(key)) return "Repick";
    return "";
  }

  function readEntry(){
    if(!state.entryStarted) return { error: "Start a Clan Wars match first." };
    const placementResult = readPlacementValues();
    if(placementResult.error) return placementResult;
    const placements = placementResult.placements;
    const eventType = state.eventType;
    const score = scoreForPlacements(placements, eventType);
    const total = fieldTotal(eventType);
    const base = {
      id: uid(),
      raceNumber: currentList().length + 1,
      eventType,
      placements,
      maxPlacement: maxPlacement(eventType),
      ownPoints: score,
      opponentPoints: eventType === "6v6" ? total - score : null,
      fieldPoints: total,
      dc: state.entryDc === true,
      ruleWarning: "",
      createdAt: nowIso(),
    };

    if(eventType === "6v6"){
      const track = $("cwTrackSelect")?.value || "";
      if(!track) return { error: "Select a track." };
      if(track === "Intermission"){
        return {
          ...base,
          raceKind: "track",
          track,
          intermissionStart: null,
          intermissionEnd: null,
          ruleWarning: "Intermission is not allowed in 6v6. Saved as a visible mistake.",
        };
      }
      return {
        ...base,
        raceKind: "track",
        track,
        intermissionStart: null,
        intermissionEnd: null,
        ruleWarning: repickWarningFor({ eventType, raceKind: "track", track }),
      };
    }

    if(state.raceKind === "intermission"){
      const start = $("cwIntermissionStart")?.value || "";
      const end = $("cwIntermissionEnd")?.value || "";
      if(!start || !end) return { error: "Select intermission start and end." };
      return {
        ...base,
        raceKind: "intermission",
        track: routeLabel(start, end),
        intermissionStart: start,
        intermissionEnd: end,
        ruleWarning: repickWarningFor({ eventType, raceKind: "intermission", intermissionStart: start, intermissionEnd: end }),
      };
    }

    const track = $("cwTrackSelect")?.value || "";
    if(!track) return { error: "Select a track." };
    return {
      ...base,
      raceKind: "track",
      track,
      intermissionStart: null,
      intermissionEnd: null,
      ruleWarning: repickWarningFor({ eventType, raceKind: "track", track }),
    };
  }

  async function ensureCurrentMatch(){
    if(state.current && state.current.status !== "completed") return state.current;
    if(state.activeClan && hasDivisionSlots() && !normalizeDivisionTag(state.selectedDivisionTag)){
      throw new Error("Choose a division before starting this match.");
    }
    if(state.activeClan){
      const activeDivisionMatch = findActiveDivisionMatch(state.selectedDivisionTag);
      if(activeDivisionMatch){
        setCurrentMatch(activeDivisionMatch);
        if(!canEditMatch(activeDivisionMatch)){
          throw new Error(`${divisionLabel(activeDivisionMatch.divisionTag)} has an active ${EVENT_LABELS[activeDivisionMatch.eventType]} match by ${trackerNameFor(activeDivisionMatch)}.`);
        }
        return activeDivisionMatch;
      }
    }
    const existing = findActiveSlotMatch(state.eventType, state.selectedDivisionTag);
    if(existing){
      setCurrentMatch(existing);
      if(!canEditMatch(existing)){
        throw new Error(`${divisionLabel(existing.divisionTag)} is being tracked by ${trackerNameFor(existing)}.`);
      }
      return existing;
    }
    const match = normalizeMatch({
      id: uid(),
      eventType: state.eventType,
      status: "active",
      scopeType: state.activeClan ? "clan" : "personal",
      clanId: state.activeClan?.id || null,
      ownerUserId: state.activeClan ? null : (state.session?.user?.id || null),
      createdByUserId: state.session?.user?.id || null,
      divisionTag: state.activeClan ? state.selectedDivisionTag : "",
      createdAt: nowIso(),
      races: [],
    });
    if(state.mode === "account"){
      const payload = {
        id: match.id,
        owner_user_id: state.activeClan ? null : state.session.user.id,
        clan_id: state.activeClan?.id || null,
        event_type: match.eventType,
        status: "active",
        division_tag: normalizeDivisionTag(match.divisionTag) || null,
        opponent_clan_name: null,
        own_total: 0,
        opponent_total: match.eventType === "6v6" ? 0 : null,
        field_total: 0,
        race_count: 0,
        dc_count: 0,
        created_by_user_id: state.session.user.id,
      };
      const { error } = await state.client.from("clan_wars_matches").insert(payload);
      if(error){
        if(error.code === "23505" || /duplicate|unique/i.test(String(error.message || ""))){
          await loadCloud();
          const active = findActiveDivisionMatch(match.divisionTag) || findActiveSlotMatch(match.eventType, match.divisionTag);
          if(active) setCurrentMatch(active);
          throw new Error(`${divisionLabel(match.divisionTag)} already has an active ${EVENT_LABELS[active?.eventType || match.eventType]} match.`);
        }
        throw error;
      }
    }
    state.current = match;
    persistLocal();
    return match;
  }

  function raceDbPayload(match, race){
    return {
      id: race.id,
      match_id: match.id,
      race_number: race.raceNumber,
      event_type: race.eventType,
      race_kind: race.raceKind,
      track: race.track,
      intermission_start: race.intermissionStart,
      intermission_end: race.intermissionEnd,
      placements: race.placements,
      max_placement: race.maxPlacement,
      own_points: race.ownPoints,
      opponent_points: race.opponentPoints,
      field_points: race.fieldPoints,
      dc: race.dc,
      rule_warning: race.ruleWarning || null,
    };
  }

  function matchDbTotals(match){
    const summary = summarizeMatch(match);
    return {
      status: match.status,
      own_total: summary.ownTotal,
      opponent_total: match.eventType === "6v6" ? summary.opponentTotal : null,
      field_total: summary.fieldTotal,
      race_count: summary.raceCount,
      dc_count: summary.dcCount,
      opponent_clan_name: normalizeOpponentClanName(match.opponentClanName) || null,
      completed_at: match.status === "completed" ? (match.completedAt || nowIso()) : null,
    };
  }

  async function updateCloudMatch(match){
    if(state.mode !== "account" || !state.client) return;
    const { error } = await state.client
      .from("clan_wars_matches")
      .update(matchDbTotals(match))
      .eq("id", match.id);
    if(error) throw error;
  }

  async function saveRace(){
    try{
      const entry = readEntry();
      if(entry.error){
        showToast(entry.error, false);
        return;
      }
      const match = await ensureCurrentMatch();
      if(!canEditMatch(match)){
        showToast(`This match is being tracked by ${trackerNameFor(match)}.`, false);
        return;
      }
      if(match.eventType !== state.eventType && match.races.length){
        showToast("Finish or clear the current match before switching event type.", false);
        return;
      }
      if(match.races.length >= MAX_RACES){
        showToast("This match already has 12 races.", false);
        return;
      }
      const race = normalizeRace({ ...entry, raceNumber: match.races.length + 1 });
      if(state.mode === "account"){
        const { error } = await state.client.from("clan_wars_races").insert(raceDbPayload(match, race));
        if(error) throw error;
      }
      match.races.push(race);
      Object.assign(match, summarizeMatch(match));
      if(match.races.length >= MAX_RACES){
        match.status = "completed";
        match.completedAt = nowIso();
      }
      await updateCloudMatch(match);
      if(match.status === "completed"){
        state.current = null;
        state.savedMatchPage = 1;
        if(state.mode === "account"){
          if(Number.isFinite(Number(state.savedMatchTotal))){
            state.savedMatchTotal = Number(state.savedMatchTotal) + 1;
          }
          await loadCloud();
        }else{
          state.matches = mergeMatchList([match, ...state.matches]);
        }
        showResultDialog(match);
      }
      clearPlacements();
      resetEntryControlsAfterRace();
      state.entryDc = false;
      persistLocal();
      render();
      showToast("Race saved.", true);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not save race.", false);
    }
  }

  async function undoRace(){
    const match = state.current;
    const races = match?.races || [];
    if(match && !canEditMatch(match)){
      showToast(`This match is being tracked by ${trackerNameFor(match)}.`, false);
      return;
    }
    if(!races.length){
      showToast("No race to undo.", false);
      return;
    }
    const last = races[races.length - 1];
    const body = `Remove race ${last.raceNumber}: ${last.track}\nPlacements: ${last.placements.join(", ")}\nOwn points: ${last.ownPoints}`;
    const ok = window.MKWT?.confirmAction
      ? await window.MKWT.confirmAction({
        eyebrow: "Clan Wars",
        title: "Undo last race?",
        body,
        confirmLabel: "Yes",
        cancelLabel: "No",
        danger: true,
      })
      : window.confirm(body);
    if(!ok) return;
    try{
      if(state.mode === "account"){
        const { error } = await state.client.from("clan_wars_races").delete().eq("id", last.id);
        if(error) throw error;
      }
      races.pop();
      Object.assign(match, summarizeMatch(match));
      if(!races.length){
        await deleteCloudMatch(match);
        state.matches = state.matches.filter((item) => item.id !== match.id);
        state.current = null;
        state.entryStarted = !!(state.activeClan && hasDivisionSlots() && normalizeDivisionTag(state.selectedDivisionTag));
        state.entryDc = false;
        clearPlacements();
        persistLocal();
        render();
        showToast("Race removed.", true);
        return;
      }
      await updateCloudMatch(match);
      persistLocal();
      render();
      showToast("Race removed.", true);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not undo race.", false);
    }
  }

  async function newMatch(){
    if(state.current && !canEditMatch(state.current)){
      showToast(`This match is being tracked by ${trackerNameFor(state.current)}.`, false);
      return;
    }
    if(state.current?.races?.length){
      const ok = window.MKWT?.confirmAction
        ? await window.MKWT.confirmAction({
          eyebrow: "Clan Wars",
          title: "Discard current match?",
          body: `This removes the active ${EVENT_LABELS[state.current.eventType]} match with ${state.current.races.length} saved races.`,
          confirmLabel: "Discard",
          cancelLabel: "Keep match",
          danger: true,
        })
        : window.confirm("Discard current match?");
      if(!ok) return;
      try{
        if(state.mode === "account"){
          const { error } = await state.client.from("clan_wars_matches").delete().eq("id", state.current.id);
          if(error) throw error;
        }
      }catch(e){
        console.error(e);
        showToast(e?.message || "Could not discard match.", false);
        return;
      }
    }else if(state.current){
      try{
        await deleteCloudMatch(state.current);
      }catch(e){
        console.error(e);
        showToast(e?.message || "Could not discard match.", false);
        return;
      }
    }
    state.current = null;
    state.entryStarted = false;
    state.entryDc = false;
    clearPlacements();
    persistLocal();
    render();
  }

  function showResultDialog(match){
    const dialog = $("cwResultDialog");
    const body = $("cwResultBody");
    if(!dialog || !body) return;
    state.resultDialogMatchId = match.id || "";
    const is6v6 = match.eventType === "6v6";
    const summary = summarizeMatch(match);
    const breakEven = matchThresholdTotal(summary, match.eventType);
    const outcome = is6v6 ? resultText(summary.ownTotal, summary.opponentTotal) : breakEvenResultText(summary.ownTotal, breakEven);
    const outcomeNote = is6v6
      ? outcome
      : `${outcome}. 6v18 compares your clan to the ${formatThreshold(teamAverageThreshold(match.eventType))}-point team average per race; the other three teams are not tracked separately.`;
    const selectedTag = normalizeDivisionTag(match.divisionTag);
    const divisionBox = selectedTag ? `
      <div class="mogiResultFormatBox clanWarsDivisionBox" aria-label="Clan division tag">
        <div class="mogiResultFormatGroupTitle">Division</div>
        <div class="clanWarsStaticTag">${escapeHtml(selectedTag)}</div>
      </div>
    ` : "";
    body.innerHTML = `
      <div class="clanWarsResultGrid">
        <div class="clanWarsResultStat"><span>Own total</span><b>${summary.ownTotal}</b></div>
        <div class="clanWarsResultStat"><span>${is6v6 ? "Opponent total" : "Break-even"}</span><b>${is6v6 ? summary.opponentTotal : formatThresholdTarget(breakEven)}</b></div>
      </div>
      <div>${escapeHtml(outcomeNote)}</div>
      ${divisionBox}
    `;
    try{ dialog.showModal(); }catch{ dialog.setAttribute("open", ""); }
  }

  function findSavedMatch(matchId){
    return state.matches.find((match) => String(match.id) === String(matchId)) || null;
  }

  async function updateCloudDivisionTag(match){
    if(state.mode !== "account" || !state.client || !match?.id) return;
    const { error } = await state.client
      .from("clan_wars_matches")
      .update({ division_tag: normalizeDivisionTag(match.divisionTag) || null })
      .eq("id", match.id);
    if(error) throw error;
  }

  async function updateCloudOpponentClanName(match){
    if(state.mode !== "account" || !state.client || !match?.id) return;
    const { error } = await state.client
      .from("clan_wars_matches")
      .update({ opponent_clan_name: normalizeOpponentClanName(match.opponentClanName) || null })
      .eq("id", match.id);
    if(error) throw error;
  }

  function openOpponentNameDialog(matchId){
    const match = findSavedMatch(matchId);
    if(!match) return;
    if(match.eventType !== "6v6") return;
    if(!canEditMatch(match)){
      showToast("Only the match tracker can change this opponent.", false);
      return;
    }
    state.opponentNameMatchId = match.id;
    const input = $("cwOpponentNameInput");
    const meta = $("cwOpponentNameMeta");
    if(input) input.value = normalizeOpponentClanName(match.opponentClanName);
    if(meta) meta.textContent = `${EVENT_LABELS[match.eventType] || "Clan Wars"} - ${formatDate(match.completedAt || match.createdAt)}`;
    const dialog = $("cwOpponentNameDialog");
    if(!dialog) return;
    if(typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    window.setTimeout(() => {
      input?.focus();
      input?.select?.();
    }, 0);
  }

  function closeOpponentNameDialog(){
    const dialog = $("cwOpponentNameDialog");
    if(dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
    state.opponentNameMatchId = "";
  }

  async function saveOpponentClanName(){
    const match = findSavedMatch(state.opponentNameMatchId);
    if(!match) return closeOpponentNameDialog();
    if(!canEditMatch(match)){
      showToast("Only the match tracker can change this opponent.", false);
      return;
    }
    const nextName = normalizeOpponentClanName($("cwOpponentNameInput")?.value || "");
    const previousName = normalizeOpponentClanName(match.opponentClanName);
    if(nextName === previousName){
      closeOpponentNameDialog();
      return;
    }
    try{
      match.opponentClanName = nextName;
      match.updatedAt = nowIso();
      await updateCloudOpponentClanName(match);
      if(state.mode === "guest") persistLocal();
      closeOpponentNameDialog();
      render();
      showToast(nextName ? "Opponent clan saved." : "Opponent label reset.", true);
    }catch(e){
      match.opponentClanName = previousName;
      console.error(e);
      showToast(e?.message || "Could not save opponent clan.", false);
    }
  }

  async function setSavedMatchDivisionTag(matchId, tag){
    try{
      const match = findSavedMatch(matchId);
      if(!match) return;
      if(!canEditMatch(match)){
        showToast("Only the tracker can change this match.", false);
        return;
      }
      const options = divisionTagOptions(match);
      const normalized = normalizeDivisionTag(tag);
      if(!options.includes(normalized)) return;
      if(match.divisionTag === normalized) return;
      match.divisionTag = normalized;
      match.updatedAt = nowIso();
      await updateCloudDivisionTag(match);
      if(state.mode === "guest") persistLocal();
      render();
      showToast("Division updated.", true);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not update division.", false);
    }
  }

  async function deleteSavedMatch(matchId){
    try{
      const match = findSavedMatch(matchId);
      if(!match) return;
      if(!canEditMatch(match)){
        showToast("Only the tracker can delete this match.", false);
        return;
      }
      const label = `${EVENT_LABELS[match.eventType] || "Clan Wars"}${normalizeDivisionTag(match.divisionTag) ? ` - ${match.divisionTag}` : ""}`;
      const ok = window.MKWT?.confirmAction
        ? await window.MKWT.confirmAction({
          eyebrow: "Clan Wars",
          title: "Delete saved match?",
          body: `Are you sure you want to delete this ${label} match? This cannot be undone.`,
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          danger: true,
        })
        : confirm(`Are you sure you want to delete this ${label} match?`);
      if(!ok) return;
      if(state.mode === "account"){
        await deleteCloudMatch(match);
        delete state.openMatchDetails[match.id];
        if(Number.isFinite(Number(state.savedMatchTotal))){
          state.savedMatchTotal = Math.max(0, Number(state.savedMatchTotal) - 1);
          clampSavedMatchPage(state.savedMatchTotal);
        }
        await loadCloud();
        render();
        showToast("Match deleted.", true);
        return;
      }
      state.matches = state.matches.filter((item) => String(item.id) !== String(match.id));
      delete state.openMatchDetails[match.id];
      persistLocal();
      render();
      showToast("Match deleted.", true);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not delete match.", false);
    }
  }

  function getEditMatch(){
    if(state.editMatchId) return findSavedMatch(state.editMatchId);
    return state.current;
  }

  function resultText(own, opponent){
    if(own > opponent) return "Win";
    if(own < opponent) return "Loss";
    return "Draw";
  }

  function breakEvenResultText(own, threshold){
    if(own > threshold) return "Above break-even";
    if(own < threshold) return "Below break-even";
    return "Break-even";
  }

  function clanWarOutcomeText(match, summary){
    if(match.eventType === "6v6") return resultText(summary.ownTotal, summary.opponentTotal);
    return breakEvenResultText(summary.ownTotal, matchThresholdTotal(summary, match.eventType));
  }

  function formatDate(value){
    try{ return new Date(value).toLocaleString(); }catch{ return String(value || ""); }
  }

  function raceMeta(race){
    const parts = [
      `Placements ${race.placements.join(", ")}`,
      `${race.ownPoints} pts`,
      `${raceDiffText(race)} diff`,
    ];
    if(race.eventType === "6v6" && race.opponentPoints != null) parts.push(`${race.opponentPoints} opponent`);
    if(race.dc) parts.push("DC");
    return parts.join(" | ");
  }

  function isGoldRace(race){
    const places = new Set((race.placements || []).map(Number));
    return [1,2,3,4,5,6].every((place) => places.has(place));
  }

  function isSilverRace(race){
    if(isGoldRace(race)) return false;
    const points = Number(race?.ownPoints ?? scoreForPlacements(race?.placements || [], race?.eventType));
    if(normalizeEventType(race?.eventType) === "6v6v6v6"){
      return points >= 58 && points <= 62;
    }
    return points >= 57 && points <= 60;
  }

  function raceToneClass(race){
    const diff = raceDiffValue(race);
    if(diff > 0) return "is-positive";
    if(diff < 0) return "is-negative";
    return "is-even";
  }

  function raceDiffValue(race){
    const eventType = normalizeEventType(race?.eventType);
    const own = Number(race?.ownPoints || 0);
    const field = Number(race?.fieldPoints || fieldTotal(eventType));
    if(eventType === "6v6"){
      const opponent = Number(race?.opponentPoints);
      return own - (Number.isFinite(opponent) ? opponent : (field - own));
    }
    return own - (field / teamCount(eventType));
  }

  function raceDiffText(race){
    return `(${formatSignedPoints(raceDiffValue(race))})`;
  }

  function trackIconLoadAttrs(options = {}){
    const priority = options.priority === "high";
    return `loading="${priority ? "eager" : "lazy"}" decoding="async" fetchpriority="${priority ? "high" : "low"}"`;
  }

  function priorityIconOptions(options = {}){
    const index = Number(options.raceIndex || 0);
    const limit = Number(options.iconPriorityLimit || 6);
    return {
      priority: options.iconPriority === "high" && index < limit ? "high" : "low",
    };
  }

  function trackIconMarkup(trackName, extraClass = "", options = {}){
    const iconPath = getTrackIconPath(trackName);
    const className = `raceTrackIcon${extraClass ? ` ${extraClass}` : ""}`;
    if(iconPath){
      return `<img class="${className}" src="${escapeHtml(iconPath)}" alt="${escapeHtml(trackName || "Track")}" ${trackIconLoadAttrs(options)}>`;
    }
    return `<span class="raceTrackIconFallback${extraClass ? ` ${extraClass}` : ""}" aria-label="${escapeHtml(trackName || "Track")}">${escapeHtml(trackAbbrev(trackName))}</span>`;
  }

  function cssVar(name, fallback){
    try{
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    }catch{
      return fallback;
    }
  }

  function exportTheme(){
    return {
      bg: cssVar("--bg", "#05080e"),
      card: cssVar("--card", "#08111c"),
      card2: cssVar("--card-2", "#0b1420"),
      border: cssVar("--border", "rgba(148,163,184,.22)"),
      text: cssVar("--text", "#ffffff"),
      muted: cssVar("--muted", "#a9b9d3"),
      primary: cssVar("--primary", "#ff4048"),
      good: "#68e2a6",
      bad: "#ff858c",
      warn: "#ffd17e",
    };
  }

  function roundedRect(ctx, x, y, w, h, radius){
    const r = Math.min(radius || 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillRound(ctx, x, y, w, h, radius, fill, stroke, lineWidth = 2){
    roundedRect(ctx, x, y, w, h, radius);
    if(fill){
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if(stroke){
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function trimCanvasText(ctx, text, maxWidth){
    const value = String(text ?? "");
    if(ctx.measureText(value).width <= maxWidth) return value;
    let lo = 0;
    let hi = value.length;
    while(lo < hi){
      const mid = Math.ceil((lo + hi) / 2);
      if(ctx.measureText(`${value.slice(0, mid)}...`).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return `${value.slice(0, lo)}...`;
  }

  function drawContain(ctx, img, x, y, w, h){
    const iw = img?.naturalWidth || img?.width || 1;
    const ih = img?.naturalHeight || img?.height || 1;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function drawText(ctx, text, x, y, maxWidth){
    ctx.fillText(trimCanvasText(ctx, text, maxWidth), x, y);
  }

  function fallbackLetters(text){
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if(words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    return (words[0] || "?").slice(0, 2).toUpperCase();
  }

  function drawIconOrFallback(ctx, assets, src, label, x, y, size, theme){
    const img = src ? assets.get(src) : null;
    if(img){
      drawContain(ctx, img, x, y, size, size);
      return;
    }
    fillRound(ctx, x, y, size, size, 14, theme.card2, "rgba(148,163,184,.28)", 2);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "900 23px Arial, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText(fallbackLetters(label), x + size / 2, y + size / 2 + 1);
  }

  function loadExportImage(src){
    return new Promise((resolve) => {
      if(!src){
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = new URL(src, window.location.href).toString();
    });
  }

  async function preloadMatchExportIcons(match){
    const sources = new Set();
    (match?.races || []).forEach((race) => {
      if(race.raceKind === "intermission" && race.intermissionStart && race.intermissionEnd){
        const startIcon = getTrackIconPath(race.intermissionStart);
        const endIcon = getTrackIconPath(race.intermissionEnd);
        if(startIcon) sources.add(startIcon);
        if(endIcon) sources.add(endIcon);
        return;
      }
      const icon = getTrackIconPath(race.track);
      if(icon) sources.add(icon);
    });
    const pairs = await Promise.all(Array.from(sources).map(async (src) => [src, await loadExportImage(src)]));
    return new Map(pairs);
  }

  function drawExportPill(ctx, text, x, y, options = {}){
    const value = String(text || "").trim();
    if(!value) return 0;
    const font = options.font || "900 23px Arial, sans-serif";
    ctx.font = font;
    const h = options.height || 42;
    const w = Math.max(options.minWidth || 74, Math.ceil(ctx.measureText(value).width) + (options.padX || 34));
    fillRound(
      ctx,
      x,
      y,
      w,
      h,
      h / 2,
      options.fill || "rgba(255,64,72,.12)",
      options.stroke || "rgba(255,64,72,.52)",
      2
    );
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = options.color || "#ffffff";
    ctx.fillText(trimCanvasText(ctx, value, w - 22), x + w / 2, y + h / 2 + 1);
    return w;
  }

  function drawExportScoreCard(ctx, label, value, tone, x, y, w, h, theme){
    const isWinner = tone === "winner";
    const isLoser = tone === "loser";
    const accent = isWinner ? theme.good : (isLoser ? theme.bad : theme.muted);
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, isWinner ? "rgba(104,226,166,.12)" : (isLoser ? "rgba(255,133,140,.12)" : "rgba(255,255,255,.045)"));
    bg.addColorStop(1, "rgba(5,13,22,.72)");
    fillRound(ctx, x, y, w, h, 18, bg, isWinner ? "rgba(104,226,166,.34)" : (isLoser ? "rgba(255,133,140,.36)" : "rgba(148,163,184,.24)"), 2);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "900 20px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    drawText(ctx, String(label || "").toUpperCase(), x + 22, y + 18, w - 44);
    ctx.font = "1000 44px Arial, sans-serif";
    ctx.fillStyle = accent;
    drawText(ctx, String(value ?? "-"), x + 22, y + 54, w - 44);
  }

  function exportScoreItems(match, summary){
    const own = Number(summary.ownTotal || 0);
    if(match.eventType !== "6v6"){
      const threshold = matchThresholdTotal(summary, match.eventType);
      const ownTone = own > threshold ? "winner" : (own < threshold ? "loser" : "even");
      return [
        { label: matchOwnLabel(match), value: own, tone: ownTone },
        { label: "Break-even", value: formatThresholdTarget(threshold), tone: "even" },
        { label: "Margin", value: formatSignedPoints(own - threshold), tone: ownTone },
      ];
    }
    const opponent = Number(summary.opponentTotal || 0);
    const ownTone = own > opponent ? "winner" : (own < opponent ? "loser" : "even");
    const enemyTone = opponent > own ? "winner" : (opponent < own ? "loser" : "even");
    return [
      { label: matchOwnLabel(match), value: own, tone: ownTone },
      { label: matchOpponentLabel(match), value: opponent, tone: enemyTone },
      { label: "Margin", value: formatSignedPoints(own - opponent), tone: ownTone },
    ];
  }

  function drawExportRaceTile(ctx, race, assets, x, y, w, h, theme){
    const isGold = isGoldRace(race);
    const isSilver = isSilverRace(race);
    const tone = raceToneClass(race);
    const border = race.dc
      ? "rgba(255,119,119,.62)"
      : (isGold ? "rgba(255,205,70,.64)" : (isSilver ? "rgba(220,230,244,.58)" : "rgba(255,64,72,.36)"));
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, race.dc
      ? "rgba(255,119,119,.18)"
      : (isGold ? "rgba(255,205,70,.18)" : (isSilver ? "rgba(220,230,244,.16)" : "rgba(255,255,255,.045)")));
    bg.addColorStop(1, "rgba(5,13,22,.76)");
    fillRound(ctx, x, y, w, h, 18, bg, border, 2);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "900 20px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.fillText(String(race.raceNumber || ""), x + 18, y + 14);

    if(race.dc || race.ruleWarning){
      const tag = race.dc ? "DC" : "!";
      ctx.font = "900 19px Arial, sans-serif";
      const tagW = race.dc ? 48 : 34;
      drawExportPill(ctx, tag, x + w - tagW - 14, y + 13, {
        minWidth: tagW,
        height: 28,
        padX: 20,
        font: "900 17px Arial, sans-serif",
        fill: race.dc ? "rgba(255,119,119,.15)" : "rgba(255,209,126,.14)",
        stroke: race.dc ? "rgba(255,119,119,.48)" : "rgba(255,209,126,.46)",
        color: race.dc ? theme.bad : theme.warn,
      });
    }

    if(race.raceKind === "intermission" && race.intermissionStart && race.intermissionEnd){
      const iconSize = 46;
      const centerX = x + w / 2;
      const iconY = y + 50;
      drawIconOrFallback(ctx, assets, getTrackIconPath(race.intermissionStart), race.intermissionStart, centerX - iconSize - 16, iconY, iconSize, theme);
      drawIconOrFallback(ctx, assets, getTrackIconPath(race.intermissionEnd), race.intermissionEnd, centerX + 16, iconY, iconSize, theme);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = "900 18px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      ctx.fillText("->", centerX, iconY + iconSize / 2 + 1);
    }else{
      const iconSize = 64;
      drawIconOrFallback(ctx, assets, getTrackIconPath(race.track), race.track, x + (w - iconSize) / 2, y + 48, iconSize, theme);
    }

    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.font = "1000 31px Arial, sans-serif";
    ctx.fillStyle = tone === "is-positive" ? theme.good : (tone === "is-negative" ? theme.bad : theme.muted);
    ctx.fillText(formatSignedPoints(raceDiffValue(race)), x + w / 2, y + h - 58);
    ctx.font = "900 17px Arial, sans-serif";
    ctx.fillStyle = tone === "is-positive" ? theme.good : (tone === "is-negative" ? theme.bad : theme.muted);
    ctx.fillText(`(${race.ownPoints || 0})`, x + w / 2, y + h - 25);
  }

  function safeFilename(name){
    return String(name || "mkwt-clan-war.png")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  function compactDateSlug(value){
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "match";
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  function downloadCanvas(canvas, filename){
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if(!blob){
          reject(new Error("Image export failed."));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        resolve();
      }, "image/png");
    });
  }

  function matchExportFilename(match){
    const mode = EVENT_LABELS[match.eventType] || "clan-wars";
    const division = normalizeDivisionTag(match.divisionTag) || "clan";
    return safeFilename(`mkwt-clan-wars-${mode}-${division}-${compactDateSlug(match.completedAt || match.createdAt)}.png`);
  }

  async function downloadSavedMatchImage(matchId, button = null){
    const match = allLoadedMatches().find((item) => item?.id === matchId && item.status === "completed");
    if(!match){
      showToast("Match not found.", false);
      return;
    }
    const previousText = button?.innerHTML;
    if(button){
      button.disabled = true;
      button.classList.add("is-busy");
      button.setAttribute("aria-busy", "true");
      button.innerHTML = '<span aria-hidden="true">...</span>';
    }
    try{
      await document.fonts?.ready;
      const theme = exportTheme();
      const summary = summarizeMatch(match);
      const races = (match.races || []).slice().sort((a, b) => Number(a.raceNumber || 0) - Number(b.raceNumber || 0));
      const assets = await preloadMatchExportIcons(match);
      const width = 1440;
      const margin = 36;
      const cardX = 36;
      const cardY = 36;
      const cardW = width - 72;
      const pad = 32;
      const gridCols = 6;
      const gridGap = 14;
      const tileW = (cardW - pad * 2 - gridGap * (gridCols - 1)) / gridCols;
      const tileH = 176;
      const raceRows = Math.max(1, Math.ceil(Math.max(1, races.length) / gridCols));
      const gridY = cardY + 192;
      const gridH = raceRows * tileH + Math.max(0, raceRows - 1) * gridGap;
      const divisionOptions = divisionTagOptions(match);
      const divisionH = divisionOptions.length ? 126 : 0;
      const footerH = 42;
      const height = gridY + gridH + divisionH + footerH + margin;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#121722");
      bg.addColorStop(0.4, theme.bg);
      bg.addColorStop(1, "#05070c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const cardBg = ctx.createLinearGradient(cardX, cardY, cardX, height - margin);
      cardBg.addColorStop(0, "rgba(9,18,30,.98)");
      cardBg.addColorStop(1, "rgba(5,13,22,.96)");
      fillRound(ctx, cardX, cardY, cardW, height - margin * 2, 28, cardBg, "rgba(255,64,72,.46)", 2);

      const contentX = cardX + pad;
      const headerY = cardY + 34;
      const modeW = drawExportPill(ctx, EVENT_LABELS[match.eventType] || match.eventType, contentX, headerY, {
        minWidth: 78,
        height: 42,
        fill: "rgba(255,64,72,.10)",
        stroke: "rgba(255,64,72,.58)",
        font: "1000 24px Arial, sans-serif",
      });
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = "900 25px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      drawText(ctx, formatDate(match.completedAt || match.createdAt), contentX + modeW + 18, headerY + 22, 500);

      const metaY = headerY + 66;
      let metaX = contentX;
      const tracker = trackerNameFor(match);
      [
        normalizeDivisionTag(match.divisionTag),
        tracker ? `Tracked by ${tracker}` : "",
        summary.dcCount > 0 ? `${summary.dcCount} DC` : "",
      ].filter(Boolean).forEach((label, index) => {
        const pillW = drawExportPill(ctx, label, metaX, metaY, {
          minWidth: index === 1 ? 178 : 88,
          height: 36,
          padX: 28,
          fill: index === 1 ? "rgba(255,64,72,.10)" : "rgba(255,255,255,.035)",
          stroke: index === 1 ? "rgba(255,64,72,.48)" : "rgba(255,64,72,.38)",
          font: "900 19px Arial, sans-serif",
        });
        metaX += pillW + 12;
      });

      const scoreItems = exportScoreItems(match, summary);
      const scoreW = 182;
      const scoreH = 106;
      const scoreGap = 16;
      const scoreStartX = cardX + cardW - pad - scoreW * 3 - scoreGap * 2;
      scoreItems.forEach((item, index) => {
        drawExportScoreCard(ctx, item.label, item.value, item.tone, scoreStartX + index * (scoreW + scoreGap), headerY, scoreW, scoreH, theme);
      });

      races.forEach((race, index) => {
        const row = Math.floor(index / gridCols);
        const col = index % gridCols;
        drawExportRaceTile(
          ctx,
          race,
          assets,
          contentX + col * (tileW + gridGap),
          gridY + row * (tileH + gridGap),
          tileW,
          tileH,
          theme
        );
      });

      if(divisionOptions.length){
        const boxY = gridY + gridH + 28;
        fillRound(ctx, contentX, boxY, cardW - pad * 2, 92, 20, "rgba(5,13,22,.72)", "rgba(148,163,184,.20)", 2);
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = "900 21px Arial, sans-serif";
        ctx.fillStyle = theme.muted;
        ctx.fillText("DIVISION", contentX + 24, boxY + 18);
        const tagGap = 14;
        const tagY = boxY + 45;
        const tagW = (cardW - pad * 2 - 48 - tagGap * (divisionOptions.length - 1)) / divisionOptions.length;
        divisionOptions.forEach((option, index) => {
          const active = option === match.divisionTag;
          fillRound(
            ctx,
            contentX + 24 + index * (tagW + tagGap),
            tagY,
            tagW,
            34,
            14,
            active ? "rgba(255,64,72,.64)" : "rgba(8,17,27,.68)",
            active ? "rgba(255,255,255,.18)" : "rgba(255,64,72,.32)",
            2
          );
          ctx.textBaseline = "middle";
          ctx.textAlign = "center";
          ctx.font = "900 20px Arial, sans-serif";
          ctx.fillStyle = active ? "#ffffff" : theme.muted;
          ctx.fillText(trimCanvasText(ctx, option, tagW - 20), contentX + 24 + index * (tagW + tagGap) + tagW / 2, tagY + 18);
        });
      }

      ctx.textBaseline = "top";
      ctx.textAlign = "right";
      ctx.font = "800 18px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      ctx.fillText("MKWT Clan Wars", cardX + cardW - pad, height - margin - 24);

      await downloadCanvas(canvas, matchExportFilename(match));
      showToast("Match image downloaded.", true);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not download match image.", false);
    }finally{
      if(button){
        button.disabled = false;
        button.classList.remove("is-busy");
        button.removeAttribute("aria-busy");
        button.innerHTML = previousText;
      }
    }
  }

  function raceVisualHtml(race, options = {}){
    const iconOptions = priorityIconOptions(options);
    if(race.raceKind === "intermission" && race.intermissionStart && race.intermissionEnd){
      return `
        <span class="clanWarsRaceRoute" title="${escapeHtml(race.track)}">
          <span class="clanWarsRaceRoute__node">${trackIconMarkup(race.intermissionStart, "clanWarsRaceIcon", iconOptions)}</span>
          <span class="clanWarsRaceRoute__arrow" aria-hidden="true">-&gt;</span>
          <span class="clanWarsRaceRoute__node">${trackIconMarkup(race.intermissionEnd, "clanWarsRaceIcon", iconOptions)}</span>
        </span>
      `;
    }
    return `<span class="clanWarsRaceVisual">${trackIconMarkup(race.track, "clanWarsRaceIcon", iconOptions)}</span>`;
  }

  function raceRowHtml(race, options = {}){
    const medalClass = isGoldRace(race) ? "raceRow--gold" : (isSilverRace(race) ? "raceRow--silver" : "");
    const toneClass = raceToneClass(race);
    const warningTag = race.ruleWarning && race.ruleWarning !== "Repick"
      ? `<span class="clanWarsRaceTile__tag">!</span>`
      : "";
    const canEdit = options.canEdit !== false;
    const editAttr = canEdit
      ? (options.savedMatchId
        ? `data-cw-saved-race-edit="${escapeHtml(options.savedMatchId)}"`
        : `data-cw-edit-race="${Number(race.raceNumber || 1) - 1}"`)
      : `aria-disabled="true"`;
    return `
      <button class="clanWarsRaceTile ${medalClass}${race.dc ? " raceRow--dc" : ""}${canEdit ? "" : " is-readonly"}" ${editAttr} data-race-index="${Number(race.raceNumber || 1) - 1}" type="button" title="${escapeHtml(`${race.track} - ${raceMeta(race)}${race.ruleWarning ? ` - ${race.ruleWarning}` : ""}`)}">
        <span class="clanWarsRaceTile__number">${race.raceNumber}</span>
        ${warningTag}
        ${raceVisualHtml(race, options)}
        <span class="clanWarsRaceTile__score ${toneClass}">
          <span class="clanWarsRaceTile__scoreMain">${escapeHtml(formatSignedPoints(raceDiffValue(race)))}</span>
          <span class="clanWarsRaceTile__scoreDiff ${toneClass}">(${race.ownPoints})</span>
        </span>
      </button>
    `;
  }

  function optionHtml(value, label, selectedValue = ""){
    return `<option value="${escapeHtml(value)}"${String(value) === String(selectedValue) ? " selected" : ""}>${escapeHtml(label ?? value)}</option>`;
  }

  function trackOptionsHtml(selected = "", includeIntermission = false){
    const options = [optionHtml("", "Track", selected)];
    if(includeIntermission) options.push(optionHtml("Intermission", "Intermission", selected));
    COURSE_TRACKS.forEach((track) => options.push(optionHtml(track, track, selected)));
    return options.join("");
  }

  function startOptionsHtml(selected = ""){
    return [optionHtml("", "Intermission start", selected), ...uniqueStarts().map((track) => optionHtml(track, track, selected))].join("");
  }

  function endOptionsHtml(start = "", selected = ""){
    return [
      optionHtml("", "Intermission end", selected),
      ...routeOptionItems(uniqueEnds(start), start).map((item) => optionHtml(item.value, item.label, selected))
    ].join("");
  }

  function syncEditIntermissionRouteSelects(changed = ""){
    const startSelect = $("cwEditIntermissionStart");
    const endSelect = $("cwEditIntermissionEnd");
    if(!startSelect || !endSelect) return;
    let start = startSelect.value || "";
    let end = endSelect.value || "";
    if(start && end && !routePairExists(start, end)){
      if(changed === "end") start = "";
      else if(changed === "start") end = "";
    }
    let starts = uniqueStarts(end);
    if(start && !starts.includes(start)) start = "";
    let ends = uniqueEnds(start);
    if(end && !ends.includes(end)){
      end = "";
      starts = uniqueStarts(end);
    }
    fillSelect(startSelect, [{ value: "", label: "Intermission start" }, ...starts], start);
    fillSelect(endSelect, [{ value: "", label: "Intermission end" }, ...routeOptionItems(ends, start)], end);
    refreshClanWarPickers();
  }

  function renderEditPlacementGrid(){
    const grid = $("cwEditPlacementGrid");
    const hint = $("cwEditResultHint");
    if(!grid) return;
    grid.innerHTML = "";
    grid.style.setProperty("--number-picker-cols", state.editEventType === "6v6v6v6" ? "6" : "4");
    for(let place = 1; place <= maxPlacement(state.editEventType); place += 1){
      const button = document.createElement("button");
      button.type = "button";
      button.className = "numberPicker__option clanWarsResultOption";
      if([1, 2, 3].includes(place)) button.classList.add(`numberPicker__option--place${place}`);
      button.dataset.cwEditPlace = String(place);
      button.setAttribute("aria-selected", state.editPlacements.has(place) ? "true" : "false");
      button.textContent = String(place);
      grid.appendChild(button);
    }
    if(hint) hint.textContent = `${state.editPlacements.size} / ${TEAM_SIZE} selected`;
  }

  function renderEditRouteFields(){
    const trackFields = $("cwEditTrackFields");
    const routeFields = $("cwEditIntermissionFields");
    const isRoute = state.editEventType === "6v6v6v6" && state.editRaceKind === "intermission";
    if(trackFields) trackFields.hidden = isRoute;
    if(routeFields) routeFields.hidden = !isRoute;
    document.querySelectorAll("[data-cw-edit-kind]").forEach((btn) => {
      const active = btn.dataset.cwEditKind === state.editRaceKind;
      btn.classList.toggle("active", active);
      btn.classList.toggle("isActive", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function renderRaceEditDialog(){
    const match = getEditMatch();
    const race = match?.races?.[state.editIndex];
    const body = $("cwEditBody");
    if(!race || !body) return;
    state.editEventType = race.eventType;
    const routeMode = race.eventType === "6v6v6v6";
    body.innerHTML = `
      ${routeMode ? `
        <div class="modeToggle loungeModeToggle clanWarsEditMode" role="tablist" aria-label="Race kind">
          <button class="modeBtn${state.editRaceKind === "track" ? " isActive active" : ""}" data-cw-edit-kind="track" type="button" aria-selected="${state.editRaceKind === "track" ? "true" : "false"}">Track</button>
          <button class="modeBtn${state.editRaceKind === "intermission" ? " isActive active" : ""}" data-cw-edit-kind="intermission" type="button" aria-selected="${state.editRaceKind === "intermission" ? "true" : "false"}">Intermission</button>
        </div>
      ` : ""}
      <div class="formGrid formGrid--single clanWarsEditFields" id="cwEditTrackFields">
        <label><select id="cwEditTrackSelect" aria-label="Track">${trackOptionsHtml(race.track, race.eventType === "6v6")}</select></label>
      </div>
      <div class="formGrid clanWarsEditFields clanWarsEditRouteFields" id="cwEditIntermissionFields" hidden>
        <label><select id="cwEditIntermissionStart" aria-label="Intermission start">${startOptionsHtml(race.intermissionStart || "")}</select></label>
        <label><select id="cwEditIntermissionEnd" aria-label="Intermission end">${endOptionsHtml(race.intermissionStart || "", race.intermissionEnd || "")}</select></label>
      </div>
      <div class="clanWarsEditResult">
        <div class="clanWarsResultPanelHead">
          <span id="cwEditResultHint">${state.editPlacements.size} / ${TEAM_SIZE} selected</span>
          <button class="navAction navAction--sm" id="btnEditResultClear" type="button">Clear</button>
        </div>
        <div class="numberPicker__grid clanWarsResultGridSelect" id="cwEditPlacementGrid"></div>
      </div>
      <button class="navAction actionStripBtn tagToggle clanWarsEditDc" id="cwEditDcToggle" type="button" aria-pressed="${state.editDc ? "true" : "false"}">DC</button>
    `;
    renderEditRouteFields();
    renderEditPlacementGrid();
    syncEditIntermissionRouteSelects();
    refreshClanWarPickers();
    const dcBtn = $("cwEditDcToggle");
    if(dcBtn) dcBtn.classList.toggle("active", state.editDc);
    document.querySelectorAll("[data-cw-edit-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editRaceKind = btn.dataset.cwEditKind === "intermission" ? "intermission" : "track";
        renderEditRouteFields();
      });
    });
    $("cwEditIntermissionStart")?.addEventListener("change", () => syncEditIntermissionRouteSelects("start"));
    $("cwEditIntermissionEnd")?.addEventListener("change", () => syncEditIntermissionRouteSelects("end"));
    $("cwEditPlacementGrid")?.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-cw-edit-place]");
      if(!button) return;
      const place = Number(button.dataset.cwEditPlace || 0);
      if(!place) return;
      if(state.editPlacements.has(place)){
        state.editPlacements.delete(place);
      }else{
        if(state.editPlacements.size >= TEAM_SIZE){
          showToast("Select 6 results.", false);
          return;
        }
        state.editPlacements.add(place);
      }
      renderEditPlacementGrid();
    });
    $("btnEditResultClear")?.addEventListener("click", () => {
      state.editPlacements.clear();
      renderEditPlacementGrid();
    });
    $("cwEditDcToggle")?.addEventListener("click", () => {
      state.editDc = !state.editDc;
      $("cwEditDcToggle")?.classList.toggle("active", state.editDc);
      $("cwEditDcToggle")?.setAttribute("aria-pressed", state.editDc ? "true" : "false");
    });
  }

  function openRaceEditDialog(index){
    state.editMatchId = "";
    if(state.current && !canEditMatch(state.current)){
      showToast(`This match is being tracked by ${trackerNameFor(state.current)}.`, false);
      return;
    }
    const race = state.current?.races?.[index];
    const dialog = $("cwEditDialog");
    if(!race || !dialog) return;
    state.editIndex = index;
    state.editEventType = race.eventType;
    state.editRaceKind = race.raceKind === "intermission" ? "intermission" : "track";
    state.editPlacements = new Set((race.placements || []).map(Number).filter(Boolean));
    state.editDc = race.dc === true;
    renderRaceEditDialog();
    try{ dialog.showModal(); }catch{ dialog.setAttribute("open", ""); }
  }

  function openSavedRaceEditDialog(matchId, index){
    state.editMatchId = String(matchId || "");
    const match = findSavedMatch(state.editMatchId);
    if(match && !canEditMatch(match)){
      showToast("Only the tracker can edit this match.", false);
      return;
    }
    const race = match?.races?.[index];
    const dialog = $("cwEditDialog");
    if(!race || !dialog) return;
    state.editIndex = index;
    state.editEventType = race.eventType;
    state.editRaceKind = race.raceKind === "intermission" ? "intermission" : "track";
    state.editPlacements = new Set((race.placements || []).map(Number).filter(Boolean));
    state.editDc = race.dc === true;
    renderRaceEditDialog();
    try{ dialog.showModal(); }catch{ dialog.setAttribute("open", ""); }
  }

  function readRaceEdit(){
    const match = getEditMatch();
    const race = match?.races?.[state.editIndex];
    if(!match || !race) return { error: "No race selected." };
    const eventType = race.eventType;
    const placements = Array.from(state.editPlacements).map(Number).filter(Boolean).sort((a, b) => a - b);
    if(placements.length !== TEAM_SIZE) return { error: "Select 6 results." };
    if(new Set(placements).size !== placements.length) return { error: "Each result can only be used once." };
    const total = fieldTotal(eventType);
    const score = scoreForPlacements(placements, eventType);
    const base = {
      id: race.id,
      raceNumber: race.raceNumber,
      eventType,
      placements,
      maxPlacement: maxPlacement(eventType),
      ownPoints: score,
      opponentPoints: eventType === "6v6" ? total - score : null,
      fieldPoints: total,
      dc: state.editDc === true,
      createdAt: race.createdAt || nowIso(),
    };
    if(eventType === "6v6"){
      const track = $("cwEditTrackSelect")?.value || "";
      if(!track) return { error: "Select a track." };
      const ruleWarning = track === "Intermission"
        ? "Intermission is not allowed in 6v6. Saved as a visible mistake."
        : repickWarningFor({ eventType, raceKind: "track", track, skipRaceId: race.id, match });
      return { ...base, raceKind: "track", track, intermissionStart: null, intermissionEnd: null, ruleWarning };
    }
    if(state.editRaceKind === "intermission"){
      const start = $("cwEditIntermissionStart")?.value || "";
      const end = $("cwEditIntermissionEnd")?.value || "";
      if(!start || !end) return { error: "Select intermission start and end." };
      return {
        ...base,
        raceKind: "intermission",
        track: routeLabel(start, end),
        intermissionStart: start,
        intermissionEnd: end,
        ruleWarning: repickWarningFor({ eventType, raceKind: "intermission", intermissionStart: start, intermissionEnd: end, skipRaceId: race.id, match }),
      };
    }
    const track = $("cwEditTrackSelect")?.value || "";
    if(!track) return { error: "Select a track." };
    return {
      ...base,
      raceKind: "track",
      track,
      intermissionStart: null,
      intermissionEnd: null,
      ruleWarning: repickWarningFor({ eventType, raceKind: "track", track, skipRaceId: race.id, match }),
    };
  }

  async function saveRaceEdit(){
    try{
      const next = readRaceEdit();
      if(next.error){
        showToast(next.error, false);
        return;
      }
      const match = getEditMatch();
      if(!canEditMatch(match)){
        showToast("Only the tracker can edit this match.", false);
        return;
      }
      const race = normalizeRace(next);
      match.races[state.editIndex] = race;
      Object.assign(match, summarizeMatch(match));
      if(state.mode === "account"){
        const { error } = await state.client.from("clan_wars_races").update(raceDbPayload(match, race)).eq("id", race.id);
        if(error) throw error;
      }
      await updateCloudMatch(match);
      persistLocal();
      $("cwEditDialog")?.close?.("save");
      render();
      showToast("Race updated.", true);
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not update race.", false);
    }
  }

  function renderRaceStrip(races, options = {}){
    return `
      <div class="clanWarsRaceStripWrap">
        <div class="clanWarsRaceStrip" aria-label="${options.savedMatchId ? "Saved Clan Wars races" : "Current Clan Wars races"}">
          ${(races || []).map((race, index) => raceRowHtml(race, { ...options, raceIndex: index })).join("")}
        </div>
      </div>
    `;
  }

  function matchOwnLabel(match){
    return normalizeDivisionTag(match?.clanName || match?.clan_name || state.activeClan?.name || "Clan");
  }

  function formatSignedPoints(value){
    const num = Number(value || 0);
    const text = formatThreshold(num);
    return num > 0 ? `+${text}` : text;
  }

  function matchScoreHtml(match, summary, options = {}){
    const own = Number(summary.ownTotal || 0);
    const opponent = Number(summary.opponentTotal || 0);
    if(match.eventType !== "6v6"){
      const threshold = matchThresholdTotal(summary, match.eventType);
      const ownTone = own > threshold ? "is-winner" : (own < threshold ? "is-loser" : "is-even");
      const margin = own - threshold;
      return `
        <div class="clanWarsMatchScore clanWarsMatchScore--analysis">
          <div class="clanWarsScoreCard ${ownTone}">
            <span>${escapeHtml(matchOwnLabel(match))}</span>
            <b>${own}</b>
          </div>
          <div class="clanWarsScoreCard is-even">
            <span>Break-even</span>
            <b>${escapeHtml(formatThresholdTarget(threshold))}</b>
          </div>
          <div class="clanWarsScoreDelta ${ownTone}">
            <span>Margin</span>
            <b>${escapeHtml(formatSignedPoints(margin))}</b>
          </div>
        </div>
      `;
    }
    const ownTone = own > opponent ? "is-winner" : (own < opponent ? "is-loser" : "is-even");
    const enemyTone = opponent > own ? "is-winner" : (opponent < own ? "is-loser" : "is-even");
    const margin = own - opponent;
    const opponentSettingsButton = options.showOpponentSettings ? `
            <button class="clanWarsMatchSettingsBtn" type="button" data-cw-match-opponent-settings="${escapeHtml(match.id)}" title="Change opponent clan name" aria-label="Change opponent clan name">
              <span aria-hidden="true">&#9881;</span>
            </button>
    ` : "";
    return `
      <div class="clanWarsMatchScore clanWarsMatchScore--analysis">
        <div class="clanWarsScoreCard ${ownTone}">
          <span>${escapeHtml(matchOwnLabel(match))}</span>
          <b>${own}</b>
        </div>
        <div class="clanWarsScoreCard clanWarsScoreCard--opponent ${enemyTone}">
          ${opponentSettingsButton}
          <span>${escapeHtml(matchOpponentLabel(match))}</span>
          <b>${opponent}</b>
        </div>
        <div class="clanWarsScoreDelta ${ownTone}">
          <span>Margin</span>
          <b>${escapeHtml(formatSignedPoints(margin))}</b>
        </div>
      </div>
    `;
  }

  function matchTotalToneClass(match, summary = summarizeMatch(match)){
    const own = Number(summary.ownTotal || 0);
    if(!Number(summary.raceCount || 0)) return "is-even";
    if(match.eventType !== "6v6"){
      const threshold = matchThresholdTotal(summary, match.eventType);
      if(own > threshold) return "is-winner";
      if(own < threshold) return "is-loser";
      return "is-even";
    }
    const opponent = Number(summary.opponentTotal || 0);
    if(own > opponent) return "is-winner";
    if(own < opponent) return "is-loser";
    return "is-even";
  }

  function divisionSlotButtonHtml(tag){
    const active = findActiveDivisionMatch(tag);
    const selected = divisionKey(state.selectedDivisionTag) === divisionKey(tag) && state.entryStarted;
    const tracker = active ? trackerNameFor(active) : "";
    const status = active
      ? `${EVENT_LABELS[active.eventType]} in progress${tracker ? ` by ${tracker}` : ""}`
      : (selected ? "Selected" : "Ready");
    return `
      <button class="clanWarsDivisionSlot${selected ? " is-selected" : ""}${active ? " has-active" : ""}" type="button" data-cw-division-slot="${escapeHtml(tag)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="clanWarsDivisionSlot__name">${escapeHtml(divisionLabel(tag))}</span>
        <span class="clanWarsDivisionSlot__status">${escapeHtml(status)}</span>
      </button>
    `;
  }

  function activeMatchCardHtml(match){
    const summary = summarizeMatch(match);
    const selected = state.current?.id === match.id;
    const canEdit = canEditMatch(match);
    const tracker = trackerNameFor(match);
    const title = `${EVENT_LABELS[match.eventType]}${normalizeDivisionTag(match.divisionTag) ? ` - ${match.divisionTag}` : ""}`;
    const totalTone = matchTotalToneClass(match, summary);
    const body = match.races?.length
      ? renderRaceStrip(match.races, { canEdit, iconPriority: selected ? "high" : "low" })
      : '<div class="emptyState">No races yet.</div>';
    return `
      <div class="clanWarsActiveMatch${selected ? " is-selected" : ""}${canEdit ? "" : " is-readonly"}" data-cw-active-match="${escapeHtml(match.id)}">
        <button class="clanWarsActiveMatch__head" type="button" data-cw-select-active-match="${escapeHtml(match.id)}">
          <span>
            <b>${escapeHtml(title)}</b>
            <small>${escapeHtml(tracker ? `Tracked by ${tracker}` : "Tracked match")}${canEdit ? "" : " - read-only"}</small>
          </span>
          <span class="clanWarsActiveMatch__total ${totalTone}">${summary.ownTotal}</span>
        </button>
        ${body}
      </div>
    `;
  }

  function matchRowHtml(match){
    const summary = summarizeMatch(match);
    const isOpen = !!state.openMatchDetails[match.id];
    const canEdit = canEditMatch(match);
    const divisionOptions = divisionTagOptions(match);
    const completedText = formatDate(match.completedAt || match.createdAt);
    const tracker = trackerNameFor(match);
    const metaPills = [
      savedMatchMetaPillHtml(match.divisionTag, "clanWarsSavedMetaPill--division"),
      tracker ? savedMatchMetaPillHtml(`Tracked by ${tracker}`, "clanWarsSavedMetaPill--tracker") : "",
      summary.dcCount > 0 ? savedMatchMetaPillHtml(`${summary.dcCount} DC`, "clanWarsSavedMetaPill--dc") : "",
    ].filter(Boolean).join("");
    const deleteBox = canEdit ? `
          <div class="clanWarsSavedActions">
            <button class="btn2 danger clanWarsDeleteMatchBtn" type="button" data-cw-delete-match="${escapeHtml(match.id)}">Delete match</button>
          </div>
    ` : "";
    const divisionBox = divisionOptions.length ? `
          <div class="mogiResultFormatBox clanWarsDivisionBox" aria-label="Saved match division tag">
            <div class="mogiResultFormatGroupTitle">Division</div>
            <div class="clanWarsDivisionTags">
              ${divisionOptions.map((option) => `
                <button class="mogiResultFormatTag clanWarsDivisionTag${option === match.divisionTag ? " active" : ""}" type="button" data-cw-saved-division-tag="${escapeHtml(match.id)}" data-cw-division-value="${escapeHtml(option)}"${canEdit ? "" : " disabled"}>
                  ${escapeHtml(option)}
                </button>
              `).join("")}
            </div>
          </div>
    ` : normalizeDivisionTag(match.divisionTag) ? `
          <div class="mogiResultFormatBox clanWarsDivisionBox" aria-label="Saved match division tag">
            <div class="mogiResultFormatGroupTitle">Division</div>
            <div class="clanWarsStaticTag">${escapeHtml(match.divisionTag)}</div>
          </div>
    ` : "";
    const detailsBody = isOpen ? `
          ${renderRaceStrip(match.races || [], { savedMatchId: match.id, canEdit })}
          ${divisionBox}
          ${deleteBox}
    ` : "";
    return `
      <div class="clanWarsMatchCard${isOpen ? " is-open" : ""}" data-cw-match-card="${escapeHtml(match.id)}" tabindex="0" role="button" aria-expanded="${isOpen ? "true" : "false"}">
        <div class="clanWarsMatchRow">
          <div class="clanWarsMatchSummary">
            <div class="clanWarsMatchTitle">
              <span class="clanWarsSavedMode">${escapeHtml(EVENT_LABELS[match.eventType])}</span>
              <span class="clanWarsSavedDate">${escapeHtml(completedText)}</span>
            </div>
            <div class="clanWarsMatchMeta">${metaPills || savedMatchMetaPillHtml("Tracked match")}</div>
          </div>
          ${matchScoreHtml(match, summary, { showOpponentSettings: isOpen && canEdit && match.eventType === "6v6" })}
          <div class="clanWarsMatchDownloadSlot">
            <button class="clanWarsDownloadMatchBtn" type="button" data-cw-download-match="${escapeHtml(match.id)}" title="Download match image" aria-label="Download this match as image">
              <span aria-hidden="true">&#8595;</span>
            </button>
          </div>
        </div>
        <div class="clanWarsMatchDetails"${isOpen ? "" : " hidden"}>
          ${detailsBody}
        </div>
      </div>
    `;
  }

  function render(){
    const eventSwitch = $("btnClanWarsEventSwitch");
    const eventSwitchStatus = $("cwEventSwitchStatus");
    if(eventSwitch){
      const isOn = state.eventType === "6v6v6v6";
      eventSwitch.classList.toggle("is-on", isOn);
      eventSwitch.setAttribute("aria-checked", isOn ? "true" : "false");
      eventSwitch.setAttribute("aria-label", isOn ? "6v18 mode on" : "6v18 mode off");
      eventSwitch.title = isOn ? "6v18 active" : "6v6 active";
      eventSwitch.disabled = state.loading;
    }
    if(eventSwitchStatus) eventSwitchStatus.textContent = state.eventType === "6v6v6v6" ? "6v18 active" : "6v6 active";
    const divisionCard = $("cwDivisionCard");
    const divisionStart = $("cwDivisionStart");
    const divisionSlots = $("cwDivisionSlots");
    const slotOptions = clanDivisionSlots();
    const showDivisionStart = !!state.activeClan && slotOptions.length > 0;
    if(divisionCard) divisionCard.hidden = !showDivisionStart;
    if(divisionStart && divisionSlots){
      divisionStart.hidden = !showDivisionStart;
      divisionSlots.innerHTML = slotOptions.map(divisionSlotButtonHtml).join("");
    }
    renderHeroSummary();
    document.querySelectorAll("[data-cw-kind]").forEach((btn) => {
      const active = btn.dataset.cwKind === state.raceKind;
      btn.classList.toggle("active", active);
      btn.classList.toggle("isActive", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    const entryCard = document.querySelector(".clanWarsEntryCard");
    const currentEditable = canEditMatch(state.current);
    if(entryCard) entryCard.hidden = !state.entryStarted || !currentEditable;
    const entryTitle = $("cwEntryTitle");
    if(entryTitle){
      const slot = state.activeClan && state.entryStarted ? divisionLabel(state.selectedDivisionTag) : "";
      entryTitle.textContent = slot && slot !== "Clan" ? `Race entry - ${slot}` : "Race entry";
    }
    const is24 = state.eventType === "6v6v6v6";
    $("cwIntermissionMode").hidden = !is24;
    $("cwIntermissionFields").hidden = !is24 || state.raceKind !== "intermission";
    $("cwTrackField").hidden = is24 && state.raceKind === "intermission";
    updateDestinyNotice();
    const opponentCard = $("cwOpponentTotalCard");
    if(opponentCard) opponentCard.querySelector(".statLabel").textContent = is24 ? "Break-even" : "Opponent total";

    updatePlacementOptions();
    const dcBtn = $("cwDcToggle");
    if(dcBtn){
      dcBtn.classList.toggle("active", state.entryDc);
      dcBtn.setAttribute("aria-pressed", state.entryDc ? "true" : "false");
    }
    markRepickOptions();

    const summary = summarizeMatch(state.current || { eventType: state.eventType, races: [] });
    $("cwRaceCount").textContent = `${summary.raceCount} / ${MAX_RACES}`;
    $("cwOwnTotal").textContent = String(summary.ownTotal);
    $("cwOpponentTotal").textContent = String(state.eventType === "6v6" ? summary.opponentTotal : formatThresholdTarget(matchThresholdTotal(summary, state.eventType)));
    $("cwDcCount").textContent = String(summary.dcCount);
    const scopeBtn = $("cwScopeLabel");
    if(scopeBtn){
      const clanName = state.activeClan?.name || "";
      scopeBtn.innerHTML = clanName ? clanScopeButtonHtml(state.activeClan) : "No clan joined";
      scopeBtn.disabled = state.loading || !clanName;
      scopeBtn.classList.toggle("is-active", !!clanName);
      scopeBtn.title = clanName ? `View ${clanName} members` : "";
      scopeBtn.setAttribute("aria-label", clanName ? `View ${clanName} members` : "No clan joined");
    }
    const clanBtn = $("btnClanInfo");
    if(clanBtn){
      clanBtn.textContent = state.loading ? "Loading..." : (state.activeClan ? "Leave clan" : "Join clan");
      clanBtn.disabled = state.loading;
    }
    const userInfo = $("cwUserInfo");
    if(userInfo){
      userInfo.textContent = "";
      userInfo.hidden = true;
    }

    const raceList = $("cwCurrentRaceList");
    if(raceList){
      if(state.activeClan){
        const active = activeClanMatches();
        if(active.length){
          raceList.innerHTML = active.map(activeMatchCardHtml).join("");
        }else if(state.entryStarted && !currentEditable){
          raceList.innerHTML = '<div class="emptyState">This match is read-only.</div>';
        }else{
          raceList.innerHTML = '<div class="emptyState">Choose a match slot and save the first race.</div>';
        }
      }else{
        const races = state.current?.races || [];
        raceList.innerHTML = races.length ? renderRaceStrip(races, { canEdit: currentEditable, iconPriority: "high" }) : '<div class="emptyState">Start a match by saving the first race.</div>';
      }
    }
    renderSavedMatches();
    $("btnSaveRace").disabled = !state.entryStarted || !currentEditable || summary.raceCount >= MAX_RACES;
    $("btnUndoRace").disabled = !currentEditable;
    $("btnClearPlacements").disabled = !currentEditable;
    $("cwDcToggle").disabled = !currentEditable;
    updateTrackSuggestionButton();
    if($("cwTrackSuggestionDialog")?.open) renderTrackSuggestionDialog();
    refreshClanWarPickers();
  }

  function bindEvents(){
    $("btnClanWarsEventSwitch")?.addEventListener("click", () => {
      startEventType(state.eventType === "6v6v6v6" ? "6v6" : "6v6v6v6");
    });
    $("cwDivisionSlots")?.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-cw-division-slot]");
      if(!button) return;
      selectDivisionSlot(button.getAttribute("data-cw-division-slot") || "");
    });
    document.querySelectorAll("[data-cw-kind]").forEach((btn) => {
      btn.addEventListener("click", () => setRaceKind(btn.dataset.cwKind));
    });
    $("cwIntermissionStart")?.addEventListener("change", () => fillIntermissionRouteSelects("start"));
    $("cwIntermissionEnd")?.addEventListener("change", () => fillIntermissionRouteSelects("end"));
    $("btnClearPlacements")?.addEventListener("click", clearRaceEntry);
    $("btnSaveRace")?.addEventListener("click", saveRace);
    $("btnUndoRace")?.addEventListener("click", undoRace);
    $("btnCwTrackSuggestions")?.addEventListener("click", () => {
      if($("cwTrackSuggestionDialog")?.open){
        closeTrackSuggestionDialog();
        return;
      }
      openTrackSuggestionDialog();
    });
    $("btnClanDivisionStats")?.addEventListener("click", openDivisionStatsDialog);
    $("btnCloseCwDivisionStats")?.addEventListener("click", closeDivisionStatsDialog);
    $("cwDivisionStatsFilter")?.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-cw-division-stats-event]");
      if(!button) return;
      selectDivisionStatsEventType(button.getAttribute("data-cw-division-stats-event") || "6v6");
    });
    $("cwDivisionStatsDialog")?.addEventListener("click", (event) => {
      if(event.target === $("cwDivisionStatsDialog")) closeDivisionStatsDialog();
    });
    $("btnCloseCwTrackSuggestions")?.addEventListener("click", closeTrackSuggestionDialog);
    $("cwTrackSuggestionDialog")?.addEventListener("click", (event) => {
      if(event.target === $("cwTrackSuggestionDialog")) closeTrackSuggestionDialog();
    });
    $("cwTrackSuggestionGrid")?.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-cw-suggest-track], [data-cw-suggest-route-start]");
      if(!button) return;
      const routeStart = String(button.getAttribute("data-cw-suggest-route-start") || "").trim();
      const routeEnd = String(button.getAttribute("data-cw-suggest-route-end") || "").trim();
      if(routeStart && routeEnd){
        selectSuggestedIntermissionRoute(routeStart, routeEnd);
        closeTrackSuggestionDialog();
        return;
      }
      const track = String(button.getAttribute("data-cw-suggest-track") || "").trim();
      if(selectSuggestedTrack(track)) closeTrackSuggestionDialog();
    });
    $("btnCwSavedPrev")?.addEventListener("click", async () => {
      if(state.savedMatchPage <= 1) return;
      state.savedMatchPage -= 1;
      if(state.mode === "account"){
        try{ await loadCloud(); }
        catch(e){ console.error(e); showToast(e?.message || "Could not load matches.", false); }
        render();
        return;
      }
      renderSavedMatches();
    });
    $("btnCwSavedNext")?.addEventListener("click", async () => {
      const savedCount = state.mode === "account" && Number.isFinite(Number(state.savedMatchTotal))
        ? Number(state.savedMatchTotal)
        : mergeMatchList(state.matches.filter((match) => match.status === "completed")).length;
      const maxPage = savedMatchPageCount(savedCount);
      if(state.savedMatchPage >= maxPage) return;
      state.savedMatchPage += 1;
      if(state.mode === "account"){
        try{ await loadCloud(); }
        catch(e){ console.error(e); showToast(e?.message || "Could not load matches.", false); }
        render();
        return;
      }
      renderSavedMatches();
    });
    $("cwCurrentRaceList")?.addEventListener("click", (event) => {
      const activeButton = event.target.closest?.("[data-cw-select-active-match]");
      if(activeButton){
        const matchId = activeButton.getAttribute("data-cw-select-active-match") || "";
        const match = allLoadedMatches().find((item) => item.id === matchId);
        if(match){
          setCurrentMatch(match);
          state.entryStarted = true;
          render();
        }
        return;
      }
      const tile = event.target.closest?.("[data-cw-edit-race]");
      if(!tile) return;
      const activeCard = tile.closest?.("[data-cw-active-match]");
      if(activeCard){
        const matchId = activeCard.getAttribute("data-cw-active-match") || "";
        const match = allLoadedMatches().find((item) => item.id === matchId);
        if(match){
          setCurrentMatch(match);
          state.entryStarted = true;
        }
      }
      openRaceEditDialog(Number(tile.dataset.cwEditRace || 0));
    });
    $("btnSaveRaceEdit")?.addEventListener("click", saveRaceEdit);
    $("cwEditDialog")?.addEventListener("close", () => {
      state.editIndex = null;
      state.editMatchId = "";
      state.editPlacements = new Set();
    });
    $("cwDcToggle")?.addEventListener("click", () => {
      state.entryDc = !state.entryDc;
      render();
    });
    $("btnClanInfo")?.addEventListener("click", () => {
      if(state.activeClan) leaveClan();
      else openClanJoinDialog();
    });
    $("cwScopeLabel")?.addEventListener("click", openClanMembersDialog);
    $("cwMembersDialog")?.addEventListener("click", (event) => {
      if(event.target === $("cwMembersDialog")) $("cwMembersDialog")?.close();
    });
    $("cwMembersDialog")?.addEventListener("close", () => {
      resetClanIconUpload();
      renderClanIconManager();
    });
    $("btnChooseClanIcon")?.addEventListener("click", () => $("cwClanIconFile")?.click());
    $("cwClanIconFile")?.addEventListener("change", (event) => {
      handleClanIconFile(event.target.files?.[0]);
    });
    $("btnUploadClanIcon")?.addEventListener("click", uploadClanIcon);
    $("btnClanPicker")?.addEventListener("click", () => {
      const nextOpen = !state.clanSearch.open;
      state.clanSearch.letterFilter = "all";
      setClanPickerOpen(nextOpen);
    });
    $("btnClanPicker")?.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
      event.preventDefault();
      setClanPickerOpen(true);
    });
    $("cwClanPassword")?.addEventListener("input", () => {
      setClanJoinError("");
      updateJoinButtonState();
    });
    $("cwClanPassword")?.addEventListener("focus", () => {
      setClanPickerOpen(false);
    });
    $("cwClanPassword")?.addEventListener("keydown", (event) => {
      if(event.key !== "Enter") return;
      event.preventDefault();
      joinSelectedClan();
    });
    $("cwClanPickerPanel")?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    $("cwClanLetterRail")?.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-cw-clan-letter]");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      setClanLetterFilter(button.getAttribute("data-cw-clan-letter") || "all", true);
    });
    $("cwClanLetterRail")?.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      const button = event.target.closest?.("[data-cw-clan-letter]");
      if(!button) return;
      event.preventDefault();
      setClanLetterFilter(button.getAttribute("data-cw-clan-letter") || "all");
    });
    $("cwClanLetterRail")?.addEventListener("pointerdown", (event) => {
      if(!event.target.closest?.("[data-cw-clan-letter]")) return;
      event.preventDefault();
      event.stopPropagation();
      activeClanLetterDrag = true;
      applyClanLetterFilterFromPoint(event.clientX, event.clientY);
    });
    $("cwClanSuggestions")?.addEventListener("click", (event) => {
      const option = event.target.closest?.("[data-cw-clan-option]");
      if(!option) return;
      event.stopPropagation();
      state.clanSearch.selectedClanId = option.getAttribute("data-cw-clan-option") || "";
      const clans = filteredClanSuggestions();
      state.clanSearch.activeIndex = Math.max(0, clans.findIndex((clan) => clan.id === state.clanSearch.selectedClanId));
      const selected = clans[state.clanSearch.activeIndex];
      selectClanSuggestion(selected);
    });
    $("btnJoinClanConfirm")?.addEventListener("click", joinSelectedClan);
    $("cwClanDialog")?.addEventListener("close", () => {
      setClanPickerOpen(false);
      setClanJoinError("");
    });
    $("cwClanDialog")?.addEventListener("click", (event) => {
      if(!state.clanSearch.open) return;
      if(eventInsideClanPicker(event)) return;
      setClanPickerOpen(false);
    });
    $("cwClanDialog")?.addEventListener("keydown", (event) => {
      if(!state.clanSearch.open) return;
      if(event.key === "Escape"){
        event.preventDefault();
        setClanPickerOpen(false);
        $("btnClanPicker")?.focus();
        return;
      }
      if(event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
      const letter = event.key.toUpperCase();
      if(!/^[A-Z]$/.test(letter)) return;
      event.preventDefault();
      setClanLetterFilter(letter);
    });
    document.addEventListener("pointermove", (event) => {
      if(!activeClanLetterDrag) return;
      event.preventDefault();
      applyClanLetterFilterFromPoint(event.clientX, event.clientY);
    }, { passive:false });
    document.addEventListener("pointerup", () => {
      activeClanLetterDrag = false;
    });
    document.addEventListener("pointercancel", () => {
      activeClanLetterDrag = false;
    });
    $("cwResultDialog")?.addEventListener("close", () => {
      if($("cwResultDialog")?.returnValue === "new") newMatch();
      state.resultDialogMatchId = "";
    });
    $("cwOpponentNameForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveOpponentClanName();
    });
    $("btnCancelCwOpponentName")?.addEventListener("click", closeOpponentNameDialog);
    $("cwOpponentNameDialog")?.addEventListener("click", (event) => {
      if(event.target === $("cwOpponentNameDialog")) closeOpponentNameDialog();
    });
    $("cwOpponentNameDialog")?.addEventListener("close", () => {
      state.opponentNameMatchId = "";
    });
    $("cwSavedMatchList")?.addEventListener("click", (event) => {
      const downloadButton = event.target.closest?.("[data-cw-download-match]");
      if(downloadButton){
        event.preventDefault();
        event.stopPropagation();
        downloadSavedMatchImage(downloadButton.getAttribute("data-cw-download-match") || "", downloadButton);
        return;
      }
      const opponentSettingsButton = event.target.closest?.("[data-cw-match-opponent-settings]");
      if(opponentSettingsButton){
        event.preventDefault();
        event.stopPropagation();
        openOpponentNameDialog(opponentSettingsButton.getAttribute("data-cw-match-opponent-settings") || "");
        return;
      }
      const deleteButton = event.target.closest?.("[data-cw-delete-match]");
      if(deleteButton){
        deleteSavedMatch(deleteButton.getAttribute("data-cw-delete-match") || "");
        return;
      }
      const savedRaceTile = event.target.closest?.("[data-cw-saved-race-edit]");
      if(savedRaceTile){
        openSavedRaceEditDialog(savedRaceTile.getAttribute("data-cw-saved-race-edit") || "", Number(savedRaceTile.getAttribute("data-race-index") || 0));
        return;
      }
      const divisionButton = event.target.closest?.("[data-cw-saved-division-tag]");
      if(divisionButton){
        setSavedMatchDivisionTag(
          divisionButton.getAttribute("data-cw-saved-division-tag") || "",
          divisionButton.getAttribute("data-cw-division-value") || ""
        );
        return;
      }
      const card = event.target.closest?.("[data-cw-match-card]");
      if(!card || event.target.closest?.("button, a, input, select, textarea, label")) return;
      const matchId = card.getAttribute("data-cw-match-card") || "";
      state.openMatchDetails[matchId] = !state.openMatchDetails[matchId];
      render();
    });
    $("cwSavedMatchList")?.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      if(event.target.closest?.("button, a, input, select, textarea, label")) return;
      const card = event.target.closest?.("[data-cw-match-card]");
      if(!card) return;
      event.preventDefault();
      const matchId = card.getAttribute("data-cw-match-card") || "";
      state.openMatchDetails[matchId] = !state.openMatchDetails[matchId];
      render();
    });
  }

  async function init(){
    bindEvents();
    await loadTrackIconMap();
    await loadStratsMeta();
    fillTrackControls();
    updatePlacementOptions();
    initClanWarPickers();
    initResultPicker();
    render();
    try{
      if(typeof window.mkwtRequireAuth === "function"){
        await window.mkwtRequireAuth({
          pageName: "clan-wars.html",
          allowGuest: true,
          tryBackupRestore: true,
          onAccount: async (session, client) => {
            state.mode = "account";
            state.session = session;
            state.client = client;
            await loadCurrentProfileName();
            await restoreActiveClan();
            await loadCloud();
          },
          onGuest: async () => {
            state.mode = "guest";
            loadLocal();
          },
        });
      }else{
        state.mode = "guest";
        loadLocal();
      }
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not load Clan Wars.", false);
    }finally{
      state.loading = false;
      if(!state.activeClan && !state.entryStarted) state.entryStarted = true;
      fillTrackControls();
      updatePlacementOptions();
      render();
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
