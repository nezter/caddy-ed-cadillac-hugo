#!/usr/bin/env node
/**
 * discover-missing-columns.js -- find every column the code names and the schema
 * does not have, in one pass.
 *
 * WHY THIS EXISTS
 * ---------------
 * The same defect has now been found three times, one column at a time:
 *
 *   vehicles.status          found by running an INSERT
 *   customers.vehicle_interest   found by running an INSERT
 *   appointments.status      found by running a SELECT
 *   followups.status         found by building an index
 *
 * Each round-trip cost a full apply-and-run cycle, and each one had to be
 * discovered before the next was visible -- because SQLite stops at the FIRST
 * error, so a schema with five missing columns reports one of them. That is the
 * same reason a build that reports the first failure is unhelpful when you are
 * looking for all of them.
 *
 * So this collects every failure in one pass: it builds the schema, then runs
 * every INSERT and every SELECT with `PRAGMA` and error collection set so
 * nothing short-circuits, and reports the full set with the file and line that
 * named each column.
 *
 * Run:  node ci/discover-missing-columns.js
 * Prints a table of what is missing and where it is referenced. Exits 0 even
 * when it finds things -- this is a discovery tool, not a gate.
 *        ci/check-select-columns.js is the gate.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'database', 'turso', 'schema.sql');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');

function haveSqlite() {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    try { fs.accessSync(path.join(dir, 'sqlite3'), fs.constants.X_OK); return true; } catch { /* */ }
  }
  return false;
}
if (!haveSqlite()) { console.error('  sqlite3 is not on PATH'); process.exit(1); }

const dbFile = path.join(os.tmpdir(), `caddy-discover-${process.pid}.db`);
try { fs.unlinkSync(dbFile); } catch { /* */ }
execFileSync('sqlite3', [dbFile], { input: fs.readFileSync(SCHEMA, 'utf8'), stdio: 'pipe' });

/** Every static SQL statement in the function surface, with its source. */
function statements() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const raw = fs.readFileSync(full, 'utf8');
      const text = raw
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      const re = /`([\s\S]*?)`/g;
      let m;
      while ((m = re.exec(text))) {
        const sql = m[1].trim();
        if (!/^(select|insert|update|delete)\b/i.test(sql)) continue;
        if (sql.includes('${')) continue;
        out.push({ file: path.relative(ROOT, full), line: raw.slice(0, m.index).split('\n').length, sql });
      }
      // Single-line statements, e.g. 'SELECT * FROM sales_reps WHERE id = $1'
      const re2 = /'((?:SELECT|INSERT|UPDATE|DELETE)[^'\n]{20,})'/gi;
      while ((m = re2.exec(text))) {
        const sql = m[1].trim();
        if (sql.includes('${')) continue;
        out.push({ file: path.relative(ROOT, full), line: raw.slice(0, m.index).split('\n').length, sql });
      }
    }
  };
  walk(FUNCTIONS);
  return out;
}

function bind(sql) {
  return sql.replace(/\$\d+/g, "'x'").replace(/\bINTERVAL\b/gi, '');
}

const stmts = statements();
console.log(`  statements to test: ${stmts.length}`);

const missing = new Map();   // "table.column" -> Set("file:line")
let tested = 0;

for (const s of stmts) {
  try {
    execFileSync('sqlite3', [dbFile, bind(s.sql)], { stdio: 'pipe' });
    tested++;
  } catch (e) {
    const err = String(e.stderr || e.message);
    // "no such column: X" -- the table is named in the same message on some
    // builds, otherwise take it from the statement.
    for (const m of err.matchAll(/no such column:\s*(\w+)\.(\w+)/gi)) {
      const key = `${m[1]}.${m[2]}`;
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(`${s.file}:${s.line}`);
    }
    if (/no such column/.test(err) && !/no such column:\s*\w+\.\w+/i.test(err)) {
      // Table-less form: attribute it to the first table the statement names.
      const tm = err.match(/no such column:\s*(\w+)/i);
      const fm = s.sql.match(/\b(?:from|into|update)\s+(\w+)/i);
      if (tm && fm) {
        const key = `${fm[1]}.${tm[1]}`;
        if (!missing.has(key)) missing.set(key, new Set());
        missing.get(key).add(`${s.file}:${s.line}`);
      }
    }
  }
}

console.log(`  ran cleanly: ${tested} of ${stmts.length}\n`);
if (!missing.size) {
  console.log('  nothing missing: every column the code names exists');
  try { fs.unlinkSync(dbFile); } catch { /* */ }
  process.exit(0);
}

console.log(`  columns named by the code that the schema does not have (${missing.size}):\n`);
for (const [key, refs] of [...missing].sort()) {
  console.log(`    ${key}`);
  for (const r of [...refs].slice(0, 3)) console.log(`        ${r}`);
  if (refs.size > 3) console.log(`        ... and ${refs.size - 3} more`);
}
try { fs.unlinkSync(dbFile); } catch { /* */ }
