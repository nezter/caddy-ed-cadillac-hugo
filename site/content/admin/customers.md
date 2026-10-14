---
title: "Customers"
description: "The customers assigned to you, their upcoming appointments, and an honest account of where their activity lives"
layout: "admin"
styles:
  - components/admin.css
  - components/customer-relationship.css
scripts:
  - customerRelationship.js
---
<div id="customer-relationship">
  <div class="crm-toolbar">
    <div class="crm-toolbar__field">
      <label for="customer-search">Search</label>
      <input id="customer-search" type="search" placeholder="Name, email or phone">
    </div>
    <div class="crm-toolbar__field">
      <label for="customer-filter">Status</label>
      <select id="customer-filter">
        <option value="all" selected>All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="archived">Archived</option>
        <option value="do_not_contact">Do not contact</option>
      </select>
    </div>
    <button type="button" class="btn btn-primary new-customer-btn">New customer</button>
    <button type="button" class="btn refresh-button">Refresh</button>
  </div>

  <div class="crm-grid">
    <section class="crm-section crm-section--customers" aria-label="Customers">
      <h2>Customers</h2>
      <div id="customer-list" class="customer-list">
        <p class="crm-loading" role="status">Loading your customers…</p>
      </div>
    </section>
    <div class="crm-side">
      <section class="crm-section crm-section--appointments" aria-label="Appointments">
        <h2>Appointments</h2>
        <div id="followup-list" class="followup-list">
          <p class="crm-loading" role="status">Loading appointments…</p>
        </div>
      </section>
      <section class="crm-section crm-section--activity" aria-label="Activity">
        <h2>Activity</h2>
        <div id="activity-log" class="activity-log">
          <p class="crm-loading" role="status">Checking for an activity feed…</p>
        </div>
      </section>
    </div>
  </div>
</div>
