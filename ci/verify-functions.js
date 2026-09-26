#!/usr/bin/env node
/**
 * verify-functions -- prove every function SURVIVES bundling and LOADS.
 *
 * WHY THIS EXISTS
 * ---------------
 * `netlify dev` reporting "Loaded function 34 times" proves esbuild produced a
 * bundle. It does not prove the bundle RUNS. The gap between those two is where
 * this repo's one long-standing unverified claim lived:
 *
 *   netlify.toml:55
 *     # @libsql/client loads its platform-native binary through an OPTIONAL
 *     # dependency ... Shipping the platform packages alongside the bundle
 *     # resolves it.
 *
 * "Resolves it" was written down as a belief and carried as an open question
 * (Q14 in docs/OPEN-QUESTIONS.md) through several sessions, on the grounds
 * that it "only fails on a real deploy". That is not true. It fails at bundle
 * load time, which is exactly what this file checks.
 *
 * Measured, with this file, on 2026-09-27:
 *
 *   esbuild inlines @libsql/client's JavaScript. 1437.6 KB bundle.
 *   external @libsql requires: (none -- fully inlined)
 *   require()ing that bundle THREW: Cannot find module '@libsql/linux-x64-gnu'
 *
 * The JavaScript is inlined; the .node binary is not. That is why `included_files`
 * is load-bearing, and why "the bundle built" was never evidence of anything.
 *
 * WHAT IT CHECKS, PER FUNCTION
 * ---------------------------
 *   1. esbuild can bundle it at all.                      (a hard error)
 *   2. the bundle can actually be require()d in a child
 *      process, with netlify/functions/node_modules resolvable the way it is
 *      on the lambda.                                     (a hard error)
 *
 * A function that bundles but does not load is a 502 in production, not a build
 * failure, which is the worst possible time to find out.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 * -----------------------------------
 * It does not call the handler. There is no Postgres, Supabase, Turso or Redis
 * anywhere on the build host (Q3), so any handler that touches data must fail,
 * and a gate that reported those failures as build breakage would be lying about
 * what it can verify. Loading is the honest ceiling here, and the report says so
 * out loud rather than implying more coverage than it has.
 *
 * RUNS WHERE
 * ----------
 * Needs esbuild, which lives inside netlify-cli's own node_modules in the build
 * image -- there is no top-level esbuild dependency. Invoked by ci/run.sh
 * fn-verify, never on a developer laptop.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');

const C = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { g: '', r: '', y: '', d: '', b: '', x: '' };

const ok = (m) => console.log(`  ${C.g}OK${C.x}    ${m}`);
const warn = (m) => console.log(`  ${C.y}WARN${C.x}  ${m}`);
const fail = (m) => console.log(`  ${C.r}FAIL${C.x}  ${m}`);
const note = (m) => console.log(`  ${C.d}      ${m}${C.x}`);

// --- locate esbuild ---------------------------------------------------------
// It is a transitive dependency of netlify-cli, hoisted into that package's own
// node_modules. Trying the root and the cli package in order, and saying so
// plainly when neither works, beats a stack trace.
function findEsbuild() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'esbuild'),
    '/usr/local/lib/node_modules/netlify-cli/node_modules/esbuild',
    '/usr/local/lib/node_modules/@netlify/build/node_modules/esbuild',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const esbuildPath = findEsbuild();
if (!esbuildPath) {
  fail('esbuild not found. This gate runs inside the build image via ./ci/run.sh fn-verify.');
  process.exit(2);
}
const esbuild = require(esbuildPath);

// --- collect the functions --------------------------------------------------
// A function is a top-level .js file that exports a handler. Everything in
// utils/ is imported by those, not invoked by Netlify, so it is excluded here
// and covered transitively by bundling.
const functions = fs
  .readdirSync(FUNCTIONS)
  .filter((f) => f.endsWith('.js') && f !== 'babel.config.js')
  .filter((f) => fs.statSync(path.join(FUNCTIONS, f)).isFile())
  .sort();

if (functions.length === 0) {
  fail('no functions found in netlify/functions/');
  process.exit(2);
}

console.log(
  `${C.b}Function load check${C.x} (${functions.length} function(s), esbuild from ${esbuildPath.replace(ROOT, '.')})`
);

// Bundles are written INSIDE netlify/functions/ so that node's normal upward
// node_modules resolution finds netlify/functions/node_modules -- which is the
// same tree included_files ships to the lambda. Writing them to os.tmpdir()
// would make every native module appear missing and the gate would report
// failures that tell us nothing.
const outDir = fs.mkdtempSync(path.join(FUNCTIONS, '.verify-'));

// Load each bundle in a child process. require() caches and a throw would take
// the gate down with it, and one function's module-level side effects must not
// be able to influence the next function's verdict.
const loader = path.join(outDir, 'load-one.cjs');
fs.writeFileSync(
  loader,
  `// Loads one bundled function. Exits 0 if the module evaluates, 1 with the
// underlying reason on stderr if it throws. Kept tiny and dependency-free so a
// throw here is always the function's fault, never the harness's.
'use strict';
try {
  require(process.argv[2]);
  process.exit(0);
} catch (e) {
  process.stderr.write((e && (e.stack || e.message)) || String(e));
  process.exit(1);
}
`
);

const results = { bundled: 0, loaded: 0, failed: [], loadFailed: [], sizes: [] };

for (const name of functions) {
  const entry = path.join(FUNCTIONS, name);
  const outFile = path.join(outDir, `${name}.cjs`);

  let bundleText;
  try {
    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      // Node 24, per .nvmrc / netlify.toml / ci/Containerfile.
      target: 'node24',
      outfile: outFile,
      logLevel: 'silent',
    });
    bundleText = fs.readFileSync(outFile, 'utf8');
    results.bundled++;
    results.sizes.push([name, bundleText.length]);
  } catch (e) {
    const msg = (e && e.errors && e.errors[0] && e.errors[0].text) || String(e.message);
    results.failed.push([name, msg]);
    continue;
  }

  // Does the bundled function actually load?
  try {
    execFileSync(process.execPath, [loader, outFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // netlify/functions must be on the path so @libsql/linux-x64-gnu and
      // every other installed package resolve the way they do on the lambda.
      cwd: FUNCTIONS,
      env: { ...process.env, NODE_PATH: path.join(FUNCTIONS, 'node_modules') },
      timeout: 30000,
    });
    results.loaded++;
  } catch (e) {
    const stderr = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
    // MODULE_NOT_FOUND is the interesting one -- it is the exact failure
    // included_files exists to prevent, and it is invisible to `netlify dev`.
    const m = /Cannot find module '([^']+)'/.exec(stderr);
    results.loadFailed.push([
      name,
      m ? `Cannot find module '${m[1]}'` : (stderr.split('\n').find((l) => l.trim()) || 'unknown').trim(),
    ]);
  }
}

// --- report -----------------------------------------------------------------
const failures = results.failed.length + results.loadFailed.length;

for (const [name, msg] of results.failed) {
  fail(`${name} does not bundle: ${msg}`);
}
for (const [name, msg] of results.loadFailed) {
  fail(`${name} bundles but does not LOAD: ${msg}`);
}

if (failures === 0) {
  ok(`all ${results.loaded} function(s) bundle AND load`);
} else {
  console.log(
    `  ${C.r}FUNCTION LOAD VERIFICATION FAILED${C.x} -- ${results.bundled} bundled, ${results.loaded} loaded, ${failures} failed`
  );
}

// Size, because a 1.4 MB function is a real deploy cost and a real cold-start
// tax, and nobody is watching it grow.
results.sizes.sort((a, b) => b[1] - a[1]);
const total = results.sizes.reduce((n, [, b]) => n + b, 0);
note(`bundle total ${(total / 1024 / 1024).toFixed(2)} MB across ${results.sizes.length} function(s)`);
for (const [name, bytes] of results.sizes.slice(0, 3)) {
  note(`largest: ${name} ${(bytes / 1024).toFixed(0)} KB`);
}

// If anything failed to load, say what the fix is, because "Cannot find module
// @libsql/linux-x64-gnu" without a next step is just a worse version of the
// original Q14.
const missingNative = new Set();
for (const [, msg] of results.loadFailed) {
  const m = /Cannot find module '(@[^/]+\/[^/]+)'/.exec(msg);
  if (m) missingNative.add(m[1]);
}
if (missingNative.size) {
  console.log('');
  warn('unresolved at runtime after bundling:');
  for (const m of missingNative) console.log(`    ${m}`);
  note('A package listed under [functions] included_files in netlify.toml ships');
  note('with the function. If the package above is not covered by that list, the');
  note('bundle inlines the JavaScript but not the native binary, and the');
  note('function 502s on first call. Add it, or drop the dependency.');
}

note('Handlers were NOT called. There is no Postgres, Supabase, Turso or Redis');
note('on the build host (Q3), so loading is the honest ceiling of this check.');

fs.rmSync(outDir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
