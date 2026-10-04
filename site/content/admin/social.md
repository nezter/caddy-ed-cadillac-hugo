---
title: "Social Feed"
description: "Connect Facebook, X and Instagram — then test and refresh from here"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
  - components/social-admin.css
scripts:
  - admin-social.js
---

  <p class="settings-note">Connect the accounts Ed posts from. The site's
  feed is cached: it refreshes at most once a day, nothing loads from the
  platforms when a visitor opens a page, and the last good copy keeps serving
  if a platform is ever unreachable. Changes here are live on the next refresh
  — no build, no deploy.</p>

  <div id="social-status" class="settings-status" role="status" hidden></div>

  <div id="social-cards"></div>

  <form id="social-form" hidden>
    <div class="settings-actions">
      <button type="submit" class="btn btn-primary" id="social-save">Save connections</button>
      <button type="button" class="btn btn-secondary" id="social-reload">Reload status</button>
      <span id="social-saved" class="settings-saved" role="status"></span>
    </div>
  </form>

  <div class="settings-progress" id="social-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading connection status.</p>
  </div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same values
    live in the <code>social_config</code> table and can be edited there.</p>
  </noscript>

  ## Where the credentials come from

  - **Facebook** — create a long-lived Page access token for the dealership's
    Page (Meta for Developers &rarr; your app &rarr; Graph API Explorer, or a
    System User token for something that does not expire). The carousel reads
    that Page's posts.
  - **X** — a bearer token from the developer portal, plus the handle the
    timeline belongs to. The free tier is enough for reading a few of the
    account's own posts each day.
  - **Instagram** — a token for the Instagram Graph API on the professional
    account (via the same Meta app). We read the account's own recent media.

  Each card's **Test connection** fetches a couple of posts right now and
  tells you exactly what the platform answered — nothing about a token is
  shown back to this page once saved. **Refresh cache now** replaces what the
  site serves immediately instead of waiting for the daily pass.

  If the token fields are empty and the cards say "Not connected", the site
  simply shows the follow links — there is no broken state to fix.
