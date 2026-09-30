#!/usr/bin/env node
/**
 * front-end-graph.js -- what the front end actually loads.
 *
 * WHY A GRAPH AND NOT A GREP
 * ---------------------------
 * The first attempt at this was `grep` for each filename across every other
 * file. It reported 29 of 68 JS files as "referenced by nothing", including
 * `main.js`'s own imports:
 *
 *     import { initializeModals } from './utils';
 *     import Notification from './components/notification';
 *
 * There is no `.js` in either specifier, so a filename search finds neither. A
 * report that says a file nothing loads, when the site entry point loads it on
 * the very first line, is worse than no report: it invites deleting working
 * code.
 *
 * So this resolves the module graph instead. Entry points are the pages, and
 * everything reachable from them is live. Everything else is unreferenced --
 * which is a different claim, and one that can be acted on.
 *
 * WHAT COUNTS AS AN ENTRY POINT
 * -----------------------------
 *   - a `scripts:` list in a page's front matter      (page-scripts.html)
 *   - a `/js/<name>` or `<name>.js` reference in a layout
 *   - a dynamic `import("/js/<name>")` in the built boot script
 *   - the CMS build entries under cms-preview-templates/, which webpack
 *     collects by directory rather than by reference
 *   - anything under a `tests/` directory
 *
 * WHAT IT DOES NOT CLAIM
 * ----------------------
 * That an unreferenced file is safe to delete. Some are deliberate: tests, CMS
 * templates webpack gathers by glob, and files kept for a page that does not
 * exist yet. The output says "unreferenced", and docs/FRONTEND.md decides what
 * to do about it.
 *
 * Run:  node scripts/front-end-graph.js            human-readable
 *       node scripts/front-end-graph.js --json     machine-readable
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const JS = path.join(SITE, 'assets', 'js');
const CSS = path.join(SITE, 'assets', 'css');

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const read = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

/**
 * Template text with its own comments removed.
 *
 * Scanning the raw text finds references that are only TALKED ABOUT. The first
 * run reported `vehicle-inventory.js` as a missing entry point declared by
 * partials/footer.html -- where it appears inside a Hugo template comment that
 * documents the inline script which was deleted precisely because it 404'd.
 *
 * A gate that reports a comment is worse than no gate: it trains you to ignore
 * it, and the real miss in the same output stops being read.
 */
function uncommented(text) {
  return text
    .replace(/\{\{\s*\/\*[\s\S]*?\*\/\s*\}\}/g, ' ') // {{/* ... */}}
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, ' ') // {{- /* ... */ -}}
    .replace(/<!--[\s\S]*?-->/g, ' ') // HTML comments
    .replace(/^\s*\/\/.*$/gm, ' '); // whole-line JS comments in .md
}

/** Import/require specifiers, in the three spellings this codebase uses. */
function specifiers(body) {
  const out = [];
  const push = (s) => {
    const m = /^['"]\.?\.?\/?([^'"]+)['"]$/.exec(s.trim());
    if (m) out.push(m[1]);
  };
  for (const re of [
    /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g, // import x from 'y'
    /\bexport\s+[^;]*?from\s+['"]([^'"]+)['"]/g, // export * from 'y'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('y')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('y')
  ]) {
    let m;
    while ((m = re.exec(body)) !== null) out.push(m[1]);
  }
  void push;
  return out;
}

/**
 * Resolve a specifier to a file.
 *
 * The extensionless case is the whole reason this module exists: Hugo's esbuild
 * resolves `./utils` to `utils.js`, and so must this, or the graph is wrong in
 * exactly the way that made the first attempt useless.
 */
function resolve(fromFile, spec) {
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const c of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  }
  // Bare specifier: a root node_modules package, not part of the site graph.
  return null;
}

function main() {
  const jsFiles = walk(JS).filter((f) => f.endsWith('.js'));
  const layouts = walk(path.join(SITE, 'layouts')).filter((f) => f.endsWith('.html'));
  const content = walk(path.join(SITE, 'content')).filter((f) => f.endsWith('.md'));

  const roots = new Set();
  const why = new Map();
  const missingRoots = new Map();

  const addRoot = (rel, reason) => {
    if (!rel) return;
    const abs = path.join(JS, rel);
    if (!fs.existsSync(abs)) {
      // Recorded, not dropped. A page that declares a script which does not
      // exist loads no JavaScript and the build says nothing -- so the fact has
      // to survive to the report, or the check that looks for it can never fire.
      if (!missingRoots.has(rel)) missingRoots.set(rel, reason);
      return;
    }
    roots.add(abs);
    if (!why.has(abs)) why.set(abs, reason);
  };

  const fromFront = /^scripts:\s*\n((?:\s+-\s*.+\n?)+)/gm;
  for (const f of content) {
    const t = uncommented(read(f));
    if (!t.startsWith('---')) continue;
    const fm = t.split('---')[1] || '';
    let m;
    while ((m = fromFront.exec(fm)) !== null) {
      for (const line of m[1].trim().split('\n')) {
        const v = line.trim().replace(/^-\s*/, '').replace(/^['"]|['"],?$/g, '').trim();
        if (v && v.endsWith('.js')) addRoot(v, 'scripts: in ' + path.relative(ROOT, f));
      }
    }
  }

  for (const f of layouts) {
    const t = uncommented(read(f));
    // Hardcoded /js/... and import("/js/...")
    for (const re of [/\/js\/([A-Za-z0-9_./-]+\.js)/g, /import\(\s*["'`]?\/js\/([A-Za-z0-9_./-]+\.js)/g]) {
      let m;
      while ((m = re.exec(t)) !== null) addRoot(m[1], 'hardcoded path in ' + path.relative(ROOT, f));
    }
    // The real modern path: {{ partial "entry.html" (dict "entry" "connect.js" ...) }}
    //
    // This is how six LIVE bundles are loaded, including connect.js (23 KB) and
    // shortlist.js. A graph that only looks for `/js/...` calls them dead, and
    // a graph that says a file is dead is an invitation to delete working code.
    for (const m of t.matchAll(/"entry"\s+"([^"]+\.js)"/g)) {
      addRoot(m[1], 'entry.html in ' + path.relative(ROOT, f));
    }
    // The MAIN bundle: {{ with resources.Get "js/index.js" }}. This is the site
    // entry point, and it is the one that was easiest to miss -- assets.html is
    // what the whole page loads through, and the only other mentions of
    // index.js in that file are comments about the hardcoded path it replaced.
    for (const m of t.matchAll(/resources\.Get\s+"js\/([^"]+\.js)"/g)) {
      addRoot(m[1], 'resources.Get in ' + path.relative(ROOT, f));
    }
  }

  // The CMS editor bundle is a SECOND build system: webpack, entry
  // src/js/cms.js, which imports preview templates out of site/assets/js/.
  //
  // Classifying the whole cms-preview-templates/ directory as "live because
  // webpack globs it" would be wrong, and wrong in the expensive direction: the
  // directory holds 8 files and the entry imports 3. The other 5 are not built.
  const cmsEntry = path.join(ROOT, 'src', 'js', 'cms.js');
  if (fs.existsSync(cmsEntry)) {
    for (const spec of specifiers(read(cmsEntry))) {
      const abs = resolve(cmsEntry, spec);
      if (abs && abs.startsWith(JS)) {
        roots.add(abs);
        if (!why.has(abs)) why.set(abs, 'imported by src/js/cms.js (webpack)');
      }
    }
  }

  // Walk out from every root.
  const reachable = new Set();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop();
    if (reachable.has(f)) continue;
    reachable.add(f);
    for (const spec of specifiers(read(f))) {
      const to = resolve(f, spec);
      if (to && !reachable.has(to)) queue.push(to);
    }
  }

  // Classify what is not reachable.
  const isTest = (f) => /(^|\/)tests?\//.test(f) || /\.test\.js$/.test(f);
  const isCmsTemplate = (f) =>
    f.includes(`${path.sep}cms-preview-templates${path.sep}`) &&
    !reachable.has(f);

  const unreferenced = jsFiles
    .filter((f) => !reachable.has(f))
    .map((f) => ({
      file: path.relative(JS, f).split(path.sep).join('/'),
      bytes: fs.statSync(f).size,
      kind: isTest(f) ? 'test' : isCmsTemplate(f) ? 'cms-template' : 'unexplained',
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const cssFiles = walk(CSS).filter((f) => f.endsWith('.css'));
  const cssRefs = [];
  for (const f of [...layouts, ...content]) {
    const t = uncommented(read(f));
    for (const m of t.matchAll(/([A-Za-z0-9_./-]+\.css)/g)) cssRefs.push(m[1]);
  }
  const cssUsed = new Set(cssRefs);

  // page-scripts.html ALSO derives a stylesheet from each script name, when a
  // matching file exists next to it: components/x.js -> components/x.css. That is
  // why `styles:` is usually unnecessary, and it is why a plain filename search
  // reports three live admin stylesheets as unreferenced.
  for (const p of roots) {
    const rel = path.relative(JS, p);
    if (!rel.includes(path.sep)) continue; // only the directoryed ones derive
    const candidate = rel.replace(/\.js$/, '.css').split(path.sep).join('/');
    if (fs.existsSync(path.join(CSS, candidate))) cssUsed.add(candidate);
  }
  // path.relative() yields backslashes on Windows while cssRefs are collected as
  // forward-slash strings from the source, so every live stylesheet compared
  // unequal and read as dead. Normalise before comparing, and report the same way.
  const cssKey = (f) => path.relative(CSS, f).split(path.sep).join('/');
  const cssUnreferenced = cssFiles
    .filter((f) => !cssUsed.has(cssKey(f)))
    .map((f) => cssKey(f));

  const result = {
    js: { total: jsFiles.length, reachable: reachable.size, unreferenced },
    css: { total: cssFiles.length, unreferenced: cssUnreferenced },
    roots: [...roots].map((f) => ({ file: path.relative(JS, f).split(path.sep).join('/'), why: why.get(f) })),
    // Declared but absent. Separate from `roots` on purpose: a missing entry is
    // a broken page, a live entry is just an entry.
    missingRoots: [...missingRoots].map(([file, reason]) => ({ file, why: reason })),
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`  JS  ${result.js.reachable} reachable of ${result.js.total}`);
  console.log(`  CSS ${result.css.total - result.css.unreferenced.length} referenced of ${result.css.total}`);
  console.log('');
  console.log('  entry points:');
  for (const r of result.roots) console.log(`    ${r.file.padEnd(34)} ${r.why}`);
  console.log('');
  const unexplained = unreferenced.filter((u) => u.kind === 'unexplained');
  console.log(`  unreferenced JS: ${unreferenced.length} ` +
    `(${unexplained.length} unexplained, ` +
    `${unreferenced.filter((u) => u.kind === 'test').length} tests, ` +
    `${unreferenced.filter((u) => u.kind === 'cms-template').length} cms templates)`);
  for (const u of unreferenced) {
    console.log(`    ${u.kind.padEnd(14)} ${u.file.padEnd(40)} ${String(u.bytes).padStart(6)} B`);
  }
  if (result.css.unreferenced.length) {
    console.log('');
    console.log(`  unreferenced CSS: ${result.css.unreferenced.length}`);
    for (const c of result.css.unreferenced) console.log(`    ${c}`);
  }
}

main();
