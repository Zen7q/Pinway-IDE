#pragma once
#include <Arduino.h>

#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "Select ESP32 Dev Module (classic ESP32-WROOM-32), not ESP32-C3/S3."
#endif

// Classic ESP32 DevKit / ESP32-WROOM-32 ONLY. GPIO numbers, not header positions.
// All module power and logic signals are 3.3 V.
namespace Hardware {
constexpr uint8_t LCD_MOSI = 23;
constexpr uint8_t LCD_CLK = 18;
constexpr uint8_t LCD_CS = 27;
constexpr uint8_t LCD_DC = 26;
constexpr uint8_t LCD_RST = 25;
constexpr uint8_t LCD_BL = 32;
constexpr uint8_t TOUCH_SDA = 21;
constexpr uint8_t TOUCH_SCL = 22;
constexpr uint8_t TOUCH_RST = 33;
constexpr uint8_t TOUCH_IRQ = 13;
constexpr uint8_t LED = 14; // GPIO14 -> 330 ohm resistor -> LED anode; cathode -> GND.
constexpr uint8_t TOUCH_ADDRESS = 0x15;
constexpr int WIDTH = 240;
constexpr int HEIGHT = 280;
constexpr int LCD_Y_OFFSET = 20;
// Portrait defaults match Waveshare's official 240x280 example.
// Change only after checking raw coordinates in Serial Monitor.
constexpr bool TOUCH_SWAP_XY = false;
constexpr bool TOUCH_FLIP_X = false;
constexpr bool TOUCH_FLIP_Y = false;
constexpr int BUTTON_X = 28;
constexpr int BUTTON_Y = 168;
constexpr int BUTTON_W = 184;
constexpr int BUTTON_H = 68;
}
