#!/usr/bin/env python3
"""Compile library APIs without uploading or accessing hardware ports."""
import json
import os
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'.toolchain/display-libraries'
WORK=ROOT/'.toolchain/display-library-check'
WORK.mkdir(exist_ok=True)
SKETCH=WORK/'DriverCheck';SKETCH.mkdir(exist_ok=True)
env=os.environ.copy()
env['ARDUINO_DIRECTORIES_DATA']=str(Path.home()/'Library/Application Support/dev.binio.pinway.tauri/arduino-1.5.1-avr-1.8.8-esp-3.3.12')
env['ARDUINO_DIRECTORIES_USER']=str(Path.home()/'Library/Application Support/dev.binio.pinway.tauri/Sketchbook')
cases={
 'LovyanGFX':'''#include <LovyanGFX.hpp>
lgfx::Panel_ST7789 a; lgfx::Panel_ST7735S b; lgfx::Panel_ILI9341 c; lgfx::Panel_GC9A01 d;
lgfx::Touch_CST816S t; lgfx::Touch_GT911 u; lgfx::Touch_XPT2046 v; lgfx::Touch_FT5x06 w;
void setup(){auto cfg=t.config();cfg.i2c_addr=0x15;t.config(cfg);} void loop(){}
''',
 'TFT_eSPI':'''#include <TFT_eSPI.h>
TFT_eSPI lcd; void setup(){lcd.fillScreen(TFT_BLACK);} void loop(){}
''',
 'U8g2':'''#include <U8g2lib.h>
U8G2_SSD1306_128X64_NONAME_F_HW_I2C a(U8G2_R0,U8X8_PIN_NONE);
U8G2_SH1106_128X64_NONAME_F_HW_I2C b(U8G2_R0,U8X8_PIN_NONE);
void setup(){a.clearBuffer();b.clearBuffer();}void loop(){}
''',
 'hd44780':'''#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
hd44780_I2Cexp lcd;void setup(){lcd.begin(16,2);}void loop(){}
''',
 'GxEPD2':'''#include <GxEPD2_BW.h>
#include <epd/GxEPD2_290_T94.h>
GxEPD2_BW<GxEPD2_290_T94,16> lcd(GxEPD2_290_T94(27,26,25,33));
void setup(){lcd.setRotation(0);}void loop(){}
''',
 'XPT2046_Touchscreen':'''#include <XPT2046_Touchscreen.h>
XPT2046_Touchscreen touch(27,13);void setup(){touch.setRotation(0);}void loop(){}
''',
 'Adafruit_FT6206_ILI9341_GFX_BusIO':'''#include <Adafruit_FT6206.h>
#include <Adafruit_ILI9341.h>
Adafruit_FT6206 touch;Adafruit_ILI9341 lcd(27,26,25);
void setup(){touch.begin(40);lcd.fillScreen(0);}void loop(){}
'''
}
results=[]
for name,source in cases.items():
    (SKETCH/'DriverCheck.ino').write_text(source)
    started=time.monotonic()
    cmd=[str(ROOT/'.toolchain/runtime/arduino-cli'),'compile','--fqbn','esp32:esp32:esp32','--libraries',str(PACK),'--build-path',str(WORK/'build'),str(SKETCH)]
    p=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=600)
    (WORK/(name+'.log')).write_text(p.stdout+'\n'+p.stderr)
    results.append({'case':name,'board':'esp32:esp32:esp32','ok':p.returncode==0,'seconds':round(time.monotonic()-started,1)})
    print(name+(': PASS'if p.returncode==0 else ': FAIL')+f' ({results[-1]["seconds"]}s)',flush=True)
    if p.returncode:print((p.stderr or p.stdout)[-2200:],flush=True)
(WORK/'results.json').write_text(json.dumps(results,indent=2)+'\n')
raise SystemExit(0 if all(x['ok']for x in results)else 1)
