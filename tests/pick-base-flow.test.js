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
    rootBoxGroup = new THREE.Group();
    bboxHelperGroup = new THREE.Group();
    camera = new THREE.PerspectiveCamera(38, 1.25, 0.1, 10000);
    controls = { target: new THREE.Vector3(), update() { camera.lookAt(this.target); camera.updateMatrixWorld(true); } };
    globalThis._testApp = { state, loadSVGString, initUIControls, init2DCanvasInteractions, setMasterFold, computeHingeAngleAtProgress, faceMeshMap, get2DTransform, hitTest2DCanvas, get root() { return dielineRootGroup; } };
  })();`), ctx);
  return { app: ctx._testApp, elements, makeEl };
}

test('pulsar Elegir base y pinchar un panel en el 2D actualiza medidas personalizadas, cotas 2D y 3D', async () => {
  const { app, elements, makeEl } = createMockApp();
  app.initUIControls();
  app.init2DCanvasInteractions();
  app.loadSVGString(sampleTraySvg, 'bandeja.svg', true);

  assert.equal(elements.get('input-length').value, 200);
  assert.equal(elements.get('input-width').value, 100);
  assert.equal(elements.get('input-height').value, 40);

  // Elegir una pared lateral (100x40) como nueva base
  const wall = app.state.dieline.faces.find(f => f.id !== app.state.dieline.rootFaceId && Math.abs(f.bounds.width - 100) < 1);
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
  assert.equal(app.state.dieline.rootFaceId, wall.id);
  assert.equal(elements.get('input-length').value, 100);
  assert.equal(elements.get('input-width').value, 40);
  assert.equal(elements.get('input-height').value, 200);

  // Verificar que en 3D la nueva base queda apoyada en el suelo (min.y ≈ 0) al plegar
  app.setMasterFold(1);
  app.root.updateMatrixWorld(true);
  const baseMesh = app.faceMeshMap.get(wall.id).mesh;
  const box = new THREE.Box3().setFromObject(baseMesh);
  assert.ok(Math.abs(box.min.y) < 1e-4, `La nueva base debe apoyar en el suelo (min.y=${box.min.y})`);
});

test('establecer orden de plegado (+) crea pasos 1, 2 y controla el orden de rotación 3D', () => {
  const { app, elements, makeEl } = createMockApp();
  app.initUIControls();
  app.init2DCanvasInteractions();
  app.loadSVGString(sampleTraySvg, 'bandeja.svg', true);

  const walls = app.state.dieline.faces.filter(f => f.id !== app.state.dieline.rootFaceId);
  const wallA = walls[0];
  const wallB = walls[1];
  const tf = app.get2DTransform(makeEl('canvas-2d'), app.state.dieline.bounds);

  // Paso 1 (+)
  elements.get('btn-add-fold-step').listeners.click[0]();
  assert.equal(app.state.foldOrderSteps, 1);
  assert.equal(app.state.activeFoldOrderStep, 1);
  elements.get('canvas-2d').listeners.pointerdown[0]({
    button: 0,
    clientX: tf.toScreenX((wallA.bounds.minX + wallA.bounds.maxX) / 2),
    clientY: tf.toScreenY((wallA.bounds.minY + wallA.bounds.maxY) / 2)
  });
  assert.equal(app.state.customFoldOrder[wallA.id], 1);

  // Paso 2 (+)
  elements.get('btn-add-fold-step').listeners.click[0]();
  assert.equal(app.state.foldOrderSteps, 2);
  assert.equal(app.state.activeFoldOrderStep, 2);
  elements.get('canvas-2d').listeners.pointerdown[0]({
    button: 0,
    clientX: tf.toScreenX((wallB.bounds.minX + wallB.bounds.maxX) / 2),
    clientY: tf.toScreenY((wallB.bounds.minY + wallB.bounds.maxY) / 2)
  });
  assert.equal(app.state.customFoldOrder[wallB.id], 2);

  const hingeA = app.state.dieline.hinges.find(h => h.childFaceId === wallA.id);
  const hingeB = app.state.dieline.hinges.find(h => h.childFaceId === wallB.id);

  // A mitad del progreso (t = 0.5): paso 1 ya rotó 90°, paso 2 aún está en 0°
  const angleA_mid = Math.abs(app.computeHingeAngleAtProgress(hingeA, wallA, 0.5, 'phased'));
  const angleB_mid = Math.abs(app.computeHingeAngleAtProgress(hingeB, wallB, 0.5, 'phased'));
  assert.equal(angleA_mid, 90);
  assert.equal(angleB_mid, 0);

  // Al final (t = 1): ambos en 90°
  const angleB_end = Math.abs(app.computeHingeAngleAtProgress(hingeB, wallB, 1, 'phased'));
  assert.equal(angleB_end, 90);
});
