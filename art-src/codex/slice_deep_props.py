"""Cut the deep floors' Codex sheets (plan 08c Task 2) into game art.

    python -I art-src/codex/slice_deep_props.py

Nothing is drawn: magenta keyed out, each grid cell cropped to its picture, box-shrunk by 8 (the sheets are
drawn on an 8 px grid), alpha snapped on/off. The ground sheet's two halves (swamp, cave) are shrunk by 8 into
tiles; the gear sheet (boots, lantern, stamina tank) into upgrade pictures. Output: art-src/codex/out/deep/{items,objects,gear,bg}/ and art-src/preview/deep_props.png. Approved files are
copied to art/test/{items,objects,ui,bg}.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw"
OUT = ROOT / "art-src/codex/out/deep"
GRID = 8

ITEMS = [
    ["icon_frog_leg", "icon_frog_skin", "icon_snake_meat", "icon_snake_scale"],
    ["icon_bat_wing", "icon_crab_meat", "icon_crab_shell", "icon_glow_mushroom"],
    ["icon_iron_ore", "node_glow_mushroom", "node_iron_ore", None],
]
GEAR = [["upg_boots", "upg_lantern", "upg_tank"]]
OBJECTS = [["reeds", "lily_pond", "mossy_log"], ["stalagmite", "crystals", "cave_rock"]]


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128 or (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 70):
                px[x, y] = (0, 0, 0, 0)
    return im


def shrink(c: Image.Image) -> Image.Image:
    c = c.crop(c.getbbox())
    s = c.resize((max(1, round(c.width / GRID)), max(1, round(c.height / GRID))), Image.BOX)
    s.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
    return s


def cut(sheet: Image.Image, names, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    rows, cols = len(names), len(names[0])
    cw, ch = sheet.width // cols, sheet.height // rows
    done = []
    for r, row in enumerate(names):
        for c, name in enumerate(row):
            if not name:
                continue
            s = shrink(sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
            s.save(out / f"{name}.png")
            done.append(s)
            print(name, s.size)
    return done


def main():
    items = cut(key(Image.open(RAW / "deep_items.png")), ITEMS, OUT / "items")
    objects = cut(key(Image.open(RAW / "deep_objects.png")), OBJECTS, OUT / "objects")
    gear = cut(key(Image.open(RAW / "deep_gear.png")), GEAR, OUT / "gear")
    (OUT / "bg").mkdir(parents=True, exist_ok=True)
    ground = Image.open(RAW / "deep_ground.png").convert("RGBA")
    half = ground.width // 2
    tiles = []
    for i, name in enumerate(["swamp", "cave"]):
        t = ground.crop((i * half, 0, (i + 1) * half, ground.height)).resize((half // GRID, ground.height // GRID), Image.BOX)
        t.save(OUT / "bg" / f"{name}.png")
        tiles.append(t)
        print(name, t.size)

    # preview at 4x: each tile repeated 3x3 (to see the seams) with the floor's objects and items on it
    S = 4
    W = 1100
    out = Image.new("RGBA", (W, 900), (30, 30, 34, 255))
    for i, t in enumerate(tiles):
        field = Image.new("RGBA", (t.width * 3, t.height * 3))
        for y in range(3):
            for x in range(3):
                field.paste(t, (x * t.width, y * t.height))
        out.alpha_composite(field.resize((field.width * S // 2, field.height * S // 2), Image.NEAREST), (10 + i * 545, 10))
        x = 20 + i * 545
        for o in objects[i * 3 : i * 3 + 3]:
            big = o.resize((o.width * S // 2, o.height * S // 2), Image.NEAREST)
            out.alpha_composite(big, (x, 300 - big.height))
            x += big.width + 20
    x, y = 10, 410
    for it in items + gear:
        big = it.resize((it.width * S, it.height * S), Image.NEAREST)
        if x + big.width > W:
            x, y = 10, y + 110
        out.alpha_composite(big, (x, y))
        x += big.width + 14
    out.crop((0, 0, W, 760)).save(ROOT / "art-src/preview/deep_props.png")


if __name__ == "__main__":
    main()
