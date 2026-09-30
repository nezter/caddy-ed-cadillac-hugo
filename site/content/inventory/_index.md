---
title: "Cadillac Inventory"
description: "Browse current new and certified pre-owned Cadillac inventory available in South Charlotte."
date: 2024-01-15
layout: "inventory"
scripts:
  - ed-picks.js
  - vehicleComparison.js
---

## Compare Vehicles

Pick two or more cars from the list above and they will appear side by side here.
Comparison is saved in this browser, so you can build it up over several visits and
it will still be here when you come back.

<div id="comparison-app">
  <div id="comparison-tray" class="comparison-tray" hidden aria-live="polite"></div>
  <div class="comparison-container">
    <button type="button" class="add-vehicle-btn btn btn-secondary">Add a vehicle</button>
    <div class="vehicle-selector hidden">
      <input type="search" class="vehicle-search" placeholder="Search vehicles" aria-label="Search vehicles to compare">
      <div class="vehicle-options"></div>
    </div>
    <button type="button" class="print-comparison btn btn-link">Print</button>
    <button type="button" class="share-comparison btn btn-link">Share</button>
  </div>
  <div id="comparison-table" class="comparison-table hidden"></div>
</div>

<p class="comparison-hint">To add a vehicle, use the compare button on any vehicle
card. The table compares price, mileage, drivetrain, transmission, exterior and
interior colour, and stock number.</p>


