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
      const res = await fetch(QUEUE);
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
    try {
      const res = await fetch(`${CALENDAR}?action=status`);
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
      const res = await fetch(CALENDAR, { method: 'POST' });
      const body = await res.json();
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
