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

  // Elegir una solapa diferente a la principal por defecto
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

  // 2. Muesca para el dedo aplicada a la solapa seleccionada
  const withNotch = DielineEngine.applyPartVariationToModel(baseModel, 'thumb_notch', { targetFaceId: otherFlap.id, radius: 8 });
  assert.ok(!withNotch.partError, withNotch.partError);
  assert.equal(withNotch.partTargetFaceId, otherFlap.id);
  assert.ok(withNotch.faces.find(f => f.id === otherFlap.id).polygon.length > otherFlap.polygon.length);
  assert.equal(withNotch.faces.find(f => f.id === defaultFlap.id).polygon.length, defaultFlap.polygon.length);

  // 3. Pestaña de cierre aplicada a la solapa seleccionada
  const withTab = DielineEngine.applyPartVariationToModel(baseModel, 'tab_lock', { targetFaceId: otherFlap.id, length: 40, depth: 15 });
  assert.ok(!withTab.partError, withTab.partError);
  assert.equal(withTab.partTargetFaceId, otherFlap.id);
  const tabFace = withTab.faces.find(f => f.name === 'Pestaña de cierre');
  assert.ok(tabFace && tabFace.parentId === otherFlap.id);

  // 4. Tira de apertura aplicada a la solapa seleccionada
  const withTear = DielineEngine.applyPartVariationToModel(baseModel, 'tear_strip', { targetFaceId: otherFlap.id });
  assert.equal(withTear.partTargetFaceId, otherFlap.id);
});

test('Pieza Solapas dobles crea 1 o 2 solapas articuladas en 2D y 3D sobre el área seleccionada', () => {
  const baseModel = loadAmericanBoxModel();
  const targetFlap = baseModel.faces.find(f =>
    f.role && f.role.includes('FLAP') && f.bounds.width > 80 && f.bounds.height > 20
  );
  assert.ok(targetFlap);

  // Dos solapas (por defecto)
  const settings2 = DielineEngine.getPartVariationSettings(baseModel, 'double_flaps', { targetFaceId: targetFlap.id });
  assert.equal(settings2.params.count, 2);
  assert.equal(settings2.params.angle, 90);

  const m2 = DielineEngine.applyPartVariationToModel(baseModel, 'double_flaps', {
    targetFaceId: targetFlap.id,
    count: 2,
    depth: 24,
    gap: 8,
    margin: 2,
    angle: 90
  });
  assert.ok(!m2.partError, m2.partError);
  assert.equal(m2.activePartVariation, 'double_flaps');
  assert.equal(m2.partTargetFaceId, targetFlap.id);
  assert.equal(m2.faces.length, baseModel.faces.length + 2);
  assert.equal(m2.hinges.length, baseModel.hinges.length + 2);
  const newFaces = m2.faces.filter(f => f.parentId === targetFlap.id && String(f.hingeId).startsWith('part_dflap_'));
  assert.equal(newFaces.length, 2);
  for (const nf of newFaces) {
    assert.equal(Math.abs(nf.defaultAngle), 90);
    assert.ok(nf.areaMm2 > 0);
  }

  // Una solapa continua a 180° (doble pared)
  const m1 = DielineEngine.applyPartVariationToModel(baseModel, 'double_flaps', {
    targetFaceId: targetFlap.id,
    count: 1,
    depth: 30,
    margin: 2,
    angle: 180
  });
  assert.ok(!m1.partError, m1.partError);
  assert.equal(m1.faces.length, baseModel.faces.length + 1);
  const singleFlap = m1.faces.find(f => f.parentId === targetFlap.id && String(f.hingeId).startsWith('part_dflap_'));
  assert.ok(singleFlap);
  assert.equal(Math.abs(singleFlap.defaultAngle), 180);
});

test('Pieza Ventanas troquela 1, 2 o 3 ventanas en cualquier área seleccionada (incluso paneles interiores de cuerpo)', () => {
  const baseModel = loadAmericanBoxModel();
  // Seleccionar una cara interior de cuerpo (rodeada de hendidos, sin borde libre exterior)
  const bodyFace = baseModel.faces.find(f => f.role === 'BODY' && f.bounds.width > 80 && f.bounds.height > 60);
  assert.ok(bodyFace, 'Debe existir una cara de cuerpo interior');

  // 1 ventana con esquinas redondeadas
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

  // 2 ventanas con esquinas rectas (radius = 0)
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

  // 3 ventanas
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

  // Una pieza de borde exterior (Solapas dobles) sobre un panel interior sin borde libre avisa claramente
  const interiorBody = baseModel.faces.find(f => {
    if (f.role !== 'BODY') return false;
    const res = DielineEngine.applyPartVariationToModel(baseModel, 'double_flaps', { targetFaceId: f.id });
    return Boolean(res.partError);
  });
  assert.ok(interiorBody, 'Un panel interior rodeado de hendidos debe devolver partError al intentar solapas dobles');
});

test('index.html incluye las tarjetas Solapas dobles y Ventanas en Cambiar piezas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('data-part-key="double_flaps"'));
  assert.ok(html.includes('Solapas dobles'));
  assert.ok(html.includes('data-part-key="windows"'));
  assert.ok(html.includes('Ventanas'));
});
