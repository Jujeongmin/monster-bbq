"""Cut the Codex touch pad sheet (raw/touch_pad.png, prompt-touch-pad.txt) into the game's touch controls.

    python -I art-src/codex/slice_touch_pad.py

Nothing is drawn: pixelsnap.py keys the magenta out and shrinks each cell to real pixels; the stick's knob
then keeps only its yellow dome, rimmed by its own dark outline (the brown cup under it goes: user,
2026-10-22). Output: art/test/ui/pad/{stick_base,stick_knob,btn_slash,btn_side,btn_use}.png.
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/touch_pad.png"
OUT = ROOT / "art/test/ui/pad"
YELLOW = {(255, 227, 106), (200, 138, 9), (244, 198, 44), (255, 244, 231), (244, 236, 255)}
OUTLINE = (8, 7, 6, 255)


def knob_dome(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    keep = {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] and px[x, y][:3] in YELLOW}
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    o = out.load()
    for x, y in keep:
        o[x, y] = px[x, y]
    for y in range(im.height):
        for x in range(im.width):
            if (x, y) not in keep and any((x + dx, y + dy) in keep for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                o[x, y] = OUTLINE
    out.crop(out.getbbox()).save(path)


def main():
    specs = ["stick_base:48", "stick_knob:22", "btn_slash:40", "btn_side:40", "btn_use:34"]
    subprocess.run([sys.executable, "-I", str(ROOT / "art-src/codex/pixelsnap.py"), str(RAW), "5", "1", str(OUT), *specs, "--main"], check=True)
    knob_dome(OUT / "stick_knob.png")


if __name__ == "__main__":
    main()
