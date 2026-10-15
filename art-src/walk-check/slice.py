"""Cut the Codex 4-frame walk strips into game frames the size of the current hunter art.

    python -I art-src/walk-check/slice.py

Nothing is drawn: each cell is keyed (magenta out), cropped, shrunk by one factor per strip so the
character is as tall as today's standing hunter frame of that facing (art/test/hunter/<facing>_0.png), its alpha snapped to
on/off, and placed on the same 105x105 canvas with the feet on one baseline and the head-and-torso centre
on the canvas centre (so the body does not sway while the legs move). Output: art-src/walk-check/out/<facing>_<n>.png, a contact
sheet art-src/preview/walk4_frames.png and one GIF per facing in art-src/preview/walk4_<facing>.gif.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw"
OUT = ROOT / "art-src/walk-check/out"
PREVIEW = ROOT / "art-src/preview"
FACINGS = ["side", "down", "down45", "up45", "up"]
CANVAS = 105


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 50):
                px[x, y] = (0, 0, 0, 0)
    return im


def snap(im: Image.Image) -> Image.Image:
    a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    im.putalpha(a)
    return im


# the feet of every current hunter frame sit on this row of the 105 canvas
BASELINE = 98


def target_height(facing: str) -> int:
    # as tall as today's standing frame of the same facing (the diagonals borrow the side's)
    name = {"down": "down", "up": "up", "side": "side", "down45": "side", "up45": "side"}[facing]
    ref = Image.open(ROOT / f"art/test/hunter/{name}_0.png").convert("RGBA")
    box = ref.getbbox()
    return box[3] - box[1]


def body_centre(c: Image.Image) -> float:
    # the head and torso (upper 55%) decide where the frame sits, so the body stays put between frames
    # and only the legs move; centring on the feet made the body sway (user, 2026-10-15)
    px = c.load()
    bottom = int(c.height * 0.55)
    xs = [x for y in range(bottom) for x in range(c.width) if px[x, y][3] > 0]
    return sum(xs) / len(xs) if xs else c.width / 2


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet_rows = []
    for facing in FACINGS:
        th = target_height(facing)
        strip = key(Image.open(RAW / f"walk4_{facing}.png"))
        w = strip.width / 4
        cells = []
        for i in range(4):
            c = strip.crop((round(i * w), 0, round((i + 1) * w), strip.height))
            cells.append(c.crop(c.getbbox()))
        # one factor for the whole strip: the tallest frame becomes the reference height
        scale = th / max(c.height for c in cells)
        frames = []
        for i, c in enumerate(cells):
            s = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.LANCZOS)
            s = snap(s)
            canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
            x = round(CANVAS / 2 - body_centre(s))
            y = BASELINE - s.height
            canvas.alpha_composite(s, (x, y))
            canvas.save(OUT / f"{facing}_{i}.png")
            frames.append(canvas)
        sheet_rows.append(frames)
        big = [f.resize((CANVAS * 3, CANVAS * 3), Image.NEAREST).convert("P", palette=Image.Palette.ADAPTIVE) for f in frames]
        big[0].save(PREVIEW / f"walk4_{facing}.gif", save_all=True, append_images=big[1:], duration=125, loop=0, disposal=2)
        print(facing, "scale %.3f" % scale, [f"{c.width}x{c.height}" for c in cells])
    sheet = Image.new("RGBA", (CANVAS * 3 * 4 + 30, (CANVAS * 3 + 10) * len(FACINGS)), (60, 50, 44, 255))
    for r, frames in enumerate(sheet_rows):
        for i, f in enumerate(frames):
            sheet.alpha_composite(f.resize((CANVAS * 3, CANVAS * 3), Image.NEAREST), (i * (CANVAS * 3 + 10), r * (CANVAS * 3 + 10)))
    sheet.save(PREVIEW / "walk4_frames.png")


if __name__ == "__main__":
    main()
