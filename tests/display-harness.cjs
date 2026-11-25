// Browser integration harness: serves the actual UI with an in-memory native API.
// Run: node tests/display-harness.cjs, then open http://127.0.0.1:8467.
// No Arduino process, user files or device ports are accessed.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const addons=Object.fromEntries(['build','display'].map(id=>[id,{javascript:fs.readFileSync(path.join(root,'.toolchain/addons',id,'workspace.js'),'utf8'),css:fs.readFileSync(path.join(root,'.toolchain/addons',id,'workspace.css'),'utf8')}]));
const mock=`
document.querySelector('#toolbar').before(document.querySelector('.zoom-controls'));
window.testErrors=[];addEventListener('error',e=>testErrors.push(e.message));addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));
const stores=JSON.parse(localStorage.getItem('test-display-store')||'{}');
window.testCalls=[];window.testChoice=2;window.testProject='/test/'+(new URLSearchParams(location.search).get('project')||'One');window.testSubscriber=null;
const packageFlags={esp32:false,build:!new URLSearchParams(location.search).has('minimal'),display:!new URLSearchParams(location.search).has('minimal')};
const packageState=()=>({version:'0.3.0',onboarded:!new URLSearchParams(location.search).has('setup'),packs:['arduino','esp32','build','display'].map(id=>({id,name:id,description:'Package '+id,required:id==='arduino',installed:id==='arduino'||packageFlags[id]}))});
const addonBundles=${JSON.stringify(addons)};
const code='void setup() {}\\nvoid loop() {}\\n';
window.pinway={subscribe(fn){testSubscriber=fn;},async call(action,p){testCalls.push({action,p});
 if(action==='packs')return packageState();
 if(action==='packInstall'||action==='packRemove'){packageFlags[p]=action==='packInstall';return packageState();}
 if(action==='packModule')return addonBundles[p];
 if(action==='updateCheck')return {current:'0.3.0',version:'0.4.0',published:true,available:new URLSearchParams(location.search).has('update')};
 if(action==='finishSetup'||action==='updateInstall')return null;
 const project=()=>({root:testProject,primary:testProject+'/Main.ino',selected:testProject+'/Main.ino',name:testProject.split('/').pop()});
 if(action==='state')return {profiles:[],recent:[],templates:[],recovery:{primary:testProject+'/Main.ino',tabs:[],drafts:{}}};
 if(action==='reopen') {testProject=p.slice(0,p.lastIndexOf('/'));return project();}
 if(action==='select') {testProject='/test/Two';return project();}
 if(action==='close')return null;
 if(action==='list'||action==='children')return [{name:'Main.ino',path:testProject+'/Main.ino',editable:true,folder:false}];
 if(action==='files')return [];
 if(action==='read')return code;
 if(action==='ports')return [];
 if(action==='catalog'||action==='search')return [];
 if(action==='installed')return {};
 if(action==='designer')return p.op==='library'?[]:p.op==='inspect'?{nets:[]}:null;
 if(action==='display'){if(p.op==='load')return structuredClone(stores[p.root]||null);stores[p.root]=structuredClone(p.document);localStorage.setItem('test-display-store',JSON.stringify(stores));return null;}
 if(action==='dirtyPrompt')return testChoice;
 return null;
}};
`;
http.createServer((req,res)=>{
 let request=new URL(req.url,'http://localhost'),url=request.pathname;
 if(url==='/Pinway.png'){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(path.join(root,'assets/Pinway.png')));return;}
 if(url==='/installation-checks.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'tests/installation-browser-checks.js')));return;}
 if(url==='/layout-checks.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'tests/workspace-layout-browser-checks.js')));return;}
 if(url==='/checks.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'tests/display-browser-checks.js')));return;}
 if(url==='/mock.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);return;}
 if(url==='/'){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(root,'src/index.html'),'utf8').replace('<html lang="uk">',request.searchParams.has('studio')?'<html lang="uk" data-host="tauri" data-macos>':'<html lang="uk">').replace('<script defer src="ui.bundle.js"></script>','<script defer src="mock.js"></script><script defer src="ui.bundle.js"></script>').replace('</body>', request.searchParams.has('layoutchecks')?'<script defer src="layout-checks.js"></script></body>':request.searchParams.has('checks')?'<script defer src="installation-checks.js"></script></body>':'</body>'));return;}
 const file=path.join(root,'src',url);if(!file.startsWith(root+'/src/')||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',url.endsWith('.css')?'text/css':url.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
}).listen(8467,'127.0.0.1',()=>console.log('Display harness: http://127.0.0.1:8467'));
