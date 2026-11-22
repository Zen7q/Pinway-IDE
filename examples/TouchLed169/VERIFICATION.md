# Перевірка TouchLed169 — 2026-11-21

## Реалізовано

Окремий мінімальний Arduino-проєкт для classic ESP32-WROOM-32 / ESP32 DevKit, Waveshare 1.69inch Touch LCD Module 240×280 і зовнішнього LED через 330 Ом. Самодостатні адаптери ST7789V2 та CST816-family; сторонніх бібліотек немає. Базовий портретний режим, зміщення Y=20 та SPI MODE3 звірено з офіційним Arduino-прикладом Waveshare. CST816 register mapping, reset, RISING IRQ та disable auto sleep звірено з CST816S бібліотекою офіційного ESP32-S3 прикладу.

Версійні відмінності CST816S/T/D на фізичному модулі ще не перевірені. Після старту в Serial друкується chip ID. Підтримка тут стосується лише цього ручного прикладу; драйвер не інтегровано в загальний firmware generator Pinway.

## Компілюється успішно

- Arduino CLI 1.5.1 зі складу Pinway.
- Espressif Arduino core 3.3.12, який уже встановлений у Pinway.
- FQBN: `esp32:esp32:esp32`.
- Flash: **303900 / 1310720 bytes (23%)**.
- Статичні глобальні дані RAM: **24116 / 327680 bytes (7%)**. Це не виміряне пікове використання heap/stack.
- Локальний compile без завантаження на плату. Артефакти у `.toolchain/touch-led169-firmware` кореня репозиторію (ігноруються Git).

Команда з кореня Pinway на цьому Mac:

```sh
env ARDUINO_DIRECTORIES_DATA='/Users/andriybinio/Library/Application Support/dev.binio.pinway.tauri/arduino-1.5.1-avr-1.8.8-esp-3.3.12' \
    ARDUINO_DIRECTORIES_USER='/Users/andriybinio/Library/Application Support/dev.binio.pinway.tauri/Sketchbook' \
    .toolchain/runtime/arduino-cli compile --fqbn esp32:esp32:esp32 \
    --build-path "$PWD/.toolchain/touch-led169-build" \
    --output-dir "$PWD/.toolchain/touch-led169-firmware" examples/TouchLed169
```

## Перевірено без обладнання

- Host C++ assertions: completed tap, long hold, start outside, drag outside, repeated IRQ, tap-only IRQ, debounce та millis wraparound. Проходять:

```sh
c++ -std=c++17 -Wall -Wextra -pedantic tests/touch-led169.cpp -o /private/tmp/pinway-touch-led169-test
/private/tmp/pinway-touch-led169-test
```

- `.pinway/display.json` проходить наявний валідатор документа, не має layout/binding issues, переходи OFF→ON та ON→OFF проходять через функцію локального preview. Візуальний документ і firmware реалізовані окремо; автоматичної code generation чи round-trip немає.

## На фізичному обладнанні

**Не перевірено і не прошито.** Потрібні підключення за README та перевірка на конкретному ESP32 і модулі користувача: правильна орієнтація, кольори, координати тачу, IRQ, одна зміна на тап, LED, перезапуск, повторні натискання. Жодного запису на USB-плату під час підготовки проєкту не виконували.


## Перевірка через desktop Pinway — 2026-11-21

У `dist/display-editor-ready/Pinway IDE.app` через UI відкрито цей проєкт. На USB виявлено classic ESP32-D0WD-V3 rev3.1 на `/dev/cu.usbserial-110`; вибрано ESP32 Dev Module. Upload Speed115200; Flash4MB, QIO80MHz, default partitions, PSRAM disabled, erase-all disabled. Serial Monitor115200.

Кнопка «Перевірити» завершила компіляцію успішно: 303916 bytes Flash (23%), 24116 bytes globals RAM (7%). Відмінність від попередньої CLI збірки303900bytes зафіксована як окремий результат. Відкрито справжній desktop Display з макетом240×280 і режимомПревʼю, початковий стан LED OFF.

Користувач підтвердив, що дисплей та LED ще не підключені. Прошивання й фізична перевірка не виконувалися.


## Перший фізичний запис — 2026-11-21

Після повідомлення користувача про підключення дисплея прошивку записано кнопкою «Завантажити» у Pinway на ESP32 (`/dev/cu.usbserial-110`). Bootloader, partitions, boot_app0 та основна програма пройшли `Hash of data verified`; виконано `Hard resetting via RTS pin`, Pinway показав «Прошивку завантажено». Основний запис: 304064 bytes (177581 compressed), приблизно17.6s при115200.

Відкрито Serial Monitor115200. На реальні натискання користувача отримано координати `x=89 y=221`, down1→0 та `LED ON`; наступне натискання `x=81 y=231` також зареєстроване. Це підтверджує читання координат тачу та програмне перемикання GPIO14 у станON. Повний циклOFF і фактичне світіння зовнішнього LED ще потребують підтвердження користувача; їх не прирівнювати до успішного upload. Початковий фрагмент boot log неповний, тому конкретний chip ID CST816 з нього не встановлено.

Попередні записи «не прошито» описують стан попередніх етапів, а цей розділ — новий результат.


## Підтвердження користувача: зовнішній LED — 2026-11-21

Після пояснення підключення GPIO14→330Ω→анодLED, катод→GND користувач повідомив: «микає світлодіод і на бредбодді». Отже, для поточної ESP32 та Waveshare1.69inch Touch LCD фізично підтверджено весь шлях: дотик→обробникfirmware→GPIO14→світіння зовнішньогоLED на макетній платі. Раніше користувач уточнив, що LED ще не був підключений; цей новий результат замінює попередній статус щодо ввімкненняLED. Окремого однозначного підтвердження вимкнення, тривалого утримання та інших сценаріїв ще немає.


## Спрощення та прямий GPIO HIGH/LOW — 2026-11-21

Користувач відхилив імітацію станів двома сторінками Display. Фізична прошивка й раніше використовувала digitalWrite HIGH/LOW; помилкою були дві сторінки саме в локальному макеті.

Основний TouchLed169.ino скорочено до 28 рядків: ініціалізація, touchButtonTapped(), зміна ledOn, прямий digitalWrite(Hardware::LED, ledOn ? HIGH : LOW) та LOW при втраті тачу. Обробка шини, IRQ, debounce й повторна ініціалізація залишаються в touch.cpp. displayState() кешує стан і не перемальовує незмінний кадр. Serial повідомляє GPIO14 HIGH/LOW.

Макет: одна сторінка LED, чотири шари, одна кнопка LED з touch action GPIO14 / toggle. У Pinway додано локальний стан GPIO та операції set HIGH, set LOW і toggle. Усі 9 тестів моделі й host-перевірки тапів пройшли. Native Display підтвердив HIGH→LOW після двох кліків без зміни сторінки. Превʼю не надсилає команд реальній платі.

CLI-компіляція: 303636 байтів Flash, 24116 байтів RAM. Зібрано й підписано dist/display-gpio/Pinway IDE.app; запуск і шлях процесу перевірено. У Code видно короткий скетч.

Оновлену прошивку записано кнопкою Upload у Pinway: UI-компіляція 303652 байтів Flash / 24116 байтів RAM; основний image 303808 байтів (177360 стиснених). Усі чотири частини пройшли перевірку хешів, ESP32 перезапущено, UI показав «Прошивку завантажено». Повторний фізичний цикл LED саме після цього оновлення ще не підтверджений. Застосунок залишено у Code.

Загальної автоматичної генерації C++ з GPIO action досі немає: цей апаратний приклад і візуальний документ узгоджено вручну.


## Спільні пікселі превʼю й firmware — 2026-11-21

Після «зроби шоб було одинаково» макет Pinway взято за основу: PINWAY / GPIO 14 / LED / ON / OFF, Arial. `scripts/export-touch-led169.py` раструє layout один раз та квантує RGB565; генерує `display_frames.h` (RLE) і PNG кадри в `hardwarePreview`. C++ більше не підміняє текст власним 5×7 шрифтом. Main лишився 28 рядків; GPIO14 HIGH/LOW та touch-логіка збережені. При втраті тачу кадр OFF із червоною рамкою; preview показує справний тач.

Pinway відображає той самий кадр, зберігаючи touch hit area/selection. Застарілий snapshot після редагування не показується, є попередження про повторний експорт. Експортер обмежено цим прикладом; він не означає реалізацію загального UI firmware generation.

Пройшли: 10 model tests (snapshot validity, invalidation, unsafe URL), host touch tests; Python-порівняння всіх 67200 пікселів PNG і C++ RLE для OFF та ON. CLI compile: Flash321060 / RAM24116. Зібрано підписану `dist/display-matched/Pinway IDE.app`, PID62246 і шлях процесу перевірено.

Upload у native Pinway успішний: compile321076 / RAM24116; image321232 bytes /180083 compressed; усі чотири hash verified, RTS reset, статус «Прошивку завантажено». Native Display показав позначку «RGB565 · кадр прошивки», правильні написи, синю кнопку при LOW; клік дав HIGH і видимий зелений кадр. Наприкінці Reset тестових значень повернув LOW. Другий координатний клік не перемкнув стан; для reset використано явну кнопку. Нове фото фізичного дисплея та повторний LED-цикл після цього upload ще не отримані; піксельна відповідність перевірена в ресурсах, а не фотометрично на панелі.


## Автоматичне застосування змін Display — 2026-11-21

Користувач змінив вигляд, прошив старі кадри й отримав вимогу ручного експорту. Виправлено build flow: prepareBuild раструє актуальний SVG у самому WebView, підтримує кирилицю/системний шрифт, RGB565 encoder готує RLE й PNG. Без Python, Pillow та ручного експорту. Source/owner перевіряються після async роботи, документ зберігається з CAS. Backend звіряє source з диском і не допускає запису старих кадрів за помилки підготовки.

Для апаратного Display скетч примусово копіюється в temp build directory. Згенеровані display_frames.h та актуальні координати touch-кнопки застосовуються тільки там, ручні C++ не замінюються. Адаптер обмежений однією сторінкою 240×280, статичними елементами та однією GPIO14 toggle-кнопкою. Старий exporter лишився допоміжним, звичайний Upload його не потребує.

11 JS tests та 17 Rust tests пройшли, включно зі stale source, інʼєкціями/межами RLE, переміщеною кнопкою й недоторканністю оригінального hardware.h/кадрів. Native початкова перевірка виявила CSP-відхилення blob image; виправлено на дозволений data URL без зміни CSP. Прибрано залишкове попередження після усунення issues.

Native Upload у display-auto-final успішний на зміненому користувачем макеті «Нажми на кнопку»: Touch target X31/Y156/W184/H68 захоплено з фактичної temp build copy. Всі67200пікселів PNG та реально скомпільованого C++ RLE збігаються для OFF/ON (`tests/touch-led169-frames.py /private/tmp/pinway-auto-display_frames.h`). Основний image328416bytes/181459compressed,17.9s, усі4hashverified/RTSreset/«Прошивку завантажено». Подальша ручна зміна Y заголовка12→16 користувачем збережена; остаточна збірка display-auto-ready містить очищення старого issue та актуальні пояснення UI.


Фінальна UI-збірка `dist/display-auto-ready/Pinway IDE.app` запущена. Після збереженої зміни Y заголовка до16 знову натиснуто Upload: generated header захоплено з чинної temp upload directory та повторно звірено з PNG — усі67200пікселів OFF/ON збігаються. Перша спроба порівняння цього етапу випадково прочитала header попередньої збірки (compile вже закінчився), тому дала очікувану розбіжність; після захоплення саме чинного upload header перевірка пройшла. Користувач сам перейшов у Display та продовжив редагування заливки кнопки; фінальний статус другого upload з UI не зчитано. Залишено поточний Display/Превʼю, без втручання в подальші зміни користувача. Успішний перший native Upload зафіксовано вище.


## Code brightness → touch slider → PWM: підтверджено фізично, 2026-11-21

На вимогу користувача додано виявлення глобальних scalar variables у головному .ino з актуального editor buffer. Display підтягує brightness без ручного створення дубліката; source metadata відокремлює Code від локальних тестових даних, const readonly. Розпізнавання консервативне, не повний C++ AST: literal numeric/bool definitions, без locals/comments/arrays/pointers/conditional branches/складних виразів. Code edit/open Display/build оновлює каталог. Дані скетчу виведені зберігаються як metadata, а фізичний generated extern посилається на те саме C++ визначення.

Динамічний апаратний adapter: одна mutable numeric Code variable, bound slider/text/progress, до257цілихстанів і85000deltaRGB565runs. Native rasterization всіх256станів створила2.5МБ display.json та58884рядків captured dynamic header. Actual header/PNG збігаються в усіх67200пікселях кожного стану; streaming8rows декодер перевірено на0/20/128/255 (`tests/display-code-frames.py /private/tmp/pinway-code-binding-assets`).

У temp copy generated extern int brightness, touch tick змінює brightness перед user loop, user ledcWrite застосовує PWMGPIO14/5000Hz/8bit. Основний manual .ino не переписується під час генерації. Для усунення reset-конфлікту один раз спростили приклад до brightness20 у визначенні та прибрали recurring brightness20/1000ms delay. До цього зроблено backup .pinway/backups/TouchLed169.ino.before-code-bindings і display.before-code-bindings.json. Main зараз16рядків.

Початковий full framebuffer не вмістився у staticDRAM; виправлено streaming8rows/3840bytes. Target fixture compile після виправлення:323383Flash/28160RAM. 13JS/18Rust tests пройшли. Фінальна підписана app dist/display-code-bindings-ready/Pinway IDE.app запущена, PID73783/path перевірено. Native UI показав brightness із Code й preview255.

Реальний Native Upload успішний: image791936bytes/282567compressed,27.8s,усі4hashverified/RTSreset/«Прошивку завантажено». Serial Monitor115200 прочитав CST816 family chipID0xB5 і Pinway brightness20→224→223→204→173→150→127→104→90 від реального пальця. Користувач явно підтвердив «Змінюються число й яскравість LED». Отже, для цього обладнання весь шлях Code variable → generated binding → touch → variable write → numeric display + PWM LED перевірено фізично. Desktop preview залишається локальним, USB telemetry в нього не підставляється автоматично.
