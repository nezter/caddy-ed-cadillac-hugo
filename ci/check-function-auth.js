#!/usr/bin/env node
/**
 * check-function-auth.js -- no customer data behind an open door, and no
 * published JWT secret.
 *
 * WHY THIS EXISTS
 * ---------------
 * Six endpoints in this repository had no authentication at all, and every one
 * of them was found by reading rather than by a gate:
 *
 *   booking-queue.js     GET returned every booking request -- full name, email,
 *                        phone number -- with `Access-Control-Allow-Origin: *`.
 *                        Any web page on the internet could read the customer
 *                        list.
 *   lead-merge.js        POST merged two customer identities together. Destructive,
 *                        no undo. Anonymous.
 *   lead-duplicates.js   POST searched the lead table by any name/email/phone and
 *                        returned up to twenty matching customers.
 *   send-notification.js POST sent email as the dealership to any address, with
 *                        any subject and body. An open relay, waiting for someone
 *                        to set SMTP_HOST.
 *   lead-management.js   Returned the internal lead id for a duplicate match --
 *                        a customer-enumeration oracle.
 *   vehicle-features.js  POST wrote the "Ed's pick" list, i.e. the site's own
 *                        editorial content.
 *
 * Six out of forty-four functions, none of which any test noticed. Every one of
 * them validated its input carefully and returned well-formed errors. They looked
 * like finished work, because they were -- just without a door on them.
 *
 * What made this survivable is that the guards were never missing on purpose;
 * they were simply never added, and there was nothing to notice the gap. So this
 * check exists to notice the gap.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. Every function that is not explicitly public has an authentication guard.
 *      The public list is an ALLOWLIST with a reason per entry, so "this one is
 *      open" is always a decision somebody wrote down.
 *   2. No function falls back to a literal string when JWT_SECRET is unset. This
 *      exact bug existed in four functions simultaneously while a fifth
 *      documented the hazard in a comment, and it would be reintroduced by a
 *      well-meaning edit exactly as easily as it was removed.
 *   3. No function sends `Access-Control-Allow-Origin: *` while reading a table
 *      of customer names, emails or phone numbers. A wildcard on a PII endpoint
 *      turns "needs auth" into "harvestable by any site".
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 * ----------------------------------
 * Whether a guard is the RIGHT guard, or whether the authenticated caller is
 * authorised for what it asked for. Those need reading, not grepping, and a
 * check that claims to verify them would be lying about its own coverage.
 *
 * Run:  node ci/check-function-auth.js
 * No credentials needed -- this reads source, not the database.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FN_DIR = path.join(ROOT, 'netlify', 'functions');

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

/* ------------------------------------------------------------------ helpers */

// Any of these means "this function decides who is calling". The inline ones
// matter: customer-dashboard.js, sales-login.js and the four sales-* functions
// verify their own tokens rather than going through auth-middleware, and a gate
// that only recognised the shared middleware would report them as unprotected.
const AUTH_MARKERS = [
  'authenticateRequest(',
  'optionalAuthenticateRequest(',
  'verifyIdentityToken(',
  'isUnconfiguredContext(',
  'checkAuthentication(',
  "require('./utils/admin-guard')",
  "require('./utils/netlify-identity')",
];

/**
 * Functions that are meant to be reachable by the public, with the reason.
 *
 * This list is the whole point of the check. A name here is a claim that the
 * function exposes nothing private, written down where a reviewer can argue with
 * it. Adding a function to this list should feel like writing a comment in a
 * security review, because it is one.
 */
const PUBLIC_BY_DESIGN = new Map([
  ['contact-form', 'Customer enquiry intake. Records a lead, returns nothing private.'],
  ['lead-form', 'Customer enquiry intake, called by the quick-ask form and the portal.'],
  ['lead-management', 'Customer enquiry intake. Posts only what the customer typed.'],
  [
    'leads',
    'Customer enquiry intake, POST only -- the older twin of lead-form.js, still ' +
      'called by site/assets/js/lead-management.js. Records the lead, returns ' +
      'only the new lead id and a duplicate flag. It reads no customer table ' +
      'and returns no PII; the duplicate branch returns the id of the lead the ' +
      'customer has just submitted themselves.',
  ],
  
  ['schedule-test-drive', 'Customer booking intake. Returns only the new booking id.'],
  ['schedule-appointment', 'Customer booking intake from the portal.'],
  ['pre-approval', 'Financing enquiry intake. The modal needs it before sign-in.'],
  ['contact-salesperson', 'Staff directory, and the message form on a staff card.'],
  ['vehicle-details', 'Public inventory: price and spec for a car on the lot.'],
  ['available-dates', 'Returns [] today. Availability, not customer identity.'],
  ['available-times', 'Returns [] today. See the note in available-dates.js.'],
  ['calendar-invite', 'Builds a .ics for a visitor to add to their own calendar.'],
  ['health-check', 'Reports service health. No customer data in the response.'],
  ['sales-login', 'Sign-in itself. Has its own rate limit.'],
  ['sales-logout', 'Clears a cookie. Nothing to protect.'],
  ['customer-auth', 'Sign-in itself. Has its own rate limit.'],
  ['admin-guard', 'IS the guard. Required by other functions, not served itself.'],
  ['booking-queue', 'Mixed: the library half is called in-process; the HTTP half is staff-only.'],
  ['google-calendar', 'Guards per action: status optional, connect/sync required.'],
  [
    'submission-created',
    'Netlify FORM EVENT function -- invoked by the platform with a verified ' +
      'submission, never served at a URL. Records the signup into the leads ' +
      'table and returns nothing.',
  ],
  [
    'social-feed',
    'The cached social payload, GET only, read by every visitor page. It ' +
      'contains public posts, never customer data, and this handler cannot ' +
      'write anything -- the cache is filled by social-refresh via the admin.',
  ],
  [
    'social-refresh',
    'Netlify SCHEDULED function -- invoked by the platform on a daily cron, ' +
      'never served at a URL. Does the same refresh the admin page can ' +
      'trigger; reads and writes only the social cache tables.',
  ],
]);

/** Tables whose rows are, or contain, customer identity. */
const CUSTOMER_TABLES = [
  'leads',
  'customers',
  'booking_requests',
  'interactions',
  'sales_reps',
  'vehicle_favourites',
  'followup',
  'communication_preferences',
];

function functionFiles() {
  return fs
    .readdirSync(FN_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({
      name: f.replace(/\.js$/, ''),
      file: path.join(FN_DIR, f),
      source: fs.readFileSync(path.join(FN_DIR, f), 'utf8'),
    }));
}

/** Strip comments, so prose about auth is never mistaken for auth. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

/* ------------------------------------------------------------------- checks */

const files = functionFiles();
const unprotected = [];

for (const f of files) {
  if (PUBLIC_BY_DESIGN.has(f.name)) continue;

  const body = code(f.source);
  if (!AUTH_MARKERS.some((m) => body.includes(m))) {
    unprotected.push(f.name);
  }
}

check(
  'every non-public function has an authentication guard',
  unprotected.length === 0,
  unprotected.length
    ? `${unprotected.join(', ')} — no ${AUTH_MARKERS.join(' / ')} found`
    : `${files.length} functions checked`
);

if (unprotected.length) {
  for (const name of unprotected) {
    check(
      `  ${name} has a stated reason for being public`,
      false,
      'add it to PUBLIC_BY_DESIGN with a reason, or add an auth guard'
    );
  }
}

// --- 2. no published JWT secret ----------------------------------------------
const jwtFallbacks = [];
for (const f of files) {
  const body = code(f.source);
  // Any `process.env.JWT_SECRET || 'something'` where something is not empty.
  const m = body.match(/process\.env\.JWT_SECRET\s*\|\|\s*'([^']*)'/);
  if (m && m[1].trim() !== '') jwtFallbacks.push(`${f.name} -> '${m[1]}'`);
}
check(
  'no function falls back to a literal when JWT_SECRET is unset',
  jwtFallbacks.length === 0,
  jwtFallbacks.length
    ? jwtFallbacks.join('; ')
    : "a published fallback is a verifying key to anyone who can read the repo"
);

// --- 3. wildcard CORS on a customer table ------------------------------------
const wildcardPii = [];
for (const f of files) {
  const body = code(f.source);
  const hasWildcard = /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/.test(body);
  if (!hasWildcard) continue;
  const touchesCustomerData = CUSTOMER_TABLES.some((t) =>
    new RegExp(`(FROM|INTO|UPDATE|JOIN)\\s+${t}\\b`, 'i').test(body)
  );
  if (touchesCustomerData) wildcardPii.push(f.name);
}
check(
  'no function pairs a wildcard CORS header with a customer table',
  wildcardPii.length === 0,
  wildcardPii.length
    ? `${wildcardPii.join(', ')} — a browser on any site can read the response`
    : 'wildcards remain only where the response carries no customer data'
);

// --- report ------------------------------------------------------------------
console.log('');
for (const r of results) {
  const mark = r.pass ? 'ok  ' : 'FAIL';
  const detail = r.detail ? `   (${r.detail})` : '';
  console.log(`  ${mark} ${r.label}${detail}`);
}

const failed = results.filter((r) => !r.pass);
console.log('');

if (!failed.length) {
  const publicCount = PUBLIC_BY_DESIGN.size;
  console.log(
    `  OK: ${files.length - publicCount} functions guard themselves; ${publicCount} are ` +
      'public by design and each says why.'
  );
  process.exit(0);
}

console.error('  A FUNCTION IS REACHABLE THAT SHOULD NOT BE.');
console.error('  Six of these existed at once and no test noticed. Either add the');
console.error('  guard, or add the function to PUBLIC_BY_DESIGN in this file with a');
console.error('  reason, so that "this one is open" is a decision rather than an');
console.error('  omission.');
process.exit(1);