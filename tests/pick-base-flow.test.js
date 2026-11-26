const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../assets/libs/three.min.js');
const engine = require('../dieline-engine.js');
const VectorCAD = require('../vector-cad.js');
const UserLibrary = require('../library-models.js');

const sampleTraySvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 280" width="180mm" height="280mm">
    <path d="M40,0 L140,0 L140,40 L180,40 L180,240 L140,240 L140,280 L40,280 L40,240 L0,240 L0,40 L40,40 Z"
          fill="none" stroke="#00a0e9" stroke-width="1" />
    <line x1="40" y1="40" x2="140" y2="40" stroke="#e6007e" stroke-width="1" />
    <line x1="40" y1="240" x2="140" y2="240" stroke="#e6007e" stroke-width="1" />
    <line x1="40" y1="40" x2="40" y2="240" stroke="#e6007e" stroke-width="1" />
    <line x1="140" y1="40" x2="140" y2="240" stroke="#e6007e" stroke-width="1" />
  </svg>
`;

function createMockApp() {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const elements = new Map();
  const makeEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        width: 800,
        height: 600,
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        disabled: false,
        listeners: {},
        classList: {
          _s: new Set(),
          add(c) { this._s.add(c); },
          remove(c) { this._s.delete(c); },
          toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
          contains(c) { return this._s.has(c); }
        },
        addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); },
        querySelector: () => makeEl('__qs'),
        querySelectorAll: () => [],
        appendChild() {},
        closest: () => null,
        close() {},
        setAttribute() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        parentElement: { clientWidth: 800, clientHeight: 600 },
        getContext: () => new Proxy({}, {
          get: (_, prop) => prop === 'measureText' ? (() => ({ width: 20 })) : (() => {})
        })
      });
    }
    return elements.get(id);
  };

  const ctx = {
    THREE, DielineEngine: engine, UserLibrary, VectorCAD,
    console, performance, setTimeout, clearTimeout, requestAnimationFrame: fn => fn(0),
    alert: msg => { throw new Error('Unexpected alert: ' + msg); },
    window: { devicePixelRatio: 1, addEventListener() {}, innerWidth: 1280, innerHeight: 800 },
    document: {
      getElementById: makeEl,
      createElement: tag => makeEl('__dyn_' + tag),
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { style: {}, classList: { toggle() {}, add() {}, remove() {} } },
      addEventListener() {}
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    getArtiosTexture = () => new THREE.Texture();
    rootBoxGroup = new THREE.Group();
    bboxHelperGroup = new THREE.Group();
    camera = new THREE.PerspectiveCamera(38, 1.25, 0.1, 10000);
    controls = { target: new THREE.Vector3(), update() { camera.lookAt(this.target); camera.updateMatrixWorld(true); } };
    globalThis._testApp = { state, handleUndo, handleRedo, loadSVGString, initUIControls, init2DCanvasInteractions, setMasterFold, computeHingeAngleAtProgress, deleteFoldOrderStep, faceMeshMap, get2DTransform, hitTest2DCanvas, get root() { return dielineRootGroup; } };
  })();`), ctx);
  return { app: ctx._testApp, elements, makeEl };
}

test('pulsar Elegir base actualiza medidas y cotas sin cambiar el apoyo 3D; Seleccionar apoyo cambia el suelo 3D sin alterar las cotas', async () => {
  const { app, elements, makeEl } = createMockApp();
  app.initUIControls();
  app.init2DCanvasInteractions();
  app.loadSVGString(sampleTraySvg, 'bandeja.svg', true);

  const initialSupportId = app.state.dieline.rootFaceId;
  assert.equal(elements.get('input-length').value, 200);
  assert.equal(elements.get('input-width').value, 100);
  assert.equal(elements.get('input-height').value, 40);

  // 1. Elegir una pared lateral (100x40) como nueva BASE de cotas (azul)
  const wall = app.state.dieline.faces.find(f => f.id !== initialSupportId && Math.abs(f.bounds.width - 100) < 1);
  assert.ok(wall, 'Debe existir la pared de 100x40');

  elements.get('tool-pick-base').listeners.click[0]();
  assert.equal(app.state.pickingBaseMode, true);

  const tf = app.get2DTransform(makeEl('canvas-2d'), app.state.dieline.bounds);
  const cx = (wall.bounds.minX + wall.bounds.maxX) / 2;
  const cy = (wall.bounds.minY + wall.bounds.maxY) / 2;
  const sx = tf.toScreenX(cx);
  const sy = tf.toScreenY(cy);

  const hit = app.hitTest2DCanvas({ button: 0, clientX: sx, clientY: sy });
  assert.ok(hit, 'hitTest2DCanvas debe encontrar el panel');
  elements.get('canvas-2d').listeners.pointerdown[0]({ button: 0, clientX: sx, clientY: sy });
  await new Promise(r => setTimeout(r, 150));

  assert.equal(app.state.pickingBaseMode, false);
  assert.equal(app.state.dieline.dimensionBaseFaceId, wall.id);
  assert.equal(app.state.dieline.rootFaceId, initialSupportId, 'Elegir base no debe cambiar el apoyo 3D');
  assert.equal(elements.get('input-length').value, 100);
  assert.equal(elements.get('input-width').value, 40);
  assert.equal(elements.get('input-height').value, 200);

  // 2. Seleccionar otra pared (40x200) como APOYO 3D (rojo)
  const sideWall = app.state.dieline.faces.find(f => f.id !== initialSupportId && f.id !== wall.id && Math.abs(f.bounds.height - 200) < 1);
  assert.ok(sideWall, 'Debe existir la pared de 40x200');

  elements.get('tool-pick-support').listeners.click[0]();
  assert.equal(app.state.pickingSupportMode, true);

  const tf2 = app.get2DTransform(makeEl('canvas-2d'), app.state.dieline.bounds);
  const sx2 = tf2.toScreenX((sideWall.bounds.minX + sideWall.bounds.maxX) / 2);
  const sy2 = tf2.toScreenY((sideWall.bounds.minY + sideWall.bounds.maxY) / 2);
  elements.get('canvas-2d').listeners.pointerdown[0]({ button: 0, clientX: sx2, clientY: sy2 });
  await new Promise(r => setTimeout(r, 150));

  assert.equal(app.state.pickingSupportMode, false);
  assert.equal(app.state.dieline.rootFaceId, sideWall.id, 'Seleccionar apoyo debe cambiar la cara apoyada en 3D');
  assert.equal(app.state.dieline.dimensionBaseFaceId, wall.id, 'Seleccionar apoyo debe conservar la base de cotas');
  assert.equal(elements.get('input-length').value, 100);
  assert.equal(elements.get('input-width').value, 40);
  assert.equal(elements.get('input-height').value, 200);

  // Verificar que en 3D el nuevo apoyo queda apoyado en el suelo (min.y ≈ 0) al plegar
  app.setMasterFold(1);
  app.root.updateMatrixWorld(true);
  const supportMesh = app.faceMeshMap.get(sideWall.id).mesh;
  const box = new THREE.Box3().setFromObject(supportMesh);
  assert.ok(Math.abs(box.min.y) < 1e-4, `El nuevo apoyo debe apoyar en el suelo (min.y=${box.min.y})`);
});

test('establecer orden de plegado por caras crea pasos, permite reordenar y respeta ángulos positivos y negativos', () => {
  const { app, elements, makeEl } = createMockApp();
  app.initUIControls();
  app.init2DCanvasInteractions();
  app.loadSVGString(sampleTraySvg, 'bandeja.svg', true);

  const walls = app.state.dieline.faces.filter(f => f.id !== app.state.dieline.rootFaceId);
  const wallA = walls[0];
  const wallB = walls[1];
  const wallC = walls[2];
  const tf = app.get2DTransform(makeEl('canvas-2d'), app.state.dieline.bounds);

  // Paso 1 (Establecer orden)
  elements.get('btn-start-fold-order').listeners.click[0]();
  assert.equal(app.state.foldOrderSteps, 1);
  assert.equal(app.state.activeFoldOrderStep, 1);
  elements.get('canvas-2d').listeners.pointerdown[0]({
    button: 0,
    clientX: tf.toScreenX((wallA.bounds.minX + wallA.bounds.maxX) / 2),
    clientY: tf.toScreenY((wallA.bounds.minY + wallA.bounds.maxY) / 2)
  });
  assert.equal(app.state.customFoldOrder[wallA.id], 1);

  // Paso 2 (Siguiente doblez)
  elements.get('btn-next-fold-step').listeners.click[0]();
  assert.equal(app.state.foldOrderSteps, 2);
  assert.equal(app.state.activeFoldOrderStep, 2);
  elements.get('canvas-2d').listeners.pointerdown[0]({
    button: 0,
    clientX: tf.toScreenX((wallB.bounds.minX + wallB.bounds.maxX) / 2),
    clientY: tf.toScreenY((wallB.bounds.minY + wallB.bounds.maxY) / 2)
  });
  assert.equal(app.state.customFoldOrder[wallB.id], 2);

  // Terminar orden
  elements.get('btn-finish-fold-order').listeners.click[0]();
  assert.equal(app.state.activeFoldOrderStep, null);

  const hingeA = app.state.dieline.hinges.find(h => h.childFaceId === wallA.id);
  const hingeB = app.state.dieline.hinges.find(h => h.childFaceId === wallB.id);
  const hingeC = app.state.dieline.hinges.find(h => h.childFaceId === wallC.id);

  // Ángulos personalizados positivos y negativos (40° y -40°)
  app.state.customHingeTargetAngles[hingeA.id] = 40;
  app.state.customHingeTargetAngles[hingeB.id] = -40;

  // A mitad del progreso (t = 0.5): paso 1 ya rotó 40°, paso 2 aún está en 0°
  assert.equal(app.computeHingeAngleAtProgress(hingeA, wallA, 0.5, 'phased'), 40);
  assert.equal(app.computeHingeAngleAtProgress(hingeB, wallB, 0.5, 'phased'), 0);

  // Al final (t = 1): wallA en 40°, wallB en -40°, wallC (no señalada) en 0°
  assert.equal(app.computeHingeAngleAtProgress(hingeA, wallA, 1, 'phased'), 40);
  assert.equal(app.computeHingeAngleAtProgress(hingeB, wallB, 1, 'phased'), -40);
  assert.equal(app.computeHingeAngleAtProgress(hingeC, wallC, 1, 'phased'), 0);

  // Borrar paso 1 renumera el paso 2 a paso 1
  app.deleteFoldOrderStep(1);
  assert.equal(app.state.foldOrderSteps, 1);
  assert.equal(app.state.customFoldOrder[wallA.id], undefined);
  assert.equal(app.state.customFoldOrder[wallB.id], 1);

  // Botón Limpiar resetea los pasos guardados
  elements.get('btn-reset-fold-order').listeners.click[0]();
  assert.equal(app.state.foldOrderSteps, 0);
  assert.equal(app.state.activeFoldOrderStep, null);
  assert.equal(Object.keys(app.state.customFoldOrder).length, 0);
});


test('whole dieline button rotates geometry clockwise, preserves folds, and supports undo/redo', () => {
  const {app, elements} = createMockApp();
  app.initUIControls();
  app.loadSVGString(sampleTraySvg, 'tray.svg', true);
  const before = JSON.parse(JSON.stringify(app.state.dieline));
  const root = before.rootFaceId;
  app.state.customFoldOrder = {[before.faces[1].id]: 1};
  const click = elements.get('btn-rotate-dieline').listeners.click[0];
  click();
  const after = app.state.dieline;
  assert.equal(after.rootFaceId, root);
  assert.equal(after.bounds.width, before.bounds.height);
  assert.equal(after.bounds.height, before.bounds.width);
  assert.deepEqual(after.hinges.map(h=>h.id), before.hinges.map(h=>h.id));
  assert.equal(app.state.customFoldOrder[before.faces[1].id], 1);
  const a = before.faces[0].polygon[0], b = after.faces[0].polygon[0];
  const cx = (before.bounds.minX + before.bounds.maxX)/2, cy = (before.bounds.minY + before.bounds.maxY)/2;
  assert.ok(Math.abs(b.x-(cx-a.y+cy))<1e-8);
  assert.ok(Math.abs(b.y-(cy+a.x-cx))<1e-8);
  app.handleUndo();
  assert.equal(app.state.dieline.bounds.width, before.bounds.width);
  app.handleRedo();
  assert.equal(app.state.dieline.bounds.width, after.bounds.width);
  for(let i=0;i<3;i++) click();
  for(let i=0;i<before.faces.length;i++) for(let j=0;j<before.faces[i].polygon.length;j++) {
    const p=before.faces[i].polygon[j], q=app.state.dieline.faces[i].polygon[j];
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<1e-8);
  }
});

test('quarter turn preserves holes, dimension lengths and segment lengths without mutating input', () => {
  const model = engine.buildDielineModel(sampleTraySvg);
  model.faces[0].holes = [[{x:50,y:50},{x:55,y:50},{x:55,y:55}]];
  const original = JSON.stringify(model);
  const result = engine.rotateDieline90(model);
  assert.equal(JSON.stringify(model), original);
  assert.notDeepEqual(result.faces[0].holes, model.faces[0].holes);
  assert.deepEqual(result.boxDimensionsMm, model.boxDimensionsMm);
  for (let i=0;i<model.cutSegments.length;i++) {
    const a=model.cutSegments[i],b=result.cutSegments[i];
    assert.ok(Math.abs(Math.hypot(a.x2-a.x1,a.y2-a.y1)-Math.hypot(b.x2-b.x1,b.y2-b.y1))<1e-8);
  }
  for(let i=0;i<model.sizeArrowData.length;i++) {
    assert.ok(Math.abs(engine.measureDimensionArrow(model.sizeArrowData[i])-engine.measureDimensionArrow(result.sizeArrowData[i]))<1e-8);
  }
});
