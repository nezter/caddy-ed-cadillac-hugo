/**
 * agents-admin.js -- manage LLM-agent identities from /admin/agents.
 *
 *   GET                    -> every agent key (agents_read)
 *   POST action=create     { name, description?, scopes[], expiresAt? }
 *   POST action=revoke     { id }
 *
 * The created secret is returned EXACTLY ONCE, in the create reply, and is
 * stored only as a hash (utils/agent-keys.js explains the why and the how).
 * There is no 'show key' endpoint, by construction: a key that can be read
 * back out of the system is a key that leaks with the database.
 *
 * AUTH: agents_read to list, agents_write to create or revoke. Those two
 * permissions are NOT grantable to agent keys themselves -- an agent cannot
 * mint or revoke other agents.
 */

'use strict';

const AgentKeys = require('./utils/agent-keys');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const AuditLog = require('./utils/audit-log');
const { originHeaders } = require('./utils/cors-middleware');

AuditLog.registerAction('agent.create');
AuditLog.registerAction('agent.revoke');

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
    error: 'Agent keys need the database, and it is not configured here.',
    code: 'database-not-configured',
  });

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }
  try {
    if (event.httpMethod === 'GET') {
      const auth = await authenticateRequest(event, { requireAuth: true, requiredPermissions: ['agents_read'] });
      if (!auth.authenticated) {
        return json(event, auth.error?.statusCode || 401, { error: 'Sign in to see agent keys', code: 'unauthenticated' });
      }
      if (!AgentKeys.isConfigured()) return dbMissing(event);
      const r = await AgentKeys.list();
      if (!r.ok) return json(event, 503, { error: 'Agent keys could not be read.', code: r.reason, detail: r.detail });
      return json(event, 200, {
        agents: r.agents,
        scopes: Object.entries(AgentKeys.SCOPE_LABELS).map(([key, label]) => ({ key, label })),
        note: 'Secrets are shown once at creation and never stored. Present one as: Authorization: Bearer cdy1_...',
      });
    }

    if (event.httpMethod === 'POST') {
      const auth = await authenticateRequest(event, { requireAuth: true, requiredPermissions: ['agents_write'] });
      if (!auth.authenticated) {
        return json(event, auth.error?.statusCode || 401, { error: 'Sign in to manage agent keys', code: 'unauthenticated' });
      }
      if (!AgentKeys.isConfigured()) return dbMissing(event);

      let payload = {};
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (e) {
        return json(event, 400, { error: 'Invalid JSON body' });
      }
      const action = String(payload.action || '').trim();

      if (action === 'create') {
        const r = await AgentKeys.create(payload.name, payload.scopes, {
          description: payload.description,
          expiresAt: payload.expiresAt,
          createdBy: auth.user ? (auth.user.email || auth.user.id) : '',
        });
        if (!r.ok) {
          if (r.reason === 'invalid') return json(event, 422, { error: 'The agent key cannot be created with those values', fieldErrors: r.errors });
          return json(event, 503, { error: 'The agent key could not be created.', code: r.reason, detail: r.detail });
        }
        await AuditLog.record(DatabaseService, {
          action: 'agent.create',
          entityType: 'agent_key',
          entityId: r.row.id,
          actor: auth.user,
          detail: { name: r.row.name, scopes: r.row.scopes },
          context: event,
        });
        return json(event, 200, {
          created: true,
          agent: r.row,
          secret: r.secret,
          secretNote: 'This secret is shown once and stored only as a hash. Give it to the agent now; it cannot be retrieved later.',
        });
      }

      if (action === 'revoke') {
        const id = String(payload.id || '').trim();
        if (!id) return json(event, 422, { error: 'id is required' });
        const r = await AgentKeys.revoke(id);
        if (!r.ok) return json(event, 503, { error: 'The agent key could not be revoked.', code: r.reason, detail: r.detail });
        await AuditLog.record(DatabaseService, {
          action: 'agent.revoke',
          entityType: 'agent_key',
          entityId: id,
          actor: auth.user,
          detail: { revoked: r.revoked },
          context: event,
        });
        return json(event, 200, { revoked: r.revoked > 0, id });
      }

      return json(event, 422, { error: 'Unknown action. Use create or revoke.' });
    }

    return json(event, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(event, 500, { error: 'Agent key store failed', detail: String(err.message) });
  }
};
