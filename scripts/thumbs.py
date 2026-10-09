"""Makes the small copies the choose screen shows for the built-in pictures.

Run from the repository root after adding pictures under src/pictures: python3 scripts/thumbs.py
Needs Pillow (pip install pillow).
"""

from pathlib import Path

from PIL import Image

src = Path("src/pictures")
out = src / "thumbs"
out.mkdir(exist_ok=True)
for f in sorted(src.glob("*.jpg")):
    t = out / f.name
    if t.exists() and t.stat().st_mtime >= f.stat().st_mtime:
        continue
    im = Image.open(f).convert("RGB")
    im.thumbnail((384, 384), Image.LANCZOS)
    im.save(t, quality=80, optimize=True, progressive=True)
    print(t)
