# Vehicle Images

How photography is stored, encoded and delivered — and the measurements behind
the choices.

## Summary

| | Before | After |
|---|---|---|
| Source | `pictures.web.dealer.com` (hotlinked) | mirrored to `site/assets/vehicles/` |
| Per card image | 1 × 1024w JPEG, **108 KB** | **23.5 KB** AVIF at the width actually used |
| Formats | JPEG only | AVIF + WebP + JPEG, negotiated |
| Widths | one | 320 / 640 / 1024 / 1600, DPR-aware via `srcset` |
| Requests to dealer.com | **one per visitor per image** | **one per vehicle per day** |
| Third party in the LCP path | yes | no |

Measured on this project's actual source photographs (1024×768 JPEG, 108,003
bytes, already metadata-free — 16 bytes of JFIF, no EXIF):

| Variant | Bytes | vs source |
|---|---|---|
| avif 640w q60 | **24,053** | **−78%** |
| webp 640w q80 | 29,030 | −73% |
| jpg 640w q80 | 45,910 | −57% |
| avif 1024w q60 | 50,338 | −53% |
| webp 1024w q80 | 61,234 | −43% |
| **jpg 1024w (what was served)** | **108,003** | — |

A vehicle card is ~380 CSS px wide, so a DPR-aware browser picks the 640w
variant: **23.5 KB instead of 105.5 KB.**

## Why mirror at all

The inventory feed points at `pictures.web.dealer.com`. Serving those URLs
directly means every visitor to this site generates a request to the dealer
group's CDN. That is load on someone else's edge for our benefit, it puts a
third party in the critical path of our LCP, and it hands them our traffic
analytics whether they want them or not.

Mirroring once at sync time moves that cost to a single daily batch and makes
the site self-sufficient: if dealer.com is slow or down, our pages are not.

## Why the originals are stored, not pre-optimised binaries

`site/assets/vehicles/` holds the **originals**. The delivery set is derived at
**build time** by Hugo's built-in libvips.

That means:

- No `sharp`, no `cwebp`, no extra binary in the build image — the codec work is
  Hugo's, already present in Hugo Extended.
- The format set can change without re-pulling anything.
- The repo stays honest: what you see is the source of record.
- `git log` on a vehicle file shows exactly when its price, spec or photo
  changed.

`git log` on `scripts/inventory/structured.js` is the history of every change to
the feed contract.

## Two rules encoded in `partials/picture.html`

**1. Never upscale.** Re-encoding the 1024w source to 1600w measured **+48%
larger** with no added detail. Candidate widths above the source width are
dropped, and the true source dimensions are recorded in front matter
(`image_width`) by the mirror.

**2. One original serves every size.** A 320px card and a 1200px hero share the
same file; the browser picks. The card never pays for the hero.

## Politeness

Images are the heaviest thing this project fetches from the dealer site, so
`scripts/inventory/images.js` applies the same discipline as the page crawler:

- one pull per vehicle per 24 h, sharing the sync's gate
- conditional requests (ETag / If-Modified-Since) per image, so an unchanged
  photo costs one 304
- 750 ms delay between image requests, 60 per run maximum
- circuit breaker: four consecutive failures aborts the image pass
- every fetch, skip and failure recorded in the audit log

**A failed image is never fatal.** The vehicle still gets listed and falls back
to the bundled placeholder — missing photography must not mean missing
inventory. That is why a 0-failure run is the expected case, not the required
one.

## Caching

Generated filenames embed a content hash, so if the bytes change the name
changes. `netlify.toml` serves them `immutable, max-age=1y`:

```toml
[[headers]]
  for = "/vehicles/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    Vary = "Accept"
```

## Local run state

Not content, not committed:

- `site/data/.inventory-images-state.json` — ETag/Last-Modified per image
- `site/assets/vehicles/` — the mirrored originals (committed, so builds are
  reproducible without re-fetching)

## Adding a size

Extend the ladder in `partials/picture.html`; the partial automatically drops
any width larger than the source. Currently:

```
320 / 640 / 1024 / 1600
```

`1600` only appears for vehicles whose source is 1600w or wider — 27 of the
current 35. The rest cap at 1024.

## Verifying

```bash
# what the build actually produced
find site/public -name '*.avif' | wc -l
find site/public -name '*.webp' | wc -l

# confirm no hotlinks to the dealer CDN survive
rg -c 'pictures\.web\.dealer\.com' site/public --glob '*.html' || echo "none"
```

The last check should print `none`. If it does not, a template is bypassing
`partials/picture.html` and re-introducing the third-party dependency.

---

# Site Imagery

The section above is about the dealer's photographs. This one is about the
site's *own* pictures — the ones in `site/static/img/` that were being served
raw: one size, no codec negotiation, no responsive widths, no `width`/`height`,
across 57 pages.

Handled by `partials/static-picture.html`. Same two rules, same encoder, same
measurements as above.

## The inventory

57 files in `site/static/img/`, 4.79 MB, measured at `17e6626`. Categorised by
what a visitor actually looks at, and by whether libvips can help at all.

Several rows below have since been changed by other work in the tree — the
"Resolved since" note at the end of this document says which. The inventory is
reported as measured, because the point of it is the decision that was made
from it.

### Content imagery — photographs a visitor sees (18 files, 2.71 MB)

| File | Bytes | Px | Pages | Verdict |
|---|---:|---|---:|---|
| `home-jumbotron.jpg` | 141,447 | 1920×1280 | 1 | **optimised** — the LCP element |
| `products-jumbotron.jpg` | 136,554 | 1920×1280 | 1 | CSS `background-image` |
| `products-grid1.jpg` | 329,208 | 1920×1464 | 1 | needs `image-grid.html` |
| `products-grid2.jpg` | 166,193 | 1920×1280 | 1 | needs `image-grid.html` |
| `products-grid3.jpg` | 149,603 | 1920×1277 | 1 | needs `image-grid.html` |
| `products-full-width.jpg` | 217,443 | 1916×1272 | 1 | **optimised** |
| `about-jumbotron.jpg` | 167,854 | 1920×1239 | 1 | CSS `background-image` |
| `about-direct-sourcing.jpg` | 194,683 | 1920×1272 | 1 | needs `media-block.html` |
| `about-reinvest-profits.jpg` | 161,713 | 1920×1080 | 1 | needs `media-block.html` |
| `about-shade-grown.jpg` | 108,493 | 1920×1282 | 1 | needs `media-block.html` |
| `about-single-origin.jpg` | 116,457 | 1920×1280 | 1 | needs `media-block.html` |
| `about-sustainable-farming.jpg` | 196,653 | 1024×680 | 1 | needs `media-block.html` |
| `caddy-ed-with-text.png` | 321,352 | 710×650 | 2 | needs `jumbotron.html` |
| `blog-chemex.jpg` | 146,657 | 1920×1282 | 0 | orphan |
| `blog-index.jpg` | 164,829 | 1920×1272 | 0 | orphan |
| `blog-flavor_wheel.jpg` | 60,110 | 1024×681 | 0 | orphan |
| `home-about-section.jpg` | 196,603 | 1024×680 | 0 | orphan |
| `cadillac-logo-desktop-wallpaper…jpg` | 259,298 | 1920×1080 | 0 | orphan |

"Pages" is the count of generated HTML files that referenced the file, measured
by `rg -c` over the publish directory — not a guess from the templates.

The `needs <partial>` column names the out-of-scope partial that emitted the
tag. Every one of those partials has since been deleted as unreachable, along
with the `/products/`, `/values/` and `/tech/` pages that used them, so the
files are listed here to show what was measured rather than as a work queue.

The five `pages=0` rows and everything above them except the two bolded files
have since been **removed from the build** by the starter-template content
purge: `/products/`, `/values/` and `/tech/` no longer exist, so the section
layouts and the partials that emitted these photos are unreachable. That is
the single biggest reason the numbers below look modest.

### UI assets — do not put these through libvips (39 files, 2.08 MB)

| Group | Files | Bytes | Why not |
|---|---:|---:|---|
| Social + UI icons (`.svg`) | 8 | 12,995 | 24–32 px vectors. A srcset of one 24 px icon is noise. |
| Illustrations (`.svg`) | 4 | 17,534 | 240×190 vectors, fixed 240 px slot. |
| PWA / mstile / favicon (`.png`, `.ico`) | 11 | 25,377 | The *dimensions are the API*. 16×16 stays 16×16. |
| `apple-touch-icon.png` | 1 | 1,641 | Requested at exactly 180×180. |
| `og-image.jpg` | 1 | 91,417 | Crawled by other people's servers, never negotiated. |
| `placeholder-*.jpg` | 3 | 8,716 | **moved** — see below. |
| Wordmarks / backgrounds | 11 | 1,937,000 | See the two findings below. |

Total UI + content = 4.79 MB, matching the directory.

Three things in that table are not really UI assets and were worth a decision:

1. **`logo.svg` was 265,392 bytes and it was 2,606 bytes of vector wrapped
   around a 197,087-byte base64-embedded raster** — an Adobe Illustrator export
   that was never re-saved. It was referenced twice on **every one of the 54
   pages**, at 180×34 CSS px: **530,784 bytes per page view, 100% of the image
   weight of a typical content page.** It was classified as a UI asset and left
   alone, because the fix is to re-export the vector — an art task, not a build
   task. (It has since been re-exported to a 1,965-byte vector. See
   "Resolved since".)

2. **`clouds.png` is not a PNG.** `file` reports
   `JPEG image data … 653x362`. A 29 KB JPEG wearing a `.png` extension.

3. **`site/static/img/dealership/` is an empty directory**, and
   `site/content/**` still points at six files that do not exist anywhere:
   `contact-hero.jpg`, `hero-cadillac.jpg`, `featured/{escalade,ct5,xt5}.jpg`,
   `vehicle-placeholder.jpg`.

## Why the files moved instead of being processed in place

**Hugo cannot process anything in `site/static/`.** That is not a missing
feature call, it is the design: `resources.Get` / `.Resize` / `.Fill` read the
*asset* filesystem, and `static/` is a publish-only mount that Hugo copies byte
for byte. There is no `resources.GetStatic`, and the only bridge from a
publish-only path to a `Resource` is `resources.GetRemote` — i.e. re-fetching
our own files over HTTP during the build, which would make the build depend on
the network and still need somewhere to put the answer.

So the content imagery that an in-scope template serves moved to
`site/assets/img/`:

```
site/assets/img/home-jumbotron.jpg      141,447   the hero
site/assets/img/products-full-width.jpg 217,443   section/products.html
site/assets/img/placeholder-vehicle.jpg   3,276
site/assets/img/placeholder-blog.jpg      2,463
site/assets/img/placeholder-person.jpg    2,977
```

**Moving the placeholders fixed a live bug.** `partials/picture.html:42` has
always defaulted its fallback to `img/placeholder-vehicle.jpg` and then done
`resources.Get` on it — and `site/assets/img/` did not exist, so the fallback
branch silently emitted *nothing* at all. A vehicle whose photograph failed to
mirror rendered with no image element rather than with the placeholder.

### The rule for what goes where

Hugo does **not** mirror `assets/` into the publish directory. A file in
`assets/` is only published if something touches its `RelPermalink`. This is
not a detail — it is why the first attempt broke the build:

> Moving `about-*.jpg` and `products-grid*.jpg` into `assets/` while
> `partials/jumbotron.html`, `partials/media-block.html` and
> `partials/image-grid.html` still printed the front-matter path verbatim
> produced eleven 404s on `/values/` and `/products/`, and
> `ci/verify-build.js` caught every one of them. Those files went back to
> `static/`.

So the split is by **who emits the tag**, not by file size:

- `assets/img/` — anything an in-scope template serves through
  `static-picture.html`.
- `static/img/` — anything a CSS `background-image` or a partial this change
  does not own still points at by URL.

## `partials/static-picture.html`

Same contract as `picture.html`, plus:

- **reads the true source width off the Resource** (`.Width`) rather than
  trusting an `image_width` in front matter, so the no-upscale cap is exact by
  construction and cannot drift out of sync with the file;
- **single-size passthrough** for anything that is not a raster, or that a
  caller marks `passthrough`, so an SVG icon never reaches libvips;
- **`resource` key**, for callers that already called `resources.Get` just to
  test whether the file exists (`about/list.html` does exactly this);
- **falls back to the bundled placeholder** rather than emitting a `src` that
  can only 404;
- **`data-src=""` marker** — see the lazysizes finding below.

### The lazysizes finding

`site/assets/js/lazyload.js:8` ships this to production. It reaches the page
through `partials/assets.html:45` → `js/index.js` → `index.js:23`
(`import './lazyload'`), and it is present in the built
`js/main.<hash>.js` bundle today:

```js
document.querySelectorAll("img:not(.lazyload):not([data-src])").forEach(e => {
  let t = e.getAttribute("src");
  t && (e.setAttribute("data-src", t),
        e.setAttribute("src", "data:image/gif;base64,R0lGODlh…"),
        e.classList.add("lazyload"))
})
```

It moves every image's `src` to `data-src`, swaps in a 1×1 GIF, and adds
`.lazyload` — and `components/lazy-loading.css` has `.lazyload { opacity: 0 }`.
Native `loading="lazy"` made this obsolete years ago.

**This was already reloading the home page hero.** The hero had no
`.lazyload` and no `data-src`, so the block matched it, blanked the `src` and
handed the real 141 KB JPEG to lazysizes to fetch later. On the LCP element.

`static-picture.html` emits `data-src=""`, which is the only attribute-presence
marker that selector honours, so the rewriter skips the element: no GIF swap,
no `opacity: 0` flash, and the browser gets to choose the AVIF variant itself.
The value is empty on purpose, so `img.dataset.src` stays falsy for anything
else that reads it.

**The real fix is to delete `lazyload.js` and its `index.js:23` import**,
which is `site/assets/js/**` and therefore outside this change. Until then the
marker is the opt-out.

## Measurements

Method is the one above: build both trees, parse the generated HTML, work out
which `srcset` candidate a browser would actually pick for a given viewport and
DPR, prefer AVIF, and sum the real on-disk byte sizes of the files it would
fetch. Not a sum of the publish directory.

```bash
node scripts/image-audit.js /path/to/before/public /path/to/after/public
```

### Home page hero — the LCP element

Source: `home-jumbotron.jpg`, 1920×1280, **141,447 B**. One size, no
negotiation, and `width="1600" height="900"` — a 1.78 box for a 1.5 image.

| Variant | Bytes | vs source |
|---|---:|---:|
| avif 640w q60 | **20,991** | **−85.2%** |
| webp 640w q80 | 22,796 | −83.9% |
| jpg 640w q80 | 36,017 | −74.5% |
| avif 1024w q60 | 38,272 | −72.9% |
| webp 1024w q80 | 39,724 | −71.9% |
| jpg 1024w q80 | 70,313 | −50.3% |
| avif 1600w q60 | 66,399 | −53.1% |
| webp 1600w q80 | 68,038 | −51.9% |
| jpg 1600w q80 | 132,188 | −6.5% |
| avif 1920w q60 | 80,637 | −43.0% |
| webp 1920w q80 | 84,942 | −40.0% |
| **jpg 1920w q80 (worst case)** | **143,736** | **+1.6% — BIGGER than doing nothing** |

That last row is the useful one. Re-encoding an already well-compressed JPEG
at q80 produces a *larger* file than the original. The JPEG arm of the ladder
saves almost nothing at the top two rungs and can cost bytes; **all of the
saving is AVIF and WebP.** The JPEG arm earns its place purely as a fallback
for browsers that support neither.

### Bytes per page view

Attribution matters here, because a concurrent change replaced `logo.svg`
while this work was in flight. Two rows, not one:

| Page | Viewport | Baseline `17e6626` | This change alone | Current HEAD |
|---|---:|---:|---:|---:|
| `/` home | 390w DPR3 | 716,564 | **641,516** | **114,662** |
| `/` home | 1440w DPR2 | 957,395 | **896,585** | **369,731** |
| `/about/` | any | 530,784 | 530,784 | **3,930** |
| `/specials/` | any | 530,784 | 530,784 | **3,930** |

**This change alone: −75,048 B on the home page (−10.5%), 0 on content pages.**
Every byte of that is the hero. Content pages could not move, because
`logo.svg` was 100% of their image weight.

**Current HEAD: −601,902 B on the home page (−84.0%), −526,854 B on a content
page (−99.3%).** The second half of that is the `logo.svg` re-export, not this
work. Both changes are real and both are measured; they are just not the same
change, and the table says so.

### Publish directory

| | Before | After |
|---|---:|---:|
| raster files | 437 | 444 |
| raster bytes | 23,707,852 (22.61 MB) | 24,144,299 (23.03 MB) |
| `/img/` files | 52 | 59 |
| `/img/` bytes | 4,765,935 | 5,202,382 |
| of which derived ladder | — | 12 files, 804,053 B |

The publish directory **grows by 436,447 B (+1.8%)** and that is the intended
trade: 12 extra files, of which a page view fetches exactly one, in exchange
for 43–85% off the heaviest image on the site. Each file is fetched by at
most one visitor per page view and then cached forever under a content-hashed
name.

The before/after totals are not page-for-page comparable: the baseline is
`17e6626` (57 pages) and the after is HEAD (54 pages), because the
starter-template purge landed in between.

## Still to do

| What | Where | Why it is not done here |
|---|---|---|
| Delete the lazysizes `src` rewriter | `site/assets/js/lazyload.js`, imported at `site/assets/js/index.js:23` | `site/assets/js/**` is out of scope. Until then `static-picture.html` opts out with `data-src=""`. |
| `inventory-hero.jpg` 404 | `site/assets/css/inventory.scss:4` | referenced from CSS, which `ci/verify-build.js` does not scan — a gate gap worth closing |
| `contact-hero.jpg` 404 | `site/content/contact/_index.md:4`, emitted as `og:image` | content is out of scope; the gate does not scan `<meta content>` |
| 5 orphan photographs | `blog-*.jpg`, `home-about-section.jpg`, `cadillac-logo-desktop-wallpaper…jpg` | nothing references them; deleting content is a content decision |
| `products-full-width.jpg` is now unreachable | `site/assets/img/` | `section/products.html` was deleted as unreachable, so nothing serves it and Hugo does not publish it |
| `clouds.png` is a JPEG | `site/static/img/clouds.png` | unreferenced; renaming is a content decision |
| CSS backgrounds need `image-set()`, not `<picture>` | `background-image:` in `layouts/about/list.html:5` | `site/assets/css/**` is out of scope |

Resolved since this was first measured, by other work in the tree:
`logo.svg` re-exported to a real 1,965-byte vector (was 265,392 bytes with a
197 KB base64 raster inside it); the coffee-shop starter layouts and partials
(`jumbotron`, `media-block`, `media-block-reverse`, `image-grid`, `2-up`,
`4-up`, `section/products`, `section/values`) and their SVG illustrations
deleted as unreachable.

## Verifying

```bash
./ci/run.sh verify                       # asset gate: no dangling references
node scripts/image-audit.js site/public  # per-page-view image weight

# the hero must have more than one width, and every candidate must exist
rg -o 'hero__media.*?</picture>' site/public/index.html
```

