# Display: перевірка архітектури та план MVP

Стан: реалізовано перший етап — редактор і локальне інтерактивне превʼю, 2026-11-20. Апаратна інтеграція ще не реалізована.
Цей план не замінює повні критерії приймання із завдання користувача.

## Перевірений поточний стан

- Основний застосунок: Tauri / Rust, JS UI, CodeMirror 6. Експериментальний `native/` не є основним UI.
- `src/ui.js`: один активний Arduino-проєкт, спільні вибір плати, Tools, Arduino CLI compile/upload, менеджер бібліотек.
- `src-tauri/src/projects.rs`: атомарний запис, перевірка шляхів, відкриття наявних `.ino`, staging додаткових `.cpp/.h` та `src/` для неканонічних папок скетчів.
- Build: `src/designer/workspace.js`, `src-tauri/src/designer.rs`; схема в `.pinway/circuit.json` того самого проєкту. Rust перевіряє активний root і symlink-підміни.
- Build зараз записує схему після змін незалежно від глобального autosave. Code має глобальний debounce autosave 1200 мс, default false. Потрібне узгодження механізму збереження; цей факт не означає, що налаштування поточного користувача прочитано з live WebView.
- У каталозі Build немає дисплеїв. Немає спільного семантичного реєстру пінів, змінних або механізму round-trip C++.
- Серед файлів bundled `.toolchain` не знайдено U8g2 / Adafruit GFX / SSD1306 / ILI9341 / hd44780. Наявність AVR/ESP core сама собою не дає драйверів дисплеїв.
- Збірка Code виконує save перед Arduino CLI; Display має додати валідацію й підтвердження генерації до цієї послідовності.

## Перевірка референсу

PopkaStudio: https://github.com/PopaSpinka/PopkaStudio
Переглянутий commit: `6e6e3b6efc73cf6f2e132715e03569e890cad588`.
Переглянуто `docs/screenshots/editor.png`, `studio/web/studio.css`, `studio/web/index.html`, `studio/web/js/engine.js`, структуру портів Halo й Wasm-збірок.

- Візуальна основа: фон #131416, картки #1e1f22, контури #303136, текст #ececee, акцент #4c8dff, напрямні #ff4fa3, радіус 8 px; плаваючі лівий список, праві властивості та центральний toolbar Edit/Try/Map.
- Рушій preview використовує shared firmware через Wasm і ресурси, підготовлені тим самим конвеєром. Збірки залежать від плати/орієнтації.
- Взяти композицію й характер оформлення, а не набір застосунків для годинника або обмеження його плат.

## Архітектура повного MVP (нижче позначено реалізований етап)

1. Версійований `.pinway/display.json`: один дисплей, сторінки, елементи, порядок шарів, окремі editorHidden / runtimeVisible, блокування, actions, bindings, asset references. Геометрія окремо від hardware; зміна роздільності не переміщує елементи.
2. Capabilities: pixel/cell geometry, mono/color, touch, доступні властивості/елементи, оцінка RAM/flash. Character LCD має координати в комірках, обмежені символи й CGRAM; кирилиця не обіцяється через довільний ROM LCD.
3. Hardware adapters: точний controller/bus/geometry/pins/address/rotation і окремий touch controller. Вибір драйвера не підміняє вибір плати. Невідомий pin map не вважається перевіреним.
4. Спільний підготовлений rendering description та bitmap/glyph assets для Canvas2D preview і C++ generator. Це уникає прошивочного Wasm для кожної плати. Відповідність зображення потрібно перевіряти; browser font rendering саме собою її не гарантує.
5. Preview: локальні типізовані значення, instant navigation, buttons/toggles/sliders; GPIO та C++ показують симульовану дію без доступу до реального порту.
6. Явні типізовані binding declarations і callbacks: початково bool / integer / float / text з обмеженим форматуванням і перевіркою read/write/range. Механізм потребує окремого погодження меж перед реалізацією; довільний C++ не переписувати регулярними виразами.
7. Редаговані `pinway_display.h/.cpp`, assets та integration/handlers окремо від `.ino`. Зберігати останню згенеровану базу та порівнювати її з поточними файлами й незбереженими Code buffers. При відмінностях показувати конкретний diff і пропонувати прийняти, зберегти manual version або відкласти. Не перезаписувати manual handlers.
8. Спільний реєстр явних hardware assignments і binding metadata; зміни між вкладками лише після поясненого підтвердження. Нерозпізнаний C++ залишати opaque і збереженим. Конфлікти, що впливають на upload, мають бути видимі.
9. Спільне save/dirty/close/switch/recovery: Display та Build підкоряються глобальному autosave; recovery окремо від явного збереження проєкту. Захист owner/revision/async loading для кожної операції. Layout edits не генерують C++ автоматично без підтвердження.

## Кандидати драйверів, ще не погоджені й не реалізовані

- SSD1306 I²C 128×64 / 128×32 через U8g2: монохромний pixel adapter, перевірити paged rendering і subset кириличних glyphs на AVR.
- ST7789 / ILI9341 SPI через відповідні Adafruit drivers + GFX: колірний adapter без обов'язкового повного framebuffer; touch лише окремим перевіреним adapter.
- HD44780 16×2 / 20×4 з PCF8574 backpack через hd44780_I2Cexp: character adapter з обмеженнями символів.
- Перший adapter і фізичну тестову конфігурацію вибрати після відповіді користувача. Для довільної геометрії дозволені design/preview, але не заява про hardware support.

## Послідовні етапи без вилучення вимог MVP

1. Editor та збереження: Display entry, capabilities, floating panels, pixel/cell canvas, pages CRUD, усі базові елементи, grid/guides, drag/resize, layers, editor visibility/runtime visibility, locks, shortcuts, clipboard між сторінками, undo/redo, blank + до двох starters, shared save/reopen/isolation.
2. Поведінка й ресурси: actions/GPIO/custom handlers, physical associations, touch filtering, typed read/write bindings, interactive local preview, test values, page map, імпорт images/icons, підготовлені українські шрифти та glyph/resource subset.
3. Firmware integration: підтверджуваний generation diff, separate editable C++ files, driver/pin configuration, Build integration, cross-tab reconciliation, dependency management, shared compile/upload, Arduino IDE portability.
4. Перевірка: end-to-end UI, recovery/switch/races, manual code conflicts, asset limits, compilation matrix і доступне фізичне обладнання. Окремі статуси implemented / compiled / hardware-tested для кожної конкретної конфігурації.

Ризики: SRAM AVR, Unicode на character LCD, розмір шрифтів та images, різні SPI/I²C/touch drivers, невідомі pin maps, compile staging, manual C++ conflicts, відповідність preview згенерованій графіці. Без фізичного дисплея hardware-tested статус неможливий.

## Питання для наступного кроку

Першим уточнити, який дисплей доступний користувачу для тестування (controller, geometry, touch та плата). Після відповіді уточнювати лише наступне істотне невирішене питання, по одному. Користувач 2026-11-20 підтвердив: спочатку реалізувати редактор і превʼю в наявному застосунку; вибір фізичного дисплея відкласти. Це питання не блокує поточний етап. Firmware та hardware Display не реалізовані й не перевірені.

## Контекст попередніх чатів

2026-11-20 прочитано останні п’ять етапів чату «Створи першу версію Pinway IDE» (`01a1e499-520b-7eb2-8157-c54c0360bea7`) та останні рішення чату «Уточнити концепцію екосистеми Pinway» (`01a1fa1f-a9ed-75f3-b2e9-29180d851a31`). Обидва використовують цей самий корінь проєкту; на момент перевірки вони idle.

Підтверджено безпосередньо з історії: Code/Build мають один проєкт і спільні New/Open/Save; окрема назва схеми прибрана за рішенням користувача. Зберегти Home, стабільне положення перемикача й меню, виправлення системних кнопок macOS та відсутність зайвих inline логотипів. Display додавати до цієї наявної екосистеми. Новий дизайн поки застосовується лише до Display. Історія доповнює перевірку поточного коду, а не замінює її.


## Реалізований етап: редактор і превʼю

Рішення користувача: «починай робити Display в існуючому додатку. Спочатку редактор і превʼю, а з фізичним дисплеєм розберемось пізніше».

- Display у спільному перемикачі, тому самому Arduino-проєкті й lifecycle Code/Build. Дизайн інших редакторів не перероблено.
- Окремі `src/display/model.mjs`, `src/display/workspace.js`, `src/display.css`, Rust storage `src-tauri/src/display.rs`.
- Фактичний renderer цього етапу — SVG, один метод artwork для полотна, інтерактивного превʼю та мініатюр мапи. SVG зручний для selection/resize/pointer events і доступний у поточному WebView без додаткового Wasm toolchain. Canvas2D з початкової пропозиції не знадобився для поточного етапу. Це локальне превʼю, не бітово точний емулятор прошивки; спільні firmware assets ще попереду.
- Pixel color / mono і character-cell canvas. Зміна геометрії зберігає координати, повідомляє про вихід за межі; несумісні елементи залишаються у списку шарів, а не видаляються. Для символьного класу доступне лише додавання тексту.
- CRUD сторінок, навігація без переходових анімацій, мапа з напрямленими зв’язками й переліком переходів. Видалення сторінки підтверджується, incoming links скидаються; є Undo.
- Text, image/icon як raster image, rectangle, ellipse, button, toggle, slider, progress. Mouse positioning, bottom-right resize, grid snap, pink alignment guides, keyboard nudge, copy/paste між сторінками, duplicate, layer order, lock, editorHidden і runtimeVisible окремо, undo/redo до 100 кроків із лімітом приблизно 24 МБ для undo snapshots.
- Порожній макет, Monitoring і Control starters. Системні Arial / Courier New / Georgia для локального тексту, включно з українськими літерами; embedded font subsets ще не реалізовані.
- PNG/JPEG/WebP до 2 МБ і 1024×1024; data URL усередині документа. У mono preview — threshold image filter. Фізичне перетворення в assets і firmware memory estimate ще не реалізовані.
- Явні локальні number / boolean / text змінні, read bindings/formatting, write bindings sliders/toggles, вручну задані тестові значення. Дії navigate / set variable / simulated GPIO. Custom C++ лише пояснена заглушка; не виконується. Physical-button association — явна локальна подія; GPIO фізичної кнопки ще не налаштовується. Touch events показуються лише для touch-capable макета.
- `.pinway/display.json`: shared manual save та глобальний autosave, dirty prompt на switch/close/quit, owner-keyed recovery у localStorage. Recovery не дорівнює збереженню проєкту. Незмінений і ніколи не відкритий Display не створює файл при Save у Code.
- Backend: active-project root guard, real directory/file checks проти symlinks, atomic save, 8 МБ budget, compare із прочитаною базою для виявлення зовнішніх змін. При конфлікті документ на диску не замінюється; локальний макет можна експортувати в JSON. UI валідатор відхиляє невідомі формати й небезпечні image URL.

### Перевірки

- `npm run test:display`: 8 model tests.
- `npm test`: UI bundle + 15 Rust tests (13 попередніх + 2 storage tests Display).
- `node tests/display-harness.cjs`: справжній frontend з in-memory native API на localhost:8467. Підключити `/checks.js` і виконати `await runDisplayChecks()` у браузері. 32 перевірки: старт без проєкту, спільні New/Open, Code save без створення Display, starter, manual save, disabled autosave, local preview/actions/bindings/navigation, pages/map, layers, clipboard/undo/redo, pointer geometry/guides/resize, switching Code/Build/Display, dirty cancel/save-and-switch isolation. У pointer tests capture API замінено stub; реальний native pointer capture цим тестом не перевірений.
- Додатково через browser harness перевірено enabled autosave, PNG import і відновлення незбереженого шару з українським текстом після reload.
- macOS app зібрано й підписано ad hoc; актуальна збірка `dist/display-editor-ready/Pinway IDE.app`. Desktop UI smoke не завершено: Computer Use повернув «Computer Use was not approved to use Pinway IDE». Доступ іншим способом не обходили, запуск цієї збірки не підтверджено.

### Межі цього етапу й решта MVP

Немає hardware drivers, C++ generation / editable generated files, реальних Code bindings / C++ analysis, shared pin registry / cross-tab conflict dialogs, hardware resource estimates / embedded glyph subsets, фізичного touch driver, firmware compilation/upload для Display. Наявний Code compile/upload не замінювався і під час тестів не викликався. Жодна комбінація дисплея й плати ще не має статусу implemented / compiled / hardware-tested для Display.

Існуюча незалежна autosave-поведінка Build поки лишається відомою невідповідністю повним вимогам shared autosave; Display використовує глобальне налаштування. Цей етап не є завершенням повного MVP. Наступні етапи лишаються у плані вище.


## Уточнення GPIO-прикладу — 2026-11-21

TouchLed169 тепер має одну сторінку й кнопку з прямою дією GPIO14 / toggle. Модель підтримує mode=set з bool level та mode=toggle; legacy action без mode зберігає поведінку set. Превʼю має локальний стан GPIO та показує HIGH/LOW в інспекторі, без доступу до плати. Контрол властивостей пропонує HIGH, LOW і HIGH↔LOW.

Пройшли всі 9 тестів моделі; два кліки в native Display підтвердили HIGH→LOW без навігації. Основний скетч має 28 рядків, драйвери залишилися окремо. Нову прошивку успішно записано через dist/display-gpio/Pinway IDE.app. Повторний фізичний LED-тест нової версії ще не підтверджено. Загальний C++ generator залишається наступним етапом.


## TouchLed169: однакова графіка, 2026-11-21

Для конкретного фізичного прикладу додано експорт поточного `.pinway/display.json` у RGB565 кадри OFF/ON. Шрифт Arial раструється один раз під час експорту; `display_frames.h` містить RLE пікселі, PNG у `hardwarePreview` збережено з тих самих RGB565 значень. Нативний Display показує апаратний кадр і зберігає області взаємодії/виділення. У разі будь-якої зміни source макета snapshot втрачає чинність, renderer повертається до SVG та показує issue про повторний експорт. Немає прихованого перезапису ручного C++ при редагуванні макета.

Це обмежений експортер `scripts/export-touch-led169.py` для однієї сторінки 240×280, Arial, text/button та поточної кнопки GPIO14. Загальний exporter, UI generation diff та універсальні драйвери залишаються окремим етапом. При втраті тачу firmware додає червону рамку; локальне превʼю відповідає справному тачу.

Перевірки: 10 model tests включно з invalidation/unsafe snapshot; `tests/touch-led169-frames.py` порівнює всі 67200 пікселів кожного кадру із C++ RLE. Компіляція CLI: 321060 Flash / 24116 RAM. Main лишився 28 рядків із прямим HIGH/LOW.


## TouchLed169: автоматична підготовка при Build/Upload, 2026-11-21

За скаргою користувача прибрано вимогу ручного експорту. Frontend prepareBuild раструє той самий SVG редактора в Canvas, квантує RGB565 й повертає OFF/ON RLE та актуальну touch-геометрію. Кирилиця, вибрані системні шрифти, кольори, позиції й розміри беруться з поточного документа. Збереження документа проходить через наявний CAS; генерація перевіряє owner/source після async rasterization. Native img-src CSP дозволяє data:, тому SVG передається як data URL, без blob: і без послаблення CSP.

Backend звіряє source зі збереженим макетом, перевіряє ESP32/геометрію/повноту RGB565. Для Display примусово створюється тимчасова копія скетчу навіть для стандартного імені Arduino. Лише в цій копії готуються display_frames.h та BUTTON_X/Y/W/H; ручні C++ файли не змінюються. Помилки підготовки блокують компіляцію/запис старих кадрів. Звичайні проєкти без апаратного target зберігають попередній build flow.

Поточний adapter: одна touch-сторінка 240×280, статична графіка та одна GPIO14 toggle-кнопка. Змінні/додаткові апаратні дії не генеруються і дають пояснену помилку. Цей adapter не означає реалізації універсального генератора.

11 JS tests; 17 Rust tests, включно з примусовим staging, пересунутою областю дотику, недоторканністю оригінальних C++ та відхиленням старого source/некоректних кадрів.


## Змінні Code → Display → фізичний повзунок, 2026-11-21

Користувач вимагає одну змінну, визначену в Code, без повторного створення в Display. Додано консервативне виявлення глобальних scalar definitions у primary .ino (`code-variables.mjs`): literal numeric/bool initializers, readonly const, пропуск коментарів/рядків/локальних/масивів/умовних compilation branches. Це не повний C++ AST: вирази, namespace/class members, static/extern та інші translation units не інтерпретуються. Каталог оновлюється з поточного editor buffer при Code edits, відкритті Display й перед build. Збіг із ручною тестовою змінною заміщується метаданими Code; це binding catalog, не нове визначення C++.

Для поточного Waveshare/ESP32 додано dynamic adapter: одна числова mutable Code variable, touch sliders і text/progress read bindings. Цілий діапазон до257станів, budget85000RGB565delta runs. При експортуванні actual SVG раструється для кожного стану, preview PNG і firmware delta patches походять від однакових пікселів. Підготовка відхиляє зміни source/коду під час async generation.

`display_dynamic.rs` генерує extern-посилання на ту саму C++ змінну та setup/loop wrapper тільки в temp copy. Оригінальні функції setup/loop у копії перейменовуються, manual file не переписується. Generated tick читає touch coordinates і записує scalar напряму; user loop застосовує ledcWrite. Display відслідковує змінну й малює і slider, і число. Невідомі/несумісні обробники блокують build. Повний framebuffer спочатку не вмістився у статичний DRAM classicESP32; замінено streaming8rows/3840bytes. Target fixture compile успішна: Flash323383/RAM28160 (реальні generated delta assets ще перевіряються у native UI).

Користувацький скетч збережено у `.pinway/backups/TouchLed169.ino.before-code-bindings`; layout backup теж є. У робочому main brightness20 задається один раз, повторний brightness20 у loop прибрано, delay1000→1; PWMGPIO14/5000Hz/8bit збережено. Додано Serial115200 для фізичної діагностики. Повзунок та текст прив’язані до brightness; діапазон0…255, action none (запис відбувається через binding).

13JS tests,18Rust tests пройшли. Native package: dist/display-code-bindings-ready/Pinway IDE.app. Реальний upload і touch cycle ще треба перевірити перед фінальними hardware claims.


Фінальна фізична перевірка Code bindings: dist/display-code-bindings-ready запущено; native Upload image791936/282567compressed, усі4hashverified/RTSreset. Serial показав brightness20→224→204→173→127→90 від фізичного тачу. Користувач підтвердив одночасну зміну числа та яскравості LED. Усі256PNG/RGB565deltaстанів і streaming8rows звірено автоматично. Деталі й точні межі у VERIFICATION.md.


## Сторінки та каталог драйверів, 2026-11-21

- Скарга Yo: функція видалення ховалася в інспекторі полотна; при вибраному елементі її не видно. Додано постійне меню ⋯ біля кожної сторінки: rename/duplicate/start-page/reorder/delete. Можна керувати неактивною сторінкою, вибір не змінюється до дії. Last-page delete заблоковано; dialog показує шари/вхідні переходи й Undo. Duplication робить нові ID та перенаправляє self-links у копію. Delete скидає incoming navigation. 14 model tests пройшли; keyboard menu не запускає nudge елементів.
- Наступна апаратна інтеграція (пропозиція, НЕ встановлена): постачати version-pinned libraries/cache з notices та профілями модулів. LovyanGFX підтримує багато color controllers і touch (ST7789/ILI9341/GC9A01, CST816S/GT911/XPT2046); U8g2 покриває monochrome OLED/LCD (SSD1306/SH1106 та ін.). TFT_eSPI — альтернативний color backend. Офіційні джерела: https://github.com/lovyan03/LovyanGFX ; https://github.com/olikraus/u8g2 ; https://github.com/Bodmer/TFT_eSPI . Не додавати дубльовані backends без потреби.
- Профіль ≠ бібліотека: controller, geometry/offsets/orientation, bus, pin map, touch controller/IRQ/reset, board compatibility. Catalog має відділяти library support / compiled profile / hardware-tested profile. Вибір модуля у Display має готувати driver files/includes/init/runtime для нового Arduino project без копіювання TouchLed169. Генератору ще потрібна multi-page підтримка; просте встановлення libraries цього не реалізує.
- Yo під час огляду містив лише Yo.ino, Display240×280touch/3сторінки, brightness190 ізCode; hardware adapter не налаштовано. На slider додатковий set brightness190 перекриває значення binding. Код, профіль і сторінки Yo для цього етапу не виправляли й не прошивали.


## Сторінки та вбудований пакет драйверів, 2026-11-21

- У новому Yo користувач мав3сторінки й не знаходив видалення. Додано постійне меню ⋯ у кожному page row: rename/duplicate/start/reorder/delete. Delete dialog показує шари/incoming links, дозволяє cancel і Undo; last-page guard, нові ID/self-links при duplicate, скидання incoming navigation при remove. Global editor nudge не спрацьовує, коли відкрите menu. 14JS model tests пройшли; старі tests більше не залежать від mutable TouchLed169 fixture.
- Native UI на Yo: відкрито ⋯ третьої сторінки → delete confirmation (0шарів/0переходів) → Cancel. Усі3сторінки збережено, код і прошивку Yo не змінювали. Нові правки Yo користувач робив сам; під час тесту було homepage navigation до другої сторінки. Аппаратний adapter Yo досі не налаштований, multi-page runtime не додано.
- Whisper «кріплення» користувач явно виправив: жодних механічних даних/кріплень не потрібно. Запит — список поширених дисплеїв і готові програмні драйвери/тач/залежності з постачанням у Pinway.
- Завантажено офіційні source archives10бібліотек: LovyanGFX1.3.0,TFT_eSPI2.5.43,U8g2(properties2.36.18,source tag2.36.19),hd44780 1.3.2,GxEPD2 1.6.9,XPT2046_Touchscreen1.4,AdafruitFT6206 1.1.1,AdafruitILI9341 1.7.0,AdafruitGFX1.13.0,BusIO1.17.4. Source archives та installed trees SHA256 pinned у config/display-libraries.lock.json. Package271МБ source, original licenses retained, aggregate THIRD_PARTY.txt. Тільки app-owned .toolchain/display-libraries/Resources/display-libraries; користувацький Sketchbook не змінюється.
- scripts/display-libraries.py prepare/verify/extraction guards; scripts/check-display-libraries.py компілює7API-sketches на esp32:esp32:esp32 без upload. Усі7PASS: LovyanGFX(4panels+4touch types),TFT_eSPI,U8g2(SSD1306+SH1106),hd44780,GxEPD2,XPT2046,FT6206+ILI9341+GFX+BusIO. 18Rust tests пройшли. Компільовано, а не hardware-tested на нових модулях.
- Host compile автоматично отримує --libraries app pack; installed map включає bundled versions. Package script verify→copy originalsources/manifest/licenses + display-catalog.json. Модульний каталог8family entries у config/display-catalog.json, читабельний DISPLAY-CATALOG.md з primary sources. Це не рейтинг продажів і не статус готових new-project adapters.
- Фінальна підписана збірка dist/display-driver-pack/Pinway IDE.app запущена. Resources мають10libraries/8catalogentries/licenses. Native Code→Бібліотеки показав11installed:10bundled + попередній FastLED3.10.9. Залишено бібліотечну панель відкритою.
- Відкрите завдання: вибір конкретного модуля/версії/pins/touch та автоматичне provisioning/init/runtime у новому project, а також multi-page firmware. Сам bundled driver pack цього ще не робить. Раніше фізично перевірений лише власний адаптер TouchLed169/Waveshare1.69/classicESP32; не поширювати hardware-tested на LovyanGFX чи веськаталог.

## Автоматичний Waveshare, завершений етап 2026-11-21

Реалізовано профіль Waveshare1.69/classicESP32 у canvas inspector, редагування10GPIO з перевіркою конфліктів та збереження власного wiring preset. Build сам створює12файлів у src/pinway_display, namespace PinwayHardware, hash-manifest і pending journal захищають ручні зміни та перервані записи. Runtime підтримує multi-page navigation, одну Code variable або один GPIO. Тимчасовий primary отримує setup/loop bridges і touch-aware delay; rootmain byte-identical.

Новий Yo перевірено native Verify:481251Flash/28160RAM, успішно. Основний SHA25657d51f0107cb8c50193203cc9481b8076d00bf16751703f08f3db1c504fec285 збережено. Повзунок brightness0–255: зайву set190 дію замінено none через UI; макет лишився з2сторінками. 15JS/23Rust testsPASS; tests/display-scene-frames.py звірив усі257PNGстанів із generatedRGB565 та8rowrenderer. Знайдений у native QA legacy pin14-only snapshot guard виправлено, regression test додано.

Запущена підписана app dist/display-waveshare-final/Pinway IDE.app, native Console показала «Компіляція успішна». Upload цього етапу не виконувався: плата була від’єднана, користувач явно вибрав «Зараз без плати — перевір лише збірку». Фізичне підтвердження нового multi-page runtime залишається наступною перевіркою. Документація: DISPLAY-WAVESHARE.md.
