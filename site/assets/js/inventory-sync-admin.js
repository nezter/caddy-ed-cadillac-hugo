/*
 * inventory-sync-admin.js -- the live record behind /admin/sync.
 *
 * WHAT IT READS. inventory-sync-status (inventory_read) returns the newest
 * inventory sync run plus the recent history; ?run=<id> returns one run's
 * full detail. Rows are written by scripts/inventory/index.js through
 * utils/sync-runs.js. While a run is in flight this page polls every few
 * seconds; otherwise it reloads on a slow timer.
 *
 * WHAT IT DOES. Sync now queues a request (inventory-sync-trigger,
 * inventory_write). The next live script run adopts the queued row and
 * becomes it, so the record carries the whole lineage: who asked, when it
 * started, what each phase did, and what the run changed. A sync needs the
 * feed and the working tree, so the button queues instead of pretending to
 * run one. Each history row expands into that run's details.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/inventory-sync-status';
  var TRIGGER = '/.netlify/functions/inventory-sync-trigger';
  var LIVE_MS = 4000;
  var IDLE_MS = 30000;

  var root = document.getElementById('sync-status');
  if (!root) return;

  var STEPS = [
    ['reading', 'Reading the feed'],
    ['images', 'Mirroring photos'],
    ['planning', 'Comparing'],
    ['writing', 'Writing pages'],
    ['done', 'Complete']
  ];

  var timer = null;
  var lastData = null;
  var openRuns = {};
  var detailCache = {};
  var detailLoading = {};
  var detailFailed = {};

  function token() {
    try {
      return localStorage.getItem('auth' + '_token') || localStorage.getItem('caddyed_admin_token') || '';
    } catch (err) { return ''; }
  }

  function authHeaders() {
    var h = { Accept: 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bea' + 'rer ' + t;
    return h;
  }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function ago(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
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

  function clock(iso) {
    if (!iso) return '--';
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '--';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function dur(a, b) {
    if (!a || !b) return '';
    var ms = new Date(b).getTime() - new Date(a).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    var s = Math.round(ms / 1000);
    if (s < 90) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }

  function pill(run) {
    if (run.status === 'requested') return '<span class="op-sync-pill is-queued">Queued</span>';
    if (run.status === 'running') return '<span class="op-sync-pill is-live">Running now</span>';
    if (run.status === 'failed') return '<span class="op-sync-pill is-failed">Failed</span>';
    if (run.mode === 'dry-run') return '<span class="op-sync-pill is-dry">Dry run</span>';
    return '<span class="op-sync-pill is-done">Complete</span>';
  }

  function stepper(run) {
    var phase = run.phase || 'reading';
    var running = run.status === 'running';
    var failed = run.status === 'failed';
    var current = 0;
    for (var i = 0; i < STEPS.length; i += 1) {
      if (STEPS[i][0] === phase) current = i;
    }
    if (!running && !failed) current = STEPS.length - 1;
    var out = '<div class="op-sync-steps">';
    for (var j = 0; j < STEPS.length; j += 1) {
      var cls = '';
      var word = 'next';
      if (failed) {
        if (j < current) { cls = 'is-done'; word = 'done'; }
        else if (j === current) { cls = 'is-failed'; word = 'stopped'; }
      } else if (!running) {
        cls = 'is-done'; word = 'done';
      } else if (j < current) {
        cls = 'is-done'; word = 'done';
      } else if (j === current) {
        cls = 'is-active'; word = 'now';
      }
      out += '<div class="op-sync-step ' + cls + '">' +
        '<span class="op-sync-step__label">' + esc(STEPS[j][1]) + '</span>' +
        '<span class="op-sync-step__state">' + word + '</span></div>';
    }
    return out + '</div>';
  }

  function tiles(run) {
    var data = [
      ['Found', run.feedTotal, 'vehicles the feed listed', ''],
      ['Existing', run.existingCount, 'seen before, no change', 'is-good'],
      ['Updated', run.updatedCount, 'existing, details changed', 'is-warn'],
      ['New', run.addedCount, 'never seen before', 'is-accent'],
      ['Retired', run.retiredCount, 'no longer listed', 'is-bad']
    ];
    var out = '<div class="op-sync-tiles">';
    for (var i = 0; i < data.length; i += 1) {
      out += '<div class="op-sync-tile ' + data[i][3] + '">' +
        '<span class="op-sync-tile__value">' + num(data[i][1]) + '</span>' +
        '<span class="op-sync-tile__label">' + data[i][0] + '</span>' +
        '<span class="op-sync-tile__sub">' + data[i][2] + '</span></div>';
    }
    return out + '</div>';
  }

  function progress(run) {
    if (run.status !== 'running') return '';
    if (run.processTotal > 0) {
      var pct = Math.max(0, Math.min(100, Math.round((run.processed / run.processTotal) * 100)));
      return '<div class="op-sync-bar"><div class="op-sync-bar__fill" style="width: ' + pct + '%"></div></div>' +
        '<div class="op-sync-meta"><span>' + num(run.processed) + ' of ' + num(run.processTotal) + ' files</span></div>';
    }
    return '<div class="op-sync-bar is-indeterminate"><div class="op-sync-bar__fill"></div></div>';
  }

  function chips(run) {
    var d = run.detail || {};
    var out = [];
    if (d.write) {
      out.push('Files: ' + num(d.write.create) + ' created, ' + num(d.write.update) + ' updated, ' + num(d.write.remove) + ' removed');
    }
    if (d.images) {
      out.push('Photos: ' + num(d.images.mirrored) + ' mirrored, ' + num(d.images.cached) + ' reused, ' + num(d.images.failed) + ' failed');
    }
    if (d.edits) {
      out.push(d.edits.matched !== undefined ? 'Record edits applied: ' + num(d.edits.matched) : 'Record edits: skipped');
    }
    if (d.duplicates) out.push('Duplicate listings merged: ' + num(d.duplicates));
    if (d.skipped) out.push('Skipped records: ' + num(d.skipped));
    if (!out.length) return '';
    var html = '';
    for (var i = 0; i < out.length; i += 1) html += '<span class="op-sync-chip">' + esc(out[i]) + '</span>';
    return '<div class="op-sync-chips">' + html + '</div>';
  }

  function controls() {
    return '<section class="op-sync-card op-sync-card--controls"><div class="op-sync-controls">' +
      '<button type="button" class="op-sync-btn" id="sync-now">Sync now</button>' +
      '<span class="op-sync-hint" id="sync-now-note">Queues a run. It starts when the sync runner picks it up.</span>' +
      '</div></section>';
  }

  function queuedCard(run) {
    var meta = [];
    meta.push('<span>Requested ' + esc(clock(run.requestedAt || run.startedAt)) + ' (' + esc(ago(run.requestedAt || run.startedAt)) + ')</span>');
    if (run.requestedBy) meta.push('<span>By ' + esc(run.requestedBy) + '</span>');
    meta.push('<span class="op-sync-note">Starts when the sync runner picks it up</span>');
    return '<section class="op-sync-card">' +
      '<div class="op-sync-card__head"><h2 class="op-sync-card__title">Sync requested</h2>' + pill(run) + '</div>' +
      '<div class="op-sync-meta">' + meta.join('') + '</div>' +
      '</section>';
  }

  function runCard(run, heading) {
    if (run.status === 'requested') return queuedCard(run);
    var running = run.status === 'running';
    var meta = [];
    meta.push('<span>Started ' + esc(clock(run.startedAt)) + (running ? ' (' + esc(ago(run.startedAt)) + ')' : '') + '</span>');
    if (running) {
      meta.push('<span>Last update ' + esc(ago(run.updatedAt)) + '</span>');
    } else {
      if (run.finishedAt) meta.push('<span>Took ' + esc(dur(run.startedAt, run.finishedAt)) + '</span>');
      meta.push('<span>Finished ' + esc(ago(run.finishedAt || run.updatedAt)) + '</span>');
    }
    if (run.source) meta.push('<span>Source: ' + esc(run.source) + '</span>');
    if (run.requestedBy) meta.push('<span>Requested by ' + esc(run.requestedBy) + '</span>');
    if (run.trigger && run.trigger !== 'manual') meta.push('<span>Trigger: ' + esc(run.trigger) + '</span>');
    if (run.mode === 'dry-run') meta.push('<span class="op-sync-note">Dry run: nothing was written to the site files</span>');
    return '<section class="op-sync-card">' +
      '<div class="op-sync-card__head"><h2 class="op-sync-card__title">' + esc(heading) + '</h2>' + pill(run) + '</div>' +
      stepper(run) + tiles(run) + progress(run) +
      '<div class="op-sync-meta">' + meta.join('') + '</div>' +
      chips(run) +
      (run.message ? '<p class="op-sync-message">' + esc(run.message) + '</p>' : '') +
      '</section>';
  }

  function history(runs) {
    if (!runs || !runs.length) return '';
    var rows = '';
    for (var i = 0; i < runs.length; i += 1) {
      var r = runs[i];
      var open = Boolean(openRuns[r.id]);
      rows += '<tr>' +
        '<td>' + esc(clock(r.startedAt)) + '</td>' +
        '<td>' + pill(r) + '</td>' +
        '<td class="num">' + num(r.feedTotal) + '</td>' +
        '<td class="num">' + num(r.addedCount) + '</td>' +
        '<td class="num">' + num(r.updatedCount) + '</td>' +
        '<td class="num">' + num(r.retiredCount) + '</td>' +
        '<td class="num">' + num(r.existingCount) + '</td>' +
        '<td>' + esc(r.finishedAt ? dur(r.startedAt, r.finishedAt) : '') + '</td>' +
        '<td class="op-sync-table__note">' + esc(r.message || '') + '</td>' +
        '<td><button type="button" class="op-sync-more" data-run-toggle="' + esc(r.id) + '">' + (open ? 'Hide' : 'Details') + '</button></td>' +
        '</tr>';
      if (open) {
        rows += '<tr class="op-sync-table__detail-row"><td colspan="10"><div data-detail-for="' + esc(r.id) + '">' +
          (detailCache[r.id] ? detailPanel(detailCache[r.id]) : detailPlaceholder(r.id)) +
          '</div></td></tr>';
      }
    }
    return '<section class="op-sync-card">' +
      '<div class="op-sync-card__head"><h2 class="op-sync-card__title">Recent runs</h2></div>' +
      '<div class="op-sync-scroll"><table class="op-sync-table"><thead><tr>' +
      '<th>Started</th><th>Status</th><th class="num">Found</th><th class="num">New</th>' +
      '<th class="num">Updated</th><th class="num">Retired</th><th class="num">Existing</th>' +
      '<th>Time</th><th>Result</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function detailPlaceholder(id) {
    if (detailFailed[id]) return '<p class="op-sync-hint">Could not load the details for this run.</p>';
    return '<p class="op-sync-hint">Loading...</p>';
  }

  function changeList(label, items, withFields) {
    if (!items || !items.length) return '';
    var shown = items.slice(0, 20);
    var html = '<h4>' + esc(label + ' (' + items.length + ')') + '</h4><ul>';
    for (var i = 0; i < shown.length; i += 1) {
      var it = shown[i];
      var name = it.title || it.slug || it.key || 'unknown';
      var extra = '';
      if (withFields && it.fields) extra = ' - ' + it.fields;
      else if (it.reason) extra = ' (' + it.reason + ')';
      html += '<li><b>' + esc(name) + '</b>' + esc(extra) + '</li>';
    }
    if (items.length > shown.length) html += '<li class="op-sync-hint">and ' + (items.length - shown.length) + ' more</li>';
    return html + '</ul>';
  }

  function detailPanel(run) {
    var d = run.detail || {};
    var out = [];
    var bits = [];
    if (d.runner) bits.push('Runner: ' + (d.runner.user ? d.runner.user + ' at ' + d.runner.host : d.runner.host));
    if (d.timings && d.timings.durationMs) bits.push('Took ' + Math.max(1, Math.round(d.timings.durationMs / 1000)) + 's');
    if (run.trigger) bits.push('Trigger: ' + run.trigger);
    if (bits.length) out.push('<p class="op-sync-detail__row">' + esc(bits.join(' / ')) + '</p>');
    if (d.phases && d.phases.length) {
      var chipsHtml = '';
      for (var i = 0; i < d.phases.length; i += 1) {
        chipsHtml += '<span class="op-sync-chip">' + esc((d.phases[i].phase || '') + ' at ' + clock(d.phases[i].at)) + '</span>';
      }
      out.push('<h4>Phases</h4><div class="op-sync-detail__row">' + chipsHtml + '</div>');
    }
    var ch = d.changes;
    if (ch) {
      out.push(changeList('Added', ch.added, false));
      out.push(changeList('Updated', ch.updated, true));
      out.push(changeList('Retired', ch.retired, false));
      if (ch.truncated) out.push('<p class="op-sync-hint">Lists are capped; this run changed more than shown.</p>');
    }
    if (run.message) out.push('<p class="op-sync-message">' + esc(run.message) + '</p>');
    var body = out.join('');
    if (!body) body = '<p>No detail was recorded for this run.</p>';
    return '<div class="op-sync-detail">' + body + '</div>';
  }

  function emptyState() {
    return '<section class="op-sync-card op-sync-card--empty">' +
      '<h2 class="op-sync-card__title">No sync runs recorded yet</h2>' +
      '<p>Queue one with Sync now, or run <span class="op-sync-command">npm run inventory:sync</span> where the repository lives.</p>' +
      '<p class="op-sync-hint">Runs record themselves while they have database access; without it they still sync, silently.</p>' +
      '</section>';
  }

  function signInState() {
    return '<section class="op-sync-card op-sync-card--empty">' +
      '<h2 class="op-sync-card__title">Sign in to see the sync record</h2>' +
      '<p><a href="/admin/sign-in/">Go to the sign-in page</a></p>' +
      '</section>';
  }

  function unconfiguredState(body) {
    return '<section class="op-sync-card op-sync-card--empty">' +
      '<h2 class="op-sync-card__title">The sync record is not configured</h2>' +
      '<p>' + esc((body && body.error) || 'The database is not configured here.') + '</p>' +
      '<p class="op-sync-hint">A sync still runs; it just cannot record itself until TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set.</p>' +
      '</section>';
  }

  function render(data) {
    lastData = data;
    var runs = data.runs || [];
    var current = data.current;
    var html = controls();
    var queued = null;
    for (var i = 0; i < runs.length; i += 1) {
      if (runs[i].status === 'requested') { queued = runs[i]; break; }
    }
    if (current && current.status === 'running') {
      html += runCard(current, 'Sync in progress');
    } else if (queued) {
      html += queuedCard(queued);
    } else if (current) {
      html += runCard(current, current.mode === 'dry-run' ? 'Last run: dry run' : 'Last run');
    } else {
      html += emptyState();
    }
    html += history(runs);
    root.innerHTML = html;
    // A poll re-render drops panel contents; refill whatever is still open.
    Object.keys(openRuns).forEach(function (id) {
      if (openRuns[id] && !detailCache[id] && !detailLoading[id] && !detailFailed[id]) loadDetail(id);
    });
  }

  function loadDetail(id) {
    if (detailCache[id] || detailLoading[id]) return;
    detailLoading[id] = true;
    fetch(ENDPOINT + '?run=' + encodeURIComponent(id), { headers: authHeaders(), cache: 'no-store' })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (res) {
        detailLoading[id] = false;
        if (res.status === 200 && res.body && res.body.ok && res.body.run) {
          detailCache[id] = res.body.run;
        } else {
          detailFailed[id] = true;
        }
        refreshDetail(id);
      })
      .catch(function () {
        detailLoading[id] = false;
        detailFailed[id] = true;
        refreshDetail(id);
      });
  }

  function refreshDetail(id) {
    var holder = root.querySelector('[data-detail-for="' + id + '"]');
    if (!holder) return;
    holder.innerHTML = detailCache[id] ? detailPanel(detailCache[id]) : detailPlaceholder(id);
  }

  function toggleDetail(id) {
    if (openRuns[id]) delete openRuns[id];
    else openRuns[id] = true;
    if (lastData) render(lastData);
    if (openRuns[id]) loadDetail(id);
  }

  function queueSync() {
    var btn = document.getElementById('sync-now');
    var note = document.getElementById('sync-now-note');
    if (!btn || !note) return;
    if (!window.confirm('Queue a sync run?')) return;
    btn.disabled = true;
    note.textContent = 'Queueing...';
    fetch(TRIGGER, { method: 'POST', headers: authHeaders(), cache: 'no-store' })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (res) {
        btn.disabled = false;
        if (res.status === 401) { note.textContent = 'Sign in again to queue a run.'; return; }
        if (res.status === 403) { note.textContent = 'This account cannot queue syncs.'; return; }
        if (res.status === 503) { note.textContent = (res.body && res.body.error) || 'The record database is not configured.'; return; }
        if (!res.body || !res.body.ok) { note.textContent = 'The request could not be recorded.'; return; }
        note.textContent = res.body.alreadyQueued ? 'A run is already queued.' : 'Sync queued. It starts when a runner picks it up.';
        schedule(1500);
      })
      .catch(function () {
        btn.disabled = false;
        note.textContent = 'The request could not be sent.';
      });
  }

  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(load, ms);
  }

  function load() {
    fetch(ENDPOINT, { headers: authHeaders(), cache: 'no-store' })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (res) {
        if (res.status === 401) { root.innerHTML = signInState(); schedule(IDLE_MS); return; }
        if (res.status === 503) { root.innerHTML = unconfiguredState(res.body); schedule(IDLE_MS); return; }
        if (!res.body || !res.body.ok) throw new Error('unexpected payload');
        render(res.body);
        var running = res.body.current && res.body.current.status === 'running';
        var queued = false;
        var rs = res.body.runs || [];
        for (var qi = 0; qi < rs.length; qi += 1) {
          if (rs[qi].status === 'requested') { queued = true; break; }
        }
        schedule(running ? LIVE_MS : (queued ? 10000 : IDLE_MS));
      })
      .catch(function () {
        if (!root.querySelector('.op-sync-card')) {
          root.innerHTML = '<section class="op-sync-card op-sync-card--empty">' +
            '<h2 class="op-sync-card__title">The sync record could not be read just now</h2>' +
            '<p>This page keeps trying; it will show the record again as soon as the endpoint answers.</p>' +
            '</section>';
        }
        schedule(IDLE_MS * 2);
      });
  }

  // One listener for everything the page renders, because render() replaces
  // the markup on every poll; per-element listeners would be re-bound by it.
  root.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== root) {
      if (el.id === 'sync-now' || (el.getAttribute && el.getAttribute('data-run-toggle'))) break;
      el = el.parentNode;
    }
    if (!el || el === root) return;
    if (el.id === 'sync-now') queueSync();
    else toggleDetail(el.getAttribute('data-run-toggle'));
  });

  load();
})();
