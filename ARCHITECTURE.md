# ARCHITECTURE.md

## Overview
MKWT is a static multi-page web app for Mario Kart World tracking and stats.
Most of the project lives directly in the repository root as page-specific `html/css/js` files plus a small set of shared runtime files.

This is not a `html/` or `doc/` folder style project.
The current architecture is root-oriented and page-oriented.

## Repository layout

### Root page entries
Each main page is usually represented by a matching HTML/CSS/JS trio or pair in the root:

- `index.html`, `index.css`, `index.js`: landing page
- `tracker.html`, `tracker.css`, `tracker.js`: World Wide tracker
- `time-trial.html`, `time-trial.css`, `time-trial.js`: Time Trial PB tracker and WR comparison
- `stats.html`, `stats.css`, `stats.js`, `stats_ui.js`: World Wide stats
- `sessions.html`, `sessions.css`, `sessions.js`: session history
- `settings.html`, `settings.css`, `settings.js`: profile and app settings
- `lounge.html`, `lounge.css`, `lounge.js`: Lounge 12p tracker
- `lounge-24.html`, `lounge.css`, `lounge.js`: Lounge 24p tracker
- `lounge-stats.html`, `mkcentral.css`, `mkcentral.js`: Lounge stats view
- `mkcentral.html`, `mkcentral.css`, `mkcentral.js`: alternate entry for the same Lounge stats system
- `login.html`, `login.css`, `login.js`: account login
- `reset.html`, `reset.css`, `reset.js`: password reset
- `about.html`, `about.css`: information page

### Shared runtime and shared UI
- `mkwt_core.js`: shared Supabase/session/data helpers used across account-aware pages
- `mkwt_page_helpers.js`: shared page and storage helpers
- `mkwt_public.js`: shared public/navbar UI behavior
- `mkwt_bootstrap.js`: early boot/runtime setup
- `mkwt_theme_v3.css`: shared theme tokens, nav, buttons, cards, and common component styling
- `mkwt_report.js`: shared image export/report helper for stats-style pages
- `tracker_intermission.js`: shared intermission logic for tracker-style pages
- `tracker_suggestions.js`: tracker suggestion helpers

### Data and metadata files
- `strats.json`: intermission/destiny metadata used by stats/tracker logic
- `track_icon_map.json`: track code mapping
- `time-trial-schema.sql`: local record of the Time Trial database schema and seed data
- `manifest.webmanifest`, icons, favicons: PWA and app assets

### Deployment/runtime files
- `sw.js`: service worker and static asset cache list
- `_headers`: response headers for deployment
- `_redirects`: route rewrites/redirects for deployment
- `_worker.js`: edge/runtime worker entry
- `functions/api/mkcentral-player.js`: serverless MKCentral fetch proxy endpoint
- `functions/api/time-trial-index.js`, `functions/api/time-trial-track.js`: serverless mkwrs.com fetch proxy endpoints

### Utility/assets folders
- `tools/`: local utility scripts such as `mkcentral-local-proxy.ps1`
- `icons/`: app icons
- `Track Icons MKW/`: track image assets

## Runtime model

### Frontend style
The app is plain HTML/CSS/JS with CDN-loaded libraries where needed.
There is no framework build step in the current structure.

### Data sources
The app combines:
- local browser storage for guest mode and page settings
- Supabase for account-backed profile, match, and lounge data
- MKCentral scraping/sync logic for Lounge Stats
- mkwrs.com scraping/sync logic for Time Trial world records

### Page composition
Most pages follow this pattern:
1. HTML defines the page shell and DOM anchors
2. shared scripts initialize auth/session/theme/nav
3. page-local JS loads data and renders the page
4. page-local CSS handles only page-specific layout/styling, while shared styling stays in `mkwt_theme_v3.css`

## Main feature areas

### World Wide flow
- `tracker.*` handles match entry and recent match review
- `sessions.*` groups World Wide matches into sessions
- `stats.*` renders World Wide charts and distribution analysis

### Time Trial flow
- `time-trial.*` handles Time Trial personal best entry, WR sync, and WR comparison

### Lounge flow
- `lounge.*` handles 12p mogi tracking
- `lounge-24.*` handles 24p mogi tracking
- `mkcentral.*` powers Lounge Stats and MKCentral sync/export behavior

### Shared Lounge behavior
Lounge pages reuse shared theme styles and some tracker/stats assets, but the actual mogi logic lives in `lounge.js`.

## Architecture rules for changes
- Prefer page-local changes first.
- Only touch shared files when the behavior truly belongs to multiple pages.
- Keep page entry files in the root unless the project is intentionally restructured.
- Avoid broad reorganization unless the task explicitly asks for it.
- Reuse existing shared helpers before inventing new ones.

## Practical change boundaries

### Usually page-local
- text/content updates on one page
- layout tweaks for a single page
- chart changes limited to one page
- tracker/lobby behavior that only affects one mode

### Usually shared
- auth/session handling
- navbar behavior
- app-wide theming
- reusable export/report logic
- storage helpers

## Important project-specific constraints
- If a new shared JS/CSS asset should work offline or be reliably refreshed, check whether it needs to be added to `sw.js`.
- If popup/embed behavior changes, check `_headers` and deployment behavior.
- If MKCentral sync behavior changes, review both `mkcentral.js` and `functions/api/mkcentral-player.js`.
- If Time Trial WR sync behavior changes, review `time-trial.js`, `_worker.js`, and `functions/api/time-trial-*.js`.
- Because pages are tightly DOM-coupled, changes to IDs, button names, or canvas IDs should be made carefully and verified against the matching JS.

## Verification expectations
After changes:
- open or inspect the affected page entry file(s)
- verify matching JS selectors still exist
- verify the page still loads the intended scripts/styles
- check chart IDs, button IDs, and dialog IDs after UI changes
- note whether `sw.js`, `_headers`, or `_redirects` also needed updates

## Document location
`ARCHITECTURE.md` belongs in the repository root next to the page entry files and shared runtime files, because this project is organized from the root outward.
