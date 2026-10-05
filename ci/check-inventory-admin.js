#!/usr/bin/env node
/**
 * check-inventory-admin.js -- the vehicle record editor cannot mis-save or
 * front-run the sync.
 *
 * WHY THIS EXISTS
 * ---------------
 * /admin/inventory writes the queue that scripts/inventory/edits.js later
 * applies to the CONTENT FILES. If a save could store a field this tool does
 * not manage, a number that is not a number, or a value longer than any
 * template expects, the damage would surface later as a broken page -- after
 * a deploy, in the one place nobody was looking. Every refusal below is
 * proven, not assumed.
 *
 * WHAT IT CHECKS
 * --------------
 *   - unauthenticated calls are refused, reads and writes alike
 *   - reads require inventory_read; writes require inventory_write
 *   - no database: 503 with a code, never an empty success
 *   - save coerces numbers, merges partial saves, and refuses unknown fields
 *     whole (a half-saved patch is a caller bug, not a favour)
 *   - out-of-range and over-long values are refused with reasons
 *   - clear removes the row; an unknown action 422s; bad JSON 400s;
 *     an oversized body 413s; an unknown method 405s
 *   - every response is Cache-Control: no-store
 *
 * Run:  node ci/check-inventory-admin.js
 * Needs no database. The store and auth-middleware are stubbed; every line
 * of inventory-admin.js is the real one, and the validator under test is the
 * real one (utils/vehicle-edits.js, loaded for real).
 */

'use strict';

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');
const realEdits = require(path.join(FN, 'utils', 'vehicle-edits.js'));

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

/* --------------------------------------------------------------- the stubs */

let DB = true;
let STORE = new Map();
let AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };
let LAST_PERMS = null;
const NO_STORE = [];

const FakeEdits = {
  isConfigured: () => DB,
  sanitizeFields: realEdits.sanitizeFields,
  list: async () => DB
    ? { ok: true, rows: [...STORE.values()] }
    : { ok: false, reason: 'database-not-configured', rows: [] },
  save: async (slug, patch, actor) => {
    if (!DB) return { ok: false, reason: 'database-not-configured' };
    const c = realEdits.sanitizeFields(patch);
    if (!c.ok) return { ok: false, reason: 'invalid', refused: c.refused, errors: c.errors };
    const current = STORE.get(slug) ? STORE.get(slug).fields : {};
    const merged = Object.assign({}, current, c.fields);
    const row = { slug, fields: merged, updatedBy: (actor && actor.email) || '', updatedAt: '2026-10-04T12:00:00Z', status: 'pending', appliedAt: '' };
    STORE.set(slug, row);
    return { ok: true, row };
  },
  clear: async (slug) => ({ ok: true, removed: STORE.delete(slug) ? 1 : 0 }),
  markApplied: async () => ({ ok: true, applied: 0 }),
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './utils/vehicle-edits') return FakeEdits;
  if (request === './utils/auth-middleware') {
    return {
      authenticateRequest: async (event, opts) => {
        LAST_PERMS = opts && opts.requiredPermissions;
        if (!AUTH.authenticated) {
          return { authenticated: false, error: { statusCode: 401 } };
        }
        return AUTH;
      },
    };
  }
  return origLoad.apply(this, arguments);
};

const handler = require(path.join(FN, 'inventory-admin.js')).handler;
Module._load = origLoad;

const call = async (o) => {
  const r = await handler(Object.assign({ httpMethod: 'POST', headers: {}, queryStringParameters: null, body: null }, o));
  NO_STORE.push((r.headers || {})['Cache-Control']);
  return r;
};

(async () => {
  // 1. unauthenticated GET is refused, and the read permission is named
  AUTH = { authenticated: false };
  let r = await call({ httpMethod: 'GET' });
  check('unauthenticated reads are refused', r.statusCode === 401, r.statusCode);
  check('reads ask for inventory_read', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('inventory_read'), JSON.stringify(LAST_PERMS));

  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  // 2. GET with a database answers with the queue
  r = await call({ httpMethod: 'GET' });
  let body = JSON.parse(r.body);
  check('GET returns the queue', r.statusCode === 200 && Array.isArray(body.edits) && body.database === true, r.statusCode);

  // 3. no database: 503 with a code, both halves
  DB = false;
  r = await call({ httpMethod: 'GET' });
  body = JSON.parse(r.body);
  check('GET without a database is 503, coded', r.statusCode === 503 && body.code === 'database-not-configured', r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'x', fields: { price: 1 } }) });
  check('POST without a database is 503, coded', r.statusCode === 503 && JSON.parse(r.body).code === 'database-not-configured', r.statusCode);
  DB = true;

  // 4. POST auth + permission
  AUTH = { authenticated: false };
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'x', fields: { price: 1 } }) });
  check('unauthenticated saves are refused', r.statusCode === 401, r.statusCode);
  check('saves ask for inventory_write', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('inventory_write'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  // 5. bad transport shapes
  r = await call({ body: '{nope' });
  check('invalid JSON is 400', r.statusCode === 400, r.statusCode);
  r = await call({ body: 'x'.repeat(25 * 1024) });
  check('an oversized body is 413', r.statusCode === 413, r.statusCode);
  r = await call({ httpMethod: 'PUT' });
  check('an unknown method is 405', r.statusCode === 405, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'destroy', slug: 'x' }) });
  check('an unknown action is 422', r.statusCode === 422, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'not a slug !', fields: { price: 1 } }) });
  check('a slug that could not be a page is refused', r.statusCode === 422, r.statusCode);

  // 6. the validator itself: unknown fields refused whole
  const v1 = realEdits.sanitizeFields({ price: '54000', launch_code: 'x' });
  check('an unknown field is refused whole, not dropped', v1.ok === false && v1.refused.includes('launch_code'), JSON.stringify(v1.refused));
  r = await call({ body: JSON.stringify({ action: 'save', slug: '2026-cadillac-xt5', fields: { price: 54000, launch_code: 'x' } }) });
  check('a save carrying an unknown field 422s with its name', r.statusCode === 422 && JSON.parse(r.body).unknownFields.includes('launch_code'), r.body.slice(0, 120));

  // 7. numbers are coerced once, here
  const v2 = realEdits.sanitizeFields({ price: '$54,000', mileage: '12345' });
  check('money-ish strings coerce to whole numbers', v2.ok && v2.fields.price === 54000 && v2.fields.mileage === 12345, JSON.stringify(v2.fields));
  const v3 = realEdits.sanitizeFields({ price: 'abc' });
  check('a non-number price is refused with a reason', v3.ok === false && v3.errors.length > 0, JSON.stringify(v3.errors));
  const v4 = realEdits.sanitizeFields({ description: 'x'.repeat(4001) });
  check('an over-long description is refused', v4.ok === false && v4.errors[0].includes('description'), JSON.stringify(v4.errors));
  const v5 = realEdits.sanitizeFields({ status: 'Salvage' });
  check('an unknown status is refused', v5.ok === false, JSON.stringify(v5.errors));
  const v6 = realEdits.sanitizeFields({ available: false, unavailable_reason: 'held for a viewing' });
  check('availability and its reason validate', v6.ok && v6.fields.available === false && v6.fields.unavailable_reason === 'held for a viewing', JSON.stringify(v6.fields));

  // 8. save merges partial patches; a second save keeps the first's fields
  r = await call({ body: JSON.stringify({ action: 'save', slug: '2026-cadillac-xt5', fields: { price: 54000, subtitle: 'One owner, service records' } }) });
  check('a valid save succeeds', r.statusCode === 200 && JSON.parse(r.body).saved === true, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: '2026-cadillac-xt5', fields: { price: 52995 } }) });
  body = JSON.parse(r.body);
  check('a partial save merges (subtitle survives)', body.row.fields.price === 52995 && body.row.fields.subtitle === 'One owner, service records', JSON.stringify(body.row.fields));

  // 9. rows are listed back honestly
  r = await call({ httpMethod: 'GET' });
  body = JSON.parse(r.body);
  check('the queue lists saved rows as pending', body.edits.length === 1 && body.edits[0].status === 'pending', JSON.stringify(body.edits.length));

  // 10. clear removes the row
  r = await call({ body: JSON.stringify({ action: 'clear', slug: '2026-cadillac-xt5' }) });
  check('clear removes the row', r.statusCode === 200 && JSON.parse(r.body).removed === 1, r.statusCode);

  // 11. no-store everywhere
  check('every response is Cache-Control: no-store', NO_STORE.every((h) => h === 'no-store'), JSON.stringify(NO_STORE.filter((h) => h !== 'no-store')));

  // report
  const failed = results.filter((x) => !x.pass);
  for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error('  harness crashed: ' + (err && err.message));
  process.exit(1);
});
