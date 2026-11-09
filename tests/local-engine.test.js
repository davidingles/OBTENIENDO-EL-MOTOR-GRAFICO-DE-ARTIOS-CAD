const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../dieline-engine.js');
global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const entry = global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(item => item.num === 150010);
function model() { return engine.buildDielineModelFromPacdora(entry.knifeData, entry); }

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
