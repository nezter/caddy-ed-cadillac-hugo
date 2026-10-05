#!/usr/bin/env node
/**
 * check-agents-admin.js -- agent identities stay scoped, hashed and one-shot.
 *
 * WHY THIS EXISTS
 * ---------------
 * An agent key IS a credential. Three properties must hold or this feature is
 * worse than the staff-token borrowing it replaces:
 *   1. the secret is returned exactly once and only as a hash is stored;
 *   2. scopes are validated against the real vocabulary and agents_* can
 *      never be granted (no self-propagation);
 *   3. the creating API cannot be called without agents_write.
 * All three are asserted here; the crypto runs for real (utils/agent-keys.js
 * is loaded, not stubbed) against the real validators.
 *
 * Run:  node ci/check-agents-admin.js
 */

'use strict';

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');
const real = require(path.join(FN, 'utils', 'agent-keys.js'));

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

let DB = true;
let STORE = new Map();
let AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };
let LAST_PERMS = null;
const NO_STORE = [];

const FakeKeys = {
  SCOPE_LABELS: real.SCOPE_LABELS,
  UNGRANTABLE: real.UNGRANTABLE,
  sanitizeScopes: real.sanitizeScopes,
  isConfigured: () => DB,
  list: async () => DB ? { ok: true, agents: [...STORE.values()] } : { ok: false, reason: 'database-not-configured', agents: [] },
  create: async (name, scopes, opts) => {
    if (!DB) return { ok: false, reason: 'database-not-configured' };
    const cleanName = String(name || '').trim();
    if (!cleanName) return { ok: false, reason: 'invalid', errors: ['name is required'] };
    const s = real.sanitizeScopes(scopes);
    if (!s.ok) return { ok: false, reason: 'invalid', errors: s.errors };
    const secret = real._internals.generateSecret();
    const row = { id: 'ag_test', name: cleanName, description: '', scopes: s.scopes, prefix: real._internals.prefixOf(secret), createdAt: '2026-10-05T06:00:00Z', lastUsedAt: '', expiresAt: '', revokedAt: '', status: 'active' };
    STORE.set(row.id, row);
    return { ok: true, secret, row };
  },
  revoke: async (id) => ({ ok: true, revoked: STORE.delete(id) ? 1 : 0 }),
  resolve: async () => ({ ok: false, status: 'unknown', message: 'unknown' }),
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './utils/agent-keys') return FakeKeys;
  if (request === './utils/auth-middleware') {
    return {
      authenticateRequest: async (event, opts) => {
        LAST_PERMS = opts && opts.requiredPermissions;
        if (!AUTH.authenticated) return { authenticated: false, error: { statusCode: 401 } };
        return AUTH;
      },
    };
  }
  return origLoad.apply(this, arguments);
};

const handler = require(path.join(FN, 'agents-admin.js')).handler;
Module._load = origLoad;

const call = async (o) => {
  const r = await handler(Object.assign({ httpMethod: 'POST', headers: {}, queryStringParameters: null, body: null }, o));
  NO_STORE.push((r.headers || {})['Cache-Control']);
  return r;
};

(async () => {
  /* crypto + validation, for real */
  const s1 = real._internals.generateSecret();
  const s2 = real._internals.generateSecret();
  check('secrets look like cdy1_ + 43 base64url chars', /^cdy1_[A-Za-z0-9_-]{43}$/.test(s1), s1.slice(0, 12));
  check('two secrets never match', s1 !== s2);
  check('the middleware regex accepts them', /^cdy1_[A-Za-z0-9_-]{20,}$/.test(s1));
  const h = real._internals.hashSecret(s1);
  check('hash is sha256 hex', /^[0-9a-f]{64}$/.test(h) && h !== s1);
  const p = real._internals.prefixOf(s1);
  check('prefix reveals 8 body chars after cdy1_', p === s1.slice(0, 13) && /^cdy1_[A-Za-z0-9_-]{8}$/.test(p), p);
  check('scopes: agents_write is NOT grantable', real.sanitizeScopes(['articles_write', 'agents_write']).ok === false);
  check('scopes: unknown name refused', real.sanitizeScopes(['articles_read', 'root_everything']).ok === false);
  check('scopes: comma string works, dedupes', JSON.stringify(real.sanitizeScopes('articles_read,seo_read,articles_read').scopes) === '["articles_read","seo_read"]');

  /* the API */
  AUTH = { authenticated: false };
  let r = await call({ httpMethod: 'GET' });
  check('unauthenticated reads refused', r.statusCode === 401, r.statusCode);
  check('reads ask agents_read', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('agents_read'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  r = await call({ httpMethod: 'GET' });
  let body = JSON.parse(r.body);
  check('GET lists agents + the scope vocabulary', r.statusCode === 200 && Array.isArray(body.agents) && body.scopes.length > 5 && body.note.includes('cdy1_'), r.statusCode);
  check('scope vocabulary excludes agents_*', !body.scopes.some((s) => s.key.indexOf('agents_') === 0));

  DB = false;
  r = await call({ httpMethod: 'GET' });
  check('no database: 503 coded', r.statusCode === 503 && JSON.parse(r.body).code === 'database-not-configured', r.statusCode);
  DB = true;

  AUTH = { authenticated: false };
  r = await call({ body: JSON.stringify({ action: 'create', name: 'X', scopes: ['articles_read'] }) });
  check('unauthenticated creates refused', r.statusCode === 401, r.statusCode);
  check('writes ask agents_write', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('agents_write'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  r = await call({ body: '{oops' });
  check('invalid JSON is 400', r.statusCode === 400, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'create', name: '', scopes: ['articles_read'] }) });
  check('nameless create is 422', r.statusCode === 422, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'create', name: 'X', scopes: ['agents_write'] }) });
  body = JSON.parse(r.body);
  check('create refuses agent-admin scopes with a reason', r.statusCode === 422 && (body.fieldErrors || []).some((e) => /cannot be granted/.test(e)), r.body.slice(0, 140));
  r = await call({ body: JSON.stringify({ action: 'create', name: 'X', scopes: ['not_a_permission'] }) });
  check('create refuses unknown scopes', r.statusCode === 422, r.statusCode);

  r = await call({ body: JSON.stringify({ action: 'create', name: 'Content Agent', scopes: ['articles_read', 'articles_write', 'seo_read'] }) });
  body = JSON.parse(r.body);
  check('create succeeds with a one-time secret', r.statusCode === 200 && body.created === true && /^cdy1_/.test(body.secret || ''), r.statusCode);
  check('the reply says the secret is shown once', /shown once/.test(body.secretNote || '') && /hash/.test(body.secretNote || ''), body.secretNote);
  check('the agent row carries NO secret or hash', body.agent && !('key_hash' in body.agent) && !('secret' in body.agent), JSON.stringify(Object.keys(body.agent || {})));
  check('scopes round-trip', JSON.stringify(body.agent.scopes) === '["articles_read","articles_write","seo_read"]');

  r = await call({ httpMethod: 'GET' });
  body = JSON.parse(r.body);
  check('list never contains a hash field', body.agents.every((a) => !('key_hash' in a) && !('secret' in a)));

  r = await call({ body: JSON.stringify({ action: 'revoke' }) });
  check('revoke without id is 422', r.statusCode === 422, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'revoke', id: 'ag_test' }) });
  body = JSON.parse(r.body);
  check('revoke works', r.statusCode === 200 && body.revoked === true, r.statusCode);

  r = await call({ body: JSON.stringify({ action: 'self-destruct' }) });
  check('unknown action is 422', r.statusCode === 422, r.statusCode);
  r = await call({ httpMethod: 'PUT' });
  check('unknown method is 405', r.statusCode === 405, r.statusCode);
  check('every response is Cache-Control: no-store', NO_STORE.every((x) => x === 'no-store'), JSON.stringify(NO_STORE.filter((x) => x !== 'no-store')));

  const failed = results.filter((x) => !x.pass);
  for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error('  harness crashed: ' + (err && err.message));
  process.exit(1);
});
