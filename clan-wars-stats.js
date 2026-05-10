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
    "6v6v6v6": [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1],
  };
  const EVENT_LABELS = { "6v6": "6v6", "6v6v6v6": "6v18" };
  const STORAGE_CURRENT = "mkwt_clan_wars_current_v1";
  const STORAGE_MATCHES = "mkwt_clan_wars_matches_v1";
  const STORAGE_ACTIVE_CLAN = "mkwt_clan_wars_active_clan_v1";
  const ACTIVE_CLAN_PERSONAL_SCOPE = "personal";
  const CLAN_RESTORE_TIMEOUT_MS = 4000;
  const TEAM_SIZE = 6;
  const MIN_TRACK_PLAYS_FOR_HIGHLIGHT = 10;
  const QUERY_BATCH_SIZE = 100;
  const CLAN_ICON_BUCKET = "clan-icons";
  const CLAN_MEMBER_SELECT = "user_id, role, status, display_name";
  const CLAN_WARS_RACE_SELECT = "id, match_id, race_number, event_type, race_kind, track, intermission_start, intermission_end, placements, max_placement, own_points, opponent_points, field_points, dc, rule_warning, created_at, updated_at";
  const CHART_MODES = ["tracks", "im_destiny", "im_special_destiny", "im_routes", "placement"];
  const INTERMISSION_CHART_MODES = new Set(["im_destiny", "im_special_destiny", "im_routes"]);
  const $ = (id) => document.getElementById(id);

  const state = {
    mode: "guest",
    session: null,
    client: null,
    eventType: "6v6",
    chartMode: "tracks",
    trackSortKey: "avg",
    trackSortDir: "desc",
    selectedDivisionKeys: new Set(),
    divisionSelectionReady: false,
    matches: [],
    activeClan: null,
    intermissionMeta: {},
    performanceChart: null,
    placementChart: null,
    lastPerformanceStats: [],
    lastSelectedPerformance: "",
  };

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function cleanText(value){
    return String(value || "").trim();
  }

  function showToast(message, ok = true){
    if(window.MKWT?.showToast) window.MKWT.showToast(message, ok);
    else console[ok ? "log" : "warn"](message);
  }

  function resolveClanIconUrl(iconPath, version){
    const path = cleanText(iconPath);
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
    return cleanText(name || "?").charAt(0).toUpperCase() || "?";
  }

  function clanIconHtml(clan, className = "", options = {}){
    const iconUrl = clan?.iconUrl || "";
    const showEmpty = options.showEmpty !== false;
    if(!iconUrl && !showEmpty) return "";
    const classes = ["clanIconFrame", className, iconUrl ? "has-image" : "is-empty"].filter(Boolean).join(" ");
    const body = iconUrl
      ? `<img src="${escapeHtml(iconUrl)}" alt="">`
      : `<span class="clanIconFrame__placeholder">${escapeHtml(clanIconInitial(clan?.name))}</span>`;
    return `<span class="${classes}" aria-hidden="true">${body}</span>`;
  }

  function clanScopeButtonHtml(clan){
    if(!clan?.id) return "Personal Clan Wars";
    return `${clanIconHtml(clan, "clanIconFrame--scope", { showEmpty: false })}<span>${escapeHtml(clan.name)}</span>`;
  }

  window.setStatus = function(message, ok = true){
    showToast(message, ok);
  };

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
    }catch{
      return false;
    }
  }

  function normalizeEventType(value){
    return value === "6v6v6v6" ? "6v6v6v6" : "6v6";
  }

  function eventLabel(eventType = state.eventType){
    return EVENT_LABELS[normalizeEventType(eventType)] || "6v6";
  }

  function scoreMap(eventType = state.eventType){
    return SCORE_MAP[normalizeEventType(eventType)] || SCORE_MAP["6v6"];
  }

  function fieldTotal(eventType = state.eventType){
    return scoreMap(eventType).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function teamCount(eventType = state.eventType){
    return normalizeEventType(eventType) === "6v6v6v6" ? 4 : 2;
  }

  function expectedTeamAverage(eventType = state.eventType){
    return fieldTotal(eventType) / teamCount(eventType);
  }

  function maxPlacement(eventType = state.eventType){
    return scoreMap(eventType).length;
  }

  function scoreForPlacements(placements, eventType = state.eventType){
    const map = scoreMap(eventType);
    return (placements || []).reduce((sum, place) => sum + Number(map[Number(place) - 1] || 0), 0);
  }

  function activeClanStorageKey(){
    const userId = state.session?.user?.id || "guest";
    return `${STORAGE_ACTIVE_CLAN}_${userId}`;
  }

  function persistActiveClan(){
    if(state.mode !== "account") return;
    if(state.activeClan) safeWriteJson(activeClanStorageKey(), state.activeClan);
    else localStorage.removeItem(activeClanStorageKey());
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

  function normalizeDivisionTag(value){
    return cleanText(value);
  }

  function divisionKey(value){
    return normalizeDivisionTag(value).toLowerCase() || "__clan__";
  }

  function divisionLabel(value){
    return normalizeDivisionTag(value) || "Clan";
  }

  function normalizeClan(raw){
    if(!raw || typeof raw !== "object") return null;
    const id = cleanText(raw.id || raw.clan_id);
    const name = cleanText(raw.name || raw.clan_name);
    if(!id || !name) return null;
    const rawDivisions = raw.divisions || raw.clan_divisions || [];
    const divisions = Array.isArray(rawDivisions)
      ? rawDivisions.map((item) => normalizeDivisionTag(typeof item === "string" ? item : item?.name)).filter(Boolean)
      : [];
    return {
      id,
      name,
      slug: cleanText(raw.slug || raw.clan_slug),
      role: cleanText(raw.role || raw.membership_role),
      createdByUserId: cleanText(raw.created_by_user_id || raw.createdByUserId),
      iconPath: cleanText(raw.icon_path || raw.iconPath),
      iconVersion: Number(raw.icon_version || raw.iconVersion || 0) || 0,
      iconUpdatedAt: cleanText(raw.icon_updated_at || raw.iconUpdatedAt),
      iconUrl: resolveClanIconUrl(raw.icon_path || raw.iconPath, raw.icon_version || raw.iconVersion),
      divisions: Array.from(new Set(divisions)),
    };
  }

  function clanDivisionSlots(){
    if(!state.activeClan) return [];
    const divisions = Array.from(new Set((state.activeClan.divisions || []).map(normalizeDivisionTag).filter(Boolean)));
    if(divisions.length >= 2 && !divisions.some((division) => division.toLowerCase() === "mixed")){
      divisions.push("Mixed");
    }
    return divisions;
  }

  function normalizeRace(raw){
    if(!raw || typeof raw !== "object") return null;
    const eventType = normalizeEventType(raw.eventType || raw.event_type);
    const placements = Array.isArray(raw.placements)
      ? raw.placements.map(Number).filter(Number.isFinite)
      : [];
    if(placements.length !== TEAM_SIZE) return null;
    const route = parseRoute(raw.track);
    const raceKind = cleanText(raw.raceKind || raw.race_kind || (route ? "intermission" : "track"));
    const track = cleanText(raw.track);
    if(!track) return null;
    return {
      id: raw.id || "",
      matchId: raw.matchId || raw.match_id || "",
      raceNumber: Number(raw.raceNumber || raw.race_number || 1),
      eventType,
      raceKind: raceKind === "intermission" ? "intermission" : "track",
      track,
      intermissionStart: cleanText(raw.intermissionStart || raw.intermission_start || route?.start || ""),
      intermissionEnd: cleanText(raw.intermissionEnd || raw.intermission_end || route?.end || ""),
      placements,
      maxPlacement: Number(raw.maxPlacement || raw.max_placement || maxPlacement(eventType)),
      ownPoints: Number(raw.ownPoints ?? raw.own_points ?? scoreForPlacements(placements, eventType)),
      opponentPoints: raw.opponentPoints ?? raw.opponent_points ?? null,
      fieldPoints: Number(raw.fieldPoints || raw.field_points || fieldTotal(eventType)),
      dc: raw.dc === true || raw.disconnect === true,
      ruleWarning: cleanText(raw.ruleWarning || raw.rule_warning || ""),
      createdAt: raw.createdAt || raw.created_at || null,
    };
  }

  function summarizeMatch(match){
    const races = Array.isArray(match?.races) ? match.races : [];
    const eventType = normalizeEventType(match?.eventType || match?.event_type);
    const ownTotal = races.reduce((sum, race) => sum + Number(race.ownPoints || 0), 0);
    const field = races.reduce((sum, race) => sum + Number(race.fieldPoints || fieldTotal(eventType)), 0);
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
      id: raw.id || "",
      eventType,
      status: cleanText(raw.status) || (races.length >= 12 ? "completed" : "active"),
      clanId: raw.clanId || raw.clan_id || null,
      ownerUserId: raw.ownerUserId || raw.owner_user_id || null,
      createdByUserId: raw.createdByUserId || raw.created_by_user_id || null,
      createdAt: raw.createdAt || raw.created_at || null,
      completedAt: raw.completedAt || raw.completed_at || null,
      updatedAt: raw.updatedAt || raw.updated_at || null,
      divisionTag: normalizeDivisionTag(raw.divisionTag || raw.division_tag || ""),
      races,
      ...summary,
    };
  }

  function mergeMatchList(matches){
    const seen = new Set();
    return (matches || []).filter(Boolean).filter((match) => {
      const id = String(match.id || `${match.createdAt}-${match.eventType}-${match.divisionTag}`);
      if(seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a, b) => String(b.completedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.updatedAt || a.createdAt || "")));
  }

  function loadLocal(){
    const current = normalizeMatch(safeReadJson(STORAGE_CURRENT, null));
    const saved = (safeReadJson(STORAGE_MATCHES, []) || []).map(normalizeMatch).filter(Boolean);
    state.matches = mergeMatchList([current, ...saved]);
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
    const userId = state.session?.user?.id || "";
    if(state.mode !== "account" || !state.client || !userId) return null;
    const { data, error } = await state.client
      .from("clan_memberships")
      .select("clan_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if(error) throw error;

    const clanIds = Array.from(new Set((data || [])
      .map((membership) => cleanText(membership.clan_id))
      .filter(Boolean)));
    for(const clanId of clanIds){
      const clan = await loadClanDetails(clanId);
      if(clan) return clan;
    }
    return null;
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

    const ids = Array.from(new Set((memberships || []).map((member) => cleanText(member.user_id)).filter(Boolean)));
    const profileById = new Map();
    if(ids.length){
      let { data: profiles, error: profileError } = await state.client
        .from("profiles")
        .select("id, user_id, nickname")
        .in("id", ids);
      if(profileError && String(profileError.message || "").includes("column profiles.id")){
        ({ data: profiles, error: profileError } = await state.client
          .from("profiles")
          .select("user_id, nickname")
          .in("user_id", ids));
      }
      if(profileError){
        console.warn("[clan-wars-stats] member profile lookup skipped", profileError.message || profileError);
      }
      (profiles || []).forEach((profile) => {
        const id = cleanText(profile.id || profile.user_id);
        if(id) profileById.set(id, cleanText(profile.nickname));
      });
    }
    const currentId = cleanText(state.session?.user?.id);
    const currentName = cleanText(window.PROFILE?.nickname);
    return (memberships || []).map((member) => {
      const id = cleanText(member.user_id);
      const membershipName = cleanText(member.display_name);
      const name = membershipName || profileById.get(id) || (id === currentId && currentName) || "Member";
      return {
        id,
        name,
        role: cleanText(member.role || "member").toUpperCase(),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "en"));
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
    const dialog = $("cwStatsMembersDialog");
    const body = $("cwStatsMembersBody");
    if(!dialog || !body) return;
    body.innerHTML = '<div class="emptyState">Loading members...</div>';
    try{ dialog.showModal(); }catch{ dialog.setAttribute("open", ""); }
    try{
      const members = await loadClanMembers();
      body.innerHTML = members.length
        ? members.map(memberRowHtml).join("")
        : '<div class="emptyState">No members found.</div>';
    }catch(e){
      console.warn("[clan-wars-stats] could not load clan members", e);
      body.innerHTML = '<div class="emptyState">Could not load members.</div>';
    }
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
        console.warn("[clan-wars-stats] could not restore saved active clan", e);
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
      console.warn("[clan-wars-stats] could not restore clan membership", e);
      state.activeClan = null;
    }
  }

  function dbRaceToLocal(row){
    return normalizeRace({
      id: row.id,
      match_id: row.match_id,
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

  function dbMatchToLocal(row, races){
    return normalizeMatch({
      id: row.id,
      owner_user_id: row.owner_user_id,
      clan_id: row.clan_id,
      event_type: row.event_type,
      status: row.status,
      own_total: row.own_total,
      opponent_total: row.opponent_total,
      field_total: row.field_total,
      race_count: row.race_count,
      dc_count: row.dc_count,
      division_tag: row.division_tag,
      created_by_user_id: row.created_by_user_id,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      races,
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

  async function loadCloud(){
    const userId = state.session?.user?.id;
    if(!state.client || !userId) return;
    let query = state.client
      .from("clan_wars_matches")
      .select("id, owner_user_id, clan_id, event_type, status, own_total, opponent_total, field_total, race_count, dc_count, division_tag, created_by_user_id, completed_at, created_at, updated_at")
      .order("created_at", { ascending: false });

    if(state.activeClan?.id){
      query = query.eq("clan_id", state.activeClan.id);
    }else{
      query = query.is("clan_id", null).eq("owner_user_id", userId);
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
      const list = byMatch.get(row.match_id) || [];
      list.push(dbRaceToLocal(row));
      byMatch.set(row.match_id, list);
    });

    state.matches = mergeMatchList((matchRows || []).map((row) => dbMatchToLocal(row, byMatch.get(row.id) || [])));
  }

  async function loadIntermissionMeta(){
    try{
      const res = await fetch("strats.json", { cache: "no-cache" });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      state.intermissionMeta = json?.META?.INTERMISSIONS || {};
    }catch(e){
      console.warn("[clan-wars-stats] intermission meta failed to load", e);
      state.intermissionMeta = {};
    }
  }

  function parseRoute(value){
    const match = String(value || "").match(/^\s*(.*?)\s*(?:->|\u2192|>)\s*(.*?)\s*$/);
    if(!match) return null;
    const start = cleanText(match[1]);
    const end = cleanText(match[2]);
    return start && end ? { start, end } : null;
  }

  function routeLabel(start, end){
    return `${start} -> ${end}`;
  }

  function routeParts(race){
    const start = cleanText(race?.intermissionStart || race?.intermission_start || "");
    const end = cleanText(race?.intermissionEnd || race?.intermission_end || "");
    if(start && end) return { start, end };
    return parseRoute(race?.track) || { start: "", end: "" };
  }

  function routeKeyCandidates(start, end){
    const s = cleanText(start);
    const e = cleanText(end);
    if(!s || !e) return [];
    return [
      `${s}->${e}`,
      `${s} -> ${e}`,
      `${s}\u2192${e}`,
      `${s} \u2192 ${e}`,
      `${s}>${e}`,
      `${s} > ${e}`,
    ];
  }

  function routeMeta(start, end){
    const meta = state.intermissionMeta || {};
    for(const key of routeKeyCandidates(start, end)){
      if(Object.prototype.hasOwnProperty.call(meta, key)) return meta[key];
    }
    return null;
  }

  function cleanMetaLabel(value){
    const text = cleanText(value);
    return text && text !== "-" ? text : "";
  }

  function destinyGroup(start, end){
    const meta = routeMeta(start, end);
    const group = cleanMetaLabel(meta?.destiny_group);
    return group || cleanText(end);
  }

  function specialDestinyGroup(start, end){
    const meta = routeMeta(start, end);
    if(!meta?.is_special) return "";
    const plainEnd = cleanText(end).toLowerCase();
    const group = cleanMetaLabel(meta.destiny_group);
    const tag = cleanMetaLabel(meta.special_tag);
    if(group && group.toLowerCase() !== plainEnd) return group;
    if(tag && tag.toLowerCase() !== plainEnd) return tag;
    return start && end ? routeLabel(start, end) : group || tag;
  }

  function isIntermissionRace(race){
    if(!race) return false;
    if(race.raceKind === "intermission") return true;
    if(race.intermissionStart && race.intermissionEnd) return true;
    return !!parseRoute(race.track);
  }

  function chartAllowsIntermission(eventType = state.eventType){
    return normalizeEventType(eventType) === "6v6v6v6";
  }

  function availableChartModes(){
    return CHART_MODES.filter((mode) => chartAllowsIntermission() || !INTERMISSION_CHART_MODES.has(mode));
  }

  function activeChartMode(){
    const modes = availableChartModes();
    if(!modes.includes(state.chartMode)) state.chartMode = "tracks";
    return state.chartMode;
  }

  function chartModeTitle(mode = activeChartMode()){
    if(mode === "placement") return "Placement Distribution";
    if(mode === "im_destiny") return "Destiny Performance";
    if(mode === "im_special_destiny") return "Special Destiny Performance";
    if(mode === "im_routes") return "Separated Performance";
    return "Track Performance";
  }

  function performanceLabel(race, mode){
    if(mode === "im_destiny"){
      const { start, end } = routeParts(race);
      return start && end ? destinyGroup(start, end) : "";
    }
    if(mode === "im_special_destiny"){
      const { start, end } = routeParts(race);
      return start && end ? specialDestinyGroup(start, end) : "";
    }
    if(mode === "im_routes"){
      const { start, end } = routeParts(race);
      return start && end ? routeLabel(start, end) : "";
    }
    return cleanText(race?.track || "");
  }

  function shouldIncludeRace(race, mode){
    if(!race || race.dc) return false;
    const isIntermission = isIntermissionRace(race);
    if(mode === "tracks") return !isIntermission && race.track !== "Intermission";
    if(INTERMISSION_CHART_MODES.has(mode)) return isIntermission;
    return true;
  }

  function divisionOptions(){
    const options = new Map();
    if(state.activeClan){
      clanDivisionSlots().forEach((tag) => options.set(divisionKey(tag), { key: divisionKey(tag), label: divisionLabel(tag) }));
    }
    state.matches.forEach((match) => {
      const tag = normalizeDivisionTag(match.divisionTag);
      if(!tag && !state.activeClan) return;
      const key = divisionKey(tag);
      if(!options.has(key)) options.set(key, { key, label: divisionLabel(tag) });
    });
    return Array.from(options.values()).sort((a, b) => {
      if(a.key === "__clan__") return 1;
      if(b.key === "__clan__") return -1;
      return a.label.localeCompare(b.label, "en");
    });
  }

  function syncDivisionSelection(){
    const options = divisionOptions();
    const keys = options.map((option) => option.key);
    if(!options.length){
      state.selectedDivisionKeys.clear();
      state.divisionSelectionReady = true;
      return;
    }
    if(!state.divisionSelectionReady){
      state.selectedDivisionKeys = new Set(keys);
      state.divisionSelectionReady = true;
      return;
    }
    state.selectedDivisionKeys = new Set([...state.selectedDivisionKeys].filter((key) => keys.includes(key)));
    if(!state.selectedDivisionKeys.size) state.selectedDivisionKeys = new Set(keys);
  }

  function matchDivisionKey(match){
    return divisionKey(match?.divisionTag || "");
  }

  function divisionFilterAllows(match){
    const options = divisionOptions();
    if(!options.length) return true;
    if(!state.selectedDivisionKeys.size) return false;
    return state.selectedDivisionKeys.has(matchDivisionKey(match));
  }

  function scopedMatches(){
    return state.matches
      .filter((match) => match.eventType === state.eventType)
      .filter(divisionFilterAllows);
  }

  function scopedRaces(){
    return scopedMatches().flatMap((match) => match.races || []);
  }

  function statRaces(){
    return scopedRaces().filter((race) => !race.dc);
  }

  function aggregatePerformanceStats(mode = activeChartMode()){
    const bucket = new Map((mode === "tracks" ? COURSE_TRACKS : []).map((track) => [track, []]));
    for(const race of statRaces()){
      if(!shouldIncludeRace(race, mode)) continue;
      const label = performanceLabel(race, mode);
      if(!label) continue;
      if(!bucket.has(label)) bucket.set(label, []);
      bucket.get(label).push(Number(race.ownPoints || 0));
    }
    return Array.from(bucket.entries()).map(([track, values]) => {
      const count = values.length;
      const sum = values.reduce((total, value) => total + Number(value || 0), 0);
      return { track, count, sum, avg: count ? sum / count : 0 };
    });
  }

  function sortPerformanceStats(stats){
    const rows = stats.slice();
    const mul = state.trackSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if(state.trackSortKey === "count"){
        const countDiff = a.count - b.count;
        if(countDiff !== 0) return mul * countDiff;
        const avgDiff = a.avg - b.avg;
        if(avgDiff !== 0) return mul * avgDiff;
        return a.track.localeCompare(b.track, "en");
      }
      const avgDiff = a.avg - b.avg;
      if(avgDiff !== 0) return mul * avgDiff;
      const countDiff = a.count - b.count;
      if(countDiff !== 0) return mul * countDiff;
      return a.track.localeCompare(b.track, "en");
    });
    return rows;
  }

  function aggregatePlacementStats(){
    const max = maxPlacement(state.eventType);
    const rows = Array.from({ length: max }, (_, index) => ({ placement: index + 1, count: 0 }));
    for(const race of statRaces()){
      for(const placement of (race.placements || [])){
        const place = Number(placement);
        if(Number.isInteger(place) && place >= 1 && place <= max) rows[place - 1].count += 1;
      }
    }
    return rows;
  }

  function cssVar(name, fallback = ""){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function colorWithAlpha(color, alpha){
    const value = String(color || "").trim();
    const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
    if(rgb){
      const parts = rgb[1].split(",").slice(0, 3).map((part) => part.trim());
      return `rgba(${parts.join(",")},${alpha})`;
    }
    const hex = value.match(/^#([a-f0-9]{6})$/i);
    if(hex){
      const int = Number.parseInt(hex[1], 16);
      return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
    }
    return value || `rgba(78,124,255,${alpha})`;
  }

  function setChartEmpty(canvasId, message = ""){
    const canvas = $(canvasId);
    if(!canvas) return;
    const wrap = canvas.closest(".mkcChartWrap, .mkcChartWrapCompare");
    if(!wrap) return;
    Array.from(wrap.children).forEach((child) => {
      if(child.classList?.contains("mkcChartEmpty")) child.remove();
    });
    let next = wrap.nextElementSibling;
    while(next?.classList?.contains("mkcChartEmpty") && next.dataset.forChart === canvasId){
      const remove = next;
      next = next.nextElementSibling;
      remove.remove();
    }
    const text = cleanText(message);
    wrap.classList.toggle("isEmpty", !!text);
    canvas.hidden = !!text;
    if(!text) return;
    const empty = document.createElement("div");
    empty.className = "mkcChartEmpty";
    empty.dataset.forChart = canvasId;
    empty.setAttribute("role", "status");
    empty.textContent = text;
    wrap.insertAdjacentElement("afterend", empty);
  }

  function setChartHeight(canvasId, itemCount, mode = "performance"){
    const canvas = $(canvasId);
    const wrap = canvas?.closest(".mkcChartWrap, .mkcChartWrapCompare");
    if(!wrap) return;
    const mobile = window.matchMedia?.("(max-width: 640px)")?.matches;
    if(mode === "performance"){
      const base = mobile ? 360 : 320;
      const rowHeight = mobile ? 30 : 24;
      const max = mobile ? 920 : 760;
      wrap.style.height = `${Math.min(max, Math.max(base, itemCount * rowHeight + 96))}px`;
      return;
    }
    wrap.style.height = mobile ? "360px" : "";
  }

  function resetChartHeight(canvasId){
    const canvas = $(canvasId);
    const wrap = canvas?.closest(".mkcChartWrap, .mkcChartWrapCompare");
    if(wrap) wrap.style.height = "";
  }

  function renderEmptyNotice(id, message = ""){
    const el = $(id);
    if(!el) return;
    const text = cleanText(message);
    if(!text){
      el.hidden = true;
      el.innerHTML = "";
      el.classList.remove("mkcTrackerInsight--empty");
      return;
    }
    el.hidden = false;
    el.classList.add("mkcTrackerInsight--empty");
    el.innerHTML = `<div class="muted">${escapeHtml(text)}</div>`;
  }

  function destroyCharts(){
    state.performanceChart?.destroy();
    state.placementChart?.destroy();
    state.performanceChart = null;
    state.placementChart = null;
  }

  function renderChartLibraryMissing(){
    destroyCharts();
    resetChartHeight("chartCwStatsPerformance");
    resetChartHeight("chartCwStatsPlacement");
    setChartEmpty("chartCwStatsPerformance", "Charts could not load. Check your connection and reload.");
    setChartEmpty("chartCwStatsPlacement", "Charts could not load. Check your connection and reload.");
    renderEmptyNotice("cwStatsPerformanceInsight", "Charts could not load.");
    renderEmptyNotice("cwStatsPlacementInsight", "Charts could not load.");
  }

  function renderPerformanceInsight(trackName){
    state.lastSelectedPerformance = trackName || "";
    const el = $("cwStatsPerformanceInsight");
    if(!el) return;
    el.classList.remove("mkcTrackerInsight--empty");
    const stat = state.lastPerformanceStats.find((entry) => entry.track === trackName);
    if(!stat){
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <div class="mkcTrackerInsightTitle">${escapeHtml(stat.track)}</div>
      <div class="mkcTrackerInsightMeta">${escapeHtml(chartModeTitle())} in ${escapeHtml(eventLabel())}</div>
      <div class="mkcTrackerInsightGrid">
        <div class="mkcTrackerInsightStat">
          <span class="mkcTrackerInsightLabel">AVG points</span>
          <span class="mkcTrackerInsightValue">${stat.count ? stat.avg.toFixed(2) : "-"}</span>
        </div>
        <div class="mkcTrackerInsightStat">
          <span class="mkcTrackerInsightLabel">Races</span>
          <span class="mkcTrackerInsightValue">${stat.count}</span>
        </div>
      </div>
    `;
  }

  function renderPerformanceChart(stats){
    const canvas = $("chartCwStatsPerformance");
    if(!canvas || typeof Chart === "undefined") return;
    const sorted = sortPerformanceStats(stats).slice(0, 30);
    state.lastPerformanceStats = sorted;
    if(!sorted.length || !sorted.some((row) => row.count > 0)){
      state.performanceChart?.destroy();
      state.performanceChart = null;
      state.lastPerformanceStats = [];
      resetChartHeight("chartCwStatsPerformance");
      setChartEmpty("chartCwStatsPerformance", "");
      renderEmptyNotice("cwStatsPerformanceInsight", "No data for this chart yet.");
      return;
    }
    setChartHeight("chartCwStatsPerformance", sorted.length, "performance");
    setChartEmpty("chartCwStatsPerformance", "");
    renderEmptyNotice("cwStatsPerformanceInsight", "");

    const positiveStroke = cssVar("--chart-positive-stroke", "#4da319");
    const negativeStroke = cssVar("--chart-negative-stroke", "#ff5050");
    const neutralStroke = cssVar("--chart-split-a-stroke", "#4e7cff");
    const threshold = expectedTeamAverage();
    const labels = sorted.map((row) => row.track);
    const values = sorted.map((row) => Number(row.avg.toFixed(2)));
    const fills = sorted.map((row) => {
      if(row.count === 0 || row.avg === threshold) return colorWithAlpha(neutralStroke, .46);
      return row.avg > threshold ? colorWithAlpha(positiveStroke, .78) : colorWithAlpha(negativeStroke, .76);
    });
    const borders = sorted.map((row) => {
      if(row.count === 0 || row.avg === threshold) return neutralStroke;
      return row.avg > threshold ? positiveStroke : negativeStroke;
    });
    const maxValue = Math.max(threshold, ...values, 1);

    state.performanceChart?.destroy();
    state.performanceChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: `Average points (${eventLabel()})`,
          data: values,
          backgroundColor: fills,
          borderColor: borders,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: Math.ceil(maxValue * 1.16),
            ticks: { color: cssVar("--text", "#fff") },
            grid: { color: cssVar("--border", "rgba(255,255,255,.18)") },
          },
          y: {
            ticks: { color: cssVar("--text", "#fff"), autoSkip: false },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const row = sorted[ctx.dataIndex];
                return [
                  `AVG points: ${Number(row?.avg || 0).toFixed(2)}`,
                  `Played: ${Number(row?.count || 0)}`,
                  `Break-even: >${threshold.toFixed(2)}`,
                ];
              },
            },
          },
        },
        onClick: (_, elements) => {
          if(!elements?.length) return;
          renderPerformanceInsight(labels[elements[0].index]);
        },
      },
    });
    if(state.lastSelectedPerformance && sorted.some((row) => row.track === state.lastSelectedPerformance)){
      renderPerformanceInsight(state.lastSelectedPerformance);
    }else{
      renderPerformanceInsight(null);
    }
  }

  function placementFill(placement){
    const place = Number(placement);
    if(place === 1) return "rgba(255,205,70,.74)";
    if(place === 2) return "rgba(210,220,232,.68)";
    if(place === 3) return "rgba(205,128,70,.70)";
    return colorWithAlpha(cssVar("--chart-split-a-stroke", "#4e7cff"), .58);
  }

  function placementBorder(placement){
    const place = Number(placement);
    if(place === 1) return "rgba(255,205,70,1)";
    if(place === 2) return "rgba(230,238,248,.95)";
    if(place === 3) return "rgba(222,145,82,.95)";
    return cssVar("--chart-split-a-stroke", "#4e7cff");
  }

  function renderPlacementChart(stats){
    const canvas = $("chartCwStatsPlacement");
    if(!canvas || typeof Chart === "undefined") return;
    if(!stats.some((row) => Number(row.count || 0) > 0)){
      state.placementChart?.destroy();
      state.placementChart = null;
      resetChartHeight("chartCwStatsPlacement");
      setChartEmpty("chartCwStatsPlacement", "");
      renderEmptyNotice("cwStatsPlacementInsight", "No placement data for this chart yet.");
      return;
    }
    setChartHeight("chartCwStatsPlacement", stats.length, "placement");
    setChartEmpty("chartCwStatsPlacement", "");
    renderEmptyNotice("cwStatsPlacementInsight", "");
    const labels = stats.map((row) => String(row.placement));
    const values = stats.map((row) => Number(row.count || 0));
    const total = values.reduce((sum, value) => sum + value, 0);

    state.placementChart?.destroy();
    state.placementChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Placements",
          data: values,
          backgroundColor: stats.map((row) => placementFill(row.placement)),
          borderColor: stats.map((row) => placementBorder(row.placement)),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: "Placement", color: cssVar("--muted", "#aab2c5") },
            ticks: { color: cssVar("--text", "#fff") },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: cssVar("--text", "#fff"), precision: 0 },
            grid: { color: cssVar("--border", "rgba(255,255,255,.18)") },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const count = Number(ctx.parsed.y || 0);
                const chance = total ? ((count / total) * 100).toFixed(1) : "0.0";
                return [`${count} placements`, `Share: ${chance}% (${count} / ${total})`];
              },
            },
          },
        },
      },
    });
  }

  function updateDeckUi(){
    const mode = activeChartMode();
    const isPlacement = mode === "placement";
    const available = availableChartModes();
    const track = $("cwStatsDeckTrack");
    if(track) track.style.transform = isPlacement ? "translateX(-50%)" : "translateX(0%)";
    document.querySelectorAll("[data-cw-stats-chart-mode]").forEach((button) => {
      const buttonMode = button.getAttribute("data-cw-stats-chart-mode");
      const disabled = !available.includes(buttonMode);
      const active = !disabled && buttonMode === mode;
      button.hidden = disabled;
      button.disabled = disabled;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
    const title = $("cwStatsDeckTitle");
    if(title) title.textContent = chartModeTitle(mode);
    const sortRoot = $("cwStatsSortFilterRoot");
    if(sortRoot) sortRoot.hidden = isPlacement;
    requestAnimationFrame(() => {
      try{ state.performanceChart?.resize?.(); }catch{}
      try{ state.placementChart?.resize?.(); }catch{}
    });
  }

  function stepChartMode(step){
    const modes = availableChartModes();
    const current = activeChartMode();
    const index = Math.max(0, modes.indexOf(current));
    const nextIndex = index + step;
    if(nextIndex < 0 || nextIndex >= modes.length) return;
    setChartMode(modes[nextIndex]);
  }

  function setChartMode(mode){
    if(!CHART_MODES.includes(mode)) mode = "tracks";
    if(!availableChartModes().includes(mode)) mode = "tracks";
    state.chartMode = mode;
    state.lastSelectedPerformance = "";
    closeMenus();
    render();
  }

  function bindSwipeNavigation(viewport, handlers){
    if(!viewport) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    viewport.addEventListener("pointerdown", (event) => {
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    }, { passive: true });
    viewport.addEventListener("pointerup", (event) => {
      if(!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if(Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      if(dx < 0) handlers?.onLeft?.();
      else handlers?.onRight?.();
    }, { passive: true });
    viewport.addEventListener("pointercancel", () => { tracking = false; }, { passive: true });
  }

  function closeMenus(){
    if(window.MKWT_UI?.closeFilterMenus){
      window.MKWT_UI.closeFilterMenus("cwStats");
      return;
    }
    [
      ["btnCwStatsSortFilter", "menuCwStatsSortFilter"],
      ["btnCwStatsDivisionFilter", "menuCwStatsDivisionFilter"],
    ].forEach(([buttonId, menuId]) => {
      const button = $(buttonId);
      const menu = $(menuId);
      if(button) button.setAttribute("aria-expanded", "false");
      if(menu) menu.hidden = true;
    });
  }

  function toggleMenu(buttonId, menuId){
    if(window.MKWT_UI?.toggleFilterMenu){
      window.MKWT_UI.toggleFilterMenu(buttonId, menuId, { type: "cwStats" });
      return;
    }
    const button = $(buttonId);
    const menu = $(menuId);
    if(!button || !menu) return;
    const nextOpen = menu.hidden;
    closeMenus();
    menu.hidden = !nextOpen;
    button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  }

  function renderDivisionFilter(){
    const options = divisionOptions();
    const root = $("cwStatsDivisionFilterRoot");
    const menu = $("menuCwStatsDivisionFilter");
    const value = $("cwStatsDivisionFilterValue");
    if(!root || !menu || !value) return;
    root.hidden = options.length <= 1;
    if(options.length <= 1){
      menu.innerHTML = "";
      value.textContent = "All divisions";
      return;
    }
    const selectedCount = options.filter((option) => state.selectedDivisionKeys.has(option.key)).length;
    value.textContent = selectedCount === options.length
      ? "All divisions"
      : selectedCount === 1
        ? options.find((option) => state.selectedDivisionKeys.has(option.key))?.label || "1 division"
        : `${selectedCount} divisions`;
    menu.innerHTML = [
      `<button class="mkcTrackerFilterItem${selectedCount === options.length ? " active" : ""}" data-cw-stats-division-all="1" type="button"><span>All divisions</span><span class="mkcTrackerFilterMeta">${options.length}</span></button>`,
      ...options.map((option) => `
        <button class="mkcTrackerFilterItem${state.selectedDivisionKeys.has(option.key) ? " active" : ""}" data-cw-stats-division="${escapeHtml(option.key)}" type="button">
          <span>${escapeHtml(option.label)}</span>
          <span class="mkcTrackerFilterMeta">${state.selectedDivisionKeys.has(option.key) ? "On" : "Off"}</span>
        </button>
      `),
    ].join("");
    menu.querySelector("[data-cw-stats-division-all]")?.addEventListener("click", () => {
      state.selectedDivisionKeys = new Set(options.map((option) => option.key));
      render();
    });
    menu.querySelectorAll("[data-cw-stats-division]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-cw-stats-division") || "";
        if(state.selectedDivisionKeys.has(key)) state.selectedDivisionKeys.delete(key);
        else state.selectedDivisionKeys.add(key);
        render();
      });
    });
  }

  function updateSortFilterUi(){
    const label = state.trackSortKey === "count" ? "Most played" : "Performance";
    const arrow = state.trackSortDir === "desc" ? "v" : "^";
    const value = $("cwStatsSortFilterValue");
    if(value) value.textContent = `${label} ${arrow}`;
    document.querySelectorAll("[data-cw-stats-sort]").forEach((button) => {
      const key = button.getAttribute("data-cw-stats-sort");
      const active = key === state.trackSortKey;
      button.classList.toggle("active", active);
      const meta = button.querySelector(".mkcTrackerFilterMeta");
      if(meta) meta.textContent = active ? arrow : "";
    });
  }

  function renderEventButtons(){
    document.querySelectorAll("[data-cw-stats-event]").forEach((button) => {
      const active = normalizeEventType(button.getAttribute("data-cw-stats-event")) === state.eventType;
      button.classList.toggle("active", active);
      button.classList.toggle("isActive", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderSummary(performanceStats){
    const matches = scopedMatches();
    const races = matches.flatMap((match) => match.races || []);
    const nonDc = races.filter((race) => !race.dc).length;
    const scopeName = $("cwStatsScopeName");
    if(scopeName){
      const clanName = state.activeClan?.name || "";
      scopeName.innerHTML = clanName ? clanScopeButtonHtml(state.activeClan) : "Personal Clan Wars";
      scopeName.disabled = !clanName;
      scopeName.classList.toggle("is-active", !!clanName);
      scopeName.title = clanName ? `View ${clanName} members` : "";
      scopeName.setAttribute("aria-label", clanName ? `View ${clanName} members` : "Personal Clan Wars");
    }
    const matchCount = $("cwStatsMatches");
    const trackCount = $("cwStatsTrackCount");
    if(matchCount) matchCount.textContent = String(matches.length);
    if(trackCount) trackCount.textContent = String(nonDc);
    const qualifiedTracks = performanceStats.filter((row) => row.count >= MIN_TRACK_PLAYS_FOR_HIGHLIGHT);
    const best = qualifiedTracks.slice().sort((a, b) => {
      const avgDiff = Number(b.avg || 0) - Number(a.avg || 0);
      if(avgDiff !== 0) return avgDiff;
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if(countDiff !== 0) return countDiff;
      return String(a.track || "").localeCompare(String(b.track || ""), "en");
    })[0];
    const worst = qualifiedTracks.slice().sort((a, b) => {
      const avgDiff = Number(a.avg || 0) - Number(b.avg || 0);
      if(avgDiff !== 0) return avgDiff;
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if(countDiff !== 0) return countDiff;
      return String(a.track || "").localeCompare(String(b.track || ""), "en");
    })[0];
    const formatTrackMeta = (row) => `${row.count} plays · ${Number(row.avg || 0).toFixed(2)} avg`;
    const noQualifiedText = `No track has ${MIN_TRACK_PLAYS_FOR_HIGHLIGHT} plays yet.`;
    const bestTrack = $("cwStatsBest");
    if(bestTrack){
      bestTrack.textContent = best ? best.track : "Not enough data";
      bestTrack.closest(".clanWarsStatsTrackHighlight")?.classList.toggle("is-empty", !best);
    }
    const bestTrackMeta = $("cwStatsBestMeta");
    if(bestTrackMeta) bestTrackMeta.textContent = best ? formatTrackMeta(best) : noQualifiedText;
    const worstTrack = $("cwStatsWorst");
    if(worstTrack){
      worstTrack.textContent = worst ? worst.track : "Not enough data";
      worstTrack.closest(".clanWarsStatsTrackHighlight")?.classList.toggle("is-empty", !worst);
    }
    const worstTrackMeta = $("cwStatsWorstMeta");
    if(worstTrackMeta) worstTrackMeta.textContent = worst ? formatTrackMeta(worst) : noQualifiedText;
  }

  function render(){
    syncDivisionSelection();
    renderEventButtons();
    updateSortFilterUi();
    renderDivisionFilter();
    updateDeckUi();

    const mode = activeChartMode();
    const performanceMode = mode === "placement" ? "tracks" : mode;
    const performanceStats = aggregatePerformanceStats(performanceMode);
    const summaryStats = aggregatePerformanceStats("tracks");
    const placementStats = aggregatePlacementStats();
    renderSummary(summaryStats);

    if(!scopedMatches().length || !scopedRaces().length){
      destroyCharts();
      setChartEmpty("chartCwStatsPerformance", "");
      setChartEmpty("chartCwStatsPlacement", "");
      renderEmptyNotice("cwStatsPerformanceInsight", `No ${eventLabel()} Clan Wars data in this scope yet.`);
      renderEmptyNotice("cwStatsPlacementInsight", `No ${eventLabel()} placement data in this scope yet.`);
    }else if(typeof Chart === "undefined"){
      renderChartLibraryMissing();
    }else if(mode === "placement"){
      renderPlacementChart(placementStats);
      renderPerformanceChart(performanceStats);
    }else{
      renderPerformanceChart(performanceStats);
      renderPlacementChart(placementStats);
    }
  }

  function setEventType(eventType){
    state.eventType = normalizeEventType(eventType);
    if(!availableChartModes().includes(state.chartMode)) state.chartMode = "tracks";
    state.lastSelectedPerformance = "";
    closeMenus();
    render();
  }

  function bindEvents(){
    $("cwStatsScopeName")?.addEventListener("click", openClanMembersDialog);
    $("cwStatsMembersDialog")?.addEventListener("click", (event) => {
      if(event.target === $("cwStatsMembersDialog")) $("cwStatsMembersDialog")?.close();
    });
    document.querySelectorAll("[data-cw-stats-event]").forEach((button) => {
      button.addEventListener("click", () => setEventType(button.getAttribute("data-cw-stats-event")));
    });
    document.querySelectorAll("[data-cw-stats-chart-mode]").forEach((button) => {
      button.addEventListener("click", () => setChartMode(button.getAttribute("data-cw-stats-chart-mode")));
    });
    document.querySelectorAll("[data-cw-stats-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-cw-stats-sort") === "count" ? "count" : "avg";
        if(state.trackSortKey === next){
          state.trackSortDir = state.trackSortDir === "desc" ? "asc" : "desc";
        }else{
          state.trackSortKey = next;
          state.trackSortDir = "desc";
        }
        closeMenus();
        render();
      });
    });
    $("btnCwStatsSortFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu("btnCwStatsSortFilter", "menuCwStatsSortFilter");
    });
    $("btnCwStatsDivisionFilter")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu("btnCwStatsDivisionFilter", "menuCwStatsDivisionFilter");
    });
    ["menuCwStatsSortFilter", "menuCwStatsDivisionFilter"].forEach((id) => {
      $(id)?.addEventListener("click", (event) => event.stopPropagation());
    });
    document.addEventListener("click", (event) => {
      const sortRoot = $("cwStatsSortFilterRoot");
      const divisionRoot = $("cwStatsDivisionFilterRoot");
      if(sortRoot?.contains(event.target) || divisionRoot?.contains(event.target)) return;
      closeMenus();
    });
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape") closeMenus();
    });
    bindSwipeNavigation($("cwStatsDeckViewport"), {
      onLeft: () => stepChartMode(1),
      onRight: () => stepChartMode(-1),
    });
  }

  async function init(){
    bindEvents();
    render();
    try{
      await loadIntermissionMeta();
      if(typeof window.mkwtRequireAuth === "function"){
        await window.mkwtRequireAuth({
          pageName: "clan-wars-stats.html",
          allowGuest: true,
          tryBackupRestore: true,
          onAccount: async (session, client) => {
            state.mode = "account";
            state.session = session;
            state.client = client;
            await restoreActiveClan();
            await loadCloud();
          },
          onGuest: async () => {
            state.mode = "guest";
            state.activeClan = null;
            loadLocal();
          },
        });
      }else{
        state.mode = "guest";
        loadLocal();
      }
    }catch(e){
      console.error(e);
      showToast(e?.message || "Could not load Clan Wars stats.", false);
    }finally{
      state.divisionSelectionReady = false;
      render();
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
