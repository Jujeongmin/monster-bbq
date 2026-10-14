"""Cut the Codex character sheets (4 columns, one row per animation, on magenta) into game frames.

    python art-src/codex/slice_characters.py

Every cell is keyed (magenta -> transparent), shrunk by one factor with premultiplied alpha (so no
magenta bleeds into the edges) and its alpha snapped on/off. Cells keep one canvas size per sheet,
so the feet stay at the same spot in every frame.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

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


def key_magenta(im: Image.Image, despill: bool = False) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # magenta and its anti-aliased fringe: red and blue high, green low
            if (r + b) / 2 - g > 90 and abs(r - b) < 90:
                px[x, y] = (0, 0, 0, 0)
    if despill:
        # dark purple left where magenta met a dark outline: peel it off the edge only (purple inside the
        # art, like perilla veins, is never next to the cleared background)
        for _ in range(2):
            edge = []
            for y in range(h):
                for x in range(w):
                    r, g, b, a = px[x, y]
                    if a == 0 or not ((r + b) / 2 - g > 35 and abs(r - b) < 70):
                        continue
                    if any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        edge.append((x, y))
            for x, y in edge:
                px[x, y] = (0, 0, 0, 0)
    return im


def grid_objects(sheet: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    """One picture per grid cell, cut by drawing rather than by the grid: Codex lets pots, handles and
    steam cross into the next cell, and a plain grid cut would clip them (art-src/codex/check_cells.py).
    Big blobs belong to the cell they overlap most; small detached bits (steam, smoke, crumbs) join the
    nearest big blob. Each picture keeps only its own blobs, cropped to their bounds."""
    alpha = np.array(sheet.getchannel("A")) > 0
    h, w = alpha.shape
    cw, ch = w / cols, h / rows
    labels, n = ndimage.label(alpha)
    sizes = ndimage.sum(alpha, labels, range(1, n + 1))
    big_min = 0.01 * cw * ch
    owner = {}
    for lab in range(1, n + 1):
        if sizes[lab - 1] < big_min:
            continue
        ys, xs = np.nonzero(labels == lab)
        cells = (np.minimum((ys / ch).astype(int), rows - 1)) * cols + np.minimum((xs / cw).astype(int), cols - 1)
        owner[lab] = int(np.bincount(cells).argmax())
    # distance from every pixel to each big blob, for the small bits
    big = list(owner)
    dist = {lab: ndimage.distance_transform_edt(labels != lab) for lab in big}
    for lab in range(1, n + 1):
        if lab in owner:
            continue
        ys, xs = np.nonzero(labels == lab)
        near = min(big, key=lambda b: dist[b][ys, xs].min())
        owner[lab] = owner[near]
    out = []
    rgba = np.array(sheet)
    for k in range(cols * rows):
        mine = [lab for lab, cell in owner.items() if cell == k]
        mask = np.isin(labels, mine)
        if not mask.any():
            out.append(Image.new("RGBA", (1, 1)))
            continue
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        piece = rgba[y0:y1, x0:x1].copy()
        piece[~mask[y0:y1, x0:x1]] = 0
        out.append(Image.fromarray(piece, "RGBA"))
    return out


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
        # the cooking sheets were drawn later with a darker outline that leaves a purple fringe
        sheet = key_magenta(Image.open(RAW / file), despill=name == "cooking")
        cells = grid_objects(sheet, cols, rows)
        out = ROOT / "art/test" / name
        out.mkdir(parents=True, exist_ok=True)
        for k, piece in enumerate(names):
            if piece is None:  # cell taken by another entry at another scale
                continue
            cell = cells[k]
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
