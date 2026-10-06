/**
 * agent-keys.js -- first-class identities for LLM agents and automation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this, an agent talked to the content API with a STAFF MEMBER'S
 * session token: indistinguishable from that person, impossible to scope,
 * impossible to revoke without logging the human out, and nothing in the
 * audit trail could say which was which. An agent key is its own identity:
 * a name, a set of scopes (the same permission vocabulary the staff use),
 * an optional expiry, a last-used stamp, and an instant off switch.
 *
 * SECURITY SHAPE
 * --------------
 *  - The secret is `cdy1_` + 32 random bytes (base64url). It is returned
 *    ONCE at creation and never stored: the table keeps a SHA-256 hash plus
 *    a short display prefix. A leaked database dump yields no working keys.
 *  - Scopes are validated against the staff permission vocabulary
 *    (staff-profile.js) and the agents_* permissions themselves are NOT
 *    grantable -- an agent key can never mint or manage other agent keys.
 *  - resolve() fails closed: no database -> 'unavailable'; unknown, revoked
 *    and expired are distinct, honest reasons.
 *  - last_used_at is bumped at most once every few minutes per key, so a
 *    busy agent does not write to the row on every request.
 *
 * Table (created lazily):
 *   agent_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
 *               scopes TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
 *               key_prefix TEXT NOT NULL, created_by TEXT,
 *               created_at TEXT NOT NULL, last_used_at TEXT,
 *               expires_at TEXT, revoked_at TEXT)
 */

'use strict';

const crypto = require('crypto');

const TABLE = 'agent_keys';
const PREFIX = 'cdy1_';
const KEY_RE = /^cdy1_[A-Za-z0-9_-]{20,}$/;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/* THE GRANTABLE SET IS CONTENT ONLY, on purpose.
 *
 * An agent key may manage what the site SAYS -- articles, vehicle records,
 * settings copy, pick promotion, SEO scoring -- and nothing else. The CRM
 * (leads, customers, campaigns, erasure) and identity management are not
 * in this list and cannot be granted to a key even by an administrator.
 * Not because an operator might not trust an agent with them today, but
 * because 'an agent action erased a customer' must not be reachable by
 * configuration at all. The destructive endpoints additionally require
 * human roles (admin) which keys can never hold.
 */
const GRANTABLE = [
  'articles_read', 'articles_write',
  'inventory_read', 'inventory_write',
  'seo_read',
  'preferences_read', 'preferences_write',
];

/* Human labels for the admin page's checkboxes. Kept in lockstep with
 * GRANTABLE by a test: a label without a grantable scope is a checkbox
 * that cannot save. */
const SCOPE_LABELS = {
  'articles_read': 'Read the article queue',
  'articles_write': 'Write and edit articles',
  'inventory_read': 'Read the vehicle edit queue',
  'inventory_write': 'Edit vehicle records and manage Ed\u2019s picks',
  'seo_read': 'Score pages (SEO audit)',
  'preferences_read': 'Read site settings',
  'preferences_write': 'Change site settings (the copy layer)',
};

/* Never grantable to any key under any circumstances. */
const UNGRANTABLE = ['agents_read', 'agents_write'];

let _client;
function client() {
  if (_client !== undefined) return _client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) { _client = null; return _client; }
    const { createClient } = require('@libsql/client/http');
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  } catch (err) {
    console.warn('agent-keys: client unavailable:', err.message);
    _client = null;
  }
  return _client;
}

function isConfigured() { return Boolean(process.env.TURSO_DATABASE_URL); }

async function ensureTable(db) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS ' + TABLE + ' (' +
      'id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, scopes TEXT NOT NULL, ' +
      'key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, created_by TEXT, ' +
      'created_at TEXT NOT NULL, last_used_at TEXT, expires_at TEXT, revoked_at TEXT)'
  );
}

/* ------------------------------------------------------------ crypto --- */

function generateSecret() {
  return PREFIX + crypto.randomBytes(32).toString('base64url');
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest('hex');
}

function prefixOf(secret) {
  return String(secret).slice(0, 13);
}

/* --------------------------------------------------------- validation --- */

/** Returns { ok, scopes, errors } -- scopes normalised to a deduped array. */
function sanitizeScopes(input) {
  const errors = [];
  let list = input;
  if (typeof list === 'string') list = list.split(',');
  if (!Array.isArray(list) || !list.length) return { ok: false, scopes: [], errors: ['scopes must be a non-empty array'] };
  const scopes = [];
  for (const raw of list) {
    const s = String(raw).trim();
    if (!s) continue;
    if (GRANTABLE.includes(s)) {
      if (!scopes.includes(s)) scopes.push(s);
    } else {
      errors.push('"' + s + '" cannot be granted to agent keys -- keys manage content only (articles, inventory, settings, SEO)');
    }
  }
  if (!scopes.length && !errors.length) errors.push('scopes must name at least one permission');
  return { ok: errors.length === 0 && scopes.length > 0, scopes, errors };
}

function rowShape(row) {
  const scopes = String(row.scopes || '').split(',').map((s) => s.trim()).filter(Boolean);
  const now = Date.now();
  const expired = row.expires_at ? Date.parse(row.expires_at) < now : false;
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : '',
    scopes,
    prefix: String(row.key_prefix),
    createdBy: row.created_by ? String(row.created_by) : '',
    createdAt: row.created_at ? String(row.created_at) : '',
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : '',
    expiresAt: row.expires_at ? String(row.expires_at) : '',
    revokedAt: row.revoked_at ? String(row.revoked_at) : '',
    status: row.revoked_at ? 'revoked' : (expired ? 'expired' : 'active'),
  };
}

/* ------------------------------------------------------------- API ----- */

async function create(name, scopesInput, opts) {
  const db = client();
  if (!db) return { ok: false, reason: 'database-not-configured' };
  const cleanName = String(name || '').trim();
  if (!cleanName) return { ok: false, reason: 'invalid', errors: ['name is required'] };
  if (cleanName.length > 80) return { ok: false, reason: 'invalid', errors: ['name is longer than 80 characters'] };
  const s = sanitizeScopes(scopesInput);
  if (!s.ok) return { ok: false, reason: 'invalid', errors: s.errors };
  let expiresAt = null;
  const options = opts || {};
  if (options.expiresAt) {
    const t = Date.parse(String(options.expiresAt));
    if (Number.isNaN(t)) return { ok: false, reason: 'invalid', errors: ['expiresAt must be an ISO date'] };
    expiresAt = new Date(t).toISOString();
  }
  try {
    await ensureTable(db);
    const id = 'ag_' + crypto.randomBytes(8).toString('hex');
    const secret = generateSecret();
    const now = new Date().toISOString();
    await db.execute({
      sql: 'INSERT INTO ' + TABLE + ' (id, name, description, scopes, key_hash, key_prefix, created_by, created_at, last_used_at, expires_at, revoked_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)',
      args: [
        id, cleanName,
        options.description ? String(options.description).slice(0, 300) : null,
        s.scopes.join(','),
        hashSecret(secret),
        prefixOf(secret),
        options.createdBy ? String(options.createdBy) : '',
        now, expiresAt,
      ],
    });
    return {
      ok: true,
      secret,
      row: { id, name: cleanName, description: (options.description || ''), scopes: s.scopes, prefix: prefixOf(secret), createdAt: now, expiresAt: expiresAt || '', lastUsedAt: '', revokedAt: '', status: 'active' },
    };
  } catch (err) {
    console.warn('agent-keys: create failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

async function list() {
  const db = client();
  if (!db) return { ok: false, reason: 'database-not-configured', agents: [] };
  try {
    await ensureTable(db);
    const rs = await db.execute('SELECT * FROM ' + TABLE + ' ORDER BY created_at DESC');
    return { ok: true, agents: Array.from(rs.rows).map(rowShape) };
  } catch (err) {
    console.warn('agent-keys: list failed:', err.message);
    return { ok: false, reason: 'read-failed', detail: err.message, agents: [] };
  }
}

async function revoke(id) {
  const db = client();
  if (!db) return { ok: false, reason: 'database-not-configured' };
  try {
    await ensureTable(db);
    const r = await db.execute({
      sql: 'UPDATE ' + TABLE + ' SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      args: [new Date().toISOString(), String(id)],
    });
    return { ok: true, revoked: Number(r.rowsAffected || 0) };
  } catch (err) {
    console.warn('agent-keys: revoke failed:', err.message);
    return { ok: false, reason: 'write-failed', detail: err.message };
  }
}

/**
 * Resolve a presented secret to its agent. Fails closed with an honest
 * reason: unavailable (no database), unknown, revoked, expired.
 */
async function resolve(secret) {
  const db = client();
  if (!db) return { ok: false, status: 'unavailable', message: 'Agent keys need the database, which is not configured in this context.' };
  try {
    await ensureTable(db);
    const rs = await db.execute({ sql: 'SELECT * FROM ' + TABLE + ' WHERE key_hash = ?', args: [hashSecret(secret)] });
    if (!rs.rows.length) return { ok: false, status: 'unknown', message: 'Unknown agent key' };
    const row = rs.rows[0];
    if (row.revoked_at) return { ok: false, status: 'revoked', message: 'Agent key has been revoked' };
    if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
      return { ok: false, status: 'expired', message: 'Agent key has expired' };
    }
    // Bump last_used_at, throttled, and never in the caller's way.
    const last = row.last_used_at ? Date.parse(row.last_used_at) : 0;
    if (!last || Date.now() - last > LAST_USED_THROTTLE_MS) {
      try {
        await db.execute({ sql: 'UPDATE ' + TABLE + ' SET last_used_at = ? WHERE id = ?', args: [new Date().toISOString(), String(row.id)] });
      } catch (e) { /* visibility only; never blocks the request */ }
    }
    return {
      ok: true,
      agent: {
        id: String(row.id),
        name: String(row.name),
        scopes: String(row.scopes || '').split(',').map((s) => s.trim()).filter(Boolean),
      },
    };
  } catch (err) {
    console.warn('agent-keys: resolve failed:', err.message);
    return { ok: false, status: 'error', message: 'Agent key could not be verified' };
  }
}

module.exports = {
  TABLE, PREFIX, KEY_RE, GRANTABLE, SCOPE_LABELS, UNGRANTABLE,
  isConfigured, sanitizeScopes, create, list, revoke, resolve,
  _internals: { generateSecret, hashSecret, prefixOf },
};
