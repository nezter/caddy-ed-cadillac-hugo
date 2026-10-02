/**
 * admin-gdpr.js -- /admin/gdpr. Export and erasure.
 *
 * THE ONE RULE THIS PAGE ENFORCES VISUALLY
 * -----------------------------------------
 * Pressing "Erase" must not erase.
 *
 * A button that says Erase and does erase is one mis-click from an
 * irreversible loss of a person's data, and the person pressing it is
 * handling a request they are nervous about. So the first press produces a
 * PLAN -- every table, every row count -- and the destructive call is a second,
 * differently-worded button that requires typing a reason.
 *
 * A confirm dialog would not do this. A dialog is dismissed by muscle memory,
 * and its contents cannot be read at a glance. A plan can.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/gdpr';

  var el = {
    form: document.getElementById('gdpr-form'),
    status: document.getElementById('gdpr-status'),
    progress: document.getElementById('gdpr-progress'),
    result: document.getElementById('gdpr-result'),
    email: document.getElementById('gdpr-email'),
    id: document.getElementById('gdpr-id'),
    look: document.getElementById('gdpr-look'),
  };
  if (!el.form) return;

  var subject = null;

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

  function busy(on) {
    if (el.progress) el.progress.hidden = !on;
  }

  function headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token(),
    };
  }

  /** Flatten one row into readable label/value pairs. */
  function pairs(obj, skip) {
    return Object.keys(obj)
      .filter(function (k) { return !(skip || []).includes(k); })
      .filter(function (k) {
        var v = obj[k];
        return v !== null && v !== undefined && v !== '' &&
          typeof v !== 'object';
      })
      .map(function (k) {
        return '<li><strong>' + esc(k.replace(/_/g, ' ')) + '</strong>: ' +
          esc(String(obj[k])) + '</li>';
      })
      .join('');
  }

  function renderExport(data) {
    var s = data.subject;
    var consent = s.consent || {};

    var html =
      '<fieldset class="settings-group">' +
        '<legend>' + esc((s.first_name || '') + ' ' + (s.last_name || '')) + '</legend>' +
        '<p class="settings-note">' + esc(s.email || '') +
          (s.phone ? ' · ' + esc(s.phone) : '') + '</p>' +
        '<p class="settings-note">' + esc(s.address || 'No address on file') + '</p>' +
        '<ul class="settings-note">' + pairs({
          'Customer id': s.id,
          'Created': s.created_at,
          'Email consent': consent.email,
          'SMS consent': consent.sms,
          'Phone consent': consent.phone,
          'GDPR consent date': consent.gdpr_consent_date,
          'Consent withdrawn': consent.withdrawn_at,
          'Withdrawal reason': consent.withdrawn_reason,
        }) + '</ul>' +
        '<div class="settings-actions" style="border:0">' +
          '<button type="button" class="btn btn-primary" id="gdpr-send">Copy for sending to them</button>' +
        '</div>' +
      '</fieldset>';

    // Related records, per table. The counts are what a subject actually wants
    // to know: how many conversations, how many appointments.
    var related = data.related || {};
    var tables = Object.keys(related);
    if (tables.length) {
      html += '<fieldset class="settings-group"><legend>Also held about them</legend>';
      tables.forEach(function (t) {
        html += '<p class="settings-note"><strong>' + esc(t.replace(/_/g, ' ')) +
          '</strong>: ' + related[t].length + ' record(s)</p>';
      });
      html += '</fieldset>';
    } else {
      html += '<p class="settings-note">No other records reference this customer.</p>';
    }

    if (data.audit_trail && data.audit_trail.length) {
      html +=
        '<fieldset class="settings-group"><legend>History of access and changes</legend><ul>' +
        data.audit_trail.map(function (a) {
          return '<li class="settings-note">' + esc(String(a.at).slice(0, 19)) + ' — ' +
            esc(a.action) + ' by ' + esc(a.by) +
            (a.reason ? ' (' + esc(a.reason) + ')' : '') + '</li>';
        }).join('') + '</ul></fieldset>';
    }

    html +=
      '<fieldset class="settings-group" style="border-color:#c88a00">' +
        '<legend>If they have asked to be deleted</legend>' +
        '<p>Pressing the button below does <strong>nothing</strong>. It shows you ' +
        'exactly what would be removed, table by table.</p>' +
        '<div class="settings-actions" style="border:0">' +
          '<button type="button" class="btn btn-secondary" id="gdpr-plan">Show me what would be erased</button>' +
        '</div>' +
      '</fieldset>';

    el.result.innerHTML = html;

    var send = document.getElementById('gdpr-send');
    if (send) send.addEventListener('click', function () { copyOut(data, s); });

    var plan = document.getElementById('gdpr-plan');
    if (plan) plan.addEventListener('click', showPlan);
  }

  function copyOut(data, s) {
    var lines = [
      'What we hold about you',
      '======================',
      '',
      'Name: ' + ((s.first_name || '') + ' ' + (s.last_name || '')).trim(),
      'Email: ' + (s.email || ''),
      'Phone: ' + (s.phone || ''),
      'Address: ' + (s.address || 'not held'),
      'Customer reference: ' + s.id,
      'First recorded: ' + (s.created_at || ''),
      '',
      'Marketing contact permission:',
      '  Email: ' + (s.consent.email || 'not recorded'),
      '  SMS:   ' + (s.consent.sms || 'not recorded'),
      '  Phone: ' + (s.consent.phone || 'not recorded'),
      '',
      'Other records we hold:',
    ];
    var related = data.related || {};
    Object.keys(related).forEach(function (t) {
      lines.push('  ' + t.replace(/_/g, ' ') + ': ' + related[t].length);
    });
    lines.push('');
    lines.push('You can ask us to delete any of this. Ask, and we will.');
    lines.push('Generated ' + data.exported_at);

    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        say('Copied. Paste it into an email or letter to them.', 'ok');
      }, function () {
        showFallback(text);
      });
    } else {
      showFallback(text);
    }
  }

  function showFallback(text) {
    el.result.insertAdjacentHTML('beforeend',
      '<fieldset class="settings-group"><legend>Copy this to them</legend>' +
      '<textarea class="input" rows="14" readonly style="width:100%">' +
      esc(text) + '</textarea></fieldset>');
  }

  /** The plan. Read before anything irreversible is offered. */
  function showPlan() {
    busy(true);
    say('Working out what would be erased…', 'info');
    fetch(ENDPOINT + '?id=' + encodeURIComponent(subject.id), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() },
    })
      .then(function (r) { return r.json().then(function (b) { return { s: r.statusCode, b: b }; }); })
      .then(function (res) {
        if (res.s !== 200) {
          say('Could not build the plan: ' + (res.b.detail || res.b.error), 'error');
          return;
        }
        renderPlan(res.b);
      })
      .catch(function () { say('Could not reach the server. Nothing was changed.', 'error'); })
      .finally(function () { busy(false); });
  }

  function renderPlan(plan) {
    var rows = plan.plan.map(function (p) {
      if (p.action === 'unavailable') {
        return '<li class="settings-note">' + esc(p.table) + ' — <strong>could not be read: ' +
          esc(p.error) + '</strong></li>';
      }
      return '<li class="settings-note"><strong>' + esc(p.table) + '</strong>: ' +
        p.rows + ' row(s), ' +
        (p.action === 'delete' ? 'deleted' : 'identifiers emptied') +
        (p.note ? '<br>' + esc(p.note) : '') + '</li>';
    }).join('');

    el.result.insertAdjacentHTML('beforeend',
      '<fieldset class="settings-group" style="border-color:#c88a00">' +
        '<legend>Nothing has been erased yet</legend>' +
        '<p><strong>' + plan.total_rows + ' row(s)</strong> would be affected:</p>' +
        '<ul>' + rows + '</ul>' +
        '<p class="settings-note">The audit record is kept. It holds no name, email or ' +
          'phone — only the count, who did it, why, and when.</p>' +
        '<div class="settings-field">' +
          '<label for="gdpr-reason">Reason (recorded permanently, required)</label>' +
          '<input id="gdpr-reason" class="input" type="text" placeholder="e.g. written erasure request, 2026-10-01">' +
        '</div>' +
        '<div class="settings-actions" style="border:0">' +
          '<button type="button" class="btn btn-primary" id="gdpr-go">Erase permanently</button>' +
          '<button type="button" class="btn btn-secondary" id="gdpr-stop">Cancel</button>' +
        '</div>' +
      '</fieldset>');

    var go = document.getElementById('gdpr-go');
    var stop = document.getElementById('gdpr-stop');
    if (stop) stop.addEventListener('click', function () { go.closest('fieldset').remove(); });
    if (go) go.addEventListener('click', function () { performErase(go); });
  }

  function performErase(btn) {
    var reason = (document.getElementById('gdpr-reason').value || '').trim();
    if (!reason) {
      say('A reason is required. It is recorded and cannot be left blank.', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Erasing…';
    busy(true);
    say('Erasing. This cannot be undone.', 'info');

    fetch(ENDPOINT + '?id=' + encodeURIComponent(subject.id) +
      '&confirm=1&reason=' + encodeURIComponent(reason), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() },
    })
      .then(function (r) { return r.json().then(function (b) { return { s: r.statusCode, b: b }; }); })
      .then(function (res) {
        if (res.s !== 200) {
          say('Not erased: ' + (res.b.detail || res.b.error), 'error');
          btn.disabled = false;
          btn.textContent = 'Erase permanently';
          return;
        }
        var failed = Object.keys(res.b.removed || {}).filter(function (k) {
          return String(res.b.removed[k]).indexOf('FAILED') === 0;
        });
        if (failed.length) {
          say(
            'Partly erased. These tables did not clear: ' + failed.join(', ') +
            '. Check the audit page -- the attempt is recorded.',
            'error'
          );
        } else {
          say('Erased. The audit page records that it happened, and who did it.', 'ok');
        }
        subject = null;
        el.result.innerHTML = '';
      })
      .catch(function () {
        say('Could not reach the server. Nothing has been confirmed erased — check /admin/audit.', 'error');
        btn.disabled = false;
        btn.textContent = 'Erase permanently';
      })
      .finally(function () { busy(false); });
  }

  function lookup() {
    var email = (el.email.value || '').trim();
    var id = (el.id.value || '').trim();
    if (!email && !id) {
      say('Enter the email address they gave you, or their customer id.', 'error');
      return;
    }

    busy(true);
    say('Looking…', 'info');
    var q = id ? '?id=' + encodeURIComponent(id) : '?email=' + encodeURIComponent(email);

    fetch(ENDPOINT + q, { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json().then(function (b) { return { s: r.statusCode, b: b }; }); })
      .then(function (res) {
        if (res.s === 401 || res.s === 403) {
          say('Sign in as an admin.', 'error');
          return;
        }
        if (res.s === 404) {
          say(
            'No customer matches. Nothing was read and nothing was changed. ' +
              'Check the address — it may differ from the one they gave you.',
            'error'
          );
          return;
        }
        if (res.s !== 200) {
          say('Could not look that up: ' + (res.b.error || res.s), 'error');
          return;
        }
        subject = res.b.subject;
        el.result.innerHTML = '';
        renderExport(res.b);
      })
      .catch(function () { say('Could not reach the server. Nothing was changed.', 'error'); })
      .finally(function () { busy(false); });
  }

  el.look.addEventListener('click', lookup);
  [el.email, el.id].forEach(function (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); lookup(); }
    });
  });

  el.form.hidden = false;
})();