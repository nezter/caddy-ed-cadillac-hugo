# Inventory Sync

How live vehicle inventory gets into the site, and the limits it runs under.

## Quick start

```bash
npm run inventory:dry      # report what would change, write nothing
npm run inventory:sync     # pull and apply
npm run inventory:check    # validate the managed content files
npm run inventory:sync -- --source file --file site/data/inventory.example.json
```

On the CI host, with the full toolchain:

```bash
./ci/run.sh inventory         # dry run
./ci/run.sh inventory-write   # apply
```

## Where the data comes from

The dealer group's own website is the system of record:

```
https://www.cadillacofsouthcharlotte.com
```

There are three ways to source vehicles, in order of preference:

| Source | How | When |
|---|---|---|
| **Dealer site** (default) | schema.org JSON-LD off the inventory pages | normal operation |
| `--source http` | `INVENTORY_SOURCE_URL` | if a DMS feed is ever available |
| `--source file` | a local JSON file | offline, fixtures, `--validate` |

### Why JSON-LD and not the JSON API

The site's legacy inventory endpoints are **gone**:

```json
{"message":"Legacy inventory endpoints are deprecated and no longer return data.",
 "pageInfo":{"totalCount":0},"inventory":[]}
```

`/apis/widget/…/getInventory` returns 200 with an empty list. The listing itself
is a client-side React widget (`data-async-widget`), so the cards in the
delivered HTML are **skeleton placeholders** — scraping them would mean running
a headless browser, which is heavy, fragile, and puts real load on the dealer's
edge.

What the site *does* publish, server-side on every inventory page, is
**schema.org JSON-LD** — the same contract search engines consume:

```json
{ "@type": ["Product", "Car"],
  "name": "Certified Pre-Owned 2024 CADILLAC CT5 Premium Luxury",
  "vehicleIdentificationNumber": "1G6DT5RW0R0110060",
  "sku": "GR0110060",
  "vehicleModelDate": 2024,
  "brand": {"name": "CADILLAC"}, "model": "CT5",
  "offers": { "price": "36899", "availability": "https://schema.org/InStock" },
  "image": "https://pictures.web.dealer.com/…jpg",
  "mileageFromOdometer": {"value": 45218},
  "driveWheelConfiguration": "AWD", "vehicleTransmission": "Automatic" }
```

Three small requests, no JavaScript execution, no headless browser, complete
records including real photographs. `scripts/inventory/structured.js` handles it.

Pages read: `/new-inventory/`, `/certified-inventory/`, `/bargain-inventory/`,
plus each family's `?start=` pagination. The site publishes 24 vehicles per
page and links the next offset in its own JSON-LD (`relatedLink`), so a
complete pull walks exactly the pages the site points at, in small batches
with a pause between them. October 2026: 157 new + 8 certified + 4
pre-owned = 169 vehicles across 10 requests, no rate limiting.

**Trade-off:** it reflects what the site chooses to publish, so a vehicle the
site omits will not appear. A direct DMS feed stays more authoritative if one
is ever available — that is why `--source http` exists.

## The limits — and why they are here

This pulls from the dealer's own production site, so the tool is deliberately
restrained. All of it is enforced in `scripts/inventory/crawl.js`, not left to
the caller.

| Control | Default | Env override |
|---|---|---|
| Minimum interval between pulls | **24 h** | `INVENTORY_CRAWL_MIN_HOURS` |
| Permitted window | **01:00–05:00** server local | `INVENTORY_CRAWL_WINDOW_START` / `_END` |
| Delay between requests | **3000 ms** (+ up to 1200 ms jitter) | `INVENTORY_CRAWL_DELAY_MS` / `_JITTER_MS` |
| Batch size, then a pause | **4 requests, then 30 s** (the slow dribble) | `INVENTORY_CRAWL_BATCH` / `_BATCH_PAUSE_MS` |
| Requests per run | **up to 30** (pagination; 10 today) | — |
| Pages per family | guard at **12** | `INVENTORY_CRAWL_MAX_PAGES` |
| Consecutive failures before abort | **2** | — |
| Per-request timeout | 30 s | — |

Plus:

- **`robots.txt` is fetched and obeyed** before any path is requested. The
  dealer site's `User-agent: *` group has 18 disallow rules; the inventory
  pages are not among them, and a server-declared `Crawl-delay` is honoured if
  it is stricter than ours.
- **Conditional requests.** ETag and Last-Modified are stored and replayed, so an
  unchanged site costs one 304 and no parsing or writes.
- **Circuit breaker.** On 429/5xx it backs off exponentially, honours
  `Retry-After`, and aborts the run after two consecutive failures. It will not
  retry a failing endpoint repeatedly.
- **Last-good cache** on disk, so a failed or unchanged run still builds.
- **Audit log** at `site/data/.inventory-audit.log` — every fetch, 304, skip and
  refusal is recorded.

### It does not disguise itself

The original `scripts/fetch-inventory.js` spoofed a desktop-Chrome User-Agent.
Testing against the real edge shows that is counterproductive:

| User-Agent | Result |
|---|---|
| Spoofed desktop Chrome | **429 Too Many Requests** |
| Honest, self-identifying | **200 OK** |

Their CDN (Akamai) rate-limits requests that look like an unidentifiable
browser hammering it, and serves an honest bot fine. So the crawler sends:

```
caddy-ed-inventory-sync/2.0 (+https://caddyed.com; contact: ed@caddyed.com) …
```

Put a real monitored address in `INVENTORY_CRAWL_UA` if you would rather be
contacted directly.

### Manual runs are gated too

The 24 h limit applies to manual invocations, not just scheduled ones:

```
$ npm run inventory:sync

  warn  already ran 3h ago; the minimum interval is 24h

  Next permitted run: 9/27/2026, 2:59:55 AM (in 21.0h)

  This is a deliberate limit: one pull per 24h,
  off-peak only, so this never competes with the live site.
```

`--force` overrides both the interval and the window for a deliberate
out-of-band run. It prints a `FORCED` line and writes a `forced` entry to the
audit log, so an unexpected off-hours hit is always explainable.

## Safety on the content side

- Only files carrying `inventory_sync:` in their front matter are ever written
  or removed. **Hand-written pages in `site/content/inventory/` are untouched.**
- Existing prose is carried over, so a sync never wipes copy you wrote.
- Unchanged vehicles are not rewritten, so a no-op sync produces no git churn.
- Deduplication is by **VIN**, not title — the same car is listed on several
  dealer pages, and several distinct cars share a marketing title. Slug
  collisions get a VIN suffix.
- `--prune` removes managed vehicles that left the feed. Off by default, so a
  transient empty response cannot delete your inventory.
- Records that cannot be normalised are reported and skipped, never written out
  broken.

## Files

| File | Role |
|---|---|
| `scripts/inventory/index.js` | CLI, planning, diffing, writing |
| `scripts/inventory/crawl.js` | robots, gating, rate limiting, cache, audit |
| `scripts/inventory/structured.js` | schema.org JSON-LD parsing |
| `scripts/inventory/schema.js` | normalisation and validation |
| `scripts/inventory/sources.js` | http + file sources |
| `scripts/inventory/content.js` | front-matter read/write (no dependency) |
| `site/data/inventory.example.json` | offline fixture |

Local run state (not content, not committed):
`site/data/.inventory-sync-state.json`, `.inventory-cache.json`,
`.inventory-robots.json`, `.inventory-audit.log`.

## Scheduling it

Off-peak and once a day is the intended rhythm:

```cron
# 02:17 daily — inside the window, off the hour
17 2 * * *  cd /path/to/repo && npm run inventory:sync -- --source file --file <feed> >> /var/log/inventory-sync.log 2>&1
```

If you have a real feed URL, set `INVENTORY_SOURCE_URL` in the environment and
drop `--source file`.

Committing the result is deliberate: content changes stay reviewable rather
than a webhook silently rewriting pages, and the site's inventory history is in
git.

## When the dealer site changes

If the layout changes, the crawler will say so rather than writing garbage:

```
fail  the site responded but the payload contained no recognisable vehicle list.
```

Dump the page and check it against `extractJsonLd` / `collectVehicles` in
`scripts/inventory/structured.js`. Because the source is the site's published
structured data rather than internal markup, it is far more stable than a DOM
scrape would be — but it is still a contract, and `git log` on that file is the
history of every change to it.
