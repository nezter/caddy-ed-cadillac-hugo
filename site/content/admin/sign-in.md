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

This is Netlify's own user store, and it is the recommended way in. It works
before any customer database exists, and it brings password reset, invitations
and session revocation — none of which the password form below has.

Access is granted by adding a user in the Netlify dashboard. Give them the
**admin** role and they get everything.

## Or use a password from the customer database

{{< staff-sign-in >}}

That form talks to `/.netlify/functions/sales-login`, which verifies the password
against a `bcrypt` hash in the `sales_reps` table, so it needs the database
connected. Identity above does not.

A failed attempt says so, in place, with the reason. A session that has expired
says so too, and offers the form again. Neither of those is an empty table.

> **Not a page guard.** Signing in here does not make `/admin/*` private. Hugo
> builds these pages to the public directory and the site has no server-side
> gate, so anyone can load the dashboard shell without a session; what they
> cannot do is make its functions return data, because every one of them returns
> 401 without a valid token. Closing that gap needs either Netlify's
> `/admin/*` password protection or a build-time split of the admin section —
> neither of which this page can do by itself.
