# Database — live

## What is connected

| | |
|---|---|
| URL | `libsql://caddyed-nezter.aws-us-east-1.turso.io` |
| Region | `aws-us-east-1` |
| Engine | SQLite 3.47.0 (libSQL) |
| Tables | 15, from `database/turso/001_core.sql` + `002_app_columns.sql` |
| Netlify env | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (production context) |

Zero code change was needed. `netlify/functions/utils/database-service.js`
already read `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; this is the path it was
written for, and it now has something to point at.

## How it was verified

**The schema was applied to the live database and the application's own queries
were run against it** — the 14 statements in `ci/test-turso-schema.js`, which are
the real queries from `sales-login`, `customer-dashboard`, `sales-customers`,
`search` and `followup-analytics`, not invented ones:

    14 passed, 0 failed, against the LIVE database

The fixture rows those inserts created were removed afterwards.

**The real data path was exercised**, through `database-service.js` itself rather
than a raw client, with the production credentials:

    isDatabaseConfigured(): true
    query() -> 15 tables
    countOf({ rows: [] }, 'total') -> 0
    newId() -> 22005126-4971-4867-8c92-a5b683fd5eff

`health-check` on a **deploy preview** still reports `database: disconnected`,
and that is correct: `netlify.toml` blanks `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN` for `deploy-preview` and `branch-deploy` contexts so a pull
request preview provably cannot read or write production data. The database is
reachable from the **production** deploy only. It has not been deployed to
production yet.

## Why libSQL and not Netlify Database

Netlify Database is not available on this account:

    POST /api/v1/sites/532a7445-.../database
    403 "database feature not available for this account"

Same for account-scoped env vars — the plan (`nf_team_dev`, a legacy plan)
refuses both. libSQL needs no plan change and is a first-class path in
`database-service.js`.

## A row in `sales_reps` that should be looked at

    {"id":"r2","email":"ab@c.co","role":"sales_representative",
     "status":"active","hash_len":10,"created_at":"2026-09-28 22:12:22"}

`password_hash` is 10 characters. A bcrypt hash is 60. This cannot be a usable
credential — it is a leftover from an earlier experiment, not an account anyone
can sign in with. **It has been left in place**, because deleting rows from a
database the owner seeded is not a call to make quietly. Say the word and it
goes.

No real staff account exists yet. Signing in through **Netlify Identity** does
not need one — the role lives in the token and the database is not consulted
until the bespoke JWT path runs. So the admin door opens today. The
`password`-based `sales-login` path needs a row with a real bcrypt hash, and
that needs to know who the staff are.

`scripts/seed-sales-reps.js` was **not** run. It creates three accounts at
`cadillacofsouthcharlotte.com` with the password `password123`, which is a
different dealership and not a credential to plant in a live database.
