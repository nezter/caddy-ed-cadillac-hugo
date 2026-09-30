---
title: "Get a Quote"
subtitle: "Tell me what you're looking for and I'll get back to you"
description: "Submit your details and Caddy Ed will contact you about your Cadillac interest."
scripts:
  - leadCapture.js
---

<div class="lead-form-section">
  <p class="lede">Fill out the form below and I'll call or email you back — usually the same day. If you already know the model you want, mention it in the message.</p>

  <noscript>
    <div class="form-message form-message--error" role="alert">
      <strong>This form needs JavaScript to submit.</strong>
      Please call <a href="tel:+18034316180">(803) 431-6180</a> or email
      <a href="mailto:ed@caddyed.com">ed@caddyed.com</a> and I'll take it from there.
    </div>
  </noscript>

  <form class="form lead-form lead-capture-form" id="lead-form" action="/api/lead" method="post" data-form-type="lead" aria-describedby="lead-form-description">
    <p id="lead-form-description" class="visually-hidden">Name, email and phone are required. A message is optional.</p>
    <div class="form-grid form-grid-2">
      <div class="form-field">
        <label for="lead-name">Name <span aria-hidden="true">*</span></label>
        <input class="input" type="text" id="lead-name" name="name" required autocomplete="name">
      </div>
      <div class="form-field">
        <label for="lead-email">Email <span aria-hidden="true">*</span></label>
        <input class="input" type="email" id="lead-email" name="email" required autocomplete="email">
      </div>
      <div class="form-field">
        <label for="lead-phone">Phone <span aria-hidden="true">*</span></label>
        <input class="input" type="tel" id="lead-phone" name="phone" required autocomplete="tel">
      </div>
      <div class="form-field">
        <label for="lead-interest">I'm interested in</label>
        <select class="select" id="lead-interest" name="vehicleInterest">
          <option value="">Select a model</option>
          <option value="Escalade">Escalade</option>
          <option value="CT4">CT4</option>
          <option value="CT5">CT5</option>
          <option value="XT4">XT4</option>
          <option value="XT5">XT5</option>
          <option value="XT6">XT6</option>
          <option value="LYRIQ">LYRIQ</option>
          <option value="VISTIQ">VISTIQ</option>
          <option value="Other">Other / not sure</option>
        </select>
      </div>
    </div>
    <div class="form-field">
      <label for="lead-message">Message</label>
      <textarea class="textarea" id="lead-message" name="message" rows="4" placeholder="Tell me what you're looking for — new, pre-owned, budget, timeline..."></textarea>
    </div>
    <div class="form-field form-field--honeypot" aria-hidden="true">
      <label for="lead-website">Leave this field blank</label>
      <input type="text" id="lead-website" name="website" tabindex="-1" autocomplete="off">
    </div>
    <div class="form-field">
      <button type="submit" class="btn btn-primary btn-lg">Send my details</button>
    </div>
    <p class="form-message form-message--success hidden" id="lead-form-success" role="status">
      Thanks — your details are with Ed and he'll be in touch shortly.
    </p>
    <p class="form-message form-message--error hidden" id="lead-form-error" role="alert"></p>
  </form>
</div>

<div id="lead-popup" class="lead-popup hidden" role="dialog" aria-modal="true" aria-labelledby="lead-popup-title">
  <div class="lead-popup__backdrop"></div>
  <div class="lead-popup__content">
    <button type="button" class="popup-close" data-close aria-label="Close">&times;</button>
    <h3 id="lead-popup-title">Thanks for reaching out</h3>
    <div class="lead-popup__body"></div>
  </div>
</div>

