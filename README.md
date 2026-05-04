# MKWT

MKWT is a root-oriented static web app for Mario Kart World tracking, Time Trial PBs, Lounge mogis, and stats.

This repo is intentionally plain HTML/CSS/JS with a small shared runtime layer. Most pages live directly in the root, so keeping the top level tidy matters more here than in a folder-heavy app.

## Quick orientation

- `tracker.*` - World Wide match entry and recent matches
- `stats.*` - World Wide charts and comparisons
- `sessions.*` - World Wide session history
- `time-trial.*` - PB entry plus locally cached WR fetch/comparison
- `combo-builder.*` - combo stats, filters, similar combos, compare
- `lounge.*` - Lounge 12p tracker
- `lounge-24.*` - Lounge 24p tracker
- `mkcentral.*` - Lounge Stats and MKCentral sync/export runtime
- `lounge-stats.html` / `mkcentral.html` - mirrored entry pages for the same Lounge Stats system
- `settings.*`, `login.*`, `reset.*`, `about.*` - account/app support pages

## Shared runtime files

- `mkwt_core.js` - auth/session/storage/Supabase helpers
- `mkwt_theme_v3.css` - shared design system and app shell styling
- `mkwt_bootstrap.js` - shared boot/runtime setup
- `mkwt_page_helpers.js` - smaller cross-page helpers
- `mkwt_public.js` - public/nav helpers
- `mkwt_report.js` - image/report export helpers
- `mkwt_mode_compare.js` - compare-dialog logic shared by stats-style pages

## Generated data and assets

These files are outputs, not ideal hand-edit targets:

- `combo_builder_data.json`
- `combo_icon_map.json`
- `track_icon_map.json`
- `track_icon_map_boxed.json`
- `combo-icons/`
- `Track Icons MKW Transparent/`

If one of those needs to change structurally, check the scripts in `tools/` first.

## Deployment/runtime

- `sw.js` - service worker cache list and route fallbacks
- `_headers` - response headers
- `_redirects` - route rewrites/redirects
- `_worker.js` - Cloudflare Pages Advanced Mode worker for API proxying and asset serving
- `functions/api/` - local/legacy endpoint references; production API routes are handled by `_worker.js`

## Practical editing guidance

- Prefer page-local changes before shared-file changes.
- Treat `mkcentral.js`, `lounge.js`, `stats.js`, `tracker.js`, and `time-trial.js` as high-context files. They are large and mixed, so avoid casual abstraction churn.
- When touching shared files, re-check at least one page outside the immediate feature area.
- When adding shared assets or generated files, consider whether `sw.js` also needs an update.

## More detail

- [AGENTS.md](./AGENTS.md) - repo-specific working rules for Codex
- [ARCHITECTURE.md](./ARCHITECTURE.md) - deeper layout/runtime overview
