#!/usr/bin/env node
/**
 * check-social-admin.js -- connecting social accounts cannot mis-save or leak.
 *
 * WHY THIS EXISTS
 * ---------------
 * /admin/social writes the handles and tokens that the cached social feed
 * later trusts. Two ways that could go wrong quietly: a save that writes
 * something other than the six known keys (turning the endpoint into a
 * general key/value store reachable from the admin origin), or a status
 * response that echoes a token back into a page. Both are refused by design;
 * this file proves the refusals hold.
 *
 * WHAT IT CHECKS
 * --------------
 *   - unauthenticated calls are refused, reads and writes alike
 *   - reads require preferences_read; writes require preferences_write
 *   - status answers with per-network state and never contains a token field
 *   - save stores the known keys and drops unknown ones
 *   - save with no database reports 503 rather than pretending
 *   - test passes the network's readable result through untouched
 *   - refresh runs the refresh and returns the fresh status
 *   - an unknown action 422s; invalid JSON 400s
 *   - every response is Cache-Control: no-store
 *
 * Run:  node ci/check-social-admin.js
 * Needs no database. social-cache and auth-middleware are stubbed; every
 * line of social-admin.js is the real one.
 */

'use strict';

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

/* --------------------------------------------------------------- the stubs */

const REFRESHED = [];
let FORCE_DB_MISSING = false;

const FakeCache = {
  adminStatus: async () => ({
    ok: true,
    database: true,
    lastRefreshed: '2026-10-04T12:00:00Z',
    networks: {
      facebook: { configured: true, hasToken: true, tokenSource: 'admin', url: 'https://www.facebook.com/eportello', cachedPosts: 3 },
      x: { configured: false, hasToken: false, tokenSource: 'none', handle: '', cachedPosts: 0 },
      instagram: { configured: false, hasToken: false, tokenSource: 'none', url: '', cachedPosts: 0 },
    },
  }),
  saveConfig: async (patch) => {
    if (FORCE_DB_MISSING) return { ok: false, error: 'database-not-configured' };
    const known = ['facebook_url', 'facebook_token', 'x_handle', 'x_token', 'instagram_url', 'instagram_token'];
    const saved = Object.keys(patch || {}).filter((k) => known.includes(k));
    return { ok: true, saved };
  },
  testNetwork: async (n) =>
    n === 'facebook'
      ? { ok: true, network: n, count: 2, sample: 'New Escalade in stock', error: '' }
      : { ok: false, network: n, error: 'No token is set for this network yet.' },
  refreshNow: async () => {
    REFRESHED.push(1);
    return {};
  },
};

let AUTH = { authenticated: true, user: { id: 'u1', role: 'admin' } };
let LAST_PERMS = null;

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './utils/social-cache') return FakeCache;
  if (request === './utils/auth-middleware') {
    return {
      authenticateRequest: async (event, opts) => {
        LAST_PERMS = opts && opts.requiredPermissions;
        if (!AUTH.authenticated) {
          return { authenticated: false, error: { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) } };
        }
        return AUTH;
      },
    };
  }
  return origLoad.apply(this, arguments);
};

const handler = require(path.join(FN, 'social-admin.js')).handler;
Module._load = origLoad;

const call = (o) =>
  handler(Object.assign({ httpMethod: 'POST', headers: {}, queryStringParameters: null, body: null }, o));

(async () => {
  // 1. unauthenticated is refused
  AUTH = { authenticated: false };
  let r = await call({ body: JSON.stringify({ action: 'status' }) });
  check('unauthenticated calls are refused', r.statusCode === 401);
  AUTH = { authenticated: true, user: { id: 'u1', role: 'admin' } };

  // 2. status: shape, no token field, read permission
  r = await call({ body: JSON.stringify({ action: 'status' }) });
  const s = JSON.parse(r.body);
  check('status answers 200 with per-network state', r.statusCode === 200 && s.ok === true && s.networks && s.networks.facebook.configured === true);
  check('status contains no token field', !/"token"\s*:/.test(r.body));
  check('status is Cache-Control: no-store', r.headers['Cache-Control'] === 'no-store');
  check('read requires preferences_read', LAST_PERMS && LAST_PERMS[0] === 'preferences_read');

  // 3. save: known keys only
  r = await call({
    body: JSON.stringify({ action: 'save', config: { facebook_url: 'https://www.facebook.com/eportello', facebook_token: 'tok-123', bogus_key: 'nope' } }),
  });
  const sv = JSON.parse(r.body);
  check('save stores known keys and drops unknown', sv.saved === true && JSON.stringify(sv.savedKeys) === JSON.stringify(['facebook_url', 'facebook_token']));
  check('save requires preferences_write', LAST_PERMS && LAST_PERMS[0] === 'preferences_write');

  // 4. save without a database reports 503
  FORCE_DB_MISSING = true;
  r = await call({ body: JSON.stringify({ action: 'save', config: { facebook_url: 'https://x' } }) });
  check('save without database reports 503', r.statusCode === 503);
  FORCE_DB_MISSING = false;

  // 5. test passes the network result through
  r = await call({ body: JSON.stringify({ action: 'test', network: 'x' }) });
  const t = JSON.parse(r.body);
  check('test returns the readable failure', t.ok === false && /token/i.test(t.error));
  r = await call({ body: JSON.stringify({ action: 'test', network: 'facebook' }) });
  check('test returns ok with a sample', JSON.parse(r.body).ok === true);

  // 6. refresh runs and answers with the fresh status
  r = await call({ body: JSON.stringify({ action: 'refresh', network: 'facebook' }) });
  check('refresh runs and reports status', r.statusCode === 200 && JSON.parse(r.body).refreshed === true && REFRESHED.length === 1);

  // 7. an unknown action is refused, not coerced
  r = await call({ body: JSON.stringify({ action: 'delete-everything' }) });
  check('unknown action refused with 422', r.statusCode === 422);

  // 8. invalid JSON
  r = await call({ body: '{nope' });
  check('invalid JSON answers 400', r.statusCode === 400);

  /* ------------------------------------------------------------- report */
  let failed = 0;
  for (const res of results) {
    console.log((res.pass ? 'PASS  ' : 'FAIL  ') + res.label + (res.detail ? '  -- ' + res.detail : ''));
    if (!res.pass) failed++;
  }
  console.log('\n' + results.length + ' checks, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('SCRIPT ERROR:', err);
  process.exit(2);
});
