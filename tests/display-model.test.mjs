import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fresh,element,validate,issues,interact,displayText,canonical,clone,availableKinds,hardwareFrame} from '../src/display/model.mjs';
test('layout roundtrip preserves coordinates, pages, images, visibility and locks',()=>{
 const d=fresh(),e=element('image',d);e.x=230;e.editorHidden=true;e.runtimeVisible=false;e.locked=true;e.image='data:image/png;base64,aGVsbG8=';d.pages[0].elements.push(e);
 d.canvas.width=128;const reopened=validate(JSON.parse(JSON.stringify(d)));assert.deepEqual(reopened,d);assert.equal(e.x,230);assert.equal(issues(d).length,1);
});
test('typed local read/write bindings, formatting and instant navigation',()=>{
 const d=fresh();d.variables=[{name:'brightness',type:'number',value:128},{name:'enabled',type:'boolean',value:false}];const e=element('slider',d);Object.assign(e,{input:'physical',binding:'brightness',min:0,max:255});
 const result=interact(d,e,{brightness:128},300);assert.equal(result.values.brightness,255);assert.equal(d.variables[0].value,128);
 const toggle=element('toggle',d);Object.assign(toggle,{input:'physical',binding:'enabled'});assert.equal(interact(d,toggle,{enabled:false}).values.enabled,true);
 const text=element('text',d);Object.assign(text,{binding:'brightness',prefix:'Яскравість: ',suffix:' %',decimals:1});assert.equal(displayText(d,text,{brightness:24}),'Яскравість: 24.0 %');
 const p={id:crypto.randomUUID(),name:'Далі',elements:[]};d.pages.push(p);e.action={type:'navigate',page:p.id};assert.equal(interact(d,e,{},10).page,p.id);
});
test('events require explicit association and touch capability; GPIO is simulated',()=>{
 const d=fresh(),e=element('button',d);e.action={type:'gpio',pin:4,level:true};assert.match(interact(d,e,{}).message,/Вкажіть/);
 e.input='touch';assert.equal(interact(d,e,{}).page,null);e.input='physical';assert.match(interact(d,e,{}).message,/GPIO 4 → HIGH/);
 assert.deepEqual(interact(d,e,{}).values,{});
});
test('incompatible bindings and deleted navigation targets remain visible issues',()=>{
 const d=fresh(),e=element('slider',d);d.variables=[{name:'label',type:'text',value:'24'}];e.binding='label';e.input='physical';e.action={type:'navigate',page:'missing'};d.pages[0].elements.push(e);
 assert.equal(issues(d).length,2);assert.deepEqual(interact(d,e,{label:'24'},10).values,{label:'24'});
});
test('character canvas restricts tools and keeps incompatible layers recoverable',()=>{
 const d=fresh();d.pages[0].elements.push(element('button',d));d.canvas.class='character';d.canvas.width=16;d.canvas.height=2;
 assert.deepEqual(availableKinds(d),['text']);assert.ok(issues(d).some(i=>i.text.includes('недоступний')));assert.equal(d.pages[0].elements[0].kind,'button');
 d.pages[0].elements.push(element('text',d));assert.equal(d.pages[0].elements.at(-1).kind,'text');assert.ok(validate(d));
});
test('new Display starts empty and retains Code variables and Cyrillic text',()=>{
 const d=fresh();assert.deepEqual(d.variables,[]);assert.deepEqual(d.pages[0].elements,[]);const e=element('text',d);e.text='Яскравість';d.pages[0].elements.push(e);assert.deepEqual(validate(clone(d)),d);
});
test('malformed or executable resource references and IDs are rejected',()=>{
 const d=fresh(),e=element('image',d);d.pages[0].elements.push(e);e.image='data:image/svg+xml,<svg onload=alert(1) />';assert.throws(()=>validate(d));delete e.image;e.id='" onload="x';assert.throws(()=>validate(d));
});
test('recovery base comparisons ignore object serialization key order',()=>{
 assert.equal(canonical({a:1,b:{c:2,d:3}}),canonical({b:{d:3,c:2},a:1}));
});
test('GPIO actions keep one page and simulate explicit HIGH, LOW and toggle',()=>{
 const d=fresh(),e=element('button',d);e.input='touch';d.canvas.touch=true;e.action={type:'gpio',pin:14,mode:'toggle',level:false};d.pages[0].elements.push(e);validate(d);
 const on=interact(d,e,{},undefined,{}),off=interact(d,e,{},undefined,on.gpio);
 assert.equal(on.gpio[14],true);assert.equal(off.gpio[14],false);assert.equal(on.page,null);assert.equal(off.page,null);assert.equal(d.pages.length,1);
 e.action={type:'gpio',pin:14,mode:'set',level:true};assert.equal(interact(d,e,{},undefined,off.gpio).gpio[14],true);
 e.action.level=false;assert.equal(interact(d,e,{},undefined,on.gpio).gpio[14],false);
 e.action.pin=14.5;assert.throws(()=>validate(d));
});

test('hardware snapshots use matching state, expire on edits and reject unsafe images',()=>{
 const d=fresh();d.pages[0].id='led';
 d.pages[0].elements=[element('button',d)];
 d.hardwarePreview={target:'TouchLed169/RGB565',source:clone(d),page:'led',pin:14,frames:{off:'data:image/png;base64,AQ==',on:'data:image/png;base64,Ag=='}};
 validate(d);assert.equal(issues(d).length,0);
 const off=hardwareFrame(d,'led'),on=hardwareFrame(d,'led',{14:true});
 assert.match(off,/^data:image\/png;base64,/);assert.notEqual(off,on);
 assert.equal(hardwareFrame(d,'missing'),null);
 d.pages[0].elements[0].x++;assert.equal(hardwareFrame(d,'led'),null);
 assert.ok(issues(d).some(i=>i.text.includes('Макет змінено')));
 d.hardwarePreview.frames.off='javascript:alert(1)';assert.throws(()=>validate(d));
});

test('firmware preparation supports moved touch targets and encodes exact RGB565 pixels',async()=>{
 const {firmwareButton,rgb565Frame}=await import('../src/display/firmware.mjs');
 const d=fresh();d.canvas.width=240;d.canvas.height=280;d.canvas.touch=true;
 const button=element('button',d);button.input='touch';button.action={type:'gpio',pin:14,mode:'toggle',level:false};d.pages[0].elements=[button];d.hardwarePreview={target:'TouchLed169/RGB565',source:clone(d),page:d.pages[0].id,pin:14,frames:{off:'data:image/png;base64,AQ==',on:'data:image/png;base64,Ag=='}};
 const e=d.pages[0].elements.find(e=>e.action.type==='gpio');e.x=12;e.y=140;e.width=200;
 assert.deepEqual(firmwareButton(d),{x:12,y:140,width:200,height:e.height});
 e.x=100;assert.throws(()=>firmwareButton(d),/всередині/);
 const frame=rgb565Frame(new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,255,0,255]));
 assert.deepEqual(frame.runs,[[2,0xf800],[1,0x07e0]]);
 assert.deepEqual([...frame.pixels],[255,0,0,255,255,0,0,255,0,255,0,255]);
 const large=rgb565Frame(new Uint8ClampedArray(67200*4));assert.deepEqual(large.runs,[[65535,0],[1665,0]]);
});

test('Code globals are discovered without comments, locals, arrays or conditional ambiguity',async()=>{
 const {scanCodeVariables}=await import('../src/display/code-variables.mjs');
 const code=`#include <Arduino.h>
const int ledPin = 14;
int brightness = 190;
float voltage = 3.3f;
uint16_t mask=0xFF;
// int fake = 3;
void loop(){int local=5;brightness=20;}
const char* text="int another=7;";
int values[4];
#if SOMETHING
int conditional=9;
#endif
bool enabled=true;`;
 const vars=scanCodeVariables(code).variables;
 assert.deepEqual(vars.map(v=>v.name),['ledPin','brightness','voltage','mask','enabled']);
 assert.equal(vars[1].value,190);assert.equal(vars[0].readonly,true);assert.equal(vars[2].value,3.3);assert.equal(vars[3].value,255);
 assert.equal(scanCodeVariables('int renamed = 20;').variables[0].name,'renamed');
});
test('dynamic Code plans bind one real variable and RGB565 deltas replay exactly',async()=>{
 const {dynamicPlan,deltaRuns,rgb565Frame}=await import('../src/display/firmware.mjs');
 const d=fresh();d.canvas.width=240;d.canvas.height=280;d.canvas.touch=true;
 const s=element('slider',d);Object.assign(s,{binding:'brightness',input:'touch',min:0,max:255,width:200,height:48});
 d.pages[0].elements=[s];d.variables=[{name:'brightness',type:'number',value:20,source:'code',cppType:'int'}];d.hardwarePreview={target:'TouchLed169/RGB565'};
 const plan=dynamicPlan(d);assert.equal(plan.name,'brightness');assert.equal(plan.initial,20);
 d.variables[0].readonly=true;assert.throws(()=>dynamicPlan(d));delete d.variables[0].readonly;
 const base=rgb565Frame(new Uint8ClampedArray(20*4)).pixels;
 const next=base.slice();next.set([255,0,0,255,255,0,0,255],8);next.set([0,255,0,255],32);
 const runs=deltaRuns(base,next);assert.deepEqual(runs,[[2,2,0xf800],[8,1,0x07e0]]);
});
test('page management duplicates self-links, reorders start page and safely removes incoming links',async()=>{
 const {duplicatePage,removePage,movePage}=await import('../src/display/model.mjs');
 const d=fresh(),first=d.pages[0],e=element('button',d);e.action={type:'navigate',page:first.id};first.elements=[e];
 const copy=duplicatePage(d,first.id);assert.equal(d.pages.length,2);assert.notEqual(d.pages[1].elements[0].id,e.id);assert.equal(d.pages[1].elements[0].action.page,copy);
 movePage(d,copy,0);assert.equal(d.pages[0].id,copy);
 d.pages[1].elements[0].action.page=copy;const before=clone(d);
 assert.equal(removePage(d,copy),first.id);assert.equal(d.pages.length,1);assert.equal(d.pages[0].elements[0].action.type,'none');
 assert.equal(removePage(d,first.id),null);assert.equal(d.pages.length,1);
 assert.equal(before.pages[1].elements[0].action.page,copy);validate(before);validate(d);
});
test('Waveshare profiles validate pins and plan new multi-page projects without legacy files',async()=>{
 const {wavePins,hardwareErrors,scenePlan}=await import('../src/display/hardware.mjs');
 const d=fresh();Object.assign(d.canvas,{width:240,height:280,touch:true});d.hardware={profile:'waveshare169',pins:{...wavePins}};
 const second={id:uidForTest(),name:'Control',elements:[]};d.pages.push(second);
 const b=element('button',d);b.input='touch';b.action={type:'navigate',page:second.id};d.pages[0].elements=[b];
 const s=element('slider',d);Object.assign(s,{binding:'brightness',input:'touch',min:0,max:255});second.elements=[s];
 d.variables=[{name:'brightness',source:'code',cppType:'int',type:'number',value:190}];
 const plan=scenePlan(d);assert.equal(plan.mode,'variable');assert.equal(plan.pages[0].buttons[0].target,1);assert.equal(plan.pages[1].sliders.length,1);assert.equal(plan.initial,190);assert.equal(d.hardwarePreview,undefined);
 const source=clone(d),png='data:image/png;base64,AAAA';
 d.hardwarePreview={target:'TouchLed169/RGB565',pin:-1,page:d.pages[0].id,source,frames:{off:png,on:png},dynamic:{name:'brightness',min:0,max:255,pages:[{id:d.pages[0].id,images:[png]},{id:second.id,images:Array(256).fill(png)}]}};
 validate(d);assert.equal(hardwareFrame(d,second.id,{}, {brightness:190}),png);
 d.hardware.pins.LCD_CS=wavePins.LCD_DC;assert.ok(hardwareErrors(d.hardware).some(s=>s.includes('одночасно')));assert.throws(()=>scenePlan(d));
 d.hardware.pins.LCD_CS=6;assert.ok(hardwareErrors(d.hardware).some(s=>s.includes('недоступний')));
 function uidForTest(){return 'control';}
});

test('supported display presets and custom rotated modules roundtrip and use their own geometry',async()=>{
 const {displayPresets,displaySize,makeDisplay,hardwareErrors,scenePlan}=await import('../src/display/hardware.mjs');
 for(const preset of displayPresets){const d=fresh();d.hardware=clone(preset.hardware);Object.assign(d.canvas,displaySize(d.hardware),{class:'color'});assert.deepEqual(hardwareErrors(d.hardware),[]);assert.deepEqual(validate(clone(d)),d);const plan=scenePlan(d);assert.equal(plan.width,d.canvas.width);assert.equal(plan.height,d.canvas.height);}
 const h=makeDisplay('ST7735S',128,159,'Мій екран');h.config.rotation=1;assert.deepEqual(displaySize(h),{width:159,height:128,touch:false});
 h.library='arbitrary-library';assert.ok(hardwareErrors(h).length);h.library='LovyanGFX';h.config.touch='XPT2046';h.pins.TOUCH_CS=h.pins.LCD_CLK;assert.ok(hardwareErrors(h).some(s=>s.includes('одночасно')));h.pins.TOUCH_CS=4;assert.deepEqual(hardwareErrors(h),[]);
 h.config.offsetX=10;assert.ok(hardwareErrors(h).length);
});
