---
title: "Follow-up Campaign Manager"
description: "Create and manage automated follow-up campaigns"
layout: "admin"
styles:
  - components/admin.css
scripts:
  - components/followup-campaign-manager.js
  - components/followup-analytics-dashboard.js
---

Automated follow-up campaigns and their trigger rules, plus the analytics view
of opens, clicks and conversion attribution.

<!-- Known defect, not fixed here: nothing constructs these two components.
     The tab script this page used to carry referenced FollowupCampaignManager
     and FollowupAnalyticsDashboard by bare name, but the bundler wraps each
     entry as an IIFE, so those class names are module-scoped and the script
     threw ReferenceError on every click. The bootstrap has to move into the
     modules themselves before the tabs can work.

     This used to be a visible blockquote on the page. It is a note for whoever
     wires the components up, not something a sales user can act on. -->


<div class="admin-tabs" role="tablist" aria-label="Follow-up sections">
  <button type="button" class="tab-button active" data-tab="campaigns" role="tab" aria-selected="true" aria-controls="campaigns-tab">
    <i class="fas fa-cogs" aria-hidden="true"></i> Campaign Manager
  </button>
  <button type="button" class="tab-button" data-tab="analytics" role="tab" aria-selected="false" aria-controls="analytics-tab">
    <i class="fas fa-chart-bar" aria-hidden="true"></i> Analytics Dashboard
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
