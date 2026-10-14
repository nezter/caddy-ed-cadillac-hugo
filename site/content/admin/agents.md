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

<div id="agents-admin-status" class="settings-status" role="status" hidden></div>
<div id="agents-admin">
  <div class="settings-progress">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading agent keys…</p>
  </div>
</div>

<noscript>
    <p class="settings-note">This control needs JavaScript.</p>
  </noscript>

