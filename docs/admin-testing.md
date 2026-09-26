# Testing the Admin

How to actually exercise `/admin/*` and the functions behind it.

## The short version

```bash
cp .env.example .env        # fill in JWT_SECRET at minimum
./ci/run.sh functions       # netlify dev on the CI host
open http://10.1.0.25:8888/admin/
```

Stop with `Ctrl-C`. `./ci/run.sh fn-bundle` is the non-interactive version —
it bundles all 51 functions, prints failures, and exits (use it in CI).

## Why this was not obvious

Three separate things had to be true, and all three were broken:

1. **The functions have to bundle.** Netlify bundles functions with esbuild at
   deploy time and in `netlify dev`. Four of them did not compile, so they
   could never have been deployed — which matches the fact that the live site
   had `functions_dir` unset and has never served a working function.
2. **Dependencies have to resolve.** Code shared between the functions and the
   repo root resolved `pg`/`axios` only by accident, via the root
   `node_modules`. That accident was removed during the stack modernisation,
   which is what surfaced the problem.
3. **The env has to be present.** `netlify/functions/utils/auth-middleware.js`
   throws if `JWT_SECRET` is unset, and it **fails closed** — every protected
   endpoint returns 500 rather than allowing access.

## Layers

### 1. Static preview (no functions)

`./ci/preview.sh up` → `http://10.1.0.81:8090/`

Serves the verified build on the k3s node. Good for checking layout, CSS, JS
and the page-scoped bundles. The admin **pages** render (they need no secrets),
but their dashboards fetch from the functions, so you will see empty or error
states. `/.netlify/*` returns an honest JSON message rather than a 404.

### 2. Functions against the built site

`./ci/run.sh functions` → `http://10.1.0.25:8888/`

`netlify dev` serving `site/public` plus all 51 functions. This is the layer
that matters for the admin.

| Endpoint | Expected without a database |
|---|---|
| `/admin/`, `/admin/dashboard/`, `/admin/leads/`, `/admin/followup-campaigns/` | `200` — UI shell renders |
| `sales-auth-check` | `200` with `{"authenticated": false}` |
| `sales-leads`, `sales-metrics`, `sales-appointments` | `401` — auth is enforced |
| `followup-rules`, `email-templates`, `sms-templates`, `interactions` | `401` |
| `followup-campaigns` | `500` — reaches the data layer, then fails on a null date |
| `health-check` | `500` — needs the libsql native binary (see below) |

A `401` is the *correct* result with no credentials. It proves the middleware
is loaded and enforcing. If you ever see a `200` on those without a token, that
is a bug.

### 3. With credentials

Fill in `.env` (see `.env.example`) and the dashboard endpoints move from
`401`/`500` to real data. `JWT_SECRET` alone gets you past auth; the Supabase
and Turso values are what make the data appear.

There is **no authentication gate on the admin pages themselves** — the
`admin` layout renders unconditionally, and only the *function* calls are
protected. The dashboard shells are therefore world-readable; the data behind
them is not. If that is not intended, the gate belongs in
`site/layouts/admin/single.html` (and `customer.html`), redirecting to a login
or returning 404 for unauthenticated requests. Flagged, not changed, because
it is a product decision.

## Existing test assets

`scripts/testing/` has hand-rolled scripts that were never wired into
`package.json` and have not been run:

| Script | What it does |
|---|---|
| `test-dashboard-apis.js` | hits `localhost:8888` admin endpoints — the closest thing to an admin integration test that exists |
| `test-end-to-end.js` | broader flow, same target |
| `test-end-to-end-mock.js`, `test-followup-mock.js` | mocked, no server needed |

They hardcode `http://localhost:8888`, so they need to run somewhere the dev
server is reachable (or the constant changed). Wiring `test-dashboard-apis.js`
into `package.json` and pointing it at the CI host would give the admin a real
smoke test — that is the obvious next step.

## Automated coverage today

`./ci/run.sh test` runs jest: **41 of 72 pass**. The 31 failures are
pre-existing assertion rot, detailed in `test-status.md`. Notably the
`followup-campaigns` suite is among them, which is why the joi breakage went
unnoticed for so long. The CI `test` job is non-blocking on purpose.

## Checking the functions compile

```bash
./ci/run.sh fn-bundle
```

Should print 51 `Loaded function` lines and zero `Failed to load`. This is the
cheapest regression check for the admin, because a function that does not
bundle simply does not exist at runtime.

## Known gap: @libsql native binary

`health-check` (and anything touching `utils/database-service.js`) fails with:

```
Error: Cannot find module '@libsql/linux-x64-gnu'
```

`@libsql/client` selects its platform binary through an *optional* dependency
with a conditional `require`, which esbuild cannot follow. `netlify.toml` now
declares it under `[functions] included_files`, which is the correct Netlify
mechanism — but **this can only be confirmed by an actual deploy**, since
`netlify dev` does not apply the same packaging. Treat it as unverified until
the first deploy.
