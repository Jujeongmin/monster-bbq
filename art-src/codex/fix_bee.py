"""Fix the bee's attack frames and its stinger, cut wrong by slice_characters.py (user, 2026-10-16).

    python art-src/codex/fix_bee.py

In bee_sheet.png Codex drew the flying stinger of attack frame 3 across the line between cells 3 and 4,
with a gap where the line is: the plain grid cut put its back half (no tip) into stinger.png and left
pieces of it beside the bee in attack_2 and attack_3. Here the two halves are joined again (the gap
taken out, nothing drawn) and shrunk like every bee frame, and the attack frames keep only the bee.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from slice_characters import key_magenta

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / "art-src/codex/raw/bee_sheet.png"
OUT = ROOT / "art/test/bee"
SCALE = 0.26
# the stinger's two halves in the sheet (back half with its trail, then the tip past the gap)
BACK = (848, 1084, 881, 1118)
TIP = (922, 1084, 945, 1118)


def shrink(im: Image.Image, scale: float) -> Image.Image:
    # premultiplied shrink, alpha snapped on/off (as slice_characters does)
    w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    small = im.resize((w, h), Image.BOX)
    a = np.array(small.getchannel("A"))
    small.putalpha(Image.fromarray(np.where(a >= 128, 255, 0).astype(np.uint8)))
    return small


def only_the_bee(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    alpha = np.array(im.getchannel("A")) > 0
    labels, n = ndimage.label(alpha)
    if n <= 1:
        return
    sizes = ndimage.sum(alpha, labels, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    a = np.array(im.getchannel("A"))
    a[labels != keep] = 0
    im.putalpha(Image.fromarray(a))
    im.save(path)


def main() -> None:
    sheet = key_magenta(Image.open(SHEET), despill=True)
    back, tip = sheet.crop(BACK), sheet.crop(TIP)
    joined = Image.new("RGBA", (back.width + tip.width, back.height), (0, 0, 0, 0))
    joined.alpha_composite(back, (0, 0))
    joined.alpha_composite(tip, (back.width, 0))
    joined = joined.crop(joined.getbbox())
    shrink(joined, SCALE).save(OUT / "stinger.png")
    for n in (2, 3):
        only_the_bee(OUT / f"attack_{n}.png")
    print("ok")


if __name__ == "__main__":
    main()
