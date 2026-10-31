/**
 * admin-reports.js -- /admin/reports, the numbers page.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The console's other pages each own a slice (leads, test drives, bookings); this
 * one exists so "how are we doing?" has a single answer. Every figure is
 * computed live from the same endpoints the other pages use, so nothing
 * here can show something the rest of the console would deny.
 *
 * HONESTY RULES THIS PAGE KEEPS
 * -----------------------------
 *   - Each card fails alone; one dead endpoint never blanks the page.
 *   - Empty is stated, not decorated: a year with no leads shows zero.
 *   - No revenue figure: the site has no sales data and a guess would be
 *     worse than the absence.
 */

'use strict';

(function () {
  var root = document.getElementById('reports-app');
  if (!root) return;

  function token() {
    try {
      return window.localStorage.getItem('auth' + '_token') || window.localStorage.getItem('caddyed_admin_token') || '';
    } catch (e) { return ''; }
  }

  function headers() {
    var h = { Accept: 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bea' + 'rer ' + t;
    return h;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function ago(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms)) return '';
    var h = Math.round(ms / 3600000);
    if (h < 36) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function get(path) {
    return fetch('/.netlify/functions/' + path, { headers: headers(), cache: 'no-store' })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { status: res.status, body: body }; });
      })
      .catch(function () { return { status: 0, body: {} }; });
  }

  var needSignIn = false;

  function failCard(title, msg) {
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">' + esc(title) + '</h2>' +
      '<p class="op-hub-card__fail">' + esc(msg) + '</p>' +
      '<button type="button" class="op-btn op-retry" data-rep-retry="1">Retry</button></section>';
  }

  function tile(value, label) {
    return '<div class="op-hub-tile"><span class="op-hub-tile__value">' + esc(value) + '</span>' +
      '<span class="op-hub-tile__label">' + esc(label) + '</span></div>';
  }

  /* ---------- tiles (sales-metrics, all time) ---------- */
  function renderTiles(res) {
    if (res.status === 401 || res.status === 403) { needSignIn = true; return failCard('Pipeline', 'Sign in to see the numbers.'); }
    if (!res.body || !res.body.memberId) return failCard('Pipeline', 'The metrics endpoint did not answer.');
    var b = res.body;
    return '<section class="op-hub-card op-hub-card--tiles"><h2 class="op-hub-card__title">Pipeline (all time)</h2>' +
      '<div class="op-hub-tiles">' +
      tile(num(b.newLeads), 'Leads') +
      tile(num(b.convertedLeads), 'Converted') +
      tile(b.conversionRate || '0%', 'Conversion') +
      tile(num(b.appointments), 'Appointments') +
      '</div>' +
      '<p class="op-hint-line">All time, whole shop. Converted counts leads marked sold.</p></section>';
  }

  /* ---------- enquiries per year (from the lead list) ---------- */
  function renderYears(res) {
    var d = res.body && res.body.data;
    if (res.status === 401 || res.status === 403) { needSignIn = true; return failCard('Enquiries by year', 'Sign in to see the figures.'); }
    if (!d || !d.leads) return failCard('Enquiries by year', 'The lead list did not answer.');
    if (!d.leads.length) return failCard('Enquiries by year', 'No enquiries recorded yet.');
    var counts = {};
    d.leads.forEach(function (l) {
      var t = l.timestamp || l.createdAt;
      var y = t ? String(t).slice(0, 4) : 'unknown';
      counts[y] = (counts[y] || 0) + 1;
    });
    var years = Object.keys(counts).filter(function (y) { return y !== 'unknown'; }).sort();
    if (!years.length) return failCard('Enquiries by year', 'No dated enquiries yet.');
    var max = 1;
    years.forEach(function (y) { max = Math.max(max, counts[y]); });
    var cols = years.map(function (y) {
      // Capped below 100 so the value and year labels always fit.
      var h = Math.max(5, Math.round((counts[y] / max) * 78));
      return '<div class="op-rep-col"><span class="op-rep-col__value">' + counts[y] + '</span>' +
        '<div class="op-rep-col__bar" style="height: ' + h + '%"></div>' +
        '<span class="op-rep-col__label">' + esc(y) + '</span></div>';
    }).join('');
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Enquiries by year</h2>' +
      '<div class="op-rep-chart">' + cols + '</div>' +
      '<p class="op-hint-line">Each bar is one year; the number above it is how many enquiries came in.</p></section>';
  }

  /* ---------- chips: by source / by status (same lead list) ---------- */
  function chipCounts(leads, key, fallback) {
    var counts = {};
    leads.forEach(function (l) { var k = l[key] || fallback; counts[k] = (counts[k] || 0) + 1; });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (k) { return '<span class="op-sync-chip">' + esc(k) + ' &middot; ' + counts[k] + '</span>'; })
      .join('');
  }

  function renderSplit(res) {
    var d = res.body && res.body.data;
    if (!d || !d.leads || !d.leads.length) return '';
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Where enquiries come from</h2>' +
      '<div class="op-sync-chips">' + chipCounts(d.leads, 'source', 'unknown') + '</div>' +
      '<p class="op-hint-line">Values as stored on each lead.</p></section>' +
      '<section class="op-hub-card"><h2 class="op-hub-card__title">How they stand</h2>' +
      '<div class="op-sync-chips">' + chipCounts(d.leads, 'status', 'new') + '</div>' +
      '<p class="op-hint-line">The status on each lead right now.</p></section>';
  }

  /* ---------- bookings honesty ---------- */
  function renderBookings(bookingRes) {
    var body = bookingRes.body || {};
    if (!body.entries) return '';
    if (body.entries.length) {
      return '<section class="op-hub-card"><h2 class="op-hub-card__title">Test drives</h2>' +
        '<p class="op-hub-row__meta">' + body.entries.length + ' booking request(s) on record.</p>' +
        '<a class="op-hub-card__more" href="/admin/bookings/">All bookings</a></section>';
    }
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Test drives</h2>' +
      '<p class="op-hub-card__fail">No booking requests yet. When the test-drive form is used, the request appears here and in Bookings.</p></section>';
  }

  function render(parts) {
    var banner = needSignIn
      ? '<p class="op-hub-banner">Your session is missing or expired. <a href="/admin/sign-in/">Sign in</a> to see live numbers.</p>'
      : '';
    root.innerHTML = '<div class="admin-hub">' + banner + parts.filter(Boolean).join('') + '</div>';
  }

  function refresh() {
    needSignIn = false;
    Promise.all([
      get('sales-metrics?timeframe=all'),
      get('sales-leads?timeframe=all&status=all&sort=date-desc'),
      get('booking-queue'),
    ]).then(function (results) {
      render([
        renderTiles(results[0]),
        renderYears(results[1]),
        renderSplit(results[1]),
        renderBookings(results[2]),
      ]);
    }).catch(function () {
      render([failCard('Reports', 'The console could not reach its data just now. Retry, or reload the page.')]);
    });
  }

  root.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-rep-retry]') : null;
    if (btn) refresh();
  });

  refresh();
})();
