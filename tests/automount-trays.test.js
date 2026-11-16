const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../dieline-engine');
const UserLibrary = require('../library-models');

test('las 56 bandejas se incluyen con identificadores estables, material y geometría independiente', async () => {
  const context = {window: {addEventListener() {}}, DielineEngine: engine, UserLibrary,
    THREE: require('../assets/libs/three.min'), console, performance,
    document: {getElementById() {return null;}}, alert(message) {throw Error(message);}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../assets/automount-trays'), 'utf8'), context);
  const models = context.window.AUTOMOUNT_TRAYS;
  assert.equal(models.length, 56);
  assert.equal(new Set(models.map(item => item.num)).size, 56);
  for (const [board, count] of Object.entries({C1:29, C3:20, C5:4, C8:2, cartoncillo:1})) {
    assert.equal(models.filter(item => item.boardCode === board).length, count);
  }
  vm.runInContext(fs.readFileSync(require.resolve('../app'), 'utf8').replace(/\}\)\(\);\s*$/, `
    globalThis.flow={state,allCatalogModels,loadFefcoModel};
    applyNewDielineModel=(model,title)=>{flow.opened={model,title};};
  })();`), context);
  assert.equal(context.flow.allCatalogModels().length, 56);
  for (const item of models) {
    assert.ok(item.modelCategories.includes('automount-trays'));
    assert.ok(item.geometry.faces.length > 0, item.sourceFilename);
    assert.equal(item.geometry, item.geometry, 'la geometría se almacena en caché');
    await context.flow.loadFefcoModel(item, false);
    assert.equal(context.flow.state.boardCode, item.boardCode);
    assert.equal(context.flow.state.caliper, UserLibrary.boardThicknessMm[item.boardCode] || 1.5);
    assert.equal(context.flow.opened.title, item.name);
    assert.notEqual(context.flow.opened.model, item.geometry);
    assert.deepEqual(JSON.parse(JSON.stringify(context.flow.opened.model)), JSON.parse(JSON.stringify(item.geometry)));
  }
});
