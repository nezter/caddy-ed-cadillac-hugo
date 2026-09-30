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

  // --- leftovers of the webpack era. ---------------------------------------
  // `assets.html` builds js/index.js with targetPath "js/main.js". The checked-in
  // assets/js/main.js shares that NAME with the build output, which is why it
  // looks live and is not: nothing ever `resources.Get`s it. Its whole import
  // tree came out of the old webpack entry and went with it.
  'main.js': 'webpack-era entry; the real entry is index.js, built to main.js',
  'contact-form.js': 'imported only by the dead main.js',
  'lead-generator.js': 'imported only by the dead main.js',
  'components/notification.js': 'imported only by the dead main.js; no page mounts it',
  'utils/error-event-system.js': 'imported only by the dead main.js; no page mounts it',

  // --- superseded. ---------------------------------------------------------
  // index.js imports ./navbar, so this is not it.
  'menu.js': 'superseded by navbar.js, which index.js imports',
  // The inventory page loads components/vehicleComparison.js via `scripts:`.
  'vehicle-comparison.js': 'superseded by components/vehicleComparison.js (kebab vs camel)',
  // Two finance calculators. The financing page declares financingCalculator.js
  // (18 KB). finance-calculator.js (8 KB) does monthly payments only and is
  // named in exactly one place: a comment in partials/footer.html describing the
  // inline script that used to 404. Nothing mounts it.
  'finance-calculator.js': 'superseded by financingCalculator.js; no page declares it',
  // index.js binds #contact-form itself and posts to /api/contact.
  'utils.js': 'superseded by the utils/ directory; index.js imports ./utils',
  'site.js': 'no entry point; index.js is the site entry',
  'carousel.js': 'no entry point mounts it',
  'fleet-highlight.js': 'entry.html loads it; kept listed here only if it stops resolving',
  'utils/error-handler.js': 'no entry point; the error path uses utils/error-event-system.js',
  'performanceTracker.js': 'no entry point; 18 KB of dead analytics',
  'services/api-service.js': 'no entry point; pages call the functions directly',
  'api/inventory-proxy.js': 'no entry point; the inventory page is server-rendered by Hugo',

  // --- a CMS component that has no editor UI yet. --------------------------
  'cms-preview-templates/sales-rep.js': 'CMS preview for a component that does not exist yet',
};

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
