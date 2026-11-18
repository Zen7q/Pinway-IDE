import { component, artwork, xml, tag } from './graphics';
const MODES=['breadboard','schematic','pcb'];
const clone=value=>structuredClone(value);
const key=ref=>ref.part+'/'+ref.pin;
const snap=n=>Math.round(n/10)*10;
const bounded=n=>Math.max(-20000,Math.min(20000,snap(n)));
const fresh=()=>({format:'pinway.design/1',title:'Untitled circuit',board:{x:600,y:400},parts:[],links:[],routing:{}});
const paths={layers:'M2 5 8 2l6 3-6 3ZM2 8l6 3 6-3M2 11l6 3 6-3',cursor:'m3 2 10 7-5 1-2 4Z',rotate:'M3 5A6 6 0 1 1 2 10M3 1v4h4',copy:'M6 5h8v9H6ZM3 11H2V2h8v1',trash:'M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10M7 7v4M9 7v4',undo:'M5 3 1 7l4 4M2 7h7a4 4 0 0 1 4 4',redo:'m11 3 4 4-4 4M14 7H7a4 4 0 0 0-4 4',minus:'M3 8h10',left:'m10 3-5 5 5 5',right:'m6 3 5 5-5 5',search:'M10 10l4 4M11 6a5 5 0 1 1-10 0 5 5 0 0 1 10 0',save:'M2 2h10l2 2v10H2ZM5 2v4h6V2M5 14V9h6v5',external:'M9 2h5v5M14 2 7 9M6 3H2v11h11v-4','new-file':'M9 1H3v14h5M9 1v4h4L9 1M12 9v6M9 12h6'};
const icon=name=>paths[name]?`<svg aria-hidden="true" viewBox="0 0 16 16"><path d="${paths[name]}"/></svg>`:`<svg aria-hidden="true" viewBox="0 0 16 16"><use href="#i-${name}"></use></svg>`;
const btn=(action,label,glyph='',extra='')=>`<button type="button" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${glyph?icon(glyph):xml(label)}</button>`;
export function mountDesigner({call,onVisibility,settings}) {
  const root=document.createElement('main');root.id='designer';root.hidden=true;
  root.innerHTML=`<aside class="design-activity" aria-label="Build views">${btn('breadboard','Breadboard','chip','aria-pressed="true"')}${btn('schematic','Schematic','activity','aria-pressed="false"')}${btn('pcb','PCB','layers','aria-pressed="false"')}<span class="design-flex"></span>${btn('settings','Settings','settings')}</aside>
    <aside class="design-parts" aria-label="Component library"><div class="design-heading"><strong>Components</strong>${btn('collapse','Collapse library','left')}</div><label class="design-search">${icon('search')}<input type="search" placeholder="Find a component…" aria-label="Find a component"></label><div class="design-catalog"></div><div class="design-library-note">Drag onto the canvas<br>or click to place a component.</div></aside>
    <section class="design-editor"><header class="design-document"><div>${btn('expand','Show component library','folder')}<input id="design-title" aria-label="Circuit title" maxlength="160" value="Untitled circuit"><span id="design-dirty">Local circuit</span></div><nav aria-label="Circuit files">${btn('new','New circuit','new-file')}${btn('open','Open circuit','folder')}${btn('save','Save circuit','save')}${btn('export','Export SVG','external')}</nav></header>
    <div class="design-tools"><div class="design-view-title"><span id="design-view">Breadboard</span><small id="design-subtitle">PROTOTYPING</small></div><div class="design-toolgroup">${btn('select','Select','cursor','aria-pressed="true"')}${btn('wire','Draw wire','activity','aria-pressed="false"')}<input id="design-wire" type="color" value="#e27c67" aria-label="Wire color"></div><i></i><div class="design-toolgroup">${btn('rotate','Rotate · R','rotate')}${btn('duplicate','Duplicate · ⌘D','copy')}${btn('delete','Delete','trash')}</div><span class="design-flex"></span>${btn('undo','Undo · ⌘Z','undo')}${btn('redo','Redo · ⇧⌘Z','redo')}<i></i>${btn('out','Zoom out','minus')}<button data-action="fit" id="design-zoom" title="Fit circuit">100%</button>${btn('in','Zoom in','plus')}</div>
    <div class="design-viewport" tabindex="0" aria-label="Circuit workspace"><svg id="design-scene" xmlns="http://www.w3.org/2000/svg" aria-label="Circuit drawing"></svg><div class="design-welcome"><div class="design-welcome-symbol">${icon('chip')}</div><span class="design-eyebrow">PINWAY BUILD</span><h1>Make your next connection.</h1><p>Bring components together.<br>Turn an idea into a circuit.</p><button data-action="starter" class="design-primary">Create an LED circuit ${icon('right')}</button><span class="design-hint">Or drag your first component from the library.</span></div><div class="design-canvas-label">2.54 mm grid</div></div>
    <footer class="design-status"><span id="design-message" role="status">Preparing component library…</span><span id="design-count"></span></footer></section>
    <aside class="design-properties" aria-label="Circuit inspector"><div class="design-heading"><strong>Inspector</strong></div><div id="design-properties"></div><section id="design-board" hidden><h3>Board size</h3><label>Width <span><input type="number" id="design-width" aria-label="PCB width" min="25.4" max="508" step="2.54"> mm</span></label><label>Height <span><input type="number" id="design-height" aria-label="PCB height" min="25.4" max="508" step="2.54"> mm</span></label><p>Single copper layer. Dashed connections still need a route.</p></section><section class="design-outline"><h3>In this circuit <span id="design-part-count">0</span></h3><div id="design-outline"></div></section></aside>
    <dialog class="design-confirm"><form method="dialog"><h2>Save this circuit?</h2><p>You have changes that haven’t been saved to a circuit file.</p><div><button value="cancel">Cancel</button><button value="discard">Discard changes</button><button value="save" class="design-primary">Save</button></div></form></dialog>`;
  const sash=document.createElement('div');sash.className='design-sash';sash.role='separator';sash.tabIndex=0;sash.setAttribute('aria-label','Component library width');sash.setAttribute('aria-orientation','vertical');root.querySelector('.design-editor').before(sash);
  root.style.setProperty('--library-width',(Number(localStorage.getItem('pinway-designer-width'))||218)+'px');
  sash.onpointerdown=e=>{sash.setPointerCapture(e.pointerId);const start=e.clientX,width=root.querySelector('.design-parts').getBoundingClientRect().width;sash.onpointermove=e=>{const next=Math.max(155,Math.min(380,width+e.clientX-start));root.style.setProperty('--library-width',next+'px');localStorage.setItem('pinway-designer-width',next);};sash.onpointerup=()=>{sash.onpointermove=null;};};
  sash.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const width=root.querySelector('.design-parts').getBoundingClientRect().width;const next=Math.max(155,Math.min(380,width+(e.key==='ArrowLeft'?-10:10)));root.style.setProperty('--library-width',next+'px');localStorage.setItem('pinway-designer-width',next);};
  document.querySelector('.statusbar').before(root);
  const confirmDialog=root.querySelector('.design-confirm');
  document.body.append(confirmDialog);
  const $=id=>root.querySelector('#'+id), viewport=root.querySelector('.design-viewport'), scene=$('design-scene');
  let circuit=fresh(), defs=[], nets=[], file='', saved='', selection='', mode='breadboard', tool='select', enabled=false, ready=false,busy=false;
  let history=[],future=[],clipboard=null,pending=null,drag=null,space=false,hover=new Set(),revision=0,draftTimer,analysisTimer;
  let draftQueue=Promise.resolve();
  const cameras=Object.fromEntries(MODES.map(m=>[m,{x:-40,y:-40,scale:1}]));
  const camera=()=>cameras[mode], snapshot=()=>JSON.stringify(circuit);
  const definition=kind=>defs.find(d=>d.kind===kind);
  const partById=id=>circuit.parts.find(p=>p.uid===id);
  const notice=text=>{$('design-message').textContent=text;};
  const run=(op,p={})=>call('designer',{op,...p});
  const attempt=promise=>Promise.resolve(promise).catch(e=>notice(e.message));
  function contactPosition(ref) {
    const p=partById(ref.part),s=p&&definition(p.kind)?.shapes[mode],t=s?.terminals.find(t=>t.id===ref.pin);if(!t)return null;
    const pose=p.poses[mode],a=pose.angle*Math.PI/180,x=t.x-s.width/2,y=t.y-s.height/2;
    return {x:pose.x+s.width/2+x*Math.cos(a)-y*Math.sin(a),y:pose.y+s.height/2+x*Math.sin(a)+y*Math.cos(a)};
  }
  function addPart(kind,point) {
    if(!ready||busy)return;if(circuit.parts.length>=300)return notice('This circuit has reached the 300 component limit.');
    const def=definition(kind);if(!def)return;
    edit(()=>{
      let n=1;while(circuit.parts.some(p=>p.label===def.prefix+n))n++;
      const p={uid:crypto.randomUUID(),kind,label:def.prefix+n,value:kind==='resistor'?220:kind==='capacitor'?100:1000,tint:'#ee786c',poses:{}};
      for(const m of MODES)p.poses[m]={x:bounded(point.x),y:bounded(point.y),angle:0};
      circuit.parts.push(p);selection=p.uid;
    });notice('Component placed. Drag to move, R to rotate.');viewport.focus();
  }
  function stateBar() {
    $('design-title').value=circuit.title;
    $('design-dirty').textContent=file?(saved===snapshot()?'Saved':'Edited'):'Local draft';
    $('design-count').textContent=`${circuit.parts.length} components · ${circuit.links.length} wires`;
    $('design-part-count').textContent=circuit.parts.length;
    root.querySelector('[data-action=undo]').disabled=!history.length;root.querySelector('[data-action=redo]').disabled=!future.length;
    for(const action of ['rotate','duplicate'])root.querySelector(`[data-action=${action}]`).disabled=!partById(selection);
    root.querySelector('[data-action=delete]').disabled=!selection;
  }
  function commit(previous) {
    if(previous===snapshot())return;
    history.push(previous);if(history.length>120)history.shift();future=[];revision++;render();schedule();
  }
  function edit(fn){if(!ready||busy)return;const before=snapshot();fn();commit(before);}
  function schedule(){clearTimeout(draftTimer);clearTimeout(analysisTimer);draftTimer=setTimeout(()=>attempt(flush()),600);analysisTimer=setTimeout(()=>attempt(analyze()),30);}
  async function flush(){clearTimeout(draftTimer);if(!ready)return;const value=clone(circuit);draftQueue=draftQueue.catch(()=>{}).then(()=>run('draft',{circuit:value}));return draftQueue;}
  async function analyze(){const stamp=revision,result=await run('inspect',{circuit:clone(circuit)});if(stamp!==revision)return;nets=result.nets;if(selection&&!partById(selection))inspector();draw();}
  function edges() {
    if(mode==='breadboard')return circuit.links;
    const result=[];
    for(const net of nets){
      const pins=net.filter(r=>partById(r.part)?.kind!=='breadboard').sort((a,b)=>key(a).localeCompare(key(b)));if(pins.length<2)continue;
      for(const b of pins.slice(1)){
        const a=pins[0],direct=circuit.links.find(l=>(key(l.a)===key(a)&&key(l.b)===key(b))||(key(l.b)===key(a)&&key(l.a)===key(b)));
        result.push(direct||{uid:'net:'+key(a)+':'+key(b),a,b,tint:'#8fabb7',automatic:true});
      }
    }
    return result;
  }
  function routePoints(edge){const a=contactPosition(edge.a),b=contactPosition(edge.b);if(!a||!b)return [];
    const bends=circuit.routing[edge.uid]?.points?.[mode]||[];
    if(mode==='schematic'&&!bends.length){
      const stub=(ref,point)=>{const part=partById(ref.part),shape=definition(part.kind).shapes[mode],pin=shape.terminals.find(p=>p.id===ref.pin);let x=0,y=0;
        if(pin.x<=10)x=-18;else if(pin.x>=shape.width-10)x=18;else if(pin.y<shape.height/2)y=-18;else y=18;
        const angle=part.poses[mode].angle*Math.PI/180,dx=x*Math.cos(angle)-y*Math.sin(angle),dy=x*Math.sin(angle)+y*Math.cos(angle);return {x:point.x+dx,y:point.y+dy,horizontal:Math.abs(dx)>Math.abs(dy)};};
      const sa=stub(edge.a,a),sb=stub(edge.b,b);return [a,sa,sa.horizontal?{x:sa.x,y:sb.y}:{x:sb.x,y:sa.y},sb,b];
    }
    const points=[a,...bends,b];
    if(mode==='breadboard')return points;
    return points.flatMap((p,i)=>i&&Math.abs(p.x-points[i-1].x)>.1&&Math.abs(p.y-points[i-1].y)>.1?[{x:p.x,y:points[i-1].y},p]:[p]);
  }
  function path(points){if(!points.length)return '';let d=`M${points[0].x} ${points[0].y}`;
    for(let i=1;i<points.length;i++){const p=points[i];if(mode==='breadboard'&&i<points.length-1){const next=points[i+1],old=points[i-1];const a=Math.min(.3,8/Math.max(1,Math.hypot(p.x-old.x,p.y-old.y))),b=Math.min(.3,8/Math.max(1,Math.hypot(next.x-p.x,next.y-p.y)));d+=` L${p.x-(p.x-old.x)*a} ${p.y-(p.y-old.y)*a} Q${p.x} ${p.y} ${p.x+(next.x-p.x)*b} ${p.y+(next.y-p.y)*b}`;}else d+=` L${p.x} ${p.y}`;}return d;}
  function wires(interactive=true){return edges().map(e=>{
    const pts=routePoints(e);if(pts.length<2)return '';
    const routed=mode!=='pcb'||circuit.routing[e.uid]?.copper;
    const d=path(pts),color=mode==='pcb'&&routed?'#d4a15c':e.tint;
    let content=tag('path',{d,fill:'none',stroke:selection===e.uid?'var(--accent)':color,'stroke-width':mode==='pcb'?3:3.1,'stroke-dasharray':routed?'none':'5 5','stroke-linejoin':'round','stroke-linecap':'round'});
    if(interactive){content+=tag('path',{d,fill:'none',stroke:'transparent','stroke-width':14,'data-link':e.uid,'aria-label':'Wire connection'});
      if(selection===e.uid)for(const [i,p] of (circuit.routing[e.uid]?.points?.[mode]||[]).entries())content+=tag('circle',{cx:p.x,cy:p.y,r:5,fill:'var(--accent)',stroke:'#12222c','stroke-width':1,'data-bend':i,'data-route':e.uid});}
    return content;
  }).join('');}
  function drawing(interactive=true){
    let content=mode==='pcb'?tag('rect',{x:0,y:0,width:circuit.board.x,height:circuit.board.y,rx:8,fill:'#193c32',stroke:'#588979','stroke-width':2})+tag('text',{x:18,y:25,fill:'#8fae9c',stroke:'none','font-size':9},'PINWAY · SINGLE LAYER'):'';
    const ordered=[...circuit.parts].sort((a,b)=>(a.kind==='breadboard'?-1:0)-(b.kind==='breadboard'?-1:0));
    if(mode!=='pcb')content+=ordered.map(p=>component(definition(p.kind),p,mode,{selected:interactive&&selection===p.uid,lit:interactive?hover:new Set(),interactive})).join('');
    content+=wires(interactive);
    if(mode==='pcb')content+=ordered.filter(p=>p.kind!=='breadboard').map(p=>component(definition(p.kind),p,mode,{selected:interactive&&selection===p.uid,lit:interactive?hover:new Set(),interactive})).join('');
    return content;
  }
  function draw(){if(!defs.length||!enabled)return;
    const c=camera(),w=viewport.clientWidth/c.scale,h=viewport.clientHeight/c.scale;
    scene.setAttribute('viewBox',`${c.x} ${c.y} ${w} ${h}`);
    scene.innerHTML=`<defs><pattern id="design-dots" patternUnits="userSpaceOnUse" width="10" height="10"><circle cx="0" cy="0" r=".55" fill="#748991" opacity=".3" stroke="none"/></pattern></defs><rect x="${c.x}" y="${c.y}" width="${w}" height="${h}" fill="url(#design-dots)"/>`+drawing()+
      (pending?tag('path',{d:path([contactPosition(pending.a),...pending.points,pending.cursor].filter(Boolean)),stroke:$('design-wire').value,'stroke-width':2.4,'stroke-dasharray':'4 4',fill:'none','pointer-events':'none'}):'');
    root.querySelector('.design-welcome').hidden=circuit.parts.length>0;
    $('design-zoom').textContent=Math.round(c.scale*100)+'%';
  }
  function field(parent,title,value,change,{type='text',min,max,step}={}){
    const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type=type;input.value=value;input.setAttribute('aria-label',title);if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;label.append(input);parent.append(label);
    input.onchange=()=>{if(busy)return;const value=type==='number'?Number(input.value):input.value;if(type==='number'&&(!Number.isFinite(value)||(min!==undefined&&value<min)||(max!==undefined&&value>max))){notice('Enter a value within the shown range.');inspector();return;}edit(()=>change(value));};
  }
  function inspector(){
    const target=$('design-properties');target.replaceChildren();const p=partById(selection),edge=edges().find(e=>e.uid===selection);
    if(p){const heading=document.createElement('h2');heading.textContent=definition(p.kind).title;target.append(heading);
      field(target,'Reference',p.label,v=>p.label=v.slice(0,80));
      if(p.kind==='resistor')field(target,'Resistance (Ω)',p.value,v=>p.value=v,{type:'number',min:.1,max:10000000});
      if(p.kind==='capacitor')field(target,'Capacitance (nF)',p.value,v=>p.value=v,{type:'number',min:.1,max:10000000});
      if(p.kind==='led')field(target,'LED color',p.tint,v=>p.tint=v,{type:'color'});
      const row=document.createElement('div');row.className='design-inspector-actions';row.innerHTML=btn('rotate','Rotate 90°','rotate')+btn('duplicate','Duplicate','copy')+btn('delete','Delete','trash');target.append(row);
      const small=document.createElement('p');small.textContent=`${p.poses[mode].angle}° rotation · ${definition(p.kind).shapes[mode].terminals.length} contacts`;target.append(small);
      const pins=document.createElement('details');pins.className='design-pinlist';const summary=document.createElement('summary');summary.textContent='Contacts';pins.append(summary);
      for(const t of definition(p.kind).shapes[mode].terminals){const b=document.createElement('button');b.textContent=t.id;b.dataset.terminal=p.uid;b.dataset.pin=t.id;b.title='Connect '+t.id;pins.append(b);}target.append(pins);
    }else if(edge){const h=document.createElement('h2');h.textContent=mode==='pcb'?'Copper route':'Wire';target.append(h);
      if(!edge.automatic)field(target,'Wire color',edge.tint,v=>{const actual=circuit.links.find(l=>l.uid===edge.uid);if(actual)actual.tint=v;},{type:'color'});
      const p=document.createElement('p');p.textContent='Double-click to add a bend. Drag a bend to reshape the connection.';target.append(p);
      if(mode==='pcb'){const b=document.createElement('button');b.className='design-route';b.textContent=circuit.routing[edge.uid]?.copper?'Mark as unrouted':'Route on copper layer';b.onclick=()=>edit(()=>{const r=ensureRoute(edge.uid);r.copper=!r.copper;});target.append(b);}
      target.insertAdjacentHTML('beforeend',btn('delete','Delete connection','trash'));
    }else target.innerHTML=`<div class="design-inspector-empty">${icon('cursor')}<h2>A place for every detail.</h2><p>Select a component or connection to edit its properties.</p></div>`;
    $('design-board').hidden=mode!=='pcb';$('design-width').value=(circuit.board.x/10*2.54).toFixed(2);$('design-height').value=(circuit.board.y/10*2.54).toFixed(2);
    const outline=$('design-outline');outline.replaceChildren();for(const p of circuit.parts){const b=document.createElement('button');b.className=p.uid===selection?'selected':'';b.dataset.select=p.uid;b.innerHTML=`<span>${xml(p.label)}</span><small>${xml(definition(p.kind).title)}</small>`;outline.append(b);}
  }
  function render(){stateBar();inspector();draw();}
  function ensureRoute(id){return circuit.routing[id]||(circuit.routing[id]={points:{breadboard:[],schematic:[],pcb:[]},copper:false});}
  function bounds(){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    if(mode==='pcb'){minX=0;minY=0;maxX=circuit.board.x;maxY=circuit.board.y;}
    for(const p of circuit.parts){const s=definition(p.kind).shapes[mode],v=p.poses[mode];if(!s.width)continue;const r=Math.hypot(s.width,s.height)/2,cx=v.x+s.width/2,cy=v.y+s.height/2;minX=Math.min(minX,cx-r);minY=Math.min(minY,cy-r-20);maxX=Math.max(maxX,cx+r);maxY=Math.max(maxY,cy+r);}
    for(const e of edges())for(const p of routePoints(e)){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
    return Number.isFinite(minX)?{x:minX-35,y:minY-35,w:maxX-minX+70,h:maxY-minY+70}:{x:0,y:0,w:700,h:500};
  }
  function fit(){const b=bounds(),c=camera();c.scale=Math.max(.15,Math.min(1.6,viewport.clientWidth/b.w,viewport.clientHeight/b.h));c.x=b.x-(viewport.clientWidth/c.scale-b.w)/2;c.y=b.y-(viewport.clientHeight/c.scale-b.h)/2;draw();}
  function zoom(factor,anchor={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){const c=camera(),scale=Math.max(.15,Math.min(4,c.scale*factor));c.x+=anchor.x/c.scale-anchor.x/scale;c.y+=anchor.y/c.scale-anchor.y/scale;c.scale=scale;draw();}
  function world(e){const b=viewport.getBoundingClientRect(),c=camera();return{x:c.x+(e.clientX-b.left)/c.scale,y:c.y+(e.clientY-b.top)/c.scale};}
  function setMode(next){mode=next;pending=null;selection='';hover.clear();for(const m of MODES)root.querySelector(`[data-action=${m}]`).setAttribute('aria-pressed',m===mode);$('design-view').textContent={breadboard:'Breadboard',schematic:'Schematic',pcb:'PCB'}[mode];$('design-subtitle').textContent={breadboard:'PROTOTYPING',schematic:'CIRCUIT DIAGRAM',pcb:'BOARD LAYOUT'}[mode];render();fit();}
  function changeTool(next){tool=next;pending=null;for(const t of ['select','wire'])root.querySelector(`[data-action=${t}]`).setAttribute('aria-pressed',t===next);draw();viewport.focus();}
  function wireTerminal(ref){if(!contactPosition(ref))return;
    if(!pending){pending={a:ref,points:[],cursor:contactPosition(ref)};notice('Choose the next contact. Click the canvas to add bends. Escape cancels.');draw();return;}
    if(key(pending.a)===key(ref)){pending=null;draw();return;}
    if(circuit.links.length>=1500)return notice('The 1,500 wire limit has been reached.');
    if(circuit.links.some(l=>(key(l.a)===key(ref)&&key(l.b)===key(pending.a))||(key(l.b)===key(ref)&&key(l.a)===key(pending.a)))){pending=null;draw();return notice('These contacts already have a wire.');}
    edit(()=>{const uid=crypto.randomUUID();circuit.links.push({uid,a:pending.a,b:ref,tint:$('design-wire').value});circuit.routing[uid]={points:Object.fromEntries(MODES.map(m=>[m,m===mode?clone(pending.points):[]])),copper:mode==='pcb'};selection=uid;pending=null;});notice('Connection made.');
  }
  async function save(){if(!ready||busy)return false;busy=true;const value=clone(circuit),stamp=JSON.stringify(value);
    try{const path=await run('save',{circuit:value,path:file});if(!path)return false;file=path;saved=stamp;await flush();stateBar();notice('Circuit saved.');return true;}finally{busy=false;}}
  async function confirmReplace(){if(saved===snapshot()||!circuit.parts.length&&!circuit.links.length)return true;const dialog=confirmDialog;dialog.showModal();const choice=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));return choice==='discard'||choice==='save'&&await save();}
  async function command(action){
    if(action==='settings')return settings();
    if(action==='collapse'||action==='expand'){root.classList.toggle('design-collapsed',action==='collapse');draw();return;}
    if(!ready||busy)return;
    if(MODES.includes(action))return setMode(action);
    if(['select','wire'].includes(action))return changeTool(action);
    if(action==='fit')return fit();if(action==='in'||action==='out')return zoom(action==='in'?1.2:1/1.2);
    if(action==='save')return save();
    if(action==='export'){const b=bounds();const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" style="--accent:#6ba5e6">${tag('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'#111a20'})}${drawing(false)}</svg>`;busy=true;try{if(await run('export',{svg}))notice('SVG image exported.');}finally{busy=false;}return;}
    if(action==='new'||action==='open'){
      if(!await confirmReplace())return;
      if(action==='open'){busy=true;try{const result=await run('open');if(!result)return;circuit=result.circuit;file=result.path;saved=snapshot();}finally{busy=false;}}
      else{circuit=fresh();file='';saved='';}
      selection='';pending=null;history=[];future=[];revision++;await analyze();render();fit();await flush();notice(action==='open'?'Circuit opened.':'New circuit.');return;
    }
    if(action==='undo'||action==='redo'){
      const source=action==='undo'?history:future,dest=action==='undo'?future:history;if(!source.length)return;dest.push(snapshot());circuit=JSON.parse(source.pop());selection='';pending=null;revision++;render();schedule();return;
    }
    const part=partById(selection);
    if(action==='copy'){if(part){clipboard=clone(part);notice('Component copied.');}return;}
    if(action==='paste'||action==='duplicate'){
      const from=action==='paste'?clipboard:part;if(!from||circuit.parts.length>=300)return;
      edit(()=>{const item=clone(from);item.uid=crypto.randomUUID();let n=1;const def=definition(item.kind);while(circuit.parts.some(p=>p.label===def.prefix+n))n++;item.label=def.prefix+n;for(const m of MODES){item.poses[m].x=bounded(item.poses[m].x+20);item.poses[m].y=bounded(item.poses[m].y+20);}circuit.parts.push(item);selection=item.uid;});return;
    }
    if(action==='rotate'&&part){edit(()=>{part.poses[mode].angle=(part.poses[mode].angle+90)%360;});return;}
    if(action==='delete'&&selection){
      const edge=edges().find(e=>e.uid===selection);
      if(edge?.automatic)return notice('This connection comes from a breadboard net. Edit it in Breadboard.');
      edit(()=>{const removed=new Set(circuit.links.filter(l=>l.uid===selection||l.a.part===selection||l.b.part===selection).map(l=>l.uid));circuit.parts=circuit.parts.filter(p=>p.uid!==selection);circuit.links=circuit.links.filter(l=>!removed.has(l.uid));for(const id of removed)delete circuit.routing[id];selection='';pending=null;});return;
    }
    if(action==='starter'&&!circuit.parts.length){
      const before=snapshot();
      for(const [kind,point] of [['uno',{x:20,y:80}],['resistor',{x:340,y:80}],['led',{x:500,y:110}]])addPart(kind,point);
      const [board,r,led]=circuit.parts;
      circuit.title='LED circuit';for(const [a,pinA,b,pinB,tint] of [[board,'D13',r,'1','#e27c67'],[r,'2',led,'A','#e27c67'],[led,'K',board,'GND','#6c9fd5']])circuit.links.push({uid:crypto.randomUUID(),a:{part:a.uid,pin:pinA},b:{part:b.uid,pin:pinB},tint});
      history=[];selection='';commit(before);await analyze();fit();return;
    }
  }
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.kind){const c=camera();addPart(b.dataset.kind,{x:c.x+80/c.scale,y:c.y+80/c.scale});return;}
    if(b.dataset.select){selection=b.dataset.select;render();return;}
    if(b.dataset.terminal){wireTerminal({part:b.dataset.terminal,pin:b.dataset.pin});return;}
    if(b.dataset.action)attempt(command(b.dataset.action));
  });
  function catalog(){const q=root.querySelector('.design-search input').value.toLowerCase(),target=root.querySelector('.design-catalog');target.replaceChildren();
    const groups=[...new Set(defs.map(d=>d.group))];
    let group='';for(const def of defs.filter(d=>(d.title+' '+d.group).toLowerCase().includes(q)).sort((a,b)=>groups.indexOf(a.group)-groups.indexOf(b.group))){if(group!==def.group){group=def.group;const h=document.createElement('h3');h.textContent=group;target.append(h);}const p={kind:def.kind,label:'',value:220,tint:'#ed776a'},s=def.shapes.breadboard,b=document.createElement('button');b.className='design-card';b.draggable=true;b.dataset.kind=def.kind;b.setAttribute('aria-label','Add '+def.title);b.innerHTML=`<span class="design-preview"><svg viewBox="-10 -12 ${s.width+20} ${s.height+26}" aria-hidden="true">${artwork(def,p,'breadboard')}${s.terminals.map(t=>tag('circle',{cx:t.x,cy:t.y,r:def.kind==='breadboard'?1.8:2,fill:'#d1bd85',stroke:'none'})).join('')}</svg></span><span>${xml(def.title)}</span><small>+</small>`;target.append(b);}
  }
  root.querySelector('.design-search input').oninput=catalog;
  root.addEventListener('dragstart',e=>{const b=e.target.closest('[data-kind]');if(b){e.dataTransfer.setData('application/x-pinway-part',b.dataset.kind);e.dataTransfer.effectAllowed='copy';}});
  viewport.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('application/x-pinway-part'))e.preventDefault();});
  viewport.addEventListener('drop',e=>{e.preventDefault();addPart(e.dataTransfer.getData('application/x-pinway-part'),world(e));});
  viewport.addEventListener('pointerdown',e=>{
    if(!ready||busy||drag||![0,1].includes(e.button)||e.target.closest('button'))return;viewport.focus();const at=world(e),t=e.target.closest('[data-contact]'),b=e.target.closest('[data-bend]'),p=e.target.closest('[data-component]'),wire=e.target.closest('[data-link]');
    if(space||e.button===1){drag={kind:'pan',start:{x:e.clientX,y:e.clientY},origin:clone(camera())};}
    else if(t){const ref={part:t.dataset.contact,pin:t.dataset.pin};if(pending)wireTerminal(ref);else{wireTerminal(ref);drag={kind:'terminal',start:at};}}
    else if(b){drag={kind:'bend',uid:b.dataset.route,index:Number(b.dataset.bend),before:snapshot()};}
    else if(pending){pending.points.push({x:bounded(at.x),y:bounded(at.y)});draw();}
    else if(p&&tool==='select'){selection=p.dataset.component;drag={kind:'move',uid:selection,start:at,origin:clone(partById(selection).poses[mode]),before:snapshot()};render();}
    else if(wire){selection=wire.dataset.link;render();}
    else{selection='';inspector();stateBar();draw();}
    if(drag){e.preventDefault();viewport.setPointerCapture(e.pointerId);}
  });
  viewport.addEventListener('pointermove',e=>{
    const at=world(e);if(pending){pending.cursor=at;}
    if(drag){if(drag.kind==='pan'){camera().x=drag.origin.x-(e.clientX-drag.start.x)/camera().scale;camera().y=drag.origin.y-(e.clientY-drag.start.y)/camera().scale;}
      else if(drag.kind==='move'){const pose=partById(drag.uid).poses[mode];pose.x=bounded(drag.origin.x+at.x-drag.start.x);pose.y=bounded(drag.origin.y+at.y-drag.start.y);}
      else if(drag.kind==='bend'){const route=ensureRoute(drag.uid);route.points[mode][drag.index]={x:bounded(at.x),y:bounded(at.y)};if(mode==='pcb')route.copper=true;}
      draw();return;}
    const hit=e.target.closest('[data-contact]');const next=hit?new Set((nets.find(n=>n.some(r=>r.part===hit.dataset.contact&&r.pin===hit.dataset.pin))||[]).map(key)):new Set();
    if([...hover].join('|')!==[...next].join('|')){hover=next;draw();}else if(pending)draw();
  });
  viewport.addEventListener('pointerup',e=>{
    if(!drag)return;const gesture=drag;drag=null;
    if(gesture.kind==='terminal'&&pending){const at=world(e);if(Math.hypot(at.x-gesture.start.x,at.y-gesture.start.y)>5){let closest=null,best=12/camera().scale;for(const p of circuit.parts)for(const t of definition(p.kind).shapes[mode].terminals){const ref={part:p.uid,pin:t.id},pos=contactPosition(ref),d=Math.hypot(pos.x-at.x,pos.y-at.y);if(d<best){closest=ref;best=d;}}if(closest)wireTerminal(closest);}}
    if(gesture.before)commit(gesture.before);if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointercancel',()=>{if(drag?.before)circuit=JSON.parse(drag.before);drag=null;pending=null;render();});
  viewport.addEventListener('dblclick',e=>{const wire=e.target.closest('[data-link]');if(!wire||busy)return;const at=world(e);edit(()=>{const r=ensureRoute(wire.dataset.link);r.points[mode]||=[];r.points[mode].push({x:bounded(at.x),y:bounded(at.y)});if(mode==='pcb')r.copper=true;selection=wire.dataset.link;});});
  viewport.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.008),{x:e.clientX-r.left,y:e.clientY-r.top});}else{camera().x+=e.deltaX/camera().scale;camera().y+=e.deltaY/camera().scale;draw();}},{passive:false});
  $('design-title').onchange=e=>edit(()=>{circuit.title=e.target.value.trim().slice(0,160)||'Untitled circuit';});
  for(const [id,axis] of [['design-width','x'],['design-height','y']])$(id).onchange=e=>{const value=Number(e.target.value);if(value>=25.4&&value<=508)edit(()=>circuit.board[axis]=snap(value/2.54*10));else{notice('Board dimensions must be between 25.4 and 508 mm.');inspector();}};
  document.addEventListener('keydown',e=>{
    if(!enabled||document.querySelector('dialog[open]')||e.target.closest('input,textarea,[contenteditable=true]'))return;
    const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey;
    const action=mod?({s:'save',o:'open',n:'new',z:e.shiftKey?'redo':'undo',d:'duplicate',c:'copy',v:'paste',y:'redo'}[k]):({r:'rotate',v:'select',w:'wire',delete:'delete',backspace:'delete'}[k]);
    if(action){e.preventDefault();e.stopImmediatePropagation();attempt(command(action));}
    if(e.code==='Space'){space=true;e.preventDefault();}if(k==='escape'){pending=null;changeTool('select');}
  },true);
  document.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;});
  new ResizeObserver(()=>draw()).observe(viewport);
  const loading=(async()=>{defs=await run('library');const recovered=await run('recover');if(recovered)circuit=recovered;ready=true;catalog();await analyze();render();notice(recovered?'Local circuit recovered.':'Ready to build.');})();attempt(loading);
  return {
    get active(){return enabled;},
    async activate(value){enabled=value;root.hidden=!value;onVisibility(value);if(value){await loading;render();if(!circuit.parts.length)draw();else fit();viewport.focus();}},
    async shortcut(action){if(action==='quit'||action==='window'){await loading;if(busy)return true;await flush();if(!await confirmReplace())return true;return false;}if(!enabled)return false;const translated={new:'new',open:'open',save:'save',close:'new',quickOpen:'open'}[action];if(translated){await command(translated);return true;}return false;}
  };
}
