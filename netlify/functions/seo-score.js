/**
 * seo-score.js -- score any page of THIS site, on demand.
 *
 *   POST { "path": "/articles/one-person-start-to-finish/" }
 *   GET  ?path=/inventory/
 *
 * The page is fetched from the same host the request arrived on -- never a
 * URL from the caller, so this endpoint cannot be pointed at another server
 * (the classic SSRF shape). The scoring itself is
 * utils/seo-score.js, a pure function, so the admin page and an LLM agent
 * get the identical answer for the identical page.
 *
 * AUTH: seo_read. Replies are no-store; scores of our own pages are not
 * something to leave lying in caches.
 */

'use strict';

const { scoreHtml, sectionOf } = require('./utils/seo-score');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders } = require('./utils/cors-middleware');

const MAX_PATH = 300;
const MAX_HTML = 900 * 1024;
const TIMEOUT_MS = 12000;

const corsFor = (event) => ({
  ...originHeaders(event, 'GET, POST, OPTIONS'),
  'Cache-Control': 'no-store',
});

const json = (event, status, body) => ({
  statusCode: status,
  headers: corsFor(event),
  body: JSON.stringify(body),
});

function pathProblem(path) {
  if (!path) return 'path is required (e.g. "/" or "/inventory/")';
  if (!path.startsWith('/') || path.startsWith('//')) return 'path must be a site-relative path starting with a single /';
  if (path.includes(':') || path.includes('\\') || path.includes('..')) return 'path must not contain scheme, backslash or parent segments';
  if (path.length > MAX_PATH) return 'path is too long';
  return '';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }
  try {
    const auth = await authenticateRequest(event, {
      requireAuth: true,
      requiredPermissions: ['seo_read'],
    });
    if (!auth.authenticated) {
      return json(event, auth.error?.statusCode || 401, { error: 'Sign in to score pages', code: 'unauthenticated' });
    }

    let path = '';
    if (event.httpMethod === 'GET') {
      path = (event.queryStringParameters && event.queryStringParameters.path) || '';
    } else if (event.httpMethod === 'POST') {
      let payload = {};
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (e) {
        return json(event, 400, { error: 'Invalid JSON body' });
      }
      path = String(payload.path || '');
    } else {
      return json(event, 405, { error: 'Method not allowed' });
    }

    path = String(path).trim();
    const problem = pathProblem(path);
    if (problem) return json(event, 422, { error: problem });

    // Same-host fetch only. The host comes from the request itself, so the
    // only pages this endpoint can ever read are this deployment's own.
    const host = (event.headers && (event.headers.host || event.headers.Host)) || '';
    if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
      return json(event, 400, { error: 'No usable host on the request' });
    }
    const url = 'https://' + host + path;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ac.signal,
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'caddy-ed-seo-audit/1' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200) {
      return json(event, 200, { ok: false, path, httpStatus: res.status, error: 'The page answered ' + res.status + '; nothing to score.' });
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html')) {
      return json(event, 200, { ok: false, path, httpStatus: 200, error: 'Not an HTML page (' + type + ').' });
    }
    let html = await res.text();
    if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML);

    const result = scoreHtml(html, { path, section: sectionOf(path) });
    return json(event, 200, Object.assign({ ok: true, httpStatus: 200, scoredAt: new Date().toISOString() }, result));
  } catch (err) {
    return json(event, 500, { error: 'Scoring failed', detail: String(err.message) });
  }
};
