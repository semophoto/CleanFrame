"""Prepare Wikimedia Commons originals listed in a picks.json into ignored staging.

Usage: python3 scripts/prepare-commons-wallpapers.py /path/to/originals
picks.json in that folder lists {id, file, name, author, license, source, tone, focus}.
Uses the same 1920x1080 crop and JPEG settings as the newer Unsplash photos.
Never replaces app assets; review the output before copying it in.
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.local/materials/wallpapers'


def centring(focus):
    x, y = (float(v.strip('%')) / 100 for v in focus.split())
    return (min(max(x, 0), 1), min(max(y, 0), 1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    picks = json.loads((args.source / 'picks.json').read_text())
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for pick in picks:
        with Image.open(args.source / pick['file']) as original:
            original.load()
            image = ImageOps.exif_transpose(original).convert('RGB')
        background = ImageOps.fit(image, (1920, 1080), Image.Resampling.LANCZOS, centering=centring(pick['focus']))
        thumbnail = background.resize((512, 288), Image.Resampling.LANCZOS)
        background.save(OUTPUT / (pick['id'] + '.jpg'), 'JPEG', quality=90, subsampling=0, optimize=True, progressive=False)
        thumbnail.save(OUTPUT / (pick['id'] + '-thumb.jpg'), 'JPEG', quality=85, subsampling=2, optimize=True, progressive=False)
        print(pick['id'], (OUTPUT / (pick['id'] + '.jpg')).stat().st_size)


if __name__ == '__main__':
    main()
