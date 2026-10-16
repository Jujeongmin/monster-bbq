"""Stand-in room textures for the 3D night shop (shop 3D design 8, "until the art comes").

    python art-src/codex/slice_shop3d.py

Cut, not drawn: the back wall, the counter's top and front, and the floor planks, from the Codex counter
background already turned into dots (art-src/codex/out/shop_counter2_480.png), the same boxes the spike used.
They stay until the approved room art replaces them.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art-src/codex/out/shop_counter2_480.png"
OUT = ROOT / "art/test/shop3d"
BOXES = {
    "backwall": (0, 0, 480, 201),
    "countertop": (60, 199, 400, 206),
    "counterfront": (60, 205, 400, 224),
    "floor": (60, 226, 400, 270),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert("RGB")
    for name, box in BOXES.items():
        piece = im.crop(box)
        piece.save(OUT / f"{name}.png")
        print(name, piece.size)


if __name__ == "__main__":
    main()
