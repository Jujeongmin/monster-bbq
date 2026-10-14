"""Cut the Codex character sheets (4 columns, one row per animation, on magenta) into game frames.

    python art-src/codex/slice_characters.py

Every cell is keyed (magenta -> transparent), shrunk by one factor with premultiplied alpha (so no
magenta bleeds into the edges) and its alpha snapped on/off. Cells keep one canvas size per sheet,
so the feet stay at the same spot in every frame.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw"
SCALE = 1 / 3
# (folder, sheet, row names, scale); later sheets overwrite rows of the same name (the redrawn walk
# cycles). Codex draws each sheet at its own size, so each gets the scale that fits the hunter.
SHEETS = [
    ("hunter", "hunter_sheet.png", ["down", "up", "side", "slash", "throw"], SCALE),
    ("boar", "boar_sheet.png", ["side", "down", "up", "windup", "charge"], SCALE),
    ("hunter", "hunter_walk.png", ["down", "up", "side"], SCALE),
    ("boar", "boar_walk.png", ["side", "down", "up"], SCALE),
    ("rabbit", "rabbit_sheet.png", ["side", "down", "up", "special"], 0.26),
    ("bee", "bee_sheet.png", ["side", "down", "up", "attack"], 0.26),
    ("chicken", "chicken_sheet.png", ["side", "down", "up", "peck"], 0.24),
]
# single sprites cut from a sheet: (folder, name, sheet, box in sheet pixels, scale)
PIECES = [
    ("bee", "stinger", "bee_sheet.png", (815, 1075, 895, 1120), 0.26),
]


def key_magenta(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # magenta and its anti-aliased fringe: red and blue high, green low
            if (r + b) / 2 - g > 90 and abs(r - b) < 90:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    for name, file, rows, scale in SHEETS:
        if not (RAW / file).exists():
            continue
        sheet = key_magenta(Image.open(RAW / file))
        cw, ch = sheet.width / 4, sheet.height / len(rows)
        out = ROOT / "art/test" / name
        out.mkdir(parents=True, exist_ok=True)
        size = (round(cw * scale), round(ch * scale))
        bottoms = []
        for r, row in enumerate(rows):
            for c in range(4):
                cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
                small = cell.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
                rr, gg, bb, aa = small.split()
                aa = aa.point(lambda v: 255 if v >= 110 else 0)
                frame = Image.merge("RGBA", (rr, gg, bb, aa))
                frame.save(out / f"{row}_{c}.png")
                box = frame.getbbox()
                if box:
                    bottoms.append(box[3])
        print(name, file, "cell", size, "lowest opaque row per frame: min", min(bottoms), "max", max(bottoms))
    for name, piece, file, box, scale in PIECES:
        crop = key_magenta(Image.open(RAW / file).crop(box))
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        small = crop.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
        rr, gg, bb, aa = small.split()
        Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0))).save(ROOT / "art/test" / name / f"{piece}.png")
        print(name, piece, size)


if __name__ == "__main__":
    main()
