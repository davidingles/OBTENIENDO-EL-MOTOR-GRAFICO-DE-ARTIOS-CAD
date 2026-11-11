const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require('../assets/libs/three.min'), engine = require('../dieline-engine');
global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1');
class FileReader { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); } }
const context = { THREE, DielineEngine: engine, UserLibrary: require('../library-models'), console, performance,
  Blob, TextEncoder, ArrayBuffer, Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int8Array, FileReader,
  window: { TextEncoder, FileReader, addEventListener() {} }, document: { getElementById() { return null; } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/libs/GLTFExporter.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/\}\)\(\);\s*$/, `
  buildBoardMaterials = () => { matCreaseCore = new THREE.MeshStandardMaterial({color:0xa87b46,roughness:.9}); return [0xcfa778,0xd8b98b,0x9f7748].map(color=>new THREE.MeshStandardMaterial({color,roughness:.85})); };
  render2FDieline = () => {};
  globalThis.sample = model => { state.dieline=model; rootBoxGroup=new THREE.Group(); bboxHelperGroup=new THREE.Group(); rebuild3DMesh(); setMasterFold(.75); return buildClientGLB(); };
})();`), context);
const entry = PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e => e.num === 150010);
context.sample(engine.buildDielineModelFromPacdora(entry.knifeData, entry)).then(data => {
  const destination = path.join(__dirname, '../dist/client-viewer/modelos/demo.glb');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(data));
  const json = JSON.parse(Buffer.from(data).subarray(20, 20 + new DataView(data).getUint32(12, true)).toString());
  if (!json.animations?.length) throw new Error('La caja publicada debe incluir la animación de plegado.');
  console.log('Caja demo exportada con buildClientGLB: ' + data.byteLength + ' bytes');
}).catch(error => { console.error(error); process.exitCode = 1; });
