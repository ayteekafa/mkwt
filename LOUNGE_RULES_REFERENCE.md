# Lounge Rules Reference

Source: https://docs.google.com/document/d/e/2PACX-1vT16yZirwz_ehjYIq6KeemuGKx3rCCvKJU-iNuTl0S2FPs7AYv1y44bsfDMLKbRfA5TOxShsmJxomJq/pub

Reviewed for MKWT implementation notes: 2026-05-01.

This file is a paraphrased engineering reference for the MKWT codebase. The
Google Doc remains the authority. Re-check the source before making
rule-sensitive changes, because the published document says it updates
automatically.

## Implementation Priorities

- Never recommend illegal picks in helper UI.
- Suggestions should be conservative. If a pick might be illegal, do not
  suggest it automatically.
- Repick detection should be deterministic and based on the saved event state.
- Random course selection does not exempt a player from course-selection rules.
- Penalty tracking is separate from result tracking unless Squad Queue point
  deductions are explicitly implemented.
- If a race is played despite a violation, it still counts toward the event
  result unless the disconnection/lag rules make the race invalid.
- Keep 12-player and 24-player logic separate. The course rules are not the
  same.

## Event Basics

- Lounge events use 12 races.
- Room settings should be 150cc, Normal Items, 10-second intermission, and the
  correct COM behavior:
  - 12-player rooms: No COM.
  - 24-player rooms: Hard COM.
- 12-player result tables normally total 984 points.
- 24-player result tables normally total 1728 points.
- Result totals can differ in edge cases such as missing players, lag rulings,
  or Squad Queue point deductions.
- Hosts should use room IDs, not friend codes.
- Room IDs should not be exposed to non-participants.
- Players should take screenshots before and after each race so tables and
  penalties can be verified.

## Course Selection

This is the most important section for MKWT picker, filter, repick, and
suggestion behavior.

### 12-player Lounge Queue

- 3-lap courses are valid picks.
- A course with a connecting path is not allowed in 12-player events.
- If a connecting path is selected in 12p, the race is still played and still
  counts toward the event result, but it is a penalty candidate.
- Repicking any already-played course is not allowed.
- Course suggestions must never suggest Intermission or connecting-path picks
  in 12p, even if the user's stats for those entries are strong.
- If an illegal connecting path is tracked for historical accuracy, mark it as
  a violation candidate instead of treating it as a normal suggestion target.

### 24-player Lounge Queue

- 3-lap courses are valid picks.
- Connecting paths are allowed in 24-player events.
- Repicks are not allowed.
- A connecting-path course is separate from the 3-lap version of either course
  in the path.
- Two connecting-path courses with the same destination count as the same course
  for repick purposes.
- Example rule logic:
  - `Salty Salty Speedway -> DK Pass` followed later by
    `Starview Peak -> DK Pass` is a repick, because the destination is the same.
  - `Salty Salty Speedway -> DK Pass` followed later by `DK Pass` as a 3-lap
    course is not a repick.
  - `DK Pass -> Salty Salty Speedway` is not a repick of
    `Salty Salty Speedway -> DK Pass`, because the destination differs.
- Special case:
  - `Rainbow Road` and `Peach Stadium -> Rainbow Road` count as the same course
    for repick purposes.
- 24p suggestions should currently only suggest 3-lap courses.
- 24p suggestions should filter out 3-lap courses that are already illegal by
  the current 24p repick rules. In practice:
  - a route to `DK Pass` does not block `DK Pass` 3-lap from suggestions.
  - `Peach Stadium -> Rainbow Road` does block `Rainbow Road` 3-lap from
    suggestions.

### Substitute Players

- Substitutes are responsible for course history before they joined.
- A substitute repicking a course already played before their substitution is
  still a penalty candidate.
- For app mechanics, repick detection should use the whole event history, not
  only races after the tracked player joined.

### Evidence and Admission

- If the player who picked a repick or illegal connecting path does not admit
  it, all players may be required to provide screenshot/video evidence that they
  did not pick it.
- Players without evidence can receive a penalty.
- A player who is later discovered as the offender after not admitting may
  receive stronger punishment.
- This is moderation workflow, not automatic score logic.

## Squad Queue Notes

Squad Queue has extra consequences. MKWT should not silently apply these unless
the app has an explicit Squad Queue mode.

- Repicks are not permitted in Squad Queue.
- Connecting paths are permitted in 24-player Squad Queue.
- In 12-player Squad Queue, connecting paths are penalty candidates.
- Squad Queue can apply point deductions in addition to MMR/strike penalties:
  - 2v2: 10 points
  - 3v3: 10 points
  - 4v4: 15 points
  - 6v6: 20 points
  - 8v8: 20 points
  - 12v12: 20 points
- If this becomes a feature, implement deductions as an explicit adjustment
  layer so the raw in-game result remains inspectable.

## Disconnections and Lag

These rules matter for future invalid-race, DC tagging, and session-note tools.

- Players are expected to have a stable connection.
- Disconnection or lag evidence may be requested.
- A valid disconnection must be unintentional. Leaving intentionally,
  overbagging until disconnecting, or preventable causes may invalidate
  evidence.
- If players disagree whether a race counts, an additional race should be
  played and staff decides later.
- If a player disconnects before the first race starts after the event starts or
  resumes, the race may not count if valid evidence exists.
- If a player disconnects during a race and cannot rejoin, races started after
  the earlier of these points may not count:
  - valid evidence is provided.
  - 60 seconds pass after the player states the disconnection.
- Disconnections or delayed items can cause a room reopen and race discount if
  thresholds are met.
- Thresholds based on lobby size before race start:
  - 22-24 players: 5 affected players from at least 3 different teams.
  - 11-12 players: 3 affected players from at least 2 different teams.
  - 10 players: 2 affected players from at least 2 different teams.
- Delayed item examples include not receiving an item in the normal timeframe,
  or receiving only weak items when that is otherwise unexpected.
- If no players receive the results screen after a race, the race should not
  count and the room should be reopened.
- If continuing becomes impossible due to connection issues, staff can cancel
  the event as a last resort.

## Missing Players and Results

- Missing players are handled differently in 12p and 24p.
- In 24p, missing players receive CPU points.
- In 12p, if a results screenshot with missing players exists, points may be
  corrected to the 12-player point scale for present players, while missing
  players may receive 1 point when absent from results.
- If no suitable screenshot exists in 12p, missing players may receive 1 point
  per race when absent, and present-player points may remain uncorrected.
- If a player misses at least 3 races, teammate loss-reduction rules may apply.
  This is MMR logic, not normal race-point calculation.

## Drops and Substitutes

- Dropping before the event starts and dropping after the first completed race
  have different penalty outcomes.
- Substitutes can be requested with the server command flow.
- A substitute before the first completed race receives normal MMR results.
- A substitute after the first completed race has restricted MMR gain/loss
  behavior:
  - no MMR loss on a losing team.
  - gains MMR on a winning team only if they play at least 4 races.
- Players who drop from an event are not eligible for some MMR protections and
  may still affect team scoring.
- For MKWT, substitution metadata should be stored separately from raw race
  entries if implemented.

## Host and Room Procedure

- Hosts are selected through the queue/host flow; players should not override
  the selected host.
- A host must be declared within the required time window.
- Room ID must be posted within the required time window.
- Incorrect settings require reopening the room and can create penalties.
- A missing-player start is invalid under different thresholds:
  - 12p Lounge Queue cannot start with missing players.
  - 24p Lounge Queue may start under limited conditions if no substitute is
    found and other requirements are met.
  - Squad Queue has its own start timing.
- If a room is reopened because of errors, disconnects, delayed items, or wrong
  teams, team settings can be affected after repeated reopenings.

## Tags, Names, and Conduct

These are mostly moderation rules, but they can inform future checklist UI.

- FFA events require Lounge nicknames.
- Team events require agreed team tags at the start of player names.
- Similar or conflicting team tags can become penalty issues.
- Offensive names or Miis can lead to moderation action.
- Severe match conduct issues include targeting, intentionally throwing,
  teaming with opposing teams, trolling, lap-trolling, and stream sniping.
- Repeated or attempted repicks can be treated as trolling.
- Abuse of a course-skip glitch makes the race invalid and an additional race
  should be played.

## Results Submission

- Results are submitted through the Lounge updating bot.
- Use Lounge nicknames when submitting tables.
- Penalties should be reported with the appropriate server command and enough
  detail: race counts missed, repick count, names/tags involved, evidence, etc.
- Excessive lag and conduct violations require report tickets rather than only
  table notes.
- False reports, incorrect tables, or resubmitting deleted tables can lead to
  reporter restrictions.

## App Design Notes

- Keep raw race data separate from rule-derived flags.
- Store enough data to recalculate derived flags:
  - race kind: 3-lap track vs connecting path.
  - route start and destination.
  - lobby size.
  - placement/result.
  - DC flag.
  - optional SQ format if Squad Queue is implemented.
- Derived flags should be recalculated after edits, imports, cloud sync, and
  saved-session changes.
- Suggestions should use only legal, currently available picks for the active
  mode.
- Filters and dropdown highlighting should share the same rule keys as save and
  edit logic.
- If a future UI shows penalties, label them as "penalty candidate" unless the
  user explicitly confirms the offender and rule outcome.
- Do not auto-apply Squad Queue deductions in Lounge Queue.

