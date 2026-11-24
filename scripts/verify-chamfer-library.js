const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/verificacion-chaflan');
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const injection=`
 window.chamferQA={state,loadSVGString,selectFace,loadFefcoModel,rotateWholeDieline90,
 getModels:()=>userLibraryModels,
 clickFace(id){const f=state.dieline.faces.find(f=>f.id===id),canvas=document.getElementById('canvas-2d'),tf=get2DTransform(canvas,state.dieline.bounds),r=canvas.getBoundingClientRect();const x=r.left+tf.toScreenX(f.centroid.x)*r.width/canvas.width,y=r.top+tf.toScreenY(f.centroid.y)*r.height/canvas.height;canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,button:0,bubbles:true}));}
 };
`;
const store=require('../desktop/library-store'),testLibrary=path.join(out,'library');
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/library-models'){
  try{if(req.method==='GET'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(store.read(testLibrary)));}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);store.add(testLibrary,JSON.parse(Buffer.concat(chunks).toString()));res.writeHead(201,{'Content-Type':'application/json'}).end('{}');return;
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));return;}
 }

 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let data=fs.readFileSync(file);
 if(file===path.join(root,'app.js')) data=Buffer.from(data.toString().replace(/\}\)\(\);\s*$/,injection+'})();'));
 const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime});res.end(data);
 }catch(e){res.writeHead(404).end();}
});
let browser,ws,id=0;const pending=new Map(),errors=[];
async function send(method,params={}) {const n=++id;return new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
function saveData(name,url){fs.writeFileSync(path.join(out,name),Buffer.from(url.split(',')[1],'base64'));}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
 browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader','--remote-debugging-port=9237','--window-size=1600,1000','--user-data-dir='+path.join(out,'chrome-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 let targets;for(let i=0;i<100;i++){try{targets=await(await fetch('http://127.0.0.1:9237/json')).json();if(targets.length)break;}catch{}await sleep(200);}
 if(!targets)throw Error('Chrome debugger unavailable');
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params);});
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
 let ready=false;for(let i=0;i<120;i++){ready=await evaluate('!!window.chamferQA?.state.dieline?.faces?.length');if(ready)break;await sleep(500);}if(!ready)throw Error('App did not load');
 const svg=fs.readFileSync(path.join(root,'assets/caja-b1-americana-sin-retranqueos.svg'),'utf8');
 await evaluate('chamferQA.loadSVGString('+JSON.stringify(svg)+',"b1.svg",false)');
 const result=await evaluate(`(async()=>{
 const q=chamferQA;
 document.querySelector('[data-drawer-tab="parts"]').click();
 q.selectFace(q.state.dieline.rootFaceId);
 const original=JSON.parse(JSON.stringify(q.state.dieline));
 document.querySelector('[data-part-key="chamfer"]').click();
 document.getElementById('part-select-flaps').click();
 const flaps=original.faces.filter(f=>DielineEngine.isChamferFlap(original,f)).slice(0,2);
 if(flaps.length!==2)throw Error('Missing flaps');
 for(const f of flaps)q.clickFace(f.id);
 const body=original.faces.find(f=>f.role==='BODY');q.clickFace(body.id);
 if(q.state.draftPart.targetFaceIds.length!==2)throw Error('Body was selected');
 const input=document.querySelector('#part-options-fields input[type=number][aria-label="Tamaño del chaflán (mm)"]');
 input.value='6';input.dispatchEvent(new Event('input',{bubbles:true}));
 // Leave immediately, including a still-pending animation frame.
 document.querySelector('[data-drawer-tab="basic"]').click();
 if(q.state.draftPart || q.state.selectingChamferFlaps)throw Error('Draft not committed');
 for(const face of original.faces){const after=q.state.dieline.faces.find(f=>f.id===face.id);const equal=JSON.stringify(after.polygon)===JSON.stringify(face.polygon);if(flaps.some(f=>f.id===face.id)?equal:!equal)throw Error('Unexpected changed face '+face.id);}
 const committed=JSON.stringify(q.state.dieline);
 for(const section of ['details','dielines','parts','basic']) document.querySelector('[data-drawer-tab="'+section+'"]').click();
 if(JSON.stringify(q.state.dieline)!==committed)throw Error('Geometry lost between tabs');
 document.getElementById('btn-header-add-die').click();
 const name='QA snapshot '+Date.now();document.getElementById('library-model-name').value=name;
 document.getElementById('library-model-save').click();
 for(let i=0;i<60&&!q.getModels().some(m=>m.name===name);i++)await new Promise(r=>setTimeout(r,100));
 const saved=q.getModels().find(m=>m.name===name);if(!saved)throw Error(document.getElementById('library-model-status').textContent);
 const snapshot=JSON.stringify(saved.geometry);q.rotateWholeDieline90();
 if(JSON.stringify(saved.geometry)!==snapshot)throw Error('Saved model changed');
 document.getElementById('btn-header-add-die').click();document.getElementById('library-model-name').value=name;document.getElementById('library-model-save').click();
 await new Promise(r=>setTimeout(r,200));
 if(!document.getElementById('library-model-status').textContent.includes('Usa otro nombre'))throw Error('Duplicate name not rejected');
 document.getElementById('library-model-cancel').click();
 await q.loadFefcoModel(saved,false);if(JSON.stringify(q.state.dieline.faces.map(f=>f.polygon))!==JSON.stringify(saved.geometry.faces.map(f=>f.polygon)))throw Error('Reload geometry differs');
 document.querySelector('[data-drawer-tab="parts"]').click();document.querySelector('[data-part-key="chamfer"]').click();
 return {id:saved.num,name,flaps:flaps.map(f=>f.id),faces:original.faces.length};
 })()`);
 fs.writeFileSync(path.join(out,'chaflan.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const savedFile=path.join(testLibrary,result.id+'.json');if(!fs.existsSync(savedFile))throw Error('No persistent JSON');
 await send('Page.reload');
 let restored=false;for(let i=0;i<60;i++){restored=await evaluate('!!window.chamferQA?.getModels().some(m=>m.num==='+result.id+')');if(restored)break;await sleep(200);}if(!restored)throw Error('Library lost on reload');
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log(JSON.stringify({...result,persistentReload:true,immutableSnapshot:true,duplicateRejected:true}));
 console.log('Verification saved in '+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(ws){try{await send('Browser.close');}catch{}ws.close();}browser?.kill();server.close();});
