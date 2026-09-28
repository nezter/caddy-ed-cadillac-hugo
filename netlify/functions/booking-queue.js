/**
 * booking-queue.js -- durable record of booking requests, on Netlify Blobs.
 *
 * WHY THIS EXISTS
 * ---------------
 * A test-drive request currently does two things: send an email, and write to
 * Postgres. On a deployment with no database configured the email goes out and
 * the request is then gone -- nothing records it, nothing lists it, and the
 * calendar has nothing to sync. The customer believes they have booked.
 *
 * That is the worst failure mode this project has, and it is invisible because
 * the email still arrives.
 *
 * So requests are appended to a Blobs store. It needs no provisioning beyond
 * one store, it survives a cold start, and it makes the booking visible BEFORE
 * the database exists -- which is also what makes the Google Calendar sync
 * possible, because there is finally something to sync.
 *
 * WHY A QUEUE AND NOT OVERWRITING
 * ------------------------------
 * `store.setJSON('bookings', [...])` would lose a booking whenever two arrive
 * in the same invocation. Every write here is an append keyed by the request
 * id, so a request cannot be clobbered by a concurrent one. Reads merge all the
 * keys, so the shape on disk does not matter to the caller.
 *
 * ONE STORE, ONE KEY PER REQUEST
 * ------------------------------
 * Blobs has no append. The layout is:
 *
 *     booking-requests/<requestId>   one key per request
 *
 * which makes a write idempotent -- the same request submitted twice lands on
 * the same key rather than creating a second entry -- and makes "cancel this
 * one" a single delete instead of a read-modify-write.
 */

'use strict';

const STORE = 'booking-requests';

let blobs = null;
function store() {
  if (blobs) return blobs;
  try {
    // Required lazily: an unconfigured or unprovisioned site must not fail to
    // load the function, it must degrade.
    // eslint-disable-next-line global-require
    blobs = require('@netlify/blobs');
    return blobs;
  } catch (e) {
    return null;
  }
}

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
 * Reported rather than assumed, because "the store does not exist yet" and
 * "the store is empty" produce the same empty list and mean opposite things to
 * whoever is looking.
 */
function queueAvailable() {
  return store() !== null;
}

/**
 * Record a booking request.
 *
 * Never throws. A booking that cannot be queued is still emailed, and losing
 * the record is better than failing the customer's request -- but the failure
 * is logged loudly, because silently dropping requests is the bug this whole
 * module exists to remove.
 */
async function record(request) {
  const b = store();
  if (!b) {
    console.warn(
      '[booking-queue] @netlify/blobs unavailable; this request is NOT recorded. ' +
        'Create a Blobs store named "booking-requests" to keep bookings durable.'
    );
    return { stored: false, reason: 'blobs-unavailable' };
  }
  try {
    await b.getStore(STORE).setJSON(`req-${request.id}`, {
      ...request,
      recordedAt: new Date().toISOString(),
    });
    return { stored: true, id: request.id };
  } catch (err) {
    console.error('[booking-queue] could not record request', err);
    return { stored: false, reason: err.message };
  }
}

/** Every recorded request, newest first. */
async function list() {
  const b = store();
  if (!b) return { entries: [], available: false };
  try {
    const s = b.getStore(STORE);
    const found = await s.list();
    const entries = [];
    for (const item of found.blobs) {
      try {
        const e = await s.getJSON(item.key);
        if (e) entries.push(e);
      } catch (err) {
        // One unreadable key must not hide the rest.
        console.warn('[booking-queue] skipping', item.key, err.message);
      }
    }
    entries.sort((a, b2) => String(b2.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { entries, available: true };
  } catch (err) {
    console.error('[booking-queue] list failed', err);
    return { entries: [], available: false, error: err.message };
  }
}

/** Mark a request as dealt with, cancelled, or synced to Google. */
async function update(id, patch) {
  const b = store();
  if (!b) return false;
  try {
    const s = b.getStore(STORE);
    const current = await s.getJSON(`req-${id}`);
    if (!current) return false;
    await s.setJSON(`req-${id}`, { ...current, ...patch, updatedAt: new Date().toISOString() });
    return true;
  } catch (err) {
    console.error('[booking-queue] update failed', err, err && err.message);
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

module.exports = { record, list, update, makeId, queueAvailable, STORE, CORS };

/* ---------------------------------------------------------------------------
   HTTP surface.

   GET     list requests, and whether the store exists
   PATCH   { id, status }  mark one handled / cancelled

   POST is deliberately NOT handled here. Recording a booking belongs to
   schedule-test-drive, which has the validated data; letting it be posted
   from outside would be a way to write arbitrary entries into the queue.

   The PATCH is a status flag only. It cannot create or alter a request, so the
   blast radius of a stolen link is "mark something cancelled", which is
   reversible by hand and loses nothing.
   --------------------------------------------------------------------------- */
async function httpHandler(event) {
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
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
    const allowed = ['new', 'handled', 'cancelled', 'confirmed'];
    if (!allowed.includes(body.status)) {
      return json(422, { error: `status must be one of: ${allowed.join(', ')}` });
    }
    const ok = await update(body.id, { status: body.status });
    return ok ? json(200, { id: body.id, status: body.status })
              : json(404, { error: 'No such request, or the store is not configured' });
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
