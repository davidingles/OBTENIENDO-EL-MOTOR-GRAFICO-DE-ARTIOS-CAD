// Prepare the downloaded viewer in the writable build directory before deployment.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../dist/client-viewer');
const source = process.argv[2] || path.join(require('node:os').homedir(), 'Desktop/CAJAS_THREEJS-01');
fs.mkdirSync(root, { recursive: true });
for (const name of ['index.html', 'README.md', 'js', 'css', 'tools']) {
  fs.cpSync(path.join(source, name), path.join(root, name), { recursive: true });
}
const file = name => path.join(root, name);
let html = fs.readFileSync(file('index.html'), 'utf8');
html = html.replace('<html lang="es">', '<html lang="es" data-visor-state="idle">');
html = html.replace('Visor 3D · Three.js', 'Tu caja · Visor 3D');
html = html.replace('Cubo de prueba</p>', '</p>');
html = html.replace(/\s*<p class="hints__drop">[\s\S]*?<\/p>/, '');
html = html.replace(/<button id="btn-open"[\s\S]*?<input id="file-input"[^>]*\/>/, '<button id="btn-change" class="btn btn--primary" type="button">Otra caja</button>');
html = html.replace('<div id="app">', `<div id="app">
    <section id="client-gate" class="client-gate" aria-labelledby="client-title">
      <form id="client-form" class="client-card">
        <span class="client-eyebrow">VISOR 3D</span>
        <h1 id="client-title">Tu caja, en tus manos.</h1>
        <p>Introduce la clave que te hemos facilitado para ver tu caja en 3D.</p>
        <label for="client-key">Clave de tu caja</label>
        <input id="client-key" name="key" type="text" required maxlength="84" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ejemplo: cliente123" aria-describedby="client-help client-status" autofocus />
        <p id="client-help" class="client-help">Puedes escribir el nombre con o sin .glb. Respeta las mayúsculas.</p>
        <button id="client-submit" class="btn btn--primary" type="submit">Ver mi caja</button>
        <p id="client-status" role="status" aria-live="polite"></p>
      </form>
    </section>`);
html = html.replace('class="overlay" id="overlay"', 'class="overlay overlay--hidden" id="overlay"');
html = html.replace(/\s*<!-- Aviso al soltar[\s\S]*?(?=\s*<noscript>)/, '');
html = html.replace(/\s*<script>\s*\/\/ Aviso si el CDN[\s\S]*?<\/script>/, '');
html = html.replace('./js/main.js', './js/main.js?v=client-1').replace('./css/styles.css', './css/styles.css?v=client-1');
fs.writeFileSync(file('index.html'), html);
let config = fs.readFileSync(file('js/config.js'), 'utf8');
config = config.replace(/  \/\*\*[\s\S]*?(?=  model:)/, "  /** Los modelos se cargan únicamente al introducir su clave. */\n");
config = config.replace("url: './models/caja_02.glb'", "url: null");
fs.writeFileSync(file('js/config.js'), config);
const shared = fs.readFileSync(path.join(__dirname, '../client-publishing.js'), 'utf8');
fs.writeFileSync(file('js/model-key.js'), shared.slice(shared.indexOf('  function modelFilename'), shared.indexOf('  const api =')) + '\nexport { modelFilename };\n');
const oldMain = fs.readFileSync(file('js/main.js'), 'utf8');
const flaps = oldMain.slice(oldMain.indexOf('/** Controles de cada solapa'), oldMain.indexOf('/* ----------------------------------------------------------- botones'));
const main = `import { CONFIG } from './config.js';
import { modelFilename } from './model-key.js';
const root = document.documentElement;
const canvas = document.getElementById('scene');
const gate = document.getElementById('client-gate');
const form = document.getElementById('client-form');
const input = document.getElementById('client-key');
const submit = document.getElementById('client-submit');
const status = document.getElementById('client-status');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const sourceLabel = document.getElementById('source-label');
const btnRotate = document.getElementById('btn-rotate');
const btnReset = document.getElementById('btn-reset');
const flapsPanel = document.getElementById('flaps-panel');
const flapsList = document.getElementById('flaps-list');
const btnFlapsReset = document.getElementById('btn-flaps-reset');
let viewer = null;
let busy = false;

function returnToGate(message = '') {
  root.dataset.visorState = message ? 'error' : 'idle';
  root.dataset.visorReady = 'false';
  overlay.classList.add('overlay--hidden');
  gate.hidden = false;
  status.textContent = message;
  input.disabled = submit.disabled = false;
  input.focus();
}
function syncRotateButton() {
  const active = viewer?.autoRotate;
  btnRotate.textContent = active ? 'Pausar giro' : 'Reanudar giro';
  btnRotate.setAttribute('aria-pressed', String(Boolean(active)));
}
async function getViewer() {
  if (viewer) return viewer;
  // No Three.js, WebGL context or model is loaded before a key is submitted.
  let timer;
  try {
    const module = await Promise.race([
      import('./viewer.js'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Comprueba tu conexión e inténtalo de nuevo.')), 20000); })
    ]);
    viewer = new module.ModelViewer(canvas, CONFIG);
  } finally { clearTimeout(timer); }
  viewer.onStatus = (state, detail = {}) => {
    if (state === 'loading') {
      root.dataset.visorState = 'loading';
      overlayText.textContent = 'Cargando tu caja…';
      overlay.classList.remove('overlay--hidden');
    } else if (state === 'ready') {
      root.dataset.visorState = 'ready';
      root.dataset.visorReady = 'true';
      sourceLabel.textContent = viewer.contentLabel;
      buildFlapsUI();
      syncRotateButton();
      gate.hidden = true;
      overlay.classList.add('overlay--hidden');
    } else if (state === 'error') {
      const missing = detail.error?.response?.status === 404;
      returnToGate(missing ? 'No encontramos una caja con esa clave. Comprueba el nombre y las mayúsculas. Si acaba de publicarse, espera unos minutos.' : 'No se ha podido cargar la caja. Comprueba la clave y tu conexión, e inténtalo de nuevo.');
    }
  };
  return viewer;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  let filename;
  try { filename = modelFilename(input.value); }
  catch (error) { returnToGate(error.message); return; }
  busy = true;
  input.disabled = submit.disabled = true;
  status.textContent = 'Preparando tu caja…';
  try {
    const current = await getViewer();
    await current.loadModel('./modelos/' + encodeURIComponent(filename) + '?v=' + Date.now(), filename);
  } catch (error) {
    returnToGate('No se ha podido iniciar el visor. Comprueba tu conexión y que tu navegador admita WebGL.');
  } finally {
    busy = false;
    input.disabled = submit.disabled = false;
  }
});
document.getElementById('btn-change').addEventListener('click', () => {
  if (busy) return;
  viewer?.dispose();
  viewer = null;
  input.value = '';
  returnToGate();
});
btnRotate.addEventListener('click', () => { viewer?.toggleAutoRotate(); syncRotateButton(); });
btnReset.addEventListener('click', () => viewer?.resetView());
window.addEventListener('keydown', event => {
  if (root.dataset.visorState !== 'ready' || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  if (event.code === 'Space') { event.preventDefault(); viewer?.toggleAutoRotate(); syncRotateButton(); }
  if (event.key.toLowerCase() === 'r') viewer?.resetView();
});
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  viewer?.dispose(); viewer = null;
  returnToGate('Se ha perdido la conexión con la tarjeta gráfica. Vuelve a introducir la clave.');
});
// Prevent a dropped file from replacing the customer page.
for (const type of ['dragover', 'drop']) window.addEventListener(type, event => event.preventDefault());
try {
  const initial = new URLSearchParams(window.location.search).get('caja') || new URLSearchParams(window.location.search).get('clave') || new URLSearchParams(window.location.search).get('key');
  if (initial) input.value = initial;
} catch (_) {}

` + flaps;
fs.writeFileSync(file('js/main.js'), main);
fs.appendFileSync(file('css/styles.css'), `
/* Entrada por clave: la página comienza sin modelo ni controles. */
[hidden] { display: none !important; }
html:not([data-visor-state="ready"]) .hud,
html:not([data-visor-state="ready"]) #scene { visibility: hidden; }
.client-gate { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; padding: 24px; overflow-y: auto; background: radial-gradient(ellipse at 50% 30%, #1b2948 0%, #0a0d16 72%); }
.client-card { width: min(100%, 420px); padding: 32px; border: 1px solid var(--border); border-radius: 20px; background: rgba(17,23,39,.9); box-shadow: var(--shadow); }
.client-eyebrow { color: #8bb3ff; font-size: .72rem; font-weight: 700; letter-spacing: .18em; }
.client-card h1 { font-size: clamp(1.8rem, 6vw, 2.4rem); line-height: 1.15; margin: 16px 0; letter-spacing: -.04em; }
.client-card p { color: var(--muted); line-height: 1.6; font-size: .9rem; }
.client-card label { display: block; margin: 24px 0 8px; font-size: .85rem; font-weight: 600; }
.client-card input { width: 100%; padding: 14px; border: 1px solid var(--border-strong); border-radius: 10px; background: #0c1220; color: var(--text); font: inherit; }
.client-card input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
.client-card .client-help { font-size: .75rem; margin: 10px 0 22px; }
.client-card button { width: 100%; padding: 14px; font-size: .95rem; }
.client-card button:disabled { opacity: .65; cursor: wait; }
.client-card #client-status { margin-bottom: 0; min-height: 1em; font-size: .8rem; }
html[data-visor-state="error"] #client-status { color: #ffb0a8; }
@media (max-width: 420px) { .client-card { padding: 24px; } .client-gate { padding: 16px; } }
`);
fs.mkdirSync(file('modelos'), { recursive: true });
fs.writeFileSync(file('modelos/.gitkeep'), '');
fs.writeFileSync(file('README.md'), `# Visor de cajas para clientes

Web: https://davidingles.github.io/cajas_threejs-01/

La página empieza únicamente con un formulario. El cliente introduce el nombre del archivo, con o sin .glb, y se carga modelos/NOMBRE.glb. No se carga una caja inicial ni un cubo de prueba. Las claves distinguen mayúsculas y admiten de 1 a 80 letras ASCII, números, guiones y guiones bajos; deben comenzar por letra o número.

Desde Troqueles Vicente, abre una caja, ajusta su plegado y el arte y pulsa **Publicar para cliente**. La aplicación guarda el GLB con la posición actual en modelos/ y entrega el enlace del visor y la clave. No sustituye claves existentes. La publicación de GitHub Pages puede tardar unos minutos.

El visor permite girar, acercar y mover la caja, pausar el giro y regresar al formulario con **Otra caja**. Los modelos con los huesos definidos en js/config.js conservan los controles de solapas.

Los archivos son públicos. La clave selecciona un archivo y no es una contraseña. El visor no contiene credenciales de GitHub.

Para probar en local: node tools/serve.mjs (http://localhost:5173). Three.js se descarga por CDN únicamente después de introducir una clave.

Los archivos antiguos de models/ se conservan, pero los nuevos clientes se publican en modelos/.
`);
console.log('Visor preparado en ' + root);
