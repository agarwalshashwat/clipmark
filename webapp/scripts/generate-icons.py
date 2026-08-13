#!/usr/bin/env python3
"""
Regenerate the favicon / app-icon set from public/clipmark-logo.png.

Run this only when the logo changes; the outputs are committed, so no build step
and no CI job depends on it:

    python3 webapp/scripts/generate-icons.py     # needs Pillow

Why the outputs look the way they do:

* favicon.ico keeps the logo's transparent corners. At 16px the teal rounded
  square reads as a deliberate shape against any tab colour, light or dark.
* The PWA and Apple icons are FULL-BLEED instead. iOS composites transparency
  onto black and applies its own corner mask, so a transparent-cornered tile
  gets a dark fringe and then re-rounded corners on top of the ones already in
  the artwork.
* Full-bleed is done by scaling the logo slightly past the canvas and cropping,
  not by flattening it onto a teal rectangle: the source art has a soft shadow
  just inside its rounded edge, and flattening leaves that as a visible ring.
"""
from pathlib import Path

from PIL import Image

WEBAPP = Path(__file__).resolve().parent.parent
SOURCE = WEBAPP / "public" / "clipmark-logo.png"
PUBLIC = WEBAPP / "public"

# --teal-500 from packages/design-system/tokens.css. The logo's own teal measures
# #18af9e; using the token keeps the icon on the documented ramp, and the two are
# indistinguishable at icon sizes.
BRAND_TEAL = (0x14, 0xB8, 0xA6, 0xFF)

# Enough overscan to push the artwork's rounded corners off-canvas.
OVERSCAN = 1.18


def full_bleed(logo: Image.Image, size: int) -> Image.Image:
    """Brand-teal square with the mark centred and the rounded corners cropped."""
    canvas = Image.new("RGBA", (size, size), BRAND_TEAL)
    scaled = round(size * OVERSCAN)
    art = logo.resize((scaled, scaled), Image.LANCZOS)
    offset = (size - scaled) // 2
    canvas.alpha_composite(art, (offset, offset))
    return canvas


def main() -> None:
    logo = Image.open(SOURCE).convert("RGBA")

    # Browsers pick the best frame from a multi-resolution .ico.
    ico = PUBLIC / "favicon.ico"
    logo.save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {ico.relative_to(WEBAPP)} (16/32/48)")

    for name, size in [
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
    ]:
        out = PUBLIC / name
        full_bleed(logo, size).save(out, optimize=True)
        print(f"wrote {out.relative_to(WEBAPP)} ({size}x{size})")


if __name__ == "__main__":
    main()
