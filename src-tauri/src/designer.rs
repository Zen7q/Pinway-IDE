//! Circuit documents, part definitions and electrical connectivity for Pinway Build.
use crate::{err, pick, projects, text, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::PathBuf,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const MODES: [&str; 3] = ["breadboard", "schematic", "pcb"];
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Pose {
    pub x: f64,
    pub y: f64,
    pub angle: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Terminal {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub bus: String,
}
#[derive(Clone, Serialize)]
pub struct Shape {
    pub width: f64,
    pub height: f64,
    pub terminals: Vec<Terminal>,
}
#[derive(Clone, Serialize)]
pub struct Definition {
    pub kind: String,
    pub title: String,
    pub group: String,
    pub prefix: String,
    pub shapes: BTreeMap<String, Shape>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Part {
    pub uid: String,
    pub kind: String,
    pub label: String,
    pub value: f64,
    pub tint: String,
    pub poses: BTreeMap<String, Pose>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Contact {
    pub part: String,
    pub pin: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Link {
    pub uid: String,
    pub a: Contact,
    pub b: Contact,
    pub tint: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Route {
    pub points: BTreeMap<String, Vec<Point>>,
    pub copper: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Circuit {
    pub format: String,
    pub board: Point,
    pub parts: Vec<Part>,
    pub links: Vec<Link>,
    pub routing: BTreeMap<String, Route>,
}

fn pin(id: impl Into<String>, x: f64, y: f64, bus: impl Into<String>) -> Terminal {
    Terminal {
        id: id.into(),
        x,
        y,
        bus: bus.into(),
    }
}
pub fn library() -> Vec<Definition> {
    let mut definitions = Vec::new();
    for (kind, title, group, prefix, w, h) in [
        (
            "breadboard",
            "Half-size breadboard",
            "Prototyping",
            "BB",
            330.,
            180.,
        ),
        ("uno", "Arduino Uno", "Development boards", "U", 230., 170.),
        (
            "esp32",
            "ESP32 DevKit",
            "Development boards",
            "U",
            100.,
            210.,
        ),
        ("resistor", "Resistor", "Passive", "R", 80., 20.),
        ("led", "LED · 5 mm", "Indicators", "D", 40., 50.),
        ("button", "Tactile switch", "Switches", "SW", 40., 40.),
        ("battery", "9V battery", "Power", "BT", 70., 120.),
        ("capacitor", "Ceramic capacitor", "Passive", "C", 40., 50.),
        ("sensor", "Temperature sensor", "Sensors", "J", 60., 80.),
    ] {
        let mut shapes = BTreeMap::new();
        for mode in MODES {
            let (width, height) = if mode == "schematic" {
                match kind {
                    "uno" => (180., 170.),
                    "esp32" => (100., 210.),
                    "breadboard" => (0., 0.),
                    _ => (80., 60.),
                }
            } else {
                (w, h)
            };
            let mut terminals = Vec::new();
            match kind {
                "breadboard" if mode == "breadboard" => {
                    for col in 0..30 {
                        for row in 0..10 {
                            terminals.push(pin(
                                format!("{}{}", (b'a' + row as u8) as char, col + 1),
                                20. + col as f64 * 10.,
                                30. + row as f64 * 10. + if row >= 5 { 20. } else { 0. },
                                format!("{}:{col}", row / 5),
                            ));
                        }
                        for rail in 0..2 {
                            terminals.push(pin(
                                format!("rail{rail}:{col}"),
                                20. + col as f64 * 10.,
                                if rail == 0 { 10. } else { 170. },
                                format!("rail{rail}"),
                            ));
                        }
                    }
                }
                "breadboard" => (),
                "uno" => {
                    for n in 0..14 {
                        terminals.push(pin(format!("D{n}"), 20. + n as f64 * 10., 10., ""));
                    }
                    for (n, id) in [
                        "VIN", "5V", "3V3", "GND", "A0", "A1", "A2", "A3", "A4", "A5",
                    ]
                    .iter()
                    .enumerate()
                    {
                        terminals.push(pin(*id, 20. + n as f64 * 10., height - 10., ""));
                    }
                }
                "esp32" => {
                    for (n, id) in [
                        "3V3", "EN", "VP", "VN", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26",
                        "IO27", "IO14", "IO12", "GND", "VIN", "GND2", "IO23", "IO22", "TX", "RX",
                        "IO21", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO2", "IO15",
                        "3V3_2",
                    ]
                    .iter()
                    .enumerate()
                    {
                        let bus = if id.starts_with("GND") {
                            "ground"
                        } else if id.starts_with("3V3") {
                            "3v3"
                        } else {
                            ""
                        };
                        terminals.push(pin(
                            *id,
                            if n < 15 { 10. } else { width - 10. },
                            20. + (n % 15) as f64 * 10.,
                            bus,
                        ));
                    }
                }
                "button" => {
                    terminals = vec![
                        pin("1", 0., 10., "left"),
                        pin("2", width, 10., "right"),
                        pin("3", 0., height - 10., "left"),
                        pin("4", width, height - 10., "right"),
                    ];
                }
                "sensor" => {
                    for (n, id) in ["VCC", "DATA", "GND"].iter().enumerate() {
                        terminals.push(pin(*id, 20. + n as f64 * 10., height, ""));
                    }
                }
                _ => {
                    let ids = match kind {
                        "led" => ["A", "K"],
                        "battery" => ["+", "−"],
                        _ => ["1", "2"],
                    };
                    for (n, id) in ids.iter().enumerate() {
                        let (x, y) = if kind == "resistor" || mode == "schematic" {
                            (n as f64 * width, height / 2.)
                        } else {
                            (10. + n as f64 * 20., height)
                        };
                        terminals.push(pin(*id, x, y, ""));
                    }
                }
            }
            shapes.insert(
                mode.into(),
                Shape {
                    width,
                    height,
                    terminals,
                },
            );
        }
        definitions.push(Definition {
            kind: kind.into(),
            title: title.into(),
            group: group.into(),
            prefix: prefix.into(),
            shapes,
        });
    }
    definitions
}
pub fn position(part: &Part, terminal: &Terminal, mode: &str, shape: &Shape) -> Point {
    let pose = &part.poses[mode];
    let angle = (pose.angle as f64).to_radians();
    let x = terminal.x - shape.width / 2.;
    let y = terminal.y - shape.height / 2.;
    Point {
        x: pose.x + shape.width / 2. + x * angle.cos() - y * angle.sin(),
        y: pose.y + shape.height / 2. + x * angle.sin() + y * angle.cos(),
    }
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 90
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
}
fn valid_color(color: &str) -> bool {
    color.len() == 7 && color.starts_with('#') && color[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
fn finite(n: f64) -> bool {
    n.is_finite() && n.abs() <= 50000.
}
pub fn validate(c: &Circuit) -> Result<()> {
    let fail = || Err("Invalid Pinway circuit document.".into());
    if c.format != "pinway.design/1"
        || c.parts.len() > 300
        || c.links.len() > 1500
        || !(100. ..=2000.).contains(&c.board.x)
        || !(100. ..=2000.).contains(&c.board.y)
    {
        return fail();
    }
    let defs = library();
    let mut ids = HashSet::new();
    for p in &c.parts {
        if !valid_id(&p.uid)
            || !ids.insert(p.uid.as_str())
            || !defs.iter().any(|d| d.kind == p.kind)
            || p.label.len() > 80
            || !valid_color(&p.tint)
            || !p.value.is_finite()
            || !(0.1..=10000000.).contains(&p.value)
        {
            return fail();
        }
        for mode in MODES {
            let Some(pose) = p.poses.get(mode) else {
                return fail();
            };
            if !finite(pose.x) || !finite(pose.y) || ![0, 90, 180, 270].contains(&pose.angle) {
                return fail();
            }
        }
    }
    let valid_contact = |contact: &Contact| {
        c.parts
            .iter()
            .find(|p| p.uid == contact.part)
            .is_some_and(|p| {
                defs.iter().find(|d| d.kind == p.kind).unwrap().shapes["breadboard"]
                    .terminals
                    .iter()
                    .any(|t| t.id == contact.pin)
            })
    };
    for l in &c.links {
        if !valid_id(&l.uid)
            || !ids.insert(&l.uid)
            || !valid_contact(&l.a)
            || !valid_contact(&l.b)
            || !valid_color(&l.tint)
            || l.a == l.b
        {
            return fail();
        }
    }
    if c.routing.len() > 3000 {
        return fail();
    }
    for (key, route) in &c.routing {
        if key.len() > 400 {
            return fail();
        }
        for (mode, points) in &route.points {
            if !MODES.contains(&mode.as_str())
                || points.len() > 150
                || points.iter().any(|p| !finite(p.x) || !finite(p.y))
            {
                return fail();
            }
        }
    }
    Ok(())
}
pub fn networks(c: &Circuit) -> Vec<Vec<Contact>> {
    let defs = library();
    let mut contacts = Vec::new();
    let mut coordinates = Vec::new();
    let mut buses = HashMap::new();
    let mut unions = Vec::new();
    for part in &c.parts {
        let shape = &defs.iter().find(|d| d.kind == part.kind).unwrap().shapes["breadboard"];
        for terminal in &shape.terminals {
            let index = contacts.len();
            if !terminal.bus.is_empty() {
                let key = format!("{}/{}", part.uid, terminal.bus);
                if let Some(old) = buses.insert(key, index) {
                    unions.push((old, index));
                }
            }
            coordinates.push(position(part, terminal, "breadboard", shape));
            contacts.push(Contact {
                part: part.uid.clone(),
                pin: terminal.id.clone(),
            });
        }
    }
    // Contacts placed in exactly the same breadboard hole share a conductor.
    let mut holes: HashMap<(i64, i64), usize> = HashMap::new();
    for (i, p) in coordinates.iter().enumerate() {
        let key = ((p.x * 1000.).round() as i64, (p.y * 1000.).round() as i64);
        if let Some(other) = holes.insert(key, i) {
            unions.push((other, i));
        }
    }
    let lookup: HashMap<_, _> = contacts
        .iter()
        .enumerate()
        .map(|(i, c)| ((c.part.as_str(), c.pin.as_str()), i))
        .collect();
    for l in &c.links {
        unions.push((
            lookup[&(l.a.part.as_str(), l.a.pin.as_str())],
            lookup[&(l.b.part.as_str(), l.b.pin.as_str())],
        ));
    }
    fn root(parents: &mut [usize], mut i: usize) -> usize {
        while parents[i] != i {
            parents[i] = parents[parents[i]];
            i = parents[i];
        }
        i
    }
    let mut parents: Vec<usize> = (0..contacts.len()).collect();
    for (a, b) in unions {
        let a = root(&mut parents, a);
        let b = root(&mut parents, b);
        parents[b] = a;
    }
    let mut groups: BTreeMap<usize, Vec<Contact>> = BTreeMap::new();
    for (i, c) in contacts.into_iter().enumerate() {
        groups.entry(root(&mut parents, i)).or_default().push(c);
    }
    groups.into_values().collect()
}

fn decode(value: Value) -> Result<Circuit> {
    let c: Circuit = serde_json::from_value(value).map_err(err)?;
    validate(&c)?;
    Ok(c)
}
fn read_file(path: &std::path::Path) -> Result<Circuit> {
    if fs::metadata(path).map_err(err)?.len() > 8_000_000 {
        return Err("Circuit file exceeds 8 MB.".into());
    }
    decode(serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)?)
}
fn write_circuit(path: &std::path::Path, c: &Circuit) -> Result<()> {
    validate(c)?;
    projects::atomic_write(
        path,
        &serde_json::to_vec_pretty(c).map_err(err)?,
        path.exists(),
    )
}
// The folder comes from the active, native-authorized code project, never an arbitrary UI path.
fn project_path(root: &std::path::Path, create: bool) -> Result<PathBuf> {
    let folder = root.join(".pinway");
    match fs::symlink_metadata(&folder) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
            return Err("The project's .pinway folder must be a real directory.".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if create {
                fs::create_dir(&folder).map_err(err)?;
            }
        }
        Err(e) => return Err(err(e)),
    }
    let file = folder.join("circuit.json");
    match fs::symlink_metadata(&file) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_file() => {
            return Err("The project's circuit must be a regular file.".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(err(e)),
    }
    Ok(file)
}
fn store_project(root: &std::path::Path, circuit: &Circuit) -> Result<()> {
    validate(circuit)?;
    write_circuit(&project_path(root, true)?, circuit)
}
fn load_project(root: &std::path::Path, storage: &std::path::Path) -> Result<Option<Circuit>> {
    let file = project_path(root, false)?;
    let legacy = storage.join("designer-v1.recovery.json");
    // Bind the old, unassigned workspace to exactly one project. Writing the owner first
    // lets an interrupted migration resume in that project without importing into another.
    let migration = storage.join("designer-project-owner.json");
    let legacy_owner: Option<PathBuf> = if legacy.is_file() {
        if migration.exists() {
            Some(serde_json::from_slice(&fs::read(&migration).map_err(err)?).map_err(err)?)
        } else {
            projects::atomic_write(&migration, &serde_json::to_vec(root).map_err(err)?, false)?;
            Some(root.to_path_buf())
        }
    } else {
        None
    };
    if file.exists() {
        return read_file(&file).map(Some);
    }
    if legacy_owner.as_deref() == Some(root) {
        let circuit = read_file(&legacy)?;
        store_project(root, &circuit)?;
        return Ok(Some(circuit));
    }
    Ok(None)
}
pub fn dispatch(app: &AppHandle, p: Value) -> Result<Value> {
    let op = text(&p["op"]);
    match op {
        "library" => Ok(json!(library())),
        "inspect" => {
            let c = decode(p["circuit"].clone())?;
            Ok(json!({"nets":networks(&c)}))
        }
        "projectLoad" | "projectSave" => {
            let host = app.state::<crate::Host>();
            let project = host.project()?;
            if PathBuf::from(text(&p["root"])) != project.root {
                return Err(
                    "The active project changed. The circuit was not written to another project."
                        .into(),
                );
            }
            if op == "projectLoad" {
                Ok(json!(load_project(&project.root, &host.storage)?))
            } else {
                let circuit = decode(p["circuit"].clone())?;
                store_project(&project.root, &circuit)?;
                Ok(Value::Null)
            }
        }
        "export" => {
            let svg = text(&p["svg"]);
            if !svg.starts_with("<svg ") || svg.len() > 16_000_000 {
                return Err("Invalid circuit image.".into());
            }
            let Some(path) = pick(
                app.dialog()
                    .file()
                    .add_filter("SVG image", &["svg"])
                    .set_file_name("Circuit.svg")
                    .blocking_save_file(),
            )?
            else {
                return Ok(Value::Null);
            };
            projects::atomic_write(&path, svg.as_bytes(), path.exists())?;
            Ok(json!(path))
        }
        _ => Err("Unknown circuit operation.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    fn part(kind: &str, uid: &str, x: f64, y: f64) -> Part {
        Part {
            uid: uid.into(),
            kind: kind.into(),
            label: uid.into(),
            value: 1000.,
            tint: "#ea7466".into(),
            poses: MODES
                .into_iter()
                .map(|m| (m.into(), Pose { x, y, angle: 0 }))
                .collect(),
        }
    }
    fn circuit(parts: Vec<Part>) -> Circuit {
        Circuit {
            format: "pinway.design/1".into(),
            board: Point { x: 600., y: 400. },
            parts,
            links: vec![],
            routing: BTreeMap::new(),
        }
    }
    fn together(nets: &[Vec<Contact>], a: (&str, &str), b: (&str, &str)) -> bool {
        nets.iter().any(|n| {
            n.iter().any(|c| c.part == a.0 && c.pin == a.1)
                && n.iter().any(|c| c.part == b.0 && c.pin == b.1)
        })
    }
    #[test]
    fn breadboard_connects_five_holes_but_not_gap_or_neighbor() {
        let c = circuit(vec![part("breadboard", "bb", 0., 0.)]);
        let n = networks(&c);
        assert!(together(&n, ("bb", "a1"), ("bb", "e1")));
        assert!(!together(&n, ("bb", "a1"), ("bb", "f1")));
        assert!(!together(&n, ("bb", "a1"), ("bb", "a2")));
        assert!(together(&n, ("bb", "rail0:0"), ("bb", "rail0:29")));
    }
    #[test]
    fn inserted_contacts_disconnect_when_moved() {
        let mut c = circuit(vec![
            part("breadboard", "bb", 0., 0.),
            part("resistor", "r", 20., 20.),
        ]);
        assert!(together(&networks(&c), ("r", "1"), ("bb", "e1")));
        c.parts[1].poses.get_mut("breadboard").unwrap().x += 5.;
        assert!(!together(&networks(&c), ("r", "1"), ("bb", "e1")));
    }
    #[test]
    fn topology_survives_other_view_placement_and_rotation() {
        let mut c = circuit(vec![
            part("led", "a", 0., 0.),
            part("resistor", "b", 100., 0.),
        ]);
        c.links.push(Link {
            uid: "wire".into(),
            a: Contact {
                part: "a".into(),
                pin: "A".into(),
            },
            b: Contact {
                part: "b".into(),
                pin: "1".into(),
            },
            tint: "#123456".into(),
        });
        c.parts[0].poses.get_mut("pcb").unwrap().angle = 90;
        assert!(validate(&c).is_ok());
        assert!(together(&networks(&c), ("a", "A"), ("b", "1")));
    }
    #[test]
    fn definition_contacts_are_unique_and_button_is_not_shorted() {
        for d in library() {
            for s in d.shapes.values() {
                let ids: BTreeSet<_> = s.terminals.iter().map(|p| &p.id).collect();
                assert_eq!(ids.len(), s.terminals.len());
            }
        }
        let c = circuit(vec![part("button", "s", 0., 0.)]);
        let n = networks(&c);
        assert!(together(&n, ("s", "1"), ("s", "3")));
        assert!(!together(&n, ("s", "1"), ("s", "2")));
    }
    #[test]
    fn new_file_and_overwrite_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.pinway");
        let mut c = circuit(vec![part("led", "d", 0., 0.)]);
        write_circuit(&path, &c).unwrap();
        c.parts[0].value = 220.;
        write_circuit(&path, &c).unwrap();
        assert_eq!(read_file(&path).unwrap().parts[0].value, 220.);
        c.parts[0].tint = "javascript:alert(1)".into();
        assert!(validate(&c).is_err());
    }
    #[test]
    fn shared_projects_keep_distinct_circuits_and_migrate_legacy_once() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let storage = tempfile::tempdir().unwrap();
        let original = circuit(vec![part("led", "old", 0., 0.)]);
        let mut legacy = serde_json::to_value(&original).unwrap();
        legacy["title"] = json!("Old independent name");
        fs::write(
            storage.path().join("designer-v1.recovery.json"),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();
        let migrated = load_project(a.path(), storage.path()).unwrap().unwrap();
        assert_eq!(migrated.parts[0].uid, "old");
        assert!(load_project(b.path(), storage.path()).unwrap().is_none());
        let next = circuit(vec![part("resistor", "other", 100., 0.)]);
        store_project(b.path(), &next).unwrap();
        assert_eq!(
            load_project(a.path(), storage.path())
                .unwrap()
                .unwrap()
                .parts[0]
                .uid,
            "old"
        );
        assert_eq!(
            load_project(b.path(), storage.path())
                .unwrap()
                .unwrap()
                .parts[0]
                .uid,
            "other"
        );
        assert!(serde_json::to_value(migrated)
            .unwrap()
            .get("title")
            .is_none());
    }
    #[test]
    fn existing_project_circuit_wins_over_legacy_workspace() {
        let root = tempfile::tempdir().unwrap();
        let storage = tempfile::tempdir().unwrap();
        let current = circuit(vec![part("led", "project", 0., 0.)]);
        store_project(root.path(), &current).unwrap();
        write_circuit(
            &storage.path().join("designer-v1.recovery.json"),
            &circuit(vec![]),
        )
        .unwrap();
        assert_eq!(
            load_project(root.path(), storage.path())
                .unwrap()
                .unwrap()
                .parts[0]
                .uid,
            "project"
        );
    }
    #[test]
    #[cfg(unix)]
    fn project_storage_rejects_symlink_escapes() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(other.path(), root.path().join(".pinway")).unwrap();
        assert!(store_project(root.path(), &circuit(vec![])).is_err());
        assert!(!other.path().join("circuit.json").exists());
    }
}
