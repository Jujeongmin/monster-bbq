# The 3D shop's people from Codex (spec 2026-10-16-shop-3d-design section 8, items 2 and 3), into real
# pixel art in art-src/codex/out/shop3d/ for the user to approve. Nothing is drawn.
# - seated guests (raw/shop3d_seated.png, 6x art pixels): block-centre sampled, every piece kept (hearts are
#   small), then each yokai's sit/eat/happy padded so the stool's legs are centred (fix_seated.py's rule).
# - the grandchild in the shop (raw/shop3d_hero.png) and his walk without the harpoon (raw/shop3d_walk.png),
#   both to HERO_H pixels tall (guest scale, the hunt picture is 25% bigger), in the hunt frames' 105x105
#   box with the feet on row 98 so the shop places them like the hunt frames.
#   python art-src/codex/slice_shop3d_chars.py
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from charsnap import drop_specks, sample, unkey  # noqa: E402
from fix_seated import legs_centre, pieces  # noqa: E402

OUT = Path("art-src/codex/out/shop3d")
YOKAI = ["dokkaebi", "gumiho", "reaper", "ghost"]
SEATED = ["sit", "eat", "happy"]
HERO_H = 48
SIZE, BASE = 105, 98


def body_height(cell: Image.Image) -> int:
    box = cell.getbbox()
    return box[3] - box[1]


def seated():
    # the whole sheet sampled at once, then every piece goes to the cell its centre lies in (a heart over
    # the ghost reaches into the reaper's cell; a fixed cell cut gave it to him)
    im = sample(unkey(Image.open("art-src/codex/raw/shop3d_seated.png")), 1 / 6)
    cw, ch = im.width / 3, im.height / 4
    cells: dict[tuple[int, int], Image.Image] = {}
    spx = im.load()
    for part in pieces(im):
        if len(part) < 4:
            continue
        mx = sum(x for x, _ in part) / len(part)
        my = sum(y for _, y in part) / len(part)
        cell = cells.setdefault((min(int(mx // cw), 2), min(int(my // ch), 3)), Image.new("RGBA", im.size))
        cpx = cell.load()
        for x, y in part:
            cpx[x, y] = spx[x, y]
    for r, y in enumerate(YOKAI):
        poses = {p: cells[(c, r)].crop(cells[(c, r)].getbbox()) for c, p in enumerate(SEATED)}
        cs = {p: legs_centre(poses[p]) for p in SEATED}
        W = int(round(2 * max(max(cs[p], poses[p].width - cs[p]) for p in SEATED)))
        H = max(im.height for im in poses.values())
        for p, pose in poses.items():
            canvas = Image.new("RGBA", (W, H))
            canvas.alpha_composite(pose, (int(round(W / 2 - cs[p])), H - pose.height))
            canvas.save(OUT / f"{y}_{p}.png")
        print(y, {p: poses[p].size for p in SEATED})


def frames(sheet: str, cols: int, rows: int, names: list[str], ref_cell: int):
    im = unkey(Image.open(sheet))
    cw, ch = im.width / cols, im.height / rows
    cells = [im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))) for r in range(rows) for c in range(cols)]
    scale = HERO_H / body_height(cells[ref_cell])  # one scale for the whole sheet, from a standing pose
    for name, cell in zip(names, cells):
        if name == "-" or not cell.getbbox():
            continue
        pose = drop_specks(sample(cell.crop(cell.getbbox()), scale))
        pose = pose.crop(pose.getbbox())
        head = pose.crop((0, 0, pose.width, max(1, pose.height // 3))).getbbox()
        mid = (head[0] + head[2]) // 2
        frame = Image.new("RGBA", (SIZE, SIZE))
        frame.paste(pose, (SIZE // 2 - mid, BASE - pose.height), pose)
        frame.save(OUT / f"{name}.png")
    print(sheet, "scale", round(scale, 4))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    seated()
    frames("art-src/codex/raw/shop3d_hero.png", 5, 2,
           ["carry_0", "carry_1", "carry_2", "carry_3", "serve", "scrub_0", "scrub_1", "pour", "stand", "-"], 8)
    frames("art-src/codex/raw/shop3d_walk.png", 4, 1, ["walk_0", "walk_1", "walk_2", "walk_3"], 1)
