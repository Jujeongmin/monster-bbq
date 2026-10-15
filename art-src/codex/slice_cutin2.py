"""Cut the second research cut-in (raw/cutin2_a, _b, _c: drawn on an 8 px grid like the in-game Bandal) into panels.

    python -I art-src/codex/slice_cutin2.py

Nothing is drawn: each sheet is split at its black gaps into panels, every panel box-shrunk to WIDTH art
pixels wide (shown at 2x in the game, like the shop) and its colours cut to one palette shared by all
panels. Output: art-src/codex/out/cutin2/<sheet>_<n>.png and a preview sheet
art-src/preview/cutin2_panels.png (each panel at 2x).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw"
OUT = ROOT / "art-src/codex/out/cutin2"
SHEETS = ["cutin2_a", "cutin2_b", "cutin2_c"]
WIDTH = 192
COLOURS = 28


def panels(im: Image.Image) -> list[Image.Image]:
    # rows that are almost all black are the gaps between panels
    rgb = im.convert("RGB")
    px = rgb.load()
    dark = [sum(1 for x in range(0, rgb.width, 4) if sum(px[x, y]) < 90) > rgb.width / 4 * 0.9 for y in range(rgb.height)]
    out, start = [], None
    for y, d in enumerate(dark + [True]):
        if not d and start is None:
            start = y
        elif d and start is not None:
            if y - start > rgb.height / 6:
                out.append(rgb.crop((0, start, rgb.width, y)))
            start = None
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    small = []
    for name in SHEETS:
        for i, p in enumerate(panels(Image.open(RAW / f"{name}.png"))):
            h = round(p.height * WIDTH / p.width)
            small.append((f"{name}_{i}", p.resize((WIDTH, h), Image.BOX)))
    strip = Image.new("RGB", (WIDTH, sum(s.height for _, s in small)))
    y = 0
    for _, s in small:
        strip.paste(s, (0, y))
        y += s.height
    pal = strip.quantize(COLOURS, method=Image.Quantize.FASTOCTREE)
    done = []
    for name, s in small:
        q = s.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
        q.save(OUT / f"{name}.png")
        done.append(q)
        print(name, q.size)
    gap = 8
    sheet = Image.new("RGB", (WIDTH * 2 * 2 + gap, (max(d.height for d in done) * 2 + gap) * ((len(done) + 1) // 2)), (20, 14, 10))
    for k, d in enumerate(done):
        big = d.resize((d.width * 2, d.height * 2), Image.NEAREST)
        sheet.paste(big, ((k % 2) * (WIDTH * 2 + gap), (k // 2) * (big.height + gap)))
    sheet.save(ROOT / "art-src/preview/cutin2_panels.png")


if __name__ == "__main__":
    main()
