"""Pixel pass without PixelLab: shrink the portraits and icons to a small native size and cut their colours.

    python -I art-src/pixel-pass/convert.py

Nothing is drawn: each picture is box-shrunk, its alpha snapped to on/off, the magenta fringe left from
the Codex key removed, and its colours cut to a palette shared by its group (a character's four faces
share one, so they match). Output goes to art-src/pixel-pass/out/ for the user to compare; approved results
are copied into art/test (user-approved 2026-10-15). A comparison sheet goes to art-src/preview/pixel_pass_compare.png.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# the pictures as they were before this pass (copied from art/test, 2026-10-15)
ART = ROOT / "art-src/pixel-pass/src"
OUT = ROOT / "art-src/pixel-pass/out"
PREVIEW = ROOT / "art-src/preview/pixel_pass_compare.png"

# group name -> (files, scale, colours, canvas): icons are centred on one canvas size per group so the
# screens can show them at a whole multiple of a known size
GROUPS = {
    "lid": ([f"lid/{f}.png" for f in ["normal", "angry", "smug", "surprised"]], 0.5, 28, None),
    **{
        who: ([f"yokai/{who}_{f}.png" for f in ["normal", "happy", "scared", "sulky"]], 0.5, 28, None)
        for who in ["dokkaebi", "gumiho", "reaper", "ghost"]
    },
    "dishes": ([f"dishes/{d}.png" for d in ["grilled_belly", "garlic_neck", "belly_ssam", "honey_rabbit", "shiitake_grill", "rib_stew", "baeksuk", "chicken_perilla", "fail"]], 1, 24, (42, 40)),
    "items": (
        [f"items/icon_{i}.png" for i in ["boar_belly", "boar_neck", "boar_rib", "rabbit_leg", "honeycomb", "chicken_thigh", "chicken_breast", "shiitake", "wild_garlic", "perilla"]],
        1,
        20,
        (21, 20),
    ),
}


def fringe(r: int, g: int, b: int) -> bool:
    # leftover magenta from the Codex background key: red and blue both well above green
    return r > 120 and b > 110 and min(r, b) - g > 60


def shrink(im: Image.Image, scale: float) -> Image.Image:
    im = im.convert("RGBA")
    if scale != 1:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.BOX)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (0, 0, 0, 0) if a < 128 or fringe(r, g, b) else (r, g, b, 255)
    return im


def palette_for(images: list[Image.Image], colours: int) -> Image.Image:
    # one palette from every opaque pixel of the group
    pixels = [p[:3] for im in images for p in im.get_flattened_data() if p[3] == 255]
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    return strip.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, kmeans=3, dither=Image.Dither.NONE)


def apply(im: Image.Image, pal: Image.Image) -> Image.Image:
    rgb = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
    rgb.putalpha(im.getchannel("A"))
    return rgb


def main():
    rows = []
    for name, (files, scale, colours, canvas) in GROUPS.items():
        small = [shrink(Image.open(ART / f), scale) for f in files]
        pal = palette_for(small, colours)
        row = []
        for f, im in zip(files, small):
            out = apply(im, pal)
            if canvas:
                padded = Image.new("RGBA", canvas, (0, 0, 0, 0))
                padded.alpha_composite(out, ((canvas[0] - out.width) // 2, (canvas[1] - out.height) // 2))
                out = padded
            dest = OUT / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            out.save(dest)
            row.append((Image.open(ART / f).convert("RGBA"), out, scale))
        rows.append(row)
        print(name, len(files), "files,", colours, "colours, scale", scale)
    sheet(rows)


def sheet(rows):
    # each picture: original on top, converted under it, both at the same on-screen size (converted
    # enlarged by whole pixels, the original by the same factor so they line up)
    zoom = 2
    tiles = []
    for row in rows:
        cells = []
        for orig, conv, scale in row:
            k = zoom if scale == 1 else zoom * 2
            c = conv.resize((conv.width * k, conv.height * k), Image.NEAREST)
            o = orig.resize((c.width, c.height), Image.BILINEAR)
            cells.append((o, c))
        w = sum(max(o.width, c.width) + 12 for o, c in cells)
        h = max(o.height for o, _ in cells) + max(c.height for _, c in cells) + 12
        tile = Image.new("RGBA", (w, h), (64, 58, 54, 255))
        x = 0
        top = max(o.height for o, _ in cells)
        for o, c in cells:
            tile.alpha_composite(o, (x, 0))
            tile.alpha_composite(c, (x, top + 12))
            x += max(o.width, c.width) + 12
        tiles.append(tile)
    W = max(t.width for t in tiles)
    H = sum(t.height + 24 for t in tiles)
    out = Image.new("RGBA", (W, H), (30, 26, 24, 255))
    y = 0
    for t in tiles:
        out.alpha_composite(t, (0, y))
        y += t.height + 24
    out.convert("RGB").save(PREVIEW)
    print("sheet", out.size, PREVIEW)


if __name__ == "__main__":
    main()
