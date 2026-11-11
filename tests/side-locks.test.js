const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const DielineEngine = require('../dieline-engine.js');

test('variación machos y hembras en automontables soporta 1, 2 y 3 encastres con largo, separación y radio regulables', () => {
  const entry = PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(x => x.num === 150010);
  const baseModel = DielineEngine.buildDielineModelFromPacdora(entry.knifeData, entry);

  // 1. Identificación de paneles
  const data = DielineEngine.getSideLocksData(baseModel);
  assert.ok(data, 'Debe identificar los paneles HL, HR y la base H');
  assert.equal(data.hl.pacdoraName, 'HL');
  assert.equal(data.hr.pacdoraName, 'HR');
  assert.ok(data.spanY > 150);

  // 2. Parámetros por defecto
  const settings = DielineEngine.getPartVariationSettings(baseModel, 'side_locks');
  assert.equal(settings.params.count, 2);
  assert.equal(settings.params.length, 36);
  assert.equal(settings.params.radius, 2.5);
  assert.ok(settings.params.distance > 0);

  // 3. Un solo encastre central (count = 1)
  const m1 = DielineEngine.applyPartVariationToModel(baseModel, 'side_locks', { count: 1, length: 42, radius: 2 });
  assert.equal(m1.activePartVariation, 'side_locks');
  assert.ok(!m1.partError);
  const hl1 = m1.faces.find(f => f.pacdoraName === 'HL');
  const base1 = m1.faces.find(f => f.pacdoraName === 'H');
  assert.ok(hl1 && base1);
  assert.ok(hl1.bounds.width > 0 && hl1.bounds.height > 0);

  // 4. Dos encastres regulando distancia y radio (count = 2)
  const m2 = DielineEngine.applyPartVariationToModel(baseModel, 'side_locks', { count: 2, length: 35, distance: 90, radius: 3, depth: 5 });
  assert.equal(m2.activePartVariation, 'side_locks');
  assert.ok(!m2.partError);
  assert.ok(m2.totalCutLengthMm > 0);
  assert.ok(m2.totalFoldLengthMm > 0);

  // 5. Tres encastres para cajas largas (count = 3)
  const m3 = DielineEngine.applyPartVariationToModel(baseModel, 'side_locks', { count: 3, length: 28, distance: 42, radius: 1.5 });
  assert.equal(m3.activePartVariation, 'side_locks');
  assert.ok(!m3.partError);
  const hl3 = m3.faces.find(f => f.pacdoraName === 'HL');
  const hr3 = m3.faces.find(f => f.pacdoraName === 'HR');
  const base3 = m3.faces.find(f => f.pacdoraName === 'H');
  assert.ok(hl3.polygon.length > hl1.polygon.length, 'Con 3 machos HL tiene más vértices que con 1');
  assert.ok(hr3.polygon.length > 0);
  assert.ok(base3.polygon.length > 0);

  // 6. Verificación de coordenadas numéricas finitas
  for (const s of m3.cutSegments) {
    assert.ok(Number.isFinite(s.x1) && Number.isFinite(s.y1) && Number.isFinite(s.x2) && Number.isFinite(s.y2));
  }
  for (const s of m3.foldSegments) {
    assert.ok(Number.isFinite(s.x1) && Number.isFinite(s.y1) && Number.isFinite(s.x2) && Number.isFinite(s.y2));
  }

  // 7. Aviso claro si el modelo no es automontable
  const nonAutomontable = { faces: [{ id: 1, role: 'BODY' }] };
  const errModel = DielineEngine.applyPartVariationToModel(nonAutomontable, 'side_locks');
  assert.ok(errModel.partError.includes('automontable'));
});
