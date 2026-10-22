"""Cut the Codex bowl of rice (raw/rice.png, prompt-rice.txt; approved 2026-10-22) into the game's three dish sizes.

    python -I art-src/codex/slice_rice.py

Nothing is drawn: pixelsnap.py keys the magenta out and shrinks it to real pixels at each width; the 42 px icon
is centred on the 42x40 canvas every dish icon has. Output: art/test/dishes/rice.png (42x40),
art/test/shop/dishes/rice.png (32 wide), art/test/shop3d/dishes/rice.png (20 wide).
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/rice.png"
SNAP = ROOT / "art-src/codex/pixelsnap.py"


def snap(out: Path, width: int, colors: int = 24) -> Path:
    subprocess.run([sys.executable, "-I", str(SNAP), str(RAW), "1", "1", str(out), f"rice:{width}:{colors}", "--main"], check=True)
    return out / "rice.png"


def main():
    icon = Image.open(snap(ROOT / "art/test/dishes", 42)).convert("RGBA")
    canvas = Image.new("RGBA", (42, 40), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((42 - icon.width) // 2, (40 - icon.height) // 2))
    canvas.save(ROOT / "art/test/dishes/rice.png")
    snap(ROOT / "art/test/shop/dishes", 32)
    snap(ROOT / "art/test/shop3d/dishes", 20, 16)


if __name__ == "__main__":
    main()
