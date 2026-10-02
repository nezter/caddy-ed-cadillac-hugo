/**
 * audit-log-view.js -- read the trail. /admin/audit.
 *
 * WHY THIS IS NOT PART OF staff-management.js
 * --------------------------------------------
 * The staff page answers "who is there now". This answers "what happened, and
 * who did it", which is a different question with a different audience: a
 * compliance request, a "who changed that phone number" question, or an
 * argument about whether a change ever happened at all.
 *
 * An audit trail nobody can read is half a feature. It satisfies a checkbox and
 * answers no question.
 *
 * WHAT IS NOT EXPOSED, AND WHY IT IS A FILTER RATHER THAN A RULE
 * -------------------------------------------------------------
 * An erasure audit row is deliberately nameless -- that is the design that lets
 * the trail survive an erasure without defeating it (see utils/audit-log.js).
 * So this endpoint cannot show "Ed erased customer X" in words, because the row
 * does not hold who X was. It shows the customer id, the row count, who did it,
 * and when.
 *
 * That is not a limitation to apologise for. It is the same information a
 * regulator is given, and it is the information that cannot be subpoenaed out of
 * the audit log six months later.
 *
 * WHO CAN READ IT
 * ---------------
 * `analytics_read`, held by admin and manager. It is a read of business records
 * about other people, so it is not on the same footing as the public signage.
 */

'use strict';

const DatabaseService = require('./utils/database-service');
const AuditLog = require('./utils/audit-log');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders, isAllowedOrigin } = require('./utils/cors-middleware');

/** Page size, clamped. An unbounded LIMIT is a data-dump endpoint. */
const MAX_LIMIT = 200;

function json(status, body, event) {
  return {
    statusCode: status,
    headers: { ...originHeaders(event, 'GET, OPTIONS'), 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {}, event);
  if (!isAllowedOrigin(event.headers || {})) {
    return json(403, { error: 'origin-not-allowed' }, event);
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'method-not-allowed' }, event);

  const auth = await authenticateRequest(event, {
    requireAuth: true,
    requiredPermissions: ['analytics_read'],
  });
  if (!auth.authenticated) return auth.error;

  if (!DatabaseService.isDatabaseConfigured()) {
    return json(503, { error: 'database-not-configured' }, event);
  }

  const p = event.queryStringParameters || {};
  const limit = Math.min(Number(p.limit) || 50, MAX_LIMIT);
  const where = [];
  const params = [];

  // Filters are added from a fixed set with bound parameters. Never interpolated,
  // and never a free-form WHERE from the query string.
  if (p.action) {
    if (!AuditLog.ACTION_SET.has(p.action)) {
      // An unknown action is refused rather than passed through: this endpoint
      // reports on a closed vocabulary, and a typo that silently returned
      // everything would be read as "nothing matched that action".
      return json(422, {
        error: 'unknown-action',
        detail: p.action,
        allowed: [...AuditLog.ACTION_SET],
      }, event);
    }
    params.push(p.action);
    where.push(`action = $${params.length}`);
  }
  if (p.entity_type) {
    // Constrained to an identifier shape, not quoted into SQL.
    if (!/^[a-z_]{2,40}$/.test(p.entity_type)) {
      return json(422, { error: 'bad-entity-type' }, event);
    }
    params.push(p.entity_type);
    where.push(`entity_type = $${params.length}`);
  }
  if (p.entity_id) {
    params.push(String(p.entity_id));
    where.push(`entity_id = $${params.length}`);
  }
  if (p.actor) {
    params.push(String(p.actor));
    where.push(`actor_id = $${params.length}`);
  }
  if (p.since) {
    if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(p.since)) {
      return json(422, { error: 'bad-since', detail: 'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM' }, event);
    }
    params.push(String(p.since).replace('T', ' '));
    where.push(`created_at >= $${params.length}`);
  }

  params.push(limit);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let rows = [];
  try {
    const result = await DatabaseService.query(
      `SELECT id, actor_id, actor_email, actor_role, action, entity_type, entity_id,
              reason, detail, rows_affected, ip, created_at
         FROM audit_log
         ${clause}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length}`,
      params
    );
    rows = result.rows || [];
  } catch (err) {
    // A missing table means 005_audit_log.sql has not been applied. Said
    // plainly, because an empty trail and an unapplied migration look
    // identical from here and mean opposite things.
    console.error('[audit-view] read failed:', err.message);
    return json(503, {
      error: 'audit-unavailable',
      detail:
        'The audit_log table could not be read. If this is a fresh database, apply ' +
        'database/turso/005_audit_log.sql. Note that nothing done before that ' +
        'migration was applied is in the trail -- it did not exist yet.',
    }, event);
  }

  // Counts by action, for the filter UI. Scoped to the same filters, so the
  // numbers describe what is on screen.
  let summary = [];
  try {
    const summaryParams = params.slice(0, params.length - 1);
    const s = await DatabaseService.query(
      `SELECT action, COUNT(*) AS n
         FROM audit_log
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY action
        ORDER BY n DESC`,
      summaryParams
    );
    summary = s.rows || [];
  } catch {
    summary = [];
  }

  return json(200, {
    entries: rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      by: r.actor_email || r.actor_role || 'system',
      actor_role: r.actor_role,
      reason: r.reason,
      detail: safeDetail(r.detail),
      rows_affected: r.rows_affected,
      ip: r.ip,
    })),
    summary,
    limit,
    // Said on every response: a reader must know the trail is incomplete if a
    // destructive action was refused for want of auditability.
    note:
      'An erasure or merge that could not be recorded does not happen -- so an absent ' +
      'action means it was not attempted, not that it was not tried.',
    actions: [...AuditLog.ACTION_SET],
  }, event);
};

/**
 * `detail` is JSON written by the caller. Parsed, and anything unparseable
 * passed through as a string rather than thrown on -- a trail that cannot render
 * because one row is malformed is a trail nobody reads.
 */
function safeDetail(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return String(raw);
  }
}