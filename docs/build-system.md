# Build System

How `caddy-ed-cadillac-hugo` is built, and why it works the way it does.

## TL;DR

| | |
|---|---|
| **Static site** | Hugo Extended 0.166.0 |
| **Front-end CSS/JS** | Hugo Pipes (`js.Build` / `css.Sass`) — built into Hugo |
| **CMS bundle** | the one remaining webpack build (`webpack.cms.js`) |
| **Backend** | Netlify Functions (Node 24) |
| **Build host** | 10.1.0.25, inside `caddy-netlify-build:2026` (podman) |
| **Deploy** | `netlify deploy --dir=site/public` — **no build minutes used** |
| **Netlify remote builds** | disabled on purpose |

## Running a build

```bash
./ci/run.sh build      # full production build on the CI host
./ci/run.sh verify     # build + assert no page references a missing asset
./ci/run.sh test       # netlify/functions jest suite
./ci/run.sh shell      # interactive shell in the build container
make build             # same as ./ci/run.sh build
```

Every one of these rsyncs the working tree to `10.1.0.25:/var/tmp/caddy-build`
and runs the command inside the podman image. Nothing is compiled on your
workstation, and Netlify's remote builders are never used.

To change the toolchain, edit `ci/Containerfile` and run `./ci/run.sh image`.

## The pipeline

`scripts/build-for-netlify.js` runs these steps in order:

1. **Assert Hugo is the extended build.** Fails immediately otherwise. Since
   Hugo 0.146 the extended build is a *separate* release asset
   (`hugo_extended_*`); installing the default `hugo_*` package gives you a
   binary with no esbuild or libsass, and every asset call fails.
2. **Clean** `site/public` and `site/resources`.
3. **Install root dependencies.** Hugo Pipes resolves the bare npm imports
   (`lazysizes`, `date-fns`) out of `./node_modules` via esbuild.
4. **Install `netlify/functions` dependencies** (production only).
5. **Build the CMS bundle** with webpack. Non-fatal — a CMS failure must not
   take the public site down.
6. **Run Hugo**, which emits all HTML *and* the fingerprinted CSS/JS.
7. **Verify** — `ci/verify-build.js` fails the build if any page references a
   local asset that does not exist.

## Why there is no webpack on the front end

Historically the front end was webpack + a `dist/` directory, and it was broken
in a specific, repeatable way:

- `scripts/build-for-netlify.js` copied `dist/*` into `site/public/`, but
  **nothing ever ran webpack**, so `dist/` never existed — and the
  `2>/dev/null || echo` in that step swallowed the failure.
- Templates hardcoded `<script src="/js/index.js">`, but webpack emitted
  `main.<hash>.js` / `styles.<hash>.css` into `dist/`. The names could never
  match.
- The two webpack configs disagreed about the manifest filename
  (`webpack.json` vs `assets.json`).

Net result: **every page 404'd its own JavaScript**, and the site shipped
unstyled and inert while looking superficially "built".

Hugo Pipes removes the entire class of problem: the template asks Hugo for the
resource, Hugo builds and fingerprints it, and the URL it emits is correct by
construction. There is no `dist/`, no manifest to keep in sync, and no
opportunity for the template and the bundler to disagree.

See `site/layouts/partials/assets.html`.

## Assets

| Output | Source | Mechanism |
|---|---|---|
| `css/main.min.<sha512>.css` | `site/assets/css/main.css` | `minify` + `fingerprint` |
| `css/customer-portal.min.<sha512>.css` | `site/assets/css/customer-portal.css` | `minify` + `fingerprint` |
| `css/inventory.min.<sha512>.css` | `site/assets/css/inventory.scss` | `css.Sass` → `minify` → `fingerprint` |
| `js/main.<sha512>.js` | `site/assets/js/index.js` | `js.Build` (esbuild) → `fingerprint` |
| per-page bundles | `site/assets/js/<name>.js` | `js.Build`, driven by front matter |

Fingerprinted assets are served with `Cache-Control: immutable, max-age=1y`
(see `netlify.toml`). Only production builds fingerprint; development builds
stay unfingerprinted so rebuilds are cheap.

### Page-scoped bundles

Pages declare their own scripts and stylesheets in front matter:

```yaml
---
title: "Follow-up Campaign Manager"
scripts:
  - components/followup-campaign-manager.js
  - components/followup-analytics-dashboard.js
---
```

`partials/page-scripts.html` bundles each entry and automatically pulls in the
matching `components/<name>.css` if it exists. Components must self-initialise
(see `salesDashboard.js` for the pattern) — do not inject `<script>` tags from
markdown.

## The CMS is the exception

Netlify CMS needs `netlify-cms-app` + React + eight preview templates bundled
together, and the preview templates are registered dynamically at runtime
against a shared React instance. A single-entry esbuild pass cannot express
that, so the CMS keeps a dedicated webpack build scoped to exactly one entry
and one output: `site/static/cms.js`, referenced by `site/static/cms.html`.

Its config is `site/static/admin/config.yml`. Note it targets the `master`
branch — it previously said `main`, which does not exist in this repository, so
every CMS publish would have failed.

## npm lifecycle scripts (EALLOWSCRIPTS)

npm 11 refuses to run dependency install scripts unless they are allowlisted.
The allowlist lives in the **`allowScripts` field of `package.json`**, and
deliberately *not* in `.npmrc`.

That distinction matters and cost real debugging time. When you run
`npm run <script>`, npm injects every `.npmrc` key into the child process as
`npm_config_<key>`. An `allow-scripts` line in `.npmrc` therefore reaches the
nested `npm install` as an environment variable, and npm 11 rejects that form
for project-scoped installs:

```
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
```

The `package.json` field is not converted to an env var, so it works in both
direct and nested installs. For the same reason, `ci/Containerfile` passes
`--allow-scripts` on the global `npm install -g` command line rather than
persisting it globally, and the build script defensively strips
`npm_config_allow_scripts` from its child environment.

## Verification gate

`ci/verify-build.js` is the check that would have caught the original outage.
It walks every generated HTML file, collects every `src`/`href`/`srcset`,
resolves each root-relative reference against the publish directory, and fails
if any are missing. It also enforces bundle size budgets and asserts that the
site emitted *some* JavaScript — a site with no JS is a bug, not a valid build.

```
  Checked 459 local asset reference(s)
  OK    all referenced assets exist
```

## Troubleshooting

**`the hugo on PATH is not the EXTENDED build`**
You are not in the container, or the image is stale. Use `./ci/run.sh`, or
install the `hugo_extended_*` release asset.

**`EALLOWSCRIPTS`**
Something is setting `npm_config_allow_scripts`. Check `.npmrc` and any global
npm config; the allowlist belongs in `package.json`.

**A page renders unstyled**
Check whether its stylesheet is emitted by `assets.html` or declared in front
matter. `ci/verify-build.js` catches missing *files*; it cannot catch a page
that never requested its stylesheet at all.

**Builds work locally but not in CI**
Almost always a toolchain drift. Compare `.nvmrc`, `.tool-versions`,
`netlify.toml`, and `ci/Containerfile` — they are meant to agree.
