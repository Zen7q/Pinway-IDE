//! Pinway Build documents and native file dialogs.
use crate::{err, pick, projects, text, Result};
use serde_json::{json, Value};
use std::{collections::HashSet, fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct Access(Mutex<HashSet<PathBuf>>);

fn validate_document(content: &str) -> Result<()> {
    if content.is_empty() || content.len() > 8_000_000 {
        return Err("The circuit document must be smaller than 8 MB.".into());
    }
    let document: Value = serde_json::from_str(content).map_err(err)?;
    if document["format"] != "pinway-build"
        || document["version"] != 1
        || document["parts"]
            .as_array()
            .is_none_or(|parts| parts.len() > 300)
        || document["connections"]
            .as_array()
            .is_none_or(|connections| connections.len() > 2000)
    {
        return Err("This is not a Pinway Build document.".into());
    }
    Ok(())
}

pub fn dispatch(app: &AppHandle, action: &str, payload: &Value) -> Result<Value> {
    let storage = app
        .state::<crate::Host>()
        .storage
        .join("build-workspace.json");
    let access = app.state::<Access>();
    if action == "buildRestore" {
        if !storage.exists() {
            return Ok(Value::Null);
        }
        let draft: Value =
            serde_json::from_slice(&fs::read(&storage).map_err(err)?).map_err(err)?;
        validate_document(text(&draft["content"]))?;
        // A recovered path is a hint. Saving requires a native dialog again.
        return Ok(json!({"content":draft["content"],"path":Value::Null}));
    }
    if action == "buildOpen" {
        let selected = pick(
            app.dialog()
                .file()
                .add_filter("Pinway Build", &["pinwaybuild"])
                .blocking_pick_file(),
        )?;
        let Some(path) = selected else {
            return Ok(Value::Null);
        };
        let path = fs::canonicalize(path).map_err(err)?;
        if fs::metadata(&path).map_err(err)?.len() > 8_000_000 {
            return Err("The circuit file is too large.".into());
        }
        let content = fs::read_to_string(&path).map_err(err)?;
        validate_document(&content)?;
        access.0.lock().map_err(err)?.insert(path.clone());
        return Ok(json!({"path":path,"content":content}));
    }
    let content = text(&payload["content"]);
    if action == "buildDraft" {
        validate_document(content)?;
        projects::atomic_write(&storage, &serde_json::to_vec(payload).map_err(err)?, false)?;
        return Ok(Value::Null);
    }
    let export = action == "buildExport";
    if export {
        if content.len() > 16_000_000 || !content.starts_with("<svg ") {
            return Err("Invalid SVG image.".into());
        }
    } else {
        validate_document(content)?;
        let candidate = PathBuf::from(text(&payload["path"]));
        if access.0.lock().map_err(err)?.contains(&candidate) {
            projects::atomic_write(&candidate, content.as_bytes(), true)?;
            return Ok(json!(candidate));
        }
    }
    let name: String = text(&payload["name"])
        .chars()
        .filter(|character| !character.is_control() && !"/\\:*?\"<>|".contains(*character))
        .take(100)
        .collect();
    let name = if name.trim().is_empty() {
        "Circuit"
    } else {
        name.trim()
    };
    let extension = if export { "svg" } else { "pinwaybuild" };
    let selected = pick(
        app.dialog()
            .file()
            .add_filter(
                if export { "SVG image" } else { "Pinway Build" },
                &[extension],
            )
            .set_file_name(format!("{name}.{extension}"))
            .blocking_save_file(),
    )?;
    let Some(mut path) = selected else {
        return Ok(Value::Null);
    };
    if path.extension().is_none() {
        path.set_extension(extension);
    }
    projects::atomic_write(&path, content.as_bytes(), path.exists())?;
    let path = fs::canonicalize(path).map_err(err)?;
    if !export {
        access.0.lock().map_err(err)?.insert(path.clone());
    }
    Ok(json!(path))
}
