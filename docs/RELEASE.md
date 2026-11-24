# Пакування та оновлення

Базове встановлення 0.3 містить Pinway Code, Arduino CLI 1.5.1 та Arduino AVR Boards 1.8.8. ESP32 SDK і бібліотеки дисплеїв зберігаються у даних користувача після окремого встановлення. Build і Display завантажують свої JavaScript/CSS-модулі лише під час відкриття вкладки. Базовий frontend їх не містить.

## Зібрати інсталятор

Потрібні Node.js 24, Python 3.12+, Rust stable та залежності Tauri для системи. На macOS встановіть Xcode Command Line Tools, на Windows — Microsoft C++ Build Tools та WebView2. Linux-пакування потребує GTK/WebKit development packages.

```sh
npm ci
npm run package:tauri
```

Скрипт готує платформний Arduino AVR комплект, збирає notices, компілює Rust у release-профілі та створює DMG на macOS, NSIS EXE на Windows або DEB на Linux. Результат записується в нову папку `dist/release-<дата-час>`. Вже наявні збірки зберігаються. Для швидкої локальної діагностики можна виконати `python3 scripts/package-desktop.py --debug`.

Release-профіль використовує size optimization, thin LTO, один codegen unit і видаляє debug symbols. JavaScript мінімізований. ESP SDK та Display libraries прибрані з базової поставки.

## Додаткові пакети

```sh
node scripts/build-addons.mjs
python3 scripts/display-libraries.py
python3 scripts/package-addons.py
```

У `dist/release/` з'являються `pinway-build.zip`, `pinway-display.zip` та `pinway-packs.json`. Архів Display містить бібліотеки з оригінальними notices і джерелами. Встановлення ESP32 виконує Arduino CLI через офіційний індекс Espressif, із версією core 3.3.12.

Завантаження модулів іде з GitHub Release `v<версія застосунку>`. Перевіряються розмір і SHA-256 з manifest. Архів розпаковується в staging, небезпечні шляхи та symlinks відхиляються, а встановлення фіксується після перевірки структури. Обірване завантаження можна повторити. Модулі версіоновані разом із Pinway. Після оновлення застосунку його версія може потребувати повторного встановлення модулів.

## GitHub і перевірка оновлень

Workflow `Build and test` тестує код, збирає Windows EXE як artifact і перевіряє Docker-образ. Після успіху збірок об'єднайте об'єкти `installers` із платформних `pinway-release.json`, залишивши одну спільну версію. Завантажте спільний manifest, інсталятори та три файли додаткових пакетів у відповідний GitHub Release.

Pinway при запуску перевіряє останній stable GitHub Release у фоні. Перевірку можна вимкнути в налаштуваннях або запустити вручну. Новіша версія показує кнопку «Оновити IDE» біля назви та в налаштуваннях. За підтвердженням користувача завантажується інсталятор для його системи, перевіряється SHA-256 і відкривається для встановлення. Користувач сам завершує роботу й замінює застосунок. Автоматичного примусового встановлення немає.

Manifest має структуру нижче. Розмір і контрольну суму формує скрипт пакування.

```json
{
  "version": "0.3.0",
  "installers": {
    "macos-aarch64": {"file": "Pinway-IDE_0.3.0_macos-aarch64.dmg", "bytes": 123, "sha256": "<SHA-256>"},
    "windows-x86_64": {"file": "Pinway-IDE_0.3.0_windows-x86_64.exe", "bytes": 456, "sha256": "<SHA-256>"}
  }
}
```

Контрольна сума захищає від пошкоджених завантажень. Довіра до manifest залежить від HTTPS і доступу до GitHub-репозиторію. Для macOS-публікації з Developer ID та notarization і для Windows Authenticode потрібні відповідні сертифікати власника. Поточне macOS-пакування використовує ad-hoc підпис. Юридичні питання сторонніх компонентів наведені в [огляді ліцензій](../LICENSE-REVIEW.md).

## Docker

Образ призначений для компіляції скетчів і CI. Десктопний інтерфейс запускається через системний інсталятор.

```sh
docker build -t pinway-cli .
docker run --rm pinway-cli version
docker run --rm -v "$PWD:/workspace" pinway-cli compile --fqbn arduino:avr:uno /workspace/Blink
```

Для образу з ESP32 виконайте `docker build --build-arg ESP32=true -t pinway-cli-esp .`. Локально можна додавати бібліотеки, зберігаючи каталог `/workspace/libraries` у змонтованому проєкті. Передача USB залежить від host OS, для звичайної компіляції USB не потрібен.


## Перевірка модульної поставки — 2026-11-25

- Release app для Apple Silicon — близько 404 MiB, DMG — близько 140 MiB. У Resources відсутні ESP SDK, Display libraries та окремі UI-модулі Build/Display.
- Esbuild input graph базового frontend не містить `src/designer/` або `src/display/`. Ці модулі збираються в окремі архіви.
- Реальний WebKit підтвердив три кроки майстра, обидві теми, керування пакетами та перехід Home. Логотип у PNG збігається з наданим користувачем байт-у-байт.
- Скетч SerialHello у тимчасовому QA-проєкті скомпільовано для Uno через встановлену app — 1640 bytes flash / 206 bytes RAM.
- Build і Display реально встановлено через GitHub release assets, після чого обидві вкладки відкрилися в native app. Пакет Display завантажує близько 76 MB архіву з вихідними файлами драйверів.
- ESP32 встановлено через UI та офіційний індекс. Native збірка ESP32-C3 — 276990 bytes flash / 13200 bytes RAM. Видалення пакета прибрало невикористовувані toolchains і повернуло data-каталог із близько 6,3 GiB до близько 350 MiB. Кеш завантажень може займати додаткове місце.
- На 553×373 CSS pixels у desktop harness перевірено темну/світлу теми, форму Settings та індикатор оновлення. Horizontal overflow відсутній. Сценарії пропозиції пакета, відмови, встановлення, видалення й відкладення оновлення пройшли.
- 29 Rust tests і 22 JavaScript tests пройшли локально. Тест завантаження перевіряє SHA-256 та збереження попереднього файла при пошкодженому завантаженні.
- GitHub Actions перевірив реальну компіляцію Arduino Uno у Docker. Завантажуваний образ містить CLI для firmware builds.

Фізичне USB-прошивання в цьому етапі не запускали. Windows EXE перевіряється складанням у Windows CI, а інтерактивна робота Windows і USB ще потребують окремого фізичного тесту. Перевірка пропозиції оновлення та відмови виконувалася з тестовою відповіддю про новішу версію. Повний цикл заміни встановленого застосунку інсталятором ще не перевірений.
