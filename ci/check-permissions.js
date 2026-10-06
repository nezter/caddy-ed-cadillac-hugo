#!/usr/bin/env node
/**
 * check-permissions.js -- the permission vocabulary must match what the code asks
 * for.
 *
 * WHY THIS IS NOT A STYLE CHECK
 * -----------------------------
 * `sales_reps.permissions` is a TEXT column holding a comma-separated list, and
 * every function that guards data names the permissions it requires:
 *
 *     authenticateRequest(event, { requiredPermissions: ['campaigns_read'] })
 *
 * The schema's own default for that column is `'view_customers,manage_leads'` --
 * two names, from a DIFFERENT vocabulary. So a rep created with the default has
 * no access to campaigns, rules, analytics, search, templates, interactions,
 * assignments or preferences, and every one of those endpoints answers 403 with
 * no visible reason.
 *
 * `utils/staff-profile.js` holds the full list. If a function grows a required
 * permission and the list does not gain it, that staff member is locked out of
 * the feature the day it ships -- and the failure looks like a permissions bug
 * in a page nobody was testing.
 *
 * So this compares the two and fails CI. It is the check that makes the list safe
 * to maintain.
 *
 * Run:  node ci/check-permissions.js
 * Exits non-zero, so CI stops rather than shipping a vocabulary mismatch.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');
const LIST = path.join(FUNCTIONS, 'utils', 'staff-profile.js');

/**
 * Remove `//` and block comments, so prose about a call is not mistaken for the
 * call. String literals are left alone: this is a scan for one specific token,
 * and rewriting strings to be safe would need a real parser to get right.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every `requiredPermissions: [...]` in the function surface. */
function requiredByFunctions() {
  const found = new Map(); // permission -> [files]
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      // Comments are stripped before scanning.
      //
      // sales-customers.js documents the call it makes:
      //
      //   `authenticateRequest(event, {requiredPermissions: [...]})`
      //
      // That is prose describing the shape of the argument, and the scan read
      // the `...` as a permission name -- so the gate failed on a function that
      // requires `view_customers` and nothing else.
      //
      // A gate that matches its own documentation produces false alarms, and a
      // gate with false alarms is one people learn to ignore. Strip first, then
      // match.
      const text = stripComments(fs.readFileSync(full, 'utf8'));
      const re = /requiredPermissions:\s*\[([^\]]*)\]/g;
      let m;
      while ((m = re.exec(text))) {
        for (const raw of m[1].split(',')) {
          let name = raw.trim().replace(/^['"`]|['"`]$/g, '');
          if (!name || name === '*') continue;
          // The content types (articles / specials / testimonials) share one
          // handler factory, so their requiredPermissions read
          // `def.permissions.read` rather than naming the permission. The
          // names live in utils/content-types.js; resolve them here so the
          // vocabulary stays derivable from the code that actually checks it.
          const dyn = name.match(/^def\.permissions\.(read|write)$/);
          if (dyn) {
            try {
              const types = require(path.join(FUNCTIONS, 'utils', 'content-types.js')).TYPES;
              for (const def of Object.values(types)) {
                const resolved = def.permissions[dyn[1]];
                if (!found.has(resolved)) found.set(resolved, []);
                found.get(resolved).push(path.relative(ROOT, full));
              }
            } catch (e) {
              // A broken require must be visible as a missing permission, never
              // a silent pass: record the raw reference and move on.
              if (!found.has(name)) found.set(name, []);
              found.get(name).push(path.relative(ROOT, full));
            }
            // `def.permissions.read` is a reference, not a permission name;
            // it resolved to real names above.
            continue;
          }
          if (!found.has(name)) found.set(name, []);
          found.get(name).push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(FUNCTIONS);
  return found;
}

/** The names in ALL_PERMISSIONS, read out of the source rather than imported. */
function declaredInList() {
  const text = fs.readFileSync(LIST, 'utf8');
  const m = text.match(/const ALL_PERMISSIONS = \[([\s\S]*?)\];/);
  if (!m) {
    console.error('  FAIL: could not find ALL_PERMISSIONS in ' + path.relative(ROOT, LIST));
    process.exit(1);
  }
  return new Set(
    m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean)
  );
}

const required = requiredByFunctions();
const declared = declaredInList();

console.log(`  permissions required by functions : ${required.size}`);
console.log(`  permissions declared in the list  : ${declared.size}`);

let failed = false;

const missing = [...required.keys()].filter((p) => !declared.has(p)).sort();
if (missing.length) {
  failed = true;
  console.error(`\n  MISSING from ALL_PERMISSIONS (${missing.length}):`);
  for (const p of missing) {
    console.error(`    ${p}`);
    for (const f of required.get(p)) console.error(`        required by ${f}`);
  }
  console.error(
    '\n  A staff member would be refused by these endpoints. Add each name to'
  );
  console.error('  ALL_PERMISSIONS in netlify/functions/utils/staff-profile.js.');
}

const unused = [...declared].filter((p) => !required.has(p)).sort();
if (unused.length) {
  // Not a failure. Permissions may be granted to a role without a function
  // currently checking for them, and removing one would silently revoke access
  // somebody relies on. Worth seeing, not worth failing over.
  console.log(`\n  declared but not currently required by any function (${unused.length}):`);
  for (const p of unused) console.log(`    ${p}`);
}

if (failed) {
  console.error('\n  PERMISSION VOCABULARY MISMATCH');
  process.exit(1);
}
console.log('\n  OK: every permission a function requires is grantable.');
