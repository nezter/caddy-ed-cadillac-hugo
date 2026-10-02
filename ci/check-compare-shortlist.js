#!/usr/bin/env node
/**
 * check-compare-shortlist.js -- the two card buttons do two different things.
 *
 * WHY THIS RUNS THE REAL BUILT PAGE
 * ---------------------------------
 * The compare feature was inert for three stacked reasons and every one of them
 * was invisible to a build: the script looked for a CSS class the page did not
 * have, it fetched from a function that has no inventory feed, and it called
 * that function with a path where a query string was expected. And the shortlist
 * shared a button with it, labelled "Shortlist", carrying `data-add-comparison`.
 *
 * Nothing about that is a compile error. A passing build and a green gate suite
 * said nothing about it, because the build only checks that files exist and that
 * the script parses.
 *
 * So this loads the BUILT inventory page into jsdom, runs the two real scripts
 * against it, and clicks the buttons. The assertions are about behaviour: does
 * clicking Compare fill the table, and does clicking Shortlist not fill the
 * table, and does the other way round.
 *
 *   node ci/check-compare-shortlist.js
 *
 * Needs a built site/public/inventory/index.html. It uses whatever is on disk and
 * says so if that is missing -- ci/check-all.js treats a stale or absent build
 * as a skip, not a pass, for the same reason.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// jsdom is a jest devDependency, and the production build installs with
// --omit=dev. So on a build host this module is simply absent, and requiring it
// unconditionally took the whole BUILD down with "Cannot find module 'jsdom'" --
// a missing test dependency stopping a site deploy.
//
// A check that cannot run says so and stops. It does not throw, and it does not
// take the build with it.
let JSDOM = null;
try {
  ({ JSDOM } = require(path.join(__dirname, '..', 'netlify', 'functions', 'node_modules', 'jsdom')));
} catch (e) {
  console.log('  SKIP  jsdom is not installed (it is a devDependency).');
  console.log('        This check loads the built page and runs the real scripts against it,');
  console.log('        which needs a DOM. `npm ci` in netlify/functions, or run it where');
  console.log('        devDependencies are installed.');
  process.exit(0);   // a skip is not a failure; ci/check-all.js reads the line above
}

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'site', 'public', 'inventory', 'index.html');
const TRAY = path.join(ROOT, 'site', 'assets', 'js', 'compare-tray.js');
const SHORTLIST = path.join(ROOT, 'site', 'assets', 'js', 'shortlist.js');
const COMPARE = path.join(ROOT, 'site', 'assets', 'js', 'vehicleComparison.js');

function bail(message, hint) {
  console.log(`  SKIP  ${message}`);
  if (hint) console.log(`        ${hint}`);
  process.exit(1);
}

if (!fs.existsSync(PAGE)) {
  bail('site/public/inventory/index.html does not exist', 'Build the site first.');
}

const results = [];
const check = (label, pass, detail) => results.push({ label, pass, detail });

/** Run both scripts inside a live DOM, then hand the window to the assertions. */
function boot(html, url = 'http://preview.test/inventory/') {
  // The URL is used whole. It previously took an ORIGIN and appended
  // /inventory/ to it, so passing a url that already had a query string
  // produced /inventory/?compare=x/inventory/ -- and the shared-link assertion
  // below failed for that reason rather than because the feature is broken.
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const { window } = dom;

  // jsdom has no layout engine, so scrollIntoView is absent. The real script
  // calls it; stubbing it here is not hiding a defect in the script, it is
  // standing in for the browser.
  window.HTMLElement.prototype.scrollIntoView = function () {};
  if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:x';

  const run = (code) => window.eval(code);
  // The shared strip FIRST. It publishes window.CaddyPickTray, and both feature
  // scripts look for it while they render -- so loading it after them would
  // quietly exercise only their standalone fallbacks and every strip assertion
  // below would pass against a bar that no real page ever builds.
  run(fs.readFileSync(TRAY, 'utf8'));
  run(fs.readFileSync(SHORTLIST, 'utf8'));
  run(fs.readFileSync(COMPARE, 'utf8'));
  // Both scripts register on DOMContentLoaded; jsdom has already fired by the
  // time we eval, so dispatch it.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

const html = fs.readFileSync(PAGE, 'utf8');

// --- the markup, before any script runs -------------------------------------
const staticDom = new JSDOM(html).window.document;
const compareBtns = staticDom.querySelectorAll('[data-compare-toggle]');
const shortlistBtns = staticDom.querySelectorAll('[data-shortlist-toggle]');

check('every card has a Compare button', compareBtns.length > 0, `${compareBtns.length} found`);
check('every card has a Shortlist button', shortlistBtns.length > 0, `${shortlistBtns.length} found`);
check(
  'the two counts match, so no card has one and not the other',
  compareBtns.length === shortlistBtns.length,
  `${compareBtns.length} vs ${shortlistBtns.length}`
);
check(
  'the two buttons are not the same element',
  staticDom.querySelectorAll('[data-compare-toggle][data-shortlist-toggle]').length === 0,
  'a button carrying both attributes would mean the two features are still fused'
);
check('the comparison container exists', Boolean(staticDom.getElementById('comparison-app')));
check('the comparison has a live region for its status', Boolean(staticDom.getElementById('comparison-status')));
check(
  'the Compare button is labelled Compare, not Shortlist',
  (compareBtns[0] && compareBtns[0].textContent.trim()) === 'Compare',
  compareBtns[0] ? `"${compareBtns[0].textContent.trim()}"` : 'no button'
);

// --- behaviour: click Compare ----------------------------------------------
const win = boot(html);
const wdoc = win.document;
const table = wdoc.getElementById('comparison-table');

const firstCompare = wdoc.querySelector('[data-compare-toggle]');
const slug = firstCompare.dataset.compareToggle;

check(
  'the table is empty before anything is clicked',
  table && table.classList.contains('hidden'),
  table ? table.className : 'no table element'
);

firstCompare.click();

check(
  'clicking Compare fills the table',
  table && !table.classList.contains('hidden') && table.querySelector('table') !== null,
  table ? `${table.innerHTML.length} bytes of html` : 'no table'
);
check(
  'the filled table shows the car that was clicked',
  Boolean(table && table.textContent.includes(slug === '' ? '' : (firstCompare.closest('.vehicle-card') || {}).querySelector ? '' : '')) ||
    Boolean(table && table.querySelector('.comparison-table__name')),
  table && table.querySelector('.comparison-table__name')
    ? `"${table.querySelector('.comparison-table__name').textContent}"`
    : 'no column header'
);
check(
  'the Compare button reports itself as pressed',
  firstCompare.getAttribute('aria-pressed') === 'true',
  `aria-pressed="${firstCompare.getAttribute('aria-pressed')}"`
);
check(
  'the selection is in the URL, so the comparison can be shared',
  /[?&]compare=/.test(win.location.search),
  win.location.search || '(empty)'
);
check(
  'clicking Shortlist did NOT put this car in the comparison',
  table.querySelectorAll('tbody tr').length > 0,
  'a car added by the shortlist must not appear in the compare table'
);

// --- behaviour: click Shortlist, on a different car -------------------------
const otherShortlist = wdoc.querySelectorAll('[data-shortlist-toggle]')[1];
const before = table.querySelectorAll('thead th').length;
otherShortlist.click();
check(
  'clicking Shortlist does not change the comparison table',
  table.querySelectorAll('thead th').length === before,
  `${before} columns before and after`
);
check(
  'the Shortlist button reports itself as pressed',
  otherShortlist.getAttribute('aria-pressed') === 'true',
  `aria-pressed="${otherShortlist.getAttribute('aria-pressed')}"`
);
check(
  'the Shortlist button is labelled Shortlisted once pressed',
  otherShortlist.textContent.trim() === 'Shortlisted',
  `"${otherShortlist.textContent.trim()}"`
);
check(
  'the shortlist persisted to localStorage under its own key',
  Boolean(win.localStorage.getItem('caddy_shortlist')),
  win.localStorage.getItem('caddy_shortlist') || '(nothing stored)'
);
check(
  'the comparison is NOT stored in localStorage',
  !win.localStorage.getItem('caddy-ed:favourites'),
  'the two features keep their state apart: URL for compare, localStorage for shortlist'
);

// --- the maximum, and what happens at it ------------------------------------
// One car is already selected from the earlier click, so clicking the first
// FOUR of these toggles that one back off and leaves three. The limit is only
// reached by clicking a fifth, which is what this does -- the first version of
// this line clicked four and asserted the limit, which it never hit.
const allCompare = Array.from(wdoc.querySelectorAll('[data-compare-toggle]'));
allCompare.slice(0, 5).forEach((b) => b.click());
const status = wdoc.getElementById('comparison-status');
check(
  'comparing more than three says so in the live region',
  wdoc.querySelectorAll('#comparison-table thead th').length <= 4 && status && !status.hidden,
  status ? `"${status.textContent}"` : 'no status element'
);
check(
  'the limit is 3 cars, so 4 header cells is the label plus 3 cars',
  wdoc.querySelectorAll('#comparison-table thead th').length === 4,
  `${wdoc.querySelectorAll('#comparison-table thead th').length} cells`
);

// --- remove -----------------------------------------------------------------
const removeBtn = table.querySelector('[data-compare-remove]');
check('each car in the table has a Remove control', Boolean(removeBtn));
if (removeBtn) {
  const beforeRemove = wdoc.querySelectorAll('#comparison-table thead th').length;
  removeBtn.click();
  check(
    'removing a car takes it out of the table',
    wdoc.querySelectorAll('#comparison-table thead th').length === beforeRemove - 1,
    `${beforeRemove} -> ${wdoc.querySelectorAll('#comparison-table thead th').length}`
  );
}

// --- a shared link ----------------------------------------------------------
// A shared link: the page opened with ?compare= already in the URL.
const sharedWin = boot(
  html,
  'http://preview.test/inventory/?compare=' + encodeURIComponent(slug)
);
check(
  'a link carrying ?compare= opens with that car already in the table',
  Boolean(sharedWin.document.querySelector('#comparison-table table')),
  sharedWin.document.getElementById('comparison-table').className
);

// --- the strip: what the shopper can SEE they have chosen --------------------
// The complaint this answers: you can tick Compare on a car, and nothing at all
// happens. The table is at the bottom of the page, so a shopper with two cars
// chosen cannot see that, cannot see WHICH, and cannot take one back without
// finding the card again. Compare had no equivalent of the shortlist's bar.
//
// A fresh window, so the state here is three chosen cars and an empty
// shortlist, and the assertions do not inherit the clicking above.
const trayWin = boot(html, 'http://preview.test/inventory/');
const tdoc = trayWin.document;
const pickThree = Array.from(tdoc.querySelectorAll('[data-compare-toggle]')).slice(0, 3);
pickThree.forEach((b) => b.click());

const tray = tdoc.getElementById('pick-tray');
check('the strip exists once a car is chosen', Boolean(tray), tray ? tray.id : 'no #pick-tray');
check('...and it is visible', Boolean(tray) && !tray.hidden);

const compareChips = tdoc.querySelectorAll('[data-compare-tray-items] .shortlist__item');
check(
  'each chosen car is shown as a chip',
  compareChips.length === 3,
  `${compareChips.length} chips`
);
check(
  'the chip names the car, not just its slug',
  Array.from(compareChips).some((c) => c.textContent.trim().length > 4),
  compareChips[0] ? `"${compareChips[0].textContent.trim()}"` : 'none'
);
check(
  'the compare count reads 3',
  (tdoc.querySelector('[data-compare-tray-count]') || {}).textContent === '3',
  (tdoc.querySelector('[data-compare-tray-count]') || {}).textContent
);

// The master button, styled as the shortlist's own. One car is not a comparison,
// and the button says so rather than being silently inert.
const go = tdoc.querySelector('[data-compare-tray-go]');
check('the compare section has its own master button', Boolean(go));
check('...enabled once two cars are chosen', Boolean(go) && !go.disabled);
check(
  '...saying how many are going into the table',
  Boolean(go) && /3/.test(go.textContent),
  go ? `"${go.textContent}"` : 'none'
);

const oneWin = boot(html, 'http://preview.test/inventory/');
oneWin.document.querySelector('[data-compare-toggle]').click();
const goOne = oneWin.document.querySelector('[data-compare-tray-go]');
check(
  'with ONE car the button is disabled and says so',
  Boolean(goOne) && goOne.disabled && /one more/i.test(goOne.textContent),
  goOne ? `disabled=${goOne.disabled} "${goOne.textContent}"` : 'no button'
);

// A chip is a control, not decoration.
const chipRemove = tdoc.querySelector('[data-compare-tray-remove]');
check('each chip has its own remove control', Boolean(chipRemove));
if (chipRemove) {
  const before = tdoc.querySelectorAll('[data-compare-tray-items] .shortlist__item').length;
  chipRemove.click();
  const after = tdoc.querySelectorAll('[data-compare-tray-items] .shortlist__item').length;
  check('removing a chip takes that car out of the strip', after === before - 1, `${before} -> ${after}`);
  check(
    '...and out of the table too, not just the chips',
    tdoc.querySelectorAll('#comparison-table thead th').length === after + 1,
    `${tdoc.querySelectorAll('#comparison-table thead th').length} header cells`
  );
}

// ONE bar, not two. This is the whole reason the strip is shared: two fixed
// bottom strips sit on top of each other, and the top one takes every click.
const bothWin = boot(html, 'http://preview.test/inventory/');
bothWin.document.querySelector('[data-compare-toggle]').click();
// Array.from, not .slice() on the NodeList. A NodeList has no slice method, so
// this threw before any assertion below ran -- which is why "39 assertions"
// could have been 39 assertions that never executed.
Array.from(bothWin.document.querySelectorAll('[data-shortlist-toggle]')).slice(0, 2).forEach((b) => b.click());
const bdoc = bothWin.document;
check(
  'compare AND shortlist share ONE strip, not two overlapping bars',
  bdoc.querySelectorAll('.shortlist[id]').length === 1,
  `${bdoc.querySelectorAll('.shortlist[id]').length} strips`
);
check(
  '...with both sections shown: compare chips and a shortlist swatch row',
  bdoc.querySelectorAll('[data-compare-tray-items] .shortlist__item').length === 1 &&
    bdoc.querySelectorAll('[data-shortlist-tray-thumbs] li').length === 2,
  `${bdoc.querySelectorAll('[data-compare-tray-items] .shortlist__item').length} compare chips / ` +
    `${bdoc.querySelectorAll('[data-shortlist-tray-thumbs] li').length} shortlist swatches`
);
check(
  '...and each section has its own master button',
  Boolean(bdoc.querySelector('[data-compare-tray-go]')) &&
    Boolean(bdoc.querySelector('[data-shortlist-tray-send]'))
);
check(
  'the body reserves room for the strip, so the last row of cards stays clickable',
  bdoc.body.classList.contains('has-shortlist'),
  bdoc.body.className || '(no class)'
);

// Clear empties the compare section and the strip goes with it.
// Clear empties the compare section, and the strip goes with it. Nothing is
// shortlisted in this window, so there is nothing left to show -- a bar sitting
// there saying "0 cars" is noise, and it also sits over the bottom row of cards.
const clearBtn = tdoc.querySelector('[data-compare-tray-clear]');
check('the compare section has a Clear control', Boolean(clearBtn));
if (clearBtn) {
  clearBtn.click();
  const strip = tdoc.getElementById('pick-tray');
  check(
    'clearing with nothing else chosen takes the strip away entirely',
    strip.hidden && !tdoc.body.classList.contains('has-shortlist'),
    `hidden=${strip.hidden} body="${tdoc.body.className}"`
  );
}

// THE RAIL: a second surface for the same store
// --------------------------------------------------
// The shortlist appears in two places -- the bottom strip, and the filter rail.
// The strip does not exist until something is saved, so it can never tell
// anybody the feature is there; the rail is where a visitor is already reading
// controls.
//
// Both are rendered from one store, so they cannot disagree -- in principle.
// That is precisely the thing worth asserting, because two renderers reading
// one store is exactly how two surfaces start disagreeing: one gets a change
// and the other does not, and it looks right until the second click.
const railWin = boot(html, 'http://preview.test/inventory/');
const rdoc = railWin.document;
const railItems = rdoc.querySelector('[data-shortlist-rail-items]');
check('the filter rail has a shortlist region', Boolean(railItems));
check(
  '...and it starts empty, with an explanation rather than a blank box',
  railItems && railItems.hidden === true &&
    Boolean(rdoc.querySelector('[data-shortlist-rail-empty]'))
);

Array.from(rdoc.querySelectorAll('[data-shortlist-toggle]')).slice(0, 2).forEach((b) => b.click());

check(
  'shortlisting a car shows it in the rail',
  rdoc.querySelectorAll('[data-shortlist-rail-items] li').length === 2,
  `${rdoc.querySelectorAll('[data-shortlist-rail-items] li').length} rail chips`
);
check(
  '...and the rail empties its own placeholder',
  rdoc.querySelector('[data-shortlist-rail-empty]').hidden === true
);
check(
  '...and offers its Send control once there is something to send',
  rdoc.querySelector('[data-shortlist-rail-actions]').hidden === false
);

// THE ONE THAT MATTERS: the two surfaces agree.
check(
  'the rail and the strip show the SAME number of cars',
  rdoc.querySelectorAll('[data-shortlist-rail-items] li').length ===
    Number((rdoc.querySelector('[data-shortlist-tray-count]') || {}).textContent),
  `rail ${rdoc.querySelectorAll('[data-shortlist-rail-items] li').length} vs ` +
    `strip ${(rdoc.querySelector('[data-shortlist-tray-count]') || {}).textContent}`
);

// ...and they stay in step when the store changes, in BOTH directions.
const railRemove = rdoc.querySelector('[data-rail-remove]');
check('a rail chip has its own remove control', Boolean(railRemove));
if (railRemove) {
  railRemove.click();
  check(
    'removing from the RAIL takes the car out of the STRIP too',
    rdoc.querySelectorAll('[data-shortlist-rail-items] li').length === 1 &&
      Number((rdoc.querySelector('[data-shortlist-tray-count]') || {}).textContent) === 1,
    `rail ${rdoc.querySelectorAll('[data-shortlist-rail-items] li').length}, ` +
      `strip ${(rdoc.querySelector('[data-shortlist-tray-count]') || {}).textContent}`
  );
}

// The strip's shortlist section carries the mockup's form: swatches, names,
// and its two actions. No per-car removes and no Clear -- the mockup's tray
// has neither, and the rail's list and Clear are those controls (the test
// above just drove one). What it does carry is a swatch per car, each one
// linking to the car it stands for.
const backWin = boot(html, 'http://preview.test/inventory/');
Array.from(backWin.document.querySelectorAll('[data-shortlist-toggle]')).slice(0, 2).forEach((b) => b.click());
check(
  'the shortlist section carries no per-car removes and no Clear',
  backWin.document.querySelectorAll('[data-shortlist-tray-section] .shortlist__remove').length === 0 &&
    backWin.document.querySelectorAll('[data-shortlist-tray-section] [data-shortlist-tray-clear]').length === 0
);
const swatchLinks = backWin.document.querySelectorAll('[data-shortlist-tray-thumbs] a[href*="/inventory/"]');
check('each swatch links to its car', swatchLinks.length === 2, `${swatchLinks.length} swatch links`);

const railChipText = (rdoc.querySelector('[data-shortlist-rail-items] li') || {}).textContent || '';
check(
  'a rail chip names the car rather than showing a slug',
  railChipText.trim().length > 4,
  `"${railChipText.trim()}"`
);

// --- the popup ---------------------------------------------------------------
// "Compare N" opens the comparison over the page rather than pointing at the
// table further down it, which is the difference between a Compare button and
// a bookmark. The dialog renders the same markup as the inline table, so the
// header-cell counts above are scoped to #comparison-table.
const popWin = boot(html, 'http://preview.test/inventory/');
const pdoc = popWin.document;
Array.from(pdoc.querySelectorAll('[data-compare-toggle]')).slice(0, 2).forEach((b) => b.click());
const pdlg = pdoc.getElementById('comparison-dialog');
check('the comparison dialog exists in the markup', Boolean(pdlg));
pdoc.querySelector('[data-compare-tray-go]').click();
check('Compare opens the dialog', Boolean(pdlg) && pdlg.open === true);
check(
  'the dialog carries the same two cars',
  Boolean(pdlg) && pdlg.querySelectorAll('#comparison-dialog-body thead th').length === 3,
  pdlg ? `${pdlg.querySelectorAll('#comparison-dialog-body thead th').length} header cells` : 'no dialog'
);
pdoc.querySelector('[data-compare-dialog-close]').click();
check('Close closes it', Boolean(pdlg) && pdlg.open === false);

console.log('');
for (const r of results) {
  const mark = r.pass ? 'ok  ' : 'FAIL';
  const detail = r.detail === undefined || r.detail === null || r.detail === '' ? '' : `   (${r.detail})`;
  console.log(`  ${mark} ${r.label}${detail}`);
}
const failed = results.filter((r) => !r.pass);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} passed against the built page`);

if (failed.length) {
  console.error('  COMPARE AND SHORTLIST ARE NOT TWO WORKING FEATURES.');
  console.error('  This is behavioural: the built HTML is loaded, both real scripts run,');
  console.error('  and the buttons are clicked. A build cannot catch any of it.');
  process.exit(1);
}
console.log('  OK: two buttons, two features, neither one stealing the other.');
