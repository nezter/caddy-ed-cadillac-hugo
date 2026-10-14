/**
 * calendar-data.js -- the month view behind /admin/calendar.
 *
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *     -> the enquiries (leads.created_at) and booking requests
 *        (booking_requests.preferred_date) whose day falls in the range.
 *
 * Two shapes, one grid: what came in, and what the customer asked for. The
 * page draws both on the same month so a busy Saturday is visible as a busy
 * Saturday, not as two lists that have to be read side by side.
 *
 * AUTH
 * ----
 * Staff reads, same door as the rest of the sales tools (view_leads). The
 * rows carry customer names, so this is never a public endpoint.
 */

'use strict';

const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');
const { originHeaders } = require('./utils/cors-middleware');

const corsFor = (event) => ({
  ...originHeaders(event, 'GET, OPTIONS'),
  'Cache-Control': 'no-store',
});

const json = (event, status, body) => ({
  statusCode: status,
  headers: corsFor(event),
  body: JSON.stringify(body),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsFor(event), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return json(event, 405, { error: 'Only GET is served here.', code: 'method-not-allowed' });
  }

  try {
    const auth = await authenticateRequest(event, {
      requireAuth: true,
      requiredPermissions: ['view_leads'],
    });
    if (!auth.authenticated) {
      return json(event, auth.error && auth.error.statusCode ? auth.error.statusCode : 401, {
        error: 'Sign in to read the calendar',
        code: 'unauthenticated',
      });
    }

    const q = event.queryStringParameters || {};
    if (!q.from || !q.to || !DATE_RE.test(q.from) || !DATE_RE.test(q.to)) {
      return json(event, 400, {
        error: 'from and to are required as YYYY-MM-DD',
        code: 'bad-range',
      });
    }

    // created_at is stored as 'YYYY-MM-DD HH:MM:SS' text; string comparison
    // is the range check, and it is exact for that format. The upper bound
    // is exclusive, so the range end is the day AFTER 'to'.
    const toExclusive = new Date(q.to + 'T00:00:00Z');
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const toExclusiveText = toExclusive.toISOString().slice(0, 10);

    const leads = await DatabaseService.query(
      'SELECT id, first_name, last_name, status, lead_source, created_at ' +
        'FROM leads WHERE created_at >= $1 AND created_at < $2 ' +
        'ORDER BY created_at LIMIT 500',
      [q.from + ' 00:00:00', toExclusiveText + ' 00:00:00']
    );

    const bookings = await DatabaseService.query(
      'SELECT id, full_name, status, preferred_date, preferred_time, vehicle_title ' +
        'FROM booking_requests WHERE preferred_date >= $1 AND preferred_date <= $2 ' +
        'ORDER BY preferred_date, preferred_time LIMIT 500',
      [q.from, q.to]
    );

    return json(event, 200, {
      ok: true,
      from: q.from,
      to: q.to,
      inquiries: (leads.rows || []).map((row) => ({
        id: row.id,
        name: ((row.first_name || '') + ' ' + (row.last_name || '')).trim() || 'Customer',
        status: row.status || 'new',
        source: row.lead_source || '',
        day: String(row.created_at || '').slice(0, 10),
      })),
      bookings: (bookings.rows || []).map((row) => ({
        id: row.id,
        name: row.full_name || 'Customer',
        status: row.status || 'new',
        day: row.preferred_date || '',
        time: row.preferred_time || '',
        vehicle: row.vehicle_title || '',
      })),
    });
  } catch (err) {
    console.error('calendar-data error:', err.message);
    return json(event, 500, {
      error: 'The calendar data could not be read.',
      code: 'read-failed',
    });
  }
};
