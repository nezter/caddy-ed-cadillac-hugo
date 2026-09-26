# Where the data lives

Answers Q3, Q14, Q15 and the deploy-preview exposure in
[`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md), and records the one thing that is
still yours to choose.

Written 2026-09-27. Every number below was measured on this repository, not
inferred from documentation.

---

## The short version

**Turso works on Netlify, and it is already wired.** Two environment variables
and nothing else changes. The blocker that was recorded against it for several
sessions was a packaging problem in *this repo*, not a limitation of Turso on
Netlify, and that problem is now measured and closed.

If you want the fewest moving parts, that is the answer:

```
TURSO_DATABASE_URL=https://<your-db>.turso.io
TURSO_AUTH_TOKEN=<token>
```

**If you would rather not run a database at all**, Netlify's own primitives
cover the flat cases — and one of them, `getStore`, has a documented failure
mode that this repository had already walked into. Details below.

Either way, **pick one and delete the other three.** That is the actual
recommendation, and it is worth more than the choice itself.

---

## Can Turso be done in Netlify's structure?

**Yes, and it is already done.**

Turso is a remote libSQL service reached over HTTPS. A Netlify Function is a
Node process with network access, so there is nothing about Netlify's
deployment model that a hosted libSQL endpoint cannot satisfy. There is no
adapter, no proxy, no framework requirement.

The repository already contains the whole integration, in
`netlify/functions/utils/database-service.js:94`:

```js
if (!turso && process.env.TURSO_DATABASE_URL) {
  const { createClient } = require('@libsql/client');
  turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}
```

It is guarded by `try/catch` and degrades to a warning rather than a throw, so
a function with no database configured still loads and reports itself
misconfigured honestly.

**What was actually wrong with it — and it was never Turso**

`@libsql/client` loads its platform-native binary through an *optional*
dependency. esbuild cannot see through a conditional require, so the JavaScript
is inlined and the `.node` binary is not. Measured, with a real bundle:

```
bundle KB                : 1437.6
external @libsql requires: (none -- fully inlined)
require() that bundle    : THREW -> Cannot find module '@libsql/linux-x64-gnu'
```

That is what `included_files` in `netlify.toml` exists for, and it is load-
bearing. It had been credited with fixing the problem on the strength of a code
comment, and carried as an open question, because `netlify dev` reporting
"Loaded function 34 times" was the only available evidence — and that reports
that **esbuild emitted a bundle**, not that the bundle runs. The gap between
those two claims is the whole problem.

That gap is now closed by a gate. See below.

---

## What Netlify offers, and the part that matters

Netlify's current primitives include **Blobs** and **Database**.

| | Blobs | Database |
|---|---|---|
| Shape | key-value object store | managed Postgres |
| Package | `@netlify/blobs` | `@netlify/database` |
| Config | none — credentials are wired in | provisioned instance |
| Fits | uploads, cache-like state, snapshots, session-adjacent flags | anything relational |
| Does not fit | counters, balances, read-modify-write | large binaries |

The dividing line is documented plainly: *"Blobs is not a database. No
counters, no balances, no read-modify-write logic, even with retries."*

### The part that matters, and it is a warning

From Netlify's own documentation:

> `getStore(name)` is **site-scoped and shared across every deploy context**.
> Code running on a preview reads, overwrites, and deletes the same data your
> production site is serving. Use `getDeployStore()` or a context-specific store
> name for anything you'd be unhappy to lose.

This is not a hypothetical for this repository. `netlify.toml` declared **no
`context.*` sections at all** before this work, so a pull-request preview
inherited production configuration wholesale. That is now closed at the
environment layer, and if Blobs is adopted it needs closing at the store-name
layer too — `getStore("tokens")` would be a shared production blacklist that any
preview can read and rewrite.

Blobs also has three behaviours worth designing around:

- **Eventual consistency by default.** Writes are immediately readable;
  updates and deletes propagate to edge locations within 60 seconds. Opt into
  `consistency: "strong"` per store or per read.
- **No server-side TTL.** Expiry is a timestamp you check yourself.
- **`get` returns `null` for a missing key, not an error.** Always null-check.

### Would Blobs fix the token-revocation problem?

Partly, and the honest answer is that it is the wrong tool for the general case.

Sign-out cannot revoke anything today because Netlify bundles each function
separately, so every function that reaches `sales-logout.js` gets its own
inlined `new Set()`. One writes the blacklist, another reads a different
always-empty one.

Blobs would fix the *sharing* half of that: a real store is shared across
bundles, where an in-memory `Set` is not. It supports `onlyIfNew`, which gives
the set-if-absent atomicity a blacklist needs. But a blacklist is a
read-then-delete, and Blobs is eventually consistent by default — so a revoked
token could keep verifying for up to 60 seconds.

That is acceptable against an 8-hour token lifetime, and it would need
`consistency: "strong"` on the read. But it is a real design, not a drop-in, and
if revocation needs to be immediate the honest home for it is a `revoked_tokens`
table in Postgres.

---

## The real problem: four storage clients, none configured

This is worth more attention than the choice between Turso and Blobs.

| package | required by | configured |
|---|---|---|
| `@supabase/supabase-js` | 7 files | no |
| `pg` | 3 files | no |
| `@libsql/client` | 2 files | no |
| `ioredis` | 1 file | no |

`database-service.js` tries four environment-variable names in sequence before
giving up, and there is a fifth, dead, `mockDatabase` literal — empty arrays
under the comment "Mock database for development/fallback" — referenced zero
times and sitting one line away from being wired up as a silent failure where a
function with no database returns `[]` and a `200`. For a car dealership that is
the difference between an empty customer list and a lost lead. Removed.

**Cost, measured:** the function bundles total **51.56 MB across 34 functions**,
the largest 2.5 MB. A large share of that is `@supabase/supabase-js` inlined
seven times over, for a service this site has never been configured to use.

This is the same failure mode as the eleven inventory implementations, in
miniature: several plausible stacks, one of which runs, and no way to tell from
the outside which.

---

## The recommendation

**Tier 1 — now, no new services:**

1. Delete `@supabase/supabase-js` and `ioredis`. Neither is configured; both
   are dead weight in the bundle. This is reversible and is measurable
   immediately in the bundle total.
2. Pick one of `pg` or `@libsql/client` as the single data path. Both are
   already installed. The code is Postgres-shaped either way — `@libsql/client`
   speaks the same SQL over the wire.
3. Have the losers fail loudly at load rather than return `[]`.

**Tier 2 — depends on Tier 1:**

- **Turso** if the answer to Q3 is "one hosted thing, minimal config". Two env
  vars, already coded, `@libsql` is the cheaper bundle of the two.
- **Netlify Database** if the answer is "managed Postgres I do not have to
  provision". Same code path, `pg` driver, no new service to sign up for.
- **Netlify Blobs** for the genuinely flat things, and *only* those: the daily
  inventory snapshot, the search index, sync state, and — with
  `consistency: "strong"` and a context-scoped store name — the token
  blacklist.

**Tier 3 — needs the database to exist first:**

Q5 (mock customer data), Q8 (the function that returns `{deleted: true}` and
deletes nothing) and Q15 (the parked 12-task Turso/Supabase programme) are all
downstream of this decision. They are not three problems; they are one problem
waiting on a storage answer.

---

## The gate that keeps this honest

`ci/verify-functions.js`, added in this change, is what turned Q14 from a
comment into a measurement. It bundles every function with the same esbuild
Netlify uses, then `require()`s each bundle in a child process with
`netlify/functions/node_modules` resolvable the way it is on the lambda.

It found five real failures the moment it was switched on, all of which
`netlify dev` reported as healthy:

```
FAIL  customer-auth.js        bundles but does not LOAD: JWT_SECRET environment variable is required
FAIL  customer-dashboard.js   bundles but does not LOAD: JWT_SECRET environment variable is required
FAIL  sales-login.js          bundles but does not LOAD: JWT_SECRET environment variable is required
FAIL  communication-preferences.js  bundles but does not LOAD: Error: supabaseUrl is required.
FAIL  followup-analytics.js        bundles but does not LOAD: Error: supabaseUrl is required.
```

Now: `34 bundled, 34 loaded, 0 failed`.

The three JWT failures were a design flaw this work introduced and then caught.
`customer-auth.js`, `customer-dashboard.js` and `sales-login.js` threw at
`require` time when `JWT_SECRET` was unset. That is right about the secret and
wrong about the consequence: `netlify.toml` sets a *marker* secret on previews
precisely so they cannot touch production, so a load-time throw turns a
deliberate, documented configuration into an opaque 502, and the honest 503
never runs. All three now check per request, as `auth-middleware.js` does.

The two Supabase failures were a module-scope `createClient()` that was never
referenced — dead code that pulled a whole SDK into the bundle and threw before
the auth check could run. Deleted rather than made lazy; making it lazy would
have turned the symptom green and left the dead client in place.

### What the gate deliberately does not check

It does not call the handlers. There is no Postgres, Supabase, Turso or Redis on
the build host, so any handler that touches data must fail, and a gate that
reported that as build breakage would be claiming coverage it does not have.
**Loading is the honest ceiling, and the gate says so in its own output** rather
than implying more.

---

## Deploy-preview isolation

Independent of which storage you choose, `netlify.toml` now declares all three
non-production contexts explicitly. Previously it declared none, which is not a
neutral default — it means a pull-request preview inherits production
configuration.

```toml
[context.deploy-preview.environment]
  JWT_SECRET = "deploy-preview-not-configured"
  DATABASE_URL = ""
  ...
```

The marker is a public string, so signing a token with it would hand anyone who
has read the repository a working staff token — the `'fallback-secret'` bug in
a more convincing costume. `netlify/functions/utils/jwt-secret.js` therefore
refuses markers for signing *and* for verifying, and `ci/verify-endpoints.js`
fails if the list of markers in `netlify.toml` and the list the code refuses ever
drift apart in either direction. It caught a stale entry within a minute of
being written.

If you adopt Blobs, add context-scoped store names to that gate. `getStore()` is
site-wide by default, and that is Netlify's most-documented data-loss trap.

---

## What is still yours to decide

1. **Turso, Netlify Database, or Blobs** — Tier 2 above. Everything else waits
   on this.
2. **Whether sign-out must revoke immediately.** If yes, a `revoked_tokens`
   table in Postgres, not Blobs' 60-second propagation.
3. **Whether the parked 12-task Turso/Supabase programme (Q15) is now moot.**
   It probably is, and parking it is cheaper than deciding it.
