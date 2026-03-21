#!/usr/bin/env python3
"""
המרת לוגו ל-PNG עם שקיפות: מסיר רקע שחמט/אפור בהיר (JPEG ללא אלפא).
דורש: pip install pillow

שימוש:
  python3 scripts/process-kamershalor-logo.py path/to/source.png public/kamershalor-logo.png
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("התקן: pip install pillow")
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    if not src.is_file():
        print("קובץ מקור לא נמצא:", src)
        sys.exit(1)

    im = Image.open(src).convert("RGBA")
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            m, M = min(r, g, b), max(r, g, b)
            if M - m > 52:
                continue
            if M > 178 and m > 118:
                pixels[x, y] = (r, g, b, 0)
            elif M > 210 and m > 95:
                pixels[x, y] = (r, g, b, 0)

    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "PNG", optimize=True)
    print("נשמר:", out, f"({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
