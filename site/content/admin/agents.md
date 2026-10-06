---
title: "Agent access"
description: "Identities for LLM agents — scoped, visible, revocable."
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
  - components/agents-admin.css
scripts:
  - admin-agents.js
---

<p class="lede">
  An agent key is a full identity for an LLM agent: a name, a set of
  permissions (“scopes”), an optional expiry, and an instant off switch.
  The secret is shown <strong>once</strong> at creation and stored only as a
  hash — nobody, including this page, can read it back. Every action the
  key takes is audited as the agent, never as a person.
</p>

<div id="agents-admin-status" class="settings-status" role="status" hidden></div>
<div id="agents-admin">
  <div class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading agent keys…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">This page needs JavaScript. Keys live in the
  <code>agent_keys</code> table; secrets are never stored, so a key cannot be
  recovered without the page.</p>
</noscript>

## How an agent connects

Create a key, copy the secret once, and give it to the agent as:

```
Authorization: Bearer cdy1_...
```

The scopes you tick are the exact permissions the key can use, drawn from
the site’s <strong>content</strong> permissions — articles, vehicle
records, settings copy, Ed’s picks, SEO. That list is content-only by
construction: CRM powers and anything destructive (customer erasure, staff
management, lead merging) cannot be granted to a key at all, and the
endpoints behind them additionally require human roles no key can hold.
Content changes made by keys travel the same gated workflows as everyone
else’s — queued, applied, deployed — and every action is audited as
the agent. Revoking takes effect on the next request. The full contract is
in `docs/CONTENT-API.md`.
