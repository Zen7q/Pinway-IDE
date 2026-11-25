# Display support

Install the optional Pinway Display package to use the visual editor and its driver libraries. Library availability and an automatic firmware profile are separate capabilities.

## Automatic profiles

The current automatic profiles target the classic **ESP32 Dev Module**.

| Profile | Resolution | Controller |
|---|---|---|
| Waveshare 1.69-inch Touch LCD | 240 × 280 | ST7789V2 with CST816-family touch |
| ST7789 | 240 × 240 or 240 × 320 | ST7789 |
| ILI9341 | 240 × 320 | ILI9341 |
| Round TFT | 240 × 240 | GC9A01 |
| ST7735S | 128 × 160 | ST7735S |

Custom profiles use the supported LovyanGFX adapter. Configure the display dimensions, offsets, rotation, color order and GPIO pins. Supported touch choices include CST816S, FT5x06/FT6206, GT911 and XPT2046. The configuration validates pin availability and conflicts before saving.

Panel revisions can require different offsets, wiring or touch calibration. Compilation of a profile does not establish physical compatibility with every module using the same controller.

## Driver libraries

The package includes LovyanGFX, TFT_eSPI, U8g2, hd44780, GxEPD2, XPT2046_Touchscreen, Adafruit FT6206, Adafruit ILI9341, Adafruit GFX and Adafruit BusIO. The pinned versions and checksums are recorded in [display-libraries.lock.json](../config/display-libraries.lock.json).

These libraries also cover families such as SSD1306/SH1106 OLEDs, HD44780 character displays and supported GxEPD2 e-paper panels. Those families need application-specific sketch integration when an automatic Pinway profile is unavailable.

## Firmware limits

The current generated runtime supports multiple pages, touch navigation, static graphics and one numeric Code variable with an integer range of up to 257 states. An alternative mode supports one GPIO output. Unsupported combinations are reported before compilation.

Display discovers supported global scalar definitions in the primary sketch. The preview runs locally. It does not display live telemetry from the connected board.

For a complete setup workflow, see the [Waveshare guide](waveshare.md).
