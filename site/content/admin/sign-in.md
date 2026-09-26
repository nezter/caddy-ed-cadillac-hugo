---
title: "Staff Sign In"
description: "Sign in to the dealership's sales tools"
layout: "admin"
styles:
  - components/admin.css
  - components/staff-sign-in.css
scripts:
  - components/staff-sign-in.js
---

Sign in to reach the sales dashboard, lead management and follow-up campaigns.

Everything behind this form is staff-only. Customers have their own sign-in on
the [customer portal](/customer/), which asks for an email address and a phone
number rather than a password.

The form below is the only way to obtain a session on this site. It talks to
`/.netlify/functions/sales-login`, which verifies the password against a
`bcrypt` hash in the `sales_reps` table, and the token that comes back is
required — and re-checked — by every sales function. A page that renders without
one shows an empty list rather than anybody's data.

A failed attempt says so, in place, with the reason. A session that has expired
says so too, and offers the form again. Neither of those is an empty table.

{{< staff-sign-in >}}

> **Not a page guard.** Signing in here does not make `/admin/*` private. Hugo
> builds these pages to the public directory and the site has no server-side
> gate, so anyone can load the dashboard shell without a session; what they
> cannot do is make its functions return data, because every one of them returns
> 401 without a valid token. Closing that gap needs either Netlify's
> `/admin/*` password protection or a build-time split of the admin section —
> neither of which this page can do by itself.
