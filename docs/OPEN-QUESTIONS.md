# Open Questions

Everything in this repository that needs an owner's decision rather than more
engineering. Collected from every session so the answers live in one place
instead of being scattered across `styling-audit.md`, `PROGRAMME.md` and the
gates' own warnings.

Nothing here is a bug. Every one of these is a choice I could have made
silently, and did not.

**Four questions are now resolved** and marked as such, each closed by
measurement rather than by comment:

- **Q5** — `customer-dashboard.js` returned fabricated data; now queries the
  database for the customer the token names.
- **Q6** — SQL injection via interpolated `sort_by`/`sort_order`; now
  allowlisted at source.
- **Q8** — a function that returned `{deleted: true}` without deleting; now an
  honest 501.
- **Q14** — the `@libsql` native binary, verified by a gate rather than trusted.

Q3 is answered in structure — the analysis is done and only the choice of
provider is left. See [`STORAGE.md`](STORAGE.md).

---

## Blocking — nothing reaches production until these are answered

### Q1. Push and deploy

**The work is committed and gated but has never left this machine.** 15+ commits
on `modernize/netlify-build-2026`, no upstream, no deploy. `caddyed.com` is
still serving whatever it served before any of this work.

Deploying consumes no Netlify build minutes — the artefact is uploaded
prebuilt — so the only real cost is the change going live.

**Decision needed:** push and deploy, or hold?

### Q2. The logo

`site/static/img/logo.svg` was a 265 KB SVG wrapping a 197 KB photograph of a
person, rendered at 180×34, loaded twice per page. I replaced it with
`logo.old.svg` — a 109×24 vector wordmark, 1,965 bytes — because the original
was a squashed photo and the swap cut the home page from 626 KB to 112 KB on
mobile.

That was defensible on measurement. It is still a brand decision.

**Decision needed:** keep the old wordmark, or supply the real brand asset.

### Q3. Database — ANSWERED, only the pick is left

**Full analysis: [`docs/STORAGE.md`](STORAGE.md).**

Turso works on Netlify and **is already wired** —
`netlify/functions/utils/database-service.js:94` creates a libSQL client from
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. The blocker recorded against it for
several sessions was a packaging problem in this repo, not a limit of Turso on
Netlify, and that is now measured and closed.

Sign-out still cannot revoke: Netlify bundles each function separately, so every
function reaching `sales-logout.js` gets its own inlined `new Set()`. Blobs
would fix the sharing half (it is a real shared store, unlike an in-memory Set,
and `onlyIfNew` gives the needed atomicity) but not the 60-second eventual
consistency on delete. Against an 8-hour token that is probably fine; if
revocation must be immediate, it belongs in a `revoked_tokens` table.

**Still yours to decide:** Turso (two env vars, already coded), Netlify
Database (managed Postgres, `pg` driver, no new service), or Blobs for the flat
cases only.

**And the recommendation that matters more than the pick:** delete
`@supabase/supabase-js` and `ioredis`. Neither is configured, between them they
account for a large share of a **51.56 MB** function-bundle total, and four
competing clients where one runs is how the eleven inventory implementations
happened.

---

## Security — live now, needs a call

### Q4. The CSP defeats itself

`netlify.toml` sets `script-src 'unsafe-inline'`. The staff token lives in
`localStorage`, so the CSP is the actual XSS mitigation, and it is permitting
exactly what it should prevent.

An agent flagged this as the highest-priority follow-up. Removing
`'unsafe-inline'` needs nonces, and it touches Decap CMS.

**Decision needed:** remove `'unsafe-inline'` now with nonces, or accept it?

### Q5. ~~`customer-dashboard.js` returns 100% mock data~~ — RESOLVED

The JWT was verified, then `customerId` was thrown away and every customer was
shown the same fabricated 2024 Escalade test drive, a "Sarah Johnson" sales rep
with a stock photo that exists nowhere in the build, and three invented activity
entries.

All five mock functions now query the database for the customer the token names.
Appointments split into upcoming/past on date *and* time. `preferences` is jsonb
and handled either parsed or as a string. Every read degrades to empty rather
than throwing, because a portal that 500s because the database is briefly
unreachable is worse than one showing a customer their (currently empty) details.

The reason it was mock data is now recorded rather than left as a mystery: the
raw query helper in `database-service.js` was module-private, so a function
could not read anything that did not already have a bespoke static — and
fabricating the data was less work than adding one. It is now exported
(parameterised only; the SQL injection in that file came from interpolating a
sort column, and this is not a licence to repeat it).

### Q6. ~~SQL injection in `database-service.js`~~ — RESOLVED

`sort_by` and `sort_order` were interpolated straight into the `ORDER BY`
clause, so a caller could inject arbitrary SQL through either. Both are now
allowlisted against known columns and directions; anything unrecognised falls
back to the default sort rather than reaching the query.

### Q7. `/admin/*` pages are public

Hugo builds them into the publish directory with no server-side gate. Signing
in makes their *fetches* succeed — nothing more. They carry
`X-Robots-Tag: noindex`, which keeps them out of search results but does not
stop a direct request.

**Decision needed:** gate the pages, or accept a world-readable shell over
protected data?

### Q8. ~~A function lies about deleting~~ — RESOLVED (partly)

`sales-customers.js` `handleDeleteCustomer` returned `{deleted: true}` with HTTP
200 while deleting nothing, with two TODOs. A caller would believe a row was
removed.

It now returns **501 Not Implemented** with an explanation. That is the honest
answer to a delete that has not been written, and no front end calls `DELETE`
on this endpoint, so nothing depended on the fake success.

**Still yours to decide:** whether deleting a customer should be a hard delete
or `status = 'archived'` — the customers table already permits the latter via
its CHECK constraint. That is a data-retention decision, not a bug.

---

## Product

### Q9. Non-Cadillac stock

The bargain-inventory page yields BMW / Nissan / Volvo trade-ins. They are
listed alongside Cadillacs.

**Decision needed:** keep them, or filter to Cadillac only?

### Q10. Facet pages

Hugo 0.166 no longer exposes the request query string to templates — verified,
not assumed — so filtering is client-side and a filtered view is not indexable.

The fix is to pre-generate a page per facet combination: **26 pages** for the
current inventory (10 models, 7 years, 4 drivetrains, 2 transmissions, 3
conditions). Each is a real, crawlable URL.

**Decision needed:** build them? I stopped short because a combinatorial
page-generation scheme is a design decision, not a detail.

### Q11. `/products/` and `/values/`

The Kaldi Coffee pages are gone and the layouts that served them are deleted.
Nothing is broken — the navigation never linked to them.

**Decision needed:** want a "Values" page? It needs real content and the design
system, not the starter markup.

### Q12. Admin auth model

Every admin function requires a staff token, but there is no staff sign-in in
the dashboard itself — `/admin/sign-in` exists and the modules use it. Worth
confirming that is the intended shape.

### Q13. A real inventory feed

`scripts/inventory/` crawls the dealer's site, gated to once a day. If a DMS
feed is ever available, `INVENTORY_SOURCE_URL` supersedes it and the crawl can
be deleted.

**Decision needed:** is a feed available? Also: is there a real contact address
for `INVENTORY_CRAWL_UA`? It currently carries a placeholder.

---

## Inventory operations — BUILT, and what they changed

A sync was a full reconcile: fetch the whole feed, rewrite every managed file.
It is now a targeted check that reports what changed and leaves the rest alone.

```bash
node scripts/inventory/index.js --check-status              # available/sold/held-off, from disk
node scripts/inventory/index.js --refresh  <slug|vin>      # check ONE vehicle against the feed
node scripts/inventory/index.js --disable  <slug|vin>      # hold a vehicle off the site
node scripts/inventory/index.js --enable   <slug|vin>      # put it back
```

These four skip the once-a-day and night-window gates, because they are not a
full scrape of the dealer's site. `--check-status`, `--disable` and `--enable`
make no network request at all.

A vehicle can be named by slug, VIN or stock number. A hand-held vehicle
outranks the feed — the feed records what is in stock, not what this site should
show — and re-enabling is byte-exact (verified: a disable/enable round trip
leaves no git diff).

Sold vehicles are **marked, not deleted** (`available: false` plus the feed's own
wording in `unavailable_reason`). A car that comes back is then recognised
rather than republished as new.

---

## Housekeeping

### Q14. `@libsql/linux-x64-gnu` — ANSWERED

`included_files` does resolve it. Verified by `ci/verify-functions.js`, which
bundles every function and then actually `require()`s it:

```
bundle KB                : 1437.6
external @libsql requires: (none -- fully inlined)
require() that bundle    : THREW -> Cannot find module '@libsql/linux-x64-gnu'
```

The JavaScript is inlined; the `.node` binary is not. `included_files` ships
it, and the gate now proves it on every build rather than on the first deploy.

**No longer "resolves itself on first deploy."**

### Q15. `customer-auth.js` and the Turso programme

Taskmaster tasks 32–43 are a 12-task Supabase+Turso architecture, all pending,
all blocked behind each other. A storage decision is what unblocks Q3, so this
is really the same question.

**Decision needed:** in scope now, or parked?

### Q16. The test suite — the number was wrong, and worse than that

`docs/test-status.md` recorded "31 pre-existing test failures". The real figure
is **63 failed / 8 passed of 71**, and it was never being counted: `./ci/run.sh
test` ran `npx jest` from `netlify/functions/`, which does not find
`<repo>/jest.config.js`, so `testMatch` resolved against the wrong root, the
suite at `<repo>/tests/` was invisible, and jest reported **"No tests found"**
and exited 1. Zero tests ran. The driver is fixed and now names the config and
rootDir explicitly.

The 63 are pre-existing and unrelated to this work — confirmed by stashing every
change on the branch and re-running: **63 failed / 8 passed, identical.** They
are assertion rot plus ESM/CJS transform errors in the calendar suite. CI marks
the `test` job `continue-on-error` by design.

**Decision needed:** fix them, or accept and delete the misleading suites?

### Q17. Seven Bootstrap-era component stylesheets

`advanced-search.css`, `followup-campaign-manager.css` and five others, 28–30
Bootstrap hex values each. Admin-only, correctly ordered after `admin.css`.
Only `admin.css` was migrated.

**Decision needed:** migrate them, or leave admin on Bootstrap-era CSS?

---

## Answered, for the record

| Question | Answer |
|---|---|
| Admin auth gate | Deferred to Q7 / Q12 |
| `baseURL` | Fixed to `https://caddyed.com/`, overridable per build |
| Netlify build minutes | Remote builds disabled; deploys upload prebuilt |
| Starter-template content | Deleted — it should never have been reachable |
| Pagination | Build-time via Hugo, 24 per page |
| Brand assets | See Q2 |
