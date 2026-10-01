# Feature Inventory

What the backend can do, what a visitor or staff member can actually reach, and
the gap between them. Every number is from a script in `ci/`, re-runnable.

```bash
node ci/verify-endpoints.js          # functions vs live call sites
node ci/verify-endpoints.js --all    # + dead modules still calling unrouted paths
```

## The headline

| | count |
|---|---|
| Functions in `netlify/functions/` | 51 files |
| …of which are **not functions at all** (config + test scripts) | 4 |
| …of which have **no handler** and cannot serve a request | 5 |
| **Real, working functions** | **42** |
| Real functions **reachable from a live page** | **15** |
| Real functions **no page can call** | **27** |
| JS files in `site/assets/js/` | 71 |
| …reachable from a declared entry | 7 |
| …**dead** (469 KB) | 64 |

**Roughly a third of the backend is wired to anything.** The rest is code that
compiles, bundles, passes `fn-bundle` and is never executed by a human.

## Why this happened

Not one big mistake — three small ones that compounded:

1. **The functions were written first.** `netlify/functions/` has ~8,000 lines
   across 42 handlers covering leads, scoring, assignment, campaigns,
   interactions, inventory, scheduling, search and notifications.
2. **The front end was written separately and never connected.** The pages were
   static Hugo templates; the features were serverless handlers. Nothing in
   either direction required them to meet.
3. **The dead front end was never removed.** 64 JS modules, 469 KB, including
   four complete competing implementations of the same ideas
   (`inventory.js`, `inventory-display.js`, `inventory-fetcher.js`,
   `inventory-init.js`, `inventory/list.js`, `vehicle-inventory.js`).

So there are two stacks — one that runs and one that doesn't — and the gate
suite could not tell them apart because it only checked that things *compile*.

`ci/verify-endpoints.js` now closes that: it resolves the JS import graph from
every declared entry (including entries declared in Hugo templates, which a JS
import graph cannot see) and fails on any call that reaches nothing.

## Reachable (15) — the working surface

| function | lines | notes |
|---|---|---|
| `contact-form` | 157 | the public enquiry form |
| `communication-preferences` | 508 | 4 sub-paths: customer, unsubscribe, update, opt-out |
| `lead-duplicates` | 57 | stats + single-lead check |
| `lead-merge` | 51 | merge duplicate rows |
| `followup-campaigns` | 588 | |
| `followup-rules` | 485 | |
| `followup-analytics` | 516 | 5 sub-paths incl. `/dashboard`, `/track`, `/click` |
| `sales-leads` | 176 | |
| `sales-metrics` | 219 | |
| `sales-appointments` | 162 | |
| `sales-add-note` | 132 | |
| `sales-update-status` | 169 | |
| `sales-complete-appointment` | 152 | |
| `email-templates` | 639 | |
| `sms-templates` | 647 | |

Admin: `/admin/leads` (dedupe stats, duplicate check, manual merge),
`/admin/dashboard` (leads, appointments, metrics, filters), 
`/admin/followup-campaigns` (campaigns + analytics tabs).
Customer: `/communication-preferences`. Public: contact form.

## Orphaned — the gap

> **RECHECK THIS TABLE BEFORE TRUSTING IT.** It was written before the September
> audit, and audit changed a lot of it. Several "dead" front ends below are now
> loaded, several functions changed what they do, and one function gained
> authentication it never had. Line counts and sizes are as-recorded and have not
> been re-measured.
>
> What is certain as of 2026-09-30:
>
> - `send-notification` has **no in-repo caller at all**. It is staff-only now
>   and nothing calls it; the three functions that used to fetch it over HTTP
>   call `utils/inquiry.js` in-process instead.
> - `schedule-appointment` is **not** on this list. It did not exist; it exists
>   now.
> - `contact-salesperson` did return a directory for a POST; it records now.
> - `vehicle-features`, `booking-queue`, `lead-merge`, `lead-duplicates`,
>   `lead-management` are all wired and now require staff tokens. See
>   [`SECURITY.md`](SECURITY.md).

| function | lines | what it would do | front end that exists but is not wired |
|---|---|---|---|
| `leads` | 324 | lead list/CRUD | — |
| `lead-management` | 106 | lead admin | `lead-management.js` (6.9 KB, dead) |
| `lead-form` | 158 | lead capture | `leadCapture.js` (10.4 KB, dead) |
| `lead-scoring` | 201 | score a lead | `components/lead-scoring-dashboard.js` (13.3 KB, dead) |
| `lead-assignments` | 171 | rep assignment | `components/lead-assignment-dashboard.js` (13.5 KB, dead) |
| `interactions` | 488 | customer interaction log | `components/interaction-timeline.js` (16.2 KB, dead) |
| `sales-customers` | 329 | customer list | `customerRelationship.js` (10.5 KB, dead) |
| `sales-login` / `sales-logout` / `sales-auth-check` | 141 / 61 / 35 | staff auth | `performanceTracker.js` calls auth-check; dead |
| `customer-auth` | 128 | customer login | `customer-portal.js` has a login form |
| `customer-dashboard` | 187 | customer home | shortcodes exist, wired |
| `send-notification` | 405 | notifications | `components/notification.js` (5.9 KB, dead) |
| `inventory-api` | 124 | inventory read | `inventory-fetcher.js`, `api/inventory-proxy.js` dead |
| `inventory-advanced` | 216 | advanced filters | `inventory/FilterManager.js` (18.6 KB), `FilterUI.js` (20.6 KB) dead |
| `inventory-proxy` | 198 | cross-origin proxy | dead |
| `inventory-fetch` / `inventory-sync` | 319 / 106 | feed pull | superseded by `scripts/inventory/` |
| `vehicle-details` | 59 | vehicle data | `vehicle-detail.js` (10.7 KB, dead) |
| `search` | 455 | site + inventory search | `components/advanced-search.js` (31.4 KB, dead) |
| `schedule-test-drive` | 158 | book a test drive | `appointment-scheduler.js`, `schedulingCalendar.js` dead |
| `contact-submission` / `submission-created` | 71 / 78 | submission lifecycle | `contact-form.js` (7 KB, dead) |
| `followup-campaigns-simple` | 27 | — | superseded by `followup-campaigns` |
| `health-check` | 337 | liveness | reachable at `/health` via redirect |
| `test-*` (5 files) | — | not functions | — |

Several have a **written front end that no page loads** — the work is done on
both sides and the join is missing. `components/advanced-search.js` is 31.4 KB
of finished UI against a 455-line `search` function.

## Not functions

`netlify/functions/` is also where config and one-off test scripts ended up.
Netlify bundles all of them as functions on every deploy.

- `babel.config.js`, `jest.config.js`, `jest.config.simple.js` — config
- `test-basic.test.js`, `test-connection.js`, `test-health.js`,
  `test-minimal.js`, `test-performance.js`, `test-performance-simple.js`,
  `test-security.js` — ad-hoc probes
- `lead-api.js` — **0 bytes**

## Declared gap

**`KNOWN_MISSING` is now EMPTY, and that is the point.**

`ci/verify-endpoints.js` carried one entry: **`schedule-appointment`**, the
customer portal's "schedule appointment" form, which POSTs to a function that
did not exist. It had 404'd on every submission since the portal was built, and
the customer was shown an error after choosing a date.

The nearest candidate, `schedule-test-drive`, was rejected for the right
reasons — it requires a `vehicleId` the form never collects, and validates six
required fields against names the portal does not send (`fullName` vs
`customer_name`, `email` vs `customer_email`, `preferredDate` vs
`scheduled_date`). These are two different features: a service appointment for an
existing customer, versus a test drive for a prospect.

So `netlify/functions/schedule-appointment.js` was written. It takes the portal's
own field names and records through `utils/inquiry.js` into `booking_requests`,
with `vehicle_id` blank and the service type carried in `vehicle_title` — so a
service visit is never mistaken for a drive, and the booking lands where
`/admin/bookings` reads it.

The entry was **removed from the allowlist rather than left in it**. The list is
a receipt for unimplemented functionality, so a receipt for something now
implemented is just a lie that keeps a gate quiet. Every future entry added
there is a customer-facing promise this site does not keep.

It needs a storage decision before it can be written: the pending Supabase +
Turso programme (12 taskmaster tasks, all blocked behind each other) is the
obvious home, and inventing a storage shape now would be guessing.

## The 64 dead JS modules

469 KB that compiles, lints, and ships in no bundle. Grouped by what they were
for:

| group | files | KB | notes |
|---|---|---|---|
| inventory | 17 | 140 | six competing implementations of the same page |
| sales/CRM | 11 | 115 | includes four `lead-management*` variants |
| scheduling | 6 | 26 | three calendar implementations |
| search/finance | 3 | 47 | `advanced-search.js` 31 KB is the notable one |
| contact | 5 | 43 | three form managers |
| other | 22 | 98 | carousel, calculator, menu, navbar, lazyload |

`docs/test-status.md` → "Known dead files" predates most of this and should be
regenerated from the current graph rather than maintained by hand.

## What to do about it

Deliberately not decided here, because each option is a product decision:

1. **Wire what exists** — for each orphaned function, either add a page that
   uses it or delete it. `components/advanced-search.js` + `search` is the
   highest-value single item: 486 lines already written on both sides.
2. **Reap the dead front end** — 469 KB and six competing implementations of the
   inventory page. Deleting reduces the surface someone has to reason about.
3. **Move config and tests out of `netlify/functions/`** — 9 files that should
   never have been bundled as functions.
4. **Give the gate teeth for dead code** — `verify-endpoints.js --all` already
   lists dead modules with unrouted calls; the next step is a coverage floor
   (e.g. "no function below 50 KB may be orphaned without a comment") so the
   ratio cannot silently regress.
