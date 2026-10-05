/**
 * article-queue.js -- articles written from /admin/articles (or by an agent
 * through the API), and where they live until the site's files catch up.
 *
 * WHY A QUEUE AND NOT A DIRECT WRITE
 * -----------------------------------
 * Same reason as vehicle-edits.js, and docs/ADMIN.md states it once for the
 * whole site: a Netlify Function cannot edit the repository, and this site
 * deploys PREBUILT. A save lands here; scripts/articles/apply.js turns
 * pending rows into site/content/articles/<slug>.md; the next deploy
 * publishes them. That is one pipeline for every piece of content, and it
 * is deliberately visible in the admin page rather than hidden behind a
 * button that pretends otherwise.
 *
 * DESIGNED FOR AGENTS
 * -------------------
 * The rows are plain JSON and the API is a small set of verbs (list, save,
 * clear) with honest error bodies. An LLM agent that can POST JSON can write
 * an article, mark it published, and read back exactly what was stored -- see
 * docs/CONTENT-API.md. Nothing here requires a browser.
 *
 * CONTRACT
 * --------
 *   1. Never throws. No database, a missing table, a malformed row -- every
 *      path resolves to ok:false and a reason.
 *   2. Unknown fields are refused WHOLE (a half-saved article is a caller
 *      bug). Save MERGES the patch into the row, so an agent can flip one
 *      field without sending the body back.
 *   3. `published: false` is a real value (a draft); empty strings are real
 *      values too (clean description, empty body while drafting). Unlike
 *      vehicle edits, nothing here means 'revert to a feed' -- there is no
 *      feed; the row IS the record.
 *   4. status: 'pending' on every save; 'applied' only from the applier,
 *      with the updated_at snapshot taken when the row was read.
 *
 * Table (created lazily):
 *   article_drafts (slug TEXT PRIMARY KEY, fields TEXT NOT NULL,
 *                   updated_by TEXT, updated_at TEXT NOT NULL,
 *                   status TEXT NOT NULL DEFAULT 'pending', applied_at TEXT)
 */

'use strict';

const TABLE = 'article_drafts';

const LIMITS = {
  title: 120,
  description: 200,
  body: 60000,
  author: 60,
  date: 10,
  image: 200,
};
const MAX_TAGS = 8;
const TAG_LENGTH = 40;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

let _client;
function client() {
  if (_client !== undefined) return _client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) { _client = null; return _client; }
    const { createClient } = require('@libsql/client/http');
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  } catch (err) {
    console.warn('article-queue: client unavailable:', err.message);
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

/**
 * Validate a patch. Returns { ok, fields, refused, errors }.
 * See the header: merging is the caller-visible behaviour; this only checks
 * types and lengths so a save cannot store what the templates cannot render.
 */
function sanitizeFields(patch) {
  const refused = [];
  const errors = [];
  const fields = {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, refused: ['<not-an-object>'], errors: ['fields must be an object'], fields };
  }
  for (const [key, raw] of Object.entries(patch)) {
    if (Object.prototype.hasOwnProperty.call(LIMITS, key)) {
      const s = raw === null || raw === undefined ? '' : String(raw);
      if (s.length > LIMITS[key]) errors.push(key + ' is longer than ' + LIMITS[key] + ' characters');
      else fields[key] = s;
      continue;
    }
    if (key === 'tags') {
      let list = raw;
      if (typeof list === 'string') list = list.split(',');
      if (!Array.isArray(list)) { errors.push('tags must be an array (or comma-separated string)'); continue; }
      list = list.map((t) => String(t).trim()).filter(Boolean);
      if (list.length > MAX_TAGS) { errors.push('at most ' + MAX_TAGS + ' tags'); continue; }
      const tooLong = list.find((t) => t.length > TAG_LENGTH);
      if (tooLong) { errors.push('tag "' + tooLong.slice(0, 20) + '..." is longer than ' + TAG_LENGTH + ' characters'); continue; }
      fields.tags = list;
      continue;
    }
    if (key === 'published') {
      if (raw === true || raw === 'true' || raw === 1 || raw === '1') fields.published = true;
      else if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === '') fields.published = false;
      else errors.push('published must be true or false');
      continue;
    }
    refused.push(key);
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
    console.warn('article-queue: list failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, rows: [] };
  }
}

async function save(slug, patch, actor) {
  const db = client();
  if (!db) return { ok: false, reason: 'database-not-configured' };
  const check = sanitizeFields(patch);
  if (!check.ok) return { ok: false, reason: 'invalid', refused: check.refused, errors: check.errors };
  // A title is required for an article to exist at all. It may arrive in this
  // patch or already be on the row; that is decided after the merge below.
  try {
    await ensureTable(db);
    const existing = await db.execute({ sql: 'SELECT fields FROM ' + TABLE + ' WHERE slug = ?', args: [slug] });
    const current = existing.rows.length ? safeParseFields(existing.rows[0].fields) : {};
    const merged = Object.assign({}, current, check.fields);
    if (!String(merged.title || '').trim()) {
      return { ok: false, reason: 'invalid', refused: [], errors: ['title is required'] };
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
    console.warn('article-queue: save failed:', err.message);
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
    console.warn('article-queue: clear failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/** Mark rows applied, one updated_at snapshot each (mid-run edits stay pending). */
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
    console.warn('article-queue: markApplied failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message, applied };
  }
}

module.exports = {
  TABLE, LIMITS, MAX_TAGS, TAG_LENGTH, SLUG_RE,
  isConfigured, sanitizeFields, list, save, clear, markApplied,
};
