# Pinway Native

Rust + egui + wgpu. Збирання з кореня репозиторію через `cargo build`, запуск `cargo run`, перевірки `cargo test`.

Нативний інтерфейс містить редактор C++ із підсвічуванням і підказками Ctrl+Space, дерево файлів, бібліотеки, каталог плат, улюблені, USB і Tools, карти пінів, компіляцію та завантаження, Monitor і Plotter. Під час першого запуску macOS імпортує історію та чернетки Tauri.

`pinway-native --smoke /absolute/path/sketch.ino --upload` перевіряє компіляцію та прошивання однієї підключеної ESP32-C3 через той самий Rust-модуль Arduino CLI. Без `--upload` виконується лише компіляція.
