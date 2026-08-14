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


def mark_mask(logo: Image.Image) -> Image.Image:
    """
    Alpha mask of just the white play/bookmark mark, cropped to its bounds.

    The artwork is a white mark on a teal rounded square, so thresholding for
    near-white opaque pixels isolates it. Extracting the mark — rather than
    scaling the whole tile down — is what keeps the maskable icon free of the
    inner rounded-square edge (and the soft shadow just inside it) that simply
    insetting the artwork leaves behind.
    """
    rgba = logo.load()
    w, h = logo.size
    hit = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = rgba[x, y]
            hit[y][x] = a > 128 and r > 200 and g > 200 and b > 200

    # The tile carries faint near-white gloss highlights that also clear the
    # threshold. Left in, they speckle the icon AND widen the bounding box, which
    # silently shrinks and off-centres the mark — so keep only blobs that are a
    # meaningful fraction of the largest one.
    seen = [[False] * w for _ in range(h)]
    blobs: list[list[tuple[int, int]]] = []
    for y0 in range(h):
        for x0 in range(w):
            if not hit[y0][x0] or seen[y0][x0]:
                continue
            stack, blob = [(x0, y0)], []
            seen[y0][x0] = True
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and hit[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            blobs.append(blob)

    if not blobs:
        raise SystemExit("no white mark found in the source artwork")

    biggest = max(len(b) for b in blobs)
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    for blob in blobs:
        if len(blob) < biggest * 0.05:
            continue
        for x, y in blob:
            px[x, y] = 255

    return mask.crop(mask.getbbox())


def maskable(logo: Image.Image, size: int) -> Image.Image:
    """
    Android adaptive icon: flat teal, mark inside the safe zone.

    Declared with `purpose: 'maskable'` on its own manifest entry rather than
    `any maskable` on the standard icons — a single icon claiming both makes
    Android apply the adaptive crop to artwork that has no safe-zone padding,
    clipping the mark. The spec's safe zone is a circle of 80% diameter; the mark
    is sized to ~52% of the canvas so its corners stay inside that circle.
    """
    canvas = Image.new("RGBA", (size, size), BRAND_TEAL)
    mark = mark_mask(logo)

    target = round(size * 0.52)
    ratio = min(target / mark.width, target / mark.height)
    resized = mark.resize((round(mark.width * ratio), round(mark.height * ratio)), Image.LANCZOS)

    white = Image.new("RGBA", resized.size, (0xFF, 0xFF, 0xFF, 0xFF))
    canvas.paste(white, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
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

    out = PUBLIC / "icon-maskable-512.png"
    maskable(logo, 512).save(out, optimize=True)
    print(f"wrote {out.relative_to(WEBAPP)} (512x512, safe-zone padded)")


if __name__ == "__main__":
    main()
