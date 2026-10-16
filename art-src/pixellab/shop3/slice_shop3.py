# Cuts the night shop's PixelLab conversions (plan 07b) into one file per sprite: the magenta backdrop
# goes transparent, each grid cell is cropped to what is drawn in it. Nothing is drawn, only cut.
# Run from the project root: python art-src/pixellab/shop3/slice_shop3.py <out dir>
import sys
from pathlib import Path
from PIL import Image

SRC = Path("art-src/pixellab/shop3")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "art-src/pixellab/shop3/cut")

PROPS = [["grill_lit", "grill_dirty", "grill_off", "stool"],
         ["coal_box", "drink_cart", "tray", "cup_tea"],
         ["cup_cider", "bowl_sikhye", "plate_dirty", "plate"]]
YOKAI = ["dokkaebi", "gumiho", "reaper", "ghost"]
POSES = ["walk_0", "walk_1", "sit", "eat", "happy", "angry"]


def unkey(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r > 170 and b > 170 and g < 110:
                px[x, y] = (0, 0, 0, 0)
    return im


def cut(im: Image.Image, cols: int, rows: int, names, sub: str):
    w, h = im.width / cols, im.height / rows
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h)))
            box = cell.getbbox()
            if not box:
                continue
            dest = OUT / sub / f"{names(r, c)}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            cell.crop(box).save(dest)


cut(unkey(Image.open(SRC / "props_132.png")), 4, 3, lambda r, c: PROPS[r][c], "props")
cut(unkey(Image.open(SRC / "customers_336.png")), 6, 4, lambda r, c: f"{YOKAI[r]}_{POSES[c]}", "yokai")
print("cut into", OUT)
