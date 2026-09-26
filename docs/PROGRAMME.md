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

`./ci/run.sh verify` runs four gates. Each exists because a real defect got
through the gates that existed before it, and each was proven by deliberately
re-introducing the defect and confirming the failure.

| gate | what it caught |
|---|---|
| `ci/verify-build.js` | missing assets; nested `<main>`; 0 or >1 `<h1>`; duplicate ids; unrendered `{{ }}` reaching the browser; third-party `<img>` hotlinks; relative `canonical`/`og:url` |
| `ci/verify-content.js` | starter-template content; critical-CSS token drift; Tachyons usage; unreferenced media in `site/static` |
| `ci/verify-endpoints.js` | function calls from a live bundle that resolve to nothing |
| `ci/verify-content.js --strict` | makes Tachyons a hard failure (it is now clean, so strict is the default) |

Two of these exist because the defect produced a **perfectly valid build**:

- The fork of Netlify's `victor-hugo` still carried the demo content, so
  `/products/` was the Kaldi Coffee pricing page (37 mentions of coffee, a
  3 lbs/month subscription table) and `/values/` was "Shade-grown coffee".
  Neither was in the navigation, so nobody noticed. No output-inspecting gate
  can see it -- the pages built fine.
- `netlify.toml` removed the blanket `/api/*` rewrite and nothing updated 20
  call sites. `fetch` returns 404, the code takes an error branch, the page
  renders empty. Green build, empty page.

```bash
./ci/run.sh verify     # all four gates -> PASSED
./ci/run.sh fn-bundle  # all functions compile   -> loaded 51 failed 0 errors 0
npm run lint           # 0 errors (warnings allowed)
node scripts/image-audit.js site/public   # bytes fetched per page view
```

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
- **Images.** 78% smaller per vehicle card, zero dealer.com hotlinks.
  `docs/images.md`. The site's own imagery followed: `/img/logo.svg` turned out
  to be a 265 KB SVG wrapping a 197 KB photograph, used twice per page. Home
  page image weight 626.5 KB -> 112.0 KB on mobile. `docs/styling-audit.md`.
- **`baseURL` is absolute.** It was `"/"`, so every canonical URL and every
  `og:url` on the site was relative. Now `https://caddyed.com/`, overridable per
  build via `HUGO_BASEURL`.
- **Styling audit done.** `docs/styling-audit.md` -- the cascade bug that made
  every primary button Bootstrap blue, the 12.5 KB of section CSS on every
  page, the layout shadowing that hid the contact form, the starter-template
  content, and 21 unreachable layouts and partials removed. Tachyons usage is
  zero.
- **Decap CMS** replaced `netlify-cms-app` (unmaintained) and unblocked React 19.

## Open work, in dependency order

### 0. The wiring gap, quantified — see `docs/feature-inventory.md`

| | |
|---|---|
| Real, working functions | 42 |
| Reachable from a live page | **15** |
| Orphaned, no page can call | **27** |
| JS modules on disk / live / dead | 71 / 7 / **64** (469 KB) |
| Files in `netlify/functions/` that are not functions | 9 (config + ad-hoc test scripts) |

The highest-value single item: `components/advanced-search.js` (31.4 KB of
finished UI) against a 455-line `search` function. Work done on both sides, join
missing. Same shape for lead scoring, lead assignment, the interaction timeline
and notifications.

`ci/verify-endpoints.js` now measures this on every build and carries one
`KNOWN_MISSING` declaration with a reason — a receipt for unimplemented
functionality, not a waiver. It should reach zero.

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

### 2. Contact / lead capture
`site/layouts/contact/list.html` now renders (it was shadowed by a starter
layout, so the site's main conversion page had no form, no phone, no address
and no hours). It has never been exercised in a browser against a real
function. The functions return 401 without credentials.

### 3. Admin component stylesheets
Seven pre-existing component stylesheets are still Bootstrap-era
(`advanced-search.css`, `followup-campaign-manager.css` and five others, 28-30
Bootstrap hex values each). They load only on admin pages, correctly ordered
after `admin.css`. Only `admin.css` was migrated to the design system.

### 4. Test suite
41/72. The 31 failures are pre-existing assertion rot, catalogued in
`docs/test-status.md`. Non-blocking in CI by design.

### 5. Dead JS modules
`site/assets/js/` holds unreachable modules with latent bugs, documented in
`docs/test-status.md` → "Known dead files". `ci/verify-endpoints.js --all`
lists the ones still carrying unrouted `/api/` calls. Twenty of them do.

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
| 6 | Image pipeline, styling audit, asset routing, gates | 54 pages, home page 626 KB → 112 KB, four gates, starter content gone |
