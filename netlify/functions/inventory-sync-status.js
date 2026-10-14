/**
 * inventory-sync-status.js -- the admin API behind /admin/sync.
 *
 *   GET -> the newest inventory sync run, plus the recent history.
 *
 * The runs are recorded by scripts/inventory/index.js through
 * utils/sync-runs.js, which is ALSO the module this function reads with, so
 * the two sides cannot drift on column names or shapes.
 *
 * GET             -> the newest run, plus the recent history. List rows are
 *                    slim on purpose (no change lists); ask for one run with
 *                    ?run=<id> to get its full detail.
 * GET ?run=<id>   -> one run, full detail: phase timeline, timings, runner,
 *                    error if it failed, and the change lists.
 *
 * Reads stay read-only here; starting a sync is inventory-sync-trigger.js,
 * which queues a request the next live script run adopts. The split is
 * deliberate: a sync needs the feed and the working tree, so only the
 * script side can run one.
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

    // One run, on request: the details panel behind each history row.
    const params = event.queryStringParameters || {};
    if (params.run) {
      const one = await SyncRuns.get(params.run);
      if (!one.ok) {
        return json(event, 503, {
          error: 'The sync record could not be read.',
          code: one.reason || 'read-failed',
          detail: one.detail || null,
        });
      }
      if (!one.run) {
        return json(event, 404, { error: 'No sync run with that id.', code: 'not-found' });
      }
      return json(event, 200, { ok: true, run: one.run });
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
