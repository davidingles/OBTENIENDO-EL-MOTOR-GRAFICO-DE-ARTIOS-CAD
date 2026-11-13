const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../assets/libs/three.min');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

function editor(model) {
  const elements = new Map();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(match[1], {listeners:{},dataset:{},value:'',open:false,disabled:false,
      classList:{add(){},remove(){},contains(){return false;}},setAttribute(){},focus(){},
      showModal(){this.open=true;},close(){this.open=false;},
      addEventListener(type,listener){(this.listeners[type] ||= []).push(listener);},
      click(){for(const listener of this.listeners.click || [])listener({target:this,stopPropagation(){}});}});
  }
  const context = {THREE, UserLibrary:require('../library-models'), DielineEngine:require('../dieline-engine'),
    console, performance, window:{addEventListener(){}}, document:{getElementById:id=>elements.get(id)||null},
    alert(){assert.fail('Los errores deben aparecer en el formulario');}};
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8').replace(/\}\)\(\);\s*$/, `
    globalThis.configure=model=>{state.dieline=model;setupClientPublishing();initHeaderDropdowns();};
  })();`);
  vm.runInContext(source, context);
  context.configure(model);
  return elements;
}

test('el botón real del menú abre el formulario sin depender de un botón oculto inexistente ni subir archivos',()=>{
  const ui=editor({faces:[{id:1}]});
  assert.equal(ui.has('btn-publish-client'),false);
  ui.get('menu-publish-client').click();
  assert.equal(ui.get('publish-client-dialog').open,true);
  assert.equal(ui.get('publish-client-submit').disabled,false);
  assert.equal(ui.get('publish-client-status').textContent,'');
});
test('sin modelo 3D válido se abre el formulario y explica el motivo',()=>{
  for(const model of [null,{faces:[]},{faces:[{}],vector3DStale:true}]){
    const ui=editor(model);
    ui.get('menu-publish-client').click();
    assert.equal(ui.get('publish-client-dialog').open,true);
    assert.equal(ui.get('publish-client-submit').disabled,true);
    assert.match(ui.get('publish-client-status').textContent,/cierra sus contornos/);
  }
});
