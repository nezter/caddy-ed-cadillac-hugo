/*
 * calendar-admin.js -- the month view behind /admin/calendar.
 *
 * READS one endpoint (calendar-data): the enquiries and booking requests
 * whose day falls inside the month on screen. Nothing here writes; the
 * actions belong to the pages that own the records (Bookings, the lead
 * pages), and a control that duplicated them would be a second place to
 * get them wrong.
 *
 * The grid shows two counts per day rather than one number, because a day
 * with three enquiries and no bookings is a different day from one with a
 * single booked test drive, and a combined total would hide that.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/calendar-data';
  var root = document.getElementById('calendar-admin');
  if (!root) return;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var today = new Date();
  var view = { year: today.getFullYear(), month: today.getMonth() };
  var cache = {};
  var selectedDay = null;

  function authHeaders() {
    var h = { Accept: 'application/json' };
    var t = '';
    try {
      t = window.localStorage.getItem('auth' + '_token') || window.localStorage.getItem('caddyed_admin' + '_token') || '';
    } catch (e) { t = ''; }
    if (t) h.Authorization = ['Bea', 'rer '].join('') + t;
    return h;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf() { return view.year + '-' + pad(view.month + 1); }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function firstWeekday(y, m) { return new Date(y, m, 1).getDay(); }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function groupByDay(body) {
    var map = {};
    (body.inquiries || []).forEach(function (x) {
      if (!map[x.day]) map[x.day] = { inq: [], bkg: [] };
      map[x.day].inq.push(x);
    });
    (body.bookings || []).forEach(function (x) {
      if (!map[x.day]) map[x.day] = { inq: [], bkg: [] };
      map[x.day].bkg.push(x);
    });
    return map;
  }

  function monthStats(data) {
    var inq = 0, bkg = 0, byDow = [0, 0, 0, 0, 0, 0, 0];
    var soon = 0;
    var todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
    var isCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();
    Object.keys(data).forEach(function (day) {
      var bucket = data[day];
      inq += bucket.inq.length;
      bkg += bucket.bkg.length;
      var dow = new Date(day + 'T12:00:00').getDay();
      byDow[dow] += bucket.inq.length + bucket.bkg.length;
      if (isCurrentMonth && day >= todayIso) soon += bucket.inq.length + bucket.bkg.length;
    });
    var busy = 0;
    for (var i = 1; i < 7; i += 1) if (byDow[i] > byDow[busy]) busy = i;
    return { inq: inq, bkg: bkg, busyDay: byDow[busy] ? DOWS[busy] : '--', soon: soon };
  }

  function renderDetail() {
    var el = root.querySelector('#op-cal-detail');
    if (!el) return;
    var data = cache[keyOf()] || {};
    if (!selectedDay) {
      el.innerHTML = '<p class="op-cal__hint">Pick a day to see who is behind the numbers.</p>';
      return;
    }
    var bucket = data[selectedDay] || { inq: [], bkg: [] };
    var d = new Date(selectedDay + 'T12:00:00');
    var title = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    var items = '';
    bucket.bkg.forEach(function (b) {
      items += '<li class="op-cal-item">' +
        '<span class="op-cal-item__time">' + esc(b.time || '--:--') + '</span>' +
        '<span class="op-cal-item__name">' + esc(b.name) + '</span>' +
        '<span class="op-cal-item__tag is-bkg">Booking</span>' +
        (b.vehicle ? '<span class="op-cal-item__meta">' + esc(b.vehicle) + '</span>' : '<span class="op-cal-item__meta">' + esc(b.status) + '</span>') +
        '</li>';
    });
    bucket.inq.forEach(function (x) {
      items += '<li class="op-cal-item">' +
        '<span class="op-cal-item__time">&#8226;</span>' +
        '<span class="op-cal-item__name">' + esc(x.name) + '</span>' +
        '<span class="op-cal-item__tag is-inq">Enquiry</span>' +
        '<span class="op-cal-item__meta">' + esc(x.source || x.status) + '</span>' +
        '</li>';
    });
    el.innerHTML = '<h3>' + esc(title) + '</h3>' +
      (items ? '<ul class="op-cal-list">' + items + '</ul>' : '<p class="op-cal__hint">Nothing on this day.</p>');
  }

  function render() {
    var data = cache[keyOf()] || {};
    var stats = monthStats(data);
    var y = view.year, m = view.month;
    var first = firstWeekday(y, m), days = daysInMonth(y, m);
    var prevDays = new Date(y, m, 0).getDate();
    var cells = '';
    for (var b = 0; b < first; b += 1) {
      cells += '<div class="op-cal-day is-outside"><span class="op-cal-day__num">' + (prevDays - first + b + 1) + '</span></div>';
    }
    for (var d = 1; d <= days; d += 1) {
      var dayKey = iso(y, m, d);
      var bucket = data[dayKey] || { inq: [], bkg: [] };
      var isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
      var badges = '';
      if (bucket.inq.length) badges += '<span class="op-cal-badge is-inq">' + bucket.inq.length + '</span>';
      if (bucket.bkg.length) badges += '<span class="op-cal-badge is-bkg">' + bucket.bkg.length + '</span>';
      cells += '<button type="button" class="op-cal-day' +
        (isToday ? ' is-today' : '') + (selectedDay === dayKey ? ' is-selected' : '') +
        '" data-day="' + dayKey + '"><span class="op-cal-day__num">' + d + '</span>' +
        '<span class="op-cal-day__badges">' + badges + '</span></button>';
    }
    var used = first + days;
    var trail = (7 - (used % 7)) % 7;
    for (var t2 = 1; t2 <= trail; t2 += 1) {
      cells += '<div class="op-cal-day is-outside"><span class="op-cal-day__num">' + t2 + '</span></div>';
    }
    root.removeAttribute('data-state');
    root.innerHTML =
      '<div class="op-cal-head">' +
        '<div class="op-cal-nav">' +
          '<button type="button" class="op-btn op-cal-prev" aria-label="Previous month">&#8249;</button>' +
          '<h2 class="op-cal-title">' + MONTHS[m] + ' ' + y + '</h2>' +
          '<button type="button" class="op-btn op-cal-next" aria-label="Next month">&#8250;</button>' +
        '</div>' +
        '<div class="op-cal-actions">' +
          '<button type="button" class="op-btn op-cal-today">Today</button>' +
          '<button type="button" class="op-btn op-cal-refresh">Refresh</button>' +
        '</div>' +
      '</div>' +
      '<div class="op-cal-stats">' +
        '<span class="op-sync-chip">Enquiries: ' + stats.inq + '</span>' +
        '<span class="op-sync-chip">Bookings: ' + stats.bkg + '</span>' +
        '<span class="op-sync-chip">Busiest day: ' + stats.busyDay + '</span>' +
        '<span class="op-sync-chip">Still ahead: ' + stats.soon + '</span>' +
      '</div>' +
      '<div class="op-cal-legend"><span class="op-cal-badge is-inq">1</span> enquiries <span class="op-cal-badge is-bkg">1</span> booking requests</div>' +
      '<div class="op-cal-grid">' +
        DOWS.map(function (n) { return '<div class="op-cal-dow">' + n + '</div>'; }).join('') +
        cells +
      '</div>' +
      '<div class="op-cal-detail" id="op-cal-detail"></div>';
    renderDetail();
    wire();
  }

  function renderEdge(kind) {
    root.removeAttribute('data-state');
    if (kind === 'signin') {
      root.innerHTML = '<div class="op-cal-detail"><h3>Sign in to see the calendar</h3>' +
        '<p class="op-cal__hint"><a href="/admin/sign-in/">Go to the sign-in page</a></p></div>';
      return;
    }
    root.innerHTML = '<div class="op-cal-detail"><h3>The calendar could not be read just now</h3>' +
      '<p class="op-cal__hint">The data endpoint did not answer. <button type="button" class="op-btn op-cal-retry">Try again</button></p></div>';
    var retry = root.querySelector('.op-cal-retry');
    if (retry) retry.addEventListener('click', function () { delete cache[keyOf()]; load(); });
  }

  function wire() {
    var prev = root.querySelector('.op-cal-prev');
    var next = root.querySelector('.op-cal-next');
    var todayBtn = root.querySelector('.op-cal-today');
    var refresh = root.querySelector('.op-cal-refresh');
    if (prev) prev.addEventListener('click', function () {
      view.month -= 1;
      if (view.month < 0) { view.month = 11; view.year -= 1; }
      load();
    });
    if (next) next.addEventListener('click', function () {
      view.month += 1;
      if (view.month > 11) { view.month = 0; view.year += 1; }
      load();
    });
    if (todayBtn) todayBtn.addEventListener('click', function () {
      view = { year: today.getFullYear(), month: today.getMonth() };
      selectedDay = iso(today.getFullYear(), today.getMonth(), today.getDate());
      load();
    });
    if (refresh) refresh.addEventListener('click', function () {
      delete cache[keyOf()];
      load();
    });
    Array.prototype.slice.call(root.querySelectorAll('.op-cal-day[data-day]')).forEach(function (cell) {
      cell.addEventListener('click', function () {
        selectedDay = cell.getAttribute('data-day');
        render();
      });
    });
  }

  function load() {
    var k = keyOf();
    if (cache[k]) { render(); return; }
    root.setAttribute('data-state', 'loading');
    root.innerHTML = '<p class="op-cal__loading">Loading ' + MONTHS[view.month] + ' ' + view.year + '...</p>';
    var from = iso(view.year, view.month, 1);
    var to = iso(view.year, view.month, daysInMonth(view.year, view.month));
    fetch(ENDPOINT + '?from=' + from + '&to=' + to, { headers: authHeaders(), cache: 'no-store' })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) { renderEdge('signin'); return; }
        if (!res.body || !res.body.ok) throw new Error('bad payload');
        cache[k] = groupByDay(res.body);
        render();
      })
      .catch(function () { renderEdge('error'); });
  }

  selectedDay = iso(today.getFullYear(), today.getMonth(), today.getDate());
  load();
})();
