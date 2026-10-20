# Re-cuts the guests at the counter (art/test/yokai/counter) from their PixelLab sheet. The first cut
# (art-src/pixellab/shop3/slice_shop3.py) used the sheet's fixed 56px cells, so the top of the ghost's hair,
# which pokes above her cell, was cut off and left under the reaper. Here every connected piece goes to the
# cell its centre lies in, so a picture keeps all of itself. Each yokai's seated poses (sit, eat, happy) are
# then padded to one width with the stool's legs centred and the feet on the bottom row, so the guest stays
# on the stool when the pose changes (the game stands a picture on its bottom centre). Nothing is drawn.
#   python art-src/codex/fix_seated.py [out dir]   # default writes over art/test/yokai/counter
import sys
from pathlib import Path
from PIL import Image

SHEET = Path("art-src/pixellab/shop3/customers_336.png")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("art/test/yokai/counter")
YOKAI = ["dokkaebi", "gumiho", "reaper", "ghost"]
POSES = ["walk_0", "walk_1", "sit", "eat", "happy", "angry"]
SEATED = ["sit", "eat", "happy"]


def unkey(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r > 170 and b > 170 and g < 110:
                px[x, y] = (0, 0, 0, 0)
    return im


def pieces(im: Image.Image) -> list[list[tuple[int, int]]]:
    a = im.split()[3].load()
    W, H = im.size
    seen: set[tuple[int, int]] = set()
    out = []
    for y in range(H):
        for x in range(W):
            if a[x, y] == 0 or (x, y) in seen:
                continue
            todo, part = [(x, y)], []
            seen.add((x, y))
            while todo:
                cx, cy = todo.pop()
                part.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and a[nx, ny] and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            todo.append((nx, ny))
            out.append(part)
    return out


def cut(sheet: Image.Image) -> dict[str, Image.Image]:
    cols, rows = len(POSES), len(YOKAI)
    cw, ch = sheet.width / cols, sheet.height / rows
    cells: dict[tuple[int, int], Image.Image] = {}
    spx = sheet.load()
    for part in pieces(sheet):
        mx = sum(x for x, _ in part) / len(part)
        my = sum(y for _, y in part) / len(part)
        key = (min(int(mx // cw), cols - 1), min(int(my // ch), rows - 1))
        cell = cells.setdefault(key, Image.new("RGBA", sheet.size))
        cpx = cell.load()
        for x, y in part:
            cpx[x, y] = spx[x, y]
    return {f"{YOKAI[r]}_{POSES[c]}": im.crop(im.getbbox()) for (c, r), im in cells.items()}


def legs_centre(im: Image.Image) -> float:
    a = im.split()[3]
    xs = [x for x in range(im.width) for y in range(im.height - 3, im.height) if a.getpixel((x, y))]
    return (min(xs) + max(xs)) / 2


OUT.mkdir(parents=True, exist_ok=True)
cut_out = cut(unkey(Image.open(SHEET)))
for y in YOKAI:
    for p in POSES:
        if p not in SEATED:
            cut_out[f"{y}_{p}"].save(OUT / f"{y}_{p}.png")
    ims = {p: cut_out[f"{y}_{p}"] for p in SEATED}
    cs = {p: legs_centre(ims[p]) for p in SEATED}
    half = max(max(cs[p], ims[p].width - cs[p]) for p in SEATED)
    W = int(round(half * 2))
    H = max(im.height for im in ims.values())
    for p, im in ims.items():
        canvas = Image.new("RGBA", (W, H))
        canvas.alpha_composite(im, (int(round(W / 2 - cs[p])), H - im.height))
        canvas.save(OUT / f"{y}_{p}.png")
        print(y, p, im.size, "->", canvas.size)
