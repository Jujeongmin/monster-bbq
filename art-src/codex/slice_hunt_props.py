"""Cut the Codex exit cart and way-down hole (raw/hunt_exit_stairs.png) into hunt props.

    python -I art-src/codex/slice_hunt_props.py

Nothing is drawn: magenta keyed out, each half cropped, box-shrunk by 8 (the sheet is drawn on an 8 px
grid), alpha snapped on/off. Output: art-src/codex/out/hunt/{exit,stairs}.png and a comparison next to
today's forest objects in art-src/preview/hunt_props_vs_objects.png. Approved files are copied to art/test/hunt.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/hunt_exit_stairs.png"
OUT = ROOT / "art-src/codex/out/hunt"
GRID = 8


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128 or (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 70):
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = key(Image.open(RAW))
    half = sheet.width // 2
    done = []
    for name, box in [("exit", (0, 0, half, sheet.height)), ("stairs", (half, 0, sheet.width, sheet.height))]:
        c = sheet.crop(box)
        c = c.crop(c.getbbox())
        s = c.resize((max(1, round(c.width / GRID)), max(1, round(c.height / GRID))), Image.BOX)
        s.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        s.save(OUT / f"{name}.png")
        done.append(s)
        print(name, s.size)
    refs = [Image.open(ROOT / f"art/test/objects/{n}.png").convert("RGBA") for n in ["tree_round", "rock_big"]]
    row = refs + done
    S = 4
    W = sum(i.width * S + 20 for i in row)
    H = max(i.height for i in row) * S
    out = Image.new("RGBA", (W, H + 20), (70, 110, 60, 255))
    x = 10
    for i in row:
        out.alpha_composite(i.resize((i.width * S, i.height * S), Image.NEAREST), (x, 10 + H - i.height * S))
        x += i.width * S + 20
    out.save(ROOT / "art-src/preview/hunt_props_vs_objects.png")


if __name__ == "__main__":
    main()
