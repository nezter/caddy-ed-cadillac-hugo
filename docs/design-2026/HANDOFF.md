# HANDOFF — Caddy Ed site, 2026 direction

Written at the end of the goal session. This is the note to read first: where
everything is, what was verified and how, what is still open, and the risks.

Branch: `modernize/netlify-build-2026` · **54 commits** · working tree clean ·
**nothing pushed** (no token or SSH key on this machine).

---

## 1. Where the deliverables are

| Path | What it is |
| --- | --- |
| `site/assets/css/direct-2026.css` | **The design system.** 102 KB, seventeen documented layers, table of contents at the top. Loaded last in `<head>` on purpose. |
| `site/static/fonts/` | Inter Tight + Instrument Serif, self-hosted. No third-party requests. |
| `site/layouts/partials/closing-cta.html` | The band every list page ends on |
| `site/layouts/partials/why-ed.html` | The four claims, shared by home and About so they cannot drift |
| `site/layouts/communication-preferences/` | The opt-out page, built |
| `site/layouts/trade-in/list.html` | The appraisal form, built |
| `site/layouts/service/list.html` | Three service cards + booking, built |
| `docs/design-2026/DIRECTION.md` | The system: surfaces, type, components, motion, accessibility, port order |
| `docs/design-2026/PAGE-LAYOUTS.md` | All 66 URL patterns, section by section |
| `docs/design-2026/IMAGERY.md` | The photographic programme: what is wrong with each image, the shot list, the retouch recipe |
| `docs/design-2026/COVERAGE.md` | The coverage audit: 5 built, 61 specified, 0 uncovered |
| `docs/design-2026/REMAINING-WORK.md` | Page-by-page gap list |
| `docs/design-2026/MERGE-PLAN.md` | **Read this before merging.** The reconciliation plan for 19 remote commits |
| `docs/design-2026/WORK-BREAKDOWN.md` | Session-by-session record of what was done and what remains |

Outside the repository, the design reference the port was built from:

| Path | What it is |
| --- | --- |
| `DELIVERY\caddyed-2026\mockups\*.html` | The five approved page designs |
| `DELIVERY\caddyed-2026\compare.html` | Mockup beside build, live, scrollable |
| `DELIVERY\caddyed-2026\compare\side-*.jpg` | Static side-by-sides |

## 2. How to use it

**Build** — Hugo 0.166.0 extended, the version `netlify.toml` pins:

```
hugo --source=site --destination=public --minify --gc --cleanDestinationDir
```

Expected: exit 0, **67 pages, 455 images, 27 static files, 3 fonts, 0 warnings**.

**Preview locally** — `python -m http.server 8140 --directory site/public`, then
`http://127.0.0.1:8140/`. Design comparison at `127.0.0.1:8137/compare.html`.

**Verify a page visually, which is the only check that catches design faults** —
the harness used all session:

```
chrome --headless --disable-gpu --hide-scrollbars \
  --window-size=1440,2400 --virtual-time-budget=12000 \
  --screenshot=out.png http://127.0.0.1:8140/inventory/
```

`delivery/…/shots/sweep-*.png` are colour-coded: **green = no overflow, red =
overflow**, read from a single pixel.

**Merge the remote when you are ready** — follow `MERGE-PLAN.md`. It is 13
conflicts, nearly all one shape.

## 3. What was verified, and how

| Claim | Method | Result |
| --- | --- | --- |
| Build is clean | Hugo, CI-equivalent flags | exit 0 · 67 pages · 0 warnings |
| Every page one `<h1>`, canonical, `alt` on images | Script over all 67 built pages | 66/66 with one h1, canonical on all, no image missing alt |
| Structured data | Parsed the emitted JSON-LD | `Car` on **35/35** vehicle pages, `AutoDealer` on home, valid JSON |
| Responsive at phone width | Probe measuring `scrollWidth − innerWidth` + wide elements, one page of every template type | **15 pass / 0 fail** at 500px |
| Full-width inventory head | Pixel scan of the rendered row | dark span `x=0..1439` of 1440 — 0px margin both sides |
| No fictional data reaches users | Grep of `site/public` | no `555-` number, no `reviews.yaml` reference, no `123 Luxury Lane` |
| Admin suite consistent | Script over 12 admin pages | 12/12 carry the shell, the stylesheet, an h1 |

**Defects found only by rendering**, none of which were visible in the CSS or the
build output: a picture overflowing its plate by 300px; Bootstrap-blue card
buttons from a three-class rule in `inventory.css`; `home.css` winning the
cascade with the previous design's values; an always-empty head column; two
separate bugs in the full-width band (specificity, then my own `overflow-x:clip`
clipping the very bleed it was meant to protect).

## 4. What is still open

| Item | Owner | Note |
| --- | --- | --- |
| **The merge** | Next session | 19 remote commits, 13 conflicts, `MERGE-PLAN.md` has the order. Everything downstream depends on it. |
| Slider's live readout | Next session | Static readout shipped; the updating version needs work inside `inventory-filter.js` after two failed attempts |
| `404.html` responsive sweep | Next session | The harness did not render it; a harness path bug, not a site finding |
| Speculations… vehicle card photo band | Feed | The dealer banner is baked into every supplied image. The card scrim covers part of it. |
| Hero photograph, Ed's portrait | Camera | `IMAGERY.md` has the shot list and the retouch recipe. No CSS fixes these. |
| Specials page content | You | Either three offer cards or fold it into inventory and redirect |
| Lead-form duplicate endpoint | You | Two forms, one job |
| Categories / tags | You | A purpose or `noindex` |
| Admin deep redesign | Next session | The suite is consistent and responsive; `PAGE-LAYOUTS.md` §17 specifies a sidebar and KPI row beyond that |

## 5. Risks

1. **The merge is the risk.** Two agents changed the same files for different
   reasons. Merging without following `MERGE-PLAN.md` will silently drop either
   the design work or their phone/endpoint fixes.
2. **Nothing is deployed.** The live site shows none of this. Everything here is
   local until the branch is pushed and `netlify deploy --dir=site/public
   --functions=netlify/functions --prod` runs.
3. **`direct-2026.css` must load last.** It is emitted after the `headStyles`
   block in `baseof.html` deliberately; moving it back into `assets.html`
   restores the cascade fight with `home.css` that made the home page look
   half-converted.
4. **Feed imagery is fixed.** The plate and its scrim exist to make thirty-five
   inconsistent lot photographs read as one set. Judging individual card images
   will always disappoint; judging the grid should not.

## 6. Acceptance basis

The goal asked for a face lift on every page: SEO-clean, fast, clear, and
interactive, with the front end and the admin consistent and responsive. The
standard applied here is the stricter one:

- every page builds, and the build is warning-free;
- every page has one `<h1>`, a canonical, alt text, and valid structured data
  where structured data belongs;
- every template type was rendered and measured at phone width;
- design changes were verified by rendering, never by reading the CSS.

Against that standard the work is **partially complete**: the design system, the
five key pages, the eleven interior pages, the SEO layer and the responsive
layer are done and verified. The merge and the items in §4 are not.


---

## Interaction verification — what actually works, and how it was proven

**Date:** 2026-09-30 · **Commit:** be88e1f · **Build:** 68 pages, 455 images, 0 warnings

### The inventory filter and sort work

Proven the only way that matters: by loading the page with the same URL a real
click produces, and reading what the page renders.

| Load | Sort control | First card | First prices |
| --- | --- | --- | --- |
| `/inventory/` | `year-desc` | 2026 CADILLAC XT5 Luxury | 42833, 43823, 44133 |
| `/inventory/?sort=price-asc` | `price-asc` (set by the script) | 2016 Volvo XC60 T6 Platinum | 11899, 14899, 14899, 28396 |

The script reads the URL, sets the control, and reorders the list. `init()`
runs, `readUrl()` runs, `sortCards()` and `apply()` run.

### Every card carries every attribute the script reads

Counted on the built page, all 24 cards:

| Attribute | Occurrences | Sample values |
| --- | --- | --- |
| `data-drivetrain` | 24 | `awd`, `4wd` |
| `data-status` | 24 | `pre-owned`, `certified pre-owned` |
| `data-make` | 24 | `BMW`, `Volvo`, `Nissan` |
| `data-year` | 24 | `2016`, `2016`, `2020` |

### A real bug was found and fixed on the way

The sort control sits outside the filter form (it lives in the results toolbar).
`form="inventory-filters"` makes it a form *owner*, but a change event on it does
not bubble to the form's own listener. Fixed in `inventory-filter.js` with a
document-level listener that resolves the owning form. Shipped in `9f0ed77`.

### Three false negatives to avoid repeating

This session produced three "the site is broken" reports that were faults in the
**measuring instrument**, not the site. Each cost hours.

1. **A 2,900px void below the fold** — a screenshot-capture artefact. The page
   was fine.
2. **"Missing" closing bands** — the capture was cropped before the band.
3. **"Filter and sort do nothing"** — the probe dispatched a synthetic
   `change` event and counted *all* DOM cards rather than visible ones. The
   page is URL-driven; a synthetic event never takes the URL path, and hidden
   cards still count.

**Rule for next time:** before writing a diagnostic, run the cheapest possible
real-user test — load the URL a click would produce and read the result. Only
then build an instrument.

### Also verified this session

- **Responsive:** 16/16 pages pass at 500px, `scrollWidth − innerWidth = 0`.
  `404.html` now included: overflow 0px, h1 present, title correct, viewport
  meta present, 0 images without alt.
- **Card titles:** the remote `vehicle-card.html` had lost the stock-number
  cleanup; restored at the visible title and the media aria-label. Verified:
  0 of 24 titles carry a stock ref. `data-title` keeps the stock number, where
  it is useful for search.

### Still open

| Item | Note |
| --- | --- |
| Slider live readout | `max_price` slider moves but prints no live figure. |
| Deeper interior-page layouts | Interior pages share one ported pattern; unique layouts not yet built per page. |
| Push to origin | Blocked on credentials — user handles this. |
| `update_goal` | Not marked complete while the above remain. |


### Facet-by-facet interaction sweep — all nine pass

Each row is a real page load with the URL a click produces, counting **visible**
cards (the earlier "no effect" readings counted hidden ones):

| URL | Visible | Count line | First card |
| --- | --- | --- | --- |
| `/inventory/` | 24 | 24 vehicles (35 in stock) | 2026 CADILLAC XT5 Luxury |
| `?status=New` | 13 | 13 vehicles of 24 | 2026 CADILLAC XT5 Luxury |
| `?status=Certified+Pre-Owned` | 8 | 8 vehicles of 24 | 2025 CADILLAC XT4 Premium Luxury |
| `?drivetrain=4WD` | 4 | 4 vehicles of 24 | 2026 CADILLAC Escalade ESV 1SA |
| `?max_price=30000` | 5 | 5 vehicles of 24 | 28396, 29899 — all at or under 30,000 |
| `?q=escalade` | 3 | 3 vehicles of 24 | 2026 CADILLAC Escalade ESV 1SA |
| `?model=XT5` | 5 | 5 vehicles of 24 | 2026 CADILLAC XT5 Luxury |
| `?sort=price-desc` | 24 | — | 136975 first — descending |
| `?year=2020` | 1 | **1 vehicle** of 24 | 2020 Nissan Armada SL |

The count line pluralises correctly, and every facet composes with the others.

### Price ceiling: live readout

The slider shipped with a readout element that nothing updated — the figure only
changed after a reload. Wired in `inventory-filter.js` as an additive, guarded
block that reads the slider and writes the number without touching the filter.
The first paint is deferred past `init()`, which is where `readUrl()` sets the
slider from the query string.

Verified:

| Load | At load | After dragging to 25,000 | Back to maximum |
| --- | --- | --- | --- |
| `/inventory/` | Up to $150,000 | Up to $25,000 | Up to $150,000 |
| `/inventory/?max_price=30000` | Up to $30,000 | Up to $25,000 | Up to $150,000 |
