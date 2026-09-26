#!/usr/bin/env node
/**
 * verify-endpoints.js -- do the live front-end bundles call endpoints that exist?
 *
 * The problem this catches
 * -----------------------
 * netlify.toml once rewrote every `/api/*` request to `/.netlify/functions/$1`.
 * That blanket rewrite was removed (netlify.toml:74-77 documents why: the
 * functions in this repo are not mounted under /api/, they are called by their
 * own names). Nothing updated the call sites.
 *
 * The result was 20 JavaScript files still fetching `/api/lead-scoring`,
 * `/api/contact-form`, `/api/inventory` and so on -- paths that resolve to a
 * 404. Not a crash: `fetch` returns 404, the code takes an error branch, and
 * the page renders empty. Silent, and invisible to a build.
 *
 * Only two of those files actually reach a browser (the rest are dead modules
 * documented in docs/test-status.md), but "only two" is a fact that had to be
 * established by hand. This establishes it every build.
 *
 * What it checks
 * --------------
 *   1. Every JS file reachable from a declared entry is scanned for fetch URLs.
 *   2. Each URL is resolved against three sources, in order:
 *        a. a [[redirects]] alias in netlify.toml
 *        b. a function file in netlify/functions/
 *        c. an asset in the publish dir (a real page, not an API call)
 *   3. Anything unresolved is a failure.
 *
 * Usage: node ci/verify-endpoints.js [--all]
 *   --all  also report dead modules that still contain unrouted calls, as a
 *          warning. Off by default because dead code is not a live defect and
 *          a permanent warning trains people to ignore warnings.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_ROOT = path.join(ROOT, 'site', 'assets', 'js');
const PUBLIC_DIR = path.join(ROOT, 'site', 'public');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');
const ALL = process.argv.includes('--all');

// ---------------------------------------------------------------------------
// declared entries: the main bundle plus every page's `scripts:` front matter
// ---------------------------------------------------------------------------
function declaredEntries() {
  const entries = new Set();
  if (fs.existsSync(path.join(JS_ROOT, 'index.js'))) entries.add('index.js');
  const walk = (dir) => {
    let entries_;
    try {
      entries_ = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries_) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const t = fs.readFileSync(p, 'utf8');
        const m = t.match(/^scripts:\s*((?:\s*-\s*\S+\s*)+)/m);
        // m is a match result; m[1] is the captured list.
        if (m) for (const s of m[1].matchAll(/-\s*(\S+)/g)) entries.add(s[1]);
      }
    }
  };
  walk(path.join(ROOT, 'site', 'content'));
  entries.delete('--');
  return [...entries];
}

// ---------------------------------------------------------------------------
// resolve the import graph from those entries
// ---------------------------------------------------------------------------
function reachableFrom(entries) {
  const seen = new Set();
  const stack = [...entries];
  const unresolved = new Set();

  const find = (rel, importer) => {
    const cands = importer
      ? [
          path.resolve(JS_ROOT, rel),
          path.resolve(path.dirname(importer), rel),
          path.resolve(path.dirname(importer), `${rel}.js`),
        ]
      : [path.resolve(JS_ROOT, rel), path.resolve(JS_ROOT, `${rel}.js`)];
    return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
  };

  while (stack.length) {
    const rel = stack.pop();
    const f = find(rel, null);
    if (!f) {
      unresolved.add(rel);
      continue;
    }
    if (seen.has(f)) continue;
    seen.add(f);
    const t = fs.readFileSync(f, 'utf8');
    const re = /(?:from|import)\s+['"]([^'".][^'"]*)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of t.matchAll(re)) {
      const r = m[1] || m[2];
      if (r.startsWith('.')) stack.push(r);
      else unresolved.add(r); // bare specifier: an npm package, not our problem
    }
  }
  return { files: [...seen], unresolved: [...unresolved] };
}

// ---------------------------------------------------------------------------
// what endpoints are actually served?
// ---------------------------------------------------------------------------
function redirectAliases() {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const aliases = new Map();
  const blocks = toml.split('[[redirects]]').slice(1);
  for (const b of blocks) {
    const from = b.match(/^\s*from\s*=\s*"([^"]+)"/m);
    const to = b.match(/^\s*to\s*=\s*"([^"]+)"/m);
    if (from && to) aliases.set(from[1], to[1]);
  }
  return aliases;
}

function functionNames() {
  const names = new Set();
  const walk = (dir, prefix = '') => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (!e.isFile() || !e.name.endsWith('.js')) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      names.add(prefix + e.name.slice(0, -3));
    }
    const sub = path.join(dir, '_shared');
    if (fs.existsSync(sub)) walk(sub);
  };
  walk(FUNCTIONS_DIR);
  return names;
}

function isStaticPage(clean) {
  if (!fs.existsSync(PUBLIC_DIR)) return false;
  const target = path.join(PUBLIC_DIR, clean);
  return fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html'));
}

/**
 * Does this fetch URL reach a real function?
 *
 * Two namespaces, two different rules, and conflating them is the bug this
 * script exists to catch:
 *
 *   /.netlify/functions/<name>/...   Netlify serves this directly. It resolves
 *                                    if a function file named <name> exists;
 *                                    the sub-path is the function's own
 *                                    dispatcher to validate.
 *
 *   /api/...                         NOTHING serves this. The blanket
 *                                    /api/* -> /.netlify/functions/$1 rewrite
 *                                    was removed, so /api/ only resolves where
 *                                    netlify.toml declares an explicit
 *                                    [[redirects]] alias -- and it must match
 *                                    the whole path, not just the first
 *                                    segment. Accepting /api/x/y because a
 *                                    function named "x" exists is exactly the
 *                                    false negative that let the original
 *                                    defect through.
 */
function resolves(url, aliasMap, fnSet) {
  const clean = url.split('?')[0].replace(/\/+$/, '');

  if (clean.startsWith('/.netlify/functions/')) {
    const name = clean.slice('/.netlify/functions/'.length).split('/')[0];
    return fnSet.has(name);
  }

  if (clean.startsWith('/api/')) {
    if (aliasMap.has(clean)) return true;
    // a directory-style alias, e.g. /api/communication-preferences -> fn
    for (const from of aliasMap.keys()) {
      if (from.endsWith('/') && clean.startsWith(from)) return true;
    }
    return false;
  }

  return isStaticPage(clean);
}

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------
/**
 * Find endpoint literals anywhere in a file, not just inside a fetch() call.
 *
 * The first version of this matched `fetch('...')` literally and reported
 * "everything resolves" while lead-management.js was calling a TYPO. Its
 * endpoints live in a constant:
 *
 *     const ENDPOINTS = { duplicates: '/.netlify/functions/lead-duplicates' };
 *     const response = await fetch(url, { ... });   // url, not a literal
 *
 * Static matching inside a call cannot follow that indirection, so matching
 * inside a call is the wrong shape. Any string literal that looks like a
 * function path is a candidate, wherever it appears -- including in a comment,
 * which errs toward reporting rather than toward silence.
 */
const ENDPOINT_LITERAL = /['"`]((\/(?:\.netlify\/functions|api)\/)[^'"`\s]*)['"`]/g;

function scanFile(file) {
  const t = fs.readFileSync(file, 'utf8');
  const urls = new Set();
  for (const m of t.matchAll(ENDPOINT_LITERAL)) urls.add(m[1]);
  return [...urls];
}

const entries = declaredEntries();
const { files, unresolved } = reachableFrom(entries);
const aliases = redirectAliases();
const fnNames = functionNames();

const liveProblems = [];
const liveUrls = new Set();

for (const f of files) {
  for (const url of scanFile(f)) {
    liveUrls.add(url);
    if (resolves(url, aliases, fnNames)) continue;
    const isApi = url.split('?')[0].startsWith('/api/');
    liveProblems.push(
      `${path.relative(ROOT, f)}  ->  ${url}  (${
        isApi
          ? '/api/ is unrouted and no [[redirects]] alias matches the whole path'
          : 'no such function'
      })`
    );
  }
}

// ---------------------------------------------------------------------------
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[1;31m${s}\x1b[0m`;
const grn = (s) => `\x1b[1;32m${s}\x1b[0m`;
const ylw = (s) => `\x1b[1;33m${s}\x1b[0m`;

console.log(
  `\n  Endpoint check (${entries.length} declared entries, ${files.length} reachable JS file(s), ${fnNames.size} functions, ${aliases.size} redirect aliases)`
);

if (liveProblems.length === 0) {
  console.log(
    `  ${grn('OK')}    every function call from a live bundle resolves${liveUrls.size ? ` (${liveUrls.size} distinct endpoint${liveUrls.size === 1 ? '' : 's'})` : ' (no function calls)'}`
  );
} else {
  console.error(`\n  ${red('FAIL')}  ${liveProblems.length} unresolvable endpoint call(s) from live bundles:\n`);
  for (const p of liveProblems) console.error(`    ${p}`);
  console.error(
    `\n    ${dim('netlify.toml removed the blanket /api/* -> /.netlify/functions/$1 rewrite.')}\n` +
      `    ${dim('Calls must name a real function, or an explicit [[redirects]] alias must exist.')}\n`
  );
  process.exitCode = 1;
}

if (ALL) {
  const dead = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && !files.includes(p)) {
        for (const url of scanFile(p)) {
          if (!resolves(url, aliases, fnNames)) {
            dead.push(`${path.relative(ROOT, p)}  ->  ${url}`);
          }
        }
      }
    }
  };
  walk(JS_ROOT);
  if (dead.length) {
    console.log(`\n  ${ylw('WARN')}  ${dead.length} unrouted call(s) in DEAD modules (not shipped):`);
    for (const d of dead) console.log(`    ${dim(d)}`);
  }
}

if (unresolved.length && !process.env.QUIET) {
  console.log(`\n  ${dim(`bare/unresolved imports (npm packages, ignored): ${unresolved.join(', ')}`)}`);
}

if (process.exitCode) {
  console.error(`\n  ${red('ENDPOINT VERIFICATION FAILED')}\n`);
} else {
  console.log(`\n  ${grn('ENDPOINT VERIFICATION PASSED')}\n`);
}
