#!/usr/bin/env node
/**
 * check-structured-data.js -- the JSON a search engine reads is really JSON.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Car and AutoDealer schema blocks are built in templates, inside
 * <script type="application/ld+json">. Go's html/template treats that region
 * as JavaScript, so it escaped the encoder's own output a second time:
 *
 *   "name":"\"2026 CADILLAC XT5 Luxury\""
 *
 * The block still LOOKS like JSON, and a build does not care either way --
 * but a search engine reads that name as one that begins with a quote
 * character. The structured data for the most valuable page type on the site
 * -- a vehicle with a price and an identifier -- was silently wrong, on every
 * page, through a passing build and a green gate suite.
 *
 * The fix is `| safeJS` on every jsonify inside a script block (see
 * site/layouts/inventory/single.html, and partials/favourites-data.html,
 * which documents the pattern). This check is what keeps it fixed.
 *
 * WHAT IT READS
 * -------------
 * Every built page under site/public: each <script type="application/ld+json">
 * block must parse as JSON, and no string value may begin with an escaped
 * quote (the doubling symptom). The window.* payloads the pages hand to their
 * own scripts (CADDY_CONNECT, CADDY_STOCK_FALLBACK, FAVOURITES_VEHICLES) are
 * JavaScript object literals, not JSON -- the minifier drops the quotes on the
 * keys and writes false as !1, which is exactly what makes them minified JS --
 * so the check compiles them (compiling the body runs nothing) and scans them
 * for the same doubling.
 *
 *   node ci/check-structured-data.js
 *
 * Needs a built site/public. Says so and stops if it is missing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'site', 'public');

if (!fs.existsSync(PUBLIC)) {
  console.log('  SKIP  site/public does not exist.');
  console.log('        This check reads the BUILT pages; run the Hugo build first.');
  process.exit(0);   // a skip is not a failure; ci/check-all.js reads the line above
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'assets' || e.name === 'vehicles' || e.name === 'fonts') continue;
      walk(full, out);
    } else if (e.name.endsWith('.html')) {
      out.push(full);
    }
  }
}

/** Grab the balanced {...} or [...] that follows `needleRe`, string-aware. */
function payloadAfter(source, needleRe) {
  const m = needleRe.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < source.length && /\s/.test(source[i])) i++;
  const open = source[i];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  return null;
}

/** The doubling symptom: a value that begins with an escaped quote. */
const DOUBLED = /:\s*"\\"|\[\s*"\\"/;

const pages = [];
walk(PUBLIC, pages);

const problems = [];
let blocks = 0;
let payloads = 0;

for (const file of pages) {
  const rel = path.relative(PUBLIC, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');

  const lds = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
  for (const m of lds) {
    blocks++;
    const body = m[1].trim();
    try {
      JSON.parse(body);
    } catch (e) {
      problems.push(`${rel}: ld+json does not parse (${e.message.slice(0, 90)})`);
      continue;
    }
    if (DOUBLED.test(body)) {
      problems.push(`${rel}: ld+json value begins with an escaped quote -- the encoder output was escaped a second time (missing | safeJS)`);
    }
  }

  for (const name of ['CADDY_CONNECT', 'CADDY_STOCK_FALLBACK', 'FAVOURITES_VEHICLES']) {
    const payload = payloadAfter(html, new RegExp('window\\.' + name + '\\s*=\\s*'));
    if (payload === null) continue;
    payloads++;
    // A JS object literal, so not JSON.parse -- but it still has to be
    // syntactically whole. new Function compiles the text without running it.
    try {
      // eslint-disable-next-line no-new-func
      new Function('return (' + payload + ');');
    } catch (e) {
      problems.push(`${rel}: window.${name} does not compile (${e.message.slice(0, 90)})`);
      continue;
    }
    if (DOUBLED.test(payload)) {
      problems.push(`${rel}: window.${name} carries escaped-quote doubling (missing | safeJS)`);
    }
  }
}

for (const p of problems.slice(0, 30)) console.log('  FAIL  ' + p);

if (problems.length) {
  console.log('');
  console.log(`structured data: ${problems.length} problem(s) across ${pages.length} pages.`);
  console.log('The usual cause is a jsonify inside a <script> block without | safeJS:');
  console.log("html/template escapes the encoder's output a second time.");
  process.exit(1);
}

console.log(`structured data: ${blocks} ld+json block(s) on ${pages.length} pages and ${payloads} script payload(s);`);
console.log('all parse as JSON, none double-encoded.');
