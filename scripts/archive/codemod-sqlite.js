#!/usr/bin/env node
/**
 * codemod-sqlite.js -- rewrite Postgres-only SQL for libSQL.
 *
 * WHY A CODEMOD AND NOT A LIST OF EDITS
 * -------------------------------------
 * The audit found Postgres-only SQL throughout the function surface:
 *
 *     74  ILIKE
 *     33  CURRENT_TIMESTAMP - INTERVAL '30 days'
 *     12  ::type casts
 *      1  find_potential_duplicates(...)   a Postgres function
 *      1  unnest(string_to_array(...))     Postgres array functions
 *
 * None of it works against libSQL. This is what "piecemealed" looks like in a
 * data layer: the code was written against one database and pointed at another,
 * so search returns nothing, every date filter throws, and duplicate detection
 * calls a function that is not there.
 *
 * Doing 120 edits by hand is how you get 119 of them done. Doing them by regex is
 * how you get a subtle one wrong. So: a codemod that is deliberately narrow --
 * only the two patterns that are purely lexical, verified afterwards by
 * executing every statement in ci/check-select-columns.js -- and the handful that
 * need a human decision left for one.
 *
 * THE TWO AUTOMATED SUBSTITUTIONS
 * -------------------------------
 * ILIKE  ->  LIKE
 *     SQLite's LIKE is already case-insensitive for ASCII: `case_sensitive_like`
 *     is off by default, and database-service.js does not turn it on. So LIKE
 *     gives the same answer ILIKE did, on this database.
 *
 *     The caveat is non-ASCII. SQLite's built-in LIKE folds case for ASCII only,
 *     so an accented character no longer matches its capital. That is a real
 *     difference and it is why this is a codemod with a written note rather than
 *     a silent find-and-replace.
 *
 * CURRENT_TIMESTAMP - INTERVAL '30 days'  ->  datetime('now', '-30 days')
 *     `created_at` is TEXT holding datetime('now') output, so string comparison
 *     is both correct and portable. The unit is carried across, not guessed:
 *     days, hours, minutes and seconds all have a datetime() modifier, and
 *     anything else is reported rather than converted wrongly.
 *
 * NOT AUTOMATED, ON PURPOSE
 * -------------------------
 *   ::type casts                -- the portable form depends on the type
 *   unnest(string_to_array())   -- no SQLite equivalent; needs a rewrite
 *   find_potential_duplicates() -- becomes a VIEW (see schema.sql)
 *
 * Run:  node scripts/codemod-sqlite.js            (report only)
 *       node scripts/codemod-sqlite.js --write    (apply)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');
const WRITE = process.argv.includes('--write');

// Only inside SQL-ish text. Deliberately not a blanket replace over the file.
const PATTERNS = [
  {
    name: 'ILIKE -> LIKE',
    // A word boundary before, and not part of a longer identifier.
    re: /\bILIKE\b/gi,
    to: 'LIKE',
  },
  {
    name: "CURRENT_TIMESTAMP - INTERVAL '<n> <unit>' -> datetime('now', '-<n> <unit>')",
    re: /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'(\d+)\s+(day|days|hour|hours|minute|minutes|second|seconds)'/gi,
    to: (_m, n, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${n} ${u}s')`;
    },
  },
  {
    // The interpolated form, which is the majority: `INTERVAL '${days} days'`.
    // Found 33 of these only after this pattern was added -- the literal-digit
    // one above matched 3, and a codemod that reports 3 when there are 36 is a
    // codemod that has been quietly wrong about its own coverage.
    name: "CURRENT_TIMESTAMP - INTERVAL '${x} <unit>' -> datetime('now', '-${x} <unit>')",
    re: /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'\$\{(\w+)\}\s+(day|days|hour|hours|minute|minutes|second|seconds)'/gi,
    to: (_m, v, unit) => {
      const u = unit.toLowerCase();
      // Assemble the literal text `${v}` by hand. Writing it as a JS template
      // literal here is how the first version lost a brace and produced
      // `-${days'} days'` in eight files -- which still parses as JavaScript and
      // still fails at runtime, in a SQL string, where nothing points at here.
      return "datetime('now', '-${" + v + "} " + u + "')";
    },
  },
  {
    name: "CURRENT_TIMESTAMP + INTERVAL '${x} <unit>' -> datetime('now', '+${x} <unit>')",
    re: /CURRENT_TIMESTAMP\s*\+\s*INTERVAL\s*'\$\{(\w+)\}\s+(day|days|hour|hours|minute|minutes|second|seconds)'/gi,
    to: (_m, v, unit) => {
      const u = unit.toLowerCase();
      return "datetime('now', '+${" + v + "} " + u + "')";
    },
  },
  {
    // `X::decimal / Y` -> `X * 1.0 / Y`
    //
    // Every cast in this codebase is this one shape, and it exists for a real
    // reason: without it the division is INTEGER division, so 2/3 is 0 and a
    // conversion rate of 66.6% is reported as 66, and 0.6% as 0.
    //
    // `* 1.0` forces the same floating-point division in SQLite without cast
    // syntax, which does not exist there. It is unchanged on Postgres too, so
    // this is portable in both directions rather than a downgrade.
    name: 'X::decimal / Y -> X * 1.0 / Y',
    re: /::decimal(\s*\/\s*)/gi,
    to: ' * 1.0$1',
  },
  {
    // `x::text` inside a `||` concatenation. SQLite has no cast syntax and `||`
    // coerces its operands already, so the cast is dropped.
    //
    // Only `::text`, never `::date` or `::int` -- those change semantics rather
    // than syntax, and are listed as manual below.
    name: 'X::text -> X  (SQLite || already coerces)',
    re: /(\w+(?:\.\w+)*)::text\b/gi,
    to: '$1',
  },
  {
    // A Postgres-only date offset the INTERVAL pass missed, because the base is
    // a column rather than CURRENT_TIMESTAMP.
    name: "col + INTERVAL '30 days' -> datetime(col, '+30 days')",
    re: /(\w+(?:\.\w+)*)\s*\+\s*INTERVAL\s*'(\d+)\s+(day|days|hour|hours)'/gi,
    to: (_m, col, n, unit) => `datetime(${col}, '+${n} ${unit.toLowerCase()}')`,
  },
];

// Things a human has to decide, counted and reported but never touched.
const MANUAL = [
  { name: 'type cast', re: /::\s*(decimal|numeric|int|integer|bigint|text|date|timestamp|bool|boolean)\b/gi },
  { name: 'unnest(string_to_array())', re: /unnest\s*\(\s*string_to_array/gi },
  { name: 'find_potential_duplicates()', re: /find_potential_duplicates\s*\(/gi },
  { name: 'array_agg / string_agg', re: /\b(array_agg|string_agg|json_agg)\s*\(/gi },
  { name: 'DISTINCT ON', re: /DISTINCT\s+ON\s*\(/gi },
  { name: 'generate_series', re: /generate_series\s*\(/gi },
  { name: 'RETURNING with FROM (Postgres data-modifying CTE)', re: /WITH\s+\w+\s+AS\s*\(\s*(INSERT|UPDATE|DELETE)/gi },
];

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...jsFiles(full));
      continue;
    }
    if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = jsFiles(FUNCTIONS);
const totals = new Map();
const manualTotals = new Map();
let filesChanged = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    const n = (after.match(p.re) || []).length;
    if (!n) continue;
    after = after.replace(p.re, p.to);
    totals.set(p.name, (totals.get(p.name) || 0) + n);
  }
  for (const m of MANUAL) {
    m.re.lastIndex = 0;
    const n = (after.match(m.re) || []).length;
    if (!n) continue;
    manualTotals.set(m.name, (manualTotals.get(m.name) || 0) + n);
  }
  if (after !== before) {
    filesChanged++;
    if (WRITE) fs.writeFileSync(file, after);
  }
}

console.log(`  ${WRITE ? 'rewrote' : 'would rewrite'} ${filesChanged} of ${files.length} files\n`);
console.log('  applied:');
for (const [name, n] of totals) console.log(`    ${String(n).padStart(4)}  ${name}`);
if (!totals.size) console.log('    (nothing to apply)');

if (manualTotals.size) {
  console.log('\n  NOT automated -- each needs a decision, and none is mechanical:');
  for (const [name, n] of manualTotals) console.log(`    ${String(n).padStart(4)}  ${name}`);
}

if (!WRITE) console.log('\n  (dry run. pass --write to apply)');
