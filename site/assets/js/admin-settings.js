/**
 * admin-settings.js -- the editor for site_settings.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CMS
 * ---------------------------------------
 * The Decap CMS commits to git, and this site deploys PREBUILT (netlify.toml
 * sets [build] command = ""), so a CMS save produces a commit and no build: the
 * change stays unpublished. An admin pressing Save and seeing "Saved" is the
 * failure mode, not a feature.
 *
 * So anything that genuinely has to change during the day is edited here, in the
 * database, and is live on the next page load. See docs/ADMIN.md for why page
 * content is not included.
 *
 * DEGRADES LOUDLY
 * ---------------
 * If the load fails, the form is NOT shown empty -- it says the settings could
 * not be loaded and why. An empty form next to a Save button is the worst
 * version of this: it invites someone to fill it in and save, which would then
 * blank every value in the database. The form only appears once real values
 * have arrived.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/site-settings';

  var el = {
    form: document.getElementById('settings-form'),
    groups: document.getElementById('settings-groups'),
    status: document.getElementById('settings-status'),
    saved: document.getElementById('settings-saved'),
    save: document.getElementById('settings-save'),
    reload: document.getElementById('settings-reload'),
    progress: document.getElementById('settings-progress'),
  };

  if (!el.form || !el.groups) return;

  var GROUP_LABELS = {
    signage: 'Signage — the Stay Connected hub',
    contact: 'Contact',
    global: 'Site-wide',
  };

  var state = { settings: [], token: '' };

  function token() {
    // Same place the other admin scripts read it. A separate reader would be a
    // second answer to "what is the session token".
    try {
      return window.localStorage.getItem('caddyed_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  function say(message, kind) {
    if (!el.status) return;
    el.status.textContent = message;
    el.status.className = 'settings-status settings-status--' + (kind || 'info');
    el.status.hidden = !message;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** One input per setting, typed by the `kind` the function reports. */
  function field(setting) {
    var id = 'set-' + setting.key.replace(/[^a-z0-9]+/gi, '-');
    var common =
      'id="' + id + '" name="' + esc(setting.key) + '" data-kind="' + esc(setting.kind) + '"';
    var label =
      '<label class="form-group__label" for="' + id + '">' + esc(setting.label || setting.key) + '</label>';

    var control;
    if (setting.kind === 'textarea') {
      control = '<textarea class="input" rows="3" ' + common + '>' + esc(setting.value) + '</textarea>';
    } else {
      var type = setting.kind === 'url' ? 'url' : setting.kind === 'phone' ? 'tel' : 'text';
      control = '<input class="input" type="' + type + '" ' + common + ' value="' + esc(setting.value) + '">';
    }

    var note;
    if (setting.isSeed) {
      // Says plainly that this is the copy the build shipped, not a stored
      // value -- so nobody thinks their edit is being ignored.
      note = '<p class="settings-note">Not overridden yet. Showing the copy the build ships.</p>';
    } else {
      note =
        '<p class="settings-note">Overridden' +
        (setting.updatedAt ? ' ' + esc(String(setting.updatedAt).replace('T', ' ').slice(0, 16)) : '') +
        '. Blank this to fall back to the built copy.</p>';
    }

    return (
      '<div class="form-group settings-field">' + label + control + note + '</div>'
    );
  }

  function render(settings) {
    var byGroup = {};
    settings.forEach(function (s) {
      (byGroup[s.appliesTo] = byGroup[s.appliesTo] || []).push(s);
    });

    var html = Object.keys(byGroup)
      .sort(function (a, b) {
        var order = ['signage', 'contact', 'global'];
        return order.indexOf(a) - order.indexOf(b);
      })
      .map(function (g) {
        return (
          '<fieldset class="settings-group"><legend>' +
          esc(GROUP_LABELS[g] || g) +
          '</legend>' +
          byGroup[g].map(field).join('') +
          '</fieldset>'
        );
      })
      .join('');

    el.groups.innerHTML = html;
  }

  function load() {
    if (el.progress) el.progress.hidden = false;
    say('');
    fetch(ENDPOINT, { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) {
        return r.json().then(function (b) { return { status: r.status, body: b }; });
      })
      .then(function (res) {
        if (el.progress) el.progress.hidden = true;
        if (res.status !== 200 || !res.body || !Array.isArray(res.body.settings)) {
          // The form stays hidden. An empty form with a Save button would
          // invite someone to fill it in and save -- blanking every value.
          say(
            'Could not load settings (' + res.status + '). Nothing has been changed.',
            'error'
          );
          return;
        }
        state.settings = res.body.settings;
        render(res.body.settings);
        el.form.hidden = false;
        if (!res.body.configured) {
          say('No database configured, so these are the built-in defaults and saving is off.', 'warn');
        }
      })
      .catch(function (err) {
        if (el.progress) el.progress.hidden = true;
        console.error('settings service unreachable:', err);
      say('Could not reach the settings service. Check the connection and try again.', 'error');
      });
  }

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {};
    Array.prototype.forEach.call(el.form.elements, function (input) {
      if (!input.name) return;
      payload[input.name] = input.value;
    });

    el.save.disabled = true;
    el.save.textContent = 'Saving…';
    fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ settings: payload }),
    })
      .then(function (r) {
        return r.json().then(function (b) { return { status: r.status, body: b }; });
      })
      .then(function (res) {
        el.save.disabled = false;
        el.save.textContent = 'Save';
        if (res.status !== 200) {
          say(
            'Not saved. Check the values and try again.',
            'error'
          );
          return;
        }
        say('');
        if (el.saved) {
          el.saved.textContent = 'Saved. Live on the next page load.';
          window.setTimeout(function () { el.saved.textContent = ''; }, 5000);
        }
        load();
      })
      .catch(function (err) {
        el.save.disabled = false;
        el.save.textContent = 'Save';
        console.error('settings save failed:', err);
      say('Could not save. Try again in a moment.', 'error');
      });
  });

  if (el.reload) el.reload.addEventListener('click', load);
  load();
})();
