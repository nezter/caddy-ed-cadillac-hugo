# WORK-BREAKDOWN — what is done, and the work that remains

Branch `modernize/netlify-build-2026`. 18 commits, all local, **nothing pushed**.
Baseline before this work: commit `0b9c2ef`.

Two ways to read this file:

- **Part 1** is what landed, grouped into the sessions it was actually done in,
  with the evidence for each.
- **Part 2** is the work that remains, grouped into sessions small enough to
  start and finish in one sitting, in the order I would do them.

Legend for evidence: **built** = the Hugo build exits 0 and the page count is
unchanged; **inspected** = the emitted HTML/CSS was read back and the thing was
confirmed present; **rendered** = the page was screenshotted in headless Chrome
and looked at.

---

# Part 1 — DONE

## S1 · Foundation — `b1bbe87`
The stylesheet (`direct-2026.css`), three self-hosted fonts, the display-font
token, and a global load through the existing `stylesheet.html` pipeline so it
is minified, fingerprinted and carries SRI.
**Evidence:** built · inspected (fingerprinted link present in the built page).

## S2 · The shell — `b1bbe87`
Header and footer restyled into the direction by targeting the classes the
partials already emit (`site-header`, `header-utility`, `navbar-*`,
`site-footer`, `footer-*`), so no JavaScript hook changed. Footer hours line and
the mobile action bar added.
**Evidence:** built · inspected.

## S3 · Home — `b425ddf`, `b6c03d6`, `a996501`, `952c742`, `39d05af`
Hero as a full-bleed dark stage; proof strip as one ruled ribbon; vehicle cards
as dark plates; the fleet on ink; the dock with a fresh-stock tile beside the
social panel; Ed's pick band; the closing call.
**Evidence:** built · rendered (the hero, the ask panel and the ribbon were
described from a screenshot after each change).

## S4 · Inventory — `c0e1961`, `14c431a`, `d0b4fd8`
Filter rail beside two-across results, pagination moved below the grid, the
compare block moved out of the header to the foot, light cards on the browsing
surface, dark head band, live count.
**Evidence:** built · rendered (the rail, the two-across grid and the pagination
position were confirmed from the built page).

## S5 · Vehicle detail — `252a25a`, `7971faf`
Stock number lifted out of the `<h1>` into a mono micro-line; the "what people
ask" module; Ed's note with a signature seal; the price moved into the action
rail; a "three to compare against" section built from real stock.
**Evidence:** built · inspected (verified on three vehicles with different title
shapes).

## S6 · About and Contact — `5032203`, `51e2c45`
Both pages ported to the direction; the About page's structured data corrected;
the contact details reconciled to a single source.
**Evidence:** built · inspected.

## S7 · Cross-page type and buttons — `4d46036`, `7971faf`, `f441fc7`
The type system applied to the elements so every template inherits it; the
site's four button classes mapped onto the direction; the stylesheet moved to
load **after** the section stylesheets, which is what made any of it visible.
**Evidence:** built · rendered (`/financing/` confirmed at the new scale; the
home page confirmed to have changed).

## S8 · Hugo and Netlify compatibility — `43808fb`
The `.Site.Data` deprecation cleared (build is now warning-free); `/fonts/*`
given a cache policy.
**Evidence:** built (zero warnings).

## S9 · Data defects fixed — `51e2c45`, `9db05c5`, `5032203`
Four conflicting sets of contact details reduced to one; six fictional phone
numbers removed from user-facing strings; the About page's wrong address and
hours in its JSON-LD corrected.
**Evidence:** built · inspected (no fictional number survives in `site/public`).

---

# Part 2 — REMAINING, as sessions

## R1 · Verify the last three changes visually — SMALL, DO FIRST
The button mapping, the inventory head and the vehicle price rail were applied
from rendered evidence but **not re-rendered since**. Nothing else should be
built on top until they are confirmed.
**Acceptance:** fresh screenshots of home, inventory and vehicle, described and
checked against the three claims.
**Blocked on:** nothing.

## R2 · Home: the last two layout gaps — MEDIUM
1. The "Ed + what he's posting" block still arranges portrait + stay-connected
   + social panel differently from the mockup's portrait + two-tile dock.
2. The testimonial band: the mockup has a quote beside four tiles; the build
   renders an empty state (correct — there are no real reviews) with the tiles
   in a band below it. Worth deciding whether that is the final arrangement.
**Acceptance:** rendered comparison against `mockups/home.html`.
**Blocked on:** nothing.

## R3 · Vehicle detail: the spec and rail polish — MEDIUM
The rendered comparison called the specs "tiny, low-contrast, misaligned" and
the "Interested in this…" panel "unstyled". The rules exist; something is still
winning over them. Worth tracing in a render rather than guessing.
**Blocked on:** R1 (needs the same render loop).

## R4 · Inventory: the tray and the filter controls — LARGE, needs a decision
The mockup has a persistent bottom tray with thumbnails and "compare side by
side". The site has a tray that stays hidden until you add cars, plus a
Shortlist button per card. Building an always-visible tray is **new UI, not a
port** — it needs JS work and a decision from you. The filter rail also uses
selects where the mockup has sliders; I will not invent controls the data does
not back.
**Blocked on:** your go-ahead on the tray.

## R5 · The imagery programme — HIGHEST VALUE, not code
Nothing in CSS fixes this. In priority order, from `IMAGERY.md`:
1. **Retouch the hero** — lift shadows, separate the wheels and grille. One to
   two hours in any editor, and it is the largest image on the site.
2. **Reshoot Ed** — a single session. The current portrait is a flash-lit
   snapshot with raised fists; it is the personal brand and it is the weakest
   asset on the site.
3. **Re-shoot the top six cars** on a seamless floor, with no store name burned
   into the pixels.
4. **Interior and detail set** — five frames per car; this is also what unblocks
   the gallery thumb rail that 0 of 35 vehicles can fill today.
**Blocked on:** a camera and a decision, not on code.

## R6 · The remaining eleven pages — MEDIUM each
`PAGE-LAYOUTS.md` specifies all of them; none are ported:
test drive · financing · trade-in · service · specials · customer portal ·
404 · privacy policy · communication preferences · categories/tags · admin suite.
The type and button layers already reach them, so each is a layout port, not a
rebuild. The two with the most upside: **test drive** (the strongest copy on the
site, currently undermined by two competing booking forms) and **trade-in** (a
whole page about a number with no way to enter one).

## R7 · Data and compliance cleanups — SMALL, your call each
- `site/data/testimonials.yml` holds **five invented reviews with customer
  names**. Nothing renders it; `comments.html` deliberately shows an empty state
  and cites the FTC rule against fabricated testimonials. I recommend deleting
  the file.
- Resolve the address, phone and hours across `config.toml`, `data/contact.yml`
  and the contact page's front matter. They agree now, but three copies remain.
- Decide whether `/categories/` and `/tags/` get a purpose or `noindex`.

## R8 · Deploy — SMALL, your call
Nothing is pushed. `origin/modernize/netlify-build-2026` is still at `0b9c2ef`.
To see any of this on the live site: push the branch, then deploy the prebuilt
directory per `ci/run.sh` (`netlify deploy --dir=site/public
--functions=netlify/functions --prod`).

---

# Operating notes

- **Build command:** `hugo --source=site --destination=public --minify --gc
  --cleanDestinationDir` with Hugo 0.166.0 extended. Baseline: exit 0, 67 pages,
  455 images, no warnings.
- **The render loop:** headless Chrome (`--headless --disable-gpu
  --window-size=1440,3000 --screenshot=…`) then read the image back. Structure
  checks cannot see a page; every design defect found in the later sessions was
  found this way and none were found by reading the DOM.
- **Local previews:** `127.0.0.1:8140` serves the build, `127.0.0.1:8137` serves
  the design folder, and `127.0.0.1:8137/compare.html` puts them side by side.
- **Contract to preserve:** `#navToggle`, `#navMenu`, `.navbar-burger`,
  `.navbar-menu`, `.navbar-item`, `.site-header`, `.vehicle-grid#vehicle-inventory`
  with `data-total`/`data-page-size`, `#contact-form`, `#form-success`,
  `#form-error`, `#comparison-app`, `#comparison-tray`.
