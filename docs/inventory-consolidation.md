# Inventory consolidation — eleven implementations, one page

Read-only review of the inventory front end. Eleven modules implement "the
inventory page"; one is loaded. This records what each of the other ten does
that the live one does not, so that consolidation does not quietly throw away
something good.

**Conclusion in one line:** delete ~2,900 of 3,279 dead lines with zero
capability loss, port 6 capabilities (≈180 lines), and fix 2 live bugs — one of
which leaves the page's primary "Clear filters" button completely unbound.

---

## 1. Method and evidence

Read in full: `inventory-filter.js` (180), `inventory.js` (234),
`inventory-display.js` (355), `inventory-fetcher.js` (185), `inventory-init.js`
(36), `vehicle-inventory.js` (323), `inventory/list.js` (161),
`inventory/FilterManager.js` (589), `inventory/FilterUI.js` (622),
`inventory/InventoryFilters.js` (419), `inventory/detail.js` (124),
`inventory/error-states.js` (231) — plus
`site/layouts/section/inventory.html`, `site/layouts/inventory/single.html`,
`site/layouts/_default/list.html`, the 36 content files under
`site/content/inventory/`, the stylesheets, `partials/entry.html`,
`ci/verify-endpoints.js`, and `scripts/inventory/crawl.js`.

Rules applied:

- **Every claim about the highlander cites a line in `inventory-filter.js`** or
  says *absent*.
- **"Exists" is separated from "correct."** Several of these modules have never
  been executed by a human; §8 lists what is broken, not merely unused.
- Where a claim in the brief turned out to be wrong, it is corrected rather than
  repeated. Two such corrections: §5.4 (the fetcher is not cross-origin) and
  §5.6 (FilterUI and InventoryFilters are not near-duplicates).

Dead-code status is established by the import graph, not by a build: no
`{{ partial "entry.html" … }}` and no `scripts:` front-matter key names any of
the ten (`ci/verify-endpoints.js:74-93` already walks Hugo templates for
entries, and `site/layouts/partials/footer.html:1-16` documents that the one
place that used to load them by hand — an inline `<script>` doing
`import('/js/vehicle-inventory.js')` and friends — was removed because every one
of those imports 404'd). `public/` is not built in this working tree, so no
bundle was inspected.

---

## 2. What the live page actually is

`site/layouts/section/inventory.html` renders all 35 vehicles from content at
build time (`:127-168`) and loads one script (`:200`):

```
{{ partial "entry.html" (dict "entry" "inventory-filter.js" "page" .) }}
```

That script is an IIFE, no imports, no network. It is 180 lines and does
exactly six things.

| capability | where | note |
|---|---|---|
| text search on card title | `inventory-filter.js:51` | `data-title` only; does not search model/trim/vin |
| single-select facets: model, year, body_style, status, max_price | `:52-59` | strict equality on `data-*` |
| 5 sort modes incl. a `featured` default | `:63-85` | reorders by re-appending, `:104-108` |
| result count, pluralised, `aria-live` | `:114-118` | live region is in the layout at `:115` |
| "no vehicles match" empty state | `:119` | toggles `.hidden` on `#inventory-empty` (layout `:170-174`) |
| URL round-trip of 7 params | `:128-146` | `readUrl` on load, `writeUrl` on change |
| reset | `:122-126` + `:166-172` | **only** via `[data-inventory-reset]` |
| debounced search input | `:158-164` | 140 ms |

### 2.1 What the live page does *not* have

Checked and **absent** from `inventory-filter.js`:

- no loading state — there is no request, so there is nothing to wait for
- no error state, no retry, no network failure path — *architecturally absent*
- no pagination
- no favourites / saved vehicles / shortlist
- no comparison
- no active-filter indicator of any kind
- no multi-select (the layout renders plain `<select>`, `:53`, `:63`, `:73`)
- no range sliders, no min/max inputs
- no feature, drivetrain, transmission, colour, make or trim facet
- no facet counts
- no sessionStorage / localStorage persistence of any kind
- no spec table, gallery lightbox or "similar vehicles" on the detail page
  (`inventory/single.html` is 85 lines and loads no script at all)

### 2.2 Two facets the live page *looks* like it has but does not

Both are template/data gaps, not JS gaps, and both matter for judging what the
dead modules were trying to offer:

- **`body_style` filters nothing.** The Body select is wrapped in
  `{{ with $bodies }}` (layout `:70`) and `$bodies` is built from
  `.Params.body_style` (`:20`). **0 of 36** content files define `body_style`,
  so the select is never rendered and `inventory-filter.js:54` can never fire.
- **`featured` sorting is a no-op.** `data-featured` (layout `:142`) is `"0"`
  for all 35 vehicles — **0 of 36** files define `featured`. The `featured`
  comparator (`:75-82`) therefore always ties and degenerates to year-desc then
  price-asc. Harmless, but it is not "featured first" as the comment claims.

### 2.3 The no-JS story

The layout comment at `:35-40` claims the list "is fully usable with JS off".
Partly true. The 35 cards render and every detail link works, so the *content*
is fully usable. The *filter form* is not: it has no `action`, no `method` and
no submit control (`:41-120`; the only button is `type="button"` at `:118`), so
with JS disabled all seven controls are inert decoration. There is no
`<noscript>` in this layout (the only one in `site/layouts/` is
`_default/single.html`). This is a real, small gap — and it is **not** what
`error-states.js` would fix.

---

## 3. Live bugs (in the code that is actually shipped)

These are not harvest candidates. They are the reason the harvest list is
short at the top.

**BUG-1 — the primary "Clear filters" button is unbound.**
`site/layouts/section/inventory.html:118` renders
`<button type="button" id="f-reset">Clear filters</button>`. The only reset
handler in the highlander is a delegated listener for `[data-inventory-reset]`
(`inventory-filter.js:167`). `#f-reset` has no such attribute, and no other
file in the repo references `f-reset` (verified by grep across `site/` and
`ci/`). The `form.addEventListener('reset', …)` at `:156` does not help: a
`reset` event only fires from a form reset *control* or `form.reset()`, and
neither exists. Consequence: a shopper who narrows 35 vehicles to 4 and wants
to start over has **no working clear button** — the only bound one
(`layout:172`) lives inside the empty state, which is hidden whenever results
exist. Either add `data-inventory-reset` to the button at `:118` or bind
`#f-reset` explicitly. One line.

**BUG-2 — the URL, the only state that survives a share, goes stale on the
most-used control.** `writeUrl()` is called from exactly two places: the
`change` handler (`:154`) and the reset click handler (`:170`). It is *not*
called from the `submit` handler (`:148-151`) and *not* from the debounced
search `input` handler (`:160-163`). So typing a model into the search box and
pressing Enter filters the page but leaves the URL clean; reloading loses the
search. Minor robustness: `readUrl` (`:139-146`) assigns `el.value = v`
unconditionally, so `?model=esraide` leaves the select silently displaying
"All models" while the URL still claims otherwise, and `?year=2016.0` matches
nothing rather than falling back to "Any year" (`:53` compares
`String(dataset.year) !== year`).

**BUG-3 — a site with zero inventory renders a blank, unexplained page.**
`inventory-filter.js:30` is `if (!cards.length) return;`. The empty-state
element is server-rendered with `class="inventory-empty hidden"`
(`layout:170`), so it stays hidden. Result: count reads "0 vehicles"
(`layout:116`) and there is no message, no CTA, nothing. This is the single
most valuable thing in the dead set to port — see **H1**.

---

## 4. The ten dead modules

### 4.1 `inventory/error-states.js` (231) — the most interesting file

Exports four functions, all pure DOM builders with no network of their own:

| function | lines | what it is |
|---|---|---|
| `createEmptyState(message, retryFn)` | `:20-50` | icon + `<h3>` + optional retry button |
| `createLoadingState()` | `:56-72` | `aria-live="polite"` spinner + "Loading inventory…" |
| `handleInventoryError(err, container, retryFn, opts)` | `:82-136` | branches on `network` / `notFound` / `>=500` / generic, maps to distinct human copy |
| `createInventoryLoader(fetchFn, container, renderFn, opts)` | `:145-204` | retry-with-backoff wrapper, 2 retries, 2 s delay, "Retrying (n/2)…" |
| `addRetryButton(container, retryFn, message)` | `:212-231` | message + Try Again |

Imports are real and resolve (`utils/error-handler.js` exports `parseApiError`
`:14`, `displayErrorMessage` `:196`, `createRetryFunction` `:291`, `logError`
`:435`), so this file is not broken on import.

**Verdict, capability by capability — this is the honest answer to the brief's
question:**

- "Does the live page have a filters-matched-nothing state?" — **yes**,
  `layout:170-174` + `inventory-filter.js:119`. Covered, and better: the live
  copy has a working reset button and a `/contact/` fallback, which
  `createEmptyState` has neither of.
- "Loading state?" — **obsolete**. There is no request. `createLoadingState`
  and `createInventoryLoader` describe a failure mode the architecture deleted.
- "Error / retry / 5xx copy?" — **obsolete**, same reason. A static page has no
  server to be down.
- "The empty state as a *component*?" — **genuinely worth porting**, and this
  is the payoff: `createEmptyState`'s signature lets the layout own the copy
  and the caller supply the retry, which is exactly what BUG-3 needs. And the
  CSS for it already exists and is **orphaned** —
  `site/assets/css/modules/inventory-errors.css` (75 lines: `.inventory-empty-state`
  `:20`, `.empty-state-icon` `:29`, `.retry-button` `:40`, `.loading-spinner`
  `:9`, `@keyframes spin` `:55`) is imported by nothing (`rg 'inventory-errors'`
  returns no importer). 75 lines of finished styling whose only intended
  consumer is this file.
- The no-JS story — **not in this file**. It cannot be; a JS component cannot
  help a browser that has no JS.

→ **(a) covered** for empty, **(c) obsolete** for loading/error/retry,
**(b) worth porting** for the component shape. See H1.

### 4.2 `inventory/FilterManager.js` (589) — 1,211 lines with FilterUI, and it is not what it looks like

A state machine: `filterState` (`:18-33`), `filterOptions` vocabularies
(`:36-98`), `filterPresets` (`:101-124`), `filterLogic` (`:130-138`), plus
`applyPreset` `:149`, `saveFilter` `:170`, `loadSavedFilter` `:202`,
`deleteSavedFilter` `:224`, `getSavedFilters` `:250`, `getUserId` `:260`,
`setupFilterPersistence` `:279`, `syncWithUrl` `:320`, `updateUrl` `:354`,
`updateFromForm` `:399`, `applyFilters` `:459`, `sortItems` `:529`,
`resetFilters` `:557`.

Measured against the brief's five specific questions:

| asked | answer | cite |
|---|---|---|
| URL / query-param state | **has it, richer — but incompatible.** 20+ params vs the highlander's 7. And the names disagree: `search` vs `q`, `bodyStyle` vs `body_style`, `priceMax` vs `max_price` (`:358-387` vs `inventory-filter.js:22`). Neither stack round-trips the other's URLs. | `:320-393` |
| Facet counts | **no.** Never computed, in this file or in any of the eleven. | — |
| Multi-select | **yes**, and it is the most interesting logic in the file: OR within a facet, AND across facets (`:130-138` declares the table, `:476-480` and `:507-518` implement it, `:497-504` does features as AND). | `:459-522` |
| Sort persistence | **has it** — `sort` is a URL param at `:325` and `:359`. The highlander also has it: `sort` is in `FIELDS` (`:22`). **No gap.** | — |
| Range sliders | **no** — the manager only holds `yearRange`/`priceRange` numbers. The *widget* is in FilterUI, and it never ran. | `:22-23` |

Genuinely unique, and worth an honest look:

1. **Multi-select with OR/AND semantics** (`:459-522`) — real, coherent, and
   the highlander is strictly single-select. → H5.
2. **Named saved searches in `localStorage`** (`:170-254`) — genuinely unique.
   But the highlander's URL *is* a saved search, is shareable, and does not
   rot. → obsolete, superseded.
3. **30-minute `sessionStorage` filter memory** (`:279-315`) — strictly worse
   than the URL. → obsolete.
4. **`filterPresets`** (`:101-124`) — the idea is portable; the *contents* are
   wrong for this site (LATENT BUG 5, 6 below). → H7, rewritten.

→ Mostly **(c) obsolete**; **(b)** for multi-select and (rewritten) presets.

### 4.3 `inventory/FilterUI.js` (622) — the view layer, and the only reason 1,211 lines exist

`generateFilterFormHTML` (`:86-202`) is the whole story: it builds a filter
form as an HTML string. Model `:115`, year range `:123-133`, price range
`:136-146`, feature checkboxes `:149-159`, body style `:162-169`, preset
buttons `:172-181`, saved-filter list `:184-193`, reset/apply `:197-200`.
Around it: `initRangeSliders` `:207-305`, `bindEvents` `:310-370`,
`updateFilterUIFromState` `:376-450`, `updateSavedFiltersUI` `:456-495`,
`setupMobileUI` `:500-527`, `toggleMobileFilters` `:532-537`,
`closeMobileFilters` `:542-544`, `updateActiveFilterCount` `:549-590`,
`debounce` `:613-619`.

Two things it does that 180 lines do not:

1. **An active-filter count badge** (`:549-590`) — counts search, model, body,
   drivetrain, transmission, fuel, colour, year range, price range and features,
   then writes it into a `.filter-count` badge on `.filter-toggle`, creating
   the badge if absent. The highlander has **no** active-filter indicator: with
   seven selects and a count that only ever says "N of 35 vehicles"
   (`inventory-filter.js:114-118`), a user who has set three filters and then
   scrolls has no way to see what is narrowing the list. → H3, the cheapest
   real win in this review (S).
2. **A mobile filter drawer** (`:500-547`) — `matchMedia` at 768 px toggling
   `.mobile-filters` on the container and `.filters-open` on `<body>`, plus a
   close button in the generated header (`:93-95`). Honest assessment: the live
   form is a CSS grid (`layout:43-112`, styled in `inventory.scss`) that
   already stacks. Seven controls on a phone is not a drawer problem. → decline
   (see H8 in the ranked list, marked optional).

The other 500 lines are range sliders that never ran, a saved-filter list whose
callbacks are silently dropped (LATENT BUG 1), and 117 lines of HTML string.

→ **(c) obsolete** except for `updateActiveFilterCount`.

### 4.4 `inventory/InventoryFilters.js` (419) — orchestrator, all of it fetch-shaped

`fetchInventory` (`:73-94`) → `applyFilters` (`:99-111`) →
`filterManager.applyFilters` + `sortItems` → `renderResults` (`:146-199`).
Then a full card renderer `generateVehicleCardHTML` (`:206-258`), a full
pagination renderer `generatePaginationHTML` (`:266-345`) with handlers
(`:350-372`), `setLoading` (`:378-391`) and `showError` (`:397-416`).

**Verdict: (c) obsolete, entire file.** It is a thin coordinator over a fetch
that cannot succeed (LATENT BUG 13) and a rendering strategy (innerHTML cards)
that the server-rendered layout replaced. Nothing in it is a capability the
live page lacks. Its pagination is the one thing it does that no other dead
module does *correctly* — and it is wrong here too (LATENT BUG 12).

### 4.5 `inventory/list.js` (161) — two thirds of it is literal `// ... existing code ...`

`createItemElement` (`:122-130`) and `renderPagination` (`:136-138`) are
stubs. So `renderInventory` (`:106-109`) appends N empty `<div>`s, and
`renderPagination` renders nothing. The only real logic is `fetchInventory`
(`:61-81`) against `/api/inventory` and the empty-state branch (`:92-103`).

**Verdict: (c) obsolete, zero port value.** The emptiest file in the set.

### 4.6 `inventory/detail.js` (124) — does *not* enhance the detail page

Answering the brief directly: **no.** It does not enhance anything. It
*replaces* the detail page — `fetchVehicleData` (`:82-92`) requests
`/api/inventory/{id}` and `renderVehicleDetail` (`:98-116`) clears the
container and re-renders, with the actual rendering left as a stub at `:115`.
`getVehicleId` (`:60-75`) reads `data-vehicle-id` or falls back to the last
URL path segment.

Meanwhile `site/layouts/inventory/single.html` (85 lines) already renders the
breadcrumb, status badge, price, hero image, gallery thumbnails, prose and a
three-CTA aside — server-side, with **no script tag anywhere in the file**.

**Verdict: (c) obsolete, zero port value.** `renderVehicleDetail` is a stub;
there is nothing to carry across.

Worth flagging separately, because it is the most likely thing to be
mis-attributed: that detail page renders almost none of the frontmatter the
crawler collects. 35/35 content files carry `drivetrain`, `transmission`,
`engine`, `exterior_color`, `interior_color`, `mileage`, `vin`, `stock`, `trim`
— and `single.html` shows only `status`, `price`, `price_note`, `subtitle`,
`model`, `gallery`, `image`, `Content`. A spec table is a real opportunity, but
**its source is the Hugo frontmatter, not `detail.js`.** Do not go looking for
it in the ten.

### 4.7 `inventory-init.js` (36) — bootstrap, nothing else

Guards on `#inventory-filters` + `#vehicle-inventory` (`:13-16`), constructs
`InventoryFilters` (`:18-27`) with an env-switched endpoint, exposes a dev
global (`:30-32`), logs (`:34`). Zero unique capability.

**Verdict: (c) obsolete.** Deleting it costs nothing; it is the only thing that
would ever have loaded the FilterUI stack.

### 4.8 `inventory-display.js` (355) — the only *other* source of favourites

`populateFilterOptions` (`:75-103`) derives model and year option lists from
the fetched data. The live layout derives the same vocabularies from content at
build time (`layout:17-24`) — which is strictly better, and is why the Body
select's emptiness is a *content* bug rather than a code bug. **Covered, and
better. (a).**

`filterInventory` (`:130-156`), `sortInventory` (`:158-181`),
`paginateInventory` (`:183-188`), `renderInventory` (`:190-240`),
`renderPagination` (`:242-318`) — all fetch-shaped, all superseded.

`initializeFavorites` (`:320-352`) — a `localStorage` shortlist under
`favoriteVehicles` with an `aria-checked` heart per card (`:226-228`). Genuinely
unique to the dead set and absent from the highlander. → H2, but the port must
re-key it (LATENT BUG 23).

**Verdict:** **(a)** for option vocabularies, **(c)** obsolete for the rest,
**(b)** for favourites.

### 4.9 `vehicle-inventory.js` (323) — selectors that match a layout that cannot render

Its whole DOM contract is `.vehicle-listings` (`:8`), `.inventory-filter`
(`:9`), `.inventory-sort` (`:10`), `.inventory-pagination` (`:11`),
`.favorite-toggle` (`:120`), `#filter-favorites` (`:141`), `.filter-reset`
(`:65`). All of those exist in exactly one template:
`site/layouts/_default/list.html:42-98`.

**That template branch is unreachable.** It is gated on `eq .Section "vehicles"`
(`list.html:42`) and `site/content/` has no `vehicles` directory — the
sections are `about`, `admin`, `contact`, `customer`, `financing`, `inventory`,
`service`, `specials`, `trade-in`. The constructor returns at `:21` and every
method is dead. The host template's own filter form is empty —
`list.html:45-47` is `<form class="vehicle-filter-form"><!-- Filters will be
added using JavaScript --></form>`.

**The one real thing here is `initializeFavorites` (`:112-148`) and
`toggleFavorite` (`:150-169`)** — the more complete of the two favourites
implementations: it reads `favoriteVehicles` (`:114`), toggles per card
(`:129-136`), writes back (`:162`), updates a `.favorites-count` badge
(`:165-168`), and adds a "show favourites only" checkbox handler (`:141-147`).
Better than `inventory-display.js`'s version, which is missing the counter and
the filter. → H2, use this one as the source.

Its `filterVehicles` (`:171-215`) is worth one line of credit: it is the only
implementation that filters **the server-rendered DOM** rather than a fetched
array — the same architectural insight the highlander reached independently. It
is unusable anyway: it needs `data-name` (`:237`), `data-id` (`:177`) and
min/max-named inputs (`:194-203`) that the host template does not emit, and
`display: block` (`:300`) would break the card layout — which is precisely why
the highlander toggles a `hidden` class instead (`inventory-filter.js:111`).

**Verdict: (c) obsolete** except `initializeFavorites`/`toggleFavorite` →
**(b)** H2.

### 4.10 `inventory.js` (234) — the module whose failure motivated the rewrite

`InventoryManager` (`:5`), endpoint `/.netlify/functions/inventory-api` (`:7`),
`loadInventory` (`:71-110`), `renderInventory` (`:112-162`),
`renderPagination` (`:164-222`), `formatNumber` (`:224-226`).

The highlander's own header comment (`:9-13`) already records why it is dead:
it looked for `#vehicle-inventory` / `#inventory-filters` /
`#inventory-pagination` and fetched from a function. Two of those three ids
*now* exist in the layout — which makes this the most dangerous file in the set.
**If anyone ever re-adds it to a `scripts:` list, it will wipe the
server-rendered grid** (`:74` sets `inventoryEl.innerHTML = '<div
class="loading-spinner">…'` before fetching) and replace 35 working cards with
a function call. That is the strongest argument for deleting it rather than
parking it.

Its `renderPagination` (`:164-222`) and error copy (`:102-108`) are covered by
`error-states.js`/the layout. Its `formatNumber` (`:224-226`) duplicates what
Hugo does at `layout:131-132,154-155`.

**Verdict: (c) obsolete, entire file, delete first.**

### 4.11 `inventory-fetcher.js` (185) — and a correction to the brief

The brief describes this as "scrapes `https://www.cadillacofsouthcharlotte.com`
from the browser" and says that "cannot work: CORS". **The code does not do
that.** `baseUrl` is set at `:8` and used *only* by `resolveUrl` (`:138-142`)
to absolutise hrefs. The actual request goes to `proxyUrl`
(`/api/inventory-proxy`, `:13`) at `:45` — **same-origin**. So the browser-side
code would work fine *if that function existed and returned dealer HTML*. The
CORS failure, such as it is, lives in `netlify/functions/inventory-proxy.js`,
not here. This matters for the deletion rationale: the file is not *impossible*,
it is *superseded*.

And it is superseded in a way that is provable from the repo.
`parseInventoryHTML` (`:59-117`) matches `.inventory-card, .vehicle-card,
.srp-vehicle` (`:75`). The source-of-record crawler's own header comment,
`scripts/inventory/crawl.js:52-60`, states that the dealer's listing "is a
client-side React widget whose server-rendered cards are **skeleton
placeholders**" and that only schema.org JSON-LD is parseable. **The scraper
targets a DOM that the crawler has documented as non-existent.** The selectors
at `:75` could never match a single card.

Everything else is dead by architecture: `localStorage` TTL cache
(`:147-182`, `cacheDuration` 1 h at `:15`) for a page that makes no request.

**Verdict: (c) obsolete, entire file, delete first.** The only theoretically
salvaged lines are `cleanPrice`/`cleanMileage` (`:122-133`), and
`scripts/inventory/structured.js` already does structured extraction.

---

## 5. Overlap census — how much of this is the same code twice

`FilterUI.js` and `InventoryFilters.js` were flagged as possible
near-duplicates. **They are not.** They are two halves of one design: FilterUI
is a pure view layer over FilterManager, InventoryFilters is the data layer
underneath it. Neither duplicates the other; both are invalidated for the same
reason (the data layer they sit on cannot load). Treat them as one 1,041-line
system, not two competing ones.

The real duplication is *across* the whole set, and it is severe:

| capability | independent implementations | lines |
|---|---|---|
| **fetch the inventory** | `inventory.js:71`, `inventory-fetcher.js:43`, `InventoryFilters.js:73`, `list.js:61`, `detail.js:82`, `site.js:fetchInventory` | ~230 |
| **render a vehicle card as HTML** | `InventoryFilters.js:206-258`, `inventory-display.js:190-240`, `inventory.js:112-162` + `layout:133-166` | ~240 |
| **pagination** | `InventoryFilters.js:266-345`, `inventory-display.js:242-318`, `inventory.js:164-222`, `vehicle-inventory.js:255-278` | ~400 |
| **sorting** | `FilterManager.js:529-552`, `inventory-display.js:158-181`, `vehicle-inventory.js:217-244` + highlander `:63-85` | ~180 |
| **"no results" UI** | `error-states.js:20-50`, `InventoryFilters.js:159-176`, `inventory-display.js:193-201`, `inventory.js:122-131` + `layout:170-174` | ~110 |
| **loading UI** | `error-states.js:56-72` + `:145-204`, `InventoryFilters.js:378-391`, `inventory.js:74`, `inventory-display.js:32` | ~150 |
| **error + retry UI** | `error-states.js:82-136` + `:212-231`, `InventoryFilters.js:397-416`, `inventory.js:100-109`, `inventory-display.js:44-56` | ~140 |
| **favourites** | `vehicle-inventory.js:112-169`, `inventory-display.js:320-352` | ~90 |
| **URL ⇄ state** | `FilterManager.js:320-393`, `site.js:99-127` + highlander `:128-146` | ~130 |
| **filter vocabulary** | `FilterManager.js:36-98`, `layout:17-24` (correct), `inventory-display.js:75-103` (from data) | ~130 |

Roughly **1,900 of the 3,279 dead lines are one of nine capabilities written
two to six times each.** Only two of those capabilities are still needed
(favourites, URL state), and the correct version of one of them is already
shipped.

---

## 6. HARVEST LIST

Ordered by value per unit of effort. "Highlander equivalent" is honest —
**five of the six have none.**

### H1 — Empty state for zero inventory, not just zero matches
- **Source:** `inventory/error-states.js:20-50` (`createEmptyState`) — the
  component shape, not the loading/retry half. CSS already written and
  orphaned: `site/assets/css/modules/inventory-errors.css:20-38`.
- **What:** Render the empty state when the server rendered *no* vehicles at
  all, not only when filters match none.
- **Why:** Fixes BUG-3. Today a zero-stock site renders a bare page reading
  "0 vehicles" with no message, no CTA and no explanation. This is the only
  genuinely broken *page state* in the live inventory, and `createEmptyState`'s
  `createEmptyState(message, retryFn)` signature is the right shape for it —
  the layout supplies the copy, the caller supplies the action.
- **Hard:** **S.** Replace `if (!cards.length) return;`
  (`inventory-filter.js:30`) with a branch that unhides `#inventory-empty`, and
  swap the hardcoded `<p>` (`layout:170-174`) for the icon treatment. Import
  the stylesheet. ~30 lines.
- **Highlander equivalent:** **absent.** `:30` returns early and `layout:170`
  ships with `hidden`.

### H2 — Favourites / shortlist
- **Source:** `vehicle-inventory.js:112-148` (`initializeFavorites`) and
  `:150-169` (`toggleFavorite`) — the more complete of the two; plus
  `inventory-display.js:226-228` for the `aria-checked` heart markup and
  `:320-352` as the alternate.
- **What:** A per-card heart that persists a shortlist to `localStorage`.
- **Why:** The one capability in the dead set that is a real shopper feature
  and has no equivalent anywhere in the live site. With 35 vehicles a
  shortlist of 3 is the natural next action, and the detail page already routes
  every card to `/contact/?vehicle=…` (`layout:163`) — a shortlist feeds that.
- **Hard:** **M**, and mostly *not* copy-paste: `toggleFavorite` keys on
  `card.dataset.id`, which **the live cards do not have** (`layout:133-142`).
  Add a stable key to the template — `vin` is present in 35/35 content files
  and is the natural identifier — then port ~40 lines. **Do not** reuse the
  fetcher's `Math.random()` id (`inventory-fetcher.js:100`).
- **Highlander equivalent:** **absent.** No `localStorage` anywhere in
  `inventory-filter.js`.
- **Adjacent, out of scope:** comparison lives in `vehicle-comparison.js` /
  `vehicleComparison.js`, *not* in these ten. Its host markup is
  `_default/list.html:91` (`.compare-button[data-vehicle-id]`), which is
  unreachable for the same reason as §4.9. If comparison is wanted, harvest it
  from those two files in a separate pass, and host it in
  `section/inventory.html` — not in `list.html`.

### H3 — Active-filter count
- **Source:** `inventory/FilterUI.js:549-590` (`updateActiveFilterCount`).
- **What:** Show how many filters are currently narrowing the list, as a badge
  next to the filter controls.
- **Why:** The live page has seven selects (`layout:43-112`) and a count that
  only reports results (`:114-118`). A user who sets model + body + price,
  scrolls past the grid, and comes back has no way to see what is active — and
  the "Clear filters" button that would fix it is unbound (BUG-1). The two
  findings compound: today the page both hides what is active and fails to
  offer a way to undo it.
- **Hard:** **S.** Count non-empty fields from the form, render a badge.
  ~25 lines, no template change beyond one element.
- **Highlander equivalent:** **absent.**

### H4 — Drivetrain and transmission facets
- **Source:** `inventory/FilterManager.js:55-70` (the option vocabulary is the
  only portable part; the filter logic is not needed).
- **What:** Two more filters, over data that already exists.
- **Why:** This is the highest-value *data* gap, and the dead set is what
  flagged it. **35/35** content files carry `drivetrain` and `transmission`
  (`AWD`/`FWD`/`RWD`/`4WD`, `Automatic`/…); the crawler collects them; the
  layout renders neither the field on the card nor the control in the form.
  Meanwhile `body_style` — which *is* wired end to end — is set by nothing
  (§2.2). The filter work is nearly free; the data gap is the actual finding.
- **Hard:** **S.** Add `data-drivetrain` / `data-transmission` to
  `layout:133-142`, build the vocabularies at `layout:17-24`, add two selects,
  add two clauses to `matches()` (`:50-61`). ~20 lines. Bonus: also emit
  `body_style` from the crawler, which would make the existing Body select
  start working.
- **Highlander equivalent:** **absent** — no `data-drivetrain` is emitted at
  all.

### H5 — Multi-select facets
- **Source:** `inventory/FilterManager.js:130-138` (`filterLogic` table),
  `:476-480` (OR within a model facet), `:497-504` (AND across features),
  `:507-518` (OR within every other array facet), `:459-522` (`applyFilters`).
- **What:** Let a shopper pick Escalade *or* VISTIQ in one control, instead of
  one-or-nothing.
- **Why:** The OR-within / AND-across model is correct, and the highlander is
  strictly single-select. On a 35-vehicle grid where 11 are XT5 and 5 are
  Escalade, "show me the Escalades and the VISTIQs" is a real intent the
  current filter cannot express.
- **Hard:** **M.** The highlander's `matches()` (`:50-61`) and `val()` (`:40-43`)
  are single-value; needs array handling, `multiple` on the selects
  (`layout:53`), comma-joined URL params (the pattern `FilterManager.js:364-368`
  already demonstrates), and a rewrite of `writeUrl`/`readUrl` (`:128-146`).
  **Use the highlander's param names, not FilterManager's** — they disagree
  (§4.2) and adopting the old ones would break every URL already shared.
- **Highlander equivalent:** **absent.**
- **Honest caveat:** this is only worth building *with* facet counts, which
  exist in **none** of the eleven modules. Without a count on each option,
  multi-select is a guessing game. Facet counts are new code, not a harvest.

### H6 — Price-band preset chips
- **Source:** `inventory/FilterManager.js:101-124` (`filterPresets`),
  `:149-164` (`applyPreset`).
- **What:** One-tap chips for common price bands.
- **Why:** The live `max_price` select offers fixed buckets — 40k/55k/70k/90k/
  120k (`layout:92-99`) — so the data is already there; chips just make it one
  tap instead of opening a select. Low cost, small win.
- **Hard:** **S**, but **the presets must be rewritten, not copied.** As
  written, two of the three are broken against this site's data: `new-arrivals`
  sets `sort: 'newest'`, which is not an option in the live sort select
  (`layout:105-110`) nor a comparator in `sortCards` (`:65-83`), so it silently
  falls back to `featured`; and `luxury-suvs` filters on `features`, a key
  **0 of 36** content files define, so it would match nothing. Port the third
  (`under-50k`) and write fresh ones.
- **Highlander equivalent:** **absent.**

### H7 — Extend URL sync to the search field *(a fix, not a port)*
- **Source:** `inventory/FilterManager.js:354-393` (`updateUrl`) for the
  *pattern*; the fix belongs in `inventory-filter.js`.
- **What:** Make the debounced search write the URL like every other control.
- **Why:** The URL is the only state that survives a reload or a share, and
  right now the most-used control is excluded from it (BUG-2). One line in each
  of the two handlers at `:148-151` and `:160-163`.
- **Hard:** **S.**
- **Highlander equivalent:** **partial** — `writeUrl` exists (`:128-137`) but is
  wired to `change` only (`:154`).

### Declined, with reasons

- **Mobile filter drawer** — `FilterUI.js:500-547`, `:356-369`, plus
  `_filter-ui.css`. Buildable, but the live form is a grid that already stacks;
  seven controls is not a drawer problem. Optional, not recommended.
- **Range sliders** — `FilterUI.js:207-305`. **Do not port.** 99 lines that
  have never executed: the whole method is behind `if (window.noUiSlider)`
  (`:214`) and noUiSlider is loaded nowhere in the repo — only an eslint
  `readonly` global (`eslint.config.js:81`) and a CSS comment
  (`imports/_filter-ui.css:340`). Its own comment at `:208-210` calls it a
  placeholder. The idea is fine; this is not an implementation.
- **Named saved searches** — `FilterManager.js:170-254`,
  `FilterUI.js:456-495`. Unique, but the URL is already a saved search, is
  shareable, and does not rot.
- **30-minute session filter memory** — `FilterManager.js:279-315`. Strictly
  worse than the URL.
- **Loading / error / retry states** — `error-states.js:56-72`, `:82-136`,
  `:145-204`, `:212-231`. A page that makes no request has no loading state
  and no server to be down.
- **The no-JS filter story** — not in any of the ten. Fix in the layout: either
  a `<noscript>` block that hides the inert form (`layout:41-120`) or a real
  `action`/`method` GET. S, and worth doing — but it is a template change, not
  a harvest.
- **Vehicle spec table on the detail page** — not in any of the ten
  (`detail.js:115` is a stub). Source is the frontmatter, not `detail.js`
  (§4.6).

---

## 7. Deletion accounting

| module | lines | verdict | port value |
|---|---:|---|---|
| `inventory.js` | 234 | delete first — wipes the server-rendered grid if re-added | 0 |
| `inventory-fetcher.js` | 185 | delete first — scrapes a DOM `crawl.js:52-60` proves is empty | 0 |
| `inventory-init.js` | 36 | delete — pure bootstrap for a dead stack | 0 |
| `inventory/list.js` | 161 | delete — two of its four methods are `// ...` stubs | 0 |
| `inventory/detail.js` | 124 | delete — replaces a page that needs no replacing | 0 |
| `inventory/InventoryFilters.js` | 419 | delete — orchestrator over a fetch that cannot succeed | 0 |
| `inventory/error-states.js` | 231 | keep `createEmptyState` (H1); delete `:56-231` | ~30 |
| `inventory/FilterUI.js` | 622 | keep `updateActiveFilterCount` (H3); delete the rest | ~42 |
| `inventory/FilterManager.js` | 589 | keep `applyFilters` multi-select logic (H5) and preset *shape* (H6); delete the rest | ~33 |
| `inventory-display.js` | 355 | delete — its one unique bit is a worse favourites impl | 0 |
| `vehicle-inventory.js` | 323 | keep `initializeFavorites` + `toggleFavorite` (H2); delete the rest | ~58 |
| **total** | **3,279** | | **~163** |

**Safe to delete with no capability loss: ~2,890 lines (88%).** The remaining
~390 lines are worth reading before they go — of which ~163 lines are directly
portable and the rest need rewriting against the live data model rather than
copying (favourites must be re-keyed to `vin`; multi-select must adopt the
highlander's param names; presets must be rewritten).

Ordering that avoids losing anything: land H1, H3, BUG-1 and BUG-2 first
(they are independent of every deletion); then H2 and H4; then H5 and H6; then
delete. Nothing in the delete set is required by H1-H7 except
`error-states.js:20-50`, `FilterUI.js:549-590`, `FilterManager.js:459-522` +
`:101-124`, and `vehicle-inventory.js:112-169`.

**Two side effects of deleting worth noting.** First, the deletion orphans more
than it removes: `site/assets/css/imports/_filter-ui.css` (437 lines),
`imports/_vehicle-inventory.css` (372) and `modules/inventory-errors.css` (75)
are imported by nothing **today** — nothing in the repo `@import`s the
`imports/` directory at all — so 884 lines of CSS are already dead and are
*not* collateral damage from this change. Second, `ci/verify-endpoints.js` and
`eslint.config.js:40-53` carry waivers and `KNOWN_MISSING` entries for
`inventory-fetcher.js` specifically; those can be removed in the same commit.

---

## 8. LATENT BUG index

"These compile and were never run by a human." Ordered by consequence.

### In the dead set

1. **`inventory/FilterManager.js:16` — `this.options` is never assigned, so two
   injected callbacks are silently discarded.** The constructor takes
   `options` and reads `options.limit` (`:32`) but never stores it; `:241` and
   `:271` then read `this.options?.updateSavedFiltersUI` / `?.updateFilterUI`.
   `FilterUI.js:39-40` injects exactly those two. So `applyPreset` (`:161`),
   `resetFilters` (`:575`) and `saveFilter` (`:182`) all call an update method
   that is permanently a no-op, and the saved-filter UI can never repaint.
   Optional chaining means it does not throw — it fails quietly, which is worse.
   *This is the one to remember: it is exactly the kind of bug you would port
   and then spend an afternoon on.*
2. **`inventory/InventoryFilters.js:186-195` — pagination is decorative.**
   `renderResults` appends a card for every vehicle (`:181-183`) and then
   appends pagination (`:191-193`); it never slices by `filterState.page`.
   `setupPaginationHandlers` (`:350-372`) updates the page and re-renders the
   identical list.
3. **`inventory/InventoryFilters.js:75-88` — wrong endpoint and wrong shape.**
   Fetches `/api/inventory` and requires `{success, vehicles}`. No such route
   exists (the functions are `inventory-api`, `inventory-advanced`,
   `inventory-proxy`, `inventory-fetch`, `inventory-sync`) and no such shape is
   produced. Every code path ends at `throw new Error('Invalid API response
   format')`. Its default is overridden anyway by `inventory-init.js:24-26`.
4. **`inventory/list.js:63` — same wrong route**, and `:127` / `:137` are
   literal `// ... existing code ...` stubs. `createItemElement` returns an
   empty `<div>`, so `renderInventory` (`:106-109`) appends N empty divs, and
   `renderPagination` renders nothing.
5. **`inventory/detail.js:15` — `/api/inventory/` does not exist.**
   `getVehicleId` (`:60-75`) returns the URL slug and `fetchVehicleData`
   (`:82-92`) requests `/api/inventory/<slug>`. `renderVehicleDetail` (`:115`)
   is a stub, so even a 200 would render an empty container.
6. **`inventory/detail.js:70` — malformed regex.** `/^[a-zA-Z0-9-_]+$/` puts
   `-` between `9` and `_`, making it the range 57–95, so `:;<=>?@[\]^_` all
   pass. Should be `[a-zA-Z0-9_-]`.
7. **`inventory/FilterUI.js:214` — 99 lines that have never executed.**
   `initRangeSliders` (`:207-305`) is entirely behind `if (window.noUiSlider)`
   and noUiSlider is not loaded anywhere in the repo. Its own comment
   (`:208-210`) says it is a placeholder.
8. **`inventory/FilterUI.js:73` — would destroy the server-rendered form.**
   `this.filterForm.innerHTML = this.generateFilterFormHTML()` overwrites
   whatever Hugo rendered. The live form and all seven of its `name`/
   `data-*` contracts come from `layout:41-120`. This is why "just wire up
   `inventory-init.js`" is the wrong fix, not the right one.
9. **`inventory/FilterUI.js:31-34` + `InventoryFilters.js:39` — null
   dereference chain.** `FilterUI` returns early from its constructor when
   `#inventory-filters` or `#vehicle-inventory` is missing, leaving
   `this.filterManager` undefined; `InventoryFilters.js:39` copies that
   reference and `:101`/`:104` would throw. Unreachable only because
   `InventoryFilters` is itself never loaded.
10. **`inventory/FilterManager.js:130-138` — `filterLogic` is declared and
    never read.** `applyFilters` hardcodes OR for arrays (`:476`, `:507`) and
    AND for features (`:497`). The table reads as behaviour and is not.
11. **`inventory/FilterManager.js:55-88` — four vocabularies are never
    rendered.** `drivetrain`, `transmission`, `fuelType` and `color` are
    counted by `FilterUI.js:557-560` but `generateFilterFormHTML` (`:86-202`)
    emits no control for any of them, so the active-filter badge can show a
    non-zero count for a filter the user cannot see.
12. **`inventory/FilterManager.js:89-97` vs `FilterUI.js:86-202` — seven sort
    options, no sort control.** `sortItems` (`:529`) is reachable only via the
    default `'featured'`. `InventoryFilters.setupSortHandler` (`:132-140`)
    hunts `#inventory-sort`; FilterUI never renders it, and the live layout
    uses `id="f-sort" name="sort"` (`layout:104`). Two mismatches, one dead.
13. **`inventory/FilterManager.js:114` — a preset that can match nothing.**
    `luxury-suvs` filters on `features: {leatherSeats, sunroof}`, and **0 of
    36** content files define a `features` key. `applyFilters:500`
    (`item.features.includes(feature)`) can therefore only ever return false.
14. **`inventory/FilterManager.js:121` — a preset with an invalid value.**
    `new-arrivals` sets `sort: 'newest'`; `'newest'` is not an option in
    `layout:105-110` nor a key in `sortCards` (`:65-83`), so it silently
    falls through to `featured`.
15. **`inventory/FilterUI.js:457` — unguarded `this.filterForm`.**
    `updateSavedFiltersUI` calls `this.filterForm.querySelector(...)` with no
    null check. Latent only because bug 1 prevents it from ever being called.
16. **`inventory-display.js:327` + `inventory-fetcher.js:100` — unusable
    favourites key.** Both key on `data-id`; the live cards have no `data-id`
    (`layout:133-142`), and the fetcher falls back to
    `Math.random().toString(36)` when VIN and stock are both absent — so a
    shortlist would not survive a re-fetch. Key on `vin` (35/35 files have one).
17. **`inventory-display.js:19-22` — the "unfiltered" view was pre-filtered.**
    `search: 'new'`, `make: 'Cadillac'`, `model: 'CT5'` are hard-coded
    defaults. Of 35 vehicles, 3 are not Cadillac and 11 are not `New`.
18. **`inventory-display.js:145-149` and `inventory.js:55` — filter key
    mismatch with the live form.** The old contract is `minPrice`/`maxPrice` /
    `priceFilter`; the live form is `max_price` (`layout:92`). **No bookmarked
    URL from the old stack survives the migration, in either direction.**
19. **`inventory.js:36-38` — a fetch per keystroke-equivalent.** Every
    `<select>` change in `#inventory-filters` calls `loadInventory()`
    immediately, with no debounce. Superseded, but it is why the old page felt
    broken.
20. **`inventory.js:74` — destroys the server-rendered grid.**
    `inventoryEl.innerHTML = '<div class="loading-spinner">…'` wipes 35 working
    cards before a request that may fail. The highlander's entire premise is
    not doing this. **Highest-risk file to keep around.**
21. **`inventory-fetcher.js:75` — selectors that cannot match anything.**
    `.inventory-card, .vehicle-card, .srp-vehicle`, against a site whose own
    crawler documents the cards as "skeleton placeholders"
    (`scripts/inventory/crawl.js:52-60`) with only JSON-LD parseable.
22. **`inventory-fetcher.js:122-133` — `NaN` propagation.** `cleanPrice` and
    `cleanMileage` `parseInt` a string with the digits stripped; "Call for
    price" yields `parseInt('')` → `NaN`, which then poisons every subsequent
    numeric comparison and sort.
23. **`inventory-fetcher.js:65` — `require('jsdom')` in an ES module.**
    Already waived in `eslint.config.js:49` and recorded in
    `docs/test-status.md:97`. It is only reachable on the
    `typeof window === 'undefined'` branch (`:63`), so it never throws in a
    browser — the real defect is that the branch is meaningless in a browser
    bundle.
24. **`inventory-init.js:24,30` — `params.env` is a build-time global.**
    `params` is injected by esbuild via `partials/entry.html:31`. This file is
    not a declared entry, so it is never built and never evaluated; loaded raw
    it would be a `ReferenceError`. Listed for completeness — **not** a live
    bug, because it never runs.
25. **`vehicle-inventory.js:8` — every selector points at an unreachable
    template.** `.vehicle-listings` exists only in
    `_default/list.html:50`, gated on `eq .Section "vehicles"`
    (`list.html:42`); there is no `site/content/vehicles/`. The constructor
    returns at `:21`. `.filter-reset` (`:65`) and `#filter-favorites` (`:141`)
    are not in that template either — its form is empty
    (`list.html:45-47`), and it does render `.favorite-toggle`
    (`list.html:80-82`), which is the one hook that would have worked.
26. **`vehicle-inventory.js:237,239` — null deref.** `a.dataset.name.localeCompare`
    with no guard; the host template emits no `data-name` (`list.html:52`), so
    `name-asc`/`name-desc` throw.
27. **`vehicle-inventory.js:194-203` — range detection by substring.**
    `filterName.includes('min')` routes any field containing "min" or "max" to
    the range branch, so a facet named `domicile` or `admin` would be read as a
    numeric range.
28. **`vehicle-inventory.js:300` — `display: block` breaks the grid.**
    Showing a card sets `style.display = 'block'`, overriding the card's own
    `display: flex`. The highlander toggles a `hidden` class
    (`inventory-filter.js:111`) precisely to avoid this. A design reason not to
    port the module, independent of its bugs.
29. **`InventoryFilters.js:195,401` — unescaped interpolation into
    `innerHTML`,** fed from a fetch response. Moot once deleted; recorded
    because the same pattern recurs in three modules and would matter if any
    were revived.

### In the live code (fix these regardless of consolidation)

30. **`#f-reset` is unbound** — `layout:118` vs `inventory-filter.js:167`. The
    page's primary clear control does nothing. BUG-1 above.
31. **`writeUrl()` not called on search** — `inventory-filter.js:148-151`,
    `:160-163`. BUG-2 above.
32. **Zero inventory renders no empty state** — `inventory-filter.js:30` plus
    `layout:170`. BUG-3 above; H1 fixes it.
33. **No no-JS story for the filter form** — `layout:41-120` has no `action`,
    no `method`, no submit control, and no `<noscript>`, while the comment at
    `:35-40` claims full usability with JS off.
34. **`body_style` filter is unreachable** — 0/36 content files define it;
    `layout:20`, `:70-78` and `inventory-filter.js:54` are all no-ops.
35. **`featured` sort is a no-op** — 0/36 content files define it, so
    `data-featured` (`layout:142`) is always `"0"` and
    `inventory-filter.js:75-82` degenerates to year-desc then price-asc.

---

## 9. Recommended order of work

1. **BUG-1** (one line) and **BUG-2** (one line each) — independent of
   everything else, and BUG-1 is a broken button on the live page.
2. **H1** + **BUG-3** — the one genuinely broken page state, and the only
   harvest that repairs rather than adds.
3. **H3** — cheapest real UX win, and it pairs with BUG-1.
4. **H4** — cheap, and the `body_style` finding that comes with it is a data
   bug worth a ticket against the crawler.
5. Delete the six files with zero port value
   (`inventory.js`, `inventory-fetcher.js`, `inventory-init.js`,
   `inventory/list.js`, `inventory/detail.js`, `InventoryFilters.js` — 1,159
   lines). This is safe *today*, before any harvest, because none of them is
   reachable.
6. **H2**, then **H5** + **H6** (H5 wants facet counts, which are new code).
7. Delete the remaining four, keeping only the lines named in §7.

`docs/feature-inventory.md:88-92` already lists these modules as orphaned;
this review supersedes it for the inventory front end with per-file detail.
