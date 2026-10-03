# IMAGERY.md — the photographic programme

The layout is close. The photography is what is holding the site back, and it is holding it
back in five specific, fixable ways. This file is the diagnosis, then the shot list, then the
recipe for what can be fixed without a camera.

Everything below was assessed against the **live rendered site** (`10.1.0.81:8090`, fetched
27 September 2026) and the actual image files it serves. Verdicts come from looking at the
real assets, not from the filenames.

---

## 1. What is actually wrong

### 1.1 The hero is a render, and it is under-lit

`/img/home-jumbotron` — a black Escalade-V, front three-quarter, on a flat grey sweep.

- The car is **underexposed to the point of losing its shape**. Grille, headlights and tyres
  merge into one dark mass; the wheels disappear into the arches. On a phone in daylight the
  whole hero reads as a black rectangle with red brake calipers.
- The background is a **flat grey void**. No location, no floor reflection, no shadow
  direction, no time of day. It is a configurator render, not a photograph of a place.
- It was shot (or rendered) slightly low and centred, which gives it no energy.

This is the single largest asset on the site and it is the weakest thing on it. It is also the
easiest to improve, because the *shape* is right — a dark car on a dark ground is exactly what
the "Night Showroom" direction wants. It just needs light.

### 1.2 Ed's portrait actively works against him

`/img/caddy-ed` — the photograph on the home page and (in effect) the whole personal brand.

- **Raised fists.** Whatever the intent, on a sales page this reads as confrontational, and it
  is the first thing the eye lands on. It is the opposite of "no pressure."
- **Direct on-camera flash** — flat, hot, no modelling on the face, blown highlights.
- A ridged beige wall behind him, plus **a red object clipping the top edge of the frame**.
- Soft focus, low resolution, and the crop fights the background lines.
- The jacket has a Cadillac logo and his name embroidered; that is good, and it is the one thing
  worth keeping.

This is the page where "display Caddy Ed in a good light" is literally the job, and it is
currently the weakest asset on the site. It is one reshoot — a single hour.

**Resolved 2026-10:** the reshoot landed as the 2026 sitting -- replaced on the home
page and About; the interim bronze grade retired with the old frame. See HANDOFF.md.

### 1.3 Every vehicle photo is a vendor studio shot, and they all show the same seams

All 35 inventory photographs come from the same feed (VIN-named files, e.g.
`1gys9jkl2tr376799-…jpg`). They are consistent with each other, which is good, but the
consistency is the wrong kind:

- **A black banner across the bottom with "Cadillac South Charlotte" and an address baked into
  the pixels.** This appears on a site whose footer says *10725 Pineville Rd, Pineville NC* and
  whose contact page says *123 Luxury Lane, Charlotte NC 28277*. Three addresses for one site —
  and one of them is burned into 35 photographs where it cannot be edited.
- **A busy checkered or tiled floor** that competes with the car for attention.
- **A visible drop-ceiling grid and ceiling light fixtures** in the background, reflected in
  windscreens.
- Elevated, centred camera height — the "inventory" angle, not the "look at this car" angle.
- Flat, even, shadowless light on white and silver cars, which flattens the bodywork.
- Blank front number plate, brake dust on wheels, and in at least one frame the car sits tight
  against the frame edge.

None of this is Ed's fault — it is what the inventory provider supplies. But it is what is
being presented as if it were a luxury brand's imagery.

### 1.4 There is no interior, no detail, and no person with a car

Thirty-five cars, and not one photograph shows a seat, a screen, a wheel, a badge, or a
customer. For a Cadillac — a brand that sells on interior materials and technology — that is a
large gap. Buying a $96,000 SUV from exterior-only studio shots is a real barrier.

### 1.5 The photographs were shot for a white page and are being asked to sit on a dark one

This is a system problem, not a photography problem, and it is fixed in CSS. But it is why the
current light layout was the right call: white-wall studio photos float badly on dark surfaces.

**The fix is the "plate"** (see §4) — one frame, one scrim, one crop rule — which makes
thirty-five mismatched source photos read as a single deliberate set. This is how car
marketplaces with worse source photography than yours look expensive.

---

## 2. The fix, in order of cost

| # | Action | Cost | Impact |
| --- | --- | --- | --- |
| 1 | Ship the CSS **plate** system (already in the mockups) | free | Makes every existing photo read as one set; unifies 35 mismatched images instantly |
| 2 | **Grade the existing portrait** to a bronze duotone as an interim (shown in the About mockup) | free | Turns a flash snapshot into something that looks intentional; buys time for a reshoot |
| 3 | **Retouch the hero** — lift shadows, dodge the body lines, separate the wheels and grille, add a floor reflection and a gradient behind the car | 1–2 hours | Fixes the largest image on the site |
| 4 | **Reshoot Ed** — one session, one location | half a day | Fixes the personal brand, which is the whole site |
| 5 | **Reshoot the hero** on location — the car in a real place, at dusk | half a day | Gives the site a hero that looks like a campaign, not a render |
| 6 | **Interior and detail set** — five frames per car | 1 day per 10 cars | Removes the biggest objection to buying online |
| 7 | **Re-shoot the top 6 hero cars** on a proper seamless floor and template the rest into it | 1 day | Replaces the checkered floor and the baked-in banner for the cars that get seen |

Rule of thumb: **1, 2 and 3 cost nothing but an afternoon and change the site more than anything
else.** Do those first.

---

## 3. Shot list

### 3.1 Ed — portrait (priority one)

| | |
| --- | --- |
| Location | Showroom floor, or the delivery bay, with a Cadillac out of focus behind him |
| Lens / distance | 85mm equivalent, head-and-shoulders to mid-torso, shot from chest height — not from below |
| Light | Window or open showroom light from 45° front-left. **No on-camera flash.** A reflector or a white wall on the right to fill |
| Pose | Relaxed. Arms crossed, or hands in pockets, or holding a set of keys. Weight on the back foot. Looking at the lens, or lightly off it |
| Wardrobe | The black Cadillac jacket with his name — keep it. It is the best brand asset on the page |
| Framing | Chest-up, eyes on the upper third, **clean left or right third for type**. Shoot both orientations |
| Deliver | One tight portrait (hero / About), one wider environmental frame (home page column), one landscape candid of him with a customer or beside a car |
| Do not | Raised fists, direct flash, walls with strong repeating lines, anything clipping the frame edge |

### 3.2 Hero — the car, on location (priority two)

| | |
| --- | --- |
| Time | Dusk, or after dark under controlled light. The 20 minutes after sunset is the whole trick — sky still has colour, the car has separation |
| Location | Wet or polished asphalt; a low building with lit glass behind; a clean architectural wall. Something that says *place* |
| Camera | Low — bonnet height or below. 35–50mm. Shoot three-quarter front and direct side |
| Light | One strong source for the body line, one for a rim along the roof and the shoulder. Never flat front-on light on a black car |
| Framing | Car placed on the right or the left third, **the other third deliberately empty** for headline type. Landscape, and a tall crop for mobile |
| Deliver | 1920w, 1600w, 1024w, 640w in avif/webp/jpg (Hugo already does this from a master) |
| Do not | Flat grey studio sweeps, dead-centre composition, crushed blacks with no highlight definition |

### 3.3 Inventory — the standard template (priority three)

One template, applied to every car. This is what makes a dealer lot look like a collection.

| | |
| --- | --- |
| Angle | Front three-quarter, 15° off centre, consistent across every car |
| Height | **Headlight height.** Not elevated. Elevated reads as inventory; level reads as a portrait |
| Lens | 35–50mm equivalent, no wide-angle distortion on the grille |
| Setting | Seamless mid-grey floor and a soft gradient wall. If a floor sweep is impossible, a clean paved apron with no markings |
| Light | One large overhead source and one low rim light for a highlight along the shoulder line |
| Frame | Car occupies a fixed 78% of the width, consistently placed. Same margin on every car |
| Clean-up | Wheels cleaned, brake dust removed. A neutral branded plate in the front mount — never a blank |
| **Never** | Bake text, a store name, or an address into the pixels. That rule alone would have saved thirty-five images |

### 3.4 Interiors and details (priority four)

Five per car, same five every time, so the gallery is predictable:

1. Driver's seat and door card, door open
2. Centre screen and console, lit, ignition on
3. Wheel and tyre, close
4. Rear three-quarter exterior
5. The badge, or one detail that makes that trim special

---

## 4. The plate system (ships now, in CSS)

Already implemented in `assets/css/direct-2026.css` and visible in all four mockups.

```
.plate      one 16:10 frame, 14px radius, dark surround, bottom scrim
.plate__tag condition chip, top-left ("New" in Cadillac red, "Certified" / "Pre-owned" in ink)
.plate__meta model name (grotesk, white) + price (tabular numerals, bronze) on the scrim
.plate--clean   no scrim, for studio-white photos on light surfaces
```

Why it works: the frame and the scrim do the normalising. Uneven crops, different wall
colours, different floor treatments and different exposure all get pulled into one rectangle
with one dark gradient over the bottom third. The eye stops comparing photographs and starts
comparing cars.

The two rules that matter:

- **The plate never changes size.** Same aspect ratio, same radius, same tag position for every
  vehicle on the site.
- **Price is always tabular numerals in bronze.** It becomes a visual rhythm down a grid, and it
  is the first thing anyone scans for.

---

## 5. Retouch recipe (for assets that cannot be reshot yet)

**Hero** — lift shadows to about +35, recover highlights, then dodge the shoulder line, the
grille surround and the wheel spokes so the car has edges. Add a soft elliptical light behind
the car and a faint floor reflection. Warm the highlights slightly; keep the blacks neutral, not
blue.

**Portrait** — desaturate to grey, then map the midtones to a bronze tint
(`#cdb072` → `#6d5a2c`). Crop in tight enough to lose the wall ridges and the red object at the
top edge. This is exactly what the About mockup shows, and it is a two-minute job in any editor.

**Inventory** — crop to the plate template with the car placed identically, mask or clone out
the bottom banner, neutralise the white balance, lift shadows, add ~8% contrast, then a soft
vignette so the frame sits on a dark surface without a hard white edge.

---

## 6. Four data problems the imagery exposes

Fix these while you are in there — they are trust problems, not design problems.

| Issue | Where | What is wrong |
| --- | --- | --- |
| Three different addresses | Footer (`10725 Pineville Rd, Pineville NC 28134`), contact page (`123 Luxury Lane, Charlotte NC 28277`), and the banner burned into all 32 vehicle photos (`Cadillac South Charlotte`) | A buyer who checks will find all three. Pick one and change everything else |
| Two different phone numbers | Header, footer and vehicle pages use `803-431-6180`; the contact page and the lead form use `(704) 555-1234`; the home page's "Text Ed" link is a malformed `tel:` URL with the number repeated four times, and points at `sms:+17045557890` | `(704) 555-1234` is a placeholder pattern. On a page whose only job is contact, this is the most expensive bug on the site |
| Opening hours disagree | Header says `Mon–Fri 9–7 · Sat 9–5`; the contact page says `Sat 10–6, Sun closed` | Same class of problem |
| **Cadillac count vs all-stock count** | Home page says "showing **6 of 32** in stock" (Cadillacs only); `/inventory/` says "Showing 24 of **35** vehicles" (everything, including three trade-ins) | Not a data defect — the home template filters on `make = CADILLAC`. But both are labelled just "in stock", so they read as contradictory. Say "6 of 32 Cadillacs" and it is clear |

Confirmed on the live pages, 28 September 2026. The saved plate treatment and the 16:10 frame now
sit on all 35 vehicle photos. The "32" elsewhere in this document is the count of Cadillacs
specifically, which is also what the home page counts.

The contact mockup is built (`mockups/contact.html`) and resolves the three contact conflicts the
way the footer states them, with the decision written on the page itself. That is a proposal, not
a confirmed fact — if the contact page's values are the real ones, the mockup needs three values
changed and the footer needs six.
