#!/usr/bin/env node
/**
 * verify-build.js -- build output gate.
 *
 * Fails the build if the generated site references any local asset that does not
 * exist. This is the check that would have caught the original outage: every
 * page hardcoded `/js/index.js`, which no build step ever produced, so the site
 * shipped with a 404 for its JavaScript and nobody noticed.
 *
 * Also reports bundle sizes so regressions in payload are visible in CI logs.
 *
 * Usage: node ci/verify-build.js [publicDir]
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.resolve(process.argv[2] || 'site/public');

// Anything not rooted at a slash is either external or a page link.
const SKIP_PROTOCOLS = /^(https?:)?\/\//i;
const ASSET_EXT =
  /\.(js|mjs|css|woff2?|ttf|eot|otf|png|jpe?g|gif|svg|webp|avif|ico|json|xml|txt|webmanifest|mp4|webm|pdf)$/i;

// Warn thresholds for the fingerprinted front-end bundles.
const BUDGET = { js: 250 * 1024, css: 80 * 1024 };

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function fail(msg) {
  console.error(`\n  \x1b[1;31mFAIL\x1b[0m  ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.log(`  \x1b[1;33mWARN\x1b[0m  ${msg}`);
}

function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error(`\n  \x1b[1;31mFAIL\x1b[0m  publish dir missing: ${PUBLIC_DIR}`);
    process.exit(1);
  }

  const files = walk(PUBLIC_DIR);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  console.log(`\n  Verifying ${htmlFiles.length} HTML file(s) in ${PUBLIC_DIR}`);

  if (htmlFiles.length === 0) {
    fail('no HTML was generated -- the Hugo build produced nothing');
    return;
  }

  // Collect every src/href/srcset reference across all pages.
  const missing = new Map(); // asset -> Set(pages)
  let checked = 0;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const page = path.relative(PUBLIC_DIR, file);

    const refs = new Set();
    for (const m of html.matchAll(/(?:src|href)\s*=\s*["']?([^"'\s>]+)["']?/gi)) {
      refs.add(m[1]);
    }
    // srcset: "a.jpg 1x, b.jpg 2x"
    for (const m of html.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
      for (const part of m[1].split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) refs.add(u);
      }
    }

    for (let ref of refs) {
      if (!ref) continue;
      if (SKIP_PROTOCOLS.test(ref)) continue; // external CDN / mailto / data:
      if (ref.startsWith('#') || ref.startsWith('?')) continue;
      if (ref.startsWith('//')) continue;
      // Strip query/hash before filesystem resolution.
      ref = ref.split('#')[0].split('?')[0];
      if (!ref) continue;
      if (!ASSET_EXT.test(ref) && !ref.endsWith('/')) continue; // page links

      // Only validate root-relative asset URLs; relative ones are rare here.
      if (!ref.startsWith('/')) continue;
      checked++;

      const target = path.join(PUBLIC_DIR, ref.replace(/^\/+/, ''));
      const ok = fs.existsSync(target) || fs.existsSync(target + '/index.html');
      if (!ok) {
        if (!missing.has(ref)) missing.set(ref, new Set());
        missing.get(ref).add(page);
      }
    }
  }

  console.log(`  Checked ${checked} local asset reference(s)`);

  if (missing.size > 0) {
    console.error(
      `\n  \x1b[1;31mFAIL\x1b[0m  ${missing.size} referenced asset(s) do not exist:\n`
    );
    for (const [ref, pages] of [...missing].sort()) {
      const list = [...pages];
      const shown = list.slice(0, 3).join(', ');
      const more = list.length > 3 ? ` (+${list.length - 3} more pages)` : '';
      console.error(`    ${ref}\n      referenced by: ${shown}${more}`);
    }
    console.error('');
    process.exitCode = 1;
  } else {
    console.log(`  \x1b[1;32mOK\x1b[0m    all referenced assets exist`);
  }

  // --- size budget ---------------------------------------------------------
  const bundles = files.filter((f) => /\/(js|css)\//.test(f) && /\.(js|css)$/.test(f));
  if (bundles.length) {
    console.log(`\n  Front-end bundles:`);
    for (const b of bundles.sort()) {
      const size = fs.statSync(b).size;
      const rel = path.relative(PUBLIC_DIR, b);
      const kind = b.endsWith('.css') ? 'css' : 'js';
      const limit = BUDGET[kind];
      const over = size > limit;
      const tag = over ? '\x1b[1;33mOVER\x1b[0m' : '\x1b[1;32m OK \x1b[0m';
      console.log(
        `    [${tag}] ${rel.slice(0, 58).padEnd(58)} ${(size / 1024)
          .toFixed(1)
          .padStart(8)} KB`
      );
      if (over) warn(`${rel} is ${(size / 1024).toFixed(1)}KB (budget ${limit / 1024}KB)`);
    }
  }

  // --- sanity: the site must actually have JS -----------------------------
  const anyJs = bundles.some((f) => f.endsWith('.js'));
  if (!anyJs) {
    fail('no JavaScript was emitted -- the front end is inert');
  }

  if (process.exitCode) {
    console.error(`\n  \x1b[1;31mBUILD VERIFICATION FAILED\x1b[0m\n`);
  } else {
    console.log(`\n  \x1b[1;32mBUILD VERIFICATION PASSED\x1b[0m\n`);
  }
}

main();
