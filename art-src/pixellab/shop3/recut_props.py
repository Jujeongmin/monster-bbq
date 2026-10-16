# Re-cut the shop props by object (not by grid) and compare with what is in art/test/shop now.
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

PROPS = [["grill_lit", "grill_dirty", "grill_off", "stool"],
         ["coal_box", "drink_cart", "tray", "cup_tea"],
         ["cup_cider", "bowl_sikhye", "plate_dirty", "plate"]]

im = Image.open('art-src/pixellab/shop3/props_132.png').convert('RGBA')
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, _ = px[x, y]
        if r > 170 and b > 170 and g < 110:
            px[x, y] = (0, 0, 0, 0)
alpha = np.array(im.getchannel('A')) > 0
labels, n = ndimage.label(alpha, structure=np.ones((3, 3)))
sizes = ndimage.sum(alpha, labels, range(1, n + 1))
big = [lab for lab in range(1, n + 1) if sizes[lab - 1] >= 60]
cent = {lab: ndimage.center_of_mass(alpha, labels, lab) for lab in range(1, n + 1)}
owner = {lab: lab for lab in big}
for lab in range(1, n + 1):
    if lab in owner:
        continue
    cy, cx = cent[lab]
    # a small bit (steam, a stray pixel) joins the nearest big object
    owner[lab] = min(big, key=lambda b: (cent[b][0] - cy) ** 2 + (cent[b][1] - cx) ** 2)
cw, ch = im.width / 4, im.height / 3
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for lab in big:
    mine = np.isin(labels, [l for l, o in owner.items() if o == lab])
    cy, cx = cent[lab]
    name = PROPS[int(cy // ch)][int(cx // cw)]
    piece = im.copy()
    piece.putalpha(Image.fromarray(np.where(mine, 255, 0).astype(np.uint8)))
    piece = piece.crop(piece.getbbox())
    old = Image.open(f'art/test/shop/{name}.png')
    same = old.size == piece.size and np.array_equal(np.array(old.convert('RGBA')), np.array(piece))
    print(f'{name}: {old.size} -> {piece.size}{"  same" if same else ""}')
    piece.save(out / f'{name}.png')
