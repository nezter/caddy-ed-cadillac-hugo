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

<p class="lede">
  Articles are written here (or posted straight to the API by an agent —
  see <code>docs/CONTENT-API.md</code>). Saving queues the article;
  <code>npm run articles:apply</code> turns queued rows into site files, and
  the next deploy publishes them. The editor’s link panel exists to keep
  articles linking back into inventory and the site’s pages.
</p>

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

## How an article gets published

1. Save here (or POST to <code>/.netlify/functions/articles-admin</code>).
2. Run <code>npm run articles:apply</code> where the database credentials
   live — it writes/updates <code>site/content/articles/&lt;slug&gt;.md</code>.
3. Commit and deploy. Draft articles (<strong>Published</strong> unchecked)
   apply as <code>draft: true</code> and stay invisible until switched on.
