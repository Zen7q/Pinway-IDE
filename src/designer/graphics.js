// Visuals are independent of the electrical model supplied by the Rust host.
export const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const tag = (name, attrs, content = '') => `<${name} ${Object.entries(attrs).map(([k,v])=>`${k}="${xml(v)}"`).join(' ')}>${content}</${name}>`;
const box=(x,y,width,height,fill,rx=2,stroke='none')=>tag('rect',{x,y,width,height,fill,rx,stroke});
const stroke=(d,color='#b8c4d0',width=2)=>tag('path',{d,stroke:color,'stroke-width':width,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'});
const label=(x,y,s,color='#d9e1e6',size=9)=>tag('text',{x,y,fill:color,'font-size':size,'text-anchor':'middle','font-family':'sans-serif',stroke:'none'},xml(s));
export function bands(value) {
  const colors=['#20252b','#79502e','#bc4b3f','#e49346','#dbbd57','#5e946b','#4c78bd','#8660a4','#939b9c','#eeece0'];
  let e=Math.floor(Math.log10(Math.max(.1,value)))-1, digits=Math.round(value/10**e);
  if(digits===100){digits=10;e++;}
  return [colors[Math.floor(digits/10)],colors[digits%10],e===-1?'#d4b76c':e===-2?'#b7babc':colors[e]||'#20252b','#d4b76c'];
}
export function artwork(def,part,view) {
  const s=def.shapes[view],w=s.width,h=s.height,k=part.kind;
  let body='';
  if(view==='pcb') {
    body=box(0,0,w,h,'none',3,'#dad8b3')+label(w/2,h/2,part.label,'#dad8b3',11);
  } else if(view==='schematic') {
    switch(k){
      case 'resistor':body=stroke('M0 30H20V18H60V42H20V30M60 30H80');break;
      case 'led':body=stroke('M0 30H25M25 16V44L51 30Z M51 16V44M51 30H80M51 8L63 -4M58 -4H63V1M63 18L75 6M70 6H75V11');break;
      case 'capacitor':body=stroke('M0 30H34M34 12V48M46 12V48M46 30H80');break;
      case 'battery':body=stroke('M0 30H30M30 10V50M48 19V41M48 30H80')+label(24,7,'+');break;
      case 'button':body=stroke('M0 10H18V50H0M40 10H80V50H40M18 10L38 -2')+label(40,35,'PUSH','#8b9ba8',7);break;
      default:
        body=box(10,0,w-20,h,'#1b252e',2,'#bac8d4')+label(w/2,h/2,def.title,'#d4dde3',10);
        for(const p of s.terminals)body+=label(p.x,p.y+(p.y<h/2?14:-7),p.id,'#9baab8',4.8);
    }
  } else switch(k) {
    case 'breadboard':
      body=box(0,0,w,h,'#eeeee6',6,'#c5c9bf')+box(8,77,w-16,26,'#cbcec6',2)+stroke('M18 3H313','#ce665d',1)+stroke('M18 177H313','#5c8db6',1);
      for(let n=0;n<30;n++)body+=label(20+n*10,24,n+1,'#79887b',5);
      for(let n=0;n<10;n++)body+=label(8,32+n*10+(n>=5?20:0),'abcdefghij'[n],'#79887b',6);
      break;
    case 'uno':
      body=box(0,0,w,h,'#287d87',8,'#6aa3a4')+box(-8,32,38,46,'#bcc4c6',3,'#58636b')+box(-8,40,12,29,'#727d81')+box(2,113,25,37,'#252d30',3)+box(54,63,125,30,'#1c292d',2)+box(15,1,143,18,'#202f31')+box(15,h-19,107,18,'#202f31');
      for(let n=0;n<15;n++)body+=box(57+n*8,57,3,6,'#9eacae');
      body+=label(136,125,'ARDUINO','#dceee8',20)+label(136,141,'UNO','#dceee8',10)+tag('circle',{cx:211,cy:150,r:5,fill:'#263d3e',stroke:'#d3b66c','stroke-width':3})+box(191,39,4,3,'#f0db92');break;
    case 'esp32':
      body=box(0,0,w,h,'#283231',4,'#687773')+box(22,8,56,96,'#b5beb9',2,'#d6d8d0')+box(22,8,56,28,'#c2a76b')+stroke('M26 13H72V19H26V25H72V31H26','#635437',2)+label(50,72,'ESP32','#4d5753',10)+box(30,186,40,25,'#bac4c2',3)+box(2,10,16,164,'#141c1d')+box(82,10,16,164,'#141c1d');break;
    case 'resistor':
      body=stroke('M0 10H80','#b7b6a6',2.5)+box(18,1,44,18,'#d1bc94',8,'#a49679');
      bands(part.value).forEach((c,i)=>body+=box(25+i*8,2,3,16,c,0));break;
    case 'led':
      body=stroke('M10 50V25M30 50V25','#aeb9bb',2.6)+box(4,1,32,32,part.tint,15,'#ffffff30')+box(2,28,36,6,part.tint,2)+tag('ellipse',{cx:13,cy:11,rx:4,ry:7,fill:'#ffffff50',stroke:'none'});break;
    case 'button':
      body=box(2,2,36,36,'#aab2b2',3,'#56676a')+tag('circle',{cx:20,cy:20,r:12,fill:'#252e31',stroke:'#657377','stroke-width':2})+stroke('M0 10H4M0 30H4M36 10H40M36 30H40','#b7b7a9',3);break;
    case 'battery':
      body=box(5,10,60,101,'#303c42',7,'#8f9a96')+box(5,10,60,32,'#b79a60',6)+box(7,2,10,9,'#c5c9bc')+box(27,2,10,9,'#c5c9bc')+stroke('M10 7H-4V120H10','#d27665',2)+stroke('M30 7H74V120H30','#667780',2)+label(35,77,'9V','#e4e1ce',23)+label(35,93,'ALKALINE','#a6b0b2',5);break;
    case 'capacitor':
      body=stroke('M10 50V24M30 50V24','#c2bbb0',2)+tag('ellipse',{cx:20,cy:15,rx:19,ry:15,fill:'#c99458',stroke:'#e4b276'})+label(20,18,'104','#654e39',8);break;
    case 'sensor':
      body=box(4,0,52,59,'#498faf',3,'#91bdce');for(let r=0;r<5;r++)body+=box(10,7+r*9,40,4,'#2f6e8c');body+=stroke('M20 59V80M30 59V80M40 59V80','#adb6b2',2.6);break;
  }
  return body;
}
export function component(def,part,mode,{selected=false,lit=new Set(),interactive=true}={}) {
  const shape=def.shapes[mode];if(!shape.width)return '';
  const p=part.poses[mode];
  const pins=shape.terminals.map(t=>{
    const active=lit.has(part.uid+'/'+t.id),hole=part.kind==='breadboard';
    return tag('circle',{cx:t.x,cy:t.y,r:hole?2.1:mode==='pcb'?4.2:3,fill:active?'#7de4ba':hole?'#53625a':mode==='pcb'?'#c49554':'#d0b774',stroke:active?'#d6ffe7':'#283a38','stroke-width':active?2:1,...(interactive?{'data-contact':part.uid,'data-pin':t.id}:{})},tag('title',{},t.id))+(mode==='pcb'?tag('circle',{cx:t.x,cy:t.y,r:1.7,fill:'#17372d','pointer-events':'none'}):'');
  }).join('');
  return tag('g',{transform:`translate(${p.x} ${p.y}) rotate(${p.angle} ${shape.width/2} ${shape.height/2})`,...(interactive?{'data-component':part.uid,role:'button','aria-label':`${part.label} · ${def.title}`,tabindex:'-1'}:{})},
    (selected?box(-7,-7,shape.width+14,shape.height+14,'#7ba6e910',5,'var(--accent)'):'')+
    box(0,0,shape.width,shape.height,'transparent')+artwork(def,part,mode)+pins+
    (part.kind!=='breadboard'?label(shape.width/2,-12,part.label+(part.kind==='resistor'?' · '+part.value+' Ω':''),'#95a6b4',9):''));
}
