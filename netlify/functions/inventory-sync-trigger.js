/**
 * inventory-sync-trigger.js -- the Sync now button behind /admin/sync.
 *
 * WHAT IT DOES
 * ------------
 * POST queues a manual inventory sync request into inventory_sync_runs
 * (status 'requested', requested_by/requested_at set). The next live run of
 * scripts/inventory/index.js adopts the queued row and becomes it, so one
 * row carries the full lineage: who asked, when it started, what each
 * phase did, and what the run changed.
 *
 * WHY A QUEUE AND NOT THE RUN ITSELF
 * ----------------------------------
 * A sync is not an HTTP-shaped job. It reads the dealer feed politely,
 * diffs against a committed state file, rewrites vehicle pages and mirrors
 * photography -- it needs the feed and the working tree, which this
 * function does not have. A button here that claimed to run one would be a
 * lie. Queuing is the honest half a function can do; the script is the
 * other half.
 *
 * When SYNC_TRIGGER_WEBHOOK is set, the queue entry is also announced to
 * that URL (an automation that starts the runner, for example) -- best
 * effort, reported as dispatch: sent | failed | skipped. With nothing set
 * the request simply waits for the next run, which is the normal case.
 *
 * AUTH
 * ----
 * inventory_write, like the other inventory mutations. 503 when the
 * database is not configured: a queue nobody can read is not a queue.
 */

'use strict';

const SyncRuns = require('./utils/sync-runs');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders } = require('./utils/cors-middleware');

const corsFor = (event) => ({
  ...originHeaders(event, 'POST, OPTIONS'),
  'Cache-Control': 'no-store',
});

const json = (event, status, body) => ({
  statusCode: status,
  headers: corsFor(event),
  body: JSON.stringify(body),
});

/** Who asked, for the record. Agents carry no email, so their name is used. */
function actorOf(user) {
  if (!user) return 'unknown';
  if (user.email) return String(user.email);
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || String(user.id || 'unknown');
}

/** The optional wake-up call. Never throws, never blocks the request for long. */
async function announce(payload) {
  const url = process.env.SYNC_TRIGGER_WEBHOOK;
  if (!url) return 'skipped';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok ? 'sent' : 'failed';
  } catch (err) {
    return 'failed';
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(event, 405, { error: 'Only POST is served here.', code: 'method-not-allowed' });
  }

  try {
    const auth = await authenticateRequest(event, {
      requireAuth: true,
      requiredPermissions: ['inventory_write'],
    });
    if (!auth.authenticated) {
      return json(event, auth.error && auth.error.statusCode ? auth.error.statusCode : 401, {
        error: 'Sign in to queue a sync',
        code: 'unauthenticated',
      });
    }

    if (!SyncRuns.isConfigured()) {
      return json(event, 503, {
        error: 'The sync record needs the database, and it is not configured here.',
        code: 'database-not-configured',
      });
    }

    // One pending request at a time: a queue of identical requests would
    // spend the dealer's bandwidth re-running a sync nobody asked twice for.
    const pending = await SyncRuns.pendingRequest();
    if (!pending.ok) {
      return json(event, 503, {
        error: 'The sync queue could not be read.',
        code: pending.reason || 'read-failed',
        detail: pending.detail || null,
      });
    }
    if (pending.request) {
      return json(event, 200, {
        ok: true,
        queued: false,
        alreadyQueued: true,
        id: pending.request.id,
        requestedAt: pending.request.requestedAt,
        requestedBy: pending.request.requestedBy,
      });
    }

    const actor = actorOf(auth.user);
    const rq = await SyncRuns.request({ requestedBy: actor });
    if (!rq.ok) {
      return json(event, 503, {
        error: 'The sync request could not be recorded.',
        code: rq.reason || 'write-failed',
        detail: rq.detail || null,
      });
    }

    const dispatch = await announce({ id: rq.id, requestedBy: actor });
    return json(event, 200, { ok: true, queued: true, id: rq.id, dispatch });
  } catch (err) {
    return json(event, 500, {
      error: 'The sync request could not be recorded.',
      code: 'unexpected',
      detail: err.message,
    });
  }
};
