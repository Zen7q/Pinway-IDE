"""Compare generated multi-page RGB565 data with saved preview PNGs.
Usage: .toolchain/display-assets-venv/bin/python tests/display-scene-frames.py PROJECT
"""
import base64
import io
import json
import re
import sys
from pathlib import Path
from PIL import Image

project = Path(sys.argv[1])
doc = json.loads((project / '.pinway/display.json').read_text())
header = (project / 'src/pinway_display/scene_data.h').read_text()
def records(name):
    body = re.search(r'constexpr \w+ ' + name + r'\[\]=\{(.*?)\};', header, re.S)[1]
    return [tuple(map(int, row.split(','))) for row in re.findall(r'\{([\d,]+)\}', body)]
bases, patches, frames, pages = map(records, ['bases', 'patches', 'frames', 'pages'])
width, height = doc["canvas"]["width"], doc["canvas"]["height"]
count = 0
for page, preview in zip(pages, doc['hardwarePreview']['dynamic']['pages'], strict=True):
    base_first, base_count, frame_first, *_ = page
    runs = bases[base_first:base_first + base_count]
    base = [color for n, color in runs for _ in range(n)]
    assert len(base) == width * height
    for value, image in enumerate(preview['images']):
        first, size = frames[frame_first + value]
        changes = patches[first:first + size]
        pixels = base.copy()
        for start, n, color in changes:
            pixels[start:start+n] = [color] * n
        decoded = Image.open(io.BytesIO(base64.b64decode(image.split(',')[1]))).convert('RGB')
        expected = [((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3) for r,g,b in decoded.getdata()]
        assert pixels == expected, (preview['id'], value)
        if value in (0, 20, 128, 255):
            streamed = []
            for row in range(0, height, 8):
                begin, end, at = row * width, min(row + 8, height) * width, 0
                tile = [0] * (end - begin)
                for n, color in runs:
                    finish = at + n
                    for k in range(max(at, begin), min(finish, end)):
                        tile[k-begin] = color
                    at = finish
                    if at >= end:
                        break
                for start, n, color in changes:
                    for k in range(max(start, begin), min(start+n, end)):
                        tile[k-begin] = color
                streamed.extend(tile)
            assert streamed == expected, ('stream', preview['id'], value)
        count += 1
print(f'{len(pages)} pages, {count} PNG states: every pixel matches generated RGB565; 8-row renderer matches sampled states.')
