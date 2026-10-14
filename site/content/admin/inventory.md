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

