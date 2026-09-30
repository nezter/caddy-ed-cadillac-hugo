/**
 * inquiry.js -- one customer enquiry, recorded first and notified second.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * Every customer-facing form sent its notification email FIRST and only wrote
 * to the database after, and treated a failed send as a failed request:
 *
 *     await transporter.sendMail({ ... });      // 1. tell someone
 *     await createLead(data);                   // 2. keep the lead
 *     return 200;
 *
 * With SMTP unconfigured, which it is -- SMTP_HOST, EMAIL_TO, NOTIFICATION_EMAIL
 * and DEFAULT_FORM_RECIPIENT are all unset -- the first await throws, the
 * handler returns 500, and the lead is never written. Measured against the live
 * functions, three real submissions produced:
 *
 *     booking_requests  0
 *     customers         0
 *     leads             0
 *
 * A customer filled in their name, email, phone and the car they wanted, and
 * the business has no idea they existed. The site is one salesperson's; a lost
 * enquiry is a lost sale, and it is the single most expensive failure mode this
 * project has.
 *
 * IT IS EXACTLY BACKWARDS
 * -----------------------
 * The database is the system of record. /admin/leads and /admin/bookings are
 * built, gated and working, and they read the database. An email is a
 * convenience for someone who is not looking at the admin -- it can fail, the
 * mail server can be down, a recipient can be mistyped -- and it must never be
 * able to cost a lead.
 *
 * So: record, then notify, and let the notification fail on its own.
 *
 * WHY THERE IS STILL AN EMAIL
 * ---------------------------
 * Ed is one person and will not live in the admin. A notification that arrives
 * while he is on the phone is worth having. So it is sent -- but after the
 * record exists, and its failure is reported, never fatal.
 *
 * AND IT SAYS WHETHER IT SENT
 * ---------------------------
 * `notified` is false and `notifyError` explains why, on every path. A caller
 * that cannot tell "the mail server is down" from "there is no address
 * configured" cannot report either honestly, and that ambiguity is how a dead
 * form looks fine.
 */

'use strict';

const crypto = require('crypto');

const DatabaseService = require('./database-service');

/**
 * Who to notify.
 *
 * The staff table first, because a rep who has signed in through Netlify
 * Identity has an address there and that is the live answer. Then the
 * environment, for the window before anybody has signed in.
 *
 * `source` is returned so the caller can report WHERE the address came from.
 * That matters: "no address is configured" and "we emailed the one in the staff
 * table" are different facts, and a form that cannot distinguish them will say
 * it notified someone when it notified nobody.
 */
async function resolveRecipient() {
  try {
    if (DatabaseService.isDatabaseConfigured()) {
      const result = await DatabaseService.query(
        `SELECT email, first_name, last_name, role
           FROM sales_reps
          WHERE status = 'active'
            AND email IS NOT NULL
            AND email <> ''
            AND role IN ('admin', 'manager', 'sales_representative', 'sales_rep')
          ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END
          LIMIT 1`
      );
      if (result.rows.length) {
        const r = result.rows[0];
        return {
          email: r.email,
          name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
          source: 'sales_reps',
        };
      }
    }
  } catch (err) {
    console.error('[inquiry] could not read the staff table:', err.message);
  }

  const configured =
    process.env.EMAIL_TO || process.env.NOTIFICATION_EMAIL || process.env.DEFAULT_FORM_RECIPIENT;
  if (configured) {
    return { email: configured, name: null, source: 'environment' };
  }
  return { email: null, name: null, source: 'none' };
}

/** Best-effort email. Never throws, and never decides the outcome. */
async function notify(inquiry, recipient) {
  if (!recipient.email) {
    return { notified: false, reason: 'no-recipient-configured' };
  }
  // No SMTP configured is a configuration state, not an error, and it is
  // reported as itself so nobody goes looking for a broken mail server.
  if (!process.env.SMTP_HOST) {
    return { notified: false, reason: 'smtp-not-configured' };
  }
  try {
    // Required here, not at module load: a form function must load on a
    // deployment with no mail configured, or the whole endpoint 500s before it
    // can record anything -- which is the bug this file exists to fix.
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER || `website@${new URL(inquiry.sourceUrl || 'https://caddyed.com').host}`,
      to: recipient.email,
      replyTo: inquiry.email || undefined,
      subject: inquiry.subject,
      text: inquiry.text,
    });
    return { notified: true, to: recipient.email, via: recipient.source };
  } catch (err) {
    console.error('[inquiry] notification failed:', err.message);
    return { notified: false, reason: 'send-failed', detail: err.message };
  }
}

/** A short, human-readable id, so a lead is recognisable in the admin. */
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

/**
 * Record a lead. Always the first thing that happens.
 *
 * Returns the row id, or throws. A throw here is a genuine failure and the
 * caller should tell the customer so -- unlike a notification failure, which is
 * not theirs to care about.
 */
async function recordLead(fields) {
  const { first, last } = splitName(fields.name);
  const lead = await DatabaseService.createLead({
    first_name: first,
    last_name: last,
    email: fields.email,
    phone: fields.phone,
    message: fields.message,
    form_type: fields.formType || 'general',
    lead_source: fields.source || 'website',
    vehicle_interest: fields.vehicleTitle || fields.vehicleId || null,
    vehicle_year: fields.vehicleYear || null,
    vehicle_make: fields.vehicleMake || null,
  });
  return lead;
}

/** Record a test-drive booking. */
async function recordBooking(fields) {
  const bookingQueue = require('../booking-queue');
  const id = bookingQueue.makeId({
    name: fields.name,
    email: fields.email,
    preferredDate: fields.preferredDate,
    preferredTime: fields.preferredTime,
  });
  const result = await bookingQueue.record({
    id,
    status: 'new',
    vehicleId: fields.vehicleId || '',
    vehicleTitle: fields.vehicleTitle || '',
    fullName: fields.name,
    email: fields.email,
    phone: fields.phone,
    preferredDate: fields.preferredDate,
    preferredTime: fields.preferredTime,
    comments: fields.comments || '',
  });
  if (!result.stored) {
    throw new Error(`booking not stored: ${result.reason}`);
  }
  return id;
}

/**
 * The lines an email body carries, skipping anything the customer left blank.
 *
 * The filter does NOT destructure. The first version did:
 *
 *     ].filter(([, v]) => v);
 *
 * and the array contains literal `null` for every field the caller did not
 * supply -- so the predicate destructured `null`, which throws "object null is
 * not iterable", on every request where the customer left the notes field
 * empty. Filtering on truthiness FIRST, then destructuring, is the only order
 * that works when the array can contain holes.
 */
function summarise(fields) {
  const rows = [
    ['Name', fields.name],
    ['Email', fields.email],
    ['Phone', fields.phone],
    ['Vehicle', fields.vehicleTitle],
    ['Requested', fields.preferredDate
      ? `${fields.preferredDate} ${fields.preferredTime || ''}`.trim()
      : null],
    ['Notes', fields.comments],
    ['Message', fields.message],
    ['Page', fields.pageUrl],
  ].filter((row) => row && row[1]);
  return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

/**
 * The whole flow: record, then notify.
 *
 * `kind` is 'lead' or 'booking' and decides which table gets the row.
 *
 * The return value keeps the two outcomes apart on purpose:
 *
 *     { recorded: true, notified: false, notifyReason: 'smtp-not-configured', ... }
 *
 * is a SUCCESS. The enquiry is in the database and visible in the admin. It just
 * did not also send an email, and the caller can say so without inventing a
 * failure the customer cannot act on.
 */
async function submit(kind, fields) {
  if (!DatabaseService.isDatabaseConfigured()) {
    // The one case that IS fatal. Without a database there is no system of
    // record, so a success response would be a lie.
    return {
      recorded: false,
      notified: false,
      fatal: true,
      reason: 'database-not-configured',
      id: null,
    };
  }

  const id = kind === 'booking' ? await recordBooking(fields) : (await recordLead(fields)).id;

  const recipient = await resolveRecipient();
  const subject = fields.subject || (kind === 'booking' ? 'New test-drive request' : 'New website enquiry');
  const outcome = await notify(
    {
      ...fields,
      subject,
      text: `${subject}\n\n${summarise(fields)}\n`,
      sourceUrl: fields.pageUrl,
    },
    recipient
  );

  console.log(
    `[inquiry] ${kind} ${id} recorded. ` +
      (outcome.notified
        ? `notified ${outcome.to} (${outcome.via}).`
        : `NOT emailed (${outcome.reason}). It is in the database and in /admin.`)
  );

  return {
    recorded: true,
    notified: outcome.notified,
    notifyReason: outcome.reason || null,
    notifyDetail: outcome.detail || null,
    notifiedTo: outcome.to || null,
    notifiedVia: outcome.via || null,
    fatal: false,
    id,
  };
}

module.exports = {
  submit,
  recordLead,
  recordBooking,
  resolveRecipient,
  notify,
  summarise,
  newId,
};
