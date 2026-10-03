/**
 * social-refresh.js -- the once-a-day refresh of the social cache.
 *
 * Netlify scheduled functions read `config.schedule` off the module. The
 * feature does not DEPEND on this firing: utils/social-cache.js refreshes
 * lazily whenever the cached copy is older than a day. This exists so the
 * first visitor of the day never pays for a refresh, and so "updated daily"
 * holds true even on a day with no traffic at all. With no platform tokens
 * configured it is a no-op that returns 200.
 */
'use strict';

exports.config = { schedule: '17 12 * * *' };

exports.handler = async function () {
  try {
    await require('./utils/social-cache').refreshNow();
    return { statusCode: 200, body: JSON.stringify({ ok: true, refreshedAt: new Date().toISOString() }) };
  } catch (err) {
    console.warn('social-refresh: error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
};
