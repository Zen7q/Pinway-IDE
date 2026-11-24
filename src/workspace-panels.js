// One persisted outer sidebar width for Code, Build and Display.
const key='pinway.workspaceSidebarWidth';
const stored=Number(localStorage.getItem(key)||localStorage.getItem('pinway.sidebarWidth'));
const shared=globalThis[Symbol.for('pinway.workspacePanels')] ||= {preferred:Number.isFinite(stored)&&stored>0?stored:224,listeners:new Set(),observing:false};
export function sidebarLimits(){return {min:208,max:Math.max(208,Math.min(440,document.documentElement.clientWidth-340))};}
export function sidebarWidth(){const {min,max}=sidebarLimits();return Math.max(min,Math.min(max,shared.preferred));}
export function refreshSidebarWidth(){const width=sidebarWidth();document.documentElement.style.setProperty('--workspace-sidebar-width',width+'px');for(const fn of shared.listeners)fn(width);}
export function setSidebarWidth(width){if(!Number.isFinite(width))return;const {min,max}=sidebarLimits();shared.preferred=Math.max(min,Math.min(max,width));localStorage.setItem(key,String(shared.preferred));refreshSidebarWidth();}
export function bindSidebarResize(handle){
 handle.classList.add('workspace-sash');handle.role='separator';handle.tabIndex=0;handle.setAttribute('aria-orientation','vertical');
 const update=width=>{const {min,max}=sidebarLimits();handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',width);};shared.listeners.add(update);update(sidebarWidth());
 handle.onpointerdown=e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();handle.focus();handle.setPointerCapture(e.pointerId);const x=e.clientX,width=sidebarWidth();handle.classList.add('dragging');handle.onpointermove=e=>setSidebarWidth(width+e.clientX-x);};
 handle.onlostpointercapture=()=>{handle.onpointermove=null;handle.classList.remove('dragging');};
 handle.onkeydown=e=>{const {min,max}=sidebarLimits(),next={ArrowLeft:sidebarWidth()-16,ArrowRight:sidebarWidth()+16,Home:min,End:max}[e.key];if(next===undefined)return;e.preventDefault();setSidebarWidth(next);};
 handle.ondblclick=()=>setSidebarWidth(224);
}
export function panelHeading(title,action){const header=document.createElement('header');header.className='workspace-panel-heading';const name=document.createElement('div');name.innerHTML=`<span class="workspace-eyebrow">PINWAY</span><h2>${title} <span class="workspace-badge">EDITOR</span></h2>`;header.append(name);if(action)header.append(action);return header;}
if(!shared.observing){window.addEventListener('resize',refreshSidebarWidth);shared.observing=true;}
refreshSidebarWidth();
