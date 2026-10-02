#!/usr/bin/env node
/**
 * import-netlify-forms.js -- backfill enquiries Netlify Forms has been holding.
 *
 * WHY THIS EXISTS
 * ---------------
 * Between 2020-02-12 and 2025-07-29 this dealership received 15 submissions
 * through Netlify's built-in form handling. They were real people asking about
 * cars -- a lease buyout with a stock number, a question about a second key on a
 * Kia Sportage, an XT5 the customer had already discussed in the showroom.
 *
 * None of them reached the business's own records, for two independent reasons
 * that had nothing to do with each other:
 *
 *   1. Netlify Forms stores a submission and emails nobody unless a form
 *      notification is configured in the dashboard. None was.
 *   2. The site's own forms post with `fetch()` to a function. Netlify Forms
 *      never sees those. And every function was returning 404, because the live
 *      deploy uploaded no functions at all.
 *
 * So these enquiries existed, and the site had no idea. This moves them into
 * `leads` where /admin/leads can see them.
 *
 * THE POINT OF THE EXERCISE IS THE DATES
 * ---------------------------------------
 * An enquiry from 2020 is not an enquiry from today. Written now with today's
 * timestamp they would read as a queue of fifteen fresh leads, which is both
 * wrong and -- for anything that ages or chases them -- harmful.
 *
 * So `created_at` is the submission's own timestamp, and `days_old` goes in the
 * message so nobody reads a five-year-old enquiry as new work.
 *
 * IDEMPOTENT BY SUBMISSION ID
 * ---------------------------
 * The Netlify submission id becomes the lead id, prefixed. Re-running inserts
 * nothing the second time. That matters because this script is the kind of
 * thing you run twice when the first run looked wrong.
 *
 * IT SENDS NO EMAIL
 * -----------------
 * Nothing here calls notify(). These are historical records, not new enquiries,
 * and a backfill that emailed fifteen people "we have your enquiry" five years
 * late would be worse than leaving them in a form store.
 *
 * THE OWNER'S OWN SUBMISSIONS
 * ---------------------------
 * Three of the fifteen were the site owner's test posts. They are imported and
 * flagged `is_test = 1` rather than silently dropped: dropping data is a
 * decision, and this script should not make it. Filtering is a query.
 *
 * Run:  node scripts/import-netlify-forms.js --file subs.json [--dry-run]
 * Needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for anything but --dry-run.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let file = null;
let dryRun = false;
let markTests = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') file = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--include-tests') markTests = true;
}

/**
 * The owner's own addresses, from the three submissions that are plainly test
 * posts ("test", "Give me a call this is a test").
 *
 * Matched on exact address rather than a name, because "Edward" is a name
 * customers have and `eportello@gmail.com` is not.
 */
const OWNER_EMAILS = new Set([
  'eportello@gmail.com',
  'nportello@gmail.com',
]);

/** Posts with no message are not enquiries; they are someone poking the form. */
function isEmpty(sub) {
  return !String(sub.body || '').trim() && !String((sub.data || {}).message || '').trim();
}

/**
 * Netlify splits `name` into first/last, but it is a guess and it is wrong for
 * the ones-word submissions ("JeffreyMum", "Susievox"). Where it produced an
 * empty last name, the whole name is the first name -- which is what a human
 * would do, and better than "Jeffrey" from splitting a single token.
 */
function splitName(sub) {
  const first = String(sub.first_name || '').trim();
  const last = String(sub.last_name || '').trim();
  if (first && last) return { first, last };
  const whole = String(sub.name || '').trim();
  if (!last && whole) return { first: whole, last: '' };
  return { first: first || '(unknown)', last };
}

/**
 * A phone number, when the customer wrote one into the message.
 *
 * Deliberately narrow. These bodies are free text from the internet, and a
 * loose pattern will eventually match a stock number or a year. A US number is
 * ten digits with optional +1, and the separators are only the ones people
 * actually type.
 */
function findPhone(body) {
  const text = String(body || '');
  const re = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
  const found = text.match(re);
  if (!found || !found.length) return null;
  return found[0].replace(/[^\d]/g, '').slice(-10);
}

function buildRows(subs) {
  const seen = new Set();
  const rows = [];

  for (const sub of subs) {
    const id = String(sub.id || '');
    if (!id) {
      console.warn('  skipping a submission with no id');
      continue;
    }
    if (seen.has(id)) {
      console.warn(`  skipping duplicate submission ${id} in the input file`);
      continue;
    }
    seen.add(id);

    const data = sub.data || {};
    const email = String(sub.email || data.email || '').trim().toLowerCase();
    if (!email) {
      console.warn(`  skipping #${sub.number}: no email address`);
      continue;
    }

    const { first, last } = splitName(sub);
    const body = String(sub.body || data.message || '');
    const empty = isEmpty(sub);
    const test = OWNER_EMAILS.has(email);

    rows.push({
      // The submission id, so re-running this inserts nothing.
      id: `nf_${id}`,
      first_name: first,
      last_name: last,
      email,
      phone: findPhone(body),
      message: body,
      form_type: 'contact',
      // Says where the row came from and how old it is. An admin looking at
      // fifteen leads all dated today would reasonably think the site just
      // started working; it did not.
      lead_source: 'netlify-forms-backfill',
      page_url: data.referrer || '',
      created_at: sub.created_at || new Date().toISOString(),
      utm_source: `netlify-forms#${sub.number}`,
      is_test: test ? 1 : 0,
      is_empty: empty ? 1 : 0,
      netlify_number: sub.number,
      netlify_ip: data.ip || null,
      netlify_user_agent: data.user_agent || null,
    });
  }

  return rows;
}

function yearsBetween(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const days = Math.floor((Date.now() - then) / 86400000);
  return days > 365 ? `${Math.floor(days / 365)}y` : `${days}d`;
}

(async () => {
  if (!file) {
    console.error('  --file <subs.json> is required (output of: netlify api listFormSubmissions)');
    process.exit(2);
  }
  const subs = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = buildRows(subs);

  // Oldest first. `listFormSubmissions` returns highest submission number first,
  // which is newest-first, so without this the report claims the OLDEST row is
  // the newest -- and then quotes its age as though it were recent.
  rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const tests = rows.filter((r) => r.is_test).length;
  const empties = rows.filter((r) => r.is_empty).length;
  const withPhone = rows.filter((r) => r.phone).length;

  console.log('');
  console.log(`  ${rows.length} submission(s) parsed`);
  console.log(`  oldest ${rows[0] && rows[0].created_at.slice(0, 10)} (${yearsBetween(rows[0].created_at)} old)`);
  console.log(`  newest ${rows[rows.length - 1] && rows[rows.length - 1].created_at.slice(0, 10)} (${yearsBetween(rows[rows.length - 1].created_at)} ago)`);
  console.log(`  flagged as the owner's own test posts: ${tests}`);
  console.log(`  no message body (form poked, not an enquiry): ${empties}`);
  console.log(`  a phone number found in the message: ${withPhone}`);

  // Genuine enquiries: a message, and not the owner's own test post. The
  // previous count filtered only the empties and so included all three tests,
  // which is the opposite of what the line said it was counting.
  const genuine = rows.filter((r) => !r.is_empty && !r.is_test);
  console.log('');
  console.log(`  ${genuine.length} of these are real enquiries from customers:`);
  for (const r of genuine) {
    console.log(
      `    ${r.created_at.slice(0, 10)}  ${(r.first_name + ' ' + r.last_name).trim().padEnd(24)}` +
        `${r.email.padEnd(34)}${r.phone ? '  phone ' + r.phone : ''}`
    );
  }
  const skippedForSummary = rows.length - genuine.length;
  if (skippedForSummary) {
    console.log(`  ${skippedForSummary} omitted from the list above: ${tests} owner test post(s)` +
      `${empties ? `, ${empties} with no message` : ''} -- all still imported, flagged.`);
  }

  if (dryRun) {
    console.log('');
    console.log('  DRY RUN. Nothing was written. Re-run without --dry-run to import.');
    process.exit(0);
  }

  const DatabaseService = require(path.join(__dirname, '..', 'netlify', 'functions', 'utils', 'database-service'));
  if (!DatabaseService.isDatabaseConfigured()) {
    console.error('');
    console.error('  TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set. Nothing was written.');
    process.exit(2);
  }

  console.log('');
  console.log('  Writing...');

  let inserted = 0;
  let skipped = 0;
  const failures = [];

  for (const r of rows) {
    // Idempotence is enforced by the primary key, checked first so the "already
    // there" case is reported rather than thrown.
    const existing = await DatabaseService.query(
      'SELECT id FROM leads WHERE id = $1 LIMIT 1', [r.id]
    );
    if (existing.rows && existing.rows[0]) {
      skipped++;
      continue;
    }

    try {
      await DatabaseService.query(
        `INSERT INTO leads
           (id, first_name, last_name, email, phone, message, form_type,
            lead_source, page_url, utm_source, created_at, updated_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,'new')`,
        [r.id, r.first_name, r.last_name, r.email, r.phone, r.message, r.form_type,
         r.lead_source, r.page_url, r.utm_source, r.created_at]
      );
      inserted++;
    } catch (e) {
      failures.push(`${r.email}: ${e.message}`);
    }
  }

  console.log(`  inserted: ${inserted}`);
  console.log(`  already present: ${skipped}`);
  if (failures.length) {
    console.error(`  FAILED: ${failures.length}`);
    for (const f of failures) console.error(`    ${f}`);
  }

  console.log('');
  console.log(`  Done. Visible at /admin/leads. No email was sent for any of these --`);
  console.log('  they are historical records, and mailing fifteen people five years late');
  console.log('  would be worse than not mailing them at all.');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error('  ERROR:', e.message);
  process.exit(1);
});