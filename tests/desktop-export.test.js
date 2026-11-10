const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const code = source.slice(source.indexOf('  async function saveExport('), source.indexOf('  function downloadSelectedDielineFormat('));

test('la exportación Tauri entrega al diálogo nativo el nombre y los bytes exactos', async () => {
  let call;
  const context = {window: {__TAURI__: {core: {invoke: async (...args) => { call = args; return true; }}}}, Uint8Array, console, alert: assert.fail};
  vm.createContext(context);
  vm.runInContext(code, context);
  const bytes = [0, 127, 128, 255];
  await context.saveExport(new Blob([Uint8Array.from(bytes)]), 'prueba.glb');
  assert.equal(call[0], 'save_export');
  assert.equal(call[1].filename, 'prueba.glb');
  assert.deepEqual(Array.from(call[1].data), bytes);
});

test('cancelar el diálogo nativo no genera una descarga alternativa', async () => {
  const context = {window: {__TAURI__: {core: {invoke: async () => false}}}, Uint8Array, console, alert: assert.fail};
  vm.createContext(context);
  vm.runInContext(code, context);
  await context.saveExport(new Blob(['<svg/>']), 'prueba.svg');
});

test('un fallo al guardar se comunica al usuario', async () => {
  let message;
  const context = {window: {__TAURI__: {core: {invoke: async () => { throw new Error('Disco lleno'); }}}}, Uint8Array, console: {error() {}}, alert: text => { message = text; }};
  vm.createContext(context);
  vm.runInContext(code, context);
  await context.saveExport(new Blob(['<svg/>']), 'prueba.svg');
  assert.match(message, /Disco lleno/);
});
