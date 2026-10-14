---
title: "Favourites"
description: "Mark the vehicles to push to the top of the home page."
layout: "admin"
favouritesData: true
styles:
  - components/admin.css
  - components/favourites.css
scripts:
  - favourites-admin.js
---
<div class="favourites-bar">
  <p class="favourites-bar__status" data-fav-status aria-live="polite">Loading current stock…</p>
  <div class="favourites-bar__actions">
    <label class="favourites-bar__filter">
      <span class="visually-hidden">Filter vehicles</span>
      <input class="input" type="search" data-fav-filter placeholder="Filter by model or stock">
    </label>
    <button class="btn btn-ghost btn-sm" type="button" data-fav-clear>Clear all</button>
  </div>
</div>

<div class="favourites-grid" data-fav-list>
  <p class="favourites-loading">Loading…</p>
</div>

<noscript>
    <p class="settings-note">This control needs JavaScript.</p>
  </noscript>
