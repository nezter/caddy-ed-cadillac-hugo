# The admin gate

`/admin/*` used to be an open door with a lock on the filing cabinet. Every
admin page is built by Hugo into the public directory, so anyone could load the
dashboard, the lead list, the customer list and the search page: the markup, the
titles, the empty states, the CSS that says "Sales Dashboard". The only thing
between a stranger and the shape of the business was `noindex`.

The *data* was always behind the functions — every one of them returns 401
without a valid token. So this was never a records leak. But a shell is enough to
confirm what software the dealership runs, to enumerate what is tracked about
customers, and to see the shape of every screen. And "the data is safe" is an
argument that decays the moment someone adds a server-rendered page.

## How it works

Two redirect rules in `netlify.toml`:

```
/admin/cms     -> /cms.html                      (the CMS keeps its own login)
/admin/*       -> /.netlify/functions/admin-guard
/.__admin/*    -> /admin/*                        (the real static file, unguarded)
```

`admin-guard` reads the session from the `Authorization` header or the
`auth_token` cookie — the same two places every other authenticated path uses —
and:

- lets `/admin/sign-in/` through always
- returns **404** for anything that is not under `/admin`, because a function
  mounted at a public path should say "no" rather than offer a login
- releases a valid session to `/.__admin/<path>`
- sends anyone else to `/admin/sign-in/?next=<where they were going>`

## Why the second rule exists

Two wrong answers were available and both are worse than the extra hop.

**A 200 with an empty body.** A 200 rewrite means the *function's* response is
the response. Returning nothing there serves a blank page with a 200 — which
looks exactly like an empty dashboard, and is the hardest kind of bug to notice.

**A 302 back to the same path.** `/admin/dashboard/` is what got rewritten to
the guard in the first place, so redirecting there sends the browser straight
back. It spins.

So an authorised visitor goes to `/.__admin/<path>`, which rewrites to the real
HTML. One hop, no loop, and Netlify still serves the page — the build's caching,
compression and CDN rules all still apply, rather than the function streaming a
file it would have to carry in its own bundle.

`/admin/cms` sits **above** the gate deliberately. The Decap CMS has its own
Netlify Identity login and does not need the extra hop.

## What it is not

Not a replacement for Netlify's own `/admin/*` password protection, which is a
dashboard toggle and runs before this function ever does. Turn **both** on if the
plan has it. This is the version that lives in the repository, with no dashboard
access and no assumption about which plan is active — and the inner one is a
single toggle against a function that can be found by reading the source.

## The open redirect

`next` is a Location header built from a query string, so it is validated
against `/^\/[a-z0-9/_-]*$/i` before use. A login page that forwards to an
arbitrary URL is how accounts get phished, and this one would have been
constructed directly from attacker-supplied input.

## What it does not change

Signing in still does not grant *data* access on its own — the functions
decide that, per request, from the account in the database or the role in the
Identity token. This closes the shell, not the records. Both were worth
closing.
