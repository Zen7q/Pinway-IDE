// Load this script in the harness, then await runDisplayChecks().
window.runDisplayChecks=async()=>{
 const passed=[],assert=(value,name)=>{if(!value)throw Error(name);passed.push(name);},wait=ms=>new Promise(r=>setTimeout(r,ms));
 const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();},prop=(label,value)=>{const el=document.querySelector('.dp-properties [aria-label="'+label+'"]');if(!el)throw Error('Missing field '+label);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
 const press=(key,extra={})=>document.querySelector('.dp-stage').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,...extra}));
 await testSubscriber('shortcut','save');await wait(40);assert(!testCalls.some(c=>c.action==='display'&&c.p.op==='save'),'Code save does not create an unused Display document');
 click('[data-workspace=display]');await wait(60);
 if(!document.querySelector('.dp-layer-row'))[...document.querySelectorAll('.dp-wide')].find(b=>b.textContent==='Керування').click();
 assert(document.querySelectorAll('.dp-layer-row').length===5,'starter has five elements');
 assert(testCalls.filter(c=>c.action==='display'&&c.p.op==='save').length===0,'disabled autosave does not write layout');
 click('[data-do=preview]');assert(!document.querySelector('.dp-screen').innerHTML.includes('fill="url(#dp-grid)"'),'preview hides editor grid');
 prop('brightness',201);assert(document.querySelector('.dp-screen').textContent.includes('201'),'test value updates bound text');
 const toggle=[...document.querySelectorAll('.dp-screen [data-element]')].find(e=>e.querySelector('circle')&&e.querySelector('rect[rx="15"]'));
 toggle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:21}));assert(!document.querySelector('.dp-properties [aria-label=enabled]').checked,'toggle changes boolean test variable');
 const previewSvg=document.querySelector('.dp-screen'),previewCapture=previewSvg.setPointerCapture,previewHas=previewSvg.hasPointerCapture;previewSvg.setPointerCapture=()=>{};previewSvg.hasPointerCapture=()=>false;
 try {
  const slider=[...previewSvg.querySelectorAll('[data-element]')].find(e=>e.querySelector('circle[r="8"]')),r=previewSvg.getBoundingClientRect(),zoom=r.width/320;
  slider.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:23,clientX:r.left+(24+264*.75)*zoom,clientY:r.top+154*zoom}));previewSvg.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:23}));
  const n=Number(document.querySelector('.dp-properties [aria-label=brightness]').value);assert(n>190&&n<192,'preview slider writes local number binding');
 }finally {previewSvg.setPointerCapture=previewCapture;previewSvg.hasPointerCapture=previewHas;}
 const button=[...previewSvg.querySelectorAll('[data-element]')].find(e=>e.querySelector('text')?.textContent==='Увімкнути');button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:24}));assert(document.querySelector('.dp-properties [aria-label=enabled]').checked,'preview button executes predefined local action');
 click('[data-do=edit]');click('[data-add=button]');const first=document.querySelector('.dp-layer-name');first.click();
 prop('Назва шару','Перехід');prop('Активація','physical');
 press('c',{metaKey:true});click('[data-do=page-add]');press('v',{metaKey:true});assert(document.querySelectorAll('.dp-layer-row').length===1,'copy paste between pages');
 press('z',{metaKey:true});assert(document.querySelectorAll('.dp-layer-row').length===0,'undo paste');press('z',{metaKey:true,shiftKey:true});assert(document.querySelectorAll('.dp-layer-row').length===1,'redo paste');
 click('.dp-layer-name');prop('Заблокувати шар',true);const x=Number(document.querySelector('.dp-properties [aria-label=X]').value);press('ArrowRight');assert(Number(document.querySelector('.dp-properties [aria-label=X]').value)===x,'locked layer rejects movement');
 prop('Заблокувати шар',false);press('ArrowRight');assert(Number(document.querySelector('.dp-properties [aria-label=X]').value)===x+1,'keyboard nudges unlocked layer');
 const svg=document.querySelector('.dp-screen'),capture=svg.setPointerCapture,hasCapture=svg.hasPointerCapture;
 svg.setPointerCapture=()=>{};svg.hasPointerCapture=()=>false;
 try {
  const r=svg.getBoundingClientRect(),zoom=r.width/320,px=Number(document.querySelector('.dp-properties [aria-label=X]').value),py=Number(document.querySelector('.dp-properties [aria-label=Y]').value);
  document.querySelector('.dp-screen [data-element]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:31,clientX:r.left+(px+5)*zoom,clientY:r.top+(py+5)*zoom}));
  svg.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:31,clientX:r.left+5*zoom,clientY:r.top+(py+5)*zoom}));
  assert(!!svg.querySelector('line[stroke="#ff4fa3"]'),'pointer movement shows alignment guide');
  svg.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:31}));assert(Number(document.querySelector('.dp-properties [aria-label=X]').value)===0,'pointer drag snaps to display boundary');
  const h=svg.querySelector('[data-handle]'),hr=h.getBoundingClientRect(),width=Number(document.querySelector('.dp-properties [aria-label="Ширина"]').value);
  h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:32,clientX:hr.x+hr.width/2,clientY:hr.y+hr.height/2}));
  svg.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:32,clientX:hr.x+hr.width/2+16*zoom,clientY:hr.y+hr.height/2}));svg.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:32}));
  assert(Number(document.querySelector('.dp-properties [aria-label="Ширина"]').value)===width+16,'resize handle changes element width');
 } finally {svg.setPointerCapture=capture;svg.hasPointerCapture=hasCapture;}
 prop('Приховати в редакторі',true);assert(!document.querySelector('.dp-screen [data-element]'),'editor hidden layer absent on edit canvas');click('[data-do=preview]');assert(!!document.querySelector('.dp-screen [data-element]'),'editor hidden layer remains in preview');
 click('[data-do=edit]');click('.dp-layer-name');prop('Приховати в редакторі',false);prop('Дія','navigate');const pages=[...document.querySelectorAll('.dp-page-list [data-page]')];prop('Цільова сторінка',pages[0].dataset.page);
 click('[data-do=map]');await wait(40);assert(document.querySelectorAll('.dp-map-card').length===2,'page map shows both pages');assert(document.querySelector('.dp-map-wires path[marker-end]'),'page map draws navigation connection');
 click('[data-do=preview]');document.querySelector('.dp-screen [data-element]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:22}));assert(document.querySelector('.dp-screen-caption').textContent.includes('Головна'),'preview navigates instantly');
 click('[data-do=edit]');click('[data-do=canvas]');prop('Ширина',100);assert(document.querySelector('.dp-message').textContent.includes('за межами'),'resolution change warns about bounds');
 click('[data-do=save]');await wait(100);assert(testCalls.some(c=>c.action==='display'&&c.p.op==='save'),'manual save reaches shared native API');assert(!document.querySelector('#display-editor').classList.contains('dp-dirty'),'save clears dirty state');
 click('[data-workspace=code]');await wait(40);assert(!document.querySelector('#workbench').hidden&&document.querySelector('#display-editor').hidden,'Code and Display switch in same project');
 click('[data-workspace=build]');await wait(40);assert(!document.querySelector('#designer').hidden&&document.querySelector('#display-editor').hidden,'Build remains accessible');
 click('[data-workspace=display]');await wait(40);click('[data-do=page-add]');window.testChoice=2;await testSubscriber('shortcut','open');await wait(60);assert(testProject==='/test/One','cancel protects unsaved Display on project switching');
 window.testChoice=0;await testSubscriber('shortcut','open');await wait(80);assert(testProject==='/test/Two'&&document.querySelectorAll('.dp-page-list [data-page]').length===1,'save and switch isolates second project');
 await testSubscriber('shortcut','open');await wait(40);
 window.testChoice=1;await testSubscriber('shortcut','close');await wait(40);assert(!document.querySelector('.dp-empty').hidden,'Display can start without an open project');
 click('[data-do=new-project]');assert(document.querySelector('#new-dialog').open,'Display uses shared new-project dialog');document.querySelector('#new-dialog').close();
 click('[data-do=open-project]');await wait(50);assert(document.querySelector('.dp-empty').hidden&&document.querySelectorAll('.dp-page-list [data-page]').length===1,'Display opens existing project through shared lifecycle');
 assert(testErrors.length===0,'no uncaught browser errors');
 return passed;
};
