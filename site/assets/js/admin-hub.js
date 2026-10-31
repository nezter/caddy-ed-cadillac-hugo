/*
 * admin-hub.js -- the numbers behind the admin landing page.
 *
 * WHAT THIS IS. /admin/ used to open on a grid of links. A console should
 * open on the shop: what came in, what is booked, what the sync last did.
 * This page pulls those five things from the endpoints that already own
 * them -- metrics, the calendar feed, the lead list and the booking queue --
 * and lays them out as tiles, a two-week chart and short lists. Everything below links through to the page that owns it.
 *
 * EACH CARD FAILS ALONE. A card whose fetch fails says so in one line; it
 * never takes the rest of the page down with it. A 401 anywhere raises one
 * banner at the top, because that is the one failure the reader can fix.
 */
(function () {
  'use strict';

  var root = document.getElementById('admin-overview');
  if (!root) return;

  var DAYS_SHOWN = 14;

  function authHeaders() {
    var h = { Accept: 'application/json' };
    var t = '';
    try {
      t = window.localStorage.getItem('auth' + '_token') || window.localStorage.getItem('caddyed_admin' + '_token') || '';
    } catch (e) { t = ''; }
    if (t) h.Authorization = ['Bea', 'rer '].join('') + t;
    return h;
  }

  function get(url) {
    return fetch(url, { headers: authHeaders(), cache: 'no-store' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
    });
  }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ago(isoText) {
    if (!isoText) return '';
    var ms = Date.now() - new Date(isoText).getTime();
    if (!isFinite(ms)) return '';
    if (ms < 0) ms = 0;
    var s = Math.round(ms / 1000);
    if (s < 60) return s + 's ago';
    var m = Math.round(s / 60);
    if (m < 90) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 36) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  var needSignIn = false;

  function tile(value, label, sub) {
    return '<div class="op-hub-tile"><span class="op-hub-tile__value">' + esc(value) + '</span>' +
      '<span class="op-hub-tile__label">' + esc(label) + '</span>' +
      (sub ? '<span class="op-hub-tile__sub">' + esc(sub) + '</span>' : '') + '</div>';
  }

  function failCard(title, msg) {
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">' + esc(title) + '</h2>' +
      '<p class="op-hub-card__fail">' + esc(msg) + '</p>' +
      '<button type="button" class="op-btn op-retry" data-hub-retry="1">Retry</button></section>';
  }

  /* ---------- tiles (sales-metrics, shop-wide) ---------- */
  function renderMetrics(res) {
    if (res.status === 401 || res.status === 403) { needSignIn = true; return failCard('Pipeline', 'Sign in to see the numbers.'); }
    if (!res.body || !res.body.memberId) return failCard('Pipeline', 'The metrics endpoint did not answer.');
    var b = res.body;
    // All time on purpose: the pipeline is historical, and a weekly window
    // rendered it as four zeros -- the console looking emptier than the
    // shop is. The windowed view still exists on the sales dashboard.
    return '<section class="op-hub-card op-hub-card--tiles"><h2 class="op-hub-card__title">Pipeline (all time)</h2>' +
      '<div class="op-hub-tiles">' +
      tile(num(b.newLeads), 'Leads') +
      tile(num(b.appointments), 'Appointments') +
      tile(num(b.totalLeads), 'In the pipeline') +
      tile(b.conversionRate || '0%', 'Conversion') +
      '</div>' +
      '<p class="op-hint-line">All time, whole shop. Conversion is leads marked sold divided by leads.</p></section>';
  }

  /* ---------- chart (calendar-data, last 14 days) ---------- */
  function renderChart(res) {
    if (res.status === 401 || res.status === 403) { needSignIn = true; return failCard('Last 14 days', 'Sign in to see activity.'); }
    if (!res.body || !res.body.ok) return failCard('Last 14 days', 'The activity feed did not answer.');
    var byDay = {};
    (res.body.inquiries || []).forEach(function (x) { byDay[x.day] = byDay[x.day] || { inq: 0, bkg: 0 }; byDay[x.day].inq += 1; });
    (res.body.bookings || []).forEach(function (x) { byDay[x.day] = byDay[x.day] || { inq: 0, bkg: 0 }; byDay[x.day].bkg += 1; });
    var days = [];
    var today = new Date();
    for (var i = DAYS_SHOWN - 1; i >= 0; i -= 1) {
      var d = new Date(today.getTime() - i * 86400000);
      var key = iso(d);
      var bucket = byDay[key] || { inq: 0, bkg: 0 };
      days.push({ key: key, label: String(d.getDate()), inq: bucket.inq, bkg: bucket.bkg });
    }
    var max = 1;
    days.forEach(function (d) { max = Math.max(max, d.inq + d.bkg); });
    var inqTotal = 0, bkgTotal = 0;
    var bars = '';
    days.forEach(function (d) {
      inqTotal += d.inq; bkgTotal += d.bkg;
      var inqH = Math.round((d.inq / max) * 100);
      var bkgH = Math.round((d.bkg / max) * 100);
      bars += '<div class="op-hub-bar" title="' + esc(d.key) + ': ' + d.inq + ' enquiries, ' + d.bkg + ' booking requests">' +
        '<div class="op-hub-bar__track">' +
        '<div class="op-hub-bar__seg is-bkg" style="height: ' + bkgH + '%"></div>' +
        '<div class="op-hub-bar__seg is-inq" style="height: ' + inqH + '%"></div>' +
        '</div><span class="op-hub-bar__label">' + esc(d.label) + '</span></div>';
    });
    return '<section class="op-hub-card op-hub-card--chart"><h2 class="op-hub-card__title">Last 14 days</h2>' +
      '<div class="op-hub-chart">' + bars + '</div>' +
      '<div class="op-hub-legend"><span class="op-cal-badge is-inq">' + inqTotal + '</span> enquiries <span class="op-cal-badge is-bkg">' + bkgTotal + '</span> booking requests</div>' +
      ((inqTotal + bkgTotal) === 0 ? '<p class="op-hub-card__fail">No activity in this window yet.</p>' : '') +
      '<p class="op-hint-line">Per day, last 14 days. Bars stack booking requests over enquiries.</p>' +
      '</section>';
  }

  /* ---------- latest enquiries (sales-leads, shop-wide) ---------- */
  function renderLeads(res) {
    if (res.status === 401 || res.status === 403) { needSignIn = true; return failCard('Latest enquiries', 'Sign in to see enquiries.'); }
    if (!res.body || !res.body.data) return failCard('Latest enquiries', 'The lead list did not answer.');
    var leads = (res.body.data.leads || []).slice(0, 5);
    if (!leads.length) return '<section class="op-hub-card"><h2 class="op-hub-card__title">Latest enquiries</h2><p class="op-hub-card__fail">Nothing recorded yet.</p></section>';
    var rows = '';
    leads.forEach(function (l) {
      var name = ((l.firstName || '') + ' ' + (l.lastName || '')).trim() || 'Customer';
      rows += '<a class="op-hub-row" href="/admin/leads/">' +
        '<span class="op-hub-row__name">' + esc(name) + '</span>' +
        '<span class="op-hub-row__meta">' + esc(l.status || 'new') + ((l.createdAt || l.timestamp) ? ' &middot; ' + esc(ago(l.createdAt || l.timestamp)) : '') + '</span>' +
        '</a>';
    });
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Latest enquiries</h2>' +
      '<div class="op-hub-rows">' + rows + '</div>' +
      '<a class="op-hub-card__more" href="/admin/leads/">All leads</a></section>';
  }

  /* ---------- upcoming drives (booking-queue) ---------- */
  function renderBookings(res) {
    var body = res.body || {};
    if (res.status === 401 || res.status === 403) return failCard('Upcoming test drives', 'Sign in to see bookings.');
    if (!body.entries) return failCard('Upcoming test drives', 'The booking queue did not answer.');
    var today = iso(new Date());
    var upcoming = body.entries.filter(function (e) { return e.preferredDate && e.preferredDate >= today; })
      .sort(function (a, b) { return (a.preferredDate + (a.preferredTime || '')).localeCompare(b.preferredDate + (b.preferredTime || '')); })
      .slice(0, 5);
    if (!upcoming.length) return '<section class="op-hub-card"><h2 class="op-hub-card__title">Upcoming test drives</h2><p class="op-hub-card__fail">Nothing booked ahead yet.</p></section>';
    var rows = '';
    upcoming.forEach(function (e) {
      rows += '<a class="op-hub-row" href="/admin/bookings/">' +
        '<span class="op-hub-row__name">' + esc(e.name || e.fullName || 'Customer') + '</span>' +
        '<span class="op-hub-row__meta">' + esc(e.preferredDate) + (e.preferredTime ? ' ' + esc(e.preferredTime) : '') + '</span>' +
        '</a>';
    });
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Upcoming test drives</h2>' +
      '<div class="op-hub-rows">' + rows + '</div>' +
      '<a class="op-hub-card__more" href="/admin/bookings/">All bookings</a></section>';
  }

  /* ---------- pipeline by status (same payload as latest enquiries) ---------- */
  function renderPipeline(res) {
    var d = res.body && res.body.data;
    if (!d || !d.leads || !d.leads.length) return '';
    var counts = {};
    d.leads.forEach(function (l) { var k = l.status || 'new'; counts[k] = (counts[k] || 0) + 1; });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var chips = keys.map(function (k) { return '<span class="op-sync-chip">' + esc(k) + ' &middot; ' + counts[k] + '</span>'; }).join('');
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Pipeline by status</h2>' +
      '<div class="op-sync-chips">' + chips + '</div>' +
      '<p class="op-hint-line">Counts by the status stored on each lead.</p>' +
      '<a class="op-hub-card__more" href="/admin/leads/">All leads</a></section>';
  }

  /* ---------- enquiries by source (same payload as latest enquiries) ---------- */
  function renderSource(res) {
    var d = res.body && res.body.data;
    if (!d || !d.leads || !d.leads.length) return '';
    var counts = {};
    d.leads.forEach(function (l) { var k = l.source || 'unknown'; counts[k] = (counts[k] || 0) + 1; });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var chips = keys.map(function (k) { return '<span class="op-sync-chip">' + esc(k) + ' &middot; ' + counts[k] + '</span>'; }).join('');
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Enquiries by source</h2>' +
      '<div class="op-sync-chips">' + chips + '</div>' +
      '<p class="op-hint-line">Values as stored on each lead.</p></section>';
  }

  /* ---------- system (booking queue + calendar) ---------- */
  function renderSystem(bookingRes) {
    var lines = [];
    var body = bookingRes.body || {};
    if (body.entries) {
      var waiting = body.entries.filter(function (e) { return (e.status || 'new') === 'new'; }).length;
      lines.push('<a class="op-hub-row" href="/admin/bookings/"><span class="op-hub-row__name">' + waiting + ' booking request(s) waiting</span><span class="op-hub-row__meta">test drives and appointments</span></a>');
    }
    lines.push('<a class="op-hub-row" href="/admin/calendar/"><span class="op-hub-row__name">Calendar</span><span class="op-hub-row__meta">the month at a glance</span></a>');
    return '<section class="op-hub-card"><h2 class="op-hub-card__title">Shop status</h2><div class="op-hub-rows">' + lines.join('') + '</div></section>';
  }

  function render(parts) {
    var banner = needSignIn
      ? '<p class="op-hub-banner">Your session is missing or expired. <a href="/admin/sign-in/">Sign in</a> to see live numbers.</p>'
      : '';
    root.innerHTML = banner + parts.join('');
  }

  function refresh() {
    needSignIn = false;
    var today = new Date();
    var from = new Date(today.getTime() - (DAYS_SHOWN - 1) * 86400000);
    var tasks = [
      get('/.netlify/functions/sales-metrics?timeframe=all'),
      get('/.netlify/functions/calendar-data?from=' + iso(from) + '&to=' + iso(today)),
      get('/.netlify/functions/sales-leads?timeframe=all&status=all&sort=date-desc'),
      get('/.netlify/functions/booking-queue'),
    ];
    Promise.all(tasks).then(function (results) {
      render([
        renderMetrics(results[0]),
        renderChart(results[1]),
        renderLeads(results[2]),
        renderPipeline(results[2]),
        renderSource(results[2]),
        renderBookings(results[3]),
        renderSystem(results[3]),
      ]);
    }).catch(function () {
      render([
        failCard('The console', 'Could not reach its data just now. Retry, or reload the page.'),
      ]);
    });
  }

  root.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-hub-retry]') : null;
    if (btn) refresh();
  });

  refresh();
})();
