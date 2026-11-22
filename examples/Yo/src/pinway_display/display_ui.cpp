// ST7789V2 initialization adapted from Waveshare's 1.69inch Touch LCD Arduino
// example (2023-03-15). See THIRD_PARTY.md for the original permission notice.
// This small adapter is specific to that module, not a universal display driver.
#include <Arduino.h>
#include <SPI.h>
#include <initializer_list>
#include "hardware.h"
#include "display_ui.h"
#include "display_frames.h"

namespace PinwayHardware {
using namespace Hardware;
namespace {
constexpr uint16_t BG = 0x1083, RED = 0xF348;
const SPISettings settings(20000000, MSBFIRST, SPI_MODE3);

void command(uint8_t cmd, std::initializer_list<uint8_t> data = {}) {
  SPI.beginTransaction(settings);
  digitalWrite(LCD_CS, LOW);
  digitalWrite(LCD_DC, LOW);
  SPI.transfer(cmd);
  digitalWrite(LCD_DC, HIGH);
  for (uint8_t byte : data) SPI.transfer(byte);
  digitalWrite(LCD_CS, HIGH);
  SPI.endTransaction();
}
void fillRect(int x, int y, int w, int h, uint16_t color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || w <= 0 || h <= 0) return;
  w = min(w, WIDTH - x);
  h = min(h, HEIGHT - y);
  const int right = x + w - 1, top = y + LCD_Y_OFFSET, bottom = top + h - 1;
  command(0x2A, {uint8_t(x >> 8), uint8_t(x), uint8_t(right >> 8), uint8_t(right)});
  command(0x2B, {uint8_t(top >> 8), uint8_t(top), uint8_t(bottom >> 8), uint8_t(bottom)});
  uint8_t block[128];
  for (unsigned i = 0; i < sizeof(block); i += 2) {
    block[i] = color >> 8;
    block[i + 1] = color & 255;
  }
  SPI.beginTransaction(settings);
  digitalWrite(LCD_CS, LOW);
  digitalWrite(LCD_DC, LOW);
  SPI.transfer(0x2C);
  digitalWrite(LCD_DC, HIGH);
  uint32_t remaining = uint32_t(w) * h * 2;
  while (remaining) {
    const uint32_t count = min(remaining, uint32_t(sizeof(block)));
    SPI.writeBytes(block, count);
    remaining -= count;
  }
  digitalWrite(LCD_CS, HIGH);
  SPI.endTransaction();
}
// Stream the same RGB565 pixels embedded in the Pinway preview. A small buffer
// keeps RAM usage bounded; no full framebuffer or display font is needed.
template<size_t N> void drawFrame(const DisplayFrames::Run (&runs)[N]) {
  command(0x2A, {0, 0, 0, uint8_t(WIDTH - 1)});
  const int top = LCD_Y_OFFSET, bottom = top + HEIGHT - 1;
  command(0x2B, {uint8_t(top >> 8), uint8_t(top), uint8_t(bottom >> 8), uint8_t(bottom)});
  SPI.beginTransaction(settings);
  digitalWrite(LCD_CS, LOW); digitalWrite(LCD_DC, LOW);
  SPI.transfer(0x2C); digitalWrite(LCD_DC, HIGH);
  uint8_t buffer[128]; size_t used = 0;
  for (const auto& run : runs) {
    for (uint32_t i = 0; i < run.count; ++i) {
      buffer[used++] = run.color >> 8;
      buffer[used++] = run.color & 255;
      if (used == sizeof(buffer)) { SPI.writeBytes(buffer, used); used = 0; }
    }
  }
  if (used) SPI.writeBytes(buffer, used);
  digitalWrite(LCD_CS, HIGH); SPI.endTransaction();
}
}
void displayBegin() {
  pinMode(LCD_CS, OUTPUT); digitalWrite(LCD_CS, HIGH);
  pinMode(LCD_DC, OUTPUT);
  pinMode(LCD_RST, OUTPUT);
  pinMode(LCD_BL, OUTPUT); digitalWrite(LCD_BL, LOW);
  SPI.begin(LCD_CLK, -1, LCD_MOSI, LCD_CS); // Display has no MISO signal.
  digitalWrite(LCD_RST, HIGH); delay(20);
  digitalWrite(LCD_RST, LOW); delay(20);
  digitalWrite(LCD_RST, HIGH); delay(120);
  command(0x36, {0x00}); // Portrait, normal X/Y order.
  command(0x3A, {0x05}); // RGB565.
  command(0xB2, {0x0B,0x0B,0x00,0x33,0x35});
  command(0xB7, {0x11}); command(0xBB, {0x35});
  command(0xC0, {0x2C}); command(0xC2, {0x01});
  command(0xC3, {0x0D}); command(0xC4, {0x20});
  command(0xC6, {0x13}); command(0xD0, {0xA4,0xA1});
  command(0xD6, {0xA1});
  command(0xE0, {0xF0,0x06,0x0B,0x0A,0x09,0x26,0x29,0x33,0x41,0x18,0x16,0x15,0x29,0x2D});
  command(0xE1, {0xF0,0x04,0x08,0x08,0x07,0x03,0x28,0x32,0x40,0x3B,0x19,0x18,0x2A,0x2E});
  command(0xE4, {0x25,0x00,0x00});
  command(0x21); // IPS inversion, as in Waveshare's example.
  command(0x11); delay(120); command(0x29); delay(20);
  fillRect(0, 0, WIDTH, HEIGHT, BG);
  digitalWrite(LCD_BL, HIGH);
}
void displayState(bool ledOn, bool touchReady) {
  static bool drawn = false, previousLed = false, previousTouch = false;
  if (drawn && previousLed == ledOn && previousTouch == touchReady) return;
  drawn = true; previousLed = ledOn; previousTouch = touchReady;
  if (ledOn && touchReady) drawFrame(DisplayFrames::on);
  else drawFrame(DisplayFrames::off);
  // A red border reports hardware failure; the normal preview assumes ready touch.
  if (!touchReady) {
    fillRect(0, 0, WIDTH, 3, RED); fillRect(0, HEIGHT - 3, WIDTH, 3, RED);
  }
}

void displayPixelRows(const unsigned short* pixels, int y, int rows) {
  if(y<0||rows<1||y+rows>HEIGHT)return;
  command(0x2A, {0, 0, 0, uint8_t(WIDTH - 1)});
  const int top=LCD_Y_OFFSET+y, bottom=top+rows-1;
  command(0x2B,{uint8_t(top>>8),uint8_t(top),uint8_t(bottom>>8),uint8_t(bottom)});
  SPI.beginTransaction(settings);
  digitalWrite(LCD_CS,LOW);digitalWrite(LCD_DC,LOW);SPI.transfer(0x2C);digitalWrite(LCD_DC,HIGH);
  uint8_t block[128];
  for(uint32_t start=0;start<uint32_t(WIDTH)*rows;start+=64) {
    const unsigned n=min(uint32_t(64),uint32_t(WIDTH)*rows-start);
    for(unsigned i=0;i<n;i++){block[2*i]=pixels[start+i]>>8;block[2*i+1]=pixels[start+i]&255;}
    SPI.writeBytes(block,2*n);
  }
  digitalWrite(LCD_CS,HIGH);SPI.endTransaction();
}

void displayPixels(const unsigned short* pixels) { displayPixelRows(pixels,0,HEIGHT); }

} // namespace PinwayHardware
