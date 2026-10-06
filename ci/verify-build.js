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

    // 0. Redirect stubs are not documents.
    //
    // Hugo emits a 246-byte alias page for a paginator's first page
    // (/inventory/page/1/ -> /inventory/). It is a meta-refresh and a canonical
    // link, nothing else. Demanding an <h1> of it is a false positive, and the
    // alternative -- loosening the rule for every small file -- would let a real
    // page slip through. Recognise the shape instead.
    const isAlias =
      body.length < 2000 &&
      /http-equiv=["']?refresh|http-equiv=refresh/i.test(html) &&
      /rel=["']?canonical/i.test(html);
    if (isAlias) continue;

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
  //
  // Two families of file, and the filter used to only see one of them.
  //
  //   js/<name>.<sha512>.js    the global bundle, from assets.html
  //   js/<name>.<sha512>       EVERY page-scoped bundle, from entry.html,
  //                            which fingerprints to a bare name with no
  //                            extension because the targetPath it passes
  //                            already carries the stem
  //
  // Requiring \.js meant 13 of the 14 emitted JS bundles were never measured
  // against a budget -- including admin/search, which is the largest front end
  // on the site. A budget that silently exempts two thirds of what it exists to
  // measure is worse than no budget, because it reports OK.
  //
  // Fingerprinted names are recognised by splitting on the final dot and
  // checking the last segment is hex of sufficient length. A clever regex was
  // tried first and matched only 1 of 14 emitted bundles, twice, for reasons
  // that were not worth another round of debugging. This is obvious and it
  // counts the files.
  const isBundleName = (base) => {
    const i = base.lastIndexOf('.');
    if (i <= 0) return /\.(js|css)$/.test(base);
    const ext = base.slice(i + 1);
    const last = base.slice(i + 1);
    // a trailing .js / .css: the hash is the segment before it
    if (last === 'js' || last === 'css') {
      const prev = base.slice(0, i);
      const j = prev.lastIndexOf('.');
      return j > 0 && /^[a-f0-9]{32,}$/.test(prev.slice(j + 1));
    }
    // NO EXTENSION IS NOT A BUNDLE.
    //
    // This used to `return /^[a-f0-9]{32,}$/.test(last)` here, accepting
    // `inventory-filter.<sha512>` as a valid bundle. That is not a harmless
    // relaxation -- it codified a production outage as acceptable.
    //
    // Without the extension the CDN cannot know the file is JavaScript and
    // serves it as application/octet-stream. netlify.toml sets
    // `X-Content-Type-Options: nosniff`, and under nosniff a browser refuses to
    // execute a classic script that is not a JavaScript MIME type. So every
    // extensionless bundle silently refuses to run in production, while the
    // preview (which had no nosniff) and all four gates reported success.
    //
    // A gate that cannot tell a file that will run from one the browser will
    // refuse is not checking the thing that breaks. Return false; the explicit
    // check below names each offender.
    return false;
  };
  // Fingerprinted output under /js/ or /css/ that is NOT a recognised bundle is
  // almost always a bundle that lost its extension. Reported explicitly, by
  // name, because the failure mode is invisible: the file exists, every asset
  // reference resolves, and the browser simply refuses to run it.
  const extensionless = files.filter(
    (f) => /[/\\](js|css)[/\\]/.test(f) && !isBundleName(path.basename(f)) &&
      /[a-f0-9]{32,}$/.test(path.basename(f))
  );
  const bundles = files.filter(
    (f) => /[/\\](js|css)[/\\]/.test(f) && isBundleName(path.basename(f))
  );

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

  // --- raw HTML that a blank line turned into a code block ---------------
  //
  // A raw HTML block in markdown (Goldmark types 6/7) ends at a BLANK LINE. So
  // markup indented and split by blank lines silently becomes an indented code
  // block -- four spaces is markdown for "code" -- and the page renders
  // <pre><code> full of escaped tags, plus 379px of horizontal overflow because
  // a <pre> does not wrap.
  //
  // /lead-form/ had exactly this: half the lead form was being displayed to
  // visitors as source code. The .md looked correct, the page returned 200, and
  // every other gate passed, because nothing was broken -- it was just being
  // shown as text.
  //
  // Detect it in the OUTPUT rather than the source, because that is where the
  // consequence is: a code block whose body is escaped markup.
  // Three independent tells, because a broken raw HTML block does not always
  // escape all of them and a check that requires all three will miss real ones:
  //   - an escaped tag         &lt;div
  //   - escaped quotes         &quot;  &#39;
  //   - a class/id attribute   class=" or id="   (a code block rarely has these
  //                              written as real quotes, because they are escaped)
  // A genuine code block of source contains none of them, so this does not
  // false-positive on a page that legitimately shows code.
  const ESCAPED_MARKUP = /&lt;\/?[a-z][\w-]*[\s/>]|&quot;|&#39;|&gt;(?!\w)/i;
  const RAW_ATTRS = /\s(?:class|id|href|src|name|type|value)\s*=\s*"/i;
  const codeBlocksAsMarkup = [];
  for (const f of files) {
    if (!f.endsWith('.html')) continue;
    const rel = path.relative(PUBLIC_DIR, f);
    const html = fs.readFileSync(f, 'utf8');
    const re = /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (ESCAPED_MARKUP.test(m[1]) || RAW_ATTRS.test(m[1])) {
        codeBlocksAsMarkup.push(rel);
        break;
      }
    }
  }
  if (codeBlocksAsMarkup.length) {
    fail(
      `${codeBlocksAsMarkup.length} page(s) render markup as a code block -- a raw HTML ` +
        'block in a .md file was terminated by a blank line:'
    );
    for (const rel of codeBlocksAsMarkup) console.error(`    ${rel}`);
    console.error(
      '    Remove the blank lines inside the raw HTML in the .md, or run\n' +
        '    scripts/archive/fix-raw-html-blocks.py. Whitespace between block elements is\n' +
        '    insignificant in HTML, so removing them changes nothing that renders --\n' +
        '    except the visitors no longer see your markup as source code.'
    );
  } else {
    console.log(`  \x1b[1;32mOK\x1b[0m    no page renders markup as a code block`);
  }

  // --- no unrendered template syntax in the output -----------------------
  //
  // Hugo fails LOUDLY on a malformed action and SILENTLY on an orphaned
  // fragment. A leftover `"style" "filter: ...")}}` from a rewritten partial
  // is not a template action, so Hugo prints it as text, and the footer of
  // every page in the site rendered:
  //
  //     "style" "filter: brightness(0)
  //     invert(1); margin-bottom: var(--
  //     space-3)"}}
  //
  // Nothing failed. The build passed, all four gates passed, the page returned
  // 200, and the header logo was visibly correct a few hundred pixels above it.
  // It is only visible by looking at the page.
  //
  // Checked on the OUTPUT, because that is where the consequence is. A `{{` in
  // a text node is unrendered template syntax, always.
  const unrendered = [];
  for (const f of files) {
    if (!f.endsWith('.html')) continue;
    const html = fs.readFileSync(f, 'utf8');
    // Only inside text, not inside a <script>/<style> block or an attribute --
    // JS bundles legitimately contain {{ }} in template literals and regex.
    const stripped = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    if (/\{\{|\}\}/.test(stripped)) {
      unrendered.push(path.relative(PUBLIC_DIR, f));
    }
  }
  if (unrendered.length) {
    fail(
      `${unrendered.length} page(s) render unrendered template syntax ` +
        '(stray {{ or }} in the visible text)'
    );
    for (const rel of unrendered) console.error(`    ${rel}`);
    console.error(
      '    An orphaned fragment of a partial -- text left behind when a template\n' +
        '    was rewritten -- is not a template action, so Hugo prints it instead of\n' +
        '    failing. Everything else about the page looks correct.'
    );
  } else {
    console.log(`  \x1b[1;32mOK\x1b[0m    no page renders unrendered template syntax`);
  }

  // --- sanity: the site must actually have JS -----------------------------
  const anyJs = bundles.some((f) => f.endsWith('.js'));
  if (!anyJs) {
    fail('no JavaScript was emitted -- the front end is inert');
  }

  // --- every bundle must carry its extension ------------------------------
  // This is the check that would have caught the production outage on
  // 2026-09-27, and it costs one array pass. See isBundleName above.
  if (extensionless.length) {
    fail(
      `${extensionless.length} bundle(s) emitted WITHOUT a file extension: ` +
        extensionless.map((f) => path.relative(PUBLIC_DIR, f)).join(', ')
    );
    console.error(
      '    A bundle with no .js/.css extension is served as application/octet-stream.\n' +
        '    netlify.toml sets X-Content-Type-Options: nosniff, and under nosniff a\n' +
        '    browser REFUSES to execute a classic script that is not a JavaScript MIME\n' +
        '    type. The file exists, every asset reference resolves, and the script\n' +
        '    silently never runs. Check "targetPath" in the Hugo Pipes js.Build / toCSS\n' +
        '    options under site/layouts/partials/.'
    );
  } else {
    console.log(`  \x1b[1;32mOK\x1b[0m    every emitted bundle carries a .js/.css extension`);
  }

  if (process.exitCode) {
    console.error(`\n  \x1b[1;31mBUILD VERIFICATION FAILED\x1b[0m\n`);
  } else {
    console.log(`\n  \x1b[1;32mBUILD VERIFICATION PASSED\x1b[0m\n`);
  }
}

main();
