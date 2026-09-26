#!/usr/bin/env node
/**
 * verify-content.js -- source-tree checks that no build output check can make.
 *
 * The site is a fork of Netlify's `victor-hugo` starter. The fork kept the
 * demo content, the demo layouts and the demo CSS framework:
 *
 *   site/content/products/_index.md   "Our Coffee" -- the Kaldi Coffee demo
 *                                     page: 37 mentions of coffee, a pricing
 *                                     table selling 3 lbs/month, testimonials
 *                                     from Elisabeth Kaurismäki.
 *   site/content/values/_index.md     "Shade-grown coffee", "Single origin",
 *                                     "Direct sourcing", "Reinvest profits".
 *   site/content/tech.md              a Hugo boilerplate advert linking to
 *                                     netlify-templates/victor-hugo and
 *                                     hotlinking a cloudfront.net logo.
 *
 * None of it was in the navigation, so nobody noticed -- but all three
 * published to /products/, /values/ and /tech/ and would have gone live on
 * caddyed.com. A build-output gate cannot see this: the pages built cleanly.
 *
 * It also checks for the Tachyons utility framework. 25 layouts used classes
 * like `ph3`, `mv4`, `f2`, `bg-off-white`; Tachyons itself was never loaded,
 * so all of that markup rendered unstyled. The classes are the evidence, not
 * the bug -- so this reports them as warnings with a count, and the hard fail
 * is on content contamination.
 *
 * Usage: node ci/verify-content.js [--strict]
 *   --strict  treat Tachyons usage as a failure too
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict');

// ---------------------------------------------------------------------------
// 1. Starter-template content contamination -- HARD FAIL.
//
// A dealership site publishing a coffee shop's pricing page is a
// credibility-ending bug that no automated test would ever have caught, which
// is exactly why it needs a check.
// ---------------------------------------------------------------------------
const CONTENT_MARKERS = [
  // Kaldi Coffee / victor-hugo demo copy
  { re: /\bkaldi\b/i, why: 'Kaldi Coffee (the victor-hugo demo brand)' },
  { re: /\bcoffee\b|\bespresso\b|\bbarista|\broast(ed|ing)?\b|\bbeans?\b|\bbrewing\b/i, why: 'coffee-shop copy' },
  { re: /netlify-templates?\//i, why: 'a link to the Netlify starter template' },
  { re: /victor[-_ ]?hugo/i, why: 'the starter template name' },
  { re: /a hugo boilerplate|hugo boilerplate for creating/i, why: 'starter template boilerplate text' },
  // Generic demo scaffolding
  { re: /lorem ipsum/i, why: 'lorem ipsum placeholder copy' },
  { re: /\bTODO:\s*replace\b|\bFIXME:\s*replace\b/i, why: 'an unreplaced authoring note' },
];

// Content that legitimately discusses commerce-adjacent words is unlikely, but
// `beans` and `roast` could appear in a real vehicle description ("roast
// aftermarket"). Only flag them on files that look like demo pages, which is
// what the strong markers already do. The weak ones are reported as warnings.
const WEAK = new Set([2, 3, 4, 5, 6]);

function walk(dir, filter, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(p, filter, out);
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

const problems = [];
const warnings = [];

// --- content contamination -------------------------------------------------
const contentFiles = walk(path.join(ROOT, 'site', 'content'), (p) => /\.(md|html)$/.test(p));
let contaminated = 0;

for (const file of contentFiles) {
  const rel = path.relative(ROOT, file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  // Front matter is authored by us; the body is what ships.
  const body = text.startsWith('---') ? text.split('---').slice(2).join('---') : text;
  const hits = [];
  CONTENT_MARKERS.forEach((m, i) => {
    if (m.re.test(body)) hits.push({ i, why: m.why });
  });
  if (!hits.length) continue;

  const strong = hits.filter((h) => !WEAK.has(h.i));
  if (strong.length) {
    contaminated += 1;
    problems.push(
      `${rel}: starter-template content -- ${strong.map((h) => h.why).join('; ')}`
    );
  } else {
    warnings.push(`${rel}: possible demo copy -- ${hits.map((h) => h.why).join('; ')}`);
  }
}

// --- Tachyons utility classes ---------------------------------------------
// These are the classes of the Tachyons CSS framework. Tachyons is not a
// dependency of this project and is not loaded, so every one of them renders
// as a no-op. They are the fingerprint of un-ported starter markup.
//
// Matching is done against class ATTRIBUTE VALUES ONLY. Scanning raw template
// text produced pure noise -- "Skip to content link" matched the `link`
// utility, "Hugo cannot measure the file" matched `measure` -- because the
// vocabulary contains ordinary English words (`link`, `measure`, `dim`,
// `center`, `b`, `i`). A warning that cries wolf gets ignored, so the tokens
// are pulled out of class="" first and matched as whole tokens after that.
const TACHYONS = new Set(
  ('ph0 ph1 ph2 ph3 ph4 ph5 pv0 pv1 pv2 pv3 pv4 pv5 pa0 pa1 pa2 pa3 pa4 pa5 ' +
    'pb0 pb1 pb2 pb3 pb4 pb5 mt0 mt1 mt2 mt3 mt4 mt5 mb0 mb1 mb2 mb3 mb4 mb5 ' +
    'mw1 mw2 mw3 mw4 mw5 mw6 mw7 mv0 mv1 mv2 mv3 ' +
    'f1 f2 f3 f4 f5 f6 f7 fs-headings fw1 fw2 fw3 fw4 fw5 fw6 fw7 ' +
    'lh-title lh-copy lh-solid br1 br2 br-pill ba db dn dib di dib--tl dt fl ' +
    'center tc ttc measure measure-wide tracked tracked--top ' +
    'bg-off-white bg-light-gray near-white link dim shadow-1 shadow-2 shadow-3 ' +
    'w-100 w-100-l w-auto w-auto-ns raise i b'
  )
    .split(/\s+/)
    .filter(Boolean)
);

const layoutFiles = walk(path.join(ROOT, 'site', 'layouts'), (p) => p.endsWith('.html'));
const tachyonsUsers = [];
for (const file of layoutFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const tokens = new Set();
  for (const m of text.matchAll(/class="([^"{}]*)"/g)) {
    for (const tok of m[1].split(/\s+/)) {
      if (TACHYONS.has(tok)) tokens.add(tok);
    }
  }
  if (tokens.size) tachyonsUsers.push([path.relative(ROOT, file), tokens]);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[1;31m${s}\x1b[0m`;
const ylw = (s) => `\x1b[1;33m${s}\x1b[0m`;
const grn = (s) => `\x1b[1;32m${s}\x1b[0m`;

console.log(`\n  Source content check (${contentFiles.length} content, ${layoutFiles.length} layout file(s))`);

if (problems.length) {
  console.error(`\n  ${red('FAIL')}  ${problems.length} starter-template content problem(s):\n`);
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    `\n    This site is a fork of Netlify's victor-hugo starter. Demo pages from\n` +
      `    that template must not reach production. Delete the file, or rewrite it.\n`
  );
  process.exitCode = 1;
} else {
  console.log(`  ${grn('OK')}    no starter-template content in site/content`);
}

if (warnings.length) {
  console.log(`\n  ${ylw('WARN')}  ${warnings.length} file(s) with possible demo copy:`);
  for (const w of warnings) console.log(`    ${w}`);
}

if (tachyonsUsers.length) {
  const total = tachyonsUsers.reduce((a, [, n]) => a + n.size, 0);
  const msg = `${tachyonsUsers.length} layout file(s) use ${total} distinct Tachyons utility classes, which are never loaded`;
  if (STRICT) {
    console.error(`\n  ${red('FAIL')}  ${msg}:`);
    for (const [f, n] of tachyonsUsers) console.error(`    ${f}: ${[...n].sort().join(' ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${ylw('WARN')}  ${msg}:`);
    for (const [f, n] of tachyonsUsers) console.log(`    ${dim(`${f}: ${[...n].sort().join(' ')}`)}`);
    console.log(
      `    ${dim('Run with --strict to make this a failure. Port them to design-system classes,')}`
    );
    console.log(`    ${dim('or delete the layout if the page it served was demo content.')}`);
  }
} else {
  console.log(`  ${grn('OK')}    no Tachyons utility classes in any layout`);
}

if (process.exitCode) {
  console.error(`\n  ${red('CONTENT VERIFICATION FAILED')}\n`);
} else {
  console.log(`\n  ${grn('CONTENT VERIFICATION PASSED')}\n`);
}
