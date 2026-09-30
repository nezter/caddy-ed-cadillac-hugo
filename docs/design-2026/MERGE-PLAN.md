# MERGE-PLAN — reconciling 52 local commits with 19 on the remote

Written after fetching `origin/modernize/netlify-build-2026` and attempting the
merge. **The merge was attempted and deliberately aborted.** This file records
what is on each side, why the merge is not a fast-forward or a blind "take
mine", and the order to reconcile it in.

State at the time of writing:

| | |
| --- | --- |
| Local branch | `modernize/netlify-build-2026` at `0f3d061`, tree clean, 52 commits |
| Remote branch | `origin/modernize/netlify-build-2026` at `ed8c4b8`, 19 commits |
| Common ancestor | `0b9c2ef` |
| Divergence | 52 local, 19 remote — **not** a fast-forward |
| Merge attempt | 13 conflicted files, aborted before committing anything |

---

## What the remote has that the local branch does not

Nineteen commits, authored in parallel. The ones that matter here:

| Commit | What it does | Relationship to my work |
| --- | --- | --- |
| `9b60f6e` | "the site was dialling a fictional number on every page" — found `(704) 555-1234` as a working `tel:` link in the header of every page | **The same defect I fixed**, found independently |
| `328d592` | "one address, one phone link — the site was showing four streets". Adds `partials/phone-href.html`; address confirmed with the owner | **A better fix than mine.** I edited templates; they built one shared partial |
| `f34ee7f` | "Compare and Shortlist are two buttons, and only one of them worked" — rewrites `vehicleComparison.js`, deletes `vehicle-comparison.js` | **Supersedes my tray work.** The comparison feature was rewritten; class names may have moved |
| `4ffa05a` | "three more forms posting to /api/, and a gate for the whole class" | Affects the endpoint my new forms use |
| `a461471` | function bundle 317 MB → 46 MB | Perf, no overlap |
| `3f75e6b` | copy an admin can change during business hours, no build | Admin + CMS, no overlap |
| `f4b8818` | a git push rebuilds the site on our host, never Netlify, never prod | CI, no overlap |
| `9d36c41`, `1fe8d47`, `9caf525`, `ed8c4b8` | CI made runnable, blocking leg defined, one runner one report | CI, no overlap |
| `b687693` | a module graph for the front end | Front-end structure |
| `3b4d380` | one meaning for "Ed's pick", 107 KB of code nothing loaded | Affects index.html and the pick badge |
| `a31d35b`, `e2e…`, `a294b0d`, `c3e2ded`, `e612bed` | test and booking fixes | Tests, no overlap |

**The important pattern:** two agents fixed the same contact defects at the same
time, and theirs is structurally better — one partial instead of scattered
edits. That is not a reason to take theirs everywhere; it is a reason to take
theirs *there* and mine *where mine is the design*.

---

## Why the merge was aborted rather than finished

Thirteen conflicts, and several are not "pick a side" conflicts:

```
site/content/contact/_index.md          both changed the contact data
site/content/lead-form.md               both changed the endpoint text
site/data/contact.yml                   I deleted it; they modified it
site/layouts/about/list.html            I rewrote; they changed the phone
site/layouts/contact/list.html          I rewrote; they changed the phone
site/layouts/inventory/single.html      I rewrote; they changed the phone
site/layouts/partials/footer.html       I restyled; they changed the phone
site/layouts/partials/header.html       I restyled; they changed the phone
site/layouts/partials/inventory-filters.html   I rewrote; they changed 8 lines
site/layouts/partials/stock-alerts.html I restyled; they changed the phone
site/layouts/section/inventory.html     I rewrote entirely; they changed 17 lines
site/layouts/shortcodes/customer-login-form.html  both changed the phone
site/layouts/test-drive/single.html     I ported; they changed the phone
```

Nearly every conflict is the same shape: **I rewrote a file for design, they
touched the same file to fix the phone number.** Neither version is right on its
own — taking mine loses their fix, taking theirs loses the design.

Resolving thirteen of those correctly is a careful, file-by-file job with a
build and a render after each. Doing it at the end of a long session, blind,
would have produced exactly the half-reconciled state that is worse than no
merge at all. So: aborted, tree clean, nothing committed.

---

## The reconciliation policy

For every conflicted file:

1. **Take their functional fix.** `phone-href.html` and its usage, the form
   endpoints, the compare/shortlist contract, the "Ed's pick" meaning. These are
   correctness, and correctness beats design.
2. **Keep my design layer.** `direct-2026.css` is not conflicted — it is
   additive and no remote commit touches it. The rebuilt
   `section/inventory.html`, the card titles, the head band and the tray styling
   stay, with their fixes ported into them.
3. **Where the two disagree about markup**, port their fix into my markup rather
   than reverting the file: e.g. replace my inline `tel:` construction with
   `{{ partial "phone-href.html" … }}` inside the templates I rewrote.

## The order to do it in

1. **Merge with `--no-commit` again**, and resolve the six template files where
   the conflict is purely the phone: about, contact, inventory/single, footer,
   header, test-drive, customer-login-form. Each is "keep mine, add their
   partial call". Build after each.
2. **Reconcile the two rewrites**: `section/inventory.html` and
   `partials/inventory-filters.html`. Read their 17 and 8 changed lines first —
   they may carry fixes my rewrite dropped.
3. **The content and data files**: take their confirmed address and phone
   (`10725 Pineville Rd, Pineville, NC 28134` / `803-431-6180`), and decide
   whether `site/data/contact.yml` comes back — they modified it rather than
   deleting it, so they may still have a consumer for it.
4. **Compare and Shortlist** (`f34ee7f`): take their rewrite wholesale, then
   re-apply the tray styling against whatever classes it now uses.
5. **Build, render every page, and only then commit the merge.**

## What must not be lost in the merge

My side, worth checking after: the full-width inventory head, the rebuilt
inventory template (249 lines against 297, duplicates removed), the two-column
specification, the closing band on every list page, the reading-surface pass,
`Car` structured data on 35 vehicle pages, `AutoDealer` on the home page, the
comparison-tray styling, and the gate fixes in the filter script.

Their side, worth checking after: `phone-href.html` used everywhere a phone
appears, the corrected `/api/` form endpoints, the compare/shortlist split, the
CI workflows, and the `Car`/`AutoDealer` equivalents if they added any.
