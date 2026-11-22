"""Compare every RGB565 firmware pixel with the generated preview PNG."""
import base64
import io
import json
import re
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'examples/TouchLed169'
doc = json.loads((root / '.pinway/display.json').read_text())
snapshot = doc.pop('hardwarePreview')
assert doc == snapshot['source']
header = Path(sys.argv[1]).read_text() if len(sys.argv)>1 else (root / 'display_frames.h').read_text()
for state in ('off', 'on'):
    data = re.search(r'constexpr Run ' + state + r'\[\] = \{(.*?)\};', header, re.S)[1]
    words = []
    for count, color in re.findall(r'\{(\d+),(0x[0-9a-f]+|[0-9]+)\}', data):
        words.extend([int(color, 0)] * int(count))
    preview = Image.open(io.BytesIO(base64.b64decode(snapshot['frames'][state].split(',')[1]))).convert('RGB')
    assert preview.size == (240, 280) and len(words) == 240 * 280
    expected = [((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3) for r, g, b in preview.getdata()]
    assert words == expected, state + ': firmware and preview differ'
    print(state + ': all 67200 pixels match firmware')
