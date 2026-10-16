# pixelsnap for characters. A Codex character is already drawn in big fake pixels (about 7 sheet pixels
# each), so reading the colour at the centre of each block gives the real pixel art back: thin parts (eyes,
# mouth, straps, a harpoon's shaft) survive, where pixelsnap's most-common-colour-per-block drops them and
# averaging blurs them. The magenta backdrop and the pink it leaves on the rim go; colours may be lifted a
# little (--color) because the converted sprite reads greyer than the original. Nothing is drawn.
#
#   python art-src/codex/charsnap.py <sheet.png> <cols> <rows> <scale> <out dir> <name> ... [--size 105]
#       [--base 98] [--color 1.3]
# one name per cell, row by row ("-" skips); scale = output pixels per sheet pixel, the same for every cell
# so every pose stays the same size. Each pose goes into a square --size frame with its feet on row --base,
# placed across by its head (the top third), so a walk cycle's body stays still while the legs move.
import sys
from collections import Counter
from pathlib import Path
from PIL import Image, ImageEnhance


def backdrop(r: int, g: int, b: int) -> bool:
    # magenta and the magenta mixed into the rim (pinkish purple); the character has no purple
    return r > 90 and b > 90 and g < min(r, b) - 45 and abs(r - b) < 90


def unkey(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if backdrop(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return im


def sample(cell: Image.Image, scale: float) -> Image.Image:
    # each output pixel: the most common colour (to a step of 12) among the 3x3 sheet pixels at its block's
    # centre, averaged within that colour; transparent when most of them are backdrop
    blk = 1 / scale
    w, h = round(cell.width * scale), round(cell.height * scale)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px, o = cell.load(), out.load()
    for y in range(h):
        for x in range(w):
            cx, cy = (x + 0.5) * blk, (y + 0.5) * blk
            pts = [px[min(cell.width - 1, int(cx + dx)), min(cell.height - 1, int(cy + dy))] for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
            solid = [p for p in pts if p[3] > 0]
            if len(solid) < 5:
                continue
            key = Counter((p[0] // 12, p[1] // 12, p[2] // 12) for p in solid).most_common(1)[0][0]
            pick = [p for p in solid if (p[0] // 12, p[1] // 12, p[2] // 12) == key]
            o[x, y] = (*(sum(p[k] for p in pick) // len(pick) for k in range(3)), 255)
    return out


def drop_specks(im: Image.Image, keep: float = 0.1) -> Image.Image:
    # bits of a neighbouring pose or stray rim pixels: every part under a tenth of the biggest goes
    px = im.load()
    seen, parts = set(), []
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
            parts.append(part)
    biggest = max((len(p) for p in parts), default=0)
    for part in parts:
        if len(part) < biggest * keep:
            for cx, cy in part:
                px[cx, cy] = (0, 0, 0, 0)
    return im


def lift(im: Image.Image, color: float) -> Image.Image:
    if color == 1:
        return im
    a = im.split()[3]
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(im.convert("RGB")).enhance(color)).enhance(1 + (color - 1) / 4)
    out = rgb.convert("RGBA")
    out.putalpha(a)
    return out


def main():
    args = sys.argv[1:]
    opt = {"--size": 105.0, "--base": 98.0, "--color": 1.0}
    for k in list(opt):
        if k in args:
            i = args.index(k)
            opt[k] = float(args[i + 1])
            del args[i : i + 2]
    size, base = int(opt["--size"]), int(opt["--base"])
    sheet, cols, rows, scale, out_dir, *names = args
    cols, rows, scale = int(cols), int(rows), float(scale)
    im = unkey(Image.open(sheet))
    w, h = im.width / cols, im.height / rows
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for n, name in enumerate(names):
        if name == "-":
            continue
        r, c = divmod(n, cols)
        cell = im.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h)))
        box = cell.getbbox()
        if not box:
            continue
        pose = drop_specks(sample(cell.crop(box), scale))
        pose = lift(pose.crop(pose.getbbox()), opt["--color"])
        head = pose.crop((0, 0, pose.width, max(1, pose.height // 3))).getbbox() or (0, 0, pose.width, 1)
        mid = (head[0] + head[2]) // 2
        frame = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        x, y = size // 2 - mid, base - pose.height
        if x < 0 or y < 0 or x + pose.width > size:
            print(f"({name} spills out of its frame)", end=" ")
        frame.paste(pose, (x, y), pose)
        frame.save(out / f"{name}.png")
        print(name, end=" ")
    print()


if __name__ == "__main__":
    main()
