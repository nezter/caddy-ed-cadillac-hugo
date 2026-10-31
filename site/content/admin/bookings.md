---
title: "Test Drives & Bookings"
description: "Every test-drive request, with status handling and Google Calendar sync."
layout: "admin"
styles:
  - components/admin.css
  - components/favourites.css
scripts:
  - bookings-admin.js
---

<div class="bookings-filters" data-bookings-filters role="group" aria-label="Filter test-drive requests">
  <button type="button" class="btn btn-ghost btn-sm is-active" data-bookings-filter="all" aria-pressed="true">All</button>
  <button type="button" class="btn btn-ghost btn-sm" data-bookings-filter="new" aria-pressed="false">New</button>
  <button type="button" class="btn btn-ghost btn-sm" data-bookings-filter="handled" aria-pressed="false">Handled</button>
  <button type="button" class="btn btn-ghost btn-sm" data-bookings-filter="cancelled" aria-pressed="false">Cancelled</button>
</div>

<div class="bookings-bar">
  <p class="bookings-bar__calendar" data-cal-status aria-live="polite">Checking calendar&hellip;</p>
  <div class="bookings-bar__actions">
    <a class="btn btn-outline btn-sm" data-cal-connect href="/?action=start">Connect Google Calendar</a>
    <button class="btn btn-primary btn-sm" type="button" data-cal-sync disabled>Push all to calendar</button>
    <button class="btn btn-ghost btn-sm" type="button" data-cal-pull disabled>Pull from calendar</button>
    <button class="btn btn-ghost btn-sm" type="button" data-cal-refresh>Refresh</button>
  </div>
</div>

<div class="bookings-list" data-bookings-list>
  <p class="bookings-loading">Loading requests&hellip;</p>
</div>

<noscript>
  <p class="settings-note">This control needs JavaScript.</p>
</noscript>
