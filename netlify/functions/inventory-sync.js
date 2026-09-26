/**
 * inventory-sync -- trigger an inventory sync from Netlify.
 *
 * Replaces a function that defaulted to scraping
 * cadillacofsouthcharlotte.com (a different dealership's inventory widget,
 * which answers 403 and is not ours to read anyway) and required
 * `gray-matter`, which was never declared as a dependency -- so the function
 * would have thrown on first call.
 *
 * This version does not scrape. It delegates to the same normaliser the CLI
 * uses (scripts/inventory/schema.js) and reports what it found, so the browser
 * can show a fresh count. Actual content writing stays in the CLI, where it can
 * be reviewed and committed:
 *
 *   npm run inventory:sync -- --dry-run     # on the CI host
 *   npm run inventory:sync                  # apply
 *
 * That split is deliberate: a webhook silently rewriting content files is not
 * reviewable, and a site whose inventory changes invisibly is impossible to
 * audit. The function is read-only on purpose.
 *
 * Env:
 *   INVENTORY_SOURCE_URL   feed you control
 *   INVENTORY_SOURCE_TOKEN bearer token for that feed
 *   SYNC_TOKEN             required to call this function
 */

'use strict';

const { normalise, ValidationError } = require('../../scripts/inventory/schema');
const { fromHttp } = require('../../scripts/inventory/sources');

const MAX_LIMIT = 200;

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Auth. Fails closed: no SYNC_TOKEN configured means nobody may call it.
  const expected = process.env.SYNC_TOKEN;
  if (!expected) {
    return json(503, { error: 'SYNC_TOKEN is not configured on this site; sync is disabled' });
  }
  const presented = (event.headers && (event.headers.authorization || '').split(' ')[1]) || '';
  if (presented !== expected) {
    return json(401, { error: 'Unauthorized' });
  }

  if (!process.env.INVENTORY_SOURCE_URL) {
    return json(503, {
      error: 'INVENTORY_SOURCE_URL is not configured',
      hint: 'Point it at a feed you control, then run: npm run inventory:sync -- --dry-run',
    });
  }

  try {
    const headers = {};
    if (process.env.INVENTORY_SOURCE_TOKEN) {
      headers.authorization = `Bearer ${process.env.INVENTORY_SOURCE_TOKEN}`;
    }
    const { vehicles, meta } = await fromHttp(process.env.INVENTORY_SOURCE_URL, { headers });

    const problems = [];
    const valid = [];
    vehicles.slice(0, MAX_LIMIT).forEach((raw, i) => {
      try {
        valid.push(normalise(raw, i));
      } catch (err) {
        if (err instanceof ValidationError) problems.push({ index: i, reason: err.message });
        else throw err;
      }
    });

    const summarise = (v) => ({
      title: v.title,
      status: v.status || null,
      price: typeof v.price === 'number' ? v.price : null,
      year: v.year || null,
      model: v.model || null,
      vin: v.vin || null,
      hasImage: Boolean(v.image),
    });

    return json(200, {
      success: true,
      source: meta.source,
      count: valid.length,
      // Read-only by design -- see the file header.
      applied: false,
      hint: 'Content is written by the CLI so changes stay reviewable: npm run inventory:sync',
      skipped: problems,
      vehicles: valid.slice(0, 50).map(summarise),
    });
  } catch (err) {
    return json(502, { error: 'Inventory source unreachable', detail: err.message });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}
