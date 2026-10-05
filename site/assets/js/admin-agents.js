/*
 * admin-agents.js -- manage LLM-agent identities.
 *
 * Create: name + scopes (+ optional description/expiry). The secret comes
 * back ONCE and is shown in a panel that says so; nothing can read it again,
 * because the server stores only a hash. Revoke: instant, confirm first.
 *
 * The scope checkboxes are rendered from the server's own scope vocabulary
 * (/agents-admin returns it), so this page can never invent a permission the
 * endpoints do not check.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/agents-admin';
  var root = document.getElementById('agents-admin');
  var statusEl = document.getElementById('agents-admin-status');
  if (!root) return;

  var state = { agents: [], scopes: [], canEdit: true, reason: '', freshSecret: null };

  function token() {
    try { return window.localStorage.getItem('caddyed_admin_token') || ''; } catch (e) { return ''; }
  }
  function headers() {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function say(m, kind) {
    if (!statusEl) return;
    statusEl.textContent = m;
    statusEl.className = 'settings-status' + (kind ? ' settings-status--' + kind : '');
    statusEl.hidden = !m;
  }

  function render() {
    var scopeBoxes = state.scopes.map(function (s) {
      return '<label class="ag-scope"><input type="checkbox" name="ag-scope" value="' + esc(s.key) + '"> ' +
        '<span>' + esc(s.label) + '</span> <code>' + esc(s.key) + '</code></label>';
    }).join('');

    var rows = state.agents.length ? state.agents.map(function (a) {
      var chips = a.scopes.map(function (s) { return '<span class="ag-chip">' + esc(s) + '</span>'; }).join('');
      return '<div class="ag-row">' +
        '<div>' +
        '  <div class="ag-row__name">' + esc(a.name) + ' <span class="ag-chip ag-chip--' + esc(a.status) + '">' + esc(a.status) + '</span></div>' +
        '  <div class="ag-row__meta">key ' + esc(a.prefix) + '… · created ' + esc((a.createdAt || '').slice(0, 10)) +
        (a.lastUsedAt ? ' · last used ' + esc(a.lastUsedAt.slice(0, 16).replace('T', ' ')) : ' · never used') +
        (a.expiresAt ? ' · expires ' + esc(a.expiresAt.slice(0, 10)) : '') +
        (a.description ? ' · ' + esc(a.description) : '') + '</div>' +
        '  <div class="ag-row__chips">' + chips + '</div>' +
        '</div>' +
        '<div>' +
        (a.status === 'active' && state.canEdit
          ? '<button type="button" class="btn btn-secondary" data-revoke="' + esc(a.id) + '">Revoke</button>'
          : '') +
        '</div>' +
        '</div>';
    }).join('') : '<div class="ag-row"><p class="settings-note">No agent keys yet. Create one below.</p></div>';

    var secretPanel = '';
    if (state.freshSecret) {
      secretPanel = '<div class="ag-secret">' +
        '<strong>Copy this secret now — it is shown once.</strong>' +
        '<code id="ag-secret-value">' + esc(state.freshSecret.secret) + '</code>' +
        '<button type="button" class="btn btn-secondary" id="ag-copy">Copy</button>' +
        '<p class="settings-note">' + esc(state.freshSecret.secretNote || '') + ' Give it to the agent as: Authorization: Bearer &lt;secret&gt;.</p>' +
        '</div>';
    }

    root.innerHTML = [
      '<div class="ag-layout">',
      '  <div class="ag-panel">',
      '    <h2>New agent key</h2>',
      secretPanel,
      '    <form id="ag-form">',
      '      <div class="form-group settings-field"><label class="form-group__label" for="ag-name">Name</label>',
      '        <input class="input" id="ag-name" placeholder="e.g. Content Agent (OpenClaw)"></div>',
      '      <div class="form-group settings-field"><label class="form-group__label" for="ag-desc">What is it for? (optional)</label>',
      '        <input class="input" id="ag-desc"></div>',
      '      <div class="form-group settings-field"><label class="form-group__label" for="ag-expires">Expires (optional, YYYY-MM-DD)</label>',
      '        <input class="input" id="ag-expires"></div>',
      '      <p class="settings-note">Scopes — the exact permissions this key gets:</p>',
      '      <div class="ag-scopes" id="ag-scopes">' + scopeBoxes + '</div>',
      '      <div class="settings-actions">',
      '        <button type="submit" class="btn btn-primary" id="ag-create"' + (state.canEdit ? '' : ' disabled') + '>Create key</button>',
      '      </div>',
      '    </form>',
      '  </div>',
      '  <div>',
      '    <h2 style="font-size:var(--text-lg)">Keys</h2>',
      '    <div class="ag-list">' + rows + '</div>',
      '  </div>',
      '</div>'
    ].join('\n');

    var form = document.getElementById('ag-form');
    form.addEventListener('submit', function (e) { e.preventDefault(); createKey(); });
    root.addEventListener('click', function (e) {
      var rev = e.target.closest('[data-revoke]');
      if (rev) { revokeKey(rev.getAttribute('data-revoke')); return; }
      if (e.target.id === 'ag-copy') {
        var el2 = document.getElementById('ag-secret-value');
        if (el2 && navigator.clipboard) navigator.clipboard.writeText(el2.textContent).catch(function () {});
        say('Secret copied to the clipboard.', 'ok');
      }
    });
  }

  function createKey() {
    if (!state.canEdit) { say(state.reason, 'error'); return; }
    var name = document.getElementById('ag-name').value.trim();
    var description = document.getElementById('ag-desc').value.trim();
    var expires = document.getElementById('ag-expires').value.trim();
    var scopes = Array.prototype.slice.call(document.querySelectorAll('input[name="ag-scope"]:checked')).map(function (c) { return c.value; });
    if (!name) { say('Give the key a name.', 'error'); return; }
    if (!scopes.length) { say('Tick at least one scope.', 'error'); return; }

    var body = { action: 'create', name: name, description: description, scopes: scopes };
    if (expires) body.expiresAt = expires;

    fetch(ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body.created) {
          state.freshSecret = { secret: res.body.secret, secretNote: res.body.secretNote };
          state.agents.unshift(res.body.agent);
          render();
          say('Key created. Copy the secret now — it will not be shown again.', 'ok');
        } else if (res.status === 422) {
          say('Not created — ' + ((res.body.fieldErrors || []).join('; ') || res.body.error || 'validation failed'), 'error');
        } else if (res.status === 401) {
          say('Sign in at /admin/sign-in to manage agent keys.', 'error');
        } else {
          say('Not created — the service answered ' + res.status + '.', 'error');
        }
      })
      .catch(function () { say('Not created — the service could not be reached.', 'error'); });
  }

  function revokeKey(id) {
    var agent = state.agents.filter(function (a) { return a.id === id; })[0];
    if (!agent) return;
    if (!window.confirm('Revoke "' + agent.name + '"? The key stops working on its next request. This cannot be undone.')) return;
    fetch(ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'revoke', id: id }) })
      .then(function (r) { return r.status; })
      .then(function (status) {
        if (status === 200) {
          agent.status = 'revoked';
          agent.revokedAt = new Date().toISOString();
          render();
          say('Key revoked. The agent loses access on its next request.', 'ok');
        } else {
          say('Not revoked — the service answered ' + status + '.', 'error');
        }
      })
      .catch(function () { say('Not revoked — the service could not be reached.', 'error'); });
  }

  window.AGENTS_ADMIN = { state: state };

  fetch(ENDPOINT, { headers: headers() })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
    .then(function (res) {
      if (res.status === 200) {
        state.agents = res.body.agents || [];
        state.scopes = res.body.scopes || [];
      } else if (res.status === 401) {
        state.canEdit = false;
        state.reason = 'Sign in at /admin/sign-in to manage agent keys.';
      } else if (res.status === 503) {
        state.canEdit = false;
        state.reason = 'Agent keys need the database, which is not configured on this deployment.';
      } else {
        state.canEdit = false;
        state.reason = 'The agent service answered ' + res.status + '.';
      }
    })
    .catch(function () {
      state.canEdit = false;
      state.reason = 'The agent service could not be reached.';
    })
    .then(function () {
      if (!state.canEdit && state.reason) say(state.reason, 'warn');
      render();
    });
})();
