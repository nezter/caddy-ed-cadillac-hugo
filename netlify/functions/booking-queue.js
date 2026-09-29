/**
 * booking-queue.js -- durable record of booking requests.
 *
 * WHY THIS EXISTS
 * ---------------
 * A test-drive request does two things: send an email, and write to a record. If
 * the record fails, the email still goes out and the request is then gone --
 * nothing lists it, nothing follows it up, and the calendar has nothing to sync.
 * The customer believes they have booked.
 *
 * That is the worst failure mode this project has, and it is invisible because
 * the email still arrives.
 *
 * WHY IT MOVED OFF BLOBS
 * ----------------------
 * It was a Blobs store, one key per request. A function cannot reach a Blobs
 * store on this account's plan without an explicit siteID and token, and the
 * plan refuses to issue one -- so the queue was never reachable, and
 * `queueAvailable()` reported false forever. Bookings were emailed and dropped.
 *
 * It is a table now. Three things come with that:
 *
 *   - it is per-row, so two bookings arriving at once cannot overwrite each
 *     other. The old "one document holding a list" shape could, and the reason
 *     it was one-key-per-request in the first place.
 *   - the pending queue is a filtered SELECT the database can answer with an
 *     index, instead of the application enumerating every key to find it.
 *   - a booking can be a foreign key later, which a Blobs key cannot.
 *
 * NEVER THROWS
 * ------------
 * A booking that cannot be recorded is still emailed, and losing the record is
 * better than failing the customer's request. But the failure is logged loudly
 * and returned in the response, because silently dropping requests is the exact
 * bug this module exists to remove.
 */

'use strict';

const DatabaseService = require('./utils/database-service');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

/**
 * Is the queue usable on this deployment?
 *
 * Reported rather than assumed, because "the table does not exist" and "the
 * table is empty" produce the same empty list and mean opposite things to
 * whoever is looking.
 */
function queueAvailable() {
  return DatabaseService.isDatabaseConfigured();
}

/** Row -> the shape callers have always received. */
function toEntry(row) {
  return {
    id: row.id,
    status: row.status,
    vehicleId: row.vehicle_id,
    vehicleTitle: row.vehicle_title,
    fullName: row.full_name,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    comments: row.comments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordedAt: row.recorded_at,
    googleEventId: row.google_event_id,
    googleEventLink: row.google_event_link,
    syncedAt: row.synced_at,
    syncError: row.sync_error,
  };
}

/** Every recorded request, newest first. */
async function list() {
  if (!queueAvailable()) return { entries: [], available: false };
  try {
    const result = await DatabaseService.query(
      'SELECT * FROM booking_requests ORDER BY created_at DESC LIMIT 500'
    );
    return { entries: result.rows.map(toEntry), available: true };
  } catch (err) {
    // "no such table: booking_requests" means the schema has not been applied.
    // That is worth saying plainly rather than as an empty queue.
    console.error('[booking-queue] list failed', err && err.message);
    return { entries: [], available: false, error: err.message };
  }
}

/** Requests still waiting for a calendar. */
async function pending() {
  if (!queueAvailable()) return [];
  try {
    const result = await DatabaseService.query(
      `SELECT * FROM booking_requests
        WHERE status = 'new' AND google_event_id IS NULL
        ORDER BY preferred_date ASC, preferred_time ASC`
    );
    return result.rows.map(toEntry);
  } catch (err) {
    console.error('[booking-queue] pending failed', err && err.message);
    return [];
  }
}

/**
 * Record a booking request.
 *
 * Idempotent on `id`, so the same request submitted twice lands on one row
 * rather than creating a second entry.
 */
async function record(request) {
  if (!queueAvailable()) {
    console.warn(
      '[booking-queue] no database configured; this request is NOT recorded. ' +
        'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to keep bookings durable.'
    );
    return { stored: false, reason: 'no-database' };
  }
  try {
    await DatabaseService.query(
      `INSERT INTO booking_requests
         (id, status, vehicle_id, vehicle_title, full_name, email, phone,
          preferred_date, preferred_time, comments, created_at, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET
         vehicle_title = excluded.vehicle_title,
         comments      = excluded.comments,
         updated_at    = datetime('now')`,
      [
        request.id,
        request.status || 'new',
        request.vehicleId ?? null,
        request.vehicleTitle ?? null,
        request.fullName ?? request.name ?? null,
        request.email ?? null,
        request.phone ?? null,
        request.preferredDate ?? null,
        request.preferredTime ?? null,
        request.comments ?? null,
        request.createdAt || new Date().toISOString(),
      ]
    );
    return { stored: true, id: request.id };
  } catch (err) {
    console.error('[booking-queue] could not record request', err && err.message);
    return { stored: false, reason: err.message };
  }
}

/**
 * Mark a request as dealt with, cancelled, or synced to Google.
 *
 * The column list is fixed rather than interpolated from the patch keys. The
 * first SQL injection in this project came from interpolating a column name, and
 * this is a write path on a table holding a customer's name, phone number and
 * email -- the one place where getting that wrong leaks data.
 */
const UPDATABLE = {
  status: 'status',
  googleEventId: 'google_event_id',
  googleEventLink: 'google_event_link',
  syncedAt: 'synced_at',
  syncError: 'sync_error',
};

async function update(id, patch) {
  if (!queueAvailable()) return false;
  const sets = [];
  const params = [id];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      params.push(patch[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (!sets.length) return false;
  sets.push('updated_at = datetime(\'now\')');
  try {
    const result = await DatabaseService.query(
      `UPDATE booking_requests SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
      params
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('[booking-queue] update failed', err && err.message);
    return false;
  }
}

/** Build a stable, human-readable id from the request itself. */
function makeId({ name, email, preferredDate, preferredTime }) {
  const slug = String(name || 'request')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const stamp = `${String(preferredDate || '').replace(/-/g, '')}-${String(preferredTime || '').replace(':', '')}`;
  // Enough entropy to keep two people booking the same slot apart, without
  // needing a uuid dependency.
  const salt = Math.random().toString(36).slice(2, 7);
  return `${stamp}-${slug}-${salt}`;
}

module.exports = { record, list, pending, update, makeId, queueAvailable, CORS };

/* ---------------------------------------------------------------------------
   HTTP surface.

   GET     list requests, and whether the queue is usable
   PATCH   { id, status }  mark one handled / cancelled

   POST is deliberately NOT handled here. Recording a booking belongs to
   schedule-test-drive, which has the validated data; letting it be posted
   from outside would be a way to write arbitrary entries into the queue.

   The PATCH is a status flag only. It cannot create or alter a request, so the
   blast radius of a stolen link is "mark something cancelled", which is
   reversible by hand and loses nothing.
   --------------------------------------------------------------------------- */
async function httpHandler(event) {
  const json = (status, body) => ({ statusCode: status, headers: CORS, body: JSON.stringify(body) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  if (event.httpMethod === 'GET') {
    const { entries, available, error } = await list();
    return json(200, { available, entries, error: error || null, count: entries.length });
  }

  if (event.httpMethod === 'PATCH') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return json(400, { error: 'Invalid JSON body' });
    }
    if (!body.id) return json(422, { error: 'id is required' });
    const allowed = ['new', 'handled', 'cancelled', 'confirmed', 'sync-failed', 'synced'];
    if (!allowed.includes(body.status)) {
      return json(422, { error: `status must be one of: ${allowed.join(', ')}` });
    }
    const ok = await update(body.id, { status: body.status });
    return ok
      ? json(200, { id: body.id, status: body.status })
      : json(404, { error: 'No such request, or the database is not configured' });
  }

  return json(405, { error: 'Method not allowed' });
}

module.exports.httpHandler = httpHandler;

/**
 * This file is both a library and a function.
 *
 * schedule-test-drive.js requires it to `record()` a request, and Netlify
 * deploys it as an endpoint the admin page reads. `handler` is the name Netlify
 * looks for; without it the deploy would carry a file that 404s, and nothing
 * would say so until someone opened the admin page and saw an empty list.
 */
module.exports.handler = httpHandler;
