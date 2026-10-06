#!/usr/bin/env node
/**
 * check-content-admin.js -- the specials and testimonials endpoints behave
 * like the articles one, because they ARE the same machine.
 *
 * articles-admin has its own check (check-articles-admin.js). This one runs
 * the same battery against the two types added when the machine was
 * generalised, proving the factory (utils/content-admin.js) wires each
 * type's store, permissions, list key and apply command correctly -- and
 * that per-type refusals still name the right type.
 *
 * Run:  node ci/check-content-admin.js
 */

'use strict';

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');
const { TYPES } = require(path.join(FN, 'utils', 'content-types.js'));

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

function fakeStore() {
  const STORE = new Map();
  return {
    STORE,
    SLUG_RE: /^[a-z0-9][a-z0-9-]{0,80}$/,
    isConfigured: () => true,
    sanitizeFields: (p) => ({ ok: true, refused: [], errors: [], fields: p || {} }),
    list: async () => ({ ok: true, rows: [...STORE.values()] }),
    save: async (slug, patch, actor) => {
      const row = { slug, fields: Object.assign({}, (STORE.get(slug) || {}).fields, patch), updatedBy: (actor && actor.email) || '', updatedAt: '2026-10-06T12:00:00Z', status: 'pending', appliedAt: '' };
      STORE.set(slug, row);
      return { ok: true, row };
    },
    clear: async (slug) => ({ ok: true, removed: STORE.delete(slug) ? 1 : 0 }),
    markApplied: async () => ({ ok: true, applied: 0 }),
  };
}

const STORES = { 'specials-queue': fakeStore(), 'testimonials-queue': fakeStore() };
let AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };
let LAST_PERMS = null;
const NO_STORE = [];

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './utils/specials-queue') return STORES['specials-queue'];
  if (request === './utils/testimonials-queue') return STORES['testimonials-queue'];
  if (request === './utils/auth-middleware' || request === './auth-middleware') {
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

const specialsHandler = require(path.join(FN, 'specials-admin.js')).handler;
const testimonialsHandler = require(path.join(FN, 'testimonials-admin.js')).handler;
Module._load = origLoad;

const call = async (handler, o) => {
  const r = await handler(Object.assign({ httpMethod: 'POST', headers: {}, queryStringParameters: null, body: null }, o));
  NO_STORE.push((r.headers || {})['Cache-Control']);
  return r;
};

(async () => {
  /* specials */
  AUTH = { authenticated: false };
  let r = await call(specialsHandler, { httpMethod: 'GET' });
  check('specials: unauthenticated reads refused', r.statusCode === 401, r.statusCode);
  check('specials: reads ask specials_read', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('specials_read'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  r = await call(specialsHandler, { httpMethod: 'GET' });
  let body = JSON.parse(r.body);
  check('specials: GET lists under its own key + field spec', r.statusCode === 200 && Array.isArray(body.specials) && body.fields.length === TYPES.specials.fields.length, r.statusCode);
  check('specials: apply note names specials:apply', /specials:apply/.test(body.apply || ''), body.apply);
  check('specials: fields include expires + terms + featured', ['expires','terms','featured'].every((k) => body.fields.some((f) => f.key === k)));

  AUTH = { authenticated: false };
  r = await call(specialsHandler, { body: JSON.stringify({ action: 'save', slug: 'x', fields: { title: 'T' } }) });
  check('specials: unauthenticated writes refused', r.statusCode === 401);
  check('specials: writes ask specials_write', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('specials_write'), JSON.stringify(LAST_PERMS));
  AUTH = { authenticated: true, user: { id: 'u1', email: 'ed@caddyed.com', role: 'admin' } };

  r = await call(specialsHandler, { body: JSON.stringify({ action: 'save', slug: 'spring-lease', fields: { title: 'Spring lease event', expires: '2026-11-30', published: false } }) });
  body = JSON.parse(r.body);
  check('specials: save succeeds with queued-not-published reply', r.statusCode === 200 && /specials:apply/.test(body.apply || '') && /publi(sh|shed)?/.test(body.apply || ''), r.body.slice(0, 140));
  check('specials: row stored under the fake store', STORES['specials-queue'].STORE.has('spring-lease'));

  r = await call(specialsHandler, { body: JSON.stringify({ action: 'save', slug: 'BAD SLUG!', fields: { title: 'x' } }) });
  check('specials: bad slug refused', r.statusCode === 422, r.statusCode);
  r = await call(specialsHandler, { body: JSON.stringify({ action: 'explode' }) });
  check('specials: unknown action 422s', r.statusCode === 422, r.statusCode);
  r = await call(specialsHandler, { body: '{nope' });
  check('specials: invalid JSON 400s', r.statusCode === 400, r.statusCode);
  r = await call(specialsHandler, { body: JSON.stringify({ action: 'clear', slug: 'spring-lease' }) });
  check('specials: clear removes', r.statusCode === 200 && JSON.parse(r.body).removed === 1);

  /* testimonials */
  r = await call(testimonialsHandler, { httpMethod: 'GET' });
  body = JSON.parse(r.body);
  check('testimonials: GET lists under its own key', r.statusCode === 200 && Array.isArray(body.testimonials), r.statusCode);
  check('testimonials: reads asked testimonials_read', Array.isArray(LAST_PERMS) && LAST_PERMS.includes('testimonials_read'), JSON.stringify(LAST_PERMS));
  check('testimonials: apply note names testimonials:apply', /testimonials:apply/.test(body.apply || ''), body.apply);
  check('testimonials: fields include vehicle + featured', ['vehicle','featured'].every((k) => body.fields.some((f) => f.key === k)));

  r = await call(testimonialsHandler, { body: JSON.stringify({ action: 'save', slug: 'jane-xt5', fields: { title: 'Jane D.', vehicle: '2026 XT5', body: 'Straight answers.', featured: true } }) });
  body = JSON.parse(r.body);
  check('testimonials: save succeeds, write perm asked', r.statusCode === 200 && Array.isArray(LAST_PERMS) && LAST_PERMS.includes('testimonials_write'), JSON.stringify(LAST_PERMS));
  check('testimonials: featured round-trips true', body.row && body.row.fields.featured === true, JSON.stringify(body.row && body.row.fields));

  r = await call(testimonialsHandler, { body: JSON.stringify({ action: 'save', slug: 'jane-xt5', fields: { vehicle: '2026 XT7' } }) });
  body = JSON.parse(r.body);
  check('testimonials: partial save merges (name survives)', body.row.fields.title === 'Jane D.' && body.row.fields.vehicle === '2026 XT7', JSON.stringify(body.row.fields));

  check('every response is Cache-Control: no-store', NO_STORE.every((x) => x === 'no-store'), JSON.stringify(NO_STORE.filter((x) => x !== 'no-store')));

  const failed = results.filter((x) => !x.pass);
  for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error('  harness crashed: ' + (err && err.stack || err));
  process.exit(1);
});
