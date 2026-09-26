/**
 * images.js -- mirror vehicle photography locally, once, politely.
 *
 * Why mirror at all
 * -----------------
 * The inventory feed points at pictures.web.dealer.com. Serving those URLs
 * directly means every visitor to this site generates a request to the dealer
 * group's CDN. That is load on someone else's edge for our benefit, it puts a
 * third party in the critical path of our LCP, and it hands the dealer group
 * our traffic analytics whether they want them or not.
 *
 * Mirroring once at sync time moves that cost to a single daily batch and makes
 * the site self-sufficient: if dealer.com is slow or down, our pages are not.
 *
 * Why the originals are stored and not pre-optimised binaries
 * ----------------------------------------------------------
 * The originals are kept in site/assets/vehicles/ and the responsive set is
 * derived at BUILD time by Hugo's built-in libvips. Measured on this repo's
 * actual source photographs (1024x768 JPEG, 108,003 bytes):
 *
 *     avif 640w q60 ....  24,140 bytes   (-78%)
 *     webp 640w q80 ....  29,030 bytes   (-73%)
 *     jpg  640w q80 ....  45,910 bytes   (-57%)
 *     avif 1024w q60 ...  50,316 bytes   (-53%)
 *     webp 1024w q80 ...  61,234 bytes   (-43%)
 *
 * Storing originals and deriving keeps the repo honest (what you see is the
 * source) and lets the format set change without re-pulling anything. Hugo does
 * the codec work natively, so this needs no sharp, no cwebp, and no extra
 * image binary in the build image.
 *
 * Upscaling is never done: re-encoding 1024w to 1600w measured +48% LARGER
 * with no added detail. The mirror records the true source dimensions and the
 * responsive partial caps at them.
 *
 * Politeness -- the same discipline as crawl.js
 * ---------------------------------------------
 * Images are the heaviest thing this project fetches from the dealer site, so:
 *   - one pull per vehicle per 24h, sharing the sync's gate
 *   - conditional requests (ETag / If-Modified-Since) per image
 *   - a delay between image requests, and a hard per-run cap
 *   - circuit breaker; a failing image never blocks the inventory sync
 *   - everything recorded in the audit log
 *
 * A failure to fetch an image is NOT fatal. The vehicle still gets listed; it
 * falls back to the bundled placeholder. Missing photography must never mean
 * missing inventory.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VEHICLE_ASSET_DIR = path.join(__dirname, '..', '..', 'site', 'assets', 'vehicles');
const IMAGE_STATE_FILE = path.join(__dirname, '..', '..', 'site', 'data', '.inventory-images-state.json');

const DEFAULTS = {
  delayMs: 750,
  maxPerRun: 60,
  timeoutMs: 30000,
  maxConsecutiveFailures: 4,
  userAgent: process.env.INVENTORY_CRAWL_UA ||
    'caddy-ed-inventory-sync/2.0 (+https://caddyed.com; contact: ed@caddyed.com) inventory images',
  // Hard ceiling. dealer.com serves 1024x768; anything far larger is a mistake.
  maxBytes: 3 * 1024 * 1024,
};

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadState() {
  return readJson(IMAGE_STATE_FILE, { images: {}, fetched: 0, failures: 0 });
}

function saveState(state) {
  fs.mkdirSync(path.dirname(IMAGE_STATE_FILE), { recursive: true });
  fs.writeFileSync(IMAGE_STATE_FILE, JSON.stringify(state, null, 2));
}

function audit(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try {
    fs.appendFileSync(path.join(__dirname, '..', '..', 'site', 'data', '.inventory-audit.log'), line + '\n');
  } catch { /* auditing must never break a sync */ }
}

/** Stable, readable filename: the VIN (or a hash) plus a short content id. */
function targetName(vehicle, ext) {
  const id = (vehicle.vin || vehicle.stock || vehicle.title || 'vehicle')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 24)
    .toLowerCase();
  const h = crypto.createHash('sha1').update(String(vehicle.url || vehicle.title || id)).digest('hex').slice(0, 10);
  return `${id}-${h}${ext}`;
}

function readDimensions(buf) {
  // Enough of a JPEG/PNG/WebP header to record true source size, so the
  // responsive partial never generates a width larger than the original.
  if (buf.length > 24 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    if (buf.toString('ascii', 12, 16) === 'VP8X') {
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      };
    }
  }
  return null;
}

/**
 * Fetch images for a set of vehicles.
 *
 * @param {Array} vehicles normalised records
 * @param {object} opts
 * @returns {{mirrored: number, cached: number, failed: number, bytes: number, applied: Function}}
 */
async function mirror(vehicles, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const state = loadState();
  const log = opts.log || (() => {});

  const withImage = vehicles.filter((v) => v.image && /^https?:\/\//i.test(v.image));
  const alreadyLocal = vehicles.length - withImage.length;
  if (alreadyLocal > 0) log(`  ${alreadyLocal} vehicle(s) already use a local image`);

  if (!withImage.length) {
    return { mirrored: 0, cached: 0, failed: 0, bytes: 0, apply: () => {} };
  }

  fs.mkdirSync(VEHICLE_ASSET_DIR, { recursive: true });

  const results = new Map(); // url -> { assetPath, width, height, bytes }
  let mirrored = 0;
  let cached = 0;
  let failed = 0;
  let bytes = 0;
  let consecutiveFailures = 0;
  let fetchedThisRun = 0;

  for (const vehicle of withImage) {
    if (fetchedThisRun >= cfg.maxPerRun) {
      log(`  cap    reached ${cfg.maxPerRun} image fetches for this run; the rest are deferred`);
      break;
    }
    if (consecutiveFailures >= cfg.maxConsecutiveFailures) {
      log(`  BREAK  ${consecutiveFailures} consecutive image failures; aborting image pass`);
      break;
    }

    const known = state.images[vehicle.image];
    const outName = targetName(vehicle, '.jpg'); // extension corrected after fetch
    const existing = known && fs.existsSync(path.join(VEHICLE_ASSET_DIR, known.file))
      ? known
      : null;

    if (existing && existing.file) {
      results.set(vehicle.image, existing);
      cached += 1;
      continue;
    }

    if (fetchedThisRun > 0) await sleep(cfg.delayMs);

    try {
      const headers = { 'user-agent': cfg.userAgent, accept: 'image/avif,image/webp,image/*;q=0.8' };
      if (known && known.etag) headers['if-none-match'] = known.etag;
      if (known && known.lastModified) headers['if-modified-since'] = known.lastModified;

      const res = await fetch(vehicle.image, {
        headers,
        signal: AbortSignal.timeout(cfg.timeoutMs),
        redirect: 'follow',
      });

      if (res.status === 304 && known) {
        results.set(vehicle.image, known);
        cached += 1;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > cfg.maxBytes) throw new Error(`too large (${buf.length} bytes)`);

      const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const ext = EXT_BY_MIME[mime] || '.jpg';
      const file = outName.replace(/\.jpg$/, ext);
      const abs = path.join(VEHICLE_ASSET_DIR, file);

      fs.writeFileSync(abs, buf);

      const dims = readDimensions(buf);
      const record = {
        file,
        width: dims ? dims.width : null,
        height: dims ? dims.height : null,
        bytes: buf.length,
        etag: res.headers.get('etag') || null,
        lastModified: res.headers.get('last-modified') || null,
        mime: mime || 'image/jpeg',
        source: vehicle.image,
      };
      state.images[vehicle.image] = record;
      results.set(vehicle.image, record);

      mirrored += 1;
      bytes += buf.length;
      fetchedThisRun += 1;
      consecutiveFailures = 0;
      state.fetched = (state.fetched || 0) + 1;
      saveState(state);
      audit({ event: 'image-mirrored', source: vehicle.image, file, bytes: buf.length, dims });
    } catch (err) {
      failed += 1;
      consecutiveFailures += 1;
      state.failures = (state.failures || 0) + 1;
      saveState(state);
      audit({ event: 'image-failed', source: vehicle.image, error: err.message });
      log(`  fail   ${shortUrl(vehicle.image)} — ${err.message}`);
      // A missing photo must not stop the vehicle being listed.
    }
  }

  return {
    mirrored, cached, failed, bytes,
    /**
     * Rewrite a vehicle's `image` to the local asset path, and record the true
     * source dimensions so the build never generates a width it does not have.
     */
    apply(vehicle) {
      const rec = results.get(vehicle.image);
      if (!rec) return vehicle;
      const next = { ...vehicle };
      next.image = `vehicles/${rec.file}`;
      next.image_width = rec.width || undefined;
      next.image_height = rec.height || undefined;
      if (rec.source) next.image_source = rec.source;
      return next;
    },
  };
}

function shortUrl(u) {
  try {
    const p = new URL(u).pathname;
    return p.split('/').slice(-2).join('/');
  } catch {
    return String(u).slice(-40);
  }
}

module.exports = { DEFAULTS, VEHICLE_ASSET_DIR, mirror, readDimensions, targetName };
