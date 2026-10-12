#!/usr/bin/env node
/**
 * check-admin-portal.js -- the admin portal stays linked and honest.
 *
 * WHY THIS EXISTS
 * ---------------
 * The hub (/admin/) and the nav on every admin page both render from
 * partials/admin-sections.html, and the whole point of that file is that a
 * page added to site/content/admin/ appears in BOTH places or the build
 * fails here. A portal whose front door 404s is the exact failure this
 * replaces, so the property is checked rather than trusted to memory.
 *
 * WHAT IT CHECKS
 * --------------
 *   - every content/admin/*.md page is named exactly once in admin-sections
 *   - every route named there resolves: an /admin/<x>/ url to a built page
 *     (or its content file), /admin/cms to cms.html
 *   - every page's declared scripts and styles exist under assets/
 *   - the BUILT hub links every page; a normal admin page's nav does too,
 *     with is-current on its own link
 *
 * Run:  node ci/check-admin-portal.js   (needs a build in site/public/)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'site', 'content', 'admin');
const SECTIONS = path.join(ROOT, 'site', 'layouts', 'partials', 'admin-sections.html');
const PUBLIC_ADMIN = path.join(ROOT, 'site', 'public', 'admin');
const PUBLIC = path.join(ROOT, 'site', 'public');

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

const pages = fs.readdirSync(ADMIN_DIR).filter((f) => f.endsWith('.md') && f !== '_index.md').map((f) => f.replace(/\.md$/, ''));
const sections = fs.readFileSync(SECTIONS, 'utf8');
const urls = [...sections.matchAll(/"url"\s+"(\/admin\/[^"]*)"/g)].map((m) => m[1]);

// 1. every page named exactly once
const missingFromSections = pages.filter((p) => !urls.includes('/admin/' + p + '/'));
check('every admin page is named in admin-sections', missingFromSections.length === 0, missingFromSections.join(', '));
const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
check('no route is named twice', dupes.length === 0, dupes.join(', '));
const inventoryUrl = urls.includes('/admin/inventory/');
check('the inventory editor is on the portal', inventoryUrl);

// 2. every route resolves
const unresolved = [];
for (const u of urls) {
  if (u === '/admin/cms') {
    if (!fs.existsSync(path.join(PUBLIC, 'cms.html'))) unresolved.push(u + ' (cms.html)');
    continue;
  }
  const slug = u.replace('/admin/', '').replace(/\/$/, '');
  const built = fs.existsSync(path.join(PUBLIC_ADMIN, slug, 'index.html'));
  const source = fs.existsSync(path.join(ADMIN_DIR, slug + '.md'));
  if (!built && !source) unresolved.push(u);
  else if (!built) unresolved.push(u + ' (no built page)');
}
check('every route in admin-sections resolves to a built page', unresolved.length === 0, unresolved.join(', '));

// 3. declared scripts and styles exist
const assetProblems = [];
for (const p of pages) {
  const text = fs.readFileSync(path.join(ADMIN_DIR, p + '.md'), 'utf8');
  const scripts = text.match(/scripts:\s*\n((?:\s*-\s*[A-Za-z0-9][\w./-]*\s*\n?)+)/);
  const styles = text.match(/styles:\s*\n((?:\s*-\s*[A-Za-z0-9][\w./-]*\s*\n?)+)/);
  for (const block of [scripts, styles]) {
    if (!block) continue;
    for (const line of block[1].split('\n')) {
      const rel = line.replace(/^\s*-\s*/, '').trim();
      if (!rel) continue;
      const candidates = block === scripts
        ? [path.join(ROOT, 'site', 'assets', 'js', rel)]
        : [path.join(ROOT, 'site', 'assets', 'css', rel), path.join(ROOT, 'site', 'assets', 'css', 'components', rel)];
      if (!candidates.some((c) => fs.existsSync(c))) assetProblems.push(p + ' -> ' + rel);
    }
  }
}
check('every declared admin script/style exists', assetProblems.length === 0, assetProblems.join(', '));

// 4. the built hub links every page
const hubPath = path.join(PUBLIC_ADMIN, 'index.html');
if (!fs.existsSync(hubPath)) {
  check('built hub exists (run a build first)', false, 'missing ' + hubPath);
} else {
  const hub = fs.readFileSync(hubPath, 'utf8');
  const unlinked = pages.filter((p) => !new RegExp('href="?/admin/' + p + '/"?').test(hub));
  check('the built hub links every admin page', unlinked.length === 0, unlinked.join(', '));
  check('the hub links the inventory editor', new RegExp('href="?/admin/inventory/"?').test(hub));
  const cards = (hub.match(/class=admin-hub-card[ ">]/g) || []).length;
  const expected = urls.length;
  check('one card per named route', cards === expected, cards + ' cards, ' + expected + ' routes');

  // 5. a normal page's nav: complete + current marked
  const favPath = path.join(PUBLIC_ADMIN, 'favourites', 'index.html');
  if (fs.existsSync(favPath)) {
    const fav = fs.readFileSync(favPath, 'utf8');
    const navUnlinked = pages.filter((p) => !new RegExp('href="?/admin/' + p + '/"?').test(fav));
    check('a normal admin page nav links every admin page', navUnlinked.length === 0, navUnlinked.join(', '));
    check('the current page carries is-current + aria-current', fav.includes('is-current') && fav.includes('aria-current=page'));
  } else {
    check('built favourites page exists (run a build first)', false);
  }
}

// 6. the menu ships hidden and is revealed only after a session check
//    (2026-10-12): it also sits at the top of the page, above the title.
for (const [label, rel] of [['dashboard', path.join('admin', 'dashboard', 'index.html')], ['sign-in', path.join('admin', 'sign-in', 'index.html')]]) {
  const p = path.join(PUBLIC, rel);
  if (!fs.existsSync(p)) { check('built ' + label + ' page exists for the nav checks', false, p); continue; }
  const html = fs.readFileSync(p, 'utf8');
  const navTag = html.match(/<nav[^>]*data-admin-nav[^>]*>/);
  check('the nav ships hidden on the ' + label + ' page', Boolean(navTag) && /\bhidden\b/.test(navTag[0]), navTag ? navTag[0].slice(0, 140) : 'no nav tag');
  check('the reveal script is wired on the ' + label + ' page', /js\/admin-nav[.\"']/.test(html));
  if (label === 'dashboard') {
    const navAt = html.indexOf('data-admin-nav');
    const headAt = html.indexOf('admin-header');
    check('the nav sits above the page title', navAt !== -1 && headAt !== -1 && navAt < headAt, 'navAt ' + navAt + ' headAt ' + headAt);
  }
}

// 7. the signed-in view of the sign-in page keeps its profile-panel contract
{
  const p = path.join(PUBLIC, 'admin', 'sign-in', 'index.html');
  if (fs.existsSync(p)) {
    const html = fs.readFileSync(p, 'utf8');
    check('sign-in page keeps the profile panel (who + details + dashboard link)',
      html.includes('sign-in-who') && html.includes('sign-in-details') && /href="?\/admin\/dashboard/.test(html));
  } else {
    check('built sign-in page exists for the profile-panel check', false, p);
  }
}

const failed = results.filter((x) => !x.pass);
for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
process.exit(failed.length ? 1 : 0);
