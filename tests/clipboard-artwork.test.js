const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function editor(realImporter=false){
  const calls=[],listeners={},elements=new Map();
  class FileReader {
    readAsDataURL(file){file.arrayBuffer().then(bytes=>{this.result=`data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload();});}
  }
  class Image {
    naturalWidth=1;naturalHeight=1;
    set src(value){this.source=value;Promise.resolve().then(()=>this.onload());}
  }
  const context={THREE:require('../assets/libs/three.min'),DielineEngine:require('../dieline-engine'),UserLibrary:require('../library-models'),ArtworkLayout:require('../artwork-layout'),
    console,performance,FileReader,Image,window:{addEventListener(type,listener){listeners[type]=listener;}},
    document:{activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,{classList:{remove(){}}});return elements.get(id);}},
    alert(message){calls.push({type:'error',message});}};
  vm.createContext(context);
  const source=fs.readFileSync(require.resolve('../app'),'utf8').replace(/\}\)\(\);\s*$/,`
    ${realImporter?'':"applyCustomArtworkFile=async file=>calls.push({type:'file',file});"}
    refreshArtworkAtlas=()=>calls.push({type:'atlas'});rebuild3DMesh=()=>calls.push({type:'mesh'});
    setMasterFold=()=>{};render2FDieline=()=>{};openArtworkOptions=()=>calls.push({type:'controls'});
    state.dieline={bounds:{minX:0,minY:0,width:100,height:50}};
    globalThis.clipboardEditor={state};
  })();`);
  context.calls=calls;
  vm.runInContext(source,context);
  return {calls,paste:listeners.paste,state:context.clipboardEditor.state};
}
const canvas={isContentEditable:false,closest(){return null;}};
function pasteEvent(data,target=canvas){return {target,clipboardData:data,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};}
const image=()=>new Blob([Uint8Array.from([137,80,78,71])],{type:'image/png'});
const item=file=>({kind:'file',type:file.type,getAsFile:()=>file});

test('pegar una imagen en el canvas usa el cargador de arte y consume el pegado',async()=>{
  const ui=editor(),file=image(),event=pasteEvent({items:[{kind:'string',type:'text/html'},item(file)],files:[file]});
  await ui.paste(event);
  assert.equal(event.defaultPrevented,true);
  assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].file,file);
});
test('el mismo pegado no duplica la imagen aunque venga en items y files',async()=>{
  const ui=editor(),a=image(),b=image();
  await ui.paste(pasteEvent({items:[item(a),item(b)],files:[a,b]}));
  assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].file,a);
});
test('admite archivos de imagen del portapapeles cuando items no está disponible',async()=>{
  const ui=editor(),file=image();await ui.paste(pasteEvent({files:[file]}));
  assert.equal(ui.calls[0].file,file);
});
test('conserva el pegado normal al editar campos o texto editable',async()=>{
  for(const target of [{closest(){return {};},isContentEditable:false},{closest(){return null;},isContentEditable:true}]){
    const ui=editor(),event=pasteEvent({items:[item(image())]},target);
    await ui.paste(event);assert.equal(event.defaultPrevented,false);assert.equal(ui.calls.length,0);
  }
});
test('texto, archivos no gráficos y portapapeles vacío no alteran el arte',async()=>{
  const ui=editor();for(const data of [null,{}, {items:[{kind:'string',type:'text/plain'}]}, {files:[{type:'application/pdf'}]}]){
    const event=pasteEvent(data);await ui.paste(event);assert.equal(event.defaultPrevented,false);
  }assert.equal(ui.calls.length,0);
});
test('respeta un evento ya consumido por otro control',async()=>{
  const ui=editor(),event=pasteEvent({items:[item(image())]});event.defaultPrevented=true;
  await ui.paste(event);assert.equal(ui.calls.length,0);
});
test('la imagen pegada recorre FileReader y el importador, actualiza el atlas y 3D y abre sus ajustes',async()=>{
  const ui=editor(true),file=image();
  await ui.paste(pasteEvent({items:[item(file)]}));
  assert.equal(ui.state.artwork.dataUrl,'data:image/png;base64,iVBORw==');
  assert.equal(ui.state.artwork.scope,'all');
  assert.equal(ui.state.artwork.blendMode,'normal');
  assert.equal(ui.state.artworks.length,1);
  assert.equal(ui.state.artworkEditing,true);
  assert.equal(ui.state.toolMode,'select');
  assert.deepEqual(ui.calls.map(c=>c.type),['atlas','mesh','controls']);
});

test('duplicar imagen y activar multiplicar color funciona sobre copias independientes',async()=>{
  const ops=[];
  const elements=new Map();
  const makeEl=id=>{if(!elements.has(id))elements.set(id,{id,value:'',checked:false,innerHTML:'',classList:{remove(){},add(){}},appendChild(){},addEventListener(){},setAttribute(){},close(){},show(){}});return elements.get(id);};
  class Image{naturalWidth=100;naturalHeight=50;set src(v){this._s=v;Promise.resolve().then(()=>this.onload());}}
  const ctx2d={setTransform(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},translate(){},rotate(){},scale(){},fillRect(){},
    set globalCompositeOperation(v){ops.push(v);},drawImage(){}};
  const context={THREE:require('../assets/libs/three.min'),DielineEngine:require('../dieline-engine'),UserLibrary:require('../library-models'),ArtworkLayout:require('../artwork-layout'),
    console,performance,Image,requestAnimationFrame:fn=>fn(0),window:{addEventListener(){}},
    document:{activeElement:null,getElementById:makeEl,createElement:()=>({width:0,height:0,getContext:()=>ctx2d})},alert(){}};
  vm.createContext(context);
  const source=fs.readFileSync(require.resolve('../app'),'utf8').replace(/\}\)\(\);\s*$/,`
    rebuild3DMesh=()=>{};setMasterFold=()=>{};render2FDieline=()=>{};
    state.dieline={bounds:{minX:0,minY:0,width:200,height:100},faces:[{id:0,polygon:[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}],bounds:{minX:0,minY:0,width:200,height:100}}]};
    initArtworkControls();
    globalThis._art={state,loadArtworkData,duplicateActiveArtwork,deleteActiveArtwork,refreshArtworkAtlas};
  })();`);
  vm.runInContext(source,context);
  const art=context._art;
  await art.loadArtworkData('data:image/png;base64,iVBORw==');
  assert.equal(art.state.artworks.length,1);
  // Activar multiplicar color en la imagen 1
  const mul=elements.get('art-multiply');
  mul.checked=true;mul.onchange({target:mul});
  assert.equal(art.state.artwork.blendMode,'multiply');
  assert.ok(ops.includes('multiply'),'Debe usar globalCompositeOperation = multiply');
  // Copiar imagen
  art.duplicateActiveArtwork();
  assert.equal(art.state.artworks.length,2);
  assert.equal(art.state.activeArtworkIndex,1);
  assert.notEqual(art.state.artworks[1].centerX,art.state.artworks[0].centerX);
  assert.equal(art.state.artworks[1].blendMode,'multiply');
  // Eliminar la copia vuelve a la imagen original
  art.deleteActiveArtwork();
  assert.equal(art.state.artworks.length,1);
  assert.equal(art.state.activeArtworkIndex,0);
});
