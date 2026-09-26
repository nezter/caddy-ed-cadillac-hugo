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

Leads do not only arrive through the website. Someone calls about an Escalade,
someone walks the lot on a Saturday, a neighbour hands over a name — and until
now the only way into the leads table was a web form. This page is the other
door: a staff-side intake form that submits to
`/.netlify/functions/leads`, the same function the public forms target. One
pipeline, one leads table, one deduplication pass — a lead entered here is
indistinguishable from one that arrived by form, except that its `form_type`
records `manual_intake` and its source says how it actually reached us.

No sign-in is required to submit, and that is deliberate rather than an
oversight: `leads` is the public intake function, and gating it on a staff
token would break every public form that posts to it. Signing in matters for
reading the pipeline back — the [lead management console](/admin/leads),
[lead scoring](/admin/lead-scoring) and [lead assignment](/admin/lead-assignment)
pages all require a session — not for adding to it.

The function checks every submission against existing leads before storing it.
A repeat is not a second row: the original lead's last-contact time is moved
forward and the reply says the person is already on file, so the honest outcome
of entering a known customer is "we already have your information", not a
duplicated lead to clean up later.

The form is driven by `lead-management.js` (site/assets/js/lead-management.js —
the intake module at the root, not the deduplication console
`components/lead-management.js` that [Lead management](/admin/leads) loads),
bundled and fingerprinted through the `scripts:` key above, with
`components/admin.css` and `components/lead-intake.css` supplied by `styles:`.
Client-side validation is inline: a field that fails says so next to itself
rather than only at the submit button.

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
