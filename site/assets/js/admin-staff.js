/**
 * admin-staff.js -- the /admin/staff editor.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * It edits the application's record of a person: name, role, status,
 * permissions. It cannot create a sign-in -- Netlify Identity owns that, and a
 * page that implied otherwise would produce an account nobody can use and a
 * support question that starts with "I added them and it doesn't work".
 *
 * The page says so on every row for the same reason.
 *
 * THE WARNING AT THE TOP IS THE POINT
 * -----------------------------------
 * When no staff member is active, `resolveRecipient()` finds nobody and every
 * enquiry is recorded and emailed to nobody. That is invisible from the enquiry
 * side -- it looks exactly like a quiet week. So the page states it in the place
 * an administrator is already looking, rather than leaving it in MISSING.md.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/staff-management';

  var el = {
    list: document.getElementById('staff-list'),
    status: document.getElementById('staff-status'),
    progress: document.getElementById('staff-progress'),
  };
  if (!el.list) return;

  var meta = { roles: [], statuses: [], allPermissions: [], permissionsByRole: {} };

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

  function labelFor(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].label || id;
    }
    return id;
  }

  function card(person) {
    var id = esc(person.id);
    var name = esc((person.first_name || '') + ' ' + (person.last_name || '')).trim() || '(no name)';
    var active = person.status === 'active';

    var roleOptions = meta.roles.map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (r.id === person.role ? ' selected' : '') + '>' +
        esc(r.label) + '</option>';
    }).join('');

    var statusOptions = meta.statuses.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === person.status ? ' selected' : '') + '>' +
        esc(s) + '</option>';
    }).join('');

    var roleDefaults = (meta.permissionsByRole[person.role] || []).slice().sort();

    return (
      '<fieldset class="settings-group" data-id="' + id + '">' +
        '<legend>' + name +
          (active ? '' : ' <em style="color:#a26a00">(' + esc(person.status) + ')</em>') +
        '</legend>' +

        '<div class="settings-field">' +
          '<p class="settings-note"><strong>' + esc(person.email) + '</strong></p>' +
          '<p class="settings-note">Identity account <code>' + id + '</code>' +
          (person.last_login ? ' · last signed in ' + esc(String(person.last_login).slice(0, 16))
            : ' · <strong>never signed in</strong>') +
          '</p>' +
          (person.last_login ? '' :
            '<p class="settings-note" style="color:#a26a00">This person has never signed in, so ' +
            'they cannot sign in yet. They need to accept their Netlify Identity invite and sign in ' +
            'once; the row above is created by that first sign-in.</p>') +
        '</div>' +

        '<div class="settings-field">' +
          '<label for="name-' + id + '">Name</label>' +
          '<input id="name-' + id + '" class="input" type="text" data-field="first_name" value="' +
            esc(person.first_name) + '"> ' +
          '<input class="input" type="text" data-field="last_name" value="' +
            esc(person.last_name) + '" aria-label="Last name">' +
        '</div>' +

        '<div class="settings-field">' +
          '<label for="role-' + id + '">Role</label>' +
          '<select id="role-' + id + '" class="input" data-field="role">' + roleOptions + '</select>' +
          '<p class="settings-note" data-role-note>' + esc(roleNote(person.role)) + '</p>' +
        '</div>' +

        '<div class="settings-field">' +
          '<label for="status-' + id + '">Status</label>' +
          '<select id="status-' + id + '" class="input" data-field="status">' + statusOptions + '</select>' +
          (active ? '' : '<p class="settings-note">Not counted as staff. Enquiries are not routed here, ' +
            'and functions that check status will refuse.</p>') +
        '</div>' +

        '<div class="settings-field">' +
          '<label for="perms-' + id + '">Permissions (comma separated)</label>' +
          '<input id="perms-' + id + '" class="input" type="text" data-field="permissions" value="' +
            esc(person.permissions.join(', ')) + '">' +
          '<p class="settings-note">Blank uses the role\'s defaults. Currently: <code>' +
            esc(roleDefaults.join(', ') || 'none') + '</code></p>' +
          '<p class="settings-note">Any of: <code>' + esc(meta.allPermissions.join(' ')) + '</code></p>' +
        '</div>' +

        '<div class="settings-actions" style="border:0;padding-bottom:0">' +
          '<button type="button" class="btn btn-primary" data-save="' + id + '">Save</button>' +
          '<span class="settings-saved" role="status" data-saved="' + id + '"></span>' +
        '</div>' +
      '</fieldset>'
    );
  }

  function roleNote(roleId) {
    for (var i = 0; i < meta.roles.length; i++) {
      if (meta.roles[i].id === roleId) return meta.roles[i].note;
    }
    return '';
  }

  function render(data) {
    var html = '';

    // The one warning that matters, stated where it will be read.
    if (data.notifyWarning) {
      html +=
        '<div class="settings-group" style="border-color:#c88a00;background:#fffaf0">' +
        '<p><strong>' + esc(data.notifyWarning) + '</strong></p></div>';
    } else if (data.staff.length === 0) {
      html +=
        '<div class="settings-group"><p><strong>No staff records at all.</strong> ' +
        'Invite somebody through Netlify Identity, have them sign in once at ' +
        '<code>/admin/sign-in</code>, and they will appear here.</p></div>';
    } else {
      html +=
        '<p class="settings-note">' + data.counts.total + ' record(s), ' +
        data.counts.active + ' active. Enquiries are emailed to the first active rep on this list.</p>';
    }

    html += data.staff.map(card).join('');
    el.list.innerHTML = html;
  }

  function collect(scope) {
    var body = {};
    scope.querySelectorAll('[data-field]').forEach(function (input) {
      body[input.dataset.field] = input.value;
    });
    // Trim the two that are NOT NULL in the schema.
    if ('first_name' in body) body.first_name = body.first_name.trim();
    if ('last_name' in body) body.last_name = body.last_name.trim();
    return body;
  }

  async function load() {
    try {
      var res = await fetch(ENDPOINT, { headers: { Authorization: 'Bearer ' + token() } });
      var data = await res.json();

      if (res.status === 401 || res.status === 403) {
        say('Sign in as an admin at /admin/sign-in to manage staff.', 'error');
        el.progress.hidden = true;
        return;
      }
      if (!res.ok) {
        say('Could not load the staff list: ' + (data.error || res.status) +
          '. Nothing has been changed.', 'error');
        el.progress.hidden = true;
        return;
      }

      meta = data;
      render(data);
      el.progress.hidden = true;
    } catch (err) {
      say('Could not reach the server. Nothing has been changed.', 'error');
      el.progress.hidden = true;
    }
  }

  el.list.addEventListener('click', async function (event) {
    var btn = event.target.closest('[data-save]');
    if (!btn) return;

    var id = btn.dataset.save;
    var scope = el.list.querySelector('[data-id="' + id + '"]');
    var statusEl = el.list.querySelector('[data-saved="' + id + '"]');
    if (statusEl) statusEl.textContent = 'Saving…';

    try {
      var res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token(),
        },
        body: JSON.stringify(Object.assign({ id: id }, collect(scope))),
      });
      var data = await res.json();

      if (!res.ok) {
        var detail = data.problems
          ? Object.keys(data.problems).map(function (k) { return k + ': ' + data.problems[k]; }).join('; ')
          : (data.detail || data.error || res.status);
        if (statusEl) statusEl.textContent = '';
        say('Not saved. ' + detail, 'error');
        return;
      }

      say('Saved. ' + (data.staff.first_name || '') + ' is now ' +
        data.staff.role + ' / ' + data.staff.status + '.', 'ok');
      await load();
    } catch (err) {
      if (statusEl) statusEl.textContent = '';
      say('Could not reach the server. Nothing was changed.', 'error');
    }
  });

  // Role changes rewrite the permissions hint, because a manager and a sales
  // rep get different defaults and the old note would then be a lie.
  el.list.addEventListener('change', function (event) {
    var sel = event.target.closest('[data-field="role"]');
    if (!sel) return;
    var note = sel.parentNode.querySelector('[data-role-note]');
    if (note) note.textContent = roleNote(sel.value);
  });

  load();
})();