#!/usr/bin/env python3
"""Draw the app icon, assets/image/icon.png.

Run from the project root:  python3 tools/make_icon.py

The icon has to survive two surfaces at once, and they disagree:

  Settings -> Applications  shows the whole 512x512 square.
  "Your apps" on the home   renders the same asset in a 16:9 tile and
  screen                    centre-crops it, so only y 112..400 is visible.

The manifest reference documents only the first one, so the brand mark was
drawn to fill the square: its artwork spanned y 74..434 and the launcher cut
the top of the screen frame and the whole stand off. See FRICTION_LOG.md #11.

So the artwork is drawn at 0.75 of the brand mark's size about the centre of
the canvas, which puts it inside the 16:9 band with about 9 px to spare at
each end, and the black ground is full-bleed. Full-bleed matters because the
brand SVG is transparent outside its rounded rect, and flattening that to RGB
gave the shipped icon four white corners -- invisible in the cropped launcher
tile, but four white notches in the Settings list.

Geometry is the brand mark, brand/logo-mark.svg in the brand kit. Keep the two
in step: this draws the mark, it does not read the SVG.
"""

from PIL import Image, ImageDraw, ImageFont

N = 512  # the size the manifest requires
SS = 4  # supersample factor, downscaled at the end for clean edges

INK = (17, 17, 17)  # brand Ink
YELLOW = (255, 212, 0)  # brand Big Yellow
WHITE = (255, 255, 255)

# Candidates in preference order; the brand's face is DejaVu Sans Bold.
FONTS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
)

SCALE = 0.75  # fits the artwork inside the launcher's 16:9 safe band
ART_CENTRE_Y = 254.0  # vertical centre of the mark's artwork, in brand units

SAFE_TOP, SAFE_BOTTOM = (N - N * 9 / 16) / 2, (N + N * 9 / 16) / 2


def fx(x):
    return 256 + (x - 256) * SCALE


def fy(y):
    return 256 + (y - ART_CENTRE_Y) * SCALE


def font(size):
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise SystemExit("no bold sans font found; add one to FONTS")


def draw():
    img = Image.new("RGB", (N * SS, N * SS), INK)
    d = ImageDraw.Draw(img)

    def box(x, y, w, h):
        return [
            fx(x) * SS,
            fy(y) * SS,
            (fx(x) + w * SCALE) * SS,
            (fy(y) + h * SCALE) * SS,
        ]

    # Black ground, full bleed, rounded like the brand mark.
    d.rounded_rectangle([0, 0, N * SS - 1, N * SS - 1], radius=96 * SS, fill=INK)
    # The screen.
    d.rounded_rectangle(
        box(56, 88, 400, 272),
        radius=36 * SCALE * SS,
        outline=YELLOW,
        width=int(28 * SCALE * SS),
    )
    # The stand: neck, then base.
    d.rectangle(box(196, 374, 120, 30), fill=YELLOW)
    d.rounded_rectangle(box(136, 404, 240, 30), radius=15 * SCALE * SS, fill=YELLOW)
    # "Aa", the universal sign for text size.
    d.text(
        (fx(256) * SS, fy(296) * SS),
        "Aa",
        font=font(int(180 * SCALE * SS)),
        fill=WHITE,
        anchor="ms",
    )

    return img.resize((N, N), Image.LANCZOS)


if __name__ == "__main__":
    draw().save("assets/image/icon.png")

    top = fy(88) - 28 * SCALE / 2  # outer edge of the frame's stroke
    bottom = fy(404 + 30)  # bottom of the stand's base
    assert SAFE_TOP <= top and bottom <= SAFE_BOTTOM, "artwork leaves the 16:9 band"
    print(f"assets/image/icon.png written, {N}x{N}")
    print(f"  artwork {top:.0f}..{bottom:.0f} inside the 16:9 band "
          f"{SAFE_TOP:.0f}..{SAFE_BOTTOM:.0f}")
