#!/usr/bin/env python3
"""Regenerate the favicon / app-icon set from public/clipmark-logo.png.

Run by hand when the logo artwork changes — the outputs are committed, so this
is not part of `next build` (it needs Pillow, which the Node toolchain does not
carry, and the icons change roughly never):

    python3 webapp/scripts/generate-icons.py       # needs: pip install Pillow

Outputs, and why each exists:

  app/favicon.ico        16/32/48 multi-resolution. `/favicon.ico` used to 404 —
                         browsers request it unconditionally, so every page view
                         logged a miss and tabs/bookmarks/history showed a blank
                         page glyph. Next serves app/favicon.ico at the root.
  app/apple-icon.png     180x180, iOS "Add to Home Screen". Flattened onto solid
                         teal ON PURPOSE: iOS composites alpha against black, so
                         shipping the transparent original would put a black
                         frame around the rounded corners of the mark.
  public/icon-192.png    Android / PWA install prompt, referenced from
  public/icon-512.png    app/manifest.ts. Alpha preserved — these are rendered
                         on the launcher's own background, not iOS's.

The source is 450x450, so 512 is a mild upscale (Lanczos). It is the largest
artwork available; regenerate from a bigger master if one is ever produced.
"""

import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is required: pip install Pillow')

WEBAPP = pathlib.Path(__file__).resolve().parent.parent
SOURCE = WEBAPP / 'public' / 'clipmark-logo.png'

# The artwork's own teal, sampled from the rounded square rather than taken from
# tokens.css: the PNG is #18b09e-ish while --teal-500 is #14b8a6, and filling the
# transparent corners with the token value leaves a visible seam along the curve.
LOGO_TEAL = (24, 176, 158)


def main() -> None:
    src = Image.open(SOURCE).convert('RGBA')
    # Trim the ~3px transparent border so small renders spend every pixel on the
    # mark itself; at 16x16 that border would cost a fifth of the width.
    box = src.getchannel('A').getbbox()
    if box:
        src = src.crop(box)

    def resized(size: int) -> Image.Image:
        return src.resize((size, size), Image.LANCZOS)

    ico = WEBAPP / 'app' / 'favicon.ico'
    resized(48).save(ico, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print(f'wrote {ico.relative_to(WEBAPP)}')

    apple = resized(180)
    flat = Image.new('RGB', apple.size, LOGO_TEAL)
    flat.paste(apple, (0, 0), apple)
    apple_path = WEBAPP / 'app' / 'apple-icon.png'
    flat.save(apple_path, format='PNG', optimize=True)
    print(f'wrote {apple_path.relative_to(WEBAPP)}')

    for size in (192, 512):
        out = WEBAPP / 'public' / f'icon-{size}.png'
        resized(size).save(out, format='PNG', optimize=True)
        print(f'wrote {out.relative_to(WEBAPP)}')


if __name__ == '__main__':
    main()
