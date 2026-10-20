# The night shop's little effects (plan 2026-10-20 shop-explain-effects, task 6): Codex drew them 6 times
# over on a 4x6 grid of 16x16 art-pixel cells (art-src/codex/raw/fx_shop.png). Each block's centre colour
# gives the real pixel (charsnap's sampling), every frame keeps its whole 16x16 cell so an animation stays
# in place. Out: art-src/codex/out/fx/<name>.png and _preview.png (8x) for approval. Nothing is drawn.
#   python art-src/codex/slice_fx_shop.py
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from charsnap import sample, unkey  # noqa: E402

NAMES = [
    ["coin_0", "coin_1", "coin_2", "coin_3"],
    ["steam_0", "steam_1", "steam_2", "heart"],
    ["spark_0", "spark_1", "spark_2", "-"],
    ["foam_0", "foam_1", "foam_2", "-"],
    ["sparkle_0", "sparkle_1", "sparkle_2", "-"],
    ["puff_angry_0", "puff_angry_1", "puff_angry_2", "-"],
]
OUT = Path("art-src/codex/out/fx")
OUT.mkdir(parents=True, exist_ok=True)
sheet = unkey(Image.open("art-src/codex/raw/fx_shop.png"))
small = sample(sheet, 1 / 6)  # 64x96
done = []
for r, row in enumerate(NAMES):
    for c, name in enumerate(row):
        if name == "-":
            continue
        cell = small.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))
        if not cell.getbbox():
            print("empty", name)
            continue
        cell.save(OUT / f"{name}.png")
        done.append((name, cell))
k, pad = 8, 8
prev = Image.new("RGBA", (4 * (16 * k + pad) + pad, 6 * (16 * k + pad) + pad), (58, 36, 20, 255))
for name, cell in done:
    r = next(i for i, row in enumerate(NAMES) if name in row)
    c = NAMES[r].index(name)
    prev.alpha_composite(cell.resize((16 * k, 16 * k), Image.NEAREST), (pad + c * (16 * k + pad), pad + r * (16 * k + pad)))
prev.save(OUT / "_preview.png")
print("fx:", [n for n, _ in done])
