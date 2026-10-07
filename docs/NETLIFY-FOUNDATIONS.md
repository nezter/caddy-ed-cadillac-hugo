# Netlify Foundations — what is native, what is third-party, what to change

Written 2026-09-27, from a sweep of the built output and `package.json`, not
from memory. Every row is either measured here or marked unverified.

The question this answers: **is this site built on Netlify's own primitives, or
bolted on top of other people's?** Because the difference is not stylistic. A
Netlify Function that needs a Blobs store has no connection string to leak, no
service to provision, no credential to rotate, and no bill that arrives
separately.

---

## Already native

| Primitive | Where | State |
|---|---|---|
| **Functions** | 57 files under `netlify/functions/` | The entire backend (endpoints, scheduled refresh, form events, the admin gate). Deployed prebuilt -- zero remote build minutes. |
| **Scheduled Functions** | `social-refresh.js` (`exports.config.schedule`) | Daily social cache refresh; ci/check-function-auth accepts it as platform-invoked. |
| **Event Functions** | `submission-created.js` | Netlify Forms submissions (stock alerts) recorded into the leads table. |
| **Blobs** | `vehicle-features.js` | Favourites store. **Store creation still owed** unless done in the dashboard -- see below. |
| **Identity** | `static/cms.html`, staff sign-in | CMS login (git-gateway backend) + the sign-in widget. |
| **Forms** | stock-alert form (home), honeypot + reCAPTCHA | Native handling; `submission-created` is the recorder. |
| **Headers / Redirects** | `netlify.toml` (13 header rules, 6 redirects) | Differentiated cache policy, HSTS, CSP, admin noindex; pin by ci/check-netlify-config.js. |
| **Deploy previews (prebuilt)** | `ci/run.sh deploy` + the GitHub Actions dev lane (`deploy-dev.yml`) | `--dir` uploads, stable `dev` alias, zero build minutes. |
| **RSS** | `/articles/index.xml` | Site feed deliberately scoped to the articles section. |

**Third-party JavaScript on a public page: none.** The only external origins the
built HTML references are `facebook.com` (the feed embed) and the site's own
canonical domain. No CDN, no tag manager, no analytics script, no font host
beyond self-hosted CSS. That is worth stating because it is unusual and it is
the reason the site is fast.

---

## Third-party, and whether it should stay

| Package | Used by | Verdict |
|---|---|---|
| `nodemailer` | contact, lead, test-drive, alerts | **Keep.** Netlify has no transactional email. This is the correct boundary. |
| `jsonwebtoken` | auth-middleware, sales-login, customer-auth | **Keep, for now.** See below. |
| `bcryptjs` | password hashing | **Keep.** Netlify Identity would remove the need, but only if the whole auth model changes. |
| `axios` | several functions | **Replace with `fetch`.** Node 24 has it built in. One fewer dependency, and `fetch` is already used elsewhere in the same files. |
| `ioredis` | `utils/redis-cache-service.js` | **Remove.** No Redis is configured anywhere. It is dead weight that only resolves because `tests/setup.js` mocks it. |
| `pg` | `database-service.js` | **Keep until the database is chosen.** |
| `@libsql/client` | `database-service.js` (Turso leg) | **Keep if Turso; drop if Netlify Database.** One or the other, never both. |
| `@supabase/supabase-js` | 7 files | **Superseded.** See below. |

---

## The three changes worth making

### 1. Supabase is already dead — remove it

`@supabase/supabase-js` is imported by 7 files. `SUPABASE_URL` and
`SUPABASE_ANON_KEY` are **set to empty strings** in `netlify.toml` for every
context. No Supabase project is configured, referenced, or reachable.

It is 7 imports and a dependency that can never work. Removing it makes
`database-service.js` the single data path — which is the thing that has to be
true before a database is chosen at all. Right now there are three data paths
(Supabase, Postgres, Turso) and only one can be right.

### 2. `ioredis` is doing nothing

No `REDIS_URL` is set in production. `redis-cache-service.js` is required by
something, and `tests/setup.js` mocks `ioredis` so the absence is invisible to
the test suite. That is a dependency masking the fact that the feature it serves
does not exist.

### 3. `axios` → `fetch`

Mechanical, zero behaviour change, one fewer package. Node 24 has global
`fetch` and the same files already use it.

---

## What is NOT native, and cannot be

**Transactional email.** Netlify has no equivalent. `nodemailer` stays.

**Calendar sync.** Netlify has no calendar primitive. The `.ics` route
(`calendar-invite.js`) is the credential-free part and is done. The two-way
Google Calendar API needs an OAuth client, a verified consent screen, and a
stored refresh token — which means a database. It is written up here rather than
half-built.

**Password auth.** Netlify Identity exists and would remove `jsonwebtoken` and
`bcryptjs` entirely. It is not adopted because the staff side is a single
salesperson and the current JWT path is tested and working; swapping identity
providers is a larger decision than it looks. Flagged, not done.

---

## Context scoping — already in place

`netlify.toml` declares every non-production context explicitly, because
declaring none is not neutral — it means a pull-request preview inherits
production configuration.

```toml
[context.deploy-preview.environment]
  JWT_SECRET = "deploy-preview-not-configured"   # refused by utils/jwt-secret.js
  DATABASE_URL = ""                              # ...
[context.branch-deploy.environment]
  ...
[dev.environment]
  DATABASE_URL = ""
```

The marker secret is a public string, so `utils/jwt-secret.js` refuses it for
signing *and* for verifying, and `ci/verify-endpoints.js` fails if the markers
in the toml and the markers the code refuses ever drift apart in either
direction. A preview provably cannot mint or accept a production token.

---

## The one setup step still owed

**Create a Blobs store named `vehicle-features`.** Until it does, favourites
degrade to nothing and the admin page says so. No other primitive needs a
dashboard click.

---

## Deliberate non-uses (Sep 2026 feature pass)

Everything below was evaluated in the 2026-10 compliance pass and NOT
adopted, each for a reason that is a decision rather than an oversight:

| Feature | Why not |
|---|---|
| **Netlify Image CDN** | Hugo already builds the AVIF/WebP/JPEG ladder at build time from source images; routing through the CDN would add a runtime hop for zero visual gain. |
| **Edge Functions** | The one edge-shaped job -- gating `/admin/*` -- is served well by the existing function (`admin-guard`) with no latency problem worth a second runtime. |
| **Netlify DB / managed Postgres** | The data layer is Turso (libSQL) by design; the functions talk to it over HTTPS with no native bindings. |
| **Identity for staff auth** | Identity runs the CMS login; staff auth is our own JWT with per-rep permissions, already tested end to end. |
| **Build Plugins** | Deprecated for new sites, and this site never builds remotely anyway. |
| **Remote builds / automatic deploys** | Off by design: builds run in the pinned podman image on the CI host; Netlify receives prebuilt directories. |
| **Netlify Analytics** | No scripts on public pages by choice; server-side analytics would be a paid add-on decision for the owner. |
