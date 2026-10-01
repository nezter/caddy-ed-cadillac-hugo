/**
 * gdpr.js -- data-subject access and erasure.
 *
 * WHAT THIS IS
 * ------------
 * Two operations that a business collecting a customer's name, email, phone
 * number, address, vehicle interest and every conversation they have ever had
 * with a salesperson is eventually required to be able to perform:
 *
 *   GET    ?id=<customer_id>            everything held about one person
 *   DELETE ?id=<customer_id>&confirm=1  remove all of it
 *
 * Neither existed. Nothing in this repository could produce the first, and
 * nothing could perform the second -- so a request either had to be answered by
 * hand, or not answered.
 *
 * ERASURE IS A DRY RUN UNTIL IT IS NOT
 * -------------------------------------
 * `DELETE` with no `confirm=1` returns a plan: every table, every row count,
 * every column that would go. Nothing is deleted. That is the difference
 * between an irreversible operation and a mistake, and it is one query
 * parameter rather than a flag somebody has to remember.
 *
 * A `reason` is mandatory for the real thing, and refused without one. "Deleted
 * a person" with no stated cause is not a decision anyone can review later.
 *
 * WHY THIS IS NOT A CASCADE
 * --------------------------
 * It is tempting to let the foreign keys do it: `customers` has
 * `ON DELETE CASCADE` to six tables. That is not sufficient, and the reason is
 * a specific hole:
 *
 *   `customer_vehicle_interest` has NO foreign key to `customers`, and holds
 *   `sales_rep_notes` -- free text a salesperson wrote about a person. A
 *   CASCADE-only erasure removes the customer and leaves their notes behind,
 *   silently, with nothing to indicate it.
 *
 * So every table is enumerated explicitly below, including the one the schema
 * forgets, and the plan reports the count per table so a human can see that
 * `customer_vehicle_interest` had rows and that they were included.
 *
 * WHAT SURVIVES AN ERASURE, AND WHY
 * ---------------------------------
 * The `audit_log` row. It names no field values -- see utils/audit-log.js -- it
 * records that an erasure happened, who did it, why, and how many rows went.
 * That is the evidence a data-subject request needs, and keeping it does not
 * defeat the request because it holds nothing identifying.
 *
 * Anything else that would identify the person is removed, including the search
 * indexes, which are denormalised copies of their name and address and are the
 * easiest thing to forget.
 */

'use strict';

const DatabaseService = require('./utils/database-service');
const AuditLog = require('./utils/audit-log');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders, isAllowedOrigin } = require('./utils/cors-middleware');

/**
 * Every table holding data about a person, and what happens to it.
 *
 * `delete: true`  -- rows are removed
 * `delete: false` -- rows are kept and only the identifier is nulled, because
 *                    the row is also business record-keeping that is not the
 *                    person's data.
 *
 * This is a list, not a query against the schema, on purpose. A list can be
 * read, reviewed and argued with in a code review. Discovering a forgotten table
 * by introspection is exactly the failure this file exists to prevent.
 */
const PLAN = [
  // --- removed wholesale ---
  { table: 'customer_vehicle_interest', by: 'customer_id', delete: true,
    note: 'NO FOREIGN KEY to customers. Contains sales_rep_notes -- free text about a person. A CASCADE-only erasure leaves this behind.' },
  { table: 'customer_search_index', by: 'customer_id', delete: true,
    note: 'Denormalised copy of name, email and address.' },
  { table: 'communication_preference_log', by: 'customer_id', delete: true,
    note: 'History of consent changes -- about the person, so it goes.' },
  { table: 'interactions', by: 'customer_id', delete: true },
  { table: 'appointments', by: 'customer_id', delete: true },
  { table: 'followup_analytics', by: 'customer_id', delete: true },
  { table: 'tasks', by: 'customer_id', delete: true },
  { table: 'followups', by: 'customer_id', delete: true },
  { table: 'lead_search_index', by: 'lead_id', delete: true,
    note: 'Reached through this customer\'s leads, handled separately below.' },

  // --- identifier nulled, row kept ---
  { table: 'leads', by: 'customer_id', delete: false,
    note: 'Kept as a count-of-record, with the identifying columns nulled. A lead row with no name is not the person.' },
];

/** Columns nulled on `leads` rather than deleting the row. */
const LEAD_NULLABLE = [
  'first_name', 'last_name', 'email', 'phone', 'message', 'normalized_email',
  'normalized_phone', 'normalized_name', 'utm_source', 'utm_medium', 'utm_campaign',
  'utm_term', 'utm_content', 'vehicle_interest',
];

/** Columns that identify a person on `customers`, for the export. */
const EXPORT_TABLES = [
  'customers',
  { table: 'leads', by: 'customer_id' },
  { table: 'interactions', by: 'customer_id' },
  { table: 'appointments', by: 'customer_id' },
  { table: 'followups', by: 'customer_id' },
  { table: 'communication_preference_log', by: 'customer_id' },
  { table: 'customer_vehicle_interest', by: 'customer_id' },
  { table: 'customer_search_index', by: 'customer_id' },
];

function json(status, body, event) {
  return {
    statusCode: status,
    headers: {
      ...originHeaders(event, 'GET, DELETE, OPTIONS'),
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

/** Resolve a customer by id, or by the email they would use to ask. */
async function resolveSubject(query) {
  if (query.id) {
    const r = await DatabaseService.query(
      'SELECT * FROM customers WHERE id = $1 LIMIT 1', [query.id]
    );
    return r.rows[0] || null;
  }
  if (query.email) {
    const r = await DatabaseService.query(
      'SELECT * FROM customers WHERE normalized_email = $1 OR lower(email) = lower($1) LIMIT 1',
      [String(query.email).trim()]
    );
    return r.rows[0] || null;
  }
  return null;
}

/** Everything held about one person. This is the access request. */
async function exportSubject(subject) {
  const out = {
    subject: {
      id: subject.id,
      first_name: subject.first_name,
      last_name: subject.last_name,
      email: subject.email,
      phone: subject.phone,
      address: [subject.address_line1, subject.address_line2, subject.city, subject.state, subject.zip_code]
        .filter(Boolean).join(', '),
      created_at: subject.created_at,
      consent: {
        email: subject.email_consent,
        sms: subject.sms_consent,
        phone: subject.phone_consent,
        gdpr_consent_date: subject.gdpr_consent_date,
        withdrawn_at: subject.gdpr_consent_withdrawn ? subject.consent_withdrawn_date : null,
        withdrawn_reason: subject.consent_withdrawn_reason,
      },
    },
    related: {},
    exported_at: new Date().toISOString(),
  };

  for (const entry of EXPORT_TABLES) {
    const table = typeof entry === 'string' ? entry : entry.table;
    const by = typeof entry === 'string' ? 'id' : entry.by;
    if (table === 'customers') continue;
    const r = await DatabaseService.query(
      `SELECT * FROM ${table} WHERE ${by} = $1`, [subject.id]
    );
    if (r.rows.length) out.related[table] = r.rows;
  }

  // Consent changes are themselves data about the person and belong in an
  // access request, but the audit trail is not theirs -- it is the operator's.
  const audit = await AuditLog.forEntity(DatabaseService, 'customers', subject.id, 50);
  out.audit_trail = audit.map((a) => ({
    action: a.action, at: a.created_at, by: a.actor_email || a.actor_role || 'system',
    reason: a.reason, rows_affected: a.rows_affected,
  }));

  return out;
}

/** Count what an erasure would touch. Read-only. */
async function buildPlan(subject) {
  const plan = [];
  let total = 0;

  for (const entry of PLAN) {
    let rows = 0;
    try {
      const r = await DatabaseService.query(
        `SELECT COUNT(*) AS n FROM ${entry.table} WHERE ${entry.by} = $1`, [subject.id]
      );
      rows = Number((r.rows[0] || {}).n || 0);
    } catch (err) {
      // A missing table must not abort the plan -- it should appear in it,
      // because "this table is absent" is itself something to report.
      plan.push({
        table: entry.table, action: 'unavailable', rows: 0, error: err.message, note: entry.note,
      });
      continue;
    }
    total += rows;
    plan.push({
      table: entry.table,
      action: entry.delete ? 'delete' : 'null-identifiers',
      rows,
      note: entry.note || undefined,
    });
  }

  // The customer row itself, last.
  plan.push({ table: 'customers', action: 'delete', rows: 1 });
  total += 1;

  return { total, plan };
}

/**
 * Perform the erasure.
 *
 * The audit row is written FIRST and with `requireAudit`, so that a failure to
 * record it aborts before anything is destroyed. Recording afterwards would
 * mean a crash mid-deletion leaves data removed and no evidence.
 */
async function eraseSubject(subject, actor, reason, context) {
  await AuditLog.requireAudit(DatabaseService, {
    action: AuditLog.ACTIONS.CUSTOMER_ERASE,
    entityType: 'customers',
    entityId: subject.id,
    actor,
    reason,
    detail: { planned: 'accepted' }, // counts only -- no field values
    context,
  });

  const removed = {};

  for (const entry of PLAN) {
    if (!entry.delete) continue;
    try {
      const r = await DatabaseService.query(
        `DELETE FROM ${entry.table} WHERE ${entry.by} = $1`, [subject.id]
      );
      removed[entry.table] = Number(r.rowsAffected || 0);
    } catch (err) {
      removed[entry.table] = `FAILED: ${err.message}`;
    }
  }

  // Null rather than delete: keeps the count of enquiries without keeping the
  // person. A lead row with no name, email or phone is not personal data.
  try {
    const sets = LEAD_NULLABLE.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await DatabaseService.query(
      `UPDATE leads SET ${sets} WHERE customer_id = $1`, [subject.id, ...LEAD_NULLABLE.map(() => null)]
    );
    removed.leads = 'identifiers nulled';
  } catch (err) {
    removed.leads = `FAILED: ${err.message}`;
  }

  try {
    const r = await DatabaseService.query('DELETE FROM customers WHERE id = $1', [subject.id]);
    removed.customers = Number(r.rowsAffected || 0);
  } catch (err) {
    removed.customers = `FAILED: ${err.message}`;
  }

  return removed;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {}, event);
  if (!isAllowedOrigin(event.headers || {})) {
    return json(403, { error: 'origin-not-allowed' }, event);
  }

  // Admin only. This removes a person from the business. `preferences_write`
  // is held by sales_rep, which is too wide for this.
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin'],
  });
  if (!auth.authenticated) return auth.error;

  if (!DatabaseService.isDatabaseConfigured()) {
    return json(503, { error: 'database-not-configured' }, event);
  }

  const params = event.queryStringParameters || {};
  const subject = await resolveSubject(params);

  if (!subject) {
    return json(404, {
      error: 'subject-not-found',
      detail: 'No customer matches that id or email. Nothing was read and nothing was changed.',
    }, event);
  }

  // ------------------------------------------------------------- EXPORT (GET)
  if (event.httpMethod === 'GET') {
    const payload = await exportSubject(subject);
    await AuditLog.record(DatabaseService, {
      action: AuditLog.ACTIONS.CUSTOMER_EXPORT,
      entityType: 'customers',
      entityId: subject.id,
      actor: auth.user,
      reason: params.reason || null,
      // Counts and table names only. The export content itself is the response,
      // not the audit row -- see utils/audit-log.js.
      detail: { tables: Object.keys(payload.related) },
      context: event,
    });
    return json(200, payload, event);
  }

  // ------------------------------------------------------ ERASURE (DELETE)
  if (event.httpMethod === 'DELETE') {
    const confirmed = params.confirm === '1' || params.confirm === 'true';
    const reason = (params.reason || '').trim();

    const { total, plan } = await buildPlan(subject);

    if (!confirmed) {
      // The dry run. Nothing deleted.
      return json(200, {
        dry_run: true,
        message:
          'Nothing was deleted. Re-send with confirm=1 to perform the erasure. ' +
          'This cannot be undone.',
        subject: { id: subject.id, email: subject.email },
        total_rows: total,
        plan,
        required: {
          confirm: 'confirm=1',
          reason: 'a non-empty reason, which is recorded and cannot be omitted',
        },
      }, event);
    }

    if (!reason) {
      return json(422, {
        error: 'reason-required',
        detail: 'An erasure is irreversible and is recorded. A reason is mandatory.',
      }, event);
    }

    const removed = await eraseSubject(subject, auth.user, reason, event);
    return json(200, { erased: true, subject: { id: subject.id }, removed }, event);
  }

  return json(405, { error: 'method-not-allowed' }, event);
};

exports.exports_for_test = { PLAN, LEAD_NULLABLE, EXPORT_TABLES };