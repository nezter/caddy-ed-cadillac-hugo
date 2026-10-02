/**
 * admin-audit.js -- the /admin/audit reader.
 *
 * An audit trail nobody can read satisfies a checkbox and answers no question.
 * This is the reading half.
 *
 * IT SHOWS THE TRAIL'S LIMITS, NOT JUST ITS CONTENTS
 * --------------------------------------------------
 * Two facts belong on the screen, not in a comment in a schema:
 *
 *   - an erasure row does not name the customer, and will not
 *   - an action that could not be recorded was never attempted
 *
 * Both read as "the row is missing" to somebody who does not know that, and
 * both are much better read as a sentence than inferred from an absence.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/audit-log-view';

  var el = {
    list: document.getElementById('audit-list'),
    status: document.getElementById('audit-status'),
    progress: document.getElementById('audit-progress'),
    action: document.getElementById('audit-action'),
    entity: document.getElementById('audit-entity'),
    apply: document.getElementById('audit-apply'),
    clear: document.getElementById('audit-clear'),
  };
  if (!el.list) return;

  var actionsLoaded = false;

  function token() {
    try {
      return window.localStorage.getItem('caddyed_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function say(message, kind) {
    if (!el.status) return;
    el.status.textContent = message;
    el.status.className = 'settings-status settings-status--' + (kind || 'info');
    el.status.hidden = !message;
  }

  /** Human wording, because the column values are vocabulary, not English. */
  var VERB = {
    'customer.erase': 'Erased a customer record',
    'customer.export': 'Exported a customer record',
    'lead.merge': 'Merged leads',
    'lead.status_change': 'Changed a lead status',
    'settings.update': 'Changed site settings',
    'appointment.complete': 'Completed an appointment',
    'auth.login': 'Signed in',
    'seed.run': 'Ran a seed script',
    'staff.update': 'Changed a staff record',
  };

  function describe(entry) {
    return VERB[entry.action] || entry.action;
  }

  function when(iso) {
    if (!iso) return '';
    return String(iso).replace('T', ' ').slice(0, 19);
  }

  function row(entry) {
    var detail = entry.detail;
    var detailHtml = '';

    if (detail && typeof detail === 'object') {
      // Rendered as key/value pairs rather than dumped as JSON: a reader wants
      // "5 rows" and "done", not a wall of braces.
      var pairs = Object.keys(detail).map(function (k) {
        var v = detail[k];
        var text = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (text === '' || text === 'undefined') return '';
        return '<li><strong>' + esc(k) + '</strong>: ' + esc(text) + '</li>';
      }).filter(Boolean);
      if (pairs.length) detailHtml = '<ul class="settings-note">' + pairs.join('') + '</ul>';
    } else if (detail) {
      detailHtml = '<p class="settings-note">' + esc(detail) + '</p>';
    }

    var reason = entry.reason
      ? '<p class="settings-note">Reason: ' + esc(entry.reason) + '</p>'
      : '';

    return (
      '<fieldset class="settings-group">' +
        '<legend>' + esc(describe(entry)) + '</legend>' +
        '<p class="settings-note">' +
          esc(when(entry.at)) + ' &middot; by ' + esc(entry.by) +
          (entry.actor_role ? ' (' + esc(entry.actor_role) + ')' : '') +
        '</p>' +
        '<p class="settings-note">' +
          esc(entry.entity_type) + (entry.entity_id ? ' <code>' + esc(entry.entity_id) + '</code>' : '') +
          (entry.rows_affected ? ' &middot; ' + esc(String(entry.rows_affected)) + ' row(s)' : '') +
        '</p>' +
        reason + detailHtml +
      '</fieldset>'
    );
  }

  function render(data) {
    var html = '';

    if (data.summary && data.summary.length) {
      html +=
        '<p class="settings-note">' +
        data.summary.map(function (s) { return esc(s.action) + ': ' + esc(String(s.n)); }).join(' &middot; ') +
        '</p>';
    }

    if (!data.entries.length) {
      html +=
        '<div class="settings-group"><p>Nothing recorded for this filter.</p>' +
        '<p class="settings-note">' + esc(data.note) + '</p></div>';
    } else {
      html += data.entries.map(row).join('');
    }

    el.list.innerHTML = html;
  }

  function query() {
    var q = [];
    if (el.action && el.action.value) q.push('action=' + encodeURIComponent(el.action.value));
    if (el.entity && el.entity.value.trim()) q.push('entity_id=' + encodeURIComponent(el.entity.value.trim()));
    return q.length ? '?' + q.join('&') : '';
  }

  async function load() {
    el.progress.hidden = false;
    try {
      var res = await fetch(ENDPOINT + query(), {
        headers: { Authorization: 'Bearer ' + token() },
      });
      var data = await res.json();

      if (res.status === 401 || res.status === 403) {
        say('Sign in with an account that can read analytics.', 'error');
        return;
      }
      if (!res.ok) {
        // The migration case is called out by name, because "no history" and
        // "no history because the table was never created" are opposites.
        say(
          (data.error || res.status) + '. ' + (data.detail || 'Nothing was changed.'),
          'error'
        );
        return;
      }

      if (!actionsLoaded && el.action && data.actions) {
        el.action.innerHTML = '<option value="">Everything</option>' +
          data.actions.map(function (a) {
            return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
          }).join('');
        actionsLoaded = true;
      }

      render(data);
    } catch (err) {
      say('Could not reach the server. Nothing was changed.', 'error');
    } finally {
      el.progress.hidden = true;
    }
  }

  if (el.apply) el.apply.addEventListener('click', load);
  if (el.clear) {
    el.clear.addEventListener('click', function () {
      if (el.action) el.action.value = '';
      if (el.entity) el.entity.value = '';
      load();
    });
  }
  if (el.entity) {
    el.entity.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); load(); }
    });
  }

  load();
})();