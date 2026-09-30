# BUILD.md — what the build costs, and why

Measured on the CI host (`10.1.0.25`, container `caddy-netlify-build:2026`),
2026-09-29. All times are wall clock, cold.

Nothing here runs on Netlify's build runners. `netlify.toml` has
`[build] command = ""`, and the deploy is a prebuilt upload:

```
netlify deploy --dir=site/public --functions=netlify/functions --prod
```

That is deliberate: it uses zero build minutes, and it means the thing that gets
tested is byte-for-byte the thing that gets deployed.

---

## The headline

| | before | after |
|---|---:|---:|
| Function bundle (41 functions) | **317 MB** | **46 MB** |
| Largest single function zip | 13 MB | 5 MB |
| Site build (`build:production`) | 108 s | 108 s |
| Function bundling | 150 s | 150 s |
| Deploy upload | 93 s | see below |

The site build was never the problem. The function bundle was 317 MB for a
67-page static site, and it was 20 MB of that per function for a module that
could not be loaded.

---

## 317 MB → 46 MB

### What it was

`@libsql/client` depends on `libsql`, which declares **one optional dependency
per platform**:

```
@libsql/linux-x64-gnu      ~10 MB   (index.node)
@libsql/linux-x64-musl     ~10 MB   (index.node)
@libsql/darwin-arm64, darwin-x64, linux-arm64-*, win32-x64-msvc, ...
```

`npm install` puts the two Linux ones on disk. The Netlify bundler cannot bundle
a `.node` binary, so it externalises it and copies the whole package into the
bundle. 41 functions × 20 MB.

### Why nothing could load them

This database is a `libsql://` URL reached over HTTPS. A local-file native
SQLite binding cannot open it at all. Not "was unlikely to" — the transport is
not reachable from an HTTPS URL.

The functions now require `@libsql/client/http`, which is the same
`createClient` with the same arguments and none of the local-file transports.

### The part that took three attempts

`included_files` in `netlify.toml` used to force-include them:

```toml
included_files = ["node_modules/@libsql/**", "node_modules/libsql/**"]
```

The reason written next to it was real — `@libsql/client` loads its binary
through an optional dependency esbuild cannot see through a conditional
`require`, so functions died with `Cannot find module '@libsql/linux-x64-gnu'`.
The fix was correct at the time.

**Removing that glob changed nothing.** 317 MB → 317 MB. Two further dead ends
came before the real cause, both worth recording because both looked right:

1. *Hypothesis: the computed `require(MODULE)` in `utils/redis-cache-service.js`
   defeats esbuild's tracing, so the CLI falls back to copying the whole
   functions directory.* There is exactly one such require in the tree, and
   every bundle does contain a nested `netlify/functions/node_modules`. Swapping
   the computed name for a resolvable literal left the bundle at 318 MB. Wrong.
2. *Hypothesis: a stale `.netlify/netlify.toml` carrying the old
   `included_files` is the config being read.* It is gitignored and stale, so it
   was never the committed config — and deleting it changed nothing either.
   Wrong.

The actual cause: the bundler resolves a module it cannot find by **walking up
the tree**. With `netlify/functions/node_modules` cleaned but the repo root
still carrying `@libsql/linux-*`, it found the same two binaries in
`./node_modules` and shipped those instead.

So the fix needs `--omit=optional` on the **root** install as well:

```
npm install --omit=optional                      # root
npm install --omit=dev --omit=optional           # netlify/functions
```

Applied at all five install sites — `ci/run.sh` (3) and
`scripts/build-for-netlify.js` (2).

### Verifying it did not break anything

Removing the natives is not free: any code path still calling the bare
`require('@libsql/client')` now fails. It failed loudly, on the first run, which
is the good outcome:

```
❌ Failed to connect to Turso: Cannot find module '@libsql/linux-x64-gnu'
```

That was `scripts/migrate-turso.js`. All four bare requires are now on `/http`
(three scripts plus `utils/database-service.js` and
`utils/enhanced-database-service.js` in the functions tree), and
`docs/STORAGE.md` shows `/http` too. A silent failure here was the risk; a loud
one is a five-minute fix.

`ci/verify-functions.js` bundles and **loads** every function on every build,
which is the check that would catch a genuine missing module.

---

## What is left in the bundle, measured

47 MB across 42 functions. Measured per zip, not estimated:

| | zips | size each |
|---|---:|---|
| contain `libphonenumber-js` | 4 | ~4.2 MB |
| do not | 38 | ~1.0 MB |

So the library costs **~3.2 MB in each of 4 bundles, ~13 MB total**. The other
38 sit at a ~988 KB baseline, which is mostly `pg`.

**The `/min` import does not help, and that is worth knowing.** It was tried:
`require('libphonenumber-js/min')` instead of the bare entry, and the bundle
went 46 MB → 47 MB. The Netlify bundler copies the whole package directory
rather than tree-shaking it, so all 13 MB ship whether the import asks for one
file or thirty-nine. The lever is the installed package, not the import.

The only remaining way to get the 13 MB back is to **remove the dependency**,
which means losing international phone validation. It is used for exactly one
thing — `normalizePhone`, E.164 formatting for lead deduplication — and this is
a single dealership in North Carolina. That is a reasonable trade, but it is a
capability decision, not a cleanup, so it is not made unilaterally.

### `pg` stays, deliberately

The ~988 KB baseline on all 38 other zips is `pg`, required at the top of
`utils/database-service.js` and `enhanced-database-service.js`. It looks like
the same waste: a database driver for a database that is never opened.

It stays because the Postgres path is **live**, not dead. `getPgPool()` is a
real fallback and `SUPABASE_DB_URL` is referenced in `netlify.toml`. Removing
the driver would remove a working fallback, which is a worse outcome than
carrying 600 KB — and 600 KB is what it actually costs, once measured, rather
than the 317 MB the native libSQL binaries were.

---

## Site build

`hugo --source=site --destination=../site/public --minify --gc --cleanDestinationDir`
plus the CMS webpack bundle.

- `site/public` is 33 MB across 632 files
- 67 HTML pages
- 469 vehicle images, and **all 469 are referenced** by the built HTML — there
  are no dead image variants to remove

The image filenames carry content hashes (`1g6dp5rk2t0116581-f37b5873cf`), so
they are stable across builds and both the browser and the Netlify CDN can
cache them. They are not cache-busting on every deploy.

---

## Before any deploy

```bash
node ci/check-select-columns.js      # every SELECT names real columns
node ci/check-insert-columns.js      # every INSERT has an id and real columns
node ci/check-permissions.js         # required-permission vocabulary
node ci/check-writes-work.js         # an UPDATE actually updates
```

The last one exists because of a silent failure, not a crash — see
`docs/DATABASE-LIVE.md`.
