#!/usr/bin/env node
/**
 * clean-placeholders.js -- one-off: remove "N/A" placeholders already written
 * into content front matter by earlier syncs.
 *
 * scripts/inventory/schema.js now strips placeholders at the source, so this
 * cannot recur. These 8 files were written before that fix, so the bad value is
 * already on disk and in the built site. Regenerating them means re-running a
 * crawl against the dealer's site, which is exactly the kind of full scrape the
 * incremental sync exists to avoid.
 *
 * So this edits the two places the placeholder appears, and only those:
 *   subtitle:       the printed spec line
 *   <field>: N/A    the stored value
 *
 * It refuses to guess. If a file has a placeholder in a field this does not
 * know about, it says so and stops, rather than silently leaving it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// This file lives in scripts/inventory/, so the repo root is two levels up.
const DIR = path.join(__dirname, '..', '..', 'site', 'content', 'inventory');
const PLACEHOLDER = /^(n\/?a|na|none|null|unknown|tbd|tba|not\s*available|-+|\?+)$/i;

/**
 * The same rule schema.js uses, so this script and the generator agree.
 *
 * Kept in step deliberately: clean-placeholders.js tidies what is already on
 * disk, schema.js decides what is written next time. If they disagree, the
 * cleaner leaves behind exactly the values the generator would not have
 * produced -- which is how "Engine, none" survived the first pass.
 */
function isPlaceholder(value) {
  const s = String(value).trim();
  if (!s) return true;
  if (PLACEHOLDER.test(s)) return true;
  // `engine: "Engine, none"` -- a label plus a placeholder. Same shape the
  // schema handles, so it is handled here too.
  const stripped = s.replace(/^[A-Za-z][A-Za-z /]{0,20}\s*,\s*/, '');
  return stripped !== s && (!stripped || PLACEHOLDER.test(stripped));
}

// Only spec fields. Touching price or mileage on a guess would be much worse
// than leaving a placeholder.
const SPEC_FIELDS = ['drivetrain', 'transmission', 'engine', 'exterior_color', 'interior_color'];

let touched = 0;
let problems = [];

for (const name of fs.readdirSync(DIR)) {
  if (!name.endsWith('.md')) continue;
  const file = path.join(DIR, name);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  let changed = false;

  // 1. the spec-line subtitle: "AWD · N/A · 4 mi" -> "AWD · 4 mi"
  after = after.replace(/^(subtitle:\s*)(.+)$/m, (m, key, value) => {
    const parts = String(value)
      .split('·')
      .map((s) => s.trim())
      .filter((s) => s && !PLACEHOLDER.test(s));
    const next = parts.join(' · ');
    if (next !== String(value).trim()) changed = true;
    return `${key}${next}`;
  });

  // 2. the stored spec fields: "transmission: N/A" -> the line goes away
  for (const field of SPEC_FIELDS) {
    const re = new RegExp(`^(${field}:\\s*)(.+)$`, 'm');
    if (!re.test(after)) continue;
    const m = after.match(re);
    if (isPlaceholder(m[2])) {
      after = after.replace(re, '');
      changed = true;
    }
  }

  // 3. the auto-generated body prose.
  //
  //    defaultBody() in content.js builds "AWD · N/A · 3,428 mi. AWD drivetrain
  //    · N/A · Engine, none · Radiant Red Tintcoat exterior. ..." from the same
  //    fields, so the placeholders are baked into the paragraph too. This is
  //    generated text, not hand-written, so tidying the "· N/A ·" runs is safe
  //    -- and it is what stops the page reading "Engine, none" to a shopper.
  if (/\bN\/A\b/.test(after.split(/^---$/m)[2] || '')) {
    const [head, fm, body] = after.split(/^---$/m);
    if (body !== undefined) {
      const cleanedBody = body
        .replace(/\s*·\s*N\/A\s*(?=·|$)/g, '')   // " · N/A ·" runs
        .replace(/\bN\/A\s*·\s*/g, '')            // "N/A ·" at the start
        .replace(/,\s*none\b/gi, '')               // "Engine, none"
        // Removing a segment can leave the separator welded to the word before
        // it ("AWD drivetrain· Engine"). Put the space back.
        .replace(/(\S)·/g, '$1 ·')
        .replace(/·\s*·/g, '·')
        .replace(/\s{2,}/g, ' ')
        .replace(/·\s*\./g, '.');                  // a trailing separator
      if (cleanedBody !== body) {
        after = `${head}---${fm}---${cleanedBody}`;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(file, after);
    touched += 1;
    console.log(`  cleaned ${name}`);
  }

  // 3. anything left that we do not recognise
  const leftovers = after.split('\n').filter((l) => {
    const m = l.match(/^([a-z_]+):\s*(.+)$/);
    return m && PLACEHOLDER.test(String(m[2]).trim());
  });
  if (leftovers.length) problems.push(`${name}: ${leftovers.map((l) => l.trim()).join(', ')}`);
}

console.log(`\n  ${touched} file(s) cleaned`);
if (problems.length) {
  console.log('\n  Left alone, because I will not guess at these:');
  for (const p of problems) console.log(`    ${p}`);
}
