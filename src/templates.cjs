const templates = {
  empty: {
    name: 'Порожній скетч',
    code: `void setup() {
  // Налаштування виконується один раз.
}

void loop() {
  // Код тут повторюється.
}
`
  },
  blink: {
    name: 'Blink',
    code: `// Якщо плата не визначає LED_BUILTIN, вкажіть пін зі схеми своєї плати.
#ifndef LED_BUILTIN
#error Вкажіть пін світлодіода для своєї плати
#endif

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`
  },
  i2c: {
    name: 'Сканер I²C',
    code: `#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();
}

void loop() {
  int found = 0;
  for (uint8_t address = 0x08; address <= 0x77; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print("I2C: 0x");
      Serial.println(address, HEX);
      ++found;
    }
  }
  Serial.print("Devices: ");
  Serial.println(found);
  delay(3000);
}
`
  },
  wifi: {
    name: 'Підключення до Wi-Fi (ESP32)',
    code: `#if !defined(ARDUINO_ARCH_ESP32)
#error Виберіть плату з пакета Arduino ESP32
#else
#include <WiFi.h>

const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  for (int attempt = 0; attempt < 30 && WiFi.status() != WL_CONNECTED; ++attempt) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi connection failed");
  }
}

void loop() {}
#endif
`
  }
};

module.exports = templates;
