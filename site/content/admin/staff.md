---
title: "Staff"
description: "Who can sign in to this site, and what each of them may do"
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
scripts:
  - admin-staff.js
---

  <div id="staff-status" class="settings-status" role="status" hidden></div>
  <div id="staff-progress" class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading…</p>
  </div>

  <div id="staff-list"></div>

  <noscript>
    <p class="settings-note">This control needs JavaScript. The same records are rows in
    the <code>sales_reps</code> table, and can be edited there.</p>
  </noscript>

  ## This page does not create sign-ins

  It changes what this site *knows* about a person. It cannot let anybody in.

  A new member of staff has to sign up through Netlify Identity first — the
  invite link is in your Netlify dashboard under **Identity → Invite users**.
  They sign in once at `/admin/sign-in`, and the first sign-in writes their row
  automatically, keyed on their Identity account. **Then** set their role here.

  Doing it in the other order gets you an account with no permissions: the row
  arrives with the schema default of `view_customers,manage_leads`, and every
  other page returns a 403 with no obvious reason. That is not a bug you have to
  debug — it is what happens if you skip the first sign-in.

  ## If this list is empty, nobody is being emailed

  This is the least obvious consequence and the most expensive one. When a
  customer fills in a form, the enquiry is recorded and then mailed to the first
  active staff member on this list. With nobody on it, every enquiry is recorded
  correctly and **emailed to nobody** — which looks identical to "no enquiries
  have come in".

  The page says so at the top while that is true. It clears itself once one
  person is active.

  `EMAIL_TO` in the Netlify UI is a fallback for exactly this case, but it is a
  fallback: a rep on this list is found first, on purpose.

  ## Roles

  Roles are additive and least-privilege by default. A role not listed here gets
  nothing rather than everything.

  Permissions can also be set per person, which overrides the role's defaults.
  A permission that is not in the vocabulary is **refused** rather than stored,
  because one that matches nothing reads as granted in this page and does
  nothing at the function.

  ## Deactivating is not deleting

  Setting somebody to **inactive** takes them out of the staff list for enquiry
  notification, lead assignment, and every function that checks status. The row
  stays, because leads assigned to them, their calendar connection, and the
  audit entries naming them all refer to it. Deleting a person is a different
  and much worse operation, and this page will not do it.