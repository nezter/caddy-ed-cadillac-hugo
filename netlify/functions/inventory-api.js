/**
 * inventory-api -- JSON inventory feed for client-side use.
 *
 * Replaces a 19KB function that was almost entirely a hardcoded payload for
 * another dealership's private inventory widget
 * (cadillacofsouthcharlotte.com/api/widget/ws-inv-data/getInventory), including
 * their siteId, pageId, windowId and a 50-entry required-attributes list. That
 * endpoint answers 403.
 *
 * Two things changed:
 *
 *   1. The upstream is now INVENTORY_SOURCE_URL -- a feed you control -- and
 *      there is no default. With nothing configured the function returns an
 *      explicit, honest response instead of a 502 from someone else's server.
 *
 *   2. The site's own inventory listing no longer depends on this at all. The
 *      /inventory/ page is server-rendered from site/content/inventory/*.md and
 *      filtered in the browser (site/assets/js/inventory-filter.js), so
 *      browsing stock works with this function entirely absent. That is
 *      deliberate: the most important page on a dealership site should not be
 *      one request away from being blank.
 *
 * This remains useful for live availability and price refresh.
 *
 * Response shape: { success, configured, count, vehicles: [...] }
 * Each vehicle: { title, year, make, model, trim, price, mileage, vin,
 *                 status, image, bodyStyle, drivetrain }
 */

'use strict';

const inventorySource = require('./utils/inventory-source');
const { normalise, ValidationError } = require('../../scripts/inventory/schema');

const MAX_LIMIT = 200;

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  if (!inventorySource.isConfigured()) {
    return json(200, {
      success: true,
      configured: false,
      count: 0,
      vehicles: [],
      ...inventorySource.notConfigured(),
    });
  }

  const params = event.queryStringParameters || {};
  const limit = clamp(parseInt(params.limit, 10) || 60, 1, MAX_LIMIT);

  try {
    const raw = await inventorySource.get('inventory');
    const list = Array.isArray(raw) ? raw
      : (raw.vehicles || raw.inventory || raw.items || raw.results || raw.data || []);

    const vehicles = [];
    const skipped = [];
    (Array.isArray(list) ? list : []).forEach((r, i) => {
      if (vehicles.length >= limit) return;
      try {
        vehicles.push(shape(normalise(r, i)));
      } catch (err) {
        if (err instanceof ValidationError) skipped.push({ index: i, reason: err.message });
        else throw err;
      }
    });

    return json(200, {
      success: true,
      configured: true,
      source: inventorySource.baseUrl(),
      count: vehicles.length,
      skipped,
      vehicles,
    });
  } catch (err) {
    if (err.code === 'SOURCE_NOT_CONFIGURED') {
      return json(200, { success: true, configured: false, count: 0, vehicles: [], ...inventorySource.notConfigured() });
    }
    return json(502, {
      success: false,
      error: 'Inventory source unreachable',
      detail: err.message,
      // The static listing still works; say so rather than implying an outage.
      fallback: 'The inventory page is server-rendered and remains available at /inventory/',
    });
  }
};

function shape(v) {
  return {
    title: v.title,
    year: v.year || null,
    make: v.make || null,
    model: v.model || null,
    trim: v.trim || null,
    price: typeof v.price === 'number' ? v.price : null,
    mileage: typeof v.mileage === 'number' ? v.mileage : null,
    vin: v.vin || null,
    status: v.status || null,
    image: v.image || null,
    bodyStyle: v.body_style || null,
    drivetrain: v.drivetrain || null,
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    },
    body: JSON.stringify(body),
  };
}
