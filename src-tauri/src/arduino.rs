use crate::{
    emit,
    projects::{err, Result},
};
use command_group::{CommandGroup, GroupChild};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

pub struct Arduino {
    runtime: PathBuf,
    storage: PathBuf,
    data: PathBuf,
    ready: Mutex<bool>,
}

pub struct Output {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

pub struct Monitor {
    pub port: String,
    pub child: Mutex<GroupChild>,
    input: Mutex<std::process::ChildStdin>,
}

impl Monitor {
    pub fn stop(&self) {
        let mut child = self.child.lock().unwrap();
        if child.try_wait().ok().flatten().is_none() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    pub fn write(&self, text: &str) -> Result<()> {
        self.input
            .lock()
            .unwrap()
            .write_all(text.as_bytes())
            .map_err(err)
    }
}

fn text(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}

pub fn profiles() -> Value {
    json!([
        {"id":"arduino:avr:uno","name":"Arduino Uno R3","chip":"ATmega328P"},
        {"id":"arduino:avr:nano","name":"Arduino Nano","chip":"ATmega328P"},
        {"id":"esp32:esp32:esp32","name":"ESP32 Dev Module","chip":"ESP32"},
        {"id":"esp32:esp32:esp32c3","name":"ESP32C3 Dev Module","chip":"ESP32-C3"}
    ])
}

pub fn supported(id: &str) -> bool {
    let Some((platform, board)) = id.rsplit_once(':') else {
        return false;
    };
    matches!(platform, "arduino:avr" | "esp32:esp32")
        && !board.is_empty()
        && board
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
}

fn usb_profile<'a>(vid: &str, matches: &'a [Value]) -> Option<&'a Value> {
    let vid = vid.to_ascii_lowercase();
    // These USB interfaces identify the bridge or chip family, regardless of the catalog match.
    if ["10c4", "1a86", "0403", "067b", "303a"].contains(&vid.trim_start_matches("0x")) {
        return None;
    }
    match matches {
        [board] => Some(board),
        _ => None,
    }
}

pub fn board_arguments(board: &str, options: &Value) -> Result<Vec<String>> {
    if !supported(board) {
        return Err("Виберіть профіль плати.".into());
    }
    let mut args = vec!["--fqbn".into(), board.into()];
    if let Some(options) = options.as_object() {
        for (key, value) in options {
            let value = text(value);
            let valid = |s: &str, dot: bool| {
                !s.is_empty()
                    && s.bytes().all(|c| {
                        c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-') || (dot && c == b'.')
                    })
            };
            if !valid(key, false) || !valid(value, true) {
                return Err("Неправильний параметр плати.".into());
            }
            args.extend(["--board-options".into(), format!("{key}={value}")]);
        }
    }
    Ok(args)
}

// Decode split UTF-8 sequences as one character while streaming serial output.
fn read_stream(
    mut reader: impl Read,
    app: Option<AppHandle>,
    channel: &'static str,
    limit: usize,
) -> String {
    let mut result = String::new();
    let mut pending = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = reader.read(&mut buffer).unwrap_or(0);
        pending.extend_from_slice(&buffer[..count]);
        let split = match std::str::from_utf8(&pending) {
            Err(error) if error.error_len().is_none() && count > 0 => error.valid_up_to(),
            _ => pending.len(),
        };
        if split > 0 {
            let decoded = String::from_utf8_lossy(&pending[..split]);
            if let Some(app) = &app {
                emit(app, channel, json!(decoded));
            }
            result.push_str(&decoded);
            if result.len() > limit {
                let mut start = result.len() - limit;
                while !result.is_char_boundary(start) {
                    start += 1;
                }
                result.drain(..start);
            }
            pending.drain(..split);
        }
        if count == 0 {
            return result;
        }
    }
}

impl Arduino {
    pub fn new(runtime: PathBuf, storage: PathBuf) -> Self {
        Self {
            runtime,
            data: storage.join("arduino-1.5.1-avr-1.8.8-esp-3.3.12"),
            storage,
            ready: Mutex::new(false),
        }
    }

    pub fn prepare(&self) -> Result<()> {
        let mut ready = self.ready.lock().unwrap();
        if *ready {
            return Ok(());
        }
        if !self.cli().is_file() {
            return Err("Arduino CLI не знайдено. Підготуйте комплект інструментів.".into());
        }
        fs::create_dir_all(self.storage.join("Sketchbook")).map_err(err)?;
        if !self.data.join("packages").is_dir() {
            let stage = tempfile::tempdir_in(&self.storage).map_err(err)?;
            let out = stage.path().join("data");
            fs::create_dir(&out).map_err(err)?;
            let seed = self.runtime.join("seed");
            if !seed.join("packages").is_dir() {
                return Err("У комплекті немає пакетів Arduino.".into());
            }
            #[cfg(target_os = "macos")]
            {
                let mut seed_contents = seed.into_os_string();
                seed_contents.push("/.");
                let copy = Command::new("/bin/cp")
                    .args(["-cR"])
                    .arg(seed_contents)
                    .arg(&out)
                    .output()
                    .map_err(err)?;
                if !copy.status.success() {
                    return Err(String::from_utf8_lossy(&copy.stderr).into_owned());
                }
            }
            #[cfg(not(target_os = "macos"))]
            crate::projects::copy_tree(&seed, &out, false)?;
            fs::rename(&out, &self.data).map_err(err)?;
        }
        *ready = true;
        Ok(())
    }

    fn cli(&self) -> PathBuf {
        self.runtime.join(if cfg!(windows) {
            "arduino-cli.exe"
        } else {
            "arduino-cli"
        })
    }

    fn command(&self) -> Command {
        let mut cmd = Command::new(self.cli());
        for (name, _) in std::env::vars_os() {
            if name.to_string_lossy().starts_with("ARDUINO_") {
                cmd.env_remove(name);
            }
        }
        cmd.env("ARDUINO_DIRECTORIES_DATA", &self.data)
            .env("ARDUINO_DIRECTORIES_USER", self.storage.join("Sketchbook"))
            .env(
                "ARDUINO_DIRECTORIES_DOWNLOADS",
                self.storage.join("downloads"),
            )
            .env("ARDUINO_BUILD_CACHE_PATH", self.storage.join("build-cache"))
            .env(
                "ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS",
                "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
            )
            .env("ARDUINO_UPDATER_ENABLE_NOTIFICATION", "false")
            .env("LC_ALL", "en_US.UTF-8");
        cmd
    }

    pub fn run(&self, args: &[String], timeout: u64, app: Option<AppHandle>) -> Result<Output> {
        self.prepare()?;
        run_command(self.command().args(args), timeout, app)
    }

    pub fn json(&self, args: &[&str]) -> Result<Value> {
        let args: Vec<_> = args
            .iter()
            .chain(std::iter::once(&"--json"))
            .map(|s| s.to_string())
            .collect();
        let out = self.run(&args, 25, None)?;
        if !out.ok {
            return Err(message(&out));
        }
        serde_json::from_str(&out.stdout).map_err(err)
    }

    pub fn ports(&self) -> Result<Vec<Value>> {
        let available = self.json(&["board", "list"])?;
        let mut ports = Vec::new();
        for item in array(&available["detected_ports"]) {
            let port = &item["port"];
            let addr = text(&port["address"]);
            #[cfg(target_os = "macos")]
            if !addr.starts_with("/dev/cu.") || !Path::new(addr).exists() {
                continue;
            }
            if addr.is_empty()
                || text(&port["protocol"]) != "serial"
                || addr.contains("Bluetooth")
                || addr.contains("debug-console")
            {
                continue;
            }
            let props = &port["properties"];
            let vid = text(&props["vid"]);
            let pid = text(&props["pid"]);
            let matches: Vec<_> = array(&item["matching_boards"])
                .iter()
                .filter(|v| supported(text(&v["fqbn"])))
                .map(|v| json!({"id":v["fqbn"],"name":v["name"]}))
                .collect();
            let board = usb_profile(vid, &matches);
            ports.push(json!({"address":addr,"label":port["label"],"usb":!vid.is_empty() || board.is_some(),
                "key": format!("{addr}|{vid}|{pid}|{}", text(&props["serialNumber"])), "board":board}));
        }
        ports.sort_by(|a, b| text(&a["address"]).cmp(text(&b["address"])));
        Ok(ports)
    }

    pub fn probe(&self, port: &Value, app: &AppHandle) -> Result<Value> {
        if let Some(board) = port.get("board").filter(|board| board.is_object()) {
            let chip = array(&profiles())
                .iter()
                .find(|p| p["id"] == board["id"])
                .map(|p| p["chip"].clone())
                .unwrap_or(json!(""));
            return Ok(json!({"board":board,"chip":chip}));
        }
        let name = if cfg!(windows) {
            "esptool.exe"
        } else {
            "esptool"
        };
        let tool = self
            .data
            .join("packages/esp32/tools/esptool_py/5.3.1")
            .join(name);
        let out = run_command(
            Command::new(tool).args([
                "--port",
                text(&port["address"]),
                "--baud",
                "115200",
                "--connect-attempts",
                "2",
                "--no-stub",
                "read-mac",
            ]),
            16,
            Some(app.clone()),
        )?;
        let body = format!("{}\n{}", out.stdout, out.stderr);
        let pattern = regex::Regex::new(r"(?i)(?:Chip(?: type)?\s*(?:is\s+|:\s*)|Connected to )(ESP32(?:-[A-Z][A-Z0-9]*)?(?:-[A-Z0-9]+)?)").unwrap();
        let mut chip = pattern
            .captures(&body)
            .map(|m| m[1].to_ascii_uppercase())
            .unwrap_or_default();
        if ["D0WD", "S0WD", "U4WDH", "PICO", "D2WD"]
            .iter()
            .any(|id| chip.starts_with(&format!("ESP32-{id}")))
        {
            chip = "ESP32".into();
        }
        Ok(json!({"board":null,"chip":chip}))
    }

    pub fn monitor(&self, port: &str, baud: u64, app: &AppHandle) -> Result<Arc<Monitor>> {
        self.prepare()?;
        let mut child = self
            .command()
            .args([
                "monitor",
                "--port",
                port,
                "--config",
                &format!("baudrate={baud}"),
                "--quiet",
                "--raw",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .group_spawn()
            .map_err(err)?;
        let stdout = child.inner().stdout.take().unwrap();
        let stderr = child.inner().stderr.take().unwrap();
        let first = app.clone();
        let second = app.clone();
        thread::spawn(move || read_stream(stdout, Some(first), "serial", 8192));
        thread::spawn(move || read_stream(stderr, Some(second), "serial", 8192));
        let input = child.inner().stdin.take().unwrap();
        Ok(Arc::new(Monitor {
            port: port.into(),
            child: Mutex::new(child),
            input: Mutex::new(input),
        }))
    }
}

pub fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or_default()
}
pub fn message(output: &Output) -> String {
    if !output.stderr.trim().is_empty() {
        output.stderr.trim().into()
    } else if !output.stdout.trim().is_empty() {
        output.stdout.trim().into()
    } else {
        "Arduino CLI не завершив операцію.".into()
    }
}

fn run_command(cmd: &mut Command, seconds: u64, app: Option<AppHandle>) -> Result<Output> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .group_spawn()
        .map_err(err)?;
    let stdout = child.inner().stdout.take().unwrap();
    let stderr = child.inner().stderr.take().unwrap();
    let mirror = app.clone();
    let stdout = thread::spawn(move || read_stream(stdout, app, "console", 80 * 1024 * 1024));
    let stderr = thread::spawn(move || read_stream(stderr, mirror, "console", 8 * 1024 * 1024));
    let start = Instant::now();
    let status = loop {
        if let Some(exit) = child.try_wait().map_err(err)? {
            break Some(exit);
        }
        if start.elapsed() > Duration::from_secs(seconds) {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        thread::sleep(Duration::from_millis(50));
    };
    let stdout = stdout.join().unwrap_or_default();
    let mut stderr = stderr.join().unwrap_or_default();
    if status.is_none() {
        stderr.push_str("\nЧас очікування вичерпано.\n");
    }
    Ok(Output {
        ok: status.is_some_and(|status| status.success()),
        stdout,
        stderr,
    })
}

pub fn watch_monitor(app: AppHandle, monitor: Arc<Monitor>) {
    thread::spawn(move || {
        let result = loop {
            let state = monitor.child.lock().unwrap().try_wait();
            match state {
                Ok(None) => thread::sleep(Duration::from_millis(150)),
                other => break other,
            }
        };
        let host = app.state::<crate::Host>();
        let mut active = host.monitor.lock().unwrap();
        if active
            .as_ref()
            .is_some_and(|active| Arc::ptr_eq(active, &monitor))
        {
            *active = None;
            if !result.is_ok_and(|status| status.is_some_and(|status| status.success())) {
                emit(&app, "serial", json!("\nНе вдалося відкрити або прочитати порт. Перевірте, чи він підключений і вільний.\n"));
            }
            emit(&app, "monitor", Value::Null);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usb_catalog_match_requires_an_unambiguous_board_specific_interface() {
        let uno = json!({"id": "arduino:avr:uno", "name": "Arduino Uno R3"});
        let bridge_match = json!({"id": "esp32:esp32:ozobot_drvkit", "name": "Ozobot DRVKit"});
        assert_eq!(
            usb_profile("0x2341", std::slice::from_ref(&uno)),
            Some(&uno)
        );
        for vid in ["0X303A", "10c4", "1a86", "0403", "067b"] {
            assert_eq!(usb_profile(vid, std::slice::from_ref(&bridge_match)), None);
        }
        assert_eq!(usb_profile("2341", &[uno, bridge_match]), None);
    }
}
