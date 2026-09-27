#!/usr/bin/env python3
"""
make-brand-assets.py -- regenerate the three brand images that were left behind
by the Kaldi Coffee starter template.

THE PROBLEM
-----------
Three shipped images on a Cadillac dealership site came from a coffee-company
starter template:

  static/img/og-image.jpg    "KALDI -- Great coffee with a conscience", with a
                             row of coffee cups, at 1200x630. This is what
                             EVERY SHARE of caddyed.com looks like -- iMessage,
                             WhatsApp, email, Facebook, Slack. When Ed texted a
                             client "look at this Escalade:
                             caddyed.com/inventory/...", the client saw a coffee
                             advertisement. That is the single most damaging
                             thing on this site and it is invisible in a browser.

  assets/img/home-jumbotron.jpg  a macro photograph of spilled coffee beans on
                             an espresso machine, used as the home page hero at
                             full width, with alt text reading "A Cadillac on
                             display at Caddy Ed Cadillac, South Charlotte".

  static/img/logo.svg       renders as the word "KALDI" in vector paths, in the
                             header of every page.

All three are replaced here from the dealership's own photography and the
brand palette already in main.css. Nothing is invented: the hero and the
social card are built from a real vehicle in assets/vehicles/.
"""

import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The brand palette, from site/assets/css/main.css. Keeping these here and in
# main.css is a duplication, but a build script cannot import a CSS custom
# property, and a wrong hex is a wrong hex.
INK = (11, 13, 16)          # --brand-ink
RED = (200, 16, 46)         # --brand-red
BRONZE = (182, 159, 88)     # --brand-bronze
CREAM = (250, 249, 247)     # --brand-cream

FONT_PATH = "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf"


def font(size, weight=700):
    """Noto Sans variable, instantiated at a weight."""
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def load_hero():
    """The hero photograph: a real Cadillac in the showroom.

    Chosen by size, preferring the largest landscape image available, because
    the hero is rendered full-bleed and a portrait crop of a showroom shot looks
    like a mistake.
    """
    vdir = os.path.join(ROOT, "site", "assets", "vehicles")
    best, best_area = None, 0
    for name in os.listdir(vdir):
        if not name.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        p = os.path.join(vdir, name)
        try:
            with Image.open(p) as im:
                w, h = im.size
        except Exception:
            continue
        if w < 1000 or h < 600:
            continue
        # Landscape, and as much of it as we can get.
        if w / h < 1.2:
            continue
        area = w * h
        if area > best_area:
            best, best_area = p, area
    if not best:
        raise SystemExit("no landscape vehicle photo found in site/assets/vehicles")
    return best


def smart_crop(im, target_w, target_h, focus=(0.5, 0.45)):
    """Cover-crop to the target aspect ratio.

    focus is (x, y) in 0..1. Vehicles sit low in a showroom frame with the
    dealer sign along the bottom edge, so the default focus is above centre --
    centring would crop the roofline off and put the address band in the middle.
    """
    im = im.convert("RGB")
    sw, sh = im.size
    scale = max(target_w / sw, target_h / sh)
    nw, nh = max(target_w, int(sw * scale + 0.5)), max(target_h, int(sh * scale + 0.5))
    im = im.resize((nw, nh), Image.LANCZOS)
    left = int((nw - target_w) * focus[0])
    top = int((nh - target_h) * focus[1])
    left = max(0, min(left, nw - target_w))
    top = max(0, min(top, nh - target_h))
    return im.crop((left, top, left + target_w, top + target_h))


def scrim(im, side="bottom", strength=232, height=0.62):
    """A gradient scrim so text is legible over any photograph.

    Drawn as a real alpha ramp rather than a flat block: a flat overlay looks
    like a mistake on a showroom photograph, and this way the type sits on
    darkness that deepens toward the edge it is anchored to.
    """
    w, h = im.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    if side == "bottom":
        start = int(h * (1 - height))
        for y in range(start, h):
            t = (y - start) / max(1, (h - start))
            a = int(strength * (t ** 1.6))
            d.line([(0, y), (w, y)], fill=(INK[0], INK[1], INK[2], a))
    else:  # full
        d.rectangle([0, 0, w, h], fill=(INK[0], INK[1], INK[2], strength))
    return Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")


def fit_text(draw, text, max_w, start_size, weight=700, min_size=18):
    """Shrink a string until it fits max_w. Returns (font, size)."""
    size = start_size
    while size > min_size:
        f = font(size, weight)
        if draw.textbbox((0, 0), text, font=f)[2] <= max_w:
            return f, size
        size -= 2
    return font(min_size, weight), min_size


def build_og(hero_path):
    """1200x630 social card.

    This is the image a client sees in a text thread, so it has to read at
    thumbnail size on a phone: one car, one wordmark, one line of what Caddy Ed
    actually is. No coffee.
    """
    W, H = 1200, 630
    base = smart_crop(Image.open(hero_path), W, H, focus=(0.62, 0.40))

    # Showroom walls are white and blown out. A bottom-only scrim left the top
    # of the card a bright empty rectangle, which is where a client's eye lands
    # first, so the whole frame is toned down and the bottom is deepened on top.
    im = scrim(base, "full", strength=150)
    im = scrim(im, "bottom", strength=120, height=0.66)

    d = ImageDraw.Draw(im)
    pad = 60
    bottom = H - 54

    # Laid out bottom-up from a single baseline so the type cannot collide with
    # itself at a different font size. The accent rule sits above the wordmark,
    # not across it.
    f3, s3 = fit_text(d, "Text or call — same-day reply", W - pad * 2, 27, 500, 18)
    d.text((pad, bottom - s3), "Text or call — same-day reply", font=f3, fill=BRONZE)
    cursor = bottom - s3 - 22

    f2, s2 = fit_text(d, "Cadillac Sales Specialist  ·  South Charlotte", W - pad * 2, 33, 500, 20)
    d.text((pad, cursor - s2), "Cadillac Sales Specialist  ·  South Charlotte", font=f2, fill=(216, 212, 205))
    cursor -= s2 + 20

    d.rectangle([pad, cursor - 16, pad + 84, cursor - 12], fill=RED)
    cursor -= 16

    f, s1 = fit_text(d, "CADDY ED", W - pad * 2, 86, 800, 40)
    d.text((pad, cursor - s1), "CADDY ED", font=f, fill=CREAM)

    out = os.path.join(ROOT, "site", "static", "img", "og-image.jpg")
    im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    return out


def build_hero(hero_path):
    """The home page hero.

    1920x1280, matching what the template already asked for, so no template
    change is needed. Same photograph, cropped wider and darkened enough that
    the headline reads over it.
    """
    W, H = 1920, 1280
    base = smart_crop(Image.open(hero_path), W, H, focus=(0.62, 0.40))
    # The showroom wall behind the car is near-white. The headline sits on the
    # left third of this image at display size, so the left side is darkened
    # more than the right -- otherwise white type on a white wall.
    im = scrim(base, "full", strength=132)
    left = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(left)
    for x in range(0, int(W * 0.72)):
        t = 1.0 - (x / (W * 0.72))
        ld.line([(x, 0), (x, H)], fill=(INK[0], INK[1], INK[2], int(120 * (t ** 1.4))))
    im = Image.alpha_composite(im.convert("RGBA"), left).convert("RGB")
    im = scrim(im, "bottom", strength=120, height=0.45)
    out = os.path.join(ROOT, "site", "assets", "img", "home-jumbotron.jpg")
    im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    return out


LOGO_SVG = '''<svg viewBox="0 0 268 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Caddy Ed">
  <title>Caddy Ed</title>
  <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <path d="M12 4.5 L4.5 20 L12 35.5"/>
  </g>
  <g fill="currentColor" font-family="Noto Sans, Segoe UI, system-ui, sans-serif" font-size="25" font-weight="800" letter-spacing="1.5">
    <text x="26" y="27">CADDY</text>
  </g>
  <g fill="currentColor" font-family="Noto Sans, Segoe UI, system-ui, sans-serif" font-size="25" font-weight="300" letter-spacing="7.5">
    <text x="120" y="27">ED</text>
  </g>
</svg>
'''


def build_logo():
    """A Caddy Ed wordmark to replace the KALDI one.

    Written to site/assets/ rather than site/static/, because assets/ is what
    `resources.Get` can see. In static/ it was a stable URL with a one-day
    cache, so a logo change took up to 24 hours to reach anyone who had already
    visited the site -- which is how a coffee shop's wordmark sat in the header
    of a Cadillac dealership for as long as it did.

    currentColor so it inverts against the dark footer, and <text> rather than
    outlined paths so the word it spells is greppable. The old file was 1,965
    bytes of vector outlines with no text in it at all, which is why nothing
    caught it.
    """
    out = os.path.join(ROOT, "site", "assets", "img", "logo.svg")
    with open(out, "w") as f:
        f.write(LOGO_SVG)
    return out


def main():
    hero = load_hero()
    print(f"  hero photograph: {os.path.relpath(hero, ROOT)}")
    for p in (build_og(hero), build_hero(hero), build_logo()):
        print(f"  wrote {os.path.relpath(p, ROOT)}  ({os.path.getsize(p) // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
