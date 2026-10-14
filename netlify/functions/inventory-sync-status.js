/**
 * inventory-sync-status.js -- the admin API behind /admin/sync.
 *
 *   GET -> the newest inventory sync run, plus the recent history.
 *
 * The runs are recorded by scripts/inventory/index.js through
 * utils/sync-runs.js, which is ALSO the module this function reads with, so
 * the two sides cannot drift on column names or shapes. This function is
 * read-only on purpose: a sync is started by running the script where the
 * feed and the working tree are, not by a button here that could not do the
 * work it claims.
 *
 * AUTH
 * ----
 * Reads need inventory_read, like the rest of the inventory tools. 503 when
 * the database is not configured, because an empty history and 'no
 * database' look identical otherwise and only one of them is true.
 */

'use strict';

const SyncRuns = require('./utils/sync-runs');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders } = require('./utils/cors-middleware');

const corsFor = (event) => ({
  ...originHeaders(event, 'GET, OPTIONS'),
  'Cache-Control': 'no-store',
});

const json = (event, status, body) => ({
  statusCode: status,
  headers: corsFor(event),
  body: JSON.stringify(body),
});

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return json(event, 405, { error: 'Only GET is served here.', code: 'method-not-allowed' });
  }

  try {
    const auth = await authenticateRequest(event, {
      requireAuth: true,
      requiredPermissions: ['inventory_read'],
    });
    if (!auth.authenticated) {
      return json(event, auth.error && auth.error.statusCode ? auth.error.statusCode : 401, {
        error: 'Sign in to read the sync record',
        code: 'unauthenticated',
      });
    }

    if (!SyncRuns.isConfigured()) {
      return json(event, 503, {
        error: 'The sync record needs the database, and it is not configured here.',
        code: 'database-not-configured',
      });
    }

    const current = await SyncRuns.latest();
    const recent = await SyncRuns.listRecent(15);
    if (!current.ok || !recent.ok) {
      return json(event, 503, {
        error: 'The sync record could not be read.',
        code: current.reason || recent.reason || 'read-failed',
        detail: current.detail || recent.detail || null,
      });
    }

    return json(event, 200, {
      ok: true,
      now: new Date().toISOString(),
      current: current.run,
      runs: recent.runs,
    });
  } catch (err) {
    return json(event, 500, {
      error: 'The sync record could not be read.',
      code: 'unexpected',
      detail: err.message,
    });
  }
};
