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
