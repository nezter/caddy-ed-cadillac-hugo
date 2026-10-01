'use strict';

/**
 * require-seed-acknowledgement -- the gate every seed script goes through.
 *
 * WHY THIS IS A MODULE AND NOT A `console.warn`
 * ---------------------------------------------
 * There are four seed scripts, and until 2026-09-30 not one of them had any
 * protection at all: no confirmation, no environment check, no warning. They
 * insert fictional customers, leads, vehicles, staff and analytics into
 * whatever `TURSO_DATABASE_URL` points at.
 *
 * That is the dealership's live customer database. It is what `/admin/leads`,
 * `/admin/bookings` and `/admin/customers` read. So the failure mode was: run a
 * seed script to look at a populated dashboard, and the dealership's real
 * dashboards then fill with people who do not exist -- every metric on those
 * pages becoming fiction, with nothing on the page to distinguish a real row
 * from a generated one.
 *
 * A `console.warn` in four files is four chances to forget. This is one place,
 * and a seed script cannot run without going through it, because the guard is
 * the first thing that runs.
 *
 * WHY IT IS AN ENV VAR AND NOT A PROMPT
 * -------------------------------------
 * An interactive `readline` prompt looks friendlier and is worse: it asks a
 * question that a CI job, a cron entry, or a panicked `npm run seed` will
 * answer wrongly or not answer at all. An environment variable is a deliberate,
 * greppable, scripted act -- and `ALLOW_FAKE_CUSTOMER_DATA` is a string nobody
 * types by accident.
 *
 * WHAT IT PRINTS
 * --------------
 * The resolved database URL, and a DELETE statement for the rows it is about to
 * create. Both are printed BEFORE the write, not after, because the moment you
 * find out you seeded the wrong database is the moment you need to know which
 * one it was.
 */

const ACK = 'ALLOW_FAKE_CUSTOMER_DATA';

/**
 * Rows this script is likely to create, for the undo hint.
 *
 * Deliberately a hint and not a generic suggestion: a specific DELETE for the
 * table the caller names is copy-pasteable, and "delete the test data" is not.
 */
function refuse(what, undoHint) {
  const target = process.env.TURSO_DATABASE_URL || '(TURSO_DATABASE_URL is NOT SET)';
  const targetLine =
    process.env.TURSO_DATABASE_URL && /prod|main/i.test(process.env.TURSO_DATABASE_URL)
      ? `\n  !! That hostname looks like a PRODUCTION database.\n`
      : '';

  console.error('');
  console.error('  REFUSING TO RUN.');
  console.error('');
  console.error(`  This script creates ${what}.`);
  console.error('  It is all fictional, and it goes into the same database the');
  console.error("  dealership's real admin pages read.");
  console.error('');
  console.error(`  It would write to: ${target}`);
  console.error(`${targetLine}`);
  console.error('  If you have confirmed that is a scratch database, re-run with:');
  console.error('');
  console.error(`      ${ACK}=1 node ${process.argv[1] || 'this-script.js'}`);
  console.error('');
  if (undoHint) {
    console.error('  To remove this data afterwards:');
    console.error(`      ${undoHint}`);
    console.error('');
  }
  process.exit(1);
}

/**
 * Assert that fake data may be written.
 *
 * @param {object}  opts
 * @param {string}  opts.what   plain-English description of what will be created
 * @param {string} [opts.undo]  a copy-pasteable DELETE for afterwards
 * @param {string} [opts.name]  script name, for the re-run hint
 */
function requireSeedAcknowledgement({ what, undo }) {
  if (process.env[ACK] === '1') {
    const target = process.env.TURSO_DATABASE_URL || '(TURSO_DATABASE_URL is NOT SET)';
    console.warn('');
    console.warn(`  [seed] ${ACK}=1 acknowledged.`);
    console.warn(`  [seed] Writing FICTIONAL data to: ${target}`);
    if (/prod|main/i.test(target)) {
      console.warn('  [seed] !! That hostname looks like a PRODUCTION database.');
    }
    if (undo) console.warn(`  [seed] To undo: ${undo}`);
    console.warn('');
    return;
  }

  refuse(what, undo);
}

module.exports = { requireSeedAcknowledgement, ACK };