# MKCentral MKWorld Formats Reference

Sources reviewed:

- https://mkcentral.com/de
- https://mkcentral.com/de/tournaments
- https://mkcentral.com/de/tournaments/series
- https://mkcentral.com/about
- https://mkcentral.com/api/tournaments/list?page=1&game=mkworld
- https://mkcentral.com/api/tournaments/series/list?game=mkworld
- Representative MKWorld tournament details:
  - https://mkcentral.com/api/tournaments/700
  - https://mkcentral.com/api/tournaments/698
  - https://mkcentral.com/api/tournaments/695
  - https://mkcentral.com/api/tournaments/691
  - https://mkcentral.com/api/tournaments/702

Reviewed for MKWT implementation notes: 2026-05-01.

This file is a paraphrased engineering reference for future MKWT tracking and
sync work around MKCentral MKWorld events only. MKCentral pages, tournament
descriptions, and event rules remain the authority. Re-check the source before
implementing rule-sensitive behavior, because MKWorld tournaments can still use
different structures even when they share the same game and mode.

## Scope

This reference is intentionally limited to MKCentral events where:

```text
game = mkworld
```

Observed MKWorld mode:

```text
mode = 150cc
```

Everything outside MKWorld is intentionally ignored for MKWT planning. The goal
is to keep future tracking work focused on the formats we actually want to
support.

## Why This Matters

MKCentral MKWorld events are not all the same thing. The same `mkworld` +
`150cc` base can represent:

- solo Free-for-All qualifiers,
- 2v2 events,
- 4v4 events,
- 6v6 team or squad events,
- national-team style events,
- league seasons,
- circuit qualifiers and finals,
- knockout-style events,
- Lounge-like 12p events,
- events with custom point systems.

For MKWT, this means a MKCentral import should never assume that every MKWorld
event is a normal Lounge 12-race mogi. A small event-profile layer is needed
before calculating scores, applying course rules, rendering sessions, or syncing
stats.

## Public MKCentral Endpoints

Observed MKWorld list endpoint:

```text
GET /api/tournaments/list?page=1&game=mkworld
```

Observed MKWorld series endpoint:

```text
GET /api/tournaments/series/list?game=mkworld
```

Observed tournament detail endpoint:

```text
GET /api/tournaments/{id}
```

Observed placements endpoint:

```text
GET /api/tournaments/{id}/placements
```

Use the list endpoint for browsing. Use the detail endpoint only when a user
opens, imports, or syncs a specific tournament, because details contain the
fields that decide the real event shape.

## Important List Fields

The compact tournament list returns enough data for search results and rough
classification:

- `id`: MKCentral tournament id.
- `name`: public event title.
- `game`: should be `mkworld` for this reference.
- `mode`: currently observed as `150cc` for MKWorld.
- `date_start`, `date_end`: Unix timestamps.
- `series_id`, `series_name`, `series_url`, `series_short_description`.
- `is_squad`: whether registration is squad-style instead of pure solo.
- `teams_allowed`: whether registered teams can be used.
- `registrations_open`.
- `logo`, `use_series_logo`.
- `is_viewable`, `is_public`.
- `organizer`: examples include `MKCentral` and affiliate-style organizers.

The list endpoint does not reliably include all detailed registration settings.
Do not use it alone to decide squad size or scoring.

## Important Detail Fields

The tournament detail endpoint is needed for proper format detection:

- `min_squad_size`, `max_squad_size`.
- `teams_only`.
- `team_members_only`.
- `sync_team_rosters`.
- `mii_name_required`.
- `require_single_fc`.
- `verified_fc_required`.
- `host_status_required`.
- `checkins_enabled`, `checkins_open`, `min_players_checkin`.
- `registration_cap`, `registration_deadline`.
- `max_representatives`, `min_representatives`.
- `description`, `ruleset`.
- `series_description`, `series_ruleset`.
- `use_series_description`, `use_series_ruleset`.
- `series_stats_include`.
- `show_on_profiles`.

Implementation note: always resolve the effective description/ruleset before
parsing:

- if `use_series_ruleset` is true, use `series_ruleset`;
- otherwise use `ruleset`;
- if `use_series_description` is true, use `series_description`;
- otherwise use `description`.

Store both the raw fields and the resolved text. Hash the resolved ruleset so
later changes can be detected.

## Snapshot Counts

Snapshot from MKCentral's MKWorld tournament list on 2026-05-01:

- 61 public MKWorld tournament rows observed.
- 7 result pages observed through the list pagination.
- All observed MKWorld tournament rows use `mode = 150cc`.
- 6 public MKWorld series rows observed.

Observed MKWorld registration models in the snapshot:

- Solo rows: 21.
- Squad-only rows: 29.
- Team-allowed rows: 11.

These counts are only a snapshot. They should not be hardcoded into app logic.

## MKWorld Series Seen

### Starting Line

Engineering meaning:

- Early 6v6-focused MKWorld series.
- Useful signal for team/squad-style tracking.
- Do not assume it uses the same local format as Lounge 12p.

### Atlas League

Engineering meaning:

- League-style MKWorld event.
- Teams are organized into skill-based divisions and playoff-style outcomes.
- Needs team/session separation if imported later.

### MKWorld Solo Circuit

Engineering meaning:

- Solo Free-for-All circuit.
- Multiple qualifier events can feed into finals.
- A local tracker should treat event placement and race score separately.

### MKWorld FFAs

Engineering meaning:

- Round-based Free-for-All family.
- Entries can be solo or small squads depending on the specific tournament.
- Can include events such as 12p 2v2 and Knockout Tour variants.

### MKCentral SUMMIT Tournaments (MKWorld)

Engineering meaning:

- Regional/time-zone oriented 150cc tournament family.
- Can include solo and squad variants.
- Detail fields and ruleset inheritance matter here.

### Collegiate / Affiliate-Style MKWorld Events

Engineering meaning:

- May be attached to external communities or organizers.
- Treat them as MKWorld events but do not assume MKCentral default scoring.
- Keep organizer and series metadata visible in any future import UI.

## Registration Models

MKCentral MKWorld events should be normalized into a registration model before
MKWT tries to track them.

### Solo

Observed signal:

```text
is_squad = false
teams_allowed = false
```

Tracking meaning:

- Entrants are treated as individual players.
- Common for Solo Circuit or FFA-style qualifiers.
- The event can still have multiple rounds.
- Do not assume one saved local session equals one full tournament.

### Squad-Only

Observed signal:

```text
is_squad = true
teams_allowed = false
```

Tracking meaning:

- Entrants register as squads rather than full registered teams.
- Squad size can vary by event.
- Use `min_squad_size` and `max_squad_size` from the detail endpoint.
- Observed examples include fixed 2-player squads and fixed 4-player squads.
- National-team style events can use larger roster ranges.

### Team-Allowed

Observed signal:

```text
is_squad = true
teams_allowed = true
```

Tracking meaning:

- Registered teams and/or squads can be used.
- League or team-event logic may apply.
- Check `teams_only`, `team_members_only`, and `sync_team_rosters`.
- Store team score separately from personal race score.

## Representative MKWorld Event Shapes

### Solo Circuit Qualifier

Observed detail pattern from a representative MKWorld Solo Circuit event:

- `is_squad = false`.
- `teams_allowed = false`.
- Rules can specify 8 or 12 races depending on tournament round.
- Intermission/connecting-path picks can be banned by event rules.

Tracking implication:

- Use solo profile.
- Do not use squad/team points.
- Race count may be event-round dependent.
- Course suggestions must respect the event rules, not just Lounge history.

### 12p 2v2 Tournament

Observed detail pattern:

- `is_squad = true`.
- `teams_allowed = false`.
- `min_squad_size = 2`.
- `max_squad_size = 2`.

Tracking implication:

- Treat as squad-only 2v2.
- It may look similar to a Lounge table but still needs its own event profile.
- Course rules may differ from normal Lounge queue depending on the ruleset.

### SUMMIT 2v2

Observed detail pattern:

- `is_squad = true`.
- `teams_allowed = false`.
- `min_squad_size = 2`.
- `max_squad_size = 2`.
- Can inherit ruleset from the series.

Tracking implication:

- Resolve series rules before deciding scoring or legality.
- Keep series id and tournament id attached to imported sessions.

### Knockout Tour 4v4

Observed detail pattern:

- `is_squad = true`.
- `teams_allowed = false`.
- `min_squad_size = 4`.
- `max_squad_size = 4`.
- Description/rules can define custom points across multiple sessions.

Tracking implication:

- Do not use normal 12-race local average as the tournament result.
- Store local race/session records separately from the tournament scoring model.
- Add explicit `scoringSystem = custom` until a parser exists.

### World Cup Style Event

Observed detail pattern:

- `is_squad = true`.
- `teams_allowed = false`.
- Larger roster sizes can be used.
- The event represents national-team style competition.

Tracking implication:

- Treat this as its own event family.
- Do not import it as a normal Lounge mogi.
- Team/nation identity should be a first-class metadata field if supported.

## Course Rules And Suggestions

Keep MKCentral tournament course rules separate from Lounge queue rules.

Important guidance:

- `LOUNGE_RULES_REFERENCE.md` remains the source for Lounge queue behavior.
- MKCentral MKWorld event rules can override race count and legal course picks.
- A 12p MKCentral event can ban connecting-path picks.
- A 24p Lounge rule should not automatically apply to every MKCentral event.
- Suggestions should be conservative:
  - if an event ruleset says a course type is banned, never suggest it;
  - if the ruleset is unknown or unclear, prefer not suggesting risky picks;
  - keep manual override possible for the user.

For current MKWT:

- Lounge 12p/24p suggestion logic should stay as it is.
- Future MKCentral tournament import should resolve the event profile before
  enabling suggestions.
- Do not merge MKCentral event-specific rules directly into generic Lounge
  dropdown logic.

## Points And Results

Separate these layers:

- race placement,
- race points,
- local session total,
- local average,
- squad/team total,
- tournament round result,
- final tournament placement,
- penalty or strike data.

Do not merge final MKCentral placement into local race points. A player can
have strong race scores and still be eliminated, or a squad can advance because
of team-level scoring that does not map cleanly to one player's local stats.

## Placements Endpoint

The placements endpoint can return:

- tournament id,
- registration id,
- placement,
- placement description,
- placement lower bound,
- disqualification flag,
- squad/team data,
- player data,
- roster data.

Recommended local shape:

```js
{
  source: "mkcentral",
  tournamentId,
  registrationId,
  placement,
  placementDescription,
  placementLowerBound,
  isDisqualified,
  squadOrTeam,
  players,
  rosters,
  sourcePayload
}
```

This should be read as final event result metadata, not as editable race data.

## Suggested MKWorld Event Profile

Before MKWT imports or tracks a MKCentral MKWorld tournament, normalize it into
an event profile:

```js
{
  source: "mkcentral",
  tournamentId,
  seriesId,
  gameKey: "mkworld",
  modeKey: "150cc",
  organizer,
  registrationModel, // "solo" | "squad_only" | "team_allowed" | "team_only"
  minSquadSize,
  maxSquadSize,
  formatHint,        // "solo_ffa" | "2v2" | "4v4" | "6v6" | "league" | "world_cup" | "knockout" | "unknown"
  raceCount,
  roundCount,
  tableSize,
  scoringSystem,
  courseRulesProfile,
  isElimination,
  usesSeriesDescription,
  usesSeriesRuleset,
  sourceRulesetHash,
  sourcePayload
}
```

If key fields are unknown, keep the event in a `needs_setup` state instead of
silently applying Lounge scoring.

## Parser Recommendations

When implementing MKCentral MKWorld parsing:

- Fetch list rows for browsing.
- Fetch detail data only for selected tournaments.
- Cache by `tournamentId` and effective ruleset hash.
- Preserve raw payloads so parser fixes can reprocess old imports.
- Use `game = mkworld` as a hard filter.
- Use `mode = 150cc` as current MKWorld expectation, but do not hardcode it as
  impossible to change.
- Use `is_squad`, `teams_allowed`, `teams_only`, and detail squad-size fields
  before parsing title text.
- Parse title hints only as secondary signals:
  - `2v2`
  - `4v4`
  - `6v6`
  - `12p`
  - `Solo`
  - `Circuit`
  - `League`
  - `World Cup`
  - `Knockout`
- Do not mistake a season number for squad size.
- Do not assume `series_name` alone decides scoring.
- Allow manual correction in the UI.

## UI Recommendations

A future MKCentral MKWorld import UI should show a compact detected profile
before writing local data:

- tournament name,
- series,
- organizer,
- date,
- Solo/Squad/Team model,
- detected squad size,
- detected format hint,
- effective ruleset source,
- known race count or `unknown`,
- scoring profile or `manual`,
- course rules profile or `manual`,
- final placement sync availability.

For unclear formats, show a "Needs setup" state. That is safer than silently
using Lounge assumptions.

## Suggested Local Enums

```js
const MKC_WORLD_GAME_KEY = "mkworld";

const MKC_WORLD_MODE_KEYS = [
  "150cc"
];

const MKC_WORLD_REGISTRATION_MODELS = [
  "solo",
  "squad_only",
  "team_allowed",
  "team_only",
  "unknown"
];

const MKC_WORLD_FORMAT_HINTS = [
  "solo_ffa",
  "solo_circuit",
  "2v2",
  "4v4",
  "6v6",
  "league",
  "world_cup",
  "knockout",
  "lounge_like",
  "unknown"
];
```

## Open Questions For Later Implementation

- Should MKCentral MKWorld imports live inside Lounge Stats or in a separate
  MKCentral tournament view?
- Should a local Lounge session be linkable to a MKCentral tournament id?
- How should MKWT represent non-12-race MKWorld event rounds?
- How should team or squad score be shown next to personal score?
- Should users be able to create manual presets per MKWorld series?
- Should event profile detection run automatically when a synced tournament is
  opened, or only when the user imports it?
- Should ruleset changes invalidate old parsed profiles or only mark them as
  outdated?

## Current MKWT Guidance

- Keep current Lounge queue mechanics in `lounge.js`.
- Keep Lounge queue rule notes in `LOUNGE_RULES_REFERENCE.md`.
- Use this file only for MKCentral MKWorld tournament-format planning.
- Do not add MKCentral tournament scoring assumptions directly into existing
  Lounge session logic without an event profile.
- Start future MKCentral tournament import as read-only:
  1. select tournament,
  2. resolve event profile,
  3. display detected fields,
  4. allow manual correction,
  5. only then write local tracking data.

