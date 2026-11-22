# Sources and notices

This minimal test uses only the SPI and Wire libraries supplied by Espressif Arduino core. No external graphics or touch library is needed.

The module-specific ST7789V2 initialization values and +20 portrait row offset in `display_ui.cpp` were adapted from Waveshare team, LCD_Driver.cpp, version 1.0, 2023-03-15. CST816-family register decoding, reset sequence and interrupt edge in `touch.cpp` were checked against the Felix Biego CST816S library included in Waveshare’s ESP32-S3 example. The adapters in this project use checked I2C reads and defer all bus access out of the ISR.

Official references:
- https://www.waveshare.com/wiki/1.69inch_Touch_LCD_Module
- https://files.waveshare.com/wiki/1.69inch-Touch-LCD-Module/1.69inch_Touch_LCD_Arduino.zip
- https://files.waveshare.com/wiki/1.69inch-Touch-LCD-Module/1.69inch_Touch_LCD_ESP32S3.zip

## Waveshare original permission notice

Author: Waveshare team.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documnetation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to  whom the Software is
# furished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS OR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
```

## Original CST816S notice

```text
MIT License

  Copyright (c) 2021 Felix Biego

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
```

The small bitmap alphabet is defined directly in this example; it is not a downloaded font and supports only the Latin labels used by this test. This is separate from Pinway’s planned embedded Ukrainian font pipeline.
