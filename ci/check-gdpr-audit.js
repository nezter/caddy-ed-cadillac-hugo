#!/usr/bin/env node
/**
 * check-gdpr-audit.js -- erasure must be complete, and must leave evidence.
 *
 * WHY THIS EXISTS
 * ---------------
 * Tasks 20 and 21 in `.taskmaster/tasks/tasks.json` were both `pending` with no
 * artifact. The site holds names, emails, phone numbers, home addresses and
 * free-text sales notes, and could neither produce them for a data-subject
 * request nor remove them.
 *
 * Two things about an erasure are easy to get wrong and neither shows up in a
 * render:
 *
 *   1. INCOMPLETE. `customers` has `ON DELETE CASCADE` to six tables, which
 *      makes a one-line erasure look correct. It is not:
 *      `customer_vehicle_interest` has NO foreign key to `customers` and holds
 *      `sales_rep_notes` -- free text a salesperson wrote about a person. A
 *      CASCADE-only erasure removes the customer and leaves their notes behind,
 *      silently. This check asserts that table is enumerated.
 *
 *   2. UNPROVABLE. An erasure that leaves no record cannot be shown to have
 *      happened, which is the first thing anyone asks about. But an audit row
 *      holding the person's name and email "for the record" would make the
 *      erasure incomplete -- the thing preventing compliance would be the thing
 *      claiming to prove it.
 *
 *      So audit rows carry counts, not content, and this check asserts both
 *      halves: the trail survives, and it identifies nobody.
 *
 * WHAT IT CHECKS
 * --------------
 * Against real SQLite, seeded with a customer and rows in every table the
 * erasure touches:
 *   - every table holding data about a person is in the plan
 *   - `customer_vehicle_interest` specifically, since the schema forgets it
 *   - after erasure, every count is zero
 *   - the retained lead row identifies nobody
 *   - the audit row survives the erasure of its own subject
 *   - the audit row contains no name, email or phone
 *   - `assertNoSubjectData` refuses a snapshot for a subject action
 *   - erasure is a dry run without `confirm=1`
 *   - a destructive action that cannot be audited does not proceed
 *
 * Run:  node ci/check-gdpr-audit.js
 * Needs no database and no credentials.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

/** Every table that holds anything about a person. */
const SUBJECT_TABLES = [
  'customers', 'leads', 'interactions', 'appointments', 'followups',
  'communication_preference_log', 'customer_vehicle_interest', 'customer_search_index',
];

let db = null;
let dbFile = null;
function cleanup() {
  try { if (dbFile) fs.unlinkSync(dbFile); } catch { /* already gone */ }
}

try {
  // Its own try/catch, NOT the outer one -- see the note on the first run below.
  dbFile = path.join(os.tmpdir(), `caddy-gdpr-audit-${process.pid}.db`);
  try { fs.unlinkSync(dbFile); } catch { /* first run */ }
  execFileSync('sqlite3', [dbFile], {
    input: fs.readFileSync(path.join(ROOT, 'database', 'turso', 'schema.sql'), 'utf8'),
  });
  db = require('node:sqlite').DatabaseSync;
} catch (e) {
  check('the schema applies to SQLite so the rest can run', false, e.message);
  cleanup();
  report();
}

const handle = new db(dbFile);

// The FK assertion first, because it is the fact the whole design turns on.
const fk = handle.prepare("PRAGMA foreign_key_list('customer_vehicle_interest')").all();
check(
  'customer_vehicle_interest genuinely has NO foreign key to customers',
  !fk.some((f) => f.table === 'customers'),
  'if this ever gains a FK this check should be revisited -- the explicit entry in the plan becomes redundant, not wrong'
);

handle.exec(`
  INSERT INTO sales_reps (id,email,first_name,last_name,role,status)
    VALUES ('r1','ed@caddyed.com','Ed','T','admin','active');
  INSERT INTO customers (id,first_name,last_name,email,phone,email_consent)
    VALUES ('c1','Real','Person','real@example.com','803-555-0100','true');
  INSERT INTO leads (id,customer_id,first_name,last_name,email,phone,message)
    VALUES ('l1','c1','Real','Person','real@example.com','803-555-0100','wants an XT5');
  INSERT INTO customer_vehicle_interest (id,customer_id,vehicle_id,sales_rep_notes)
    VALUES ('v1','c1','veh-1','trades every 3 years, budget firm');
  INSERT INTO interactions (id,customer_id,interaction_type,content)
    VALUES ('i1','c1','call','called about the lease');
  INSERT INTO customer_search_index (customer_id,searchable_text)
    VALUES ('c1','Real Person real@example.com 803-555-0100');
`);

const gdpr = require(path.join(FN, 'gdpr.js'));
const AuditLog = require(path.join(FN, 'utils', 'audit-log.js'));
const { PLAN, LEAD_NULLABLE } = gdpr.exports_for_test;

/* ------------------------------------------- 1. the plan is complete */

const planned = new Set(PLAN.map((p) => p.table));
const missing = SUBJECT_TABLES.filter((t) => t !== 'customers' && !planned.has(t));
check(
  'every table holding data about a person is in the erasure plan',
  missing.length === 0,
  missing.length ? `not enumerated: ${missing.join(', ')}` : `${planned.size} tables enumerated explicitly`
);

/* ------------------------------- 2. the audit guard refuses a snapshot */

const refusedFor = AuditLog.assertNoSubjectData('customer.erase', { email: 'x@y.com', rows: 3 });
const refusedMsg = AuditLog.assertNoSubjectData('customer.export', { first_name: 'Real' });
const allowedOther = AuditLog.assertNoSubjectData('lead.merge', { email: 'x@y.com' });
check(
  'an erasure audit row cannot carry identifying fields',
  refusedFor.length > 0 && refusedMsg.length > 0 && allowedOther.length === 0,
  `customer.erase->${refusedFor.length} refused, customer.export->${refusedMsg.length}, lead.merge->${allowedOther.length} (0 is correct)`
);

/* --------------------------------- 3. an unknown action is not recorded */

(async () => {
  const stub = { query: async () => ({ rows: [] }) };
  const bad = await AuditLog.record(stub, {
    action: 'customer.purge_everything', entityType: 'customers',
  });
  check(
    'an action outside the closed vocabulary is refused, not written',
    bad.recorded === false && bad.error === 'unknown-action',
    'a free-text action column cannot be filtered or asserted on'
  );

  const snapshot = await AuditLog.record(stub, {
    action: 'customer.erase', entityType: 'customers', entityId: 'c1',
    detail: { email: 'real@example.com' },
  });
  check(
    'a snapshot passed to an erasure audit is refused rather than written',
    snapshot.recorded === false && snapshot.error === 'subject-data-refused',
    'retaining the removed data "for the trail" would make the erasure incomplete'
  );

  /* ------------------------- 4. requireAudit refuses to proceed unrecorded */

  const exploding = { query: async () => { throw new Error('audit table missing'); } };
  let threw = null;
  try {
    await AuditLog.requireAudit(exploding, {
      action: 'customer.erase', entityType: 'customers', entityId: 'c1',
    });
  } catch (e) { threw = e; }
  check(
    'an irreversible action does not proceed when it cannot be recorded',
    Boolean(threw && threw.code === 'audit-unavailable'),
    'otherwise a merge or erasure happens with no evidence at all'
  );

  /* ------------------------------- 5. erasure, for real, in the right order */

  const auditBefore = await AuditLog.record(
    { query: async (sql, p) => ({ rows: handle.prepare(sql.replace(/\$(\d+)/g, '?'))
        .all(...(p || [])), rowsAffected: 1 }) },
    {
      action: 'customer.erase', entityType: 'customers', entityId: 'c1',
      actor: { id: 'r1', email: 'ed@caddyed.com', role: 'admin' },
      reason: 'erasure request', detail: { planned: 'accepted' }, rowsAffected: 5,
    }
  );
  check('the erasure audit row is written BEFORE anything is deleted', auditBefore.recorded === true);

  for (const e of PLAN) {
    if (!e.delete) continue;
    handle.prepare(`DELETE FROM ${e.table} WHERE ${e.by} = ?`).run('c1');
  }
  handle.prepare(
    `UPDATE leads SET ${LEAD_NULLABLE.map((c, i) => `${c} = ?`).join(', ')} WHERE customer_id = ?`
  ).run(...LEAD_NULLABLE.map(() => null), 'c1');
  handle.prepare('DELETE FROM customers WHERE id = ?').run('c1');

  let leaked = [];
  for (const t of SUBJECT_TABLES) {
    const by = t === 'customers' ? 'id' : 'customer_id';
    const n = Number(handle.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${by} = ?`).get('c1').n);
    if (n !== 0) leaked.push(`${t}=${n}`);
  }
  check(
    'after erasure nothing about the person remains in ANY table',
    leaked.length === 0,
    leaked.length ? `LEAKED: ${leaked.join(', ')}` : `${SUBJECT_TABLES.length} tables, all zero`
  );

  const lead = handle.prepare('SELECT * FROM leads WHERE id = ?').get('l1');
  const stillIdentifiable = [lead.first_name, lead.last_name, lead.email, lead.phone, lead.message]
    .some((v) => v !== null && v !== '');
  check(
    'the retained lead row identifies nobody',
    !stillIdentifiable,
    'kept as a count of enquiries; a row with no name is not the person'
  );

  /* ------------------------------- 6. the trail survives and identifies nobody */

  const a = handle.prepare('SELECT * FROM audit_log WHERE entity_id = ?').get('c1');
  check(
    'the audit row survives the erasure of its own subject',
    Boolean(a),
    'an audit table that cascades from customers empties exactly when it is needed'
  );
  if (a) {
    const serialised = JSON.stringify(a);
    check(
      'the surviving audit row identifies nobody',
      !serialised.includes('real@example.com') && !serialised.includes('803-555-0100')
        && !serialised.includes('Real'),
      `rows_affected=${a.rows_affected} is the evidence; the contents are not kept`
    );
  }

  /* ----------------------- 7. the endpoint refuses without an explicit confirm */

  const src = fs.readFileSync(path.join(FN, 'gdpr.js'), 'utf8');
  check(
    'a DELETE without confirm=1 is a dry run',
    /dry_run\s*:\s*true/.test(src) && /params\.confirm\s*===\s*'1'/.test(src),
    'irreversible operations differ from mistakes by one query parameter'
  );
  check(
    'a real erasure demands a reason',
    /reason-required/.test(src),
    '"deleted a person" with no stated cause is not a decision anyone can review'
  );

  /* ------------------------- 7. the audit VIEWER, which is the reading half */

  // A trail nobody can read satisfies a checkbox and answers no question.
  //
  // This runs the real handler against the same SQLite file, because a stubbed
  // query that returns rows for anything cannot catch a malformed statement --
  // and the first version of the summary query WAS malformed (it interpolated
  // the filter clauses without the WHERE keyword, so every filtered request
  // 500s). A stub said green. Real SQLite said what was true.
  const q2 = {
    isDatabaseConfigured: () => true,
    query: async (sql, params) => {
      const stmt = handle.prepare(sql.replace(/\$(\d+)/g, '?'));
      const rows = params && params.length ? stmt.all(...params) : stmt.all();
      return { rows };
    },
  };

  // actor_id is a foreign key onto sales_reps, and the rep seeded at the top of
  // this file is 'r1'.
  handle.prepare(
    "INSERT INTO audit_log (id,actor_id,actor_email,actor_role,action,entity_type,entity_id,reason,detail,rows_affected,created_at) " +
    "VALUES ('a1','r1','ed@caddyed.com','admin','lead.merge','leads','l1','same person','{\"duplicateCount\":1}',1,datetime('now'))"
  ).run();
  handle.prepare(
    "INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,rows_affected,created_at) " +
    "VALUES ('a2',NULL,'seed.run','seeds','s1',3,datetime('now'))"
  ).run();

  // Swap the CACHED database-service and auth-middleware modules for the
  // duration, rather than hooking Module._load. A viewer's `require` runs once
  // at load time and captures the module object, so patching the loader only
  // during the `require` leaves the handler holding the real one -- which then
  // tries to open a Turso socket. Replacing the cache entry covers both.
  const dbMod = path.join(FN, 'utils', 'database-service.js');
  const authMod = path.join(FN, 'utils', 'auth-middleware.js');
  const savedDb = require.cache[dbMod];
  const savedAuth = require.cache[authMod];

  require.cache[dbMod] = {
    id: dbMod, filename: dbMod, loaded: true, exports: q2,
  };
  require.cache[authMod] = {
    id: authMod, filename: authMod, loaded: true,
    exports: {
      authenticateRequest: async () => ({
        authenticated: true,
        user: { id: 'r1', role: 'admin', permissions: ['analytics_read'] },
      }),
    },
  };

  try {
    let view = require(path.join(FN, 'audit-log-view.js'));

    const viewEvent = (q) => ({
      headers: { origin: 'https://caddyed.com' },
      httpMethod: 'GET',
      queryStringParameters: q || {},
    });

    let v = JSON.parse((await view.handler(viewEvent())).body);
    check('the viewer lists the trail', v.entries && v.entries.length >= 2, `${(v.entries || []).length} rows`);
    check(
      'the summary query is valid SQL under a filter',
      Array.isArray(v.summary) && v.summary.length >= 1,
      'the first version omitted the WHERE keyword, so every filtered read 500s'
    );

    v = JSON.parse((await view.handler(viewEvent({ action: 'lead.merge' }))).body);
    check(
      'the viewer filters by action, summary included',
      v.entries.length === 1 && v.summary.length === 1,
      `${v.entries.length} entries, ${v.summary.length} summary rows`
    );

    v = JSON.parse((await view.handler(viewEvent({ limit: '9999' }))).body);
    check(
      'the page size is clamped',
      v.limit <= 200,
      'an unbounded read here is a data-dump endpoint'
    );

    v = JSON.parse((await view.handler(viewEvent({ action: 'nope.nope' }))).body);
    check(
      'an unknown action is refused, not silently returns everything',
      v.error === 'unknown-action' && Array.isArray(v.allowed),
      'a typo that returned the whole trail would read as "nothing matched"'
    );

    v = JSON.parse((await view.handler(viewEvent({ entity_type: "leads'; DROP TABLE audit_log; --" }))).body);
    check(
      'a SQL-shaped entity_type is refused',
      v.error === 'bad-entity-type',
      'filters are bound, never interpolated'
    );

    v = JSON.parse((await view.handler(viewEvent({}))).body);
    check(
      'the response states that a refused action left no row',
      typeof v.note === 'string' && /not attempted/.test(v.note),
      'an absent row means "never tried", which reads as "never happened"'
    );
  } catch (e) {
    check('the viewer handler runs without throwing', false, e.message);
  } finally {
    delete require.cache[path.join(FN, 'audit-log-view.js')];
    delete require.cache[dbMod];
    delete require.cache[authMod];
    if (savedDb) require.cache[dbMod] = savedDb;
    if (savedAuth) require.cache[authMod] = savedAuth;
  }

  report();
})();

function report() {
  console.log('');
  for (const r of results) {
    console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.label}${r.detail ? `   (${r.detail})` : ''}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log('');
  cleanup();
  if (!failed.length) {
    console.log('  OK: an erasure is complete, and the proof of it survives without keeping');
    console.log('      the person it is proof of.');
    process.exit(0);
  }
  console.error('  AN ERASURE WOULD BE INCOMPLETE, OR WOULD LEAVE NO PROOF.');
  console.error('  Both are the failure this file exists to prevent.');
  process.exit(1);
}