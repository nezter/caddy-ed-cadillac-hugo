# REMAINING-WORK — page by page, what a mockup asks for and the build does not have

Written after comparing each built page against its mockup, using the element
heights measured from the rendered pages rather than impressions. Every item
says what is missing, how I know, and whether it is a styling job, a template
job, or blocked on something that is not code.

State at the time of writing: 35 commits on `modernize/netlify-build-2026`,
build exits 0 with 67 pages and no warnings, working tree clean.

---

## HOME — `mockups/home.html` vs `/`

Measured: page ~6,187px tall. Hero 900 · proof strip 180 · Ed band 900 ·
fleet 1,591 · pick band 869 · claims 647 · copy 453 · closing call 329 ·
footer 329. All bands present, all in the mockup's order.

**Done.** Hero with the ask panel, ruled proof ribbon, dock with equal-height
tiles, light fleet band with dark cards on it, Ed's pick, four claims, closing
call, Carousel-free. The picture that was overflowing its plate by 300px is
fixed.

**Remaining:**
1. **The hero photograph reads dark.** Measured and fixed as far as CSS goes
   (exposure 1.28, scrim over the car cut to near-transparent). It is a flat
   studio render with crushed blacks. *Blocked on imagery, not code.*
2. **The social panel renders empty** in an offline render because the embeds
   cannot load. Cannot be judged from a headless capture. *Needs a look in a
   real browser.*
3. **The reviews band is hidden** while there are no reviews — correct, but it
   means the page has no social proof at all until real quotes exist.
   *Blocked on real reviews.*

---

## INVENTORY — `mockups/inventory.html` vs `/inventory/`

**Done.** Filter rail beside two-across results, pagination below the grid, the
compare block moved out of the header to the foot, light cards on the browsing
surface, dark head band, the count line above the cars, and — after the last
pass — a rail that scrolls so every filter is reachable, uniform card buttons,
and styled fields.

**Remaining:**
1. **The mockup's condition chips** (All / New / Certified / Pre-owned /
   Electric) sit in a rail above the grid on the mockup. I deliberately left
   them in the filter column: that rail is a real form, and chips above the
   grid would look like they filter without doing it. *Decision, not a gap —
   change it only if you want the look more than the honesty.*
2. **No persistent shortlist tray.** The mockup has a bottom tray with
   thumbnails and "compare side by side"; the site has a tray that stays hidden
   until you add cars, plus a Shortlist button per card. *New UI, needs
   JavaScript. Not started.*
3. **Page size.** 24 cards at two-across is a long page; the mockup shows 8 with
   load-more. Changing it changes the pagination and crawl behaviour the repo
   documents deliberately. *Your call.*

---

## VEHICLE DETAIL — `mockups/vehicle.html` vs a vehicle page

Measured: page ~4,760px. Gallery 833 · specification 893 (now halved by the
two-column change) · ask module 285 · action rail 818 · booking 776 · compare
509 ×3. All healthy.

**Done.** Stock number out of the `<h1>` into a mono micro-line, gallery as a
plate, two-column specification, "what people ask" module, Ed's note with a
seal, price in the action rail under "Asking price", three-to-compare section,
`Car` structured data.

**Remaining:**
1. **No gallery thumb rail.** The mockup has five frames per car. The feed
   supplies one image, so the rail would be empty. *Blocked on the feed, by
   design — the plate and scrim exist to make a single feed image look
   deliberate.*
2. **The store banner is baked into every vehicle photograph** and the site's
   address differs from it. The card scrim covers it; the detail page's large
   image shows it. *Blocked on the feed. A CSS crop could cover the band on the
   detail page — worth trying.*
3. **No payment estimate** on the page, though the financing page has a
   calculator. The mockup's rail lists "Estimate the payment" as an action.
   *Template job, small.*

---

## ABOUT — `mockups/about.html` vs `/about/`

**Done.** Dark hero with the portrait and the claim side by side, portrait in
the interim bronze grade, three-cell fact ribbon, the four generic feature
cards replaced with four supportable claims, the one-person "team" grid
suppressed, quote band with a seal, closing call, structured data corrected.

**Remaining:**
1. **The portrait is a flash-lit snapshot with raised fists.** The bronze grade
   makes it read as intent rather than accident, and that is all CSS can do.
   *This one is yours to reshoot — it is the personal brand, and it is the
   weakest asset on the site.*
2. **No timeline.** The mockup has 1999 → 2008 → 2017 → 2026. I dropped it
   because three of those four dates were invented. *Needs the real milestones
   from you.*

---

## CONTACT — `mockups/contact.html` vs `/contact/`

**Done.** Dark head, form card beside a sticky facts card, response ribbon,
three faster routes, and the address / phone / hours reconciled to the single
source the header and footer use.

**Remaining:**
1. **No map.** The mockup omits one deliberately until there is a real location
   to show. *Decision.*
2. **Nothing else on this page is outstanding.**

---

## THE ELEVEN INTERIOR PAGES

All of them now carry: the dark head band, the display type scale, the button
system, the reading treatment (70ch measure, heading rhythm, marker and table
styling), and — for those rendering through `_default/list.html` — the same
closing band. What they do not have is a ported interior.

| Page | What the mockup asks for that is missing | Size |
| --- | --- | --- |
| **Test drive** | Vehicle picker now reads properly and the steps band is in. Still carries **two competing booking forms** — one should go, and which is your call | Small, needs a decision |
| **Trade-in** | **The appraisal form.** A page about a number with no way to enter one. Can post to the existing `lead-form` endpoint; no new backend | Medium |
| **Service** | **Three service cards** (maintenance / diagnostics / collision) and a **booking form** | Medium |
| **Financing** | ~~The calculator is off by default; the mockup promotes it~~ **Corrected in this pass:** the calculator is off ON PURPOSE and the page says why -- "the calculator is off until the quote endpoints it depends on exist". Promoting it would produce a calculator with no live rates behind it. Not a gap; a deliberate, honest decision. The toggle panel now reads as intentional rather than as a section that failed to load | — |
| **Specials** | **Nothing to show.** Two headings and a link row. Either build the three offer cards or fold it into inventory and redirect | Medium |
| **Communication preferences** | **The controls do not exist.** The privacy policy points here to opt out, and it is a heading and nothing else | Medium |
| **404** | Could offer three similar vehicles when the URL was a vehicle that sold | Small |
| **Customer portal** | The logged-out state is four empty `Loading…` panels | Small |
| **Lead form** | Duplicates `/contact/` on a second endpoint; one should go | Small, needs a decision |
| **Categories / tags** | No content strategy. Give them a purpose or `noindex` them | Small, needs a decision |
| **Admin suite** | Design is fine; the `/admin/*` shells are publicly loadable, which is a security posture question, not a design one | Not design |

---

## ORDER I WOULD WORK THEM IN

1. **Communication preferences** — an opt-out page with no opt-out is the one
   item here that is arguably a compliance problem, not a styling one.
2. **Trade-in appraisal form** — the page's whole purpose, currently absent.
3. **Financing calculator promoted out of its toggle.**
4. **Vehicle payment estimate** in the action rail.
5. **Service cards and booking.**
6. **The decisions you own:** the second test-drive form, the lead-form
   duplicate, the taxonomy pages, page size, the shortlist tray.

Everything above is layout, function or design. The two things that are not —
the hero photograph and the portrait — are in `IMAGERY.md` with shot lists, and
the vehicle photography is the feed's, which the plate system is built to
absorb.
