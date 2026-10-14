"""Cut the Codex object sheet into game sprites and shrink the grass tile.

    python art-src/codex/slice.py

Codex draws at ~1254 px; the game wants its chunky pixels. Objects are found as separate
non-transparent blobs, cropped, shrunk by one shared factor (so sizes stay consistent), and their
alpha snapped to fully on/off so edges stay crisp.
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw"
SHEET = RAW / "exec-7895a231-f12d-40ea-9b57-929d7e6170b4.png"  # transparent object sheet
GRASS = RAW / "exec-447c681c-6e0d-4cbc-a8b8-20b6b4df22d2.png"
OUT_OBJ = ROOT / "art/test/objects"
OUT_BG = ROOT / "art/test/bg"
SCALE = 0.2
NAMES = ["tree_round", "tree_pine", "tree_cluster", "bush_pink", "bush_blue", "rock_big", "rock_small"]


def blobs(im: Image.Image, min_px: int = 3000):
    w, h = im.size
    a = im.getchannel("A").load()
    seen = bytearray(w * h)
    found = []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if a[x, y] < 128 or seen[y * w + x]:
                continue
            q = deque([(x, y)])
            seen[y * w + x] = 1
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and a[nx, ny] >= 128:
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            if n >= min_px:
                found.append((x0, y0, x1 + 1, y1 + 1))
    # rows of items (trees on top, small things below), each row left to right
    found.sort(key=lambda b: (b[1] > h * 0.6, b[0]))
    return found


def main():
    OUT_OBJ.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SHEET).convert("RGBA")
    boxes = blobs(sheet)
    if len(boxes) != len(NAMES):
        raise SystemExit(f"expected {len(NAMES)} objects, found {len(boxes)}: {boxes}")
    for name, box in zip(NAMES, boxes):
        crop = sheet.crop(box)
        size = (max(1, round(crop.width * SCALE)), max(1, round(crop.height * SCALE)))
        small = crop.resize(size, Image.BOX)
        r, g, b, a = small.split()
        a = a.point(lambda v: 255 if v >= 128 else 0)
        Image.merge("RGBA", (r, g, b, a)).save(OUT_OBJ / f"{name}.png")
        print(name, box, "->", size)
    grass = Image.open(GRASS).convert("RGBA").resize((256, 256), Image.BOX)
    grass.save(OUT_BG / "grass.png")
    print("grass -> 256x256")


if __name__ == "__main__":
    main()
