#!/usr/bin/env node
/**
 * check-articles-admin.js -- the article queue cannot mis-save or mislead.
 *
 * WHY THIS EXISTS
 * ---------------
 * /admin/articles is also an API for LLM agents (docs/CONTENT-API.md), and
 * its replies are instructions an agent follows. Two failure classes matter:
 * a save that stores something the site cannot render (an unknown field, a
 * 90-character tag, a missing title), and a reply that makes publishing look
 * like something it is not. Both are checked here against the real function
 * and the real validator.
 *
 * WHAT IT CHECKS
 * --------------
 *   - unauthenticated calls refused; reads ask articles_read; writes
 *     articles_write
 *   - no database: 503 with a code, never an empty success
 *   - save: merge semantics, unknown fields refused whole, tag limits, an
 *     oversize body 413s, invalid JSON 400s, unknown action 422s
 *   - title required: a first save without one is refused
 *   - every save reply says applies-later in so many words
 *   - clear removes the row; unknown method 405s; no-store everywhere
 *
 * Run:  node ci/check-articles-admin.js
 * Needs no database. The queue and auth-middleware are stubbed; every line of
 * articles-admin.js is real, and the validator under test is the real
 * utils/article-queue.js.
 */

'use strict';

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');
const realQueue = require(path.join(FN, 'utils', 'article-queue.js'));

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

let DB = true;
let STORE = new Map();
let AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };
let LAST_PERMS = null;
const NO_STORE = [];

const FakeQueue = {
  SLUG_RE: realQueue.SLUG_RE,
  isConfigured: () => DB,
  sanitizeFields: realQueue.sanitizeFields,
  list: async () => DB ? { ok: true, rows: [...STORE.values()] } : { ok: false, reason: 'database-not-configured', rows: [] },
  save: async (slug, patch, actor) => {
    if (!DB) return { ok: false, reason: 'database-not-configured' };
    const c = realQueue.sanitizeFields(patch);
    if (!c.ok) return { ok: false, reason: 'invalid', refused: c.refused, errors: c.errors };
    const current = STORE.get(slug) ? STORE.get(slug).fields : {};
    const merged = Object.assign({}, current, c.fields);
    if (!String(merged.title || '').trim()) return { ok: false, reason: 'invalid', refused: [], errors: ['title is required'] };
    const row = { slug, fields: merged, updatedBy: (actor && actor.email) || '', updatedAt: '2026-10-05T05:00:00Z', status: 'pending', appliedAt: '' };
    STORE.set(slug, row);
    return { ok: true, row };
  },
  clear: async (slug) => ({ ok: true, removed: STORE.delete(slug) ? 1 : 0 }),
  markApplied: async () => ({ ok: true, applied: 0 }),
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './utils/article-queue') return FakeQueue;
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

const handler = require(path.join(FN, 'articles-admin.js')).handler;
Module._load = origLoad;

const call = async (o) => {
  const r = await handler(Object.assign({ httpMethod: 'POST', headers: {}, queryStringParameters: null, body: null }, o));
  NO_STORE.push((r.headers || {})['Cache-Control']);
  return r;
};

(async () => {
  AUTH = { authenticated: false };
  let r = await call({ httpMethod: 'GET' });
  check('unauthenticated reads are refused', r.statusCode === 401, r.statusCode);
  check('reads ask for articles_read', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('articles_read'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  r = await call({ httpMethod: 'GET' });
  let body = JSON.parse(r.body);
  check('GET returns the queue and the apply note', r.statusCode === 200 && Array.isArray(body.articles) && /articles:apply/.test(body.apply || ''), r.body.slice(0, 120));

  DB = false;
  r = await call({ httpMethod: 'GET' });
  check('GET without a database is 503, coded', r.statusCode === 503 && JSON.parse(r.body).code === 'database-not-configured', r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'x', fields: { title: 'T' } }) });
  check('POST without a database is 503, coded', r.statusCode === 503, r.statusCode);
  DB = true;

  AUTH = { authenticated: false };
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'x', fields: { title: 'T' } }) });
  check('unauthenticated writes are refused', r.statusCode === 401, r.statusCode);
  check('writes ask for articles_write', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('articles_write'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  r = await call({ body: '{broken' });
  check('invalid JSON is 400', r.statusCode === 400, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'ok-slug', fields: { body: 'x'.repeat(71 * 1024) } }) });
  check('an oversize body is 413', r.statusCode === 413, r.statusCode);
  r = await call({ httpMethod: 'DELETE' });
  check('an unknown method is 405', r.statusCode === 405, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'explode' }) });
  check('an unknown action is 422', r.statusCode === 422, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'Not A Slug!', fields: { title: 'T' } }) });
  check('a slug that cannot be a URL is refused', r.statusCode === 422, r.statusCode);
  r = await call({ body: JSON.stringify({ action: 'save', slug: 'ok-slug', fields: {} }) });
  check('empty fields are refused', r.statusCode === 422, r.statusCode);

  r = await call({ body: JSON.stringify({ action: 'save', slug: 'ok-slug', fields: { title: 'Hello', splash: 'x' } }) });
  body = JSON.parse(r.body);
  check('an unknown field is refused whole, with its name', r.statusCode === 422 && body.unknownFields.includes('splash'), r.body.slice(0, 140));

  const v = realQueue.sanitizeFields({ tags: new Array(9).fill('a') });
  check('more than eight tags is refused', v.ok === false, JSON.stringify(v.errors));
  const v2 = realQueue.sanitizeFields({ tags: 'a, b, c' });
  check('a comma string becomes a tag array', v2.ok && Array.isArray(v2.fields.tags) && v2.fields.tags.length === 3, JSON.stringify(v2.fields));
  const v3 = realQueue.sanitizeFields({ body: 'x'.repeat(60001) });
  check('an over-long body is refused', v3.ok === false, JSON.stringify(v3.errors));

  r = await call({ body: JSON.stringify({ action: 'save', slug: 'ok-slug', fields: { description: 'no title yet' } }) });
  body = JSON.parse(r.body);
  check('title is required on the first save', r.statusCode === 422 && (body.fieldErrors || []).includes('title is required'), r.body.slice(0, 140));

  r = await call({ body: JSON.stringify({ action: 'save', slug: 'ok-slug', fields: { title: 'Hello world', body: '# Hi', tags: ['a', 'b'], published: true } }) });
  body = JSON.parse(r.body);
  check('a valid save succeeds', r.statusCode === 200 && body.saved === true, r.statusCode);
  check('the save reply says applies-later', /articles:apply/.test(body.apply || '') && /publish/.test(body.apply || ''), body.apply);

  r = await call({ body: JSON.stringify({ action: 'save', slug: 'ok-slug', fields: { published: false } }) });
  body = JSON.parse(r.body);
  check('a partial save merges (title survives)', body.row.fields.title === 'Hello world' && body.row.fields.published === false, JSON.stringify(body.row.fields));

  r = await call({ httpMethod: 'GET' });
  body = JSON.parse(r.body);
  check('the queue lists the row as pending', body.articles.length === 1 && body.articles[0].status === 'pending', JSON.stringify(body.articles.length));

  r = await call({ body: JSON.stringify({ action: 'clear', slug: 'ok-slug' }) });
  check('clear removes the row', r.statusCode === 200 && JSON.parse(r.body).removed === 1, r.statusCode);

  check('every response is Cache-Control: no-store', NO_STORE.every((h) => h === 'no-store'), JSON.stringify(NO_STORE.filter((h) => h !== 'no-store')));

  const failed = results.filter((x) => !x.pass);
  for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error('  harness crashed: ' + (err && err.message));
  process.exit(1);
});
