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
| tests | `refactored/tests/*.test.js` | not bundled, run by jest — the ONLY genuinely unreachable files in `refactored/` |
| tests | `refactored/tests/*.test.js` | not bundled, run by jest |
| orphan CSS | `components/notification.css`, `components/lazy-loading.css` | paired with, or alongside, unmounted JS |

> **The counts above are as-recorded and are now stale.** `compare-tray.js` was
> added on 2026-09-30 and `components/advanced-search.js`,
> `interaction-timeline.js`, `lead-scoring-dashboard.js` and
> `lead-assignment-dashboard.js` turned out to be **mounted** through admin page
> front matter, not dead. `docs/feature-inventory.md` listed the last four as
> orphans; that was wrong. Re-run `node scripts/front-end-graph.js` before
> quoting any number from this section.

---

## The one bottom strip (added 2026-09-30)

Compare and shortlist are two separate features with two separate pieces of
state, and they previously showed the shopper nothing:

- **Shortlist** had a fixed bar at the bottom listing chosen cars.
- **Compare** filled a table further down the page. Ticking "Compare" produced
  no visible change at all, so a shopper with two cars chosen could not see it,
  could not see which, and could not undo a misclick without finding the card.

Two fixed bars at the bottom of the screen cannot both exist — they overlap, and
the top one takes every click. So there is **one strip, built by
`compare-tray.js`, with a section for each**.

```
site/assets/js/compare-tray.js     owns the strip; publishes window.CaddyPickTray
site/assets/js/shortlist.js        pushes its state in; keeps a standalone fallback
site/assets/js/vehicleComparison.js  pushes its state in
site/assets/css/components/pick-tray.css
```

Rules that matter if you edit any of them:

- The strip reuses the **shortlist's own CSS classes** (`.shortlist`,
  `.shortlist__inner`, `.shortlist__items`, …) so it inherits the whole existing
  treatment, including the `.has-shortlist` body padding that stops the bar
  covering the bottom row of vehicle cards. That bug — tick one car, every other
  one becomes untickable — is not being reintroduced by a second bar.
- Chips **wrap** rather than scroll sideways, so three cars are visible at once.
  `pick-tray.css` overrides `overflow-x: auto` for exactly that reason.
- Each feature script renders only its own section. Neither rebuilds the other,
  so neither can lose the other's work.
- Both scripts fall back to their own standalone behaviour if `CaddyPickTray` is
  absent, so loading one without the other does not break the feature.

`ci/check-compare-shortlist.js` covers this behaviourally (23 existing
assertions, **16 more added for the strip and never run**). It loads
`compare-tray.js` **first**, deliberately: loading it after the feature scripts
would quietly exercise only their fallbacks, and every strip assertion would pass
against a bar no real page builds.

**`components/notification.js` (6 KB) plus its stylesheet is a written feature
that no page mounts.** `partials/stock-alerts.html` is a plain form. If a
toast/notification system is wanted, that is the implementation and mounting it
is the only thing missing. Flagged rather than deleted because it is a choice.

**`refactored/` is NOT dead, and an earlier version of this document said it
was.** The name is a leftover, not a status.

`schedulingCalendar.js` — the bundle the test-drive page loads — does
`import { initSchedulingCalendar } from './refactored/index.js'`, and `index.js`
pulls in the rest. Seven of the nine files in that directory are live, and they
are the implementation of the test-drive scheduling calendar.

The correction matters because the false version recommended deleting ~40 KB of
working code, and it was wrong because it was written from the broken filename
search described below rather than from the graph. Only `refactored/tests/`
(2 files) is genuinely unreferenced. The directory name should be changed --
`refactored/` describes a migration that finished -- but the code stays.

---

## Customer forms: record first, notify second

**The single most important thing to know about the forms on this site.** Added
2026-09-30, and it was the opposite before.

Every customer-facing form used to do this:

```js
await transporter.sendMail({ ... });   // 1. tell someone
await createLead(data);               // 2. keep the lead
```

and treated a failed send as a failed request. SMTP is not configured, so step
one threw and step two never ran. Three real submissions produced **zero** rows
in `leads`, `customers` and `booking_requests`. A customer typed their name,
email, phone and the car they wanted, and the business had no idea they existed.

`netlify/functions/utils/inquiry.js` is now the single path:

```js
const outcome = await inquiry.submit('lead' /* or 'booking' */, {
  name, email, phone, message, vehicleTitle, preferredDate, preferredTime,
});

// outcome.recorded === true   the row exists
// outcome.notified === false  and it did NOT email
// outcome.notifyReason        'smtp-not-configured', and so on
```

`{recorded: true, notified: false}` is a **success**. The enquiry is in the
database and visible in the admin; it just did not also send an email. Every
function that takes an enquiry returns `notified` in its response, so "recorded
but not emailed" is never confused with "recorded and emailed".

| form | posts to | notes |
|---|---|---|
| quick ask, staff card | `lead-form`, `contact-salesperson` | staff card **records now**; it used to return a hardcoded directory for a POST and print "Thank you for contacting Caddy Ed" |
| contact | `contact-form` | |
| test drive | `schedule-test-drive` | |
| pre-approval | `pre-approval` | **records now**; still honestly `processed: false` — there is no lender |
| service appointment | `schedule-appointment` | **new**; the portal's form 404'd on every submission until now |
| portal message | `lead-form` | **records now**; it used to post to an endpoint that checked no auth and stored nothing |

The recipient is resolved in one place, `inquiry.resolveRecipient()`: the
`sales_reps` table first, then the environment. There used to be four
disagreeing answers, one of them a hardcoded domain this business does not own.

**Client-side rules that exist because of specific bugs:**

- Send **JSON**, not `FormData`, where the function does `JSON.parse`.
  `financingCalculator.js` posted multipart, the function rejected it, and the
  client rendered "Application Submitted! Your confirmation number: undefined".
- **Check the status.** Several forms rendered a success panel on any 200,
  including from a function that ignored the method and the body entirely.
- **Always have a `.catch()`.** The pre-approval button used to stay disabled on
  "Submitting…" forever with no way out.
- `lead-form` requires a phone, because the roadside-facing forms need a number
  to call back on. The customer portal may have none on file.

---

## The gates

```bash
npm run check                 # all eleven, one table
npm run check:quick           # skip the slow ones
node ci/check-front-end.js    # the module graph, on its own
```

`ci/check-all.js` is the one to read. It exists because a failing build used to
print eight transcripts, most of them "pass", with the two that mattered buried —
and a gate nobody reads is a gate that catches nothing.

Two things it does that the individual checks do not:

- **SKIP is not PASS.** A check that needs Turso and has no credentials reports
  SKIP, and the summary counts it separately. `check-insert-columns.js` once
  printed "live column check SKIPPED" and still reported OK, after the libSQL
  native binding stopped resolving.
- **A stale build is a skip, not a failure.** Hugo builds on the CI host, not
  here, so a local `site/public` is whatever the last sync left behind. It
  compared newer-mtime and reports the two output-reading checks as SKIP with
  the reason. Before that, every local run reported the *fixed* 555 number and
  *fixed* fake street addresses as failures, on a clean tree.

`ci/check-compare-shortlist.js` is the one to read for behaviour. It loads the
**built** inventory page into jsdom, runs the real scripts, and clicks the
buttons — because the compare feature was inert for three stacked reasons and
every one of them passed a build and passed every gate. A build checks that files
exist and that scripts parse; it cannot check that a button does something.

**Its load order is part of the test.** It evaluates `compare-tray.js` *before*
`shortlist.js` and `vehicleComparison.js`, because that is the order the real page
uses. Load the strip script afterwards and both feature scripts take their
standalone fallbacks, the shared strip is never built, and every strip assertion
passes against a bar that no real page produces.

Two other gates worth reading:

- `ci/check-function-auth.js` — six endpoints had no authentication at all, three
  of them serving or destroying customer records. See `docs/SECURITY.md`.
- `ci/check-inquiry-path.js` — submits to the three real functions against the
  real database **in the configuration they are deployed in**, and asserts the
  enquiry is there afterwards, including that malformed payloads are still
  refused. Because "records everything" must not quietly become "accepts
  everything".

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

- `refactored/` — LIVE, despite the name. See above. Rename it; do not delete it.
- `components/notification.js` — written, styled, not mounted. Mount it or drop it.
- `performanceTracker.js` — 18 KB of analytics nothing loads.
- `libphonenumber-js` is 13 MB on disk for the 6 KB the code uses. That is a
  function-bundle cost, not a front-end one; see `docs/BUILD.md`.
