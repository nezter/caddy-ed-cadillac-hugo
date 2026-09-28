#!/usr/bin/env node
/**
 * check-select-columns.js -- every column a query READS must exist.
 *
 * WHY THIS IS SEPARATE FROM check-insert-columns.js
 * --------------------------------------------------
 * That gate checks INSERTs, and it found six columns the code writes and the
 * schema never had. Those were only found by RUNNING the statements.
 *
 * The same class of bug exists on the read side and nothing was checking it.
 * `getUpcomingAppointments` filters on `a.status`, `getSalesRepTasks` filters on
 * `t.status`, `getVehicles` filters on `v.status` -- and `appointments` and
 * `tasks` have no `status` column at all. Every one of those queries fails with
 * `no such column` against a real database, and none of them had ever run.
 *
 * A SELECT is harder to check than an INSERT statically, because the column list
 * is `SELECT *` as often as not, and a WHERE clause names columns from a table
 * several joins away. So this does what actually settles it: applies the schema
 * to a throwaway SQLite database and RUNS the queries.
 *
 * The alternative -- parsing SQL to guess which alias belongs to which table --
 * produces false alarms, and a gate with false alarms is one people learn to
 * ignore.
 *
 * Run:  node ci/check-select-columns.js
 * Exits non-zero if a query cannot run.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'database', 'turso', 'schema.sql');

if (!fs.existsSync(SCHEMA)) {
  console.error(`  FAIL: ${path.relative(ROOT, SCHEMA)} does not exist.`);
  console.error('  Run: python3 scripts/build-schema.py');
  process.exit(1);
}

// `execFileSync('which', ...)` does not work here: `which` exits non-zero on
// some shells when the binary exists, and a gate that reports "sqlite3 is not
// on PATH" on a machine that has it is worse than no gate.
function haveSqlite() {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    try {
      fs.accessSync(path.join(dir, 'sqlite3'), fs.constants.X_OK);
      return true;
    } catch { /* keep looking */ }
  }
  return false;
}

if (!haveSqlite()) {
  console.error('  FAIL: sqlite3 is not on PATH. This check needs it.');
  process.exit(1);
}

/**
 * The queries the application actually runs.
 *
 * These are the statements, copied from the functions, not invented. If a
 * function changes, this must change with it -- which is why the extractors
 * below read the functions rather than keeping a separate list that drifts.
 */

/** SQL template literals that begin a read. */
function extractQueries() {
  const out = [];
  const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const text = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      // A template literal assigned to something called `sql`, containing SELECT.
      const re = /(?:const|let|var)\s+\w*[Ss]ql\w*\s*=\s*`([\s\S]*?)`/g;
      let m;
      while ((m = re.exec(text))) {
        const sql = m[1].trim();
        if (!/^\s*select\b/i.test(sql)) continue;
        if (sql.includes('${')) continue;          // interpolated: not static
        out.push({
          file: path.relative(ROOT, full),
          line: text.slice(0, m.index).split('\n').length,
          sql,
        });
      }
    }
  };
  walk(FUNCTIONS);
  return out;
}

/**
 * Substitute literals for the placeholders.
 *
 * The point is to prove the statement is valid against this schema -- that every
 * table and column it names exists. The VALUES do not matter.
 *
 * They matter a little, though. Binding every placeholder to the string 'x'
 * produced five bogus "datatype mismatch" failures, because SQLite objects when
 * a string meets an expression that needs a number:
 *
 *     ROUND(COUNT(...) * 1.0 / NULLIF(COUNT(...), 0) * 100, 2)
 *
 * Every one of those was checked by hand with a real value and runs clean. A
 * gate that reports five failures that are not failures gets ignored, and then
 * it is not reporting anything.
 *
 * NULL is used instead, because a placeholder compared against a column is valid
 * whatever that column's type -- which is the only thing this check is claiming.
 * Count and value mismatches are covered by ci/check-insert-columns.js, which
 * binds real values.
 *
 * LIMIT and OFFSET are the exception. `LIMIT NULL` is a datatype mismatch in
 * SQLite, so binding every placeholder to NULL traded one set of false failures
 * for another. Those two are replaced with integers before the general pass.
 */
function bind(sql) {
  return sql
    .replace(/\bLIMIT\s+\$\d+/gi, 'LIMIT 10')
    .replace(/\bOFFSET\s+\$\d+/gi, 'OFFSET 0')
    .replace(/\$\d+/g, 'NULL')
    .replace(/\bINTERVAL\b/gi, '');   // Postgres-only; portability is a separate check
}

const dbFile = path.join(os.tmpdir(), `caddy-schema-check-${process.pid}.db`);
try {
  fs.unlinkSync(dbFile);
} catch { /* first run */ }

console.log('  applying database/turso/schema.sql to a throwaway database...');
try {
  execFileSync('sqlite3', [dbFile], { input: fs.readFileSync(SCHEMA, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  console.error('  FAIL: the schema did not apply.');
  console.error('  ' + String(e.stderr || e.message).split('\n').slice(0, 6).join('\n  '));
  process.exit(1);
}

const counts = execFileSync('sqlite3', [dbFile,
  "SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%') || ' tables, ' || (SELECT COUNT(*) FROM sqlite_master WHERE type='view') || ' views, ' || (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%') || ' indexes'",
], { encoding: 'utf8' }).trim();
console.log(`  schema applied: ${counts}`);

const fkCheck = execFileSync('sqlite3', [dbFile, 'PRAGMA foreign_key_check;'], { encoding: 'utf8' }).trim();
if (fkCheck) {
  console.error(`\n  FAIL: foreign key violations:\n    ${fkCheck.split('\n').join('\n    ')}`);
  process.exit(1);
}
console.log('  foreign_key_check: clean');

const queries = extractQueries();
console.log(`  SELECT statements found in the function surface: ${queries.length}`);

let failed = 0;
const problems = [];
for (const q of queries) {
  try {
    execFileSync('sqlite3', [dbFile, bind(q.sql)], { stdio: 'pipe' });
  } catch (e) {
    const msg = String(e.stderr || e.message).trim().split('\n').filter(Boolean)[0] || 'unknown';
    failed++;
    // Classify, so the advice matches the fault. Every failure used to be
    // reported as "a column the code names that the schema does not have",
    // which is wrong for anything else -- and a gate that gives the wrong reason
    // sends you to the wrong file.
    let advice;
    if (/no such column/i.test(msg)) {
      advice = 'a column the code names that the schema does not have -- add it in scripts/build-schema.py';
    } else if (/no such table/i.test(msg)) {
      advice = 'a table the code names that the schema does not have -- add it in scripts/build-schema.py';
    } else if (/no such function/i.test(msg)) {
      advice = 'a SQL FUNCTION that does not exist on this database (Postgres-only?)';
    } else if (/near "(\w+)": syntax error/i.test(msg)) {
      const kw = /near "(\w+)": syntax error/i.exec(msg)[1];
      advice = `Postgres-only syntax near "${kw}" (${kw === 'ILIKE' ? 'use LIKE -- SQLite LIKE is case-insensitive' : 'no portable equivalent'})`;
    } else if (/datatype mismatch/i.test(msg)) {
      advice = 'a type mismatch at bind time -- often a real bug, sometimes the probe; run the statement by hand';
    } else {
      advice = 'unclassified -- run the statement by hand';
    }
    problems.push({ ref: `${q.file}:${q.line}`, msg, advice });
  }
}

if (failed) {
  console.error(`\n  queries that cannot run against this schema (${failed} of ${queries.length}):\n`);
  for (const p of problems) {
    console.error(`    ${p.ref}`);
    console.error(`        ${p.msg}`);
    console.error(`        -> ${p.advice}`);
  }
  try { fs.unlinkSync(dbFile); } catch { /* best effort */ }
  process.exit(1);
}

console.log(`  all ${queries.length} SELECT statements run against the schema`);
try { fs.unlinkSync(dbFile); } catch { /* best effort */ }
console.log('\n  OK: the schema can answer what the code asks of it.');
