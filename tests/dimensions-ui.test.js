const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const engine = require('../dieline-engine'), UserLibrary = require('../library-models'), VectorCAD = require('../vector-cad');

function setupEnvironment() {
  const els = new Map(), storage = new Map();
  const el = id => {
    if (!els.has(id)) {
      els.set(id, {
        id,
        value: '',
        textContent: '',
        hidden: false,
        disabled: false,
        style: {},
        dataset: {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, force) {
            if (force === undefined) {
              if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c);
            } else if (force) {
              this.classes.add(c);
            } else {
              this.classes.delete(c);
            }
          },
          contains(c) { return this.classes.has(c); }
        },
        querySelectorAll: () => [],
        addEventListener() {}
      });
    }
    return els.get(id);
  };

  const ctx = {
    DielineEngine: engine,
    UserLibrary,
    VectorCAD,
    TextEncoder,
    console,
    performance,
    prompt: () => 'Test',
    window: {
      addEventListener() {},
      localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }
    },
    document: {
      getElementById: el,
      querySelector: () => null,
      querySelectorAll: () => [],
      activeElement: null
    },
    alert: e => { throw Error(e); }
  };
  vm.createContext(ctx);
  const source = fs.readFileSync(require.resolve('../app'), 'utf8')
    .replace(/\}\)\(\);\s*$/, `
      rebuild3DMesh=()=>{};setMasterFold=()=>{};buildHingeSlidersUI=()=>{};render2FDieline=()=>{};
      globalThis.api = {
        state,
        applyPickedDimensionFace,
        hitTestArrow,
        setVectorTool,
        vectorCanvasClick,
        initVectorEditor,
        getVectorTool: () => vectorTool,
        getVectorSelection: () => vectorSelection,
        setVectorSelection: (v) => { vectorSelection = v; },
        setVectorDraft: (d) => { vectorDraft = d; }
      };
    })();`);
  vm.runInContext(source, ctx);
  return { api: ctx.api, el };
}

function createSampleModel() {
  const faces = [
    { id: 1, name: 'Pared Izquierda (L)', bounds: { minX: 0, maxX: 200, minY: 0, maxY: 300, width: 200, height: 300 }, centroid: { x: 100, y: 150 } },
    { id: 2, name: 'Panel Base (Principal)', bounds: { minX: 200, maxX: 600, minY: 0, maxY: 300, width: 400, height: 300 }, centroid: { x: 400, y: 150 } }
  ];
  return {
    faces,
    rootFaceId: 2,
    hinges: [],
    cutSegments: [],
    foldSegments: [],
    bounds: { minX: 0, maxX: 600, minY: 0, maxY: 300, width: 600, height: 300 },
    sizeArrowData: [
      { id: 'sa_L', lineName: 'L', lineLength: 400, p1: { x: 200, y: 150 }, p2: { x: 600, y: 150 }, tpointer: { x: 400, y: 150, value: 'L=400' } },
      { id: 'sa_W', lineName: 'W', lineLength: 200, p1: { x: 0, y: 150 }, p2: { x: 200, y: 150 }, tpointer: { x: 100, y: 150, value: 'W=200' } },
      { id: 'sa_H', lineName: 'H', lineLength: 300, p1: { x: 50, y: 0 }, p2: { x: 50, y: 300 }, tpointer: { x: 50, y: 150, value: 'H=300' } }
    ],
    outsideArrowData: [
      { id: 'oa_1_W', faceId: 1, lineName: '1_W', lineLength: 200, p1: { x: 0, y: 200 }, p2: { x: 200, y: 200 } }
    ]
  };
}

test('Dianas (🎯): seleccionar directamente el área del modelo determina las cotas L, W o H', () => {
  const { api, el } = setupEnvironment();
  api.state.dieline = createSampleModel();
  const faceLeft = api.state.dieline.faces[0]; // width: 200, height: 300
  const faceBase = api.state.dieline.faces[1]; // width: 400, height: 300

  // 1. Asignar cara izquierda como Ancho (W)
  api.applyPickedDimensionFace('W', faceLeft);
  assert.equal(api.state.paramW, 200);
  assert.equal(el('input-width').value, 200);
  const arrowW = api.state.dieline.sizeArrowData.find(a => a.lineName === 'W');
  assert.ok(arrowW, 'La cota W existe');
  assert.equal(arrowW.lineLength, 200);
  assert.equal(arrowW.faceId, 1);

  // 2. Asignar cara base como Largo (L)
  api.applyPickedDimensionFace('L', faceBase);
  assert.equal(api.state.paramL, 400);
  assert.equal(el('input-length').value, 400);
  const arrowL = api.state.dieline.sizeArrowData.find(a => a.lineName === 'L');
  assert.ok(arrowL, 'La cota L existe');
  assert.equal(arrowL.lineLength, 400);
  assert.equal(arrowL.faceId, 2);

  // 3. Asignar Alto (H) desde la altura de la cara
  api.applyPickedDimensionFace('H', faceLeft);
  assert.equal(api.state.paramH, 300);
  assert.equal(el('input-height').value, 300);
  const arrowH = api.state.dieline.sizeArrowData.find(a => a.lineName === 'H');
  assert.ok(arrowH, 'La cota H existe');
  assert.equal(arrowH.lineLength, 300);
});

test('Switch 3 estados (Ocultas, Principales, Todas) y toggle de nombres de área', () => {
  const { api } = setupEnvironment();
  assert.equal(api.state.dimensionDisplayMode, 'main');
  assert.equal(api.state.showAreaLabels, true);

  // Cambio a ocultas
  api.state.dimensionDisplayMode = 'none';
  assert.equal(api.state.dimensionDisplayMode, 'none');

  // Cambio a todas
  api.state.dimensionDisplayMode = 'all';
  assert.equal(api.state.dimensionDisplayMode, 'all');

  // Ocultar nombres de áreas
  api.state.showAreaLabels = false;
  assert.equal(api.state.showAreaLabels, false);
});

test('Herramienta Acotar crea cotas ortogonales (X/Y) y permite borrarlas con Supr', () => {
  const { api, el } = setupEnvironment();
  api.state.dieline = createSampleModel();
  api.initVectorEditor();
  api.setVectorTool('dimension');
  assert.equal(api.getVectorTool(), 'dimension');

  // Simular inicio de cota en (10, 20)
  api.setVectorDraft({ point: { x: 10, y: 20 } });

  // Simular segundo clic en (110, 40) -> al ser horizontal (|dx| = 100 > |dy| = 20), bloquea ortogonal Y=20, longitud 100
  api.vectorCanvasClick({
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      width: 800,
      height: 600
    },
    clientX: 110,
    clientY: 40
  });

  const customArrows = api.state.dieline.sizeArrowData.filter(a => a.isUserCreated);
  assert.ok(customArrows.length >= 1, 'Se creó la cota de usuario');
  const userArrow = customArrows[0];
  assert.ok(userArrow.lineLength > 0, 'La longitud de la cota es positiva');
  assert.ok(userArrow.p1.x === userArrow.p2.x || userArrow.p1.y === userArrow.p2.y, 'Cota estrictamente ortogonal (X o Y)');

  // Seleccionar la cota del algoritmo y borrarla
  const arrowToDelete = api.state.dieline.sizeArrowData.find(a => a.id === 'sa_L');
  assert.ok(arrowToDelete, 'Existe cota algorítmica sa_L');
  api.setVectorSelection({ type: 'dimension', arrow: arrowToDelete });

  // Borrar con botón de borrar o tecla Supr
  el('vector-btn-delete-dim').onclick();
  assert.equal(api.state.dieline.sizeArrowData.some(a => a.id === 'sa_L'), false, 'La cota algorítmica ha sido borrada');

  // Borrar cota de usuario
  api.setVectorSelection({ type: 'dimension', arrow: userArrow });
  el('vector-btn-delete-dim').onclick();
  assert.equal(api.state.dieline.sizeArrowData.some(a => a === userArrow), false, 'La cota de usuario ha sido borrada');
});
