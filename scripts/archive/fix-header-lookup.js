#!/usr/bin/env node
/**
 * make header lookup case-insensitive everywhere an auth token is read.
 *
 * WHY
 * ---
 * HTTP header names are case-insensitive by specification, and Netlify's
 * runtime delivers them lowercased. But `event.headers.authorization` only
 * matches that one spelling. A caller arriving with `Authorization` -- any
 * other runtime, anything invoking the handler directly, a hand-built event --
 * is silently treated as UNAUTHENTICATED.
 *
 * That is not cosmetic. "Unauthenticated" and "rejected" are the same 401, so
 * the distinction is invisible, and a test asserting rejection passes whether
 * the token was absent or merely spelled differently. That is how a whole
 * auth-middleware suite here came to pass some of its rejection cases for the
 * wrong reason while never reaching the authorisation path at all.
 *
 * One helper, applied to every reader, rather than six slightly different
 * inline replacements that drift apart again.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** Extracts a header by name, case-insensitively, from a Netlify event. */
const HELPER = `
/**
 * Read a request header by name, case-insensitively.
 *
 * HTTP header names are case-insensitive (RFC 7230) and Netlify's runtime
 * delivers them lowercased, but \`event.headers.authorization\` matches only
 * that one spelling. Anything arriving as \`Authorization\` -- another runtime,
 * a direct invocation, a hand-built test event -- is then treated as
 * unauthenticated, which is indistinguishable from a rejected token because
 * both are a 401.
 */
function headerValue(headers, name) {
  const wanted = String(name).toLowerCase();
  const source = headers || {};
  for (const key of Object.keys(source)) {
    if (key.toLowerCase() === wanted) return source[key];
  }
  return undefined;
}
`;

const targets = [
  'netlify/functions/sales-update-status.js',
  'netlify/functions/sales-appointments.js',
  'netlify/functions/sales-complete-appointment.js',
  'netlify/functions/sales-add-note.js',
  'netlify/functions/customer-dashboard.js',
];

let changed = 0;

for (const rel of targets) {
  const file = path.join(ROOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  // Insert the helper after the last leading require/const block.
  if (!src.includes('function headerValue(')) {
    const lines = src.split('\n');
    let last = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\s*(const|let|var)\s.*=\s*require\(|^\s*require\(/.test(lines[i])) last = i;
      else if (lines[i].trim() === '' && last > 0 && i - last < 4) continue;
      else if (last > 0) break;
    }
    lines.splice(last + 1, 0, HELPER);
    src = lines.join('\n');
  }

  // event.headers.authorization  ->  headerValue(event.headers, 'authorization')
  src = src.replace(
    /event\.headers\.authorization/g,
    "headerValue(event.headers, 'authorization')"
  );
  // event.headers['x-auth-token'] ->  headerValue(event.headers, 'x-auth-token')
  src = src.replace(
    /event\.headers\[['"]x-auth-token['"]\]/g,
    "headerValue(event.headers, 'x-auth-token')"
  );
  // event.headers.cookie -> headerValue(event.headers, 'cookie')
  src = src.replace(
    /event\.headers\.cookie\b/g,
    "headerValue(event.headers, 'cookie')"
  );

  if (src !== before) {
    fs.writeFileSync(file, src);
    changed += 1;
    console.log(`  patched ${rel}`);
  }
}

console.log(`\n  ${changed} file(s) now read auth headers case-insensitively`);
