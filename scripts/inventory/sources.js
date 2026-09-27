/**
 * sources.js -- where inventory comes from.
 *
 * The previous tooling (scripts/fetch-inventory.js and
 * netlify/functions/inventory-sync.js) both defaulted to scraping
 * cadillacofsouthcharlotte.com -- a different dealership's private inventory
 * widget. That endpoint answers 403, and pulling a competitor's stock is not
 * ours to do regardless of whether the request is technically possible.
 *
 * So there is no built-in default. A source must be named explicitly:
 *
 *   file  a local JSON file (offline, fixtures, hand-maintained)
 *   http  a URL you control or are licensed to call (your DMS feed)
 *
 * An HTTP source requires INVENTORY_SOURCE_URL to be set. If it is missing we
 * fail loudly rather than guessing a URL.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Pull the vehicle array out of a few common envelope shapes. */
function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.vehicles,
    payload.inventory,
    payload.results,
    payload.items,
    payload.data,
    payload.data && payload.data.vehicles,
    payload.data && payload.data.results,
    payload._embedded && payload._embedded.vehicles,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    // Dealer-JSON style: { data: { items: [...] } }
    if (c && Array.isArray(c.items)) return c.items;
  }
  return [];
}

/**
 * Read from a local JSON file. Used for fixtures and for a hand-maintained
 * inventory when no DMS feed is wired up yet.
 */
function fromFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`inventory source file not found: ${abs}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`inventory source is not valid JSON (${abs}): ${e.message}`);
  }
  const list = extractList(parsed);
  return { vehicles: list, meta: { source: 'file', location: abs, count: list.length } };
}

/**
 * Read from an HTTP endpoint you control.
 *
 * Uses global fetch (Node 18+), so there is no extra dependency. Retries with
 * backoff because DMS endpoints are frequently flaky, and reports the status
 * code rather than throwing a bare "fetch failed".
 */
async function fromHttp(url, { headers = {}, timeout = 30000, retries = 3 } = {}) {
  const target = url || process.env.INVENTORY_SOURCE_URL;

  if (!target) {
    throw new Error(
      'No inventory source configured.\n' +
        '  Set INVENTORY_SOURCE_URL to a feed you control, or pass a local file:\n' +
        '    npm run inventory:sync -- --source file --file site/data/inventory.json\n' +
        'Note: this tool will not default to any third-party dealership feed.'
    );
  }

  let parsed;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(target, {
        headers: { accept: 'application/json', 'user-agent': 'caddy-ed-inventory-sync/2.0', ...headers },
        signal: ac.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} from ${target}`);
      }
      parsed = await res.json();
      lastError = null;
      break;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt === retries) break;
      const wait = Math.min(1000 * 2 ** attempt, 8000);
      process.stderr.write(`  … attempt ${attempt + 1} failed (${err.message}); retrying in ${wait}ms\n`);
    }
  }

  if (lastError) throw lastError;

  const list = extractList(parsed);
  if (!list.length) {
    throw new Error(
      `no vehicles found at ${target} — the response was readable but contained no vehicle list. ` +
        'Check the shape with: npm run inventory:sync -- --source file --file <downloaded.json>'
    );
  }
  return { vehicles: list, meta: { source: 'http', location: target, count: list.length } };
}

/**
 * The stable identity of a vehicle across syncs.
 *
 * A VIN is the only identifier that is genuinely stable -- stock numbers get
 * reassigned, slugs change when a title changes, and a dealer will happily
 * reuse a "used XT5" listing for a different car next month. So VIN first, then
 * stock number, then the URL slug, and only then the title.
 *
 * The fallback chain matters because a feed that has no VINs still needs to be
 * able to tell "the same car, updated" from "a new car".
 */
function vehicleKey(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return null;
  const vin = vehicle.vin || vehicle.VIN || vehicle.Vin;
  if (vin && String(vin).trim()) return `vin:${String(vin).trim().toUpperCase()}`;

  const stock =
    vehicle.stock || vehicle.stock_number || vehicle.stockNumber || vehicle.stock_no;
  if (stock && String(stock).trim()) return `stock:${String(stock).trim().toUpperCase()}`;

  const url = vehicle.url || vehicle.link || vehicle.href;
  if (url) {
    const slug = String(url).split('?')[0].replace(/\/+$/, '').split('/').pop();
    if (slug) return `url:${slug.toLowerCase()}`;
  }

  const title = vehicle.title || vehicle.name;
  if (title) return `title:${String(title).trim().toLowerCase()}`;

  return null;
}

/**
 * Is this vehicle listed as sold, in stock-but-unavailable, or otherwise gone?
 *
 * Several dealer feeds carry a status rather than simply removing the vehicle,
 * and a sync that only looks for absence will keep publishing cars that have
 * sold. This reads the shapes feeds actually use, in order of how explicit they
 * are.
 */
function availabilityOf(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return { available: true, status: 'unknown' };

  // An explicit boolean, when a feed provides one, beats any string guessing.
  if (typeof vehicle.available === 'boolean') {
    return { available: vehicle.available, status: vehicle.status || (vehicle.available ? 'available' : 'unavailable') };
  }

  const raw =
    vehicle.status ||
    vehicle.stockStatus ||
    vehicle.availability ||
    vehicle.condition_status ||
    vehicle.state ||
    '';
  const status = String(raw).trim();

  if (!status) return { available: true, status: 'unknown' };

  // Sold, gone, or otherwise no longer orderable.
  const gone = /\b(sold|closed|deal(er)?\s*-?\s*complete[d]?|invoiced|out\s*-?\s*of\s*stock|picked\s*up|delivered|withdrawn|removed)\b/i;
  // Present but not sellable right now.
  const hold = /\b(pending|hold|reserved|in\s*transit|inbound|coming\s*soon|available\s*soon|backorder(ed)?|lease\s*return\s*pending)\b/i;

  if (gone.test(status)) return { available: false, status };
  if (hold.test(status)) return { available: false, status };

  return { available: true, status };
}

module.exports = { extractList, fromFile, fromHttp, vehicleKey, availabilityOf };
