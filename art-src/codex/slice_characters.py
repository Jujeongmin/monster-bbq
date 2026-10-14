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
# grids of separate items: (folder, sheet, columns, rows, names in reading order, scale)
GRIDS = [
    ("items", "forage_nodes.png", 3, 1, ["node_shiitake", "node_wild_garlic", "node_perilla"], 0.085),
    ("items", "item_icons.png", 5, 2, [f"icon_{i}" for i in ["boar_belly", "boar_neck", "boar_rib", "rabbit_leg", "honeycomb",
                                                            "chicken_thigh", "chicken_breast", "shiitake", "wild_garlic", "perilla"]], 0.06),
    ("dishes", "dishes.png", 3, 3, ["grilled_belly", "garlic_neck", "belly_ssam", "honey_rabbit", "shiitake_grill", "rib_stew",
                                    "baeksuk", "chicken_perilla", "fail"], 0.1),
    ("cooking", "cook_grill.png", 1, 1, ["grill"], 0.2),
    ("cooking", "cook_pieces.png", 10, 2, [f"{state}_{i}" for state in ["raw", "cooked"] for i in [
        "boar_belly", "boar_neck", "boar_rib", "rabbit_leg", "chicken_thigh", "chicken_breast", "shiitake", "wild_garlic", "perilla", "honeycomb"]], 0.32),
    ("cooking", "cook_tools.png", 5, 2, ["tongs", "scissors", "ladle", "plate", "bowl", None, None, None, "dial", "crumb"], 0.2),
    ("cooking", "cook_tools.png", 5, 2, [None, None, None, None, None, "pot_clear", "pot_foam", "pot_lid", None, None], 0.6),
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
    for name, file, cols, rows, names, scale in GRIDS:
        if not (RAW / file).exists():
            continue
        sheet = key_magenta(Image.open(RAW / file))
        cw, ch = sheet.width / cols, sheet.height / rows
        out = ROOT / "art/test" / name
        out.mkdir(parents=True, exist_ok=True)
        for k, piece in enumerate(names):
            if piece is None:  # cell taken by another entry at another scale
                continue
            c, r = k % cols, k // cols
            cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            box = cell.getbbox()
            cell = cell.crop(box) if box else cell
            size = (max(1, round(cell.width * scale)), max(1, round(cell.height * scale)))
            small = cell.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
            rr, gg, bb, aa = small.split()
            Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0))).save(out / f"{piece}.png")
        print(name, file, "->", len(names), "pieces")
    for name, piece, file, box, scale in PIECES:
        crop = key_magenta(Image.open(RAW / file).crop(box))
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        small = crop.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
        rr, gg, bb, aa = small.split()
        Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0))).save(ROOT / "art/test" / name / f"{piece}.png")
        print(name, piece, size)


if __name__ == "__main__":
    main()
