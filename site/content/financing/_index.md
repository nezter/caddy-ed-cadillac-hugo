---
title: "Cadillac Financing"
description: "Explore financing options for new and pre-owned Cadillacs, including GM Financial, bank financing, and lease alternatives."
date: 2024-01-15
scripts:
  - financingCalculator.js
---

## Financing Options

Financing a Cadillac should be straightforward and transparent. There are three
main routes, and which one is best depends on whether you are buying, leasing, or
trading.

### 1. GM Financial
Manufacturer-affiliated financing, often with promotional rates on select models.
Best when you are buying new and the vehicle qualifies for a GM incentive.

### 2. Bank or Credit Union Financing
An outside lender can sometimes beat dealer financing, particularly with a large
down payment or a shorter loan term. Caddy Ed is happy to work with any lender
you choose.

### 3. Leasing
Leasing lowerises the monthly payment but does not build equity. It can make
sense if you trade every few years and want predictable costs.

## What Affects Your Rate

- Credit history and score
- Down payment and trade-in value
- Loan term (shorter terms carry lower rates)
- Vehicle age and mileage, for pre-owned


## Payment Calculator

Every field below is optional except the three that matter: price, rate and
term. The rest refine it. Sales tax is applied to the full price before the
down payment and trade-in are subtracted, which is how most lenders quote it.

<button type="button" id="financing-calculator-toggle" class="btn btn-secondary" aria-expanded="false" aria-controls="financing-calculator">
  Show payment calculator
</button>
<p class="financing-toggle-hint">The calculator is off until the quote endpoints it depends on exist. Turn it on to experiment; the numbers it produces are estimates only.</p>

<div id="financing-calculator" class="financing-calculator" hidden aria-hidden="true">
  <div class="calculator-grid">
    <div class="form-group">
      <label for="vehicle-price">Vehicle price</label>
      <input type="number" id="vehicle-price" name="vehiclePrice" min="0" step="100" placeholder="45000">
    </div>
    <div class="form-group">
      <label for="down-payment">Down payment</label>
      <input type="number" id="down-payment" name="downPayment" min="0" step="100" placeholder="5000">
    </div>
    <div class="form-group">
      <label for="trade-in-value">Trade-in value</label>
      <input type="number" id="trade-in-value" name="tradeInValue" min="0" step="100" placeholder="0">
    </div>
    <div class="form-group">
      <label for="interest-rate">Interest rate (APR %)</label>
      <input type="number" id="interest-rate" name="interestRate" min="0" step="0.1" placeholder="6.5">
    </div>
    <div class="form-group">
      <label for="loan-term">Loan term (months)</label>
      <input type="number" id="loan-term" name="loanTerm" min="12" max="84" step="12" placeholder="60">
      <div class="term-presets">
        <button type="button" class="term-preset" data-term="36">36 mo</button>
        <button type="button" class="term-preset" data-term="48">48 mo</button>
        <button type="button" class="term-preset" data-term="60">60 mo</button>
        <button type="button" class="term-preset" data-term="72">72 mo</button>
      </div>
    </div>
    <div class="form-group">
      <label for="sales-tax">Sales tax (%)</label>
      <input type="number" id="sales-tax" name="salesTax" min="0" max="15" step="0.1" placeholder="7">
    </div>
  </div>

  <div class="calculator-actions">
    <button type="button" id="calculate-payment" class="btn btn-primary">Calculate payment</button>
    <button type="button" id="pre-approval" class="btn btn-secondary">Get pre-approved</button>
  </div>

  <div class="calculator-results hidden" aria-live="polite">
    <div class="results-grid">
      <div class="result-card">
        <span class="result-label">Monthly payment</span>
        <span class="result-value" id="monthly-payment">&mdash;</span>
      </div>
      <div class="result-card">
        <span class="result-label">Total interest</span>
        <span class="result-value" id="total-interest">&mdash;</span>
      </div>
      <div class="result-card">
        <span class="result-label">Total paid</span>
        <span class="result-value" id="total-payment">&mdash;</span>
      </div>
    </div>
    <button type="button" class="show-amortization">Show Amortization Schedule</button>
    <div class="amortization-schedule hidden">
      <table class="amortization-table">
        <thead>
          <tr><th scope="col">Month</th><th scope="col">Payment</th><th scope="col">Principal</th><th scope="col">Interest</th><th scope="col">Cumulative interest</th><th scope="col">Balance</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>

<script type="application/json" id="financing-disclosure">
{"note":"Estimates only. Your rate depends on credit history, down payment, loan term and vehicle age. Final figures come from the lender."}
</script>

## Get a Personalized Number

Rates move daily and depend on your credit profile, so any figure online is only
an estimate. Ask for a real quote.

[Contact Caddy Ed](/contact/) · [Trade-In Valuation](/trade-in/)
