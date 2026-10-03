/**
 * social-cache.js -- the social feed's cache layer.
 *
 * The feed is cache-based on purpose: nothing on the site asks Facebook, X
 * or Instagram for anything while a visitor is looking at it. One cache row
 * carries the last good payload; it refreshes at most once a day -- lazily,
 * when social-feed.js finds the cached copy older than 24 hours, and
 * proactively from the scheduled social-refresh.js.
 *
 * Two properties this module owes its callers:
 *   1. It never throws. No database, no platform tokens, a platform error,
 *      a missing table -- every path resolves to a usable, well-formed
 *      answer. The panel above it cannot break because of it.
 *   2. A refresh either produces a complete payload, or the previous cached
 *      payload is returned unchanged. Visitors never see a half-refresh.
 *
 * Storage: one row (id 'feed') in the site's Turso database via the same
 * transport utils/database-service.js uses -- `@libsql/client/http`, not the
 * bare entry point, which would bundle dead native transports into every
 * function. With no database configured, the cache is simply empty and the
 * panels fall back to their follow cards.
 *
 * Platform tokens (all optional; the cache simply stays empty without them):
 *   FACEBOOK_PAGE_TOKEN          -- Page access token; /me/posts on the Graph API
 *   X_BEARER_TOKEN + X_USERNAME  -- API v2 username lookup + timeline
 *   INSTAGRAM_ACCESS_TOKEN       -- Instagram Graph /me/media
 */
'use strict';

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY = 'feed';
const emptyFeed = () => ({ facebook: { posts: [] }, x: { posts: [] }, instagram: { posts: [] } });

let _client;
function client() {
  if (_client !== undefined) return _client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      _client = null;
      return _client;
    }
    const { createClient } = require('@libsql/client/http');
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  } catch (err) {
    console.warn('social-cache: client unavailable:', err.message);
    _client = null;
  }
  return _client;
}

async function ensureTable(db) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS social_cache (id TEXT PRIMARY KEY, payload TEXT NOT NULL, refreshed_at TEXT NOT NULL)'
  );
}

async function readCache() {
  const db = client();
  if (!db) return null;
  try {
    await ensureTable(db);
    const rs = await db.execute({ sql: 'SELECT payload, refreshed_at FROM social_cache WHERE id = ?', args: [KEY] });
    if (!rs.rows.length) return null;
    return { payload: JSON.parse(rs.rows[0].payload), refreshedAt: rs.rows[0].refreshed_at };
  } catch (err) {
    console.warn('social-cache: read failed:', err.message);
    return null;
  }
}

async function writeCache(payload) {
  const db = client();
  if (!db) return false;
  try {
    await ensureTable(db);
    await db.execute({
      sql: 'INSERT OR REPLACE INTO social_cache (id, payload, refreshed_at) VALUES (?, ?, ?)',
      args: [KEY, JSON.stringify(payload), new Date().toISOString()],
    });
    return true;
  } catch (err) {
    console.warn('social-cache: write failed:', err.message);
    return false;
  }
}

/* ----------------------------------------------------------- platforms -- */

async function fetchJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: headers || { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refreshFacebook() {
  const token = process.env.FACEBOOK_PAGE_TOKEN;
  if (!token) return [];
  const data = await fetchJson(
    'https://graph.facebook.com/v19.0/me/posts?fields=message,created_time,permalink_url&limit=6&access_token=' +
      encodeURIComponent(token)
  );
  return (data.data || [])
    .filter((p) => p.message)
    .map((p) => ({ text: p.message, url: p.permalink_url || '', createdAt: p.created_time || '', stats: {} }));
}

async function refreshX() {
  const token = process.env.X_BEARER_TOKEN;
  const username = (process.env.X_USERNAME || '').replace(/^@/, '');
  if (!token || !username) return [];
  const auth = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
  const who = await fetchJson('https://api.twitter.com/2/users/by/username/' + encodeURIComponent(username), auth);
  const id = who && who.data && who.data.id;
  if (!id) return [];
  const tl = await fetchJson(
    'https://api.twitter.com/2/users/' + id + '/tweets?max_results=10&exclude=replies,retweets&tweet.fields=created_at',
    auth
  );
  return ((tl && tl.data) || []).map((t) => ({
    text: t.text || '',
    url: 'https://twitter.com/' + username + '/status/' + t.id,
    createdAt: t.created_at || '',
    stats: {},
  }));
}

async function refreshInstagram() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return [];
  const data = await fetchJson(
    'https://graph.instagram.com/v19.0/me/media?fields=caption,permalink,timestamp&limit=6&access_token=' +
      encodeURIComponent(token)
  );
  return (data.data || [])
    .filter((m) => m.caption)
    .map((m) => ({ text: m.caption, url: m.permalink || '', createdAt: m.timestamp || '', stats: {} }));
}

async function refreshAll() {
  const out = emptyFeed();
  const jobs = [['facebook', refreshFacebook], ['x', refreshX], ['instagram', refreshInstagram]];
  for (const [name, fn] of jobs) {
    try {
      out[name].posts = await fn();
    } catch (err) {
      console.warn('social-cache: refresh ' + name + ' failed:', err.message);
    }
  }
  return out;
}

function anyToken() {
  return !!(process.env.FACEBOOK_PAGE_TOKEN || process.env.X_BEARER_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN);
}

/** Refresh now and persist when there is anything to persist. Never throws. */
async function refreshNow() {
  const refreshed = await refreshAll();
  if (anyToken()) await writeCache(refreshed);
  return refreshed;
}

/** The one entry point the endpoint uses. Always resolves; never throws. */
async function readFeed(options) {
  const force = !!(options && options.force);
  const cached = await readCache();
  const fresh =
    cached && !force && cached.refreshedAt && Date.now() - Date.parse(cached.refreshedAt) < TTL_MS;
  if (fresh) return { ...cached.payload, refreshedAt: cached.refreshedAt, stale: false };

  const refreshed = await refreshAll();
  if (anyToken()) {
    // A token-backed attempt (successful or not) counts as the day's refresh:
    // with nothing configured above us, retrying more often than daily is the
    // only way this endpoint could ever be disruptive.
    await writeCache(refreshed);
    return { ...refreshed, refreshedAt: new Date().toISOString(), stale: false };
  }
  if (cached) return { ...cached.payload, refreshedAt: cached.refreshedAt, stale: true };
  return { ...emptyFeed(), refreshedAt: null, stale: true };
}

module.exports = { TTL_MS, readFeed, refreshNow, refreshAll };
