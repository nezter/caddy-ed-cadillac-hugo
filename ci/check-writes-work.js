#!/usr/bin/env node
/**
 * check-writes-work.js -- prove that an UPDATE actually updates.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * libSQL, like SQLite, binds `$1`-style placeholders correctly only when they
 * appear in ASCENDING order. The ordinary shape of an UPDATE in this codebase is
 *
 *     UPDATE booking_requests
 *        SET status = $2, phone = $3
 *      WHERE id = $1
 *
 * read in the order 2, 3, 1. libSQL binds $1 to the first value it encounters --
 * the value of `status` -- and matches `WHERE id = 'synced'`. Zero rows.
 *
 * AND IT DOES NOT RAISE. The statement succeeds. The function returns normally.
 * The log shows a query that looks fine. A booking will not mark itself synced
 * however many times it is asked, and nothing anywhere says why.
 *
 * This is the worst shape a database bug can have, and it is invisible to every
 * check that does not perform the write. Which is why this check performs the
 * write.
 *
 * WHY A DATABASE AND NOT A PARSER
 * ------------------------------
 * A static check can find the four statements where the SQL is a literal. It
 * cannot see the six places that BUILD the SQL at runtime from a list of allowed
 * field names -- `SET ${updateFields.join(', ')} WHERE id = $1` -- which is most
 * of the dangerous ones. And a static check would have to model the driver's
 * binding rules to be right. Running the statement is both simpler and more
 * honest: it asks the question that actually matters, which is "does this
 * statement do what it says".
 *
 * It covers the four shapes that matter:
 *   descending $n   SET before WHERE, id in $1        -- the silent one
 *   repeated $1     the same argument used twice
 *   ascending $n    the normal case, must not regress
 *   a literal       no placeholders at all
 *
 * Run:  node ci/check-writes-work.js
 * Needs: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Exits non-zero on failure.
 */

'use strict';

const path = require('path');

const FUNCTIONS = path.join(path.resolve(__dirname, '..'), 'netlify', 'functions');
const DatabaseService = require(path.join(FUNCTIONS, 'utils', 'database-service'));

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('  SKIPPED: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set.');
  console.error('  This check has to perform real writes, so there is nothing to');
  console.error('  substitute for the database.');
  process.exit(1);
}

const ID = 'gate-writes-work-probe';
const EMAIL = 'gate-writes-work@example.invalid';

async function main() {
  const results = [];
  const check = (label, pass, detail) => results.push({ label, pass, detail });

  // Silence the per-query log; this check makes a lot of queries.
  const realLog = console.log;
  const realError = console.error;
  console.log = () => {};
  console.error = () => {};

  try {
    await DatabaseService.query('DELETE FROM booking_requests WHERE id = ?', [ID]);
    await DatabaseService.query(
      `INSERT INTO booking_requests (id, status, full_name, phone)
       VALUES ($1, 'new', 'Ed Caddy', '803-431-6180')`,
      [ID]
    );

    // --- the silent one -------------------------------------------------
    const desc = await DatabaseService.query(
      'UPDATE booking_requests SET status = $2, phone = $3 WHERE id = $1 RETURNING id',
      [ID, 'synced', '555-0100']
    );
    check(
      'descending $n updates the row (SET uses $2/$3, WHERE uses $1)',
      desc.rows.length === 1,
      `matched ${desc.rows.length} row(s)`
    );

    const after = await DatabaseService.query(
      'SELECT status, phone FROM booking_requests WHERE id = ?',
      [ID]
    );
    check(
      '...and writes the intended values, not the wrong argument',
      after.rows[0] && after.rows[0].status === 'synced' && after.rows[0].phone === '555-0100',
      JSON.stringify(after.rows[0])
    );

    // --- repeated placeholder -------------------------------------------
    const rep = await DatabaseService.query(
      'SELECT id FROM booking_requests WHERE id = $1 OR id = $1 LIMIT 1',
      [ID]
    );
    check('repeated $1 binds the same argument to both', rep.rows.length === 1, `${rep.rows.length} row(s)`);

    // --- ascending must not regress -------------------------------------
    const asc = await DatabaseService.query(
      'UPDATE booking_requests SET phone = $1 WHERE id = $2 RETURNING id',
      ['555-0101', ID]
    );
    check('ascending $n still works', asc.rows.length === 1, `matched ${asc.rows.length} row(s)`);

    // --- no placeholders ------------------------------------------------
    const lit = await DatabaseService.query(
      `UPDATE booking_requests SET comments = 'literal' WHERE id = '${ID}' RETURNING id`
    );
    check('a statement with no placeholders works', lit.rows.length === 1, `matched ${lit.rows.length} row(s)`);

    // --- a missing argument must be reported, not rebound ---------------
    let raised = false;
    try {
      await DatabaseService.query('SELECT $3', ['a', 'b']);
    } catch (e) {
      raised = true;
    }
    check('a $n with no matching argument is reported, not silently rebound', raised, raised ? 'raised' : 'did not raise');

    // --- the real module, not just raw SQL -------------------------------
    const bookingQueue = require(path.join(FUNCTIONS, 'booking-queue'));
    const updated = await bookingQueue.update(ID, { status: 'new', syncError: null });
    const readBack = await DatabaseService.query(
      'SELECT status FROM booking_requests WHERE id = ?',
      [ID]
    );
    check(
      'booking-queue.update() actually changes the row',
      updated === true && readBack.rows[0] && readBack.rows[0].status === 'new',
      `update() -> ${updated}, status now ${readBack.rows[0] && readBack.rows[0].status}`
    );
  } finally {
    try {
      await DatabaseService.query('DELETE FROM booking_requests WHERE id = ?', [ID]);
    } catch (e) { /* best effort */ }
    console.log = realLog;
    console.error = realError;
  }

  realLog('');
  for (const r of results) {
    const mark = r.pass ? 'ok  ' : 'FAIL';
    realLog(`  ${mark} ${r.label}${r.detail ? `   (${r.detail})` : ''}`);
  }
  const failed = results.filter((r) => !r.pass);
  realLog('');
  realLog(`  ${results.length - failed.length}/${results.length} passed against the live database`);

  if (failed.length) {
    realError('\n  A STATEMENT THAT LOOKS LIKE IT WORKED AND DID NOT.');
    realError('  Normalisation lives in database-service.js; see normalisePlaceholders().');
    process.exit(1);
  }
  realLog('\n  OK: writes do what they say they do.');
}

main().catch((e) => {
  console.error('  check-writes-work failed:', e && e.message);
  process.exit(1);
});
