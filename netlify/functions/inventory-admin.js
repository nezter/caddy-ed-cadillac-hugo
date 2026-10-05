/**
 * inventory-admin.js -- the admin API behind /admin/inventory.
 *
 * WHAT IT DOES
 * -------------
 *   GET          -> every vehicle edit row (staff, inventory_read)
 *   POST action=save   { slug, fields } -> validate, merge, mark pending
 *   POST action=clear  { slug }         -> drop the row (feed data returns)
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ---------------------------------
 * It does not write content files and it does not trigger a deploy. A
 * Netlify Function cannot edit the repository, and this site deploys
 * prebuilt, so a save lands in the vehicle_edits queue and is applied to
 * the files by the inventory sync (scripts/inventory/edits.js) -- the same
 * pipeline every other content change takes. The admin page says exactly
 * that on every saved row; a control that lies about when it takes effect
 * is worse than no control.
 *
 * The row shape, validation and the applied/pending rules live in
 * utils/vehicle-edits.js, shared with the sync side, so the queue cannot
 * mean two different things in two places.
 *
 * AUTH
 * ----
 * Reads need inventory_read, writes inventory_write. 503 when the database
 * is not configured -- for a staff tool, silence and an empty list look the
 * same as 'no edits', and only one of them is true.
 */

'use strict';

const VehicleEdits = require('./utils/vehicle-edits');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const AuditLog = require('./utils/audit-log');
const { originHeaders } = require('./utils/cors-middleware');

// One action name in the closed audit vocabulary, registered here because
// this module is the only writer. Anything not registered is refused by the
// audit log rather than written as free text.
AuditLog.registerAction('vehicle.edit');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,140}$/i;
const MAX_BODY = 24 * 1024;

const corsFor = (event) => ({
  ...originHeaders(event, 'GET, POST, OPTIONS'),
  'Cache-Control': 'no-store',
});

const json = (event, status, body) => ({
  statusCode: status,
  headers: corsFor(event),
  body: JSON.stringify(body),
});

const dbMissing = (event) =>
  json(event, 503, {
    error: 'The edit queue needs the database, and it is not configured here.',
    code: 'database-not-configured',
    detail: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable vehicle record editing.',
  });

function slugProblem(slug) {
  if (!slug) return 'slug is required';
  if (!SLUG_RE.test(slug)) return 'slug contains characters a vehicle page cannot have';
  return '';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const auth = await authenticateRequest(event, {
        requireAuth: true,
        requiredPermissions: ['inventory_read'],
      });
      if (!auth.authenticated) {
        return json(event, auth.error?.statusCode || 401, {
          error: 'Sign in to read the vehicle edit queue',
          code: 'unauthenticated',
        });
      }
      if (!VehicleEdits.isConfigured()) return dbMissing(event);
      const { ok, rows, reason, detail } = await VehicleEdits.list();
      if (!ok) return json(event, 503, { error: 'The edit queue could not be read.', code: reason, detail });
      return json(event, 200, { edits: rows, database: true });
    }

    if (event.httpMethod === 'POST') {
      const auth = await authenticateRequest(event, {
        requireAuth: true,
        requiredPermissions: ['inventory_write'],
      });
      if (!auth.authenticated) {
        return json(event, auth.error?.statusCode || 401, {
          error: 'Sign in to edit vehicle records',
          code: 'unauthenticated',
        });
      }
      if (!VehicleEdits.isConfigured()) return dbMissing(event);

      const rawBody = event.body || '';
      if (rawBody.length > MAX_BODY) {
        return json(event, 413, { error: 'Request body is too large for a vehicle edit' });
      }
      let payload = {};
      try {
        payload = JSON.parse(rawBody || '{}');
      } catch (e) {
        return json(event, 400, { error: 'Invalid JSON body' });
      }

      const action = String(payload.action || '').trim();
      const slug = String(payload.slug || '').trim();

      if (action === 'save') {
        const problem = slugProblem(slug);
        if (problem) return json(event, 422, { error: problem });
        const fields = payload.fields;
        if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length) {
          return json(event, 422, { error: 'fields must be a non-empty object of changes' });
        }
        const r = await VehicleEdits.save(slug, fields, auth.user);
        if (!r.ok) {
          if (r.reason === 'invalid') {
            return json(event, 422, {
              error: 'Some fields cannot be saved',
              unknownFields: r.refused,
              fieldErrors: r.errors,
            });
          }
          return json(event, 503, { error: 'The edit could not be saved.', code: r.reason, detail: r.detail });
        }
        await AuditLog.record(DatabaseService, {
          action: 'vehicle.edit',
          entityType: 'vehicle',
          entityId: slug,
          actor: auth.user,
          detail: { fields: Object.keys(r.row.fields) },
          context: event,
        });
        return json(event, 200, { saved: true, row: r.row });
      }

      if (action === 'clear') {
        const problem = slugProblem(slug);
        if (problem) return json(event, 422, { error: problem });
        const r = await VehicleEdits.clear(slug);
        if (!r.ok) return json(event, 503, { error: 'The edit could not be cleared.', code: r.reason, detail: r.detail });
        await AuditLog.record(DatabaseService, {
          action: 'vehicle.edit',
          entityType: 'vehicle',
          entityId: slug,
          actor: auth.user,
          detail: { cleared: true },
          context: event,
        });
        return json(event, 200, { cleared: true, removed: r.removed });
      }

      return json(event, 422, { error: 'Unknown action. Use save or clear.' });
    }

    return json(event, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(event, 500, { error: 'Vehicle edit store failed', detail: String(err.message) });
  }
};
