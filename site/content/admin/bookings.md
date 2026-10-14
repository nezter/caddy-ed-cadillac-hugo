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

<div class="bookings-bar">
  <p class="bookings-bar__calendar" data-cal-status aria-live="polite">Checking calendar…</p>
  <div class="bookings-bar__actions">
    <a class="btn btn-outline btn-sm" data-cal-connect href="/?action=start">Connect Google Calendar</a>
    <button class="btn btn-primary btn-sm" type="button" data-cal-sync disabled>Push all to calendar</button>
    <button class="btn btn-ghost btn-sm" type="button" data-cal-pull disabled>Pull from calendar</button>
    <button class="btn btn-ghost btn-sm" type="button" data-cal-refresh>Refresh</button>
  </div>
</div>

<div class="bookings-list" data-bookings-list>
  <p class="bookings-loading">Loading requests…</p>
</div>

<noscript>
    <p class="settings-note">This control needs JavaScript.</p>
  </noscript>
