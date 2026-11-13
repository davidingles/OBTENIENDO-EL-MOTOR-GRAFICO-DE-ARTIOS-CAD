const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const code = source.slice(source.indexOf('  async function openDielineFile('), source.indexOf('  function initHeaderDropdowns('));

function setup(result, error, desktop = true) {
  const calls = [];
  const context = {
    window: desktop ? {__TAURI__: {core: {invoke: async command => {
      calls.push(['invoke', command]);
      if (error) throw error;
      return result;
    }}}} : {},
    document: {getElementById: id => ({click: () => calls.push(['click', id])})},
    loadSVGString: (...args) => calls.push(['svg', ...args]),
    openDxfImport: (...args) => calls.push(['dxf', ...args]),
    console: {error() {}}, alert: message => calls.push(['error', message])
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return {open: context.openDielineFile, calls};
}

test('abrir SVG en escritorio usa el selector nativo y entrega el texto al importador', async () => {
  const app = setup({name: 'caja ñ.svg', text: '<svg />'});
  await app.open();
  assert.deepEqual(app.calls, [['invoke', 'open_dieline_file'], ['svg', '<svg />', 'caja ñ.svg', true]]);
});
test('abrir DXF conserva la clasificación y escala del importador CAD', async () => {
  const app = setup({name: 'CAJA.DXF', text: '0\nEOF'});
  await app.open();
  assert.deepEqual(app.calls[1], ['dxf', '0\nEOF', 'CAJA.DXF']);
});
test('cancelar no modifica el troquel ni abre otro selector', async () => {
  const app = setup(null);
  await app.open();
  assert.deepEqual(app.calls, [['invoke', 'open_dieline_file']]);
});
test('un fallo nativo se comunica al usuario sin quedar silencioso', async () => {
  const app = setup(null, new Error('Archivo no accesible'));
  await app.open();
  assert.match(app.calls[1][1], /Archivo no accesible/);
});
test('en navegador se conserva el selector HTML', async () => {
  const app = setup(null, null, false);
  await app.open();
  assert.deepEqual(app.calls, [['click', 'svg-file-input']]);
});
