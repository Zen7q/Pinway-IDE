import {clone, validate} from './model.mjs';

export function firmwareSource(doc) {
  const {hardwarePreview, ...source}=clone(doc);
  return source;
}
export function firmwareButton(doc) {
  validate(doc);
  if(doc.hardwarePreview?.target!=='TouchLed169/RGB565')return null;
  const c=doc.canvas;
  if(c.class!=='color'||c.width!==240||c.height!==280||!c.touch||doc.pages.length!==1)
    throw Error('Цей дисплей підтримує одну touch-сторінку 240 × 280 без тестових змінних. Прошивання зупинено.');
  const all=doc.pages[0].elements.filter(e=>e.runtimeVisible);
  if(all.some(e=>e.binding||!['none','gpio'].includes(e.action.type)||(['toggle','slider'].includes(e.kind))))
    throw Error('Для цього прикладу підтримуються статична графіка та одна touch-кнопка GPIO14. Прошивання зупинено.');
  const buttons=all.filter(e=>e.action.type==='gpio');
  const b=buttons[0];
  if(buttons.length!==1||b.kind!=='button'||b.input!=='touch'||b.action.pin!==14||b.action.mode!=='toggle')
    throw Error('Залиш одну touch-кнопку з дією GPIO14 → Перемкнути HIGH ↔ LOW.');
  if(![b.x,b.y,b.width,b.height].every(Number.isInteger)||b.x<0||b.y<0||b.x+b.width>240||b.y+b.height>280)
    throw Error('Touch-кнопка має бути всередині дисплея й мати цілі координати.');
  return {x:b.x,y:b.y,width:b.width,height:b.height};
}
export function rgb565Frame(rgba) {
  const pixels=new Uint8ClampedArray(rgba.length),runs=[];
  for(let i=0;i<rgba.length;i+=4){
    const r=rgba[i]>>3,g=rgba[i+1]>>2,b=rgba[i+2]>>3,word=r<<11|g<<5|b;
    pixels.set([r<<3|r>>2,g<<2|g>>4,b<<3|b>>2,255],i);
    const last=runs.at(-1);
    if(last&&last[1]===word&&last[0]<65535)last[0]++;else runs.push([1,word]);
  }
  return {pixels,runs};
}

export function dynamicPlan(doc) {
  if(doc.hardwarePreview?.target!=='TouchLed169/RGB565')return null;
  const bound=doc.pages.flatMap(p=>p.elements).filter(e=>e.runtimeVisible&&e.binding);
  if(!bound.length)return null;
  if(doc.pages.length!==1||doc.canvas.width!==240||doc.canvas.height!==280||!doc.canvas.touch)
    throw Error('Апаратна прив’язка потребує одну touch-сторінку 240 × 280.');
  const names=[...new Set(bound.map(e=>e.binding))];
  if(names.length!==1)throw Error('Цей адаптер підтримує одну змінну Code на екрані за раз.');
  const variable=doc.variables.find(v=>v.name===names[0]);
  if(!variable||variable.source!=='code'||variable.type!=='number')throw Error('Для прошивки вибери числову змінну з Code.');
  const sliders=bound.filter(e=>e.kind==='slider');
  if(!sliders.length||sliders.some(e=>e.input!=='touch'||e.action.type!=='none')||variable.readonly)
    throw Error('Для керування змінною потрібен touch-повзунок без додаткової дії та змінна без const.');
  if(bound.some(e=>!['slider','text','progress'].includes(e.kind)))throw Error('Ця прив’язка підтримує повзунок, текст та індикатор.');
  const {min,max}=sliders[0];
  if(!Number.isInteger(min)||!Number.isInteger(max)||max-min>256||max<=min||sliders.some(e=>e.min!==min||e.max!==max))
    throw Error('Встанови однаковий цілий діапазон повзунків, до 257 значень (наприклад, 0…255).');
  if(!Number.isInteger(variable.value)||variable.value<min||variable.value>max)
    throw Error(`Початкове значення ${variable.name} у Code має входити в діапазон ${min}…${max}.`);
  const visible=doc.pages[0].elements.filter(e=>e.runtimeVisible);
  if(visible.some(e=>e.action.type!=='none'))throw Error('Для цього режиму прибери додаткові дії: повзунок уже записує значення у прив’язану змінну.');
  const geometry=sliders.map(e=>({x:e.x,y:e.y,width:e.width,height:e.height}));
  if(geometry.some(e=>![e.x,e.y,e.width,e.height].every(Number.isInteger)||e.x<0||e.y<0||e.width<1||e.height<1||e.x+e.width>240||e.y+e.height>280))throw Error('Повзунок має бути всередині екрана.');
  return {name:variable.name,cppType:variable.cppType,min,max,initial:variable.value,sliders:geometry};
}
export function deltaRuns(base,pixels) {
  const runs=[];
  for(let i=0;i<pixels.length;i+=4) {
    const word=((pixels[i]>>3)<<11)|((pixels[i+1]>>2)<<5)|(pixels[i+2]>>3);
    if(pixels[i]===base[i]&&pixels[i+1]===base[i+1]&&pixels[i+2]===base[i+2])continue;
    const index=i/4,last=runs.at(-1);
    if(last&&last[0]+last[1]===index&&last[2]===word&&last[1]<65535)last[1]++;
    else runs.push([index,1,word]);
  }
  return runs;
}
