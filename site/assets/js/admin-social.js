/**
 * admin-social.js -- the /admin/social controller.
 *
 * Renders one card per network from the live status the function returns --
 * configured state, token state (set / not set, and whether it came from the
 * admin page or the environment), cached post count, last refresh -- plus the
 * inputs to change them, a per-network "Test connection" and "Refresh cache
 * now". Everything goes through /.netlify/functions/social-admin with the
 * same admin token the other admin scripts use.
 *
 * Tokens are write-only here: the status never contains one, and a blank
 * token input means "leave the saved one alone". The page never shows an
 * empty form next to a Save button -- if status cannot be loaded it says so
 * and offers reload.
 */
'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/social-admin';

  var el = {
    cards: document.getElementById('social-cards'),
    form: document.getElementById('social-form'),
    status: document.getElementById('social-status'),
    saved: document.getElementById('social-saved'),
    save: document.getElementById('social-save'),
    reload: document.getElementById('social-reload'),
    progress: document.getElementById('social-progress'),
  };

  if (!el.cards || !el.form) return;

  var NETWORKS = [
    { id: 'facebook', label: 'Facebook', field: 'url', fieldLabel: 'Page URL', placeholder: 'https://www.facebook.com/eportello' },
    { id: 'x', label: 'X', field: 'handle', fieldLabel: 'Handle', placeholder: '@CaddyEd' },
    { id: 'instagram', label: 'Instagram', field: 'url', fieldLabel: 'Profile URL', placeholder: 'https://www.instagram.com/...' },
  ];

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

  function call(payload) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (b) { return { status: r.status, body: b }; });
    });
  }

  function when(net, s) {
    if (!s.cachedPosts) return 'no posts cached yet';
    return s.cachedPosts + (s.cachedPosts === 1 ? ' post cached' : ' posts cached');
  }

  function card(net, s) {
    var pill = s.configured
      ? '<span class="social-pill social-pill--ok">Connected</span>'
      : '<span class="social-pill social-pill--off">Not connected</span>';
    var tokenLine = s.hasToken
      ? 'Token: set (' + esc(s.tokenSource === 'env' ? 'environment' : 'saved here') + ')'
      : 'Token: not set';
    var value = s[net.field] || '';
    return (
      '<section class="social-card" data-network="' + esc(net.id) + '">' +
        '<header class="social-card__head"><h3>' + esc(net.label) + '</h3>' + pill + '</header>' +
        '<p class="social-card__meta">' + tokenLine + ' &middot; ' + when(net, s) + '</p>' +
        '<div class="form-group settings-field">' +
          '<label class="form-group__label" for="social-' + esc(net.id) + '-value">' + esc(net.fieldLabel) + '</label>' +
          '<input class="input" type="text" id="social-' + esc(net.id) + '-value" ' +
            'name="' + esc(net.id === 'x' ? 'x_handle' : net.id + '_url') + '" ' +
            'value="' + esc(value) + '" placeholder="' + esc(net.placeholder) + '" autocomplete="off">' +
        '</div>' +
        '<div class="form-group settings-field">' +
          '<label class="form-group__label" for="social-' + esc(net.id) + '-token">Access token</label>' +
          '<input class="input" type="password" id="social-' + esc(net.id) + '-token" ' +
            'name="' + esc(net.id) + '_token" value="" autocomplete="off" ' +
            'placeholder="' + (s.hasToken ? '\u2022\u2022\u2022 saved \u2014 type to replace' : 'paste the token here') + '">' +
          '<p class="settings-note">Blank keeps the saved token. Tokens are never shown again once saved.</p>' +
        '</div>' +
        '<div class="social-card__actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-social-test="' + esc(net.id) + '">Test connection</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-social-refresh="' + esc(net.id) + '">Refresh cache now</button>' +
          '<span class="social-result" id="social-result-' + esc(net.id) + '" role="status"></span>' +
        '</div>' +
      '</section>'
    );
  }

  function render(status) {
    var nets = status.networks || {};
    el.cards.innerHTML = NETWORKS.map(function (n) {
      return card(n, nets[n.id] || {});
    }).join('');
  }

  function load() {
    if (el.progress) el.progress.hidden = false;
    say('');
    call({ action: 'status' })
      .then(function (res) {
        if (el.progress) el.progress.hidden = true;
        if (res.status !== 200 || !res.body || !res.body.ok) {
          say('Could not load the connection status (' + res.status + '). Nothing has been changed.', 'error');
          return;
        }
        render(res.body);
        el.form.hidden = false;
        if (!res.body.database) {
          say('No database is configured on this deployment, so saving is off and the feed cannot cache.', 'warn');
        }
      })
      .catch(function (err) {
        if (el.progress) el.progress.hidden = true;
        console.error('social admin status failed:', err);
        say('Could not reach the social service. Check the connection and try again.', 'error');
      });
  }

  function result(network, message, kind) {
    var host = document.getElementById('social-result-' + network);
    if (!host) return;
    host.textContent = message;
    host.className = 'social-result' + (kind ? ' social-result--' + kind : '');
  }

  function busy(button, on, busyLabel) {
    if (!button) return;
    if (on) {
      button.dataset.label = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  if (el.form) {
    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var config = {};
      NETWORKS.forEach(function (n) {
        var valueInput = document.getElementById('social-' + n.id + '-value');
        if (valueInput) config[n.id === 'x' ? 'x_handle' : n.id + '_url'] = valueInput.value.trim();
        var tokenInput = document.getElementById('social-' + n.id + '-token');
        // Blank token = keep the saved one. Only a typed value is sent.
        if (tokenInput && tokenInput.value.trim()) config[n.id + '_token'] = tokenInput.value.trim();
      });

      busy(el.save, true, 'Saving\u2026');
      call({ action: 'save', config: config })
        .then(function (res) {
          busy(el.save, false);
          if (res.status !== 200 || !res.body || !res.body.saved) {
            say('Not saved. ' + ((res.body && res.body.error) || 'Check the values and try again.'), 'error');
            return;
          }
          say('');
          if (el.saved) {
            el.saved.textContent = 'Saved. The feed will use this from the next refresh.';
            window.setTimeout(function () { el.saved.textContent = ''; }, 5000);
          }
          load();
        })
        .catch(function () {
          busy(el.save, false);
          say('Could not save. Try again in a moment.', 'error');
        });
    });
  }

  if (el.reload) el.reload.addEventListener('click', load);

  el.cards.addEventListener('click', function (e) {
    var testBtn = e.target.closest && e.target.closest('[data-social-test]');
    if (testBtn) {
      var network = testBtn.getAttribute('data-social-test');
      result(network, 'Testing\u2026');
      busy(testBtn, true, 'Testing\u2026');
      call({ action: 'test', network: network })
        .then(function (res) {
          busy(testBtn, false);
          var b = (res.body || {});
          if (b.ok) {
            result(network, 'OK \u2014 ' + b.count + (b.count === 1 ? ' post' : ' posts') +
              ' fetched' + (b.sample ? ': \u201C' + b.sample.slice(0, 80) + '\u201D' : ''), 'ok');
          } else {
            result(network, b.error || 'The connection test failed.', 'error');
          }
        })
        .catch(function () {
          busy(testBtn, false);
          result(network, 'Could not run the test.', 'error');
        });
      return;
    }
    var refreshBtn = e.target.closest && e.target.closest('[data-social-refresh]');
    if (refreshBtn) {
      var net = refreshBtn.getAttribute('data-social-refresh');
      result(net, 'Refreshing\u2026');
      busy(refreshBtn, true, 'Refreshing\u2026');
      call({ action: 'refresh', network: net })
        .then(function (res) {
          busy(refreshBtn, false);
          if (res.status === 200 && res.body && res.body.refreshed) {
            result(net, 'Cache refreshed.', 'ok');
            render(res.body);
            el.form.hidden = false;
          } else {
            result(net, 'Refresh failed. ' + ((res.body && res.body.error) || ''), 'error');
          }
        })
        .catch(function () {
          busy(refreshBtn, false);
          result(net, 'Could not refresh right now.', 'error');
        });
    }
  });

  load();
})();
