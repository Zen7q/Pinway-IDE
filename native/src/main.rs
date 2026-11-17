#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod arduino;
mod projects;

use eframe::egui::{self, RichText};
use projects::{Project, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct AppHandle(mpsc::Sender<Event>);
fn emit(app: &AppHandle, channel: &str, data: Value) {
    let _ = app.0.send(Event::Output(
        channel.to_owned(),
        data.as_str().unwrap_or("").to_owned(),
    ));
}
enum Event {
    Output(String, String),
    Catalog(Vec<Value>),
    Ports(Vec<Value>),
    Details(Vec<Value>),
    Probe(Value),
    Done(std::result::Result<Value, String>),
}
#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
struct Preferences {
    favorites: BTreeSet<String>,
    board: String,
    options: BTreeMap<String, String>,
    recent: Vec<PathBuf>,
    drafts: BTreeMap<PathBuf, String>,
    active: Option<PathBuf>,
}
struct Document {
    path: PathBuf,
    text: String,
    saved: String,
}
struct Pinway {
    cli: Arc<arduino::Arduino>,
    tx: mpsc::Sender<Event>,
    rx: mpsc::Receiver<Event>,
    storage: PathBuf,
    prefs: Preferences,
    project: Option<Project>,
    docs: Vec<Document>,
    active: usize,
    boards: Vec<Value>,
    ports: Vec<Value>,
    details: Vec<Value>,
    port: String,
    query: String,
    console: String,
    serial: String,
    command: String,
    busy: bool,
    status: String,
    sidebar: bool,
    libraries: bool,
    bottom: bool,
    serial_tab: bool,
    tools: bool,
    board_menu: bool,
    monitor: Option<Arc<arduino::Monitor>>,
    last_poll: Instant,
    library_query: String,
    library_results: Vec<Value>,
    new_name: String,
    new_project: bool,
    entry_name: String,
    entry_folder: bool,
    entry_dialog: bool,
    diagnostics: Vec<Value>,
    selected_folder: Option<PathBuf>,
    last_save: Instant,
}
fn label(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_owned()
}
impl Pinway {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        cc.egui_ctx.set_visuals(egui::Visuals::dark());
        let storage = directories::ProjectDirs::from("dev", "binio", "Pinway")
            .unwrap()
            .data_local_dir()
            .to_path_buf();
        fs::create_dir_all(&storage).unwrap();
        let prefs = fs::read(storage.join("workspace.json"))
            .ok()
            .and_then(|x| serde_json::from_slice(&x).ok())
            .unwrap_or_default();
        let executable = std::env::current_exe().unwrap();
        let bundled = executable.parent().unwrap().join("../Resources/arduino");
        let runtime = if bundled.is_dir() {
            bundled
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.toolchain/runtime")
        };
        let (tx, rx) = mpsc::channel();
        let mut app = Self {
            cli: Arc::new(arduino::Arduino::new(runtime, storage.clone())),
            tx,
            rx,
            storage,
            prefs,
            project: None,
            docs: vec![],
            active: 0,
            boards: vec![],
            ports: vec![],
            details: vec![],
            port: String::new(),
            query: String::new(),
            console: String::new(),
            serial: String::new(),
            command: String::new(),
            busy: false,
            status: "Підготовка Arduino…".into(),
            sidebar: true,
            libraries: false,
            bottom: true,
            serial_tab: false,
            tools: false,
            board_menu: false,
            monitor: None,
            last_poll: Instant::now(),
            library_query: String::new(),
            library_results: vec![],
            new_name: String::new(),
            new_project: false,
            entry_name: String::new(),
            entry_folder: false,
            entry_dialog: false,
            diagnostics: vec![],
            selected_folder: None,
            last_save: Instant::now(),
        };
        if let Some(path) = app.prefs.active.clone() {
            app.open(path);
        }
        let cli = app.cli.clone();
        let tx = app.tx.clone();
        std::thread::spawn(move || match cli.json(&["board", "listall"]) {
            Ok(v) => {
                let list = arduino::array(&v["boards"])
                    .iter()
                    .filter(|x| arduino::supported(&label(x, "fqbn")))
                    .map(|x| json!({"id":x["fqbn"],"name":x["name"]}))
                    .collect();
                let _ = tx.send(Event::Catalog(list));
            }
            Err(e) => {
                let _ = tx.send(Event::Done(Err(e)));
            }
        });
        app
    }
    fn persist(&self) {
        let mut prefs = Preferences {
            favorites: self.prefs.favorites.clone(),
            board: self.prefs.board.clone(),
            options: self.prefs.options.clone(),
            recent: self.prefs.recent.clone(),
            active: self.docs.get(self.active).map(|d| d.path.clone()),
            ..Default::default()
        };
        for d in &self.docs {
            if d.text != d.saved {
                prefs.drafts.insert(d.path.clone(), d.text.clone());
            }
        }
        if let Ok(bytes) = serde_json::to_vec(&prefs) {
            let _ = projects::atomic_write(&self.storage.join("workspace.json"), &bytes, false);
        }
    }
    fn open(&mut self, path: PathBuf) {
        match projects::open(&path) {
            Ok(p) => {
                self.selected_folder = Some(p.root.clone());
                self.project = Some(p);
                self.open_doc(path.clone());
                self.prefs.recent.retain(|x| x != &path);
                self.prefs.recent.insert(0, path);
                self.status = "Проєкт відкрито".into();
            }
            Err(e) => self.status = e,
        }
    }
    fn open_doc(&mut self, path: PathBuf) {
        if let Some(index) = self.docs.iter().position(|d| d.path == path) {
            self.active = index;
            return;
        }
        if let Ok(text) = fs::read_to_string(&path) {
            let draft = self
                .prefs
                .drafts
                .get(&path)
                .cloned()
                .unwrap_or(text.clone());
            self.docs.push(Document {
                path,
                text: draft,
                saved: text,
            });
            self.active = self.docs.len() - 1;
        }
    }
    fn save(&mut self) -> Result<()> {
        for d in &mut self.docs {
            if d.text != d.saved {
                projects::atomic_write(&d.path, d.text.as_bytes(), true)?;
                d.saved = d.text.clone();
            }
        }
        self.persist();
        Ok(())
    }
    fn select_board(&mut self, id: String) {
        self.prefs.board = id.clone();
        self.prefs.options.clear();
        let cli = self.cli.clone();
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            if let Ok(v) = cli.json(&["board", "details", "--fqbn", &id]) {
                let _ = tx.send(Event::Details(
                    arduino::array(&v["config_options"]).to_vec(),
                ));
            }
        });
    }
    fn build(&mut self, upload: bool) {
        if self.busy {
            return;
        }
        if let Err(e) = self.save() {
            self.status = e;
            return;
        }
        let Some(project) = self.project.clone() else {
            return;
        };
        if upload && self.port.is_empty() {
            self.status = "Виберіть порт".into();
            return;
        }
        if upload {
            if let Some(m) = self.monitor.take() {
                m.stop();
            }
        }
        let board = self.prefs.board.clone();
        let opts = json!(self.prefs.options);
        let port = self.port.clone();
        let cli = self.cli.clone();
        let tx = self.tx.clone();
        self.busy = true;
        self.console.clear();
        self.bottom = true;
        self.serial_tab = false;
        std::thread::spawn(move || {
            let app = AppHandle(tx.clone());
            let run = || -> Result<Value> {
                let args = arduino::board_arguments(&board, &opts)?;
                let temp = tempfile::tempdir().map_err(projects::err)?;
                let staged = projects::stage(&project, temp.path())?;
                let output = temp.path().join("output");
                let sketch = staged.directory.to_string_lossy().to_string();
                let mut compile = vec!["compile".into()];
                compile.extend(args.clone());
                compile.extend([
                    "--build-path".into(),
                    output.to_string_lossy().into_owned(),
                    sketch.clone(),
                ]);
                let result = cli.run(&compile, 600, Some(app.clone()))?;
                let diagnostics = projects::diagnostics(
                    &format!("{}\n{}", result.stderr, result.stdout),
                    &project,
                    &staged,
                );
                if !result.ok {
                    return Ok(
                        json!({"message":"Компіляція не вдалася","diagnostics":diagnostics}),
                    );
                }
                if upload {
                    let mut command = vec!["upload".into()];
                    command.extend(args);
                    command.extend([
                        "--port".into(),
                        port,
                        "--input-dir".into(),
                        output.to_string_lossy().into_owned(),
                        sketch,
                    ]);
                    let result = cli.run(&command, 180, Some(app))?;
                    if !result.ok {
                        return Err(arduino::message(&result));
                    }
                }
                Ok(
                    json!({"message":if upload{"Прошивку завантажено"}else{"Компіляція успішна"},"diagnostics":diagnostics}),
                )
            };
            let _ = tx.send(Event::Done(run()));
        });
    }
    fn ports_ui(&mut self, ui: &mut egui::Ui) {
        egui::ComboBox::from_id_salt(ui.id().with("port"))
            .selected_text(if self.port.is_empty() {
                "Порт не вибрано".into()
            } else {
                self.port.clone()
            })
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut self.port, String::new(), "Не вибрано");
                for p in &self.ports {
                    let addr = label(p, "address");
                    ui.selectable_value(&mut self.port, addr.clone(), addr);
                }
            });
    }
    fn tree(&mut self, ui: &mut egui::Ui, path: PathBuf) {
        if let Ok(entries) = projects::entries(&path) {
            for entry in entries {
                if entry.folder {
                    let response = egui::CollapsingHeader::new(&entry.name)
                        .id_salt(&entry.path)
                        .show(ui, |ui| self.tree(ui, entry.path.clone()));
                    if response.header_response.clicked() {
                        self.selected_folder = Some(entry.path);
                    }
                } else if entry.editable
                    && ui
                        .selectable_label(
                            self.docs
                                .get(self.active)
                                .is_some_and(|d| d.path == entry.path),
                            entry.name,
                        )
                        .clicked()
                {
                    self.open_doc(entry.path);
                }
            }
        }
    }
    fn process(&mut self) {
        while let Ok(event) = self.rx.try_recv() {
            match event {
                Event::Output(ch, s) => {
                    let log = if ch == "serial" {
                        &mut self.serial
                    } else {
                        &mut self.console
                    };
                    log.push_str(&s);
                    if log.len() > 400000 {
                        let mut at = log.len() - 300000;
                        while !log.is_char_boundary(at) {
                            at += 1;
                        }
                        log.drain(..at);
                    }
                }
                Event::Catalog(v) => {
                    self.boards = v;
                    self.status = "Готово".into();
                    if !self.prefs.board.is_empty() {
                        let options = self.prefs.options.clone();
                        self.select_board(self.prefs.board.clone());
                        self.prefs.options = options;
                    }
                }
                Event::Ports(v) => {
                    self.ports = v;
                    if !self.port.is_empty()
                        && !self.ports.iter().any(|p| label(p, "address") == self.port)
                    {
                        self.port.clear();
                    }
                    if self.port.is_empty() && self.ports.len() == 1 {
                        self.port = label(&self.ports[0], "address");
                        if self.prefs.board.is_empty() {
                            let cli = self.cli.clone();
                            let tx = self.tx.clone();
                            let p = self.ports[0].clone();
                            std::thread::spawn(move || {
                                if let Ok(v) = cli.probe(&p, &AppHandle(tx.clone())) {
                                    let _ = tx.send(Event::Probe(v));
                                }
                            });
                        }
                    }
                }
                Event::Probe(v) => {
                    let chip = label(&v, "chip");
                    let id = if v["board"].is_object() {
                        label(&v["board"], "id")
                    } else {
                        format!("esp32:esp32:{}", chip.to_lowercase().replace('-', ""))
                    };
                    if self.boards.iter().any(|p| label(p, "id") == id) {
                        self.select_board(id);
                    }
                }
                Event::Details(v) => self.details = v,
                Event::Done(v) => {
                    self.busy = false;
                    match v {
                        Ok(v) => {
                            self.status = label(&v, "message");
                            self.diagnostics = arduino::array(&v["diagnostics"]).to_vec();
                            if v["libraries"].is_array() {
                                self.library_results = arduino::array(&v["libraries"]).to_vec();
                            }
                        }
                        Err(e) => self.status = e,
                    }
                }
            }
        }
        if self.last_poll.elapsed() > Duration::from_secs(3) {
            self.last_poll = Instant::now();
            let cli = self.cli.clone();
            let tx = self.tx.clone();
            std::thread::spawn(move || {
                if let Ok(p) = cli.ports() {
                    let _ = tx.send(Event::Ports(p));
                }
            });
        }
        if self.last_save.elapsed() > Duration::from_secs(2) {
            self.last_save = Instant::now();
            self.persist();
        }
    }
}
impl eframe::App for Pinway {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.process();
        ctx.request_repaint_after(Duration::from_millis(100));
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::COMMAND, egui::Key::S)) {
            if let Err(e) = self.save() {
                self.status = e;
            }
        }
        egui::TopBottomPanel::top("header")
            .exact_height(48.)
            .show(ctx, |ui| {
                ui.horizontal_centered(|ui| {
                    ui.strong("Pinway IDE");
                    if ui.small_button("−").clicked() {
                        ctx.set_zoom_factor((ctx.zoom_factor() - 0.1).max(0.7));
                    }
                    if ui.small_button("+").clicked() {
                        ctx.set_zoom_factor((ctx.zoom_factor() + 0.1).min(1.5));
                    }
                    if ui.button("Відкрити").clicked() {
                        if let Some(p) = rfd::FileDialog::new()
                            .add_filter("Arduino", &["ino"])
                            .pick_file()
                        {
                            self.open(p);
                        }
                    }
                    if ui.button("Новий").clicked() {
                        self.new_project = true;
                    }
                    if ui.button("Зберегти").clicked() {
                        if let Err(e) = self.save() {
                            self.status = e;
                        }
                    }
                    let name = self
                        .boards
                        .iter()
                        .find(|b| label(b, "id") == self.prefs.board)
                        .map(|b| label(b, "name"))
                        .unwrap_or("Вибрати плату".into());
                    if ui.button(name).clicked() {
                        self.board_menu = !self.board_menu;
                    }
                    ui.add_enabled_ui(!self.busy, |ui| {
                        if ui.button("✓ Перевірити").clicked() {
                            self.build(false);
                        }
                        if ui.button("↑ Завантажити").clicked() {
                            self.build(true);
                        }
                    });
                    if ui.button("Tools").clicked() {
                        self.tools = !self.tools;
                    }
                });
            });
        if self.board_menu {
            egui::Window::new("Плати")
                .open(&mut self.board_menu.clone())
                .default_width(380.)
                .show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        self.ports_ui(ui);
                        if ui.button("Закрити").clicked() {
                            self.board_menu = false;
                        }
                    });
                    ui.text_edit_singleline(&mut self.query);
                    let mut boards = self.boards.clone();
                    boards.sort_by_key(|b| {
                        (
                            !self.prefs.favorites.contains(&label(b, "id")),
                            label(b, "name"),
                        )
                    });
                    egui::ScrollArea::vertical()
                        .max_height(450.)
                        .show(ui, |ui| {
                            for b in boards {
                                let id = label(&b, "id");
                                let name = label(&b, "name");
                                if !name.to_lowercase().contains(&self.query.to_lowercase()) {
                                    continue;
                                }
                                ui.horizontal(|ui| {
                                    let favorite = self.prefs.favorites.contains(&id);
                                    if ui.button(if favorite { "★" } else { "☆" }).clicked() {
                                        if favorite {
                                            self.prefs.favorites.remove(&id);
                                        } else {
                                            self.prefs.favorites.insert(id.clone());
                                        }
                                    }
                                    if ui.selectable_label(self.prefs.board == id, name).clicked() {
                                        self.select_board(id);
                                        self.board_menu = false;
                                    }
                                });
                            }
                        });
                });
        }
        if self.tools {
            egui::Window::new("Tools").show(ctx, |ui| {
                self.ports_ui(ui);
                for option in self.details.clone() {
                    let key = label(&option, "option");
                    let selected = self.prefs.options.entry(key.clone()).or_insert_with(|| {
                        arduino::array(&option["values"])
                            .iter()
                            .find(|v| v["selected"] == true)
                            .or_else(|| arduino::array(&option["values"]).first())
                            .map(|v| label(v, "value"))
                            .unwrap_or_default()
                    });
                    let selected_label = arduino::array(&option["values"])
                        .iter()
                        .find(|v| label(v, "value") == *selected)
                        .map(|v| label(v, "value_label"))
                        .unwrap_or_default();
                    ui.label(label(&option, "option_label"));
                    egui::ComboBox::from_id_salt(key)
                        .selected_text(selected_label)
                        .show_ui(ui, |ui| {
                            for v in arduino::array(&option["values"]) {
                                ui.selectable_value(
                                    selected,
                                    label(v, "value"),
                                    label(v, "value_label"),
                                );
                            }
                        });
                }
                if ui.button("Закрити").clicked() {
                    self.tools = false;
                }
            });
        }
        egui::SidePanel::left("activity")
            .exact_width(42.)
            .resizable(false)
            .show(ctx, |ui| {
                if ui.button("Ф").on_hover_text("Файли").clicked() {
                    self.sidebar = !self.sidebar;
                    self.libraries = false;
                }
                if ui.button("Б").on_hover_text("Бібліотеки").clicked() {
                    self.sidebar = true;
                    self.libraries = true;
                }
            });
        if self.sidebar {
            egui::SidePanel::left("sidebar").default_width(235.).resizable(true).show(ctx,|ui|{
            if self.libraries {ui.heading("Бібліотеки");ui.text_edit_singleline(&mut self.library_query);if ui.button("Знайти").clicked(){let cli=self.cli.clone();let tx=self.tx.clone();let q=self.library_query.clone();std::thread::spawn(move||{let result=cli.json(&["lib","search",&q]).map(|v|json!({"message":"Пошук завершено","libraries":v["libraries"]}));let _=tx.send(Event::Done(result));});}egui::ScrollArea::vertical().show(ui,|ui|{for lib in self.library_results.clone(){let name=label(&lib,"name");ui.label(&name);if ui.button(format!("Встановити {name}")).clicked(){let cli=self.cli.clone();let tx=self.tx.clone();self.busy=true;std::thread::spawn(move||{let result=cli.run(&["lib".into(),"install".into(),name],120,Some(AppHandle(tx.clone()))).and_then(|v|if v.ok{Ok(json!({"message":"Бібліотеку встановлено"}))}else{Err(arduino::message(&v))});let _=tx.send(Event::Done(result));});}}});}
            else {ui.horizontal(|ui|{ui.strong("Файли");if ui.button("+ файл").clicked(){self.entry_dialog=true;self.entry_folder=false;}if ui.button("+ папка").clicked(){self.entry_dialog=true;self.entry_folder=true;}});if let Some(p)=self.project.clone(){egui::ScrollArea::vertical().show(ui,|ui|self.tree(ui,p.root));}else{for p in self.prefs.recent.clone(){if ui.button(p.display().to_string()).clicked(){self.open(p);}}}}
        });
        }
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(&self.status);
                ui.separator();
                ui.label(&self.port);
                if ui
                    .button(if self.bottom {
                        "Сховати консоль"
                    } else {
                        "Консоль"
                    })
                    .clicked()
                {
                    self.bottom = !self.bottom;
                }
            });
        });
        if self.bottom {
            egui::TopBottomPanel::bottom("console")
                .resizable(true)
                .default_height(180.)
                .show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        ui.selectable_value(&mut self.serial_tab, false, "Консоль");
                        ui.selectable_value(&mut self.serial_tab, true, "Serial Monitor");
                        if ui.button("Очистити").clicked() {
                            if self.serial_tab {
                                self.serial.clear();
                            } else {
                                self.console.clear();
                            }
                        }
                        if self.serial_tab {
                            if ui
                                .button(if self.monitor.is_some() {
                                    "Закрити порт"
                                } else {
                                    "Відкрити 115200"
                                })
                                .clicked()
                            {
                                if let Some(m) = self.monitor.take() {
                                    m.stop();
                                } else {
                                    match self.cli.monitor(
                                        &self.port,
                                        115200,
                                        &AppHandle(self.tx.clone()),
                                    ) {
                                        Ok(m) => self.monitor = Some(m),
                                        Err(e) => self.status = e,
                                    }
                                }
                            }
                            ui.text_edit_singleline(&mut self.command);
                            if ui.button("Надіслати").clicked() {
                                if let Some(m) = &self.monitor {
                                    if let Err(e) = m.write(&(self.command.clone() + "\n")) {
                                        self.status = e;
                                    } else {
                                        self.command.clear();
                                    }
                                }
                            }
                        }
                    });
                    egui::ScrollArea::both()
                        .stick_to_bottom(true)
                        .show(ui, |ui| {
                            ui.monospace(if self.serial_tab {
                                &self.serial
                            } else {
                                &self.console
                            });
                        });
                });
        }
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.horizontal(|ui| {
                for (i, d) in self.docs.iter().enumerate() {
                    let name = d.path.file_name().unwrap().to_string_lossy();
                    if ui
                        .selectable_label(
                            i == self.active,
                            format!("{}{}", name, if d.text != d.saved { " •" } else { "" }),
                        )
                        .clicked()
                    {
                        self.active = i;
                    }
                }
            });
            if let Some(d) = self.docs.get_mut(self.active) {
                let theme =
                    egui_extras::syntax_highlighting::CodeTheme::from_memory(ctx, ui.style());
                let mut layouter = |ui: &egui::Ui, string: &str, wrap_width: f32| {
                    let mut job = egui_extras::syntax_highlighting::highlight(
                        ui.ctx(),
                        ui.style(),
                        &theme,
                        string,
                        "cpp",
                    );
                    job.wrap.max_width = wrap_width;
                    ui.fonts(|f| f.layout_job(job))
                };
                egui::ScrollArea::both().show(ui, |ui| {
                    ui.add(
                        egui::TextEdit::multiline(&mut d.text)
                            .font(egui::TextStyle::Monospace)
                            .code_editor()
                            .desired_width(f32::INFINITY)
                            .desired_rows(36)
                            .layouter(&mut layouter),
                    );
                });
            } else {
                ui.add_space(80.);
                ui.heading(RichText::new("Pinway IDE").size(36.));
                ui.label("Arduino · ESP32");
            }
        });
        if self.new_project {
            egui::Window::new("Новий проєкт").show(ctx, |ui| {
                ui.text_edit_singleline(&mut self.new_name);
                if ui.button("Створити в папці…").clicked() {
                    if let Some(parent) = rfd::FileDialog::new().pick_folder() {
                        let templates: Value =
                            serde_json::from_str(include_str!("../templates.json")).unwrap();
                        match projects::create(
                            &parent,
                            &self.new_name,
                            templates["empty"]["code"].as_str().unwrap(),
                        ) {
                            Ok(p) => {
                                self.open(p.primary);
                                self.new_project = false;
                            }
                            Err(e) => self.status = e,
                        }
                    }
                }
                if ui.button("Скасувати").clicked() {
                    self.new_project = false;
                }
            });
        }
        if self.entry_dialog {
            egui::Window::new(if self.entry_folder {
                "Нова папка"
            } else {
                "Новий файл"
            })
            .show(ctx, |ui| {
                ui.text_edit_singleline(&mut self.entry_name);
                if ui.button("Створити").clicked() {
                    if let (Some(p), Some(parent)) = (&self.project, &self.selected_folder) {
                        match projects::create_entry(p, parent, &self.entry_name, self.entry_folder)
                        {
                            Ok(_) => {
                                self.entry_dialog = false;
                                self.entry_name.clear();
                            }
                            Err(e) => self.status = e,
                        }
                    }
                }
                if ui.button("Скасувати").clicked() {
                    self.entry_dialog = false;
                }
            });
        }
    }
    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        self.persist();
        if let Some(m) = self.monitor.take() {
            m.stop();
        }
    }
}
fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1320., 820.])
            .with_min_inner_size([850., 560.]),
        ..Default::default()
    };
    eframe::run_native(
        "Pinway IDE",
        options,
        Box::new(|cc| Ok(Box::new(Pinway::new(cc)))),
    )
}
