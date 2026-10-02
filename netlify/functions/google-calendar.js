/**
 * google-calendar.js -- per-person Google Calendar, and pushing test-drive
 * requests onto it.
 *
 * WHAT THIS DOES
 * --------------
 *   GET  ?action=status      is THIS person connected, and to which account
 *   GET  ?action=connect     redirect to Google's consent screen
 *   GET  ?action=callback    handle Google's redirect, store the tokens
 *   POST ?action=disconnect  forget this person's tokens
 *   POST { id? }             push queued bookings to THIS person's calendar
 *
 * WHAT CHANGED, AND WHY
 * ---------------------
 * ONE TOKEN FOR EVERYBODY
 *   The tokens lived in a Blobs store under a single key, `token`. That is one
 *   calendar for the whole dealership: the first person to connect owned it, and
 *   everybody else's bookings went into their calendar without them knowing.
 *   One person disconnecting removed it for all of them.
 *
 *   Now one row per person, keyed on the Netlify Identity `sub` -- the same
 *   value `sales_reps.id` is keyed on, so the row belongs to a person rather
 *   than to a session.
 *
 * BLOBS AT ALL
 *   This account's plan does not let a function reach a Blobs store, so the
 *   token store was never reachable and `?action=connect` could not have worked.
 *   The database is the one piece of infrastructure confirmed working on this
 *   site. The tokens are there now, and `ON DELETE CASCADE` from `sales_reps`
 *   means they go when the person does: revocation is a delete.
 *
 * THE STATE PARAMETER
 * -------------------
 * Signed with HMAC over JWT_SECRET, not stored.
 *
 * It was stored in Blobs, so the check could not run, and it was written as:
 *
 *     if (s) { ...verify... }
 *
 * which means when the store was unavailable -- always, on this plan -- the
 * verification was SKIPPED. The callback would have accepted any authorization
 * code anyone posted at it. That is a CSRF hole that opens precisely when
 * something else is already broken, which is the worst time for it.
 *
 * A stateless HMAC-signed state needs no storage, so it cannot be skipped, and it
 * cannot be skipped by an outage. The signed payload carries the user's `sub`,
 * which is what makes the callback per-person: the code Google returns is stored
 * against whoever started the flow, not against whoever completed it.
 *
 * SCOPE
 * -----
 * calendar.events only. Not the whole calendar, not free/busy discovery of other
 * people's availability. A token with calendar scope is a token that can read
 * every event in that person's calendar, indefinitely.
 *
 * CREDENTIALS
 * -----------
 * It needs a Google Cloud project, an OAuth client ID and secret, and a consent
 * screen the owner has to publish. Until those exist it reports its own absence
 * rather than pretending: status says `not-configured`, connect explains what
 * to create, and a push returns 503 with the same explanation.
 */

'use strict';

const crypto = require('crypto');

const bookingQueue = require('./booking-queue');
const { authenticateRequest, optionalAuthenticateRequest } = require('./utils/auth-middleware');
const DatabaseService = require('./utils/database-service');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  // Needed to show WHICH Google account is connected. Without it the status page
  // can only say "connected", which is not enough to tell a member of staff
  // that they are looking at somebody else's calendar.
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
  'email',
];
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// The dealership's timezone. Appointment times are wall-clock times in
// Charlotte -- "10:00" means ten in the morning THERE, not on whichever
// machine built the event. Pushed events carry this zone explicitly (the
// function used to omit it, so an event built on a UTC server landed at the
// wrong wall-clock hour in Ed's calendar), and the pull side reads times back
// in the same frame.
const DEALER_TZ = 'America/New_York';

/** "YYYY-MM-DDTHH:MM:00" from a Date's own local fields -- a wall-clock string. */
function wallClock(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00'
  );
}
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

/** How long a connect flow may take before its state is refused. Ten minutes. */
const STATE_TTL_MS = 10 * 60 * 1000;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function redirect(location) {
  return {
    statusCode: 302,
    headers: { Location: location, 'Cache-Control': 'no-store' },
    body: '',
  };
}

function page(title, body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1.5rem;color:#111}
h1{font-size:1.6rem;margin:0 0 1rem}code{background:#f4f4f5;padding:.15em .4em;border-radius:3px}
a{color:#c8102e}li{margin:.4rem 0}</style>
<h1>${escapeHtml(title)}</h1>${body}`,
  };
}

/** Titles and messages are put into a page; a Google error string can hold
 *  anything at all, so it is escaped rather than trusted. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ *
 * Signed state
 * ------------------------------------------------------------------ */

function stateSecret() {
  return process.env.JWT_SECRET || '';
}

/**
 * A state value that names the person who started the flow and cannot be
 * changed.
 *
 * `payload.nonce.exp.sig`, base64url, HMAC-SHA256 over the first four parts.
 * Google echoes `state` back untouched, and the callback recomputes the signature
 * and compares it. A forged or edited state fails the comparison; an expired one
 * fails on `exp`.
 *
 * Stateless on purpose: no storage to be unavailable, so this cannot be skipped
 * by an outage the way the Blobs-backed check could.
 */
function signState(sub) {
  const payload = {
    sub,
    nonce: crypto.randomBytes(12).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

/** Verify a state value. Returns the sub, or null with a reason. */
function readState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) {
    return { ok: false, reason: 'missing' };
  }
  const idx = state.lastIndexOf('.');
  const body = state.slice(0, idx);
  const sig = state.slice(idx + 1);

  const expected = hmac(body);
  // Constant-time: a byte-by-byte compare leaks how much of a forgery was right.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (!payload || !payload.sub) return { ok: false, reason: 'no-subject' };
  if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, sub: payload.sub };
}

function hmac(body) {
  return crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
}

function base64url(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

/* ------------------------------------------------------------------ *
 * Token storage -- one row per person
 * ------------------------------------------------------------------ */

async function readTokenFor(userId) {
  if (!userId) return null;
  try {
    const result = await DatabaseService.query(
      'SELECT * FROM google_calendar_tokens WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[google-calendar] could not read the stored token:', error.message);
    return null;
  }
}

async function writeTokenFor(userId, data) {
  await DatabaseService.query(
    `INSERT INTO google_calendar_tokens
       (user_id, access_token, refresh_token, expires_at, scope, google_email,
        calendar_id, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at   = excluded.expires_at,
       scope        = excluded.scope,
       google_email = excluded.google_email,
       calendar_id  = excluded.calendar_id,
       connected_at = excluded.connected_at,
       updated_at   = datetime('now')`,
    [
      userId,
      data.accessToken,
      data.refreshToken,
      data.expiresAt,
      data.scope || SCOPES.join(' '),
      data.email || null,
      data.calendarId || 'primary',
      new Date().toISOString(),
    ]
  );
}

async function deleteTokenFor(userId) {
  await DatabaseService.query('DELETE FROM google_calendar_tokens WHERE user_id = $1', [userId]);
}

/**
 * A valid access token for this person, refreshing it if it has expired.
 *
 * Returns null when there is nothing to refresh -- which is the normal answer for
 * somebody who has not connected. The caller says so rather than failing.
 */
async function accessTokenFor(userId) {
  const saved = await readTokenFor(userId);
  if (!saved) return { token: null, saved: null };

  const expiresAt = Number(saved.expires_at || 0);
  if (saved.access_token && Date.now() < expiresAt - 60_000) {
    return { token: saved.access_token, saved };
  }
  if (!saved.refresh_token) return { token: null, saved };

  const creds = credentials();
  if (!creds) return { token: null, saved };

  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.id,
        client_secret: creds.secret,
        refresh_token: saved.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      return { token: null, saved, refreshFailed: data.error || 'refresh rejected' };
    }
    await DatabaseService.query(
      'UPDATE google_calendar_tokens SET access_token = $1, expires_at = $2, updated_at = datetime(\'now\') WHERE user_id = $3',
      [data.access_token, Date.now() + (data.expires_in || 3600) * 1000, userId]
    );
    return { token: data.access_token, saved };
  } catch (err) {
    console.error('[google-calendar] token refresh failed:', err.message);
    return { token: null, saved };
  }
}

/* ------------------------------------------------------------------ */

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
<p>Then <a href="?action=connect">connect your calendar</a>. Each member of staff
connects their own — bookings go to the person they asked for, not to whoever
connected first.</p>`;

/** Unauthenticated callers get this rather than a redirect loop. */
const SIGN_IN_REQUIRED = `
<p>This is a staff page. Sign in and try again.</p>
<p><a href="/admin/sign-in/">Sign in</a></p>`;

async function handler(event) {
  const params = event.queryStringParameters || {};
  const q = (n) => params[n];
  const action = q('action') || '';

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  /* ---------------------------------------------------------------- status
   *
   * Uses optional auth, not required auth: this is the page's own status probe,
   * and an anonymous visitor should get `connected: false` rather than a 401
   * that logs an error in the console for whoever is not signed in.
   */
  if (action === 'status') {
    const creds = credentials();
    if (!creds) {
      return json(200, {
        connected: false,
        reason: 'not-configured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.',
      });
    }
    const auth = await optionalAuthenticateRequest(event);
    if (!auth.authenticated) {
      return json(200, { connected: false, reason: 'not-signed-in' });
    }
    const saved = await readTokenFor(auth.user.id);
    if (!saved) return json(200, { connected: false, reason: 'not-connected' });

    return json(200, {
      connected: true,
      perUser: true,
      userId: auth.user.id,
      email: saved.google_email || null,
      calendarId: saved.calendar_id || 'primary',
      connectedAt: saved.connected_at || null,
      expiresAt: Number(saved.expires_at || 0) || null,
    });
  }

  /* -------------------------------------------------------------- connect */
  if (action === 'connect' || action === 'start') {
    const creds = credentials();
    if (!creds) return page('Google Calendar is not configured', NOT_CONFIGURED, 400);

    // Required auth: this is where a calendar gets attached to a person, and
    // the state that comes back is what decides whose calendar it is.
    const auth = await authenticateRequest(event);
    if (!auth.authenticated) return page('Sign in to connect a calendar', SIGN_IN_REQUIRED, 401);

    if (!stateSecret()) {
      return page(
        'Cannot start a connection',
        '<p>This site has no signing key, so a connect flow cannot be issued '
        + 'safely. A calendar must not be attached to the wrong person.</p>',
        500
      );
    }

    const origin = `https://${event.headers.host || 'caddyed.com'}`;
    const redirectUri = `${origin}/.netlify/functions/google-calendar?action=callback`;

    const auth2 = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth2.searchParams.set('client_id', creds.id);
    auth2.searchParams.set('redirect_uri', redirectUri);
    auth2.searchParams.set('response_type', 'code');
    auth2.searchParams.set('scope', SCOPES.join(' '));
    auth2.searchParams.set('access_type', 'offline'); // we need a refresh token
    // `select_account` rather than `consent`: re-connecting an account that is
    // already authorised should not make somebody re-grant the same scopes.
    auth2.searchParams.set('prompt', 'consent select_account');
    auth2.searchParams.set('include_granted_scopes', 'true');
    auth2.searchParams.set('state', signState(auth.user.id));

    // The old code called `redirect(res, ...)` with `res` never defined, so
    // this threw a ReferenceError and connecting never worked even where the
    // token store was reachable. One argument now.
    return redirect(auth2.toString());
  }

  /* ------------------------------------------------------------- callback */
  if (action === 'callback') {
    if (q('error')) {
      return page(
        'Calendar not connected',
        `<p>Google returned <code>${escapeHtml(q('error'))}</code>.</p>
         <p><a href="/admin/calendar/">Back to the calendar</a></p>`,
        400
      );
    }
    const creds = credentials();
    if (!creds) return page('Google Calendar is not configured', NOT_CONFIGURED, 400);

    // Verify the state BEFORE exchanging anything. This is not wrapped in a
    // storage check, so it cannot be skipped: without valid, unexpired, correctly
    // signed state this endpoint refuses the code outright.
    const state = readState(q('state'));
    if (!state.ok) {
      console.warn('[google-calendar] refused a callback:', state.reason);
      return page(
        'Could not verify that request',
        `<p>The state parameter did not verify (${escapeHtml(state.reason)}).`
        + ' Start again from the calendar page.</p>',
        400
      );
    }

    const origin = `https://${event.headers.host || 'caddyed.com'}`;
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
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
      if (!res.ok || !data.access_token) {
        throw new Error(data.error_description || 'token exchange failed');
      }

      // Which account connected, so the status page can name it. Without this
      // somebody cannot tell whether they are looking at their own calendar.
      let googleEmail = null;
      try {
        const who = await fetch(USERINFO_ENDPOINT, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (who.ok) googleEmail = (await who.json()).email || null;
      } catch (e) { /* not important enough to fail the connection over */ }

      await writeTokenFor(state.sub, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        scope: data.scope,
        email: googleEmail,
      });

      // A re-connect often returns no refresh token, meaning "keep using the one
      // you have". Without this the previous refresh token would be overwritten
      // with NULL and the connection would die an hour later with nothing to
      // explain it.
      if (!data.refresh_token) {
        const existing = await readTokenFor(state.sub);
        if (existing && existing.refresh_token) {
          await DatabaseService.query(
            'UPDATE google_calendar_tokens SET refresh_token = $1 WHERE user_id = $2',
            [existing.refresh_token, state.sub]
          );
        }
      }

      const who = await DatabaseService.getSalesRep(state.sub);
      const first = who ? `${who.first_name} ${who.last_name}`.trim() : 'your';
      let pending = { entries: [] };
      try {
        pending = await bookingQueue.list();
      } catch (e) { /* the calendar is connected either way */ }

      return page(
        'Calendar connected',
        `<p>Connected${googleEmail ? ` as <b>${escapeHtml(googleEmail)}</b>` : ''}. `
        + `Bookings from now on go to ${escapeHtml(first)}'s calendar, and only theirs.</p>
         <p>${pending.entries.length} booking request${pending.entries.length === 1 ? '' : 's'} waiting to be pushed.</p>
         <p><a href="/admin/calendar/">Back to the calendar</a></p>`
      );
    } catch (err) {
      return page('Could not connect', `<p>${escapeHtml(err.message)}</p>`, 400);
    }
  }

  /* ------------------------------------------------------------ disconnect */
  if (action === 'disconnect') {
    const auth = await authenticateRequest(event);
    if (!auth.authenticated) return json(401, { error: 'not-authenticated' });
    await deleteTokenFor(auth.user.id);
    return json(200, { disconnected: true, userId: auth.user.id });
  }

  /* ------------------------------------------------------------------ POST */
  if (event.httpMethod === 'POST') {
    const creds = credentials();
    if (!creds) {
      return json(503, {
        error: 'not-configured',
        message: 'Google Calendar is not configured for this site.',
      });
    }

    // Required auth. Pushing a booking writes to a calendar, and which calendar is
    // decided by who is asking.
    const auth = await authenticateRequest(event);
    if (!auth.authenticated) {
      return json(401, { error: 'not-authenticated', message: 'Sign in to sync a calendar.' });
    }

    const { token, refreshFailed } = await accessTokenFor(auth.user.id);
    if (!token) {
      return json(409, {
        error: 'not-connected',
        message: 'Connect your calendar first.',
        detail: refreshFailed || null,
      });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return json(400, { error: 'Invalid JSON body' });
    }

    /* ------------------------------------------------------------- PULL
     *
     * "Sync back and forth": push puts requests ON the calendar; pull reads
     * what the calendar says NOW about the events this site created --
     * cancelled, deleted, or moved by hand -- and records it against the
     * request, so /admin/bookings never shows a time that no longer exists.
     */
    if (body.action === 'pull') {
      let pullEntries = [];
      try {
        pullEntries = (await bookingQueue.list()).entries;
      } catch (e) {
        return json(503, { error: 'queue-unavailable', message: String(e.message) });
      }

      const tracked = pullEntries.filter((e) => e.googleEventId && e.status !== 'cancelled');
      const moved = [];
      const cancelled = [];
      const problems = [];

      for (const req of tracked) {
        try {
          const res = await fetch(
            CALENDAR_API + '/calendars/primary/events/' + encodeURIComponent(req.googleEventId),
            { headers: { Authorization: 'Bearer ' + token } }
          );
          if (res.status === 404 || res.status === 410) {
            await bookingQueue.update(req.id, {
              status: 'removed-on-calendar',
              calendarCheckedAt: new Date().toISOString(),
            });
            cancelled.push({ id: req.id, reason: 'removed' });
            continue;
          }
          const ev = await res.json();
          if (!res.ok) {
            throw new Error((ev.error && ev.error.message) || 'calendar read failed');
          }
          if (ev.status === 'cancelled') {
            await bookingQueue.update(req.id, {
              status: 'cancelled-on-calendar',
              calendarCheckedAt: new Date().toISOString(),
            });
            cancelled.push({ id: req.id, reason: 'cancelled' });
            continue;
          }

          const start = ev.start || {};
          let date = null;
          let time = null;
          if (start.dateTime) {
            if (start.timeZone === DEALER_TZ || !/[Zz]|[+-][0-9][0-9]:[0-9][0-9]$/.test(start.dateTime)) {
              // Already a wall-clock string in the right frame: take it as-is.
              date = start.dateTime.slice(0, 10);
              time = start.dateTime.slice(11, 16);
            } else {
              // An absolute instant: render it as the wall clock in Charlotte.
              const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: DEALER_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false,
              }).formatToParts(new Date(start.dateTime));
              const get = (t2) => (parts.find((p) => p.type === t2) || {}).value || '';
              date = get('year') + '-' + get('month') + '-' + get('day');
              time = get('hour') + ':' + get('minute');
            }
          } else if (start.date) {
            date = start.date;
            time = req.preferredTime;
          }

          if (date && time && (date !== req.preferredDate || time !== req.preferredTime)) {
            await bookingQueue.update(req.id, {
              preferredDate: date,
              preferredTime: time,
              movedOnCalendar: true,
              movedFrom: ((req.preferredDate || '') + ' ' + (req.preferredTime || '')).trim(),
              calendarCheckedAt: new Date().toISOString(),
            });
            moved.push({
              id: req.id,
              from: (req.preferredDate || '') + ' ' + (req.preferredTime || ''),
              to: date + ' ' + time,
            });
            continue;
          }

          await bookingQueue.update(req.id, { calendarCheckedAt: new Date().toISOString() });
        } catch (err) {
          problems.push({ id: req.id, error: err.message });
        }
      }

      return json(200, {
        pulled: true,
        checked: tracked.length,
        moved,
        cancelled,
        problems,
        checkedAt: new Date().toISOString(),
      });
    }

    let entries = [];
    try {
      entries = (await bookingQueue.list()).entries;
    } catch (e) {
      return json(503, { error: 'queue-unavailable', message: String(e.message) });
    }

    let pending = entries.filter((e) => e.status !== 'cancelled' && !e.googleEventId);
    if (body.id) {
      const one = pending.filter((e) => e.id === body.id);
      if (!one.length) return json(404, { error: 'No pending request with that id' });
      pending = one;
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
              `Requested by ${req.fullName || req.name || 'a customer'} (${req.email}).\n`
              + `Phone: ${req.phone || 'not given'}.\n`
              + (req.vehicleId ? `Stock reference: ${req.vehicleId}.\n` : '')
              + (req.comments ? `Note: ${req.comments}\n` : '')
              + `Sent to Caddy Ed via caddyed.com. Reply to ${req.email} to confirm.`,
            location: '10725 Pineville Rd, Pineville, NC 28134',
            start: { dateTime: wallClock(start), timeZone: DEALER_TZ },
            end: { dateTime: wallClock(new Date(start.getTime() + 45 * 60_000)), timeZone: DEALER_TZ },
          }),
        });
        const created = await res.json();
        if (!res.ok) {
          throw new Error((created.error && created.error.message) || 'calendar rejected the event');
        }
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

    return json(200, {
      pushed,
      failed,
      syncedTo: auth.user.id,
      perUser: true,
    });
  }

  return json(405, { error: 'Method not allowed' });
}

module.exports = {
  handler,
  SCOPES,
  // Exported for the test suite. Signing a state and reading one back is the
  // security property here, and it should be testable without a live OAuth
  // round trip.
  signState,
  readState,
};
