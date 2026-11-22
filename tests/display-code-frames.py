"""Verify generated Code-binding pixels, including the ESP32 8-row renderer.
Usage: venv/bin/python tests/display-code-frames.py /path/to/captured/build
"""
import base64
import io
import json
import re
import sys
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1]
assets=Path(sys.argv[1])
doc=json.loads((root/'examples/TouchLed169/.pinway/display.json').read_text())
preview=doc['hardwarePreview']['dynamic']
base_header=(assets/'display_frames.h').read_text()
base_data=re.search(r'constexpr Run off\[\] = \{(.*?)\};',base_header,re.S)[1]
base_runs=[(int(n),int(c,0))for n,c in re.findall(r'\{(\d+),(0x[0-9a-f]+|\d+)\}',base_data)]
base=[]
for n,c in base_runs:base.extend([c]*n)
assert len(base)==67200
header=(assets/'pinway_dynamic.h').read_text()
data=re.search(r'constexpr Patch patches\[\]=\{(.*?)\};',header,re.S)[1]
patches=[tuple(map(int,p))for p in re.findall(r'\{(\d+),(\d+),(\d+)\}',data)]
data=re.search(r'constexpr Frame frames\[\]=\{(.*?)\};',header,re.S)[1]
frames=[tuple(map(int,p))for p in re.findall(r'\{(\d+),(\d+)\}',data)]
assert len(frames)==len(preview['images'])
for index,((first,count),image)in enumerate(zip(frames,preview['images'])):
    pixels=base.copy();changes=patches[first:first+count]
    for start,n,c in changes:pixels[start:start+n]=[c]*n
    decoded=Image.open(io.BytesIO(base64.b64decode(image.split(',')[1]))).convert('RGB')
    expected=[((r>>3)<<11)|((g>>2)<<5)|(b>>3)for r,g,b in decoded.getdata()]
    assert pixels==expected,f'frame {index} differs from preview'
    if index in (0,20,128,255):
        streamed=[]
        for row in range(0,280,8):
            begin=row*240;end=begin+1920;tile=[0]*1920;at=0
            for n,c in base_runs:
                finish=at+n
                for k in range(max(at,begin),min(finish,end)):tile[k-begin]=c
                at=finish
                if at>=end:break
            for start,n,c in changes:
                for k in range(max(start,begin),min(start+n,end)):tile[k-begin]=c
            streamed.extend(tile)
        assert streamed==expected,f'8-row stream differs at {index}'
print(f'{len(frames)} states: all 67200 pixels match preview; 8-row rendering verified at 0,20,128,255')
