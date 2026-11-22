//! Project-owned Display documents. No hardware or code generation runs here.
use crate::projects::{self, err, Result};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};
const MAX_BYTES: u64 = 8 * 1024 * 1024;
fn location(root: &Path, create: bool) -> Result<PathBuf> {
    let dir = root.join(".pinway");
    match fs::symlink_metadata(&dir) {
        Ok(m) if m.file_type().is_symlink() || !m.is_dir() => {
            return Err("Папка .pinway має бути звичайною папкою.".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if create {
                fs::create_dir(&dir).map_err(err)?;
            }
        }
        Err(e) => return Err(err(e)),
    }
    let file = dir.join("display.json");
    match fs::symlink_metadata(&file) {
        Ok(m) if m.file_type().is_symlink() || !m.is_file() || m.len() > MAX_BYTES => {
            return Err("Некоректний файл Display або розмір понад 8 МБ.".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(err(e)),
    }
    Ok(file)
}
pub fn load(root: &Path) -> Result<Value> {
    let file = location(root, false)?;
    if !file.exists() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&fs::read(file).map_err(err)?).map_err(err)
}
pub fn save(root: &Path, doc: &Value, base: &Value) -> Result<()> {
    if doc["format"] != "pinway.display/1"
        || !doc["pages"]
            .as_array()
            .is_some_and(|p| !p.is_empty() && p.len() <= 40)
    {
        return Err("Непідтримуваний документ Display.".into());
    }
    let bytes = serde_json::to_vec_pretty(doc).map_err(err)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Display перевищує 8 МБ. Зменште зображення.".into());
    }
    if &load(root)? != base {
        return Err("Display змінено на диску іншим процесом. Ваші зміни залишились у редакторі. Збережіть їх через «Експорт документа», потім повторно відкрийте проєкт і порівняйте версії.".into());
    }
    let file = location(root, true)?;
    projects::atomic_write(&file, &bytes, file.exists())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn isolated_roundtrip_and_external_conflict() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let doc = json!({"format":"pinway.display/1","pages":[{"id":"one"}]});
        save(a.path(), &doc, &Value::Null).unwrap();
        assert_eq!(load(a.path()).unwrap(), doc);
        assert!(load(b.path()).unwrap().is_null());
        assert!(save(a.path(), &doc, &Value::Null).is_err());
        save(a.path(), &doc, &doc).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_folder_and_file() {
        use std::os::unix::fs::symlink;
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        symlink(b.path(), a.path().join(".pinway")).unwrap();
        assert!(load(a.path()).is_err());
        let c = tempfile::tempdir().unwrap();
        fs::create_dir(c.path().join(".pinway")).unwrap();
        fs::write(b.path().join("data"), "{}").unwrap();
        symlink(b.path().join("data"), c.path().join(".pinway/display.json")).unwrap();
        assert!(load(c.path()).is_err());
    }
}
