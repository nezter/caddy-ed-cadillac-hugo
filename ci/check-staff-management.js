#!/usr/bin/env node
/**
 * check-staff-management.js -- the staff list cannot lock everybody out.
 *
 * WHY THIS EXISTS
 * ---------------
 * `sales_reps` had no interface. It is not an inert table: `resolveRecipient()`
 * reads it to decide where enquiries are emailed, `lead-assignment` reads it to
 * assign leads, and `communication-preferences` writes consent against it. With
 * no staff rows, every enquiry was recorded correctly and emailed to nobody --
 * which looks exactly like a quiet week.
 *
 * Adding the interface introduced a way to break the site from inside it, and
 * that is what this file is about. A page that edits roles and statuses can, in
 * one request, demote or deactivate the last admin -- after which every
 * function in this project returns 403, nobody can reach the page again to undo
 * it, and the only recovery is a SQL statement typed by hand.
 *
 * That is a self-inflicted lockout with no undo, and it is one dropdown away.
 *
 * WHAT IT CHECKS
 * --------------
 *   - demoting the only active admin is refused, and nothing is written
 *   - deactivating the only active admin is refused, and nothing is written
 *   - with a second admin present, the same operation IS allowed
 *   - the change is audited when it is allowed
 *   - an unknown role or permission is refused rather than stored
 *   - an unknown id 404s instead of creating a row
 *   - `password_hash` is never returned
 *   - the endpoint reports when nobody is active to receive enquiries
 *   - unauthenticated reads AND writes are refused
 *
 * Run:  node ci/check-staff-management.js
 * Needs no database. DatabaseService and auth-middleware are stubbed; every
 * line of staff-management.js is the real one.
 */

'use strict';

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

/* --------------------------------------------------------------- the stubs */

let REPS = [];
const auditWrites = [];

const FakeDB = {
  isDatabaseConfigured: () => true,
  query: async (sql, params) => {
    if (/FROM sales_reps WHERE id = \$1/.test(sql)) {
      return { rows: REPS.filter((r) => r.id === params[0]) };
    }
    if (/SELECT \* FROM sales_reps ORDER BY/.test(sql)) return { rows: REPS };
    if (/COUNT\(\*\) AS n FROM sales_reps/.test(sql)) {
      return {
        rows: [{ n: REPS.filter((r) => r.role === 'admin' && r.status === 'active').length }],
      };
    }
    if (/UPDATE sales_reps SET/.test(sql)) {
      const rep = REPS.find((r) => r.id === params[params.length - 1]);
      if (rep) {
        for (const m of sql.matchAll(/(\w+) = \$(\d+)/g)) rep[m[1]] = params[Number(m[2]) - 1];
      }
      return { rows: [] };
    }
    if (/INSERT INTO audit_log/.test(sql)) { auditWrites.push(params); return { rows: [] }; }
    return { rows: [] };
  },
};

let AUTH = {
  authenticated: true,
  user: { id: 'sub-1', email: 'ed@caddyed.com', role: 'admin', permissions: ['preferences_write'] },
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './utils/database-service') return FakeDB;
  if (request === './utils/auth-middleware') return { authenticateRequest: async () => AUTH };
  return origLoad.apply(this, arguments);
};

const handler = require(path.join(FN, 'staff-management.js')).handler;
Module._load = origLoad;

const call = (o) =>
  handler(Object.assign({
    headers: { origin: 'https://caddyed.com' },
    httpMethod: 'GET',
    queryStringParameters: {},
  }, o));

/** statusCode is on the envelope; body fields are the payload. */
const body = async (o) => {
  const r = await call(o);
  return Object.assign(JSON.parse(r.body), { statusCode: r.statusCode });
};

const rep = (over) => Object.assign({
  id: 'sub-x', first_name: 'A', last_name: 'B', email: 'a@b.com',
  role: 'sales_rep', status: 'active', permissions: 'view_leads',
}, over);

/* ---------------------------------------------------------------- the checks */

(async () => {
  // --- reads
  REPS = [rep({ id: 'sub-1', role: 'admin' }), rep({ id: 'sub-2' })];
  let r = await body();
  check('GET lists staff', r.staff.length === 2, `${r.counts.active} active`);
  check(
    'password_hash is never returned',
    !r.staff.some((s) => 'password_hash' in s),
    'this endpoint edits the table that holds an account record'
  );
  check(
    'no warning is shown while somebody is active to receive enquiries',
    r.notifyWarning === null,
    'the warning must not cry wolf'
  );

  // --- THE LOCKOUT
  REPS = [rep({ id: 'sub-1', role: 'admin' })];
  r = await body({ httpMethod: 'PUT', body: JSON.stringify({ id: 'sub-1', role: 'manager' }) });
  check(
    'demoting the ONLY active admin is refused',
    r.statusCode === 409 && r.error === 'last-admin',
    `got ${r.statusCode} ${r.error || ''}`
  );
  check('  ...and nothing was written', REPS[0].role === 'admin', `role is still ${REPS[0].role}`);

  r = await body({ httpMethod: 'PUT', body: JSON.stringify({ id: 'sub-1', status: 'inactive' }) });
  check(
    'deactivating the ONLY active admin is refused',
    r.statusCode === 409 && r.error === 'last-admin'
  );
  check('  ...and nothing was written', REPS[0].status === 'active');

  // --- the same operation is fine when it is safe
  REPS = [rep({ id: 'sub-1', role: 'admin' }), rep({ id: 'sub-3', role: 'admin' })];
  auditWrites.length = 0;
  r = await body({ httpMethod: 'PUT', body: JSON.stringify({ id: 'sub-1', role: 'manager' }) });
  check(
    'with a second active admin, demotion IS allowed',
    r.statusCode === 200 && r.saved === true,
    'a guard that refuses always is not a guard, it is an outage'
  );
  check(
    'an allowed change is audited',
    auditWrites.length === 1 && auditWrites[0][4] === 'staff.update',
    `audit action: ${auditWrites[0] && auditWrites[0][4]}`
  );

  // --- the warning
  REPS = [rep({ id: 'sub-1', role: 'admin', status: 'inactive' })];
  r = await body();
  check(
    'with nobody active, the page says enquiries will be emailed to nobody',
    Boolean(r.notifyWarning) && /emailed to nobody/.test(r.notifyWarning),
    'this is the failure that looks like a quiet week'
  );

  // --- validation
  REPS = [rep({ id: 'sub-9', role: 'admin' })];
  r = await body({ httpMethod: 'PUT', body: JSON.stringify({ id: 'sub-9', role: 'wizard' }) });
  check('an unknown role is refused', r.statusCode === 422 && Boolean(r.problems.role));

  r = await body({
    httpMethod: 'PUT',
    body: JSON.stringify({ id: 'sub-9', permissions: 'view_leads,not_a_permission' }),
  });
  check(
    'an unknown permission is refused rather than stored',
    r.statusCode === 422 && /not_a_permission/.test(r.problems.permissions),
    'a permission matching nothing reads as granted in the UI and 403s at the function'
  );

  r = await body({ httpMethod: 'PUT', body: JSON.stringify({ id: 'ghost', role: 'admin' }) });
  check(
    'an unknown id 404s instead of creating a row',
    r.statusCode === 404 && r.error === 'staff-not-found',
    'this endpoint must not be able to mint an account'
  );

  r = await body({
    httpMethod: 'PUT',
    body: JSON.stringify({ id: 'sub-9', permissions: ['view_leads', 'manage_leads'] }),
  });
  check(
    'permissions round-trip as the comma list the TEXT column stores',
    r.statusCode === 200 && Array.isArray(r.staff.permissions),
    JSON.stringify(r.staff.permissions)
  );

  // --- authentication, both verbs
  AUTH = { authenticated: false, error: { statusCode: 401, body: '{}' } };
  let env = await call({ httpMethod: 'PUT', body: JSON.stringify({ id: 'sub-9', role: 'admin' }) });
  check('an unauthenticated write is refused', env.statusCode === 401);
  env = await call();
  const parsed = JSON.parse(env.body);
  check(
    'an unauthenticated read is refused too',
    env.statusCode === 401 && parsed.staff === undefined,
    'the page needs the data, but a staff roster is still staff data'
  );

  /* -------------------------------------------------------------- report */

  console.log('');
  for (const r of results) {
    console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.label}${r.detail ? `   (${r.detail})` : ''}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log('');
  if (!failed.length) {
    console.log('  OK: the staff list can be edited, and it cannot lock everybody out.');
    process.exit(0);
  }
  console.error('  THE STAFF PAGE CAN LOCK EVERY ADMINISTRATOR OUT OF THE SITE.');
  console.error('  One request, and the only recovery is a SQL statement by hand.');
  process.exit(1);
})();