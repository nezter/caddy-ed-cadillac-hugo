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

<p class="lede">
  Offers for the <code>/specials/</code> page. Saving queues the offer;
  <code>npm run specials:apply</code> writes it to site files and the next
  deploy publishes it. An <strong>expires</strong> date marks the offer so it
  can be retired; <strong>Published</strong> unchecked keeps it queued as a
  draft. Agents use the same API — <code>docs/CONTENT-API.md</code>.
</p>

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

## Reminder: prices and incentives change

An offer page is a promise with a date on it. Give every offer an
<strong>expires</strong> date, and retire it (uncheck Published, save,
apply, deploy) when it lapses — a stale incentive is worse than no offer.
