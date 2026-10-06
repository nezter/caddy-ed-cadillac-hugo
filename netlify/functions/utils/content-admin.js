/**
 * content-admin.js -- one admin API, three content types.
 *
 * makeContentHandler({ store, def }) returns the Netlify handler for a
 * content type: list (read permission), save/clear (write permission), the
 * apply-says-queued reply an agent must pass along, audit rows on the
 * type's own action name. articles-admin.js, specials-admin.js and
 * testimonials-admin.js are each five lines of wiring around this.
 *
 * The store is injected (not required here) so the email... er, so tests
 * can stub the exact module the endpoint requires -- see
 * ci/check-articles-admin.js for the pattern.
 */

'use strict';

const DatabaseService = require('./database-service');
const { authenticateRequest } = require('./auth-middleware');
const AuditLog = require('./audit-log');
const { originHeaders } = require('./cors-middleware');

const MAX_BODY = 70 * 1024;

function makeContentHandler({ store, def }) {
  AuditLog.registerAction(def.auditAction);

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
      error: 'The ' + def.one + ' queue needs the database, and it is not configured here.',
      code: 'database-not-configured',
      detail: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable ' + def.label + ' writing.',
    });

  function slugProblem(slug) {
    if (!slug) return 'slug is required';
    if (!store.SLUG_RE.test(slug)) {
      return 'slug must be lower-case letters, numbers and single hyphens (max ' + def.slug.max + ' chars)';
    }
    return '';
  }

  return async function (event) {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsFor(event), body: '' };
    }

    try {
      if (event.httpMethod === 'GET') {
        const auth = await authenticateRequest(event, {
          requireAuth: true,
          requiredPermissions: [def.permissions.read],
        });
        if (!auth.authenticated) {
          return json(event, auth.error?.statusCode || 401, {
            error: 'Sign in to read the ' + def.one + ' queue',
            code: 'unauthenticated',
          });
        }
        if (!store.isConfigured()) return dbMissing(event);
        const { ok, rows, reason, detail } = await store.list();
        if (!ok) return json(event, 503, { error: 'The ' + def.one + ' queue could not be read.', code: reason, detail });
        return json(event, 200, {
          [def.listKey]: rows,
          database: true,
          apply: 'Rows become files via: npm run ' + def.applyCmd + '. Files publish on the next deploy.',
          fields: def.fields,
          slug: def.slug,
          label: def.label,
          one: def.one,
        });
      }

      if (event.httpMethod === 'POST') {
        const auth = await authenticateRequest(event, {
          requireAuth: true,
          requiredPermissions: [def.permissions.write],
        });
        if (!auth.authenticated) {
          return json(event, auth.error?.statusCode || 401, {
            error: 'Sign in to write ' + def.label,
            code: 'unauthenticated',
          });
        }
        if (!store.isConfigured()) return dbMissing(event);

        const rawBody = event.body || '';
        if (rawBody.length > MAX_BODY) {
          return json(event, 413, { error: 'Request body is too large for one ' + def.one + ' (70 KB)' });
        }
        let payload = {};
        try {
          payload = JSON.parse(rawBody || '{}');
        } catch (e) {
          return json(event, 400, { error: 'Invalid JSON body' });
        }

        const action = String(payload.action || '').trim();
        const slug = String(payload.slug || '').trim().toLowerCase();

        if (action === 'save') {
          const problem = slugProblem(slug);
          if (problem) return json(event, 422, { error: problem });
          const fields = payload.fields;
          if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length) {
            return json(event, 422, { error: 'fields must be a non-empty object of changes' });
          }
          const r = await store.save(slug, fields, auth.user);
          if (!r.ok) {
            if (r.reason === 'invalid') {
              return json(event, 422, {
                error: 'Some fields cannot be saved',
                unknownFields: r.refused || [],
                fieldErrors: r.errors || [],
              });
            }
            return json(event, 503, { error: 'The ' + def.one + ' could not be saved.', code: r.reason, detail: r.detail });
          }
          await AuditLog.record(DatabaseService, {
            action: def.auditAction,
            entityType: def.entity,
            entityId: slug,
            actor: auth.user,
            detail: { fields: Object.keys(r.row.fields) },
            context: event,
          });
          return json(event, 200, {
            saved: true,
            row: r.row,
            apply: 'Queued, not published. Apply with: npm run ' + def.applyCmd + ', then deploy.',
          });
        }

        if (action === 'clear') {
          const problem = slugProblem(slug);
          if (problem) return json(event, 422, { error: problem });
          const r = await store.clear(slug);
          if (!r.ok) return json(event, 503, { error: 'The queue row could not be cleared.', code: r.reason, detail: r.detail });
          await AuditLog.record(DatabaseService, {
            action: def.auditAction,
            entityType: def.entity,
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
      return json(event, 500, { error: 'Content queue failed', detail: String(err.message) });
    }
  };
}

module.exports = { makeContentHandler };
