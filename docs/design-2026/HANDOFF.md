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
