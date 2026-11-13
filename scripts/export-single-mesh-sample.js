// Generate a real GLB through the same path used by the application.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require('../assets/libs/three.min'), engine = require('../dieline-engine');
global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1');
class FileReader { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result=result; this.onloadend?.(); }); } }
const context = {THREE, DielineEngine:engine, UserLibrary:require('../library-models'), console, performance,
  Blob, TextEncoder, ArrayBuffer, Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int8Array, FileReader,
  window:{TextEncoder, FileReader, addEventListener(){}}, document:{getElementById(){return null;}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/libs/GLTFExporter.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/\}\)\(\);\s*$/, `
  buildBoardMaterials=()=>{matCreaseCore=new THREE.MeshStandardMaterial({color:0xa87b46});return [0xcfa778,0xd8b98b,0x9f7748].map((color,i)=>new THREE.MeshStandardMaterial({name:['Exterior','Interior','Canto'][i],color}));};
  render2FDieline=()=>{};
  globalThis.exportSample=model=>{state.dieline=model;rootBoxGroup=new THREE.Group();bboxHelperGroup=new THREE.Group();rebuild3DMesh();setMasterFold(.75);return buildClientGLB();};
})();`),context);

async function main(){
  const entry=PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e=>e.num===150010);
  const models=[['catalogo',engine.buildDielineModelFromPacdora(entry.knifeData,entry)],['botellines',engine.buildDielineModel(fs.readFileSync(path.join(__dirname,'../tests/fixtures/illustrator-class-strokes.svg'),'utf8'))]];
  const directory=path.join(__dirname,'../dist/verificacion-malla-unica');
  fs.mkdirSync(directory,{recursive:true});
  for(const [name,model] of models){
    const data=Buffer.from(await context.exportSample(model));
    const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
    if(doc.meshes.length!==1 || doc.nodes.filter(n=>n.mesh!==undefined).length!==1 || doc.skins?.length!==1)throw Error('Se requiere una malla y una armadura');
    if(doc.animations.length!==2 || doc.animations.some(a=>a.channels.some(c=>c.target.path!=='rotation')))throw Error('La animación debe rotar huesos');
    const primitive=doc.meshes[0].primitives[0];
    if(doc.meshes[0].primitives.some(p=>p.targets || p.attributes.JOINTS_0===undefined || p.attributes.WEIGHTS_0===undefined || p.attributes.TEXCOORD_0===undefined))throw Error('Faltan pesos, huesos o UV, o hay shape keys');
    fs.writeFileSync(path.join(directory,`${name}.glb`),data);
    console.log(`${name}: ${data.length} bytes, 1 malla, ${doc.skins[0].joints.length} huesos, ${doc.meshes[0].primitives.length} materiales, sin shape keys y 2 animaciones`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
