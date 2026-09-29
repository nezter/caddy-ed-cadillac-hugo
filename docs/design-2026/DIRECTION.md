# DIRECTION.md — "Night Showroom", the 2026 system

The layout work is done in `PAGE-LAYOUTS.md`. This file is the design system that holds it
together: what changes, what stays, and the exact values. It is written so it can be ported
straight into `site/assets/css/` and `site/layouts/`.

---

## 1. The idea

The site today is a light brochure. It is competent and it reads like a template: hero, six
cards, three identical feature boxes, white ground throughout. Nothing on it is wrong, and
nothing on it is memorable.

The 2026 direction changes one thing — where the light comes from.

**A Cadillac should be lit against black.** So the emotional surfaces go dark and cinematic: the
hero, the vehicle detail page, the "why people buy from Ed" block, the closing calls. The
surfaces where people actually *read and compare* — inventory, financing, service, policy —
stay light and fast. The contrast between the two is the design.

Three supporting moves do the rest:

1. **Type carries the luxury.** A tight grotesk at display scale for headlines; a high-contrast
   serif for the editorial moments and Ed's voice; monospace for the small print that used to be
   shouty capitals. The current build uses one system font for everything, which is why it reads
   as a template.
2. **Bronze becomes a metal, not a swatch.** Today `--brand-bronze` barely appears. In the
   direction it is hairlines, micro-labels, the numbers that matter, and the light-bar motif.
3. **Every photograph lives in a plate.** One frame, one crop rule, one scrim. This is what makes
   35 inconsistent vendor photographs read as a deliberate collection — see `IMAGERY.md` §4.

---

## 2. Surfaces

| Token | Value | Used for |
| --- | --- | --- |
| `--ink-0` | `#07090b` | Hero base, footer, deep CTA strips |
| `--ink-1` | `#0b0d10` | Default stage (= existing `--brand-ink`) |
| `--ink-2` | `#12161b` | Tiles and cards on a stage, sub-sections |
| `--ink-3` | `#1a1f26` | Raised elements inside tiles, inputs on dark |
| `--ink-4` | `#232a33` | Hover states on dark |
| light ground | `#ffffff` / `#fafafa` | Inventory, financing, trade-in, service, policy, admin |
| `--bronze-line` | `rgba(182,159,88,.42)` | Hairlines, borders, section markers |
| `--bronze-hi` | `#e6d6a6` | Prices, links on dark, focus ring |
| `--on-ink` / `--on-ink-muted` / `--on-ink-faint` | `#f4f2ee` / `#9aa1ad` / `#6f7683` | Text on dark, three levels |

Cadillac red is unchanged (`#c8102e`, hover `#e11d3c`) and is used **only** for the primary
action and the "New" tag. It was being used as a link colour in a few places; on dark it becomes
the single loudest thing on the page, so it is rationed.

**Rule:** a section is either light or dark, never graduated between the two. The boundary is
always a hairline — bronze on dark, `#e7e9ee` on light.

---

## 3. Type

Self-hosted, no third-party requests:

| Role | Face | Where |
| --- | --- | --- |
| Display | **Inter Tight** 400–900 (variable, 45 KB) | Headlines, prices, numbers, card titles |
| Editorial | **Instrument Serif** 400 + italic | Pull quotes, the hero's one italic word, Ed's signature |
| UI | system stack (unchanged) | Body, controls, everything functional |
| Mono | system stack (unchanged) | Eyebrows, spec keys, stock numbers, counts, timestamps |

Files ship in `assets/fonts/`. They are OFL-licensed and free to self-host.

Scale: `--d1` hero/page display `clamp(2.6rem, 1.2rem + 5.4vw, 6.2rem)`; `--d2` section
`clamp(1.9rem, 1.1rem + 2.9vw, 3.5rem)`; `--d3` module head `clamp(1.35rem, 1.05rem + 1.1vw,
1.9rem)`.

Two rules that matter more than the choices:

- **Display tracking is negative** (`-0.032em`) and leading is tight (`0.94`). Large type with
  default tracking is the fastest way to look dated.
- **Every number is tabular.** Prices, mileage, counts, stock numbers. Prices use the display
  face at weight 600 in bronze. This is what creates the rhythm down an inventory grid.

The existing `--font-display: var(--font-sans)` alias in `main.css` is the hook: set it to the
display stack and most of the site picks it up at once.

---

## 4. The components worth naming

| Component | What it is | Where it is used |
| --- | --- | --- |
| **Plate** | 16:10 frame, 14px radius, dark surround, bottom scrim, condition tag top-left, model + price on the scrim | Every photograph on the site |
| **Proof ribbon** | One hairline-divided row of four value/label pairs | Home, vehicle detail, test drive |
| **Bento tile** | Dark card on a stage; `tile--bronze` for the one that should lead | Home (the dock), About, financing |
| **Dock** | Two-tile grid: fresh stock beside the social feed | Home |
| **Ask panel** | Glass card, docked beside the hero, with a vehicle field that other modules can pre-fill | Home, vehicle detail, inventory |
| **Action rail** | Sticky right column: price → mini-specs → one red primary → three ghost actions → phone → a note from Ed | Vehicle detail |
| **"What people ask"** | Four Q&A rows written as a buyer's own sentences | Vehicle detail (and any high-consideration page) |
| **Light blade** | 2px bronze vertical gradient on a section edge | Section marker; the Cadillac vertical-lighting motif, abstracted |
| **Light bar** | A three-bar bronze stack, `.ltbar`, set inline after an eyebrow | The brand signature, collision-free wherever a section starts. A larger absolutely-positioned variant (`.hero26__bars`) exists for a hero that has room for it |
| **Kicker** | Numbered section head: mono index, mono caps label, hairline rule | Every section on every dark page — gives the page a rhythm |
| **Seal** | 44px bronze-ringed monogram plus two mono lines | Ed's signature block, closing quote, hero |
| **Gallery rail** | Vertical thumb strip beside a 16:10 main plate | Vehicle detail |
| **Compare table** | Dark, hairline rules, tabular numerals | Vehicle detail, shortlist compare |
| **Mobile action bar** | Fixed bottom bar, two buttons, dark glass | Every page below 760px |
| **Arrival tag** | Bronze plate tag, distinct from New / Certified | Stock that landed this week |
| **Live dot** | Slow bronze pulse on the sync line, reduced-motion gated | Home fleet, inventory |
| **Grain** | 5.5% fractal-noise overlay, `mix-blend-mode: overlay` | All dark stages only |
| **Spotlight** | Bronze radial rim plus vignette (`.spot`), laid over a hero or a full-bleed plate | Hero, Ed's pick band. This is what gives a flat studio render a light source |

---

## 5. Motion

Short, few, and gated.

| Effect | Where | Detail |
| --- | --- | --- |
| Reveal | Cards, tiles, text blocks | 16px rise + fade, 700ms `cubic-bezier(.16,1,.3,1)`, 40–45ms stagger, triggered at -8% from the viewport bottom |
| Plate wipe | The vehicle gallery's main image | `clip-path` inset from 12% to 0 over 900ms |
| Card hover | Vehicle cards | Image `scale(1.035)`, 700ms; no card lift, no shadow bloom |
| Button hover | All | `translateY(-1px)`, 250ms |

`prefers-reduced-motion: reduce` disables all four. There is no scroll-jacking, no parallax, no
count-up animation on numbers (the numbers are the point — they should be readable immediately),
and nothing animates on the light browsing surfaces beyond the hover states.

---

## 6. Accessibility, unchanged and non-negotiable

The current build has a real baseline — skip link, focus rings, `aria-live` on dynamic regions,
labelled inputs, real tablist with arrow keys, meaningful alt text, decorative images at `alt=""`.
Keep all of it. Two additions the direction requires:

- Focus rings on dark surfaces use `--bronze-hi` (the existing `--focus` blue is invisible on ink).
- The dark stages need contrast checking for the three text levels. `--on-ink-muted` (`#9aa1ad`)
  on `--ink-1` (`#0b0d10`) is roughly 7:1 and passes; `--on-ink-faint` (`#6f7683`) is about 4.2:1
  and is therefore **labels only, never body copy**.

---

## 7. Porting it into Hugo

Nothing in the direction needs a new route, a new function or a new dependency.

1. Copy `assets/css/direct-2026.css` → `site/assets/css/direct-2026.css` and add it to the
   `styles:` key in the existing `partials/assets.html` pipeline. It is additive: no existing
   selector is redefined, so the site does not change appearance until a layout opts in.
2. Copy `assets/fonts/` → `site/assets/fonts/` (Hugo will fingerprint them; the `@font-face`
   paths in the CSS are relative and expect that neighbour).
3. Set `--font-display` to the display stack in `main.css` — one line, site-wide effect.
4. Port the layouts template by template, in this order: **home → vehicle single → about →
   inventory list**. Those four are 80% of the site's traffic and the four that are built here.
5. Keep `connect.css` / `connect.js` as they are; the hub is restyled, not replaced.
6. `hugo` on the CI host (`10.1.0.25` via `ci/run.sh`) as usual — no build change.

The mockups in `mockups/` are static HTML with no Hugo template syntax, deliberately: they are
the target to port to, not a diff to apply.
