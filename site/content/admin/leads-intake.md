---
title: "New Lead"
description: "Enter a lead taken by phone or in person into the same pipeline the website forms feed"
layout: "admin"
styles:
  - components/admin.css
  - components/lead-intake.css
scripts:
  - lead-management.js
---
<form data-lead-form data-lead-source="phone" class="lead-intake-form" novalidate>
  <input type="hidden" name="formType" value="manual_intake">

  <div class="form-row">
    <div class="form-group">
      <label for="lead-name">Name</label>
      <input id="lead-name" name="name" type="text" autocomplete="name" required>
    </div>
    <div class="form-group">
      <label for="lead-email">Email</label>
      <input id="lead-email" name="email" type="email" autocomplete="email" required>
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="lead-phone">Phone</label>
      <input id="lead-phone" name="phone" type="tel" autocomplete="tel">
    </div>
    <div class="form-group">
      <label for="lead-vehicle-interest">Vehicle interest</label>
      <input id="lead-vehicle-interest" name="vehicleInterest" type="text" placeholder="e.g. 2024 Escalade">
    </div>
  </div>

  <div class="form-group">
    <label for="lead-source">How did they reach us?</label>
    <select id="lead-source" name="leadSource">
      <option value="phone" selected>Phone call</option>
      <option value="walk_in">Walk-in</option>
      <option value="referral">Referral</option>
      <option value="event">Event</option>
      <option value="website">Website (relayed)</option>
    </select>
  </div>

  <div class="form-group">
    <label for="lead-message">Notes</label>
    <textarea id="lead-message" name="message" rows="4" placeholder="What they asked about, when to call back, who they spoke to"></textarea>
  </div>

  <div class="form-group form-group--consent">
    <label for="lead-consent">
      <input id="lead-consent" name="consent" type="checkbox" value="true">
      They agreed to be contacted about this enquiry
    </label>
  </div>

  <button type="submit" class="btn btn-primary">Save lead</button>
</form>
