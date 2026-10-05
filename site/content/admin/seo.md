---
title: "SEO Audit"
description: "Score any page — and get the same answer an agent would."
layout: "admin"
styles:
  - components/admin.css
  - components/settings.css
  - components/seo-admin.css
scripts:
  - admin-seo.js
---

<p class="lede">
  Scores come from the page as the crawler sees it: title and description
  length, a single H1, heading structure, canonical, Open Graph, image alt
  coverage, internal links, structured data, and the local signals
  (Charlotte / Pineville in the copy). Advice for anything failing sits on
  the check itself. The same scorer runs behind
  <code>/.netlify/functions/seo-score</code> for agents —
  <code>docs/CONTENT-API.md</code>.
</p>

<div id="seo-admin-status" class="settings-status" role="status" hidden></div>
<div id="seo-admin">
  <div class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading the page list…</p>
  </div>
</div>

<noscript>
  <p class="settings-note">This page needs JavaScript. Agents can call the
  endpoint directly.</p>
</noscript>
