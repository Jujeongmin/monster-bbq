#!/usr/bin/env bash
# Dave-style UI pictures (design 2026-10-16-dave-ui, section 8): Codex draws three sheets, pixelsnap turns
# them into real pixel art in art-src/codex/out/hud/ for the user to approve. Nothing goes into art/ here:
# an approved picture is copied to art/test/ui/hud/<same name>.png and the game picks it up by itself
# (src/game/art.ts stands the old icons in until then).
#   bash art-src/codex/run-hud.sh            # draw (Codex) and snap
#   bash art-src/codex/run-hud.sh snap       # snap again only (after re-drawing one sheet)
set -euo pipefail
cd "$(dirname "$0")/../.."
P=$(pwd)
if [ "${1:-}" != "snap" ]; then
  codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art-src/codex/raw/ref_hud_icons_x8.png - < art-src/codex/prompt-hud-time.txt
  codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art-src/codex/raw/ref_hud_icons_x8.png - < art-src/codex/prompt-hud-apps.txt
  codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art/test/shop/bg.png art-src/codex/raw/ref_hud_icons_x8.png - < art-src/codex/prompt-hud-receipt.txt
  codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art/test/shop/bg.png art-src/codex/raw/ref_hud_icons_x8.png - < art-src/codex/prompt-hud-notebook.txt
  # the shop by day: the same room, daylight outside the window (user, 2026-10-16)
  codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art-src/codex/raw/shop_counter_bg2.png - < art-src/codex/prompt-shop-day.txt
  # each window its own material (user, 2026-10-16: the same card frame everywhere cheapened the game)
  for k in bag upgrade rack; do
    codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art/test/shop/bg.png art-src/codex/raw/ref_hud_icons_x8.png - < "art-src/codex/prompt-ui-$k.txt"
  done
fi
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_time.png 6 1 art-src/codex/out/hud --main time_morning:20 time_noon:20 time_afternoon:20 time_evening:16 time_night:18 bag:20
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_apps.png 6 1 art-src/codex/out/hud --main app_bag:28 app_upgrade:28 app_awaken:28 app_cookbook:28 app_menu:28 app_shop:28
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_receipt.png 1 1 art-src/codex/out/hud --main receipt:40:8
# Codex drew the closed notebook narrow and the open one wide, not in two equal halves: split at the magenta
# gap between them (a half-way cut sliced the open one), each piece padded with magenta
python - <<'PY'
from PIL import Image
im = Image.open("art-src/codex/raw/hud_notebook.png").convert("RGB")
px = im.load()
gap = [x for x in range(im.width // 8, im.width * 7 // 8)
       if all(px[x, y][0] > 200 and px[x, y][2] > 200 and px[x, y][1] < 80 for y in range(0, im.height, 2))]
cut = (gap[0] + gap[-1]) // 2
for name, box in [("closed", (0, 0, cut, im.height)), ("open", (cut, 0, im.width, im.height))]:
    piece = im.crop(box)
    padded = Image.new("RGB", (piece.width + 64, piece.height + 64), (255, 0, 255))
    padded.paste(piece, (32, 32))
    padded.save(f"art-src/codex/raw/hud_notebook_{name}.png")
PY
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_notebook_closed.png 1 1 art-src/codex/out/hud --main notebook_closed:84:20
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_notebook_open.png 1 1 art-src/codex/out/hud --main notebook_open:168:20
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_bag_cloth.png 1 1 art-src/codex/out/hud --main bag_cloth:200:20
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_upgrade_board.png 1 1 art-src/codex/out/hud --main upgrade_board:216:20
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_weapon_rack.png 1 1 art-src/codex/out/hud --main weapon_rack:208:20
# the daytime back wall: shrunk to the night room's 480x270 by each block's most common colour (no drawing),
# then the same box the night back wall was cut from (art-src/codex/slice_shop3d.py)
python - <<'PY'
from collections import Counter
from pathlib import Path
from PIL import Image
src = Path("art-src/codex/raw/shop_counter_day.png")
if src.exists():
    im = Image.open(src).convert("RGB").quantize(48).convert("RGB")
    W, H = 480, 270
    bw, bh = im.width / W, im.height / H
    out = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            c = Counter(px[int(x * bw + i), int(y * bh + j)] for i in range(int(bw)) for j in range(int(bh)))
            out.putpixel((x, y), c.most_common(1)[0][0])
    out.crop((0, 0, 480, 201)).save("art-src/codex/out/hud/backwall_day.png")
    print("backwall_day: art-src/codex/out/hud/backwall_day.png (approve, then copy to art/test/shop3d/backwall_day.png)")
PY
# one sheet of all of them at 4x for looking at
python - <<'PY'
from pathlib import Path
from PIL import Image
out = Path("art-src/codex/out/hud")
ims = [(p.stem, Image.open(p).convert("RGBA")) for p in sorted(out.glob("*.png")) if p.stem != "_preview"]
k, pad = 4, 16
w = sum(im.width * k + pad for _, im in ims) + pad
h = max(im.height for _, im in ims) * k + 2 * pad
sheet = Image.new("RGBA", (w, h), (58, 36, 20, 255))
x = pad
for _, im in ims:
    sheet.alpha_composite(im.resize((im.width * k, im.height * k), Image.NEAREST), (x, pad))
    x += im.width * k + pad
sheet.save(out / "_preview.png")
print("preview:", out / "_preview.png", [n for n, _ in ims])
PY
