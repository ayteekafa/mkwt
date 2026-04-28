# AGENTS.md

## Purpose
This repository is a root-oriented static web app.
Work with the existing page-based structure and keep changes small, direct, and easy to review.

Read `ARCHITECTURE.md` first before making structural assumptions.

## Working style
- Start with a short plan when a task touches multiple files, changes behavior, or changes layout.
- Prefer simple local fixes over clever abstractions.
- Reuse existing patterns, IDs, naming, and helper functions.
- Preserve current behavior unless the task explicitly changes it.
- Do not broad-refactor page structure unless the task requires it.

## Actual project structure
Do not assume there is an `html/` or `doc/` folder.
The real structure is:

- root HTML pages such as `tracker.html`, `time-trial.html`, `stats.html`, `lounge.html`, `lounge-24.html`, `lounge-stats.html`, `sessions.html`, `settings.html`
- page CSS/JS files next to those pages in the root
- local schema/reference files such as `time-trial-schema.sql`
- shared runtime files in the root:
  - `mkwt_core.js`
  - `mkwt_page_helpers.js`
  - `mkwt_public.js`
  - `mkwt_bootstrap.js`
  - `mkwt_report.js`
  - `mkwt_theme_v3.css`
- deployment/runtime files in the root:
  - `sw.js`
  - `_headers`
  - `_redirects`
  - `_worker.js`
- utility or asset folders:
  - `functions/api`
  - `tools`
  - `icons`
  - `Track Icons MKW`
  - `Track Icons MKW Transparent`
  - `combo-icons`

## Generated and mirrored files
- Prefer editing the source scripts in `tools/` over hand-editing generated data/assets.
- Treat these as generated artifacts unless the task explicitly says otherwise:
  - `combo_builder_data.json`
  - `combo_icon_map.json`
  - `track_icon_map.json`
  - `track_icon_map_boxed.json`
- `lounge-stats.html` and `mkcentral.html` are mirrored entry pages for the same Lounge Stats system. When one changes structurally, check the other immediately.
- Root stray/temp files should be removed instead of left behind. This repo is already root-heavy, so even small junk files make navigation worse fast.

## Page ownership guidance
- `tracker.*`: World Wide tracking UI and recent matches
- `time-trial.*`: Time Trial PB tracking, WR sync, and WR comparison
- `stats.*`: World Wide charts and analysis
- `sessions.*`: World Wide session history
- `settings.*`: account/profile/app settings
- `lounge.*`: Lounge 12p tracking
- `lounge-24.*`: Lounge 24p tracking
- `mkcentral.*`: Lounge stats and MKCentral sync/export logic
- `functions/api/time-trial-*.js` and `_worker.js`: Time Trial WR fetch proxy logic

When possible, keep logic inside the page family that owns it.
Only move into shared files when the same behavior is clearly needed in multiple places.

## Frontend rules
- Keep HTML semantic and readable.
- Prefer the existing root page shell structure.
- Avoid unnecessary wrappers.
- Avoid inline styles unless the file already uses them or the task is extremely small.
- Keep CSS scoped to the page unless the style is clearly app-wide.
- Keep JS scoped to the page unless the logic is clearly reusable.
- Preserve accessibility where possible: buttons remain buttons, labels stay connected, dialogs and headings remain sensible.

## Shared-file caution
Be careful when editing:
- `mkwt_theme_v3.css`: affects many pages
- `mkwt_core.js`: affects auth/storage/account behavior across pages
- `mkwt_public.js`: affects shared nav/public interactions
- `sw.js`: affects caching and refresh behavior
- `_headers` / `_redirects` / `_worker.js`: affect deployment/runtime behavior

Changes in shared files require a broader review than changes in page-local files.

## Editing rules
- Touch as few files as possible.
- Do not rename or move files unless required by the task.
- Do not invent new folders for page files unless the task explicitly restructures the project.
- Do not remove comments, assets, or old logic unless they are clearly obsolete and safe to remove.
- Keep diffs small and reviewable.

## Verification rules
Before finishing:
- re-read the changed files once
- check matching HTML/CSS/JS still line up
- check obvious selector dependencies such as IDs, canvas IDs, buttons, and dialogs
- verify links, buttons, forms, and page scripts still make sense
- if a new shared asset was added, consider whether `sw.js` should include it
- if embed/popup/network behavior changed, consider `_headers`, `_redirects`, and runtime effects
- summarize what changed and mention remaining risks or assumptions

## When to plan first
Use a short written plan before implementation when:
- the task affects multiple files
- the task changes layout or interactions
- the task touches shared runtime files
- the task touches deployment or cache behavior
- requirements are ambiguous

## Safety / restrictions
- Do not run destructive commands unless explicitly required.
- Do not delete large sections of the project without confirming they are unused.
- Do not change deployment behavior unless the task asks for it.
- Do not replace page-local logic with a new abstraction unless it clearly reduces repeated work or fixes a real maintenance problem.

## Definition of done
The task is done when:
- the requested behavior or content change is implemented
- the affected page structure still matches its JS/CSS expectations
- obvious regressions were checked
- shared-file impact was considered if shared files changed
- the summary explains the actual scope of the change

## Document location
`AGENTS.md` belongs in the repository root so agents see the rules before touching the root-organized page files.
