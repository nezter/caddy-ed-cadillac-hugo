---
title: "Site Settings"
description: "The copy and signage that can be changed without a rebuild"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-settings.js
---
  <div id="settings-status" class="settings-status" role="status" hidden></div>

  <form id="settings-form" hidden>
    <div id="settings-groups"></div>
    <div class="settings-actions">
      <button type="submit" class="btn btn-primary" id="settings-save">Save</button>
      <button type="button" class="btn btn-secondary" id="settings-reload">Discard changes</button>
      <span id="settings-saved" class="settings-saved" role="status"></span>
    </div>
  </form>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same values are
    plain rows in the <code>site_settings</code> table, and can be edited there.</p>
  </noscript>

  <div class="settings-progress" id="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading settings…</p>
  </div>

