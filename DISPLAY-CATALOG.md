# Початковий каталог дисплеїв Pinway

Дата перевірки джерел: 2026-11-21. Це стартовий набір поширених сімейств, а не виміряний рейтинг продажів. Точні module revisions, offsets і pin maps мають бути окремими профілями. Драйверна бібліотека в пакеті й автоматичний апаратний адаптер Pinway — окремі статуси.

| Модуль / сімейство | Геометрія | Драйвер | Тач | Бібліотека в пакеті |
|---|---|---|---|---|
| [OLED 0.96″ SSD1306](https://learn.adafruit.com/monochrome-oled-breakouts) | 128×64 px | SSD1306 | немає | U8g2 |
| [OLED 1.3″ SH1106](https://www.waveshare.com/product/displays/oled/1.3inch-oled-a.htm) | 128×64 px | SH1106 | немає | U8g2 |
| [TFT 1.8″ ST7735S](https://www.waveshare.com/product/displays/lcd-oled/1.8inch-lcd-module.htm) | 128×160 px | ST7735S | немає | LovyanGFX, TFT_eSPI |
| [Waveshare 1.69″ Touch LCD](https://www.waveshare.com/wiki/1.69inch_Touch_LCD_Module) | 240×280 px | ST7789V2 | CST816 family / I2C | LovyanGFX |
| [Waveshare 1.28″ Round Touch LCD](https://www.waveshare.com/wiki/1.28inch_Touch_LCD) | 240×240 px | GC9A01 | CST816S/T / I2C | LovyanGFX |
| [TFT 2.8″ ILI9341](https://www.adafruit.com/product/2770) | 240×320 px | ILI9341 | FT6206/FT6236U for capacitive modules; XPT2046 for appropriate resistive modules | LovyanGFX, TFT_eSPI, Adafruit_ILI9341, XPT2046_Touchscreen, Adafruit_FT6206 |
| [LCD 1602 / 2004](https://github.com/duinoWitchery/hd44780) | 16×2 комірок | HD44780 | немає | hd44780 |
| [E-paper 2.9″ GDEM029T94](https://github.com/ZinggJM/GxEPD2/blob/master/src/epd/GxEPD2_290_T94.h) | 128×296 px | SSD1680 | немає | GxEPD2 |

LCD2004 має20×4комірки; показані16×2 — для1602. ST7789 має багато геометрій (240×240/280/320) та різні offsets; наведено конкретний перевірений1.69модуль. ILI9341 touch chip залежить від конкретної плати, а не тільки від LCD controller. Сучасний Adafruit2770 використовуєFT6236U замістьFT6206; обидва належать до підтримуваної бібліотекою FT62xx сім’ї. Для модулів XPT2046 є окремий готовий драйвер.

## Що постачається разом з IDE

Пакет із10бібліотек у `Resources/display-libraries`: LovyanGFX, TFT_eSPI, U8g2, hd44780, GxEPD2, XPT2046_Touchscreen, AdafruitFT6206, AdafruitILI9341 та залежності AdafruitGFX/BusIO. CST816S, FT5x06, GT911 та XPT2046 також є в LovyanGFX. Версії й SHA256 архівів/дерев джерел зафіксовані в config/display-libraries.lock.json; оригінальні ліцензії збережено. Пакет доступний компілятору через --libraries, без установлення в користувацький Sketchbook.

## Межі поточного стану

Для Waveshare 1.69″ / classic ESP32 реалізовано вибір моделі й контактів, автоматичне створення драйверів та multi-page runtime у новому проєкті. Інструкція й межі: [DISPLAY-WAVESHARE.md](DISPLAY-WAVESHARE.md). Інші модулі поки мають бібліотеки для компіляції скетчів, але не автоматичні апаратні профілі. Вони не отримують hardware-tested статус лише через успішну компіляцію бібліотеки.

## Відтворення пакета

```sh
python3 scripts/display-libraries.py
python3 scripts/display-libraries.py --verify
python3 scripts/check-display-libraries.py
```

Перший запуск завантажує офіційні source archives з pinned tags і перевіряє SHA256; наступні можуть працювати з локальним cache. Звичайна упаковка застосунку перевіряє вже підготовлений пакет і копіює його з manifest та ліцензіями. U8g2 source tag2.36.19 сам декларує library.properties version2.36.18 — обидва значення збережено в lockfile.
