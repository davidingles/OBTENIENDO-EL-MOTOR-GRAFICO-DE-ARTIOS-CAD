const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const engine = require('../dieline-engine');

test('un SVG de Illustrator con colores en clases CSS genera sus nueve paneles', () => {
  const svg = fs.readFileSync(require.resolve('./fixtures/illustrator-class-strokes.svg'), 'utf8');
  const parsed = engine.parseSVGDieline(svg);
  assert.equal(parsed.cutSegmentsMm.length, 96);
  assert.equal(parsed.foldSegmentsMm.length, 8);
  const model = engine.buildDielineModel(svg);
  assert.equal(model.faces.length, 9);
  assert.equal(model.hinges.length, 8);
  assert.ok(Math.abs(model.bounds.width - 326) < 0.01);
  assert.ok(Math.abs(model.bounds.height - 444) < 0.01);
});

test('los estilos de clase equivalen a los colores explícitos en los elementos', () => {
  const svg = fs.readFileSync(require.resolve('./fixtures/illustrator-class-strokes.svg'), 'utf8');
  const explicit = svg.replace(/class="st([012])"/g, (_, i) => `stroke="${['blue', '#f0f', 'red'][i]}"`);
  assert.deepEqual(engine.parseSVGDieline(svg), engine.parseSVGDieline(explicit));
});

test('las clases respetan especificidad, orden de reglas y prioridad del estilo inline', () => {
  const svg = `<svg width="20mm" viewBox="0 0 20 10"><style>
    .cut.extra { stroke: blue; }
    .cut { stroke: red; }
    .fold { stroke: blue; }
    .fold { stroke: #f0f; }
  </style><rect class="cut extra" stroke="red" width="20" height="10"/>
  <line class="fold" x1="10" y1="0" x2="10" y2="10"/>
  <line class="cut" style="stroke: blue" x1="0" y1="5" x2="20" y2="5"/></svg>`;
  const parsed = engine.parseSVGDieline(svg);
  assert.equal(parsed.cutSegmentsMm.length, 5);
  assert.equal(parsed.foldSegmentsMm.length, 1);
});
