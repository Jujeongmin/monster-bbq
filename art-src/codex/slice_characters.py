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
]
# single sprites cut from a sheet by hand: (folder, name, sheet, box in sheet pixels, scale). Boxes are
# read off by eye from art-src/codex/grid_view.py previews, each with a little magenta margin all round.
PIECES = [
    ("bee", "stinger", "bee_sheet.png", (815, 1075, 895, 1120), 0.26),
    ("dishes", "grilled_belly", "dishes.png", (28, 62, 412, 386), 0.1),
    ("dishes", "garlic_neck", "dishes.png", (436, 68, 812, 383), 0.1),
    ("dishes", "belly_ssam", "dishes.png", (833, 48, 1242, 388), 0.1),
    ("dishes", "honey_rabbit", "dishes.png", (26, 428, 412, 778), 0.1),
    ("dishes", "shiitake_grill", "dishes.png", (433, 458, 812, 778), 0.1),
    ("dishes", "rib_stew", "dishes.png", (828, 395, 1247, 792), 0.1),
    ("dishes", "baeksuk", "dishes.png", (8, 793, 418, 1192), 0.1),
    ("dishes", "chicken_perilla", "dishes.png", (433, 833, 812, 1188), 0.1),
    ("dishes", "fail", "dishes.png", (833, 828, 1232, 1196), 0.1),
    ("cooking", "grill", "cook_grill.png", (35, 75, 1225, 1150), 0.2),
    # raw and cooked pieces: each pair shares one box size so the two pictures blend in place
    ("cooking", "raw_boar_belly", "cook_pieces2.png", (87, 139, 209, 297), 0.36),
    ("cooking", "cooked_boar_belly", "cook_pieces2.png", (87, 707, 209, 865), 0.36),
    ("cooking", "raw_boar_neck", "cook_pieces2.png", (326, 139, 458, 297), 0.36),
    ("cooking", "cooked_boar_neck", "cook_pieces2.png", (326, 706, 458, 864), 0.36),
    ("cooking", "raw_boar_rib", "cook_pieces2.png", (562, 141, 679, 295), 0.36),
    ("cooking", "cooked_boar_rib", "cook_pieces2.png", (562, 710, 679, 864), 0.36),
    ("cooking", "raw_rabbit_leg", "cook_pieces2.png", (797, 141, 904, 298), 0.36),
    ("cooking", "cooked_rabbit_leg", "cook_pieces2.png", (797, 710, 904, 867), 0.36),
    ("cooking", "raw_chicken_thigh", "cook_pieces2.png", (1016, 138, 1166, 298), 0.36),
    ("cooking", "cooked_chicken_thigh", "cook_pieces2.png", (1016, 703, 1166, 863), 0.36),
    ("cooking", "raw_chicken_breast", "cook_pieces2.png", (92, 433, 209, 581), 0.36),
    ("cooking", "cooked_chicken_breast", "cook_pieces2.png", (92, 983, 209, 1131), 0.36),
    ("cooking", "raw_shiitake", "cook_pieces2.png", (321, 433, 468, 576), 0.36),
    ("cooking", "cooked_shiitake", "cook_pieces2.png", (321, 983, 468, 1126), 0.36),
    ("cooking", "raw_wild_garlic", "cook_pieces2.png", (557, 436, 691, 576), 0.36),
    ("cooking", "cooked_wild_garlic", "cook_pieces2.png", (557, 985, 691, 1125), 0.36),
    ("cooking", "raw_perilla", "cook_pieces2.png", (785, 427, 913, 587), 0.36),
    ("cooking", "cooked_perilla", "cook_pieces2.png", (785, 976, 913, 1136), 0.36),
    ("cooking", "raw_honeycomb", "cook_pieces2.png", (1014, 431, 1168, 583), 0.36),
    ("cooking", "cooked_honeycomb", "cook_pieces2.png", (1014, 982, 1168, 1134), 0.36),
    ("cooking", "salt_shaker", "cook_salt_rest.png", (130, 140, 555, 580), 0.13),
    ("cooking", "salt_bowl", "cook_salt_rest.png", (715, 185, 1125, 575), 0.13),
    ("cooking", "rest_board", "cook_salt_rest.png", (80, 695, 670, 1150), 0.19),
    ("cooking", "salt_flakes", "cook_salt_rest.png", (850, 835, 1030, 1010), 0.08),
    # UI kit A (walnut, hanji, brass; chosen 2026-10-14): frames x0.25 (borders ~7 px), icons x0.12
    ("ui", "panel", "ui_kit_a.png", (112, 85, 1142, 382), 0.25),
    ("ui", "btn_normal", "ui_kit_a.png", (25, 478, 315, 636), 0.25),
    ("ui", "btn_pressed", "ui_kit_a.png", (318, 478, 568, 636), 0.25),
    ("ui", "btn_disabled", "ui_kit_a.png", (580, 478, 825, 636), 0.25),
    ("ui", "tab_on", "ui_kit_a.png", (830, 470, 1025, 632), 0.25),
    ("ui", "tab_off", "ui_kit_a.png", (1035, 470, 1230, 632), 0.25),
    ("ui", "gauge_empty", "ui_kit_a.png", (20, 742, 262, 822), 0.25),
    ("ui", "gauge_full", "ui_kit_a.png", (263, 742, 512, 822), 0.25),
    ("ui", "bubble", "ui_kit_a.png", (515, 712, 700, 860), 0.25),
    ("ui", "ribbon", "ui_kit_a.png", (700, 735, 935, 850), 0.25),
    ("ui", "topbar", "ui_kit_a.png", (940, 742, 1240, 818), 0.25),
    ("ui", "icon_gold", "ui_kit_a.png", (38, 958, 238, 1158), 0.12),
    ("ui", "icon_charcoal", "ui_kit_a.png", (258, 968, 442, 1152), 0.12),
    ("ui", "icon_day", "ui_kit_a.png", (458, 932, 678, 1188), 0.12),
    ("ui", "icon_pot", "ui_kit_a.png", (688, 958, 966, 1158), 0.12),
    ("ui", "icon_notebook", "ui_kit_a.png", (983, 922, 1222, 1178), 0.12),
    # the dark NPC dialogue bar (approved 2026-10-15), a 9-slice
    ("ui", "dialogue_bar", "dialogue_bar.png", (66, 226, 2091, 470), 0.25),
    ("cooking", "tongs", "cook_tools.png", (65, 55, 372, 368), 0.2),
    ("cooking", "scissors", "cook_tools.png", (445, 45, 812, 368), 0.2),
    ("cooking", "ladle", "cook_tools.png", (835, 32, 1170, 370), 0.2),
    ("cooking", "plate", "cook_tools.png", (1198, 52, 1552, 370), 0.2),
    ("cooking", "bowl", "cook_tools.png", (1600, 50, 1945, 382), 0.2),
    ("cooking", "pot_clear", "cook_tools.png", (28, 408, 410, 760), 0.6),
    ("cooking", "pot_foam", "cook_tools.png", (420, 408, 805, 760), 0.6),
    ("cooking", "pot_lid", "cook_tools.png", (826, 413, 1175, 755), 0.6),
    ("cooking", "dial", "cook_tools.png", (1240, 443, 1530, 730), 0.2),
    ("cooking", "crumb", "cook_tools.png", (1698, 513, 1848, 662), 0.2),
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


# icons made from finished game frames by trimming their empty margins: (folder, name, source in art/test)
TRIMS = [
    ("ui", "upg_melee", "hunter/slash_1.png"),
    ("ui", "upg_ranged", "hunter/throw_1.png"),
    ("ui", "upg_armor", "hunter/down_0.png"),
]

# the lid's dialogue portraits (lid_faces.png, approved 2026-10-15): each face cut by hand by its own box,
# then set on one window around its knob so the lid stays put while the face changes
LID_FACES = [
    ("normal", (30, 255, 552, 535), 271),
    ("angry", (548, 160, 1086, 535), 804),
    ("smug", (1118, 240, 1600, 535), 1357),
    ("surprised", (1650, 255, 2150, 575), 1906),
]
LID_WINDOW = (300, 150, 590)  # half width around the knob, top, bottom (raw pixels)
LID_SCALE = 0.4


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
        crop = key_magenta(Image.open(RAW / file).crop(box), despill=name == "cooking")
        (ROOT / "art/test" / name).mkdir(parents=True, exist_ok=True)
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        small = crop.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
        rr, gg, bb, aa = small.split()
        Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0))).save(ROOT / "art/test" / name / f"{piece}.png")
        print(name, piece, size)
    if (RAW / "lid_faces.png").exists():
        sheet = Image.open(RAW / "lid_faces.png")
        half, top, bottom = LID_WINDOW
        (ROOT / "art/test/lid").mkdir(parents=True, exist_ok=True)
        for face, box, knob in LID_FACES:
            canvas = Image.new("RGBA", (2 * half, bottom - top), (0, 0, 0, 0))
            canvas.paste(key_magenta(sheet.crop(box)), (box[0] - (knob - half), box[1] - top))
            size = (round(canvas.width * LID_SCALE), round(canvas.height * LID_SCALE))
            small = canvas.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
            rr, gg, bb, aa = small.split()
            Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0))).save(ROOT / "art/test/lid" / f"{face}.png")
            print("lid", face, size)
    for name, piece, src in TRIMS:
        im = Image.open(ROOT / "art/test" / src).convert("RGBA")
        box = im.getbbox()
        (im.crop(box) if box else im).save(ROOT / "art/test" / name / f"{piece}.png")
        print(name, piece, "trimmed from", src)


if __name__ == "__main__":
    main()
