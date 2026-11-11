const fs=require('fs'),vm=require('vm'),path=require('path');
const THREE=require('../assets/libs/three.min'),engine=require('../dieline-engine');
global.window=global;require('../assets/pacdora-catalog/folding-box-dielines-p1');
class FileReader {readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}}
const ctx={THREE,DielineEngine:engine,UserLibrary:require('../library-models'),console,performance,Blob,TextEncoder,ArrayBuffer,Float32Array,Uint32Array,Uint16Array,Uint8Array,Int16Array,Int8Array,FileReader,window:{TextEncoder,FileReader,addEventListener(){}},document:{getElementById(){return null;}}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/libs/GLTFExporter.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/\}\)\(\);\s*$/,`
 buildBoardMaterials=()=>{matCreaseCore=new THREE.MeshStandardMaterial({color:0xa87b46,roughness:.9});return [0xcfa778,0xd8b98b,0x9f7748].map(color=>new THREE.MeshStandardMaterial({name:color===0xcfa778?"Carton_Cara_Exterior":color===0xd8b98b?"Carton_Cara_Interior":"Carton_Canto_Corrugado",color,roughness:.85}));};
 render2FDieline=()=>{};
 globalThis.exportSample=(model)=>{state.dieline=model;rootBoxGroup=new THREE.Group();bboxHelperGroup=new THREE.Group();rebuild3DMesh();setMasterFold(0);const root=dielineRootGroup.clone(true);root.traverse(o=>{if(o.userData?.isCADHelper)o.visible=false;});root.scale.multiplyScalar(.001);root.position.multiplyScalar(.001);return new Promise(resolve=>new THREE.GLTFExporter().parse(root,resolve,{binary:true,animations:buildBlenderAnimationClips().filter(c=>c.name.startsWith('02_')),onlyVisible:true}));};
})();`),ctx);
const entry=PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e=>e.num===150010);
ctx.exportSample(engine.buildDielineModelFromPacdora(entry.knifeData,entry)).then(data=>{
 // The headless sample has no DOM image loader: embed the same PNG used by
 // the app into its edge material directly in the GLB fixture.
 const source=Buffer.from(data),jsonLength=source.readUInt32LE(12);
 const doc=JSON.parse(source.subarray(20,20+jsonLength).toString());
 const binary=source.subarray(28+jsonLength);
 const png=fs.readFileSync(path.join(__dirname,'../assets/corrugado.png'));
 const view=doc.bufferViews.length;
 doc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:png.length});
 doc.images=[{name:'corrugado.png',mimeType:'image/png',bufferView:view}];
 doc.samplers=[{wrapS:10497,wrapT:10497}];doc.textures=[{source:0,sampler:0}];
 doc.materials.find(m=>m.name==='Carton_Canto_Corrugado').pbrMetallicRoughness.baseColorTexture={index:0};
 doc.buffers[0].byteLength=binary.length+png.length;
 const json=Buffer.from(JSON.stringify(doc));const jp=Buffer.alloc((json.length+3)&~3,32);json.copy(jp);
 const bp=Buffer.alloc((binary.length+png.length+3)&~3);binary.copy(bp);png.copy(bp,binary.length);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jp.length+bp.length,8);header.writeUInt32LE(jp.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bp.length);bh.writeUInt32LE(0x004e4942,4);
 fs.mkdirSync(path.join(__dirname,'../dist'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'../dist/Troquel-Animado.glb'),Buffer.concat([header,jp,bh,bp]));console.log('GLB listo');
}).catch(e=>{console.error(e);process.exitCode=1;});



