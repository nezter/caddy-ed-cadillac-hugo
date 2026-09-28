---
title: "Bookings & Calendar"
description: "Every test-drive request, and push them onto your Google Calendar."
layout: "admin"
styles:
  - components/admin.css
  - components/favourites.css
scripts:
  - bookings-admin.js
---

<p class="lede">
  Every test-drive request sent through this site, newest first. These are kept on
  Netlify's own storage, so they survive even before the customer database exists.
  Mark one handled, or push the whole list onto your Google Calendar.
</p>

<div class="bookings-bar">
  <p class="bookings-bar__calendar" data-cal-status aria-live="polite">Checking calendar…</p>
  <div class="bookings-bar__actions">
    <a class="btn btn-outline btn-sm" data-cal-connect href="/?action=start">Connect Google Calendar</a>
    <button class="btn btn-primary btn-sm" type="button" data-cal-sync disabled>Push all to calendar</button>
    <button class="btn btn-ghost btn-sm" type="button" data-cal-refresh>Refresh</button>
  </div>
</div>

<div class="bookings-list" data-bookings-list>
  <p class="bookings-loading">Loading requests…</p>
</div>

<noscript>
  <div class="form-message form-message--error" role="alert">
    <strong>This page needs JavaScript.</strong>
    Requests are read from Netlify Blobs over the network, so there is nothing
    useful to show with scripting off. Requests are still emailed either way.
  </div>
</noscript>
