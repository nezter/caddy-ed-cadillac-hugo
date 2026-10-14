---
title: "Staff"
description: "Who can sign in to this site, and what each of them may do"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-staff.js
---
  <div id="staff-status" class="settings-status" role="status" hidden></div>
  <div id="staff-progress" class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>

  <div id="staff-list"></div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same records are rows in
    the <code>sales_reps</code> table, and can be edited there.</p>
  </noscript>

