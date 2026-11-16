const headers = (label, rows) => ({
  label,
  pins: rows.map(row => {
    const [name, ...functions] = row.split('|');
    return { name, functions: functions.join(' · ') };
  })
});

const avrDigital = [
  'D0|RX', 'D1|TX', 'D2|INT0', 'D3|PWM|INT1', 'D4', 'D5|PWM', 'D6|PWM',
  'D7', 'D8', 'D9|PWM', 'D10|PWM|SS', 'D11|PWM|COPI|MOSI', 'D12|CIPO|MISO', 'D13|SCK|LED_BUILTIN'
];
const avrAnalog = ['A0|ADC0|D14', 'A1|ADC1|D15', 'A2|ADC2|D16', 'A3|ADC3|D17', 'A4|ADC4|D18|SDA', 'A5|ADC5|D19|SCL'];

export const pinouts = {
  'arduino:avr:uno': {
    title: 'Arduino Uno R3',
    source: 'https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf',
    groups: [
      headers('Цифрові піни', [...avrDigital, 'GND', 'AREF', 'SDA|A4|D18', 'SCL|A5|D19']),
      headers('Аналогові та живлення', ['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN', ...avrAnalog])
    ]
  },
  'arduino:avr:nano': {
    title: 'Arduino Nano (ATmega328P)',
    source: 'https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf',
    groups: [
      headers('Лівий ряд', [avrDigital[13], '3V3', 'AREF', ...avrAnalog, 'A6|Тільки ADC6', 'A7|Тільки ADC7', '5V', 'RESET', 'GND', 'VIN']),
      headers('Правий ряд', [...avrDigital.slice(2, 13).reverse(), 'GND', 'RESET', avrDigital[0], avrDigital[1]])
    ]
  },
  'esp32:esp32:esp32': {
    title: 'Espressif ESP32-DevKitC V4',
    reference: true,
    source: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html#header-block',
    groups: [
      headers('J2', ['3V3', 'EN', 'VP|GPIO36|ADC|Вхід', 'VN|GPIO39|ADC|Вхід', 'IO34|GPIO34|ADC|Вхід', 'IO35|GPIO35|ADC|Вхід',
        'IO32|GPIO32|ADC', 'IO33|GPIO33|ADC', 'IO25|GPIO25|DAC', 'IO26|GPIO26|DAC', 'IO27|GPIO27', 'IO14|GPIO14', 'IO12|GPIO12', 'GND',
        'IO13|GPIO13', 'D2|GPIO9|Flash', 'D3|GPIO10|Flash', 'CMD|GPIO11|Flash', '5V']),
      headers('J3', ['GND', 'IO23|GPIO23|COPI|MOSI', 'IO22|GPIO22|SCL', 'TX|GPIO1|UART0 TX', 'RX|GPIO3|UART0 RX',
        'IO21|GPIO21|SDA', 'GND', 'IO19|GPIO19|CIPO|MISO', 'IO18|GPIO18|SCK', 'IO5|GPIO5|SS',
        'IO17|GPIO17|Залежить від модуля', 'IO16|GPIO16|Залежить від модуля', 'IO4|GPIO4', 'IO0|GPIO0|BOOT',
        'IO2|GPIO2', 'IO15|GPIO15', 'D1|GPIO8|Flash', 'D0|GPIO7|Flash', 'CLK|GPIO6|Flash'])
    ]
  },
  'esp32:esp32:esp32c3': {
    title: 'Espressif ESP32-C3-DevKitM-1',
    reference: true,
    source: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c3/esp32-c3-devkitm-1/user_guide.html#header-block',
    groups: [
      headers('J1', ['GND', '3V3', '3V3', 'IO2|GPIO2|ADC|Strapping', 'IO3|GPIO3|ADC', 'GND', 'RST', 'GND', 'IO0|GPIO0|ADC', 'IO1|GPIO1|ADC', 'IO10|GPIO10', 'GND', '5V', '5V', 'GND']),
      headers('J3', ['GND', 'TX|GPIO21|UART0 TX', 'RX|GPIO20|UART0 RX', 'GND', 'IO9|GPIO9|SCL*|BOOT|Strapping', 'IO8|GPIO8|SDA*|RGB LED|Strapping',
        'GND', 'IO7|GPIO7', 'IO6|GPIO6', 'IO5|GPIO5|ADC', 'IO4|GPIO4|ADC', 'GND', 'IO18|GPIO18|USB D−', 'IO19|GPIO19|USB D+', 'GND'])
    ],
    note: '* SDA і SCL за замовчуванням для ESP32C3 Dev Module. Звірте призначення з профілем та своєю платою.'
  }
};
