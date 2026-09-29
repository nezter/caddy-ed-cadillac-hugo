#!/usr/bin/env node
/**
 * check-insert-columns.js -- every INSERT must name columns that exist, and
 * supply as many values as it names columns.
 *
 * WHY A SCHEMA-ONLY CHECK IS NOT ENOUGH
 * -------------------------------------
 * `001_core.sql` creates cleanly. All 15 tables, no errors. And the INSERTs still
 * failed, six of them, because the code names columns the schema never had:
 *
 *     SQLite error: table customers has no column named vehicle_interest
 *     SQLite error: table vehicles has no column named status
 *
 * Those were found by RUNNING the statements against the real database, not by
 * reading either file. This gate is that run, made repeatable.
 *
 * WHY 002_app_columns.sql MISSED THEM
 * -----------------------------------
 * 002 was built by diffing the Postgres source schema against the generated
 * libSQL one: schema against schema. These columns are named by the CODE, which
 * is a third source of truth. No comparison of two artefacts finds a third thing
 * that disagrees with both.
 *
 * THAT IS THE LESSON
 * -------------------
 * A gate that compares two things will not catch the thing that disagrees with
 * both of them. This one reads all three: the schema, the migrations, and the
 * code.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. Every column named in an INSERT exists in the table. Needs a database, so
 *      this only runs when TURSO_DATABASE_URL is set; otherwise it reports that
 *      it was skipped rather than passing quietly.
 *   2. Every INSERT supplies `id`, because the schema has no default for it. This
 *      one needs no database and always runs.
 *   3. Column count matches value count. Always runs, no database needed.
 *
 * Run:  node ci/check-insert-columns.js
 * Exits non-zero on a mismatch, so CI stops.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');

/* ------------------------------------------------------------------ *
 * 1 and 3: static checks -- no database needed
 * ------------------------------------------------------------------ */

/** Strip comments so prose about a call is not mistaken for the call. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every INSERT in the function surface, with its table, columns and values. */
function findInserts() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const text = stripComments(fs.readFileSync(full, 'utf8'));
      const re = /INSERT\s+INTO\s+(\w+)\s*\(/gi;
      let m;
      while ((m = re.exec(text))) {
        const table = m[1];
        const open = m.index + m[0].length - 1;
        const close = matchParen(text, open);
        if (close === -1) continue;
        const cols = splitList(text.slice(open + 1, close));
        const after = text.slice(close + 1);
        const vm = /VALUES\s*\(/i.exec(after);
        if (!vm) continue;                       // INSERT ... SELECT: no value list
        const vclose = matchParen(after, vm.index + vm[0].length - 1);
        if (vclose === -1) continue;
        // `INSERT ... SELECT` has no VALUES clause, but an `ON CONFLICT` later in
        // the statement can contain the word, and a subquery in the SELECT can
        // too. Skipped rather than miscounted: a check that reports four bogus
        // "column/value mismatch" failures trains people to ignore the gate.
        if (isInsertSelect(after)) continue;
        const vals = splitList(after.slice(vm.index + vm[0].length, vclose));
        out.push({
          file: path.relative(ROOT, full),
          line: text.slice(0, m.index).split('\n').length,
          table,
          cols,
          vals,
          valueCount: countValues(after.slice(vm.index + vm[0].length, vclose)),
        });
      }
    }
  };
  walk(FUNCTIONS);
  return out;
}

/**
 * Is this `INSERT ... SELECT` rather than `INSERT ... VALUES`?
 *
 * The value list comes from the SELECT, so a column/value count is a property
 * of that SELECT, not of the INSERT. Counting the commas in the whole statement
 * reported four mismatches on statements that were entirely correct.
 */
function isInsertSelect(after) {
  const head = after.slice(0, 400);
  const vm = /VALUES\s*\(/i.exec(head);
  const sm = /\bSELECT\b/i.exec(head);
  if (!sm) return false;
  return !vm || sm.index < vm.index;
}

/** Index of the paren closing the one at `open`, or -1. */
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitList(s) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Placeholders plus inline literals -- `$1, CURRENT_DATE, 'system'` is three. */
function countValues(s) {
  let depth = 0, n = 0, seen = false;
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',') { if (depth === 0) n++; seen = true; }
  }
  return s.trim() ? n + 1 : 0;
}

/* ------------------------------------------------------------------ *
 * 2: the live-database check
 * ------------------------------------------------------------------ */

async function checkAgainstDatabase(inserts) {
  let createClient;
  try {
    ({ createClient } = require(path.join(FUNCTIONS, 'node_modules', '@libsql', 'client')));
  } catch {
    return { skipped: '@libsql/client is not installed' };
  }
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return { skipped: 'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set' };
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Read the real columns, from the database, not from the schema files.
  const tables = new Map();
  const listing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  for (const { name } of listing.rows) {
    const info = await client.execute(`PRAGMA table_info(${name})`);
    tables.set(name, new Set(info.rows.map((r) => r.name)));
  }

  const problems = [];
  for (const ins of inserts) {
    if (!tables.has(ins.table)) {
      problems.push(`${ins.file}:${ins.line}  table "${ins.table}" does not exist`);
      continue;
    }
    const have = tables.get(ins.table);
    const missing = ins.cols.filter((c) => !have.has(c));
    if (missing.length) {
      problems.push(`${ins.file}:${ins.line}  ${ins.table} has no column(s): ${missing.join(', ')}`);
    }
  }
  return { problems, tables: tables.size };
}

/* ------------------------------------------------------------------ */

(async () => {
  const inserts = findInserts();
  console.log(`  INSERT statements found: ${inserts.length}`);
  let failed = false;

  // --- id must be supplied: the schema has no default for it.
  //
  // EXCEPT for the tables keyed by something that already exists. The four
  // search-index tables are keyed on the source row's own id -- `customer_id`,
  // `lead_id` and so on -- and `search_index_metadata` is keyed on `index_type`,
  // one row per index rather than per document. They have no generated id to
  // supply, and asking them for one would be asking for a second identity that
  // then has to be kept in step with the first.
  //
  // Listed by name with the reason, rather than worked out from the schema,
  // because a rule that infers "this table is keyed by reference" from a column
  // name is a rule that will be wrong one day in a way nobody notices. An
  // exception with a reason written next to it is reviewable; an inferred one is
  // not.
  //
  // A table that gets a generated `id` is a table whose identity is its own; a
  // table on this list is one whose identity is something that already exists
  // elsewhere. Booking requests, customers and campaigns are the first kind --
  // nothing else knows what they are until the row says so. A search index, a
  // calendar connection and a favourite are the second: inventing an id for them
  // would mean a second identity that then has to be kept in step with the
  // first.
  const KEYED_BY_REFERENCE = new Set([
    'customer_search_index',      // PK customer_id -> customers.id
    'lead_search_index',          // PK lead_id -> leads.id
    'interaction_search_index',   // PK interaction_id -> interactions.id
    'vehicle_search_index',       // PK vehicle_id -> vehicles.id
    'search_index_metadata',      // PK index_type, one row per index
    'google_calendar_tokens',     // PK user_id -> sales_reps.id (the Identity `sub`)
    'vehicle_favourites',         // PK slug, which is the vehicle's own identity
  ]);

  const missingId = inserts.filter((i) => !i.cols.includes('id') && !KEYED_BY_REFERENCE.has(i.table));
  if (missingId.length) {
    failed = true;
    console.error(`\n  INSERT without an id (${missingId.length}) -- the schema has no default, so these fail:`);
    for (const i of missingId) console.error(`    ${i.file}:${i.line}  ${i.table}`);
  } else {
    console.log('  every INSERT supplies an id');
  }

  // --- column count must match value count.
  const mismatched = inserts.filter((i) => i.cols.length !== i.valueCount);
  if (mismatched.length) {
    failed = true;
    console.error(`\n  column/value count mismatch (${mismatched.length}):`);
    for (const i of mismatched) {
      console.error(`    ${i.file}:${i.line}  ${i.table}  ${i.cols.length} columns, ${i.valueCount} values`);
    }
  } else {
    console.log('  every INSERT has one value per column');
  }

  // --- columns must exist in the real database.
  const live = await checkAgainstDatabase(inserts);
  if (live.skipped) {
    console.log(`\n  live column check SKIPPED: ${live.skipped}`);
    console.log('  (set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to run it)');
    if (missingId.length || mismatched.length) {
      console.error('\n  INSERT CHECK FAILED (static checks)');
      process.exit(1);
    }
    console.log('\n  OK: static checks passed. The column check did not run.');
    return;
  }
  if (live.problems.length) {
    failed = true;
    console.error(`\n  columns named by code that the database does not have (${live.problems.length}):`);
    for (const p of live.problems) console.error(`    ${p}`);
    console.error('\n  Add each with an ALTER TABLE in database/turso/00X_*.sql.');
  } else {
    console.log(`  every INSERT names real columns (checked against ${live.tables} live tables)`);
  }

  if (failed) {
    console.error('\n  INSERT CHECK FAILED');
    process.exit(1);
  }
  console.log('\n  OK: every INSERT can actually run.');
})();
