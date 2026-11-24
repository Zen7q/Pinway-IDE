export const wavePins={LCD_MOSI:23,LCD_CLK:18,LCD_CS:27,LCD_DC:26,LCD_RST:25,LCD_BL:32,TOUCH_SDA:21,TOUCH_SCL:22,TOUCH_RST:33,TOUCH_IRQ:13};
export const pinLabels={LCD_MOSI:'LCD_DIN · дані SPI',LCD_CLK:'LCD_CLK · такт SPI',LCD_CS:'LCD_CS',LCD_DC:'LCD_DC',LCD_RST:'LCD_RST',LCD_BL:'LCD_BL · підсвітка',TOUCH_SDA:'TP_SDA · I²C',TOUCH_SCL:'TP_SCL · I²C',TOUCH_RST:'TP_RST',TOUCH_IRQ:'TP_IRQ'};
export const outputPins=[0,2,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33];
export const inputPins=[...outputPins,34,35,36,39];
export const controllers={ST7789:[240,320],ST7735S:[132,162],ILI9341:[240,320],GC9A01:[240,240]};
export const touchTypes={none:'Без тачу',CST816S:'CST816 · I²C',FT5x06:'FT5x06 / FT6206 · I²C',GT911:'GT911 · I²C',XPT2046:'XPT2046 · SPI'};
export function displaySize(h){if(h?.profile==='waveshare169')return {width:240,height:280,touch:true};const c=h?.config||{};return {width:c.rotation%2?c.height:c.width,height:c.rotation%2?c.width:c.height,touch:c.touch!=='none'};}
export function makeDisplay(controller='ST7789',width=240,height=240,name=controller){return {profile:'lovyangfx',name,library:'LovyanGFX',config:{controller,width,height,offsetX:0,offsetY:0,rotation:0,invert:controller==='ST7789'||controller==='GC9A01',rgbOrder:false,touch:'none',touchRotation:0,address:21,xMin:0,xMax:width-1,yMin:0,yMax:height-1},pins:{...wavePins,LCD_MISO:19,TOUCH_CS:4}};}
export const displayPresets=[{id:'waveshare169',name:'Waveshare 1.69″ Touch LCD',hardware:{profile:'waveshare169',pins:{...wavePins}}},...[
 ['st7789-240','ST7789',240,240,'ST7789 · 240 × 240'],['st7789-320','ST7789',240,320,'ST7789 · 240 × 320'],['ili9341','ILI9341',240,320,'ILI9341 · 240 × 320'],['gc9a01','GC9A01',240,240,'GC9A01 · круглий 240 × 240'],['st7735','ST7735S',128,160,'ST7735S · 128 × 160']].map(([id,c,w,h,name])=>({id,name,hardware:makeDisplay(c,w,h,name)}))];
export function pinKeys(h){return h.profile==='waveshare169'?Object.keys(wavePins):['LCD_MOSI','LCD_CLK','LCD_CS','LCD_DC','LCD_RST','LCD_BL',...(h.config?.touch==='XPT2046'?['LCD_MISO','TOUCH_CS','TOUCH_IRQ']:h.config?.touch!=='none'?['TOUCH_SDA','TOUCH_SCL','TOUCH_RST','TOUCH_IRQ']:[])];}
export function optionalPin(h,k){return h.profile==='lovyangfx'&&['LCD_CS','LCD_RST','LCD_BL','TOUCH_RST','TOUCH_IRQ'].includes(k);}
export function hardwareErrors(h){
 if(!h)return [];
 const errors=[];
 if(!['waveshare169','lovyangfx'].includes(h.profile))return ['Невідома модель дисплея.'];
 if(h.profile==='lovyangfx'){
  const c=h.config||{},memory=controllers[c.controller];
  if(h.library!=='LovyanGFX'||!Object.hasOwn(controllers,c.controller))return ['Вибери підтримувану бібліотеку та драйвер.'];
  for(const [k,max]of [['width',memory[0]],['height',memory[1]],['offsetX',memory[0]-1],['offsetY',memory[1]-1],['rotation',3],['touchRotation',7],['address',119],['xMin',65534],['xMax',65535],['yMin',65534],['yMax',65535]])if(!Number.isInteger(c[k])||c[k]<(k==='width'||k==='height'?1:0)||c[k]>max)errors.push(`${k}: некоректне значення.`);
  if(c.touch!=='none'&&c.touch!=='XPT2046'&&c.address<8)errors.push('I²C адреса має бути 8…119.');
  if(c.width+c.offsetX>memory[0]||c.height+c.offsetY>memory[1])errors.push('Роздільність зі зміщенням виходить за пам’ять драйвера.');
  if(!Object.hasOwn(touchTypes,c.touch)||c.xMax<=c.xMin||c.yMax<=c.yMin||typeof c.invert!=='boolean'||typeof c.rgbOrder!=='boolean')errors.push('Перевір налаштування тачу та кольорів.');
  if(typeof h.name!=='string'||!h.name.trim()||h.name.length>100)errors.push('Вкажи назву дисплея (до 100 символів).');
 }
 const used=new Map();
 for(const key of pinKeys(h)){
  const pin=h.pins?.[key],allowed=['TOUCH_IRQ','LCD_MISO'].includes(key)?inputPins:outputPins;
  if(pin===-1&&optionalPin(h,key))continue;
  if(!allowed.includes(pin))errors.push(`${key}: GPIO ${pin} недоступний для цієї функції на ESP32 Dev Module.`);
  if(used.has(pin))errors.push(`GPIO ${pin} призначено одночасно ${used.get(pin)} та ${key}.`);
  used.set(pin,key);
 }
 return errors;
}
export function scenePlan(doc){
 if(!doc.hardware)return null;
 const errors=hardwareErrors(doc.hardware);if(errors.length)throw Error(errors.join('\n'));
 const size=displaySize(doc.hardware);if(doc.canvas.width!==size.width||doc.canvas.height!==size.height||doc.canvas.class!=='color'||doc.canvas.touch!==size.touch)throw Error(`Полотно має відповідати дисплею: ${size.width} × ${size.height}, ${size.touch?'з тачем':'без тачу'}.`);
 const visible=doc.pages.flatMap(p=>p.elements.filter(e=>e.runtimeVisible));
 const names=[...new Set(visible.filter(e=>e.binding).map(e=>e.binding))];
 if(names.length>1)throw Error('У цій версії апаратного адаптера можна прив’язати одну змінну Code на екранах.');
 const variable=names.length?doc.variables.find(v=>v.name===names[0]):null;
 if(names.length&&(!variable||variable.source!=='code'||variable.type!=='number'))throw Error('Для фізичного дисплея вибери числову змінну з Code.');
 const sliders=visible.filter(e=>e.kind==='slider');
 if(sliders.length&&!size.touch)throw Error('Для повзунка налаштуй контролер тачу дисплея.');
 for(const s of sliders)if(s.binding!==variable?.name||s.input!=='touch'||s.action.type!=='none'||variable.readonly)throw Error('Повзунок: прив’яжи змінну Code, вибери «Дотик» та «Без додаткової дії».');
 for(const e of visible)if(e.binding&&!['text','slider','progress'].includes(e.kind))throw Error('Для змінної Code підтримуються текст, повзунок та індикатор.');
 const gpios=visible.filter(e=>e.action.type==='gpio');
 if(variable&&gpios.length)throw Error('Використовуй або змінну Code, або GPIO-кнопки на цьому дисплеї.');
 const gpioPins=[...new Set(gpios.map(e=>e.action.pin))];
 if(gpioPins.length>1)throw Error('GPIO-кнопки можуть керувати одним виходом за раз.');
 if(gpioPins.some(pin=>!outputPins.includes(pin)||pinKeys(doc.hardware).some(k=>doc.hardware.pins[k]===pin)))throw Error('GPIO кнопки недоступний або зайнятий дисплеєм.');
 const mode=variable?'variable':gpios.length?'gpio':'static';
 const min=variable?(sliders[0]?.min??0):0,max=variable?(sliders[0]?.max??255):mode==='gpio'?1:0;
 if(!Number.isInteger(min)||!Number.isInteger(max)||max<min||max-min>256||sliders.some(s=>s.min!==min||s.max!==max))throw Error('Потрібен однаковий цілий діапазон повзунків, до 257 значень.');
 const initial=variable?.value??0;
 if(!Number.isInteger(initial)||initial<min||initial>max)throw Error(`Початкове значення Code має входити в діапазон ${min}…${max}.`);
 function bounds(e){const b={x:e.x,y:e.y,width:e.width,height:e.height};if(!Object.values(b).every(Number.isInteger)||b.x<0||b.y<0||b.width<1||b.height<1||b.x+b.width>size.width||b.y+b.height>size.height)throw Error(`«${e.name}»: touch-елемент має бути всередині екрана.`);return b;}
 const pages=doc.pages.map(p=>{
  const elements=p.elements.filter(e=>e.runtimeVisible),buttons=[];
  for(const e of elements){
   if(['none','navigate','gpio'].includes(e.action.type)===false)throw Error(`«${e.name}»: ця апаратна дія ще не підтримується.`);
   if(e.action.type==='none')continue;
   if(!size.touch)throw Error('Цей дисплей не має налаштованого тачу.');
   if(e.input!=='touch')throw Error(`«${e.name}»: вибери активацію «Дотик».`);
   const a=e.action;
   if(a.type==='navigate'){const target=doc.pages.findIndex(p=>p.id===a.page);if(target<0)throw Error('Сторінку переходу видалено.');buttons.push({...bounds(e),kind:1,target});}
   else buttons.push({...bounds(e),kind:a.mode==='toggle'?2:3,target:a.level?1:0});
  }
  return {id:p.id,sliders:elements.filter(e=>e.kind==='slider').map(bounds),buttons,dynamic:elements.some(e=>!!e.binding||e.action.type==='gpio')};
 });
 return {width:size.width,height:size.height,mode,variable,min,max,initial,gpio:gpioPins[0]??-1,pages};
}
