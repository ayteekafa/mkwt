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
  const MAX_RACES = 12;
  const TEAM_SIZE = 6;
  const QUERY_BATCH_SIZE = 100;
  const CLAN_WARS_RACE_SELECT = "id, match_id, race_number, event_type, race_kind, track, intermission_start, intermission_end, placements, max_placement, own_points, opponent_points, field_points, dc, rule_warning, created_at, updated_at";
  const $ = (id) => document.getElementById(id);
  let trackIconPaths = new Map();
  let stratsMetaIntermissions = null;
  let clanWarPickerApi = null;
  let resultPickerApi = null;
  let activeClanLetterDrag = false;
  let clanJoinErrorTimer = 0;
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
    resultDialogMatchId: "",
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
      divisions: Array.from(new Set(divisions)),
    };
  }

  function persistActiveClan(){
    if(state.mode !== "account") return;
    if(state.activeClan) safeWriteJson(activeClanStorageKey(), state.activeClan);
    else localStorage.removeItem(activeClanStorageKey());
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
      races,
      ...summary,
    };
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
      const { data, error } = await state.client
        .from("clan_wars_races")
        .select(CLAN_WARS_RACE_SELECT)
        .in("match_id", batchIds)
        .order("race_number", { ascending: true });
      if(error) throw error;
      rows.push(...(data || []));
    }
    return rows;
  }

  async function loadClanDetails(clanId){
    if(!state.client || !clanId) return null;
    const { data: clan, error: clanError } = await state.client
      .from("clans")
      .select("id, name, slug")
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

  async function restoreActiveClan(){
    if(state.mode !== "account" || !state.client) return;
    const saved = normalizeClan(safeReadJson(activeClanStorageKey(), null));
    if(!saved?.id) return;
    try{
      state.activeClan = await loadClanDetails(saved.id);
      if(!state.activeClan) persistActiveClan();
    }catch(e){
      console.warn("[clan-wars] could not restore active clan", e);
      state.activeClan = null;
      persistActiveClan();
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
    let profiles = [];
    let profileError = null;
    ({ data: profiles, error: profileError } = await state.client
      .from("profiles")
      .select("id, nickname")
      .in("id", missing));
    if(profileError && String(profileError.message || "").includes("column profiles.id")){
      ({ data: profiles, error: profileError } = await state.client
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", missing));
    }
    if(profileError){
      console.warn("[clan-wars] profile lookup skipped", profileError.message || profileError);
      return;
    }
    (profiles || []).forEach((profile) => {
      const id = String(profile.id || profile.user_id || "");
      if(id) state.memberNames.set(id, normalizeDivisionTag(profile.nickname) || "Member");
    });
    const unresolved = missing.filter((id) => !state.memberNames.has(id));
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
    let query = state.client
      .from("clan_wars_matches")
      .select("id, owner_user_id, clan_id, event_type, status, own_total, opponent_total, field_total, race_count, dc_count, division_tag, created_by_user_id, completed_at, created_at, updated_at")
      .order("created_at", { ascending: false });
    if(state.activeClan?.id){
      query = query.eq("clan_id", state.activeClan.id);
    }else{
      query = query.is("clan_id", null).eq("owner_user_id", uidValue);
    }
    const { data: matchRows, error: matchError } = await query;
    if(matchError) throw matchError;

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
        .select("id, name, slug")
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
    const { data: memberships, error } = await state.client
      .from("clan_memberships")
      .select("user_id, role, status")
      .eq("clan_id", state.activeClan.id)
      .eq("status", "active");
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
      return {
        id: userId,
        name: profileById.get(userId) || (isCurrentUser ? currentProfileName() : "Member"),
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

  function setClanLetterFilter(letter){
    state.clanSearch.letterFilter = letter || "all";
    state.clanSearch.activeIndex = 0;
    renderClanSuggestions();
  }

  function applyClanLetterFilterFromPoint(clientX, clientY){
    if(!activeClanLetterDrag) return;
    const rail = $("cwClanLetterRail");
    const target = document.elementFromPoint(clientX, clientY);
    const button = target?.closest?.("[data-cw-clan-letter]");
    if(!rail || !button || !rail.contains(button)) return;
    setClanLetterFilter(button.getAttribute("data-cw-clan-letter") || "all");
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
      state.activeClan = joined;
      persistActiveClan();
      $("cwClanDialog")?.close();
      await loadCloud();
      render();
      showToast(`Joined ${joined.name}. Clan matches are shown now.`, true);
    }catch(e){
      setClanJoinError(e?.message || "Could not join clan.", true);
      updateJoinButtonState();
    }
  }

  async function leaveClan(){
    if(!state.activeClan) return;
    const name = state.activeClan.name || "clan";
    state.activeClan = null;
    persistActiveClan();
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
      const res = await fetch("track_icon_map.json", { cache: "no-store" });
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

  function getTrackIconPath(trackName){
    return trackIconPaths.get(String(trackName || "")) || "";
  }

  async function loadStratsMeta(){
    if(stratsMetaIntermissions) return stratsMetaIntermissions;
    try{
      const res = await fetch("strats.json", { cache: "no-cache" });
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
    return list.slice().sort((a, b) => a - b).map((place) => `#${place}`).join(", ");
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
        button.textContent = `#${place}`;
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
    const configs = [
      { id: "cwTrackSelect", kind: "track" },
      { id: "cwIntermissionStart", kind: "track" },
      { id: "cwIntermissionEnd", kind: "track" },
    ].map((config) => ({ ...config, selectEl: $(config.id) })).filter((config) => config.selectEl);
    if(!configs.length) return;

    const pickers = new Map();
    const backdrop = document.createElement("div");
    backdrop.className = "trackPickerBackdrop loungePickerBackdrop";
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    let openPicker = null;
    let scrollLockY = 0;
    let scrollLocked = false;
    let activeLetterPicker = null;

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
    const trackLetter = (option) => {
      const value = String(option?.value || option?.label || "").trim();
      return (value.charAt(0) || "?").toUpperCase();
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
      if(iconPath){
        const img = document.createElement("img");
        img.className = "trackPicker__icon";
        img.src = iconPath;
        img.alt = "";
        img.width = 24;
        img.height = 24;
        img.decoding = "async";
        img.loading = "lazy";
        img.onerror = () => {
          img.remove();
          const fallback = document.createElement("span");
          fallback.className = "trackPicker__iconFallback";
          fallback.textContent = trackAbbrev(trackName);
          slot.appendChild(fallback);
        };
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
      const activeLetter = picker.letterFilter || "all";
      const layout = document.createElement("div");
      layout.className = "trackPicker__layout";
      const rail = document.createElement("div");
      rail.className = "trackPicker__letterRail";
      rail.setAttribute("aria-label", "Track letter filter");
      const letterValues = ["all", ...letters];
      panel.style.setProperty("--track-picker-letter-count", String(letterValues.length));
      panel.style.setProperty("--track-picker-mobile-height", `${34 + (letterValues.length * 24)}px`);
      letterValues.forEach((letter) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = letter === "all" ? "trackPicker__letterBtn trackPicker__letterBtn--all" : "trackPicker__letterBtn";
        if(letter === "I" && options.some((option) => option.value === "Intermission")) button.classList.add("trackPicker__letterBtn--intermission");
        if(letter === activeLetter) button.classList.add("is-active");
        button.dataset.letterFilter = letter;
        button.setAttribute("aria-pressed", letter === activeLetter ? "true" : "false");
        button.textContent = letter === "all" ? "All" : (letter === "I" && options.some((option) => option.value === "Intermission") ? "IM!" : letter);
        rail.appendChild(button);
      });
      rail.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-letter-filter]");
        if(!button) return;
        event.preventDefault();
        applyLetterFilter(picker, button.dataset.letterFilter || "all");
      });
      rail.addEventListener("pointerdown", (event) => {
        if(!event.target.closest?.("[data-letter-filter]")) return;
        event.preventDefault();
        activeLetterPicker = picker;
        applyLetterFilterFromPoint(event.clientX, event.clientY);
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
    const applyLetterFilter = (picker, letter) => {
      if(!picker || picker.kind !== "track" || picker.panel.hidden) return;
      const next = letter || "all";
      if((picker.letterFilter || "all") === next) return;
      picker.letterFilter = next;
      renderPanel(picker);
      alignPanel(picker);
    };
    const applyLetterFilterFromPoint = (clientX, clientY) => {
      if(!activeLetterPicker) return;
      const target = document.elementFromPoint(clientX, clientY);
      const button = target?.closest?.("[data-letter-filter]");
      if(!button || !activeLetterPicker.panel.contains(button)) return;
      applyLetterFilter(activeLetterPicker, button.dataset.letterFilter || "all");
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

    configs.forEach((config) => {
      const selectEl = config.selectEl;
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
      new MutationObserver(() => refreshPicker(picker)).observe(selectEl, { childList: true, subtree: true });
      refreshPicker(picker);
    });

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
      applyLetterFilterFromPoint(event.clientX, event.clientY);
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
      if(event.key !== "Escape" || !openPicker) return;
      event.preventDefault();
      closeAll();
    });
    window.addEventListener("resize", closeAll);
    clanWarPickerApi = {
      refreshAll(){
        for(const picker of pickers.values()) refreshPicker(picker);
      },
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
        state.matches = mergeMatchList([match, ...state.matches]);
        state.current = null;
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
        <div class="clanWarsResultStat"><span>${is6v6 ? "Opponent total" : "Remaining field points"}</span><b>${is6v6 ? summary.opponentTotal : summary.fieldTotal - summary.ownTotal}</b></div>
      </div>
      <div>${is6v6 ? resultText(summary.ownTotal, summary.opponentTotal) : "6v6v6v6 only tracks your clan total because the other team groups are not known."}</div>
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
      if(state.mode === "account") await deleteCloudMatch(match);
      state.matches = state.matches.filter((item) => String(item.id) !== String(match.id));
      delete state.openMatchDetails[match.id];
      if(state.mode === "guest") persistLocal();
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

  function formatDate(value){
    try{ return new Date(value).toLocaleString(); }catch{ return String(value || ""); }
  }

  function raceMeta(race){
    const parts = [
      `Placements ${race.placements.join(", ")}`,
      `${race.ownPoints} pts`,
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
    const places = new Set((race.placements || []).map(Number));
    if(!places.has(1) || !places.has(2)) return false;
    return [3,4,5,6].filter((place) => places.has(place)).length >= 3;
  }

  function raceToneClass(race){
    const teamCount = race.eventType === "6v6v6v6" ? 4 : 2;
    const average = Number(race.fieldPoints || fieldTotal(race.eventType)) / teamCount;
    const points = Number(race.ownPoints || 0);
    if(points > average) return "is-positive";
    if(points < average) return "is-negative";
    return "is-even";
  }

  function trackIconMarkup(trackName, extraClass = ""){
    const iconPath = getTrackIconPath(trackName);
    const className = `raceTrackIcon${extraClass ? ` ${extraClass}` : ""}`;
    if(iconPath){
      return `<img class="${className}" src="${escapeHtml(iconPath)}" alt="${escapeHtml(trackName || "Track")}" loading="lazy" decoding="async">`;
    }
    return `<span class="raceTrackIconFallback${extraClass ? ` ${extraClass}` : ""}" aria-label="${escapeHtml(trackName || "Track")}">${escapeHtml(trackAbbrev(trackName))}</span>`;
  }

  function raceVisualHtml(race){
    if(race.raceKind === "intermission" && race.intermissionStart && race.intermissionEnd){
      return `
        <span class="clanWarsRaceRoute" title="${escapeHtml(race.track)}">
          <span class="clanWarsRaceRoute__node">${trackIconMarkup(race.intermissionStart, "clanWarsRaceIcon")}</span>
          <span class="clanWarsRaceRoute__arrow" aria-hidden="true">-&gt;</span>
          <span class="clanWarsRaceRoute__node">${trackIconMarkup(race.intermissionEnd, "clanWarsRaceIcon")}</span>
        </span>
      `;
    }
    return `<span class="clanWarsRaceVisual">${trackIconMarkup(race.track, "clanWarsRaceIcon")}</span>`;
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
        ${raceVisualHtml(race)}
        <span class="clanWarsRaceTile__score ${toneClass}">${race.ownPoints}</span>
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
      button.textContent = `#${place}`;
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
          ${(races || []).map((race) => raceRowHtml(race, options)).join("")}
        </div>
      </div>
    `;
  }

  function matchOwnLabel(match){
    return normalizeDivisionTag(match?.clanName || match?.clan_name || state.activeClan?.name || "Clan");
  }

  function matchScoreHtml(match, summary){
    const own = Number(summary.ownTotal || 0);
    const opponent = Number(summary.opponentTotal || 0);
    if(match.eventType !== "6v6"){
      return `
        <div class="clanWarsMatchScore">
          <div class="clanWarsScoreLine is-winner"><span>${escapeHtml(matchOwnLabel(match))}</span><b>${own}</b></div>
        </div>
      `;
    }
    const ownTone = own > opponent ? "is-winner" : (own < opponent ? "is-loser" : "is-even");
    const enemyTone = opponent > own ? "is-winner" : (opponent < own ? "is-loser" : "is-even");
    return `
      <div class="clanWarsMatchScore">
        <div class="clanWarsScoreLine ${ownTone}"><span>${escapeHtml(matchOwnLabel(match))}</span><b>${own}</b></div>
        <div class="clanWarsScoreLine ${enemyTone}"><span>Enemy</span><b>${opponent}</b></div>
      </div>
    `;
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
    const body = match.races?.length
      ? renderRaceStrip(match.races, { canEdit })
      : '<div class="emptyState">No races yet.</div>';
    return `
      <div class="clanWarsActiveMatch${selected ? " is-selected" : ""}${canEdit ? "" : " is-readonly"}" data-cw-active-match="${escapeHtml(match.id)}">
        <button class="clanWarsActiveMatch__head" type="button" data-cw-select-active-match="${escapeHtml(match.id)}">
          <span>
            <b>${escapeHtml(title)}</b>
            <small>${escapeHtml(tracker ? `Tracked by ${tracker}` : "Tracked match")}${canEdit ? "" : " - read-only"}</small>
          </span>
          <span class="clanWarsActiveMatch__total">${summary.ownTotal}</span>
        </button>
        ${body}
      </div>
    `;
  }

  function matchRowHtml(match){
    const summary = summarizeMatch(match);
    const is6v6 = match.eventType === "6v6";
    const isOpen = !!state.openMatchDetails[match.id];
    const canEdit = canEditMatch(match);
    const tag = normalizeDivisionTag(match.divisionTag) ? divisionTagPillHtml(match.divisionTag) : "";
    const titleDivision = normalizeDivisionTag(match.divisionTag) ? ` - ${match.divisionTag}` : "";
    const divisionOptions = divisionTagOptions(match);
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
    return `
      <div class="clanWarsMatchCard${isOpen ? " is-open" : ""}" data-cw-match-card="${escapeHtml(match.id)}" tabindex="0" role="button" aria-expanded="${isOpen ? "true" : "false"}">
        <div class="clanWarsMatchRow">
          <div>
            <div class="clanWarsMatchTitle">${escapeHtml(EVENT_LABELS[match.eventType])}${escapeHtml(titleDivision)} - ${escapeHtml(formatDate(match.completedAt || match.createdAt))}</div>
            <div class="clanWarsMatchMeta">${summary.raceCount} races | ${summary.dcCount} DC | ${is6v6 ? resultText(summary.ownTotal, summary.opponentTotal) : "Own total only"}${tag ? ` | ${tag}` : ""}</div>
          </div>
          ${matchScoreHtml(match, summary)}
        </div>
        <div class="clanWarsMatchDetails"${isOpen ? "" : " hidden"}>
          ${renderRaceStrip(match.races || [], { savedMatchId: match.id, canEdit })}
          ${divisionBox}
          ${deleteBox}
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
    const divisionStart = $("cwDivisionStart");
    const divisionSlots = $("cwDivisionSlots");
    const slotOptions = clanDivisionSlots();
    if(divisionStart && divisionSlots){
      divisionStart.hidden = !state.activeClan || slotOptions.length === 0;
      divisionSlots.innerHTML = slotOptions.map(divisionSlotButtonHtml).join("");
    }
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
    if(opponentCard) opponentCard.querySelector(".statLabel").textContent = is24 ? "Remaining field" : "Opponent total";

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
    $("cwOpponentTotal").textContent = String(state.eventType === "6v6" ? summary.opponentTotal : summary.fieldTotal - summary.ownTotal);
    $("cwDcCount").textContent = String(summary.dcCount);
    const scopeBtn = $("cwScopeLabel");
    if(scopeBtn){
      const clanName = state.activeClan?.name || "";
      scopeBtn.textContent = clanName || "No clan joined";
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
        raceList.innerHTML = races.length ? renderRaceStrip(races, { canEdit: currentEditable }) : '<div class="emptyState">Start a match by saving the first race.</div>';
      }
    }
    const saved = mergeMatchList(state.matches.filter((match) => match.status === "completed"));
    const matchList = $("cwSavedMatchList");
    if(matchList){
      matchList.innerHTML = saved.length ? saved.slice(0, 8).map(matchRowHtml).join("") : '<div class="emptyState">No saved Clan Wars matches yet.</div>';
    }
    $("btnSaveRace").disabled = !state.entryStarted || !currentEditable || summary.raceCount >= MAX_RACES;
    $("btnUndoRace").disabled = !currentEditable;
    $("btnClearPlacements").disabled = !currentEditable;
    $("cwDcToggle").disabled = !currentEditable;
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
      setClanLetterFilter(button.getAttribute("data-cw-clan-letter") || "all");
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
    $("cwSavedMatchList")?.addEventListener("click", (event) => {
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
