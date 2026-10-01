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

  Until this is filled in, **nothing this site sends reaches anybody**. Every
  enquiry is still recorded and still visible at
  [Leads](/admin/leads) and [Bookings](/admin/bookings) — nothing is lost —
  but nobody is told, so somebody has to remember to look.

  <div id="email-status" class="settings-status" role="status" hidden></div>

  <div id="email-progress" class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>

  <form id="email-form" hidden>
    <div id="email-summary"></div>

    <fieldset class="settings-group">
      <legend>Provider</legend>
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
          Leave this off until the test below arrives. A half-entered provider
          that is switched on fails every enquiry's notification, and a failed
          notification is easy to miss.
        </p>
      </div>
    </fieldset>

    <fieldset class="settings-group">
      <legend>Connection</legend>
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
    </fieldset>

    <fieldset class="settings-group">
      <legend>Addresses</legend>
      <div class="settings-field">
        <label for="email-from">From address</label>
        <input type="email" id="email-from" name="email_from" class="input" autocomplete="off" spellcheck="false">
        <p class="settings-note">
          Required, and never guessed by the site. A From address that is not
          verified with your provider either bounces or fails SPF, and the
          enquiry lands in spam where nobody will see it.
        </p>
      </div>
    </fieldset>

    <div class="settings-actions">
      <button type="submit" class="btn btn-primary" id="email-save">Save</button>
      <button type="button" class="btn btn-secondary" id="email-test">Save and send a test</button>
      <button type="button" class="btn btn-secondary" id="email-reload">Discard changes</button>
      <span id="email-saved" class="settings-saved" role="status"></span>
    </div>
  </form>

  <noscript>
    <p class="settings-note">This control needs JavaScript. Without it, mail can
    still be configured with <code>SMTP_HOST</code>, <code>SMTP_PORT</code>,
    <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>EMAIL_TO</code> and
    <code>EMAIL_FROM</code> in the Netlify UI — those still work, and take
    priority over nothing here.</p>
  </noscript>

  ## Where enquiries go

  The **To** address is not set here on purpose. It is resolved per enquiry: the
  first active member of staff in the `sales_reps` table, and only if there is
  nobody there does it fall back to `EMAIL_TO`.

  That ordering exists because a hardcoded address is how the customer list once
  ended up being mailed to a stranger's mailbox. `EMAIL_TO` is the fallback for
  before anybody has signed in — it is not the normal answer.

  ## Why this is not the Netlify dashboard

  Both work, and the environment variables take priority only if no row is saved
  here. Setting it here means the site can be told how to send mail without a
  redeploy and without dashboard access.

  The password is stored in this site's database in plain text. That is an
  honest limitation, not an oversight: there is no secret store on this
  deployment, and encrypting with a key the sending code can also read would
  protect nothing. If you would rather the password never touched the database,
  leave the password field blank, tick nothing, and set `SMTP_HOST`,
  `SMTP_USER` and `SMTP_PASS` in the Netlify UI instead — that path is fully
  supported and takes over automatically.