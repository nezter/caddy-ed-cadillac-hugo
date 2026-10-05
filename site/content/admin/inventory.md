---
title: "Inventory"
description: "Every vehicle on the site — edit the records, hold cars off, and promote Ed’s picks."
layout: "admin"
inventoryData: true
styles:
  - components/admin.css
  - components/settings.css
  - components/inventory-admin.css
scripts:
  - admin-inventory.js
---

<p class="lede">
  Every vehicle that has a page here, including cars held off it. Edit a
  record and it is queued immediately, applied to the site’s files by the
  inventory sync, and published by the next deploy — the note on a saved
  vehicle says whether its changes are still travelling. The
  <strong>Ed’s pick</strong> toggle is the one live control: it shows on the
  site on the next page load.
</p>

<div id="inventory-admin-status" class="settings-status" role="status" hidden></div>
<div id="inventory-admin">
  <div class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading the vehicle list…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">The editor needs JavaScript. The vehicle files
  themselves are ordinary markdown under <code>site/content/inventory/</code>.</p>
</noscript>

## How a record change reaches the site

Saving writes to the edit queue (the `vehicle_edits` table). The inventory
sync applies pending rows to the vehicle files — a full sync when the feed
is read, or `npm run inventory:sync -- --apply-edits` for the queue alone, no
crawl involved — and the next deploy publishes the result. A sync never
overwrites a field you have edited: the queue is merged back in after every
feed refresh, so an admin’s price survives the car being re-scraped.
