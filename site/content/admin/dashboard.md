---
title: "Sales Dashboard"
description: "Sales performance dashboard for sales representatives"
layout: "admin"
styles:
  - components/admin.css
scripts:
  - salesDashboard.js
---
<div id="sales-dashboard" data-sales-id="current-user" data-sales-name="Sales Rep">
  <div class="dashboard-loading" role="status">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading your sales dashboard...</p>
  </div>
</div>

<!-- Filter bar. The handles are captured by salesDashboard.js in its
     constructor, before any rendering happens, so they have to exist in the
     initial document rather than be created later. -->
<section id="dashboard-filters" class="dashboard-section" aria-label="Dashboard filters">
  <div class="section-content">
    <div class="filter-group">
      <label for="timeframe-filter">Timeframe</label>
      <select id="timeframe-filter" name="timeframe">
        <option value="day">Today</option>
        <option value="week" selected>This week</option>
        <option value="month">This month</option>
        <option value="quarter">This quarter</option>
        <option value="year">This year</option>
        <option value="all">All time</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="status-filter">Status</label>
      <select id="status-filter" name="status">
        <option value="all" selected>All</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="appointment">Appointment set</option>
        <option value="sold">Sold</option>
        <option value="lost">Lost</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="sort-filter">Sort</label>
      <select id="sort-filter" name="sort">
        <option value="date-desc" selected>Newest first</option>
        <option value="date-asc">Oldest first</option>
        <option value="name">By name</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="search-input">Search</label>
      <input id="search-input" name="search" type="search" placeholder="Name, email or phone">
    </div>
  </div>
</section>

<div id="sales-metrics" aria-label="Sales metrics"></div>

<div id="leads-list" aria-label="Leads"></div>

<div id="appointments-list" aria-label="Appointments"></div>
