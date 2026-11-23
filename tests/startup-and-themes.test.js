const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../dieline-engine');
const UserLibrary = require('../library-models');
const VectorCAD = require('../vector-cad');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

function createMockElement(id) {
  const listeners = new Map();
  const attrs = new Map();
  return {
    id,
    value: '',
    textContent: '',
    title: '',
    hidden: false,
    disabled: false,
    open: false,
    style: {},
    dataset: {},
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c);
        } else if (force) this.classes.add(c);
        else this.classes.delete(c);
        return this.classes.has(c);
      },
      contains(c) { return this.classes.has(c); }
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
    select() {},
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    trigger(type, event = {}) {
      for (const fn of (listeners.get(type) || [])) fn(event);
    }
  };
}

function setupApp() {
  const els = new Map();
  const storage = new Map();
  const docElAttrs = new Map();
  const el = id => {
    if (!els.has(id)) els.set(id, createMockElement(id));
    return els.get(id);
  };

  global.window = global;
  require('../artios-assets.js');
  require('../assets/user-models.js');

  const sceneBg = { value: 0xf1f3f6, set(v) { this.value = v; } };

  const ctx = {
    DielineEngine: engine,
    UserLibrary,
    VectorCAD,
    TextEncoder,
    console,
    performance,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => {},
    window: {
      ARTIOS_DEFAULT_SVG: global.ARTIOS_DEFAULT_SVG,
      BUNDLED_USER_MODELS: global.BUNDLED_USER_MODELS,
      location: { protocol: 'file:' },
      addEventListener() {},
      localStorage: {
        getItem: k => storage.has(k) ? storage.get(k) : null,
        setItem: (k, v) => storage.set(k, String(v))
      }
    },
    document: {
      documentElement: {
        setAttribute: (k, v) => docElAttrs.set(k, String(v)),
        getAttribute: k => docElAttrs.has(k) ? docElAttrs.get(k) : null,
        removeAttribute: k => docElAttrs.delete(k)
      },
      body: { classList: createMockElement('body').classList },
      getElementById: el,
      querySelector: () => null,
      querySelectorAll: () => [],
      activeElement: null
    },
    alert: e => { throw Error(e); }
  };

  vm.createContext(ctx);
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, `
      scene = { background: { value: 0xf1f3f6, set(v) { this.value = v; } } };
      rebuild3DMesh = () => {};
      setMasterFold = () => {};
      fitCameraToModel = () => {};
      buildHingeSlidersUI = () => {};
      render2FDieline = () => {};
      userLibraryModels = UserLibrary.normalize(window.BUNDLED_USER_MODELS || []);
      userLibraryReady = Promise.resolve();
      globalThis.api = {
        state,
        scene,
        isDarkTheme,
        applyAppTheme,
        updateEmptyCanvasStartUI,
        startNewB1Box,
        applyNewB1DimensionsFromModal,
        getMyModelsForModal,
        openMyModelsModal,
        initStartupAndThemeUI,
        setModalFilters(board, q) { myModelsModalBoardFilter = board; myModelsModalSearch = q; }
      };
    })();`);

  vm.runInContext(source, ctx);
  return { api: ctx.api, el, storage, docElAttrs };
}

test('index.html incluye botones de inicio, modales accesibles y botones de tema a la derecha de enviar al plotter', () => {
  const plotterIdx = html.indexOf('id="btn-send-plotter"');
  const darkIdx = html.indexOf('id="btn-theme-dark"');
  const cimpackIdx = html.indexOf('id="btn-theme-cimpack"');
  assert.ok(plotterIdx > 0, 'Debe existir el botón enviar al plotter');
  assert.ok(darkIdx > plotterIdx, 'El icono de modo oscuro debe ir a la derecha de enviar al plotter');
  assert.ok(cimpackIdx > darkIdx, 'El botón theme Cimpack debe ir a la derecha del icono de modo oscuro');
  assert.match(html, /id="btn-theme-cimpack"[^>]*>theme Cimpack</);

  assert.equal(html.includes('id="empty-canvas-start"'), false, 'No debe existir tarjeta/modal central sobre el canvas vacío');
  const rotateIdx = html.indexOf('id="btn-rotate-dieline"');
  const b1Idx = html.indexOf('id="btn-start-new-b1"');
  const newDieIdx = html.indexOf('id="btn-start-new-dieline"');
  assert.ok(rotateIdx > 0 && b1Idx > rotateIdx && newDieIdx > b1Idx, 'NUEVA CAJA B1 y Nuevo Troquel deben ir debajo de Girar troquel 90°');
  assert.match(html, /id="btn-start-new-b1"[\s\S]*?NUEVA CAJA B1/);
  assert.match(html, /id="btn-start-new-dieline"[\s\S]*?Nuevo Troquel/);

  assert.match(html, /id="vector-controls" class="vector-dock-bar">/, 'La barra de herramientas de vectores debe estar siempre visible (sin atributo hidden)');
  assert.equal(html.includes('id="vector-toggle"'), false, 'El botón Editar vectores ya no debe existir al estar la barra siempre visible');
  assert.ok(html.indexOf('id="vector-editor"') < html.indexOf('class="canvas-2d-stage"'), 'La barra de vectores debe ir arriba del área del canvas');

  assert.match(html, /id="new-b1-dialog"[^>]*aria-labelledby="new-b1-title"/);
  assert.match(html, /for="new-b1-length"/);
  assert.match(html, /for="new-b1-width"/);
  assert.match(html, /for="new-b1-height"/);

  assert.match(html, /id="my-models-modal"[^>]*aria-labelledby="my-models-modal-title"/);
  assert.match(html, /id="my-models-modal-grid"/);
});

test('al iniciar la app el canvas comienza vacío', () => {
  const { api } = setupApp();
  assert.equal(api.state.dieline, null);
});

test('NUEVA CAJA B1 carga la caja B1, abre la modal accesible y aplica largo, ancho y alto', async () => {
  const { api, el } = setupApp();
  await api.startNewB1Box();

  assert.ok(api.state.dieline, 'Debe cargar un troquel en el canvas');
  assert.equal(engine.detectB1AmericanBox(api.state.dieline).isB1, true, 'El modelo cargado debe ser una caja B1');
  assert.match(String(api.state.fileName || ''), /sin-retranqueos/i, 'La caja B1 inicial debe cargarse sin retranqueos');
  assert.equal(Number(api.state.dieline.b1RetranqueoMm || 0), 0, 'No debe tener retranqueo aplicado al inicio');
  assert.equal(el('new-b1-dialog').open, true, 'Debe abrirse la modal accesible de medidas');

  el('new-b1-length').value = '400';
  el('new-b1-width').value = '250';
  el('new-b1-height').value = '180';
  const ok = api.applyNewB1DimensionsFromModal(true);

  assert.equal(ok, true);
  assert.equal(el('new-b1-dialog').open, false, 'La modal debe cerrarse tras aplicar medidas');
  assert.equal(api.state.paramL, 400);
  assert.equal(api.state.paramW, 250);
  assert.equal(api.state.paramH, 180);
  assert.equal(el('input-length').value, '400');
  assert.equal(el('input-width').value, '250');
  assert.equal(el('input-height').value, '180');
});

test('Nuevo Troquel lista los modelos de Biblioteca - Mis modelos y filtra por cartón y búsqueda', () => {
  const { api } = setupApp();
  api.setModalFilters('ALL', '');
  const all = api.getMyModelsForModal();
  assert.ok(all.length >= 3, 'Debe listar todos los modelos guardados en Mis modelos');

  api.setModalFilters('C3', '');
  const onlyC3 = api.getMyModelsForModal();
  assert.ok(onlyC3.length >= 1 && onlyC3.every(m => m.boardCode === 'C3'));

  api.setModalFilters('ALL', 'americana');
  const searchB1 = api.getMyModelsForModal();
  assert.ok(searchB1.length >= 1 && searchB1.every(m => /americana/i.test(m.name)));
});

test('el modo oscuro cambia data-theme, persiste en localStorage y actualiza el fondo 3D', () => {
  const { api, el, storage, docElAttrs } = setupApp();
  api.initStartupAndThemeUI();
  assert.equal(api.isDarkTheme(), false);

  el('btn-theme-dark').trigger('click');
  assert.equal(api.isDarkTheme(), true);
  assert.equal(docElAttrs.get('data-theme'), 'dark');
  assert.equal(storage.get('troqueles-vicente-theme-v1'), 'dark');
  assert.equal(el('btn-theme-dark').getAttribute('aria-pressed'), 'true');
  assert.equal(api.scene.background.value, 0x0d131d);

  el('btn-theme-dark').trigger('click');
  assert.equal(api.isDarkTheme(), false);
  assert.equal(docElAttrs.has('data-theme'), false);
  assert.equal(storage.get('troqueles-vicente-theme-v1'), 'light');
  assert.equal(api.scene.background.value, 0xf1f3f6);
});
