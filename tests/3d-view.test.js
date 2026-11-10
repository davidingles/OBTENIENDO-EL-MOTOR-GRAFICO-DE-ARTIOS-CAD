const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../assets/libs/three.min.js');
const engine = require('../dieline-engine.js');
global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const entry = global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e => e.num === 150010);

function app() {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const context = {THREE, DielineEngine: engine, console, performance, window: {addEventListener() {}}, document: {getElementById() { return null; }}};
  vm.createContext(context);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    buildBoardMaterials = () => [0,1,2].map(() => new THREE.MeshBasicMaterial());
    render2FDieline = () => {};
    globalThis.testApp = {
      state, createCrushedPanelGeometry, setMasterFold, updateSelectionHighlight, fitCameraToModel,
      setup(model) {
        state.dieline = model;
        rootBoxGroup = new THREE.Group();
        bboxHelperGroup = new THREE.Group();
        camera = new THREE.PerspectiveCamera(38, 1.25, 0.1, 10000);
        controls = {target: new THREE.Vector3(), update() {camera.lookAt(this.target); camera.updateMatrixWorld(true);}};
        rebuild3DMesh();
      },
      meshes: faceMeshMap,
      get root() { return dielineRootGroup; },
      get camera() { return camera; },
      get boxHelpers() { return bboxHelperGroup; }
    };
  })();`), context);
  return context.testApp;
}

test('la base marcada en 2D permanece horizontal, inmóvil y apoyada en el suelo durante el plegado', () => {
  const ui = app();
  const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
  ui.setup(model);
  let reference;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    ui.setMasterFold(t);
    ui.root.updateMatrixWorld(true);
    const base = ui.meshes.get(model.rootFaceId).mesh;
    const box = new THREE.Box3().setFromObject(base);
    assert.ok(Math.abs(box.min.y) < 1e-5, `apoyo en ${t}: ${box.min.y}`);
    const up = new THREE.Vector3(0, 0, 1).transformDirection(base.matrixWorld);
    assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-6);
    const matrix = base.matrixWorld.elements;
    if (!reference) reference = matrix.slice();
    matrix.forEach((value, i) => assert.ok(Math.abs(value - reference[i]) < 1e-6));
  }
});

test('el modelo completo cabe en el visor al cambiar su proporción', () => {
  const ui = app();
  ui.setup(engine.buildDielineModelFromPacdora(entry.knifeData, entry));
  ui.setMasterFold(0.75);
  for (const aspect of [0.7, 1.25, 2]) {
    ui.camera.aspect = aspect;
    ui.camera.updateProjectionMatrix();
    ui.fitCameraToModel(true);
    for (const {mesh} of ui.meshes.values()) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(ui.camera);
        assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `vértice recortado con proporción ${aspect}`);
      }
    }
  }
});

test('cada vértice exterior tiene la UV del punto correcto, sin deformar los triángulos', () => {
  for (const artwork of [null, {}]) {
    const ui = app();
    ui.state.customArtworkTex = artwork;
    const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
    const face = model.faces.find(f => f.id === model.rootFaceId);
    const hinges = model.hinges.filter(h => h.parentFaceId === face.id || h.childFaceId === face.id);
    const geo = ui.createCrushedPanelGeometry(face, hinges, 3, model.bounds);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const exterior = geo.groups.find(g => g.materialIndex === 0);
    for (let i = exterior.start; i < exterior.start + exterior.count; i++) {
      const u = artwork ? (pos.getX(i) - model.bounds.minX) / model.bounds.width : pos.getX(i) / 130;
      const v = artwork ? (pos.getY(i) + model.bounds.maxY) / model.bounds.height : pos.getY(i) / 130;
      assert.ok(Math.abs(uv.getX(i) - u) < 1e-5, `U del vértice ${i}`);
      assert.ok(Math.abs(uv.getY(i) - v) < 1e-5, `V del vértice ${i}`);
    }
  }
});

test('seleccionar o señalar un panel no añade contornos azules ni el box auxiliar', () => {
  const ui = app();
  const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
  ui.setup(model);
  ui.state.selectedFaceId = model.rootFaceId;
  ui.state.hoveredFaceId = model.rootFaceId;
  ui.updateSelectionHighlight();
  assert.ok([...ui.meshes.values()].every(item => !item.cutOutline.visible));
  assert.equal(ui.boxHelpers.children.length, 0);
});
