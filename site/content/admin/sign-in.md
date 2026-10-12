---
title: "Staff Sign In"
description: "Sign in to the dealership's sales tools"
layout: "admin"
styles:
  - components/admin.css
  - components/staff-sign-in.css
scripts:
  - components/staff-sign-in.js
  - identity-sign-in.js
---

Sign in to reach the sales dashboard, lead management and follow-up campaigns.

Everything behind this form is staff-only. Customers have their own sign-in on
the [customer portal](/customer/), which asks for an email address and a phone
number rather than a password.

## Sign in with your work email

{{< staff-sign-in >}}

That form talks to `/.netlify/functions/sales-login`, which verifies the password
against a `bcrypt` hash in the `sales_reps` table, so it needs the database
connected. Netlify Identity below does not.

A failed attempt says so, in place, with the reason. A session that has expired
says so too, and offers the form again. Neither of those is an empty table.

## Sign in with Netlify Identity

<div id="identity-sign-in" class="identity-sign-in">
  <p class="identity-sign-in__status" id="identity-sign-in-status" hidden></p>
  <div class="identity-sign-in__buttons">
    <button class="btn btn-primary" type="button" id="identity-open">Sign in</button>
    <button class="btn btn-outline" type="button" id="identity-reset">Forgot password</button>
    <button class="btn btn-ghost" type="button" id="identity-signup">Request access</button>
  </div>
  <p class="sign-in-msg" id="identity-sign-in-error" hidden></p>
</div>

This is Netlify's own user store. It works
before any customer database exists, and it brings password reset, invitations
and session revocation — none of which the work-email form above has.

Access is granted by adding a user in the Netlify dashboard. Give them the
**admin** role and they get everything.

<!-- The old note here warned that signing in does not make /admin/* private and
     named "Netlify password protection or a build-time split" as the missing fix.
     Obsolete: netlify.toml routes /admin/* through admin-guard, which redirects
     anyone without a session to this page, and every function still checks its own
     token. Defence in depth is still available: Netlify's own /admin/* password
     protection can be layered on from the dashboard. -->
