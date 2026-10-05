/**
 * articles-admin.js -- the API behind /admin/articles, and the door an LLM
 * agent uses to write articles (see docs/CONTENT-API.md).
 *
 *   GET                 -> every queued article row (staff, articles_read)
 *   POST action=save    { slug, fields }  -> validate, merge, mark pending
 *   POST action=clear   { slug }          -> drop the queue row
 *
 * What it does NOT do: touch the repository or publish. Rows are applied to
 * site/content/articles/<slug>.md by scripts/articles/apply.js (npm run
 * articles:apply), and published by the next deploy -- the same honest
 * pipeline as vehicle edits. The admin page says so on every save; so does
 * this reply, in `apply` below, so an agent knows what happens next without
 * reading the docs twice.
 *
 * AUTH: articles_read for reads, articles_write for writes. 503 with a code
 * when the database is absent -- an empty list and 'no articles' must not
 * look the same to an agent.
 */

'use strict';

const ArticleQueue = require('./utils/article-queue');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const AuditLog = require('./utils/audit-log');
const { originHeaders } = require('./utils/cors-middleware');

AuditLog.registerAction('article.edit');

const MAX_BODY = 70 * 1024;

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
    error: 'The article queue needs the database, and it is not configured here.',
    code: 'database-not-configured',
    detail: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable article writing.',
  });

function slugProblem(slug) {
  if (!slug) return 'slug is required';
  if (!ArticleQueue.SLUG_RE.test(slug)) {
    return 'slug must be lower-case letters, numbers and single hyphens (max 80 chars)';
  }
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
        requiredPermissions: ['articles_read'],
      });
      if (!auth.authenticated) {
        return json(event, auth.error?.statusCode || 401, {
          error: 'Sign in to read the article queue',
          code: 'unauthenticated',
        });
      }
      if (!ArticleQueue.isConfigured()) return dbMissing(event);
      const { ok, rows, reason, detail } = await ArticleQueue.list();
      if (!ok) return json(event, 503, { error: 'The article queue could not be read.', code: reason, detail });
      return json(event, 200, {
        articles: rows,
        database: true,
        apply: 'Rows become files via: npm run articles:apply. Files publish on the next deploy.',
      });
    }

    if (event.httpMethod === 'POST') {
      const auth = await authenticateRequest(event, {
        requireAuth: true,
        requiredPermissions: ['articles_write'],
      });
      if (!auth.authenticated) {
        return json(event, auth.error?.statusCode || 401, {
          error: 'Sign in to write articles',
          code: 'unauthenticated',
        });
      }
      if (!ArticleQueue.isConfigured()) return dbMissing(event);

      const rawBody = event.body || '';
      if (rawBody.length > MAX_BODY) {
        return json(event, 413, { error: 'Request body is too large for one article (70 KB)' });
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
        const r = await ArticleQueue.save(slug, fields, auth.user);
        if (!r.ok) {
          if (r.reason === 'invalid') {
            return json(event, 422, {
              error: 'Some fields cannot be saved',
              unknownFields: r.refused || [],
              fieldErrors: r.errors || [],
            });
          }
          return json(event, 503, { error: 'The article could not be saved.', code: r.reason, detail: r.detail });
        }
        await AuditLog.record(DatabaseService, {
          action: 'article.edit',
          entityType: 'article',
          entityId: slug,
          actor: auth.user,
          detail: { fields: Object.keys(r.row.fields) },
          context: event,
        });
        return json(event, 200, {
          saved: true,
          row: r.row,
          apply: 'Queued, not published. Apply with: npm run articles:apply, then deploy.',
        });
      }

      if (action === 'clear') {
        const problem = slugProblem(slug);
        if (problem) return json(event, 422, { error: problem });
        const r = await ArticleQueue.clear(slug);
        if (!r.ok) return json(event, 503, { error: 'The queue row could not be cleared.', code: r.reason, detail: r.detail });
        await AuditLog.record(DatabaseService, {
          action: 'article.edit',
          entityType: 'article',
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
    return json(event, 500, { error: 'Article queue failed', detail: String(err.message) });
  }
};
