# Admin UX review -- owner feedback of 2026-10-12, and the plan for the redesign

## What the owner said (verbatim intent)

- "The admin pages are horrible."
- Later: spend real time doing a proper admin design -- menus, pages, fields,
  content, all of it.
- "Not intuitive, very clunky, hard to navigate."
- "Load times on certain content are slow and hard to work with."

## What was fixed the same day (measured, not guessed)

An audit of all 24 admin pages and 25 data endpoints showed:
- Pages: 315-787 ms cold on the CDN, 10-16 KB each (inventory 160 KB,
  favourites 49 KB).
- Endpoints: warm 220-500 ms; first call after idle pays a functions
  cold start (0.6-1.3 s). Inherent to the platform; the fixable part was
  PAGES THAT STACKED THOSE CALLS IN SEQUENCE.
- Fixed: followup-campaigns ran campaigns -> rules -> templates as three
  serial waves (up to three cold starts in a row); now one Promise.all wave.
- Fixed: interactions ran types -> timeline serially; now one wave.
- Already fine: dashboard (3 parallel fetches), lead-assignment (parallel),
  inventory editor (parallel), bookings (concurrent), customers (settled).

## The redesign scope (for the session the owner wants)

1. NAVIGATION. Today: a top strip of 24 links in 4 groups, wrapping.
   Candidates: sidebar with collapsible groups; or top strip + a hub-first
   pattern; breadcrumbs on every page; a filter-as-you-type jump box;
   active/current states; keyboard shortcuts for the five daily pages.
2. PAGE TEMPLATES. One skeleton for every page: title + one primary action;
   a toolbar (filters right, search left); a density pass on tables (row
   height, sticky headers, zebra); consistent pagination; empty states with
   a call to action; skeleton loading instead of blank space.
3. FORMS AND FIELDS. Grouped sections (contact / vehicle / assignment);
   help text pattern; field width follows content (a price is not a
   textarea); validation summary with jump links; save feedback +
   unsaved-changes guard on the editor pages.
4. STATES. Standardise: loading (spinner + text), empty (explain + CTA),
   error (what happened + retry), success (toast, non-blocking). Each page
   already has some of these; the fix is making them the same everywhere.
5. SPEED BUDGET. Page HTML under 60 KB (inventory is 160 KB -- worth
   trimming what ships inline); at most two round trips before first data
   paint; every multi-fetch page parallel (done for the known offenders).
6. MOBILE / TABLET pass for the four pages used away from the desk
   (bookings, leads, customers, dashboard).
7. CONSISTENCY SWEEP. Button hierarchy (primary/secondary/ghost), alert
   styles, date and money formats, icons, focus rings, contrast.

## Proposed process

1. A 30-45 minute guided walkthrough: owner clicks through the five daily
   pages with the side-panel browser open; every friction point gets
   captured here with the page name and what felt wrong.
2. Wireframe pass on the worst three pages (menu, dashboard, leads) before
   any code.
3. Implement in waves, each wave behind the existing gates plus before/
   after screenshots; re-run the perf audit (/tmp perf-audit.js recipe)
   after each wave.

Held deliberately for that session: nothing visual or structural was
changed today beyond the two fetch-parallelisation fixes.
