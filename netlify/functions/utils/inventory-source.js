/**
 * inventory-source.js -- the single place inventory data comes from.
 *
 * Three functions and two scripts were each hardcoded to
 * `https://www.cadillacofsouthcharlotte.com/...` -- a *different* dealership.
 * That endpoint answers 403, and two of the call sites also spoofed a browser
 * User-Agent to get past it. Reading a competitor's private inventory widget is
 * not ours to do, so every one of those call sites now goes through here.
 *
 * Behaviour:
 *   - No INVENTORY_SOURCE_URL  -> configured:false, and callers degrade
 *     gracefully (the static site already lists all vehicles from content, so
 *     the site itself keeps working).
 *   - INVENTORY_SOURCE_URL set -> call that feed, with a bearer token if
 *     INVENTORY_SOURCE_TOKEN is present.
 *
 * The site's inventory is server-rendered from site/content/inventory/*.md,
 * which `npm run inventory:sync` populates from this same source. The functions
 * exist for live lookups (availability, pricing refresh), not for rendering the
 * listing.
 */

'use strict';

const SOURCE_NAME = 'inventory-source';

function isConfigured() {
  return Boolean(process.env.INVENTORY_SOURCE_URL);
}

function baseUrl() {
  return String(process.env.INVENTORY_SOURCE_URL || '').replace(/\/+$/, '');
}

function headers() {
  const h = { accept: 'application/json', 'user-agent': 'caddy-ed-site/2.0' };
  if (process.env.INVENTORY_SOURCE_TOKEN) {
    h.authorization = `Bearer ${process.env.INVENTORY_SOURCE_TOKEN}`;
  }
  return h;
}

/** `notConfigured()` is the value callers should test before doing any work. */
function notConfigured() {
  return {
    configured: false,
    reason:
      'INVENTORY_SOURCE_URL is not set. Point it at a vehicle feed you control ' +
      'to enable live inventory lookups. The site itself is unaffected -- its ' +
      'inventory is server-rendered from site/content/inventory/.',
  };
}

/**
 * GET a path on the configured source.
 * @param {string} path e.g. 'inventory' or 'vehicle/1GKEKDR83RZ123'
 */
async function get(path, { timeout = 15000 } = {}) {
  if (!isConfigured()) {
    const err = new Error(SOURCE_NAME + ' is not configured');
    err.code = 'SOURCE_NOT_CONFIGURED';
    throw err;
  }
  const url = `${baseUrl()}/${String(path).replace(/^\/+/, '')}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { headers: headers(), signal: ac.signal });
    if (!res.ok) {
      const err = new Error(`inventory source returned ${res.status} ${res.statusText}`);
      err.code = 'SOURCE_HTTP_ERROR';
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Config summary, safe to return to a client. */
function describe() {
  return isConfigured()
    ? { configured: true, source: baseUrl() }
    : notConfigured();
}

module.exports = { get, isConfigured, baseUrl, headers, describe, notConfigured, SOURCE_NAME };
