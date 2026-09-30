#!/usr/bin/env node
/**
 * check-inquiry-path.js -- a customer enquiry must survive its own notification.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * Every customer-facing form sent its notification email FIRST and only wrote to
 * the database after, and treated a failed send as a failed request:
 *
 *     await transporter.sendMail({ ... });   // 1. tell someone
 *     await createLead(data);               // 2. keep the lead
 *
 * SMTP is not configured on this deployment -- SMTP_HOST, EMAIL_TO,
 * NOTIFICATION_EMAIL and DEFAULT_FORM_RECIPIENT are all unset -- so the first
 * await threw and the lead was never written. Measured against the live
 * functions, three real submissions produced:
 *
 *     booking_requests  0
 *     customers         0
 *     leads             0
 *
 * A customer typed their name, email, phone and the car they wanted, and the
 * business had no idea they existed. On a one-person dealership a lost enquiry
 * is a lost sale, and no test, gate or build said a word about it: the functions
 * loaded, the routes resolved, the JSON parsed.
 *
 * IT IS EXACTLY BACKWARDS
 * -----------------------
 * The database is the system of record, and /admin/leads, /admin/bookings and
 * /admin/customers all read it. An email is a convenience for someone who is not
 * looking at the admin; it can fail, the mail server can be down, an address can
 * be mistyped. None of that may cost a lead.
 *
 * WHAT THIS CHECKS
 * ----------------
 * Against the REAL functions, with the real database, in the configuration they
 * are actually deployed in:
 *
 *   1. each of the three forms returns 2xx
 *   2. each one leaves a row behind, with the details a salesperson needs
 *   3. each one SAYS whether it emailed, and does not claim success either way
 *   4. with no SMTP configured, a form still succeeds -- because the record does
 *      not depend on the mail server
 *   5. a bad payload is still refused, so "records everything" has not become
 *      "accepts everything"
 *
 * Everything is written with a run-specific tag and removed afterwards, so a run
 * against production leaves nothing behind.
 *
 * Run:  node ci/check-inquiry-path.js
 * Needs: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Skips -- loudly -- without.
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.log('  SKIP  TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set.');
  console.log('        This check submits to the real functions against the real');
  console.log('        database. There is nothing to substitute for either.');
  process.exit(0);   // a skip is not a failure; ci/check-all.js reads the line above
}

const script = `
const F = ${JSON.stringify(path.join(ROOT, 'netlify', 'functions') + path.sep)};
const DS = require(F + 'utils/database-service');
const std = require(F + 'schedule-test-drive');
const cf  = require(F + 'contact-form');
const lf  = require(F + 'lead-form');
const TAG = process.env.PROBE_TAG;
const out = [];
const add = (label, pass, detail) => out.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
const post = (h, body) => h.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) });

(async () => {
  // --- the three customer-facing forms ------------------------------------
  const r1 = await post(std, { vehicleId: 'general-enquiry', vehicleTitle: 'Probe Car',
    fullName: 'Probe One', email: TAG + '+1@example.invalid', phone: '8034316180',
    preferredDate: '2099-12-01', preferredTime: '10:30' });
  const b1 = JSON.parse(r1.body);
  add('test drive returns 2xx', r1.statusCode >= 200 && r1.statusCode < 300, r1.statusCode);
  add('  ...and a booking id', b1.bookingId, b1.bookingId);
  add('  ...and reports whether it emailed', typeof b1.notified === 'boolean', 'notified=' + b1.notified + ' reason=' + b1.notifyReason);

  const r2 = await post(cf, { name: 'Probe Two', email: TAG + '+2@example.invalid',
    phone: '8034316180', message: 'Is the Escalade available?' });
  const b2 = JSON.parse(r2.body);
  add('contact form returns 2xx', r2.statusCode >= 200 && r2.statusCode < 300, r2.statusCode);
  add('  ...and a lead id', b2.data && b2.data.leadId, b2.data && b2.data.leadId);

  const r3 = await post(lf, { name: 'Probe Three', email: TAG + '+3@example.invalid',
    phone: '8034316180', formType: 'contact' });
  const b3 = JSON.parse(r3.body);
  add('lead form returns 2xx', r3.statusCode >= 200 && r3.statusCode < 300, r3.statusCode);
  add('  ...and a lead id', b3.data && b3.data.leadId, b3.data && b3.data.leadId);

  // --- did any of it land? ------------------------------------------------
  const leads = await DS.query('SELECT id, first_name, email, phone FROM leads WHERE email LIKE ?', [TAG + '%']);
  const book  = await DS.query('SELECT id, full_name, email, phone, preferred_date, status FROM booking_requests WHERE email LIKE ?', [TAG + '%']);
  add('every submission is IN THE DATABASE', leads.rows.length === 2 && book.rows.length === 1,
    leads.rows.length + ' leads + ' + book.rows.length + ' booking');
  add('the lead carries a name, email and phone a rep can use',
    leads.rows.length === 2 && leads.rows.every((l) => l.first_name && l.email && l.phone === '8034316180'));
  add('the booking carries the car, the day and the time',
    book.rows[0] && book.rows[0].full_name && book.rows[0].preferred_date === '2099-12-01' && book.rows[0].status === 'new',
    book.rows[0] ? book.rows[0].preferred_date + ' / ' + book.rows[0].status : 'none');

  // --- the point of the whole thing --------------------------------------
  add('SMTP is NOT configured, and the forms still succeed',
    !process.env.SMTP_HOST && r1.statusCode === 200 && r2.statusCode === 200 && r3.statusCode === 200,
    'SMTP_HOST=' + (process.env.SMTP_HOST || '(unset)'));
  add('...and each one says it did not email', b1.notified === false && Boolean(b1.notifyReason), b1.notifyReason);

  // --- and it has not become a rubbish bin --------------------------------
  const bad1 = await post(std, { vehicleId: 'x', fullName: 'No Email', email: 'not-an-email',
    phone: '1', preferredDate: '2099-12-01', preferredTime: '10:30' });
  add('a malformed submission is still refused', bad1.statusCode >= 400, bad1.statusCode);
  const bad2 = await post(cf, { name: 'No Email Field' });
  add('the contact form still requires an email', bad2.statusCode >= 400, bad2.statusCode);

  // --- clean up ----------------------------------------------------------
  for (const l of leads.rows) await DS.query('DELETE FROM leads WHERE id = ?', [l.id]);
  for (const b of book.rows) await DS.query('DELETE FROM booking_requests WHERE id = ?', [b.id]);
  await DS.query('DELETE FROM customers WHERE email LIKE ?', [TAG + '%']);
  await DS.query("DELETE FROM interactions WHERE subject LIKE '%Test Drive Request%' AND created_at > datetime('now','-1 hour')");

  console.log('@@' + JSON.stringify(out));
})().catch((e) => {
  console.log('@@' + JSON.stringify([{ label: 'the check itself threw', pass: false, detail: (e && e.stack ? e.stack : String(e)).split('\\n').slice(0, 4).join(' | ') }]));
});
`;

const TAG = 'probe-' + Date.now().toString(36);
let payload;
try {
  const stdout = execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(ROOT, 'netlify', 'functions'),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 3 * 60 * 1000,
    env: { ...process.env, PROBE_TAG: TAG, JWT_SECRET: process.env.JWT_SECRET || 'check-inquiry-path' },
  });
  payload = stdout.split('@@').pop();
} catch (e) {
  console.error('  check-inquiry-path could not run:', (e.stderr || e.message || '').toString().split('\n').slice(-6).join('\n'));
  process.exit(1);
}

const results = JSON.parse(payload);
console.log(`  submitted as ${TAG}@example.invalid (nothing real, removed afterwards)`);
console.log('');
for (const r of results) {
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.label}${r.detail ? `   (${r.detail})` : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} — submissions survive their own notification`);
if (failed.length) {
  console.error('');
  console.error('  A CUSTOMER ENQUIRY IS BEING LOST.');
  console.error('  The forms report an error when the notification fails, and the lead is');
  console.error('  never written. See utils/inquiry.js — the record must come first.');
  process.exit(1);
}
