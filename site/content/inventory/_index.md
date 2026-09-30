---
title: "Cadillac Inventory"
description: "Browse current new and certified pre-owned Cadillac inventory available in South Charlotte."
date: 2024-01-15
layout: "inventory"
scripts:
  - ed-picks.js
  - vehicleComparison.js
---

## Two buttons, two different jobs

Every car card has two small buttons, and they are not variations of each other.

**Compare** puts that car in the table below, next to the others you pick, so you
can see the prices and the specs together. Up to three at once. The address bar
carries your selection, so you can send someone the comparison you are looking
at, or come back to it.

**Shortlist** is for deciding later. It stays in this browser between visits, and
it has one job at the end: send Ed the list of cars you actually want, with their
stock numbers, so he knows what you are coming in for.

Comparing three cars and shortlisting eleven are different errands. They used to
share one button, and the compare feature had none.

<div id="comparison-app">
<div id="comparison-status" class="comparison-status" role="status" hidden></div>
<div id="comparison-table" class="comparison-table" hidden></div>
</div>

<p class="comparison-hint">Use the <strong>Compare</strong> button on any card to
add it here. The table shows year, make, model, trim, body, exterior and interior
colour, price, mileage, drivetrain, transmission and stock number.</p>


