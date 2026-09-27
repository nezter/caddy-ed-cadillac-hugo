#!/usr/bin/env node
/**
 * rebuild-bodies.js -- one-off: regenerate the auto-generated body prose of
 * inventory pages from their (now-cleaned) front matter.
 *
 * WHY
 * ---
 * The paragraph under each vehicle's specs is generated, not written. The
 * generator, defaultBody() in scripts/inventory/content.js, used to read the
 * feed's placeholders literally, so the prose said "AWD drivetrain · N/A ·
 * Engine, none · Radiant Red Tintcoat exterior".
 *
 * schema.js now strips those placeholders before the body is built, so the next
 * sync produces clean prose. But the 8 affected pages were generated before that
 * fix, so their bodies still carry it, and regex-patching generated text is how
 * you end up with "AWD drivetrain· Engine ·" -- which is what the first attempt
 * at cleaning produced.
 *
 * The right repair is the one the build already knows how to do: throw the
 * derived text away and derive it again from the corrected source of truth.
 *
 * Hand-written prose is preserved. defaultBody() is only used for a body that is
 * still recognisably the generated one; anything a person has edited is left
 * alone, because this is a script and scripts should not overwrite writing.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { defaultBody, parseFrontMatter, renderFrontMatter } = require('./content');
const { normalise } = require('./schema');

const DIR = path.join(__dirname, '..', '..', 'site', 'content', 'inventory');

// The generated body always ends with this sentence. If it is missing, someone
// has written their own copy and we leave it alone.
const GENERATED_MARKER = 'Full specification and availability on request';

let rebuilt = 0;
let skipped = [];

for (const name of fs.readdirSync(DIR)) {
  if (!name.endsWith('.md')) continue;
  const file = path.join(DIR, name);
  const raw = fs.readFileSync(file, 'utf8');
  const { data, body } = parseFrontMatter(raw);

  if (!body || !body.includes(GENERATED_MARKER)) {
    skipped.push(name);
    continue;
  }

  // Re-normalise from front matter so the generator sees the same field names
  // it would have seen from the feed.
  const vehicle = normalise(
    {
      year: data.year,
      make: data.make,
      model: data.model,
      price: data.price,
      subtitle: data.subtitle,
      drivetrain: data.drivetrain,
      transmission: data.transmission,
      engine: data.engine,
      mileage: data.mileage,
      exterior_color: data.exterior_color,
      interior_color: data.interior_color,
    },
    0
  );

  const nextBody = defaultBody(vehicle);
  if (nextBody.trim() === body.trim()) continue;

  const merged = Object.assign({}, data, vehicle, {
    // Keep the front matter order stable: title first, then the rest.
    title: data.title,
  });
  const ordered = { title: merged.title };
  for (const k of Object.keys(merged)) {
    if (k !== 'title' && merged[k] !== undefined && merged[k] !== '') ordered[k] = merged[k];
  }

  fs.writeFileSync(file, renderFrontMatter(ordered) + nextBody);
  rebuilt += 1;
  console.log(`  rebuilt ${name}`);
}

console.log(`\n  ${rebuilt} body/bodies regenerated`);
if (skipped.length) {
  console.log(`  ${skipped.length} left alone (hand-written or empty)`);
}
