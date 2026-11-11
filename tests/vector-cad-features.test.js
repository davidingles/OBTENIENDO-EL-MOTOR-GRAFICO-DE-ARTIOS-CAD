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
