---
title: "Lead Scoring"
description: "Where leads sit on the scoring curve, and which ones are hot"
layout: "admin"
scripts:
  - components/lead-scoring-dashboard.js
---

How the last 7, 30 or 90 days of inbound leads scored, broken down by score
band, priority, source and time, with the conversion rate each band actually
achieved. The scoring service recalculates on interaction data, so these numbers
move as calls and form fills land — read them as a current snapshot, not a
ledger.

Everything below is mounted and driven by
`components/lead-scoring-dashboard.js`, bundled and fingerprinted through the
`scripts:` key above. Its stylesheet is derived from that same key, so it is not
repeated under `styles:`. Without a staff session the page renders a sign-in
prompt rather than a set of zeroed charts.

<div id="lead-scoring-app">
  <div class="lead-scoring__state" role="status">Loading lead scoring analytics...</div>
</div>
