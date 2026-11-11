const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { modelFilename } = require('../client-publishing');

function setup(outcome = 'ready') {
  const elements = new Map();
  class Element {
    constructor() { this.value = ''; this.listeners = {}; this.dataset = {}; this.classList = { add() {}, remove() {} }; this.hidden = false; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    focus() {} setAttribute() {}
  }
  const document = { documentElement: new Element(), getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  const calls = [];
  class ModelViewer {
    constructor() { calls.push('construct'); this.autoRotate = true; this.flaps = []; }
    async loadModel(url, label) { calls.push(url); this.onStatus('loading'); this.contentLabel = label; this.onStatus(outcome, { error: { response: { status: 404 } } }); }
    dispose() { calls.push('dispose'); }
  }
  const source = fs.readFileSync(require('node:path').join(__dirname, '../dist/client-viewer/js/main.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace("import('./viewer.js')", 'Promise.resolve({ModelViewer})');
  const ctx = { document, window: { addEventListener() {} }, modelFilename, CONFIG: {}, ModelViewer, HTMLInputElement: Element, HTMLButtonElement: Element, setTimeout, clearTimeout, Date, console };
  vm.runInNewContext(source, ctx);
  return { calls, elements, document, submit: () => document.getElementById('client-form').listeners.submit({ preventDefault() {} }) };
}

test('abrir el visor no inicia Three.js ni solicita ningún modelo', () => {
  const ui = setup(); assert.deepEqual(ui.calls, []);
});
test('una clave inválida permite corregirla sin inicializar WebGL', async () => {
  const ui = setup(); ui.document.getElementById('client-key').value = '../otro'; await ui.submit();
  assert.deepEqual(ui.calls, []); assert.equal(ui.document.documentElement.dataset.visorState, 'error');
  assert.equal(ui.document.getElementById('client-submit').disabled, false);
});
test('carga la clave, muestra el modelo y Otra caja libera la anterior', async () => {
  const ui = setup(); ui.document.getElementById('client-key').value = 'Cliente_01.GLB'; await ui.submit();
  assert.match(ui.calls[1], /^\.\/modelos\/Cliente_01\.glb\?v=\d+$/);
  assert.equal(ui.document.getElementById('client-gate').hidden, true);
  assert.equal(ui.document.documentElement.dataset.visorReady, 'true');
  ui.document.getElementById('btn-change').listeners.click();
  assert.equal(ui.calls.at(-1), 'dispose'); assert.equal(ui.document.getElementById('client-gate').hidden, false);
  assert.equal(ui.document.getElementById('client-key').value, '');
});
test('una clave inexistente conserva el formulario y admite otro intento', async () => {
  const ui = setup('error'); ui.document.getElementById('client-key').value = 'ausente'; await ui.submit();
  assert.equal(ui.document.documentElement.dataset.visorState, 'error');
  assert.equal(ui.document.getElementById('client-gate').hidden, false);
  assert.match(ui.document.getElementById('client-status').textContent, /No encontramos/);
  await ui.submit(); assert.equal(ui.calls.length, 3);
});
