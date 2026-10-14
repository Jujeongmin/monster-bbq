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
# (folder, sheet, row names); later sheets overwrite rows of the same name (the redrawn walk cycles)
SHEETS = [
    ("hunter", "hunter_sheet.png", ["down", "up", "side", "slash", "throw"]),
    ("boar", "boar_sheet.png", ["side", "down", "up", "windup", "charge"]),
    ("hunter", "hunter_walk.png", ["down", "up", "side"]),
    ("boar", "boar_walk.png", ["side", "down", "up"]),
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
    for name, file, rows in SHEETS:
        if not (RAW / file).exists():
            continue
        sheet = key_magenta(Image.open(RAW / file))
        cw, ch = sheet.width / 4, sheet.height / len(rows)
        out = ROOT / "art/test" / name
        out.mkdir(parents=True, exist_ok=True)
        size = (round(cw * SCALE), round(ch * SCALE))
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


if __name__ == "__main__":
    main()
