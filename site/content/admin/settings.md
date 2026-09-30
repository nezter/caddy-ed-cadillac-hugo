---
title: "Site Settings"
description: "The copy and signage that can be changed without a rebuild"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-settings.js
---

  These are the values an admin needs to change during business hours. They are
  stored in the database, so a change is **live on the next page load** — no
  build, no deploy, no waiting.

  <div id="settings-status" class="settings-status" role="status" hidden></div>

  <form id="settings-form" hidden>
    <div id="settings-groups"></div>
    <div class="settings-actions">
      <button type="submit" class="btn btn-primary" id="settings-save">Save</button>
      <button type="button" class="btn btn-secondary" id="settings-reload">Discard changes</button>
      <span id="settings-saved" class="settings-saved" role="status"></span>
    </div>
  </form>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same values are
    plain rows in the <code>site_settings</code> table, and can be edited there.</p>
  </noscript>

  <div class="settings-progress" id="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading settings…</p>
  </div>

  ## Why these and not the others

  Everything above is **chrome**: headings, intro copy, the stock-alert pitch,
  a banner. It is safe to inject it at request time, because a crawler is not
  looking for it.

  Page content is not here, and that is deliberate. Inventory and specials are
  the pages search traffic lands on, and a value injected by JavaScript is
  invisible to a crawler — so those have to be in the served HTML, which means
  a build. Moving them here would trade a working search presence for
  convenience.

  The Decap CMS (`/cms.html`) edits git-backed content. On this site a CMS save
  produces a commit and **no build**, so it does not change the website. That is
  why this page exists for the things that have to change now. See
  `docs/ADMIN.md`.
