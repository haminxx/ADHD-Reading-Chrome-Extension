"""Generate Focus Reader extension icons (16/48/128 px).

Design: a rounded blue square with a stylized "word" where the left half is a
solid bold bar and the right half is a lighter bar -- visually echoing the
bionic-reading idea of a bold leading half.

Run once: `python make_icons.py`. Output goes to ./icons/.
"""
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT_DIR, exist_ok=True)

ACCENT_TOP = (59, 130, 246)    # #3b82f6
ACCENT_BOT = (29, 78, 216)     # #1d4ed8
BOLD = (255, 255, 255, 255)
LIGHT = (255, 255, 255, 110)


def vertical_gradient(size, top, bot):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(size):
    grad = vertical_gradient(size, ACCENT_TOP, ACCENT_BOT)
    mask = rounded_mask(size, max(2, int(size * 0.22)))
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(base)

    # Three "text lines": each split into a bold (left) and light (right) half.
    margin = size * 0.22
    line_h = size * 0.12
    gap = size * 0.13
    start_y = size * 0.28
    full_w = size - 2 * margin

    for i in range(3):
        y0 = start_y + i * (line_h + gap)
        y1 = y0 + line_h
        # widths shrink a little per line for a "paragraph" look
        w = full_w * (1.0 - i * 0.12)
        split = margin + w * 0.5
        # bold left half
        draw.rounded_rectangle(
            [margin, y0, split, y1], radius=line_h / 2, fill=BOLD
        )
        # light right half
        draw.rounded_rectangle(
            [split + size * 0.03, y0, margin + w, y1],
            radius=line_h / 2,
            fill=LIGHT,
        )

    return base


for s in (16, 48, 128):
    icon = make_icon(s)
    icon.save(os.path.join(OUT_DIR, f"icon{s}.png"))
    print(f"wrote icon{s}.png")
