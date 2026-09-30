#!/usr/bin/env node
/**
 * check-front-end.js -- the front end's module graph has to stay explicable.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. Every declared entry point resolves to a real file. A typo in a page's
 *      `scripts:` list means that page silently loads no JavaScript, and
 *      nothing about the build says so. This is the same failure the comment in
 *      layouts/partials/entry.html records from the MIME/nosniff incident: the
 *      file the gates were checking for existed, while the one the browser
 *      refused to run did not.
 *
 *   2. Every file in site/assets/js and site/assets/css is either reachable from
 *      an entry point, or on the reviewed list below with a stated reason.
 *
 * WHY A GRAPH AND NOT A GREP
 * ---------------------------
 * Both first attempts at this were a filename search, and both were wrong in
 * the direction that costs the most:
 *
 *   - extensionless ESM. `main.js` opens with `import { initializeModals } from
 *     './utils'`. There is no `.js` in the specifier, so a filename search
 *     reported 29 of 68 files as unreferenced, including files the site entry
 *     point loads on its first line.
 *
 *   - `partial "entry.html" (dict "entry" "connect.js")`. Six live bundles load
 *     this way. A search for `/js/...` misses every one.
 *
 * A report that calls working code dead is an invitation to delete it. So this
 * resolves the graph, and the graph models all three load paths.
 *
 * THE ALLOWLIST IS THE POINT
 * --------------------------
 * "Unreferenced" is not a defect by itself -- tests, and preview templates for
 * CMS components that do not exist yet, are unreferenced on purpose. What is a
 * defect is an unreferenced file nobody has looked at. So each entry below is a
 * decision with a reason, and a NEW unreferenced file fails the build.
 *
 * Run:  node ci/check-front-end.js
 * Exits non-zero on failure. Add `--report` to print the graph without gating.
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/**
 * Files no entry point reaches, and why that is acceptable.
 *
 * Grouped by decision, not alphabetically, because the reason is the useful
 * part. When a file is removed from the tree, its entry here is a tombstone:
 * remove the line too, and the check will tell you if it comes back.
 */
const REVIEWED = {
  // --- tests. Not bundled, run by jest. ------------------------------------
  'refactored/tests/EventHandlers.test.js': 'test, run by jest',
  'refactored/tests/Calendar.test.js': 'test, run by jest',

  // --- a CMS component that has no editor UI yet. --------------------------
  'cms-preview-templates/sales-rep.js': 'CMS preview for a component that does not exist yet',
};

/**
 * Stylesheets with no entry point, keyed the same way.
 *
 * None currently: every CSS file is either named by a page, derived from a
 * script name, or gone. The map is kept because the check needs somewhere to
 * put a deliberate exception, and because an empty one is a fact that a reader
 * can verify rather than a thing they have to assume.
 */


/**
 * Same idea for CSS, which lives under a different root.
 *
 * components/notification.css is the stylesheet for components/notification.js,
 * which is itself unreferenced -- imported only by the dead webpack-era
 * main.js. So the pair is written, styled, and not mounted anywhere.
 *
 * That is a decision still open, not a settled one. The stock-alert feature in
 * partials/stock-alerts.html is a plain form; if a toast/notification system is
 * wanted, this is the implementation and the only thing missing is mounting it.
 * Recorded here so the file is not deleted by accident and not forgotten.
 */
const REVIEWED_CSS = {
  'components/notification.css': 'paired with components/notification.js, which nothing mounts',
  // lazysizes is loaded as a JS import in index.js; this stylesheet is not wired
  // to anything. Kept in case the blur-up placeholders want their own sheet.
  'components/lazy-loading.css': 'lazysizes ships via index.js; no page declares this sheet',
};

const graph = JSON.parse(
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'front-end-graph.js'), '--json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
);

const reportOnly = process.argv.includes('--report');

// ---------------------------------------------------------------------------
// 1. Entry points that do not resolve.
// ---------------------------------------------------------------------------
const fs = require('fs');
const JS = path.join(ROOT, 'site', 'assets', 'js');
const brokenRoots = graph.missingRoots || [];

// ---------------------------------------------------------------------------
// 2. Unreferenced files that nobody has signed off.
// ---------------------------------------------------------------------------
const unreviewed = graph.js.unreferenced.filter((u) => !REVIEWED[u.file]);
const staleEntries = Object.keys(REVIEWED).filter(
  (f) => !fs.existsSync(path.join(JS, f)) && !graph.js.unreferenced.some((u) => u.file === f)
);

if (reportOnly) {
  console.log(JSON.stringify(graph, null, 2));
  process.exit(0);
}

const log = console.log;
const fail = console.error;
log('');
log(`  JS  ${graph.js.reachable} reachable of ${graph.js.total}`);
log(`  CSS ${graph.css.total - graph.css.unreferenced.length} referenced of ${graph.css.total}`);
log(`  reviewed unreferenced: ${graph.js.unreferenced.length - unreviewed.length}`);

let bad = 0;

if (brokenRoots.length) {
  bad += brokenRoots.length;
  fail('');
  fail('  AN ENTRY POINT THAT DOES NOT RESOLVE');
  fail('  The page that declares it will load no JavaScript, and the build will');
  fail('  not say so. Check for a typo or a rename.');
  for (const r of brokenRoots) fail(`    ${r.file}  -- declared by ${r.why}`);
}

if (unreviewed.length) {
  bad += unreviewed.length;
  fail('');
  fail('  NEW UNREFERENCED FILE');
  fail('  No entry point reaches it. That is sometimes fine -- tests, or a');
  fail('  component waiting on its editor UI -- but it is a decision, so make');
  fail('  it: wire it up, or add it to REVIEWED in ci/check-front-end.js with a');
  fail('  reason. Do not leave it to be noticed later.');
  for (const u of unreviewed) fail(`    ${u.file.padEnd(42)} ${String(u.bytes).padStart(6)} B`);
}

if (staleEntries.length) {
  bad += staleEntries.length;
  fail('');
  fail('  A REVIEWED ENTRY POINTS AT A FILE THAT IS NO LONGER UNREFERENCED');
  fail('  It is now reachable, so the exemption is stale and would mask a real');
  fail('  regression later. Remove the line.');
  for (const f of staleEntries) fail(`    ${f}`);
}

const cssUnreviewed = graph.css.unreferenced.filter((c) => !REVIEWED_CSS[c]);
if (cssUnreviewed.length) {
  bad += cssUnreviewed.length;
  fail('');
  fail('  UNREFERENCED CSS');
  fail('  Loaded by no page, no layout, and not derived from a script name.');
  for (const c of cssUnreviewed) fail('    ' + c);
}
if (graph.css.unreferenced.length - cssUnreviewed.length > 0) {
  log(`  reviewed unreferenced CSS: ${graph.css.unreferenced.length - cssUnreviewed.length}`);
}

log('');
if (bad) {
  fail(`  FRONT-END GRAPH CHECK FAILED (${bad} problem${bad === 1 ? '' : 's'})`);
  fail('  See scripts/front-end-graph.js for how the three load paths are resolved.');
  process.exit(1);
}
log('  OK: every front-end file is either reachable, or reviewed and explained.');
log('  Full graph:  node scripts/front-end-graph.js');
