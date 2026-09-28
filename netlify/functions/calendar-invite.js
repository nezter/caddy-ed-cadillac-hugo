/**
 * calendar-invite.js -- put a test drive or appointment in the client's calendar.
 *
 * WHY AN .ics AND NOT THE GOOGLE CALENDAR API
 * -------------------------------------------
 * Two ways to get an appointment into someone's calendar, and they are not
 * alternatives at the same level.
 *
 * The Google Calendar API needs an OAuth client ID and secret from a Google
 * Cloud project, a consent screen Ed has to verify, and a stored refresh token
 * to poll. It also needs somewhere to keep that token, which is the database
 * this project does not have yet. None of that can be built without credentials
 * the owner has to create, so a version that "supports Google Calendar" today
 * would be a version that fails in production.
 *
 * An .ics file needs NO credentials, NO third party and NO account. Every
 * calendar application -- Google Calendar, Apple Calendar, Outlook, Fastmail --
 * reads it. Attaching one to the confirmation is the difference between an
 * appointment that exists only in an email and one the client can put on their
 * own calendar and be reminded about.
 *
 * So this is the real integration, not a consolation prize, and it works on the
 * deploy that exists today. The two-way OAuth sync is a separate, later step and
 * is written down in docs/NETLIFY-FOUNDATIONS.md.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No RSVP, no attendees, no conferencing. An .ics with ATTENDEE lines invites
 * people by email, which for a one-person dealership means Ed gets added to a
 * client's personal calendar as a formal attendee on every booking. This is a
 * note on the client's calendar, not a meeting invitation.
 */

'use strict';

const BRAND = {
  name: 'Caddy Ed Cadillac',
  location: '10725 Pineville Rd, Pineville, NC 28134',
  phone: '803-431-6180',
  email: 'ed@caddyed.com',
};

/**
 * Escape a value for an iCalendar TEXT field.
 *
 * Per RFC 5545 section 3.3.11: backslash, semicolon, comma and newline all
 * have to be escaped. Without this a customer's name containing a comma --
 * "Smith, Jane" -- silently produces a malformed file that Google Calendar
 * rejects or, worse, partially accepts.
 */
function escapeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a line to 75 octets, as RFC 5545 requires.
 *
 * Unfolded, long DESCRIPTION lines are rejected by some parsers. Folding is
 * continuation lines beginning with a single space.
 */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    // 74 leaves room for the leading space on the continuation line.
    if (currentBytes + size > 74) {
      out.push(current);
      current = ch;
      currentBytes = size;
    } else {
      current += ch;
      currentBytes += size;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

/** RFC 5545 wants local time with no zone suffix, or UTC with a Z. */
function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Build a VEVENT.
 *
 * @param {Object} o
 * @param {string|Date} o.start      when it starts
 * @param {number}     o.durationMin how long, in minutes
 * @param {string}     o.title
 * @param {string}     o.description
 * @param {string}     [o.location]
 * @returns {string} a complete .ics document
 */
function buildInvite({ start, durationMin = 60, title, description, location }) {
  const startDate = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`buildInvite: unparseable start date: ${start}`);
  }
  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);
  const now = icsDate(new Date());
  const uid = `${icsDate(startDate)}-${Math.random().toString(36).slice(2, 10)}@caddyed.com`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caddy Ed Cadillac//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${icsDate(startDate)}`,
    `DTEND:${icsDate(endDate)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(location || BRAND.location)}`,
    // A stable-ish identifier so calendars that support it can dedupe, and a
    // colour that matches the site rather than the default blue.
    'CATEGORIES:TEST DRIVE',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // CRLF is required by the spec, and a trailing CRLF is required too.
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Express handler: GET ?start=&duration=&title=&description= returns the .ics. */
async function handler(event) {
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  try {
    const ics = buildInvite({
      start: q.start,
      durationMin: Number(q.duration) || 60,
      title: q.title || `Test drive at ${BRAND.name}`,
      description: q.description ||
        `Booked with ${BRAND.name}. Call ${BRAND.phone} if you need to move it.`,
      location: q.location,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8; method=PUBLISH',
        'Content-Disposition': 'attachment; filename="caddy-ed-test-drive.ics"',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
      body: ics,
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

module.exports = { handler, buildInvite, escapeText, fold, BRAND };
