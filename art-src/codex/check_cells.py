"""Find sheet cells whose art crosses the cell border, where a plain grid cut would clip the drawing.
Grids (GRIDS) are now cut by drawing (slice_characters.grid_objects), so a hit there is handled; a hit in
an animation sheet (SHEETS, still cut by grid so frames line up) means a frame is clipped.

    python art-src/codex/check_cells.py

For every cell of every sheet the slicer cuts (SHEETS and GRIDS in slice_characters.py), counts opaque
pixels (after keying out magenta) on the cell's outer 2-pixel band. Anything there touches the next
cell, so the cut goes through the drawing.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice_characters import GRIDS, RAW, SHEETS, key_magenta  # noqa: E402

BAND = 2
MIN_PX = 3


def border_hits(alpha: np.ndarray, box) -> dict:
    x0, y0, x1, y1 = box
    cell = alpha[y0:y1, x0:x1] > 0
    return {
        "left": int(cell[:, :BAND].sum()),
        "right": int(cell[:, -BAND:].sum()),
        "top": int(cell[:BAND, :].sum()),
        "bottom": int(cell[-BAND:, :].sum()),
    }


def main():
    jobs = [(f, 4, len(rows), [f"{r}_{c}" for r in rows for c in range(4)]) for _, f, rows, _ in SHEETS]
    jobs += [(f, cols, rows, names) for _, f, cols, rows, names, _ in GRIDS]
    seen = set()
    bad = 0
    for file, cols, rows, names in jobs:
        if (file, cols, rows) in seen or not (RAW / file).exists():
            continue
        seen.add((file, cols, rows))
        alpha = np.array(key_magenta(Image.open(RAW / file)).getchannel("A"))
        h, w = alpha.shape
        cw, ch = w / cols, h / rows
        for k in range(cols * rows):
            c, r = k % cols, k // cols
            box = (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))
            hits = {s: n for s, n in border_hits(alpha, box).items() if n >= MIN_PX}
            # the sheet's own outer edge is not a neighbour, but art there is still clipped
            if hits:
                bad += 1
                name = names[k] if k < len(names) and names[k] else f"cell{k}"
                print(f"{file} {name} (col {c}, row {r}): {hits}")
    print(f"{bad} clipped cells")


if __name__ == "__main__":
    main()
