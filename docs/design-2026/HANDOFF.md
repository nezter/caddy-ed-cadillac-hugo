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

---

## Inventory: mockup comparison and the two gaps it found

Compared `DELIVERY/caddyed-2026/mockups/inventory.html` against the built
`/inventory/` rail, feature by feature. Most of the mockup was already
matched -- the light browsing surface, the card rail treatment
(`.inv-rail .filter-accordion` already carries the tile border, radius and
shadow), the price ceiling, the chip row, the pagination footer, the compare
tray. Two things were genuinely missing, and both are now built:

| Mockup rail | Before | Now |
|---|---|---|
| Mileage ceiling slider | absent -- a note in the template said the script had no field for it | present, `max_mileage`, filters on the `data-mileage` every card already emits |
| "Saved shortlist" block | tray only, which does not exist until something is saved | in the rail, rendered by `shortlist.js` from the same store |

Deliberately NOT copied from the mockup:

- **Apply / Reset pair.** The mockup is a static demo with two dead buttons.
  The live form filters on change. Adding an "Apply" that does nothing would
  be a control that lies; "Clear filters" stays the only button.
- **The horizontal quick-filter strip.** Its facets (year, condition, body,
  price, sort) all exist already, in the rail and the toolbar, with more
  besides. Rebuilding them a third time would split one vocabulary across
  three places.

### Ceilings: the top of the range means "any"

The readout said "Up to $150,000" while standing at the maximum, which
describes a filter that is not applied. Both ceilings now read "Any price" /
"Any mileage" at the top, set `aria-valuetext` to match, and stop writing
themselves into the URL at that position.

Found while wiring the second ceiling: `writeUrl`'s multi-select branch did
not filter empty values, so every interaction wrote
`?model=&year=&drivetrain=&transmission=&status=` -- a query string that reads
like five filters are on and filters nothing. The "All models" option is
selected by default and its value is the empty string; setting
`el.multiple = true` on load preserves that selection.

### Verification

- jsdom sweep, 8 cases, semantic assertions (every visible card obeys the
  filter, the set is a strict subset, sort order is monotonic): 8/8.
- URL hygiene, pixel verdict: after a drag the query is exactly
  `?max_mileage=5000`; a ceiling returned to its top leaves it empty. Two
  independent methods, same answer.
- Real browser: mileage ceiling 24 -> 13 visible at 5,000 mi, readouts
  correct, rail shortlist follows a card click with the count and the tray.

Harness notes for the next session (three false failures, all mine):

1. jsdom reports `readyState === "loading"` at eval time, so the bundles
   register a `DOMContentLoaded` listener that a harness must dispatch by
   hand -- otherwise nothing is wired and every case fails.
2. A busy-wait after dispatch blocks jsdom's timers, so the 60ms readout
   paint never runs. Assertions need real `setTimeout` waits.
3. Counting `card.hidden` measures the DOM property, not the `hidden` class
   `apply()` toggles. Use the class, or `getComputedStyle`.

Also: Chrome and Edge both stopped writing screenshots partway through this
session (rc=0, no file, even for a data: URL). jsdom is the more reliable
harness here once the three notes above are respected.

---

## The comparison: what it shows, and the phone layout that lied

The compare feature worked and showed nothing but a flat table. Four changes,
all in `vehicleComparison.js` and `site/assets/css/inventory.scss`:

- **Rows where the cars differ are marked** (a dot on the specification name,
  plus a visually-hidden "(differs)" for assistive technology). A comparison
  that gives every row equal weight is a specification sheet with the answer
  buried in it.
- **Lowest price and lowest mileage are labelled as such.** The label names the
  measurement, not a recommendation: on a used car the cheaper one is not
  automatically the better one.
- **Each car links to its own page**, and the selection can be cleared at once,
  with a "Comparing n of 3" count above the table.
- **On a phone, one card per car.**

That last one was a defect, not a preference. The old `@media (max-width:40rem)`
block hid `thead` -- the row of car names -- and stacked each specification
with its values underneath. Two anonymous values under every heading, with
nothing on screen able to say which car was which. The comment above the block
described the right intention ("a grid of cars, not a grid of rows") and the CSS
did the opposite. The table cannot keep its header row at 320px, so the phone
gets per-car cards instead, rendered from the same data by the same function,
and CSS shows one or the other.

The stylesheet also carried `.comparison-tray` (17 rules and a comment
describing a tray that has no markup anywhere), `.comparison-header` and
`.comparison-row` (class names the script never emits), `.empty-comparison` and
three `.comparison-container` rules. All removed. `direct-2026.css` now has zero
`comparison-*` references; the feature is styled in one place.

### Harness note: a double-fired DOMContentLoaded

`ready()` looked like it never ran: clicks reached the document, the handler
resolved the right button, and nothing happened. The harness was dispatching
`DOMContentLoaded` by hand *and* letting jsdom fire its own, so `ready()` ran
twice, two click listeners were registered, and every compare click toggled on
and immediately off. Injecting the bundles as real `<script>` elements and
letting jsdom fire its own event fixed it -- 20/20 checks, including the fourth
car being refused with a message.

In a browser this cannot happen: one script element, one DOMContentLoaded.

---

## The home page: two defects a screenshot found, and the social panel

### The ceiling readout collapsed on the home page

Seven `.range-readout` rules were written as `.inv-rail .range-readout...`,
and the home page does not have a rail: its filter sits in `.fleet-filters`.
So the readout fell back to inline flow and printed "Any price
$10,000$150,000" on one line, with the mileage one just behind it. The rules
are now scoped to the readout classes themselves, which are used in exactly
one partial.

### The Details button was invisible on the home fleet

`body.home #fleet{background:#fff}` -- a light section -- and
`body.home #fleet .btn-outline{color:var(--ink-1)}`, near-black ink. The cards
inside it are the dark showroom plate, so the button rendered as an empty
pill. A card-level rule already existed but lost: the section rule carries an
id. The card now carries one too, and outranks it 10301 to 10201.

Shortlist and Compare were fine, which is the clue: they are `.btn-ghost`, and
no `#fleet` rule touches ghost buttons. Only the outline button disappeared.

### The social panel was empty by design and looked broken

`social-feed.js` hid its own explanatory prompt on load and put nothing in its
place, so the panel sat empty under the tabs. Three changes:

- **The panel always holds something.** For Facebook and X that is the offer to
  load the feed -- what it costs, a button that does it, and a link that leaves
  for the network without loading anything. A visitor can now see what the
  panel is and choose.
- **Tabs come from the configuration.** The X tab shipped with no X account
  behind it, so choosing it produced "No X account is configured for this site
  yet" -- a control that exists to announce it does not work. A tab is only
  rendered when its network has a url or handle. With one network configured
  there is no tablist at all; with none, the fallback links stand alone.
- **Instagram is supported.** It has no profile-timeline embed -- its own embed
  script renders a single post -- so its panel says that and links to the
  profile rather than pretending to load a feed.

The tablist also answers the arrow keys now, which is what `role="tablist"`
promises.

To light up X or Instagram: set `handle` (X) or `url` (Instagram) in
`site/data/social.yaml`. The tab appears on the next build; nothing else needs
touching.

Verified: 16 static and cascade checks (including the specificity arithmetic
above), then 15 behavioural checks in jsdom -- both tabs, panel swapping, the
roving tabindex, ArrowLeft/ArrowRight with wraparound, and the load button
replacing itself with the embed. All repo gates pass.

---

## The four mockup gaps: strip, tray, car page, booking

Four screenshots of the mockups came back as the review: the inventory
quick strip, the tray, the vehicle page, and the booking section. Each was a
place the build and the mockup had drifted. What follows is what was actually
missing and what changed.

### 1. The quick strip was missing entirely

The mockup puts six controls and a live count between the page head and the
cars; the build went straight to the rail. The strip now exists in
`site/layouts/section/inventory.html`, styled in `direct-2026.css`.

The important part is that its controls are MIRRORS, not duplicates.
`inventory-filter.js` resolves the in-form control first (`fieldEl`), so one
authoritative control per field had to stay one. A strip control writes the
rail's field of the same name and then runs the same apply()/writeUrl();
apply() refreshes every mirror from the authoritative field at its end. The
strip, the rail and the URL therefore cannot disagree. The price select
drives the same band state as the chips, built from the same `PRICE_BANDS`
array so the two cannot list different bands. The sort control moved into the
strip (same element, still bound by `form="inventory-filters"`).

Two deliberate deviations from the mockup:

- **No Body control.** 0 of 36 content files carry a body style and the
  dealer feed does not send one, so "Any body" would be a control that
  matches nothing -- the exact failure mode the rail already documents. The
  Drivetrain facet has the same shape and real data behind it.
- **The strip filters on change, like everything else on this page.** The
  mockup has Apply/Reset in the rail; the build filters live and keeps only
  Clear filters. A dead Apply is a control that lies.

### 2. The tray did not look like the mockup's tray

`shortlist.js` now renders the mockup's shape: mono "Shortlist · N" label,
one swatch per car (the card's own photograph -- already fetched, so no new
request), one ellipsised line of names, and the two controls the mockup
carries: "Compare side by side" and "Send shortlist to Ed". The compare
control scrolls to the comparison area and focuses its status line; it is
hidden where there is no comparison area (the home page). Per-car remove and
the tray's Clear are gone -- the rail carries both, and the mockup's tray
carries neither. `components/shortlist.css` lost the old chip/remove rules
and the red top border (now the mockup's bronze hairline).

On the compare side, the tools' "Clear all" became a `.btn` from the same
family as the tray's buttons, and its old underlined-link rule was deleted.

### 3. The vehicle page: badge, plate caption, rail

- **Badge** now carries the sync date ("New · synced 26 Sep"). The mockup
  says "arrived"; the feed has no arrival date, and the sync date is the same
  kind of fact in the site's own vocabulary ("In stock · synced ...").
- **Plate caption** over the main photograph: exterior over interior, and a
  drivetrain · engine chip. Rendered only from values the feed sent.
- **The rail** got the mockup's four-number micro-grid (Mileage, Drivetrain,
  Engine, Condition) and its four actions in the mockup's order and weight:
  "Ask about this {model}" is the red one, then Book / Value my trade against
  it / Estimate the payment, all ghost. The "Interested in this X?" heading
  and its paragraph went with it (the mockup has neither), and so did "See
  financing options" (the header keeps financing one click away). The phone
  line moved above the Ed note, as in the mockup.

### 4. The booking section was one stacked column

Now the mockup's two columns: the argument on the left (eyebrow, heading,
the "request, not a locked slot" line, and the 9-6 / Same day ribbon), the
form on the right in its own panel. The form's fields, names, ids and the
netlify function contract are untouched; only the note text changed to the
mockup's ("No obligation · no one else phones you").

### Found while verifying

`reset()` restored the platform defaults for the rail's selects -- which is
not enough, because those selects are upgraded to multi-selects at runtime
and a form reset is the one moment their default state matters. On some
engines the reset half-applies (value clears, selectedOptions does not), and
the ceiling readouts kept their pre-reset text because a form reset fires no
change event on the sliders. Both are now explicit in `reset()`.

### Verification

41 checks pass: 16 static on the built pages (badge text, mini-spec, plate
caption, CTA order, booking grid/ribbon, strip markup, count, sort location),
and 25 behavioural in jsdom -- strip→rail and rail→strip for year and
condition, URL writes, the band select driving the chips and the chips
driving the select, the shown-count, the slider readout across a drag and a
reset, the tray hidden/shown, label, swatches from the cards, names line,
both buttons, the compare control's new class. Four more on the home page:
tray appears, compare control hidden (no comparison area there), send intact,
swatch resolves.

Rendering the built pages in Chrome was not possible during this pass (the
browser stopped producing screenshots partway through the session and has not
recovered); the jsdom evidence above is what stands in. The strip and the
tray are the two places to look first when a browser is available again.

---

## The structured data was double-encoded on every page

The Car schema had been reported as `"name":"\"2026 CADILLAC XT5 Luxury\""`
and left diagnosed-but-unfixed last time, because `printf "%s"` coercion did
not change it and a patch per field looked wrong. The cause was not the
templates at all: it was Go `html/template` contextual escaping.

Inside `<script>`, `html/template` treats an unquoted insertion as
JavaScript and escapes the pipeline result for that context. `jsonify`
had already produced `"2026 CADILLAC XT5 Luxury"`, and the template then
escaped the quote characters it contained: `\"`. The block still parsed
as JSON, so nothing noticed -- but a search engine read a name beginning
with a quote character, on every vehicle page, in the most valuable
structured data the site has.

The about page was the tell: it hand-wrote its quotes (`"name": "{{ ... }}"`),
so only the content got escaped (look at its `https:\/\/`), and it was clean.
The vehicle and home pages inserted the encoder output bare, and got it
escaped twice. `partials/favourites-data.html` had already met this bug and
left the answer in a comment: `| safeJS`.

Fixed in four places and verified: `inventory/single.html` (all fifteen
jsonify sites plus a guard comment), `index.html` (five), `about/list.html`
(hand-quoted strings converted to the jsonify + safeJS form) and
`partials/connect-config.html` (the two `window.*` payloads). The vehicle
spot check now reads `"name":"2026 CADILLAC XT5 Luxury"`, `"sku":"NTZ106005"`.

And it is a gate now, not a memory: `ci/check-structured-data.js` walks every
built page, parses every ld+json block and every `window.*` payload, and
fails on a string value that begins with an escaped quote. It runs in
`ci/check-all.js` as the eleventh check. A re-introduction is a red gate
instead of a silent wrong.

---

## The count that said "0 vehicles", and the two rails that could not agree

Chasing the sidebar count wording turned up three defects stacked on one
number.

**The home rail read "0 vehicles".** `partials/inventory-filters.html` built
its facet lists and its count from `$page.RegularPages` -- the pages under the
caller. On /inventory/ that is the thirty-five cars; on the home page it is
nothing, because the home page is a section and the cars hang off another
one. So the home page's filter rail counted zero vehicles and offered no
model, year or drivetrain options at all -- an accordion that opened onto
empty selects, through every passing build. The partial now takes `fleet` (what
the facets are built from), `universe` (what the count reports) and `perPage`
(how many the caller shows) from its callers, and keeps its old behaviour when
none are passed.

**Facets that could only dead-end.** Built from all thirty-two Cadillacs, the
home rail listed eight models; the grid under it holds six cars. Choosing
most of the eight produced "0 shown" on a page with no next page behind it.
The home page now passes its six shown cars as the `fleet`: five model options
and four year options, and every one of them matches at least one car (a
verification loop clicks all of them). The count still reports the whole set
("32 vehicles · 6 shown"), so nothing pretends the six are the lot.

**Two surfaces, two sentences.** The rail count under the filters read
"13 vehicles of 24 on this page (35 in stock)" while the quick strip above the
grid read "35 vehicles · 13 shown" -- one fact, two readings, which reads
like two counts. Both are now written by one `summary` string in the script
and rendered server-side in the same shape ("35 vehicles · 24 shown", home:
"32 vehicles · 6 shown"), so they cannot drift in wording again. The home
sync note drops "showing ... in stock" for the mockup's "6 of 32 shown". The
home grid's `data-total` went from 6 to 32 so the script counts the same set
the server does. The now-unused `pageSize`/`paginated` variables are gone.

Verified: 11 count checks (initial/after-filter/reset on /inventory/, and on
the home page the nonzero count, facet options, the no-dead-end loop and the
reset), the previous 41 mock-gap checks and the 4 home-tray checks all still
pass, and the eleven-check suite is green.

---

## The card's three corners, and CADILLAC shouting in the titles

Two formatting passes, found while re-checking the card against the mockup.

**Corners.** The card puts three floating things on its photograph: the
status badge (top-left, .75rem in), Ed's pick badge (bottom-left) and the
favourite star the script injects (top-right). They were inset at three
different distances -- .75rem, .5rem, .5rem -- so no two of them agreed on
where the card edge was, and the star sat visibly closer to its corner than
the badge opposite it. All three are `var(--space-3)` now. The star also
grew to 44px below 48rem: it was the last control on a card under the tap
minimum.

**CADILLAC.** Every title read "2026 CADILLAC XT5 Luxury" -- the data
import's casing, rendered as-is on cards, headings, the tab title and the
structured data. The mockup writes "Cadillac". All thirty-two titles are
re-cased to "2026 Cadillac XT5 Luxury"; the make field stays "CADILLAC"
wherever it is data (card attributes, the compare table), so nothing that
compares or filters moved. Checked in the built output: the only remaining
`CADILLAC` strings on the inventory page are inside `data-make=` attributes
(21 of them), and the vehicle page heading, title tag and schema all read
"Cadillac".

Verified: 41 mock-gap checks, 11 count checks, 4 home-tray checks and the
eleven-check suite all pass; the built stylesheets carry the new inset and
tap values (the pick rule lives in `css/components/`, which a flat scan had
missed the first time).

---

## The merge: the shared strip, the mockup form, and the tool that was not there

A parallel agent pushed thirteen commits while this branch was working on the
card corners; the push was rejected and the merge came in clean (zero
conflicts). Those commits bring /admin/staff, /admin/gdpr, /admin/audit, the
mail settings page, a security pass over six unauthenticated endpoints, and a
SHARED bottom strip (compare-tray.js + pick-tray.css) so compare and shortlist
stop wanting the same corner of the screen.

The merge had one seam worth describing. Their strip carried the shortlist in
the old chip form, while this branch's tray had just been rebuilt to the
mockup's form (label, photo swatches, one line of names, "Compare side by
side" + "Send shortlist to Ed"). The strip's shortlist section now uses the
mockup's form -- the shared architecture stays, the styling is the one the
mockup review asked for. Their rail-vs-strip agreement test still passes; its
strip-side count now reads the section's own count element instead of chips.

Fixing that seam uncovered a crash the rebase had left behind: on any page
WITHOUT the shared strip (the home page), render() painted the mockup tray and
then called an older renderer that repainted the same element -- which threw on
the first toggle, before the button states and the filter rail were updated.
The old renderer is gone; the mockup rendering IS the standalone strip now.
A check asserts the label flips after a toggle, which is exactly the thing the
crash stopped happening.

One more gate fix: check-mail-config and check-gdpr-audit shelled out to the
`sqlite3` CLI to load the schema, and on a machine without it they reported a
missing tool as a broken schema. Both now load database/turso/schema.sql with
node:sqlite itself -- the same library the rest of each check already uses --
so the checks run anywhere Node runs.

Verified after integration: 42 mock-gap checks, 11 count checks, 5 home-tray
checks, ci/check-compare-shortlist at 52/52 (including the rail-and-strip
agreement assertions), and the fifteen-check suite: 11 pass, 4 skipped for the
missing database, none failed.

---

## Compare: the full journey, and the buttons that were lying

The question was whether the compare feature works. It does -- a thirty-one
check journey drives it against the built page: one car opens the strip
section and disables the master button ("Pick one more"), two fill a table
with both cars named and linked, three hit the limit and a fourth is refused
in words, a chip remove updates the table, Clear empties it and drops the URL
parameter, both layouts render (table and per-car cards), and a SHARED LINK
(?compare=a,b) opens with the table already filled and the card buttons
pressed. Unknown slugs are dropped and the limit holds.

Two real defects came out of asking.

**Dead Compare buttons.** The card's Compare toggle rendered on every page,
but only /inventory/ has a comparison area and its script. The home page had
six buttons that did nothing when clicked; every vehicle page had three. The
toggle is now opt-in (`compare` on the card partial, default false) and the
inventory grid opts in. On the vehicle pages the Shortlist toggle was dead
too -- that page never loaded shortlist.js -- so it now does, and a seven
check harness drives it (tick a related car, the tray opens, the label flips,
the Send link composes a real mailto with the car, its stock number and its
price).

**The Send link said Send and sent nothing.** On pages without the shared
strip (home, vehicle pages), deleting the old standalone renderer during the
merge integration took the mailto composition with it: the button rendered,
the tray opened, and the href stayed "#". The standalone path composes the
href itself now; home's harness asserts the href, not just the label.

A note for whoever runs the harnesses: comparing looked broken at first
because the harness dispatched DOMContentLoaded by hand WHILE jsdom fired its
own later -- every click ran toggle() twice and added and removed the same
car in one go. Letting jsdom fire once, as a browser does, was the fix. The
feature was never broken; the instrument was.

Verified: 31 compare + 7 detail-shortlist + 6 home-tray + 42 mock-gap + 11
count checks, ci/check-compare-shortlist at 52/52, and the fifteen-check suite
(11 pass, 4 skipped for the missing database, none failed).

---

## Compare on the home page, and the popup that did not appear

The report: compare is missing on home, and clicking it does not show the
same strip the shortlist shows. Both readings pointed at the same fact -- the
home page had Compare buttons with nothing behind them, and the last pass
had (correctly, at the time) removed the buttons instead of building the
thing they promised.

That was the wrong trade. A comparison area is cheap: three elements the
inventory page already renders, plus the two scripts it already loads. So:

- `partials/comparison-app.html` is now the one source for #comparison-app,
  #comparison-status and #comparison-table, rendered by the inventory page
  (through a matching shortcode, replacing the inline HTML that used to live
  in its content file) AND by the home fleet section.
- The home page loads compare-tray.js and vehicleComparison.js, and its cards
  render the Compare toggle again. Click a Compare on home: the SAME strip
  the shortlist uses slides up, with the compare section in it, and the table
  fills below the fleet. The URL carries the selection, so a home comparison
  is shareable the same way.
- The compare section's heading now reads "Compare · N" in the shortlist's
  label style, because the complaint was partly that it did not look like the
  shortlist's popup. It is one strip, two sections, one visual language.

Vehicle pages stay as they are: no comparison area there, so no Compare
buttons -- only the Shortlist toggle, which now works (shortlist.js loads on
those pages; see the previous section).

Verified: 16 home checks (area present, strip appears with the compare
section, label reads Compare · N, two cars fill the table, one strip
shows both sections, shared link, shortlist mailto, label flip), 31 inventory
compare checks, 7 detail-page checks, 42 mock-gap, 11 count, ci/check-
compare-shortlist 52/52, and the fifteen-check suite (11 pass, 4 skipped,
none failed).

---

## Compare opens now: the popup, and the styles that were never on this page

The ask: clicking Compare should OPEN the comparison -- popup or page -- and
"there was something built for this." Both true. The old site (see
origin/master, src/js/vehicle-comparison.js) navigated to a dedicated
/compare/?ids=... page; this branch's comparison had become a table at the
bottom of the page that the Compare button merely pointed at.

THE POPUP

- `partials/comparison-app.html` gains `<dialog id="comparison-dialog">` -- in
  the markup, not built by script, so it exists with its Close control before
  anything runs.
- The strip's "Compare N" button dispatches `caddy:open-compare`;
  vehicleComparison.js shows the dialog (native `showModal`, with an
  attribute fallback). It renders the SAME markup into the dialog on every
  render -- one render pass, two places it can be seen -- so the popup cannot
  disagree with the inline table. It closes on the button, on a backdrop
  click, and when the last car leaves the comparison. Escape is the native
  dialog's job.
- The inline table stays where it was; the popup is a way TO the comparison,
  and both pages' journeys assert both.

THE STYLES THAT WERE NEVER THERE

Building this exposed that the home page never loaded inventory.scss, and the
comparison styles lived there: home rendered the table markup with none of
its styles. The whole comparison block moved to components/comparison.css,
and both pages load it (plus pick-tray.css on home, which it was also
missing -- the strip's section layout). The dialog's styles live in the same
file.

THE REPO GATE

ci/check-compare-shortlist.js counts `thead th` across the whole document; the
dialog renders the same table a second time (on purpose), so those counts are
scoped to #comparison-table now, and four assertions cover the popup: it
exists, Compare opens it, it carries the same cars, Close closes it. 56/56.

Verified: 36 inventory compare + 19 home + 42 mock-gap + 11 count + 7
detail-page checks; suite 15 green (4 skipped for the missing database).

---

## The popup, centred -- and why it was not

"Just centre the popup, and when more cars get added stay centred but expand
both ways." The first half had a cause worth writing down: `main.css` has
`* { margin: 0; }`, and a native dialog's centring IS `margin: auto`. The
universal reset was winning, so the popup sat wherever the reset left it.
The dialog now says it out loud -- `position: fixed; inset: 0; margin: auto`
-- fixed to the viewport, inset all round, centred however tall the page is.

The second half is width that follows the car count. vehicleComparison.js
publishes `data-cars` on the dialog on every render, and comparison.css sizes
it in tiers: one car ~34rem, two ~50rem, three ~66rem, each capped at the
viewport. Because the centring is margin-based, every change grows or shrinks
BOTH sides by the same amount -- the popup stays in the middle and spreads
outward to fit. A 180ms width transition makes the change read as growth
rather than a jump; prefers-reduced-motion turns that off. Below 40rem the
width goes full-bleed and the per-car cards take over, as before.

Verified: 38 inventory compare checks (including count-published, reopen at
the third car"s wider size), 20 home, 42 mock-gap, 11 count, 7 detail-page,
ci/check-compare-shortlist 56/56, suite green.

---

## The compare rows had no styles at all, and the titles were lowercase

"The bottom bar's compare car list isn't clean like the shortlist -- missing
images and text not formatted correctly." Two causes, both traceable.

**No styles.** The compare section renders `.shortlist__item`,
`.shortlist__name` and `.shortlist__remove` -- classes that were styled for
the OLD shortlist bar. When the shortlist moved to the mockup's swatch form
those rules were deleted with the old markup, and the compare section kept
rendering the same classes into nothing: browser-default text and a raw
default button for the remove. The rows now have their styles in
pick-tray.css, in the shortlist's own visual language: the car's own
photograph (54x36, already fetched by the card -- no new request), the name
with the stock number in muted mono, a circular remove that grows to 44px on
small screens, and stale rows dimmed.

**Lowercase titles.** The compare feature was displaying `data-title` -- the
attribute the filter's matching needs lowercased -- so the table headers,
the popup and the strip all read "2026 cadillac xt5 luxury". readCards() now
takes the displayed title from the card's own heading and leaves data-title
alone, so the same feature reads "2026 Cadillac XT5 Luxury" everywhere.

Verified: 40 inventory compare checks (including the two new ones: rows carry
their photograph; the row reads in the card's own case), 20 home, 42
mock-gap, 11 count, 7 detail-page, ci/check-compare-shortlist 56/56, suite
green.

---

## "Compare side by side" now actually compares

The strip's shortlist button pointed at the comparison area (scrollIntoView)
-- but the comparison is usually EMPTY at that moment: the shopper
shortlisted two cars, never ticked Compare. So the button scrolled to
nothing and looked broken. Reported exactly that way.

Now it does what it says: the shortlisted cars move into the comparison
(each through the comparison's own rules -- no duplicates, max 3, the same
spoken refusal) and the popup opens with them. If nothing can be shown it
falls back to pointing at the comparison area, so the button still leads
somewhere honest.

Shape: one new seam -- window.CaddyVehicleComparison = { add, open }.
addToCompare() is now shared by the card's Compare button, the strip's rows
and this button (one place the state changes); openDialog() is shared by the
popup's own event listener and the button. The shortlist is NOT emptied in
the move -- shortlist and comparison are two lists, says the mockup, and
stays that way.

Verified: 44 inventory checks (new K block: button offered; shortlist becomes
the comparison, count=2; popup open with both cars; card buttons agree), 20
home, 42 mock-gap, 11 count, 7 detail-page, ci/check-compare-shortlist 56/56,
suite green.

---

## Every button audited; four broken interactions repaired

Asked to check that every button on the site does what it says. Two audits:
buttons-static.js (all 72 pages, 387 buttons: names, types, aria references,
hash targets, internal links) and buttons-live.js (boots 13 pages in jsdom
with their own scripts, clicks every class of button, 76 assertions).

Broken, now fixed:

1. Mobile menu, all 70 pages. index.js still carried a legacy [navbar-burger]
   click handler alongside chrome.js's. Both toggled the same is-active class,
   so one tap opened the menu and instantly re-closed it: the menu appeared
   only on the SECOND tap, aria-expanded read the opposite of the visible
   state, and the x icon followed the aria value. Removed the legacy block.
2. Financing pre-approval "Done" button. The success panel replaces the
   modal body, and close handlers were bound to buttons existing at open
   time, so Done did nothing. One delegated close listener on the modal now;
   the top x also gained type=button + aria-label.
3. Scheduling calendar month arrows (/test-drive/). Bound to the first
   render's buttons; the header is re-created on every re-render, which
   happens immediately when availability answers. Delegated now.
4. "Request this appointment" (/test-drive/). Posted to /api/appointments --
   no redirect, no function, guaranteed 404 -- and `new AppointmentScheduler()`
   existed NOWHERE, so even the change listeners never ran; the time select
   shipped with only its placeholder. The class is instantiated now, times
   9am-6pm are populated (mirroring the booking forms), and submit maps to
   schedule-test-drive ('general-enquiry'), with validation, busy state and a
   status line (#appointment-status added to test-drive.md).
5. a11y: the social panel referenced a tab that only exists when more than
   one network is configured; single-network now renders role=region.

Verified: buttons-live 76/76, buttons-static 0 issues, suite green, compare
44/44, home 20/20, mock-gaps 42/42, counts 11/11, detail 7/7.

Noted, not changed: /lead-form popup markup is unwired (nothing opens it, so
the close button is never visible); connect.js's stock hub is dormant on the
rebuilt home (no #stockList container); 6 customer-portal buttons lack `type`
but sit outside forms; customer/admin interactions verified statically only
(they need a live database/API).

---

## Captcha gates, every form recorded, and a two-way calendar

Three asks: gate the forms, get everything into the admin inquiries, and
make the calendar sync both ways.

GATES. New netlify/functions/utils/bot-gate.js, applied to contact-form,
lead-form, lead-management, schedule-test-drive and pre-approval: honeypot
('website', left blank by people, filled by bots), minimum fill time (hidden
_t stamped at load), and reCAPTCHA when RECAPTCHA_SECRET_KEY is set -- the
option is wired, it needs only the key. Every public form carries the hidden
fields. The Netlify form (stock-alerts) uses Netlify's own reCAPTCHA
(data-netlify-recaptcha, their historical site key; Netlify holds the
secret) with the token passed through connect.js, and the CSP now allows
Google's recaptcha endpoints. leadCapture.js used to FILTER OUT the honeypot
before sending, so the server check could never fire; it sends it now.

HONEST FAILURES. contact-form.js and lead-form.js were the only two
endpoints that did not check inquiry's fatal flag: with no database they
answered 'thank you' while recording nothing. Both return 503 now, like the
other five. The lead-form page had TWO handlers on one form (forms.js and
leadCapture.js) -- two POSTs, two records, one visitor. forms.js now
excludes .lead-capture-form; verified exactly one submission.

INQUIRIES. The stock-alerts Netlify form previously existed only in
Netlify's dashboard; a new submission-created event function records it
into the same leads table /admin reads. Everything else already recorded;
that was verified for real rather than by reading: a local SQLite copy of
the schema (database/turso/schema.sql) runs the functions end-to-end, and
the four suite checks that were ALWAYS SKIPPED for lack of Turso (write
behaviour, insert columns, select columns, inquiry path) now RUN -- and
pass, alongside the whole 15-check suite.

CALENDAR. Push now carries timeZone America/New_York with wall-clock
times (it previously emitted UTC instants, so an event built on a UTC box
showed at the wrong hour in Ed's calendar). New POST {action:'pull'}: reads
every tracked event back from Google -- moves are written to the record
(movedOnCalendar + new date/time), cancellations and deletions become
cancelled-on-calendar / removed-on-calendar -- and /admin/bookings gets a
'Pull from calendar' button beside 'Push all to calendar', enabled once
the calendar is connected.

Verified: full suite 15/15 (no skips) with a local database; form/DB matrix
18/18 (every endpoint's row in leads/booking_requests + gates leave no
rows); calendar pull/push 14/14; button harnesses 78/78 + 0 static issues.

---

## Captcha is now fully Netlify-side on the Netlify form

Per the Netlify docs (manage/forms/spam-filters): the stock-alerts form now
uses Netlify's PROVIDED reCAPTCHA 2 -- an empty
<div data-netlify-recaptcha="true"></div>; Netlify renders the widget at
publish time and validates the response server-side. No Google keys of ours
are involved. It also carries Netlify's own honeypot
(netlify-honeypot="website"), and connect.js includes that field in the
AJAX body, which the docs require for AJAX submissions. The earlier
custom-sitekey setup was removed: Netlify only validates CUSTOM reCAPTCHA
when SITE_RECAPTCHA_KEY / SITE_RECAPTCHA_SECRET are configured on the site,
so the provided challenge is the correct Netlify-based choice.

The function-backed forms cannot use Netlify's captcha -- they do not pass
through Netlify's form pipeline -- so they keep exactly our existing
mechanism: the honeypot (the same "website" field the lead form always
had) plus a minimum-fill-time stamp, with Google verification dormant
unless RECAPTCHA_SECRET_KEY is set.

Verified: suite 15/15 with the live local database; buttons-live 78/78
(honeypot in the AJAX body; alert form fully Netlify-gated); buttons-static
0 issues; built markup confirmed; the old custom sitekey no longer appears
anywhere in the repository.

---

## Form failures now say what actually happened (and cannot fake success)

User tested the contact form on a preview of the branch and saw "An
unexpected error occurred. Please try again." -- the legacy catch text,
which means no JSON ever came back from /.netlify/functions/contact-form.

Diagnosed with live probes: production caddyed.com still serves the OLD
site; the newest Netlify deploy preview predates today's commits (its
functions DO answer -- probed, 403 method-check JSON); the k3s static
preview serves no functions at all, by design (nginx answers /.netlify/*
with a truthful stub, or 404s depending on config vintage). Forms can only
work where the functions run: a Netlify deploy, a deploy preview, or
netlify dev.

Four handlers tightened so every environment explains itself and none can
lie:

1. index.js (contact / service / trade-in / comm-preferences): unreachable
   service -> "We could not reach the form service from this page... call
   803-431-6180"; non-success shows message -> string error (a preview
   stub's own words) -> actionable fallback; never "undefined".
2. connect.js quick-ask: only an explicit success:true is a success; a
   preview stub can no longer produce a thank-you for a message never sent.
3. leadCapture.js: same strictness, and a plain-string error is surfaced.
4. financingCalculator pre-approval: a 2xx that does not say received:true
   never reaches the success panel.

Verified: buttons 82/82 (new C6/C7/H16/F11 guard checks), gate-smoke 13/13,
form/DB matrix 18/18, full suite 15/15.

To test forms end-to-end: use a Netlify deploy preview (ci/run.sh deploy
includes functions) or netlify dev. For a preview to RECORD, the Netlify
site needs TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (with database/turso/
schema.sql applied) and SMTP_* + EMAIL_TO for notifications; without the
database the new code answers honestly instead of pretending.

---

## The inventory sidebar: five real defects, fixed and verified

User screenshot of /inventory/: "the side bar is badly organized". It was
right -- five separate defects, all now fixed:

1. THE PRICE CHIPS RENDERED AS BARE TEXT. Root cause: a cascade leak.
   direct-2026.css loads last and carried an UNSCOPED .chip rule for the
   home page's connection-dock pills (white-on-ink styling: border
   rgba(255,255,255,.16) is invisible on white, and the on-ink colour reads
   as grey). It silently overrode inventory.scss's pill styling. Scoped to
   body.home; proven with a computed-style probe (the chip now computes from
   inventory.scss + the rail rules: no mono, no uppercase, min-height 32px).
2. THE BANDS WERE UNLABELLED AND RAGGED. "Under $40k" sat alone, a hole in
   the first row, floating under the mileage slider with no heading. Now a
   "Price" label + a two-column grid of equal pills (90px cells, measured).
3. THE SHORTLIST SHOWED A RAW SLUG. A saved car not in the current view
   rendered "2027-cadillac-vistiq-sport" -- a URL in a saved list reads as
   breakage. prettySlug() now says "2027 Cadillac VISTIQ Sport" (textarea
   keeps the not-in-view treatment and the remove control).
4. THE STICKY RAIL PAINTED OVER THE CTA BAND. At the page bottom the full
   width "Not seeing it?" band scrolled under the pinned filter rail and its
   left half was hidden -- the heading vanished, the copy read as cut-off
   mid-word. The page used ONE grid for everything; the two columns now live
   in their own wrapper (.inv-columns), so the sticky rail's extent ends
   before the band -- the standard sticky-sidebar structure, correct under
   either sticky-clamp behaviour.
5. RHYTHM. Shortlist card spacing/padding aligned with the filters card;
   the gap between the two cards tightened.

Verified: buttons 85/85 (with three new seeded-storage checks: a saved
off-view car reads as a name, stock suffixes stay out of the name, the
not-in-view row keeps its remove control); static sweep 0 issues; compare
44/44; home 20/20; mock-gaps 42/42; counts 11/11; detail 7/7; full suite
15/15. Screenshots are unavailable on this box (headless capture has been
broken all project -- documented), so the pixel check happens on the next
preview build.

---

## Follow-up: the wrapper fix crushed the RESULTS column

User screenshot after the sidebar fix: the left rail was right, but the
center (results) column was squeezed to nothing -- chips stacked vertically
in a sliver. Root cause: direct-2026.css contains TWO @media(min-width:64rem)
blocks that set .inventory-page .container's columns. The sidebar fix updated
the first one to one column and moved the 290px rail split onto .inv-columns,
but an OLDER, LATER block (the 'ratio proportions' pass from an earlier stage,
written before the wrapper existed) still declared
  .inventory-page .container{grid-template-columns:290px minmax(0,1fr)}
Same specificity, later position -- it won the cascade. The columns wrapper
then became the FIRST child of a two-column grid, was placed in the 290px
first column, and its own internal 290px column left ~0px for the results.

Fix: the late declaration now also says minmax(0,1fr) with the same rationale
comment. Conflict eliminated -- both container rules agree, so order cannot
flip the outcome; verified in the built bundle (0 stale 290px container rules).

Lesson for this file: it is append-grown, so an edit near the top can lose to
a later duplicate of the same selector. When changing a shared selector, scan
the WHOLE file for repeat declarations, not just the matching line.

---

## The reshoot landed: Ed's 2026 portrait

The plan on file was "a single reshoot replaces the flash-lit snapshot"
(IMAGERY.md sec 1.2 -- raised fists, beige wall, red object clipping the
frame). The 2026 sitting is that reshoot: three studio-grade frames built
from Ed's own photograph (image-to-image, face fidelity enforced at zoom
level, forehead retouched), reviewed and chosen by the owner.

Shipped:
- `site/assets/img/caddy-ed.jpg` -- the armchair portrait, 1326x896, full
  colour. Replaces the snapshot on the home page and the About hero; both
  ladders widened to 1326 so retina screens get real pixels.
- `site/assets/img/ed-at-table.jpg` -- companion frame on the About story
  section (the empty second column of `.split--wide`).
- `site/static/img/contact-hero.jpg` -- the contact page's og:image, which
  until now pointed at a file that did not exist (broken social card).
- The interim bronze grade (.duo / .ed-portrait::before) retired with the
  snapshot; plate scrims keep the caption legible.

---

## The header, gone through properly

Owner: the top bar needed TLC -- hover, click, every screen size. The pass
found one real defect hiding in plain sight: below 64rem the menu panel only
ever showed the phone button. `.navbar-start` is display:none until desktop
and nothing re-showed it inside the opened panel, so mobile navigation led
nowhere. Fixed, plus a full interaction pass:

- Every control carries hover / focus-visible / active / current states. Nav
  links get a red underline that grows in (scaleX transition); the sticky
  header deepens; the phone CTA lifts on hover and settles on press; the
  burger takes hover/press/focus states; utility links transition. The old
  light `--bg-subtle` hover flash on the dark header is suppressed.
- Mobile panel: all seven links as 48px touch rows, current page flagged with
  a red rail, phone CTA full width, dropdown entrance animation (reduced-
  motion aware), max-height + scroll for short viewports, safe-area padding,
  outside-click close (new in chrome.js, alongside Escape / link / resize).
- Deleted `assets/js/navbar.js` and its import: it toggled .sticky /
  .header-hidden (classes with no CSS rules) on scroll and queried
  .nav-toggle/.nav-menu markup that no longer exists.

Verified: 17/17 nav state-machine checks in jsdom (open, outside-click,
Escape, link close; 7 links + CTA present), bundle/CSS assertions on the
built output, buttons-live 85/85, mock-gaps 42/42, buttons-static 0 issues.
