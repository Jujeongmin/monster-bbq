"""Cut the Codex stamina gauge sheet (raw/stamina_ring.png: empty ring, full ring, fine face, tired face).

    python -I art-src/codex/slice_stamina_ring.py

Nothing is drawn: magenta keyed out, each of the 4 cells cropped and box-shrunk by 8 (drawn on an 8 px
grid), alpha snapped. Output: art-src/codex/out/stamina/{ring_empty,ring_full,face_fine,face_tired}.png and
a mock-up of the hunt HUD corner (the pieces stacked as the game would, on today's grass) in
art-src/preview/stamina_ring_hud.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/stamina_ring.png"
OUT = ROOT / "art-src/codex/out/stamina"
NAMES = ["ring_empty", "ring_full", "face_fine", "face_tired"]
GRID = 8


def key(im):
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
    w = sheet.width // 4
    pieces = {}
    for i, name in enumerate(NAMES):
        c = sheet.crop((i * w, 0, (i + 1) * w, sheet.height))
        c = c.crop(c.getbbox())
        s = c.resize((max(1, round(c.width / GRID)), max(1, round(c.height / GRID))), Image.BOX)
        s.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        s.save(OUT / f"{name}.png")
        pieces[name] = s
        print(name, s.size)
    # HUD corner mock-up at game scale x2 (one art pixel = 2 game pixels, shown x2 again for review)
    grass = Image.open(ROOT / "art/test/bg/grass.png").convert("RGBA")
    S = 4
    out = Image.new("RGBA", (3 * 70 * S, 70 * S))
    for x in range(0, out.width, grass.width * 2):
        for y in range(0, out.height, grass.height * 2):
            out.alpha_composite(grass.resize((grass.width * 2, grass.height * 2), Image.NEAREST), (x, y))
    f = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 11 * S)
    d = ImageDraw.Draw(out)
    for k, (frac, face, label) in enumerate([(1.0, "face_fine", "100"), (0.62, "face_fine", "62"), (0.18, "face_tired", "18")]):
        # the full ring shown only over the share of the circle that is left, clockwise from the top (the
        # game does the same with a pie mask over the art)
        r = pieces["ring_empty"].copy()
        full = pieces["ring_full"]
        pie = Image.new("L", full.size, 0)
        ImageDraw.Draw(pie).pieslice((-8, -8, full.width + 8, full.height + 8), -90, -90 + 360 * frac, fill=255)
        r.paste(full, (0, 0), Image.composite(full.getchannel("A"), Image.new("L", full.size, 0), pie))
        ox = k * 70 * S + 8 * S
        oy = 4 * S
        out.alpha_composite(r.resize((r.width * S, r.height * S), Image.NEAREST), (ox, oy))
        fc = pieces[face]
        out.alpha_composite(fc.resize((fc.width * S, fc.height * S), Image.NEAREST), (ox + (r.width - fc.width) * S // 2, oy + (r.height - fc.height) * S // 2))
        d.text((ox + r.width * S // 2, oy + r.height * S + 2 * S), label, font=f, fill=(255, 243, 216), stroke_width=3, stroke_fill=(43, 20, 8), anchor="mt")
    out.save(ROOT / "art-src/preview/stamina_ring_hud.png")


if __name__ == "__main__":
    main()
