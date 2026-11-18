# Pinway IDE

Версія 0.2 використовує Tauri та Rust для системної частини. Інтерфейс працює на JavaScript, HTML і CSS у системному WebView, а редактор використовує CodeMirror. Arduino CLI виконує збірку й завантаження прошивки.

Десктопна IDE для Arduino C++ на Apple Silicon. Створюйте й відкривайте `.ino` у звичайних папках, редагуйте файли, збирайте без підключеної плати та завантажуйте прошивку через USB.

## Встановлення та запуск

1. Скопіюйте `Pinway IDE.app` із `dist/tauri/` в Applications або відкрийте його звідти. Локальна збірка має підпис ad hoc; її не нотаризовано для розповсюдження.
2. Для збірки потрібна **Rosetta 2**: офіційний Arduino ctags (спільний для всіх профілів) і компілятор AVR містять Intel-бінарники. Якщо macOS ще не встановила Rosetta, виконайте `softwareupdate --install-rosetta` або встановіть її за системною підказкою. Це потрібно один раз на Mac.
3. Відкрийте Pinway. Під час першого запуску він підготує робочі копії інструментів у `~/Library/Application Support/dev.binio.pinway.tauri`. Arduino IDE, Homebrew і системний Arduino CLI для роботи застосунку не потрібні. Збірка базового скетчу працює без мережі. Завантаження нових бібліотек та оновлення індексу потребують мережі.

Збірку виконано на Apple Silicon, macOS 15.7.3. Для цієї збірки потрібна macOS 13 або новіша. Пакування і роботу USB для Windows та Linux ще треба перевірити. У комплекті повний SDK ESP32, тому `.app` займає близько 7 ГБ. Для встановлення і першого запуску закладіть місце під застосунок, робочу копію та кеш збірки.

## Перший скетч

У діалозі **Новий проєкт** доступні порожній скетч, Blink, сканер I²C і приклад підключення до Wi-Fi для Arduino ESP32. У прикладі Wi-Fi вкажіть назву й пароль своєї мережі в скетчі. Blink використовує пін `LED_BUILTIN` з профілю плати.

**Tools → Карта пінів** відкриває пошук контактів для Uno R3, Nano ATmega328P, ESP32-DevKitC V4 і ESP32-C3-DevKitM-1. Для загальних профілів ESP32 показано еталонну плату Espressif. Пункт «Документація виробника» відкриває схему.

**Plotter** показує останні 150 зразків із Serial Monitor. Надсилайте з плати по одному рядку з числами на зразок `24.5,60` або `temp:24.5 humidity:60`. Графік оновлюється, поки порт відкритий. Підтримується до восьми каналів.

Pinway зберігає вкладки й незбережені чернетки відкритого проєкту для відновлення після збою. При наступному запуску чернетки відкриються в редакторі, а вихідні файли залишаються на диску до ручного збереження.

Масштаб усієї IDE можна змінити в меню **Вигляд** або кнопками **− / 100% / +** на верхній смузі. Клавіші **⌘+**, **⌘−** і **⌘0** збільшують, зменшують і скидають масштаб. Pinway відновлює вибір після перезапуску.

- **⌘P** відкриває пошук за назвою або шляхом до файла у проєкті.
- Pinway зберігає модель плати, бутлоадер та параметри збірки окремо для кожного проєкту.
- Вкладка **Проблеми** показує помилки й попередження з компілятора. Натисніть на запис, щоб перейти до файла та рядка.
- **Serial Monitor** має мітки часу, фільтр і поле надсилання команд. Кінець рядка можна вибрати перед надсиланням.
- Стрілка в нижній панелі або повторне натискання активної вкладки згортає її. Відкрите підключення Serial Monitor продовжує працювати.


Натисніть **Новий проєкт** і виберіть папку, або відкрийте існуючий `.ino`. Для нового проєкту назва, наприклад `Blink`, створює `Blink/Blink.ino`. Останні скетчі залишаються в історії. **⌘S** зберігає активний файл; перевірка й завантаження спочатку зберігають усі відкриті змінені файли. Якщо наявний `.ino` названо інакше, ніж його папку, Pinway готує сумісну тимчасову копію для збірки; вихідний проєкт залишається у своїй папці.

У селекторі в шапці доступні всі плати з установлених пакетів Arduino AVR та Arduino ESP32. Знайдіть модель за назвою або FQBN. Зірочка додає профіль до розділу **Улюблені**. Якщо підключено один USB-пристрій, Pinway вибирає його порт і підставляє визначений профіль у шапці. Щоб визначити чип ESP32, IDE може коротко перезапустити плату. Ручний вибір профілю зберігається для скетчу. Якщо профіль не визначився, виберіть його в шапці. USB-порт можна змінити в меню плат або в **Tools**.

Натисніть **Перевірити**, щоб скомпілювати скетч, або **Завантажити**, щоб прошити плату. Підказку про помилку можна побачити на рядку вихідного файлу. Консоль містить повний текст збірки.

| Плата | Профіль | Що перевірити |
|---|---|---|
| Arduino Uno R3 | Arduino Uno R3 | Arduino CLI визначає профіль за USB-ідентифікаторами. |
| Arduino Nano, клон | Arduino Nano | **Tools → Processor → ATmega328P (Old Bootloader)**. USB-UART зазвичай визначає тільки послідовний порт. |
| ESP32 | ESP32 Dev Module | Pinway підставляє загальний профіль для визначеного чипа. За потреби виберіть точну модель у шапці. |
| ESP32-C3 | ESP32C3 Dev Module | Для native USB увімкніть **USB CDC On Boot**. Після прошивки порт може з'явитися під іншою назвою; виберіть актуальний у Tools. |

На вкладці **Файли** зліва можна створити файл або папку в корені чи вибраній папці. Вкладка **Бібліотеки** зліва відкриває пошук і показує встановлені версії поруч із редактором. Повторне натискання активної іконки у вертикальній смузі згортає бічну панель. Перетягніть її правий край, щоб змінити ширину. Подвійне натискання на край повертає початковий розмір. Вкладка **Serial Monitor** читає потік вибраного порту. Під час прошивки на цьому порту Pinway закриває монітор; після прошивки його можна знову відкрити.

### Перевірка на платі

```cpp
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.println("Pinway OK");
  delay(1000);
}
```

Для кожної плати підключіть USB, підтвердьте сповіщення, виберіть профіль і параметри з таблиці. Натисніть **Перевірити**, потім **Завантажити**. У **Serial Monitor** відкрийте порт на 115200 бод і дочекайтеся повторюваного `Pinway OK`. Перевірте також підключення до запуску, два пристрої одночасно, від’єднання та повторну спробу. Якщо ESP не входить у режим завантаження автоматично, використайте процедуру BOOT/RESET вашої моделі. Перебіг і фактичні результати — у [чеклісті](CHECKLIST.md).


Налаштування відкриваються шестернею внизу лівої смуги. Доступні темна, світла й системна теми, акцентний колір, масштаб, розмір шрифту, перенесення рядків, автозбереження після 1,2 секунди без редагування й відновлення сеансу. Автозбереження за замовчуванням вимкнене. Налаштування зберігаються між запусками.

## Збірка з коду

На Apple Silicon, з Node.js 24 і macOS Command Line Tools:

```sh
npm ci
npm run seed
npm run package:tauri
open "dist/tauri/Pinway IDE.app"
```

`npm run seed` готує ізольований комплект: офіційний [Arduino CLI 1.5.1](https://github.com/arduino/arduino-cli/releases/tag/v1.5.1) із перевіркою SHA-256, Arduino AVR Boards **1.8.8**, Arduino ESP32 **3.3.12**, esptool **5.3.1**, компілятори та індекси. За наявності цих самих версій можна передати підготовлений кеш: `PINWAY_ARDUINO_DATA="$HOME/Library/Arduino15" npm run seed`. Скрипт копіює пакети й індекси, а не бібліотеки, скетчі чи конфігурацію користувача. `npm run dev` запускає IDE із коду.

Tauri пакує інтерфейс у Rust-застосунок, а скрипт додає Arduino CLI і SDK до `Contents/Resources/arduino`. Для збирання з коду потрібні Rust і Xcode Command Line Tools. Якщо збірка у стандартному каталозі вже є, задайте новий каталог через `PINWAY_TAURI_OUT="$PWD/dist/tauri-next" npm run package:tauri`. На macOS під час першого запуску застосунок імпортує список проєктів, дані відновлення та каталог Sketchbook з Electron-версії, якщо вони є. Масштаб, ширина панелей і профілі плат у WebView створюються заново.

`npm test` перевіряє роботу зі скетчами на Rust. `npm run package` запускає пакування Tauri. Джерела та ліцензії комплекту наведено в [THIRD_PARTY.md](THIRD_PARTY.md).

## Pinway Build

The workspace menu in the top bar switches between **Pinway Code** and **Pinway Build**. Code keeps the existing Arduino editor.

Build provides **Breadboard**, **Schematic**, and **PCB** in the left activity rail. Drag components from the library onto the 2.54 mm grid. Click a terminal and then another terminal to connect them, or drag between terminals. Click the canvas while drawing to add bends. Double-click a wire to add a bend later. Hover over a breadboard hole to highlight its electrical net.

The same components and connections are shared across all three views. Each view keeps its own component positions and wire routes. In PCB, dashed lines are unrouted connections. Select one and use **Route this trace**, then drag its bend handles. **Board dimensions** sets the PCB size.

The inspector edits labels, LED colors, resistor values, and wire colors. Resistor bands update from the selected resistance. Use **R** to rotate, **⌘D** to duplicate, **⌘C / ⌘V** to copy and paste, **Delete** to remove, **⌘Z / ⇧⌘Z** for undo and redo. Pinch to zoom and use the trackpad to pan, or hold Space while dragging.

**Save** writes a `.pinwaybuild` document through a native file dialog. **Open** restores it. **Export image** writes an SVG image of the current view. A local draft is kept independently of Arduino sketches.

The initial component library contains a breadboard, Arduino Uno R3, ESP32 DevKit, resistor, LED, 9V battery, push button, and temperature sensor. The PCB editor supports manual single-layer routing.
