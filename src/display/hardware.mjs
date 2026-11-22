export const wavePins={LCD_MOSI:23,LCD_CLK:18,LCD_CS:27,LCD_DC:26,LCD_RST:25,LCD_BL:32,TOUCH_SDA:21,TOUCH_SCL:22,TOUCH_RST:33,TOUCH_IRQ:13};
export const pinLabels={LCD_MOSI:'LCD_DIN · дані SPI',LCD_CLK:'LCD_CLK · такт SPI',LCD_CS:'LCD_CS',LCD_DC:'LCD_DC',LCD_RST:'LCD_RST',LCD_BL:'LCD_BL · підсвітка',TOUCH_SDA:'TP_SDA · I²C',TOUCH_SCL:'TP_SCL · I²C',TOUCH_RST:'TP_RST',TOUCH_IRQ:'TP_IRQ'};
export const outputPins=[0,2,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33];
export const inputPins=[...outputPins,34,35,36,39];
export function hardwareErrors(hardware){
 if(!hardware)return [];
 if(hardware.profile!=='waveshare169')return ['Невідома модель дисплея.'];
 const used=new Map(),errors=[];
 for(const key of Object.keys(wavePins)){
  const pin=hardware.pins?.[key],allowed=key==='TOUCH_IRQ'?inputPins:outputPins;
  if(!allowed.includes(pin))errors.push(`${key}: GPIO ${pin} недоступний для цієї функції на ESP32 Dev Module.`);
  if(used.has(pin))errors.push(`GPIO ${pin} призначено одночасно ${used.get(pin)} та ${key}.`);
  used.set(pin,key);
 }
 return errors;
}
export function scenePlan(doc){
 if(doc.hardware?.profile!=='waveshare169')return null;
 const errors=hardwareErrors(doc.hardware);if(errors.length)throw Error(errors.join('\n'));
 if(doc.canvas.width!==240||doc.canvas.height!==280||doc.canvas.class!=='color'||!doc.canvas.touch)throw Error('Waveshare 1.69″ потребує кольорове touch-полотно 240 × 280.');
 const visible=doc.pages.flatMap(p=>p.elements.filter(e=>e.runtimeVisible));
 const names=[...new Set(visible.filter(e=>e.binding).map(e=>e.binding))];
 if(names.length>1)throw Error('У цій версії апаратного адаптера можна прив’язати одну змінну Code на екранах.');
 const variable=names.length?doc.variables.find(v=>v.name===names[0]):null;
 if(names.length&&(!variable||variable.source!=='code'||variable.type!=='number'))throw Error('Для фізичного дисплея вибери числову змінну з Code.');
 const sliders=visible.filter(e=>e.kind==='slider');
 for(const s of sliders)if(s.binding!==variable?.name||s.input!=='touch'||s.action.type!=='none'||variable.readonly)throw Error('Повзунок: прив’яжи змінну Code, вибери «Дотик» та «Без додаткової дії».');
 for(const e of visible)if(e.binding&&!['text','slider','progress'].includes(e.kind))throw Error('Для змінної Code підтримуються текст, повзунок та індикатор.');
 const gpios=visible.filter(e=>e.action.type==='gpio');
 if(variable&&gpios.length)throw Error('Використовуй або змінну Code, або GPIO-кнопки на цьому дисплеї.');
 const gpioPins=[...new Set(gpios.map(e=>e.action.pin))];
 if(gpioPins.length>1)throw Error('GPIO-кнопки можуть керувати одним виходом за раз.');
 if(gpioPins.some(pin=>!outputPins.includes(pin)||Object.values(doc.hardware.pins).includes(pin)))throw Error('GPIO кнопки недоступний або зайнятий дисплеєм.');
 const mode=variable?'variable':gpios.length?'gpio':'static';
 const min=variable?(sliders[0]?.min??0):0,max=variable?(sliders[0]?.max??255):mode==='gpio'?1:0;
 if(!Number.isInteger(min)||!Number.isInteger(max)||max<min||max-min>256||sliders.some(s=>s.min!==min||s.max!==max))throw Error('Потрібен однаковий цілий діапазон повзунків, до 257 значень.');
 const initial=variable?.value??0;
 if(!Number.isInteger(initial)||initial<min||initial>max)throw Error(`Початкове значення Code має входити в діапазон ${min}…${max}.`);
 function bounds(e){const b={x:e.x,y:e.y,width:e.width,height:e.height};if(!Object.values(b).every(Number.isInteger)||b.x<0||b.y<0||b.width<1||b.height<1||b.x+b.width>240||b.y+b.height>280)throw Error(`«${e.name}»: touch-елемент має бути всередині екрана.`);return b;}
 const pages=doc.pages.map(p=>{
  const elements=p.elements.filter(e=>e.runtimeVisible),buttons=[];
  for(const e of elements){
   if(['none','navigate','gpio'].includes(e.action.type)===false)throw Error(`«${e.name}»: ця апаратна дія ще не підтримується.`);
   if(e.action.type==='none')continue;
   if(e.input!=='touch')throw Error(`«${e.name}»: вибери активацію «Дотик».`);
   const a=e.action;
   if(a.type==='navigate'){const target=doc.pages.findIndex(p=>p.id===a.page);if(target<0)throw Error('Сторінку переходу видалено.');buttons.push({...bounds(e),kind:1,target});}
   else buttons.push({...bounds(e),kind:a.mode==='toggle'?2:3,target:a.level?1:0});
  }
  return {id:p.id,sliders:elements.filter(e=>e.kind==='slider').map(bounds),buttons,dynamic:elements.some(e=>!!e.binding||e.action.type==='gpio')};
 });
 return {mode,variable,min,max,initial,gpio:gpioPins[0]??-1,pages};
}
