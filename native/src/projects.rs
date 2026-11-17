use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::LazyLock,
};
use tempfile::NamedTempFile;

pub type Result<T> = std::result::Result<T, String>;
pub fn err<T: ToString>(error: T) -> String {
    error.to_string()
}
static SKETCH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$").unwrap());
static DIAGNOSTIC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(.+?):(\d+)(?::(\d+))?: (fatal error|error|warning): (.*)$").unwrap()
});

#[derive(Clone, Serialize, Deserialize)]
pub struct Project {
    pub root: PathBuf,
    pub primary: PathBuf,
    pub selected: PathBuf,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: PathBuf,
    pub folder: bool,
    pub editable: bool,
}

fn ignored(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "build" | "dist")
}

fn extension(path: &Path) -> String {
    path.extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase()
}

fn editable(path: &Path) -> bool {
    matches!(
        extension(path).as_str(),
        "ino"
            | "pde"
            | "cpp"
            | "cc"
            | "cxx"
            | "c"
            | "h"
            | "hh"
            | "hpp"
            | "s"
            | "asm"
            | "txt"
            | "md"
            | "json"
            | "yaml"
            | "yml"
            | "csv"
            | "properties"
            | "ini"
            | "ld"
            | "py"
            | "sh"
    )
}

pub fn entries(root: &Path) -> Result<Vec<Entry>> {
    let mut result = Vec::new();
    for entry in fs::read_dir(root).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = entry.file_type().map_err(err)?;
        if !ignored(&name) && (kind.is_dir() || kind.is_file()) {
            let path = entry.path();
            result.push(Entry {
                name,
                editable: editable(&path),
                path,
                folder: kind.is_dir(),
            });
        }
    }
    result.sort_by(|a, b| {
        b.folder
            .cmp(&a.folder)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(result)
}

pub fn files(root: &Path) -> Result<Vec<Value>> {
    fn walk(root: &Path, folder: &Path, result: &mut Vec<Value>) -> Result<()> {
        for entry in entries(folder)? {
            if entry.folder {
                walk(root, &entry.path, result)?;
            } else if entry.editable {
                result.push(json!({"name":entry.name,"file":entry.path,"relative":entry.path.strip_prefix(root).map_err(err)?}));
            }
        }
        Ok(())
    }
    let mut result = Vec::new();
    walk(root, root, &mut result)?;
    Ok(result)
}

pub fn open(file: &Path) -> Result<Project> {
    let selected = fs::canonicalize(file).map_err(err)?;
    if extension(&selected) != "ino" || !selected.is_file() {
        return Err("Виберіть файл .ino.".into());
    }
    let root = selected
        .parent()
        .ok_or("Папка скетчу недоступна.")?
        .to_path_buf();
    let candidate = root.join(format!(
        "{}.ino",
        root.file_name().unwrap_or_default().to_string_lossy()
    ));
    let primary = if fs::symlink_metadata(&candidate).is_ok_and(|m| m.is_file()) {
        candidate
    } else {
        selected.clone()
    };
    let name = primary
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(Project {
        root,
        primary,
        selected,
        name,
    })
}

pub fn create(parent: &Path, name: &str, code: &str) -> Result<Project> {
    if !SKETCH.is_match(name) || name.ends_with('.') {
        return Err("Назва скетчу має містити до 63 латинських літер, цифр, крапок, дефісів або підкреслень.".into());
    }
    let dir = parent.join(name);
    fs::create_dir(&dir).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            "У цій папці вже є проєкт з такою назвою.".into()
        } else {
            err(e)
        }
    })?;
    let file = dir.join(format!("{name}.ino"));
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file)
        .and_then(|mut output| output.write_all(code.as_bytes()))
        .map_err(err)?;
    open(&file)
}

pub fn checked(project: &Project, file: &Path, directory: bool) -> Result<PathBuf> {
    let actual = fs::canonicalize(file).map_err(err)?;
    if !actual.starts_with(&project.root) {
        return Err("Шлях за межами проєкту.".into());
    }
    let info = fs::metadata(&actual).map_err(err)?;
    if (directory && !info.is_dir()) || (!directory && (!info.is_file() || !editable(&actual))) {
        return Err("Цей тип файлу не підтримується редактором.".into());
    }
    if !directory && info.len() > 4 * 1024 * 1024 {
        return Err("Файл перевищує 4 МБ.".into());
    }
    Ok(actual)
}

pub fn create_entry(project: &Project, parent: &Path, name: &str, folder: bool) -> Result<Value> {
    if name.trim().is_empty()
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
        || ignored(name)
    {
        return Err("Введіть видиму назву без роздільників шляху.".into());
    }
    let destination = checked(project, parent, true)?.join(name);
    let result = if folder {
        fs::create_dir(&destination)
    } else {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
            .map(|_| ())
    };
    result.map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            "У цій папці вже є елемент з такою назвою.".into()
        } else {
            err(e)
        }
    })?;
    Ok(json!({"path":destination,"editable":!folder && editable(&destination)}))
}

pub fn atomic_write(file: &Path, bytes: &[u8], preserve_permissions: bool) -> Result<()> {
    let mut staged =
        NamedTempFile::new_in(file.parent().ok_or("Папка файлу недоступна.")?).map_err(err)?;
    if preserve_permissions {
        staged
            .as_file()
            .set_permissions(fs::metadata(file).map_err(err)?.permissions())
            .map_err(err)?;
    }
    staged.write_all(bytes).map_err(err)?;
    staged.as_file().sync_all().map_err(err)?;
    staged.persist(file).map_err(err)?;
    Ok(())
}

pub fn copy_tree(source: &Path, dest: &Path, skip_hidden: bool) -> Result<()> {
    fs::create_dir_all(dest).map_err(err)?;
    for item in fs::read_dir(source).map_err(err)? {
        let item = item.map_err(err)?;
        let name = item.file_name();
        if skip_hidden && ignored(&name.to_string_lossy()) {
            continue;
        }
        let kind = item.file_type().map_err(err)?;
        if kind.is_dir() {
            copy_tree(&item.path(), &dest.join(name), skip_hidden)?;
        } else if kind.is_file() {
            fs::copy(item.path(), dest.join(name)).map_err(err)?;
        } else if kind.is_symlink() && !skip_hidden {
            let target = fs::read_link(item.path()).map_err(err)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(target, dest.join(name)).map_err(err)?;
            #[cfg(windows)]
            if item.path().is_dir() {
                std::os::windows::fs::symlink_dir(target, dest.join(name)).map_err(err)?;
            } else {
                std::os::windows::fs::symlink_file(target, dest.join(name)).map_err(err)?;
            }
        }
    }
    Ok(())
}

pub struct BuildInput {
    pub directory: PathBuf,
    staged_primary: Option<PathBuf>,
}

pub fn stage(project: &Project, workspace: &Path) -> Result<BuildInput> {
    let folder = project
        .root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    if SKETCH.is_match(&folder) && project.primary == project.root.join(format!("{folder}.ino")) {
        return Ok(BuildInput {
            directory: project.root.clone(),
            staged_primary: None,
        });
    }
    let mut name: String = project
        .name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || "_-.".contains(c) {
                c
            } else {
                '_'
            }
        })
        .take(62)
        .collect();
    if name.is_empty() || !name.starts_with(|c: char| c.is_ascii_alphanumeric() || c == '_') {
        name.insert(0, '_');
    }
    let all = entries(&project.root)?;
    let base: String = name.chars().take(52).collect();
    let mut index = 1;
    while all.iter().any(|entry| {
        entry.path != project.primary && entry.name.eq_ignore_ascii_case(&format!("{name}.ino"))
    }) {
        name = format!("{base}_{index}");
        index += 1;
    }
    let directory = workspace.join(&name);
    fs::create_dir(&directory).map_err(err)?;
    let staged_primary = directory.join(format!("{name}.ino"));
    fs::copy(&project.primary, &staged_primary).map_err(err)?;
    for entry in all {
        if entry.path == project.primary {
            continue;
        }
        let target = directory.join(entry.name.as_str());
        if entry.folder && entry.name == "src" {
            copy_tree(&entry.path, &target, true)?;
        } else if !entry.folder
            && matches!(
                extension(&entry.path).as_str(),
                "ino"
                    | "pde"
                    | "c"
                    | "cc"
                    | "cpp"
                    | "cxx"
                    | "s"
                    | "h"
                    | "hh"
                    | "hpp"
                    | "csv"
                    | "ld"
                    | "yaml"
                    | "yml"
            )
        {
            fs::copy(entry.path, target).map_err(err)?;
        }
    }
    Ok(BuildInput {
        directory,
        staged_primary: Some(staged_primary),
    })
}

pub fn diagnostics(log: &str, project: &Project, input: &BuildInput) -> Vec<Value> {
    let mut seen = std::collections::HashSet::new();
    log.lines().filter_map(|line| {
        let m = DIAGNOSTIC.captures(line)?;
        let candidate = input.directory.join(&m[1]);
        let candidate = fs::canonicalize(&candidate).unwrap_or(candidate);
        let file = if input.staged_primary.as_ref() == Some(&candidate) { project.primary.clone() }
        else if input.staged_primary.is_some() && candidate.starts_with(&input.directory) {
            project.root.join(candidate.strip_prefix(&input.directory).ok()?)
        } else { candidate };
        if !file.starts_with(&project.root) { return None; }
        let row: u32 = m[2].parse().ok()?;
        let column = m.get(3).and_then(|value| value.as_str().parse::<u32>().ok()).unwrap_or(1);
        let severity = if &m[4] == "warning" { "warning" } else { "error" };
        let key = (file.clone(), row, column, severity, m[5].to_string());
        seen.insert(key).then(|| json!({"file":file,"line":row,"column":column,"severity":severity,"message": &m[5]}))
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SKETCH_SOURCE: &str = "void setup() {}\nvoid loop() {}\n";

    #[test]
    fn create_keeps_existing_sketches_and_rejects_invalid_names() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let sketch = create(&root, "Blink", SKETCH_SOURCE).unwrap();
        assert_eq!(sketch.primary, root.join("Blink/Blink.ino"));
        assert_eq!(fs::read_to_string(&sketch.primary).unwrap(), SKETCH_SOURCE);
        assert!(create(&root, "Blink", "replacement").is_err());
        assert_eq!(fs::read_to_string(&sketch.primary).unwrap(), SKETCH_SOURCE);
        assert!(create(&root, "../outside", SKETCH_SOURCE).is_err());
    }

    #[test]
    fn stages_noncanonical_sketch_and_maps_diagnostics() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let folder = root.join("Моя папка");
        let primary = folder.join("different name.ino");
        fs::create_dir_all(folder.join("src")).unwrap();
        fs::write(folder.join("src/pin.h"), "#pragma once").unwrap();
        fs::write(&primary, SKETCH_SOURCE).unwrap();
        let sketch = open(&primary).unwrap();
        let staged = stage(&sketch, &root).unwrap();
        let normalized = staged.directory.join("different_name.ino");
        assert_eq!(fs::read_to_string(&normalized).unwrap(), SKETCH_SOURCE);
        assert_eq!(
            fs::read_to_string(staged.directory.join("src/pin.h")).unwrap(),
            "#pragma once"
        );
        let log = format!(
            "{}:7:3: error: wrong\nnot a diagnostic",
            normalized.display()
        );
        assert_eq!(
            diagnostics(&log, &sketch, &staged),
            [json!({
                "file": primary, "line": 7, "column": 3, "severity": "error", "message": "wrong"
            })]
        );
    }

    #[test]
    fn opening_secondary_file_keeps_primary_sketch() {
        let temp = tempfile::tempdir().unwrap();
        let sketch = create(temp.path(), "Test", SKETCH_SOURCE).unwrap();
        let extra = sketch.root.join("Extra.ino");
        fs::write(&extra, "").unwrap();
        let opened = open(&extra).unwrap();
        assert_eq!(opened.primary, sketch.primary);
        assert_eq!(opened.selected, extra);
    }

    #[cfg(unix)]
    #[test]
    fn project_tree_and_editor_exclude_links_outside_the_project() {
        let temp = tempfile::tempdir().unwrap();
        let sketch = create(temp.path(), "Test", SKETCH_SOURCE).unwrap();
        let outside = temp.path().join("outside.h");
        let link = sketch.root.join("link.h");
        fs::write(&outside, "").unwrap();
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        assert!(!entries(&sketch.root)
            .unwrap()
            .iter()
            .any(|entry| entry.path == link));
        assert!(checked(&sketch, &link, false).is_err());
    }
}
