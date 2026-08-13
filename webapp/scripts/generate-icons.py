#!/usr/bin/env python3
"""Regenerate the favicon / app-icon set from public/clipmark-logo.png.

Run by hand when the logo changes; the outputs are committed, so the build never
depends on this script (or on Python being installed):

    python3 webapp/scripts/generate-icons.py      # needs Pillow

Outputs, and why each exists:

  app/favicon.ico        16/32/48 multi-resolution. /favicon.ico used to 404 —
                         browsers request it unprompted, so every visit logged a
                         404 and tabs fell back to a blank page glyph.
  app/icon.png           192x192, the modern rel="icon".
  app/apple-icon.png     180x180 for iOS home screens. Flattened onto the brand
                         teal because iOS composites transparency onto BLACK,
                         which would ring the mark in black on a saved icon.
  public/icon-192.png    Referenced by app/manifest.ts.
  public/icon-512.png    Same, at install/splash size.
  public/icon-maskable-512.png
                         Android adaptive icons crop to a circle. This one keeps
                         the mark inside the 80% safe zone on a filled teal
                         canvas so the crop never clips it.

Transparency is kept for the browser-tab icons (they sit on light *and* dark tab
strips) and dropped only where the platform demands an opaque tile.
"""

from pathlib import Path

from PIL import Image

# Sampled from the logo itself rather than the token file: the PNG is the
# artwork of record here, and the two are within a shade of --teal-500.
BRAND_TEAL = (24, 175, 158, 255)

WEBAPP = Path(__file__).resolve().parent.parent
SOURCE = WEBAPP / "public" / "clipmark-logo.png"


def load_logo() -> Image.Image:
    logo = Image.open(SOURCE).convert("RGBA")
    # Trim the 3px transparent margin so the mark fills the canvas it is pasted
    # into; without this every generated icon carries dead padding.
    bbox = logo.getchannel("A").getbbox()
    return logo.crop(bbox) if bbox else logo


def resized(logo: Image.Image, size: int) -> Image.Image:
    return logo.resize((size, size), Image.LANCZOS)


def on_teal(logo: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    """Flatten onto an opaque brand-teal tile, optionally inset by `scale`."""
    canvas = Image.new("RGBA", (size, size), BRAND_TEAL)
    inner = int(size * scale)
    art = resized(logo, inner)
    offset = (size - inner) // 2
    canvas.paste(art, (offset, offset), art)
    return canvas.convert("RGB")


def main() -> None:
    logo = load_logo()
    app, public = WEBAPP / "app", WEBAPP / "public"

    # Multi-resolution ICO. 48px is included because Windows taskbar/pinned-site
    # surfaces pick it, and upscaling from 32 looks soft there.
    resized(logo, 48).save(
        app / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    resized(logo, 192).save(app / "icon.png", format="PNG")
    resized(logo, 192).save(public / "icon-192.png", format="PNG")
    resized(logo, 512).save(public / "icon-512.png", format="PNG")

    on_teal(logo, 180).save(app / "apple-icon.png", format="PNG")
    # 80% safe zone: Android may crop up to the inscribed circle.
    on_teal(logo, 512, scale=0.8).save(public / "icon-maskable-512.png", format="PNG")

    for path in [
        app / "favicon.ico",
        app / "icon.png",
        app / "apple-icon.png",
        public / "icon-192.png",
        public / "icon-512.png",
        public / "icon-maskable-512.png",
    ]:
        print(f"  wrote {path.relative_to(WEBAPP)} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
