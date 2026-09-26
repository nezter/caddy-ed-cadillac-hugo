# Build Quick Reference

Commands that actually exist. (The previous version of this file documented
`npm start`, `build:enhanced`, `build:analyze`, `check:errors`, `cache:clear`,
`reinstall`, `preview`, `lint:fix` and `clean` — none of which were in
`package.json`.)

## Everyday

```bash
./ci/run.sh build          # production build on the CI host (.25)
./ci/run.sh verify         # build, then verify no page references a missing asset
./ci/run.sh test           # netlify/functions jest suite
./ci/run.sh shell          # shell inside the build container
./ci/run.sh image          # rebuild the podman build image
```

Make shortcuts: `make build`, `make verify`, `make test`, `make image`,
`make shell`.

## Deploy

```bash
./ci/run.sh deploy         # draft/preview URL
./ci/run.sh deploy-prod    # production (caddyed.com)
make deploy-prod
```

These upload a **prebuilt** directory, so Netlify starts no builder and
consumes **zero build minutes**. Netlify's own remote builds are disabled on
the site (`skip_automatic_builds`) so a `git push` can never silently spend
credits.

Production deploys also go through `.github/workflows/deploy.yml` (manual,
`workflow_dispatch`, requires typing `deploy` to confirm).

## Local development

```bash
make dev              # hugo server on :1313
make dev-functions    # netlify dev on :8888
make dev-all          # both
make deps             # install root + functions deps
```

## Quality

```bash
make lint             # eslint (flat config, eslint 9)
make lint-fix
npm run verify        # asset gate against site/public
```

## Housekeeping

```bash
make clean            # rm -rf site/public site/resources dist
./ci/run.sh sync      # rsync tree to the CI host without building
```

## Adding a page

```bash
$EDITOR site/content/<section>/_index.md
```

```markdown
---
title: "Financing"
description: "Financing options for new and pre-owned Cadillacs."
# Optional: bundle extra scripts/styles for this page only.
scripts:
  - components/finance-calculator.js
---
```

Then rebuild. Note that a page in `content/` still needs a `layout` in
`site/layouts/` — either a matching section layout or `layout: "page"`.

## Environment variables

Set in Netlify (dashboard or `netlify env:set`) and needed at runtime by the
functions. See `netlify/functions/` for which ones each function reads, and
`scripts/setup-environment.js` for an interactive local setup.

Build-time versions are pinned in `netlify.toml` and must agree with
`.nvmrc`, `.tool-versions` and `ci/Containerfile`:

- `NODE_VERSION` = 24
- `HUGO_VERSION` = 0.166.0 (**extended**)

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `not the EXTENDED build` | non-extended hugo on PATH | use `./ci/run.sh`, or install `hugo_extended_*` |
| `EALLOWSCRIPTS` | `allow-scripts` in `.npmrc` or a global npm config | allowlist belongs in `package.json` `allowScripts` |
| `CHECKED n referenced asset(s) do not exist` | template points at a file no build produces | add it to front matter or `assets.html`; never hardcode `/js/...` |
| CI build works, local doesn't | toolchain drift | align the four version pins |
| `podman image exists` fails | image not built on `.25` | `./ci/run.sh image` |
