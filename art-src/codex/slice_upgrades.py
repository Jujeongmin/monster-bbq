"""Cut the Codex upgrade strip of the new hunter (raw/upgrades_newhunter.png) into the three upgrade pictures.

    python -I art-src/codex/slice_upgrades.py

Nothing is drawn: the magenta is keyed out, each of the 3 cells cropped, all three box-shrunk by ONE factor
(the tallest becomes TARGET art pixels, the old pictures' height) so the hunter is the same size in each,
alpha snapped on/off and the colours cut to one shared palette. Output: art-src/codex/out/upg_<name>.png and
a comparison with today's pictures in art-src/preview/upg_newhunter_compare.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/upgrades_newhunter.png"
OUT = ROOT / "art-src/codex/out"
NAMES = ["melee", "ranged", "armor"]
TARGET = 61
COLOURS = 64


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            # magenta and its fringe; the lavender slash has green close to red and blue, so it stays
            if a < 128 or (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 70):
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    strip = key(Image.open(RAW))
    # the pictures are split at the empty columns between them, not at the thirds: the thrown harpoon
    # reaches past its own cell
    alpha = strip.getchannel("A").load()
    filled = [any(alpha[x, y] for y in range(strip.height)) for x in range(strip.width)]
    runs, start = [], None
    for x, f in enumerate(filled + [False]):
        if f and start is None:
            start = x
        elif not f and start is not None:
            if runs and start - runs[-1][1] < 24:
                runs[-1] = (runs[-1][0], x)
            else:
                runs.append((start, x))
            start = None
    runs = sorted(sorted(runs, key=lambda r: r[1] - r[0])[-3:])
    cells = []
    for x0, x1 in runs:
        c = strip.crop((x0, 0, x1, strip.height))
        cells.append(c.crop(c.getbbox()))
    scale = TARGET / max(c.height for c in cells)
    small = []
    for c in cells:
        s = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.BOX)
        s.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        small.append(s)
    # one palette for all three so the hunter's colours match between pictures
    sheet = Image.new("RGB", (sum(s.width for s in small), TARGET))
    x = 0
    for s in small:
        sheet.paste(s.convert("RGB"), (x, 0), s)
        x += s.width
    pal = sheet.quantize(COLOURS, method=Image.Quantize.FASTOCTREE)
    done = []
    for name, s in zip(NAMES, small):
        q = s.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
        q.putalpha(s.getchannel("A"))
        q.save(OUT / f"upg_{name}.png")
        done.append(q)
        print(name, q.size)
    # comparison: today's pictures over the new ones, 4x
    S = 4
    old = [Image.open(ROOT / f"art/test/ui/upg_{n}.png").convert("RGBA") for n in NAMES]
    rh = max(im.height for im in old + done) * S
    f = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 22)
    W = 170 + sum(max(a.width, b.width) * S + 40 for a, b in zip(old, done))
    im = Image.new("RGBA", (W, rh * 2 + 60), (52, 44, 38, 255))
    d = ImageDraw.Draw(im)
    d.text((10, 20 + rh // 2 - 12), "지금", fill=(255, 240, 210), font=f)
    d.text((10, 40 + rh + rh // 2 - 12), "새 사냥꾼", fill=(255, 240, 210), font=f)
    x = 170
    for a, b in zip(old, done):
        im.alpha_composite(a.resize((a.width * S, a.height * S), Image.NEAREST), (x, 20 + rh - a.height * S))
        im.alpha_composite(b.resize((b.width * S, b.height * S), Image.NEAREST), (x, 40 + 2 * rh - b.height * S))
        x += max(a.width, b.width) * S + 40
    im.save(ROOT / "art-src/preview/upg_newhunter_compare.png")


if __name__ == "__main__":
    main()
