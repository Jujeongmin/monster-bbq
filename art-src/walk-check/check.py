"""Check that a 4-frame walk strip really alternates its feet (frames: step, passing, step, passing).

    python -I art-src/walk-check/check.py art-src/codex/raw/walk4_side.png side

Nothing is drawn; the strip is only measured.
- front/back/diagonal facings: in each step frame, which half of the body (image-left or image-right)
  has the lower boot. Frames 1 and 3 must disagree.
- side facing: the leading (rightmost) foot is the near, lighter leg in one step frame and the far,
  darker leg in the other, so its brightness must differ clearly between frames 1 and 3.
- every facing: the step frames' stride (width of the feet row) must be wider than the passing frames'.
Prints one line per check and PASS/FAIL; exit code 1 on FAIL.
"""
import sys

from PIL import Image


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 50):
                px[x, y] = (0, 0, 0, 0)
    return im


def cells(im: Image.Image, n: int = 4):
    w = im.width / n
    out = []
    for i in range(n):
        c = im.crop((round(i * w), 0, round((i + 1) * w), im.height))
        out.append(c.crop(c.getbbox()))
    return out


def feet(c: Image.Image, share: float = 0.22):
    # opaque pixels in the bottom `share` of the body
    top = int(c.height * (1 - share))
    px = c.load()
    return [(x, y, px[x, y]) for y in range(top, c.height) for x in range(c.width) if px[x, y][3] > 0]


def lum(p) -> float:
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def lower_side(c: Image.Image) -> tuple[str, int]:
    mid = c.width / 2
    pts = feet(c)
    left = max((y for x, y, _ in pts if x < mid), default=-1)
    right = max((y for x, y, _ in pts if x >= mid), default=-1)
    gap = left - right
    return ("L" if gap > 1 else "R" if gap < -1 else "="), gap


def stride(c: Image.Image) -> int:
    xs = [x for x, _, _ in feet(c, 0.12)]
    return (max(xs) - min(xs)) if xs else 0


def front_foot_lum(c: Image.Image) -> float:
    pts = feet(c, 0.18)
    if not pts:
        return 0.0
    edge = max(x for x, _, _ in pts)
    front = [p for x, _, p in pts if x >= edge - c.width * 0.18]
    return sum(lum(p) for p in front) / len(front)


def main():
    path, facing = sys.argv[1], sys.argv[2]
    fr = cells(key(Image.open(path)))
    ok = True
    st = [stride(c) for c in fr]
    wide = min(st[0], st[2]) > max(st[1], st[3])
    print(f"stride step/pass: {st} -> {'ok' if wide else 'step frames not wider'}")
    ok &= wide
    if facing == "side":
        a, b = front_foot_lum(fr[0]), front_foot_lum(fr[2])
        alt = abs(a - b) >= 12
        print(f"leading-foot brightness f1={a:.0f} f3={b:.0f} -> {'alternates' if alt else 'same leg leads'}")
    else:
        s1, g1 = lower_side(fr[0])
        s3, g3 = lower_side(fr[2])
        alt = s1 != "=" and s3 != "=" and s1 != s3
        print(f"lower boot f1={s1}({g1}) f3={s3}({g3}) -> {'alternates' if alt else 'does not alternate'}")
    ok &= alt
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
