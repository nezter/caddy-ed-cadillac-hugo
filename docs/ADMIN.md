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
- **Vehicle records** (`/admin/inventory`) — added 2026-10-04. Every
  vehicle's pricing, specs and page description are editable, and a car can
  be held off the site or promoted. Saves go to the `vehicle_edits` queue and
  are applied to the content files by the inventory sync (or
  `npm run inventory:sync -- --apply-edits`), then published by the next
  deploy — deliberately the build path, because inventory pages are the ones
  search traffic lands on. The one live control on that page is the Ed's-pick
  star, which writes the same table the home page already reads.
- **Email** (`/admin/email`) — added 2026-10-01. Pick SendGrid / Mailgun /
  Resend / Postmark / custom, and the host, port and username fill themselves in.
  Type the one secret, press **Save and send a test**. Writes one row to
  `mail_config`; `utils/mail-config.js` resolves it and every sender uses it.
  No deploy and no Netlify dashboard access needed.

  Two things about it worth knowing before using it:

  - **The password is stored in plain text in this database.** There is no
    secret store on this deployment, and encrypting with a key the sending code
    can also read would protect nothing. If you would rather it never touched
    the database, leave the password field blank and set `SMTP_HOST` /
    `SMTP_USER` / `SMTP_PASS` in the Netlify UI instead — that path takes over
    automatically and is fully supported.
  - **`/admin/email` deliberately does not set the To address.** Enquiries go to
    the first active rep in `sales_reps`, and only fall back to `EMAIL_TO` if
    there is nobody there. Hardcoding a recipient is how the customer list once
    got mailed to a stranger's mailbox.

---

## What is NOT live, and why

### Anything in the Decap CMS

Pages, inventory entries, blog posts, testimonials, specials, site settings.
Saved to git on `modernize/netlify-build-2026`. To publish:

```bash
cd <repo> && ./ci/run.sh build deploy
```

on the CI host. That is a manual step, and it is the honest state of things.

### The "Ed's pick" badge — CORRECTED, this now works

**This section used to say the admin toggle re-ordered the fleet but did not
badge it. That was wrong**, and it was wrong in the direction of claiming a
defect that did not exist. `ed-picks.js` badges on every page that renders a
fleet, not only on the home page.

It is now unambiguous:

- **Database** (`/admin/favourites` → `vehicle_favourites`) — runtime, and
  **now staff-only**. `vehicle-features.js` GET stays public because
  `ed-picks.js` reads it for every visitor; POST did not, so anyone could have
  rewritten the dealership's own editorial list. Fixed 2026-09-30.
- **Front matter** (`featured: true`) — a seasonal pin in the repository. Still
  supported, still useful, and deliberately kept as a separate mechanism.

Both sources show the badge and both reorder. They are not required to agree,
because they are not the same control: one is a repository decision, one is a
runtime one.

### The signage copy — now partly a control (2026-10-04)

The stay-connected heading and intro, the stock-alert heading and body, the
home hero heading and the footer tagline are editable at `/admin/settings`
and live on the next page load. That is the whole list, and it is the whole
list ON PURPOSE: `ci/check-admin-portal.js` and the settings page itself now
assume every non-banner key has an element carrying its `data-setting`
attribute, so a key that changes nothing fails the build rather than sitting
in the admin looking useful.

Three keys were REMOVED for exactly that reason: the phone/email/SMS chip
labels and a public-email key had no matching element (their seeds did not
even match the copy on the page), and the email and hours appear inside
mailto:/tel: hrefs as well as as text — the apply script only rewrites text,
so changing the text without the href would show one address and dial
another. They come back when an href-aware apply exists.

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
node ci/check-all.js                      # all of the below, one table
node ci/check-front-end.js                # entry points resolve; no new dead files
node ci/check-no-placeholder-contact.js   # 555 numbers, example.com, wrong address
node ci/check-permissions.js              # required-permission vocabulary
node ci/check-writes-work.js              # an UPDATE actually updates
node ci/check-function-auth.js            # no customer data behind an open door
node ci/check-inquiry-path.js             # an enquiry survives its notification failing
```

`check-no-placeholder-contact.js` is the one that matters most for this page.
It reads the **built** HTML **and** the function source. Both halves were needed:
a template default, a page's own front matter, a string in a JS file and a data
file are four separate mechanisms that can each be wrong — and the site shipped
`(704) 555-1234` in the header of all 67 pages while the correct number sat in
`config.toml`. Reading HTML alone was then not enough either, because
`contact-salesperson.js` returned `(704) 555-7890` **at runtime** and the HTML
could not see it. See `docs/BUILD.md` and `docs/SECURITY.md`.

`check-function-auth.js` matters because six endpoints had no authentication at
all. See `docs/SECURITY.md` for what they were and what now protects the data.

---

## The admin is currently the entire notification system

**No mail provider is configured, so nothing is emailed.** Enquiries, bookings,
pre-approvals, portal messages and staff-card contacts all **record to the
database first** and report `notified: false` with a reason, so nothing is lost
and nothing claims to have been sent.

Until one is set, this admin is the *only* place a lead is visible.

**This is now one page, not a dashboard trip.** `/admin/email` takes a provider
and a secret and tests the connection, with no redeploy. It was four environment
variables and a guess at which host went with which provider; that guess is now a
dropdown. See `docs/MISSING.md` § 1.

---

## Still open

Full list in **`docs/MISSING.md`**. The short version:

- **SMTP is unset**, so nothing is emailed anywhere. The largest gap on the site,
  and it is a credential rather than code.
- **Google OAuth credentials**, so the per-user calendar can actually connect.
- **Check `JWT_SECRET` is set in the Netlify UI** before deploying — see
  `docs/SECURITY.md` § S1.
- `refactored/` — the name says abandoned; the code is live. It is the test-drive
  scheduling calendar. See `docs/FRONTEND.md`.
- `components/notification.js` — a written, styled notification system no page
  mounts. This is the natural first home for the stock alerts.
- Sign-out does not revoke: each Netlify bundle gets its own in-memory `Set`.
- About 11 failing tests, mostly the calendar suite's ESM/DOM setup and
  integration fixtures.
- No production deploy yet.

## The social feed

`/admin/social` connects the Facebook page, X handle and Instagram account
behind the home page's "What Ed is posting" panel. Values are stored in the
`social_config` table; the environment variables (FACEBOOK_PAGE_TOKEN,
X_BEARER_TOKEN + X_USERNAME, INSTAGRAM_ACCESS_TOKEN) still work as fallbacks
for deployments configured the old way. The feed itself is cached in
`social_cache` and refreshes at most once a day; each card has Test
connection and Refresh cache now. Once a network is connected there, its
tab appears on the site without a rebuild.
