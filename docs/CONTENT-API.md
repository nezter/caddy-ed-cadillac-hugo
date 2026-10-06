# Content API -- for LLM agents and automation

Every admin capability with a JSON surface is callable by an agent. This file
is the contract: what to send, what comes back, and what the reply MEANS.
No MCP server ships in this repository -- these endpoints are the stable
interface, and an MCP wrapper is a thin adapter over them (see the last
section for the tool shapes we would suggest).

## Authentication -- agents get their own identity

**An agent should not borrow a person's token.** Create an agent key at
`/admin/agents`: a name, scopes (the same permission vocabulary staff
have), an optional expiry. The secret (`cdy1_...`) is shown exactly once
and stored only as a SHA-256 hash; present it as:

    Authorization: Bearer cdy1_...

What the key can do is exactly its scopes (for content: `articles_*`, `specials_*`, `testimonials_*`, `inventory_*`, `seo_read`, `preferences_*`). Revocation is instant;
`agent.create` / `agent.revoke` are audited; every action the key takes is
audited as the agent (`agent:<id>`, role `agent`), never as a person. The
`agents_read` / `agents_write` permissions can never be granted to a key
-- agents cannot mint agents. Keys are resolved in
`utils/auth-middleware.js`, the same chokepoint staff tokens pass through,
so scopes are enforced identically for both.

Notes to pass along with any instruction:

- Endpoints that gate by HUMAN ROLE refuse agent keys by design, and the
  permissions behind them are not grantable anyway. One human-role
  endpoint is additionally opened to keys: the vehicle-features POST
  (Ed's picks) accepts a key holding `inventory_write`.
- Staff session tokens (from `/admin/sign-in/`, kept by the admin pages in
  `localStorage` as `caddyed_admin_token`) remain for people; keys are for
  agents and automation.
- A 401 body is honest (`code: "unauthenticated"`); a 503 with
  `code: "database-not-configured"` means the deployment has no database and
  NOTHING was saved -- never treat it as success.

## Guard rails -- what keeps agents from breaking things

| Guard | Mechanism |
|---|---|
| Content-only scopes | Keys can only hold the content permissions (articles, vehicle records, settings copy, Ed's picks, SEO). CRM powers and anything destructive are **not grantable** -- `create` refuses them by name. |
| Human-only endpoints | Customer erasure and staff management require the `admin` ROLE; lead merging requires human roles. A key is refused by role before any logic runs. |
| No direct site mutation | Content changes travel the queue -> `npm run ...:apply` -> deploy workflow. A key cannot write the repository, run builds, or deploy. |
| Live writes are few and audited | Settings copy and pick toggles are the only live effects; both land in the audit log attributed to the agent. |
| Instant revocation + expiry | `revoke` stops the next request; keys can carry an expiry date. |
| No escalation | `agents_read`/`agents_write` can never be granted; a key lacking a scope gets a 403 that names it (`insufficient_scope` on picks). |

## Content endpoints -- articles, specials, testimonials

One machine, three types. Each has its own endpoint, queue table, field
spec and permissions; the shapes below are identical across them:

| type | endpoint | permissions (read / write) | apply |
|---|---|---|---|
| articles | `articles-admin` | `articles_read` / `articles_write` | `npm run articles:apply` |
| specials | `specials-admin` | `specials_read` / `specials_write` | `npm run specials:apply` |
| testimonials | `testimonials-admin` | `testimonials_read` / `testimonials_write` | `npm run testimonials:apply` |

GET lists the queue AND returns `fields` -- the type's field spec (key,
kind, label, limits) from the same definition the validator and the admin
editor use, so an agent can build a form or a prompt from the reply alone.
POST `save` / `clear` behave as below for every type.

### articles-admin -- write articles

`/.netlify/functions/articles-admin`

| Request | Permissions | What it does |
|---|---|---|
| `GET` | `articles_read` | Lists every queued article row. |
| `POST {action:"save", slug, fields}` | `articles_write` | Validates, merges into the row, marks it pending. |
| `POST {action:"clear", slug}` | `articles_write` | Removes the queue row. |

Fields (all optional on a merge; `title` must exist on the row after the
save):

| field | limits | notes |
|---|---|---|
| `title` | <=120 chars | required |
| `description` | <=200 chars | the meta description; aim 70-160 |
| `date` | `YYYY-MM-DD` | defaults to today in the applier |
| `author` | <=60 chars | shown on the page |
| `tags` | <=8, each <=40 chars | array, or a comma string |
| `image` | <=200 chars | a path like `img/caddy-ed.jpg` |
| `body` | <=60000 chars | Markdown |
| `published` | boolean | `false` writes `draft: true`; invisible on the site |

The reply distinguishes SAVED from PUBLISHED, in words, always:

```json
{
  "saved": true,
  "row": { "slug": "fall-lease-offers", "fields": { "...": "..." }, "status": "pending" },
  "apply": "Queued, not published. Apply with: npm run articles:apply, then deploy."
}
```

`status` is `pending` (queued) or `applied` (a file exists in
`site/content/articles/`; the next deploy publishes it). An agent that cannot
run `npm run articles:apply` should say so rather than implying the article
is live. Drafts apply as `draft: true` and are excluded from the site and
sitemap until `published` flips to true.

```bash
curl -sS -X POST https://caddyed.com/.netlify/functions/articles-admin \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"save","slug":"fall-lease-offers",
       "fields":{"title":"Fall lease offers, explained",
                 "description":"What Cadillac lease offers in Charlotte actually mean for a monthly payment, in plain numbers.",
                 "tags":["leasing","charlotte"],
                 "body":"## The short version\n\n..."}}'
```

## seo-score -- the same scorer the admin shows

`/.netlify/functions/seo-score` -- `POST {"path":"/articles/fall-lease-offers/"}`
or `GET ?path=...`; needs `seo_read`. The page is fetched from the SAME HOST
the request arrives on, so only this site's pages can be scored (no URL
parameter that could be pointed elsewhere).

The reply carries `score` (0-100), `checks[]` (id, label, pass, weight,
advice), `stats` (title/description lengths, H1/H2 counts, words, internal
links, alt coverage, schema types, city mentions) and `ok:false` with a
reason for a page that cannot be fetched -- a 404 is reported as a 404, not
scored as zero.

What it checks is deterministic from the served HTML: title and description
length, a single H1, heading structure, canonical, Open Graph, image alt
coverage, internal links, valid JSON-LD, the schema type the section should
carry, and local signals (the service area named in the copy). It is an
on-page audit, not a claim about rankings.

## inventory-admin -- vehicle records

`/.netlify/functions/inventory-admin` -- `GET` (`inventory_read`) lists the
edit queue; `POST {action:"save", slug, fields}` / `{action:"clear"}`
(`inventory_write`). Editable: price, price_note, subtitle, mileage, colours,
body style, drivetrain, transmission, engine, mpg, status, available,
unavailable_reason, description. Identity fields (title, year, make, model,
trim, VIN, stock, image) are the feed's and are refused. Same apply model:
`npm run inventory:sync -- --apply-edits` (no crawl) or the next full sync;
the reply says queued-not-published.

## vehicle-features -- Ed's picks (LIVE, no deploy)

`/.netlify/functions/vehicle-features` -- `GET` is public (the site's own
pages read it); `POST {slug, featured:true|false}` needs a staff token. This
is the one control that takes effect on the next page load.

## site-settings -- the copy layer

`/.netlify/functions/site-settings` -- `GET` serves public rows; `PUT`
(`preferences_write`) writes allowlisted keys only (signage, home hero,
footer tagline, banner). Details in docs/ADMIN.md.

## Suggested MCP tool shapes

An MCP server over these endpoints needs no state; four tools cover the
content workflow:

| tool | wraps | description for the model |
|---|---|---|
| `articles_upsert` | articles-admin save | Write or update an article (queued; publishing happens on the site's own cadence). |
| `articles_list` | articles-admin GET | List queued articles with status. |
| `seo_score_page` | seo-score | Score one page of caddyed.com and return the failing checks with advice. |
| `inventory_edit` | inventory-admin save/clear | Queue a vehicle-record change (price, description, availability). |

Give the model the endpoint's `apply` string back in its tool result -- it is
written to be the truth about when the change takes effect.
