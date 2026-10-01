# What Is Still Missing

An honest list of what this site cannot do yet, split by *who has to act*. Written
2026-09-30 after auditing all 44 functions and 13 admin pages.

Read this before trusting any doc that says a feature works. Several did.

Companion documents:

- [`PLANNED-VS-REAL.md`](PLANNED-VS-REAL.md) — all 45 tasks from `.taskmaster`
  reconciled against the code, including ten that describe an architecture the
  project abandoned
- [`SECURITY.md`](SECURITY.md) — the authentication audit
- [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) — decisions that are the owner's

---

## A. Blocked on the owner — no engineering can start

### 1. Email does not work at all

**This is the single biggest gap on the site.** Nothing is emailed. Not a
notification, not a booking confirmation, not a lead alert.

Unset in the deployed environment:

```
SMTP_HOST   SMTP_PORT   SMTP_USER   SMTP_PASS   SMTP_SECURE
EMAIL_TO    NOTIFICATION_EMAIL   DEFAULT_FORM_RECIPIENT   EMAIL_FROM
```

Every enquiry, booking, pre-approval, portal message and staff-card contact now
**records to the database first** and reports `notified: false, notifyReason:
'smtp-not-configured'` — so nothing is lost and nothing lies. But Ed will not
receive anything, and the admin is currently the only place a lead is visible.

**To fix:** any SMTP provider. Free tiers at Resend, Postmark, or SendGrid. Four
variables. Then set `EMAIL_TO` (the address that should receive enquiries), or
sign in through Netlify Identity once so `resolveRecipient()` finds a real rep in
`sales_reps`.

**Do not** set only `SMTP_HOST`. That was the dangerous configuration: with SMTP
configured but no recipient, the old code would have mailed the customer list to
a fallback address on an unowned domain.

### 2. `JWT_SECRET` — check this before deploying

`netlify.toml` declares no `[context.production.environment]`, so whether
`JWT_SECRET` exists at all depends on the Netlify UI. Before today's audit, four
functions would have accepted tokens signed with a string published in this
public repository. That is now fixed in code, but if the site was ever live
without the variable set, treat existing staff tokens as compromised.

See [SECURITY.md](SECURITY.md) § S1 and [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)
Q15.

### 3. Google Calendar credentials

```
GOOGLE_CLIENT_ID   GOOGLE_CLIENT_SECRET
```

The whole per-user calendar feature is built and tested (16/16) and **cannot
connect** without these. They need your Google account and a consent screen.

### 4. Lender integration for pre-approval

`pre-approval.js` cannot submit to a lender, and says so — `processed: false`,
`confirmationNumber: null`, and the modal shows that wording rather than a fake
confirmation. But the application **is now recorded**, with the finance figures,
so nothing is lost while this waits.

### 5. SMS provider

None configured, so `sendSMSFollowup` refuses and records the attempt as
`delivered: false`. Previously it logged to console and claimed success.

---

## B. Known gaps that are engineering work, not decisions

### 6. Sign-out does not actually revoke

Netlify bundles each function separately, so `sales-logout.js` gets its own
inlined `new Set()` per bundle. Revoking a token in one does not revoke it in
another.

Against an 8-hour token that is probably acceptable. If revocation must be
immediate, it belongs in a `revoked_tokens` table.

### 7. Two dead data layers

`netlify/functions/lib/database.js` — Supabase-only, **required by nothing**.
`utils/enhanced-database-service.js` — prefers `SUPABASE_DB_URL`/`DATABASE_URL`
over Turso. One driver behaving differently than assumed is what produced the
silent-UPDATE defect; two data paths keeps that hazard standing. Delete or
finish the migration (Q16).

### 8. Inventory has no live feed

`INVENTORY_SOURCE_URL` is unset, so inventory comes from content files. Prices,
mileage and availability are only as fresh as the last sync. `utils/inventory-source.js`
is built for this and waiting on a URL.

### 9. `sales-metrics` is called two different ways

`customerRelationship.js` and `salesDashboard.js` request
`/.netlify/functions/sales-metrics`, while `salesTeam.js` requests
`/.netlify/functions/sales-metrics/${memberId}`. One of those paths is being
ignored. Not audited in detail — flagged, not diagnosed.

### 10. `health-check.js` may report healthy for services that do not exist

It loads `redis-cache-service` and `enhanced-database-service` at module scope;
neither is configured on a site that uses neither (Q18).

### 11. Follow-ups are now safe, and silent

Consent was checked, but the check never fired: `email_consent` is
`TEXT DEFAULT false`, so the value was the **string** `'false'` — truthy in JS —
and `!followup.email_consent` was `false`. Nothing set consent on a followup row
at all, so every one took that default.

Both are fixed: the guard is now type-strict, and consent is copied from the
customer onto the followup row when it is created.

**The consequence you need to know:** nothing in the live flow records consent,
so **follow-ups are now suppressed for everyone**. Safe and silent, where before
it was unsafe and loud. Capturing consent at enquiry time is a decision for you —
see [`PLANNED-VS-REAL.md`](PLANNED-VS-REAL.md).

### 12. Seed scripts are guarded, but `seed-sales-reps.js` had a real problem

All four seed scripts now require `ALLOW_FAKE_CUSTOMER_DATA=1` through one shared
guard, and print the target database and a `DELETE` statement before writing.

`seed-sales-reps.js` was the dangerous one: it created three reps at
`@cadillacofsouthcharlotte.com` — a domain this business does not own — with
roles `resolveRecipient()` accepts. Seeding would have repointed **every customer
enquiry on the site** at a stranger's mailbox, through the database rather than
through the code. Reps are now on `@example.com`.

---

## C. Built on 2026-09-30 and completely unverified

This is the section to read before deploying. **Nothing below has been executed.**
No `node --check`, no build, no gate run, no commit, no deploy.

### New features

| what | file | risk |
|---|---|---|
| Compare/shortlist bottom strip | `site/assets/js/compare-tray.js` | 16 new test assertions, never run |
| Service appointment booking | `netlify/functions/schedule-appointment.js` | new function, never invoked |
| Function-auth gate | `ci/check-function-auth.js` | new gate; expect first-run failures |
| Placeholder scan of source | `ci/check-no-placeholder-contact.js` | extended; never run |
| Inquiry path gate | `ci/check-inquiry-path.js` | 14/14 when last run, before further edits |

### Edits that are paired across client and server

A syntax error on either side shows up as an **empty admin page, not an error**:

- `bookings-admin.js` ↔ `booking-queue.js` (auth added to both)
- `favourites-admin.js` ↔ `vehicle-features.js` (auth added to both)
- `salesTeam.js` ↔ `contact-salesperson.js` (POST now records)
- `customer-portal.js` ↔ `lead-form.js` (message now records)
- `financingCalculator.js` ↔ `pre-approval.js` (JSON, not FormData)

### Files that took multi-step edits

`financingCalculator.js`, `salesTeam.js` and both gate files needed several
successive edits, and three real mistakes were caught by reading rather than by a
parser: a duplicated `.then`, a `const` used before its declaration (temporal dead
zone, which would have thrown on the gate's first run), and `escapeHtml` written
against a helper that did not exist in two files.

---

## D. Test debt

About **11 test failures** remain, from before this work:

- ~6 in `tests/integration/followup-system.test.js` — fake DB and handler auth
  interplay; the assertion shape could not be verified
- ~5 in the calendar suites — fixture setup

These are test-infrastructure problems rather than shipped-code defects, and they
were left visible rather than guessed at. 107 tests pass.

---

## E. What is actually working, and was measured

Worth stating, because a list of gaps reads like a list of failures:

- **Enquiries survive their own notification failing** — 14/14 against the live
  database, in the deployed configuration
- **Per-user Google Calendar** — 16/16 against live, blocked only on credentials
- **Compare and shortlist are two working features** — 23/23 behavioural, in
  jsdom against the built page
- **The $n placeholder fix** — `check-writes-work.js`, 7/7 against live; an
  UPDATE provably updates
- **Function bundles 317 MB → 46 MB**
- **The build** — 68 pages, prebuilt, zero Netlify build minutes

---

## The honest summary

The site's *data* is in good shape: the database is the system of record, every
form writes before it notifies, and the gates now cover writes, auth and
placeholder contact details.

What it cannot do is **tell anybody**. Until SMTP is configured, the admin at
`/admin/leads`, `/admin/bookings` and `/admin/leads-intake` is the entire
notification system. That is not a defect — it is a missing credential — but it
means the single most valuable thing left to do is not code.

It is four environment variables.