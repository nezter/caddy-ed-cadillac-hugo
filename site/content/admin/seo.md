---
title: "SEO Audit"
description: "Score any page — and get the same answer an agent would."
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
  - components/seo-admin.css
scripts:
  - admin-seo.js
---
<div id="seo-admin-status" class="settings-status" role="status" hidden></div>
<div id="seo-admin">
  <div class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading the page list…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">This page needs JavaScript. Agents can call the
  endpoint directly.</p>
</noscript>
