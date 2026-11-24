#!/usr/bin/env python3
"""Compile generated fixture adapters after PINWAY_ADAPTER_FIXTURES=... npm test."""
import os,subprocess,json,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
work=root/'.toolchain/adapter-fixtures'
env=os.environ.copy()
env['ARDUINO_DIRECTORIES_DATA']=str(Path.home()/'Library/Application Support/dev.binio.pinway.tauri/arduino-1.5.1-avr-1.8.8-esp-3.3.12')
env['ARDUINO_DIRECTORIES_USER']=str(Path.home()/'Library/Application Support/dev.binio.pinway.tauri/Sketchbook')
results=[]
for sketch in sorted(p for p in work.iterdir() if p.is_dir() and (p/(p.name+'.ino')).exists()):
    start=time.monotonic()
    p=subprocess.run([str(root/'.toolchain/runtime/arduino-cli'),'compile','--fqbn','esp32:esp32:esp32','--libraries',str(root/'.toolchain/display-libraries'),'--build-path',str(work/'build'),str(sketch)],env=env,capture_output=True,text=True,timeout=600)
    (work/(sketch.name+'.log')).write_text(p.stdout+'\n'+p.stderr)
    results.append({'case':sketch.name,'ok':p.returncode==0,'seconds':round(time.monotonic()-start,1)})
    print(sketch.name+(': PASS' if not p.returncode else ': FAIL'),flush=True)
    if p.returncode:print((p.stderr or p.stdout)[-3000:],flush=True)
(work/'results.json').write_text(json.dumps(results,indent=2)+'\n')
raise SystemExit(0 if results and all(r['ok'] for r in results) else 1)
