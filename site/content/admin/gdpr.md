---
title: "Customer Data"
description: "Answer a request for someone's data, or remove it"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-gdpr.js
---
  <div id="gdpr-status" class="settings-status" role="status" hidden></div>
  <div id="gdpr-progress" class="settings-progress" hidden>
    <div class="spinner" aria-hidden="true"></div>
    <p>Working…</p>
  </div>

  <form id="gdpr-form" hidden>
    <fieldset class="settings-group">
      <legend>Find the customer</legend>
      <div class="settings-field">
        <label for="gdpr-email">Email address</label>
        <input id="gdpr-email" class="input" type="email" autocomplete="off" spellcheck="false">
        <p class="settings-note">
          The address they gave you. Matching is on the stored normalised value
          as well as the raw one.
        </p>
      </div>
      <div class="settings-field">
        <label for="gdpr-id">…or the internal id</label>
        <input id="gdpr-id" class="input" type="text" autocomplete="off" spellcheck="false">
        <p class="settings-note">Leave both blank and nothing happens.</p>
      </div>
      <div class="settings-field">
        <button type="button" class="btn btn-primary" id="gdpr-look">Look up</button>
      </div>
    </fieldset>
  </form>

  <div id="gdpr-result"></div>

  <noscript>
    <p class="settings-note">This control needs JavaScript.</p>
  </noscript>

