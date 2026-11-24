# Перевірка відновленого інтерфейсу

- Основна збірка — Tauri, Rust backend і попередній інтерфейс CodeMirror.
- П'ять тестів Rust пройшли після відновлення вихідного коду.
- Доступні автодоповнення, Plotter, карти пінів, улюблені плати, вибір порту в меню плат і Tools, згортання та перетягування панелей.
- Незбережену чернетку нативного редактора перенесено в recovery попереднього інтерфейсу.
- Раніше в цій сесії через нативний Rust-модуль перевірено фізичну прошивку ESP32-C3 скетчем із FastLED. Повторного запису під час відновлення дизайну немає.

## Модульна поставка та реліз 0.3 — 2026-11-25

- [x] Базова release-збірка містить Code + Arduino AVR, без ESP SDK і Display libraries.
- [x] Перший запуск: тема → плати → вкладки, збереження стану, повтор після помилки.
- [x] Пакети: інсталяція, повторна спроба, видалення, індикатор прогресу, захист паралельних операцій.
- [x] Build/Display дійсно завантажуються окремо. Їхні файли відсутні у базовому frontend bundle.
- [x] Відсутній workspace/профіль веде до встановлення пакета. Керування доступне в Settings.
- [x] Старі проєкти, скетчі, макети та встановлені пакети зберігаються.
- [x] Перевірка оновлень при запуску й у Settings. Відмова/відсутність мережі не блокує роботу.
- [x] Зелений акцент за замовчуванням, темна/світла теми, input/select, вузьке вікно, native WebKit.
- [x] Release-профіль, заміри розміру, DMG, Windows EXE через CI, Docker CLI для збірки скетчів.
- [x] README, screenshot, Contributing, Code of Conduct, документація й правдиві бейджі.
- [x] Тести, пакетування, smoke checks, commit/push main, перевірка GitHub assets.


### Результати перевірки

- Native macOS WebKit: майстер з трьома кроками, вибір теми, Settings, базовий Code, встановлення Build/Display з GitHub, встановлення й видалення ESP32, видалення Build, Home з оригінальним логотипом — PASS.
- Uno через базову app: 1640 bytes flash / 206 bytes RAM. ESP32-C3 після встановлення пакета: 276990 bytes flash / 13200 bytes RAM. Upload на фізичну плату не запускали.
- 29 Rust tests, 22 JS tests, browser integration setup/package/update flows, dark/light 553×373 desktop harness без horizontal overflow — PASS.
- Esbuild input graph та Resources перевірені: optional workspace implementations, ESP SDK та Display libraries відсутні у базовій поставці. macOS app близько 404 MiB, DMG близько 140 MiB. `codesign --verify --deep --strict` та `hdiutil verify` — PASS.
- GitHub Actions для release source `0321fc2`: Linux tests, Windows EXE, Docker image та реальна Docker-компіляція Uno — SUCCESS, run `45512572962`.
- Native UI перевіряли на окремих `/tmp` QA-проєктах і storage. Особисті скетчі та макети не редагували. Сторонні видалення наявних tracked `examples/TouchLed169` і `examples/Yo`, які з'явилися під час роботи, лишаються поза комітами цього етапу.

### Відкриті ручні перевірки

- [ ] Windows: інтерактивний запуск інсталятора й USB upload на реальні Uno/Nano/ESP32/ESP32-C3.
- [ ] Чисті macOS/Windows: повний цикл заміни встановленої версії інсталятором оновлення. Автоперевірка та відкладення перевірені у browser harness із тестовою відповіддю новішої версії.
- [ ] Apple Developer ID/notarization та Windows Authenticode підпис відповідними сертифікатами власника.
- [ ] Юридичне погодження власної ліцензії та повного Corresponding Source GPL/LGPL toolchain-компонентів, див. LICENSE-REVIEW.md.
