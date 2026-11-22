// CST816-family register decoding checked against Waveshare's ESP32-S3 sample.
// See THIRD_PARTY.md for Felix Biego's original CST816S notice and source URLs.
#include <Arduino.h>
#include <Wire.h>
#include "hardware.h"
#include "touch.h"
#include "touch_button.h"
using namespace Hardware;
namespace {
struct TouchSample { uint16_t x, y; bool down; uint8_t gesture; };
volatile bool pending = false;
bool initialized = false, ready = false;
TouchButton button;
uint32_t lastPoll = 0, lastRetry = 0;
uint8_t readErrors = 0;
void ARDUINO_ISR_ATTR interruptHandler() { pending = true; }
bool readRegisters(uint8_t reg, uint8_t* out, size_t count) {
  Wire.beginTransmission(TOUCH_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(true) != 0) return false;
  if (Wire.requestFrom(TOUCH_ADDRESS, count, true) != count) return false;
  for (size_t i = 0; i < count; ++i) out[i] = Wire.read();
  return true;
}
bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(TOUCH_ADDRESS);
  Wire.write(reg); Wire.write(value);
  return Wire.endTransmission(true) == 0;
}
}
static bool initializeController() {
  if (initialized) detachInterrupt(digitalPinToInterrupt(TOUCH_IRQ));
  if (!Wire.begin(TOUCH_SDA, TOUCH_SCL, 100000)) return false;
  Wire.setTimeOut(25);
  pinMode(TOUCH_IRQ, INPUT_PULLUP);
  pinMode(TOUCH_RST, OUTPUT);
  digitalWrite(TOUCH_RST, HIGH); delay(50);
  digitalWrite(TOUCH_RST, LOW); delay(5);
  digitalWrite(TOUCH_RST, HIGH); delay(50);
  uint8_t id = 0;
  if (!readRegisters(0xA7, &id, 1)) return false;
  Serial.printf("CST816 family: address=0x15, chip ID=0x%02X\n", id);
  // Nonzero disables automatic sleep on CST816S; allows immediate repeated tests.
  if (!writeRegister(0xFE, 0xFE)) return false;
  pending = false;
  // Same edge as Waveshare's official CST816S example. No I2C inside the ISR.
  attachInterrupt(digitalPinToInterrupt(TOUCH_IRQ), interruptHandler, RISING);
  initialized = true;
  return true;
}
static bool takeInterrupt() {
  noInterrupts();
  const bool result = pending;
  pending = false;
  interrupts();
  return result;
}
static bool readTouch(TouchSample& sample) {
  uint8_t data[6];
  if (!readRegisters(0x01, data, sizeof(data))) return false;
  int x = ((data[2] & 0x0F) << 8) | data[3];
  int y = ((data[4] & 0x0F) << 8) | data[5];
  const uint8_t event = data[2] >> 6;
  if (TOUCH_SWAP_XY) { const int old = x; x = y; y = old; }
  if (TOUCH_FLIP_X) x = WIDTH - 1 - x;
  if (TOUCH_FLIP_Y) y = HEIGHT - 1 - y;
  // Keep invalid coordinates outside the hit target, not clipped into it.
  sample.x = x >= 0 && x < WIDTH ? x : UINT16_MAX;
  sample.y = y >= 0 && y < HEIGHT ? y : UINT16_MAX;
  sample.down = (data[1] & 0x0F) > 0 && event != 1;
  sample.gesture = data[0];
  return true;
}

bool touchBegin() {
  ready = initializeController();
  button = TouchButton();
  readErrors = 0;
  return ready;
}
bool touchIsReady() { return ready; }
bool touchButtonTapped() {
  const uint32_t now = millis();
  if (!ready) {
    if (uint32_t(now - lastRetry) >= 3000) {
      lastRetry = now;
      touchBegin();
    }
    return false;
  }
  const bool irq = takeInterrupt();
  if (!irq && (!button.held() || uint32_t(now - lastPoll) < 16)) return false;
  lastPoll = now;
  TouchSample touch;
  if (!readTouch(touch)) {
    if (++readErrors >= 10) ready = false;
    return false;
  }
  readErrors = 0;
  const bool inside = touch.x >= BUTTON_X && touch.x < BUTTON_X + BUTTON_W &&
                      touch.y >= BUTTON_Y && touch.y < BUTTON_Y + BUTTON_H;
  return button.update(touch.down, inside, touch.gesture == 0x05, irq, now);
}

bool touchPosition(int& x, int& y, bool& down) {
  const uint32_t now=millis();
  if(!ready) {
    if(uint32_t(now-lastRetry)>=3000){lastRetry=now;touchBegin();}
    return false;
  }
  if(uint32_t(now-lastPoll)<16)return false;
  lastPoll=now;takeInterrupt();
  TouchSample sample;
  if(!readTouch(sample)){if(++readErrors>=10)ready=false;return false;}
  readErrors=0;x=sample.x;y=sample.y;down=sample.down;
  return true;
}
