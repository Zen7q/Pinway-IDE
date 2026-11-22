use crate::{display_managed::Files,projects::{err,Result}};
use serde_json::{json,Value};
use std::{fs,path::Path};
const PREFIX:&str="src/pinway_display/";
fn integer(v:&Value,lo:i64,hi:i64)->Result<i64>{v.as_i64().filter(|n|*n>=lo&&*n<=hi).ok_or("Некоректне число Display.".into())}
fn geometry(v:&Value)->Result<[i64;4]>{let a=[integer(&v["x"],0,239)?,integer(&v["y"],0,279)?,integer(&v["width"],1,240)?,integer(&v["height"],1,280)?];if a[0]+a[2]>240||a[1]+a[3]>280{return Err("Touch-елемент виходить за межі дисплея.".into());}Ok(a)}
pub fn pins(h:&Value)->Result<String>{
 if h["profile"]!="waveshare169"{return Err("Невідомий апаратний профіль Display.".into());}
 let mut source=include_str!("../display-templates/waveshare169/hardware.h").to_owned();let mut used=std::collections::HashSet::new();
 for key in ["LCD_MOSI","LCD_CLK","LCD_CS","LCD_DC","LCD_RST","LCD_BL","TOUCH_SDA","TOUCH_SCL","TOUCH_RST","TOUCH_IRQ"]{
  let pin=integer(&h["pins"][key],0,39)?;
  if ![0,2,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33].contains(&pin)&&!(key=="TOUCH_IRQ"&&[34,35,36,39].contains(&pin)){return Err(format!("{key}: GPIO{pin} недоступний на ESP32 Dev Module."));}
  if !used.insert(pin){return Err(format!("GPIO{pin} призначено кільком контактам дисплея."));}
  let re=regex::Regex::new(&format!(r"constexpr uint8_t {key} = \d+;")).map_err(err)?;
  source=re.replace(&source,format!("constexpr uint8_t {key} = {pin};")).into_owned();
 }
 Ok(source)
}
pub fn generate(doc:&Value,s:&Value)->Result<Files>{
 let mut files=Files::new();files.insert(format!("{PREFIX}hardware.h"),pins(&doc["hardware"])?);
 for(name,text)in [
 ("display_ui.cpp",include_str!("../display-templates/waveshare169/display_ui.cpp")),
 ("display_ui.h",include_str!("../display-templates/waveshare169/display_ui.h")),
 ("touch.cpp",include_str!("../display-templates/waveshare169/touch.cpp")),
 ("touch.h",include_str!("../display-templates/waveshare169/touch.h")),
 ("touch_button.h",include_str!("../display-templates/waveshare169/touch_button.h")),
 ("THIRD_PARTY.md",include_str!("../display-templates/waveshare169/THIRD_PARTY.md"))]{files.insert(format!("{PREFIX}{name}"),text.into());}
 let min=integer(&s["min"],-100000,100000)?;let max=integer(&s["max"],min,min+256)?;let states=(max-min+1)as usize;
 integer(&s["initial"],min,max)?;
 if !["static","variable","gpio"].contains(&s["mode"].as_str().unwrap_or("")){return Err("Невідомий режим Display.".into());}
 let pages=s["pages"].as_array().filter(|p|!p.is_empty()&&p.len()<=40).ok_or("Відсутні сторінки Display.")?;
 let source_pages=doc["pages"].as_array().ok_or("Відсутній макет сторінок.")?;
 if pages.len()!=source_pages.len(){return Err("Макет сторінок змінився.".into());}
 let mut bases=String::new();let mut patches=String::new();let mut frames=String::new();let mut sliders=String::new();let mut buttons=String::new();let mut records=String::new();
 let(mut nb,mut np,mut nf,mut ns,mut na)=(0usize,0usize,0usize,0usize,0usize);
 for(index,p)in pages.iter().enumerate(){
  if p["id"]!=source_pages[index]["id"]{return Err("Порядок сторінок змінився.".into());}
  let base=p["base"].as_array().filter(|p|p.len()<=67200).ok_or("Відсутній кадр сторінки.")?;let mut pixels=0;
  for run in base{let n=integer(&run[0],1,65535)?;let c=integer(&run[1],0,65535)?;pixels+=n;bases.push_str(&format!("{{{n},{c}}},\n"));}
  if pixels!=67200{return Err("Неповний кадр сторінки.".into());}
  let patch_frames=p["patches"].as_array().filter(|p|p.len()==states||p.len()==1).ok_or("Відсутні стани сторінки.")?;
  for value in 0..states{
   let changes=patch_frames[if patch_frames.len()==1{0}else{value}].as_array().ok_or("Невідомі графічні зміни.")?;
   let first=np;
   for r in changes{
    let i=integer(&r[0],0,67199)?;let n=integer(&r[1],1,65535)?;let c=integer(&r[2],0,65535)?;
    if i+n>67200{return Err("Графічна зміна за межами екрана.".into());}
    patches.push_str(&format!("{{{i},{n},{c}}},\n"));np+=1;
    if np>85000{return Err("Забагато динамічної графіки для ESP32.".into());}
   }
   frames.push_str(&format!("{{{first},{}}},\n",np-first));
  }
  let ps=p["sliders"].as_array().filter(|p|p.len()<=200).ok_or("Некоректні повзунки.")?;
  for v in ps{let g=geometry(v)?;sliders.push_str(&format!("{{{},{},{},{}}},\n",g[0],g[1],g[2],g[3]));}
  let actions=p["buttons"].as_array().filter(|p|p.len()<=200).ok_or("Некоректні кнопки.")?;
  for v in actions{let g=geometry(v)?;let kind=integer(&v["kind"],1,3)?;let target=integer(&v["target"],0,if kind==1{pages.len()as i64-1}else{1})?;buttons.push_str(&format!("{{{},{},{},{},{kind},{target}}},\n",g[0],g[1],g[2],g[3]));}
  records.push_str(&format!("{{{nb},{},{nf},{ns},{},{na},{}}},\n",base.len(),ps.len(),actions.len()));
  nb+=base.len();nf+=states;ns+=ps.len();na+=actions.len();
  if nb*4+np*8+nf*8+ns*16+na*24>850000{return Err("Графіка дисплея перевищує бюджет Flash ESP32.".into());}
 }
 if np==0{patches.push_str("{0,1,0},\n");}if ns==0{sliders.push_str("{0,0,0,0},\n");}if na==0{buttons.push_str("{0,0,0,0,1,0},\n");}
 let header=format!("// Generated by Pinway Display.\n#pragma once\n#include <stdint.h>\nnamespace PinwayScene {{\nconstexpr int MINIMUM={min},MAXIMUM={max};\nstruct Run{{uint16_t count,color;}};\nstruct Patch{{uint32_t index;uint16_t count,color;}};\nstruct Frame{{uint32_t first,count;}};\nstruct Slider{{int x,y,w,h;}};\nstruct Button{{int x,y,w,h,kind,target;}};\nstruct Page{{uint32_t baseFirst,baseCount,frameFirst,sliderFirst,sliderCount,buttonFirst,buttonCount;}};\nconstexpr Run bases[]={{\n{bases}}};\nconstexpr Patch patches[]={{\n{patches}}};\nconstexpr Frame frames[]={{\n{frames}}};\nconstexpr Slider sliders[]={{\n{sliders}}};\nconstexpr Button buttons[]={{\n{buttons}}};\nconstexpr Page pages[]={{\n{records}}};\n}}\n");
 files.insert(format!("{PREFIX}scene_data.h"),header);
 files.insert(format!("{PREFIX}runtime.cpp"),include_str!("display_scene.cpp.in").into());
 files.insert(format!("{PREFIX}runtime.h"),"#pragma once\nvoid pinwayDisplaySetup();\nvoid pinwayDisplayTick();\nvoid pinwayDisplayDelay(unsigned long duration);\n".into());
 let first=&pages[0]["base"];
 files.insert(format!("{PREFIX}display_frames.h"),crate::display_firmware::frames_header(&json!({"off":first,"on":first}))?);
 files.insert(format!("{PREFIX}README.md"),"# Pinway Display — Waveshare 1.69″\n\nЦі файли створено з макета та контактів Display. Code залишається твоїм; Pinway додає виклики запуску/тачу в копію для компіляції. Звичайні delay() в головному .ino обслуговують дисплей під час очікування.\n\nРучні зміни захищено .pinway/display-generated.json. При конфлікті Pinway покаже різницю та зупинить збірку без перезапису. Змінюй графіку та контакти в Display.\n".into());
 Ok(files)
}
// Mask comments and quoted literals without changing byte offsets used for edits.
fn mask(code:&str)->String{
 let bytes=code.as_bytes();let mut out=bytes.to_vec();let mut i=0;
 while i<bytes.len(){
  let start=i;
  if bytes[i..].starts_with(b"R\"") {
   let rest=&code[i+2..];
   if let Some(open)=rest.find('(').filter(|n|*n<=16){let close=format!("){}\"",&rest[..open]);if let Some(end)=rest[open+1..].find(&close){i=i+2+open+1+end+close.len();}else{i=bytes.len();}}else{i+=2;}
  }
  else if bytes[i..].starts_with(b"//"){while i<bytes.len()&&bytes[i]!=b'\n'{i+=1;}}
  else if bytes[i..].starts_with(b"/*"){i+=2;while i+1<bytes.len()&&!bytes[i..].starts_with(b"*/"){i+=1;}i=(i+2).min(bytes.len());}
  else if bytes[i]==b'"'||bytes[i]==b'\''{let quote=bytes[i];i+=1;while i<bytes.len(){if bytes[i]==b'\\'{i=(i+2).min(bytes.len());continue;}let end=bytes[i]==quote;i+=1;if end{break;}}}
  else{i+=1;continue;}
  for b in &mut out[start..i]{if *b!=b'\n'{*b=b' ';}}
 }
 String::from_utf8(out).unwrap_or_default()
}
pub fn entry(code:&str,s:&Value)->Result<String>{
 if s["code"].as_str()!=Some(code){return Err("Code змінився під час генерації. Повтори збірку.".into());}
 let clean=mask(code);let mut edits=Vec::new();
 for f in ["setup","loop"]{
  let re=regex::Regex::new(&format!(r"\bvoid\s+({f})\s*\(\s*(?:void\s*)?\)\s*\{{")).map_err(err)?;
  let matches:Vec<_>=re.captures_iter(&clean).filter(|c|clean.as_bytes()[..c.get(0).unwrap().start()].iter().fold(0i32,|depth,b|depth+if *b==b'{'{1}else if *b==b'}'{-1}else{0})==0).collect();if matches.len()!=1{return Err(format!("Потрібна однозначна void {f}() у головному скетчі."));}
  let m=matches[0].get(1).unwrap();edits.push((m.start(),m.end(),format!("pinwayUser_{f}")));
 }
 let delays=regex::Regex::new(r"\b(delay)\s*\(").unwrap();
 for m in delays.captures_iter(&clean){let m=m.get(1).unwrap();if !clean[..m.start()].trim_end().ends_with(['.',':','>']){edits.push((m.start(),m.end(),"pinwayDisplayDelay".into()));}}
 let mut result=code.to_owned();edits.sort_by_key(|e|e.0);for(start,end,text)in edits.into_iter().rev(){result.replace_range(start..end,&text);}
 let bridge=match s["mode"].as_str(){
  Some("variable")=>{
   let v=&s["variable"];let name=v["name"].as_str().filter(|s|regex::Regex::new(r"^[A-Za-z_]\w{0,62}$").unwrap().is_match(s)).ok_or("Некоректна змінна Code.")?;
   let write=if v["readonly"].as_bool().unwrap_or(false){"(void)value;".to_owned()}else{format!("{name}=value;")};
   format!("int pinwaySceneRead(){{return int(lround(double({name})));}}\nvoid pinwaySceneWrite(int value){{{write}}}\nvoid pinwaySceneInitialize(){{}}\n")
  },
  Some("gpio")=>{let pin=integer(&s["gpio"],0,33)?;format!("static int pinwayGpioValue=0;\nint pinwaySceneRead(){{return pinwayGpioValue;}}\nvoid pinwaySceneWrite(int value){{pinwayGpioValue=!!value;digitalWrite({pin},value?HIGH:LOW);}}\nvoid pinwaySceneInitialize(){{pinMode({pin},OUTPUT);digitalWrite({pin},LOW);}}\n")},
  Some("static")=>"int pinwaySceneRead(){return 0;}\nvoid pinwaySceneWrite(int){}\nvoid pinwaySceneInitialize(){}\n".into(),
  _=>return Err("Невідомий режим Display.".into())
 };
 Ok(format!("#include <Arduino.h>\n#include <math.h>\n#include \"src/pinway_display/runtime.h\"\n{result}\n// Pinway entry hooks, generated only in the build copy.\n{bridge}\nvoid setup(){{pinwayUser_setup();pinwaySceneInitialize();pinwayDisplaySetup();}}\nvoid loop(){{pinwayDisplayTick();pinwayUser_loop();pinwayDisplayTick();}}\n"))
}
pub fn stage_entry(staged:&Path,s:&Value)->Result<()>{let file=staged.join(format!("{}.ino",staged.file_name().unwrap().to_string_lossy()));let code=fs::read_to_string(&file).map_err(err)?;fs::write(file,entry(&code,s)?).map_err(err)}

#[cfg(test)]mod tests{
 use super::*;
 fn hardware()->Value{json!({"profile":"waveshare169","pins":{"LCD_MOSI":23,"LCD_CLK":18,"LCD_CS":27,"LCD_DC":26,"LCD_RST":25,"LCD_BL":32,"TOUCH_SDA":21,"TOUCH_SCL":22,"TOUCH_RST":33,"TOUCH_IRQ":13}})}
 #[test]fn validates_model_pins_and_keeps_comments_out_of_hooks(){
  let mut h=hardware();assert!(pins(&h).unwrap().contains("LCD_CS = 27"));h["pins"]["LCD_CS"]=json!(21);assert!(pins(&h).is_err());h["pins"]["LCD_CS"]=json!(6);assert!(pins(&h).is_err());
  let code="int brightness=190;\nconst char* s=R\"tag(void setup(){ delay(3); } \" quote)tag\";\n// void loop(){}\nvoid setup(){}\nvoid loop(){delay(1000);}\n";
  let scene=json!({"mode":"variable","variable":{"name":"brightness"},"code":code});let result=entry(code,&scene).unwrap();assert!(result.contains("pinwayDisplayDelay(1000)"));assert!(result.contains("R\"tag(void setup(){ delay(3); } \" quote)tag\""));assert!(result.contains("brightness=value;"));
 }
 #[test]fn generates_fresh_project_with_no_example_files(){
  let temp=tempfile::tempdir().unwrap();let folder=std::env::var_os("PINWAY_SCENE_FIXTURE").map(std::path::PathBuf::from).unwrap_or_else(||temp.path().join("SceneCheck"));fs::create_dir_all(&folder).unwrap();
  let code="const int ledPin=14;\nint brightness=190;\nvoid setup(){ledcAttach(ledPin,5000,8);}\nvoid loop(){ledcWrite(ledPin,brightness);delay(1000);}\n";
  let base=json!([[65535,0],[1665,0]]);
  let scene=json!({"mode":"variable","variable":{"name":"brightness"},"min":0,"max":255,"initial":190,"code":code,"pages":[{"id":"home","base":base,"patches":[[]],"sliders":[],"buttons":[{"x":20,"y":100,"width":200,"height":60,"kind":1,"target":1}]},{"id":"control","base":base,"patches":[[]],"sliders":[{"x":20,"y":120,"width":200,"height":48}],"buttons":[]}]});
  let doc=json!({"hardware":hardware(),"pages":[{"id":"home"},{"id":"control"}]});
  let files=generate(&doc,&scene).unwrap();assert!(crate::display_managed::sync(&folder,&files).unwrap().is_empty());
  assert!(fs::read_to_string(folder.join("src/pinway_display/display_ui.cpp")).unwrap().contains("namespace PinwayHardware"));
  let output=entry(code,&scene).unwrap();assert!(output.contains("pinwayDisplayDelay(1000)"));fs::write(folder.join(format!("{}.ino",folder.file_name().unwrap().to_string_lossy())),output).unwrap();
 }
}
