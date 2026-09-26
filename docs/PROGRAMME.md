# Work Programme — State

Durable continuity across sessions. **Loom MCP was unreachable in the sessions
that produced this file** (the tool catalogue advertises `loom` with ~454 tools
but every call returns `Unknown tool`), so these files are the fallback the
loom-orientation skill prescribes. When loom returns, mirror this into
`tc_*` tasks and `ekl_update` seeds.

Read this file first in any new session. Do not re-derive what is settled here.

## Ground rules (from the programme owner)

- Go to the low level. No abstractions between the question and the truth.
- Native first. If Hugo/Node/the platform can do it, no dependency.
- Evidence over assertion. Measure, then claim.
- Explorative and imaginative, but with scientific rigour — no hallucinated
  results. A number without a command behind it is not a number.
- Build around this ecosystem. Do not copy other people's work.
- 2–3 agents per session, several sessions until the programme is complete.
- Watch the daily/weekly model limits; do not run through them.

## Non-negotiable infrastructure facts

| | |
|---|---|
| Build host | `10.1.0.25` (`cicd-runners`) — **do not** disturb its 12 GitLab runners |
| Build driver | `./ci/run.sh <target>` |
| Build image | `caddy-netlify-build:2026` — Node 24.21, npm 11.19, **Hugo 0.166.0 extended**, netlify-cli 27.10, @netlify/build 37.3 |
| Live preview | `./ci/preview.sh up` → `http://10.1.0.81:8090` (VM 999, k3s-node-81, under the `10.1.0.10` Proxmox host) |
| Functions server | `./ci/run.sh functions` → `http://10.1.0.25:8888` (netlify dev, all 51 functions) |
| Netlify site | `vibrant-ritchie-0cef93` = **caddyed.com**, id `532a7445-ce96-40c1-bebb-b9d14a0d0e10` |
| Netlify remote builds | **disabled on purpose.** Deploys upload a prebuilt dir: `netlify deploy --prod --dir=site/public --functions=netlify/functions`. Zero build minutes. |
| Deployment | **manual only.** `make deploy-prod` or the `Deploy` workflow. Never auto-deploy from a push. |

## Gates — all must pass before any commit

```bash
./ci/run.sh verify     # build + asset gate + content gate -> PASSED
./ci/run.sh fn-bundle  # all functions compile   -> loaded 51 failed 0 errors 0
npm run lint           # 0 errors (warnings allowed)
```

`ci/verify-content.js` runs as part of `verify`. It exists because the single
worst defect found so far produced a **perfectly valid build**: the fork of
Netlify's `victor-hugo` starter still carried the demo content, so
`/products/` was the Kaldi Coffee pricing page (37 mentions of coffee, a
3 lbs/month subscription table) and `/values/` was "Shade-grown coffee" and
"Direct sourcing". Neither was in the navigation, so nobody noticed. No
output-inspecting gate can catch that -- the pages built fine.

The asset gate (`ci/verify-build.js`) has earned its keep repeatedly: it caught
the `/images/` plural path, the non-existent `/img/placeholders/` directory, and
the never-emitted `lang.NumFmt` — none of which any other check noticed.

## Settled — do not redo

- **Build chain repaired.** Webpack removed from the front end; Hugo Pipes
  (`js.Build` / `css.Sass`) compiles and fingerprints CSS/JS. The `dist/` +
  manifest contract that could not disagree is gone.
- **Three structural document bugs fixed.** `partials/header.html` was a whole
  HTML document nested inside `baseof.html` (two doctypes per page, footer
  emitted after `</html>`); the footer opened with a stray `</main>` and
  imported four scripts no build ever emitted; vehicle images resolved into
  `site/static/img/placeholders/`, a directory that has never existed.
- **Functions bundle.** 51/51. `src/lib` moved into `netlify/functions/lib` and
  converted to CommonJS. `gray-matter` was required but never declared.
- **joi 18 fix.** `commonSchemas.pagination.limit` was always `undefined` (you
  cannot reach into a compiled `Joi.object`). Extracted `paginationFields` /
  `sortingFields`.
- **npm `EALLOWSCRIPTS`.** The allowlist belongs in `package.json` `allowScripts`,
  **never in `.npmrc`** — `npm run` injects `.npmrc` keys as `npm_config_*` and
  npm 11 rejects that form for project-scoped installs.
- **Hugo extended is a separate artifact** since 0.146 (`hugo_extended_*`).
  The build asserts `+extended` and fails loudly otherwise.
- **Inventory sync works.** `scripts/inventory/` — reads the dealer site's
  schema.org JSON-LD, mirrors images, writes Hugo content, idempotent, gated.
- **Images.** 78% smaller, zero dealer.com hotlinks. `docs/images.md`.
- **Decap CMS** replaced `netlify-cms-app` (unmaintained) and unblocked React 19.

## Open work, in dependency order

### 1. Admin front-end wiring — **largest gap**
The backend exists; the UI does not. `netlify/functions/` has lead scoring,
rep assignment, interactions, follow-up campaigns, analytics, search and GDPR
opt-out. Almost none of it is reachable from a page.

- `site/content/admin/leads.md` has an entire app class **inlined in markdown**.
- `site/assets/js/components/lead-scoring-dashboard.js` exists but **no page
  loads it**.
- `admin/dashboard.md` loads only `salesDashboard.js`.
- No auth gate on the admin *pages* (the function calls 401 correctly). Needs a
  product decision — see "Open questions".

### 2. Static site imagery
Only vehicle photos are optimised. The site's own images (`site/static/img/`)
are still raw JPEGs served at one size, and the home hero is a plain `<img>`.
Migrating them to `site/assets/img/` + `partials/picture.html` is the same work
already done for vehicles.

### 3. Contact / lead capture
`site/layouts/partials/contact-form.html` and the `/api/contact` redirect are
unverified end to end. The functions return 401 without credentials; the form
path has never been exercised in a browser.

### 4. Test suite
41/72. The 31 failures are pre-existing assertion rot, catalogued in
`docs/test-status.md`. Non-blocking in CI by design.

### 5. Dead code to reap
`site/assets/js/` still holds unreachable modules with latent bugs (documented
in `docs/test-status.md` → "Known dead files"), plus `vehicle-inventory.js` and
`src/lib/` leftovers.

## Open questions for the owner

1. **Admin auth.** Should `/admin/*` pages be gated (redirect/404 when
   unauthenticated), or is world-readable dashboard shell acceptable? The data
   behind them is already protected.
2. **Turso programme.** Taskmaster tasks 32–43 are a 12-task hybrid
   Supabase+Turso architecture, all pending, all blocked behind each other.
   In scope now, or park it?
3. **Real inventory feed.** If a DMS feed is ever available, `INVENTORY_SOURCE_URL`
   supersedes the crawl. Is one available?
4. **Non-Cadillac stock.** The bargain-inventory page yields BMW/Nissan/Volvo
   trade-ins. Keep them listed, or filter to Cadillac only?

## Session log

| Session | Focus | Outcome |
|---|---|---|
| 1 | Review, root causes, build chain repair | Build green; Netlify remote builds disabled |
| 2 | Test harness, lint config, live `process.env` bug | Functions bundle; lint 0 errors |
| 3 | k3s preview, full stack modernisation, Decap migration | netlify-cli 27, @netlify/build 37, preview live |
| 4 | Admin diagnosis, functions bundling | 51/51 functions; `docs/admin-testing.md` |
| 5 | Redesign, structural bugs, inventory sync | 57 pages, sync working, images −78% |
