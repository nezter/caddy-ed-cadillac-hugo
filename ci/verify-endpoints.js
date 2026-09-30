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

  // Templates declare entries too: {{ partial "entry.html" (dict "entry"
  // "inventory-filter.js" ...) }}. A pure JS import graph cannot see those, and
  // the first version of this script missed both inventory-filter.js and
  // customer-portal.js because of it -- under-reporting coverage while still
  // reporting "OK", which is worse than not checking.
  const walkTpl = (dir) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walkTpl(f);
      else if (e.name.endsWith('.html')) {
        const t = fs.readFileSync(f, 'utf8');
        for (const m of t.matchAll(
          /partial\s+"entry\.html"[\s\S]{0,120}?"entry"\s+"([\w./-]+\.js)"/g
        )) {
          entries.add(m[1]);
        }
      }
    }
  };
  walkTpl(path.join(ROOT, 'site', 'layouts'));

  entries.delete('--');
  return [...entries];
}

// ---------------------------------------------------------------------------
// resolve the import graph from those entries
// ---------------------------------------------------------------------------
function reachableFrom(entries) {
  const seen = new Set();
  const stack = entries.map((rel) => ({ rel, importer: null }));
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

  // Carry the IMPORTER with each pending specifier.
  //
  // This resolved every relative import with `importer = null`, i.e. relative
  // to site/assets/js/ rather than to the file doing the importing. A helper one
  // directory down -- `./lib/helper` -- was therefore never scanned. Proved by
  // injecting an import of a helper containing a bogus endpoint: the gate
  // passed. A gate with a hole in its reach is worse than no gate, because it
  // reports OK.
  //
  // This also forced an agent to inline endpoint literals into entry files
  // rather than share a helper module, to work around a bug in this file.
  while (stack.length) {
    const { rel, importer } = stack.pop();
    const f = find(rel, importer);
    if (!f) {
      unresolved.add(rel);
      continue;
    }
    if (seen.has(f)) continue;
    seen.add(f);
    const t = fs.readFileSync(f, 'utf8');
    // The character class must NOT exclude a leading dot. It used to be
    // [^'".], which meant  never matched at all -- so the
    // startsWith('.') branch below was unreachable and NO relative import was
    // ever followed. The gate had only ever scanned entry files. Proved by
    // injecting an import of a helper containing a bogus endpoint: it passed.
    // Entries themselves are still needed, so the class only excludes quotes.
    const re = /(?:from|import)\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of t.matchAll(re)) {
      const r = m[1] || m[2];
      if (r.startsWith('.')) stack.push({ rel: r, importer: f });
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

/**
 * Strip comments before looking for endpoints.
 *
 * Scanning raw text matched a comment that *documents* the old broken path --
 *
 *     1. It fetched `/api/lead-scoring`. netlify.toml removed the blanket
 *
 * -- and reported it as a live call. Two separate agents hit this and both
 * reworded their comments, which is the wrong fix: the right response to "the
 * gate is complaining about a comment" is to fix the gate, not to stop writing
 * the comment. A path in a comment is documentation; only a path in code is a
 * request.
 */
const { stripJsComments } = require('./strip-comments');

function scanFile(file) {
  const t = stripJsComments(fs.readFileSync(file, 'utf8'));
  const urls = new Set();
  for (const m of t.matchAll(ENDPOINT_LITERAL)) urls.add(m[1]);
  return [...urls];
}

// ---------------------------------------------------------------------------
// feature-manifest.json -- declared disposition per function
//
// A status board nobody checks is a wish list. This cross-checks the
// declaration against reality: a function marked `wired` that no live bundle
// can call is a FAILURE, not a note. That is the only way the ratio moves and
// stays moved.
// ---------------------------------------------------------------------------
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'ci', 'feature-manifest.json'), 'utf8'));
} catch (e) {
  console.log(`\n  ${red('FAIL')}  ci/feature-manifest.json could not be read: ${e.message}`);
  process.exitCode = 1;
}

const entries = declaredEntries();
const { files, unresolved } = reachableFrom(entries);
const aliases = redirectAliases();
const fnNames = functionNames();

// A known-missing endpoint must be DECLARED, with a reason, or it fails the
// build. The alternative -- a silent skip list -- is how the original defect
// survived: someone had to have decided /api/lead-scoring was fine.
//
// Each entry names a function that a live bundle calls and that does not exist.
// It is not a workaround; it is a receipt for unimplemented functionality, and
// it is expected to shrink to empty.
const KNOWN_MISSING = new Map([
  [
    'schedule-appointment',
    'customer-portal.js "schedule appointment" form has no implementation. ' +
      'It POSTs {type, scheduled_date, scheduled_time, notes, customer_*} to a ' +
      'function that does not exist. The nearest candidate, schedule-test-drive, ' +
      'requires a vehicleId the form never collects -- these are two different ' +
      'features (service appointment vs test drive), not one broken call. ' +
      'Needs a storage decision first; see docs/PROGRAMME.md. ' +
      'TRACKED: build a schedule-appointment function, or remove the form.',
  ],
]);

const liveProblems = [];
const declared = [];
const liveUrls = new Set();
// Every function NAME a live bundle actually reaches. The manifest's `wired`
// claim is checked against this, so it has to be the set of names resolved from
// real call sites -- not inferred from the manifest.
const liveFnNames = new Set();

for (const f of files) {
  for (const url of scanFile(f)) {
    liveUrls.add(url);
    if (resolves(url, aliases, fnNames)) {
      const m = url.split('?')[0].match(/\/(?:\.netlify\/functions|api)\/([^/]+)/);
      if (m && fnNames.has(m[1])) liveFnNames.add(m[1]);
      // an /api/ alias still counts: the alias names the function it forwards to
      const a = url.split('?')[0];
      const hit = [...aliases.keys()].find((k) => a === k || a.startsWith(k));
      if (hit) {
        const to = aliases.get(hit).match(/functions\/([^/]+)/);
        if (to && fnNames.has(to[1])) liveFnNames.add(to[1]);
      }
      continue;
    }
    // Which function name was expected? For /api/x/y it is only knowable when
    // an alias exists, so a declared name matches anywhere in the path.
    const expected = (url.split('?')[0].match(/\/(?:\.netlify\/functions|api)\/([^/]+)/) || [])[1];
    if (expected && KNOWN_MISSING.has(expected)) {
      declared.push(`${expected}  (called by ${path.relative(ROOT, f)})`);
      continue;
    }
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

if (declared.length) {
  console.log(
    `\n  ${ylw('DECLARED')} ${declared.length} known-missing endpoint(s) -- unimplemented, declared with a reason in ci/verify-endpoints.js:`
  );
  for (const d of declared) console.log(`    ${d}`);
  for (const [name, why] of KNOWN_MISSING) {
    if (declared.some((d) => d.startsWith(name))) {
      console.log(`      ${dim(`${name}: ${why}`)}`);
    }
  }
  console.log(
    `    ${dim('These are real gaps, not waivers. Each one is functionality a page')}\n` +
      `    ${dim('offers and does not deliver. This list should reach zero.')}`
  );
}

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

// ---------------------------------------------------------------------------
// reconcile the manifest against reality
// ---------------------------------------------------------------------------
if (manifest) {
  const declared = {
    ...manifest.wired,
    ...manifest.planned,
    ...manifest.delete,
    ...manifest.notafunc,
    ...manifest.operational,
  };
  const onDisk = new Set(fnNames);

  // A function must be in exactly ONE bucket.
  //
  // The reconciliation merges with {...wired, ...planned}, so when a function is
  // in both, `planned` silently wins and the `wired` claim -- the thing the
  // check below exists to verify -- is discarded without a word. That is a
  // contradiction between two declarations, and it rendered as silence.
  const bucketOf = new Map();
  for (const b of ['wired', 'planned', 'operational', 'delete', 'notafunc']) {
    for (const name of Object.keys(manifest[b] || {})) {
      if (!bucketOf.has(name)) bucketOf.set(name, []);
      bucketOf.get(name).push(b);
    }
  }
  const contradictions = [...bucketOf].filter(([, bs]) => bs.length > 1);
  if (contradictions.length) {
    console.error(
      `\n  ${red('FAIL')}  function(s) declared in more than one bucket -- the merge order silently discards all but the last:\n` +
        contradictions.map(([n, bs]) => `    ${n}: ${bs.join(' + ')}`).join('\n') +
        `\n    ${dim('A function has exactly one disposition. Which bucket is it in?')}`
    );
    process.exitCode = 1;
  }

  // A `delete` entry is EXPECTED to be absent -- that is what delete means.
  // Only the live buckets must exist, or the manifest is describing a function
  // that was never built. The first version checked every bucket and so failed
  // the build the moment a deletion succeeded, which is precisely backwards.
  const liveBuckets = [
    ...Object.keys(manifest.wired),
    ...Object.keys(manifest.planned),
    ...Object.keys(manifest.operational || {}),
    ...Object.keys(manifest.notafunc),
  ];
  const missing = liveBuckets.filter((n) => !onDisk.has(n));
  if (missing.length) {
    console.error(
      `\n  ${red('FAIL')}  manifest declares function(s) that do not exist: ${missing.join(', ')}`
    );
    process.exitCode = 1;
  }

  const undeclared = [...onDisk].filter((n) => !declared[n]);
  if (undeclared.length) {
    console.error(
      `\n  ${red('FAIL')}  function(s) on disk with no disposition in ci/feature-manifest.json:\n` +
        undeclared.map((n) => `    ${n}`).join('\n') +
        `\n    ${dim('Every function must be declared wired/planned/delete/notafunc, with a reason.')}`
    );
    process.exitCode = 1;
  }

  // The load-bearing check.
  /*
   * A function can be wired in two ways, and only one of them is a bundle.
   *
   * Most are called by front-end JavaScript. Some are reached by a netlify.toml
   * redirect instead -- admin-guard is the live example: /admin/* rewrites to it,
   * and no script ever names it, because the redirect IS the caller.
   *
   * Counting only bundle-reachable names made the gate report a redirect-wired
   * function as "declared wired but no live bundle can call it", which is
   * technically true and operationally nonsense. Both routes are now accepted,
   * and a function reachable by NEITHER is still a failure.
   */
  // aliases maps FROM-path -> TO-string, so the function NAME has to be pulled
  // out of the target. `/admin/*` -> `/.netlify/functions/admin-guard/:splat`
  // yields `admin-guard`.
  const aliasReached = new Set();
  for (const target of aliases.values()) {
    const m2 = /\.netlify\/functions\/([a-z][a-z0-9-]*)/.exec(String(target));
    if (m2) aliasReached.add(m2[1]);
  }
  const lyingWired = Object.keys(manifest.wired).filter(
    (n) => !liveFnNames.has(n) && !aliasReached.has(n)
  );
  if (lyingWired.length) {
    console.error(
      `\n  ${red('FAIL')}  declared wired but no live bundle can call it: ` +
        `${lyingWired.join(', ')}`
    );
    process.exitCode = 1;
  }

  // `operational` endpoints are reached by a monitor or an alias, not a page.
  // Check them against the alias table instead of the bundle graph, so putting
  // one here is not a way to dodge the `wired` check.
  const ops = manifest.operational || {};
  const lyingOps = Object.keys(ops).filter(
    (n) => ![...aliases.values()].some((to) => to.includes(`functions/${n}`)) && !liveFnNames.has(n)
  );
  if (lyingOps.length) {
    console.error(
      `\n  ${red('FAIL')}  declared operational but no [[redirects]] alias or live call reaches it: ` +
        lyingOps.join(', ')
    );
    process.exitCode = 1;
  }

  const stillPresent = Object.keys(manifest.delete).filter((n) => onDisk.has(n));
  const stillCfgs = Object.keys(manifest.notafunc).filter((n) => onDisk.has(n));

  const wiredN = Object.keys(manifest.wired).length;
  const plannedN = Object.keys(manifest.planned).length;
  const pct = Math.round((wiredN / (wiredN + plannedN)) * 100);

  console.log(
    `\n  ${dim(`feature coverage: ${wiredN} wired / ${plannedN} planned = ${pct}%`)}`
  );
  if (stillPresent.length) {
    console.log(`  ${ylw('WARN')}  marked for deletion but still present: ${stillPresent.join(', ')}`);
  }
  if (stillCfgs.length) {
    console.log(
      `  ${ylw('WARN')}  ${stillCfgs.length} non-function file(s) still in netlify/functions/ (bundled as functions on every deploy): ${stillCfgs.join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// netlify.toml must not point at functions that do not exist
// ---------------------------------------------------------------------------
//
// The /api/inventory alias pointed at inventory-api, which was deleted when the
// page moved to being server-rendered. The alias outlived its function and
// 404'd, and nothing noticed: a redirect is a config entry, not code, and the
// endpoint gate only ever looked at what JavaScript calls.
function tomlValue(key) {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'));
  return m ? m[1] : null;
}
{
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const fnDir = path.join(ROOT, tomlValue('directory') || 'netlify/functions');
  const onDisk = new Set();
  try {
    for (const f of fs.readdirSync(fnDir)) {
      if (f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.')) {
        onDisk.add(f.slice(0, -3));
      }
    }
  } catch { /* directory missing; nothing to check */ }

  const deadAliases = [];
  for (const m of toml.matchAll(/to\s*=\s*"\/\.netlify\/functions\/([^/"]+)/g)) {
    const name = m[1];
    if (!onDisk.has(name)) deadAliases.push(name);
  }
  if (deadAliases.length) {
    console.error(
      `\n  ${red('FAIL')}  netlify.toml redirects to function(s) that do not exist: ` +
        [...new Set(deadAliases)].join(', ')
    );
    console.error(
      `    ${dim('A redirect is a config entry, not code, so nothing else notices when')}\n` +
        `    ${dim('its function is deleted. The alias keeps serving a 404.')}`
    );
    process.exitCode = 1;
  } else {
    const aliasCount = (toml.match(/to\s*=\s*"\/\.netlify\/functions\//g) || []).length;
    console.log(
      `  ${grn('OK')}    all ${aliasCount} netlify.toml redirect alias(es) resolve to a real function`
    );
  }
}

// -----------------------------------------------------------------------------
// The context markers in netlify.toml and the ones the code refuses must match.
//
// netlify.toml writes JWT_SECRET="deploy-preview-not-configured" into the
// deploy-preview, branch-deploy and [dev] contexts. That is a PUBLIC string,
// committed. Its entire value is that netlify/functions/utils/jwt-secret.js
// treats it as "this context has no signing key" and refuses both to sign and
// to verify.
//
// The two lists are in different files, in different languages, for a reason
// nobody can reconstruct from the code alone, and the failure mode of drift is
// silent and severe: a marker present in the toml but absent from the code is
// a working signing key handed to anyone who reads the repository. That is the
// 'fallback-secret' bug this whole mechanism was built to avoid, reintroduced
// by a well-meaning rename.
//
// So: every marker-looking value in netlify.toml must be in SECRET_MARKERS, and
// every entry in SECRET_MARKERS must be used somewhere in netlify.toml. Either
// way of drifting fails here.
{
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const { SECRET_MARKERS } = require('../netlify/functions/utils/jwt-secret.js');

  // Pull the declared markers out of the toml by shape, not by list, so a newly
  // added context is covered the moment it is written.
  const tomlMarkers = new Set(
    [...toml.matchAll(/^\s*JWT_SECRET\s*=\s*"([a-z-]*not-configured)"/gm)].map((m) => m[1])
  );

  const missingFromCode = [...tomlMarkers].filter((m) => !SECRET_MARKERS.includes(m));
  const missingFromToml = SECRET_MARKERS.filter((m) => !tomlMarkers.has(m));

  if (missingFromCode.length || missingFromToml.length) {
    if (missingFromCode.length) {
      console.error(
        `\n  ${red('FAIL')}  netlify.toml sets a context marker the code does not refuse:\n` +
          missingFromCode.map((m) => `    ${m}`).join('\n')
      );
      console.error(
        `    ${dim('A marker the code treats as a real secret is a PUBLIC signing key.')}\n` +
          `    ${dim('Add it to SECRET_MARKERS in netlify/functions/utils/jwt-secret.js.')}`
      );
    }
    if (missingFromToml.length) {
      console.error(
        `\n  ${red('FAIL')}  the code refuses a context marker that no context uses:\n` +
          missingFromToml.map((m) => `    ${m}`).join('\n')
      );
      console.error(
        `    ${dim('Either netlify.toml lost a context block, or the marker list is stale.')}`
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      `  ${grn('OK')}    all ${tomlMarkers.size} context marker(s) in netlify.toml are refused by the code`
    );
  }
}

if (process.exitCode) {
  console.error(`\n  ${red('ENDPOINT VERIFICATION FAILED')}\n`);
} else {
  console.log(`\n  ${grn('ENDPOINT VERIFICATION PASSED')}\n`);
}