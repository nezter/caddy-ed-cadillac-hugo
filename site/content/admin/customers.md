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

The book of customers assigned to the signed-in sales rep, straight from
`/.netlify/functions/sales-customers`. The function decides whose customers
these are from the session token — it scopes every query to the rep the token
names, so this page sends no rep id and cannot see anybody else's book no
matter what its URL says. Search matches name, email or phone; the status
filter offers exactly the four statuses the customers table allows — active,
inactive, archived and do-not-contact — because a filter the database would
reject is a button that silently shows nothing.

Two of the panels here are standing in for things that do not exist, and both
say so rather than dressing an empty list up as data:

**Appointments, not follow-ups.** The follow-up list this panel was originally
written for never had a backend: `followups` is a real table, but no function
has ever selected its rows — it is only ever read as a COUNT inside campaign
statistics. The panel therefore shows the per-rep appointment list from
`/.netlify/functions/sales-appointments`, the nearest scheduled-work list a
function actually returns, and its heading says "Appointments" rather than
claiming to be follow-ups it cannot see.

**Activity, honestly absent.** There is no function that lists everything a rep
has touched. The interactions timeline reports one customer at a time and
needs permissions a plain sales rep does not hold. Rather than render an empty
"Activity" list that reads as "nothing has happened", the panel states that no
activity feed exists and points at [the dashboard](/admin/dashboard) and
[lead management](/admin/leads), where the information does live.

Without a staff session the whole panel is replaced by a sign-in prompt
linking to [the sign-in page](/admin/sign-in) — an empty customer table is
indistinguishable from "you have no customers", and the difference matters.

Everything below is mounted and driven by `customerRelationship.js`, bundled
and fingerprinted through the `scripts:` key above, with `components/admin.css`
and `components/customer-relationship.css` supplied by `styles:`.

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
