//! Supported automatic adapters. Project documents never supply C++ source or include paths.
use crate::projects::Result;
use serde_json::Value;
pub fn number(v:&Value,lo:i64,hi:i64)->Result<i64>{v.as_i64().filter(|n|*n>=lo&&*n<=hi).ok_or("Некоректне налаштування дисплея.".into())}
pub fn dimensions(h:&Value)->Result<(i64,i64)>{
 if h["profile"]=="waveshare169"{return Ok((240,280));}
 if h["profile"]!="lovyangfx"||h["library"]!="LovyanGFX"{return Err("Непідтримувана бібліотека дисплея.".into());}
 let c=&h["config"];let (mw,mh)=match c["controller"].as_str(){Some("ST7789")|Some("ILI9341")=>(240,320),Some("ST7735S")=>(132,162),Some("GC9A01")=>(240,240),_=>return Err("Непідтримуваний драйвер дисплея.".into())};
 let w=number(&c["width"],1,mw)?;let height=number(&c["height"],1,mh)?;
 if w+number(&c["offsetX"],0,mw-1)?>mw||height+number(&c["offsetY"],0,mh-1)?>mh{return Err("Дисплей виходить за пам’ять драйвера.".into());}
 let rotation=number(&c["rotation"],0,3)?;
 Ok(if rotation%2==0{(w,height)}else{(height,w)})
}
pub fn source(h:&Value)->Result<String>{
 dimensions(h)?;
 let c=&h["config"];let controller=c["controller"].as_str().unwrap();
 let touch=c["touch"].as_str().filter(|s|["none","CST816S","FT5x06","GT911","XPT2046"].contains(s)).ok_or("Невідомий контролер тачу.")?;
 let mut keys=vec!["LCD_MOSI","LCD_CLK","LCD_CS","LCD_DC","LCD_RST","LCD_BL"];
 if touch=="XPT2046"{keys.extend(["LCD_MISO","TOUCH_CS","TOUCH_IRQ"]);}else if touch!="none"{keys.extend(["TOUCH_SDA","TOUCH_SCL","TOUCH_RST","TOUCH_IRQ"]);}
 let mut pins=std::collections::HashMap::new();let mut used=std::collections::HashSet::new();
 for key in keys{
  let n=number(&h["pins"][key],-1,39)?;
  let optional=["LCD_CS","LCD_RST","LCD_BL","TOUCH_RST","TOUCH_IRQ"].contains(&key);
  if n==-1&&optional{pins.insert(key,n);continue;}
  if ![0,2,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33].contains(&n)&&!(["LCD_MISO","TOUCH_IRQ"].contains(&key)&&[34,35,36,39].contains(&n)){return Err(format!("{key}: недоступний GPIO{n}."));}
  if !used.insert(n){return Err(format!("GPIO{n} використано кілька разів."));}pins.insert(key,n);
 }
 let pin=|k|*pins.get(k).unwrap_or(&-1);
 let w=number(&c["width"],1,320)?;let height=number(&c["height"],1,320)?;let ox=number(&c["offsetX"],0,319)?;let oy=number(&c["offsetY"],0,319)?;let rotation=number(&c["rotation"],0,3)?;
 let invert=c["invert"].as_bool().ok_or("Некоректна інверсія.")?;let rgb=c["rgbOrder"].as_bool().ok_or("Некоректний порядок кольорів.")?;
 let member=if touch=="none"{String::new()}else{format!("lgfx::Touch_{touch} touch;")};
 let mut touch_config=String::new();
 if touch!="none"{
  let xmin=number(&c["xMin"],0,65534)?;let xmax=number(&c["xMax"],xmin+1,65535)?;let ymin=number(&c["yMin"],0,65534)?;let ymax=number(&c["yMax"],ymin+1,65535)?;let tr=number(&c["touchRotation"],0,7)?;
  let bus=if touch=="XPT2046"{format!("t.spi_host=VSPI_HOST;t.pin_sclk={};t.pin_mosi={};t.pin_miso={};t.pin_cs={};t.freq=1000000;t.bus_shared=true;",pin("LCD_CLK"),pin("LCD_MOSI"),pin("LCD_MISO"),pin("TOUCH_CS"))}else{let addr=number(&c["address"],8,119)?;format!("t.i2c_port=0;t.i2c_addr={addr};t.pin_sda={};t.pin_scl={};t.pin_rst={};t.freq=400000;t.bus_shared=false;",pin("TOUCH_SDA"),pin("TOUCH_SCL"),pin("TOUCH_RST"))};
  touch_config=format!("auto t=touch.config();{bus}t.pin_int={};t.x_min={xmin};t.x_max={xmax};t.y_min={ymin};t.y_max={ymax};t.offset_rotation={tr};touch.config(t);panel.setTouch(&touch);",pin("TOUCH_IRQ"));
 }
 let touch_read=if touch=="none"{"down=false;return false;"}else{"uint16_t tx=0,ty=0;down=lcd.getTouch(&tx,&ty)>0;if(down){lastX=tx;lastY=ty;}x=lastX;y=lastY;return initialized;"};
 Ok(format!(r#"// Generated Pinway adapter: LovyanGFX 1.3.0 (FreeBSD license, bundled).
#include <Arduino.h>
#include <LovyanGFX.hpp>
#include "display_ui.h"
#include "touch.h"
namespace {{
class Device:public lgfx::LGFX_Device {{
 lgfx::Bus_SPI bus;lgfx::Panel_{controller} panel;{member}
 public:Device(){{
 auto b=bus.config();b.spi_host=VSPI_HOST;b.spi_mode=0;b.freq_write=20000000;b.freq_read=16000000;b.pin_sclk={clk};b.pin_mosi={mosi};b.pin_miso={miso};b.pin_dc={dc};b.dma_channel=0;bus.config(b);panel.setBus(&bus);
 auto p=panel.config();p.pin_cs={cs};p.pin_rst={rst};p.pin_busy=-1;p.panel_width={w};p.panel_height={height};p.offset_x={ox};p.offset_y={oy};p.invert={invert};p.rgb_order={rgb};p.bus_shared=true;panel.config(p);
 {touch_config}
 setPanel(&panel);
 }}
}};
Device lcd;bool initialized=false;int lastX=0,lastY=0;
}}
namespace PinwayHardware {{
void displayBegin(){{initialized=lcd.init();lcd.setRotation({rotation});lcd.setColorDepth(16);if({bl}>=0){{pinMode({bl},OUTPUT);digitalWrite({bl},HIGH);}}}}
void displayPixelRows(const unsigned short* data,int y,int rows){{lcd.pushImage(0,y,lcd.width(),rows,data);}}
bool touchBegin(){{return initialized&&{has_touch};}}
bool touchIsReady(){{return initialized&&{has_touch};}}
bool touchPosition(int& x,int& y,bool& down){{{touch_read}}}
}}
"#,clk=pin("LCD_CLK"),mosi=pin("LCD_MOSI"),miso=pin("LCD_MISO"),dc=pin("LCD_DC"),cs=pin("LCD_CS"),rst=pin("LCD_RST"),bl=pin("LCD_BL"),has_touch=touch!="none"))
}
