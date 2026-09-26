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
