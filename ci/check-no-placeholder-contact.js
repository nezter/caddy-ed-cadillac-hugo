#!/usr/bin/env node
/**
 * check-no-placeholder-contact.js -- no fictional contact details reach the site.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * The built site carried `(704) 555-1234` in the header, the footer and the
 * contact page -- on every page, as a working `tel:` link. The correct number
 * was in `site/config.toml` the whole time and appeared zero times.
 *
 * Three separate things had to be wrong for that to ship:
 *
 *   1. Six templates read `.Site.Params.phone | default "704-555-1234"`. The
 *      param was set, so the default never fired -- but a fallback that renders
 *      a 555 line is worse than no fallback. A customer who dials it reaches
 *      nobody, and nothing on the page looks broken.
 *
 *   2. `site/content/contact/_index.md` set `phone:` in its OWN front matter. A
 *      page param wins over a site param, so the contact page -- the one page
 *      where the number matters most -- was pinned to the old value no matter
 *      what config said. Correcting the site-wide param could never have fixed
 *      it.
 *
 *   3. `site/assets/js/connect.js` and `site/content/lead-form.md` had the
 *      number written into the strings themselves, where no config change could
 *      reach them.
 *
 * Every one of those was invisible in review, and `npm run verify` passed.
 *
 * WHY A GATE AND NOT A REVIEW RULE
 * ---------------------------------
 * Because it was in the built output and the build said it was fine. This reads
 * the BUILT html, which is the only place all three of those paths converge --
 * a template, a front matter override and a JS string are three different files
 * and three different mechanisms, and the output is the one thing that cannot
 * disagree with itself.
 *
 * 555-0100 through 555-0199 are reserved by the North American Numbering Plan
 * for exactly this: to be recognisable as fictional. Any of them in customer-
 * facing output is a defect, not a style choice.
 *
 * Run:  node ci/check-no-placeholder-contact.js
 * Exits non-zero if any placeholder is found. Needs a built site/public.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'site', 'public');

/**
 * Each entry is [label, RegExp, what to do about it].
 *
 * Scoped deliberately. A rule that flags any 6-digit number would flag prices,
 * stock numbers and VINs; a rule that flags "example" would flag documentation
 * copied into the site. Each of these is a value that is wrong in ANY context.
 */
const RULES = [
  [
    // Any telephone value with 555 as the exchange, not just the 0100-0199
    // block the NANP formally reserves.
    //
    // The narrow rule was tried first and it MISSED the real defect: the site
    // was shipping 704-555-1234, and 1234 is not in 0100-0199. A rule written
    // to the letter of the reservation would have passed the exact bug it was
    // written for. No real US number has 555 as its exchange, so the whole
    // exchange is safe to reject.
    'a 555 telephone exchange (never a real US number)',
    /tel:[+0-9().\s-]*555[0-9().\s-]*|\(?\b\d{3}\)?[\s.-]555[\s.-]\d{4}\b/gi,
    'the confirmed dealership line is 803-431-6180',
  ],
  [
    // A bare `555-XXXX` in any punctuation. Written after the same 555 number
    // turned up a THIRD time in a place the first rule could not see: the SMS
    // opt-in rendered it as `+1 704-555-7890` in prose, not in a `tel:` link.
    // Requiring a tel: link, or a specific digit layout, is how it got past two
    // passes. `\b` on both sides keeps it off VINs, content hashes and prices.
    'a 555 number written out in prose',
    /\b555[\s.-]?\d{4}\b/g,
    'the confirmed dealership line is 803-431-6180',
  ],
  [
    'an example.com address',
    /\b[\w.+-]+@example\.(?:com|org|net)\b/gi,
    'a real contact address, or none at all',
  ],
  [
    'a reserved documentation domain',
    /\b(?:example\.org|test\.com|localhost)\b/gi,
    'remove it',
  ],
  [
    'lorem ipsum filler text',
    /\blorem ipsum\b/gi,
    'remove it',
  ],
  [
    'a John Doe / Jane Doe stand-in',
    /\b(?:John|Jane)\s+Doe\b/gi,
    'remove it',
  ],
  [
    'a TODO or FIXME left in customer-facing copy',
    /\b(?:TODO|FIXME|XXX):?\s/g,
    'remove it',
  ],
];

/**
 * The one true address, read from site/config.toml.
 *
 * Four different streets were in this repository at one point: "123 Luxury
 * Lane" (contact page front matter AND the JSON-LD that Google reads), "9020
 * South Blvd" (a data file no template referenced) and "9315 South Boulevard"
 * (an old build). Only the Pineville address is real.
 *
 * Duplicated because of a Hugo-specific trap: a page's own front matter WINS
 * over a site param. Correcting site/config.toml therefore could never have
 * fixed the contact page, and did not fix the schema.org block either, which is
 * a template literal with the address typed into it.
 *
 * So this is an invariant rather than a lint: any street address in the built
 * site that is not this one is a defect, wherever it came from.
 */
const CONFIRMED_STREET = '10725 Pineville Rd';

function confirmedStreet() {
  try {
    const toml = fs.readFileSync(path.join(ROOT, 'site', 'config.toml'), 'utf8');
    const m = toml.match(/^\s*address\s*=\s*"([^"]+)"/m);
    return m ? m[1].split(',')[0].trim() : CONFIRMED_STREET;
  } catch {
    return CONFIRMED_STREET;
  }
}

/** A US street address: house number, street words, a street-type suffix. */
const STREET_RE = /\b\d{1,6}\s+[A-Z][A-Za-z]*(?:[\s-][A-Z][A-Za-z]*)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Lane|Ln|Drive|Dr|Way|Ct|Court|Highway|Hwy|Parkway|Pkwy|Trail|Trl|Circle|Cir)\b\.?/g;

function htmlFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(PUBLIC)) {
    console.error('  SKIPPED: site/public does not exist. Build the site first.');
    console.error('  This check reads the BUILT html on purpose -- a template, a');
    console.error('  front-matter override and a JS string are three different files,');
    console.error('  and the output is the only place they cannot disagree.');
    process.exit(0);   // a skip is not a failure; ci/check-all.js reads the line above
  }

  const files = htmlFiles(PUBLIC);
  const findings = [];

  // The address invariant, applied as its own rule so a mismatch reads as a
  // wrong-street-address problem rather than as a generic placeholder.
  const street = confirmedStreet();
  const streetRule = [
    `a street address other than the confirmed one ("${street}")`,
    STREET_RE,
    'every street address on this site must be the one in site/config.toml',
  ];

  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    for (const [label, re, fix] of [...RULES, streetRule]) {
      // A fresh RegExp per file: these carry /g and would otherwise carry
      // lastIndex across files and miss every second match.
      const rx = new RegExp(re.source, re.flags);
      let m;
      while ((m = rx.exec(body)) !== null) {
        // The address rule admits the confirmed street and rejects the rest.
        if (label === streetRule[0] && m[0].replace(/\.$/, '').trim() === street) continue;
        findings.push({
          file: path.relative(ROOT, file),
          label,
          fix,
          match: m[0].trim().slice(0, 60),
        });
        if (m.index === rx.lastIndex) rx.lastIndex += 1;
      }
    }
  }

  console.log(`  pages scanned: ${files.length}`);
  console.log(`  rules:         ${RULES.length}`);

  if (!findings.length) {
    console.log('\n  OK: no placeholder contact details in the built site.');
    return;
  }

  console.log('');
  // Group by rule so one systemic mistake reads as one line, not 40.
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.label)) byRule.set(f.label, []);
    byRule.get(f.label).push(f);
  }
  for (const [label, items] of byRule) {
    console.log(`  FAIL ${label}`);
    console.log(`       ${items.length} occurrence(s) in ${new Set(items.map((i) => i.file)).size} page(s)`);
    console.log(`       fix: ${items[0].fix}`);
    for (const f of items.slice(0, 5)) {
      console.log(`         ${f.file}  "${f.match}"`);
    }
    if (items.length > 5) console.log(`         ... and ${items.length - 5} more`);
    console.log('');
  }

  console.error('  PLACEHOLDER CONTACT DETAIL IN CUSTOMER-FACING OUTPUT.');
  console.error('  A 555 number is reserved for fiction: a customer who dials it');
  console.error('  reaches nobody, and nothing on the page looks wrong.');
  process.exit(1);
}

main();
