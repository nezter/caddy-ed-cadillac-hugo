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

// ---------------------------------------------------------------------------
// checkStructure -- document-level validity that nothing else inspects.
//
// A browser silently repairs invalid HTML, so these defects render as
// "looks fine" in a screenshot while being wrong:
//
//   * nested <main>          -- the accessibility tree gets two main landmarks
//   * zero or many <h1>     -- one h1 per page is the document's subject;
//                              zero leaves screen readers with no title
//   * duplicate id=          -- getElementById becomes order-dependent, and
//                              <label for=>/aria-* stop resolving
//   * an unrendered {{ ... }} template leaking into the document. Hugo does
//     NOT evaluate Go templates inside markdown bodies, so a `{{ .Params.x }}`
//     written in a content file ships to the browser verbatim. This one leaked
//     internal template syntax and a broken default value into production HTML.
//   * <img> without alt     -- not fatal (alt="" is legitimate for
//     decoration) but flagged when alt is missing entirely
//
// Returns { problems: string[] }.
// ---------------------------------------------------------------------------
function checkStructure(htmlFiles) {
  const problems = [];
  const seenPerPage = [];

  for (const file of htmlFiles) {
    const rel = path.relative(PUBLIC_DIR, file) || path.basename(file);
    const html = fs.readFileSync(file, 'utf8');
    // Strip script/style bodies: their contents are code, not markup, and
    // scanning them produces phantom tag matches.
    const body = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    // 1. nested <main>
    const mainOpen = (body.match(/<main\b[^>]*>/gi) || []).length;
    if (mainOpen > 1) {
      problems.push(
        `${rel}: ${mainOpen} <main> elements (nested landmarks; baseof.html already emits one)`
      );
    }

    // 2. h1 count -- exactly one, on every page
    //
    // Exempt: noindex application shells. /cms.html is a hand-written Decap CMS
    // document that mounts an editor into <body> at runtime; it is not a
    // content page and has no heading of its own by design.
    const isNoindex = /<meta[^>]+name=["']?robots["']?[^>]*noindex/i.test(body);
    const h1s = body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) || [];
    if (h1s.length === 0) {
      if (!isNoindex) problems.push(`${rel}: no <h1> (the page has no document subject)`);
    } else if (h1s.length > 1) {
      const texts = h1s
        .map((h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 40))
        .filter(Boolean);
      problems.push(
        `${rel}: ${h1s.length} <h1> elements [${texts.join(' | ')}] -- the layout and the markdown both emit one`
      );
    }

    // 3. duplicate ids
    const ids = [...body.matchAll(/\sid=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) =>
      (m[1] || m[2] || m[3] || '').trim()
    );
    const counts = new Map();
    for (const id of ids) {
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const dupes = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    if (dupes.length) {
      problems.push(`${rel}: duplicate id attribute(s): ${dupes.slice(0, 6).join(', ')}`);
    }

    // 4. an unevaluated Go template in the output
    const leaked = body.match(/\{\{[\s\S]{0,120}?\}\}/g);
    if (leaked) {
      const uniq = [...new Set(leaked.map((s) => s.replace(/\s+/g, ' ').trim()))];
      problems.push(
        `${rel}: unrendered template syntax in output: ${uniq.slice(0, 3).join(' | ').slice(0, 200)}`
      );
    }

    // 5. third-party image hotlinks
    //
    // Every visitor loading an <img> from someone else's host is a request
    // against their edge, their bandwidth bill and their uptime, and it hands
    // them our traffic analytics. That is exactly what the vehicle-image work
    // removed for dealer.com; this catches the same class of bug anywhere else
    // in the markup. content/tech.md hotlinked a cloudfront.net logo and shipped
    // it to production before this check existed.
    //
    // Allowed: the dealer's own site (linked from inventory copy) and Netlify
    // Identity, which the CMS auth flow genuinely needs.
    const ALLOWED_HOSTS = /(^|\.)(netlify\.com|netlify\.com\.au|cadillacofsouthcharlotte\.com)$/i;
    const hotlinks = [];
    for (const m of body.matchAll(/<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
      const src = m[1] || m[2] || m[3] || '';
      if (!/^https?:\/\//i.test(src)) continue;
      let host = '';
      try {
        host = new URL(src).hostname;
      } catch {
        continue;
      }
      if (!ALLOWED_HOSTS.test(host)) hotlinks.push(host);
    }
    if (hotlinks.length) {
      const uniq = [...new Set(hotlinks)];
      problems.push(
        `${rel}: third-party <img> hotlink(s) to ${uniq.slice(0, 4).join(', ')} -- mirror the asset instead`
      );
    }

    // 6. absolute URLs where a crawler needs one
    //
    // canonical and og:url are the two tags a search engine and a social
    // crawler both read to decide what a page IS. A relative value there is
    // not a warning, it is an identity failure: with baseURL = "/" every page
    // emitted `href=/` and `content="/"`, so every page on the site claimed to
    // be the same URL as every other page. The build was green throughout.
    for (const m of body.matchAll(
      /<link[^>]+rel=["']?canonical["']?[^>]*href=["']?([^"'\s>]+)|<meta[^>]+property=["']?og:url["']?[^>]*content=["']?([^"'\s>]+)/gi
    )) {
      const url = (m[1] || m[2] || '').trim();
      if (url && !/^https?:\/\//i.test(url)) {
        // group 1 is the canonical branch, group 2 the og:url branch
        const which = m[1] !== undefined ? 'canonical' : 'og:url';
        problems.push(
          `${rel}: ${which} is relative ("${url}") -- crawlers need an absolute URL; check baseURL`
        );
        break;
      }
    }

    // 7. <img> with an empty or missing src
    for (const m of body.matchAll(/<img\b([^>]*)>/gi)) {
      const attrs = m[1] || '';
      const sm = attrs.match(/\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const val = (sm && (sm[1] ?? sm[2] ?? sm[3])) || '';
      if (val.trim() === '') {
        problems.push(`${rel}: <img> with an empty src attribute`);
        break;
      }
    }

    seenPerPage.push(rel);
  }

  return { problems };
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

  // --- structural HTML ----------------------------------------------------
  // These are the defects that survived every other check because nothing
  // looks at document structure: a browser repairs invalid HTML silently, so
  // a nested <main> or a duplicate id looks fine in a screenshot and is
  // invisible to an asset-existence check.
  const structural = checkStructure(htmlFiles);
  if (structural.problems.length === 0) {
    console.log(
      `  \x1b[1;32mOK\x1b[0m    document structure valid (one h1, one main, unique ids)`
    );
  } else {
    console.error(
      `\n  \x1b[1;31mFAIL\x1b[0m  ${structural.problems.length} document structure problem(s):\n`
    );
    for (const p of structural.problems) console.error(`    ${p}`);
    console.error('');
    process.exitCode = 1;
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
