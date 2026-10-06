/**
 * content-queue.js -- the queue behind every editorial content type.
 *
 * One implementation (this file) serves articles, specials and testimonials;
 * each instance is created from its definition in content-types.js. Three
 * near-identical stores under three names would be three places for the same
 * bug -- and the articles store was the first one, so its behaviour (merge
 * semantics, refusal messages, the applied snapshot) is what this generalises
 * rather than replaces.
 *
 * CONTRACT (unchanged from the articles store it grew out of):
 *   1. Never throws -- no database, missing table, malformed row: ok:false
 *      with a reason.
 *   2. Unknown fields are refused WHOLE. Known fields validate by kind: text
 *      by length, tags by count and length, bools by coercion, dates loosely
 *      (the applier writes them verbatim).
 *   3. Save MERGES the patch; empty strings are real values (nothing here
 *      reverts to a feed). Required fields must exist on the row AFTER the
 *      merge.
 *   4. status: pending on save; applied only by the applier, with the
 *      read-time updated_at snapshot.
 *
 * Table shape (per instance):
 *   <table> (slug TEXT PRIMARY KEY, fields TEXT NOT NULL, updated_by TEXT,
 *            updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 *            applied_at TEXT)
 */

'use strict';

const SLUG_RE_CACHE = {};

function slugRe(def) {
  const key = def.table;
  if (!SLUG_RE_CACHE[key]) {
    SLUG_RE_CACHE[key] = new RegExp('^[a-z0-9][a-z0-9-]{0,' + (def.slug && def.slug.max ? def.slug.max : 80) + '}$');
  }
  return SLUG_RE_CACHE[key];
}

function createQueue(def) {
  const TABLE = def.table;
  const LIMITS = {};
  for (const f of def.fields) {
    if ((f.kind === 'text' || f.kind === 'date' || f.kind === 'textarea') && f.max) LIMITS[f.key] = f.max;
  }
  const TAG_FIELD = def.fields.find((f) => f.kind === 'tags') || null;
  const BOOL_FIELDS = def.fields.filter((f) => f.kind === 'bool').map((f) => f.key);
  const REQUIRED = def.fields.filter((f) => f.required).map((f) => f.key);
  const KNOWN = new Set(def.fields.map((f) => f.key));

  let _client;
  function client() {
    if (_client !== undefined) return _client;
    try {
      const url = process.env.TURSO_DATABASE_URL;
      if (!url) { _client = null; return _client; }
      const { createClient } = require('@libsql/client/http');
      _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
    } catch (err) {
      console.warn('content-queue(' + TABLE + '): client unavailable:', err.message);
      _client = null;
    }
    return _client;
  }

  function isConfigured() { return Boolean(process.env.TURSO_DATABASE_URL); }

  async function ensureTable(db) {
    await db.execute(
      'CREATE TABLE IF NOT EXISTS ' + TABLE + ' (' +
        'slug TEXT PRIMARY KEY, fields TEXT NOT NULL, updated_by TEXT, ' +
        "updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', applied_at TEXT)"
    );
  }

  function sanitizeFields(patch) {
    const refused = [];
    const errors = [];
    const fields = {};
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, refused: ['<not-an-object>'], errors: ['fields must be an object'], fields };
    }
    for (const [key, raw] of Object.entries(patch)) {
      if (!KNOWN.has(key)) { refused.push(key); continue; }
      if (Object.prototype.hasOwnProperty.call(LIMITS, key)) {
        const s = raw === null || raw === undefined ? '' : String(raw);
        if (s.length > LIMITS[key]) errors.push(key + ' is longer than ' + LIMITS[key] + ' characters');
        else fields[key] = s;
        continue;
      }
      if (TAG_FIELD && key === TAG_FIELD.key) {
        let list = raw;
        if (typeof list === 'string') list = list.split(',');
        if (!Array.isArray(list)) { errors.push(key + ' must be an array (or comma-separated string)'); continue; }
        list = list.map((t) => String(t).trim()).filter(Boolean);
        if (list.length > TAG_FIELD.maxItems) { errors.push('at most ' + TAG_FIELD.maxItems + ' tags'); continue; }
        const tooLong = list.find((t) => t.length > TAG_FIELD.maxLength);
        if (tooLong) { errors.push('tag "' + tooLong.slice(0, 20) + '..." is longer than ' + TAG_FIELD.maxLength + ' characters'); continue; }
        fields[key] = list;
        continue;
      }
      if (BOOL_FIELDS.includes(key)) {
        if (raw === true || raw === 'true' || raw === 1 || raw === '1') fields[key] = true;
        else if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === '') fields[key] = false;
        else errors.push(key + ' must be true or false');
        continue;
      }
    }
    return { ok: refused.length === 0 && errors.length === 0, refused, errors, fields };
  }

  function safeParseFields(text) {
    try {
      const v = JSON.parse(String(text || '{}'));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) {
      return {};
    }
  }

  function rowShape(row) {
    return {
      slug: String(row.slug),
      fields: safeParseFields(row.fields),
      updatedBy: row.updated_by ? String(row.updated_by) : '',
      updatedAt: row.updated_at ? String(row.updated_at) : '',
      status: String(row.status || 'pending'),
      appliedAt: row.applied_at ? String(row.applied_at) : '',
    };
  }

  async function list() {
    const db = client();
    if (!db) return { ok: false, reason: 'database-not-configured', rows: [] };
    try {
      await ensureTable(db);
      const rs = await db.execute('SELECT slug, fields, updated_by, updated_at, status, applied_at FROM ' + TABLE + ' ORDER BY updated_at DESC');
      return { ok: true, rows: Array.from(rs.rows).map(rowShape) };
    } catch (err) {
      console.warn('content-queue(' + TABLE + '): list failed:', err.message);
      return { ok: false, reason: 'read-failed', detail: err.message, rows: [] };
    }
  }

  async function save(slug, patch, actor) {
    const db = client();
    if (!db) return { ok: false, reason: 'database-not-configured' };
    const check = sanitizeFields(patch);
    if (!check.ok) return { ok: false, reason: 'invalid', refused: check.refused, errors: check.errors };
    try {
      await ensureTable(db);
      const existing = await db.execute({ sql: 'SELECT fields FROM ' + TABLE + ' WHERE slug = ?', args: [slug] });
      const current = existing.rows.length ? safeParseFields(existing.rows[0].fields) : {};
      const merged = Object.assign({}, current, check.fields);
      for (const key of REQUIRED) {
        if (!String(merged[key] || '').trim()) {
          return { ok: false, reason: 'invalid', refused: [], errors: [key + ' is required'] };
        }
      }
      const now = new Date().toISOString();
      const who = actor ? String(actor.email || actor.id || '') : '';
      await db.execute({
        sql:
          'INSERT INTO ' + TABLE + ' (slug, fields, updated_by, updated_at, status, applied_at) ' +
          "VALUES (?, ?, ?, ?, 'pending', NULL) " +
          'ON CONFLICT (slug) DO UPDATE SET fields = excluded.fields, updated_by = excluded.updated_by, ' +
          "updated_at = excluded.updated_at, status = 'pending', applied_at = NULL",
        args: [slug, JSON.stringify(merged), who, now],
      });
      return { ok: true, row: { slug, fields: merged, updatedBy: who, updatedAt: now, status: 'pending', appliedAt: '' } };
    } catch (err) {
      console.warn('content-queue(' + TABLE + '): save failed:', err.message);
      return { ok: false, reason: 'write-failed', detail: err.message };
    }
  }

  async function clear(slug) {
    const db = client();
    if (!db) return { ok: false, reason: 'database-not-configured' };
    try {
      await ensureTable(db);
      const r = await db.execute({ sql: 'DELETE FROM ' + TABLE + ' WHERE slug = ?', args: [slug] });
      return { ok: true, removed: Number(r.rowsAffected || 0) };
    } catch (err) {
      console.warn('content-queue(' + TABLE + '): clear failed:', err.message);
      return { ok: false, reason: 'write-failed', detail: err.message };
    }
  }

  async function markApplied(entries) {
    const db = client();
    if (!db) return { ok: false, reason: 'database-not-configured', applied: 0 };
    let applied = 0;
    try {
      await ensureTable(db);
      for (const e of entries || []) {
        if (!e || !e.slug || !e.upTo) continue;
        const r = await db.execute({
          sql: "UPDATE " + TABLE + " SET status = 'applied', applied_at = ? WHERE slug = ? AND status = 'pending' AND updated_at <= ?",
          args: [new Date().toISOString(), String(e.slug), String(e.upTo)],
        });
        applied += Number(r.rowsAffected || 0);
      }
      return { ok: true, applied };
    } catch (err) {
      console.warn('content-queue(' + TABLE + '): markApplied failed:', err.message);
      return { ok: false, reason: 'write-failed', detail: err.message, applied };
    }
  }

  return {
    TABLE,
    LIMITS,
    MAX_TAGS: TAG_FIELD ? TAG_FIELD.maxItems : 8,
    TAG_LENGTH: TAG_FIELD ? TAG_FIELD.maxLength : 40,
    SLUG_RE: slugRe(def),
    isConfigured, sanitizeFields, list, save, clear, markApplied,
  };
}

module.exports = { createQueue, slugRe };
