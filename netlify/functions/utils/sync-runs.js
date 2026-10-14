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
 *   4. Runs can also start from the queue. /admin/sync queues a request
 *      (request()); the next live script run adopts it (claimRequest()), so
 *      one row carries the full lineage: requested by whom, then phases,
 *      counts and the change lists, then the outcome. Only the script side
 *      claims, because only it can actually run a sync -- a sync needs the
 *      feed and the working tree, which a function does not have.
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
let _columnsEnsured = false;
function client() {
  if (_client !== undefined) return _client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) { _client = null; return _client; }
    // file: URLs (local tests, fixtures) go through the node entry;
    // everything in production is a libsql http endpoint.
    const entry = url.startsWith('file:') ? '@libsql/client/node' : '@libsql/client/http';
    const { createClient } = require(entry);
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
      'trigger TEXT, requested_by TEXT, requested_at TEXT, ' +
      'started_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, ' +
      'feed_total INTEGER DEFAULT 0, existing_count INTEGER DEFAULT 0, ' +
      'updated_count INTEGER DEFAULT 0, added_count INTEGER DEFAULT 0, ' +
      'retired_count INTEGER DEFAULT 0, processed INTEGER DEFAULT 0, ' +
      'process_total INTEGER DEFAULT 0, message TEXT, detail TEXT)'
  );
  if (_columnsEnsured) return;
  // A table created before the lineage columns existed is brought forward
  // quietly: one ALTER per column, each allowed to fail because 'duplicate
  // column' is the normal answer once it has run.
  for (const col of ['trigger TEXT', 'requested_by TEXT', 'requested_at TEXT']) {
    try { await db.execute('ALTER TABLE ' + TABLE + ' ADD COLUMN ' + col); } catch (err) { /* column already there */ }
  }
  _columnsEnsured = true;
}

function safeParse(text) {
  if (!text) return {};
  try { return JSON.parse(text) || {}; } catch (err) { return {}; }
}

function rowShape(r, full) {
  const shape = {
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
    trigger: r.trigger || null,
    requestedBy: r.requested_by || null,
    requestedAt: r.requested_at || null,
    detail: safeParse(r.detail),
  };
  // The 15-row list must not ship the change lists of every run; single-run
  // reads (latest, get) stay full. detailOmitted says a detail exists.
  if (full === false) {
    shape.detailOmitted = Boolean(r.detail);
    delete shape.detail;
  }
  return shape;
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
        ' (id, mode, source, status, phase, trigger, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, String(opts.mode || 'live'), opts.source ? String(opts.source) : null, 'running', 'reading', String(opts.trigger || 'local'), now, now],
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

/**
 * Queue a manual sync request. The row is born with status 'requested';
 * the next live script run adopts it (claimRequest) and becomes that run,
 * so one row carries the whole lineage: who asked, then phases, counts
 * and change lists, then the outcome.
 * Returns { ok, id } or { ok:false, reason } like start().
 */
async function request(options) {
  const opts = options || {};
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured' };
  const id = 'sync-' + Date.now().toString(36) + '-' + require('crypto').randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  try {
    await ensureTable(db);
    await db.execute({
      sql: 'INSERT INTO ' + TABLE +
        ' (id, mode, source, status, phase, trigger, requested_by, requested_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, String(opts.mode || 'live'), 'manual', 'requested', null, 'manual',
        opts.requestedBy ? String(opts.requestedBy).slice(0, 200) : null, now, now, now],
    });
    try {
      await db.execute({
        sql: 'DELETE FROM ' + TABLE + ' WHERE id NOT IN ' +
          '(SELECT id FROM ' + TABLE + ' ORDER BY started_at DESC LIMIT ?)',
        args: [KEEP],
      });
    } catch (err) { /* housekeeping */ }
    return { ok: true, id };
  } catch (err) {
    console.warn('sync-runs: request failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/** The oldest still-queued request, or null. Used for the button's dedupe. */
async function pendingRequest() {
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured', request: null };
  try {
    await ensureTable(db);
    const rs = await db.execute("SELECT * FROM " + TABLE + " WHERE status = 'requested' ORDER BY COALESCE(requested_at, started_at) ASC LIMIT 1");
    return { ok: true, request: rs.rows.length ? rowShape(rs.rows[0]) : null };
  } catch (err) {
    console.warn('sync-runs: pendingRequest failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, request: null };
  }
}

/**
 * Adopt the oldest queued request as THIS run: status 'requested' becomes
 * 'running' with a real started_at. The UPDATE is guarded on the old
 * status, so two racers cannot both claim one request.
 * Returns { ok, id, requestedAt }; id is null when the queue is empty.
 */
async function claimRequest() {
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured', id: null, requestedAt: null };
  try {
    await ensureTable(db);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rs = await db.execute("SELECT id, requested_at, started_at FROM " + TABLE + " WHERE status = 'requested' ORDER BY COALESCE(requested_at, started_at) ASC LIMIT 1");
      if (!rs.rows.length) return { ok: true, id: null, requestedAt: null };
      const row = rs.rows[0];
      const now = new Date().toISOString();
      const up = await db.execute({
        sql: "UPDATE " + TABLE + " SET status = 'running', phase = 'reading', started_at = ?, updated_at = ? WHERE id = ? AND status = 'requested'",
        args: [now, now, row.id],
      });
      if (Number(up.rowsAffected) > 0) {
        return { ok: true, id: row.id, requestedAt: row.requested_at || row.started_at || null };
      }
    }
    return { ok: true, id: null, requestedAt: null };
  } catch (err) {
    console.warn('sync-runs: claimRequest failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message, id: null, requestedAt: null };
  }
}

/** One run by id, full detail. { ok, run } with run null when no such row. */
async function get(id) {
  const db = client();
  if (!db) return { ok: false, reason: 'not-configured', run: null };
  if (!id || !/^sync-[A-Za-z0-9-]+$/.test(String(id))) return { ok: true, run: null };
  try {
    await ensureTable(db);
    const rs = await db.execute({ sql: 'SELECT * FROM ' + TABLE + ' WHERE id = ? LIMIT 1', args: [String(id)] });
    return { ok: true, run: rs.rows.length ? rowShape(rs.rows[0]) : null };
  } catch (err) {
    console.warn('sync-runs: get failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, run: null };
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
    return { ok: true, runs: Array.from(rs.rows).map((r) => rowShape(r, false)) };
  } catch (err) {
    console.warn('sync-runs: listRecent failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, runs: [] };
  }
}

module.exports = { TABLE, KEEP, isConfigured, start, update, finish, latest, listRecent, request, pendingRequest, claimRequest, get };
