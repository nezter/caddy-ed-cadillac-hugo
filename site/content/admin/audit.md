---
title: "Audit"
description: "What changed, who changed it, and when"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-audit.js
---

  <div id="audit-status" class="settings-status" role="status" hidden></div>

  <fieldset class="settings-group">
    <legend>Filter</legend>
    <div class="settings-field">
      <label for="audit-action">Action</label>
      <select id="audit-action" class="input"><option value="">Everything</option></select>
    </div>
    <div class="settings-field">
      <label for="audit-entity">Record id</label>
      <input id="audit-entity" class="input" type="text" placeholder="e.g. a customer id">
      <p class="settings-note">Shows every action against one record.</p>
    </div>
    <div class="settings-field">
      <button type="button" class="btn btn-secondary" id="audit-apply">Apply</button>
      <button type="button" class="btn btn-secondary" id="audit-clear">Clear</button>
    </div>
  </fieldset>

  <div id="audit-progress" class="settings-progress" hidden>
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>

  <div id="audit-list"></div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same records are rows in
    the <code>audit_log</code> table.</p>
  </noscript>

