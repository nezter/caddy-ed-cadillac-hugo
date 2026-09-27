#!/usr/bin/env node
/**
 * test-turso-schema.js -- run the application's ACTUAL queries against the
 * generated libSQL schema.
 *
 * WHY THIS IS NOT A SYNTAX CHECK
 * ------------------------------
 * A schema that parses is not a schema the application can use. The queries in
 * this codebase name specific columns; a translation that drops one produces a
 * table that creates cleanly and then fails at runtime on a page nobody is
 * testing. So this executes the real statements from sales-login,
 * customer-dashboard, sales-customers and followup-analytics against a real
 * SQLite database built from database/turso/001_core.sql.
 *
 * Run:  node ci/test-turso-schema.js
 * Needs: sqlite3, which the build image has. Exits non-zero on the first failure
 *        so CI stops rather than shipping a schema that cannot answer a query.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'database', 'turso', '001_core.sql');

if (!fs.existsSync(SCHEMA)) {
  console.error(`  schema not generated: ${SCHEMA}`);
  console.error('  run: python3 scripts/pg2turso.py');
  process.exit(2);
}

const db = path.join(os.tmpdir(), `turso-schema-test-${process.pid}.db`);
const cleanup = () => { try { fs.unlinkSync(db); } catch (e) { /* already gone */ } };
process.on('exit', cleanup);

/** Run a statement via Python's sqlite3 module. */
function sql(stmt) {
  const out = execFileSync('python3', ['-c', `
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
try:
    for row in con.execute(sys.argv[2]):
        print('|'.join('' if v is None else str(v) for v in row))
except sqlite3.Error as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`, db, stmt], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return out.trim();
}

// 1. Build the schema from scratch, exactly as a fresh deploy would.
// Apply BOTH migrations in order, the way a fresh deploy would -- through
// Python's sqlite3 module, because the build image has no sqlite3 binary and a
// test that only runs on a developer's laptop is a test that never runs.
const migrations = [
  path.join(ROOT, 'database', 'turso', '001_core.sql'),
  path.join(ROOT, 'database', 'turso', '002_app_columns.sql'),
].filter((f) => fs.existsSync(f));

execFileSync('python3', ['-c', `
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
for f in sys.argv[2:]:
    con.executescript(open(f).read())
con.commit()
`, db, ...migrations], { stdio: ['pipe', 'pipe', 'pipe'] });

const tables = sql(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
).split('\n').filter(Boolean);
const indexes = sql(
  "SELECT count(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';"
);

console.log(`  schema applied: ${tables.length} tables, ${indexes} indexes`);
console.log(`  ${tables.join(' ')}`);
console.log('');

/**
 * Every statement below is taken from the function it is named after, with the
 * same column list. If a translation renames or drops a column, this fails
 * with "no such column" -- which is the exact error a customer would see in
 * production.
 */
const CASES = [
  // sales-login.js -> database-service.getSalesRepByEmail
  ['sales_reps by email',
    "SELECT * FROM sales_reps WHERE email = 'ed@caddyed.com' AND status = 'active';"],

  // customer-dashboard.js -> getCustomerPreferences / SalesRep
  ['customer preferences',
    "SELECT preferences FROM customers WHERE id = 'c1';"],
  ['customer sales rep',
    `SELECT r.name, r.position, r.email, r.phone, r.image
       FROM customers c JOIN sales_reps r ON r.id = c.assigned_sales_rep_id
      WHERE c.id = 'c1';`],

  // customer-dashboard.js -> getCustomerAppointments
  ['customer appointments',
    `SELECT a.id, a.appointment_type, a.scheduled_date, a.scheduled_time,
            a.location, a.status, a.notes, r.name AS sales_rep_name
       FROM appointments a LEFT JOIN sales_reps r ON r.id = a.assigned_sales_rep_id
      WHERE a.customer_id = 'c1'
      ORDER BY a.scheduled_date DESC, a.scheduled_time DESC LIMIT 50;`],

  // customer-dashboard.js -> getCustomerActivity
  ['customer activity',
    `SELECT id, interaction_type, description, notes, created_at
       FROM interactions WHERE customer_id = 'c1'
      ORDER BY created_at DESC LIMIT 10;`],

  // sales-customers.js -> searchCustomers
  ['search customers',
    `SELECT c.*, COUNT(DISTINCT l.id) AS lead_count
       FROM customers c LEFT JOIN leads l ON c.id = l.customer_id
      WHERE c.status = 'active'
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 20 OFFSET 0;`],

  // sales-complete-appointment.js
  ['appointment status',
    "SELECT id, status, lead_id FROM appointments WHERE id = 'a1';"],

  // followup-analytics.js
  ['followup join',
    `SELECT f.id, f.campaign_name, f.scheduled_date, c.first_name, c.last_name
       FROM followups f
       LEFT JOIN customers c ON c.id = f.customer_id
      WHERE f.status = 'pending'
      ORDER BY f.scheduled_date LIMIT 50;`],
  ['followup interaction exists',
    "SELECT 1 FROM interactions WHERE lead_id = 'l1' LIMIT 1;"],

  // An INSERT, because a schema that cannot be written to is not a database.
  ['insert a sales rep',
    `INSERT INTO sales_reps (id, first_name, last_name, email, password_hash, status, permissions)
     VALUES ('r1', 'Caddy', 'Ed', 'ed@caddyed.com', 'x', 'active', 'view_customers,manage_leads');`],
  ['read it back',
    "SELECT email, permissions FROM sales_reps WHERE id = 'r1';"],
  ['insert a customer',
    "INSERT INTO customers (id, first_name, last_name, email, assigned_sales_rep_id, preferences) VALUES ('c1','A','Client','a@b.co','r1','{\"budget_max\":60000}');"],
  ['preferences round-trip',
    "SELECT preferences FROM customers WHERE id = 'c1';"],
  ['a password_hash is storeable',
    "INSERT INTO sales_reps (id, first_name, last_name, email, password_hash) VALUES ('r2','A','B','ab@c.co','$2b$10$abc');"],
];

let failed = 0;
for (const [name, stmt] of CASES) {
  try {
    sql(stmt);
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed += 1;
    const msg = (err.stderr || err.stdout || String(err.message)).toString().trim().split('\n')[0];
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
  }
}

console.log('');
if (failed) {
  console.log(`  ${CASES.length - failed}/${CASES.length} statements ran. ` +
              `${failed} failed -- the schema does not answer the application's queries.`);
  process.exit(1);
}
console.log(`  ${CASES.length}/${CASES.length} real application queries ran against the schema.`);
