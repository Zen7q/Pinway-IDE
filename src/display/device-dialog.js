import {controllers,touchTypes,makeDisplay,hardwareErrors,pinKeys,optionalPin,pinLabels,inputPins,outputPins} from './hardware.mjs';
const storage='pinway.display.presets.v1';
export function personalDisplays(){try{const list=JSON.parse(localStorage.getItem(storage)||'[]');return Array.isArray(list)?list.filter(p=>typeof p.id==='string'&&p.id.startsWith('personal-')&&p.hardware?.profile==='lovyangfx'&&!hardwareErrors(p.hardware).length).slice(0,30):[];}catch{return [];}}
export function deviceDialog(existing,onApply){
 const draft=structuredClone(existing?.profile==='lovyangfx'?existing:makeDisplay());
 const dialog=document.createElement('dialog');dialog.className='dp-confirm dp-device';
 const form=document.createElement('form');dialog.append(form);
 const title=document.createElement('h2');title.textContent=existing?'Налаштувати дисплей':'Додати дисплей';form.append(title);
 const intro=document.createElement('p');intro.textContent='ESP32 Dev Module · бібліотека вже в Pinway. Код запуску генерується автоматично. Живлення та рівні сигналів звір із документацією модуля.';form.append(intro);
 const fields=document.createElement('div');fields.className='dp-device-fields';form.append(fields);
 const status=document.createElement('p');status.className='dp-pin-errors';status.setAttribute('role','status');
 const footer=document.createElement('div');footer.className='dp-device-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Скасувати';cancel.onclick=()=>dialog.close();
 const save=document.createElement('button');save.type='submit';save.textContent='Зберегти й вибрати';footer.append(cancel,save);form.append(status,footer);
 function check(){const errors=hardwareErrors(draft);status.textContent=errors.join(' ');save.disabled=!!errors.length;}
 function row(label,value,set,{choices,min=0,max=65535,type='number'}={}){
  const l=document.createElement('label');l.textContent=label;
  const input=document.createElement(choices?'select':'input');input.setAttribute('aria-label',label);
  if(choices){for(const [v,text]of choices){const o=document.createElement('option');o.value=v;o.textContent=text;input.append(o);}input.value=value;}else{input.type=type;input.min=min;input.max=max;input.step=1;if(type==='checkbox')input.checked=value;else input.value=value;}
  const update=()=>{set(choices?input.value:type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value);check();};input.onchange=update;if(!choices&&type!=='checkbox')input.oninput=update;l.append(input);fields.append(l);return input;
 }
 function heading(text){const h=document.createElement('h3');h.textContent=text;fields.append(h);}
 function draw(){fields.replaceChildren();const c=draft.config;
  row('Назва дисплея',draft.name,v=>draft.name=v,{type:'text'}).maxLength=100;
  row('Бібліотека',draft.library,v=>draft.library=v,{choices:[['LovyanGFX','LovyanGFX · вбудована']]});
  row('Драйвер дисплея',c.controller,v=>{const next=makeDisplay(v,...controllers[v],draft.name);draft.config={...next.config,touch:c.touch};draw();},{choices:Object.keys(controllers).map(k=>[k,k])});
  for(const [k,label,max]of [['width','Ширина, px',controllers[c.controller][0]],['height','Висота, px',controllers[c.controller][1]],['offsetX','Зміщення X',controllers[c.controller][0]-1],['offsetY','Зміщення Y',controllers[c.controller][1]-1]])row(label,c[k],v=>c[k]=v,{min:k==='width'||k==='height'?1:0,max});
  row('Поворот дисплея',c.rotation,v=>c.rotation=Number(v),{choices:[0,1,2,3].map(n=>[n,String(n*90)+'°'])});
  row('Інверсія кольорів',c.invert,v=>c.invert=v,{type:'checkbox'});row('Порядок RGB / BGR',c.rgbOrder,v=>c.rgbOrder=v,{type:'checkbox'});
  heading('Тач');
  row('Контролер тачу',c.touch,v=>{c.touch=v;c.address={CST816S:21,FT5x06:56,GT911:93}[v]||21;c.xMax=v==='XPT2046'?3800:c.width-1;c.yMax=v==='XPT2046'?3800:c.height-1;c.xMin=c.yMin=v==='XPT2046'?200:0;draw();},{choices:Object.entries(touchTypes)});
  if(c.touch!=='none'){
   if(c.touch!=='XPT2046')row('I²C адреса · десяткова',c.address,v=>c.address=v,{min:8,max:119});
   row('Орієнтація тачу',c.touchRotation,v=>c.touchRotation=Number(v),{choices:Array.from({length:8},(_,n)=>[n,`${n%4*90}°${n>3?' · дзеркально':''}`])});
   for(const [k,label]of [['xMin','Тач X мін.'],['xMax','Тач X макс.'],['yMin','Тач Y мін.'],['yMax','Тач Y макс.']])row(label,c[k],v=>c[k]=v);
  }
  heading('Контакти · ESP32');
  for(const k of pinKeys(draft))row(pinLabels[k]||({LCD_MISO:'LCD_MISO · вхід SPI',TOUCH_CS:'TP_CS · вибір тачу'}[k]),draft.pins[k],v=>draft.pins[k]=Number(v),{choices:[...(optionalPin(draft,k)?[[-1,'Не підключено']]:[]),...(['LCD_MISO','TOUCH_IRQ'].includes(k)?inputPins:outputPins).map(n=>[n,`GPIO ${n}`])]});
  check();
 }
 form.onsubmit=e=>{e.preventDefault();if(hardwareErrors(draft).length)return check();const id=draft.preset?.startsWith('personal-')?draft.preset:'personal-'+crypto.randomUUID();draft.preset=id;const list=personalDisplays().filter(p=>p.id!==id);list.push({id,name:draft.name,hardware:draft});try{localStorage.setItem(storage,JSON.stringify(list.slice(-30)));}catch{status.textContent='Не вдалося зберегти список дисплеїв. Звільни місце в сховищі.';return;}onApply(structuredClone(draft));dialog.close();};
 dialog.onclose=()=>dialog.remove();document.body.append(dialog);draw();dialog.showModal();
}
