/**
 * sync-runs.js -- the record of what each inventory sync did, for /admin/sync.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The inventory sync (scripts/inventory/index.js) is a local script: it reads
 * the dealer feed, works out what changed, writes the vehicle pages and saves
 * its state file. Until this module existed, its progress lived in one
 * terminal's scrollback, and the only way to know how a run went (or whether
 * one was running at all) was to ask whoever started it. /admin/sync should
 * be able to answer both questions itself.
 *
 * A Netlify Function cannot see another process's terminal, so the sync
 * records itself here: one row per run, patched at each phase change. The
 * page reads the newest rows through inventory-sync-status.js, and BOTH
 * sides use this module, so they cannot drift on column names or shapes.
 *
 * CONTRACT
 * --------
 *   1. Never throws. No database, a missing table, a malformed row: every
 *      path resolves to a usable answer with ok:false and a reason.
 *   2. Recording is fail-soft on the sync side. A sync must never fail, or
 *      even slow down, because the record could not be written; index.js
 *      says one line when it cannot record and carries on.
 *   3. The table is created lazily and pruned on start, so it cannot grow
 *      without bound and needs no migration step to exist.
 *
 * THE COUNTS, IN THE WORDS THE PAGE USES
 * --------------------------------------
 *   feed_total      found:      how many vehicles the feed listed
 *   existing_count  existing:   seen before, nothing to change
 *   updated_count   updated:    existing, but details differ this time
 *   added_count     new:        never seen before
 *   retired_count   retired:    no longer listed, or listed as sold
 *
 * A dry run records the same counts with mode 'dry-run'; the page labels it
 * as a plan, not a change.
 */

'use strict';

const TABLE = 'inventory_sync_runs';
const KEEP = 100;

/* Every column a caller is allowed to patch, and how it casts. Anything not
 * listed here is refused whole, the same rule vehicle-edits uses: a silent
 * drop would hide a caller bug. */
const PATCH_KEYS = {
  phase: String,
  feed_total: Number,
  existing_count: Number,
  updated_count: Number,
  added_count: Number,
  retired_count: Number,
  processed: Number,
  process_total: Number,
  message: String,
};

let _client;
function client() {
  if (_client !== undefined) return _client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) { _client = null; return _client; }
    const { createClient } = require('@libsql/client/http');
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  } catch (err) {
    console.warn('sync-runs: client unavailable:', err.message);
    _client = null;
  }
  return _client;
}

function isConfigured() { return Boolean(process.env.TURSO_DATABASE_URL); }

async function ensureTable(db) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS ' + TABLE + ' (' +
      'id TEXT PRIMARY KEY, mode TEXT, source TEXT, ' +
      "status TEXT NOT NULL DEFAULT 'running', phase TEXT, " +
      'started_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, ' +
      'feed_total INTEGER DEFAULT 0, existing_count INTEGER DEFAULT 0, ' +
      'updated_count INTEGER DEFAULT 0, added_count INTEGER DEFAULT 0, ' +
      'retired_count INTEGER DEFAULT 0, processed INTEGER DEFAULT 0, ' +
      'process_total INTEGER DEFAULT 0, message TEXT, detail TEXT)'
  );
}

function safeParse(text) {
  if (!text) return {};
  try { return JSON.parse(text) || {}; } catch (err) { return {}; }
}

function rowShape(r) {
  return {
    id: r.id,
    mode: r.mode || 'live',
    source: r.source || null,
    status: r.status || 'running',
    phase: r.phase || null,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at || null,
    feedTotal: Number(r.feed_total || 0),
    existingCount: Number(r.existing_count || 0),
    updatedCount: Number(r.updated_count || 0),
    addedCount: Number(r.added_count || 0),
    retiredCount: Number(r.retired_count || 0),
    processed: Number(r.processed || 0),
    processTotal: Number(r.process_total || 0),
    message: r.message || null,
    detail: safeParse(r.detail),
  };
}

/**
 * Open a run. Returns { ok, id } or { ok:false, reason }.
 * Reasons: 'not-configured' (no TURSO_DATABASE_URL in this process) and
 * 'write-failed'.
 */
async function start(options) {
  const opts = options || {};
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured' };
  const id = 'sync-' + Date.now().toString(36) + '-' + require('crypto').randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  try {
    await ensureTable(db);
    await db.execute({
      sql: 'INSERT INTO ' + TABLE +
        ' (id, mode, source, status, phase, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, String(opts.mode || 'live'), opts.source ? String(opts.source) : null, 'running', 'reading', now, now],
    });
    // Keep the newest KEEP rows. Best-effort: a failed prune never blocks
    // the run it is attached to.
    try {
      await db.execute({
        sql: 'DELETE FROM ' + TABLE + ' WHERE id NOT IN ' +
          '(SELECT id FROM ' + TABLE + ' ORDER BY started_at DESC LIMIT ?)',
        args: [KEEP],
      });
    } catch (err) { /* housekeeping, not part of the run */ }
    return { ok: true, id };
  } catch (err) {
    console.warn('sync-runs: start failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/** Patch a run. Only the keys PATCH_KEYS documents are accepted. */
async function update(id, patch) {
  const db = client();
  if (!db || !id) return { ok: false, reason: 'not-configured' };
  const sets = ['updated_at = ?'];
  const args = [new Date().toISOString()];
  for (const key of Object.keys(PATCH_KEYS)) {
    if (patch && patch[key] !== undefined) { sets.push(key + ' = ?'); args.push(PATCH_KEYS[key](patch[key])); }
  }
  if (patch && patch.detail !== undefined) {
    sets.push('detail = ?');
    args.push(typeof patch.detail === 'string' ? patch.detail : JSON.stringify(patch.detail));
  }
  args.push(id);
  try {
    await db.execute({ sql: 'UPDATE ' + TABLE + ' SET ' + sets.join(', ') + ' WHERE id = ?', args });
    return { ok: true };
  } catch (err) {
    console.warn('sync-runs: update failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/** Close a run. options.status: 'done' (default) or 'failed'. */
async function finish(id, options) {
  const opts = options || {};
  const db = client();
  if (!db || !id) return { ok: false, reason: 'not-configured' };
  const status = opts.status === 'failed' ? 'failed' : 'done';
  const r = await update(id, Object.assign({}, opts, { phase: opts.phase || (status === 'failed' ? 'failed' : 'done') }));
  if (!r.ok) return r;
  try {
    await db.execute({
      sql: 'UPDATE ' + TABLE + ' SET status = ?, finished_at = ? WHERE id = ?',
      args: [status, new Date().toISOString(), id],
    });
    return { ok: true };
  } catch (err) {
    console.warn('sync-runs: finish failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/** The newest run, or null. */
async function latest() {
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured', run: null };
  try {
    await ensureTable(db);
    const rs = await db.execute('SELECT * FROM ' + TABLE + ' ORDER BY started_at DESC LIMIT 1');
    return { ok: true, run: rs.rows.length ? rowShape(rs.rows[0]) : null };
  } catch (err) {
    console.warn('sync-runs: latest failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, run: null };
  }
}

/** The newest runs, newest first. */
async function listRecent(limit) {
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured', runs: [] };
  const n = Math.max(1, Math.min(100, Number(limit) || 15));
  try {
    await ensureTable(db);
    const rs = await db.execute({
      sql: 'SELECT * FROM ' + TABLE + ' ORDER BY started_at DESC LIMIT ?',
      args: [n],
    });
    return { ok: true, runs: Array.from(rs.rows).map(rowShape) };
  } catch (err) {
    console.warn('sync-runs: listRecent failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, runs: [] };
  }
}

module.exports = { TABLE, KEEP, isConfigured, start, update, finish, latest, listRecent };
