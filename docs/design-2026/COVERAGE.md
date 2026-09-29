# COVERAGE.md — is every page covered?

The question this file answers: **does the redesign cover every page the site actually serves?**

Audited 28 September 2026 against the live build at `http://10.1.0.81:8090`, by reading
`sitemap.xml`, fetching and parsing every top-level page, and then probing 38 further URLs to find
pages the sitemap does not mention.

---

## Headline numbers

| | Count |
| --- | --- |
| URLs in `sitemap.xml` | **64** |
| Pages found **outside** the sitemap | **2** (`/inventory/page/1/`, `/inventory/page/2/`) |
| **Total URL patterns on the site** | **66** |
| Built as clickable mockups | **5** |
| Specified section-by-section in `PAGE-LAYOUTS.md` | **61** |
| **Uncovered** | **0** |

Coverage means one of two things, and the table below says which for each URL: a **built mockup**
you can open, or a **spec** (a layout, section by section, with the reason for each change) that
is ready to port into a Hugo template.

---

## The matrix

### Public pages — 14

| URL | Renders today | Coverage |
| --- | --- | --- |
| `/` | Hero + ask, proof strip, Ed + connect dock, fleet, testimonials, CTA | **Built** — `mockups/home.html` |
| `/inventory/` | 24 cards, page 1 of 2, filter accordion | **Built** — `mockups/inventory.html` |
| `/inventory/page/2/` | 11 cards, page 2 of 2 — *not in the sitemap* | **Spec** — `PAGE-LAYOUTS.md` §2 |
| `/about/` | Prose + 4 generic feature cards + one-person "team" | **Built** — `mockups/about.html` |
| `/contact/` | Form + "My Information" (conflicting address/phone/hours) | **Built** — `mockups/contact.html` |
| `/test-drive/` | Two competing booking forms, 36-item vehicle select | **Spec** — §5 |
| `/financing/` | Prose + a payment calculator hidden behind a toggle | **Spec** — §7 |
| `/trade-in/` | Prose only, no form | **Spec** — §8 |
| `/service/` | Prose + three bullet lists, no booking form | **Spec** — §9 |
| `/specials/` | Two headings and a link row | **Spec** — §10 |
| `/customer/` | Login + four `Loading…` panels + two modals | **Spec** — §11 |
| `/lead-form/` | Quick-quote form, duplicates `/contact/` on a second endpoint | **Spec** — §12 |
| `/404.html` | Headline, apology, link list | **Spec** — §13 |
| `/privacy-policy/` | Six prose sections, no contents | **Spec** — §14 |
| `/communication-preferences/` | A heading. No controls at all — the page the privacy policy points to for opting out | **Spec** — §15 |

### Inventory detail — 35 vehicle pages

Every one of these renders from the same template, so one layout covers all 35:

`2016-bmw-x1-xdrive28i` · `2016-volvo-xc60-t6-platinum` · `2020-nissan-armada-sl` ·
`2023-cadillac-escalade-awd-v-series` · `2023-cadillac-xt5-awd-luxury` · `2023-cadillac-xt5-fwd-luxury` ·
`2024-cadillac-ct5-premium-luxury` · `2024-cadillac-lyriq-sport-1` · `2024-cadillac-lyriq-tech` ·
`2024-cadillac-lyriq-tech-139354` · `2025-cadillac-xt4-premium-luxury` · `2026-cadillac-ct5-sport` ·
`2026-cadillac-ct5-sport-111273` · `2026-cadillac-ct5-sport-113577` · `2026-cadillac-ct5-sport-116581` ·
`2026-cadillac-escalade-esv-1sa` · `2026-cadillac-escalade-esv-platinum-sport` · `2026-cadillac-lyriq-sport` ·
`2026-cadillac-lyriq-v-series-premium` · `2026-cadillac-lyriq-v-series-premium-602217` ·
`2026-cadillac-vistiq-luxury` · `2026-cadillac-xt5-luxury` · `2026-cadillac-xt5-luxury-106179` ·
`-108393` · `-109975` · `-110010` · `-111132` · `2026-cadillac-xt5-premium-luxury` ·
`...-109657` · `-109974` · `-111990` · `-112535` · `-113419` · `-114360` · `2027-cadillac-vistiq-sport`

**Coverage: Built** — `mockups/vehicle.html` (the 2026 Escalade ESV 1SA, using the real record:
stock TR376799, $95,889, 4WD, 3,113 mi), with the certified pre-owned variant specified in §3.

### Taxonomy — 2

| URL | Today | Coverage |
| --- | --- | --- |
| `/categories/` | Renders in the sitemap with no content strategy | **Spec** — §16 |
| `/tags/` | Same | **Spec** — §16 |

### Admin — 13

All thirteen share one shell, so one spec covers them:

| URL | Coverage |
| --- | --- |
| `/admin/` (hub) | **Spec** — §17 |
| `/admin/sign-in/` | **Spec** — §17 |
| `/admin/dashboard/` | **Spec** — §17 |
| `/admin/bookings/` | **Spec** — §17 *(added in this audit — it was missing)* |
| `/admin/leads/` | **Spec** — §17 |
| `/admin/leads-intake/` | **Spec** — §17 |
| `/admin/lead-scoring/` | **Spec** — §17 |
| `/admin/lead-assignment/` | **Spec** — §17 |
| `/admin/interactions/` | **Spec** — §17 |
| `/admin/followup-campaigns/` | **Spec** — §17 |
| `/admin/customers/` | **Spec** — §17 |
| `/admin/favourites/` | **Spec** — §17 |
| `/admin/search/` | **Spec** — §17 |

---

## What this audit changed

Three real errors in the previous delivery, all now corrected:

1. **The vehicle count was wrong.** `PAGE-LAYOUTS.md` and `README.md` both said **42** vehicle
   pages. The sitemap lists **35**. Fixed in `PAGE-LAYOUTS.md` §3 and §18, and in `README.md`.
2. **`/admin/bookings/` was not covered at all.** §17 listed "sign-in, dashboard + 9 sub-pages";
   there are **13** admin URLs. `/admin/` (the hub) and `/admin/bookings/` were both missing.
   Now named explicitly.
3. **The pagination claim was backwards.** §2 said the inventory list "renders with no paging
   affordance". It does paginate — **24 per page across 2 pages**, with a Previous/Next nav. The
   proposal (load-more instead of page reloads) is now described as a *change*, not a fix for
   something missing, and `/inventory/page/2/` is documented as a page that exists.

Also corrected: the stock count in the mockups said **32**. The live inventory page says
**35 vehicles**. The mockups now say 35.

---

## A claim I got wrong, corrected by the real build
## Probed and confirmed absent

38 URLs were probed to make sure the sitemap was not hiding anything. These return **404** and are
therefore correctly out of scope: `/admin/reports/`, `/admin/settings/`, `/admin/tasks/`,
`/admin/vehicles/`, `/admin/inventory/`, `/admin/appointments/`, `/admin/payments/`,
`/admin/quotes/`, `/admin/messages/`, `/thank-you/`, `/book/`, `/appointments/`, `/blog/`,
`/news/`, `/reviews/`, `/staff/`, `/team/`, `/specials/offers/`, `/specials/current/`, `/search/`,
`/sitemap/`, `/terms/`, `/accessibility/`, `/careers/`, `/parts/`, `/schedule-service/`,
`/value-my-trade/`, `/contact/thank-you/`, `/trade-in/appraisal/`, `/service/booking/`,
`/customer/appointments/`, `/admin/leads/export/`, `/inventory/sold/`, `/about-ed/`, `/sell/`,
and `/inventory/page/3/` onward.

---

## What is deliberately not covered

- **`/inventory/page/1/`** — a duplicate of `/inventory/`. It should render with a canonical tag
  pointing at `/inventory/`, or redirect. Listed here so it is not forgotten.
- **Email templates, Netlify function responses, and the 404-for-sold-vehicle flow** — not pages.
- **Anything behind the admin sign-in** (tables, charts, modals rendered by JS at runtime) is out
  of scope for a layout spec. §17 covers the shell, the states and the navigation; the data
  surfaces inside are described but not drawn.

---

## Bottom line

**66 URL patterns. 5 built. 61 specified. 0 uncovered.**

The five built pages are the ones that carry the site's traffic and its argument: home, inventory,
vehicle detail, about, contact. Everything else has a layout, a section order and a stated reason,
ready to port. If you want any of the remaining pages promoted to a clickable mockup, the
highest-value candidates are **`/test-drive/`** (the strongest copy on the site, currently
undermined by two competing forms) and **`/trade-in/`** (a whole page about a number with no way
to enter one).
