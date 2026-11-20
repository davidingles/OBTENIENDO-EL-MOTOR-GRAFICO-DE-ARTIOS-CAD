const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const DielineEngine = require('../dieline-engine.js');

function loadAmericanBoxModel() {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'b1 caja americana.svg'), 'utf8');
  return DielineEngine.buildDielineModel(svg);
}

test('Cambiar piezas aplica cada variación al área seleccionada (targetFaceId) y no a la solapa por defecto', () => {
  const baseModel = loadAmericanBoxModel();
  const defaultFlap = DielineEngine.findPrimaryLidFlapFace(baseModel);
  assert.ok(defaultFlap, 'Debe existir una solapa principal por defecto');

  const otherFlap = baseModel.faces.find(f =>
    f.id !== defaultFlap.id &&
    f.role && f.role.includes('FLAP') &&
    f.bounds.width > 40 && f.bounds.height > 20
  );
  assert.ok(otherFlap, 'Debe existir otra solapa distinta a la principal');

  // 1. Asa aplicada a la solapa seleccionada
  const withHandle = DielineEngine.applyPartVariationToModel(baseModel, 'handle', { targetFaceId: otherFlap.id });
  assert.ok(!withHandle.partError, withHandle.partError);
  assert.equal(withHandle.partTargetFaceId, otherFlap.id);
  assert.equal(withHandle.faces.find(f => f.id === otherFlap.id).holes.length, 1);
  assert.equal(withHandle.faces.find(f => f.id === defaultFlap.id).holes.length, 0);

  // 2. Acumular una segunda pieza en otra área (flujo tras pulsar Listo con la última configuración)
  const bodyFace = baseModel.faces.find(f => f.role === 'BODY' && f.bounds.width > 100);
  const withTwoHandles = DielineEngine.applyPartVariationToModel(withHandle, 'handle', {
    targetFaceId: bodyFace.id,
    length: 70,
    width: 18,
    radius: 6
  });
  assert.ok(!withTwoHandles.partError, withTwoHandles.partError);
  assert.equal(withTwoHandles.faces.find(f => f.id === otherFlap.id).holes.length, 1, 'Debe conservar el asa del área anterior');
  assert.equal(withTwoHandles.faces.find(f => f.id === bodyFace.id).holes.length, 1, 'Debe añadir el asa en la nueva área');

  // 3. Muesca para el dedo aplicada a la solapa seleccionada
  const withNotch = DielineEngine.applyPartVariationToModel(baseModel, 'thumb_notch', { targetFaceId: otherFlap.id, radius: 8 });
  assert.ok(!withNotch.partError, withNotch.partError);
  assert.equal(withNotch.partTargetFaceId, otherFlap.id);
  assert.ok(withNotch.faces.find(f => f.id === otherFlap.id).polygon.length > otherFlap.polygon.length);
  assert.equal(withNotch.faces.find(f => f.id === defaultFlap.id).polygon.length, defaultFlap.polygon.length);

  // 4. Pestaña de cierre aplicada a la solapa seleccionada
  const withTab = DielineEngine.applyPartVariationToModel(baseModel, 'tab_lock', { targetFaceId: otherFlap.id, length: 40, depth: 15 });
  assert.ok(!withTab.partError, withTab.partError);
  assert.equal(withTab.partTargetFaceId, otherFlap.id);
  const tabFace = withTab.faces.find(f => f.name === 'Pestaña de cierre');
  assert.ok(tabFace && tabFace.parentId === otherFlap.id);

  // 5. Tira de apertura aplicada a la solapa seleccionada
  const withTear = DielineEngine.applyPartVariationToModel(baseModel, 'tear_strip', { targetFaceId: otherFlap.id });
  assert.equal(withTear.partTargetFaceId, otherFlap.id);
});

test('Solapas dobles en caja B1 americana hace crecer las 4 solapas del lado elegido en Y a 2×L - 2 mm', () => {
  const baseModel = loadAmericanBoxModel();
  const b1Data = DielineEngine.getB1DoubleFlapsData(baseModel);
  assert.equal(b1Data.isB1, true);
  assert.equal(b1Data.topFlaps.length, 4);
  assert.equal(b1Data.bottomFlaps.length, 4);

  // Seleccionar una solapa superior -> crecen las 4 superiores, las 4 inferiores no cambian
  const topTarget = b1Data.topFlaps[0].face;
  const maxTopH = Math.max(...b1Data.topFlaps.map(x => x.face.bounds.height));
  const expectedTopDelta = maxTopH - 2;
  const mTop = DielineEngine.applyPartVariationToModel(baseModel, 'double_flaps', { targetFaceId: topTarget.id });
  assert.ok(!mTop.partError, mTop.partError);
  assert.equal(mTop.activePartVariation, 'double_flaps');
  assert.equal(mTop.partDoubleFlapsSide, 'top');

  for (const { face: orig } of b1Data.topFlaps) {
    const updated = mTop.faces.find(f => f.id === orig.id);
    assert.ok(
      Math.abs(updated.bounds.height - (orig.bounds.height + expectedTopDelta)) < 0.25,
      `Solapa superior ${orig.label} debe crecer +${expectedTopDelta.toFixed(2)} mm en Y`
    );
  }
  for (const { face: orig } of b1Data.bottomFlaps) {
    const updated = mTop.faces.find(f => f.id === orig.id);
    assert.ok(Math.abs(updated.bounds.height - orig.bounds.height) < 0.05, 'Las solapas inferiores no deben cambiar');
  }

  // Seleccionar una solapa inferior sobre el modelo ya modificado -> crecen también las 4 inferiores
  const bottomTarget = b1Data.bottomFlaps[0].face;
  const maxBotH = Math.max(...b1Data.bottomFlaps.map(x => x.face.bounds.height));
  const expectedBotDelta = maxBotH - 2;
  const mBoth = DielineEngine.applyPartVariationToModel(mTop, 'double_flaps', { targetFaceId: bottomTarget.id });
  assert.ok(!mBoth.partError, mBoth.partError);
  assert.equal(mBoth.partDoubleFlapsSide, 'bottom');

  for (const { face: orig } of b1Data.bottomFlaps) {
    const updated = mBoth.faces.find(f => f.id === orig.id);
    assert.ok(
      Math.abs(updated.bounds.height - (orig.bounds.height + expectedBotDelta)) < 0.25,
      `Solapa inferior ${orig.label} debe crecer +${expectedBotDelta.toFixed(2)} mm en Y`
    );
  }
  for (const { face: orig } of b1Data.topFlaps) {
    const updated = mBoth.faces.find(f => f.id === orig.id);
    assert.ok(
      Math.abs(updated.bounds.height - (orig.bounds.height + expectedTopDelta)) < 0.25,
      'Las 4 solapas superiores deben mantenerse dobles'
    );
  }

  // Seleccionar una cara de cuerpo en B1 avisa de elegir solapa superior o inferior
  const bodyFace = baseModel.faces.find(f => f.role === 'BODY');
  const errBody = DielineEngine.applyPartVariationToModel(baseModel, 'double_flaps', { targetFaceId: bodyFace.id });
  assert.ok(errBody.partError && errBody.partError.includes('solapa'));

  // En una caja que NO es B1 americana (bandeja automontable 150010), avisa que solo se usa en B1
  const entry = PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(x => x.num === 150010);
  const trayModel = DielineEngine.buildDielineModelFromPacdora(entry.knifeData, entry);
  const errTray = DielineEngine.applyPartVariationToModel(trayModel, 'double_flaps', { targetFaceId: trayModel.faces[0].id });
  assert.ok(errTray.partError && errTray.partError.includes('B1'));
});

test('Pieza Ventanas troquela 1, 2 o 3 ventanas en cualquier área seleccionada (incluso paneles interiores de cuerpo)', () => {
  const baseModel = loadAmericanBoxModel();
  const bodyFace = baseModel.faces.find(f => f.role === 'BODY' && f.bounds.width > 80 && f.bounds.height > 60);
  assert.ok(bodyFace, 'Debe existir una cara de cuerpo interior');

  const m1 = DielineEngine.applyPartVariationToModel(baseModel, 'windows', {
    targetFaceId: bodyFace.id,
    count: 1,
    length: 60,
    width: 40,
    radius: 6
  });
  assert.ok(!m1.partError, m1.partError);
  assert.equal(m1.activePartVariation, 'windows');
  assert.equal(m1.partTargetFaceId, bodyFace.id);
  const updatedBody1 = m1.faces.find(f => f.id === bodyFace.id);
  assert.equal(updatedBody1.holes.length, 1);
  assert.ok(updatedBody1.areaMm2 < bodyFace.areaMm2);

  const m2 = DielineEngine.applyPartVariationToModel(baseModel, 'windows', {
    targetFaceId: bodyFace.id,
    count: 2,
    length: 30,
    width: 30,
    radius: 0,
    distance: 45
  });
  assert.ok(!m2.partError, m2.partError);
  const updatedBody2 = m2.faces.find(f => f.id === bodyFace.id);
  assert.equal(updatedBody2.holes.length, 2);
  assert.equal(updatedBody2.holes[0].length, 4);

  const m3 = DielineEngine.applyPartVariationToModel(baseModel, 'windows', {
    targetFaceId: bodyFace.id,
    count: 3,
    length: 20,
    width: 24,
    radius: 3,
    distance: 32
  });
  assert.ok(!m3.partError, m3.partError);
  assert.equal(m3.faces.find(f => f.id === bodyFace.id).holes.length, 3);
});

test('index.html incluye las tarjetas Solapas dobles y Ventanas en Cambiar piezas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('data-part-key="double_flaps"'));
  assert.ok(html.includes('Solapas dobles'));
  assert.ok(html.includes('data-part-key="windows"'));
  assert.ok(html.includes('Ventanas'));
});
