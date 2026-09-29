# PAGE-LAYOUTS.md — every page, laid out

Sixty-six URL patterns, checked one at a time against the live site at `10.1.0.81:8090`
(27 September 2026). For each: **what renders today → what is wrong with it → the 2026 layout,
section by section.**

Legend for the section stacks: `▸` = section, `·` = component inside it. Sections marked
**[NEW]**, **[MOVED]** or **[CUT]** are changes from the current build.

Four of these layouts are worked up as clickable mockups in `mockups/` — those are marked
**▶ built**.

---

## 0. The system, in one paragraph

Light pages for reading and comparing. Dark "stage" for emotion — the hero, the vehicle detail,
the closing calls — so a Cadillac is always lit against black. One type system: tight grotesk at
display scale, a high-contrast serif for editorial moments, mono for the small print that used to
be shouty capitals. Bronze becomes a metal (hairlines, labels, the numbers that matter) instead
of a swatch. Every photograph sits in a plate. Nothing else changes: same routes, same forms,
same Netlify functions, same tokens in `main.css`.

---

## 1. Home — `/` ▶ **built** (`mockups/home.html`)

**Today.** Six sections: full-bleed hero with the ask form beside it → a four-stat proof strip →
Ed's portrait next to the "stay connected" dock (fresh stock + Facebook/X feed + alerts + call
chips) → the fleet grid with condition filters → testimonials → CTA band → footer. The connect
hub from the previous pass is in place and works.

**Problem.** The page is good in structure and thin in authority. The hero headline and the ask
form compete at the same weight, so nothing leads. The proof strip is four equal cells of plain
text. Everything sits on white, so the black car in the hero has no relationship with the rest of
the page. The testimonials section is a quote in a column with nothing beside it.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Hero** — dark stage, full-bleed, 86svh | Left: eyebrow, display headline with one italic serif word ("*actually*"), lede, two CTAs (cream primary, ghost secondary), and a signature rule — *Ed Portello · since 1999*. Right: the ask panel, docked as a glass card so it reads as a service, not a competing headline. Copy moves **out** of the left third of the photo, so the image is never covered |
| 2 | **Proof ribbon** — dark, hairline-divided | `25+ / 1999 / Same day / 1 person`. Changed from four equal cards to a single ruled strip, and the fourth stat becomes "**1** — person you deal with", because that is the differentiator, not "No pressure" |
| 3 | **Ed + the dock** — dark | Portrait (duotone grade) with the pull-quote and signature under it, beside a two-tile bento: **01 Fresh stock** (bronze-tinted tile, feed list with who/what/when) and **02 Ed is posting** (FB/X feed + chips). The "get alerts" form stays here but is demoted to a chip |
| 4 | **The floor** — **light ground**, deliberately | Eyebrow → display headline → sync line (mono, right) → condition rail → six vehicle plates, three across. Prices become real numbers. This is the breathing point in the page: white, photographic, scannable |
| 5 | **In their words** — dark, two columns | The quote at editorial serif scale on the left; on the right, four knowledge tiles that replace the old three-feature row: *Honest numbers · One person · After the sale · On your schedule*. The three identical cards are **cut** |
| 6 | **Closing CTA** — dark, deep | One sentence plus two buttons. No image, no card |
| 7 | Footer — deep ink | Four columns; the phone number is a link; hours and address reconciled with the contact page |

**Also cut:** the hero's competing second headline inside the photo overlay. **Also added:** the
vertical scroll cue at the right edge, and the sticky header that goes translucent on scroll
(it currently has `is-scrolled` in CSS but the mockup makes it a real glass bar).

---

## 2. Inventory index — `/inventory/` ▶ **built** (`mockups/inventory.html`)

**Today.** One `section.inventory-page`: head, filter accordion (search / year / condition /
body / price), **24 vehicle cards on page 1 of 2** (35 vehicles in total, 11 on page 2), a
Previous/Next pagination nav, a "compare vehicles" bar, a "not
seeing it?" block. Dense and functional.

**Problem.** Filters are hidden inside an accordion, so the page reads as an undifferentiated
wall of cars. Each card carries three or four buttons at equal weight. There is no sense of
inventory size or freshness at the top. 24 cards, each with three or four buttons, is a lot of
competing actions.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark, short | Eyebrow with the sync date, one display line — *"Thirty-five Cadillacs on the floor."* — and a two-line lede. The number in the headline is generated from the collection, so it is never stale |
| 2 | **Filter rail** — light, sticky | **Moved out of the accordion into a horizontal rail** at the top (search, year, condition, body, price, sort) plus a mono count on the right. One line, always visible |
| 3 | **Body** — light, 2 columns | Left: **persistent filter card** (model, condition, price slider, mileage slider, drivetrain, Apply/Reset, and the saved shortlist). Right: two-across plate grid |
| 4 | **Vehicle card** — light surface | Plate with condition tag → title → mono spec line → price (bronze, tabular) + exactly **two** actions: *Shortlist* (line) and *Ask about it* (red). Details/Compare/finance links collapse behind the card click |
| 5 | **Loading** | A **change**, not a fix: today the list paginates properly — 24 per page across 2 pages, with Previous/Next. The proposal replaces page reloads with "load more" on one list, keeping a real `/inventory/page/2/` for direct links and crawlers, and carrying a live count ("Showing 8 of 35") |
| 6 | **"Not seeing it?"** — dark stage | Same promise, rebuilt as a real section: the sourcing offer is the strongest differentiator on this page and currently sits below the fold in a light block |
| 7 | **Shortlist tray** — sticky bottom bar | Dark bar, thumbnail swatches, names, *Compare side by side* and *Send shortlist to Ed*. The site already has shortlist JS; this promotes it from a hidden feature to the page's second action |

---

## 3. Vehicle detail — `/inventory/<slug>/` (35 pages) ▶ **built** (`mockups/vehicle.html`)

**Today.** Breadcrumb → title with the stock number in it → one hero image → `dl` spec block →
`aside.vehicle-cta` with five stacked buttons → booking form → footer. Two columns on desktop.

**Problem.**

- The `<h1>` is the raw feed title: *"2026 CADILLAC Escalade ESV 1SA (#TZ602217)"*. A stock
  number in a headline is the single most "inventory system" thing on the site. Cadillac is in
  capitals in the middle of a sentence.
- One photograph per vehicle. For a $96k–$137k purchase.
- The spec block is a `dl` that reads as a list of rows rather than a specification.
- Five equally-weighted buttons in the aside means the primary action ("ask about this car") is
  not actually primary.
- The form is the last thing on the page, below everything, so the request happens after the
  buyer has already scrolled past their reason to act.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Breadcrumb + status** — dark | Mono breadcrumb; condition/sync chip inline — *New · arrived 26 Sep* |
| 2 | **Title block** | `<h1>` = *2026 Escalade ESV 1SA* — **stock number and VIN move to a mono micro-line beneath it** |
| 3 | **Gallery** | One 21:9 plate with the build summary on the scrim (colour over colour, drivetrain), then four 4:3 thumbnails. Plate system, not a lightbox |
| 4 | **Specification** — two-column `dl` | Same ten fields, re-set as a data block with hairline rules and tabular numerals. Add **Availability** ("on the floor") and keep *Stock last checked* |
| 5 | **What people ask about this one** **[NEW]** | Four Q&A rows — Price / Trade / Timing / This-vs-that — each written as the sentence a buyer would actually say, with one button: *Ask all four at once*. This is the module that turns a listing into a conversation |
| 6 | **Sticky action rail** (right, `position:sticky`) | Price → *Estimate only until Ed confirms* → four mini-specs → **one red primary** (*Ask about this Escalade*) → three ghost actions (test drive, trade, payment) → phone link. Below it, a bronze **"A note from Ed"** card with a signature — one paragraph, personal, specific to this car |
| 7 | **Book a test drive** — dark, two columns | Left: the expectation-setting copy (it's a request, not a slot; 9–6 Mon–Sat; same-day confirmation) with a two-cell stat ribbon. Right: the existing form, re-skinned. **Moved up** so it sits with the rail's promise, not at the very bottom |
| 8 | **Three to compare against** **[NEW]** | Same-money alternatives as plates, because the buying decision is comparative and the site currently offers nothing to compare with |

**Pre-owned variant.** Identical, plus: a condition banner above the spec (*Certified · one
owner*), the mileage promoted to the same weight as the price, and a second "what people ask"
question about service history.

---

## 4. About Ed — `/about/` ▶ **built** (`mockups/about.html`)

**Today.** A `page about` with a prose hero, four copy blocks (*Over 25 years · Selling the car
is the easy part · How to work together · Who you will actually deal with*), a one-person "team"
card with a filter row and a Send button, then a generic four-card feature grid — *Premium
Selection · Expert Service · Flexible Financing · Customer-First Approach* — then a CTA band.

**Problem.** This is the most important page on the site and it currently reads like a brochure
someone else wrote. The four feature cards are the worst offenders: they are generic dealership
copy that appears on ten thousand sites, they contradict the personal-specialist story, and one
of them ("Our certified technicians…") describes a department that the rest of the site says is
one person. "Who you will actually deal with" introduces a team, then shows one person.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Hero** — dark, two columns | Left: display headline *"One name on the deal, from the first question to the keys."*, the 1999 lede, two CTAs, and his signature at serif scale. Right: the portrait plate (duotone), captioned honestly |
| 2 | **Timeline** — dark, hairline rail with bronze nodes | 1999 → 2008 → 2017 → 2026, one line each. Longevity is the entire proposition; four dates make it concrete where prose does not |
| 3 | **How to work together** — light | Four numbered entries as a real ordered list, not cards: browse / finance or trade / service / anything else |
| 4 | **Why people buy from Ed** — dark, four tiles | `01 One person · 02 Honest numbers · 03 Answers on your schedule · 04 Still here later`. **The four generic feature cards are cut entirely** and replaced with four claims the rest of the site can support |
| 5 | **The quote** — dark, deep, centred, narrow | One paragraph in his own voice at editorial scale, with the signature. Nothing else on screen |
| 6 | Closing CTA | Two buttons |

**Also:** the one-person "team" section with the filter row is cut. It exists to show a staff
list that does not exist. If a second person is ever added, this is where they go — and the
filter row only appears at three people.

---

## 5. Test Drive — `/test-drive/`

**Today.** Two forms on one page: `appointment-form` → `/api/appointments` and
`test-drive-request` → `/.netlify/functions/schedule-test-drive`, plus an appointment type
selector, a sales-rep selector with one option, a date/time picker, a 36-car `<select>`, an
"how it works" three-step list, and a no-JS fallback. The strongest copy on the site.

**Problem.** Two overlapping booking forms is a bug, not a feature — a visitor cannot tell which
one to use. The sales-representative selector with a single option is dead UI. A 36-item native
`<select>` to choose a car is the weakest possible way to pick one.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark | Eyebrow + display: *"Half an hour in the car, on your own route."* Plus the honest line that it is a request, not a slot |
| 2 | **Which car?** **[NEW]** — light | Replaces the 36-item select: a searchable plate picker (thumbnail, title, price, condition) with the inventory feed behind it, and *"Something else — I'll describe it"* as the last pinned option |
| 3 | **Pick a time** — light, two columns | Left: appointment type as three segmented buttons (test drive / consultation / trade appraisal), real availability calendar, time slots. Right: the contact fields and *Request this appointment* |
| 4 | **How it works** — dark, three numbered steps | The existing copy, kept almost verbatim — it is good — as three tiles with the "bring your trade" step emphasised |
| 5 | **Talk instead** — dark strip | Phone number, contact link, and the no-JS fallback as a legitimate path rather than a `<noscript>` apology |

**Cut:** the `sales-rep` selector, and whichever of the two forms loses — one endpoint, one form.

---

## 6. Contact — `/contact/`

**Today.** `contact-message` block, then `contact-form-section` with the form, then "My
Information".

**Problem — the worst data on the site.** The page says *Cadillac of South Charlotte, 123 Luxury
Lane, Charlotte, NC 28277, Phone (704) 555-1234*, and *Sat 10–6*. The footer on the same page
says *10725 Pineville Rd, Pineville, NC 28134*, `803-431-6180`, and the header says *Sat 9–5*.
`(704) 555-1234` is a placeholder pattern. This is the page whose only job is to be contactable.

**2026 layout (do not build until the address, phone and hours are reconciled).**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark | *"Contact Ed"* + one line: what happens after you send |
| 2 | **Split: form / facts** — light, two columns | Form on the left (name, email, phone, model interest, message, single red submit, inline validation, success state that names the next step). On the right, a sticky facts card: **one** address, **one** phone, one email, hours, and *"or text me"* |
| 3 | **Map** — light, full-bleed plate | If there is a real location to show. Otherwise cut, and put the address in the facts card only |
| 4 | **Response promise** — dark strip | *Same day, usually the same hour. One person answers this.* |
| 5 | **Vehicle-aware variant** | When arriving from `/contact/?vehicle=<title>`, the vehicle field is pre-filled and the head reads *"Ask about the 2026 Escalade ESV 1SA"* — the intent-based flow already exists in the current markup; it just needs the headline to acknowledge it |

---

## 7. Financing — `/financing/`

**Today.** Prose: three financing routes (*GM Financial / Bank or credit union / Leasing*),
*What affects your rate* as a list, a **payment calculator** behind a "Show payment calculator"
toggle with sliders and an amortization table, then a "personalized number" CTA.

**Problem.** The calculator — the single most persuasive tool on the site — is switched off by
default with an apologetic note about missing endpoints, and the page above it is four blocks of
plain prose. Nothing on the page has a number on it. Also, "Leasing lowerises the monthly
payment" is a typo in live copy.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark | *"What this actually costs per month."* plus a pre-filled headline figure so the page opens with a number |
| 2 | **Calculator** — dark, promoted to first | The existing calculator, on by default, with sane defaults and the amortization table as a `table-wrap`. The "off until the endpoints exist" note becomes a one-line footnote. Fields in the order a buyer thinks: price → down → trade → term → rate |
| 3 | **Three routes** — light, three tiles | GM Financial / outside lender / lease, each with *"best when…"* — the existing copy, tightened |
| 4 | **What moves your rate** — light | Five items as a data list. Currently a bullet list in prose |
| 5 | **Rates are a moving target** — dark strip | The honest disclaimer plus *Get a real quote* as the primary button |

---

## 8. Trade-In — `/trade-in/`

**Today.** *Trading in your vehicle*, *How trade-in value is determined* (5 bullets),
*Reducing loan balance* (negative vs positive equity), *Before you come in* (3 bullets), then
*Get an appraisal* with two links.

**Problem.** A whole page about a number, with no number and no way to enter one. There is no
form at all — a visitor who wants an appraisal has to find the contact page. The copy is
genuinely good; it is just not actionable.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark | *"Two numbers matter. Yours is the first."* |
| 2 | **Appraisal request** **[NEW]** — light, two columns | Year / make / model / trim, mileage, condition, VIN (optional, with a "where to find it" hint), photos drop-zone (3–5 images, because a photo set doubles the accuracy of a first number), contact fields. This is the module the page is missing |
| 3 | **How value is determined** — light | The five existing bullets, as a numbered list with one line of explanation each |
| 4 | **Equity, plainly** — dark, two tiles | *Negative equity* vs *positive equity*, side by side with a worked example. Currently it is a two-item bulleted list in prose and it is the most confusing part of trading in |
| 5 | **Before you come in** — light | The three preparation items as a checklist with real tick boxes (visual only) |
| 6 | Closing | *Value my trade* → the appraisal form, not the contact page |

---

## 9. Service — `/service/`

**Today.** *Factory-trained service* prose, then three blocks: *Routine maintenance*,
*Diagnostics and repair*, *Collision* (each a heading plus bullets), then *Schedule service* with
a link to contact. One photograph on the whole page (the logo).

**Problem.** A service page with no service form and no imagery, on a site whose most loyal
audience already owns a car. The three lists are long bullets nobody reads.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark, with an image plate | *"Keeping a Cadillac in factory condition."* Plus the warranty/resale argument, which is the real reason owners service at a dealer |
| 2 | **Three service cards** — light | Maintenance / diagnostics / collision. Each: what it covers (**three** items, not six), typical duration, and a *Book this* button that carries the service type into the form |
| 3 | **Collision, explained** — dark strip | The recalibration point (cameras and radar need re-calibrating after any repair) is the most valuable sentence on the page. Give it a section and a diagram slot |
| 4 | **Book service** **[NEW]** — light | The missing form: model, year, mileage, service type, preferred date/time, notes |
| 5 | **Already own one?** — dark | Customer portal + "ask a question" split |

---

## 10. Specials — `/specials/`

**Today.** Two headings (*Current offers*, *Request a quote*) and a link row. Nothing else.

**Problem.** This is a thin page. It admits it has no offers ("pricing changes frequently, ask
directly") and offers three bullets and a link. It is almost certainly doing nothing in search
and nothing for a visitor.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark | *"What's on right now"* + last-updated stamp (mono) |
| 2 | **Offers** — light | Three offer plate cards: *New-vehicle incentives*, *Certified pre-owned*, *Lease terms*. Each with a real value if one exists, or **"Ask for today's number"** if not. Never a fake figure |
| 3 | **Request a quote** — light, two columns | The model/trim/budget form, inline, not linked out |
| 4 | **How Ed prices** — dark strip | One paragraph: OEM incentive data, dealer stock, lease programs — pulled on request. This converts "no offers listed" from a weakness into the reason to ask |

**Alternative, if offers genuinely do not exist:** fold this page into `/inventory/` as a filter
and 301 the URL. An empty specials page costs more trust than it earns.

---

## 11. Customer portal — `/customer/`

**Today.** A hero, then a login card (email + phone, no password), then four logged-in panels:
*Upcoming appointments*, *My vehicle preferences*, *Recent activity*, *Contact your sales
representative*, plus two modals (schedule appointment, send message). Everything is
`Loading…` in the shell state.

**Problem.** The login is the first thing, before any explanation of what is behind it. The
logged-out state is four empty "Loading…" panels, which looks broken rather than gated. The
phone-number-only auth is unusual and currently unexplained.

**2026 layout.**

| # | Section | Contents |
| --- | --- | --- |
| 1 | **Head** — dark | *"Your Cadillac, in one place."* + a three-item "what's inside" strip (appointments, preferences, messages) so the login has a reason |
| 2 | **Login** — light, one card, centred narrow | Email + phone, **plus one line explaining why a phone number and not a password** (it is the identifier Ed already has on file). Error and expired states named, not blank |
| 3 | **Logged in** — light dashboard | Two columns: left = upcoming appointments (with *Schedule*), preferences, recent activity. Right = your sales rep card with *Send a message*, and a *Your shortlist* panel fed from the inventory shortlist |
| 4 | **Contact strip** — dark | Phone + text, because half of the people who log in will just want to call |

---

## 12. Get a Quote — `/lead-form/`

**Today.** Head, a form (name/email/phone/model/message + honeypot), a modal thank-you, and an
inline no-JS fallback. `leadCapture.js` behind it.

**Problem.** It duplicates `/contact/` almost exactly, with a different backend
(`/api/lead` vs `/api/contact`). Two forms, two endpoints, one job.

**2026 layout.** Keep it, but **give it a distinct job**: this becomes the *quick quote* surface
used by every "get a number" CTA across the site, so the CTA always lands somewhere with a
shorter form than contact. Layout: single narrow column, dark head, light form card, the model
select as plate chips rather than a `<select>`, honeypot retained, success state that names a
timeframe ("Ed replies the same day"). Consolidate on one endpoint.

---

## 13. 404 — `/404.html`

**Today.** Headline, one line of apology, a link list, then the full footer.

**Problem.** Not much wrong, but it does not know *what* was missed, and a stale vehicle URL is
the most likely cause of a 404 on a site with 35 inventory pages.

**2026 layout.** Add: if the URL contains `/inventory/`, show a "that car may have sold" panel
with three similar vehicles and an *ask about it* button. Then the link list, then search.
Otherwise the same page, on a dark stage, with the display type.

---

## 14. Privacy Policy — `/privacy-policy/`

**Today.** Six prose sections, no table of contents.

**2026 layout.** Same copy, on a light ground, with a **sticky side table of contents** (the six
headings), a "last updated" stamp, and section anchors. Narrow measure, nothing else. This is
the page where decoration is a liability — the only design goal is scannability.

---

## 15. Communication Preferences — `/communication-preferences/`

**Today.** A heading. That is the entire page — the head, then the footer.

**Problem.** The privacy policy links to it as the way to opt out. It has no controls.

**2026 layout.** Build it: channel toggles (email, text, phone, post), a frequency choice, and
one *Save preferences* button, with a clear "we only use this for stock alerts" line. If it
cannot be built, remove it from the privacy policy and the footer — an opt-out page with no
opt-out is worse than no page.

---

## 16. Categories / Tags — `/categories/`, `/tags/`

**Today.** Taxonomy stubs rendering in the sitemap with no content strategy.

**2026 layout.** Either give them a purpose (category = body style or condition, so
`/categories/suv/` becomes a real landing page fed by inventory tags) or `noindex` them and drop
them from the nav. Do not leave them half-built in the sitemap.

---

## 17. Admin suite — 13 URLs: `/admin/` hub, `/admin/sign-in/`, `/admin/dashboard/`, `/admin/bookings/`, `/admin/leads/`, `/admin/leads-intake/`, `/admin/lead-scoring/`, `/admin/lead-assignment/`, `/admin/interactions/`, `/admin/followup-campaigns/`, `/admin/customers/`, `/admin/favourites/`, `/admin/search/`

**Today.** A shared `admin-header` + `admin-nav` (Leads, Dashboard, Follow-up campaigns, Lead
scoring, Lead assignment, Interactions, Bookings, Search, Favourites, Sign in), a bcrypt-hashed
`sales_reps` login, token-gated functions, and per-page JS. The sign-in page honestly documents
that `/admin/*` shell pages are public and only the functions are gated.

**Problem.** Two separate concerns. The **design** is a fine light admin, mostly reusing site
tokens — it needs almost nothing. The **security posture** is the real issue, and it is written
into the page's own copy: anyone can load the dashboard shell; only the data is protected.

**2026 layout (design).** Keep the light admin surfaces — do not apply the dark showroom
treatment to a data tool. Do: a **fixed left sidebar** instead of a horizontal nav strip; a
mono page header with the timeframe on the right; a KPI row of four tabular-numeral tiles above
the table; the filter row as a rail; empty, loading, error and expired-session states all
distinct and named. That is a half-day of CSS on top of the existing markup.

**Not a design task, but flag it:** closing the `/admin/*` shell exposure needs Netlify's path
password protection or a build-time split of the admin section. The page already says so; it is
worth acting on.

---

## 18. Cross-page items

| Item | Where | Action |
| --- | --- | --- |
| Header | All | Translucent sticky bar; utility strip (hours + three quick links) above it; keep one primary call button |
| Footer | All | Four columns; reconcile address/phone/hours with the contact page; add the hours to the footer so the utility strip can be dropped on mobile |
| `Text Ed` link | Home | The link is a malformed `tel:` URL with the number repeated, pointing at `sms:+17045557890` which matches nothing else on the site. Rebuild from `site.Params.phone` |
| Stock numbers in `<h1>` | 35 vehicle pages | Move to a mono micro-line under the title. Titles otherwise stay identical, so SEO is unaffected |
| `CADILLAC` in caps | Inventory + vehicle titles | Normalise to *Cadillac* |
| "lowerises" | `/financing/` | Typo in live copy |
| Empty `Year` `<select>` | Home + inventory | Renders an empty `<option value>` from a missing field |
| Images | All | Every page should have at least one art-directed image. Today `/about/`, `/service/`, `/specials/`, `/financing/`, `/trade-in/`, `/privacy-policy/` have none beyond the logo |
| **Inventory count label** | Home vs `/inventory/` | The home page renders "showing **6 of 32** in stock"; the inventory page renders "Showing 24 of **35** vehicles". Verified against the template: the home figure is Cadillacs only (`make = CADILLAC`), the list is everything in stock including three trade-ins. Both correct — but label the home one "6 of 32 Cadillacs" |
| **Inventory pagination** | `/inventory/`, `/inventory/page/1/` | The list paginates at 24 per page across 2 pages. `/inventory/page/1/` duplicates `/inventory/` and should canonicalise or redirect to it |
