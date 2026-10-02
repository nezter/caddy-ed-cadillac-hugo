/**
 * staff-management.js -- /admin/staff. Who can sign in, and what they may do.
 *
 * WHY THIS EXISTS
 * ---------------
 * `sales_reps` is not an inert table. Three separate things depend on it, and
 * all three were silently empty:
 *
 *   1. `utils/inquiry.js` `resolveRecipient()` reads the first active rep with an
 *      admin or sales role and mails enquiries there. With no staff row, every
 *      enquiry recorded correctly and notified nobody.
 *   2. `lead-assignment.js` assigns leads to a rep id. With no rep, every lead
 *      is unassigned.
 *   3. Consent. `customers.email_consent` is set by `sales-customers.js` from
 *      staff input and by `communication-preferences.js` when a customer opts in.
 *      With no staff, the first of those has no UI.
 *
 * So "add a user" was on the critical path to the site being able to notify
 * anybody, and there was no way to do it from the site.
 *
 * WHY IT IS A VIEW AND NOT AN ACCOUNT SYSTEM
 * -----------------------------------------
 * Netlify Identity owns authentication. This file owns the application's record
 * of a person: their name, role, permissions and whether they are active.
 *
 * It CANNOT create a sign-in. That is deliberate and it is the one thing an
 * administrator must understand before using this page:
 *
 *   Adding a row here does not let anybody in. It says "this person exists and
 *   may do these things", for a person who has already signed up through
 *   Netlify Identity.
 *
 * A new member of staff signs up at the Identity invite URL, signs in once, and
 * `ensureStaffProfile()` provisions a row keyed on the Identity `sub`. This page
 * then sets their role. Getting that order wrong produces an account with no
 * permissions, which is why the page says it on the row itself.
 *
 * DEACTIVATION IS NOT DELETION
 * ----------------------------
 * `status = 'inactive'` stops the person being counted as staff, excluded from
 * `resolveRecipient()`, and refused by functions that check status. The row
 * survives, because leads assigned to them, calendar tokens, and audit entries
 * all reference it -- and because `audit_log.actor_id` is ON DELETE SET NULL
 * precisely so history outlives an account.
 */

'use strict';

const DatabaseService = require('./utils/database-service');
const StaffProfile = require('./utils/staff-profile');
const AuditLog = require('./utils/audit-log');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders, isAllowedOrigin } = require('./utils/cors-middleware');

/** Roles this application understands, and what each may do. */
const ROLES = [
  { id: 'admin', label: 'Admin', note: 'Everything, including erasing customer data.' },
  { id: 'manager', label: 'Manager', note: 'Everything except erasing customers.' },
  { id: 'sales_rep', label: 'Sales rep', note: 'Leads, campaigns, interactions, preferences.' },
  { id: 'viewer', label: 'Viewer', note: 'Nothing by default. Grants nothing until set below.' },
];

const ROLE_IDS = new Set(ROLES.map((r) => r.id));

/**
 * Statuses. 'inactive' is the important one.
 *
 * 'suspended' is separate from 'inactive' so that "left the business" and
 * "locked out pending investigation" are different records. Both are excluded
 * from resolveRecipient(); only the reason differs.
 */
const STATUSES = ['active', 'inactive', 'suspended'];

function json(status, body, event) {
  return {
    statusCode: status,
    headers: { ...originHeaders(event, 'GET, PUT, POST, OPTIONS'), 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

/**
 * Columns safe to show and edit.
 *
 * An allowlist, so this endpoint cannot become a general-purpose write to
 * `sales_reps` -- a table that holds an account's role and permissions. Adding
 * a column to the table must not silently make it editable here.
 */
const EDITABLE = {
  first_name: (v) => (v === null || v === undefined ? '' : String(v).slice(0, 120)),
  last_name: (v) => (v === null || v === undefined ? '' : String(v).slice(0, 120)),
  phone: (v) => (v ? String(v).slice(0, 40) : null),
  role: (v) => {
    const r = String(v || '').trim();
    if (!ROLE_IDS.has(r)) throw new Error(`role must be one of ${[...ROLE_IDS].join(', ')}`);
    return r;
  },
  status: (v) => {
    const s = String(v || '').trim();
    if (!STATUSES.includes(s)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
    return s;
  },
  department: (v) => (v ? String(v).slice(0, 80) : null),
  position: (v) => (v ? String(v).slice(0, 120) : null),
  monthly_sales_target: (v) => (v ? String(v).slice(0, 40) : null),
  // permissions is a comma-joined list in the schema, not JSON.
  permissions: (v) => {
    const list = Array.isArray(v) ? v : String(v || '').split(',');
    const clean = list.map((p) => String(p).trim()).filter(Boolean);
    const unknown = clean.filter((p) => !StaffProfile.ALL_PERMISSIONS.includes(p));
    if (unknown.length) {
      // Refused rather than stored: a permission that matches nothing reads as
      // granted in the UI and does nothing at the function, which is how a rep
      // ends up with a 403 and no explanation.
      throw new Error(`unknown permission(s): ${unknown.join(', ')}`);
    }
    return clean.join(',');
  },
};

function rowOut(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    department: row.department,
    position: row.position,
    permissions: String(row.permissions || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    last_login: row.last_login,
    created_at: row.created_at,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {}, event);
  if (!isAllowedOrigin(event.headers || {})) {
    return json(403, { error: 'origin-not-allowed' }, event);
  }

  // Admin only. This changes who can reach customer data.
  const auth = await authenticateRequest(event, { requireAuth: true, allowedRoles: ['admin'] });
  if (!auth.authenticated) return auth.error;

  if (!DatabaseService.isDatabaseConfigured()) {
    return json(503, { error: 'database-not-configured' }, event);
  }

  // ------------------------------------------------------------------- GET
  if (event.httpMethod === 'GET') {
    const result = await DatabaseService.query(
      `SELECT * FROM sales_reps ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
         last_name, first_name`
    );
    const rows = result.rows || [];

    // Reported rather than assumed, because the two failures look identical to
    // whoever is looking: "nobody can sign in" and "nobody has signed in yet".
    const activeCount = rows.filter((r) => r.status === 'active').length;

    return json(200, {
      staff: rows.map(rowOut),
      counts: {
        total: rows.length,
        active: activeCount,
        inactive: rows.filter((r) => r.status !== 'active').length,
      },
      // This is the thing that silently broke enquiry notification, so it is
      // said plainly on the page rather than left to be discovered.
      notifyWarning: activeCount === 0
        ? 'No active staff member. resolveRecipient() will find nobody, so every enquiry ' +
          'will be recorded and emailed to nobody. Set EMAIL_TO as a fallback, or activate a rep.'
        : null,
      roles: ROLES,
      statuses: STATUSES,
      allPermissions: StaffProfile.ALL_PERMISSIONS,
      permissionsByRole: StaffProfile.PERMISSIONS_BY_ROLE,
      editable: Object.keys(EDITABLE),
    }, event);
  }

  // ------------------------------------------------------------------- PUT
  if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'invalid-json' }, event);
    }

    const id = body.id;
    if (!id) return json(422, { error: 'id-required' }, event);

    const existing = await DatabaseService.query(
      'SELECT * FROM sales_reps WHERE id = $1 LIMIT 1', [String(id)]
    );
    const row = existing.rows && existing.rows[0];
    if (!row) return json(404, { error: 'staff-not-found' }, event);

    const sets = [];
    const params = [];
    const problems = {};

    for (const [field, coerce] of Object.entries(EDITABLE)) {
      if (!(field in body)) continue;
      let value;
      try {
        value = coerce(body[field]);
      } catch (err) {
        problems[field] = err.message;
        continue;
      }
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    }

    if (Object.keys(problems).length) {
      return json(422, { error: 'validation-failed', problems }, event);
    }
    if (!sets.length) return json(422, { error: 'nothing-to-change' }, event);

    // The safety check that matters, and it is refused rather than warned about.
    //
    // Demoting or deactivating the LAST active admin would leave nobody able to
    // reach this page again -- no interface to undo it, and every function in
    // this project refuses a request without an admin. It is a one-request,
    // self-inflicted lockout with no recovery path short of the database.
    const willBeActiveAdmin =
      String(body.role ?? row.role) === 'admin' && String(body.status ?? row.status) === 'active';
    if (!willBeActiveAdmin && row.role === 'admin' && row.status === 'active') {
      const admins = await DatabaseService.query(
        "SELECT COUNT(*) AS n FROM sales_reps WHERE role = 'admin' AND status = 'active'"
      );
      if (Number((admins.rows[0] || {}).n || 0) <= 1) {
        return json(409, {
          error: 'last-admin',
          detail:
            'This is the only active admin. Demoting or deactivating it would leave nobody ' +
            'able to reach this page, with no way to undo it except in the database.',
        }, event);
      }
    }

    params.push(String(id));
    const before = {
      role: row.role,
      status: row.status,
      permissions: row.permissions,
    };

    await DatabaseService.query(
      `UPDATE sales_reps SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = $${params.length}`,
      params
    );

    await AuditLog.record(DatabaseService, {
      action: 'staff.update',
      entityType: 'sales_reps',
      entityId: String(id),
      actor: auth.user,
      reason: body.reason || null,
      detail: { before, after: { ...body } },
      context: event,
    });

    const after = await DatabaseService.query(
      'SELECT * FROM sales_reps WHERE id = $1 LIMIT 1', [String(id)]
    );
    return json(200, { saved: true, staff: rowOut(after.rows[0]) }, event);
  }

  return json(405, { error: 'method-not-allowed' }, event);
};

// 'staff.update' is not in the closed vocabulary yet; register it here rather
// than widening audit-log.js from a second module.
AuditLog.registerAction('staff.update');

exports.exports_for_test = { EDITABLE, ROLES, STATUSES, rowOut };