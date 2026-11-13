import { CONFIG } from './config.js';
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
const animPanel = document.getElementById('anim-panel');
const animSlider = document.getElementById('anim-slider');
const btnAnimPlay = document.getElementById('btn-anim-play');
const animPlayText = document.getElementById('anim-play-text');
const animIcon = document.getElementById('anim-icon');
const animValLabel = document.getElementById('anim-val-label');
let viewer = null;
let busy = false;

function returnToGate(message = '') {
  root.dataset.visorState = message ? 'error' : 'idle';
  root.dataset.visorReady = 'false';
  overlay.classList.add('overlay--hidden');
  gate.hidden = false;
  if (animPanel) animPanel.hidden = true;
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
      import('./viewer.js?v=20261113-armadura-90'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Comprueba tu conexión e inténtalo de nuevo.')), 20000); })
    ]);
    viewer = new module.ModelViewer(canvas, CONFIG);
    viewer.onAnimationUpdate = (progress, isPlaying) => {
      const pct = Math.round(progress * 100);
      if (animSlider && document.activeElement !== animSlider) animSlider.value = pct;
      if (animValLabel) animValLabel.textContent = pct + '%';
      syncAnimButton(isPlaying);
    };
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
      if (animPanel) {
        animPanel.hidden = !detail.hasAnimations;
        animSlider.value = 100;
        animValLabel.textContent = '100%';
        syncAnimButton(false);
      }
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

function syncAnimButton(isPlaying) {
  if (!btnAnimPlay) return;
  if (isPlaying) {
    animIcon.textContent = '⏸';
    animPlayText.textContent = 'Detener';
  } else {
    animIcon.textContent = '▶';
    animPlayText.textContent = (Number(animSlider.value) >= 99) ? 'Desplegar' : 'Plegar';
  }
}

animSlider?.addEventListener('input', () => {
  if (!viewer) return;
  const val = Number(animSlider.value);
  if (animValLabel) animValLabel.textContent = val + '%';
  viewer.setAnimationProgress(val / 100);
  syncAnimButton(false);
});

btnAnimPlay?.addEventListener('click', () => {
  if (!viewer) return;
  if (!viewer.isPlayingAnimation && Number(animSlider.value) >= 99) {
    viewer.setAnimationProgress(0);
  }
  viewer.toggleAnimation();
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

/** Controles de cada solapa (slider y número), por identificador. */
const flapControls = new Map();

/** Aplica una apertura y deja los dos controles de esa solapa a la par. */
function applyFlapAperture(id, value) {
  const applied = viewer.setFlapAperture(id, value);
  if (applied === undefined) return;

  const controls = flapControls.get(id);
  if (!controls) return;
  controls.range.value = String(applied);
  controls.number.value = String(applied);
}

/** Copia el estado actual del visor a los controles. */
function syncFlapsUI() {
  for (const flap of viewer.flaps ?? []) {
    const controls = flapControls.get(flap.id);
    if (!controls) continue;
    const value = String(Math.round(flap.aperture ?? 0));
    controls.range.value = value;
    controls.number.value = value;
  }
}

/** Crea (o rehace) los controles de las solapas del modelo cargado. */
function buildFlapsUI() {
  if (!flapsList || !flapsPanel) return;

  flapsList.textContent = '';
  flapControls.clear();

  const flaps = viewer.flaps ?? [];
  flapsPanel.hidden = flaps.length === 0;

  for (const flap of flaps) {
    const rangeId = `flap-${flap.id}`;

    const item = document.createElement('li');
    item.className = 'flap';

    const label = document.createElement('label');
    label.className = 'flap__name';
    label.htmlFor = rangeId;
    label.textContent = flap.label || flap.id;

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'flap__range';
    range.id = rangeId;
    range.min = '0';
    range.max = '100';
    range.step = '1';

    const value = document.createElement('span');
    value.className = 'flap__value';

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'flap__num';
    number.id = `${rangeId}-value`;
    number.min = '0';
    number.max = '100';
    number.step = '1';
    number.inputMode = 'numeric';
    number.setAttribute('aria-label', `${flap.label || flap.id}: apertura en porcentaje`);

    const unit = document.createElement('span');
    unit.className = 'flap__unit';
    unit.textContent = '%';
    unit.setAttribute('aria-hidden', 'true');

    value.append(number, unit);
    item.append(label, range, value);
    flapsList.append(item);

    flapControls.set(flap.id, { range, number });

    // El slider mueve la solapa mientras se arrastra.
    range.addEventListener('input', () => applyFlapAperture(flap.id, range.value));

    // El número se aplica al escribirlo; mientras el campo está vacío o a
    // medias no se toca nada, para no mover la solapa antes de tiempo.
    const applyFromNumber = () => {
      const raw = number.value.trim();
      if (raw === '' || Number.isNaN(Number(raw))) return;
      applyFlapAperture(flap.id, raw);
    };
    number.addEventListener('input', applyFromNumber);
    number.addEventListener('change', applyFromNumber);
  }

  syncFlapsUI();
}

btnFlapsReset?.addEventListener('click', () => {
  viewer.resetFlaps();
  syncFlapsUI();
});


