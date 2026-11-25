use crate::{arduino::Arduino, projects::{self, err, Result}, releases};
use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}};

pub fn directory(storage: &Path, id: &str) -> Result<PathBuf> {
    if !matches!(id, "build" | "display") { return Err("Невідомий пакет вкладки.".into()); }
    Ok(storage.join("modules").join(releases::VERSION).join(id))
}

pub fn installed(storage: &Path, id: &str) -> bool {
    directory(storage, id).is_ok_and(|p| p.join("workspace.js").is_file() && p.join("installed.json").is_file())
}

pub fn state(storage: &Path, arduino: &Arduino) -> Result<Value> {
    arduino.prepare()?;
    let setup = fs::read(storage.join("setup.json")).ok()
        .and_then(|v| serde_json::from_slice::<Value>(&v).ok()).unwrap_or(Value::Null);
    Ok(json!({"version":releases::VERSION,"versionLabel":releases::VERSION_LABEL,"onboarded":setup["complete"] == true,
        "packs":[
            {"id":"arduino","name":"Arduino AVR","description":"Uno, Nano, Mega та інші AVR-плати","installed":true,"required":true},
            {"id":"esp32","name":"ESP32","description":"ESP32, C3, S3 та інші плати Espressif · близько 6,4 ГБ на диску","installed":arduino.has_esp(),"required":false},
            {"id":"build","name":"Pinway Build","description":"Схеми, макетні плати та PCB","installed":installed(storage,"build"),"required":false},
            {"id":"display","name":"Pinway Display","description":"Редактор інтерфейсів і бібліотеки дисплеїв · близько 271 МБ на диску","installed":installed(storage,"display"),"required":false}
        ]}))
}

pub fn module(storage: &Path, id: &str) -> Result<Value> {
    let path = directory(storage, id)?;
    if !installed(storage, id) { return Err("Спочатку встановіть пакет вкладки.".into()); }
    Ok(json!({"javascript":fs::read_to_string(path.join("workspace.js")).map_err(err)?,
        "css":fs::read_to_string(path.join("workspace.css")).map_err(err)?}))
}

fn extract(archive: &Path, destination: &Path) -> Result<()> {
    let mut zip = zip::ZipArchive::new(fs::File::open(archive).map_err(err)?).map_err(err)?;
    let mut total = 0u64;
    if zip.len() > 30000 { return Err("У пакеті забагато файлів.".into()); }
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(err)?;
        let relative = entry.enclosed_name().ok_or("Небезпечний шлях у пакеті.")?;
        if entry.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err("Посилання у пакетах не підтримуються.".into());
        }
        total = total.checked_add(entry.size()).ok_or("Завеликий пакет.")?;
        if total > 512 * 1024 * 1024 { return Err("Розпакований пакет перевищує 512 МБ.".into()); }
        let target = destination.join(relative);
        if entry.is_dir() { fs::create_dir_all(target).map_err(err)?; continue; }
        fs::create_dir_all(target.parent().ok_or("Некоректний шлях.")?).map_err(err)?;
        let mut file = fs::File::create(target).map_err(err)?;
        std::io::copy(&mut entry, &mut file).map_err(err)?;
    }
    Ok(())
}

pub fn install(storage: &Path, id: &str, mut progress: impl FnMut(u64, u64)) -> Result<()> {
    let target = directory(storage, id)?;
    if installed(storage, id) { return Ok(()); }
    let manifest = releases::read_json(&releases::asset_url(releases::VERSION, "pinway-packs.json")?)?;
    if manifest["version"] != releases::VERSION { return Err("Пакет належить іншій версії IDE.".into()); }
    let entry = &manifest["packs"][id];
    let name = entry["file"].as_str().ok_or("Пакет ще не опубліковано для цієї версії.")?;
    let parent = target.parent().ok_or("Некоректний каталог пакетів.")?;
    fs::create_dir_all(parent).map_err(err)?;
    let staging = tempfile::tempdir_in(parent).map_err(err)?;
    let archive = staging.path().join("download.zip");
    releases::download(&releases::asset_url(releases::VERSION, name)?, &archive, entry, &mut progress)?;
    let content = staging.path().join("content");
    fs::create_dir(&content).map_err(err)?;
    extract(&archive, &content)?;
    if !content.join("workspace.js").is_file() || !content.join("workspace.css").is_file()
        || (id == "display" && !content.join("libraries/manifest.json").is_file()) {
        return Err("Пакет неповний. Повторіть установлення.".into());
    }
    projects::atomic_write(&content.join("installed.json"), &serde_json::to_vec(entry).map_err(err)?, false)?;
    if target.exists() { fs::remove_dir_all(&target).map_err(err)?; }
    fs::rename(content, target).map_err(err)?;
    Ok(())
}

pub fn remove(storage: &Path, id: &str) -> Result<()> {
    let path = directory(storage, id)?;
    if path.exists() { fs::remove_dir_all(path).map_err(err)?; }
    Ok(())
}

pub fn finish_setup(storage: &Path) -> Result<()> {
    projects::atomic_write(&storage.join("setup.json"), b"{\"complete\":true}", false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;
    use std::io::Write;
    #[test]
    fn unknown_packages_cannot_escape_storage() {
        for id in ["..", "../display", "esp32", "", "code"] { assert!(directory(Path::new("/tmp"), id).is_err()); }
    }
    #[test]
    fn extraction_rejects_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("test.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        zip.start_file("../outside", SimpleFileOptions::default()).unwrap();
        zip.write_all(b"bad").unwrap(); zip.finish().unwrap();
        let destination = temp.path().join("stage"); fs::create_dir(&destination).unwrap();
        assert!(extract(&archive, &destination).is_err());
        assert!(!temp.path().join("outside").exists());
    }
    #[test]
    fn setup_is_persisted_atomically() {
        let temp = tempfile::tempdir().unwrap(); finish_setup(temp.path()).unwrap();
        let value: Value = serde_json::from_slice(&fs::read(temp.path().join("setup.json")).unwrap()).unwrap();
        assert_eq!(value["complete"], true);
    }
}
