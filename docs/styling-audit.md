# Styling Audit

Findings from reading the generated HTML and CSS rather than the templates.
Every number here was measured; the command is given so you can re-run it.

The theme: **this site is a fork of Netlify's `victor-hugo` starter, and the
fork kept the starter's CSS.** The design system was written fresh
(`site/assets/css/main.css`, 156 class selectors, custom-property driven), but
starter stylesheets still load after it and win the cascade.

## 1. The design system's buttons were overridden site-wide

`partials/assets.html` emitted `customer-portal.css` **after** `main.css` on
every page. That file redefines generic components with Bootstrap-3 values, so
last-writer-wins made a component stylesheet the authority for the whole site.

Cascade resolution for `<a class="btn btn-primary">`:

| # | source | selector | declaration |
|---|---|---|---|
| 1 | `main.css` | `.btn` | `background: var(--btn-bg)` → `--brand-red` `#c8102e` |
| 2 | `customer-portal.css` | `.btn-primary` | `background-color: #007bff` ← **wins** |
| 3 | `customer-portal.css` | `.btn-primary:hover` | `background-color: #0056b3` ← **wins** |

Every primary button on all 56 pages painted **Bootstrap blue, not Cadillac
red**. Four selectors collided: `.btn`, `.btn-primary`, `.btn-outline`,
`.loading`.

`.btn-secondary` was the more serious half. Nothing in `main.css` defined it —
`customer-portal.css` was the *only* definition anywhere — so a component
stylesheet was silently load-bearing for `.btn-secondary` across
`vehicle-card.html`, `about/list.html`, `section/inventory.html` and
`index.html`. Removing the duplicate would have broken those pages. The
component sheet was not a duplicate; it was a dependency wearing a disguise.

**Fix:** the design system is the single owner of generic components.
`.btn-secondary` and a `:disabled` / `[aria-disabled]` state moved into
`main.css` beside their siblings; the nine shadowing rules were removed from
`customer-portal.css`.

**Verify:**

```bash
# 0 collisions now (was 6)
node -e '
const fs=require("fs");
const sel=p=>{const t=fs.readFileSync(p,"utf8").replace(/\/\*[\s\S]*?\*\//g,"");
 const o=[];for(const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g))
 for(const s of m[1].split(",")){const x=s.trim();if(/^\.[A-Za-z]/.test(x))o.push(x);}return o;};
const a=new Set(sel("site/assets/css/main.css"));
console.log(sel("site/assets/css/customer-portal.css").filter(s=>a.has(s)));'
```

## 2. 12.5 KB of section CSS on every page

`assets.html` emitted `customer-portal.css` and `inventory.scss`
unconditionally, so all 56 pages carried both.

Section stylesheets are now attached by the section layouts through the
`headStyles` block `baseof.html` already had, via one shared
`partials/stylesheet.html` that handles `.css` and `.scss` through a single
code path (the old `page-scripts.html` could only do plain `.css`, so a page
could never request an `.scss`).

| page | before | after | |
|---|---|---|---|
| home | 34.2 KB | **22.0 KB** | −35.7% |
| contact | 34.2 KB | **22.0 KB** | −35.7% |
| inventory | 34.2 KB | 28.6 KB | −16.4% (now gets `inventory`, no longer `customer-portal`) |
| customer | 34.2 KB | 27.3 KB | −20.2% (now gets `customer-portal`, no longer `inventory`) |

Layout-driven, not front-matter-driven, on purpose: a stylesheet declared in
content front matter is silently absent the first time someone adds a page and
forgets it. A section layout cannot forget its own stylesheet.

## 3. Class names that style nothing

```bash
# a class used in markup but defined in no stylesheet
rg -o 'class="[^"]*"' site/layouts | tr ' ' '\n' | rg -o '^\.[a-z-]+|^[a-z-]+$' | sort -u
```

Found and fixed:

- **`primary-btn` / `secondary-btn`** — used in `contact/list.html`,
  `_default/list.html` and the old `404.html`; defined in **no** stylesheet.
  Those buttons rendered as an unstyled default `.btn` (grey). Now
  `.btn-primary` / `.btn-secondary`.
- **`img/placeholders/`** — `vehicle-image.html` used to rewrite
  `/img/foo.jpg` to `/img/placeholders/foo-placeholder.jpg`, a directory that
  has never existed. Every vehicle page requested a main image that could only
  404. Replaced by `partials/picture.html`.
- **`/js/index.js` and `/css/main.css`** — hardcoded in templates while webpack
  emitted `main.<hash>.js` / `styles.<hash>.css` into `dist/`, and the Netlify
  build never ran webpack. Every page 404'd its own JavaScript. Replaced by
  Hugo Pipes.

## 4. Tachyons: 86 class usages that were never loaded

25 layouts used Tachyons utility classes (`ph3`, `mv4`, `f2`, `bg-off-white`,
`w-100`…). Tachyons is not a dependency and is not loaded anywhere, so every
one of them was a no-op and that markup rendered unstyled.

157 usages across 15 files at the start of the audit. After removing the dead
layouts and orphaned partials, **86 remain in 10 files — all of them the
`products` / `values` cluster, which served the Kaldi Coffee demo pages and is
itself dead.** Deleting that cluster zeroes the count.

`ci/verify-content.js` warns on this and fails with `--strict`. It matches
class attribute values only: scanning raw template text matched "Skip to
content link" on the `link` utility and "Hugo cannot measure the file" on
`measure`, because the vocabulary contains ordinary English words.

## 5. Layouts shadowing each other

`section/<name>.html` wins over `<name>/list.html` in Hugo 0.166. In two cases
the winner was the starter file and the loser was the real one.

**`section/contact.html` shadowed `contact/list.html`.** The site's main
conversion page was therefore rendering the starter's Tachyons markup: no
contact form, no phone, no address, no hours, an `<img>` with an empty `src`
*and* an empty `alt`, and no `<h1>`. `contact/list.html` is the layout that
renders the form from the content's `form:` front matter — so a front-matter
block nobody could see was fully written and never displayed. Deleting
`section/contact.html` brought it live.

**`inventory/list.html` was dead in the other direction**: 0 references across
57 built pages. It also carried the abandoned "Filter UI will be rendered here
by JS" approach that was replaced by server-rendered filters.

Also deleted: `_default/404.html` (shadowed), `layouts/404.html` (never
renders — `content/404.md` and `_default/single.html` win, verified by
`error-page` appearing 0 times in the built page), and `content/404.md`'s
ineffective `layout: 404` front matter. The 404 page had no way back, so
recovery links went into the content, where no layout can shadow them.

## 6. Document structure

`ci/verify-build.js` now runs `checkStructure` over every generated page:
nested `<main>`, zero or multiple `<h1>`, duplicate `id`, unrendered `{{ }}`
template syntax, third-party `<img>` hotlinks, and `<img>` with an empty `src`.

A browser silently repairs invalid HTML, which is why none of this was visible
in a screenshot or to an asset-existence check.

Found on the first run — 16 problems, 2 of which were real leaks:

- **`admin/dashboard.md` shipped Go template syntax to production.**
  `data-sales-id="{{ .Params.sales_id | default "current-user" }}"`. Hugo does
  **not** evaluate Go templates inside markdown bodies, so that text reached
  the browser verbatim, template internals included.
- **Duplicate `customerEmail` id** — the login form's `<input>` and the
  dashboard's `<p>` shared it, so `customer-portal.js`'s
  `getElementById('customerEmail')` returned the input and the dashboard email
  never filled in. Input renamed to `loginEmail`.
- **Duplicate `id="sales-dashboard"`** — once on the auto-generated heading
  anchor, once on the mount-point div.
- **Three nested `<main>`** — `baseof.html` emits one; `admin/single.html`,
  `_default/single.html` each emitted a second.

`/cms.html` is exempt from the h1 rule: it is a `noindex` Decap shell that
mounts an editor into `<body>` and has no heading by design.

## Design system reference

`site/assets/css/main.css` is ordered tokens → reset → typography → layout →
components → utilities → motion, and is driven entirely by custom properties
in the `:root` block:

| token | value | role |
|---|---|---|
| `--brand-red` | `#c8102e` | Cadillac red; `--accent` aliases it |
| `--brand-navy` | `#1a2b49` | primary dark |
| `--accent-gold` | `#b69f58` | metallic accent |
| `--space-*`, `--radius-*`, `--dur*`, `--ease` | scale | spacing, shape, motion |

Component stylesheets must not redefine anything `main.css` owns. Because
`main.css` loads first, "last writer wins" means a component sheet that
redefines a generic class silently becomes global authority. Put shared
components in `main.css` next to their siblings; keep component sheets to
component-specific selectors.

## Running the checks

```bash
./ci/run.sh verify                # build + asset gate + structure + content gate
node ci/verify-content.js         # content gate alone
node ci/verify-content.js --strict  # Tachyons usage becomes a failure
```

## 7. Assets

`scripts/image-audit.js` counts the bytes a browser actually fetches for one
page view, modelling viewport width, `sizes`, device pixel ratio and codec
preference — not the sum of every file in the publish directory, which
overstates the result and is the number most asset "optimisations" are
reported against.

```bash
node scripts/image-audit.js site/public
```

It found the largest single defect in the audit. `/img/logo.svg` was a 450×450
SVG wrapping a 197 KB base64 PNG — a photograph of a person — rendered at
180×34 and referenced twice per page (header and footer):

| | before | after |
|---|---|---|
| home, mobile 390×844 dpr3 | 626.5 KB | **112.0 KB** |
| home, laptop 1440×900 dpr2 | 875.6 KB | **361.1 KB** |
| logo, per load | 265,392 B | **1,965 B** |
| logo, per page view | 530,784 B | **3,930 B** |

`site/static/img/logo.old.svg` was the real wordmark all along: a 109×24 vector,
1,965 bytes. It had also been stretched — 4.54:1 in the file, 5.29:1 in the
markup. Both call sites now declare 180×40, the true ratio.

`site/static/img/` went from 3.7 MB / 47 files to **168 KB / 15 files**. The 26
removed were unreferenced: Kaldi Coffee page imagery, four unused headshots, a
Cadillac wallpaper, five social icons for a footer with no social links.
`favicon.ico`, the `mstile` set and `safari-pinned-tab` were on disk and
referenced by nothing, so they are now genuinely referenced — `favicon.ico` via
an explicit `<link>`, the tiles via a new `browserconfig.xml`.

`ci/verify-content.js` warns on unreferenced media, scoped to media and
URL-requested files. Scoping matters: `site/static` also holds the Decap CMS
bundle, whose webpack chunks reference each other by numeric filename from
inside `cms.js`, so a naive basename scan reports 111 phantom orphans.

## 8. Metadata and identity

**`baseURL = "/"` with nothing overriding it.** Every page emitted
`<link rel=canonical href=/>` and `<meta property="og:url" content="/"/>`. A
relative canonical is not a warning, it is an identity failure — every page
claimed to be the same URL as every other page, and the build stayed green
throughout. Now `https://caddyed.com/`, with `HUGO_BASEURL` threaded through
`ci/run.sh` and `scripts/build-for-netlify.js` so a preview build does not ship
production canonicals to a dev host.

**No social card on 18 of 54 pages.** `head-meta.html` read
`.Site.Params.og_image`; the config defined `images = [...]` — the wrong key —
naming a file that did not exist. Only pages that set `.Params.image` got a
card. The home page shared nothing.

**The PWA manifest pointed at icons that do not exist.** `site.webmanifest`
named `/img/icon-192x192.png`; the files are `android-chrome-192x192.png`. An
installed PWA had no icons. `site/static/manifest.json` was a stale duplicate
of the same broken manifest, referenced by nothing.

All three are now gated: `checkStructure` fails on a relative `canonical` or
`og:url`, proven against quoted, unquoted and non-`canonical` `rel` values.

## 9. Unrouted function calls

`netlify.toml` removed the blanket `/api/* → /.netlify/functions/$1` rewrite
and nothing updated the call sites. 20 JS files still fetched `/api/lead-scoring`,
`/api/contact-form`, `/api/inventory` and so on. Not a crash — `fetch` returns
404, the code takes an error branch, the page renders empty.

Only two of those files reach a browser (`communication-preferences.js`, 3 calls;
`followup-analytics-dashboard.js`, 1). Establishing that required resolving the
import graph from the declared entries, which is what `ci/verify-endpoints.js`
now does every build.

Two design points in that gate, both learned by getting them wrong first:

- **The two namespaces are resolved differently.** `/.netlify/functions/<name>`
  resolves if a function file exists. `/api/...` resolves *only* where a
  `[[redirects]]` alias matches the whole path. Accepting `/api/x/y` because a
  function named `x` exists is the false negative that let the defect through.
- **Match endpoint literals, not `fetch()` arguments.** `lead-management.js`
  holds its endpoints in a constant and calls `fetch(url, …)`. Matching inside
  the call reported "everything resolves" while the file contained a typo.

## Design system reference

`site/assets/css/main.css` is ordered tokens → reset → typography → layout →
components → utilities → motion, and is driven entirely by custom properties
in the `:root` block:

| token | value | role |
|---|---|---|
| `--brand-red` | `#c8102e` | Cadillac red; `--accent` aliases it |
| `--brand-navy` | `#1a2b49` | primary dark |
| `--accent-gold` | `#b69f58` | metallic accent |
| `--space-*`, `--radius-*`, `--dur*`, `--ease` | scale | spacing, shape, motion |

Component stylesheets must not redefine anything `main.css` owns. Because
`main.css` loads first, "last writer wins" means a component sheet that
redefines a generic class silently becomes global authority. Put shared
components in `main.css` next to their siblings; keep component sheets to
component-specific selectors.

`partials/critical-css.html` inlines six of those tokens so the first paint is
not white-on-white. It is a hand-maintained duplicate and it has drifted before
— it used to define `--primary-color` / `--secondary-color` / `--text-color`,
none of which `main.css` has. `ci/verify-content.js` parses the `:root` block
out of both files and fails on an unknown token or a disagreeing value.

## Running the checks

```bash
./ci/run.sh verify     # build + asset gate + structure gate + content gate
                       #           + endpoint gate
```

| gate | catches |
|---|---|
| `ci/verify-build.js` | missing assets, nested `<main>`, 0 or >1 `<h1>`, duplicate ids, unrendered `{{ }}`, third-party `<img>` hotlinks, empty `src`, relative `canonical`/`og:url` |
| `ci/verify-content.js` | starter-template content, critical-CSS drift, Tachyons usage, unreferenced media |
| `ci/verify-endpoints.js` | function calls from a live bundle that resolve to nothing |

## Remaining

Items needing an owner's decision are in
[`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md). Purely technical leftovers:


- [ ] **`/products/` and `/values/` have no replacement.** The Kaldi Coffee
      pages are gone and the layouts that served them are deleted, but the
      navigation never linked to them, so nothing is broken. If a "Values" page
      is wanted it needs real content and the design system — not the starter
      markup.
- [ ] **The `mstile` / `safari-pinned-tab` assets are conventional, not
      verified in a browser.** They are now referenced from
      `browserconfig.xml` and `head-meta.html`; whether Windows and Safari
      actually pick them up needs a real device.
- [ ] **Seven pre-existing component stylesheets are still Bootstrap-era**
      (`advanced-search.css`, `followup-campaign-manager.css` and five others,
      28–30 Bootstrap hex values each). They load only on admin pages and are
      correctly ordered after `admin.css`, so they win where they apply. Only
      `admin.css` was migrated.
- [ ] **31 test failures** in the auth-middleware and calendar suites are
      pre-existing assertion rot, catalogued in `docs/test-status.md`.
