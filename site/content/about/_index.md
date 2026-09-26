---
title: "About Caddy Ed"
description: "Meet Caddy Ed, a Cadillac sales specialist serving South Charlotte for over 25 years."
date: 2024-01-15
layout: "about"
scripts:
  - salesTeam.js
---

## Over 25 Years in South Charlotte

Caddy Ed has been selling and supporting Cadillacs in the Charlotte area for more
than two and a half decades. That length of time matters in this business: it
means repeat customers, referrals, and a lot of vehicles whose full service
history is already known.

## Selling the Car Is the Easy Part

Most of the work is what happens after the sale — answering a question a year
later, tracking down a part, explaining a service interval, or being honest that
a vehicle is not the right choice. That ongoing relationship is the point.

## How to Work Together

- Browse [current inventory](/inventory/) to see what is in stock
- Ask about [financing](/financing/) or a [trade-in value](/trade-in/)
- Check [service availability](/service/) if you already own a Cadillac
- Get in touch directly for anything else

[Contact Caddy Ed](/contact/)

## Who You Will Actually Deal With

There is one sales specialist here, and it is the same person from the first
conversation to the delivery. Below is the team as it stands today; the filter
and search narrow it down by specialty.

<div id="sales-team">
  <div class="team-controls">
    <input type="search" class="search-input" placeholder="Search the team" aria-label="Search the team">
    <div class="filter-buttons">
      <button type="button" class="filter-button active" data-filter="all">All</button>
      <button type="button" class="filter-button" data-filter="sales">Sales</button>
      <button type="button" class="filter-button" data-filter="finance">Finance</button>
      <button type="button" class="filter-button" data-filter="service">Service</button>
    </div>
  </div>
  <div class="team-grid">
    <article class="team-member" data-department="sales" data-specialty="luxury">
      <h3>Caddy Ed</h3>
      <p class="team-role">Sales Specialist</p>
      <p class="team-bio">Twenty-five years selling Cadillacs in South Charlotte. Handles the whole transaction, including finance and trade.</p>
      <button type="button" class="contact-button btn btn-primary" data-member="caddy-ed">Contact</button>
      <form id="contact-form-caddy-ed" class="member-contact-form hidden" method="post" action="/api/contact">
        <input type="text" name="name" required autocomplete="name" aria-label="Your name">
        <input type="email" name="email" required autocomplete="email" aria-label="Your email">
        <button type="submit" class="btn btn-primary">Send</button>
      </form>
    </article>
  </div>
</div>


