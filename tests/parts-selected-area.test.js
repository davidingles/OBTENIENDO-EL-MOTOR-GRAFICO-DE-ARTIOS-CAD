const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const DielineEngine = require('../dieline-engine.js');
const UserLibrary = require('../library-models.js');

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

test('Solapas dobles en caja B1 americana hace crecer las 4 solapas del lado elegido en Y al ancho (X más corto) menos 2 mm', () => {
  const baseModel = loadAmericanBoxModel();
  const b1Data = DielineEngine.getB1DoubleFlapsData(baseModel);
  assert.equal(b1Data.isB1, true);
  assert.equal(b1Data.topFlaps.length, 4);
  assert.equal(b1Data.bottomFlaps.length, 4);
  assert.ok(b1Data.minBodyWidthX > 80);

  // Seleccionar una solapa superior -> crecen las 4 superiores hasta minBodyWidthX - 2 mm
  const topTarget = b1Data.topFlaps[0].face;
  const maxTopH = Math.max(...b1Data.topFlaps.map(x => x.face.bounds.height));
  const expectedTopDelta = Math.max(0, (b1Data.minBodyWidthX - 2) - maxTopH);
  const mTop = DielineEngine.applyPartVariationToModel(baseModel, 'double_flaps', { targetFaceId: topTarget.id });
  assert.ok(!mTop.partError, mTop.partError);
  assert.equal(mTop.activePartVariation, 'double_flaps');
  assert.equal(mTop.partDoubleFlapsSide, 'top');

  const maxNewTopH = Math.max(...b1Data.topFlaps.map(x => mTop.faces.find(f => f.id === x.face.id).bounds.height));
  assert.ok(Math.abs(maxNewTopH - (b1Data.minBodyWidthX - 2)) < 0.25, 'La altura en Y debe ser igual al ancho más corto en X menos 2 mm');
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
  const expectedBotDelta = Math.max(0, (b1Data.minBodyWidthX - 2) - maxBotH);
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

test('Asa en Cara Cuerpo 4 se orienta horizontal por defecto y admite girar 90 grados', () => {
  const baseModel = loadAmericanBoxModel();
  const body4 = baseModel.faces.find(f => f.label && f.label.includes('Cara Cuerpo 4'));
  assert.ok(body4 && body4.bounds.width > body4.bounds.height);

  const holeBounds = hole => {
    const xs = hole.map(p => p.x), ys = hole.map(p => p.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  // Por defecto (rotate90 = 0): horizontal (ancho > alto)
  const mHoriz = DielineEngine.applyPartVariationToModel(baseModel, 'handle', { targetFaceId: body4.id, length: 70, width: 20, radius: 6, rotate90: 0 });
  assert.ok(!mHoriz.partError, mHoriz.partError);
  const bH = holeBounds(mHoriz.faces.find(f => f.id === body4.id).holes[0]);
  assert.ok(bH.w > bH.h, `Por defecto debe ser horizontal, obtenido ${bH.w.toFixed(1)}×${bH.h.toFixed(1)}`);

  // Con rotate90 = 1: vertical (alto > ancho)
  const mVert = DielineEngine.applyPartVariationToModel(baseModel, 'handle', { targetFaceId: body4.id, length: 70, width: 20, radius: 6, rotate90: 1 });
  assert.ok(!mVert.partError, mVert.partError);
  const bV = holeBounds(mVert.faces.find(f => f.id === body4.id).holes[0]);
  assert.ok(bV.h > bV.w, `Con girar 90° debe ser vertical, obtenido ${bV.w.toFixed(1)}×${bV.h.toFixed(1)}`);
});

test('UserLibrary detecta nombres duplicados para sobreescribir y conserva thumbnail3dDataUrl', () => {
  const baseModel = loadAmericanBoxModel();
  const thumb = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const item = UserLibrary.create('b1-americana copia-01', 'C1', baseModel, 'b1.svg', undefined, { thumbnail3dDataUrl: thumb });
  assert.equal(item.thumbnail3dDataUrl, thumb);
  const found = UserLibrary.findByName([item], '  B1-AMERICANA COPIA-01  ');
  assert.ok(found && found.num === item.num);
  const normalized = UserLibrary.normalize([item]);
  assert.equal(normalized[0].thumbnail3dDataUrl, thumb);
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

  // Mover ventana en X e Y y comprobar cotas automáticas
  const w0 = DielineEngine.applyPartVariationToModel(baseModel, 'windows', {
    targetFaceId: bodyFace.id, count: 1, length: 40, width: 30, radius: 4, offsetX: 0, offsetY: 0
  });
  const wShift = DielineEngine.applyPartVariationToModel(baseModel, 'windows', {
    targetFaceId: bodyFace.id, count: 1, length: 40, width: 30, radius: 4, offsetX: 10, offsetY: -8
  });
  assert.ok(!wShift.partError, wShift.partError);
  const wTop0 = (w0.sizeArrowData || []).find(a => a.id && a.id.includes('part_win_top_'));
  const wLeft0 = (w0.sizeArrowData || []).find(a => a.id && a.id.includes('part_win_left_'));
  const wTopS = (wShift.sizeArrowData || []).find(a => a.id && a.id.includes('part_win_top_'));
  const wLeftS = (wShift.sizeArrowData || []).find(a => a.id && a.id.includes('part_win_left_'));
  assert.ok(wTop0 && wLeft0 && wTopS && wLeftS);
  assert.ok(Math.abs((wTop0.valueMm - wTopS.valueMm) - 8) < 0.3);
  assert.ok(Math.abs((wLeftS.valueMm - wLeft0.valueMm) - 10) < 0.3);
});

test('Asa genera cotas al filo superior y extremos laterales y permite mover en X e Y', () => {
  const baseModel = loadAmericanBoxModel();
  const body2 = baseModel.faces.find(f => f.label && f.label.includes('Cara Cuerpo 2'));
  assert.ok(body2);

  const m0 = DielineEngine.applyPartVariationToModel(baseModel, 'handle', {
    targetFaceId: body2.id, length: 70, width: 20, radius: 6, offsetX: 0, offsetY: 0
  });
  assert.ok(!m0.partError, m0.partError);
  const dims0 = (m0.sizeArrowData || []).filter(a => a.isPartDim);
  assert.equal(dims0.length, 3, 'Debe generar cota superior, lateral izquierda y lateral derecha');
  const top0 = dims0.find(a => a.id.includes('_top_'));
  const left0 = dims0.find(a => a.id.includes('_left_'));
  const right0 = dims0.find(a => a.id.includes('_right_'));
  assert.ok(top0 && left0 && right0);
  assert.ok(Math.abs(left0.valueMm - right0.valueMm) < 0.5, 'Centrada en X las cotas laterales deben ser iguales');

  // Mover el asa +12 mm en X y -10 mm en Y
  const mShift = DielineEngine.applyPartVariationToModel(baseModel, 'handle', {
    targetFaceId: body2.id, length: 70, width: 20, radius: 6, offsetX: 12, offsetY: -10
  });
  assert.ok(!mShift.partError, mShift.partError);
  const dimsS = (mShift.sizeArrowData || []).filter(a => a.isPartDim);
  const topS = dimsS.find(a => a.id.includes('_top_'));
  const leftS = dimsS.find(a => a.id.includes('_left_'));
  const rightS = dimsS.find(a => a.id.includes('_right_'));
  assert.ok(Math.abs((top0.valueMm - topS.valueMm) - 10) < 0.3, 'Mover -10 mm en Y acerca el asa 10 mm al borde superior');
  assert.ok(Math.abs((leftS.valueMm - left0.valueMm) - 12) < 0.3, 'Mover +12 mm en X aumenta la cota izquierda en 12 mm');
  assert.ok(Math.abs((right0.valueMm - rightS.valueMm) - 12) < 0.3, 'Mover +12 mm en X reduce la cota derecha en 12 mm');
});

test('Pieza Chaflanar chaflana las esquinas de corte en una o varias áreas seleccionadas con los grados indicados', () => {
  const baseModel = loadAmericanBoxModel();
  const topFlaps = baseModel.faces.filter(f => f.role && f.role.includes('TOP'));
  assert.ok(topFlaps.length >= 2);
  const [f1, f2] = topFlaps;

  const res = DielineEngine.applyPartVariationToModel(baseModel, 'chamfer', {
    targetFaceId: f1.id,
    targetFaceIds: [f1.id, f2.id],
    angle: 35,
    size: 10
  });
  assert.ok(!res.partError, res.partError);
  assert.equal(res.activePartVariation, 'chamfer');
  assert.equal(res.partTargetFaceIds.length, 2);

  const u1 = res.faces.find(f => f.id === f1.id);
  const u2 = res.faces.find(f => f.id === f2.id);
  assert.ok(u1.polygon.length > f1.polygon.length, 'El área 1 debe tener vértices de chaflán añadidos');
  assert.ok(u2.polygon.length > f2.polygon.length, 'El área 2 debe tener vértices de chaflán añadidos');
  assert.ok(u1.areaMm2 < f1.areaMm2 && u2.areaMm2 < f2.areaMm2, 'Chaflanar las esquinas reduce el área de los paneles');
  assert.ok(res.cutSegments.some(s => s.isPartMod), 'Debe añadir segmentos de corte de chaflán en 2D');
});

test('Elegir base en troquel tipo caja B1 mantiene H en eje Y y sincroniza boxDimensionsMm con cotas L/W/H', () => {
  const baseModel = loadAmericanBoxModel();
  const cara3 = baseModel.faces.find(f => f.label && f.label.includes('Cara Cuerpo 3'));
  const cara2 = baseModel.faces.find(f => f.label && f.label.includes('Cara Cuerpo 2'));
  assert.ok(cara3 && cara2);

  const updated = DielineEngine.setDimensionBaseFace(baseModel, cara3.id);
  const arrowL = updated.sizeArrowData.find(a => a.lineName === 'L');
  const arrowW = updated.sizeArrowData.find(a => a.lineName === 'W');
  const arrowH = updated.sizeArrowData.find(a => a.lineName === 'H');
  assert.ok(arrowL && arrowW && arrowH);

  // En caja B1, H debe ser el eje Y (vertical: p1.x === p2.x) y coincidir con la altura de Cara Cuerpo 3
  assert.ok(Math.abs(arrowH.p1.x - arrowH.p2.x) < 0.5, 'La cota H en troquel tipo caja debe ser vertical (eje Y)');
  assert.ok(Math.abs(updated.boxDimensionsMm.depth - cara3.bounds.height) < 0.5, 'Alto (H) debe ser la dimensión en Y de la cara de cuerpo');

  // Las medidas personalizadas (boxDimensionsMm) deben coincidir exactamente con las cotas medidas
  assert.ok(Math.abs(updated.boxDimensionsMm.length - DielineEngine.measureDimensionArrow(arrowL)) < 0.1);
  assert.ok(Math.abs(updated.boxDimensionsMm.width - DielineEngine.measureDimensionArrow(arrowW)) < 0.1);
  assert.ok(Math.abs(updated.boxDimensionsMm.depth - DielineEngine.measureDimensionArrow(arrowH)) < 0.1);
});

test('index.html incluye las tarjetas Solapas dobles, Ventanas y Chaflanar en Cambiar piezas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('data-part-key="double_flaps"'));
  assert.ok(html.includes('Solapas dobles'));
  assert.ok(html.includes('data-part-key="windows"'));
  assert.ok(html.includes('Ventanas'));
  assert.ok(html.includes('data-part-key="chamfer"'));
  assert.ok(html.includes('Chaflanar'));
});
