---
title: "Testimonials"
description: "What owners say — collected, edited and published from here."
layout: "admin"
contentAdminData: true
contentType: testimonials
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
    <p>Loading testimonials…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">This editor needs JavaScript. Queued rows are plain
  JSON in the <code>testimonial_drafts</code> table.</p>
</noscript>

