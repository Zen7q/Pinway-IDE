import {hardwareErrors} from './hardware.mjs';
export const clone = value => structuredClone(value);
export const uid = () => crypto.randomUUID();
export const canonical = value => JSON.stringify(value, (_,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
export const kinds = { text: 'Текст', image: 'Зображення', rectangle: 'Прямокутник', ellipse: 'Еліпс', button: 'Кнопка', toggle: 'Перемикач', slider: 'Повзунок', progress: 'Індикатор' };
export const fonts = { sans: 'Arial, sans-serif', mono: '"Courier New", monospace', serif: 'Georgia, serif' };
export const availableKinds = doc => doc.canvas.class === 'character' ? ['text'] : Object.keys(kinds);
export function fresh() {
  return { format: 'pinway.display/1', canvas: { class: 'color', width: 320, height: 240, touch: false, background: '#101419', grid: 8, snap: true }, pages: [{ id: uid(), name: 'Головна', elements: [] }], variables: [] };
}
export function element(kind, doc) {
  const cells = doc.canvas.class === 'character';
  return { id: uid(), kind, name: kinds[kind], x: cells ? 0 : 24, y: cells ? 0 : 24, width: cells ? 12 : kind === 'toggle' ? 56 : 144, height: cells ? 1 : kind === 'text' ? 32 : 40,
    text: kind === 'text' ? 'Привіт, світе!' : kind === 'button' ? 'Натиснути' : '', color: '#eef1f7', fill: '#4c8dff', font: 'sans', fontSize: 18, radius: 8,
    editorHidden: false, runtimeVisible: true, locked: false, value: kind === 'toggle' ? 0 : 40, min: 0, max: 100, binding: '', prefix: '', suffix: '', decimals: 0,
    input: 'none', action: { type: 'none', page: '', variable: '', value: 1, pin: 2, level: true } };
}
export function validate(doc) {
  const fail = message => { throw Error('Документ Display: ' + message); };
  if (!doc || doc.format !== 'pinway.display/1') fail('непідтримуваний формат.');
  const c = doc.canvas;
  if (!c || !['color','mono','character'].includes(c.class)) fail('невідомий клас дисплея.');
  for (const k of ['width','height','grid']) if (!Number.isInteger(c[k]) || c[k] < 1 || c[k] > 2048) fail('некоректна геометрія.');
  if (c.class === 'character' && (c.width > 80 || c.height > 8)) fail('символьне полотно обмежене 80×8.');
  if (typeof c.touch !== 'boolean' || typeof c.snap !== 'boolean' || !/^#[\da-f]{6}$/i.test(c.background)) fail('некоректні властивості полотна.');
  if (!Array.isArray(doc.pages) || !doc.pages.length || doc.pages.length > 40 || !Array.isArray(doc.variables) || doc.variables.length > 100) fail('забагато сторінок або змінних.');
  const ids = new Set();
  const id = v => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v) || ids.has(v)) fail('повторний або некоректний ID.'); ids.add(v); };
  for (const p of doc.pages) {
    id(p.id); if (typeof p.name !== 'string' || p.name.length > 100 || !Array.isArray(p.elements) || p.elements.length > 200) fail('некоректна сторінка.');
    for (const e of p.elements) {
      id(e.id);
      if (!Object.hasOwn(kinds,e.kind)) fail('невідомий елемент.');
      for (const k of ['x','y','width','height','fontSize','radius','value','min','max','decimals']) if (!Number.isFinite(e[k]) || Math.abs(e[k]) > 1000000) fail('некоректні числові властивості.');
      if (e.width < 1 || e.height < 1 || e.min >= e.max || e.decimals < 0 || e.decimals > 6 || !Number.isInteger(e.decimals)) fail('некоректні розміри або діапазон.');
      for (const k of ['name','text','prefix','suffix','binding']) if (typeof e[k] !== 'string' || e[k].length > 1000) fail('некоректний текст.');
      if (!Object.hasOwn(fonts,e.font) || !/^#[\da-f]{6}$/i.test(e.color) || !/^#[\da-f]{6}$/i.test(e.fill)) fail('некоректне оформлення.');
      for (const k of ['editorHidden','runtimeVisible','locked']) if (typeof e[k] !== 'boolean') fail('некоректна видимість.');
      if (!['none','physical','touch'].includes(e.input) || !e.action || !['none','navigate','set','gpio','custom'].includes(e.action.type)) fail('некоректна дія.');
      if (e.action.type === 'gpio' && (!Number.isInteger(e.action.pin) || e.action.pin < 0 || e.action.pin > 99 || typeof e.action.level !== 'boolean' || (e.action.mode !== undefined && !['set','toggle'].includes(e.action.mode)))) fail('некоректна дія GPIO.');
      if (e.image && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(e.image) || e.image.length > 2800000)) fail('некоректне зображення.');
    }
  }
  if (doc.hardwarePreview !== undefined) {
    const p = doc.hardwarePreview;
    if (!p || p.target !== 'TouchLed169/RGB565' || (doc.hardware?.profile==='waveshare169' ? !Number.isInteger(p.pin)||p.pin < -1||p.pin>39 : p.pin !== 14) || typeof p.page !== 'string' ||
        !p.source || p.source.hardwarePreview !== undefined || !p.frames ||
        !['off','on'].every(k => typeof p.frames[k] === 'string' && p.frames[k].length < 500000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.frames[k]))) fail('некоректний апаратний кадр.');
  }
  if(doc.hardwarePreview?.dynamic) {
    const d=doc.hardwarePreview.dynamic;
    if(!/^[A-Za-z_]\w*$/.test(d.name)||!Number.isInteger(d.min)||!Number.isInteger(d.max)||d.max-d.min>256||d.max<d.min||!Array.isArray(d.images??d.pages)||((d.pages??[{images:d.images}]).some(p=>!Array.isArray(p.images)||![1,d.max-d.min+1].includes(p.images.length)||p.images.some(s=>typeof s!=='string'||s.length>500000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s)))))fail('некоректні динамічні кадри.');
  }
  if(doc.hardware && (doc.hardware.profile!=='waveshare169'||!doc.hardware.pins||Object.values(doc.hardware.pins).some(v=>!Number.isInteger(v))))fail('некоректний профіль дисплея.');
  const names = new Set();
  for (const v of doc.variables) {
    if (!v || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(v.name) || names.has(v.name) || !['number','boolean','text'].includes(v.type)) fail('некоректна змінна.');
    names.add(v.name);
    if ((v.type === 'number' && !Number.isFinite(v.value)) || (v.type === 'boolean' && typeof v.value !== 'boolean') || (v.type === 'text' && (typeof v.value !== 'string' || v.value.length > 1000))) fail('несумісне значення змінної.');
  }
  return doc;
}
export function issues(doc) {
  const result = [];
  if(doc.hardware)for(const text of hardwareErrors(doc.hardware))result.push({page:doc.pages[0].id,element:'',text});
  const vars = new Map(doc.variables.map(v => [v.name,v]));
  if (doc.hardwarePreview && !hardwareFrame(doc, doc.hardwarePreview.page)) result.push({page:doc.hardwarePreview.page,element:'',text:'Макет змінено. Нову графіку буде підготовлено автоматично під час компіляції або завантаження.'});
  for (const p of doc.pages) for (const e of p.elements) {
    const add = text => result.push({ page: p.id, element: e.id, text: `${p.name} / ${e.name}: ${text}` });
    if (e.x < 0 || e.y < 0 || e.x + e.width > doc.canvas.width || e.y + e.height > doc.canvas.height) add('елемент за межами полотна');
    if (!availableKinds(doc).includes(e.kind)) add('елемент недоступний для символьного дисплея');
    if (e.binding) {
      const v = vars.get(e.binding);
      if (!v) add('змінної прив’язки немає');
      else if ((['slider','progress'].includes(e.kind) && v.type !== 'number') || (e.kind === 'toggle' && v.type !== 'boolean')) add('тип змінної несумісний з елементом');
    }
    if (e.action.type === 'navigate' && !doc.pages.some(p => p.id === e.action.page)) add('сторінки переходу немає');
    if (e.action.type === 'set') {
      const v=vars.get(e.action.variable);
      if (!v) add('змінної дії немає');
      else if (typeof e.action.value !== ({number:'number',boolean:'boolean',text:'string'}[v.type])) add('тип значення дії несумісний');
    }
    if (e.input === 'touch' && (!doc.canvas.touch || doc.canvas.class === 'character')) add('дотик недоступний для цього полотна');
  }
  return result;
}
export function boundValue(doc, e, values) {
  const v = doc.variables.find(v => v.name === e.binding);
  return v ? values[v.name] ?? v.value : e.value;
}
export function displayText(doc,e,values={}) {
  if (!e.binding) return e.text;
  const value=boundValue(doc,e,values);
  return e.prefix + (typeof value === 'number' ? value.toFixed(e.decimals) : String(value)) + e.suffix;
}
export function compatible(doc,e) {
  const v=doc.variables.find(v=>v.name===e.binding);
  return !e.binding || !!v && (e.kind==='toggle' ? v.type==='boolean' : ['slider','progress'].includes(e.kind) ? v.type==='number' : true);
}
export function interact(doc,e,values,next,gpio={}) {
  const result={values:{...values},gpio:{...gpio},page:null,message:''};
  if (e.input === 'none' || (e.input === 'touch' && !doc.canvas.touch) || !e.runtimeVisible) return {...result,message:'Вкажіть явний зв’язок із фізичною кнопкою або дотиком у властивостях.'};
  if (e.binding && compatible(doc,e) && ['toggle','slider'].includes(e.kind)) result.values[e.binding] = e.kind==='toggle' ? !Boolean(boundValue(doc,e,values)) : Math.max(e.min,Math.min(e.max,Number(next)));
  const a=e.action;
  if (a.type==='navigate' && doc.pages.some(p=>p.id===a.page)) result.page=a.page;
  if (a.type==='set') { const v=doc.variables.find(v=>v.name===a.variable);if(v&&typeof a.value===({number:'number',boolean:'boolean',text:'string'}[v.type]))result.values[v.name]=a.value; }
  if(a.type==='gpio') {
    const level=a.mode==='toggle'?!Boolean(gpio[a.pin]):a.level;
    result.gpio[a.pin]=level;
    result.message=`Симуляція GPIO ${a.pin} → ${level?'HIGH':'LOW'}. Реальна плата не змінюється.`;
  }
  if(a.type==='custom')result.message='Власний C++ у превʼю не виконується. Апаратну інтеграцію буде додано окремим етапом.';
  return result;
}
export function starter(doc,type) {
  const p=doc.pages[0];
  if(doc.canvas.class==='character') {const e=element('text',doc);e.text='Темп: 24 C';e.width=Math.min(doc.canvas.width,12);p.elements=[e];return;}
  const scale=Math.min(doc.canvas.width/320,doc.canvas.height/240);
  const make=(kind,props)=>Object.assign(element(kind,doc),props);
  if(type==='monitor') {
    doc.variables=[{name:'temperature',type:'number',value:24}];
    p.elements=[make('text',{text:'МОНІТОРИНГ',x:24,y:20,fontSize:12,color:'#8c9aaf'}),make('text',{name:'Температура',x:24,y:68,width:270,height:45,fontSize:32,binding:'temperature',suffix:' °C',decimals:1}),make('progress',{name:'Рівень',x:24,y:140,width:272,height:10,binding:'temperature',max:50}),make('text',{text:'Система працює',x:24,y:177,color:'#65d39b',fontSize:14})];
  } else {
    doc.variables=[{name:'brightness',type:'number',value:128},{name:'enabled',type:'boolean',value:true}];
    p.elements=[make('text',{text:'КЕРУВАННЯ',x:24,y:16,fontSize:12,color:'#8c9aaf'}),make('button',{x:24,y:62,width:168,text:'Увімкнути',input:'physical',action:{type:'set',variable:'enabled',value:true}}),make('toggle',{x:232,y:64,width:56,height:30,binding:'enabled',input:'physical'}),make('slider',{x:24,y:134,width:264,binding:'brightness',max:255,input:'physical'}),make('text',{x:24,y:188,fontSize:14,binding:'brightness',prefix:'Яскравість: ',width:264})];
  }
  for(const e of p.elements) { for(const key of ['x','y','width','height','fontSize'])e[key]=Math.max(1,Math.round(e[key]*scale)); }
}

// A generated snapshot is usable only for its exact source document. Editing any
// layout property falls back to normal artwork and exposes a stale-frame issue.
export function hardwareFrame(doc, page, gpio = {}, values = {}) {
  const p = doc.hardwarePreview;
  if (!p || (p.page !== page&&!p.dynamic?.pages?.some(p=>p.id===page))) return null;
  const {hardwarePreview, ...source} = doc;
  if (canonical(source) !== canonical(p.source)) return null;
  if(p.dynamic){const d=p.dynamic,v=d.mode==='gpio'?(gpio[p.pin]?1:0):values[d.name]??doc.variables.find(v=>v.name===d.name)?.value??d.initial;const images=d.pages?.find(p=>p.id===page)?.images??d.images;return images?.[images.length===1?0:Math.max(0,Math.min(d.max-d.min,Math.round(v)-d.min))]??null;}
  return p.frames[gpio[p.pin] ? 'on' : 'off'];
}

export function duplicatePage(doc,id) {
  const index=doc.pages.findIndex(p=>p.id===id);
  if(index<0||doc.pages.length>=40)return null;
  const page=clone(doc.pages[index]),oldId=page.id;page.id=uid();page.name=(page.name+' · копія').slice(0,100);
  for(const e of page.elements){e.id=uid();if(e.action.type==='navigate'&&e.action.page===oldId)e.action.page=page.id;}
  doc.pages.splice(index+1,0,page);return page.id;
}
export function removePage(doc,id) {
  const index=doc.pages.findIndex(p=>p.id===id);
  if(index<0||doc.pages.length===1)return null;
  doc.pages.splice(index,1);
  for(const p of doc.pages)for(const e of p.elements)if(e.action.type==='navigate'&&e.action.page===id)e.action={type:'none'};
  return doc.pages[Math.min(index,doc.pages.length-1)].id;
}
export function movePage(doc,id,position) {
  const index=doc.pages.findIndex(p=>p.id===id);
  if(index<0)return;
  const [page]=doc.pages.splice(index,1);doc.pages.splice(Math.max(0,Math.min(doc.pages.length,position)),0,page);
}
