# Security

What protects customer data on this site, what was missing, and how to tell if
it comes back.

Written 2026-09-30 after an audit of all 44 Netlify functions. Before that audit,
**six endpoints had no authentication at all**, three of them serving or
destroying customer records. None of them was noticed by any test, gate or build.

---

## `JWT_SECRET`: the question that was open, now answered

The 2026-09-30 handoff's first item was "is `JWT_SECRET` set in the Netlify UI?",
because whether it was decided whether the four `sales-*` functions had been
verifying tokens with a published string while the site was live.

**Answered 2026-10-01 from the Netlify API** (`getEnvVars`, site
`532a7445-ce96-40c1-bebb-b9d14a0d0e10`):

- `JWT_SECRET` **is set**, 64 characters, in the **production** context only.
  Set at `2026-09-28T19:27:42Z` by the account owner.
- It is **not** set for `deploy-preview`, `branch-deploy`, or `dev`. So on every
  non-production deploy the four functions now refuse rather than fall back —
  which is the correct behaviour and is what `utils/jwt-secret.js` implements.

### The exposure window was real, and it was about 95 minutes

Deploy history for the same site, `ready` states only:

| when (UTC) | state |
|---|---|
| 2026-09-28T17:52:48Z | **first `ready` deploy — the site went live** |
| 2026-09-28T19:27:42Z | **`JWT_SECRET` set** |
| 2026-09-28T19:28:46Z | next `ready` deploy |

So the site was serving for roughly **95 minutes with `JWT_SECRET` unset**. In
that window `sales-appointments`, `sales-add-note`, `sales-update-status` and
`sales-complete-appointment` verified staff tokens against
`'your-secret-key-change-in-production'` — a string in a public repository. The
literal was present at commit `a03a1ab` and still present at `HEAD` before this
session's fixes.

**What that means, precisely.** A forged admin token would have been accepted by
those four functions during that window. It does **not** mean customer records
were read — those four functions cover appointments and sales notes, and
`booking-queue` was open the whole time regardless of JWT. And it does not mean
anyone forged one; there is no evidence either way, and the honest statement is
that the possibility existed for 95 minutes and cannot now be ruled out.

**What to do about it.** The secret was rotated when it was first set, so
anything signed with the literal is already invalid — there is nothing to
revoke. Rotating again would only invalidate tokens that are already unusable.
The residual risk is a token an attacker minted during the window and still
holds, which dies the moment that secret is changed. So: **no action is required
now**, and the reason is worth writing down so nobody repeats the rotation out
of anxiety.

The gate that stops this recurring is `ci/check-function-auth.js`, assertion 2.

---

## The finding, stated plainly

| function | what it did | who could reach it |
|---|---|---|
| `booking-queue.js` | `GET` returned every booking request — **full name, email, phone** — with `Access-Control-Allow-Origin: *` | anyone, from any website |
| `lead-merge.js` | `POST` merged two customer identities together. Destructive, no undo | anyone |
| `lead-duplicates.js` | `POST` searched the lead table by any name/email/phone, returned up to 20 matching customers | anyone |
| `send-notification.js` | `POST` sent email **as the dealership** to any address, any subject, any body | anyone |
| `lead-management.js` | returned the internal `leadId` for a duplicate match — a customer-enumeration oracle | anyone |
| `vehicle-features.js` | `POST` wrote the "Ed's pick" list, i.e. the site's own editorial content | anyone |

Two further defects in the same family:

- **Four functions** (`sales-appointments`, `sales-add-note`,
  `sales-update-status`, `sales-complete-appointment`) verified staff tokens with
  `process.env.JWT_SECRET || 'your-secret-key-change-in-production'` — a literal
  committed to a **public** repository. Where `JWT_SECRET` is unset, that string
  *becomes the verifying key*, so anyone who reads the repo can mint a token with
  `role: 'admin'`. It had already been fixed in one sibling and documented in a
  fifth, and survived in four.
- **`google-calendar.js?action=status`** and **`customer-dashboard.js`** were
  checked and were already correct. Recorded here so nobody re-litigates them.

### Why nothing caught it

Every one of these validated its input carefully and returned well-formed errors.
They looked like finished work, because they were — just without a door on them.

The two nearest misses are the most instructive:

- `booking-queue.js` carries a long comment working through exactly who could
  abuse `POST` and how bad a stolen `PATCH` link would be. It concluded the write
  paths were acceptable. It never applied the same reasoning to `GET`, which has
  no write and no visible effect — and which returns the entire customer list.
- `vehicle-features.js` has a slug regex commented "so this endpoint cannot be
  used as an arbitrary-write store". The author was thinking about who could
  write there. What was missed is that it was anyone.

---

## The pattern underneath

Most of today's damage had one shape:

> **A function did something, reported success, and left no evidence.**

- a mock mail transport that returned `{success: true}` and sent nothing
- `leadId: Date.now().toString()` — a made-up id for a row never written
- an SMS follow-up that did `console.log(...)`, logged an interaction reading as
  a delivered text, and returned `true`
- a pre-approval application discarded while the response said
  `{received: true, processed: false}`
- `"Application Submitted! Your confirmation number is: undefined"`
- a contact form whose success message was a hardcoded string in the browser,
  posted to a function that ignored the method and the body entirely

A quiet write gets noticed because something breaks. **A successful read that
hands over the customer list, or a success message for a submission that was
never stored, looks identical to working.** That is why the gates below check for
honesty as well as for access.

---

## What protects the data now

### Authentication

Shared guard: `netlify/functions/utils/auth-middleware.js`, which verifies a
Netlify Identity token or a staff JWT.

```
authenticateRequest(event, { requireAuth: true, allowedRoles: [...] })
optionalAuthenticateRequest(event)   // status endpoints: anonymous gets a
                                     // false answer, not a 401
```

Not every function uses the shared middleware, and that is deliberate. Four
verify their own tokens inline (`sales-*`), and `customer-dashboard.js` adds a
check the shared middleware does not: it rejects a token whose `type` is not
`'customer'`, so a staff session cannot be replayed as a customer session. Both
are recognised by the gate.

### Secrets

`utils/jwt-secret.js` is the single answer to "is this secret usable?". It
refuses three things:

1. absent
2. empty or whitespace
3. a context marker written by `netlify.toml` — `deploy-preview-not-configured`,
   `branch-deploy-not-configured`

(3) is the subtle one. A marker is a **public** string in `netlify.toml`, set on
purpose so a context that must not touch production is recognisable. If a signer
treated a marker as a real secret it would mint tokens anyone who has read this
repository could forge — the same bug as a hardcoded fallback, in a more
sophisticated-looking form. Markers are refused for signing **and** verifying.

There is deliberately no `dev-not-configured`: `netlify dev` blanks the
destructive connection strings but leaves the signing key alone, so the sign-in
flow can still be tested locally.

### The database is the system of record

`utils/inquiry.js` — record first, notify second, and let the notification fail
on its own. This exists because every customer-facing form used to do the
opposite:

```js
await transporter.sendMail({ ... });   // 1. tell someone
await createLead(data);               // 2. keep the lead
```

With SMTP unconfigured — which is how it is deployed — step one threw, step two
never ran, and three real submissions produced **zero** rows in three tables.

Every form now calls `inquiry.submit()` and gets back a result that keeps the two
outcomes apart:

```js
{ recorded: true, notified: false, notifyReason: 'smtp-not-configured', id: '...' }
```

That is a **success**. The enquiry is in the database and visible in the admin;
it simply did not also send an email. The response says which, so "recorded but
not emailed" is never confused with "recorded and emailed".

The notification recipient is resolved in one place, `inquiry.resolveRecipient()`:
the `sales_reps` table first (a rep who has signed in through Identity), then
the environment. There used to be four disagreeing answers — `sales@caddyed.com`,
`info@caddyed.com`, and a hardcoded third-party domain.

### CORS

`booking-queue.js` no longer sends `Access-Control-Allow-Origin: *`. The admin
page that reads it is served from the same origin and needs no CORS header at
all; a wildcard there let any website fetch the customer list cross-origin.

---

## Gates

Two checks exist for this, both wired into `ci/check-all.js`:

```
node ci/check-function-auth.js          # no credentials needed
node ci/check-inquiry-path.js           # needs TURSO_DATABASE_URL/TOKEN
```

### `check-function-auth.js`

1. Every function not on `PUBLIC_BY_DESIGN` contains an auth guard. **The
   allowlist carries a reason per entry**, so "this one is open" is a decision
   somebody wrote down rather than an omission somebody forgot.
2. No function falls back to a literal string when `JWT_SECRET` is unset.
3. No function pairs a wildcard CORS header with a customer table.

It deliberately does **not** claim to check whether a guard is the *right* guard,
or whether the authenticated caller is authorised for what it asked. Those need
reading, and a check that claimed them would be lying about its coverage.

### `check-no-placeholder-contact.js`

Reads the built HTML **and** function source, recursively, with comments
stripped. The source scan was added because reading HTML cannot see a value a
function produces at runtime:

```js
// netlify/functions/contact-salesperson.js
phone: '+17045557890'      // (704) 555-7890 -- a fiction number
```

That number was never in the output, so the check passed, while the sales team
card served it to customers. The header/footer sweep that fixed 244 `tel:` links
could not have found it.

Comments are stripped because `schedule-test-drive.js` carries a comment
*explaining* that its old defaults were `website@example.com` — and a rule that
cannot tell a value from a sentence about a value has to be fixed, not obeyed.

---

## Still open

These are not bugs. They are decisions and verifications.

### S1. Is production actually exposed right now?

`netlify.toml` declares **no** `[context.production.environment]`. If
`JWT_SECRET` is not set in the Netlify UI, the four `sales-*` functions would
have accepted forged admin tokens before this audit. That could not be checked
from here and is the first thing to verify.

**How:** Netlify UI → Site settings → Environment variables. `JWT_SECRET` must be
present and must not be one of the markers in `utils/jwt-secret.js`.

### S2. `lib/database.js` is dead and wrong

A Supabase/Postgres module that no function requires, with connection details
read from five env vars that are all unset. `enhanced-database-service.js`
similarly prefers `SUPABASE_DB_URL`/`DATABASE_URL` over Turso — a **second data
layer**. Given that the silent-UPDATE defect came from one driver behaving
differently than assumed, two data paths is a standing hazard.

**Decision:** delete, or complete the migration.

### S3. `health-check.js` may report healthy while nothing is configured

It requires `redis-cache-service` and `enhanced-database-service` at module
scope, both unconfigured. Whether it says "healthy" for services that do not
exist is a question about what that endpoint is for.

### S4. `calendar-invite.js` accepts arbitrary `title`/`description`

Low risk — it generates a `.ics` for the visitor's own calendar and reads no
data. Worth knowing it accepts attacker-chosen text.

### S5. `available-dates.js` is a future disclosure trap

It returns `[]` today, which is public information. When a real booking system
lands it must return **availability**, never the customer — otherwise an
unauthenticated caller can map, day by day, exactly when the dealership expects
someone, which maps the quietest and busiest days of the week. The warning is in
the file.

---

## Before you ship

The security fixes are unverified. Nothing in this document has been executed —
no `node --check`, no build, no gate run, no commit. Specifically:

- `npm run check` must pass. The auth changes are **paired** client/server
  edits; a syntax error on either side shows up as an empty admin page, not an
  error.
- `check-function-auth.js` is new and has never run. Expect its first run to
  find something.
- The JWT changes are four separate edits to four near-identical functions.
  Confirm all four refuse when `JWT_SECRET` is absent.

Nothing here is deployed.