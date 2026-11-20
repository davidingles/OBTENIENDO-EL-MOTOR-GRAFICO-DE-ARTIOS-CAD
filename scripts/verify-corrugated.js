const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/verificacion-corrugado');
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const injection=`
  window.corrugatedQA={state,waitForExportTextures,buildClientGLB,rotateWholeDieline90,loadSVGString,setMasterFold,
    async preview(){
      await waitForExportTextures();
      const scene=new THREE.Scene(); scene.background=new THREE.Color(0xe9edf2);
      scene.add(new THREE.HemisphereLight(0xffffff,0x777777,.65));
      const light=new THREE.DirectionalLight(0xffffff,.65);light.position.set(10,-20,40);scene.add(light);
      const polygon=[{x:0,y:0},{x:30,y:0},{x:30,y:15},{x:20,y:25},{x:0,y:25}];
      const face={polygon,holes:[[{x:5,y:5},{x:11,y:5},{x:11,y:11},{x:5,y:11}]],centroid:{x:15,y:12}};
      const geo=createCrushedPanelGeometry(face,[],1.5,{minX:0,minY:0,maxX:30,maxY:25});
      const mesh=new THREE.Mesh(geo,buildBoardMaterials());scene.add(mesh);
      const view=new THREE.PerspectiveCamera(32,1.5,.1,1000);view.up.set(0,0,1);view.position.set(65,-75,45);view.lookAt(15,-12,0);
      const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1200,800);r.outputEncoding=THREE.sRGBEncoding;
      r.render(scene,view);const image=r.domElement.toDataURL('image/png');r.dispose();geo.dispose();return image;
    },
    async glb(){await waitForExportTextures();const data=await buildClientGLB();return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob([data]));});}
  };
`;
const server=http.createServer((req,res)=>{
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
 let ready=false;for(let i=0;i<120;i++){ready=await evaluate('!!window.corrugatedQA?.state.dieline?.faces?.length');if(ready)break;await sleep(500);}if(!ready)throw Error('App did not load');
 await evaluate('corrugatedQA.waitForExportTextures()');
 await sleep(700);
 fs.writeFileSync(path.join(out,'interfaz.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 saveData('detalle-cantos.png',await evaluate('corrugatedQA.preview()'));
 saveData('troquel.glb',await evaluate('corrugatedQA.glb()'));
 await evaluate("document.getElementById('btn-rotate-dieline').click()");
 saveData('troquel-girado.glb',await evaluate('corrugatedQA.glb()'));
 for(const name of ['troquel.glb','troquel-girado.glb']){
 const data=fs.readFileSync(path.join(out,name));const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
 const materialIndex=doc.materials.findIndex(m=>m.name==='Carton_Canto_Cortado');const mat=doc.materials[materialIndex];
 if(mat?.pbrMetallicRoughness?.baseColorTexture===undefined)throw Error('Missing corrugated image');
 const texture=doc.textures[mat.pbrMetallicRoughness.baseColorTexture.index],image=doc.images[texture.source];
 if(image.bufferView===undefined||image.uri)throw Error('Image not embedded');
 const sampler=doc.samplers[texture.sampler];if(sampler.wrapS!==10497||sampler.wrapT!==33071)throw Error('Incorrect wrapping');
 const primitives=doc.meshes.flatMap(m=>m.primitives).filter(p=>p.material===materialIndex);
 if(!primitives.length||primitives.some(p=>p.attributes.TEXCOORD_0===undefined))throw Error('Missing edge UVs');
 const binStart=20+data.readUInt32LE(12)+8,view=doc.bufferViews[image.bufferView];const png=data.subarray(binStart+(view.byteOffset||0),binStart+(view.byteOffset||0)+view.byteLength);
 fs.writeFileSync(path.join(out,'textura-incluida.png'),png);
 if(png.readUInt32BE(16)!==295||png.readUInt32BE(20)!==37)throw Error('Unexpected image size');
 console.log(name+': embedded PNG 295x37, edge UVs, repeat X/clamp Y, '+doc.meshes.length+' mesh, '+doc.animations.length+' animations');
 }
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="25mm" viewBox="0 0 30 25"><path d="M0 0 L30 0 L30 15 L20 25 L0 25 Z M5 5 L11 5 L11 11 L5 11 Z" stroke="#00a0e9" fill="none"/></svg>';
 await evaluate('corrugatedQA.loadSVGString('+JSON.stringify(svg)+',"muestra.svg",false)');
 saveData('muestra-cantos.glb',await evaluate('corrugatedQA.glb()'));
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('Visuals and GLB saved in '+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(ws){try{await send('Browser.close');}catch{}ws.close();}browser?.kill();server.close();});
