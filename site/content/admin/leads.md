---
title: "Lead Management"
description: "Manage and deduplicate leads"
layout: "admin"
styles:
  - components/admin.css
scripts:
  - components/lead-management.js
---

Deduplication statistics for the lead table, a duplicate check against a single
inbound lead, and the manual merge tool for collapsing duplicate rows into one.

The app is `components/lead-management.js`, bundled and fingerprinted through
the `scripts:` key above, with `components/admin.css` supplied by `styles:`.
Both were previously inlined in this page: a ~200-line script block that no
build step touched, plus a style block in the old Bootstrap palette.

<div id="lead-management-app">
  <div class="loading" role="status">Loading lead management system...</div>
</div>
