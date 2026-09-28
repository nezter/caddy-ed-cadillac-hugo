# The database: what it should be, and why not Blobs

Asked directly — can the data live in a Blobs store, or one of the other
Netlify options? — this is the answer, with the reasoning kept in one place.

## Short answer

**No, not in Blobs. Use Netlify Database, and it needs no code change.**

## Why not Blobs

Netlify's own documentation is blunt about it: *"Blobs is not a database. No
counters, no balances, no read-modify-write logic, even with retries."*

Concretely, against what this codebase needs:

| | Blobs | What we need |
|---|---|---|
| Transactions | none | merging a duplicate lead touches several rows at once |
| Relational queries | none | `searchCustomers` joins customers, leads, interactions, appointments and counts each |
| Referential integrity | none | `lead.customer_id -> customer.id` |
| Aggregation in the database | none | dashboard totals, follow-up analytics, conversion rates |
| Consistency | updates and deletes propagate to edge within 60s | a rep should not see a lead they just deleted still on the list |

There is a scale argument that says Blobs could work — this is one salesperson,
so the whole dataset is perhaps a hundred customers and a few hundred leads. The
argument does not survive contact with the code: **29 functions already speak
SQL**, and the schema is generated and proven against 14 of their real queries.
Rewriting that as key-value operations would be a large regression in exchange
for a store already being used correctly for the things that *are* flat.

## What Blobs is right for, and already is

| Store | Holds | Why Blobs is correct |
|---|---|---|
| `booking-requests` | test-drive requests, one key each | write-once records, no joins, must survive without a database |
| `vehicle-features` | which vehicles are favourites | a short set of slugs; a name/phone number for the car would be absurd |
| `google-calendar` | the OAuth refresh token | one secret, no queries, and it must be deletable when consent is withdrawn |

That split is the whole design: **relational data in a database, flat state in
Blobs.** Each is on the primitive that suits it.

## The options, ranked for this site

### 1. Netlify Database — recommended, zero code change

Managed Postgres, provisioned in the Netlify dashboard. The code already supports
it and already prefers it:

```js
// netlify/functions/utils/database-service.js
const connectionString =
  process.env.SUPABASE_DB_URL || ... || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
```

`pg` is a dependency and `getPgPool()` is tried **first** in every query. So:

```
DATABASE_URL = <from the Netlify dashboard>
```

…is the entire integration. No code, no migration runner, no new package.

The schema to apply is already written: `database/turso/001_core.sql` and
`002_app_columns.sql` — 15 tables, generated from the migrations and verified
against the application's real queries.

### 2. Turso — same code, external service

Already wired (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`), has a free tier, and
the schema is libSQL-compatible — I proved that by creating the database and
running the admin's own queries against it, all five returning rows.

Choose it over Netlify Database only if you want the database to outlive the
Netlify site, or you already have a Turso account. The trade is a second service
and a second bill.

### 3. Postgres anywhere (Supabase, Neon, RDS)

The code supports it. Supabase's own client is **removed** — its read path
discarded the WHERE clause, so a query for one customer returned the whole table
— but the `pg` pool path is untouched and correct.

### 4. Blobs — no

See the table above. Right tool, wrong job.

## What it costs

Both options are the same shape of work:

1. Create the database (~5 min)
2. Set `DATABASE_URL` (or the two Turso vars) on the Netlify site
3. Apply the two schema files
4. Seed one sales rep — or skip it entirely and use **Netlify Identity**, which
   now signs staff in without a database at all

Step 4 is optional since the Identity work: `sales-login` still works for
anyone who prefers a password, but it is no longer the only way in.

## The part that is still open

A database makes the admin *function*. It does not make the admin *private* —
that was the separate `admin-guard` work, and Netlify's own `/admin/*` password
protection is still the better primary gate because it runs before anything else
in the repository.
