---
title: "Email"
description: "Tell the site how to reach you when somebody fills in a form"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-email.js
---
  <div id="email-status" class="settings-status" role="status" hidden></div>
  <div id="email-progress" class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>
  <form id="email-form" hidden>
    <div id="email-summary"></div>
    <details class="settings-group settings-fold" open>
      <summary class="settings-fold__summary">Provider</summary>
      <div class="settings-field">
        <label for="email-provider">Who sends the mail</label>
        <select id="email-provider" name="provider" class="input"></select>
        <p class="settings-note" id="email-provider-help"></p>
      </div>
      <div class="settings-field">
        <label for="email-enabled">
          <input type="checkbox" id="email-enabled" name="enabled">
          Turn sending on
        </label>
        <p class="settings-note">
          Leave this off until the test below arrives.
        </p>
      </div>
    </details>
    <details class="settings-group settings-fold" open>
      <summary class="settings-fold__summary">Connection</summary>
      <div class="settings-field">
        <label for="email-host">SMTP host</label>
        <input type="text" id="email-host" name="smtp_host" class="input" autocomplete="off" spellcheck="false">
      </div>
      <div class="settings-field">
        <label for="email-port">Port</label>
        <input type="number" id="email-port" name="smtp_port" class="input" min="1" max="65535">
      </div>
      <div class="settings-field">
        <label for="email-secure">
          <input type="checkbox" id="email-secure" name="smtp_secure">
          Use TLS from the first byte (port 465)
        </label>
        <p class="settings-note">
          Port 587 upgrades to TLS after the greeting and is the normal choice.
          Only tick this for 465.
        </p>
      </div>
      <div class="settings-field">
        <label for="email-user">Username</label>
        <input type="text" id="email-user" name="smtp_user" class="input" autocomplete="off" spellcheck="false">
      </div>
      <div class="settings-field">
        <label for="email-pass">Password or API key</label>
        <input type="password" id="email-pass" name="smtp_pass" class="input" autocomplete="new-password">
        <p class="settings-note" id="email-pass-note">
          Leave blank to keep the saved one. The saved value is never sent back to
          this page.
        </p>
      </div>
    </details>
    <details class="settings-group settings-fold" open>
      <summary class="settings-fold__summary">Addresses</summary>
      <div class="settings-field">
        <label for="email-from">From address</label>
        <input type="email" id="email-from" name="email_from" class="input" autocomplete="off" spellcheck="false">
        <p class="settings-note">
          Required, and never guessed by the site.
        </p>
      </div>
    </details>
    <div class="settings-actions">
      <button type="submit" class="btn btn-primary" id="email-save">Save</button>
      <button type="button" class="btn btn-secondary" id="email-test">Save and send a test</button>
      <button type="button" class="btn btn-secondary" id="email-reload">Discard changes</button>
      <span id="email-saved" class="settings-saved" role="status"></span>
    </div>
  </form>

  <noscript>
    <p class="settings-note">
          This control needs JavaScript.
        </p>
  </noscript>

