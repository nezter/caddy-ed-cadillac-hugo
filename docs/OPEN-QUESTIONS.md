# Open Questions

Everything in this repository that needs an owner's decision rather than more
engineering. Collected from every session so the answers live in one place
instead of being scattered across `styling-audit.md`, `PROGRAMME.md` and the
gates' own warnings.

Nothing here is a bug. Every one of these is a choice I could have made
silently, and did not.

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

### Q3. Database

There is **no Postgres anywhere** — not in the build image, not on the CI host.
Every function that touches data has been verified as far as the auth boundary
and no further. The agents proved the handler logic with only the SQL layer
stubbed.

This also means **sign-out cannot revoke anything**: Netlify bundles each
function separately, so every function that reaches `sales-logout.js` gets its
own inlined `new Set()`. One writes the blacklist, another reads a different
always-empty one. Revocation across independently-bundled functions is
structurally impossible in memory. What actually bounds a stolen staff token is
the JWT's 8-hour expiry.

**Decision needed:** where does the data live, and does token revocation matter
enough to need Redis or a table?

---

## Security — live now, needs a call

### Q4. The CSP defeats itself

`netlify.toml` sets `script-src 'unsafe-inline'`. The staff token lives in
`localStorage`, so the CSP is the actual XSS mitigation, and it is permitting
exactly what it should prevent.

An agent flagged this as the highest-priority follow-up. Removing
`'unsafe-inline'` needs nonces, and it touches Decap CMS.

**Decision needed:** remove `'unsafe-inline'` now with nonces, or accept it?

### Q5. `customer-dashboard.js` returns 100% mock data

The JWT is verified, then `customerId` is discarded and every customer is shown
the same fabricated 2024 Escalade test drive and a hardcoded "Sarah Johnson". It
authenticates and does not authorise a real record.

**Decision needed:** fix it, or remove the customer portal until it can be fixed?

### Q6. SQL injection in `database-service.js:383`

`sort_by` and `sort_order` are interpolated into SQL. Allowlisted at one call
site. **The injection remains for every other caller.**

**Decision needed:** fix at the source? I did not, because it is shared code and
touching it without knowing all callers is how you break something quietly.

### Q7. `/admin/*` pages are public

Hugo builds them into the publish directory with no server-side gate. Signing
in makes their *fetches* succeed — nothing more. They carry
`X-Robots-Tag: noindex`, which keeps them out of search results but does not
stop a direct request.

**Decision needed:** gate the pages, or accept a world-readable shell over
protected data?

### Q8. A function lies about deleting

`sales-customers.js` `handleDeleteCustomer` returns `{deleted: true}` and
deletes nothing, with two TODOs. A caller would believe a row was removed.

**Decision needed:** implement it (the CHECK constraint already permits
`status='archived'`) or make it return an honest 501?

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

## Housekeeping

### Q14. `@libsql/linux-x64-gnu`

The native binary is unresolvable at bundle time; `netlify.toml`
`included_files` ships the platform packages alongside. Unverified, because it
only fails on a real deploy and Netlify remote builds are disabled.

**This resolves itself on the first deploy** — Q1.

### Q15. `customer-auth.js` and the Turso programme

Taskmaster tasks 32–43 are a 12-task Supabase+Turso architecture, all pending,
all blocked behind each other. A storage decision is what unblocks Q3, so this
is really the same question.

**Decision needed:** in scope now, or parked?

### Q16. 31 test failures

Auth-middleware and calendar suites, pre-existing assertion rot, catalogued in
`docs/test-status.md`. CI marks the `test` job `continue-on-error` by design.

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
