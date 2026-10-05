# Content API -- for LLM agents and automation

Every admin capability with a JSON surface is callable by an agent. This file
is the contract: what to send, what comes back, and what the reply MEANS.
No MCP server ships in this repository -- these endpoints are the stable
interface, and an MCP wrapper is a thin adapter over them (see the last
section for the tool shapes we would suggest).

## Authentication

- Staff session token, sent as `Authorization: Bearer <token>`.
- Tokens come from the sign-in flow at `/admin/sign-in/`; the admin pages
  keep theirs in `localStorage` under `caddyed_admin_token`.
- Permissions are per-rep (`sales_reps.permissions`). What each endpoint
  needs is stated below; an agent's operator grants them in `/admin/staff`.
- A 401 body is honest about it (`code: "unauthenticated"`); a 503 with
  `code: "database-not-configured"` means the deployment has no database and
  NOTHING was saved -- never treat it as success.

## articles-admin -- write articles

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
