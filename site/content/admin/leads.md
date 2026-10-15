---
title: "Leads"
description: "Every enquiry, with the filters and the actions to work it"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-leads.js
  - components/lead-management.js
---
<div id="leads-app" class="op-leads">
  <section class="op-leads-filters" aria-label="Lead filters">
    <label>Timeframe
      <select id="leads-timeframe" class="input">
        <option value="day">Today</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="quarter">This quarter</option>
        <option value="year">This year</option>
        <option value="all" selected>All time</option>
      </select>
    </label>
    <label>Status
      <select id="leads-status-filter" class="input">
        <option value="all" selected>All</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="appointment">Appointment set</option>
        <option value="sold">Sold</option>
        <option value="lost">Lost</option>
      </select>
    </label>
    <label>Sort
      <select id="leads-sort" class="input">
        <option value="date-desc" selected>Newest first</option>
        <option value="date-asc">Oldest first</option>
        <option value="name">By name</option>
      </select>
    </label>
    <label>Search
      <input id="leads-search" class="input" type="search" placeholder="Name, email or phone">
    </label>
    <div><button type="button" class="op-btn" id="leads-refresh">Refresh</button></div>
  </section>

  <div id="leads-status" class="settings-status" role="status" hidden></div>
  <div id="leads-count" class="op-leads-count" role="status"></div>

  <div class="op-sync-scroll">
    <table class="op-sync-table op-leads-table">
      <thead><tr>
        <th>Lead</th><th>Source</th><th>Status</th><th>Assign</th><th>Created</th><th></th>
      </tr></thead>
      <tbody id="leads-rows"></tbody>
    </table>
  </div>

  <noscript>
    <p class="settings-note">This control needs JavaScript.</p>
  </noscript>
</div>

<details class="settings-group settings-fold" id="dedupe-fold">
  <summary class="settings-fold__summary">Duplicate finder</summary>
  <div id="lead-management-app">
    <div class="loading" role="status">Loading lead management system...</div>
  </div>
</details>
