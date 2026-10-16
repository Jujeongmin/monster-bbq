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
fi
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_time.png 6 1 art-src/codex/out/hud --main time_morning:20 time_noon:20 time_afternoon:20 time_evening:16 time_night:18 bag:20
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_apps.png 6 1 art-src/codex/out/hud --main app_bag:28 app_upgrade:28 app_awaken:28 app_cookbook:28 app_menu:28 app_shop:28
python art-src/codex/pixelsnap.py art-src/codex/raw/hud_receipt.png 1 1 art-src/codex/out/hud --main receipt:40:8
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
