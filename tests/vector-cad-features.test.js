const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const DielineEngine = require('../dieline-engine.js');
const VectorCAD = require('../vector-cad.js');

test('VectorCAD: imán magnético a vértices, puntos medios y bordes', () => {
  const model = {
    cutSegments: [
      { x1: 0, y1: 0, x2: 100, y2: 0, type: 'CUT' },
      { x1: 100, y1: 0, x2: 100, y2: 50, type: 'CUT' }
    ],
    foldSegments: []
  };

  // 1. Imán a extremo (endpoint)
  const snapEnd = VectorCAD.snap(model, { x: 2, y: 1 }, 10);
  assert.equal(snapEnd.snapped, true);
  assert.equal(snapEnd.snapType, 'endpoint');
  assert.equal(snapEnd.x, 0);
  assert.equal(snapEnd.y, 0);

  // 2. Imán a punto medio (midpoint: x=50, y=0)
  const snapMid = VectorCAD.snap(model, { x: 51, y: 2 }, 10);
  assert.equal(snapMid.snapped, true);
  assert.equal(snapMid.snapType, 'midpoint');
  assert.equal(snapMid.x, 50);
  assert.equal(snapMid.y, 0);

  // 3. Imán a proyección sobre el trazo (edge)
  const snapEdge = VectorCAD.snap(model, { x: 75, y: 3 }, 10);
  assert.equal(snapEdge.snapped, true);
  assert.equal(snapEdge.snapType, 'edge');
  assert.equal(snapEdge.x, 75);
  assert.equal(snapEdge.y, 0);
});

test('VectorCAD: dibujo de asa, mover, copiar y eliminar con medidas exactas', () => {
  const entry = PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(x => x.num === 150010);
  let dieline = DielineEngine.buildDielineModelFromPacdora(entry.knifeData, entry);
  const base = dieline.faces.find(f => f.pacdoraName === 'H');
  assert.ok(base);

  // 1. Dibujar asa troquelada en el centro de la base H
  const withHandle = VectorCAD.handle(dieline, base.centroid, 70, 22, 6, 'cut');
  dieline = VectorCAD.rebuild(withHandle, DielineEngine);
  let baseH = dieline.faces.find(f => f.pacdoraName === 'H');
  assert.equal(baseH.holes.length, 1, 'Debe crear un agujero físico para el asa');
  const handleHole = baseH.holes[0];

  // 2. Copiar el asa con desplazamiento exacto (dx = 0, dy = -40)
  const withCopy = VectorCAD.copyHole(dieline, handleHole, 0, -40);
  dieline = VectorCAD.rebuild(withCopy, DielineEngine);
  baseH = dieline.faces.find(f => f.pacdoraName === 'H');
  assert.equal(baseH.holes.length, 2, 'Debe existir el asa original y su copia duplicada');

  // 3. Mover la primera asa (dx = 20, dy = 0)
  const withMove = VectorCAD.moveHole(dieline, handleHole, 20, 0);
  dieline = VectorCAD.rebuild(withMove, DielineEngine);
  baseH = dieline.faces.find(f => f.pacdoraName === 'H');
  assert.equal(baseH.holes.length, 2, 'Siguen existiendo dos agujeros tras el movimiento');

  // 4. Eliminar una de las asas
  const withDelete = VectorCAD.deleteHole(dieline, baseH.holes[0]);
  dieline = VectorCAD.rebuild(withDelete, DielineEngine);
  baseH = dieline.faces.find(f => f.pacdoraName === 'H');
  assert.equal(baseH.holes.length, 1, 'Queda exactamente un agujero tras eliminar el otro');
});


test('VectorCAD: selección por rectángulo (trazos dentro o tocados), mover y copiar con eje y distancia', () => {
  const model = {
    cutSegments: [
      { x1: 10, y1: 10, x2: 30, y2: 10, type: 'CUT' }, // Totalmente dentro
      { x1: 0, y1: 25, x2: 60, y2: 25, type: 'CUT' },  // Cruzando/tocando
      { x1: 100, y1: 100, x2: 120, y2: 100, type: 'CUT' } // Fuera
    ],
    foldSegments: [
      { x1: 20, y1: 0, x2: 20, y2: 40, type: 'FOLD' }  // Cruzando/tocando
    ]
  };

  const box = { minX: 5, maxX: 50, minY: 5, maxY: 35 };
  const selected = VectorCAD.selectInBox(model, box);
  assert.equal(selected.length, 3, 'Debe seleccionar los 2 cortes (dentro y cruzando) y el hendido cruzando');

  // Mover en Eje X (+) 25 mm
  const moved = VectorCAD.moveSegments(model, selected, 25, 0);
  assert.equal(moved.cutSegments[0].x1, 35);
  assert.equal(moved.cutSegments[0].x2, 55);
  assert.equal(moved.cutSegments[2].x1, 100, 'El trazo exterior no debe moverse');

  // Copiar en Eje Y (+) 30 mm
  const copied = VectorCAD.copySegments(model, selected, 0, 30);
  assert.equal(copied.cutSegments.length, model.cutSegments.length + 2, 'Debe añadir 2 nuevos cortes duplicados');
  assert.equal(copied.foldSegments.length, model.foldSegments.length + 1, 'Debe añadir 1 nuevo hendido duplicado');
});
