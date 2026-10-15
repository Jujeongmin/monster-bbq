"""Cut the approved Bandal sheet (PixelLab pixel conversion, 4 x 2 poses) into one PNG per pose.

    python art-src/pixellab/shop2/slice_bandal.py

Only cuts, keys the magenta background to transparent and trims; nothing is drawn.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SHEET = ROOT / "art-src/pixellab/shop2/bandal_200_faithful.png"
OUT = ROOT / "art/test/bandal"
NAMES = [["idle", "breathe", "grill", "turn"], ["serve", "smile", "startled", "wipe"]]


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            # magenta, and the darker purple fringe the conversion left along the bottom row's waist line
            if (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 50):
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = key(Image.open(SHEET))
    w, h = sheet.width / 4, sheet.height / 2
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            cell = sheet.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h)))
            cell.crop(cell.getbbox()).save(OUT / f"{name}.png")
            print(name, cell.getbbox())


if __name__ == "__main__":
    main()
