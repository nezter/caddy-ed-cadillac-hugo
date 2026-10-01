# Planned Features vs. Reality

Every task in `.taskmaster/tasks/tasks.json` (45 tasks, 60 subtasks), checked
against the code as of 2026-09-30.

I did **not** use task-master to do this. You told me not to, and the honest
version of this document was produced by reading the code, not by trusting the
database's own status column — which turned out to be wrong in both directions.

---

## The headline

The database is not a reliable record of what this project planned. Three
things are true at once:

1. **~10 tasks describe an architecture that was abandoned** and will never be
   built. They are all still `pending`, so they read as a backlog.
2. **Several tasks marked `done` are not done**, or are done against something
   that does not exist.
3. **The genuinely missing work is smaller and more specific than it looks** —
   and it is written down at the bottom of this file.

Read this file rather than `tasks.json` when deciding what to do next.

---

## A. Tasks premised on an architecture that was abandoned — delete these

Tasks **34, 35, 36, 37, 38, 39, 40, 41, 42, 43** all describe a **Supabase
primary with Turso as a cache/replica**, with change-data-capture sync between
them:

| # | title | premise |
|---|---|---|
| 34 | hybrid database manager | routes writes to Supabase, reads to Turso |
| 35 | migrate customer search to Turso (FTS5) | dedup cache + FTS5 |
| 36 | lead dedup caching in Turso | "reduce Supabase load" |
| 37 | analytics data to Turso | replica |
| 38 | session/preferences caching in Turso | replica |
| 39 | Supabase → Turso synchronisation | CDC |
| 40 | inventory search with Turso | hybrid |
| 41 | edge caching layer | Turso + Redis |
| 42 | DB perf monitoring for both | Supabase **and** Turso |
| 43 | documentation for the hybrid architecture | documents the above |

**Supabase is not configured on this deployment and cannot be.** Netlify Database
is blocked by the plan, so the single-store decision went to Turso/libSQL. Task
34 is marked `done` — and what it produced is the second data layer now flagged
for removal (`lib/database.js`, `enhanced-database-service.js`). Task 43 would
document a system that does not exist.

**Ten pending tasks are describing infrastructure this project deliberately
stopped building.** They are the biggest thing in the backlog and none of it is
work anyone wants.

**Recommendation:** delete 34–43 rather than closing them. A backlog entry for a
system you decided against is worse than no entry, because it makes the real
backlog look bigger and older than it is.

---

## B. Statuses that are wrong — in both directions

### Marked `done`, but not done

| # | marked | reality |
|---|---|---|
| 6 | CRM integration | `CRM_API_KEY` is unset. The CRM call was removed from `lead-management.js` on 2026-09-30 and is now genuinely optional. "Done" meant done against a service that was never configured. |
| 34 | hybrid DB manager | see above — the thing built is the second data layer we now want deleted. |

### Marked `pending`, but actually done

| # | marked | reality |
|---|---|---|
| 32 | set up Turso | **all four subtasks are `done`** (instance, auth, connection config, connectivity tested). The parent status is simply stale. |
| 33 | Turso-compatible schema | `database/turso/schema.sql` exists, and `check-insert-columns.js` / `check-select-columns.js` verify every INSERT and SELECT against the live database. This is done. |
| 8.5 | auth middleware | `utils/auth-middleware.js` exists and is used by 19 functions. |
| 8.4 | role-based access controls | permission checks exist, and `ci/check-permissions.js` validates the vocabulary. |

### Stuck mid-flight on things that were superseded

| # | state | reality |
|---|---|---|
| 10 | pending, high | "enhance `fetch-inventory.js`" — that file does not exist. Replaced by `scripts/inventory/`. `INVENTORY_SOURCE_URL` is unset, so there is no feed at all. |
| 11 | in-progress | "update `inventory-api.js` HTML selectors". `inventory-api.js` is a dead function. 11.2 in-progress, 11.3/11.4 pending — three tasks of effort on a scraper for a source that isn't configured. |
| 8.3 | in-progress | session management. `utils/session-manager.js` exists. Probably done; needs a look. |

---

## C. Genuinely unfinished, and worth doing

These are real. Grouped by why they matter.

### Task 17.3 — consent is checked, but the check is defeated by a type mismatch

I originally wrote that "nothing checks whether the person opted out before
sending". **That was wrong**, and it is the same mistake this project has made
before — reading a guard's absence from one place and not looking at the type.

The guard exists. `utils/followup-service.js:104-113`:

```js
static async shouldSendFollowup(followup) {
  // Check if customer has unsubscribed
  if (followup.email && !followup.email_consent) return false;
  if (followup.sms    && !followup.sms_consent)    return false;
```

`communication-preferences.js` can set consent, opt-out sets it to `false`, and
`addUnsubscribeFooter()` puts an unsubscribe link in the email. That part is
real and should be credited.

**But the columns are TEXT, not BOOLEAN:**

```sql
-- database/turso/schema.sql:153-154, 300-301
email_consent TEXT DEFAULT false,
sms_consent   TEXT DEFAULT false,
```

So a followup with no explicit consent carries the **string** `'false'`, not the
boolean `false`. In JS a non-empty string is **truthy**, so:

```js
!followup.email_consent   //  !'false'  ->  false
```

The guard does not fire. A row that says "no consent" is treated as "consented".

Nothing in the normal flow sets `email_consent` on a followup anyway — only
`seed-test-data.js`, `seed-analytics.js` and a test script do — so **the default
`'false'` applies to real follow-ups**, and the default is the value the guard
reads as consent.

This is the exact shape of the bugs found this week: a control that is present,
plausible, and inert. It only becomes visible the moment SMTP is configured,
which is the next thing anyone will do.

**Two things need verifying before fixing**, because I could not execute:

1. Read a live `followups` row and confirm the value's JS type
   (`SELECT typeof(email_consent) FROM followups LIMIT 1;` — expect `text`).
2. Confirm whether SQLite/libSQL coerces on read, which would change the
   conclusion.

**The fix, and its consequence.** Two changes, and the second one matters:

1. `shouldSendFollowup()` now reads consent through `hasConsent()`, which only
   accepts `true` / `'true'` / `1` / `'yes'` / `'y'` / `'on'`. Everything else,
   including the string `'false'`, is a refusal.
2. `createFollowupFromRule()` now **copies consent onto the followup row**. The
   INSERT listed thirteen columns and neither `email_consent` nor `sms_consent`
   was among them, so every follow-up took the column default — the string
   `'false'` — and had nothing to do with whether the customer had agreed.

Change 1 alone would have been worse than the bug: it would have suppressed
*every* follow-up, because no row would ever carry a grant.

**Read this before enabling follow-ups.** After both changes, follow-ups are
suppressed unless the customer has consent recorded, and **nothing in the live
flow records it**:

- `customers.email_consent` / `sms_consent` are `TEXT DEFAULT false`
- `sales-customers.js` sets them from staff input
- `communication-preferences.js` sets them when a customer opts in
- **no lead-creation path sets them**

So the follow-up system is now **safe and silent**. Previously it was unsafe and
loud. That is the right trade — consent that is not recorded is not consent — but
it means the feature does nothing until someone decides how consent is captured.

**That decision is not mine to make.** The options are roughly:

- treat submitting an enquiry form as consent to a service follow-up (the usual
  basis for contacting someone who asked to be contacted — but it should be
  stated on the form)
- ask explicitly at enquiry time, which adds a field to every form
- keep it opt-in only, via `/communication-preferences`

The first is probably right for this business, and it is one line in
`utils/inquiry.js`. But it is a legal and commercial judgement, so it is written
down rather than assumed.

**Also worth fixing, and cheap:** `followups.email` and `followups.sms` are
*also* `TEXT DEFAULT false`. So `if (followup.email && ...)` sees the string
`'false'` as a truthy "yes, send an email" — to nobody. Same class of bug, two
columns over.

### GDPR — task 20, pending

Data export, deletion requests, consent management. The site now stores real
customer PII — name, email, phone, on bookings and leads — with **no way for a
customer to have it exported or deleted**. This stopped being theoretical when
the enquiry path started working.

### Audit logging — task 21, pending

No record of who changed a customer record. `lead-merge.js` folds two customer
identities into one, irreversibly, and nothing records that it happened or who
did it. It also had no authentication until today.

### Admin user management — task 45.3 / 45.4, pending

- **45.3** — no admin UI for creating staff, assigning roles, or managing
  permissions. The live `sales_reps` table contains **one junk row** (`r2`,
  `ab@c.co`, a 10-character password hash) and no real staff row, because
  Identity JIT-provisions on first sign-in and nobody has signed in.
- **45.4** — no two-factor authentication, no login-attempt monitoring.

### Tests — task 24, pending

Four subtasks, all pending. Currently ~107 passing, ~11 failing, and **no
coverage gate**.

### Monitoring — task 28, pending

No error tracking or alerting anywhere. Every failure mode found this week
produced a *silent* success rather than an error — which is precisely what
monitoring exists to catch, and there is none.

### Customer feedback — task 19, pending, low

Post-purchase surveys. Blocked behind 15 and 18, both partial.

### Not code — planning only

- **27** TypeScript migration plan
- **31** Core Web Vitals tracking
- **30** deployment procedures (largely done: `ci/run.sh`, `ci/webhook-receiver.js`, `docs/deployment.md`)

---

## D. Tasks with no artifact at all

**Nothing anywhere was ever made for these.** Not started, not partial, no code
named:

- **13** finance application workflow — needs a credit bureau. Subtasks 13.1–13.4
  all pending. `pre-approval.js` now *records* the application, so this is a
  starting point rather than a blank.
- **45.1 / 45.2 / 45.5** user profiles, customer account management, bulk import/export
- **28, 31** monitoring and web vitals
- **20, 21, 19** GDPR, audit logging, feedback

---

## E. The seed data hazard (task 44, marked `done`)

Task 44 seeded ~100 customers, ~200 leads, vehicles, interactions, appointments
and analytics, and is marked done. Four scripts remain in `scripts/`:

```
seed-test-data.js   ~100 customers, ~200 leads, interactions, appointments
seed-vehicles.js
seed-sales-reps.js
seed-analytics.js
```

Every address is `@example.com`, so the rows are identifiable fiction.

**`seed-test-data.js` had no guard of any kind** — no confirmation, no
environment check, no warning. It writes to `TURSO_DATABASE_URL`, and the live
Turso database is the dealership's real customer store, read by `/admin/leads`
and `/admin/bookings`.

So the hazard was: run the seed to look at a populated dashboard, and the
dealership's real dashboards then show 300 people who do not exist — with
nothing on the page to distinguish them from real customers.

That is now guarded. It requires `ALLOW_FAKE_CUSTOMER_DATA=1` and prints the
target URL and a `DELETE` statement before writing anything.

**The other three scripts have the same hazard and have not been fixed yet.**

**Verify:** the live `leads`, `customers` and `booking_requests` tables were
observed empty on 2026-09-30, so the seed data is **not** currently in the live
database. That was a single observation, not a check — confirm with
`SELECT COUNT(*) FROM customers WHERE email LIKE '%@example.com';`

---

## F. What the task database got wrong about this week

Task **29, "comprehensive security audit"**, was `pending` with all five subtasks
pending. On 2026-09-30 that audit effectively ran — for 29.1 (auth and
authorization) and 29.2 (API security) — and found:

- **six endpoints with no authentication**, three serving or destroying customer
  records
- **four functions verifying staff tokens against a literal string** published in
  this public repository
- **one open mail relay** waiting on a credential
- a customer-enumeration oracle, and a fake confirmation number shown to a
  customer

So 29.1 and 29.2 are substantially done. **29.3 (data handling and privacy) and
29.4 (infrastructure) are not** — 29.3 is task 20 above.

`ci/check-function-auth.js` was written so this class of finding has a gate, and
so 29.1/29.2 do not silently reopen. See [`SECURITY.md`](SECURITY.md).

---

## The short version

| | count |
|---|---|
| Tasks describing an abandoned architecture — **delete** | 10 |
| Statuses that are simply wrong | 6 |
| Genuinely unfinished and worth doing | 8 |
| With no artifact at all | 10 |

**If you want one thing out of this list:** task **17.3**. Not because consent is
missing — it is not, and I said otherwise before looking — but because the
check that exists is defeated by a `TEXT` column holding `'false'`, and it only
becomes a real problem the moment SMTP is configured.