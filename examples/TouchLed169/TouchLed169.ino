#include "hardware.h"
#include "display_ui.h"
#include "touch.h"

const int ledPin = 14;
int brightness = 20;

void setup() {
  Serial.begin(115200);
  ledcAttach(ledPin, 5000, 8);
}

void loop() {
  ledcWrite(ledPin, brightness);
  delay(1);
}
