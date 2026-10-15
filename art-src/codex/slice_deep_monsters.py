"""Cut the deep floors' monster sheets (raw/{frog,snake,bat,crab}_sheet.png, 4x4) into frames.

    python -I art-src/codex/slice_deep_monsters.py

Same keying and shrinking as slice_characters.py (magenta out, premultiplied box shrink, alpha snapped);
rows side, down, up, special. Scales put the frog general and the crab at the boar's size, the snake a
little smaller, the bat at the bee's. Output: art-src/codex/out/deep/<who>/<row>_<n>.png (copied to
art/test/<who> once approved) and a preview next to today's boar and rabbit in art-src/preview/deep_monsters.png.
"""
import sys
from pathlib import Path

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
        cw, ch = sheet.width / 4, sheet.height / 4
        out = OUT / who
        out.mkdir(parents=True, exist_ok=True)
        size = (round(cw * scale), round(ch * scale))
        frames = []
        for r, row in enumerate(ROWS):
            for c in range(4):
                cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
                small = cell.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
                rr, gg, bb, aa = small.split()
                frame = Image.merge("RGBA", (rr, gg, bb, aa.point(lambda v: 255 if v >= 110 else 0)))
                frame.save(out / f"{row}_{c}.png")
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
