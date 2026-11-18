#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod arduino;
mod designer;
mod projects;

use arduino::{Arduino, Monitor};
use projects::{err, Project, Result};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};
use tauri_plugin_opener::OpenerExt;

static TEMPLATES: LazyLock<Value> =
    LazyLock::new(|| serde_json::from_str(include_str!("../../src/templates.json")).unwrap());

struct Session {
    project: Option<Project>,
    recent: Vec<Project>,
    recovery: Value,
}

pub struct Host {
    storage: PathBuf,
    session: Mutex<Session>,
    operation: Mutex<()>,
    monitor: Mutex<Option<Arc<Monitor>>>,
    arduino: Arduino,
}

fn emit(app: &AppHandle, kind: &str, data: Value) {
    let _ = app.emit_to("main", "pinway-event", json!({"type":kind,"data":data}));
}

fn text(x: &Value) -> &str {
    x.as_str().unwrap_or("")
}
fn value(x: impl serde::Serialize) -> Result<Value> {
    serde_json::to_value(x).map_err(err)
}
fn pick(path: Option<tauri_plugin_dialog::FilePath>) -> Result<Option<PathBuf>> {
    path.map(|p| p.into_path().map_err(err)).transpose()
}

impl Host {
    fn project(&self) -> Result<Project> {
        self.session
            .lock()
            .unwrap()
            .project
            .clone()
            .ok_or("Спочатку відкрийте проєкт.".into())
    }

    fn stop_monitor(&self, app: &AppHandle) {
        let monitor = self.monitor.lock().unwrap().take();
        if let Some(monitor) = monitor {
            monitor.stop();
            emit(app, "monitor", Value::Null);
        }
    }

    fn set_project(&self, app: &AppHandle, project: Option<Project>) -> Result<Value> {
        self.stop_monitor(app);
        let mut session = self.session.lock().unwrap();
        if let Some(project) = &project {
            let mut recent = session.recent.clone();
            recent.retain(|item| item.primary != project.primary);
            recent.insert(0, project.clone());
            recent.truncate(12);
            projects::atomic_write(
                &self.storage.join("recent.json"),
                &serde_json::to_vec(&recent).map_err(err)?,
                false,
            )?;
            session.recent = recent;
        }
        session.project = project;
        value(&session.project)
    }

    fn ports(&self, app: &AppHandle) -> Result<Vec<Value>> {
        let ports = self.arduino.ports()?;
        let missing = self
            .monitor
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|monitor| {
                !ports
                    .iter()
                    .any(|port| text(&port["address"]) == monitor.port)
            });
        if missing {
            emit(app, "serial", json!("\nПристрій від’єднано.\n"));
            self.stop_monitor(app);
        }
        Ok(ports)
    }

    fn port(&self, app: &AppHandle, address: &str) -> Result<Value> {
        self.ports(app)?
            .into_iter()
            .find(|port| text(&port["address"]) == address)
            .ok_or("Виберіть підключений порт у Tools.".into())
    }
}

fn build(host: &Host, app: &AppHandle, payload: &Value) -> Result<Value> {
    let project = host.project()?;
    let board = text(&payload["board"]);
    let args = arduino::board_arguments(board, &payload["options"])?;
    let upload = payload["upload"].as_bool().unwrap_or(false);
    let port = text(&payload["port"]);
    let device = if upload {
        host.port(app, port)?
    } else {
        Value::Null
    };
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    if !std::process::Command::new("/usr/bin/arch")
        .args(["-x86_64", "/usr/bin/true"])
        .status()
        .is_ok_and(|s| s.success())
    {
        return Err("Arduino ctags потребує Rosetta 2.".into());
    }
    let dir = tempfile::tempdir().map_err(err)?;
    let workspace = fs::canonicalize(dir.path()).map_err(err)?;
    let staged = projects::stage(&project, &workspace)?;
    let output = workspace.join("output");
    let sketch = staged.directory.to_string_lossy().into_owned();
    emit(app, "console", json!(format!("› Компіляція: {board}\n")));
    let mut compile = vec!["compile".into()];
    compile.extend(args.iter().cloned());
    compile.extend([
        "--build-path".into(),
        output.to_string_lossy().into_owned(),
        sketch.clone(),
    ]);
    let result = host.arduino.run(&compile, 600, Some(app.clone()))?;
    let diagnostics = projects::diagnostics(
        &format!("{}\n{}", result.stderr, result.stdout),
        &project,
        &staged,
    );
    let finish =
        |ok: bool, message: &str| json!({"ok":ok,"diagnostics":diagnostics,"message":message});
    if !result.ok {
        let message = if result.stderr.contains("No such file or directory") {
            "Не знайдено заголовок. Перевірте назву й встановіть потрібну бібліотеку на вкладці «Бібліотеки» зліва."
        } else {
            "Компіляція не вдалася. Перегляньте консоль."
        };
        return Ok(finish(false, message));
    }
    if !upload {
        return Ok(finish(true, "Компіляція успішна."));
    }
    if host
        .monitor
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|monitor| monitor.port == port)
    {
        emit(
            app,
            "serial",
            json!("\nМонітор закрито перед завантаженням.\n"),
        );
        host.stop_monitor(app);
    }
    if !host
        .ports(app)?
        .iter()
        .any(|item| item["key"] == device["key"])
    {
        return Ok(finish(
            false,
            "Плату від’єднано. Підключіть її й повторіть.",
        ));
    }
    emit(app, "console", json!(format!("\n› Завантаження: {port}\n")));
    let mut upload = vec!["upload".into()];
    upload.extend(args);
    upload.extend([
        "--port".into(),
        port.into(),
        "--input-dir".into(),
        output.to_string_lossy().into_owned(),
        sketch,
    ]);
    let result = host.arduino.run(&upload, 180, Some(app.clone()))?;
    if result.ok {
        Ok(finish(true, "Прошивку завантажено."))
    } else if !host
        .ports(app)
        .is_ok_and(|ports| ports.iter().any(|item| item["key"] == device["key"]))
    {
        Ok(finish(
            false,
            "Плату від’єднано. Підключіть її й повторіть.",
        ))
    } else {
        Ok(finish(
            false,
            "Завантаження не вдалося. Перевірте порт, профіль і бутлоадер.",
        ))
    }
}

fn dispatch(app: &AppHandle, window: &WebviewWindow, action: &str, p: Value) -> Result<Value> {
    let host = app.state::<Host>();
    let cli = &host.arduino;
    let _guard = if matches!(
        action,
        "create"
            | "select"
            | "close"
            | "reopen"
            | "createEntry"
            | "build"
            | "probe"
            | "install"
            | "refreshLibraries"
            | "serialOpen"
    ) {
        Some(
            host.operation
                .try_lock()
                .map_err(|_| "Зачекайте, поки поточна операція завершиться.")?,
        )
    } else {
        None
    };
    match action {
        "designer" => designer::dispatch(app, p),
        "state" => {
            let session = host.session.lock().unwrap();
            let templates: Vec<_> = TEMPLATES
                .as_object()
                .unwrap()
                .iter()
                .map(|(id, template)| json!({"id":id,"name":template["name"]}))
                .collect();
            Ok(
                json!({"project":session.project,"recent":session.recent,"recovery":session.recovery,
                "profiles":arduino::profiles(),"templates":templates}),
            )
        }
        "rememberSession" => {
            let mut session = host.session.lock().unwrap();
            let primary = session
                .project
                .as_ref()
                .map(|project| project.primary.to_string_lossy());
            if p.get("primary").and_then(Value::as_str) == primary.as_deref() {
                projects::atomic_write(
                    &host.storage.join("recovery.json"),
                    &serde_json::to_vec(&p).map_err(err)?,
                    false,
                )?;
                session.recovery = p;
            }
            Ok(Value::Null)
        }
        "prepare" => {
            cli.prepare()?;
            Ok(Value::Null)
        }
        "zoom" => {
            let percent = p
                .as_u64()
                .filter(|n| (70..=150).contains(n))
                .ok_or("Недопустимий масштаб.")?;
            window.set_zoom(percent as f64 / 100.0).map_err(err)?;
            Ok(Value::Null)
        }
        "catalog" => {
            let result = cli.json(&["board", "listall"])?;
            value(
                arduino::array(&result["boards"])
                    .iter()
                    .filter(|x| arduino::supported(text(&x["fqbn"])))
                    .map(|x| json!({"id":x["fqbn"],"name":x["name"]}))
                    .collect::<Vec<_>>(),
            )
        }
        "chooseFolder" => value(pick(app.dialog().file().blocking_pick_folder())?),
        "select" => match pick(
            app.dialog()
                .file()
                .add_filter("Arduino Sketch", &["ino"])
                .blocking_pick_file(),
        )? {
            Some(file) => host.set_project(app, Some(projects::open(&file)?)),
            None => Ok(Value::Null),
        },
        "create" => {
            let key = p["template"].as_str().unwrap_or("empty");
            let code = TEMPLATES[key]["code"]
                .as_str()
                .ok_or("Виберіть шаблон скетчу.")?;
            host.set_project(
                app,
                Some(projects::create(
                    Path::new(text(&p["parent"])),
                    text(&p["name"]),
                    code,
                )?),
            )
        }
        "reopen" => {
            let item = host
                .session
                .lock()
                .unwrap()
                .recent
                .iter()
                .find(|x| x.primary == Path::new(text(&p)))
                .cloned()
                .ok_or("У списку немає цього проєкту.")?;
            host.set_project(
                app,
                Some(projects::open(&item.selected).or_else(|_| projects::open(&item.primary))?),
            )
        }
        "close" => host.set_project(app, None),
        "projectFiles" => value(projects::files(&host.project()?.root)?),
        "children" => value(projects::entries(&projects::checked(
            &host.project()?,
            Path::new(text(&p)),
            true,
        )?)?),
        "createEntry" => projects::create_entry(
            &host.project()?,
            Path::new(text(&p["parent"])),
            text(&p["name"]),
            p["folder"].as_bool().unwrap_or(false),
        ),
        "read" => value(
            fs::read_to_string(projects::checked(
                &host.project()?,
                Path::new(text(&p)),
                false,
            )?)
            .map_err(err)?,
        ),
        "write" => {
            let content = text(&p["content"]);
            if content.len() > 4 * 1024 * 1024 {
                return Err("Файл перевищує 4 МБ.".into());
            }
            let target = projects::checked(&host.project()?, Path::new(text(&p["file"])), false)?;
            projects::atomic_write(&target, content.as_bytes(), true)?;
            Ok(Value::Null)
        }
        "reveal" => {
            app.opener()
                .reveal_item_in_dir(&host.project()?.primary)
                .map_err(err)?;
            Ok(Value::Null)
        }
        "pinoutSource" => {
            let url = tauri::Url::parse(text(&p)).map_err(err)?;
            if url.scheme() != "https"
                || !matches!(
                    url.host_str(),
                    Some("docs.arduino.cc" | "docs.espressif.com")
                )
            {
                return Err("Документація недоступна.".into());
            }
            app.opener()
                .open_url(url.as_str(), None::<&str>)
                .map_err(err)?;
            Ok(Value::Null)
        }
        "dirtyPrompt" => {
            let result = app
                .dialog()
                .message("Зберегти зміни в проєкті?")
                .title("Pinway IDE")
                .buttons(MessageDialogButtons::YesNoCancelCustom(
                    "Зберегти".into(),
                    "Не зберігати".into(),
                    "Скасувати".into(),
                ))
                .blocking_show_with_result();
            Ok(json!(match result {
                MessageDialogResult::Yes | MessageDialogResult::Ok => 0,
                MessageDialogResult::No => 1,
                MessageDialogResult::Custom(label) if label == "Зберегти" => 0,
                MessageDialogResult::Custom(label) if label == "Не зберігати" => 1,
                _ => 2,
            }))
        }
        "quit" => {
            host.stop_monitor(app);
            if p.as_bool() == Some(true) {
                app.exit(0);
            } else {
                window.destroy().map_err(err)?;
            }
            Ok(Value::Null)
        }
        "ports" => value(host.ports(app)?),
        "details" if arduino::supported(text(&p)) => Ok(cli
            .json(&["board", "details", "--fqbn", text(&p)])?
            .get("config_options")
            .cloned()
            .unwrap_or(json!([]))),
        "probe" => {
            let port = host.port(app, text(&p))?;
            if host
                .monitor
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(|m| m.port == text(&p))
            {
                host.stop_monitor(app);
            }
            cli.probe(&port, app)
        }
        "build" => build(&host, app, &p),
        "installed" => {
            let result = cli.json(&["lib", "list"])?;
            let entries: serde_json::Map<_, _> = arduino::array(&result["installed_libraries"])
                .iter()
                .map(|x| {
                    (
                        text(&x["library"]["name"]).to_string(),
                        x["library"]["version"].clone(),
                    )
                })
                .collect();
            Ok(Value::Object(entries))
        }
        "search" => {
            let name = text(&p).trim();
            if name.is_empty() || name.len() > 120 {
                return Ok(json!([]));
            }
            let query = format!("name:{}", serde_json::to_string(name).map_err(err)?);
            let result = cli.json(&["lib", "search", &query])?;
            let mut entries = arduino::array(&result["libraries"]).to_vec();
            entries.sort_by_key(|x| {
                (
                    !text(&x["name"]).eq_ignore_ascii_case(name),
                    text(&x["name"]).to_lowercase(),
                )
            });
            value(
                entries
                    .iter()
                    .take(60)
                    .map(|x| {
                        json!({"name":x["name"],"version":x["latest"]["version"],
                "description":x["latest"]["sentence"],"author":x["latest"]["author"]})
                    })
                    .collect::<Vec<_>>(),
            )
        }
        "refreshLibraries" | "install" => {
            let mut args = vec!["lib".into()];
            if action == "install" {
                let name = text(&p);
                if name.is_empty() || name.starts_with('-') || name.len() > 120 {
                    return Err("Некоректна назва.".into());
                }
                args.extend(["install".into(), name.into()]);
                emit(
                    app,
                    "console",
                    json!(format!("› Встановлення бібліотеки: {name}\n")),
                );
            } else {
                args.push("update-index".into());
                emit(app, "console", json!("› Оновлення індексу бібліотек…\n"));
            }
            let result = cli.run(&args, 120, Some(app.clone()))?;
            if !result.ok {
                return Err(arduino::message(&result));
            }
            Ok(Value::Null)
        }
        "serialOpen" => {
            let port = text(&p["port"]);
            let baud = p["baud"]
                .as_u64()
                .filter(|n| (300..=2000000).contains(n))
                .ok_or("Непідтримувана швидкість.")?;
            host.port(app, port)?;
            host.stop_monitor(app);
            let monitor = cli.monitor(port, baud, app)?;
            *host.monitor.lock().unwrap() = Some(monitor.clone());
            emit(app, "monitor", json!({"port":port}));
            arduino::watch_monitor(app.clone(), monitor);
            Ok(Value::Null)
        }
        "serialClose" => {
            host.stop_monitor(app);
            Ok(Value::Null)
        }
        "serialSend" => {
            let monitor = host
                .monitor
                .lock()
                .unwrap()
                .clone()
                .filter(|m| m.port == text(&p["port"]))
                .ok_or("Спочатку відкрийте послідовний порт.")?;
            let command = text(&p["text"]);
            if command.is_empty()
                || command.len() > 4096
                || command.bytes().any(|b| b < 32 && !matches!(b, 9 | 10 | 13))
            {
                return Err("Введіть текст команди до 4096 байтів.".into());
            }
            monitor.write(command)?;
            Ok(Value::Null)
        }
        _ => Err("Дія недоступна.".into()),
    }
}

#[tauri::command]
async fn pinway(window: WebviewWindow, action: String, payload: Value) -> Result<Value> {
    if window.label() != "main" {
        return Err("Дія недоступна.".into());
    }
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || dispatch(&app, &window, &action, payload))
        .await
        .map_err(err)?
}

fn menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let item = |id, label, shortcut| {
        MenuItemBuilder::with_id(id, label)
            .accelerator(shortcut)
            .build(app)
    };
    let application = SubmenuBuilder::new(app, "Pinway IDE")
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&item("quit", "Вийти з Pinway IDE", "CmdOrCtrl+Q")?)
        .build()?;
    let file = SubmenuBuilder::new(app, "Файл")
        .item(&item("new", "Новий проєкт", "CmdOrCtrl+N")?)
        .item(&item("open", "Відкрити скетч", "CmdOrCtrl+O")?)
        .item(&item("quickOpen", "Швидко відкрити файл", "CmdOrCtrl+P")?)
        .item(&item("save", "Зберегти файл", "CmdOrCtrl+S")?)
        .item(&item("close", "Закрити проєкт", "CmdOrCtrl+Shift+W")?)
        .item(&item("window", "Закрити вікно", "CmdOrCtrl+W")?)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Редагування")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "Вигляд")
        .item(&item("zoomIn", "Збільшити масштаб", "CmdOrCtrl+=")?)
        .item(&item("zoomOut", "Зменшити масштаб", "CmdOrCtrl+-")?)
        .item(&item("zoomReset", "Фактичний розмір", "CmdOrCtrl+0")?)
        .build()?;
    MenuBuilder::new(app)
        .items(&[&application, &file, &edit, &view])
        .build()
}

fn main() {
    let app = tauri::Builder::default()
        .manage(designer::Files::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let storage = std::env::var_os("PINWAY_USER_DATA")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            fs::create_dir_all(&storage)?;
            #[cfg(target_os = "macos")]
            if std::env::var_os("PINWAY_USER_DATA").is_none() {
                if let Some(parent) = storage.parent() {
                    let legacy = parent.join("Pinway IDE");
                    for file in ["recent.json", "recovery.json"] {
                        if !storage.join(file).exists() && legacy.join(file).is_file() {
                            fs::copy(legacy.join(file), storage.join(file))?;
                        }
                    }
                    if !storage.join("Sketchbook").exists() && legacy.join("Sketchbook").is_dir() {
                        projects::copy_tree(
                            &legacy.join("Sketchbook"),
                            &storage.join("Sketchbook"),
                            false,
                        )
                        .map_err(std::io::Error::other)?;
                    }
                }
            }
            let runtime = app.path().resource_dir()?.join("arduino");
            #[cfg(debug_assertions)]
            let runtime = if runtime.is_dir() {
                runtime
            } else {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.toolchain/runtime")
            };
            let recent = fs::read(storage.join("recent.json"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default();
            let recovery = fs::read(storage.join("recovery.json"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default();
            app.manage(Host {
                arduino: Arduino::new(runtime, storage.clone()),
                storage,
                session: Mutex::new(Session {
                    project: None,
                    recent,
                    recovery,
                }),
                operation: Mutex::new(()),
                monitor: Mutex::new(None),
            });
            app.set_menu(menu(app.handle())?)?;
            Ok(())
        })
        .on_page_load(|webview, page| {
            if webview.label() != "main" || page.event() != tauri::webview::PageLoadEvent::Finished
            {
                return;
            }
            let window = webview.window();
            if matches!(window.is_visible(), Ok(false)) {
                if let Err(error) = window.show() {
                    eprintln!("Не вдалося показати вікно: {error}");
                }
            }
            // On macOS, showing the window can restore AppKit's default button positions.
            // Applying the existing title asks Tao to reapply the configured traffic-light inset.
            #[cfg(target_os = "macos")]
            if let Err(error) = window.title().and_then(|title| window.set_title(&title)) {
                eprintln!("Не вдалося оновити заголовок вікна: {error}");
            }
        })
        .on_menu_event(|app, event| emit(app, "shortcut", json!(event.id().as_ref())))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                emit(window.app_handle(), "shortcut", json!("window"));
            }
        })
        .invoke_handler(tauri::generate_handler![pinway])
        .build(tauri::generate_context!())
        .expect("Не вдалося запустити Pinway IDE");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested {
            api, code: None, ..
        } = event
        {
            if app.get_webview_window("main").is_some() {
                api.prevent_exit();
                emit(app, "shortcut", json!("quit"));
            }
        }
    });
}
