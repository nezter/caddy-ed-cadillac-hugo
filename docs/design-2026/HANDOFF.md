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

---

## The wordmark, gilded

Owner: the top bar still needed a wow pass and the logo lacked luster. The
wordmark was flat currentColor text on a dark bar. Now:

- `logo.svg` is bronze metal -- a four-stop gold/bronze gradient with an
  offset dark copy underneath for an engraved emboss. Same geometry, same
  title/aria. Used by both the header and the footer (both dark), so both
  gained the material in one move; the fingerprint changes the URL so no
  cached flat version can hang around.
- On hover the wordmark catches a skewed light sweep (600ms, once) and a warm
  drop-shadow glow rises; reduced-motion users get the glow but no sweep.
- The header now wears the same bronze hairline as the footer's top edge,
  and the utility-bar separator dots pick up the bronze.

Verified: built logo carries gradient + emboss under a fresh fingerprint;
built CSS carries keyframes/hairline/glow; nav state machine 17/17;
buttons-live 85/85; mock-gaps 42/42; buttons-static 0 issues.

---

## Correction: the nav pass had clipped the theme layer

Owner caught it from the contact page: the form had lost its styling. Root
cause was the nav commit: the CSS replacement anchored on "/* --- header"
and direct-2026.css has TWO such sections (the legacy theme layer's header
spacing block and the shell layer's restyle block). Replacing from the first
one swallowed 321 lines -- the whole .field / .field--light form layer, .btn
and .plate hover polish, .ribbon labels, .feed, .dock, and more -- before it
reached the intended block.

Restored exactly from e27204c (the commit before the damage; the first
restore attempt was redone because piping git show through PowerShell
mangled the comments' em-dashes -- use node execSync with utf8 instead).
Line-level diff after the fix: the only missing old lines are the 9 header
rules the new block intentionally supersedes. Contact form computed styles
resolve again (label #515863, input #fff / border #dde0e6); built CSS
carries the field layer; nav state machine 17/17; buttons-live 85/85;
mock-gaps 42/42; buttons-static 0 issues.

Lesson for this file: section replaces must anchor on a marker that exists
ONLY once -- grep the file for the marker first and assert the match count
before replacing.

---

## The social feed becomes cache-based

Owner: make the Facebook / Instagram / X feed better, less disruptive,
cached, refreshed daily only. Done by removing the last third party from the
feature entirely:

- `netlify/functions/social-feed.js` (new): GET, always 200, JSON. The
  Cache-Control header is the daily gate -- `s-maxage=86400` plus
  stale-while-revalidate -- so the CDN serves one copy a day and visitors
  never trigger a platform call. Backed by one cache row in the site's Turso
  DB via `utils/social-cache.js` (24h TTL; refreshes lazily when stale, and
  proactively from the scheduled `social-refresh.js`). Platform tokens are
  optional (FACEBOOK_PAGE_TOKEN / X_BEARER_TOKEN+X_USERNAME /
  INSTAGRAM_ACCESS_TOKEN); without them the cache stays empty and the panels
  keep their follow cards. Every failure path returns the last good copy --
  refresh or no refresh, the panel cannot break.
- `assets/js/social-feed.js` (rewritten): panels server-render a follow card
  -- no empty box, no widget button; one fetch of the site's own endpoint
  swaps to text-only post cards when the cache has posts. No third-party
  code loads at any point; the Facebook page-plugin iframe and the Twitter
  widgets bundle are gone, and with them the last two third-party origins
  (removed from the CSP in netlify.toml AND ci/nginx.preview.conf). Cards
  are deliberately text-only: platform CDN images would buy back an external
  origin and weigh more than they add; the card links out instead.
- `connect.js`: the duplicate tab handler and dead widget mounters deleted;
  `socialEndpoint` now points at the cached function.

Verified: function smoke 7/7 (no-DB, file-DB via shim, seeded read,
stale-served), frontend jsdom 12/12 (offline keeps follow cards; posts swap
in; zero third-party tags), built output audited clean of all third-party
social references; buttons-live 85/85; mock-gaps 42/42; buttons-static 0;
nav state machine 17/17. To populate for real: set the platform tokens in
Netlify env and configure x/instagram in data/social.yaml -- the tabs appear
when a network is configured, by design.

---

## The social connections get an admin home

Owner: make the social feeds easy to set up, test and configure in the admin.
New page /admin/social (nav: Social Feed) built on the settings-page pattern:

- One card per network (Facebook / X / Instagram): connected state, token
  state (set here vs environment; never echoed back), cached post count and
  last refresh -- plus the URL/handle and token inputs, a per-network **Test
  connection** (live one-shot fetch with the platform's real answer) and
  **Refresh cache now**. Save writes to a new `social_config` table;
  environment variables remain the fallback.
- `netlify/functions/social-admin.js`: authenticated admin API (reads need
  preferences_read, writes need preferences_write). Unknown keys are refused,
  every response is no-store, invalid JSON 400s, unknown actions 422.
- The public endpoint now reports each network's configured state, and the
  home panel hides tabs for unconnected networks -- so connecting an account
  in the admin makes its tab appear on the site with NO rebuild. A lone
  remaining network drops the tablist (one pill is not a choice).
- `ci/check-social-admin.js` (13 checks, registered in check-all): auth,
  vocabulary, unknown keys, 503-without-database, no-store, no token echo.

One incident worth recording: the credential-redaction filter that guards
tool content rewrote the literal parameter name / auth scheme forms in
utils/social-cache.js (KEY value, '=' + quoted value, 'Bearer ' in a quoted
string), producing one broken copy and one silently-wrong shipped copy. The
module now assembles those strings from parts, and
`tmp/caddyed-live/social-redaction-check.js` mocks fetch and asserts the real
URL and header bytes (10/10). Anything touching platform auth headers here
should keep that pattern and that check.

Verified: admin API 13/13; cache v2 + redaction runtime 10/10 + 7/7; frontend
jsdom 19/19 (offline keeps follow cards; posts swap in; unconnected tabs
hide; a newly connected tab appears); built output zero third-party refs;
permissions vocabulary OK; buttons-live 85/85; mock-gaps 42/42; static 0;
nav 17/17.

---

## The inventory scrape gets the full list -- politely

Recon: the old fixed-three-pages crawl could only see page one of each
family. The site paginates by offset (24/page) and publishes the next
offset in its own JSON-LD relatedLink -- New alone reads 157 vehicles.
Shipped (scripts/inventory): crawl.js family-aware pagination (follows the
site's own ?start= links, batches of 4, 30 s pause between batches, 3 s
floor + jitter, per-URL conditionals with the next-pointer persisted, loop
guard (the last page points BACK to start=120 -- caught), 12-page/30
request guards, completion-aware cache merge, state-dir override for
tests); structured.js nextPageFrom(); index.js family-aware parsing.

Verified: mock-dealer suite 23/23 (batch pauses measured, transient and
persistent 429, 304 walk, merge semantics). Real dry-run + real sync:
169 records (157+8+4) across 10 paced requests, no rate limiting, 137 new
vehicle pages, 0 failures. Build-caught defect fixed: unresolved remote
image URLs no longer reach front matter (images.js apply() drops them,
content.js refuses them, favourites-data.html ignores them); 172/173
pages have mirrored photos; the rest arrive on later daily runs (60/run).

---

## The admin portal, completed: organized, linked, and editable to the records

Owner ask: make the admin manage the front of the site -- inventory
management, feature promotion, content -- all linked and working, well
organized. Recon found 18 admin pages, a hub that did not exist (a bare
'Admins' heading on the default list template), a flat nav missing three
pages, the follow-up page's known defect (nothing constructed its
components), and a settings page whose keys mostly matched no element.

Shipped, in three commits:
1. The front door: /admin/ hub (20 cards over four groups) + grouped nav on
   every page, both rendered from one source (partials/admin-sections.html)
   so they cannot disagree; ci/check-admin-portal.js asserts every page is
   named exactly once and every route resolves. The follow-up components
   mount themselves and components/admin-tabs.js does the switching
   (aria-controls is where the button-to-panel mapping lived; the first cut
   toggled buttons but not panels and the jsdom check caught it).
2. /admin/inventory: every vehicle record editable -- pricing, specs,
   description, hold off / put back -- plus inline Ed's-pick promotion.
   Saves queue in vehicle_edits; scripts/inventory/edits.js applies them at
   sync time or via --apply-edits (no crawl). The queue survives syncs (an
   overridden field cannot be clobbered by a feed refresh) and marks rows
   applied with a read-time snapshot so mid-run edits stay pending. Identity
   fields stay read-only; blanking a field reverts to the feed.
3. Content wiring + gates: site_settings keys rebuilt around elements that
   actually exist (seed text corrected to the built copy, dead keys removed),
   hero + stay-connected + footer tagline wired; ci/verify-endpoints.js now
   passes completely for the first time (real dispositions for the social,
   settings, staff, gdpr, mail and audit functions; platform-invoked
   functions -- scheduled exports.config and event functions -- no longer
   fail the alias check they can never satisfy; social-feed's endpoint
   literal moved where the gate can see it).

Proven, not assumed: jsdom drives of the built follow-up page (9/9) and the
built inventory editor (16/16: rows, chips, editor values, save payload,
star, filters); the queue->file loop end to end against a throwaway DB
(21/21: apply, dry-run, idempotence, re-edit, revert, release, restore
description); plus the standing battery and every ci check green.

To use it after the next deploy: sign in, /admin/ has one card per job.
Record edits need TURSO_* wherever the sync runs and apply at the next
sync + deploy; the Ed's-pick star is live on the next page load.

---

## Articles, the agent API, and the SEO engine

Owner ask: every front-end aspect managed from the panel; a place where
articles can be GENERATED and POSTED, reachable by an LLM agent through an
endpoint API (or MCP); SEO scoring per page; internal linking between
articles and pages; on-page local/conquest signals for South Charlotte.

Articles (new at all -- the post templates had never been fed):
- Queue pipeline identical to vehicle edits: /admin/articles (or the API)
  -> article_drafts -> `npm run articles:apply` writes
  site/content/articles/<slug>.md -> deploy publishes. Hand-written files
  are never touched; drafts apply as draft: true.
- The editor carries an insert-link panel over the fixed pages, every
  article and the newest vehicles -- internal linking as a click.
- Public side: /articles/ index + article template with Article JSON-LD,
  guided back-links (inventory / trade-in / contact) and related reading.
  Starter article written only from facts the site already states.
- docs/CONTENT-API.md is the agent contract: auth, every field with
  limits, examples, the saved-vs-published reply semantics, and suggested
  MCP tool shapes.

SEO (new): one pure scorer (netlify/functions/utils/seo-score.js) behind
both /admin/seo and /.netlify/functions/seo-score: title/description
lengths, single H1, heading structure, canonical, Open Graph, alt
coverage, internal links, JSON-LD validity, expected schema per section,
and -- labelled as the on-page half of local intent, not a ranking
promise -- the service area named in the main content (header/footer
stripped so chrome cannot fake it). AutoDealer JSON-LD on the home and
about pages gained areaServed (Charlotte, Pineville).

Also fixed: robots.txt never shipped its real content -- site/static's
file lost to Hugo's generated default in every build, so Sitemap: and
Disallow /admin/ were absent. Now a layouts/robots.txt template; the
static file is gone.

Verified: check-articles-admin 24/24; queue->file loop 17/17 against a
throwaway DB; jsdom editor 12/12; scorer fixtures 19/19; jsdom SEO page
10/10; build checks; portal 10/10; permissions and endpoint gates green.

---

## Agent identities: scoped keys, managed from the portal

Owner ask: how does an agent reach the AI/API surface, and where is the
identity management so agent access can be controlled. The honest state
before this: agents borrowed a staff member's session token -- no
separate identity, no scoping, no independent revocation, and the audit
trail could not tell agent from person.

Now: /admin/agents manages first-class agent keys.
- utils/agent-keys.js: `cdy1_` + 32 random bytes; SHA-256 hash + display
  prefix in the `agent_keys` table; secret returned exactly once. Scopes
  validated against the staff permission vocabulary; agents_* scopes are
  never grantable (no self-propagation). resolve() fails closed: unknown,
  revoked, expired and no-database are distinct answers; last_used_at is
  stamped (throttled).
- utils/auth-middleware.js: an agent-key branch runs BEFORE Identity and
  JWT (a key is neither, and must not need JWT_SECRET). Scopes enforce
  exactly like staff permissions; allowedRoles endpoints (human roles)
  refuse agents by design -- documented.
- agents-admin.js: list/create/revoke behind agents_read/agents_write;
  the create reply is the only place a secret exists outside the agent's
  hands; agent.create/agent.revoke are audited.

Verified end to end against a real sqlite database and the REAL
middleware: create -> authenticate as agent -> scope refusal -> unknown
key 401 -> revoke -> instant 401; the stored row is a hash, not the
secret; no-database fails closed (13/13). API check 29/29 (crypto,
vocabulary, refusals, one-shot secret). jsdom of the page 9/9. Portal,
permissions and endpoint gates green.

---

## Agent access: full content reach, everything else walled

Owner ask: agents should reach ALL the site's content, with proper gates,
controls and workflows so they cannot break things.

- Grantable scopes are now CONTENT-ONLY by construction (articles,
  inventory, settings copy, Ed's picks, SEO). CRM and destructive
  permissions cannot be granted to a key at all -- 'an agent erased a
  customer' is not reachable by configuration.
- The one remaining human-role content endpoint (vehicle-features POST)
  now accepts keys carrying inventory_write; a narrower key gets a 403
  naming the missing scope (insufficient_scope). gdpr / staff-management /
  lead-merge stay admin/human-role gated -- proven in the guard matrix.
- Settings (preferences_write) were already key-compatible; the guard
  matrix now proves the whole reachable surface: 14/14 against the REAL
  middleware + a real database (settings gate open/closed by scope,
  admin-role endpoints refused, picks written only with the right scope,
  picks untouched without it, no-token 401, slug validation intact).
- check-function-auth.js gained the two missing public-by-design
  declarations from the social arc (social-feed, social-refresh) with
  their reasons written down; the check is green again instead of
  grandfathered.
- docs/CONTENT-API.md now carries the guard-rails table: scopes, human-only
  endpoints, no-direct-mutation, audited live writes, revocation, no
  escalation.

---

## The content machine: three types, one implementation

Owner ask: fix the gaps identified (specials and testimonials had no
admin/API), and make sure the repo is clean, well organised and properly
laid out.

Specials and testimonials now ride the SAME machine as articles -- and the
machine was generalised instead of copied:
- utils/content-types.js: one definition per type (table, marker, fields
  with kinds and limits, permissions, audit action, apply command).
- utils/content-queue.js: one queue implementation; articles/specials/
  testimonials are thin instances (the articles file kept its export
  surface, so every existing caller and test kept working).
- utils/content-admin.js: one handler factory; the three endpoints are
  five lines of wiring each, and the GET reply carries the type's field
  spec so the admin editor and an agent build from the same definition.
- scripts/content/apply.js: one applier, --type articles|specials|
  testimonials; npm run articles:apply kept, specials:apply and
  testimonials:apply added; scripts/articles/ removed.
- One admin client (admin-content.js) drives all three pages; one CSS
  file; one data partial. The articles-only copies were deleted.
- agent keys gained specials_* and testimonials_* scopes (content-only,
  as before). Gates extended honestly: check-permissions resolves the
  factory's def.permissions reference from content-types; check-function-
  auth accepts the delegated guard; both were proven, not excused.

Public: /specials/ now renders offers (list + single with expiry and
terms), /testimonials/ is new (featured-first quotes), both linked from
the footer; the CMS blog collection was pointed at the real articles
folder with the caveat written down.

Repo hygiene pass: no strays (two scratch files from earlier turns found
and removed: check-runs.js, art-apply-test.js -- both were already gone
from the tree), deleted superseded files fully unreferenced (grep-
verified), scripts/ now organised by domain (content/, inventory/), and
the standing gates all green: check-articles-admin 24/24, check-content-
admin 21/21, check-agents-admin 41/41, agent e2e 13/13 + guard matrix
14/14, jsdom three-type drive 25/25, apply loops 17/17 + 17/17, portal,
permissions, function-auth, front-end and endpoint gates green.

---

## Repo hygiene pass (inventory -> cleanup)

Full-repo inventory first (Netlify surface, lost/unwired, dedup), then the
approved cleanup:
- Archived 11 one-shot migration/repair scripts to scripts/archive/ (with a
  README stating what was left behind and why). Verified still-live scripts
  that LOOK one-shot were kept: pg2turso.py (ci/run.sh calls it),
  import-netlify-forms.js (npm script + docs), seed/setup/test tooling.
- Removed dead assets after reference checks: root sw.js (a stale twin of
  site/static/sw.js that nothing loaded), partials/meta.html (superseded by
  head-meta.html), the six retired critical/*.css plus their generator
  (archived), two orphaned .wasm files, jest.config.simple.js.
- 3 stale webpack chunks removed earlier (94 present, 91 referenced by the
  committed cms.js).
- documentation/ merged into docs/ with provenance banners; junk ignored:
  netlify/functions/test-results/, junit.xml, chunk license files untracked
  + gitignored; verify-build comment and FRONTEND.md updated; critical-css.md
  carries a RETIRED note.
- Verified after: build clean, all CI gates green (portal, permissions,
  function-auth, front-end, endpoints, verify-build, content-admin,
  articles-admin, agents-admin, seo-score, structured-data).

---

## Netlify compliance pass (Sep-2026 feature audit)

Full audit of the platform surface against September-2026 Netlify, then the
real gaps closed:
- CSP tightened to the origins the site ACTUALLY uses, in all three copies
  (netlify.toml, nginx.preview, security-middleware). Gone: unpkg, Google
  Fonts, cdnjs/jsdelivr, Supabase. Fixed while there: identity.netlify.com
  added to CONNECT-src (the widget talks to the Identity API by XHR -- the
  old policy could have blocked its own CMS login), www.google.com added for
  reCAPTCHA XHRs. Stale comment replaced with the verified facts.
- NEW ci/check-netlify-config.js: publish/command/functions keys, one Node
  pin across four files, preview contexts carry markers, every redirect
  target resolves, HSTS/nosniff/CSP present, the TWO CSP copies must be
  identical after normalisation, no stale origin may reappear in any copy,
  no legacy _headers/_redirects, articles feed configured + advertised.
- Articles RSS: /articles/index.xml (deliberately the editorial feed, not a
  site feed that would list 170+ vehicle pages), discovery link in head,
  subscribe chip on the articles page.
- docs/NETLIFY-FOUNDATIONS.md refreshed: current primitive table + a
  deliberate-non-uses matrix (Image CDN, Edge Functions, Netlify DB,
  Identity-for-staff, Build Plugins, remote builds, Analytics) each with
  its reason. Blobs-store caveat kept as an owed dashboard check.

Verified: build clean; 12 CI gates green incl. the new netlify config
17/17; jsdom content editors 25/25; counts and button batteries green.

---

## Launch plumbing: the production workflow could never have run

Waiting on the Netlify token surfaced two faults in deploy.yml, both
fixed before the first real dispatch could hit them:
1. It downloaded a `site-public` artifact from ci-cd.yml, but
   actions/download-artifact reads the CURRENT run's artifacts and this
   workflow has no build job -- the launch would have died on step one.
   It now builds inline on the runner, identical in shape to deploy-dev.
2. workflow_dispatch only works when the file exists on the DEFAULT
   branch, and the default branch was `master` (the stale February tree).
   deploy.yml was invisible to GitHub. Default branch corrected to
   modernize/netlify-build-2026.
Also found while writing it: the file-write pipeline rewrote a GitHub
expression to three stars in the new workflow (YAML then failed to
parse). Repaired byte-level; ci/check-netlify-config.js now parses both
workflows for real, forbids three-star mangling, asserts prod-only
--prod, the confirmation gate, and that only the production workflow
declares the production environment.

---

## Recovered: the pipeline that used to work, and why it stopped

Traced through git history at the owner's prompting. The Sep-28 commit
52d88e8 records the whole story: the deploy that first worked ran where
the Netlify token lived -- `~/.config/netlify/config.json` on the CI
host -- and the repo was linked there. The live site still carries that
era's content, WITHOUT functions (docs/MISSING.md documented all 47
functions 404ing).

The pipeline then DISABLED ITSELF: the deploy preflight (d0536e8) checks
`$HOME/.netlify/config.json` and the env var -- but NOT the XDG path
where the token actually sits. From that day on, `./ci/run.sh deploy` on
the host refused with 'no credentials' while holding valid ones.
Fixed: the preflight now accepts every location the CLI itself accepts.

And the GitHub workflows no longer demand a SECOND copy of the token:
they resolve credentials as repo secret first, else the netlify CLI
login ON the runner host (the runner IS that host), mounting it read-
only into the build container's root home. The fallback is asserted by
ci/check-netlify-config.js so it cannot be dropped silently.

---

## Double-verify sweep: two more silent breakages, fixed and gated

Prompted by the owner: if the pipeline faults were missed, what ELSE is
quietly wrong? Swept four failure classes across the whole platform surface.

FOUND + FIXED:
1. Header rules combine, they do not override. Netlify staff (answers.-
   netlify.com): 'any custom headers that match for a path combine instead
   of cancelling out.' /img/* carried a DUPLICATED generic rule plus an
   `immutable` rule for hashed derivatives -- so a hashed image collected
   BOTH conflicting Cache-Control values. Fixed: one rule for /img/* (a
   day + stale-while-revalidate); the /*.avif //*.webp globals removed too
   (every avif/webp lives under /img or /vehicles; the globals only ever
   doubled up). ci/check-netlify-config now fails on duplicate rules and on
   any two Cache-Control rules whose static prefixes can overlap.
2. Preview contexts covered 6 env markers but the functions read 50 vars.
   Added 30 sensitive markers (SMTP_*, GOOGLE_*, social tokens, reCAPTCHA,
   CRM_*, Supabase family, Redis/Upstash, INVENTORY_SOURCE_*) to both
   preview contexts and to dev; the gate asserts the list stays present.

VERIFIED CLEAN (no action):
3. Case-sensitivity scan across ~400 built pages: no reference differs in
   case from the file on disk (a Windows-only bug class CI would catch on
   Linux, now also pre-empted locally).
4. External origins in built HTML: exactly two, both accounted for
   (identity.netlify.com for the CMS/login; a facebook.com anchor href on
   the home page -- navigation, not a resource, CSP-irrelevant).
5. Redirect order: narrowest first (/admin/cms before /admin/*), correct
   under Netlify's first-match rule.

Still the same one blocker, unchanged: no Netlify credential reachable
from this machine or the runner (probed every path), and no SSH. The
pipeline is gated, probed and waiting for exactly one of: the repo secret,
the config restored at ~/.config/netlify/ for the runner user, or an SSH
key so this box can drive the CI host directly.

---

## LAUNCHED -- 2026-10-10, production runs the modernized build

The owner supplied a Netlify personal access token. With it, and with the
CI runner found OFFLINE (actions/runners: cicd-runners status offline -- a
dispatch queued and was cancelled), production was deployed directly from
this workstation with netlify-cli 27.12.0:

- deploy `6aca9c157b9a6174cad27118` (context production): 2195 files + 57
  functions -- the first launch of the modernized site.
- deploy `6aca9d4bdb59370cce64e754`: the health-check fix below (1 function).

The token is also sealed (libsodium, tweetsodium) into repo secrets
`NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID`, so `deploy.yml`'s credential gate
passes on the runner the moment the host comes back; nothing needs a token
file on any host anymore.

Verified live from outside: /, /inventory/, /articles/, /articles/index.xml,
/specials/, /testimonials/ -> 200; /admin/ -> 302 /admin/sign-in/; CSP +
HSTS present; sitemap 218 URLs; a vehicle detail page 200; functions
answering; Turso connected (vehicle-features source:"database"; /health
database connected, 192ms); Blobs id env present. Site env already had
TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET, SITE_RECAPTCHA_KEY/SECRET,
NETLIFY_BLOBS_SITE_ID (names observed through the API; values never read).

### health-check.js fix (rode in deploy 6aca9d4bdb...)
- The netlify.toml rewrite /health -> health-check forwards the ORIGINAL
  request path, so the old strip was a no-op and the router fell to its 404
  branch. Paths are now normalized for both shapes.
- Basic health probed the legacy enhanced/Postgres/Supabase layer, whose
  "none" verdict made /health report status:"unhealthy" while every real
  endpoint was reading Turso fine. probeDatabase() runs SELECT 1 through
  utils/database-service (the layer the site uses); a missing Redis no
  longer flags the site, only a configured cache in trouble can.
  Live now: {"status":"healthy","database":{"status":"connected","type":"turso"}}.

### Deploying from here on
- Runner online: dispatch deploy.yml (confirm="deploy"); secret is in place.
- Runner offline: build (scripts/build-for-netlify.js env recipe) and run
  `netlify deploy --prod --site <id> --auth <token> --dir <built-dir>`
  `--functions netlify/functions` from any workstation.

---

## Live verification sweep -- 2026-10-10 (all green, nothing broken)

Full post-launch audit against the live site, done from outside:

- Crawl: all 221 targets (218 sitemap + extras). Zero broken pages or links;
  the only non-200s are the 24 admin URLs answering 302 to sign-in (correct --
  the gate working). Every page carries a title and an H1.
- Assets: every referenced CSS/JS/font on 13 representative pages, plus a
  11-image sample -- all 200.
- Functions: all 57 probed with GET. Zero 5xx. Everything private answers
  401/403/405 exactly as designed; /health reports healthy (Turso connected
  192ms); social-feed and site-settings answer 200.
- Forms, live writes (marked ZZ VERIFY TEST -- see cleanup note below):
  /api/contact -> lead 0baf2abe; /api/lead -> lead 650c7763;
  schedule-test-drive -> booking 20261014-1000; pre-approval -> received
  (no lender integration, by design); stock-alerts is a Netlify Form:
  registered, reCAPTCHA enforced (control: nonexistent form 404 vs
  captcha-less submit 400), widget + CSP wired.
- Browser click-through (real Chrome, live site): nav, quick-filter chips
  (click -> URL + counts + FILTER ON badge), condition dropdown sync, search
  box (q=escalade -> narrowed), card -> detail navigation, favourites star
  (empty->filled), and a full lead-form submission: filled the real form,
  client validation cleared on input, submit -> "Thank you - your details
  have been sent" confirmation. One lead created from the browser flow.

Known limitations confirmed (by design, documented in the layouts):
- Inventory filters/search narrow the CURRENT page of 24 (bounded DOM,
  crawler-friendly pagination); per-facet pages are the noted follow-up.
- Availability calendar needs Google Calendar creds; booking requests
  still flow (fixed 9-6 time choices).
- Email notifications report notified:false, no-provider -- leads land in
  the CRM; set SMTP via /admin/email to turn on mail.

Test rows to delete when convenient: 3 leads, 1 booking (14 Oct 10:00),
1 pre-approval -- all under caddyed-verify@example.com / phone 803-555-0100.

---

## Admin sign-in repaired -- 2026-10-10 (three stacked faults)

Owner: "how do we fix the admin login". Answer turned out to be three
independent faults, each sufficient to break it alone:

1. **/admin/sign-in/ was a blank page for everyone.** admin-guard's OPEN
   branch returned `redirect(path, 200)` -- status 200 WITH a Location
   header. Browsers ignore Location on 2xx; they render the empty body. A
   crawl only sees "200", so this hid behind every status-code check ever
   run at the URL. Fixed: OPEN paths now 302 through /.__admin/ -- the same
   hop the authenticated branch uses, which netlify.toml rewrites to the
   static file and does not guard.
2. **The session cookie was never set.** staff-session.js stores the token in
   localStorage and sends it as a header -- fine for every fetch an admin
   page makes, useless for the navigation itself. admin-guard reads the
   Authorization header or the `auth_token` cookie; nothing set the cookie
   (sales-logout had always expired one). Fixed: sales-login now sets
   `auth_token` (HttpOnly, SameSite=Lax, Secure on https, Max-Age matched
   to JWT_EXPIRES_IN).
3. **No staff account existed.** `sales_reps` held only a dev-era row
   (`ab@c.co`, role `sales_representative`). Every credential attempt was
   correct to fail. Two admin accounts were provisioned (owner + Ed) via a
   temporary, key-guarded bootstrap function -- deploy 6acb0b46 -- which was
   then REMOVED in deploy 6acb0c76 and verified 404. Passwords were handed
   to the owner out-of-band and are not recorded here.

Verified live after the fixes: login -> 200 + Set-Cookie; /admin/ with the
cookie -> 302 -> /.__admin/ -> 200 (hub renders); without -> 302 sign-in;
/admin/sign-in/ renders 13.7KB with its form in a real browser; auth check
passes via header AND cookie AND x-auth-token; sales-leads (authed) -> 200.
Checkers back to green: 35 guarded / 22 public-by-design.

Loose ends: there is no password-change UI (resets go through a small
scripted step); the `ab@c.co` row is left as-is; the Netlify Identity
button on the sign-in page remains an alternative path.

---

## Admin follow-ups -- 2026-10-12 (sign-in copy fix + owner password reset)

- The sign-in page carried a dangling fragment at its end:
  "`/admin/*` password protection or a build-time split of the admin section -
  neither of which this page can do by itself." -- the tail of an editing
  accident (most of that note had been turned into an HTML comment; two
  rendered lines were left behind), and the note itself predated admin-guard.
  The fragment is removed and the source now carries a short, accurate comment
  (Hugo's minifier strips source comments from output). Verified live.
- nportello21@gmail.com password reset at the owner's request, via the same
  key-guarded one-shot pattern (deploy 6acc70e1; removed in 6acc714b and
  verified 404). Post-change verification: login -> session -> gate -> hub.
  The password itself is deliberately NOT recorded here; it was delivered to
  the owner directly. Ed's account was left untouched.
- Netlify Identity is enabled (/.netlify/identity/settings -> 200) and the
  widget loads on demand from identity-sign-in.js; users are invited from the
  Netlify dashboard, exactly as the page's copy says.
- Open offers: a staff change-password screen; forgot-password (needs SMTP
  first, same missing piece as lead notifications); Netlify /admin/* password
  protection as defence in depth.

---

## Admin menu + leads pipeline -- 2026-10-12 (overnight repair round)

Owner asked: (1) the admin section menu must not be visible before sign-in,
(2) it belongs at the top of the page, (3) clicking every admin page link
must populate, not empty out or error. All three are done and verified.

MENU
- Both admin layouts render the section menu at the very top now (above the
  page title), and it ships with the `hidden` attribute. New admin-nav.js
  verifies the stored session against sales-auth-check and only then removes
  hidden; no session -> no menu, including /admin/sign-in/ -- a stranger
  cannot enumerate the portal from the front door.
- .admin-nav[hidden] { display:none } added because the author `display:flex`
  would otherwise beat the UA's [hidden] rule.
- ci/check-admin-portal.js gained four gates (nav ships hidden on dashboard
  and sign-in; reveal script wired; nav above the title). 15/15 locally;
  reveal behaviour jsdom-verified 3/3. Deploy 6acc736a.

LEADS PIPELINE (the "nothing populates or errors out" sweep)
- Authenticated sweep of all 25 admin routes: every page passes the gate and
  renders. The function probes found four real faults, all fixed:
  1. /lead-assignments/analytics answered 500: leads.assignment_score and
     leads.assignment_reason existed in NO SQL file while six code paths
     referenced them. Columns added to production (one-shot, removed same
     night) and recorded in database/turso/003_missing_columns.sql.
  2. DatabaseService.updateLead and .getLead DID NOT EXIST AT ALL, though
     six callers used them (assign, rebalance, scoring, rules, interaction
     outcomes, auto-assign) -- the assignment page's Assign button 500'd.
     Both implemented in database-service.js (allowlist, undefined/Date
     guards, and a status alias for the one value the schema CHECK forbids).
  3. The unassigned panel listed assigned leads: it shares
     getLeadsNeedingReassignment() with rebalance, which deliberately also
     includes week-old leads and reps without capacity. The PANEL now
     filters to genuinely unassigned rows; rebalance keeps the broad view.
  4. New form enquiries would have orphaned forever: inquiry.js (all four
     form paths) now auto-assigns on record, exactly like leads.js always
     did.
- Rebalance then assigned every waiting lead: 19/19, 0 errors -- fifteen are
  REAL historical enquiries (2020-2025 imports) that had never reached a
  dashboard. A fresh form submission auto-assigned in production afterwards.
- sales-metrics returns live numbers now (dashboard renders newLeads /
  appointments / sales / conversionRate); revenue stays an honest 0 -- no
  sales-value model exists. The stale ab@c.co test row was deactivated via
  /admin/staff before rebalancing so nothing lands on it.

INCIDENT, STATED PLAINLY: one intermediate deploy carried a broken
database-service.js (a tooling artifact mangled the new code mid-write; the
local syntax gate caught it, but the deploy had been chained off the failed
script without a guard). Healed within ~15 minutes (deploy 6acc7778) and the
estate re-verified healthy. Guard added: a failing edit script now aborts the
deploy step.

---

## Sign-in page: the signed-in view transform -- 2026-10-12 (later)

Owner, after signing in live: "it should hide all the sign-in options, showing
user profile information and the main admin menu."

- staff-sign-in.js: when a session exists (on load OR right after submitting),
  every offer to sign in disappears -- both cards, their headings, all the
  explanatory notes (the nine sibling blocks of the component root are hidden
  inline, and the restore list brings them back on sign-out). The profile
  panel then shows the person with their email and role plus its existing
  buttons (dashboard, leads, sign out). The section menu is revealed at the
  same moment and hidden again when the session ends.
- The stuck "Checking for an existing session..." line on the signed-out path
  is cleared now; it used to sit there until someone submitted.
- Inline display is used for hiding rather than the hidden attribute: some of
  these blocks carry a stylesheet display, and an author display beats
  [hidden] (the section menu had exactly that bug hours earlier).
- Gated: ci/check-admin-portal keeps a profile-panel contract check (16/16),
  and a three-state jsdom test against the built page proves all three
  states. Deploy 6acc7d98.

Caveat for the record: the final keystrokes of a live sign-in could not be
driven through the side-panel browser (its input tool does not reach fields
below ~928px), so the transform is proven by the jsdom states plus the live
markup/bundle rather than by an in-panel Enter press.

---

## Sign-in, third pass -- 2026-10-12 midday (owner still stuck live)

Owner: "still nothing" on /.__admin/sign-in/?next=%2Fadmin. Server-side was
re-proven healthy (login 200 + Set-Cookie; gate releases with the cookie;
/admin no-slash also releases fine). Two client-side gaps remained:

1. The Netlify Identity path never carried the gate. The widget session lives
   in localStorage under auth_token, but admin-guard reads the COOKIE or an
   Authorization header on navigations -- so an identity sign-in navigated to
   /admin/ and bounced straight back here, forever. identity-sign-in.js now
   mirrors the widget token into an `auth_token` cookie (non-HttpOnly on
   purpose: the widget token is localStorage-reachable anyway), with Max-Age
   from the token exp; clearSession() removes it on both sign-out routes.
   admin-guard already verifies identity tokens via JWKS, so no server change
   was needed.
2. The page now leads with the WORK-EMAIL form ("Sign in with your work
   email") and the Identity card sits below it, because the working dealer
   path should be the first thing on the page. Copy adjusted accordingly.

Re-verified after the change: build + 16/16 portal gates + the four-state
jsdom run (signed-out / signed-in-on-load / SUBMIT -> navigation fired /
sign-out restores). Deploy 6acc86b4.

Unresolved from here: which path the owner actually clicks and what their
browser shows. Asked for exactly: hard refresh, work-email form, and the
exact text of any red message. Offered to drive their side-panel browser.

---

## Admin UX feedback + perf pass -- 2026-10-12 afternoon

Owner: admin pages feel clunky, not intuitive, hard to navigate; certain
content loads slowly. A full redesign session is wanted later.

- Wrote docs/design-2026/ADMIN-UX-REVIEW.md: the critique, the measured
  audit (24 pages / 25 endpoints), today's fixes, and a scoped plan for the
  redesign session (navigation, page templates, forms, states, speed
  budget, mobile, consistency) + process (walkthrough -> wireframes -> waves).
- Fixed the two pages that stacked cold starts serially: followup-campaigns
  (3 waves -> 1) and interactions (types+timeline -> 1). Dashboard, leads,
  inventory, bookings, customers were already parallel.
- Nothing visual/structural changed, deliberately: that belongs to the
  design session the owner wants.

---

## Operator console foundation in the real admin -- 2026-10-13

Owner picked Direction A and said start building it into the live admin.
Foundation round shipped to production (deploy 6ace4db5c6bd8918276c579e):

- New shell on every admin page: dark operator chrome (sidebar with the
  navigation regrouped Today / Customers / Cars / Marketing / Admin; topbar
  with search, a New quick menu, the staff chip, sign-out; toast layer;
  keyboard shortcuts, press ? for the panel).
- The site header/footer are suppressed on admin pages via layout block
  overrides. Gotcha recorded: Hugo prunes EMPTY template defines (including
  comment-only ones), so the override needs a real node; each define holds
  an HTML comment.
- admin-operator.css loads LAST through the layout's scripts block so it
  wins collisions with the older component stylesheets; admin-shell.js is
  the new behaviors file. The theme is scoped to body.admin and .op-* with
  its own --op-* tokens; the public site is untouched (verified live).
- The sign-in transform, nav reveal-until-session and the admin gate all
  verified working under the new shell (jsdom, zero errors); ci: portal
  16/16, content 21, inventory 24, articles 24, agents 41, seo 19 green.
- Preview channel now mirrors the whole built site (the three-directions
  artifact stays archived in DELIVERY/caddyed-2026/admin-redesign).
- Next rounds (owner-driven): worklist dashboard, leads board view,
  Reports/Calendar/Scheduling wired to real data, per-page polish.

---

## /admin/sync built -- the inventory sync reports itself (2026-10-14)

Owner asked for a better sync surface: where a run is in its progress,
and how many vehicles were found, already there, updated, new, retired.

- New shared module netlify/functions/utils/sync-runs.js + the
  inventory_sync_runs table (created lazily; 006 records it in the repo).
  scripts/inventory/index.js now records every full sync: phases
  (reading/images/planning/writing/done), the five counts, and detail
  chips (photos mirrored, record edits applied, duplicates, skipped).
  Failed runs record their error. Fail-soft: no database in the sync
  process just means one info line and no record; the sync is unaffected.
- New function inventory-sync-status.js (GET, inventory_read) and the
  page /admin/sync/ in the Operator styling: current run with a phase
  stepper, the five count tiles, a live progress bar, and the last 15
  runs in a table. Polls fast (4s) while a run is live, slowly (30s)
  otherwise. Read-only on purpose: a sync starts where the feed and the
  working tree are (npm run inventory:sync).
- BUG FIXED IN PASSING: sync-state.js keys vehicles by __key, and
  index.js never set it -- so the state diff and the sold-by-absence
  detection had silently been no-ops since introduction (the committed
  state file held zero vehicles). __key is now assigned at normalise
  time; the first sync after this populates the state, and subsequent
  runs become genuinely incremental. The counts this page shows depend
  on that fix, which is why it rides in this round.
- Verified: shimmed local dry runs wrote correct failed + done rows;
  jsdom render tests (running/done/dry/empty/503/401) with zero errors;
  portal 16/16, function-auth 36 guarded / 22 public, netlify-config
  35/35, verify-endpoints green (feature-manifest entry added), build
  verified. Deployed 6acf143f (ready): /admin/sync/ 302s to sign-in,
  the function 401s unauthenticated, assets 200.

---

## Admin sidebar render fix + preview channel repack (2026-10-14)

Owner reported the left menu was messed up and pages would not load.
Both parts were real, in different places:

- SIDEBAR (live admin): main.css and components/admin.css still carry
  .admin-nav rules written for the OLD horizontal menu (flex row, pill-
  bordered links, inline-flex groups, group dividers). Admin pages load
  different combinations of those sheets, so the operator rail rendered
  differently page to page. Fixed by scoping the rail's styles as
  body.admin .op-side .admin-nav* with full property resets, so no
  legacy sheet can reshape it. Deploy 6acf1eca (ready/published).
- PREVIEW CHANNEL (the 'pages do not load' half): the preview URL was
  still serving the FIRST upload (design directions) because every path
  falls back to index.html and the full-site updates never landed --
  the artifact was about 86MB raw / about 114MB base64 while this
  channel caps the upload body at 50MB base64 (fc-nginx-website).
  Fix: the preview copy now carries downscaled vehicle photography
  (sharp; variants to 480w, originals to 720w; filenames unchanged so
  no reference changes): 86MB to 27.5MB, base64 about 36.6MB, single
  retrigger submitted. Live/production keeps full quality -- the slim
  tree exists only under projects/<id>.
- Verified this round: all 26 admin pages load with zero script errors
  against their real built bundles (jsdom); a sample vehicle page's 25
  image references all resolve in the slim tree; portal checks 16/16;
  build verification green.

---

## Accordion menu, Calendar, and the token-read fix (2026-10-14)

Owner report: menu still wrong (no accordion, no indentation), the
calendar view missing, pages not loading, data not looking real.

- ROOT CAUSE for 'half the pages do not load': twelve admin scripts
  (admin-agents/audit/content/email/gdpr/inventory/seo/settings/social/
  staff, bookings-admin, favourites-admin) read their session token from
  localStorage key caddyed_admin_token, and NOTHING in the codebase has
  ever written that key -- sign-in writes auth_token. Every fetch from
  those pages went out with no Authorization and 401'd even for a
  signed-in user: empty lists, error banners, broken-looking loading.
  All twelve now read auth_token first, keeping caddyed_admin_token as
  a fallback for older stored sessions. Verified with a fetch spy.
- The sidebar is a real accordion: one group open at a time, the current
  page's group opens itself, the open group is remembered across pages,
  and sub-items are indented under their group label behind a rail.
  Links stay in the DOM, so the static checks and no-JS readers still
  see every page.
- NEW /admin/calendar/ (Today group): month grid with per-day counts
  (enquiries vs booking requests), click-a-day detail, month stats,
  prev/next/today/refresh. Backed by new calendar-data.js (view_leads;
  leads by created_at, booking_requests by preferred_date).
- Data truth: the ZZ VERIFY TEST records are gone from the LIVE
  database -- 5 test leads, their interactions rows, 1 test booking,
  and the auto-created test customer, byte-verified before deletion.
  15 real leads remain; dashboards and the calendar show only real
  records now.
- Verified: jsdom accordion (exclusive open, current group, links) and
  calendar (31 cells, badges, day detail, month nav, 0 errors); portal
  16/16; function-auth 37 guarded; endpoints green; build verified.
  Deploy 6acf2375 published. Preview mirror refreshed at 27.6MB (under
  the channel's 50MB base64 cap; vehicle photos intentionally
  downscaled in the preview copy only).
- Still queued: deeper per-page content polish, Reports + Scheduling
  pages, and whichever pages the owner still finds thin on the live
  console.

---

## Admin commentary diet (2026-10-14)

Owner: the pages carried a ton of inline commentary instead of content.

- All 27 admin pages dieted: ledes, help footnotes, prose-only sections
  and design-explainer notes removed or compressed to short functional
  lines. Visible prose across the section: about 4,450 -> 625 words.
- Every functional container (forms and ids the page scripts hook into)
  verified intact via a marker-diff guard and per-page checks.
- WARNING for future scripts: the diet's broad paragraph-stripping rule
  initially matched plain-text runs that INCLUDED the YAML front matter
  of 24 pages and deleted it. The build caught it; all files restored
  from git and the set re-verified (27/27 have front matter). Never run
  paragraph-stripping regexes across content md without a front-matter
  guard and a marker diff.
- Hub intro trimmed; CMS hub card shortened. Remaining copy is labels
  and notes that prevent mistakes (e.g. 'leave blank to keep saved').
- Verified: build PASSED, portal 16/16, ten cleaned pages jsdom with 0
  errors, containers present on all 27. Deploy 6acf260f published;
  preview mirror refreshed at 27.6MB.

---

## Admin landing dashboard + Worklist repair (2026-10-14, second round)

Owner: the landing was just a list of pages; the worklist was stuck on
failed/spinning; content styling missing; information not right.

- /admin/ is now a console landing: stat tiles (new leads, appointments,
  pipeline, conversion), a 14-day activity chart (enquiries vs bookings,
  stacked), latest enquiries, upcoming test drives and a shop-status card
  (booking queue + last sync). Each card fails alone; a session failure
  raises one banner. The sections grid stays below as 'All sections'.
- THE WORKLIST had three stacked bugs, all fixed:
  1. salesDashboard.js read leads/appointments from the TOP LEVEL, but
     both endpoints answer in the {success,data} envelope, so
     renderLeadsList(undefined) threw 'Failed to load dashboard data.'
  2. hideLoading() removed '.dashboard-loader' while the initial markup
     is '.dashboard-loading': the first spinner never left the page.
  3. Admins/managers were scoped to their own id; the owner owns none of
     the leads, so their dashboard was empty. Admin/manager with no
     salesId now means the whole shop (sales-leads, sales-appointments;
     sales-metrics already worked this way). The dashboard stops sending
     salesId for admins.
- New 'All time' timeframe (dashboard filter + both endpoints): the whole
  pipeline here is historical (2021-2025 imports, all assigned to Ed), so
  week/month windows are empty until new enquiries arrive. All time shows
  the 15 real leads.
- Operator compat CSS now styles the legacy component classes
  (settings-*, crm-*, dashboard-*, lead-*, metric cards, tabs, status
  pills) so page bodies render consistently on the dark console.
- RESTORED: the work-email sign-in form. The commentary diet had removed
  the {{< staff-sign-in >}} shortcode section on sign-in.md (a section
  with no literal markup). ci/check-admin-portal caught it. LESSON: diet
  rules must treat shortcode invocations as functional content.
- Verified: portal 16/16; build PASSED; jsdom hub (tiles/bars/lists,
  0 errors); jsdom dashboard (lead renders, loader is removed, admin
  sends no salesId); live: all-time leads = 15, metrics shop-wide = 15,
  sign-in restored, /admin/ gated. Deploys 6acf7858 + 6acf78dd (both
  published). Preview refreshed at 27.7MB.

---

## Dark-theme flip for the legacy light components (2026-10-14, third round)

Owner sent screenshots: analytics, scoring, assignment and the dashboard
filters still rendered as light panels (white cards, washed text) on the
dark console.

ROOT CAUSE: those components were written against the public site's LIGHT
tokens (--surface: #fff, --text: grey-900...) or hardcoded light colors
entirely. The console's dark theme never overrode them.

- Token remap: under body.admin, the light tokens are re-pointed at
  console values (--surface #14161a, --text #e7e9ee, --border rgba white
  .08...). Because body.admin is closer to the elements than :root, this
  flips every var-based component (lead scoring, lead assignment, most of
  admin.css incl. the dashboard filter bar) with no per-rule work.
- Hardcoded-light components patched with scoped overrides: follow-up
  analytics (its own prefers-color-scheme dark block existed but never
  fired, now enforced unconditionally), the campaign manager, and the
  communication-preferences widget (scoped to admin; the public copy
  stays light). The oversized blue metric circles are re-styled to small
  accent-soft icons.
- Verified: build PASSED, portal 16/16, the flip present in the built
  operator stylesheet (analytics override + var remap both in-file).
  Deploy 6acf7c25 published. Preview refreshed.

NOTE on verification limits: layout was verified structurally and via
computed cascade reasoning + jsdom; this box cannot take screenshots, so
the final visual pass is the owner's browser.

---

## /admin/sync: Sync now + full run lineage (2026-10-14, fourth round)

Owner: "There is no sync button or historical lineage of last syncs,
what happened to each one, what changed -- that should all be reported
and stored."

- Sync now button (inventory-sync-trigger.js, inventory_write) queues a
  request row: status requested, requested_by, requested_at. Duplicate
  presses answer already-queued. Optional SYNC_TRIGGER_WEBHOOK wake-up.
- The next live run of scripts/inventory/index.js adopts the queued row
  (claimRequest, atomic UPDATE guarded on status) and becomes it, so one
  row is the whole lineage request -> phases -> changes -> outcome. A
  claimed request lifts the crawl window for that run: a person deciding
  now outranks the polite-polling window.
- Runs now record: phase timeline with times, runner (host/user),
  timings, and change lists -- added, updated (with changed fields),
  retired (with reason), capped at 300 items.
- Storage: trigger/requested_by/requested_at columns (lazy ALTERs in
  sync-runs.js; mirrored in database/turso/007_sync_runs_lineage.sql).
  ?run=<id> on inventory-sync-status returns one run full; list rows slim.
- Page: queued card + Queued pill, per-row Details expansion, running >
  queued > last-run priority.

Verified: sqlite round-trip (request->claim->finish->get, upgrade path
from an old table), script dry-run recorded phases + change lists in a
real row, jsdom harness ALL PASS, checks 38 guarded / 16/16 portal /
35/35 config, build PASSED. Deploy 6acfb1fb published; prod probes 401/
302 as expected; preview refreshed.

Reality: runs execute where the repo lives (this machine / CI). The
production crawl window is 01:00-05:00; queued requests run outside it.

---

## Sync limits, stated where the button is (2026-10-14, fifth round)

Owner: "There is a limitation on sync -- there should be feedback based
on those rules, so they know."

- netlify/functions/utils/sync-rules.js is the ONE home of the limits
  (24h interval, 01:00-05:00 window). scripts/inventory/crawl.js takes
  its DEFAULTS from it now, and inventory-sync-status.js ships it in the
  GET payload, so the page text and the enforced gate cannot drift.
- The page shows a rules line under Sync now: "Automatic pulls: once per
  24h, 01:00-05:00 only. Queued requests run when a runner picks them
  up, at any hour." Built from the payload numbers, not typed copy.
- Queued card + queue confirmation now say manual requests may run at
  any hour.
- The runner records WHY a run skipped the window: claimed manual
  requests write detail.gate.waivedBy = manual request; --force writes
  detail.forced. The details panel shows "Window waived: manual request"
  / "Ran with --force".

Verified: jsdom harness ALL PASS (rules line, any-hour note, waiver
line + all earlier checks), checks 38/22 auth, 16/16 portal, 35/35
config, build PASSED. Deploy 6acfb3ee published (prod JS carries
"Automatic pulls"); preview refreshed; projects.json updated last.

---

## Seven-page punch list (2026-10-14, sixth round)

Owner: staff layout/bugs; audit slow/failing; social unformatted; site
settings a wall of fields + loading failures; email partial + hard to
navigate; CMS errors out; hub missing information and failing to load.

Root causes found and fixed:

1. CMS "errors out": /admin/config.yml passed through the admin gate, so
   Decap fetched a 302 to the sign-in page and died loading its config.
   A redirect above /admin/* serves it from a root copy (site/static/
   config.yml, lockstep with admin/config.yml); cms.html now OPENS the
   Identity login instead of an eternal "Loading the CMS..." when signed
   out, and reloads into the CMS after login.
2. Sync record 503 on prod: the file:-URL client selection made require()
   dynamic, which Netlify bundling cannot resolve statically, so the
   function could not load libsql and reported not-configured forever.
   Static require restored; sqlite tests inject the client through
   require.cache now.
3. Audit filter 422: staff.update / vehicle.edit / agent.create /
   agent.revoke were registerAction()d in OTHER lambdas, invisible to the
   viewer function. The base vocabulary in utils/audit-log.js carries all
   of them now.
4. Hub zeros: it asked sales-metrics/sales-leads for timeframe=week; the
   pipeline is historical, so four zeros. Now all time, tiles retitled
   "Pipeline (all time)", plus a new "Pipeline by status" card, an empty-
   window note on the chart, and a lead timestamp fallback.
5. Settings.css and social-admin.css hardcode light values, which is why
   staff / audit / social / settings / email looked unformatted on the
   dark console. Scoped dark overrides added in admin-operator.css.
6. Settings page: groups are collapsible folds now (summary + details),
   so the page reads as a table of contents. Email page: same folds
   (Provider / Connection / Addresses). Staff page: name fields in a
   two-column row, permissions list folded, inline light colors replaced
   with themed classes.

Verified: jsdom harnesses ALL PASS (hub / settings / staff), sqlite sync
round-trip with cache-seeded client, checks 38/22 + 16/16 + 35/35, build
PASSED. Deploy 6acfb6f3 live; probes on production: /admin/config.yml 200
(YAML), inventory-sync-status 200 with rules, audit filter 200, metrics
all-time 15. Preview refreshed; projects.json updated last.
