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
  assert.equal(api.state.baseDieline.boxDimensionsMm.width, 200);
  assert.equal(api.state.baseDieline.sizeArrowData.find(a => a.lineName === 'W').faceId, 1);
  assert.notEqual(api.state.baseDieline, api.state.dieline);
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

test('Herramienta Acotar: chips L/W/H/Libre, borrar con botón/Supr, añadir cota y actualizar medidas', () => {
  const { api, el } = setupEnvironment();
  api.state.dieline = createSampleModel();
  api.initVectorEditor();
  api.setVectorTool('dimension');
  assert.equal(api.getVectorTool(), 'dimension');

  // 1. Al activar 'dimension', por defecto selecciona cota L y marca el chip L
  assert.equal(api.state.activeDimType, 'L');
  assert.ok(api.getVectorSelection()?.arrow?.id === 'sa_L', 'Cota L seleccionada automáticamente');

  // 2. Borrar cota seleccionada con el botón de borrar
  el('vector-btn-delete-dim').onclick();
  assert.equal(api.state.dieline.sizeArrowData.some(a => a.id === 'sa_L'), false, 'Cota L borrada correctamente');

  // 3. Añadir nueva cota L con el botón '➕ Añadir cota'
  el('vector-btn-add-dim').onclick();
  api.setVectorDraft({ point: { x: 10, y: 20 } });
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
  assert.ok(customArrows.length >= 1, 'Se creó la cota de usuario para L');
  const userArrowL = customArrows[0];
  assert.equal(userArrowL.lineName, 'L');
  assert.ok(userArrowL.lineLength > 0);
  assert.equal(api.state.paramL, userArrowL.lineLength, 'Medida personalizada L actualizada a la medida trazada');
  assert.equal(el('input-length').value, userArrowL.lineLength);
  assert.equal(api.state.baseDieline.sizeArrowData.find(a => a.lineName === 'L').lineLength, userArrowL.lineLength);

  // 4. Chip 'Libre': permite medir cualquier distancia sin sobreescribir L, W ni H
  el('vector-btn-dim-type-free').onclick();
  assert.equal(api.state.activeDimType, 'Libre');
  el('vector-btn-add-dim').onclick();
  api.setVectorDraft({ point: { x: 50, y: 50 } });
  api.vectorCanvasClick({
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      width: 800,
      height: 600
    },
    clientX: 130,
    clientY: 50
  });

  const freeDim = api.state.dieline.sizeArrowData.find(a => a.lineName === 'Dim');
  assert.ok(freeDim, 'Cota libre creada');
  assert.ok(freeDim.lineLength > 0);
  assert.equal(freeDim.isMain, false);
  assert.equal(api.state.paramL, userArrowL.lineLength, 'L no fue sobreescrita por la cota libre');

  // 5. Borrar cota libre
  api.setVectorSelection({ type: 'dimension', arrow: freeDim });
  el('vector-btn-delete-dim').onclick();
  assert.equal(api.state.dieline.sizeArrowData.some(a => a === freeDim), false, 'Cota libre borrada');
  assert.equal(api.state.baseDieline.sizeArrowData.some(a => a.id === freeDim.id), false);
  assert.ok(api.state.baseDieline.sizeArrowData.some(a => a.lineName === 'L'));

  // 6. Al cerrar el editor de vectores la modal nunca debe quedarse abierta
  el('vector-close').onclick();
  assert.equal(el('vector-tool-modal').hidden, true, 'Modal cerrada al salir de edición de vectores');
});

test('Al cambiar el tamaño de un área no se deforman agujeros ni asas', () => {
  const model = {
    faces: [
      {
        id: 1,
        name: 'Panel Principal',
        role: 'BODY',
        polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }],
        bounds: { minX: 0, maxX: 200, minY: 0, maxY: 300, width: 200, height: 300 },
        // Agujero circular / asa de 40x20 mm centrado en (100, 150)
        holes: [
          [
            { x: 80, y: 140 },
            { x: 120, y: 140 },
            { x: 120, y: 160 },
            { x: 80, y: 160 }
          ]
        ]
      }
    ],
    cutSegments: [
      { x1: 80, y1: 140, x2: 120, y2: 140 },
      { x1: 120, y1: 140, x2: 120, y2: 160 },
      { x1: 120, y1: 160, x2: 80, y2: 160 },
      { x1: 80, y1: 160, x2: 80, y2: 140 }
    ],
    foldSegments: [],
    hinges: [],
    boxDimensionsMm: { length: 200, width: 150, depth: 300 }
  };

  // Redimensionar el panel de 200 a 400 en X (el doble)
  const resized = engine.resizeDielineParametric(model, 400, 150, 300);
  assert.ok(resized);

  const holeResized = resized.faces[0].holes[0];
  const holeXs = holeResized.map(p => p.x);
  const holeYs = holeResized.map(p => p.y);
  const holeW = Math.max(...holeXs) - Math.min(...holeXs);
  const holeH = Math.max(...holeYs) - Math.min(...holeYs);

  // El agujero no debe deformarse: debe mantener EXACTAMENTE 40 mm de ancho y 20 mm de alto
  assert.equal(Math.round(holeW), 40, 'El ancho del agujero/asa se conserva sin deformarse');
  assert.equal(Math.round(holeH), 20, 'El alto del agujero/asa se conserva sin deformarse');

  // Los segmentos de corte del agujero también deben conservar su longitud original
  const segW = Math.hypot(resized.cutSegments[0].x2 - resized.cutSegments[0].x1, resized.cutSegments[0].y2 - resized.cutSegments[0].y1);
  assert.equal(Math.round(segW), 40, 'Segmento de corte del agujero conserva longitud original');
});
