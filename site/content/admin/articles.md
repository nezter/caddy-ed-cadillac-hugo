---
title: "Articles"
description: "Write and publish articles — by hand or by an LLM agent through the API."
layout: "admin"
contentAdminData: true
contentType: articles
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
    <p>Loading articles…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">The editor needs JavaScript. Queued rows are plain
  JSON in the <code>article_drafts</code> table.</p>
</noscript>

