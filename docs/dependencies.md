# Dependency Currency

Status as of 2026-09-26. What is current, and what is deliberately held back
with the reason.

## Principle

Every bump was applied only after the full pipeline stayed green
(`./ci/run.sh verify` plus `npm run lint`). A version bump that breaks the
build is worse than an old version, so "latest" is not the goal — *working and
current where it can be* is.

## Current

### Toolchain (ci/Containerfile)

| Component | Version | Notes |
|---|---|---|
| Node.js | 24.21.0 | Active LTS. Pinned in `.nvmrc`, `.tool-versions`, `netlify.toml`, `ci/Containerfile` |
| npm | 11.19.0 | ships with Node 24 |
| Hugo | 0.166.0 **extended** | latest; `hugo_extended_*` is a separate asset since 0.146 |
| netlify-cli | 27.10.0 | was 23.15.1 — four majors behind |
| @netlify/build | 37.3.0 | was pinned at `^17`, which was very far behind (35 was arriving transitively) |

### Front end / build

| Package | Version |
|---|---|
| decap-cms-app | 3.16.3 |
| react / react-dom | 19.3.0 |
| webpack | 5.111.1 |
| webpack-cli | 7.2.3 |
| eslint | 9.39.5 |
| globals | 17.12.0 |
| @babel/* | 7.29.x |
| @supabase/supabase-js | 2.117.2 |
| date-fns | 4.1.0 |

### Netlify Functions

| Package | Version |
|---|---|
| joi | 18.2.9 |
| ioredis | 6.0.0 |
| dotenv | 18.0.4 |
| fast-levenshtein | 3.0.0 |
| cheerio | 1.2.0 |
| pg | 8.23.0 |
| @supabase/supabase-js | 2.117.2 |
| libphonenumber-js | 1.11.20 |

### GitHub Actions

| Action | Pinned |
|---|---|
| actions/checkout | v7 |
| actions/upload-artifact | v7 |
| actions/download-artifact | v8 |
| aquasecurity/trivy-action | 0.36.0 |
| github/codeql-action/upload-sarif | v4 |

### Preview server

nginx `1.31-alpine` (resolves to 1.31.6) — was the 1.27 stream.

## Netlify CMS → Decap CMS

`netlify-cms-app` was replaced with `decap-cms-app` 3.16.3. Decap is the
actively maintained fork (published 2026-09-22); Netlify CMS is the legacy
line.

This is what unblocked React 19: `netlify-cms-app@2` declares
`react: ^16.8.4 || ^17.0.0`, so React could not move off 17 while it was in the
tree. `decap-cms-app@3` requires `react: ^19.1.0`.

The config format and the `git-gateway` backend are unchanged, so
`site/static/admin/config.yml` needed no edits. Two things did:

- `site/static/cms.html` no longer links `dist/cms.css`. Decap/Netlify CMS 2.0+
  moved to **CSS-in-JS**; the file upstream serves at that path is a
  deliberately *blank* placeholder for backward compatibility, and upstream
  explicitly asks builds to stop requiring it. The old link was a no-op.
- The favicon was repointed from `/img/favicon.ico` (not in the repo) to the
  PNG favicons that are.

## Deliberately NOT bumped

### Held at a CJS-compatible major

These functions dependencies are **ESM-only at their latest major**
(`"type": "module"`). The 51 functions are CommonJS (`require()`), so bumping
them means migrating every function to ESM — or relying entirely on Netlify's
esbuild bundler to shim the interop, which would then break local `require()`,
the Jest suite, and any direct `node` invocation.

| Package | Held at | Latest | Files affected |
|---|---|---|---|
| node-fetch | 2.7.0 | 3.3.2 (ESM-only) | 4 |
| nodemailer | 6.10.1 | 10.0.10 (ESM-only) | 8 |
| bcryptjs | 2.4.3 | 3.0.3 (ESM-only) | 2 |
| @libsql/client | 0.6.2 | 0.18.0 (ESM-only) | 2 |
| fuse.js | 6.6.2 | 7.5.0 (ESM-only) | 1 |

**To unblock:** convert `netlify/functions/**` to ESM (`"type": "module"`, ESM
imports) *and* fix the test harness at the same time — the Jest config is
currently CommonJS. That is a single coherent piece of work, not five
independent bumps. Do it as one change with the build verified.

Note that `nodemailer` 6 → 10 is four majors, not one; its changelog should be
read before moving.

### Held because of a peer constraint

**eslint 9.39.5** — eslint 10.11.0 exists, but `@babel/eslint-parser@7.29.9`
declares `peer: eslint@^7.5.0 || ^8.0.0 || ^9.0.0`, so npm refuses the tree
(`ERESOLVE`). Moving to 10 means dropping `@babel/eslint-parser` for a
different JSX-capable parser. ESLint 9 is current and fully supported; this is
cosmetic. Revisit when `@babel/eslint-parser` widens its range.

**@babel/\* 7.29.x** — Babel 8 is out. It is ESM-first and the CMS webpack
build uses inline CommonJS Babel options, so the migration is not free. Babel 7
is maintained.

## Checking currency later

```bash
# build image
./ci/run.sh image

# Node-side deps
npm outdated
npm --prefix netlify/functions outdated

# Netlify toolchain vs latest
npm view netlify-cli version
npm view @netlify/build version
npm view decap-cms-app version

# GitHub Actions vs latest
for r in actions/checkout actions/upload-artifact actions/download-artifact \
         aquasecurity/trivy-action github/codeql-action; do
  printf '%-34s ' "$r"
  curl -s "https://api.github.com/repos/$r/releases/latest" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tag_name","?"))'
done
```

## Deprecation audit

```bash
npm --prefix netlify/functions audit --audit-level=high
```

The remaining advisories are transitive dev-dependency noise from the CMS tree
(`superagent`, `uuid@8`, `redux-devtools-extension`) and are not shipped to the
browser bundle.
