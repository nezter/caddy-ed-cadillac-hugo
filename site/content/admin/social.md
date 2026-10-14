---
title: "Social Feed"
description: "Connect Facebook, X and Instagram — then test and refresh from here"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
  - components/social-admin.css
scripts:
  - admin-social.js
---
  <p class="settings-note">
          Connect the accounts Ed posts from.
        </p>

  <div id="social-status" class="settings-status" role="status" hidden></div>

  <div id="social-cards"></div>

  <form id="social-form" hidden>
    <div class="settings-actions">
      <button type="submit" class="btn btn-primary" id="social-save">Save connections</button>
      <button type="button" class="btn btn-secondary" id="social-reload">Reload status</button>
      <span id="social-saved" class="settings-saved" role="status"></span>
    </div>
  </form>

  <div class="settings-progress" id="social-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading connection status.</p>
  </div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same values
    live in the <code>social_config</code> table and can be edited there.</p>
  </noscript>

