#!/usr/bin/env node
/**
 * check-function-endpoints.js -- every URL a page calls must name a real function.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * This site is Hugo, and it deploys to Netlify. Its functions therefore live at
 * `/.netlify/functions/<name>`. There is no `/api/` route at all.
 *
 * `/api/` is a Gatsby convention, and a previous version of this project was
 * Gatsby. Three client modules still called it:
 *
 *   leadCapture.js   /api/lead
 *   connect.js       /api/contact
 *   FormManager.js   /api/schedule-appointment
 *
 * All three posted into a 404. In each case the field names were correct and
 * only the URL was wrong, which is why nothing looked broken until somebody
 * pressed the button:
 *
 *   - the lead form reported a failed send for every visitor who used it
 *   - "Ask Ed" on the home page reported a generic failure
 *   - the test-drive booking reported "Failed to confirm appointment. Please
 *     try again or call us directly" -- at the exact moment a customer had
 *     committed to booking
 *
 * The test-drive one is the reason this gate exists. Its unit test asserted
 * `expect(fetch).toHaveBeenCalledWith('/api/schedule-appointment')` -- the test
 * was written from the code, so it was green against the same dead URL the code
 * used. A test written from the code cannot notice the code is wrong.
 *
 * WHAT IT CHECKS
 * --------------
 * Every absolute URL the client JavaScript posts to or fetches:
 *
 *   /.netlify/functions/X   X.js must exist in netlify/functions/
 *   /api/X                  ALWAYS a failure, and says why
 *
 * Strings inside comments are ignored, because a comment describing the old
 * broken URL is documentation, not a call. The same lesson as
 * ci/check-front-end.js, which spent a while reporting `vehicle-inventory.js`
 * from a comment that explained it had been deleted.
 *
 * Run:  node ci/check-function-endpoints.js
 * Exits non-zero on failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'site', 'assets', 'js');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');

/** Strip comments, so documentation about a dead URL is not a finding. */
function uncommented(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(full, out);
    } else if (e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Gaps that ci/verify-endpoints.js already declares, read as TEXT rather than
 * by requiring it.
 *
 * Requiring it would run the whole endpoint check and print a failure, so the
 * declaration is parsed instead. The alternative -- exporting it -- means
 * guarding that script with `require.main === module`, which is a change to a
 * file this gate does not own, for one shared list.
 *
 * One declaration read by two checks, which is the point: a gap declared in one
 * place and discovered in another is two facts that can disagree, and which one
 * a build sees depends on which runs first.
 */
function declaredGaps() {
  const file = path.join(__dirname, 'verify-endpoints.js');
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return new Set();
  }
  const start = source.indexOf('const KNOWN_MISSING');
  if (start < 0) return new Set();
  const block = source.slice(start, source.indexOf('\n);', start) + 3);
  // The first string on each entry line is the function name.
  return new Set(
    [...block.matchAll(/^\s*\[?\s*'([a-z0-9-]+)'/gm)].map((m) => m[1])
      .concat([...block.matchAll(/^\s*'([a-z0-9-]+)',\s*$/gm)].map((m) => m[1]))
  );
}

function functionsAvailable() {
  return new Set(
    fs
      .readdirSync(FUNCTIONS)
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replace(/\.js$/, ''))
  );
}

const main = () => {
  const available = functionsAvailable();
  const declared = declaredGaps();
  const findings = [];
  let urlsChecked = 0;

  for (const file of walk(JS)) {
    const body = uncommented(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);

    // Any quoted absolute URL. Backtick form included: these files are ESM and
    // several endpoints are template literals.
    const re = /['"`](\/[^'"`\s]{2,120})['"`]/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const url = m[1];
      const isFunction = url.startsWith('/.netlify/functions/');
      const isLegacy = url.startsWith('/api/');
      if (!isFunction && !isLegacy) continue;

      urlsChecked += 1;
      const line = body.slice(0, m.index).split('\n').length;

      if (isLegacy) {
        findings.push({
          rel,
          line,
          url,
          why:
            'there is no /api/ route on this site. It is a Gatsby convention; ' +
            'this is Hugo on Netlify, where functions are /.netlify/functions/<name>',
        });
        continue;
      }

      const name = url.slice('/.netlify/functions/'.length).split(/[/?#]/)[0];
      if (declared.has(name)) continue;   // declared in ci/verify-endpoints.js
      if (!available.has(name)) {
        findings.push({
          rel,
          line,
          url,
          why: `no function named ${name}.js in netlify/functions/`,
        });
      }
    }
  }

  console.log(`  client JS files scanned: ${walk(JS).length}`);
  console.log(`  function URLs checked:   ${urlsChecked}`);
  console.log(`  declared gaps honoured: ${declared.size} (from ci/verify-endpoints.js)`);

  if (!findings.length) {
    console.log('\n  OK: every URL the site calls names a function that exists.');
    return;
  }

  console.log('');
  for (const f of findings) {
    console.log(`  FAIL ${f.rel}:${f.line}`);
    console.log(`       ${f.url}`);
    console.log(`       ${f.why}`);
    console.log('');
  }
  console.error(`  ${findings.length} client URL(s) point at something that does not exist.`);
  console.error('  The payload is usually correct and only the path is wrong, so');
  console.error('  nothing fails until a visitor presses the button.');
  process.exit(1);
};

main();
