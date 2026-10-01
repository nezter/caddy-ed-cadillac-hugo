/**
 * audit-log.js -- who changed what, recorded in a way that survives the change.
 *
 * WHY THIS REFUSES TO STORE A CUSTOMER SNAPSHOT
 * ---------------------------------------------
 * The obvious design is a before/after diff, and it is wrong here for a reason
 * worth stating before somebody "improves" it:
 *
 *   Erasure wants the person gone. An audit row holding their name, email and
 *   phone "for the record" means the erasure did not finish, and the thing that
 *   prevented compliance is the thing claiming to prove compliance.
 *
 * So `record()` for a `customer.erase` stores counts, not content. Seventeen
 * rows removed is exactly the evidence a data-subject request needs. What was in
 * them is not kept.
 *
 * For a NON-subject change -- a lead's status moving, a setting being written --
 * `detail` may carry whatever the caller wants, because those rows are not the
 * thing being erased. `assertNoSubjectData()` below exists to make the first
 * rule enforceable rather than aspirational.
 *
 * NEVER THROWS
 * ------------
 * A caller is mid-deletion. If the audit write fails, aborting would leave the
 * caller believing nothing happened; continuing silently loses the evidence.
 * So it logs loudly, returns a result, and lets the caller decide. The one
 * exception is `requireAudit()`, for the actions that must not proceed
 * unrecorded at all.
 */

'use strict';

/** Every action this codebase may write. Closed, so it can be filtered on. */
const ACTIONS = {
  CUSTOMER_ERASE: 'customer.erase',
  CUSTOMER_EXPORT: 'customer.export',
  LEAD_MERGE: 'lead.merge',
  LEAD_STATUS_CHANGE: 'lead.status_change',
  SETTINGS_UPDATE: 'settings.update',
  APPOINTMENT_COMPLETE: 'appointment.complete',
  AUTH_LOGIN: 'auth.login',
  SEED_RUN: 'seed.run',
};

const ACTION_SET = new Set(Object.values(ACTIONS));

/**
 * Actions that may not carry identifying fields in `detail`.
 *
 * This is the rule from the header, made checkable.
 */
const SUBJECT_ACTIONS = new Set([ACTIONS.CUSTOMER_ERASE, ACTIONS.CUSTOMER_EXPORT]);

/** Column names that identify a person. Used only to refuse, never to strip. */
const IDENTIFYING = [
  'first_name', 'last_name', 'email', 'phone', 'address_line1', 'address_line2',
  'name', 'message', 'content', 'notes', 'sales_rep_notes', 'normalized_email',
  'normalized_phone', 'normalized_name', 'searchable_text', 'search_vector',
];

/**
 * Refuse a detail payload that would put a person's identifying fields in an
 * audit row for a subject action.
 *
 * Returns a list of offending keys, empty when fine. It refuses rather than
 * silently redacts: a caller that expected to store a snapshot should be told
 * it cannot, because the alternative is that it keeps trying and one day
 * somebody relaxes the check.
 */
function assertNoSubjectData(action, detail) {
  if (!SUBJECT_ACTIONS.has(action)) return [];
  if (!detail || typeof detail !== 'object') return [];
  const found = [];
  for (const key of Object.keys(detail)) {
    const k = String(key).toLowerCase();
    if (IDENTIFYING.includes(k)) found.push(key);
  }
  return found;
}

function newId() {
  const crypto = require('crypto');
  return `aud_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Write one audit row.
 *
 * `actor` is the value returned by auth-middleware: `{ id, email, role }`.
 * `context` is the Netlify event, used only for ip and user-agent.
 */
async function record(database, {
  action,
  entityType,
  entityId = null,
  actor = null,
  reason = null,
  detail = null,
  rowsAffected = 0,
  context = null,
}) {
  if (!ACTION_SET.has(action)) {
    // A typo'd action would write a row nothing can filter on. Refused loudly.
    console.error(`[audit] unknown action "${action}" -- not recorded`);
    return { recorded: false, error: 'unknown-action' };
  }
  if (!entityType) {
    console.error('[audit] entityType is required -- not recorded');
    return { recorded: false, error: 'entity-type-required' };
  }

  const offending = assertNoSubjectData(action, detail);
  if (offending.length) {
    console.error(
      `[audit] refused: "${action}" would store identifying fields (${offending.join(', ')}). ` +
        'An erasure audit row carries counts, not the data it removed.'
    );
    return { recorded: false, error: 'subject-data-refused', offending };
  }

  const ip = context ? (context.headers || {})['x-nf-client-connection-ip'] || null : null;
  const ua = context ? (context.headers || {})['user-agent'] || null : null;

  const auditId = newId();
  try {
    await database.query(
      `INSERT INTO audit_log
         (id, actor_id, actor_email, actor_role, action, entity_type, entity_id,
          reason, detail, rows_affected, ip, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, datetime('now'))`,
      [
        auditId,
        (actor && actor.id) || null,
        (actor && actor.email) || null,
        (actor && actor.role) || null,
        action,
        entityType,
        entityId,
        reason,
        detail ? JSON.stringify(detail) : null,
        rowsAffected,
        ip,
        ua,
      ]
    );
    return { recorded: true, id: auditId };
  } catch (err) {
    // Not swallowed. A caller mid-deletion needs to know the evidence is missing.
    console.error(`[audit] write failed for ${action}: ${err.message}`);
    return { recorded: false, error: err.message };
  }
}

/**
 * Record, and refuse to continue if it failed.
 *
 * For the actions where losing the record would itself be the violation --
 * currently `customer.erase` and `lead.merge`, both irreversible.
 */
async function requireAudit(database, entry) {
  const result = await record(database, entry);
  if (!result.recorded) {
    const err = new Error(
      `refusing to continue: the audit record could not be written (${result.error})`
    );
    err.code = 'audit-unavailable';
    err.auditResult = result;
    throw err;
  }
  return result;
}

/** The trail for one entity, newest first. */
async function forEntity(database, entityType, entityId, limit = 200) {
  const result = await database.query(
    `SELECT id, actor_id, actor_email, actor_role, action, entity_type, entity_id,
            reason, detail, rows_affected, created_at
       FROM audit_log
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [entityType, entityId, Math.min(Number(limit) || 200, 1000)]
  );
  return result.rows;
}

module.exports = {
  ACTIONS,
  ACTION_SET,
  SUBJECT_ACTIONS,
  IDENTIFYING,
  assertNoSubjectData,
  record,
  requireAudit,
  forEntity,
  newId,
};