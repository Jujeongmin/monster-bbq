# Turns a Codex sheet (fake pixels: uneven blocks, soft edges, glow, ~300k colours) into real pixel art
# without drawing anything: the magenta backdrop goes transparent, each object is cropped, given its own
# small palette, and shrunk so every output pixel takes the most common colour of its block (outlines
# and flat areas stay whole instead of being averaged into mush). For small props only; backgrounds and
# characters go through PixelLab (user, 2026-10-16).
#
#   python art-src/codex/pixelsnap.py <sheet.png> <cols> <rows> <out dir> <name:width> ...
# one name:width[:colours] per cell, row by row ("-" skips a cell); width = the object's width in output
# pixels, colours = its palette size (default 24; fewer calms busy parts like a grill's grate).
import sys
from collections import Counter
from pathlib import Path
from PIL import Image

COLORS = 24  # per object


def is_backdrop(r: int, g: int, b: int) -> bool:
    # the magenta and its soft edge (magenta mixed into the object's rim)
    return r > 150 and b > 150 and g < 120 and abs(r - b) < 70


def unkey(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if is_backdrop(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return im


def drop_specks(im: Image.Image, smallest: int = 6) -> Image.Image:
    # loose bits a few pixels big (wisps of steam, stray rim pixels) go; the object itself stays
    px = im.load()
    seen = set()
    for y in range(im.height):
        for x in range(im.width):
            if (x, y) in seen or px[x, y][3] == 0:
                continue
            part, todo = [], [(x, y)]
            seen.add((x, y))
            while todo:
                cx, cy = todo.pop()
                part.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < im.width and 0 <= ny < im.height and (nx, ny) not in seen and px[nx, ny][3] > 0:
                        seen.add((nx, ny))
                        todo.append((nx, ny))
            if len(part) < smallest:
                for cx, cy in part:
                    px[cx, cy] = (0, 0, 0, 0)
    return im


def snap(obj: Image.Image, width: int, colors: int = COLORS) -> Image.Image:
    block = obj.width / width
    height = max(1, round(obj.height / block))
    # the object's own palette (a whole-sheet palette washes out small bright parts)
    flat = Image.new("RGB", obj.size, (0, 0, 0))
    flat.paste(obj, mask=obj.split()[3])
    pal = flat.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = pal.load()
    colours = pal.getpalette()
    alpha = obj.split()[3].load()
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    o = out.load()
    for y in range(height):
        for x in range(width):
            x0, x1 = int(x * block), max(int(x * block) + 1, int((x + 1) * block))
            y0, y1 = int(y * block), max(int(y * block) + 1, int((y + 1) * block))
            cells = [(i, j) for i in range(x0, min(x1, obj.width)) for j in range(y0, min(y1, obj.height))]
            solid = [q[i, j] for i, j in cells if alpha[i, j] > 128]
            if len(solid) * 2 < len(cells):
                continue  # mostly backdrop: transparent
            c = Counter(solid).most_common(1)[0][0]
            o[x, y] = (*colours[c * 3 : c * 3 + 3], 255)
    return drop_specks(out)


def main():
    sheet, cols, rows, out_dir, *specs = sys.argv[1:]
    cols, rows = int(cols), int(rows)
    im = unkey(Image.open(sheet))
    w, h = im.width / cols, im.height / rows
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for n, spec in enumerate(specs):
        if spec == "-":
            continue
        name, width, *colors = spec.split(":")
        r, c = divmod(n, cols)
        cell = im.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h)))
        box = cell.getbbox()
        if not box:
            continue
        snap(cell.crop(box), int(width), int(colors[0]) if colors else COLORS).save(out / f"{name}.png")
        print(name, end=" ")
    print()


if __name__ == "__main__":
    main()
