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

<p class="lede">
  Favourited vehicles are hoisted to the top of the home page fleet and badged
  <strong>Ed's pick</strong>. The home page shows the ten most recently synced
  Cadillacs; anything you favourite here jumps the queue, up to six of them.
  Everything else is one click away on the
  <a href="/inventory/">full inventory page</a>.
</p>

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
  <div class="form-message form-message--error" role="alert">
    <strong>This page needs JavaScript.</strong>
    Favourites are stored in Netlify Blobs and toggled over the network, so there
    is nothing useful to show with scripting off. The home page is unaffected --
    it reads the same list and simply shows whatever was last set.
  </div>
</noscript>
