#!/usr/bin/env bash
# The prologue's seven cut pictures (design 6, prologue A approved 2026-10-19): Codex draws each, then each
# is shrunk to 320x180 by each block's most common colour (no drawing) into art-src/codex/out/story/ for the
# user to approve. An approved one is copied to art/test/story/<name>.png and the cutscene uses it by itself
# (src/screens/story/Cutscene.tsx stands approved art in until then).
#   bash art-src/codex/run-story.sh          # draw and shrink
#   bash art-src/codex/run-story.sh shrink   # shrink again only
set -euo pipefail
cd "$(dirname "$0")/../.."
P=$(pwd)
NAMES="phone parcel shop lid0 lid1 lid bandal lidback dusk"
if [ "${1:-}" != "shrink" ]; then
  for n in $NAMES; do
    codex exec --skip-git-repo-check -s workspace-write -C "$P" --image art/test/shop/bg.png art-src/codex/raw/ref_hud_icons_x8.png - < "art-src/codex/prompt-story-$n.txt"
  done
fi
mkdir -p art-src/codex/out/story
python - $NAMES <<'PY'
import sys
from collections import Counter
from pathlib import Path
from PIL import Image
for n in sys.argv[1:]:
    src = Path(f"art-src/codex/raw/story_{n}.png")
    if not src.exists():
        print("missing", src); continue
    im = Image.open(src).convert("RGB").quantize(48).convert("RGB")
    W, H = 320, 180
    bw, bh = im.width / W, im.height / H
    px = im.load()
    out = Image.new("RGB", (W, H))
    for y in range(H):
        for x in range(W):
            c = Counter(px[int(x * bw + i), int(y * bh + j)] for i in range(int(bw)) for j in range(int(bh)))
            out.putpixel((x, y), c.most_common(1)[0][0])
    out.save(f"art-src/codex/out/story/{n}.png")
    out.resize((W * 4, H * 4), Image.NEAREST).save(f"art-src/codex/out/story/{n}_x4.png")
    print("story:", n)
PY
