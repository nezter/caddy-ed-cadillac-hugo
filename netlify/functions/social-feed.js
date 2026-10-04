/**
 * social-feed.js -- the cached social payload as JSON.
 *
 * GET only. Always 200: the response shape is the API, and "nothing new
 * right now" is a normal state, not an error. The Cache-Control header is
 * the daily-refresh gate at the CDN -- one origin fetch a day, then every
 * visitor is served the same cheap copy. The cache row behind it (see
 * utils/social-cache.js) holds the last good payload across cold starts and
 * platform failures.
 *
 * The front end (assets/js/social-feed.js) treats an empty posts array as
 * "keep the follow card" -- absence is never rendered as an error.
 */
'use strict';

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
};

function emptyFeed() {
  return { facebook: { posts: [] }, x: { posts: [] }, instagram: { posts: [] } };
}

exports.handler = async function () {
  try {
    const cache = require('./utils/social-cache');
    const feed = await cache.readFeed();
    const config = await cache.publicConfig();
    return {
      statusCode: 200,
      headers: CACHE_HEADERS,
      body: JSON.stringify({
        ok: true,
        refreshedAt: feed.refreshedAt || null,
        stale: !!feed.stale,
        config,
        facebook: feed.facebook || { posts: [] },
        x: feed.x || { posts: [] },
        instagram: feed.instagram || { posts: [] },
      }),
    };
  } catch (err) {
    // A missing feed must never read as an outage.
    console.warn('social-feed: handler error:', err.message);
    return {
      statusCode: 200,
      headers: CACHE_HEADERS,
      body: JSON.stringify({ ok: false, config: null, ...emptyFeed() }),
    };
  }
};
