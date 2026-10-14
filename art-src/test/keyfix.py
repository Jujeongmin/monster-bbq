"""Make a PixelLab background layer transparent.

create_image_pixflux(no_background=True) still returns scene-sized layers (e.g. 400x224) with a solid
light backdrop. This floods that backdrop away from the image border, then peels the light halo
pixels left around the edges.

    python keyfix.py <src.png> <dst.png> [tolerance=6] [halo=90] [passes=3]
"""
import sys
from collections import Counter, deque

from PIL import Image


def keyfix(src, dst, tol=6, halo=90, passes=3):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    edge = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    bg = Counter(px[p][:3] for p in edge).most_common(1)[0][0]

    def close(c, per_channel):
        return all(abs(a - b) <= per_channel for a, b in zip(c[:3], bg))

    def near_bg(c, total):
        return sum(abs(a - b) for a, b in zip(c[:3], bg)) <= total

    # flood the backdrop from the border
    seen = set(p for p in edge if close(px[p], tol))
    queue = deque(seen)
    removed = 0
    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        removed += 1
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and close(px[n], tol):
                seen.add(n)
                queue.append(n)

    # peel light halo pixels that touch transparency
    peeled = 0
    for _ in range(passes):
        kill = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] == 0 or not near_bg(px[x, y], halo):
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        kill.append((x, y))
                        break
        for p in kill:
            px[p] = (0, 0, 0, 0)
        peeled += len(kill)

    im.save(dst)
    print(f"{src}: backdrop {bg} removed {100 * removed / (w * h):.1f}%, halo peeled {peeled}px")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        sys.exit(__doc__)
    keyfix(args[0], args[1], *map(int, args[2:]))
