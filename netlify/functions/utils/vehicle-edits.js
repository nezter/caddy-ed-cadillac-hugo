/**
 * vehicle-edits.js -- the admin's vehicle-record edits, and where they live
 * until the site's files catch up.
 *
 * WHY A DATABASE TABLE AND NOT THE CONTENT FILES
 * ----------------------------------------------
 * A Netlify Function cannot edit the repository, and this site deploys
 * prebuilt -- so an edit made in /admin/inventory cannot reach the served
 * HTML by itself. It is stored here, and scripts/inventory/edits.js applies
 * pending rows to the content files when the inventory sync (or the
 * standalone `npm run inventory:sync -- --apply-edits`) next runs. The site
 * then carries the change server-rendered, with correct SEO, after the next
 * deploy.
 *
 * That is deliberately the same split docs/ADMIN.md describes for everything
 * else: database = live, files = a build. Vehicle RECORDS are page content,
 * so they take the build path; the favourite toggle, which only reorders and
 * badges, stays live.
 *
 * CONTRACT
 * --------
 *   1. Never throws. No database, a missing table, a malformed row -- every
 *      path resolves to a usable answer with ok:false and a reason.
 *   2. Unknown fields are refused WHOLE, not silently dropped. A save that
 *      includes a key this tool does not manage is a caller bug; half-saving
 *      it would hide that.
 *   3. status flips to 'pending' on every save and to 'applied' only from the
 *      sync, using the updated_at snapshot taken when the row was read -- an
 *      edit saved while a sync runs is not marked applied by that run.
 *
 * Table (created lazily):
 *   vehicle_edits (slug TEXT PRIMARY KEY, fields TEXT NOT NULL,
 *                  updated_by TEXT, updated_at TEXT NOT NULL,
 *                  status TEXT NOT NULL DEFAULT 'pending', applied_at TEXT)
 */

'use strict';

const TABLE = 'vehicle_edits';

/* The editable surface. Identity fields (title, year, make, model, trim, vin,
 * stock, image) are the feed's, and are shown read-only in the admin; letting
 * an override change what car a page is ABOUT would let the page and the
 * photograph drift apart. */
const TEXT_FIELDS = {
  price_note: 120,
  subtitle: 200,
  exterior_color: 60,
  interior_color: 60,
  body_style: 60,
  drivetrain: 60,
  transmission: 80,
  engine: 120,
  unavailable_reason: 80,
  description: 4000,
};
const INT_FIELDS = { price: 10000000, mileage: 1000000, mpg: 300 };
const STATUS_VALUES = ['New', 'Certified Pre-Owned', 'Pre-Owned'];
const BOOL_FIELDS = ['available'];

let _client;
function client() {
  if (_client !== undefined) return _client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) { _client = null; return _client; }
    const { createClient } = require('@libsql/client/http');
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  } catch (err) {
    console.warn('vehicle-edits: client unavailable:', err.message);
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
 * Validate a patch against the editable surface.
 *
 * Returns { ok, fields, refused, errors }. An empty string clears an
 * override; null does the same, for JSON callers that prefer it. Numbers
 * arrive from <input> as strings and are coerced here, once, so no two
 * consumers disagree about what a price is.
 */
function sanitizeFields(patch) {
  const refused = [];
  const errors = [];
  const fields = {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, refused: ['<not-an-object>'], errors: ['fields must be an object'], fields };
  }
  for (const [key, raw] of Object.entries(patch)) {
    if (Object.prototype.hasOwnProperty.call(TEXT_FIELDS, key)) {
      if (raw === null || raw === undefined || raw === '') { fields[key] = ''; continue; }
      const s = String(raw);
      if (s.length > TEXT_FIELDS[key]) errors.push(key + ' is longer than ' + TEXT_FIELDS[key] + ' characters');
      else fields[key] = s;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(INT_FIELDS, key)) {
      if (raw === null || raw === undefined || raw === '') { fields[key] = null; continue; }
      const n = Number(String(raw).replace(/[$,]/g, '').trim());
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > INT_FIELDS[key]) {
        errors.push(key + ' must be a whole number between 0 and ' + INT_FIELDS[key]);
      } else fields[key] = n;
      continue;
    }
    if (BOOL_FIELDS.includes(key)) {
      if (raw === true || raw === 'true' || raw === 1 || raw === '1') fields[key] = true;
      else if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === '' || raw === null) fields[key] = false;
      else errors.push(key + ' must be true or false');
      continue;
    }
    if (key === 'status') {
      if (raw === null || raw === undefined || raw === '') { fields[key] = ''; continue; }
      if (!STATUS_VALUES.includes(String(raw))) errors.push('status must be one of: ' + STATUS_VALUES.join(', '));
      else fields[key] = String(raw);
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

/** Every edit row, newest first. */
async function list() {
  const db = client();
  if (!db) return { ok: false, reason: 'database-not-configured', rows: [] };
  try {
    await ensureTable(db);
    const rs = await db.execute('SELECT slug, fields, updated_by, updated_at, status, applied_at FROM ' + TABLE + ' ORDER BY updated_at DESC');
    return { ok: true, rows: Array.from(rs.rows).map(rowShape) };
  } catch (err) {
    console.warn('vehicle-edits: list failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, rows: [] };
  }
}

/**
 * Merge a patch into a slug's row. Existing fields not named in the patch
 * survive, so the admin can save one field without sending the rest.
 */
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
    // An empty string on a normal field means 'revert to the feed' -- it
    // removes the override rather than storing a blank that the apply step
    // would have to interpret. `description` is the one exception: empty
    // there means 'restore the generated description', which is a real
    // instruction, so it is stored as such. A row left with nothing in it
    // is deleted outright -- an empty edit is not an edit.
    for (const key of Object.keys(merged)) {
      if (key === 'description') continue;
      if (merged[key] === '' || merged[key] === null) delete merged[key];
    }
    if (!Object.keys(merged).length) {
      const del = await db.execute({ sql: 'DELETE FROM ' + TABLE + ' WHERE slug = ?', args: [slug] });
      return { ok: true, removed: Number(del.rowsAffected || 0), row: null };
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
    console.warn('vehicle-edits: save failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/** Remove a slug's row entirely (back to the feed's own data). */
async function clear(slug) {
  const db = client();
  if (!db) return { ok: false, reason: 'database-not-configured' };
  try {
    await ensureTable(db);
    const r = await db.execute({ sql: 'DELETE FROM ' + TABLE + ' WHERE slug = ?', args: [slug] });
    return { ok: true, removed: Number(r.rowsAffected || 0) };
  } catch (err) {
    console.warn('vehicle-edits: clear failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/**
 * Mark rows applied after the sync wrote them, one updated_at snapshot each.
 *
 * `entries` is [{ slug, upTo }] where upTo is the row's updated_at AT READ
 * TIME. The <= guard is the whole point: an edit saved between the read and
 * this update keeps a newer updated_at and stays pending for the next run.
 */
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
    console.warn('vehicle-edits: markApplied failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message, applied };
  }
}

module.exports = {
  TABLE, TEXT_FIELDS, INT_FIELDS, BOOL_FIELDS, STATUS_VALUES,
  isConfigured, sanitizeFields, list, save, clear, markApplied,
};
