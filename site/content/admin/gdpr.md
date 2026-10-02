---
title: "Customer Data"
description: "Answer a request for someone's data, or remove it"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-gdpr.js
---

  Two requests a business holding names, emails, addresses and the whole
  conversation history has to be able to answer: **"what do you have about
  me?"** and **"delete me."**

  <div id="gdpr-status" class="settings-status" role="status" hidden></div>
  <div id="gdpr-progress" class="settings-progress" hidden>
    <div class="spinner" aria-hidden="true"></div>
    <p>Working…</p>
  </div>

  <form id="gdpr-form" hidden>
    <fieldset class="settings-group">
      <legend>Find the customer</legend>
      <div class="settings-field">
        <label for="gdpr-email">Email address</label>
        <input id="gdpr-email" class="input" type="email" autocomplete="off" spellcheck="false">
        <p class="settings-note">
          The address they gave you. Matching is on the stored normalised value
          as well as the raw one.
        </p>
      </div>
      <div class="settings-field">
        <label for="gdpr-id">…or the internal id</label>
        <input id="gdpr-id" class="input" type="text" autocomplete="off" spellcheck="false">
        <p class="settings-note">Leave both blank and nothing happens.</p>
      </div>
      <div class="settings-field">
        <button type="button" class="btn btn-primary" id="gdpr-look">Look up</button>
      </div>
    </fieldset>
  </form>

  <div id="gdpr-result"></div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same records are
    readable in the <code>customers</code> table, and every access is recorded.</p>
  </noscript>

  ## Exporting is not dangerous

  Look up somebody, read what the page shows you, and **Send to them**. Copying
  it to yourself is a copy you are now responsible for. Exports are recorded,
  because "who looked at this customer" is a reasonable thing to be able to
  answer.

  ## Erasing is not

  Pressing **Erase** does **not** delete anything. It shows you a plan: every
  table, how many rows, what happens to each. Read it.

  Only when you press **Erase permanently**, and type the reason, does anything
  go. There is no undo.

  ### What it will not remove, on purpose

  **The audit row survives.** It records that an erasure happened, who did it,
  why, and how many rows went. It holds no name, no email, no phone.

  That is deliberate and it is the reason the design works. An audit trail that
  kept the person's details "for the record" would make the erasure
  incomplete — the thing preventing compliance would be the thing claiming to
  prove it. What is kept is the evidence, not the data.

  **The lead row stays, with the identifying columns emptied.** A row with no
  name, no email and no phone is a count of enquiries. Deleting it would lose
  the fact that somebody asked about a car, which is business record-keeping
  and not personal data.

  ### Two things it does remove that are easy to forget

  The search indexes are denormalised copies of the customer's name, address and
  phone number. They are not referenced by anything, so nothing cascades to
  them, and they are the easiest thing on this site to leave behind.

  And `customer_vehicle_interest` — which holds a salesperson's free-text notes
  about the person. That table has **no foreign key** to `customers`, so a
  delete that relied on cascades would remove the customer and keep the notes.

  ## This page cannot be used to look up the wrong person by accident

  It is admin-only, and every lookup that finds somebody is recorded. There is
  no search-across-all-customers, deliberately: this answers a specific request
  from a specific person, and a browse-everyone's-records screen is a different
  and much more dangerous tool.