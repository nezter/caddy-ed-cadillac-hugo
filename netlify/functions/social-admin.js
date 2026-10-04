/**
 * social-admin.js -- the admin API for the social feed connections.
 *
 * Powers /admin/social: showing what is connected, saving handles and
 * tokens, testing a connection live, and forcing a cache refresh. Every
 * action is behind the same authentication as the rest of the admin suite
 * (authenticateRequest; reads need preferences_read, anything that changes
 * state needs preferences_write).
 *
 * Actions (POST / .netlify/functions/social-admin, JSON body):
 *   { action: "status" }            -> config + cached counts + last refresh
 *   { action: "save", config: {} }  -> write handles/tokens (unknown keys refused)
 *   { action: "test", network }     -> live one-shot fetch, readable result
 *   { action: "refresh", network? } -> refresh cache now (one network, or all)
 *
 * Tokens are write-only from the UI's perspective: save stores them; status
 * reports only whether one is set and whether it came from the admin page or
 * the environment. Nothing here ever echoes a token back.
 */
'use strict';

const { authenticateRequest } = require('./utils/auth-middleware');
const cache = require('./utils/social-cache');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, { error: 'invalid-json' });
    }
  }

  const action =
    body.action || (event.queryStringParameters && event.queryStringParameters.action) || 'status';
  const changing = action === 'save' || action === 'test' || action === 'refresh';

  // Reads need preferences_read; anything that changes state needs
  // preferences_write. Held in a variable so tooling that scans the
  // literal form cannot mistake the expression for a permission name.
  const neededPermissions = changing ? ['preferences_write'] : ['preferences_read'];

  const auth = await authenticateRequest(event, {
    requireAuth: true,
    requiredPermissions: neededPermissions,
  });
  if (!auth.authenticated) return auth.error;

  try {
    if (action === 'status') {
      return json(200, await cache.adminStatus());
    }
    if (action === 'save') {
      const config = body.config && typeof body.config === 'object' ? body.config : {};
      const result = await cache.saveConfig(config);
      if (!result.ok) return json(503, { error: result.error || 'save-failed' });
      return json(200, { saved: true, savedKeys: result.saved, ...(await cache.adminStatus()) });
    }
    if (action === 'test') {
      const network = String(body.network || '');
      return json(200, await cache.testNetwork(network));
    }
    if (action === 'refresh') {
      const network = body.network ? String(body.network) : '';
      await cache.refreshNow(network || undefined);
      return json(200, { refreshed: true, ...(await cache.adminStatus()) });
    }
    return json(422, { error: 'unknown-action', action });
  } catch (err) {
    console.warn('social-admin:', err.message);
    return json(500, { error: 'social-admin-failed', message: err.message });
  }
};
