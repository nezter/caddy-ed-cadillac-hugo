---
title: "Inventory Sync"
description: "Where the last sync landed, and while one is running, how far along it is."
layout: "admin"
scripts:
  - inventory-sync-admin.js
---

<p class="lede">
  The inventory sync reads the dealer feed, works out what changed, and
  writes the vehicle pages. Until this page existed, its progress lived in
  one terminal's scrollback. While a sync is running this page follows it
  live: how many cars the feed listed, how many were already here and
  unchanged, how many were updated, how many are new, and how many have
  been retired.
</p>

<div id="sync-status" class="op-sync" role="region" aria-live="polite">
  <p class="op-sync__loading">Loading the sync record...</p>
</div>

<p class="op-sync__help">
  Runs are recorded by <code>npm run inventory:sync</code> when the script
  runs with database access; a run without it still syncs and simply leaves
  no record here. This page refreshes itself while a run is in flight.
</p>
