/**
 * bookings-admin.js -- the admin view of booking requests, and the Google
 * Calendar connection.
 *
 * This is a STAFF page. It reads the booking queue and reports the calendar
 * connection state. It deliberately cannot record favourites, mark requests
 * handled, or push to a calendar until the relevant endpoint says it can --
 * because a button that appears to work and does not is worse than one that
 * explains itself.
 *
 * Every failure path here says what to do. "Something went wrong" is not an
 * error message; it is a shrug, and Ed cannot act on a shrug.
 */
(function () {
  'use strict';

  const QUEUE = '/.netlify/functions/booking-queue';
  const CALENDAR = '/.netlify/functions/google-calendar';

  /**
   * The admin session token, read from the same place every other admin script
   * reads it.
   *
   * booking-queue.js is staff-only, and it has to be: it returns full name,
   * email address and phone number for every booking request. It used to be open
   * to anyone, with `Access-Control-Allow-Origin: *`, so the customer list was
   * readable from any web page on the internet.
   *
   * This call sent no credential at all -- a bare `fetch(QUEUE)` -- so adding the
   * guard is only half the fix. Without this header the admin page would simply
   * have stopped working, and "the admin bookings page is empty" is not a
   * description of a security fix.
   */
  function authHeaders() {
    let token = '';
    try {
      token = window.localStorage.getItem('caddyed_admin_token') || '';
    } catch (e) {
      token = '';
    }
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  const listEl = document.querySelector('[data-bookings-list]');
  const statusEl = document.querySelector('[data-cal-status]');
  const connectEl = document.querySelector('[data-cal-connect]');
  const syncEl = document.querySelector('[data-cal-sync]');
  const refreshEl = document.querySelector('[data-refresh], [data-cal-refresh]');
  if (!listEl) return;

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function say(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = el.className.replace(/\s*is-\w+/g, '') + (kind ? ' is-' + kind : '');
  }

  function when(entry) {
    if (!entry.preferredDate) return 'no date given';
    const d = new Date(`${entry.preferredDate}T${String(entry.preferredTime || '10:00')}:00`);
    if (Number.isNaN(d.getTime())) return `${entry.preferredDate} ${entry.preferredTime || ''}`.trim();
    return d.toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
  }

  function render(entries, available) {
    if (!available) {
      listEl.innerHTML =
        '<p class="bookings-empty">No booking store on this site yet. Create a Blobs ' +
        'store named <code>booking-requests</code> and requests will be listed here ' +
        'as well as emailed. Until then they are only in the email.</p>';
      return;
    }
    if (!entries.length) {
      listEl.innerHTML = '<p class="bookings-empty">No requests yet.</p>';
      return;
    }
    listEl.innerHTML = entries.map((e) => {
      const state = e.status || 'new';
      return '<article class="booking-row is-' + esc(state) + '">' +
        '<div class="booking-row__when">' + esc(when(e)) + '</div>' +
        '<div class="booking-row__who">' +
          '<strong>' + esc(e.fullName || 'no name') + '</strong>' +
          '<a href="mailto:' + esc(e.email || '') + '">' + esc(e.email || 'no email') + '</a>' +
          (e.phone ? '<span>' + esc(e.phone) + '</span>' : '') +
        '</div>' +
        '<div class="booking-row__car">' + esc(e.vehicleTitle || 'unspecified vehicle') +
          (e.vehicleId ? ' <em>' + esc(e.vehicleId) + '</em>' : '') +
          (e.comments ? '<p class="booking-row__note">' + esc(e.comments) + '</p>' : '') +
        '</div>' +
        '<div class="booking-row__state">' +
          (e.googleEventLink
            ? '<a href="' + esc(e.googleEventLink) + '" target="_blank" rel="noopener">on calendar</a>'
            : '<span>' + esc(state) + '</span>') +
        '</div>' +
        '</article>';
    }).join('');
  }

  async function load() {
    try {
      const res = await fetch(QUEUE, { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        // Distinguished from "the queue is broken" on purpose. These used to
        // share one failure path that rendered an empty list, so a 401 looked
        // exactly like a dealership with no bookings -- which is the message you
        // would most want someone to believe.
        render([], false);
        say(statusEl, 'Sign in to see booking requests', 'warn');
        listEl.innerHTML = '<p class="bookings-empty">Sign in to see booking requests.</p>';
        return;
      }
      const body = await res.json();
      if (body.error) {
        render([], false);
        return;
      }
      render(body.entries || [], body.available !== false);
      say(statusEl, `${(body.entries || []).length} request(s) recorded`, 'ok');
    } catch (err) {
      listEl.innerHTML = '<p class="bookings-empty">Could not reach the booking store: ' +
        esc(err.message) + '</p>';
    }
  }

  async function loadCalendar() {
    // The credential matters here even though nothing is being written.
    //
    // google-calendar.js `action=status` uses optionalAuthenticateRequest, so an
    // anonymous caller gets `{connected: false, reason: 'not-signed-in'}` rather
    // than an error. That is the right server behaviour -- a signed-out visitor
    // should not see a 401 in their console -- but it meant this page asked the
    // question without the token and was always told "not signed in".
    //
    // So the calendar panel reported "Calendar not connected yet" on a site where
    // the calendar was connected, and offered the Connect link again, which would
    // have started a second OAuth grant against the same account.
    try {
      const res = await fetch(`${CALENDAR}?action=status`, { headers: authHeaders() });
      const body = await res.json();
      if (body.connected) {
        say(statusEl, `Calendar connected${body.email ? ' as ' + body.email : ''}`, 'ok');
        if (syncEl) syncEl.disabled = false;
        return;
      }
      if (body.reason === 'not-configured') {
        say(statusEl, 'Google Calendar not configured on this site yet', 'warn');
        if (connectEl) {
          // The connect link goes to the function, not here, so the OAuth
          // redirect_uri is built server-side from the real host.
          connectEl.href = `${CALENDAR}?action=start`;
        }
        if (syncEl) syncEl.disabled = true;
        return;
      }
      say(statusEl, 'Calendar not connected yet', 'warn');
      if (connectEl) connectEl.href = `${CALENDAR}?action=start`;
      if (syncEl) syncEl.disabled = true;
    } catch (err) {
      console.error('calendar check failed:', err);
        say(statusEl, 'Could not check the calendar. Try again shortly.', 'warn');
      if (syncEl) syncEl.disabled = true;
    }
  }

  async function pushAll() {
    if (!syncEl) return;
    syncEl.disabled = true;
    say(statusEl, 'Pushing to Google Calendar…');
    try {
      const res = await fetch(CALENDAR, { method: 'POST', headers: authHeaders() });
      const body = await res.json();
      if (res.status === 401 || res.status === 403) {
        say(statusEl, 'Sign in before pushing to the calendar', 'warn');
        return;
      }
      if (!res.ok) {
        say(statusEl, body.message || 'The calendar push failed', 'warn');
        return;
      }
      const { pushed = [], failed = [] } = body;
      say(statusEl,
        failed.length
          ? `${pushed.length} pushed, ${failed.length} failed`
          : `${pushed.length} pushed to your calendar`,
        failed.length ? 'warn' : 'ok');
      await load();
    } catch (err) {
      console.error('calendar push failed:', err);
        say(statusEl, 'Push failed. Try again shortly.', 'warn');
    }
  }

  if (connectEl) {
    connectEl.addEventListener('click', (e) => {
      // Let the browser follow the redirect, but only if we have somewhere to go.
      if (!connectEl.getAttribute('href')) e.preventDefault();
    });
  }
  if (syncEl) syncEl.addEventListener('click', pushAll);
  if (refreshEl) refreshEl.addEventListener('click', load);

  load();
  loadCalendar();
})();
