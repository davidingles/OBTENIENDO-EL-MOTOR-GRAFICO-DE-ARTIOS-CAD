const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const engine=require('../dieline-engine'),UserLibrary=require('../library-models'),VectorCAD=require('../vector-cad');
function setup(){
 const els=new Map(),storage=new Map();
 const el=id=>{if(!els.has(id))els.set(id,{value:'',textContent:'',hidden:false,disabled:false,classList:{add(){}}});return els.get(id);};
 const ctx={DielineEngine:engine,UserLibrary,VectorCAD,TextEncoder,console,performance,prompt:()=>"Proyecto prueba",window:{addEventListener(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}},document:{getElementById:el},alert:e=>{throw Error(e)}};
 vm.createContext(ctx);
 let source=fs.readFileSync(require.resolve('../app'),'utf8').replace(/\}\)\(\);\s*$/,`rebuild3DMesh=()=>{};setMasterFold=()=>{};buildHingeSlidersUI=()=>{};render2FDieline=()=>{}; globalThis.api={state,initVectorEditor,select(v){vectorSelection=v;},getModels(){return userLibraryModels;}};})();`);
 vm.runInContext(source,ctx);return {api:ctx.api,el,storage};
}
function model(){let hole=[{x:3,y:3},{x:5,y:3},{x:5,y:5},{x:3,y:5}];return {faces:[{id:1,polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],holes:[hole],bounds:{minX:0,minY:0,maxX:10,maxY:10,width:10,height:10},centroid:{x:5,y:5}}],rootFaceId:1,hinges:[],foldSegments:[],cutSegments:hole.map((p,i)=>({x1:p.x,y1:p.y,x2:hole[(i+1)%4].x,y2:hole[(i+1)%4].y})),bounds:{minX:0,minY:0,maxX:10,maxY:10,width:10,height:10},boxDimensionsMm:{length:10,width:10,depth:10}};}
test('agujeros, clasificación real y guardado explícito con deshacer/rehacer',async()=>{
 const {api,el,storage}=setup();api.state.dieline=model();api.state.fileName='Prueba';api.initVectorEditor();api.select({type:'hole',face:0,index:0});el('vector-hole-width').value='4';el('vector-hole-height').value='4';el('vector-apply-hole').onclick();
 // The edited contour is recovered as a physical closed panel with its hole.
 assert.equal(api.state.dieline.cutSegments[0].x1,2);assert.equal(storage.size,0);
 const before=api.state.dieline.cutSegments.length;
 api.select({type:'line',kind:'cut',index:0});el('vector-kind').value='fold';el('vector-apply-kind').onclick();
 assert.equal(api.state.dieline.cutSegments.length,before-1);assert.equal(api.state.dieline.foldSegments.length,1);
 assert.equal(api.state.dieline.foldSegments[0].type,'FOLD');assert.equal(api.state.dieline.foldSegments[0].color,undefined);
 el('vector-undo').onclick();assert.equal(api.state.dieline.cutSegments.length,before);el('vector-redo').onclick();assert.equal(api.state.dieline.foldSegments.length,1);
 // Save a closed valid model and update the same personal model on the next save.
 api.state.dieline=model();api.state.dieline.cutSegments.push({x1:0,y1:0,x2:10,y2:0},{x1:10,y1:0,x2:10,y2:10},{x1:10,y1:10,x2:0,y2:10},{x1:0,y1:10,x2:0,y2:0});
 api.state.artwork={dataUrl:'data:image/png;base64,AA==',centerX:1,centerY:2};
 await el('vector-save').onclick();assert.equal(api.getModels().length,0);
 const projects=JSON.parse([...storage.values()][0]);assert.equal(projects.length,1);assert.equal(projects[0].artwork.dataUrl,'data:image/png;base64,AA==');assert.equal(projects[0].geometry.cutSegments.length,8);
 await el('vector-save').onclick();assert.equal(api.getModels().length,0);assert.equal(JSON.parse([...storage.values()][0]).length,2);
});
