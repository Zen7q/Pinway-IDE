import {deviceDialog,personalDisplays} from './device-dialog.js';
import {wavePins,pinLabels,outputPins,inputPins,hardwareErrors,scenePlan,displaySize,displayPresets} from './hardware.mjs';
import {scanCodeVariables} from './code-variables.mjs';
import {firmwareSource, firmwareButton, rgb565Frame, dynamicPlan, deltaRuns} from './firmware.mjs';
import { clone, canonical, uid, kinds, fonts, fresh, element, validate, availableKinds, issues, displayText, boundValue, compatible, interact, hardwareFrame, duplicatePage, removePage, movePage } from './model.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={select:'m4 3 13 9-7 1-3 7Z',undo:'m8 4-5 5 5 5M3 9h10a6 6 0 0 1 6 6',redo:'m16 4 5 5-5 5M21 9H11a6 6 0 0 0-6 6',plus:'M12 5v14M5 12h14',minus:'M5 12h14',trash:'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7',copy:'M9 8h11v13H9ZM5 16H3V3h12v2',up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',lock:'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4',grid:'M3 3h18v18H3ZM3 9h18M3 15h18M9 3v18M15 3v18',save:'M4 3h13l3 3v15H4ZM8 3v6h8V3M8 21v-7h8v7',image:'M3 3h18v18H3ZM3 17l6-6 5 5 3-3 4 4M17 7h.01',export:'M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7',fit:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.select}"/></svg>`;
const btn=(action,label,glyph,extra='')=>`<button type="button" data-do="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${glyph?icon(glyph):esc(label)}</button>`;
export function mountDisplay({call,onVisibility,onChange,onSave,onNew,onOpen,preferences,codeSource=async()=>''}) {
  const root=document.createElement('main');root.id='display-editor';root.hidden=true;
  root.innerHTML=`<aside class="dp-panel dp-left"><header><div><span class="dp-eyebrow">PINWAY</span><h2>Display <span class="dp-beta">EDITOR</span></h2></div>${btn('save','Зберегти проєкт · ⌘S','save')}</header><section class="dp-add"><h3>ДОДАТИ ЕЛЕМЕНТ</h3><div class="dp-palette"></div></section><section class="dp-pages"><h3>СТОРІНКИ ${btn('page-add','Додати сторінку','plus')}</h3><div class="dp-page-list"></div></section><section class="dp-layers"><h3>ШАРИ <span id="dp-layer-count"></span></h3><div class="dp-layer-list"></div></section><footer><span class="dp-dot"></span><span class="dp-save-state">Відкрийте проєкт</span></footer></aside>
    <nav class="dp-toolbar" aria-label="Інструменти Display"><div>${btn('undo','Скасувати · ⌘Z','undo')}${btn('redo','Повторити · ⇧⌘Z','redo')}</div><i></i><div class="dp-modes">${btn('edit','Редактор')}${btn('preview','Превʼю')}${btn('map','Мапа')}</div><i></i><div>${btn('zoom-out','Зменшити','minus')}<button data-do="zoom-reset" class="dp-zoom">100%</button>${btn('zoom-in','Збільшити','plus')}${btn('fit','Вписати полотно','fit')}</div><i></i>${btn('grid','Прив’язка до сітки','grid')}</nav>
    <section class="dp-stage" tabindex="0" aria-label="Полотно Display"><div class="dp-screen-group"><div class="dp-screen-caption"></div><div class="dp-screen-wrap"><svg class="dp-screen" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Інтерфейс дисплея"></svg></div><div class="dp-screen-meta"></div></div><div class="dp-map" hidden></div><div class="dp-start design-welcome" hidden><div class="design-welcome-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 22h8m-4-4v4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div><span class="dp-eyebrow">PINWAY DISPLAY</span><h1>Створи інтерфейс свого пристрою.</h1><p>Вибери дисплей і додай елементи.<br>Змінні з Code з’являться тут автоматично.</p><button data-do="device-add">Додати дисплей</button><small>Або додай перший елемент із панелі зліва.</small></div></section>
    <aside class="dp-panel dp-right"><header><div><span class="dp-eyebrow">ІНСПЕКТОР</span><h2 class="dp-inspector-title">Полотно</h2></div>${btn('canvas','Параметри полотна','grid')}</header><div class="dp-properties"></div></aside>
    <div class="dp-message" role="status"></div><div class="dp-empty" hidden><h1>Інтерфейс вашого пристрою.</h1><p>Створіть або відкрийте проєкт Pinway.<br>Плату й фізичний дисплей можна підключити пізніше.</p><div class="dp-empty-actions"><button data-do="new-project">Новий проєкт</button><button data-do="open-project">Відкрити проєкт</button></div></div><input class="dp-image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
  document.querySelector('.statusbar').before(root);
  const $=s=>root.querySelector(s),screen=$('.dp-screen'),stage=$('.dp-stage');
  let pageMenu=null;
  let codeTicket=0;
  let doc=fresh(),owner=null,enabled=false,ready=false,visited=false,pageId=doc.pages[0].id,selection='',mode='edit',scale=1,history=[],future=[],clipboard=null,drag=null,values={},gpioValues={},localValues={},base=null,saved='',loading=0,saving=Promise.resolve(),guides=[],recoveryWarning='';
  const page=()=>doc.pages.find(p=>p.id===pageId)||doc.pages[0];
  const selected=()=>page().elements.find(e=>e.id===selection);
  const snapshot=()=>JSON.stringify(doc);
  const dirty=()=>ready&&snapshot()!==saved;
  const recoveryKey=()=> 'pinway.display.recovery:'+owner;
  const notice=text=>{$('.dp-message').textContent=text;};
  function recover() {
    if(!owner||!ready)return;
    try {if(dirty())localStorage.setItem(recoveryKey(),JSON.stringify({base,doc}));else localStorage.removeItem(recoveryKey());}
    catch {notice('Не вдалося записати резервну чернетку. Збережіть проєкт або експортуйте документ.');}
  }
  function changed(before) {
    if(before===snapshot())return;
    history.push(before);while(history.length>100 || history.reduce((n,s)=>n+s.length,0)>24*1024*1024)history.shift();future=[];recover();onChange();render();
  }
  function edit(fn) {if(!ready||drag)return;const before=snapshot();fn();changed(before);}
  async function refreshCode() {
    if(!owner||!ready)return;
    const ticket=++codeTicket,projectOwner=owner;
    const scan=scanCodeVariables(await codeSource());
    if(ticket!==codeTicket||owner!==projectOwner||!ready)return;
    const next=scan.variables;
    if(canonical(next)!==canonical(doc.variables)) {
      doc.variables=next;resetValues();recover();onChange();render();
    }
  }
  function resetValues() {values=Object.fromEntries(doc.variables.map(v=>[v.name,v.value]));gpioValues={};localValues={};}
  function options(items,current) {return items.map(([v,label])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(label)}</option>`).join('');}
  function field(label,value,change,{type='text',min,max,step,choices,help}={}) {
    const row=document.createElement('label');row.className='dp-field';const text=document.createElement('span');text.textContent=label;row.append(text);
    const input=document.createElement(choices?'select':'input');input.setAttribute('aria-label',label);
    if(choices)input.innerHTML=options(choices,value);else {input.type=type;if(type==='checkbox')input.checked=!!value;else input.value=value??'';if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;}
    row.append(input);if(help){const hint=document.createElement('small');hint.textContent=help;row.append(hint);}
    $('.dp-properties').append(row);
    input.onchange=()=>{const next=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;
      if(type==='number'&&(!Number.isFinite(next)||(min!==undefined&&next<min)||(max!==undefined&&next>max))) {notice('Введіть число в межах зазначеного діапазону.');inspector();return;}
      edit(()=>change(next));};return input;
  }
  function section(label) {const h=document.createElement('h3');h.textContent=label;$('.dp-properties').append(h);}
  function paragraph(text,cls='') {const p=document.createElement('p');p.className=cls;p.textContent=text;$('.dp-properties').append(p);}
  function actionButton(label,fn) {const b=document.createElement('button');b.className='dp-wide';b.textContent=label;b.onclick=fn;$('.dp-properties').append(b);}
  function applyDevice(h){edit(()=>{doc.hardware=h;delete doc.hardwarePreview;Object.assign(doc.canvas,displaySize(h),{class:"color"});});}
  function addDevice(existing){const projectOwner=owner;deviceDialog(existing,h=>{if(owner===projectOwner)applyDevice(h);});}
  function hardwareDialog() {
    if(doc.hardware?.profile!=="waveshare169")return addDevice(doc.hardware);
    const projectOwner=owner,draft=clone(doc.hardware);if(!draft)return;
    const dialog=document.createElement('dialog');dialog.className='dp-confirm dp-hardware';
    dialog.innerHTML='<form><h2>Підключення Waveshare 1.69″</h2><p>ESP32 Dev Module · VCC → 3V3 · GND → GND</p><div class="dp-pin-grid"></div><p class="dp-pin-errors" role="status"></p><div class="dp-pin-presets"><button type="button" data-default>Типові контакти</button><button type="button" data-personal>Зберегти моє підключення</button></div><div><button type="button" data-cancel>Скасувати</button><button type="submit">Застосувати контакти</button></div></form>';
    const drawPins=()=>{dialog.querySelector('.dp-pin-grid').innerHTML=Object.keys(wavePins).map(k=>`<label>${esc(pinLabels[k])}<select aria-label="${esc(k)}">${(k==='TOUCH_IRQ'?inputPins:outputPins).map(n=>`<option value="${n}" ${draft.pins[k]===n?'selected':''}>GPIO ${n}</option>`).join('')}</select></label>`).join('');dialog.querySelectorAll('select').forEach((s,i)=>s.onchange=()=>{draft.pins[Object.keys(wavePins)[i]]=Number(s.value);check();});check();};
    const check=()=>{const errors=hardwareErrors(draft);dialog.querySelector('.dp-pin-errors').textContent=errors.join(' ');dialog.querySelector('[type=submit]').disabled=!!errors.length;};
    dialog.querySelector('[data-default]').onclick=()=>{draft.pins={...wavePins};drawPins();};
    dialog.querySelector('[data-personal]').onclick=()=>{const errors=hardwareErrors(draft);if(errors.length)return check();localStorage.setItem('pinway.waveshare169.pins',JSON.stringify(draft.pins));dialog.querySelector('.dp-pin-errors').textContent='Підключення збережено для наступних проєктів.';};
    dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=ev=>{ev.preventDefault();if(hardwareErrors(draft).length)return check();if(owner===projectOwner)edit(()=>doc.hardware=clone(draft));dialog.close();};
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);drawPins();dialog.showModal();
  }
  function inspector() {
    $('.dp-properties').replaceChildren();const e=selected(),c=doc.canvas;
    $('.dp-inspector-title').textContent=mode==='preview'?'Значення з Code':e?kinds[e.kind]:'Полотно';
    if(!ready)return;
    if(mode==='preview') {
      paragraph('Локальне превʼю. Початкові значення беруться з Code; зміни тут не надсилаються платі. Після прошивання прив’язаний touch-повзунок змінює цю змінну на ESP32.');
      for(const v of doc.variables.filter(v=>v.source==='code'))paragraph(`${v.name}: ${values[v.name]??v.value}`);
      const pins=[...new Set(doc.pages.flatMap(p=>p.elements).filter(e=>e.action.type==='gpio').map(e=>e.action.pin))].sort((a,b)=>a-b);
      if(pins.length){section('СТАН GPIO · ПРЕВʼЮ');for(const pin of pins)paragraph(`GPIO ${pin}: ${gpioValues[pin]?'HIGH':'LOW'}`);}
      if(!doc.variables.length&&!pins.length)paragraph('Створи глобальну змінну в Code, наприклад int brightness = 20; — вона з’явиться тут автоматично.');
      actionButton('Повернути початкові значення Code',()=>{resetValues();draw();inspector();});return;
    }
    if(e) {
      field('Назва шару',e.name,v=>e.name=v.slice(0,100));
      section(c.class==='character'?'ПОЗИЦІЯ · КОМІРКИ':'ПОЗИЦІЯ · ПІКСЕЛІ');
      for(const [k,label] of [['x','X'],['y','Y'],['width','Ширина'],['height','Висота']])field(label,e[k],v=>e[k]=Math.round(v),{type:'number',min:k==='x'||k==='y'?-2048:1,max:2048,step:1});
      if(e.locked)paragraph('Шар заблоковано від переміщення, зміни розміру та видалення. Властивості можна редагувати.');
      section('ВИГЛЯД');
      if(['text','button'].includes(e.kind))field('Текст',e.text,v=>e.text=v.slice(0,1000));
      if(c.class!=='character') {
        if(['text','button'].includes(e.kind)){field('Шрифт',e.font,v=>e.font=v,{choices:[['sans','Sans · Arial'],['mono','Mono · Courier'],['serif','Serif · Georgia']]});field('Розмір тексту',e.fontSize,v=>e.fontSize=v,{type:'number',min:6,max:160});}
        field('Колір',e.color,v=>e.color=v,{type:'color'});
        if(e.kind!=='text')field('Заливка',e.fill,v=>e.fill=v,{type:'color'});
        if(['rectangle','button'].includes(e.kind))field('Заокруглення',e.radius,v=>e.radius=v,{type:'number',min:0,max:100});
      }
      if(e.kind==='image') {paragraph('PNG, JPEG або WebP, до 2 МБ і 1024×1024. У монохромному режимі — порогове перетворення у превʼю.');actionButton(e.image?'Замінити зображення':'Імпортувати зображення',()=>$('.dp-image-input').click());}
      if(['slider','progress'].includes(e.kind)) {
        field('Мінімум',e.min,v=>e.min=v,{type:'number',min:-100000,max:e.max-1});field('Максимум',e.max,v=>e.max=v,{type:'number',min:e.min+1,max:100000});field('Початкове значення',e.value,v=>e.value=v,{type:'number',min:e.min,max:e.max});
      }
      if(['text','button','progress','toggle','slider'].includes(e.kind)) {
        section('ПРИВ’ЯЗКА ДО ЗМІННОЇ');
        field('Змінна',e.binding,v=>e.binding=v,{choices:[['','Без прив’язки'],...doc.variables.filter(v=>e.kind==='toggle'?v.type==='boolean'&&!v.readonly:e.kind==='slider'?v.type==='number'&&!v.readonly:e.kind==='progress'?v.type==='number':true).map(v=>[v.name,`${v.name} · ${v.source==='code'?'Code · '+v.cppType:'Code · '+v.type}${v.readonly?' · лише читання':''}`])]});
        if(e.binding&&['text','button'].includes(e.kind)) {field('Перед значенням',e.prefix,v=>e.prefix=v.slice(0,100));field('Після значення',e.suffix,v=>e.suffix=v.slice(0,100));field('Десяткові знаки',e.decimals,v=>e.decimals=v,{type:'number',min:0,max:6,step:1});}
        if(!compatible(doc,e))paragraph('Тип змінної несумісний. Виберіть іншу змінну.','dp-warning');
      }
      if(c.class!=='character'&&['button','toggle','slider','image','rectangle','text'].includes(e.kind)) {
        section('ПОДІЯ ТА ДІЯ');
        field('Активація',e.input,v=>e.input=v,{choices:[['none','Без дотику · показ значення'],['physical','Зв’язок із фізичною кнопкою'],...(c.touch?[['touch','Дотик']]:[])]});
        if(e.input==='physical')paragraph('У превʼю клік моделює кнопку. Для фізичного екрана вибери «Дотик».');
        field('Дія',e.action.type,v=>e.action={type:v,page:doc.pages[0].id,variable:doc.variables[0]?.name||'',value:doc.variables[0]?.value??0,pin:2,level:true},{choices:[['none','Без додаткової дії'],['navigate','Перейти на сторінку'],['set','Змінити змінну'],['gpio','GPIO HIGH / LOW'],['custom','Власний C++ · не виконується']]});
        if(e.action.type==='navigate')field('Цільова сторінка',e.action.page,v=>e.action.page=v,{choices:doc.pages.map(p=>[p.id,p.name])});
        if(e.action.type==='set') {
          field('Змінна дії',e.action.variable,v=>{e.action.variable=v;e.action.value=doc.variables.find(x=>x.name===v)?.value??0;},{choices:[['','Оберіть змінну'],...doc.variables.map(v=>[v.name,v.name])]});
          const v=doc.variables.find(v=>v.name===e.action.variable);if(v)field('Задати значення',e.action.value,x=>e.action.value=x,{type:v.type==='number'?'number':v.type==='boolean'?'checkbox':'text'});
        }
        if(e.action.type==='gpio'){field('GPIO',e.action.pin,v=>e.action.pin=v,{type:'number',min:0,max:99,step:1});field('Рівень GPIO',e.action.mode==='toggle'?'toggle':e.action.level?'high':'low',v=>{e.action.mode=v==='toggle'?'toggle':'set';e.action.level=v==='high';},{choices:[['high','Встановити HIGH'],['low','Встановити LOW'],['toggle','Перемкнути HIGH ↔ LOW']]});paragraph('Допустимість піна та конфлікти з Build/Code ще не перевіряються.');}
        if(e.action.type==='custom')paragraph('Arduino C++ не виконується в локальному превʼю. Генерація та прив’язка обробників — наступний етап.');
      }
      section('ШАР');
      field('Приховати в редакторі',e.editorHidden,v=>e.editorHidden=v,{type:'checkbox',help:'Лише полотно редагування. Превʼю використовує окрему runtime-видимість.'});
      field('Видимий у превʼю / runtime',e.runtimeVisible,v=>e.runtimeVisible=v,{type:'checkbox'});
      field('Заблокувати шар',e.locked,v=>e.locked=v,{type:'checkbox'});
      const row=document.createElement('div');row.className='dp-layer-tools';row.innerHTML=btn('layer-up','На шар вище','up')+btn('layer-down','На шар нижче','down')+btn('duplicate','Дублювати · ⌘D','copy')+btn('delete','Видалити','trash');$('.dp-properties').append(row);
      return;
    }
    section('ФІЗИЧНИЙ ДИСПЛЕЙ');
    const presets=[...displayPresets,...personalDisplays()];
    const current=doc.hardware?.preset||doc.hardware?.profile||'';
    if(doc.hardware&&!presets.some(p=>p.id===current))presets.push({id:current,name:doc.hardware.name||'Мій дисплей',hardware:clone(doc.hardware)});
    field('Модель дисплея',current,v=>{
      delete doc.hardwarePreview;
      if(!v){delete doc.hardware;return;}
      const h=clone(presets.find(p=>p.id===v).hardware);h.preset=v;
      if(v==='waveshare169')try{const pins=JSON.parse(localStorage.getItem('pinway.waveshare169.pins'));if(pins&&!hardwareErrors({...h,pins}).length)h.pins=pins;}catch{}
      doc.hardware=h;Object.assign(c,displaySize(h),{class:'color'});
    },{choices:[['','Дисплей не вибрано'],...presets.map(p=>[p.id,p.name])]});
    actionButton('Додати дисплей',()=>addDevice());
    if(doc.hardware){const size=displaySize(doc.hardware);paragraph(`${doc.hardware.profile==='waveshare169'?'ST7789V2 · CST816':doc.hardware.library+' · '+doc.hardware.config.controller} · ESP32 · ${size.width} × ${size.height}`);actionButton('Налаштувати дисплей і контакти',hardwareDialog);paragraph('Драйвери, тач і запуск будуть підготовлені автоматично під час компіляції.');}
    else paragraph('Вибери свій модуль або додай його на основі підтримуваного драйвера.');
    section('ПОЛОТНО');
    if(c.class!=='character')field('Колір фону',c.background,v=>c.background=v,{type:'color'});
    field('Крок сітки',c.grid,v=>c.grid=Math.round(v),{type:'number',min:1,max:c.class==='character'?1:128,step:1});field('Прив’язка до сітки',c.snap,v=>c.snap=v,{type:'checkbox'});
    section('ПОТОЧНА СТОРІНКА');field('Назва сторінки',page().name,v=>page().name=v.trim().slice(0,100)||'Сторінка');
    actionButton('Видалити сторінку',()=>command('page-delete'));
    section('ЗМІННІ З CODE');
    paragraph('Створи глобальну змінну в Code — вона автоматично з’явиться тут і в прив’язках елементів. Початкове значення змінюй у коді.');
    for(const v of doc.variables.filter(v=>v.source==='code'))paragraph(`${v.name} · ${v.cppType} = ${v.value}${v.readonly?' · лише читання':''}`);
    if(!doc.variables.some(v=>v.source==='code'))paragraph('Наприклад: int brightness = 20;');
    section('ДОКУМЕНТ');actionButton('Експорт документа JSON',()=>command('export'));
    paragraph(doc.hardware||doc.hardwarePreview?.target==='TouchLed169/RGB565'?'Графіка й область дотику оновлюються автоматично під час компіляції або завантаження.':'Зображення зберігаються всередині документа. Апаратний адаптер для цього макета ще не налаштований.');
    if(recoveryWarning){paragraph(recoveryWarning,'dp-warning');actionButton('Відновити резервну чернетку',()=>{try{const r=JSON.parse(localStorage.getItem(recoveryKey()));validate(r.doc);edit(()=>{doc=r.doc;pageId=doc.pages[0].id;selection='';});recoveryWarning='';render();}catch(e){notice(e.message);}});}
  }
  function lists() {
    $('.dp-palette').innerHTML=availableKinds(doc).map(k=>`<button data-add="${k}" title="Додати: ${kinds[k]}"><span aria-hidden="true">${({text:'T',image:'▧',rectangle:'□',ellipse:'○',button:'▣',toggle:'◉',slider:'⊶',progress:'▰'})[k]}</span>${kinds[k]}</button>`).join('');
    $('.dp-page-list').innerHTML=doc.pages.map((p,i)=>`<div class="dp-page-row ${pageId===p.id?'is-selected':''}"><button class="dp-list-item" data-page="${p.id}" aria-current="${pageId===p.id?'page':'false'}" title="${esc(p.name)}${i===0?' · Стартова сторінка':''}"><span class="dp-page-symbol">${i===0?'⌂':'▤'}</span><span>${esc(p.name)}</span><small>${p.elements.length}</small></button><button class="dp-page-actions" data-do="page-menu" data-page-target="${p.id}" aria-label="Дії сторінки «${esc(p.name)}»" title="Дії сторінки" aria-haspopup="menu">⋯</button></div>`).join('');
    $('#dp-layer-count').textContent=page().elements.length;
    $('.dp-layer-list').innerHTML=[...page().elements].reverse().map(e=>`<div class="dp-layer-row ${selection===e.id?'is-selected':''}"><button class="dp-layer-name" data-select="${e.id}"><span class="dp-kind-symbol">${e.kind==='text'?'T':e.kind==='image'?'▧':'◇'}</span><span>${esc(e.name)}</span></button>${btn('hide','Приховати лише в редакторі','eye',`data-id="${e.id}" aria-pressed="${e.editorHidden}"`)}${btn('lock','Блокування шару','lock',`data-id="${e.id}" aria-pressed="${e.locked}"`)}</div>`).join('')||'<p class="dp-layer-empty">Поки що порожньо.<br>Додайте перший елемент вище.</p>';
  }
  function artwork(e,preview=false,generating=false,levels=gpioValues,testValues=values) {
    const c=doc.canvas,cells=c.class==='character',unitX=cells?12:1,unitY=cells?24:1,x=e.x*unitX,y=e.y*unitY,w=e.width*unitX,h=e.height*unitY;
    const value=preview?boundValue(doc,e,testValues):boundValue(doc,e,{}),effective=preview?(e.binding?value:localValues[e.id]??e.value):value;
    const fill=c.class==='mono'?'#ffffff':preview&&e.action.type==='gpio'&&e.action.mode==='toggle'&&levels[e.action.pin]?'#35d58a':e.fill,color=c.class==='mono'?'#ffffff':e.color;
    if(!generating&&hardwareFrame(doc,pageId,preview?gpioValues:{},preview?values:{})) return `<g data-element="${e.id}" transform="translate(${x},${y})" ${preview&&e.input!=='none'?'class="dp-interactive"':''}><rect width="${w}" height="${h}" fill="transparent"/></g>`;
    const text=esc(displayText(doc,e,preview?testValues:{}));
    let content='';
    if(['rectangle','button'].includes(e.kind))content=`<rect width="${w}" height="${h}" rx="${e.radius}" fill="${fill}"/>`;
    if(e.kind==='ellipse')content=`<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" fill="${fill}"/>`;
    if(['text','button'].includes(e.kind))content+=`<text x="${e.kind==='button'?w/2:0}" y="${cells?18:h/2}" dominant-baseline="${cells?'auto':'central'}" text-anchor="${e.kind==='button'?'middle':'start'}" font-family="${esc(fonts[e.font])}" font-size="${cells?16:e.fontSize}" fill="${e.kind==='button'&&c.class==='mono'?'#000000':color}">${text}</text>`;
    if(e.kind==='image')content=e.image?`<image href="${esc(e.image)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${c.class==='mono'?'filter="url(#dp-threshold)"':''}/>`:`<rect width="${w}" height="${h}" rx="4" fill="#252d38" stroke="#59667c" stroke-dasharray="4 4"/><text x="${w/2}" y="${h/2}" dominant-baseline="central" text-anchor="middle" fill="#abb5c7" font-size="12">Зображення</text>`;
    if(e.kind==='toggle')content=`<rect width="${w}" height="${h}" rx="${h/2}" fill="${effective?fill:'#3c4350'}"/><circle cx="${effective?w-h/2:h/2}" cy="${h/2}" r="${Math.max(1,h/2-4)}" fill="${c.class==='mono'&&effective?'#000':'#fff'}"/>`;
    if(['slider','progress'].includes(e.kind)) {
      const ratio=Math.max(0,Math.min(1,(Number(effective)-e.min)/(e.max-e.min))),th=e.kind==='slider'?Math.min(6,h):h;
      content=`<rect y="${(h-th)/2}" width="${w}" height="${th}" rx="${th/2}" fill="#353d49"/><rect y="${(h-th)/2}" width="${w*ratio}" height="${th}" rx="${th/2}" fill="${fill}"/>`;
      if(e.kind==='slider')content+=`<circle cx="${Math.max(7,Math.min(w-7,w*ratio))}" cy="${h/2}" r="${Math.min(h/2,8)}" fill="#fff"/>`;
    }
    return `<g data-element="${e.id}" transform="translate(${x},${y})" ${preview&&e.input!=='none'?'class="dp-interactive"':''}><rect width="${w}" height="${h}" fill="transparent"/>${content}</g>`;
  }
  function draw() {
    if(!ready||!enabled)return;
    const c=doc.canvas,cells=c.class==='character',w=c.width*(cells?12:1),h=c.height*(cells?24:1),preview=mode==='preview';
    const starting=!doc.hardware&&!doc.pages.some(p=>p.elements.length);
    $('.dp-start').hidden=!starting;$('.dp-screen-group').hidden=starting||mode==='map';$('.dp-map').hidden=starting||mode!=='map';
    if(mode==='map'){drawMap();return;}
    screen.setAttribute('viewBox',`0 0 ${w} ${h}`);screen.style.width=w*scale+'px';screen.style.height=h*scale+'px';
    const gridX=cells?12:c.grid,gridY=cells?24:c.grid;
    screen.innerHTML=`<defs><pattern id="dp-grid" width="${gridX}" height="${gridY}" patternUnits="userSpaceOnUse"><path d="M ${gridX} 0 L 0 0 0 ${gridY}" fill="none" stroke="${cells?'#527366':'#c0d0e0'}" stroke-width=".4" opacity=".25"/></pattern><filter id="dp-threshold" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 1"/><feFuncG type="discrete" tableValues="0 1"/><feFuncB type="discrete" tableValues="0 1"/></feComponentTransfer></filter></defs><rect width="${w}" height="${h}" fill="${cells?'#18372b':c.class==='mono'?'#000000':c.background}"/>`+
      (hardwareFrame(doc,pageId,preview?gpioValues:{},preview?values:{})?`<image href="${esc(hardwareFrame(doc,pageId,preview?gpioValues:{},preview?values:{}))}" width="${w}" height="${h}" style="image-rendering:pixelated" pointer-events="none"/>`:'')+
      (!preview?`<rect width="${w}" height="${h}" fill="url(#dp-grid)" pointer-events="none"/>`:'')+
      page().elements.filter(e=>availableKinds(doc).includes(e.kind)&&(preview?e.runtimeVisible:!e.editorHidden)).map(e=>artwork(e,preview)).join('');
    const e=selected();
    if(!preview&&e&&!e.editorHidden&&availableKinds(doc).includes(e.kind)) {
      const x=e.x*(cells?12:1),y=e.y*(cells?24:1),ew=e.width*(cells?12:1),eh=e.height*(cells?24:1),s=6/scale;
      screen.innerHTML+=`<g pointer-events="none"><rect x="${x}" y="${y}" width="${ew}" height="${eh}" fill="none" stroke="${e.locked?'#ffb030':'#4c8dff'}" stroke-width="${1/scale}"/></g>`;
      if(!e.locked)screen.innerHTML+=`<rect data-handle="resize" x="${x+ew-s/2}" y="${y+eh-s/2}" width="${s}" height="${s}" fill="white" stroke="#4c8dff" stroke-width="${1/scale}"/>`;
    }
    if(!preview)for(const g of guides)screen.innerHTML+=`<line x1="${g.axis==='x'?g.value:0}" x2="${g.axis==='x'?g.value:w}" y1="${g.axis==='y'?g.value:0}" y2="${g.axis==='y'?g.value:h}" stroke="#ff4fa3" stroke-width="${1/scale}" pointer-events="none"/>`;
    $('.dp-screen-caption').textContent=(preview?'● ПРЕВʼЮ':'РЕДАГУВАННЯ')+'  /  '+page().name;
    $('.dp-screen-meta').textContent=`${c.width} × ${c.height} ${cells?'комірок':'px'} · ${c.class==='mono'?'1-bit · ':''}${hardwareFrame(doc,pageId)?'RGB565 · кадр прошивки · ':''}${preview?'Локальні дані · без плати':'Перетягніть елемент · потягніть кут для розміру'}`;
  }
  function drawMap() {
    const target=$('.dp-map');target.innerHTML='<div class="dp-map-heading"><h1>Мапа сторінок</h1><p>Миттєві переходи. Натисніть сторінку, щоб її відкрити.</p></div><div class="dp-map-cards"></div><div class="dp-map-links"></div>';
    const cards=target.querySelector('.dp-map-cards');
    for(const p of doc.pages){const b=document.createElement('button');b.dataset.mapPage=p.id;b.className='dp-map-card';b.innerHTML=`<span>${esc(p.name)}</span><svg viewBox="0 0 ${doc.canvas.width*(doc.canvas.class==='character'?12:1)} ${doc.canvas.height*(doc.canvas.class==='character'?24:1)}"><rect width="100%" height="100%" fill="${doc.canvas.class==='character'?'#18372b':doc.canvas.class==='mono'?'#000':doc.canvas.background}"/>${hardwareFrame(doc,p.id)?`<image href="${esc(hardwareFrame(doc,p.id))}" width="${doc.canvas.width}" height="${doc.canvas.height}" style="image-rendering:pixelated"/>`:''}${p.elements.filter(e=>e.runtimeVisible&&availableKinds(doc).includes(e.kind)).map(e=>artwork(e)).join('')}</svg><small>${p.elements.length} шарів</small>`;cards.append(b);}
    const links=target.querySelector('.dp-map-links');
    for(const p of doc.pages)for(const e of p.elements.filter(e=>e.action.type==='navigate')){const next=doc.pages.find(p=>p.id===e.action.page);const b=document.createElement('button');b.dataset.mapPage=next?.id||p.id;b.textContent=`${p.name}  →  ${next?.name||'Відсутня сторінка'}   ·   ${e.name}${e.input==='none'?' · програмно':''}`;links.append(b);}
    if(!links.children.length)links.textContent='Зв’язків поки немає. Оберіть елемент і призначте дію «Перейти на сторінку».';
    requestAnimationFrame(()=>{
      if(mode!=='map'||!target.isConnected)return;
      const bounds=cards.getBoundingClientRect();let content='<defs><marker id="dp-map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#4c8dff" stroke="none"/></marker></defs>';
      for(const p of doc.pages)for(const e of p.elements.filter(e=>e.action.type==='navigate')) {
        const a=cards.querySelector(`[data-map-page="${p.id}"]`),b=[...cards.querySelectorAll('[data-map-page]')].find(b=>b.dataset.mapPage===e.action.page);if(!a||!b)continue;
        const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
        const x1=ar.right-bounds.left,y1=ar.top+ar.height/2-bounds.top,x2=br.left-bounds.left,y2=br.top+br.height/2-bounds.top;
        content+=`<path d="M${x1} ${y1} C${x1+28} ${y1-30},${x2-28} ${y2-30},${x2} ${y2}" marker-end="url(#dp-map-arrow)"/>`;
      }
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('dp-map-wires');svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);svg.innerHTML=content;cards.append(svg);
    });
  }
  function state() {
    const isDirty=dirty();root.classList.toggle('dp-dirty',isDirty);
    $('.dp-save-state').textContent=!ready?'Відкрийте проєкт':isDirty?'Незбережені зміни':'Збережено в проєкті';
    for(const [a,disabled]of [['undo',!history.length],['redo',!future.length],['save',!ready]])root.querySelector(`[data-do="${a}"]`).disabled=disabled||!ready;
    root.querySelector('[data-do="grid"]').setAttribute('aria-pressed',String(doc.canvas.snap));
    for(const a of ['edit','preview','map'])root.querySelector(`[data-do="${a}"]`).setAttribute('aria-pressed',String(mode===a));
    $('.dp-zoom').textContent=Math.round(scale*100)+'%';
  }
  function render() {lists();inspector();draw();state();if(ready){const warnings=issues(doc);if(warnings.length)notice(`⚠ ${warnings.length}: ${warnings[0].text}`);else if($('.dp-message').textContent.startsWith('⚠ '))notice('');}}
  function fit() {if(!enabled||!ready)return;const cells=doc.canvas.class==='character';scale=Math.max(.15,Math.min(3,(stage.clientWidth-70)/(doc.canvas.width*(cells?12:1)),(stage.clientHeight-130)/(doc.canvas.height*(cells?24:1))));draw();state();}
  function copy() {const e=selected();if(e)clipboard=clone(e);}
  function paste() {if(!clipboard)return;edit(()=>{if(page().elements.length>=200)return;const e=clone(clipboard);e.id=uid();e.name+=' · копія';e.x+=doc.canvas.class==='character'?1:8;e.y+=doc.canvas.class==='character'?0:8;e.locked=false;page().elements.push(e);selection=e.id;});}
  function closePageMenu(){if(pageMenu){pageMenu.remove();pageMenu=null;}}
  function showPageMenu(target) {
    closePageMenu();const id=target.dataset.pageTarget,index=doc.pages.findIndex(p=>p.id===id),p=doc.pages[index];if(!p)return;
    const menu=document.createElement('div');menu.className='dp-page-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',`Дії сторінки «${p.name}»`);
    const actions=[['page-rename','Перейменувати',false],['page-duplicate','Дублювати',doc.pages.length>=40],['page-home','Зробити стартовою',index===0],['page-up','Перемістити вище',index===0],['page-down','Перемістити нижче',index===doc.pages.length-1],['page-delete','Видалити сторінку',doc.pages.length===1]];
    menu.innerHTML=actions.map(([action,label,disabled])=>`<button type="button" role="menuitem" data-action="${action}" ${disabled?'disabled':''} ${action==='page-delete'?'class="dp-danger"':''}>${label}</button>`).join('');
    document.body.append(menu);pageMenu=menu;
    const r=target.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,r.bottom+5))+'px';
    menu.onclick=ev=>{const button=ev.target.closest('button');if(!button||button.disabled)return;const action=button.dataset.action;closePageMenu();command(action,{dataset:{pageTarget:id}});};
    menu.onkeydown=ev=>{const options=[...menu.querySelectorAll('button:not(:disabled)')],i=options.indexOf(document.activeElement);if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();options[(i+(ev.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}if(ev.key==='Escape'){ev.preventDefault();closePageMenu();target.focus();}};
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  document.addEventListener('pointerdown',ev=>{if(pageMenu&&!pageMenu.contains(ev.target)&&!ev.target.closest('[data-do="page-menu"]'))closePageMenu();});
  function command(action,target) {
    if(action==='new-project')return onNew();
    if(action==='open-project')return onOpen();
    if(!ready)return;
    if(action==='device-add')return addDevice();
    const e=selected();
    if(['edit','preview','map'].includes(action)){mode=action;drag=null;guides=[];if(mode==='preview')resetValues();notice(mode==='preview'?'Клік моделює тільки явно призначену подію. Реальна плата не використовується.':'');render();return;}
    if(action==='save'){void onSave().catch(e=>notice(e.message));return;}
    if(action==='canvas'){selection='';inspector();draw();return;}
    if(action==='undo'||action==='redo'){if(drag)return;const from=action==='undo'?history:future,to=action==='undo'?future:history;if(!from.length)return;to.push(snapshot());doc=JSON.parse(from.pop());if(!doc.pages.some(p=>p.id===pageId))pageId=doc.pages[0].id;recover();onChange();render();return;}
    if(action==='copy')return copy();if(action==='paste')return paste();if(action==='duplicate'){copy();paste();return;}
    if(action==='delete'){if(!e||e.locked)return;edit(()=>{page().elements=page().elements.filter(x=>x.id!==e.id);selection='';});return;}
    if(action==='page-add'){if(doc.pages.length>=40)return notice('До 40 сторінок у документі.');edit(()=>{const p={id:uid(),name:`Сторінка ${doc.pages.length+1}`,elements:[]};doc.pages.push(p);pageId=p.id;selection='';});return;}
    if(action==='page-menu')return showPageMenu(target);
    if(['page-rename','page-duplicate','page-home','page-up','page-down','page-delete'].includes(action)) {
      const id=target?.dataset?.pageTarget||pageId,index=doc.pages.findIndex(p=>p.id===id),p=doc.pages[index];if(!p)return;
      if(action==='page-duplicate'){edit(()=>{const copy=duplicatePage(doc,id);if(copy){pageId=copy;selection='';}});return;}
      if(['page-home','page-up','page-down'].includes(action)){edit(()=>movePage(doc,id,action==='page-home'?0:index+(action==='page-up'?-1:1)));return;}
      const projectOwner=owner;
      const dialog=document.createElement('dialog');dialog.className='dp-confirm';
      if(action==='page-rename'){
        dialog.innerHTML=`<form><h2>Перейменувати сторінку</h2><label>Назва сторінки<input name="pageName" aria-label="Нова назва сторінки" maxlength="100" required value="${esc(p.name)}"/></label><div><button type="button" data-cancel>Скасувати</button><button type="submit">Зберегти назву</button></div></form>`;
        dialog.querySelector('form').onsubmit=ev=>{ev.preventDefault();const name=dialog.querySelector('input').value.trim();if(!name)return;if(owner===projectOwner)edit(()=>{const current=doc.pages.find(x=>x.id===id);if(current)current.name=name;});dialog.close();};
      }else{
        if(doc.pages.length===1)return notice('У документі має залишитися хоча б одна сторінка.');
        const links=doc.pages.flatMap(p=>p.elements).filter(e=>e.action.type==='navigate'&&e.action.page===id).length;
        dialog.innerHTML=`<h2>Видалити «${esc(p.name)}»?</h2><p>Шарів: ${p.elements.length}. Переходів на цю сторінку: ${links}${links?' — їх буде скинуто':''}. Видалення можна скасувати через ⌘Z.</p><div><button data-cancel autofocus>Залишити</button><button data-delete>Видалити сторінку</button></div>`;
        dialog.querySelector('[data-delete]').onclick=()=>{if(owner===projectOwner)edit(()=>{const next=removePage(doc,id);if(next&&pageId===id){pageId=next;selection='';}});dialog.close();};
      }
      document.body.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();if(action==='page-rename')dialog.querySelector('input').select();return;
    }
    if(action==='layer-up'||action==='layer-down'){if(!e||e.locked)return;edit(()=>{const a=page().elements,i=a.indexOf(e),j=Math.max(0,Math.min(a.length-1,i+(action==='layer-up'?1:-1)));[a[i],a[j]]=[a[j],a[i]];});return;}
    if(action==='hide'||action==='lock') {edit(()=>{const e=page().elements.find(x=>x.id===target.dataset.id);if(e)e[action==='hide'?'editorHidden':'locked']=!e[action==='hide'?'editorHidden':'locked'];});return;}
    if(action==='grid') {edit(()=>doc.canvas.snap=!doc.canvas.snap);return;}
    if(action==='fit')return fit();
    if(action.startsWith('zoom-')){scale=action==='zoom-reset'?1:Math.max(.15,Math.min(6,scale*(action==='zoom-in'?1.25:.8)));draw();state();return;}
    if(action==='export') {const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pinway-display.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  root.onclick=ev=> {
    const target=ev.target.closest('button');if(!target)return;
    if(target.dataset.do)return command(target.dataset.do,target);
    if(!ready)return;
    if(target.dataset.add){if(mode!=='edit')return notice('Для додавання перейдіть у редактор.');if(page().elements.length>=200)return notice('До 200 елементів на сторінці.');edit(()=>{const e=element(target.dataset.add,doc);page().elements.push(e);selection=e.id;});}
    if(target.dataset.page||target.dataset.mapPage){pageId=target.dataset.page||target.dataset.mapPage;selection='';if(target.dataset.mapPage)mode='edit';render();}
    if(target.dataset.select){selection=target.dataset.select;render();}
  };
  const point=ev=>{const r=screen.getBoundingClientRect(),c=doc.canvas;return {x:(ev.clientX-r.left)/scale/(c.class==='character'?12:1),y:(ev.clientY-r.top)/scale/(c.class==='character'?24:1)};};
  function previewInteraction(e,ev) {
    const next=e.min+Math.max(0,Math.min(1,(point(ev).x-e.x)/e.width))*(e.max-e.min);
    const result=interact(doc,e,values,next,gpioValues);values=result.values;gpioValues=result.gpio;
    if(e.input!=='none'&&(e.input!=='touch'||doc.canvas.touch)&&(!e.binding)&&['toggle','slider'].includes(e.kind))localValues[e.id]=e.kind==='toggle'?!Boolean(localValues[e.id]??e.value):Math.round(next);
    if(result.page){pageId=result.page;selection='';}
    if(result.message)notice(result.message);draw();inspector();
  }
  screen.onpointerdown=ev=> {
    if(!ready||drag||ev.button!==0)return;
    const hit=ev.target.closest('[data-element]'),handle=ev.target.closest('[data-handle]'),e=hit?page().elements.find(e=>e.id===hit.dataset.element):handle?selected():null;
    if(mode==='preview'){if(e){previewInteraction(e,ev);if(e.kind==='slider'&&e.input!=='none'){drag={kind:'preview',id:e.id,pointer:ev.pointerId};screen.setPointerCapture(ev.pointerId);}}return;}
    if(mode!=='edit')return;
    selection=e?.id||'';render();stage.focus();if(!e||e.locked)return;
    ev.preventDefault();drag={kind:handle?'resize':'move',pointer:ev.pointerId,id:e.id,start:point(ev),element:clone(e),before:snapshot()};screen.setPointerCapture(ev.pointerId);
  };
  screen.onpointermove=ev=> {
    if(!drag||drag.pointer!==ev.pointerId)return;
    const e=page().elements.find(e=>e.id===drag.id);if(!e)return;
    if(drag.kind==='preview'){previewInteraction(e,ev);return;}
    const p=point(ev),dx=p.x-drag.start.x,dy=p.y-drag.start.y,c=doc.canvas,grid=c.class==='character'?1:c.snap?c.grid:1;
    const snap=v=>Math.round(v/grid)*grid;guides=[];
    if(drag.kind==='resize'){e.width=Math.max(1,Math.min(2048,snap(drag.element.width+dx)));e.height=Math.max(1,Math.min(2048,snap(drag.element.height+dy)));}
    else {
      e.x=Math.max(-2048,Math.min(2048,snap(drag.element.x+dx)));e.y=Math.max(-2048,Math.min(2048,snap(drag.element.y+dy)));
      if(c.class!=='character')for(const axis of ['x','y']) {
        const size=axis==='x'?'width':'height',points=[0,c[size]/2,c[size],...page().elements.filter(x=>x.id!==e.id&&!x.editorHidden).flatMap(x=>[x[axis],x[axis]+x[size]/2,x[axis]+x[size]])];
        let best=4/scale,match=null;
        for(const anchor of [0,e[size]/2,e[size]])for(const target of points){const distance=Math.abs(e[axis]+anchor-target);if(distance<best){best=distance;match={value:target,position:target-anchor};}}
        if(match){e[axis]=Math.round(match.position);guides.push({axis,value:match.value});}
      }
    }
    draw();
  };
  function endDrag(cancel=false) {
    if(!drag)return;const old=drag;drag=null;guides=[];
    if(old.kind!=='preview'){if(cancel)doc=JSON.parse(old.before);else changed(old.before);}
    if(screen.hasPointerCapture(old.pointer))screen.releasePointerCapture(old.pointer);render();
  }
  screen.onpointerup=()=>endDrag();screen.onpointercancel=()=>endDrag(true);screen.onlostpointercapture=()=>{if(drag)endDrag(true);};
  stage.onwheel=ev=>{if(!ev.metaKey&&!ev.ctrlKey)return;ev.preventDefault();scale=Math.max(.15,Math.min(6,scale*Math.exp(-ev.deltaY*.005)));draw();state();};
  document.addEventListener('keydown',ev=> {
    if(!enabled||!ready||pageMenu||document.querySelector('dialog[open]')||ev.target.closest('input,textarea,select,[contenteditable=true]'))return;
    const mod=ev.metaKey||ev.ctrlKey,k=ev.key.toLowerCase();
    const action=mod?({s:'save',z:ev.shiftKey?'redo':'undo',y:'redo',c:'copy',v:'paste',d:'duplicate'}[k]):({delete:'delete',backspace:'delete'}[k]);
    if(action){ev.preventDefault();ev.stopImmediatePropagation();command(action);return;}
    if(k==='escape'){endDrag(true);selection='';render();}
    if(mode==='edit'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)) {const e=selected();if(!e||e.locked)return;ev.preventDefault();edit(()=>{const n=ev.shiftKey?10:1;e.x+=(ev.key==='ArrowLeft'?-n:ev.key==='ArrowRight'?n:0);e.y+=(ev.key==='ArrowUp'?-n:ev.key==='ArrowDown'?n:0);});}
  },true);
  $('.dp-image-input').onchange=async ev=> {
    const file=ev.target.files[0],id=selection,projectOwner=owner;ev.target.value='';if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)return notice('Оберіть PNG, JPEG або WebP до 2 МБ.');
    try {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      const image=new Image();image.src=data;await image.decode();
      if(image.width>1024||image.height>1024)return notice('Максимальний розмір зображення — 1024×1024.');
      if(owner!==projectOwner||!ready)return;
      edit(()=>{const e=page().elements.find(e=>e.id===id);if(e?.kind==='image')e.image=data;});
    } catch {notice('Не вдалося прочитати зображення.');}
  };
  new ResizeObserver(()=>{if(enabled)draw();}).observe(stage);
  return {
    showGenerationConflicts(conflicts){
      const dialog=document.createElement('dialog');dialog.className='dp-confirm dp-generation-diff';
      const title=document.createElement('h2');title.textContent='Збережено твої ручні зміни';dialog.append(title);
      const help=document.createElement('p');help.textContent='Pinway не перезаписав ці файли. Порівняй поточний код із запропонованим; після узгодження повтори збірку.';dialog.append(help);
      for(const change of conflicts){const name=document.createElement('h3');name.textContent=change.file;const pre=document.createElement('pre');pre.textContent=change.diff||('ПОТОЧНИЙ ФАЙЛ\n'+change.current+'\nЗАПРОПОНОВАНИЙ PINWAY\n'+change.proposed);dialog.append(name,pre);}
      const button=document.createElement('button');button.textContent='Залишити мої файли';button.onclick=()=>dialog.close();dialog.append(button);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
    },
    refreshCode,
    get active(){return enabled;},get dirty(){return dirty();},
    async prepareBuild() {
      if(!ready)throw Error('Дочекайтеся відкриття Display перед компіляцією.');
      await refreshCode();
      const scene=scenePlan(doc);
      if(scene){
        const projectOwner=owner,source=firmwareSource(doc),signature=canonical(source),code=await codeSource(),initial=Object.fromEntries(doc.variables.map(v=>[v.name,v.value]));
        const pages=[],previews=[];let total=0;
        const raster=async(p,value)=>{
          const testValues=scene.variable?{...initial,[scene.variable.name]:value}:initial,levels=scene.mode==='gpio'?{[scene.gpio]:!!value}:{};
          const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}"><rect width="${scene.width}" height="${scene.height}" fill="${doc.canvas.background}"/>${p.elements.filter(e=>e.runtimeVisible).map(e=>artwork(e,true,true,levels,testValues)).join('')}</svg>`;
          const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
          const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,scene.width,scene.height),frame=rgb565Frame(data.data);data.data.set(frame.pixels);ctx.putImageData(data,0,0);return {...frame,image:canvas.toDataURL('image/png')};
        };
        for(let i=0;i<scene.pages.length;i++){
          const p=doc.pages[i],plan=scene.pages[i],baseFrame=await raster(p,scene.initial),patches=[],images=[];
          for(let value=plan.dynamic?scene.min:scene.initial;value<=(plan.dynamic?scene.max:scene.initial);value++){
            const frame=value===scene.initial?baseFrame:await raster(p,value),delta=deltaRuns(baseFrame.pixels,frame.pixels);patches.push(delta);images.push(frame.image);total+=delta.length;
            if(total>85000)throw Error('Забагато динамічної графіки для ESP32. Зменш розмір тексту або діапазон.');
          }
          pages.push({...plan,base:baseFrame.runs,patches});previews.push({id:p.id,images});
        }
        if(owner!==projectOwner||canonical(firmwareSource(doc))!==signature||await codeSource()!==code)throw Error('Код або макет змінився під час підготовки. Повтори завантаження.');
        doc.hardwarePreview={target:'TouchLed169/RGB565',source,page:source.pages[0].id,pin:scene.gpio,frames:{off:previews[0].images[0],on:previews[0].images[0]},dynamic:{name:scene.variable?.name||'_pinway_state',mode:scene.mode,min:scene.min,max:scene.max,initial:scene.initial,pages:previews}};
        recover();state();render();return {source,scene:{...scene,pages,code}};
      }
      const plan=dynamicPlan(doc);
      if(plan) {
        const projectOwner=owner,source=firmwareSource(doc),signature=canonical(source),code=await codeSource();
        const initial=Object.fromEntries(doc.variables.map(v=>[v.name,v.value]));
        async function raster(testValues) {
          const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280"><rect width="240" height="280" fill="${doc.canvas.background}"/>${doc.pages[0].elements.filter(e=>e.runtimeVisible).map(e=>artwork(e,true,true,{},testValues)).join('')}</svg>`;
          const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
          const canvas=document.createElement('canvas');canvas.width=240;canvas.height=280;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
          const data=ctx.getImageData(0,0,240,280),frame=rgb565Frame(data.data);data.data.set(frame.pixels);ctx.putImageData(data,0,0);
          return {...frame,image:canvas.toDataURL('image/png')};
        }
        const baseFrame=await raster(initial),patches=[],images=[];let count=0;
        for(let value=plan.min;value<=plan.max;value++) {
          const frame=await raster({...initial,[plan.name]:value}),delta=deltaRuns(baseFrame.pixels,frame.pixels);
          patches.push(delta);images.push(frame.image);count+=delta.length;
          if(count>85000)throw Error('Графіка прив’язки завелика для ESP32. Зменш розмір динамічного тексту або діапазон повзунка.');
        }
        if(projectOwner!==owner||canonical(firmwareSource(doc))!==signature||await codeSource()!==code)throw Error('Код або макет змінився під час підготовки. Повтори завантаження.');
        doc.hardwarePreview={target:'TouchLed169/RGB565',source,page:source.pages[0].id,pin:14,frames:{off:baseFrame.image,on:baseFrame.image},dynamic:{name:plan.name,min:plan.min,max:plan.max,initial:plan.initial,images}};
        notice('Графіку та прив’язку до Code підготовлено.');recover();state();render();
        return {source,runs:{off:baseFrame.runs,on:baseFrame.runs},dynamic:{...plan,patches,code}};
      }
      const button=firmwareButton(doc);if(!button)return null;
      if(drag)endDrag();
      const projectOwner=owner,source=firmwareSource(doc),signature=canonical(source),frames={},runs={};
      for(const name of ['off','on']) {
        const levels={14:name==='on'};
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280" viewBox="0 0 240 280"><rect width="240" height="280" fill="${doc.canvas.background}"/>${doc.pages[0].elements.filter(e=>e.runtimeVisible).map(e=>artwork(e,true,true,levels)).join('')}</svg>`;
        const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
        try {
          const image=new Image();image.src=url;await image.decode();
          const canvas=document.createElement('canvas');canvas.width=240;canvas.height=280;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
          const data=ctx.getImageData(0,0,240,280),frame=rgb565Frame(data.data);
          data.data.set(frame.pixels);ctx.putImageData(data,0,0);frames[name]=canvas.toDataURL('image/png');runs[name]=frame.runs;
        } catch(e) {throw Error('Не вдалося підготувати графіку Display: '+e.message);}
      }
      if(owner!==projectOwner||canonical(firmwareSource(doc))!==signature)throw Error('Макет змінився під час підготовки. Натисніть «Завантажити» ще раз.');
      doc.hardwarePreview={target:'TouchLed169/RGB565',source,page:source.pages[0].id,pin:14,frames};
      recover();state();render();
      return {source,button,runs};
    },
    async save() {
      if(!ready||!owner||(!visited&&base===null&&!dirty()))return saving;
      if(drag)endDrag();
      const root=owner,value=clone(doc);
      const pending=saving.catch(()=>{}).then(async()=> {
        if(root!==owner)throw Error('Проєкт змінився перед збереженням Display.');
        if(JSON.stringify(value)===saved && base!==null)return;
        validate(value);await call('display',{op:'save',root,document:value,base});
        if(root===owner){base=value;saved=JSON.stringify(value);recover();state();}
      });saving=pending;return pending;
    },
    discardChanges(){if(owner)localStorage.removeItem(recoveryKey());saved=snapshot();},
    async setProject(project) {
      closePageMenu();endDrag(true);recover();const ticket=++loading;ready=false;visited=false;owner=project?.root||null;doc=fresh();base=null;saved=snapshot();selection='';pageId=doc.pages[0].id;history=[];future=[];clipboard=null;mode='edit';recoveryWarning='';guides=[];notice('');root.hidden=!enabled;
      $('.dp-empty').hidden=!!owner;root.classList.toggle('dp-no-project',!owner);render();if(!owner)return;
      const projectOwner=owner;
      try {
        const disk=await call('display',{op:'load',root:projectOwner});if(ticket!==loading)return;
        if(disk)validate(disk);base=clone(disk);doc=disk||fresh();saved=JSON.stringify(doc);
        if(preferences().restore) {
          const raw=localStorage.getItem(recoveryKey());if(raw) {try{const r=JSON.parse(raw);validate(r.doc);if(canonical(r.base)===canonical(base)){doc=r.doc;notice('Відновлено незбережену чернетку Display.');}else recoveryWarning='Резервна чернетка відрізняється від версії на диску. Відновлення замінить поточний макет після вашого збереження.';}catch{recoveryWarning='Резервна чернетка пошкоджена. Версію на диску збережено.';}}
        }
        pageId=doc.pages[0].id;ready=true;visited=enabled;await refreshCode();resetValues();render();if(enabled)fit();
      } catch(e) {if(ticket===loading){notice('Display не відкрито: '+e.message);$('.dp-save-state').textContent='Помилка відкриття · файл збережено';}}
    },
    activate(value) {if(!value){closePageMenu();endDrag();}enabled=value;if(value&&owner)visited=true;root.hidden=!value;onVisibility(value);if(value){void refreshCode();render();requestAnimationFrame(()=>fit());}},
    shortcut(action) {
      if(!enabled)return false;
      if(action==='save'){command('save');return true;}
      return false;
    }
  };
}
