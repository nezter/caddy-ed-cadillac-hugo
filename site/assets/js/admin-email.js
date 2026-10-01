/**
 * admin-email.js -- the /admin/email form.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The site could not send mail, and the only way to change that was four
 * environment variables set by somebody with Netlify dashboard access. This is
 * the same configuration, editable by whoever is already signed in, with the
 * provider trivia supplied by a dropdown so the only field left to type is the
 * one secret nobody can guess.
 *
 * DEGRADES LOUDLY
 * ---------------
 * Same rule as admin-settings.js, and for the same reason: the form is not
 * shown until real values have arrived. An empty form next to a Save button
 * invites someone to fill it in and save, which would then overwrite whatever
 * was working with whatever they typed. If the load fails, this says why and
 * offers no form at all.
 *
 * SAVING IS NOT PROVING
 * ---------------------
 * "Saved" means the row was written. It does not mean the provider accepts the
 * credentials. So there is a separate button that saves and then actually sends
 * one message and reports what the provider said -- because a 535 that looks
 * like a wrong password is the single most common way this task gets stuck, and
 * the way out of it is the provider's own error text.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/mail-settings';

  var el = {
    form: document.getElementById('email-form'),
    summary: document.getElementById('email-summary'),
    status: document.getElementById('email-status'),
    saved: document.getElementById('email-saved'),
    progress: document.getElementById('email-progress'),
    provider: document.getElementById('email-provider'),
    providerHelp: document.getElementById('email-provider-help'),
    enabled: document.getElementById('email-enabled'),
    host: document.getElementById('email-host'),
    port: document.getElementById('email-port'),
    secure: document.getElementById('email-secure'),
    user: document.getElementById('email-user'),
    pass: document.getElementById('email-pass'),
    passNote: document.getElementById('email-pass-note'),
    from: document.getElementById('email-from'),
    save: document.getElementById('email-save'),
    test: document.getElementById('email-test'),
    reload: document.getElementById('email-reload'),
  };

  if (!el.form || !el.provider) return;

  /** Presets, from the function. Never hardcoded here as well -- two lists drift. */
  var providers = [];

  function token() {
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

  function preset() {
    var id = el.provider.value;
    for (var i = 0; i < providers.length; i++) {
      if (providers[i].id === id) return providers[i];
    }
    return null;
  }

  /**
   * Choosing a provider fills in its trivia.
   *
   * Only fields the operator has not touched. Overwriting somebody's typed
   * hostname because they changed provider in the dropdown would be its own
   * small cruelty, and this form is used while something is broken.
   */
  function applyPreset(force) {
    var p = preset();
    if (!p) return;
    el.providerHelp.textContent = p.help || '';
    if (force || !el.host.value) el.host.value = p.host || '';
    if (force || !el.port.value) el.port.value = p.port || 587;
    if (p.user && (force || !el.user.value)) el.user.value = p.user;
    el.secure.checked = Boolean(p.secure);
  }

  /**
   * The status line above the form.
   *
   * Three states that look identical if you only show one of them:
   *   - a row saved here, in use
   *   - environment variables set, no row here
   *   - a row saved here but switched off, so nothing sends
   * Showing "configured" for the third is how a site believes it notifies
   * people when it does not.
   */
  function renderSummary(data) {
    if (!el.summary) return;
    var html = '';

    if (data.active && data.active.source === 'database') {
      html +=
        '<div class="settings-group"><p><strong>Sending from this page\'s settings.</strong> ' +
        (data.stored && data.stored.provider
          ? 'Provider: ' + esc(data.stored.provider) + '.'
          : '') +
        (data.stored && data.stored.enabled ? '' : ' <em>Sending is switched off.</em>') +
        '</p></div>';
    } else if (data.active && data.active.source === 'env') {
      html +=
        '<div class="settings-group"><p><strong>Using the Netlify environment variables.</strong> ' +
        'Nothing saved here takes effect until a row is saved on this page.</p></div>';
    } else {
      html +=
        '<div class="settings-group"><p><strong>Mail is not configured.</strong> ' +
        'Enquiries are being recorded and are visible in ' +
        '<a href="/admin/leads">Leads</a>, but nobody is being told.</p></div>';
    }

    if (data.problems && data.problems.length) {
      html +=
        '<div class="settings-group"><p><strong>Still missing:</strong></p><ul>' +
        data.problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') +
        '</ul></div>';
    }

    el.summary.innerHTML = html;
  }

  function fill(data) {
    providers = data.providers || [];
    el.provider.innerHTML = providers
      .map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>';
      })
      .join('');

    var s = data.stored || {};
    el.provider.value = s.provider || 'custom';
    el.enabled.checked = Number(s.enabled) === 1;
    el.host.value = s.smtp_host || '';
    el.port.value = s.smtp_port || 587;
    el.secure.checked = Number(s.smtp_secure) === 1;
    el.user.value = s.smtp_user || '';
    el.from.value = s.email_from || '';

    // The password field starts empty and says so. It is never populated from
    // the server, because the server never has it to send.
    el.pass.value = '';
    el.passNote.textContent = s.smtp_pass_set
      ? 'A password is saved. Leave this blank to keep it.'
      : 'No password saved here. The Netlify UI may still supply one.';

    el.providerHelp.textContent = (preset() || {}).help || '';
    renderSummary(data);
  }

  async function load() {
    try {
      var res = await fetch(ENDPOINT, {
        headers: { Authorization: 'Bearer ' + token() },
      });
      var data = await res.json();

      if (res.status === 401 || res.status === 403) {
        say('Sign in at /admin/sign-in to change how this site sends mail.', 'error');
        return;
      }
      if (!res.ok) {
        say(
          'Could not load the mail settings: ' +
            (data.error || res.status) +
            '. Nothing has been changed.',
          'error'
        );
        return;
      }

      fill(data);
      el.form.hidden = false;
      el.progress.hidden = true;
    } catch (err) {
      say(
        'Could not reach the server, so the mail settings could not be loaded. ' +
          'Nothing has been changed.',
        'error'
      );
    }
  }

  function collect(test) {
    var body = {
      provider: el.provider.value,
      smtp_host: el.host.value.trim(),
      smtp_port: Number(el.port.value),
      smtp_secure: el.secure.checked ? 1 : 0,
      smtp_user: el.user.value.trim(),
      email_from: el.from.value.trim(),
      enabled: el.enabled.checked ? 1 : 0,
      test: Boolean(test),
    };
    // Omitted entirely when blank, which means "keep the saved one". Sending ''
    // would overwrite a working password with nothing.
    if (el.pass.value) body.smtp_pass = el.pass.value;
    return body;
  }

  async function save(event, test) {
    if (event) event.preventDefault();
    if (el.saved) el.saved.textContent = '';
    say(test ? 'Saving and sending a test message…' : 'Saving…', 'info');

    try {
      var res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token(),
        },
        body: JSON.stringify(collect(test)),
      });
      var data = await res.json();

      if (!res.ok) {
        var detail = data.problems
          ? Object.keys(data.problems)
              .map(function (k) { return k + ': ' + data.problems[k]; })
              .join('; ')
          : data.error || res.status;
        say('Not saved. ' + detail, 'error');
        return;
      }

      if (test) {
        if (data.test && data.test.ok) {
          say(
            'Saved, and a test message was accepted for delivery. Check the inbox it was sent to.',
            'ok'
          );
        } else {
          var reason = (data.test && data.test.detail) || 'unknown';
          say(
            'Saved, but the test message was NOT sent: ' + reason +
              ' — the settings are stored but not working yet.',
            'error'
          );
        }
      } else {
        say('Saved. Press "Save and send a test" to check it actually works.', 'ok');
      }

      el.pass.value = '';
      await load();
    } catch (err) {
      say('Could not reach the server. Nothing was changed.', 'error');
    }
  }

  el.provider.addEventListener('change', function () { applyPreset(false); });
  el.form.addEventListener('submit', function (e) { save(e, false); });
  if (el.test) el.test.addEventListener('click', function (e) { save(e, true); });
  if (el.reload) el.reload.addEventListener('click', function () { load(); });

  load();
})();