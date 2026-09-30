# FRONTEND.md — how the front end is put together, and how to keep it that way

Written 2026-09-29. If you are about to add a file under `site/assets/`, read
this first. If you are about to add one and *don't* want to read it, the gate
will make you explain it anyway.

---

## The shape of it

```
site/assets/js/index.js          the site entry. Built by Hugo Pipes esbuild
        |                        to /js/main.js. Everything global is imported here.
        +--> the 12 admin pages, each declaring its own scripts: in front matter
        +--> page-specific bundles via partials/entry.html
        +--> src/js/cms.js        a SEPARATE build (webpack) for the CMS editor

site/assets/css/                 19 plain CSS files, 1 SCSS
site/layouts/partials/critical/  6 small CSS files for above-the-fold
```

Two build systems, not one. That is the single most confusing fact here:

| | Entry | Bundler | Output | Who runs it |
|---|---|---|---|---|
| Site | `site/assets/js/index.js` | Hugo Pipes (`js.Build`, esbuild) | `/js/main.<sha>.js` | every page |
| CMS editor | `src/js/cms.js` | webpack (`webpack.cms.js`) | `/cms.js` | `site/static/cms.html` only |

`src/js/cms.js` imports preview templates out of `site/assets/js/cms-preview-
templates/`. Nothing else in the site references that directory.

---

## The four ways a script gets loaded

This is the part that keeps surprising people, because **all four** exist and
each was added for a good reason.

**1. Imported into the main bundle.** The file is only shipped if `index.js`
imports it, directly or transitively. Most of `site/assets/js` should be here.

**2. A page's `scripts:` front matter.** The admin pages and the component
pages use this:

```yaml
scripts:
  - salesDashboard.js          # relative to site/assets/js/
  - components/advanced-search.js
styles:                        # usually unnecessary -- see below
  - components/admin.css
```

`partials/page-scripts.html` bundles each through the same pipeline as
everything else. Naming a component in `scripts:` is what you want; a
hardcoded `/js/...` path is not.

**3. `partial "entry.html"`.** For a self-executing IIFE that should be its own
bundle rather than part of `main.js`:

```html
{{ partial "entry.html" (dict "entry" "connect.js" "page" .) }}
```

Six live bundles load this way, including `connect.js` (23 KB) and
`shortlist.js`.

**4. `resources.Get "js/index.js"`.** The main bundle itself, in
`partials/assets.html`.

### The stylesheet derivation nobody expects

If a page names `components/thing.js` and `site/assets/css/components/thing.css`
exists, `page-scripts.html` loads the stylesheet **too**. That is why `styles:`
is usually redundant — and why three live admin stylesheets
(`interaction-timeline.css`, `lead-assignment-dashboard.css`,
`lead-scoring-dashboard.css`) are correct even though no page names them.

---

## The rules

1. **New global behaviour goes in `index.js`'s import tree.** If a file is not
   reachable from an entry point, it does not exist as far as a browser is
   concerned. This is the mistake the whole graph exists to catch.

2. **New page behaviour goes in that page's `scripts:`.** Not a hardcoded path.
   The comment in `entry.html` records what hardcoded paths cost: a bundle
   emitted without a `.js` extension is served as `application/octet-stream`,
   Firefox runs it in preview where there is no `nosniff`, and production
   refuses it. The preview looked perfect and the gates passed.

3. **Never add a name variant to break a tie.** `vehicle-comparison.js` vs
   `components/vehicleComparison.js`. `finance-calculator.js` vs
   `financingCalculator.js`. `menu.js` vs `navbar.js`. `utils.js` vs `utils/`.
   Four of these pairs exist right now and three of the losers are dead code.
   Rename the winner, delete the loser.

4. **A section's stylesheet belongs in the section layout's `headStyles`
   block,** not in a page's front matter. `partials/assets.html` used to emit
   `inventory.scss` on every page, putting the weight of one section on all of
   them.

5. **Do not inline CSS or JS in a template.** Both go through a partial so they
   get minified, fingerprinted and given an SRI hash.

---

## What is dead, and why that is a decision

```
node scripts/front-end-graph.js
```

```
JS  50 reachable of 68
CSS 17 referenced of 19
```

18 JS files and 2 stylesheets are unreachable. They are not *broken* — nothing
loads them — but they are not free either: 68 files to read, two of them named
like live files, which is how the wrong one gets edited.

Each one is on a reviewed list in `ci/check-front-end.js` with a stated reason,
grouped by what happened:

| Group | Files | What happened |
|---|---|---|
| webpack-era leftovers | `main.js`, `contact-form.js`, `lead-generator.js`, `components/notification.js`, `utils/error-event-system.js` | `assets.html` builds `index.js` to an output *named* `js/main.js`. The checked-in `assets/js/main.js` shares that name, so it looks live and is not. Its whole import tree came out of the old entry point. |
| name-variant losers | `menu.js`, `vehicle-comparison.js`, `finance-calculator.js`, `utils.js` | a winner was chosen and the loser kept |
| never mounted | `site.js`, `carousel.js`, `performanceTracker.js`, `utils/error-handler.js`, `services/api-service.js`, `api/inventory-proxy.js` | written, never wired to a page |
| tests | `refactored/tests/*.test.js` | not bundled, run by jest |
| orphan CSS | `components/notification.css`, `components/lazy-loading.css` | paired with, or alongside, unmounted JS |

**`components/notification.js` (6 KB) plus its stylesheet is a written feature
that no page mounts.** `partials/stock-alerts.html` is a plain form. If a
toast/notification system is wanted, that is the implementation and mounting it
is the only thing missing. Flagged rather than deleted because it is a choice.

**`refactored/` (7 files, ~40 KB, plus 2 tests) is an abandoned rewrite** of the
booking calendar. It is entirely unreachable. `appointment-scheduler.js` and
`schedulingCalendar.js` are the live implementations. This is the largest
single deletion available if someone wants the tree smaller — and it is the one
worth deciding on deliberately rather than by accident.

---

## The gate

```bash
node ci/check-front-end.js          # gate
node scripts/front-end-graph.js     # the report
node ci/check-front-end.js --report # the graph as JSON
```

It fails the build when:

1. **A declared entry point does not resolve.** A typo in a page's `scripts:`
   list, or a rename that missed a reference. That page then loads no
   JavaScript and the build says nothing — this is the failure mode the whole
   gate exists for.
2. **A new file is unreachable and not on the reviewed list.** Unreachable is
   not automatically wrong — tests and future components are unreachable on
   purpose — but it is a decision, so it has to be made and written down.
3. **A reviewed entry is now reachable.** The exemption has gone stale and would
   mask a real regression later.

### The graph was wrong three times before it was right

Recorded because the failures are the interesting part, and because each one
pointed at a *missing load path* rather than at dead code:

- **A filename search said 29 of 68 files were dead**, including the four
  `index.js` imports on its first line. `import { x } from './utils'` has no
  `.js` in the specifier, so a filename search cannot see it. A report that
  calls working code dead is an invitation to delete it.
- **Six live bundles were dead** until `partial "entry.html" (dict "entry" ...)`
  was modelled.
- **The site entry point was dead** until `resources.Get "js/index.js"` was
  modelled — and the only other mentions of `index.js` in that same file are
  comments about the hardcoded path it replaced.

And one false positive, which is the worst kind:

- **The gate reported `vehicle-inventory.js` as a missing entry point.** It is
  named only inside a Hugo comment in `partials/footer.html`, documenting the
  inline script that was deleted *because it 404'd*. A gate that reports a
  comment trains you to ignore it, and the real miss in the same output stops
  being read. So the scan now strips `{{/* */}}`, HTML comments and line
  comments first.

Both negative paths are tested by hand before being trusted: add a stray file
and the gate fails; misspell a `scripts:` entry and it fails and names the page.

---

## Other front-end checks

```bash
node ci/check-no-placeholder-contact.js   # 555 numbers, example.com, wrong address
node ci/verify-build.js                  # no page references a missing asset
```

`check-no-placeholder-contact.js` reads the **built** HTML on purpose. A template
default, a page's own front matter, a string in a JS file and a data file are
four different mechanisms that can each be wrong, and the output is the one
place they cannot disagree with each other. See `docs/BUILD.md`.

---

## Things that are still open

- `refactored/` — abandoned calendar rewrite, ~40 KB, delete or resurrect.
- `components/notification.js` — written, styled, not mounted. Mount it or drop it.
- `performanceTracker.js` — 18 KB of analytics nothing loads.
- `libphonenumber-js` is 13 MB on disk for the 6 KB the code uses. That is a
  function-bundle cost, not a front-end one; see `docs/BUILD.md`.
