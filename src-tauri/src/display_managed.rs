use crate::projects::{atomic_write,err,Result};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::BTreeMap,fs,path::{Path,PathBuf}};
pub type Files=BTreeMap<String,String>;
fn hash(text:&str)->String {format!("{:x}",Sha256::digest(text.as_bytes()))}
fn safe(root:&Path,rel:&str,dir:bool)->Result<PathBuf>{
 let path=root.join(rel);
 match fs::symlink_metadata(&path){
  Ok(meta)if meta.file_type().is_symlink()||(dir&&!meta.is_dir())||(!dir&&!meta.is_file())=>return Err(format!("Небезпечний або несумісний шлях {}",path.display())),
  Err(e)if e.kind()!=std::io::ErrorKind::NotFound=>return Err(err(e)),_=>{}
 }
 Ok(path)
}
fn dirs(root:&Path)->Result<()> {for rel in [".pinway","src","src/pinway_display"] {let p=safe(root,rel,true)?;if !p.exists(){fs::create_dir(p).map_err(err)?;}}Ok(())}
fn load(root:&Path,rel:&str)->Result<Value>{let p=safe(root,rel,false)?;if !p.exists(){return Ok(Value::Null);}serde_json::from_slice(&fs::read(p).map_err(err)?).map_err(err)}
// All paths are produced by our generator, not supplied by a project document.
fn checked(root:&Path,name:&str)->Result<PathBuf>{
 if !name.starts_with("src/pinway_display/")||name[19..].contains('/')||name.contains("..") {return Err("Некоректний generated path.".into());}
 safe(root,name,false)
}
fn difference(current:&str,next:&str)->String {
 let old:Vec<_>=current.lines().collect();let new:Vec<_>=next.lines().collect();let mut first=0;
 while first<old.len().min(new.len())&&old[first]==new[first]{first+=1;}
 let mut tail=0;while tail<old.len().min(new.len()).saturating_sub(first)&&old[old.len()-1-tail]==new[new.len()-1-tail]{tail+=1;}
 let mut out=format!("--- Поточний файл\n+++ Запропонований Pinway\n@@ рядок {} @@\n",first+1);
 for line in old[first..old.len()-tail].iter().take(150){out.push_str(&format!("-{}\n",line));}
 for line in new[first..new.len()-tail].iter().take(150){out.push_str(&format!("+{}\n",line));}
 if old.len().saturating_sub(tail+first)>150||new.len().saturating_sub(tail+first)>150{out.push_str("… показано перші 150 змінених рядків кожної версії.\n");}out
}
pub fn sync(root:&Path,files:&Files)->Result<Vec<Value>> {
 dirs(root)?;
 let manifest=load(root,".pinway/display-generated.json")?;
 if !manifest.is_null()&&manifest["format"]!="pinway.generated-display/1" {return Err("Невідомий manifest згенерованих файлів Display.".into());}
 let pending=load(root,".pinway/display-pending.json")?;
 let mut conflicts=Vec::new();
 for (name,next) in files {
  let path=checked(root,name)?;
  if !path.exists(){continue;}
  let current=fs::read_to_string(&path).map_err(err)?;let actual=hash(&current);
  if current==*next {continue;}
  let owned=manifest["files"][name].as_str()==Some(&actual)||pending["next"][name].as_str()==Some(&actual);
  if !owned {conflicts.push(json!({"file":name,"diff":difference(&current,next),"current":current.chars().take(30000).collect::<String>(),"proposed":next.chars().take(30000).collect::<String>()}));}
 }
 if !conflicts.is_empty(){return Ok(conflicts);}
 let hashes:Value=serde_json::to_value(files.iter().map(|(n,s)|(n.clone(),hash(s))).collect::<BTreeMap<_,_>>()).map_err(err)?;
 let journal=safe(root,".pinway/display-pending.json",false)?;
 atomic_write(&journal,&serde_json::to_vec(&json!({"next":hashes})).map_err(err)?,journal.exists())?;
 for(name,text)in files {
  let path=checked(root,name)?;
  if fs::read_to_string(&path).ok().as_deref()!=Some(text.as_str()){atomic_write(&path,text.as_bytes(),path.exists())?;}
 }
 let path=safe(root,".pinway/display-generated.json",false)?;
 atomic_write(&path,&serde_json::to_vec_pretty(&json!({"format":"pinway.generated-display/1","profile":"waveshare169","files":hashes})).map_err(err)?,path.exists())?;
 fs::remove_file(journal).map_err(err)?;
 Ok(vec![])
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn preserves_manual_files_and_accepts_owned_updates(){
  let t=tempfile::tempdir().unwrap();let files=Files::from([("src/pinway_display/hardware.h".into(),"first".into())]);
  assert!(sync(t.path(),&files).unwrap().is_empty());let next=Files::from([("src/pinway_display/hardware.h".into(),"next".into())]);assert!(sync(t.path(),&next).unwrap().is_empty());
  fs::write(t.path().join("src/pinway_display/hardware.h"),"manual").unwrap();assert_eq!(sync(t.path(),&files).unwrap().len(),1);assert_eq!(fs::read_to_string(t.path().join("src/pinway_display/hardware.h")).unwrap(),"manual");
 }
 #[test]fn refuses_unknown_existing_file(){let t=tempfile::tempdir().unwrap();dirs(t.path()).unwrap();fs::write(t.path().join("src/pinway_display/hardware.h"),"user").unwrap();assert_eq!(sync(t.path(),&Files::from([("src/pinway_display/hardware.h".into(),"generated".into())])).unwrap().len(),1);}
 #[cfg(unix)]#[test]fn rejects_symlink_output(){let t=tempfile::tempdir().unwrap();let outside=tempfile::tempdir().unwrap();std::os::unix::fs::symlink(outside.path(),t.path().join("src")).unwrap();assert!(sync(t.path(),&Files::new()).is_err());}
}
