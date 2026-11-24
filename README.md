# Pinway IDE

## Ліцензія

Власний код Pinway поширюється за [Pinway IDE Source-Available License 1.0](LICENSE). Дозволено переглядати й змінювати код, безкоштовно поширювати оригінальні та змінені версії зі збереженням авторських повідомлень і ліцензії та позначенням змін. Продаж IDE чи похідних версій, зокрема через платний пакет або підписку на отримання копії, потребує окремого письмового дозволу.

Дозволено використовувати Pinway для оплачуваної розробки, продавати власні прошивки й пристрої. Ліцензія містить додатковий дозвіл для власних шаблонів і runtime-коду, який Pinway генерує у користувацькі проєкти. Сторонні бібліотеки та інструменти зберігають свої умови, наведені в [THIRD_PARTY.md](THIRD_PARTY.md).

Текст ліцензії потребує юридичної перевірки. Результати технічної перевірки залежностей та відкриті питання описані в [LICENSE-REVIEW.md](LICENSE-REVIEW.md).

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

The workspace menu in the title bar opens **Pinway Code** or **Pinway Build**. Code and Build are tools of the same project. Create or open a project once; switching tools keeps its code and circuit together. Build has no separate project name or creation dialog. Its electrical model, component definitions, connectivity checks, file validation and native file operations run in Rust (`src-tauri/src/designer.rs`). The interface inherits Code's theme and accent.

Choose **Breadboard**, **Schematic** or **PCB** in the left rail. Drag components from the library, or click to place them. Move and rotate components on the grid. Hover over a contact to see its connected net. Click two contacts, or drag between them, to create a wire. Intermediate clicks add bends; double-click an existing wire to add another bend, then drag its handle. The inspector includes contact buttons for precise connection selection.

Circuit topology is shared across views. Each view keeps independent positions and routes. Breadboard conductors are projected into connections between components in Schematic and PCB. PCB starts with dashed, unrouted connections; select one and choose **Route on copper layer** to route it manually. Board size is editable in millimetres.

Shortcuts: **R** rotate, **W** wire, **V** select, **⌘D** duplicate, **⌘C / ⌘V** copy and paste, **Delete** remove, **⌘Z / ⇧⌘Z** undo and redo, **⌘N / ⌘O / ⌘S** new/open/save. Pan with a trackpad or Space-drag; pinch to zoom. Resize the component library at its right edge or collapse it.

**New project** and **Open project** use the same project workflow as Code. **Save project** saves the code and circuit together. Build changes are also saved automatically to `.pinway/circuit.json` inside the active project. Each project keeps its own components, wiring and layouts; switching projects flushes the current circuit first. The former unassigned circuit is adopted once by the first opened project, with its original recovery retained as a backup. **Export SVG** exports the active view.

The initial nine-part library and manual, single-layer PCB layout support circuit planning and documentation. Footprints are illustrative; fabrication exports and design-rule checking are not implemented.


## Display — редактор і локальне превʼю

У меню Code / Build додано Pinway Display. Макет належить тому самому проєкту й зберігається в `.pinway/display.json` через спільне збереження та глобальне налаштування автозбереження. Можна почати без плати й фізичного дисплея.

Перший етап містить сторінки, шари, графічні елементи, символьне полотно, drag/resize, grid/guides, undo/redo, копіювання, імпорт raster images, локальні змінні та інтерактивне превʼю з мапою переходів. Для Waveshare 1.69″ / classic ESP32 доступні автоматична генерація прошивки, драйвери, прив’язка числової змінної Code та переходи між сторінками. Подробиці й результати QA — у [DISPLAY-PLAN.md](DISPLAY-PLAN.md).

Перевірка моделі: `npm run test:display`. Тести Rust storage: `npm test`. Browser harness без плати й доступу до користувацьких файлів: `node tests/display-harness.cjs`.


Мінімальний апаратний приклад: [TouchLed169](examples/TouchLed169/README.md) — Waveshare 1.69″ Touch LCD 240×280 + classic ESP32 + LED. Самодостатній Arduino C++, компілюється на ESP32 core 3.3.12; дотик і керування яскравістю LED фізично перевірені. Нові проєкти можуть використовувати автоматичний профіль Waveshare без копіювання прикладу.


## Сторінки Display та пакет драйверів

У списку сторінок є меню ⋯ для перейменування, дублювання, вибору стартової сторінки, зміни порядку й видалення. Видалення підтверджується, повернення через ⌘Z.

Початковий список сімейств дисплеїв та точні межі інтеграції: [DISPLAY-CATALOG.md](DISPLAY-CATALOG.md). Десктопна збірка постачає10version-pinned Arduino libraries для LCD/OLED/TFT/e-paper/touch та залежностей. Бібліотеки видно серед установлених, компілятор отримує app-owned library path автоматично. Користувацький Sketchbook не змінюється.

Перед пакуванням один раз підготуй джерела `python3 scripts/display-libraries.py`; наступне пакування перевіряє SHA256 і копіює готовий offline pack. `python3 scripts/check-display-libraries.py` перевіряє API компіляцією без доступу до USB-портів. Встановлений драйвер і налаштований апаратний adapter для нового Display — окремі етапи: автоматичний module setup ще не реалізований для всього каталогу.

## Автоматичний Waveshare у новому проєкті

Display → Параметри полотна → Модель дисплея → Waveshare 1.69″ Touch LCD → Налаштувати контакти. Далі Code → Перевірити / Завантажити. Драйвери LCD/тачу, графіка, переходи між сторінками та запуск створюються автоматично; основний .ino не переписується. Інструкція й межі підтримки: [DISPLAY-WAVESHARE.md](DISPLAY-WAVESHARE.md).

Перевірено через підписану native app на новому Yo, який спочатку мав тільки .ino: успішна ESP32 збірка481251bytesFlash/28160bytesRAM, дві сторінки й brightness0–255. 15JS/23Rust tests пройшли; усі257PNGстанів двох сторінок збігаються з generatedRGB565, streaming8rows також перевірено. Нова автоматична прошивка фізично не перевірялася: користувач попросив завершити без плати.

## Спільне оформлення Pinway

Code, Build, Display та спільні екрани використовують палітру й контролі поточного Display. Готова macOS-збірка: `dist/studio-design-release/Pinway IDE.app`. Перелік змін, перевірки та точні команди повернення попереднього оформлення — у [UI-DESIGN.md](UI-DESIGN.md).
