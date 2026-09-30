---
title: "Interaction History"
description: "Every customer touchpoint in one timeline, and a form to add more"
layout: "admin"
scripts:
  - components/interaction-timeline.js
---

The full touchpoint history for a single customer: calls, emails, texts, site
visits, form fills, test drives, service visits, appointments, follow-ups and
internal notes, grouped by day and newest first.

Start by entering a customer ID. It is the `customer_id` on the lead or customer
record, and appending `?customer_id=…` to this page's URL preselects it, so
the view can be linked from a customer record. The type list, the filters and
the log form all come from the interactions service rather than being hardcoded
here, so they cannot drift from what the server accepts.

Logging an interaction also schedules any follow-up rules that match it, which
is why the form asks for an outcome: that is the field the rules key on.

<div id="interaction-timeline-app">
  <div class="timeline__state" role="status">Loading interaction history...</div>
</div>
