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

<p class="lede">
  Paste a quote a customer gave you (with their permission), name it, tag the
  vehicle, save. Queued rows become files via
  <code>npm run testimonials:apply</code> and publish on the next deploy.
  <strong>Featured</strong> lifts a testimonial to the top of
  <code>/testimonials/</code>. Agents use the same API.
</p>

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

## A note on consent

A testimonial is a person’s words attached to their name. Only publish
what the customer agreed to have published — the queue makes it easy to
keep a draft until you have asked.
