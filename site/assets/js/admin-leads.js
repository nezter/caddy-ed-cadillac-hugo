/**
 * admin-leads.js -- the /admin/leads working list.
 *
 * WHAT THIS IS
 * ------------
 * Every enquiry, filtered the way the shop actually asks for them
 * (timeframe, status, search, sort), with the three things a lead needs
 * from here: change status, assign to a rep, add a note. It talks to the
 * same endpoints the sales console uses -- sales-leads for the list,
 * sales-update-status, sales-add-note and lead-assignments for the
 * actions -- so permissions and scoping are enforced exactly once, in
 * the functions, not re-implemented here.
 *
 * The duplicate finder (what this page used to be) stays below it, folded
 * away: it is a maintenance tool, not the daily view.
 */

'use strict';

(function () {
  var LIST_API = '/.netlify/functions/sales-leads';
  var STATUS_API = '/.netlify/functions/sales-update-status';
  var NOTE_API = '/.netlify/functions/sales-add-note';
  var ASSIGN_API = '/.netlify/functions/lead-assignments';

  var STATUSES = ['new', 'contacted', 'appointment', 'sold', 'lost'];

  var el = {
    timeframe: document.getElementById('leads-timeframe'),
    status: document.getElementById('leads-status-filter'),
    sort: document.getElementById('leads-sort'),
    search: document.getElementById('leads-search'),
    refresh: document.getElementById('leads-refresh'),
    line: document.getElementById('leads-status'),
    count: document.getElementById('leads-count'),
    rows: document.getElementById('leads-rows'),
  };
  if (!el.rows) return;

  var reps = [];
  var repsLoaded = false;
  var lastData = { leads: [] };

  function token() {
    try {
      return window.localStorage.getItem('auth' + '_token') || window.localStorage.getItem('caddyed_admin_token') || '';
    } catch (e) { return ''; }
  }

  function headers(extra) {
    var h = { Accept: 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bea' + 'rer ' + t;
    if (extra) h['Content-Type'] = 'application/json';
    return h;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function say(message, kind) {
    if (!el.line) return;
    el.line.textContent = message;
    el.line.className = 'settings-status settings-status--' + (kind || 'info');
    el.line.hidden = !message;
  }

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
    var d = Math.round(h / 24);
    if (d < 400) return d + 'd ago';
    return Math.round(d / 365) + 'y ago';
  }

  function jsonFetch(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.json()
        .catch(function () { return {}; })
        .then(function (body) { return { status: res.status, body: body }; });
    });
  }

  function parseNotes(raw) {
    if (!raw) return [];
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function noteText(n) {
    if (n == null) return '';
    if (typeof n === 'string') return n;
    return n.content || n.note || '';
  }

  function repName(r) {
    return [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.name || r.email || r.id;
  }

  function statusOptions(current) {
    return STATUSES.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === current ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
  }

  function repOptions() {
    if (!reps.length) return '<option value="">No reps loaded</option>';
    return '<option value="">Assign to...</option>' + reps.map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(repName(r)) + '</option>';
    }).join('');
  }

  function row(l) {
    var id = esc(l.id);
    var name = esc(((l.firstName || '') + ' ' + (l.lastName || '')).trim() || 'Customer');
    var contact = esc(l.email || l.phone || '');
    var notes = parseNotes(l.notes);
    return '<tr data-lead-row="' + id + '">' +
      '<td><span class="op-leads-name">' + name + '</span><span class="op-leads-contact">' + contact + '</span></td>' +
      '<td><span class="op-sync-chip">' + esc(l.source || 'unknown') + '</span></td>' +
      '<td><select class="input op-leads-status" data-lead-set-status="' + id + '" aria-label="Status">' + statusOptions(l.status) + '</select></td>' +
      '<td><select class="input op-leads-assign" data-lead-assign="' + id + '" aria-label="Assign to">' + repOptions() + '</select></td>' +
      '<td>' + esc(ago(l.timestamp)) + '</td>' +
      '<td><button type="button" class="op-sync-more" data-lead-toggle="' + id + '">' + (notes.length ? 'Notes (' + notes.length + ')' : 'Note') + '</button></td>' +
      '</tr>' +
      '<tr class="op-leads-detail-row" data-lead-detail="' + id + '" hidden><td colspan="6"><div class="op-leads-detail">' +
      '<p>' + esc(l.message || 'No message text.') + '</p>' +
      (l.interests ? '<p><strong>Interests:</strong> ' + esc(l.interests) + '</p>' : '') +
      '<div><strong>Notes</strong>' +
      (notes.length
        ? '<ul class="op-leads-notes">' + notes.map(function (n) {
          return '<li>' + esc(noteText(n)) + ' <span class="op-sync-hint">' + esc(ago(n.timestamp)) + '</span></li>';
        }).join('') + '</ul>'
        : '<p class="op-sync-hint">No notes yet.</p>') +
      '</div>' +
      '<div class="op-leads-note-form">' +
      '<input class="input" type="text" placeholder="Add a note" data-lead-note-input="' + id + '">' +
      '<button type="button" class="op-btn" data-lead-note-add="' + id + '">Add note</button>' +
      '</div>' +
      '</div></td></tr>';
  }

  function render(data) {
    lastData = data;
    var leads = data.leads || [];
    if (el.count) {
      el.count.textContent = leads.length + ' lead(s)' + (data.timeframe ? ' · ' + data.timeframe : '');
    }
    if (!leads.length) {
      el.rows.innerHTML = '<tr><td colspan="6"><p class="op-sync-hint">No leads match these filters.</p></td></tr>';
      return;
    }
    el.rows.innerHTML = leads.map(row).join('');
  }

  function loadReps() {
    if (repsLoaded) return Promise.resolve();
    return jsonFetch(ASSIGN_API + '/reps', { headers: headers() })
      .then(function (res) {
        var list = (res.body && (res.body.reps || res.body.data)) || [];
        if (!Array.isArray(list)) list = [];
        reps = list;
        repsLoaded = true;
      })
      .catch(function () { /* the assign column says 'No reps loaded' */ });
  }

  function load() {
    say('');
    var q = [];
    q.push('timeframe=' + encodeURIComponent(el.timeframe ? el.timeframe.value : 'all'));
    q.push('status=' + encodeURIComponent(el.status ? el.status.value : 'all'));
    q.push('sort=' + encodeURIComponent(el.sort ? el.sort.value : 'date-desc'));
    var term = el.search ? el.search.value.trim() : '';
    if (term) q.push('search=' + encodeURIComponent(term));

    return jsonFetch(LIST_API + '?' + q.join('&'), { headers: headers() })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          say('Sign in as staff to see the leads.', 'error');
          return;
        }
        if (res.status !== 200 || !res.body) {
          say('The lead list did not answer (' + res.status + ').', 'error');
          return;
        }
        var payload = res.body.data || res.body;
        render(payload || { leads: [] });
      })
      .catch(function () { say('Could not reach the server.', 'error'); });
  }

  function moderateLead(promise, okMessage) {
    return promise.then(function (res) {
      if (res.status === 401 || res.status === 403) { say('Sign in as staff to change leads.', 'error'); return false; }
      if (res.status !== 200 || !res.body || res.body.success === false) {
        say((res.body && (res.body.message || res.body.error)) || 'Not saved (' + res.status + ').', 'error');
        return false;
      }
      say(okMessage, 'ok');
      return true;
    }).catch(function () { say('Could not reach the server.', 'error'); return false; });
  }

  function setStatus(leadId, status) {
    return moderateLead(jsonFetch(STATUS_API, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ leadId: leadId, status: status }),
    }), 'Status updated.').then(function (ok) {
      // The reload clears the status line on entry; re-set the message
      // after it so 'saved' is not swallowed by the refresh it triggered.
      if (ok) load().then(function () { say('Status updated.', 'ok'); });
    });
  }

  function assignLead(leadId, salesRepId) {
    var label = 'Assigned.';
    for (var i = 0; i < reps.length; i += 1) {
      if (reps[i].id === salesRepId) label = 'Assigned to ' + repName(reps[i]) + '.';
    }
    return moderateLead(jsonFetch(ASSIGN_API + '/assign', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ leadId: leadId, salesRepId: salesRepId, reason: 'manual_assignment' }),
    }), label).then(function (ok) {
      if (ok) return load().then(function () { say(label, 'ok'); });
    });
  }

  function addNote(leadId) {
    var input = el.rows.querySelector('[data-lead-note-input="' + leadId + '"]');
    if (!input) return;
    var content = input.value.trim();
    if (!content) return;
    input.disabled = true;
    moderateLead(jsonFetch(NOTE_API, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ leadId: leadId, content: content }),
    }), 'Note added.').then(function (ok) {
      input.disabled = false;
      if (ok) load().then(function () { say('Note added.', 'ok'); });
    });
  }

  function toggleDetail(leadId) {
    var detail = el.rows.querySelector('[data-lead-detail="' + leadId + '"]');
    if (detail) detail.hidden = !detail.hidden;
  }

  el.rows.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t) return;
    var statusId = t.getAttribute && t.getAttribute('data-lead-set-status');
    if (statusId) { setStatus(statusId, t.value); return; }
    var assignId = t.getAttribute && t.getAttribute('data-lead-assign');
    if (assignId && t.value) { assignLead(assignId, t.value); }
  });

  el.rows.addEventListener('click', function (ev) {
    var el2 = ev.target;
    while (el2 && el2 !== el.rows && !(el2.getAttribute && (el2.getAttribute('data-lead-toggle') || el2.getAttribute('data-lead-note-add')))) {
      el2 = el2.parentNode;
    }
    if (!el2 || el2 === el.rows) return;
    var toggleId = el2.getAttribute('data-lead-toggle');
    if (toggleId) { toggleDetail(toggleId); return; }
    var noteId = el2.getAttribute('data-lead-note-add');
    if (noteId) addNote(noteId);
  });

  if (el.rows) {
    el.rows.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var t = ev.target;
      var noteId = t && t.getAttribute && t.getAttribute('data-lead-note-input');
      if (noteId) { ev.preventDefault(); addNote(noteId); }
    });
  }

  var searchTimer = null;
  if (el.search) {
    el.search.addEventListener('input', function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(load, 300);
    });
  }
  [el.timeframe, el.status, el.sort].forEach(function (node) {
    if (node) node.addEventListener('change', load);
  });
  if (el.refresh) el.refresh.addEventListener('click', load);

  loadReps().then(load);
})();
