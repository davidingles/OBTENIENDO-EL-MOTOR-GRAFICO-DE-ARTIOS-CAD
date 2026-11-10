const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const THREE=require('../assets/libs/three.min');
const engine=require('../dieline-engine');
const cad=require('../cad-io');
const UserLibrary=require('../library-models');

function editor(disk){
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,open:false,classList:{hidden:false,add(name){if(name==='hidden')this.hidden=true;}},showModal(){this.open=true;},close(){this.open=false;},click(){}});
    return elements.get(id);
  }
  const context={THREE,DielineEngine:engine,UserLibrary,console,performance,alert(error){throw Error(error);},window:{addEventListener(){},__TAURI__:{core:{async invoke(command,args){
    if(command==='load_library_models')return {models:JSON.parse(JSON.stringify(disk)),warnings:[]};
    if(command==='add_library_model'){disk.push(JSON.parse(JSON.stringify(args.model)));return;}
    throw Error('Unexpected command '+command);
  }}}},document:{getElementById:element,querySelectorAll(){return [];},querySelector(){return {click(){}};}}};
  vm.createContext(context);
  const source=fs.readFileSync(require.resolve('../app'),'utf8').replace(/\}\)\(\);\s*$/,`
    rebuild3DMesh=()=>{};setMasterFold=()=>{};updateDielineInfoUI=()=>{};renderDrawerCatalogList=()=>{};
    globalThis.flow={state,initUserLibraryUI,allCatalogModels,loadFefcoModel,async load(){userLibraryReady=loadUserLibrary();await userLibraryReady;},opened:null};
    applyNewDielineModel=(model,title)=>{flow.opened={model,title};};
  })();`);
  vm.runInContext(source,context);
  return {...context.flow,flow:context.flow,element};
}

test('el botón guarda el modelo importado con nombre y C8 y otra sesión lo recupera de la biblioteca',async()=>{
  const disk=[];
  const first=editor(disk);
  await first.load();first.initUserLibraryUI();
  const model=engine.buildDielineModel(cad.toSvg(cad.parse(fs.readFileSync(require.resolve('./fixtures/bandeja-120x80.dxf'),'utf8'))));
  first.state.dieline=model;first.state.fileName='bandeja.dxf';first.state.canAddToLibrary=true;
  first.element('btn-add-library').onclick();
  assert.equal(first.element('add-library-dialog').open,true);
  assert.equal(first.element('library-model-name').value,'bandeja');
  first.element('library-model-name').value='Mi bandeja C8';first.element('library-model-board').value='C8';
  await first.element('library-model-save').onclick();
  assert.equal(disk.length,1);assert.equal(disk[0].name,'Mi bandeja C8');assert.equal(disk[0].thickness,7);
  assert.deepEqual(disk[0].geometry,model);
  assert.equal(first.state.caliper,7);assert.equal(first.state.catalogCategory,'user-models');
  assert.equal(first.element('add-library-dialog').open,false);
  assert.equal(first.element('btn-add-library').classList.hidden,true);
  const reopened=editor(disk);await reopened.load();
  assert.equal(reopened.allCatalogModels().length,1);
  await reopened.loadFefcoModel(reopened.allCatalogModels()[0],false);
  assert.equal(reopened.state.caliper,7);assert.equal(reopened.state.boardCode,'C8');
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.flow.opened.model)),model);
});

test('cancelar el formulario no añade modelos y un nombre vacío mantiene el diálogo abierto',async()=>{
  const disk=[],ui=editor(disk);await ui.load();ui.initUserLibraryUI();
  ui.state.canAddToLibrary=true;ui.state.fileName='prueba.svg';ui.state.dieline={};
  ui.element('btn-add-library').onclick();ui.element('library-model-cancel').onclick();
  assert.equal(disk.length,0);assert.equal(ui.element('add-library-dialog').open,false);
  ui.element('btn-add-library').onclick();ui.element('library-model-name').value='   ';
  await ui.element('library-model-save').onclick();
  assert.equal(disk.length,0);assert.equal(ui.element('add-library-dialog').open,true);
  assert.match(ui.element('library-model-status').textContent,/nombre/);
  assert.equal(ui.element('library-model-save').disabled,false);
});
