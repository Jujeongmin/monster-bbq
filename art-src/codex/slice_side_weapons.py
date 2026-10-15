"""Cut the Codex side weapon icons (raw/side_weapons.png) into four icons.

    python -I art-src/codex/slice_side_weapons.py

Nothing is drawn: magenta keyed out (also inside the net's holes), each of the 4 cells cropped and
box-shrunk by 8 (drawn on an 8 px grid), alpha snapped. Output: art-src/codex/out/side/<id>.png and a
preview next to today's item icon in art-src/preview/side_weapons.png.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/side_weapons.png"
OUT = ROOT / "art-src/codex/out/side"
NAMES = ["sling", "sleepGun", "netGun", "firecracker"]
GRID = 8


def key(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128 or (r > 150 and b > 150 and g < 120) or (r > 60 and b > 60 and min(r, b) - g > 40 and abs(r - b) < 70):
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = key(Image.open(RAW))
    w = sheet.width // 4
    done = []
    for i, name in enumerate(NAMES):
        c = sheet.crop((i * w, 0, (i + 1) * w, sheet.height))
        c = c.crop(c.getbbox())
        s = c.resize((max(1, round(c.width / GRID)), max(1, round(c.height / GRID))), Image.BOX)
        s.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        s.save(OUT / f"{name}.png")
        done.append(s)
        print(name, s.size)
    ref = Image.open(ROOT / "art/test/items/icon_shiitake.png").convert("RGBA")
    row = [ref] + done
    S = 6
    W = sum(i.width * S + 24 for i in row) + 24
    H = max(i.height for i in row) * S + 48
    out = Image.new("RGBA", (W, H), (60, 44, 34, 255))
    x = 24
    for i in row:
        out.alpha_composite(i.resize((i.width * S, i.height * S), Image.NEAREST), (x, H - 24 - i.height * S))
        x += i.width * S + 24
    out.save(ROOT / "art-src/preview/side_weapons.png")


if __name__ == "__main__":
    main()
