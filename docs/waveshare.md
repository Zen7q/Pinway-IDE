# Waveshare 1.69-inch Touch LCD

The built-in profile targets a 240 × 280 ST7789V2 panel with CST816-family touch and a classic ESP32 Dev Module.

1. Install the ESP32 and Pinway Display packages in Settings.
2. Open Display and choose the Waveshare 1.69-inch Touch LCD model.
3. Configure the connections for your module. Use 3.3 V and ground as specified by the hardware. Pinway checks supported GPIOs and duplicate assignments.
4. Add pages and interface elements. For a slider, select a supported Code variable and configure its integer range. Use page navigation actions for touch buttons that switch pages.
5. Select ESP32 Dev Module in Code, then Verify or Upload.

Pinway generates the display and touch adapters, page graphics, touch regions and runtime files in `src/pinway_display`. The primary sketch is preserved. Integration hooks are added to the temporary compilation copy.

If a generated file has been edited manually, Pinway reports the conflict before replacing it. Review those changes and resolve the conflict before rebuilding.

The generated runtime supports one numeric Code variable with up to 257 integer states, or an alternative single-GPIO mode. See the [display catalog](display-catalog.md) for the supported profiles and firmware limits.
