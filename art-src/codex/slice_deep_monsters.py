"""Cut the deep floors' monster sheets (raw/{frog,snake,bat,crab}_sheet.png, 4x4) into frames.

    python -I art-src/codex/slice_deep_monsters.py

Same keying and shrinking as slice_characters.py (magenta out, premultiplied box shrink, alpha snapped);
rows side, down, up, special. Codex does not keep to its grid (a dive or a tongue crosses the cell lines,
rows sit unevenly), so the poses are found as blobs (pieces close together, like a tongue's tip or
dizzy stars, belong to one pose), put in reading order, and each is set on one canvas per sheet with its
feet on a shared baseline — nothing is cut off. Scales put the frog general and the crab at the boar's size, the snake a
little smaller, the bat at the bee's. Output: art-src/codex/out/deep/<who>/<row>_<n>.png (copied to
art/test/<who> once approved) and a preview next to today's boar and rabbit in art-src/preview/deep_monsters.png.
"""
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice_characters import key_magenta  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw"
OUT = ROOT / "art-src/codex/out/deep"
ROWS = ["side", "down", "up", "special"]
SHEETS = [("frog", 1 / 3), ("snake", 0.3), ("bat", 0.22), ("crab", 0.3)]


def main():
    previews = []
    for who, scale in SHEETS:
        sheet = key_magenta(Image.open(RAW / f"{who}_sheet.png"))
        alpha = np.array(sheet.getchannel("A")) >= 110
        # pieces within 14 px of each other are one pose
        labels, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=14))
        boxes = []
        for i, sl in enumerate(ndimage.find_objects(labels)):
            if sl is None:
                continue
            mask = (labels[sl] == i + 1) & alpha[sl]
            if mask.sum() < 800:
                continue
            ys, xs = np.nonzero(mask)
            boxes.append((sl[1].start + xs.min(), sl[0].start + ys.min(), sl[1].start + xs.max() + 1, sl[0].start + ys.max() + 1))
        assert len(boxes) == 16, (who, len(boxes))
        # reading order: four rows by height (centres), each left to right
        boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
        ordered = []
        for r in range(4):
            ordered += sorted(boxes[r * 4:(r + 1) * 4], key=lambda b: b[0])
        cw = max(b[2] - b[0] for b in ordered) + 16
        ch = max(b[3] - b[1] for b in ordered) + 16
        canvas = max(cw, ch, round(sheet.width / 4))
        out = OUT / who
        out.mkdir(parents=True, exist_ok=True)
        size = (round(canvas * scale), round(canvas * scale))
        frames = []
        for k, b in enumerate(ordered):
            piece = sheet.crop(b)
            cell = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
            # centred, feet on a shared baseline near the bottom
            cell.alpha_composite(piece, ((canvas - piece.width) // 2, canvas - 8 - piece.height))
            small = cell.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
            rr, gg, bb, aa = small.split()
            frame = Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0)))
            frame.save(out / f"{ROWS[k // 4]}_{k % 4}.png")
            frames.append(frame)
        previews.append((who, frames))
        print(who, size)
    # one row per monster: the side walk then the special move, at 2x; today's boar and rabbit on the last row
    S = 2
    box = 110 * S
    rows = [(who, frames[:4] + frames[12:16]) for who, frames in previews]
    rows.append(("refs", [Image.open(ROOT / f"art/test/{w}/side_0.png").convert("RGBA") for w in ["boar", "rabbit", "bee"]]))
    sheet = Image.new("RGBA", (box * 8 + 40, box * len(rows) + 20), (88, 140, 70, 255))
    for r, (_, frames) in enumerate(rows):
        for k, f in enumerate(frames):
            big = f.resize((f.width * S, f.height * S), Image.NEAREST)
            sheet.alpha_composite(big, (10 + k * box + (k >= 4) * 20, 10 + r * box + box - big.height))
    sheet.save(ROOT / "art-src/preview/deep_monsters.png")


if __name__ == "__main__":
    main()
