---
title: "Lead Assignment"
description: "Rep workload, the unassigned queue, and manual assignment"
layout: "admin"
scripts:
  - components/lead-assignment-dashboard.js
---

Who is carrying what, and which leads are sitting in the queue with nobody
attached to them. Leads reach the queue when they arrive unassigned, when the
rep they were given has gone inactive, when that rep is over capacity, or when
the lead has been waiting more than seven days.

The rebalance button re-runs automatic assignment across everything in that
queue. Manual assignment writes a straight `sales_reps` reference with a score
of 100, so the two paths stay distinguishable in the analytics afterwards.

Everything below is mounted and driven by
`components/lead-assignment-dashboard.js`, bundled and fingerprinted through the
`scripts:` key above. Its stylesheet is derived from that same key, so it is not
repeated under `styles:`. The rep roster is read from the real `sales_reps`
table, so if no reps are configured the assignment controls say so instead of
offering names that do not exist.

<div id="lead-assignment-app">
  <div class="lead-assign__state" role="status">Loading lead assignments...</div>
</div>
