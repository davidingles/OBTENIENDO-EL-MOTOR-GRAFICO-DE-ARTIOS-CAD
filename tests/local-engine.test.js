const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../dieline-engine.js');
global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const entry = global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(item => item.num === 150010);
function model() { return engine.buildDielineModelFromPacdora(entry.knifeData, entry); }

test('el asa usa largo, ancho y radio y conserva intacto el modelo original', () => {
  const base = model();
  const changed = engine.applyPartVariationToModel(base, 'handle', {length:80,width:20,radius:5});
  const face = changed.faces.find(f => f.id === changed.partTargetFaceId);
  assert.equal(changed.partError, undefined);
  const hole = face.holes.at(-1);
  assert.ok(Math.abs(Math.max(...hole.map(p=>p.x))-Math.min(...hole.map(p=>p.x))-80)<1e-6);
  assert.ok(Math.abs(Math.max(...hole.map(p=>p.y))-Math.min(...hole.map(p=>p.y))-20)<1e-6);
  assert.ok(Math.abs((base.totalAreaMm2-changed.totalAreaMm2)-(80*20-(4-Math.PI)*25))<2);
  assert.equal(base.faces.find(f=>f.id===face.id).holes.length, face.holes.length-1);
});

test('dos uñeros eliminan el corte recto y recortan el perímetro físico', () => {
  const base = model();
  const changed = engine.applyPartVariationToModel(base,'thumb_notch',{radius:10,count:2,distance:80});
  const face = changed.faces.find(f=>f.id===changed.partTargetFaceId);
  const original = base.faces.find(f=>f.id===face.id);
  const center=(original.bounds.minX+original.bounds.maxX)/2;
  for (const x of [center-40,center+40]) {
    assert.equal(engine.pointInPolygon({x,y:original.bounds.minY+2},face.polygon),false);
    assert.equal(changed.cutSegments.some(s=>Math.abs(s.y1-original.bounds.minY)<1e-6 && Math.abs(s.y2-original.bounds.minY)<1e-6 && Math.min(s.x1,s.x2)<x && Math.max(s.x1,s.x2)>x),false);
  }
  assert.ok(Math.abs(base.totalAreaMm2-changed.totalAreaMm2-Math.PI*100)<1);
});

test('la pestaña sustituye el corte de unión por un hendido y añade una cara articulada', () => {
  const base=model();
  const changed=engine.applyPartVariationToModel(base,'tab_lock',{length:60,depth:15});
  assert.equal(changed.faces.length,base.faces.length+1);
  assert.equal(changed.hinges.length,base.hinges.length+1);
  const hinge=changed.hinges.find(h=>h.isPartMod);
  const tab=changed.faces.find(f=>f.id===hinge.childFaceId);
  assert.equal(tab.parentId,changed.partTargetFaceId);
  assert.equal(tab.role,'FLAP_CLOSURE');
  assert.ok(changed.foldSegments.some(s=>s.isPartMod));
  assert.equal(changed.cutSegments.some(s=>Math.abs(s.y1-hinge.p1.y)<1e-6 && Math.abs(s.y2-hinge.p2.y)<1e-6 && Math.min(s.x1,s.x2)<hinge.midpoint.x && Math.max(s.x1,s.x2)>hinge.midpoint.x),false);
  assert.ok(changed.bounds.minY<base.bounds.minY);
  for(const exportFn of [engine.exportDielineToSVG,engine.exportDielineToDXF,engine.exportDielineToPDF]) assert.doesNotMatch(exportFn(changed),/NaN|Infinity/);
});

test('largo, ancho y alto cambian la geometría y coinciden con sus cotas', () => {
  const base = model();
  for (const [length, width, depth] of [[400, 202, 62], [250, 202, 62], [315, 300, 62], [315, 202, 120], [300, 300, 120]]) {
    const resized = engine.resizeDielineParametric(base, length, width, depth);
    for (const [name, expected] of Object.entries({L: length, W: width, H: depth})) {
      const arrow = resized.sizeArrowData.find(a => a.lineName === name);
      const span = Math.hypot(arrow.p2.x - arrow.p1.x, arrow.p2.y - arrow.p1.y);
      assert.ok(Math.abs(span - expected) < 1e-6, `${name}: ${span} debe ser ${expected}`);
      assert.equal(arrow.lineLength, expected);
    }
    const panel = resized.faces.find(f => f.pacdoraName === 'H');
    assert.ok(Math.abs(panel.bounds.width - length) < 1e-6);
    assert.ok(Math.abs(panel.bounds.height - width) < 1e-6);
  }
  assert.equal(base.faces.find(f => f.pacdoraName === 'H').bounds.width, 315);
});

test('la banda local cambia el ancho elegido sin modificar el modelo base', () => {
  const base = model();
  const face = base.faces.find(f => f.pacdoraName === 'FL');
  const original = face.bounds.width;
  const dims = base.boxDimensionsMm;
  const changed = engine.resizeDielineParametric(base, dims.length, dims.width, dims.depth,
    { axis: 'x', min: face.bounds.minX, max: face.bounds.maxX, targetSpan: original + 10 });
  assert.ok(Math.abs(changed.faces.find(f => f.id === face.id).bounds.width - original - 10) < 1e-6);
  assert.equal(face.bounds.width, original);
  assert.equal(changed.hinges.length, base.hinges.length);
  assert.equal(changed.cutSegments.length, base.cutSegments.length);
  assert.ok(changed.cutSegments.some((segment, i) => Math.abs(segment.x1 - base.cutSegments[i].x1) > 0.1));
  assert.ok(changed.hinges.some((hinge, i) => Math.abs(hinge.p1.x - base.hinges[i].p1.x) > 0.1));
});

test('un cambio local conserva dimensiones y produce un SVG finito', () => {
  const base = model();
  const resized = engine.resizeDielineParametric(base, 340, 220, 70);
  assert.deepEqual(resized.boxDimensionsMm, {length: 340, width: 220, depth: 70});
  const svg = engine.exportDielineToSVG(resized, 5);
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.match(svg, /width="[0-9.]+mm"/);
});


test('identifica parejas simétricas y permite igualar sus bandas', () => {
  const base = model();
  const left = base.faces.find(f => f.pacdoraName === 'FL');
  const right = engine.findSymmetricFace(base, left, 'x');
  assert.equal(right?.pacdoraName, 'FR');
  const d = base.boxDimensionsMm;
  let result = base;
  for (const id of [left.id, right.id]) {
    const face = result.faces.find(f => f.id === id);
    result = engine.resizeDielineParametric(result, d.length, d.width, d.depth,
      {axis: 'x', min: face.bounds.minX, max: face.bounds.maxX, targetSpan: 70});
  }
  assert.ok(Math.abs(result.faces.find(f => f.id === left.id).bounds.width - 70) < 1e-6);
  assert.ok(Math.abs(result.faces.find(f => f.id === right.id).bounds.width - 70) < 1e-6);
  const unrelated = base.faces.find(f => f.pacdoraName === 'FT');
  assert.equal(engine.findSymmetricFace(base, unrelated, 'y'), null);
});

test('las exportaciones por defecto no incluyen sangrado', () => {
  const base = model();
  assert.doesNotMatch(engine.exportDielineToSVG(base), /Bleed_Verde/);
  assert.doesNotMatch(engine.exportDielineToDXF(base), /BLEED/);
  assert.doesNotMatch(engine.exportDielineToPDF(base), /0\.133 0\.773 0\.369 RG/);
});
