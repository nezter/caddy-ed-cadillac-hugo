#!/usr/bin/env node

/**
 * Production build.
 *
 * Replaces the previous scripts/build-for-netlify.js, which never actually
 * built the front end: its step 3 ran `cp -r dist/*` against a `dist/` that
 * nothing ever created, and the `2>/dev/null || echo` swallowed the failure.
 * The site therefore shipped with a 404 for its JavaScript on every page.
 *
 * Pipeline now:
 *   1. install root deps (Hugo Pipes resolves lazysizes/date-fns from here)
 *   2. install netlify/functions deps
 *   3. build the Netlify CMS bundle (the only remaining webpack build)
 *   4. run Hugo -- which emits CSS + JS via Hugo Pipes, fingerprinted
 *   5. verify no page references a missing asset
 *
 * Run locally on the CI host via ./ci/run.sh, or directly for a fast check.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'site', 'public');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');
// Production is the DEFAULT for this script -- it is the production build.
//
// This previously required NODE_ENV or HUGO_ENV to be explicitly "production".
// But `ci/run.sh` runs the container with neither set, so the build silently
// ran in development mode: webpack shipped a 21.5MB UNMINIFIED CMS bundle
// instead of 4.7MB, and nothing else warned, because the gate only checks for
// missing assets.
//
// Opt out explicitly (e.g. a local `npm run build` while debugging) with
// NODE_ENV=development or HUGO_ENV=development.
const IS_PROD =
  !['development', 'dev'].includes(process.env.NODE_ENV) &&
  !['development', 'dev'].includes(process.env.HUGO_ENV);

let step = 0;
const t0 = Date.now();

const log = (msg) => console.log(`\x1b[1;36m==>${msg}\x1b[0m`);
const ok = (msg) => console.log(`   \x1b[1;32mOK\x1b[0m   ${msg}`);
const skip = (msg) => console.log(`   \x1b[1;90mSKIP\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\n\x1b[1;31mBUILD FAILED\x1b[0m ${msg}\n`);
  process.exit(1);
};

function run(cmd, opts = {}) {
  const label = opts.label || cmd;
  step += 1;
  log(`[${step}] ${label}`);

  // npm turns every .npmrc key into an `npm_config_<key>` env var for child
  // processes. When this script is itself run via `npm run build`, that means
  // `allow-scripts` arrives here as an env var and is then forwarded to the
  // nested `npm install` below -- which npm 11 rejects for project-scoped
  // installs with EALLOWSCRIPTS, failing the build for a non-security reason.
  //
  // The allowlist belongs in the `allowScripts` field of package.json (not in
  // .npmrc), so we simply make sure the poisoned variable never propagates.
  const env = { ...process.env };
  delete env.npm_config_allow_scripts;
  delete env.npm_config_allow_scripts_;

  const res = spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: opts.cwd || ROOT,
    env: {
      ...env,
      NODE_ENV: IS_PROD ? 'production' : 'development',
      // Keep CI non-interactive.
      npm_config_yes: 'true',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
    },
  });
  if (res.error) die(`${label} could not start: ${res.error.message}`);
  if (res.status !== 0) {
    if (opts.optional) {
      skip(`${label} (exit ${res.status}, non-fatal)`);
      return false;
    }
    die(`${label} exited ${res.status}`);
  }
  ok(label);
  return true;
}

/** True if the running hugo is the extended build (required for js.Build/css.Sass). */
function assertHugoExtended() {
  let out = '';
  try {
    out = execSync('hugo version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    die(
      '`hugo` not found on PATH. Use ./ci/run.sh (builds in the podman image) ' +
        'or install Hugo Extended >= 0.146.'
    );
  }
  if (!/extended/i.test(out)) {
    die(
      `the \`hugo\` on PATH is not the EXTENDED build:\n     ${out.trim()}\n` +
        '  Hugo Pipes (js.Build / css.Sass) needs extended. Since Hugo 0.146 the\n' +
        '  extended build is the separate `hugo_extended_*` release asset.'
    );
  }
  ok(`hugo extended: ${out.trim().split('\n')[0]}`);
}

// ---------------------------------------------------------------------------

log(`caddy-ed-cadillac-hugo production build (${IS_PROD ? 'production' : 'development'})`);

// 0. Toolchain sanity. Cheapest possible failure, so do it first.
assertHugoExtended();

// 1. Clean previous output. Hugo's own cache is preserved for incremental speed.
fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'site', 'resources'), { recursive: true, force: true });
ok('cleaned site/public and site/resources');

// 2. Root dependencies -- Hugo Pipes resolves bare npm imports
//    (lazysizes, date-fns) out of ./node_modules via esbuild.
run('npm install --no-audit --no-fund', { label: 'install root dependencies' });

// 3. Function dependencies.
if (fs.existsSync(path.join(FUNCTIONS_DIR, 'package.json'))) {
  // The functions are bundled by Netlify at deploy time, so dev deps are not
  // needed for a production build.
  run('npm install --omit=dev --no-audit --no-fund', {
    label: 'install netlify/functions dependencies',
    cwd: FUNCTIONS_DIR,
  });
}

// 4. Netlify CMS bundle -- the only webpack build left in the project.
//    Failure here must not take the public site down, but it is logged loudly.
const cmsEntry = path.join(ROOT, 'src', 'js', 'cms.js');
if (fs.existsSync(cmsEntry)) {
  run('npx webpack --config webpack.cms.js', {
    label: 'build Netlify CMS bundle (webpack.cms.js)',
    optional: true,
  });
} else {
  skip('CMS entry src/js/cms.js not present, skipping CMS bundle');
}

// 5. Hugo. Emits all HTML plus the fingerprinted CSS/JS from site/assets.
run(
  // HUGO_BASEURL lets a local or preview build emit its own origin. Without
  // it, a dev host would ship caddyed.com canonical URLs -- telling a search
  // engine that every preview page is a duplicate of the live one. Defaults
  // to the config's production baseURL when unset.
  `HUGO_BASEURL=${process.env.HUGO_BASEURL || 'https://caddyed.com/'} hugo --source=site --destination=../site/public --minify --gc --cleanDestinationDir`,
  { label: 'hugo build (Hugo Pipes assets)' }
);

// 6. Gate: fail if any page references a local asset that does not exist.
run('node ci/verify-build.js', { label: 'verify build output' });

// 7. Summary.
function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const pages = fs.existsSync(PUBLIC_DIR)
  ? execSync(`find "${PUBLIC_DIR}" -name '*.html' | wc -l`, { encoding: 'utf8' }).trim()
  : '0';

console.log(`\n${'='.repeat(58)}`);
log(`build finished in ${secs}s`);
console.log(`   publish dir : ${path.relative(ROOT, PUBLIC_DIR)}`);
console.log(`   html pages  : ${pages}`);
console.log(`   total size  : ${(dirSize(PUBLIC_DIR) / 1024 / 1024).toFixed(2)} MB`);
console.log('='.repeat(58));
console.log('   Ready to deploy (prebuilt -- no Netlify build minutes used):');
console.log('     netlify deploy --dir=site/public --functions=netlify/functions --prod\n');
