# Grandma's old friends from Codex (staff design 9), into real pixel art in art-src/codex/out/staff/ for the
# user to approve. Nothing is drawn.
# - each friend's sheet (raw/staff_<id>.png: walk 4 + work 1) at the scale the grandchild's shop walk got
#   (HERO_H tall from raw/shop3d_walk.png), so a shorter friend stays shorter; in the hunt frames' 105x105
#   box with the feet on row 98, like the grandchild in the shop.
# - their card portraits (raw/staff_portraits_<n>.png, 2x2 cells of 720x576 at 6x): one art pixel per six
#   sheet pixels, 120x96 like the grandchild's dialogue portraits.
#   python art-src/codex/slice_staff.py
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from charsnap import drop_specks, sample, unkey  # noqa: E402

RAW = Path("art-src/codex/raw")
OUT = Path("art-src/codex/out/staff")
HERO_H = 48
SIZE, BASE = 105, 98
FRAMES = ["walk_0", "walk_1", "walk_2", "walk_3", "work"]
PORTRAITS = {
    "staff_portraits_1.png": ["park", "sundeok", "kkaebi", "dallae"],
    "staff_portraits_2.png": ["hongmae", "soedol", "ppareun", "ggultteok"],
    "staff_portraits_3.png": ["jang", "baekhwa", "baekdu", "mumyeong"],
}


def cells(im: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    cw, ch = im.width / cols, im.height / rows
    return [im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))) for r in range(rows) for c in range(cols)]


def walk_scale() -> float:
    ref = cells(unkey(Image.open(RAW / "shop3d_walk.png")), 4, 1)[1]
    box = ref.getbbox()
    return HERO_H / (box[3] - box[1])


def sheet(fid: str, scale: float):
    out = OUT / fid
    out.mkdir(parents=True, exist_ok=True)
    for name, cell in zip(FRAMES, cells(unkey(Image.open(RAW / f"staff_{fid}.png")), 5, 1)):
        pose = drop_specks(sample(cell.crop(cell.getbbox()), scale))
        pose = pose.crop(pose.getbbox())
        head = pose.crop((0, 0, pose.width, max(1, pose.height // 3))).getbbox()
        mid = (head[0] + head[2]) // 2
        frame = Image.new("RGBA", (SIZE, SIZE))
        frame.paste(pose, (SIZE // 2 - mid, BASE - pose.height), pose)
        frame.save(out / f"{name}.png")
    print(fid, "height", pose.height)


def portraits(file: str, ids: list[str]):
    for fid, cell in zip(ids, cells(unkey(Image.open(RAW / file)), 2, 2)):
        (OUT / fid).mkdir(parents=True, exist_ok=True)
        drop_specks(sample(cell, 1 / 6)).save(OUT / fid / "portrait.png")


if __name__ == "__main__":
    s = walk_scale()
    for f in sorted(RAW.glob("staff_*.png")):
        fid = f.stem[len("staff_"):]
        if not fid.startswith("portraits"):
            sheet(fid, s)
    for file, ids in PORTRAITS.items():
        if (RAW / file).exists():
            portraits(file, ids)
