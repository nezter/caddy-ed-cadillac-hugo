---
title: "Follow-up Campaign Manager"
description: "Create and manage automated follow-up campaigns"
layout: "admin"
styles:
  - components/admin.css
scripts:
  - components/admin-tabs.js
  - components/followup-campaign-manager.js
  - components/followup-analytics-dashboard.js
---

Automated follow-up campaigns and their trigger rules, plus the analytics view
of opens, clicks and conversion attribution.

<!-- Wiring: components/admin-tabs.js switches the panels below, and each
     component mounts itself against its host id. (The page's old script
     referenced the classes by bare name -- impossible under IIFE bundling,
     which is why it threw on every click.) -->


<div class="admin-tabs" role="tablist" aria-label="Follow-up sections">
  <button type="button" class="tab-button active" data-tab="campaigns" role="tab" aria-selected="true" aria-controls="campaigns-tab">
    Campaign Manager
  </button>
  <button type="button" class="tab-button" data-tab="analytics" role="tab" aria-selected="false" aria-controls="analytics-tab">
    Analytics Dashboard
  </button>
</div>

<div id="campaigns-tab" class="tab-content active" role="tabpanel" aria-label="Campaign Manager">
  <div id="followup-campaign-manager">
    <div class="loading-state" role="status">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading campaign manager...</p>
    </div>
  </div>
</div>

<div id="analytics-tab" class="tab-content" role="tabpanel" aria-label="Analytics Dashboard">
  <div id="followup-analytics-dashboard">
    <div class="loading-state" role="status">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading analytics dashboard...</p>
    </div>
  </div>
</div>
