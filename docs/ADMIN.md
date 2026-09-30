# ADMIN.md — what an admin can actually change, and what happens when they do

Written 2026-09-29. Read this before trusting anything the admin says it did.

The short version: **the admin is two different systems, and only one of them
changes the website.**

---

## The split

| | Stored in | Live immediately? | Where |
|---|---|---|---|
| **Admin section** — favourites, leads, bookings, customers, interactions, campaigns, calendar | Turso (libSQL) | **Yes** | `/admin/*` |
| **Decap CMS** — pages, inventory, blog, testimonials, specials, settings | git, via `git-gateway` | **No — needs a build** | `/cms.html` |

The first is live because it reads and writes the database. The second is not,
and until recently it did not say so.

---

## Why the CMS does not change the site

Two independent reasons, either of which alone is enough.

**1. Nothing rebuilds after a save.** `netlify.toml` sets:

```toml
[build]
command = ""
```

That is deliberate — the site deploys **prebuilt**, built in the podman image on
the CI host (`10.1.0.25`) and uploaded with `netlify deploy --dir`. It is how
the project spends zero Netlify build minutes. A CMS save produces a commit; no
build runs; the publish directory is not regenerated.

**2. It was committing to the wrong branch.** `config.yml` said:

```yaml
branch: master
```

with a comment explaining that `main` did not exist. True — and `master` is a
tree from February 2026 that contains **none** of the Netlify, database or
calendar work. So even with a build, a CMS save would have published a version
of the site from before any of it existed. Now `modernize/netlify-build-2026`.

So an editor could open the CMS, change the phone number on the contact page,
press Save, see **Saved**, and the site would be unchanged — with the old
number, the old copy, everything. Nothing errored. The only way to find out was
for a customer to meet the old copy first.

That is now stated in the CMS itself: a non-dismissible banner at the top of
`/cms.html` says saving commits to git and does not change the website, and
points out that the admin section *is* live. It is above the editor rather than
inside it, because Decap renders into `<body>` and a banner inside would be the
first thing an update unmounts.

---

## What IS live, right now

These all read and write the database, so a change is visible on the next page
load:

- **Favourites** (`/admin/favourites`) — pin vehicles to the top of the home
  page fleet. `favourites-admin.js` → `/vehicle-features` → `vehicle_favourites`
  → `fleet-highlight.js` re-orders the ten cards the build already rendered.
- **Leads, lead scoring, lead assignment, lead intake** — `/api/leads*` and
  friends, all Turso.
- **Bookings** — `/admin/bookings`, now backed by the `booking_requests` table
  rather than a Blobs store that this plan cannot reach.
- **Customers, interactions** — `/admin/customers`, `/admin/interactions`.
- **Follow-up campaigns** — `/admin/followup-campaigns`.
- **Google Calendar** — per person, one row each in `google_calendar_tokens`.
  Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, which do not exist yet.

---

## What is NOT live, and why

### Anything in the Decap CMS

Pages, inventory entries, blog posts, testimonials, specials, site settings.
Saved to git on `modernize/netlify-build-2026`. To publish:

```bash
cd <repo> && ./ci/run.sh build deploy
```

on the CI host. That is a manual step, and it is the honest state of things.

### The "Ed's pick" badge

`partials/vehicle-card.html` renders it from **front matter**:

```gotemplate
{{ if $v.Params.featured }}
  <span class="vehicle-card__badge vehicle-card__badge--pick">Ed's pick</span>
{{ end }}
```

So pinning a vehicle in the admin **re-orders the fleet but does not badge it**.
Two sources of truth for one idea, and they disagree. The front-matter flag is
still useful for a seasonal pin in the repository; the database toggle is
runtime. They should both show the badge.

### The signage copy

"Stay connected", the stock-alert pitch, the SMS/email/phone chips, and
`connect.js`'s config all live in Hugo partials and `site/data/social.yaml`.
There is no admin surface for any of it. Changing the alert copy means editing
a template and deploying.

---

## The decision this forces

Content an admin must be able to change *and have it change* has to stop being
git-backed, because git-backed content on this site costs a build. Three ways
out, in the order I would take them:

**A. Move the editable copy and settings into the database.**
A `site_settings` key/value table, an admin page to edit it, and one function
the front end reads. The build stays prebuilt and costs nothing, and the change
is live. Cost: anything rendered server-side into static HTML needs either a
build or client-side injection, which is the SEO question below.

**B. Rebuild on push, on our own host. BUILT.**
`ci/webhook-receiver.js`. A signed git-push webhook runs
`ci/run.sh sync build deploy` on the CI host. Zero Netlify build minutes — it
is our hardware — and Decap works as designed, with static HTML and correct SEO.

It **never deploys to production.** Not as a policy but as a refusal: the only
command it will run is `deploy`, `deploy-prod` is not in it, and a `--prod` flag
anywhere in its configuration makes it exit at startup. Production stays a human
decision.

```bash
# on the CI host, once
export WEBHOOK_SECRET=$(openssl rand -hex 32)     # same value as the GitHub webhook
node ci/webhook-receiver.js --port 8801 --branch modernize/netlify-build-2026

# then, behind a reverse proxy, point the GitHub webhook at https://…/hook
node ci/check-webhook-receiver.js                # 9/9, --dry-run, never builds
```

It refuses: unsigned requests, a signature for different content, pushes to any
branch but the watched one, and branch deletions. Decap commits per field save,
so three saves in a minute coalesce into one build. `/healthz` is
unauthenticated and reveals nothing but "up, idle".

Not installed as a service. It needs a long-lived process and a public URL with
TLS, and that is a deliberate decision to make rather than something to
half-install.

**C. Restore a Netlify build on push.**
Simplest by far and the one thing already ruled out: it spends build minutes,
and a 24-minute hang from a single build command is the reason that was
changed.

**The SEO question underneath A:** if a page's content is injected by
JavaScript, a crawler sees an empty page. For the *signage* and *settings*
that is acceptable — they are chrome, not content. For **inventory and specials
it is not**: those are the pages search traffic lands on, and they must be in
the served HTML. That points to B for content, A for chrome, which is probably
the right split.

---

## Gates that keep this honest

```bash
node ci/check-front-end.js               # entry points resolve; no new dead files
node ci/check-no-placeholder-contact.js  # 555 numbers, example.com, wrong address
node ci/check-permissions.js             # required-permission vocabulary
node ci/check-writes-work.js             # an UPDATE actually updates
```

`check-no-placeholder-contact.js` is the one that matters most for this page.
It reads the **built** HTML, because a template default, a page's own front
matter, a string in a JS file and a data file are four separate mechanisms that
can each be wrong — and the site shipped `(704) 555-1234` in the header of all
67 pages while the correct number sat in `config.toml`. See `docs/BUILD.md`.

---

## Still open

- Google OAuth credentials, so the per-user calendar can actually connect.
- `refactored/` — abandoned calendar rewrite, ~40 KB, unreachable. See
  `docs/FRONTEND.md`.
- `components/notification.js` — a written, styled notification system no page
  mounts. This is the natural first home for the stock alerts.
- 18 failing tests, mostly the calendar suite's ESM/DOM setup and integration
  fixtures.
- No production deploy yet.
