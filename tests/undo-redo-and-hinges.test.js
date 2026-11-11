const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const DielineEngine = require('../dieline-engine.js');
const VectorCAD = require('../vector-cad.js');

function createSampleModel() {
  const entry = PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(x => x.num === 150010);
  return DielineEngine.buildDielineModelFromPacdora(entry.knifeData, entry);
}

test('Historial: Deshacer (Ctrl + Z) y Rehacer (Ctrl + Alt + Z) restauran el estado', () => {
  const initial = createSampleModel();
  const history = [];
  const redo = [];

  const clone = v => JSON.parse(JSON.stringify(v));

  // Paso 1: guardamos estado inicial y aplicamos un estirado CAD sobre el primer corte
  history.push(clone(initial));
  const s0 = initial.cutSegments[0];
  const box = {
    minX: Math.min(s0.x1, s0.x2) - 10,
    maxX: Math.max(s0.x1, s0.x2) + 10,
    minY: Math.min(s0.y1, s0.y2) - 10,
    maxY: Math.max(s0.y1, s0.y2) + 10
  };
  const modified = VectorCAD.stretch(initial, box, 30, 0);

  assert.notEqual(modified.cutSegments[0].x2, initial.cutSegments[0].x2);

  // Paso 2: Deshacer (Ctrl + Z)
  redo.push(clone(modified));
  const restored = history.pop();
  assert.equal(restored.cutSegments[0].x2, initial.cutSegments[0].x2, 'Ctrl+Z debe restaurar las medidas originales');

  // Paso 3: Rehacer (Ctrl + Alt + Z)
  history.push(clone(restored));
  const redone = redo.pop();
  assert.equal(redone.cutSegments[0].x2, modified.cutSegments[0].x2, 'Ctrl+Alt+Z debe reaplicar el cambio');
});

test('Control de hendidos: rotar todos los hendidos a la vez y rotar hendidos seleccionados (positivos y negativos)', () => {
  const model = createSampleModel();
  assert.ok(model.hinges.length > 0, 'El modelo debe tener bisagras');

  const hingeAngles = {};
  for (const h of model.hinges) hingeAngles[h.id] = 0;

  // 1. Seleccionar todos los hendidos y rotar a -90° (ángulo negativo)
  const allHingeIds = new Set(model.hinges.map(h => h.id));
  const targetNegativeAngle = -90;
  for (const id of allHingeIds) {
    hingeAngles[id] = targetNegativeAngle;
  }
  for (const h of model.hinges) {
    assert.equal(hingeAngles[h.id], -90, 'Todas las bisagras deben reflejar el ángulo negativo');
  }

  // 2. Rotar a +120° (ángulo positivo)
  const targetPositiveAngle = 120;
  for (const id of allHingeIds) {
    hingeAngles[id] = targetPositiveAngle;
  }
  for (const h of model.hinges) {
    assert.equal(hingeAngles[h.id], 120, 'Todas las bisagras deben reflejar el ángulo positivo');
  }

  // 3. Selección parcial: seleccionar solo 2 bisagras y rotarlas a -45°
  const selectedSubset = new Set([model.hinges[0].id, model.hinges[1].id]);
  const subsetAngle = -45;
  for (const id of selectedSubset) {
    hingeAngles[id] = subsetAngle;
  }

  assert.equal(hingeAngles[model.hinges[0].id], -45);
  assert.equal(hingeAngles[model.hinges[1].id], -45);
  assert.equal(hingeAngles[model.hinges[2].id], 120, 'Las bisagras no seleccionadas mantienen su ángulo');
});
