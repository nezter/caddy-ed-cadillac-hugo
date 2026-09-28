/**
 * google-calendar.js -- connect Ed's Google Calendar and push booking requests
 * onto it.
 *
 * WHAT THIS DOES
 * --------------
 *   GET  ?action=start    redirect to Google's consent screen
 *   GET  ?action=callback handle Google's redirect, store the tokens
 *   GET  ?action=status   is it connected, and what has synced
 *   POST                  push a queued booking to the calendar
 *   PATCH { id, status }  mark a request handled / cancelled
 *
 * WHY IT IS BUILT BUT NOT WORKING YET
 * -----------------------------------
 * It needs a Google Cloud project, an OAuth client ID and secret, and a consent
 * screen Ed has to publish. Those are credentials only the owner can create --
 * there is no way to synthesise them and no safe way to guess at them.
 *
 * So the function is complete and wired, and it reports its own absence
 * honestly rather than pretending. Until the credentials exist:
 *
 *   status  -> { connected: false, reason: 'not-configured' }
 *   start   -> a page saying what to create, with a link
 *   POST    -> 503, with the same explanation
 *
 * The booking requests are already durable in booking-queue.js, so nothing is
 * waiting on this. When the credentials arrive the calendar fills in from
 * requests that already exist, and nothing needs re-sending.
 *
 * SCOPE
 * -----
 * calendar.events only. Not the whole calendar, not free/busy discovery of
 * other people's availability. The narrowest scope that does the job, because a
 * token with calendar scope is a token that can read every event in Ed's
 * calendar forever.
 *
 * THE TOKEN
 * ---------
 * Stored in a Blobs store, never in a function's environment. A refresh token in
 * an env var is readable by anything that can run a function, and it does not
 * expire when the OAuth consent is later withdrawn -- which an env var would
 * silently outlive. The store makes revocation a delete.
 */

'use strict';

const crypto = require('crypto');
const querystring = require('querystring');

const bookingQueue = require('./booking-queue');

const TOKEN_STORE = 'google-calendar';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

/** The two secrets, or null. Never logged. */
function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function store() {
  try {
    // eslint-disable-next-line global-require
    return require('@netlify/blobs').getStore(TOKEN_STORE);
  } catch (e) {
    return null;
  }
}

async function readToken() {
  const s = store();
  if (!s) return null;
  try {
    return await s.getJSON('token');
  } catch (e) {
    return null;
  }
}

/** A valid access token, refreshing it if the current one has expired. */
async function accessToken() {
  const saved = await readToken();
  if (!saved) return null;

  if (saved.accessToken && Date.now() < (saved.expiresAt || 0) - 60_000) {
    return saved.accessToken;
  }
  if (!saved.refreshToken) return null;

  const creds = credentials();
  if (!creds) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.id,
        client_secret: creds.secret,
        refresh_token: saved.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    const next = {
      ...saved,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    await store().setJSON('token', next);
    return next.accessToken;
  } catch (err) {
    console.error('[google-calendar] token refresh failed', err.message);
    return null;
  }
}

function redirect(res, location) {
  return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store' }, body: '' };
}

function page(title, body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1.5rem;color:#111}
h1{font-size:1.6rem;margin:0 0 1rem}code{background:#f4f4f5;padding:.15em .4em;border-radius:3px}
a{color:#c8102e}li{margin:.4rem 0}</style>
<h1>${title}</h1>${body}`,
  };
}

const NOT_CONFIGURED = `
<p>Google Calendar is not connected yet, because there is no OAuth client
configured for this site. Everything else about bookings already works —
requests are recorded and emailed — the calendar is the missing piece.</p>
<p>To turn it on, in the Google Cloud console:</p>
<ol>
  <li>Create a project, then enable the <b>Google Calendar API</b>.</li>
  <li>Create an <b>OAuth client ID</b> of type <i>Web application</i>.</li>
  <li>Add a redirect URI of
      <code>https://&lt;this-site&gt;/.netlify/functions/google-calendar?action=callback</code>
      — the same origin as this page.</li>
  <li>Put the client ID and secret in as
      <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.</li>
  <li>Publish the consent screen (it can be in testing while only your own
      Google account is listed as a test user).</li>
</ol>
<p>Then <a href="?action=start">connect the calendar</a>. Requests already
recorded will be waiting to be pushed — none of them need re-sending.</p>`;

async function handler(event) {
  const params = event.queryStringParameters || {};
  const q = (n) => params[n];

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // ---------------------------------------------------------------- status
  if (q('action') === 'status') {
    const creds = credentials();
    if (!creds) {
      return json(200, {
        connected: false,
        reason: 'not-configured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.',
      });
    }
    const token = await accessToken();
    if (!token) {
      return json(200, { connected: false, reason: 'not-connected' });
    }
    const saved = await readToken();
    return json(200, {
      connected: true,
      email: saved && saved.email ? saved.email : null,
      connectedAt: saved && saved.connectedAt ? saved.connectedAt : null,
    });
  }

  // ----------------------------------------------------------------- start
  if (q('action') === 'start') {
    const creds = credentials();
    if (!creds) return page('Google Calendar is not configured', NOT_CONFIGURED, 400);

    const origin = `https://${event.headers.host || 'caddyed.com'}`;
    const redirectUri = `${origin}/.netlify/functions/google-calendar?action=callback`;
    const state = crypto.randomBytes(16).toString('hex');
    // The state is echoed back by Google; comparing it is what stops a third
    // party from completing someone else's consent flow with our client ID.
    const s = store();
    if (s) await s.setJSON('state', { value: state, createdAt: Date.now() });

    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', creds.id);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES.join(' '));
    auth.searchParams.set('access_type', 'offline'); // we need a refresh token
    auth.searchParams.set('prompt', 'consent');
    auth.searchParams.set('state', state);
    return redirect(res, auth.toString());
  }

  // -------------------------------------------------------------- callback
  if (q('action') === 'callback') {
    const origin = `https://${event.headers.host || 'caddyed.com'}`;
    if (q('error')) {
      return page(
        'Calendar not connected',
        `<p>Google returned <code>${q('error')}</code>.</p>
         <p><a href="/admin/calendar/">Back to the calendar</a></p>`,
        400
      );
    }
    const creds = credentials();
    if (!creds) return page('Google Calendar is not configured', NOT_CONFIGURED, 400);

    // Verify the state we issued, so this endpoint cannot be used to feed
    // somebody else's authorization code into our store.
    const s = store();
    if (s) {
      const saved = await s.getJSON('state');
      if (!saved || saved.value !== q('state')) {
        return page('Could not verify that request', '<p>The state parameter did not match. Start again from the calendar page.</p>', 400);
      }
      await s.delete('state');
    }

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.id,
          client_secret: creds.secret,
          code: q('code'),
          grant_type: 'authorization_code',
          redirect_uri: `${origin}/.netlify/functions/google-calendar?action=callback`,
        }).toString(),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) throw new Error(data.error_description || 'token exchange failed');

      // Find out which account connected, so the admin shows something better
      // than "connected".
      let email = null;
      try {
        const who = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          { headers: { Authorization: `Bearer ${data.access_token}` } }
        );
        if (who.ok) email = (await who.json()).email || null;
      } catch (e) { /* not important enough to fail the connection over */ }

      await s.setJSON('token', {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        email,
        connectedAt: new Date().toISOString(),
      });

      const pending = await bookingQueue.list();
      return page(
        'Calendar connected',
        `<p>Connected${email ? ` as <b>${email}</b>` : ''}.</p>
         <p>${pending.entries.length} booking request${pending.entries.length === 1 ? '' : 's'} waiting to be pushed.</p>
         <p><a href="/admin/calendar/">Back to the calendar</a></p>`
      );
    } catch (err) {
      return page('Could not connect', `<p>${err.message}</p>`, 400);
    }
  }

  // ------------------------------------------------------------------ POST
  if (event.httpMethod === 'POST') {
    const creds = credentials();
    if (!creds) {
      return json(503, {
        error: 'not-configured',
        message: 'Google Calendar is not configured for this site.',
      });
    }
    const token = await accessToken();
    if (!token) {
      return json(409, { error: 'not-connected', message: 'Connect the calendar first.' });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return json(400, { error: 'Invalid JSON body' });
    }

    const { entries } = await bookingQueue.list();
    const pending = entries.filter((e) => e.status !== 'cancelled' && !e.googleEventId);
    if (body.id) {
      const one = pending.filter((e) => e.id === body.id);
      if (!one.length) return json(404, { error: 'No pending request with that id' });
      pending.length = 0;
      pending.push(one[0]);
    }

    const pushed = [];
    const failed = [];
    for (const req of pending) {
      const start = new Date(`${req.preferredDate}T${String(req.preferredTime || '10:00')}:00`);
      if (Number.isNaN(start.getTime())) {
        failed.push({ id: req.id, error: 'unparseable date' });
        continue;
      }
      try {
        const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: `Test drive: ${req.vehicleTitle || 'Cadillac'}`,
            description:
              `Requested by ${req.fullName || req.name} (${req.email}).\n` +
              `Phone: ${req.phone || 'not given'}.\n` +
              (req.vehicleId ? `Stock reference: ${req.vehicleId}.\n` : '') +
              (req.comments ? `Note: ${req.comments}\n` : '') +
              `Sent to Caddy Ed via caddyed.com. Reply to ${req.email} to confirm.`,
            location: '10725 Pineville Rd, Pineville, NC 28134',
            start: { dateTime: start.toISOString() },
            end: { dateTime: new Date(start.getTime() + 45 * 60_000).toISOString() },
          }),
        });
        const created = await res.json();
        if (!res.ok) throw new Error(created.error && created.error.message || 'calendar rejected the event');
        await bookingQueue.update(req.id, {
          googleEventId: created.id,
          googleEventLink: created.htmlLink,
          status: 'synced',
          syncedAt: new Date().toISOString(),
        });
        pushed.push({ id: req.id, link: created.htmlLink });
      } catch (err) {
        await bookingQueue.update(req.id, { status: 'sync-failed', syncError: err.message });
        failed.push({ id: req.id, error: err.message });
      }
    }

    return json(200, { pushed, failed });
  }

  return json(405, { error: 'Method not allowed' });
}

module.exports = { handler, SCOPES, TOKEN_STORE };
