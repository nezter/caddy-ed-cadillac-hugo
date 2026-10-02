---
title: "Audit"
description: "What changed, who changed it, and when"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-audit.js
---

  Every destructive or account-changing action this site takes writes a row here:
  a lead merge, a staff role change, a data-subject erasure, a change to the
  public signage.

  <div id="audit-status" class="settings-status" role="status" hidden></div>

  <fieldset class="settings-group">
    <legend>Filter</legend>
    <div class="settings-field">
      <label for="audit-action">Action</label>
      <select id="audit-action" class="input"><option value="">Everything</option></select>
    </div>
    <div class="settings-field">
      <label for="audit-entity">Record id</label>
      <input id="audit-entity" class="input" type="text" placeholder="e.g. a customer id">
      <p class="settings-note">Shows every action against one record.</p>
    </div>
    <div class="settings-field">
      <button type="button" class="btn btn-secondary" id="audit-apply">Apply</button>
      <button type="button" class="btn btn-secondary" id="audit-clear">Clear</button>
    </div>
  </fieldset>

  <div id="audit-progress" class="settings-progress" hidden>
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>

  <div id="audit-list"></div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same records are rows in
    the <code>audit_log</code> table.</p>
  </noscript>

  ## What this deliberately does not show

  **An erasure does not name the customer.** The row records *that* one happened,
  who did it, why, and how many rows it removed. It does not record the name,
  email or phone that were erased.

  That is not a gap. An audit trail that kept the person's details "for the
  record" would make the erasure incomplete, and the thing preventing compliance
  would be the thing claiming to prove it. What is kept is the evidence — count,
  actor, reason, timestamp — and nothing that identifies the subject.

  **A refused action leaves no row.** If an irreversible action cannot be
  recorded, it does not proceed at all. So a merge or erasure missing from this
  list means it was never attempted, not that it was attempted and silently
  failed.

  ## It starts partway through

  This trail began on **2026-10-01**, when the `audit_log` table was created.
  Anything that happened before then is not in it, because there was nowhere to
  put it. There is no way to reconstruct that, and no way to guess it either —
  which is precisely why the table exists now.