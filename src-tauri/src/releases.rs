use crate::projects::{err, Result};
use reqwest::blocking::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}, time::Duration};

pub const REPOSITORY: &str = "Zen7q/Pinway-IDE";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn client() -> Result<Client> {
    Client::builder().user_agent(concat!("Pinway-IDE/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(1200)).build().map_err(err)
}

pub fn read_json(url: &str) -> Result<Value> {
    let response = client()?.get(url).timeout(Duration::from_secs(25)).send()
        .map_err(err)?.error_for_status().map_err(err)?;
    let bytes = response.take(2 * 1024 * 1024).bytes().collect::<std::io::Result<Vec<_>>>().map_err(err)?;
    serde_json::from_slice(&bytes).map_err(err)
}

pub fn asset_url(version: &str, name: &str) -> Result<String> {
    semver::Version::parse(version).map_err(err)?;
    if name.is_empty() || !name.bytes().all(|c| c.is_ascii_alphanumeric() || b".-_".contains(&c)) {
        return Err("Некоректне ім’я пакета.".into());
    }
    Ok(format!("https://github.com/{REPOSITORY}/releases/download/v{version}/{name}"))
}

pub fn download(url: &str, destination: &Path, expected: &Value, mut progress: impl FnMut(u64, u64)) -> Result<()> {
    let hash = expected["sha256"].as_str().filter(|h| h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or("У пакета відсутня контрольна сума.")?;
    let size = expected["bytes"].as_u64().filter(|s| *s > 0 && *s <= 1024 * 1024 * 1024)
        .ok_or("Некоректний розмір пакета.")?;
    let mut response = client()?.get(url).send().map_err(err)?.error_for_status().map_err(err)?;
    let parent = destination.parent().ok_or("Некоректний шлях завантаження.")?;
    fs::create_dir_all(parent).map_err(err)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    let mut digest = Sha256::new();
    let mut total = 0;
    let mut last_report = std::time::Instant::now();
    let mut buffer = [0u8; 65536];
    loop {
        let count = response.read(&mut buffer).map_err(err)?;
        if count == 0 { break; }
        total += count as u64;
        if total > size { return Err("Розмір завантаження перевищує заявлений.".into()); }
        temporary.write_all(&buffer[..count]).map_err(err)?;
        digest.update(&buffer[..count]);
        if last_report.elapsed() >= Duration::from_millis(250) {
            progress(total, size);
            last_report = std::time::Instant::now();
        }
    }
    if total != size || format!("{:x}", digest.finalize()) != hash.to_lowercase() {
        return Err("Пакет пошкоджено. Контрольна сума не збігається. Повторіть завантаження.".into());
    }
    temporary.as_file().sync_all().map_err(err)?;
    temporary.persist(destination).map_err(err)?;
    progress(total, size);
    Ok(())
}

fn newest_release(releases: &[Value], current: &semver::Version) -> Option<semver::Version> {
    releases.iter().filter(|release| release["draft"] != true)
        .filter_map(|release| semver::Version::parse(release["tag_name"].as_str()?.trim_start_matches('v')).ok())
        .filter(|candidate| !current.pre.is_empty() || candidate.pre.is_empty())
        .max()
}

pub fn latest() -> Result<Value> {
    let current = semver::Version::parse(VERSION).map_err(err)?;
    let endpoint = if current.pre.is_empty() { "releases/latest" } else { "releases?per_page=100" };
    let url = format!("https://api.github.com/repos/{REPOSITORY}/{endpoint}");
    let response = client()?.get(url).timeout(Duration::from_secs(20)).send().map_err(err)?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(json!({"current":VERSION,"available":false,"published":false}));
    }
    let release: Value = response.error_for_status().map_err(err)?.json().map_err(err)?;
    let entries = release.as_array().cloned().unwrap_or_else(|| vec![release]);
    match newest_release(&entries, &current) {
        Some(candidate) => Ok(json!({"current":VERSION,"version":candidate.to_string(),
            "available":candidate > current,"published":true})),
        None => Ok(json!({"current":VERSION,"available":false,"published":false})),
    }
}

pub fn installer(storage: &Path, mut progress: impl FnMut(u64, u64)) -> Result<PathBuf> {
    let release = latest()?;
    if release["available"] != true { return Err("Нової версії поки немає.".into()); }
    let version = release["version"].as_str().ok_or("Некоректна версія.")?;
    let manifest = read_json(&asset_url(version, "pinway-release.json")?)?;
    if manifest["version"] != version { return Err("Версії релізу не збігаються.".into()); }
    let target = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let entry = &manifest["installers"][&target];
    let name = entry["file"].as_str().ok_or("Інсталятор для цієї платформи ще не опублікований.")?;
    let path = storage.join("updates").join(version).join(name);
    download(&asset_url(version, name)?, &path, entry, &mut progress)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prerelease_updates_follow_the_installed_channel() {
        let entries = vec![json!({"tag_name":"v0.3.2-alpha.2"}), json!({"tag_name":"v0.3.2-alpha.10"}),
            json!({"tag_name":"v0.3.1"}), json!({"tag_name":"invalid"}), json!({"tag_name":"v9.0.0","draft":true})];
        let stable = semver::Version::parse("0.3.1").unwrap();
        let alpha = semver::Version::parse("0.3.2-alpha").unwrap();
        assert_eq!(newest_release(&entries, &stable).unwrap().to_string(), "0.3.1");
        assert_eq!(newest_release(&entries, &alpha).unwrap().to_string(), "0.3.2-alpha.10");
        let stable_release = vec![json!({"tag_name":"v0.3.2"}), entries[0].clone()];
        assert_eq!(newest_release(&stable_release, &alpha).unwrap().to_string(), "0.3.2");
    }

    #[test]
    fn downloads_verify_checksums_before_replacing_existing_files() {
        use std::net::TcpListener;
        for valid in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0u8; 2048];
                stream.read(&mut request).unwrap();
                stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nnew").unwrap();
            });
            let temp = tempfile::tempdir().unwrap();
            let target = temp.path().join("installer");
            fs::write(&target, b"old").unwrap();
            let digest = if valid { format!("{:x}", Sha256::digest(b"new")) } else { "0".repeat(64) };
            let result = download(&format!("http://{address}/asset"), &target,
                &json!({"bytes":3,"sha256":digest}), |_, _| {});
            server.join().unwrap();
            assert_eq!(result.is_ok(), valid);
            assert_eq!(fs::read(&target).unwrap(), if valid { b"new" } else { b"old" });
            assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
        }
    }

    #[test]
    fn assets_stay_in_versioned_project_release() {
        assert!(asset_url("0.3.0", "pinway-display.zip").unwrap().starts_with("https://github.com/Zen7q/Pinway-IDE/releases/download/v0.3.0/"));
        for name in ["../a", "a/b", "https://example.com", "", "a?b"] {
            assert!(asset_url("0.3.0", name).is_err());
        }
        assert!(asset_url("../../main", "a.zip").is_err());
    }
}
