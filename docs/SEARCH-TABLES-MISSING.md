# Six search tables that have never existed

`ci/check-insert-columns.js` finds them, and they are a separate problem from the
missing primary keys. The tables are not merely missing a column — they are
absent.

```
netlify/functions/utils/search-index-service.js:106  customer_search_index
netlify/functions/utils/search-index-service.js:157  lead_search_index
netlify/functions/utils/search-index-service.js:204  interaction_search_index
netlify/functions/utils/search-index-service.js:245  vehicle_search_index
netlify/functions/utils/search-index-service.js:419  search_index_metadata
netlify/functions/utils/search-service.js:648         saved_searches
```

## What this means

`database/turso/001_core.sql` is generated from a Postgres source schema. Those
six tables are named by the code and are in neither. So every write to them fails
with `no such table`, and every read returns an error rather than an empty result.

`search.js` — which backs `/admin/search`, a live page — is a live page over a
data layer that has never had its tables.

## Why it is not simply fixed here

Two reasons, and both are worth stating rather than routing around.

**The shape is not derivable.** Unlike a missing column, a missing table has no
schema to copy. The INSERTs name four columns each and the SELECTs in the same
files name more, but a search index also implies a trigger strategy, a
population job, and a decision about what happens on write. Guessing that from
the INSERTs would produce tables that create cleanly and then sit empty — which
is the failure mode this whole exercise has been about.

**`searchVehicles` uses `ILIKE`.** In `database-service.js`:

```sql
WHERE stock_number ILIKE $1 OR vin ILIKE $1 OR make ILIKE $1 ...
```

`ILIKE` is Postgres. This database is SQLite, where it does not exist. So
`searchVehicles` fails regardless of its tables. The portable form is
`LIKE`, which is already case-insensitive for ASCII in SQLite — and
`case_sensitive_like` is off by default. That is a one-word change, but it
changes matching behaviour, so it should be made deliberately.

## What is needed

A decision, not a patch:

1. **Create the six tables** — then decide how they are populated. A search index
   that is never written is not a search.
2. **Or, if search is a future feature**, say so. Then `/admin/search` should not
   link to a page that cannot work, and `search.js` should return an honest
   "not available" rather than a 500.

Option 2 is honest and cheap. Option 1 is a real piece of work, and it should not
be started by accident at the end of a bug-fix session.

## Meanwhile, the gate

`ci/check-insert-columns.js` reports all six on every run, so they cannot be
forgotten. It checks three things:

- every INSERT supplies `id` (the schema has no default) — no database needed
- column count matches value count — no database needed
- every column named by code exists in the live database — needs `TURSO_DATABASE_URL`

The third is the one that found the six missing columns in
`003_missing_columns.sql`. It reads the schema, the migrations **and the code**,
because a gate that compares two artefacts will not find a third thing that
disagrees with both. `002_app_columns.sql` was built by diffing the Postgres
source against the generated libSQL schema, and it could never have found a
column that only the code names.
