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
const drift = [];
const deadAssets = [];   // unreferenced media shipped on every deploy   // design-system consistency, reported separately

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

// --- critical CSS must agree with the design system -----------------------
// site/layouts/partials/critical-css.html inlines a handful of custom
// properties so the first paint is not white-on-white. It is a hand-maintained
// duplicate of six lines of main.css's :root, and it has drifted before: the
// previous version defined --primary-color / --secondary-color / --text-color,
// none of which exist in main.css, while hardcoding a light background on a
// site that is dark-mode aware.
//
// Nothing but a check stops that recurring, so compare the two.
const CRITICAL = path.join(ROOT, 'site', 'layouts', 'partials', 'critical-css.html');
const MAIN_CSS = path.join(ROOT, 'site', 'assets', 'css', 'main.css');

function rootTokens(file) {
  try {
    // Comments must go first. The inline block documents each value with a
    // trailing `/* main.css: --bg: var(--grey-0); --grey-0:#ffffff */`, and
    // without stripping them the parser reads `--grey-0: #ffffff */` out of a
    // comment and reports a phantom token.
    const text = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // the FIRST :root block is the light/default one
    const m = text.match(/:root\s*\{([\s\S]*?)\n\s*\}/);
    if (!m) return null;
    const out = new Map();
    for (const t of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(t[1], t[2].replace(/\s+/g, ' ').trim());
    }
    return out;
  } catch {
    return null;
  }
}

if (fs.existsSync(CRITICAL) && fs.existsSync(MAIN_CSS)) {
  const crit = rootTokens(CRITICAL);
  const main = rootTokens(MAIN_CSS);
  if (!crit) {
    drift.push(
      'site/layouts/partials/critical-css.html: no :root block found -- the inline first-paint tokens are gone'
    );
  } else if (main) {
    const unknown = [...crit.keys()].filter((k) => !main.has(k));
    if (unknown.length) {
      drift.push(
        `site/layouts/partials/critical-css.html: defines token(s) main.css does not -- ${unknown.join(', ')}. ` +
          `A token main.css never reads is a stale duplicate.`
      );
    }
    // Compare only the tokens whose main.css value is a literal. A var()
    // reference cannot be compared without evaluating the chain, and chasing
    // that here would need a CSS parser.
    const mismatched = [];
    for (const [k, v] of crit) {
      const mv = main.get(k);
      if (mv === undefined || mv.includes('var(')) continue;
      const norm = (s) => s.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm(v) !== norm(mv)) mismatched.push(`${k}: critical ${v} vs main.css ${mv}`);
    }
    if (mismatched.length) {
      drift.push(
        `site/layouts/partials/critical-css.html: token value(s) disagree with main.css -- ${mismatched.join('; ')}`
      );
    }
  }
}

// --- unreferenced static assets -------------------------------------------
// Everything in site/static/ is copied verbatim into every deploy, whether or
// not a page uses it. After the Kaldi Coffee pages were removed, 3.53 MB across
// 26 files shipped on every build: products-grid*.jpg, about-*.jpg,
// blog-*.jpg, four unused headshots, a Cadillac wallpaper, five social icons
// for a footer with no social links.
//
// A build gate cannot see this -- the files are legitimately part of the
// output. Only comparing the source tree against the built HTML can.
//
// Browsers and platforms request a few paths by convention rather than by
// markup (favicon.ico, mstile tiles, safari-pinned-tab), so those are exempt.
const CONVENTIONAL = new Set([
  'favicon.ico',
  'safari-pinned-tab.svg',
  'site.webmanifest',
  'browserconfig.xml',
  'robots.txt',
]);

// Only media, and only files a browser fetches by URL rather than a script
// resolving at runtime.
//
// site/static also holds the Decap CMS bundle (~5.9 MB including the Squoosh
// wasm). Its webpack chunks reference each other by numeric filename from
// inside cms.js, so a basename scan cannot see those references and reports
// 111 phantom orphans. A JS chunk is resolved by code; an <img> is requested by
// a URL, and that is the case worth catching.
const MEDIA = /\.(?:jpe?g|png|svg|gif|webp|avif|ico)$/i;
const URL_REQUESTED = new Set([
  'cms.html', // the CMS entry point, linked from /admin/cms
  'robots.txt',
  'sw.js', // registered by sw-register.js
  'manifest.json',
]);

function assetBasenames() {
  const out = new Map();
  for (const f of walk(path.join(ROOT, 'site', 'static'), () => true)) {
    const name = path.basename(f);
    if (!MEDIA.test(name) && !URL_REQUESTED.has(name)) continue;
    out.set(name, fs.statSync(f).size);
  }
  return out;
}

/** Every asset path any built page, config, manifest or template mentions. */
function referencedAssets() {
  const refs = new Set();
  const add = (text) => {
    // /img/foo.png, /images/foo.png, /assets/foo.css -- and the root-level
    // files a page or a manifest requests by bare name (/sw.js, /cms.html,
    // /manifest.json). Missing the second form flagged the PWA icons, which
    // site.webmanifest references by path, as orphans.
    for (const m of text.matchAll(
      /\/?(?:img|images|assets)\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+|\/(?:sw|sw-register|cms)\.[a-z]+|\/manifest\.json/g
    )) {
      refs.add(path.basename(m[0]));
    }
  };
  const pub = path.join(ROOT, 'site', 'public');
  if (fs.existsSync(pub)) {
    for (const f of walk(pub, (p) => /\.(html|json|xml|webmanifest|txt|css|js)$/.test(p))) {
      add(fs.readFileSync(f, 'utf8'));
    }
  }
  // The manifests name assets by path and are the only thing that references
  // the PWA icon set and the Windows tiles.
  for (const f of walk(path.join(ROOT, 'site', 'static'), (p) =>
    /\.(?:webmanifest|xml|json|txt)$/.test(p)
  )) {
    add(fs.readFileSync(f, 'utf8'));
  }
  for (const f of [
    path.join(ROOT, 'site', 'config.toml'),
    path.join(ROOT, 'netlify.toml'),   // [[redirects]] name /cms.html and /health
    ...walk(path.join(ROOT, 'site', 'content'), (p) => p.endsWith('.md')),
    ...walk(path.join(ROOT, 'site', 'layouts'), (p) => p.endsWith('.html')),
    ...walk(path.join(ROOT, 'site', 'assets'), (p) => /\.(css|js)$/.test(p)),
  ]) {
    if (fs.existsSync(f)) add(fs.readFileSync(f, 'utf8'));
  }
  return refs;
}

const staticAssets = assetBasenames();
const referenced = referencedAssets();
const orphans = [...staticAssets.entries()].filter(
  ([name]) => !referenced.has(name) && !CONVENTIONAL.has(name)
);

if (orphans.length) {
  const bytes = orphans.reduce((a, [, s]) => a + s, 0);
  deadAssets.push(
    `${orphans.length} unreferenced file(s) in site/static/ ship on every deploy ` +
      `(${(bytes / 1024 / 1024).toFixed(2)} MB): ` +
      orphans
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([n, s]) => `${n} (${Math.round(s / 1024)}K)`)
        .join(', ') +
      (orphans.length > 12 ? `, +${orphans.length - 12} more` : '')
  );
}

// --- element ids the front end binds but no template renders ----------------
//
// The contact form's submit handler was bound to `#contact-form`, and the layout
// rendered `<form class="contact-form">` with no id. The handler matched
// nothing, so the fetch, the success state, the error state and the
// network-error state were all dead on the site's primary conversion form --
// and `document.querySelector('#form-error').textContent` would have thrown on
// null even if the form had submitted.
//
// Nothing caught it. The page built, the asset gate was green, the function
// existed and was reachable. Both halves are valid; they simply disagree, and
// only a check that reads one and compares it to the other sees that.
function reachableJs() {
  const JS_ROOT = path.join(ROOT, 'site', 'assets', 'js');
  const entries = [];

  // The GLOBAL bundle. assets.html builds site/assets/js/index.js onto every
  // page and it is declared in no front matter, so a check that only reads
  // `scripts:` cannot see the largest JavaScript file on the site. That is the
  // same blind spot the endpoint gate had, and it is why this check passed
  // straight over the very regression it was written for: index.js is what
  // binds #contact-form.
  if (fs.existsSync(path.join(JS_ROOT, 'index.js'))) entries.push('index.js');

  for (const f of walk(path.join(ROOT, 'site', 'content'), (p) => p.endsWith('.md'))) {
    const t = fs.readFileSync(f, 'utf8');
    const m = t.match(/^scripts:\s*((?:\s*-\s*\S+\s*)+)/m);
    if (m) for (const s of m[1].matchAll(/-\s*(\S+)/g)) entries.push(s[1]);
  }
  const seen = new Set();
  const stack = entries.map((rel) => ({ rel, importer: null }));
  const find = (rel, importer) => {
    const cands = importer
      ? [
          path.resolve(JS_ROOT, rel),
          path.resolve(path.dirname(importer), rel),
          path.resolve(path.dirname(importer), rel + '.js'),
        ]
      : [path.resolve(JS_ROOT, rel), path.resolve(JS_ROOT, rel + '.js')];
    return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
  };
  while (stack.length) {
    const next = stack.pop();
    const f = find(next.rel, next.importer);
    if (!f || seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:'"\`\/])\/\/[^\n]*/g, '$1 ');
    const re = /(?:from|import)\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of src.matchAll(re)) {
      const r = m[1] || m[2];
      if (r.startsWith('.')) stack.push({ rel: r, importer: f });
    }
  }
  return [...seen];
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\`\/])\/\/[^\n]*/g, '$1 ');
}

const danglingIds = [];
{
  const jsFiles = reachableJs();
  const rendered = new Set();
  for (const f of [
    ...walk(path.join(ROOT, 'site', 'layouts'), (p) => p.endsWith('.html')),
    ...walk(path.join(ROOT, 'site', 'content'), (p) => /\.(md|html)$/.test(p)),
  ]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bid=["']([^"']+)["']/g)) rendered.add(m[1]);
    for (const m of src.matchAll(/\bid=(?:printf[^\n]*?|"([\w-]+)"|\s+([\w-]+))/g)) {
      if (m[1]) rendered.add(m[1]);
      if (m[2]) rendered.add(m[2]);
    }
  }
  for (const f of jsFiles) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const used = new Set();
    for (const m of src.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) used.add(m[1]);
    for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"]#([\w-]+)['"]/g)) used.add(m[1]);

    // A module may render its own UI. advanced-search.js builds
    // `<div id="search-status">` and `<div id="results-list">` inside a template
    // string and then queries both. The first version of this check knew only
    // about templates and content, and reported 95 dangling ids -- almost all
    // of them this pattern, which is correct code.
    //
    // So an id the SAME file emits counts as rendered. The defect this check
    // exists for is narrower than it first appeared: an id bound in one file
    // and rendered by nothing at all.
    const selfRendered = new Set();
    for (const m of src.matchAll(/\bid=["']([\w-]+)["']/g)) selfRendered.add(m[1]);

    for (const id of used) {
      if (!rendered.has(id) && !selfRendered.has(id)) {
        danglingIds.push(
          path.relative(ROOT, f) +
            ' binds #' + id +
            ', which no layout, content file or template string in this module renders'
        );
      }
    }
  }
}
if (danglingIds.length) {
  drift.push(
    danglingIds.length +
      ' element id(s) bound by the front end but rendered nowhere:\n' +
      danglingIds.map((d) => '      ' + d).join('\n') +
      '\n      A bound id that nothing renders is a silently dead code path.'
  );
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

if (deadAssets.length) {
  console.log(`\n  ${ylw('WARN')}  ${deadAssets[0]}`);
}

if (drift.length) {
  console.error(`\n  ${red('FAIL')}  ${drift.length} design-system consistency problem(s):\n`);
  for (const d of drift) console.error(`    ${d}`);
  console.error(
    `\n    ${dim('critical-css.html inlines a hand-maintained copy of six main.css tokens so the')}\n` +
      `    ${dim('first paint is not white-on-white. It must not drift. Fix the value, not the check.')}\n`
  );
  process.exitCode = 1;
} else if (fs.existsSync(CRITICAL)) {
  console.log(
    `  ${grn('OK')}    critical-css.html tokens agree with main.css (${rootTokens(CRITICAL).size} checked)`
  );
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
