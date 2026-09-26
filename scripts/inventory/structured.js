/**
 * structured.js -- inventory from the dealer site's own schema.org data.
 *
 * Why this and not the JSON API
 * -----------------------------
 * The dealer site's legacy inventory endpoints are gone:
 *
 *     /apis/widget/…/getInventory
 *     -> {"message":"Legacy inventory endpoints are deprecated and no longer
 *         return data.","pageInfo":{"totalCount":0},"inventory":[]}
 *
 * The listing itself is a client-side React widget (`data-async-widget`), so
 * the cards in the delivered HTML are skeleton placeholders. Scraping those
 * would mean either running a headless browser (heavy, fragile, and a lot of
 * load on the dealer's edge) or parsing markup that is explicitly a loading
 * state.
 *
 * What the site DOES publish, server-side, on every inventory page, is
 * schema.org JSON-LD: a complete machine-readable list of the actual vehicles
 * with name, price, availability, VIN, stock number, model year, colour,
 * mileage, drivetrain, transmission, engine and real photograph URLs.
 *
 * That is the same contract search engines consume, it needs no JavaScript
 * execution, and it is one small request per page. It is both the lightest
 * and the most reliable option available.
 *
 * Trade-off worth stating: it reflects what the site chooses to publish, so a
 * vehicle the site omits will not appear here. A direct DMS feed
 * (INVENTORY_SOURCE_URL) remains more authoritative if one is ever available.
 */

'use strict';

/** Inventory pages on the dealer site, and the condition each represents. */
const DEFAULT_PAGES = [
  { path: '/new-inventory/index.htm', condition: 'New' },
  { path: '/certified-inventory/index.htm', condition: 'Certified Pre-Owned' },
  { path: '/bargain-inventory/index.htm', condition: 'Pre-Owned' },
];

/** Pull every application/ld+json block out of an HTML document. */
function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // A malformed block should not sink the whole run; the caller reports counts.
    }
  }
  return out;
}

const AVAILABILITY = {
  'https://schema.org/instock': 'In Stock',
  'https://schema.org/limitedavailability': 'In Stock',
  'https://schema.org/preorder': 'Pre-order',
  'https://schema.org/backorder': 'Back-order',
  'https://schema.org/soldout': 'Sold Out',
  'https://schema.org/discontinued': 'Discontinued',
  'https://schema.org/outofstock': 'Out of Stock',
};

function normaliseAvailability(v) {
  if (!v) return '';
  const tail = String(v).replace(/^https?:\/\/schema\.org\//i, '');
  return AVAILABILITY[`https://schema.org/${tail.toLowerCase()}`] || tail;
}

/**
 * Walk an arbitrary JSON-LD tree and collect anything that looks like a Vehicle.
 * The dealer emits a mix of @graph, nested offers, and plain arrays, so this is
 * deliberately shape-driven rather than path-driven.
 */
function collectVehicles(node, sink = []) {
  if (Array.isArray(node)) {
    for (const x of node) collectVehicles(x, sink);
    return sink;
  }
  if (!node || typeof node !== 'object') return sink;

  if (node.vehicleIdentificationNumber || (node['@type'] === 'Vehicle' && node.sku)) {
    sink.push(node);
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectVehicles(v, sink);
  }
  return sink;
}

/** Pull "New"/"Certified Pre-Owned" out of a marketing name. */
function conditionFromName(name, fallback) {
  const n = String(name || '').toLowerCase();
  if (n.startsWith('new ') || /^\d{4}\s+cadillac/.test(n) === false) {
    // fall through to explicit checks
  }
  if (n.startsWith('certified pre-owned')) return 'Certified Pre-Owned';
  if (n.startsWith('pre-owned')) return 'Pre-Owned';
  if (n.startsWith('used')) return 'Pre-Owned';
  if (n.startsWith('new')) return 'New';
  return fallback || '';
}

/** Convert one JSON-LD vehicle into a record the normaliser understands. */
function toRecord(v, { condition } = {}) {
  const offers = Array.isArray(v.offers) ? v.offers[0] || {} : v.offers || {};
  const odo = v.mileageFromOdometer || {};
  const brand = typeof v.brand === 'object' ? v.brand.name : v.brand;

  const name = String(v.name || '').trim();
  // "Certified Pre-Owned 2024 CADILLAC CT5 Premium Luxury" -> "2024 CADILLAC CT5 Premium Luxury"
  // The site prefixes the condition: "Certified Pre-Owned 2024 CADILLAC CT5…",
  // "Used 2016 BMW X1…", "New 2026 CADILLAC VISTIQ…". Strip it; `condition`
  // carries that information separately.
  const cleanName = name.replace(/^(Certified\s+Pre-Owned|Pre-Owned|Used|New)\s+/i, '');

  return {
    title: cleanName || v.model || '',
    vin: v.vehicleIdentificationNumber,
    stock: v.sku,
    year: v.vehicleModelDate || undefined,
    make: brand || 'Cadillac',
    model: v.model,
    condition: conditionFromName(name, condition),
    availability: normaliseAvailability(offers.availability),
    price: offers.price,
    currency: offers.priceCurrency || 'USD',
    url: v.url,
    image: Array.isArray(v.image) ? v.image[0] : v.image,
    mileage: odo.value,
    exteriorColor: v.color,
    interiorColor: v.vehicleInteriorColor,
    transmission: v.vehicleTransmission,
    drivetrain: v.driveWheelConfiguration,
    engine: v.vehicleEngine,
    fuelType: v.fuelType,
    description: typeof v.description === 'string' ? v.description.slice(0, 300) : undefined,
  };
}

/**
 * Parse one inventory page.
 * @returns {{records: Array, stats: object}}
 */
function parseInventoryPage(html, { condition } = {}) {
  const blocks = extractJsonLd(html);
  const raw = collectVehicles(blocks);
  const seen = new Set();
  const records = [];
  let duplicates = 0;

  for (const v of raw) {
    const rec = toRecord(v, { condition });
    // The same vehicle can appear in more than one @graph branch.
    const key = rec.vin || rec.url || rec.title;
    if (!key || seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    // Only list things a customer could actually buy.
    if (rec.availability === 'Sold Out' || rec.availability === 'Discontinued') continue;
    if (!rec.price) continue;
    records.push(rec);
  }

  return {
    records,
    stats: { jsonLdBlocks: blocks.length, vehiclesFound: raw.length, duplicates, listed: records.length },
  };
}

module.exports = { DEFAULT_PAGES, conditionFromName, collectVehicles, extractJsonLd, parseInventoryPage, toRecord };
