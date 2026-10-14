---
title: "Specials"
description: "Manage the offers on /specials/ — write, schedule, expire."
layout: "admin"
contentAdminData: true
contentType: specials
styles:
  - components/admin.css
  - components/settings.css
  - components/content-admin.css
scripts:
  - admin-content.js
---
<div id="content-admin-status" class="settings-status" role="status" hidden></div>
<div id="content-admin">
  <div class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading specials…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">This editor needs JavaScript. Queued rows are plain
  JSON in the <code>special_drafts</code> table.</p>
</noscript>

