"""Cut the Codex pixel UI kit (art-src/codex/raw/ui_kit_pixel.png) into real-size pieces.

    python -I art-src/ui-kit-pixel/cut.py

Codex drew every art pixel as a block of about 8x8 image pixels. This finds the grid offset where the
blocks line up best, samples the centre of each block (nothing is drawn), keys the magenta out, drops
specks smaller than 4 pixels, cuts the pieces apart by their outlines and names them in reading order.
Output: art-src/ui-kit-pixel/out/<name>.png and a 4x preview art-src/preview/ui_kit_pixel.png.
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art-src/codex/raw/ui_kit_pixel.png"
OUT = ROOT / "art-src/ui-kit-pixel/out"
PREVIEW = ROOT / "art-src/preview/ui_kit_pixel.png"
BLOCK = 8
# reading order: top row left to right, then the next rows
NAMES = [
    "panel", "card", "btn_normal", "btn_pressed", "btn_disabled",
    "tab_on", "tab_off", "topbar",
    "slot", "btn_small", "gauge_empty", "gauge_full",
    "bubble", "plate", "ribbon",
]


def is_key(p) -> bool:
    r, g, b = p[:3]
    return r > 200 and b > 200 and g < 90


def best_offset(im: Image.Image) -> tuple[int, int]:
    # the offset at which the most 8x8 blocks are one flat colour
    px = im.load()
    best, score = (0, 0), -1
    for oy in range(BLOCK):
        for ox in range(BLOCK):
            flat = 0
            for by in range(oy, im.height - BLOCK, BLOCK * 3):
                for bx in range(ox, im.width - BLOCK, BLOCK * 3):
                    c = px[bx, by]
                    if all(px[bx + dx, by + dy] == c for dx in (0, BLOCK - 1) for dy in (0, BLOCK - 1)):
                        flat += 1
            if flat > score:
                best, score = (ox, oy), flat
    return best


def sample(im: Image.Image, off: tuple[int, int]) -> Image.Image:
    ox, oy = off
    w, h = (im.width - ox) // BLOCK, (im.height - oy) // BLOCK
    px = im.load()
    out = Image.new("RGBA", (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            p = px[ox + x * BLOCK + BLOCK // 2, oy + y * BLOCK + BLOCK // 2]
            o[x, y] = (0, 0, 0, 0) if is_key(p) else (*p[:3], 255)
    return out


def blobs(im: Image.Image, min_px: int):
    a = im.load()
    seen = set()
    found = []
    for y in range(im.height):
        for x in range(im.width):
            if a[x, y][3] == 0 or (x, y) in seen:
                continue
            q = deque([(x, y)])
            seen.add((x, y))
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < im.width and 0 <= ny < im.height and (nx, ny) not in seen and a[nx, ny][3]:
                        seen.add((nx, ny))
                        q.append((nx, ny))
            found.append(pts)
    keep = [p for p in found if len(p) >= min_px]
    for p in found:
        if len(p) < min_px:
            for x, y in p:
                a[x, y] = (0, 0, 0, 0)
    return keep


def main():
    src = Image.open(SRC).convert("RGB")
    off = best_offset(src)
    small = sample(src, off)
    pieces = blobs(small, 4)
    boxes = []
    for pts in pieces:
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        boxes.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    # rows by vertical centre, then left to right
    boxes.sort(key=lambda b: (round((b[1] + b[3]) / 2 / 16), b[0]))
    if len(boxes) != len(NAMES):
        print("warning: expected", len(NAMES), "pieces, found", len(boxes), boxes)
    OUT.mkdir(parents=True, exist_ok=True)
    cut = []
    for name, box in zip(NAMES, boxes):
        piece = small.crop(box)
        piece.save(OUT / f"{name}.png")
        cut.append((name, piece))
        print(name, piece.size, len(piece.getcolors(1 << 16) or []), "colours")
    print("offset", off, "art size", small.size, "colours", len(small.convert("RGB").getcolors(1 << 16)))
    sheet = Image.new("RGBA", (small.width * 4, small.height * 4), (40, 30, 26, 255))
    sheet.alpha_composite(small.resize((small.width * 4, small.height * 4), Image.NEAREST))
    sheet.save(PREVIEW)


if __name__ == "__main__":
    main()
