---
title: "Search"
description: "Search customers, leads, interactions, appointments and vehicle stock"
layout: "admin"
styles:
  - components/admin.css
scripts:
  - components/advanced-search.js
---

Cross-entity search across customers, leads, interactions, appointments and
vehicle stock, with the filter values the database actually holds and saved
searches per rep.

<div id="advanced-search-app">
  <div class="loading" role="status">Loading search…</div>
</div>

<noscript>
  <div class="admin-alert" role="note">
    <p><strong>Search needs JavaScript.</strong> It queries the CRM through a
    serverless function, so there is nothing to fall back to without it.</p>
    <p>The same information is reachable without search:</p>
    <ul>
      <li><a href="/admin/leads">Lead management</a> — every lead, with
        deduplication and merge.</li>
      <li><a href="/admin/dashboard">Sales dashboard</a> — your leads,
        appointments and performance metrics.</li>
      <li><a href="/admin/followup-campaigns">Follow-up campaigns</a> — campaign
        rules and their analytics.</li>
      <li><a href="/inventory/">Vehicle inventory</a> — the public stock
        listing, filterable without JavaScript.</li>
    </ul>
  </div>
</noscript>
