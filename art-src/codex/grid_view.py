"""Draw a coordinate grid over part of a raw sheet so cut boxes can be read off by eye.

    python art-src/codex/grid_view.py <sheet.png> x0 y0 x1 y1 <out.png> [step]

Lines every `step` px (default 50), labelled with sheet coordinates; the sheet keeps its own pixels.
This only annotates a preview for choosing boxes; nothing it writes goes into the game.
"""
import sys

from PIL import Image, ImageDraw

src, x0, y0, x1, y1, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
step = int(sys.argv[7]) if len(sys.argv) > 7 else 50
im = Image.open(src).convert("RGB").crop((x0, y0, x1, y1))
d = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    d.line([(x - x0, 0), (x - x0, im.height)], fill=(0, 255, 255) if x % (step * 2) == 0 else (0, 120, 120))
    d.text((x - x0 + 2, 2), str(x), fill=(255, 255, 255))
for y in range((y0 // step + 1) * step, y1, step):
    d.line([(0, y - y0), (im.width, y - y0)], fill=(0, 255, 255) if y % (step * 2) == 0 else (0, 120, 120))
    d.text((2, y - y0 + 2), str(y), fill=(255, 255, 255))
im.save(out)
