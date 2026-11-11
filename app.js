/**
 * ARTIOS 3D ENGINE — Aplicación Principal (Renderizador 3D Three.js + Visor CAD 2D)
 * Motor gráfico paramétrico de packaging de cartón a escala 1:1 en milímetros (mm).
 * Incluye:
 *  - Subdivisión de malla con Hendido Chafado / Hundido por ambas caras en las líneas rojas
 *  - Ejes de rotación en el centro exacto del espesor (z = 0)
 *  - Exportación nativa .GLB para Blender (escala 1:1 en mm) con jerarquía de pivotes y Animación de plegado
 */

(function () {
  'use strict';

  const kraftBoard = DielineEngine.ARTIOS_BOARDS.find(b => b.id === 'M-125B');
  const MATERIAL_FINISHES = [
    {...kraftBoard, id: 'WHITE-WHITE', name: 'Blanco por fuera y por dentro', surfaceTex: 'WhiteBoard3.JPG', innerTex: 'WhiteBoard3.JPG', colorHex: 0xffffff, innerColorHex: 0xffffff},
    {...kraftBoard, id: 'W-175B', name: 'Blanco por fuera y marrón por dentro', surfaceTex: 'WhiteBoard3.JPG', colorHex: 0xffffff, innerColorHex: 0xcfa778},
    {...kraftBoard, name: 'Marrón por fuera y por dentro', innerColorHex: 0xcfa778}
  ];

  function resolveMaterialFinish(id) {
    const finish = MATERIAL_FINISHES.find(b => b.id === id);
    if (finish) return finish;
    const old = DielineEngine.ARTIOS_BOARDS.find(b => b.id === id);
    const isWhite = color => {
      const hex = parseInt((color || '#000000').slice(1), 16);
      return ((hex >> 16) + ((hex >> 8) & 255) + (hex & 255)) / 3 > 185;
    };
    return old && isWhite(old.outerColor)
      ? MATERIAL_FINISHES[isWhite(old.innerColor) ? 0 : 1]
      : MATERIAL_FINISHES[2];
  }

  // ============================================================================
  // ESTADO GLOBAL DE LA APLICACIÓN
  // ============================================================================
  const state = {
    svgText: '',
    fileName: 'Rollover hinged lid mailer box dieline',
    baseDieline: null,      // Modelo base sin deformar para el redimensionador paramétrico 60 FPS
    dieline: null,          // Resultado actual (escalado o FEFCO) en 2D y 3D
    activeFefcoEntry: null, // Si el modelo cargado pertenece al catálogo de 2,148 modelos
    paramL: 315,            // Largo paramétrico actual (mm)
    paramW: 202,            // Ancho paramétrico actual (mm)
    paramH: 62,             // Alto paramétrico actual (mm)
    unit: 'mm',             // 'mm' | 'in'
    solverAvailable: false,
    solverPending: false,
    activePart: 'standard', // 'standard' | 'thumb_notch' | 'tab_lock' | 'handle' | 'tear_strip'
    partParams: {},
    partHoverFaceId: null,  // Para resaltar la solapa en 2D al pasar el cursor sobre la tarjeta
    activeTab: 'basic',     // 'dielines' | 'basic' | 'details' | 'parts' | 'info' | 'more'
    selectedExportFormat: 'svg', // 'ai' | 'pdf' | 'dxf' | 'svg' | 'glb' | 'png'
    toolMode: 'select',     // 'select' | 'pan'
    showBleed: false,        // Línea verde de sangrado
    bleedMm: 0,             // Sangrado en mm
    showDimensions: true,   // Cotas 2D
    dimensionDisplayMode: 'main', // 'none' | 'main' | 'all' (3 estados solicitados)
    showAreaLabels: true,   // Mostrar / ocultar nombres de las áreas
    pickingDimensionArea: null, // 'L' | 'W' | 'H' cuando se pulsa el icono de la diana
    symmetryLinks: {},
    openParamsValues: {},   // Valores de Details
    fefcoFilter: 'ALL',
    catalogCategory: 'FAVORITES',
    selectedBoardFilter: 'C1',
    fefcoSearch: '',
    boardId: 'M-125B',      // Cartón seleccionado de la base de datos ArtiosCAD
    caliper: 1.5,           // C1 confirmado por el usuario
    boardCode: 'C1',
    canAddToLibrary: false,
    insideLoss: 1.5,        // Pérdida interior de plegado (mm)
    outsideGain: 1.5,       // Ganancia exterior de plegado (mm)
    flute: 'B',
    // Parámetros del Hendido Chafado (Crushed Crease Channel en líneas rojas por ambas caras)
    crushDepthRatio: 0.72,  // 72% de compresión del espesor en la línea roja (ambas caras se hunden hacia z=0)
    creaseWidthFactor: 1.25,// Anchura de la zona chafada a cada lado = 1.25 * espesor (mm)
    masterFold: 0.75,       // Progreso global de plegado (0.0 a 1.0)
    isPlaying: false,
    playDirection: 1,
    playSpeed: 0.38,        // Velocidad de animación
    standUpBox: true,       // Posicionar caja de pie sobre la base en 3D
    showWireframe: false,
    showCreaseLines3D: false,// Desactivado por defecto para apreciar limpio el surco chafado 3D
    showCutLines3D: false,
    showDimensions3D: false,
    showGrid: true,
    selectedFaceId: null,
    hoveredFaceId: null,
    viewMode: 'split',      // 'split' | '3d' | '2d'
    customArtworkTex: null,
    customArtworkFlipY: false,
    artwork: null,
    artworkEditing: false,
    hingeAngles: {},
    selectedHinges: new Set(),
    hingeSelectionMode: false,
    foldSequenceMode: 'phased',
    view2D: {
      zoom: 1,
      panX: 0,
      panY: 0,
      isDragging: false,
      lastX: 0,
      lastY: 0,
      showLabels: true,
      showFaces: true,
      showCota: true
    }
  };

  // Referencias Three.js
  let scene, camera, renderer, controls;
  let rootBoxGroup = null;
  let dielineRootGroup = null;
  let bboxHelperGroup = null;
  let gridHelper = null;
  let shadowPlane = null;
  let raycaster = null;
  let mouse = null;

  // Mapas de objetos 3D
  const pivotMap = new Map();    // hingeId -> { pivotGroup, axis3d, basePos, hinge, childFace, parentFace }
  const faceMeshMap = new Map(); // faceId -> { mesh, cutOutline, creaseLines, face }
  const textureCache = new Map();

  // Materiales compartidos
  let matOuterFace = null;
  let matInnerFace = null;
  let matCutEdge = null;
  let matCreaseCore = null;

  // Historial global de acciones (Ctrl + Z y Ctrl + Alt + Z)
  let vectorHistory = [];
  let vectorRedo = [];
  const vectorClone = value => JSON.parse(JSON.stringify(value));

  function recordUndoState() {
    if (!state.dieline) return;
    vectorHistory.push(vectorClone(state.dieline));
    if (vectorHistory.length > 50) vectorHistory.shift();
    vectorRedo = [];
    if (typeof vectorRefreshControls === 'function') vectorRefreshControls();
  }

  function handleUndo() {
    if (!vectorHistory.length) {
      if (typeof vectorMessage === 'function') vectorMessage('No hay más cambios para deshacer.');
      return;
    }
    vectorRedo.push(vectorClone(state.dieline));
    vectorDraft = null;
    vectorSelection = null;
    const prev = vectorHistory.pop();
    displayVectorModel(prev);
    if (typeof vectorMessage === 'function') vectorMessage('Cambio deshecho (Ctrl + Z).');
  }

  function handleRedo() {
    if (!vectorRedo.length) {
      if (typeof vectorMessage === 'function') vectorMessage('No hay más cambios para rehacer.');
      return;
    }
    vectorHistory.push(vectorClone(state.dieline));
    vectorDraft = null;
    vectorSelection = null;
    const next = vectorRedo.pop();
    displayVectorModel(next);
    if (typeof vectorMessage === 'function') vectorMessage('Cambio rehecho (Ctrl + Alt + Z).');
  }

  function distPointToSegment(p, a, b) {
    if (!p || !a || !b) return Infinity;
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  window.addEventListener('keydown', (e) => {
    const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (isInput) return;
      e.preventDefault();
      if (e.altKey || e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      if (isInput) return;
      e.preventDefault();
      handleRedo();
    }
  });

  // ============================================================================
  // INICIALIZACIÓN
  // ============================================================================
  window.addEventListener('DOMContentLoaded', () => {
    initUIControls();
    initThreeJS();
    init2DCanvasInteractions();
    userLibraryReady = loadUserLibrary();

    // Cargar por defecto el modelo 150010 de los pantallazos del usuario
    const pacIndex = window.PACDORA_CATALOG_INDEX;
    const allModels = (pacIndex && Array.isArray(pacIndex.models))
      ? pacIndex.models
      : (window.FEFCO_CATALOG || []);

    const target150010 = allModels.find(m => Number(m.num) === 150010 || Number(m.id) === 1);
    if (target150010) {
      loadFefcoModel(target150010, true);
    } else if (window.FEFCO_CATALOG && window.FEFCO_CATALOG.length > 0) {
      loadFefcoModel(window.FEFCO_CATALOG[0], true);
    } else if (window.ARTIOS_DEFAULT_SVG) {
      loadSVGString(window.ARTIOS_DEFAULT_SVG, 'b1 caja americana.svg', true);
    }

    requestAnimationFrame(animateLoop);
  });

  // ============================================================================
  // CONFIGURACIÓN DE THREE.JS (ESCENA, ILUMINACIÓN PBR, CÁMARA Y SOMBRAS)
  // ============================================================================
  function initThreeJS() {
    const container = document.getElementById('viewport-3d');
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f3f6);

    camera = new THREE.PerspectiveCamera(38, width / height, 1, 15000);
    camera.position.set(360, 290, 420);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxDistance = 4500;
    controls.minDistance = 10;
    controls.target.set(0, 45, 0);

    // Iluminación de estudio CAD rasante para resaltar los surcos chafados del hendido
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x263040, 0.64);
    hemiLight.position.set(0, 600, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffcf5, 0.88);
    keyLight.position.set(380, 650, 440);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 50;
    keyLight.shadow.camera.far = 2200;
    const d = 550;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbe8ff, 0.44);
    fillLight.position.set(-420, 320, -350);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffeacc, 0.32);
    rimLight.position.set(0, -380, 280);
    scene.add(rimLight);

    gridHelper = new THREE.GridHelper(1000, 50, 0x9faebe, 0xd0d8e0);
    gridHelper.position.y = -0.2;
    scene.add(gridHelper);

    const planeGeo = new THREE.PlaneGeometry(2500, 2500);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.34 });
    shadowPlane = new THREE.Mesh(planeGeo, planeMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    rootBoxGroup = new THREE.Group();
    rootBoxGroup.name = 'ArtiosCAD_Packaging_Root';
    scene.add(rootBoxGroup);

    bboxHelperGroup = new THREE.Group();
    scene.add(bboxHelperGroup);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('pointermove', on3DPointerMove);
    renderer.domElement.addEventListener('pointerdown', on3DPointerDown);

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    const container3D = document.getElementById('viewport-3d');
    if (container3D && renderer && camera) {
      const w = container3D.clientWidth;
      const h = container3D.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        fitCameraToModel(true, true);
      }
    }
    render2FDieline();
  }

  // ============================================================================
  // CARGA DE TEXTURAS EXTRAÍDAS DE ESKO ARTIOSCAD 12.0
  // ============================================================================
  function getArtiosTexture(fileName, repeatX = 1, repeatY = 1) {
    const cacheKey = `${fileName}_${repeatX}_${repeatY}`;
    if (textureCache.has(cacheKey)) {
      return textureCache.get(cacheKey);
    }

    const loader = new THREE.TextureLoader();
    const dataUri = (window.ARTIOS_TEXTURES && window.ARTIOS_TEXTURES[fileName])
      ? window.ARTIOS_TEXTURES[fileName]
      : fileName === 'corrugado.png' ? 'assets/corrugado.png' : `assets/textures/${fileName}`;

    const tex = loader.load(dataUri, () => {
      tex.needsUpdate = true;
      if (state.artwork && state.dieline) { refreshArtworkAtlas(state.dieline); render2FDieline(); }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.encoding = THREE.sRGBEncoding;
    if (renderer) {
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }

    textureCache.set(cacheKey, tex);
    return tex;
  }

  function buildBoardMaterials() {
    if (state.artwork && artworkImage) refreshArtworkAtlas(state.dieline);
    const board = resolveMaterialFinish(state.boardId);

    const surfaceTex = getArtiosTexture(board.surfaceTex, 1, 1);
    const innerTex = getArtiosTexture(board.innerTex || board.surfaceTex, 1, 1);
    const edgeTex = getArtiosTexture('corrugado.png', 1, 1);

    // 1. Material Cara Exterior (con vertexColors activado para sombrear la fibra comprimida en el hendido)
    matOuterFace = new THREE.MeshStandardMaterial({
      name: 'Carton_Cara_Exterior',
      map: state.customArtworkTex ? state.customArtworkTex : surfaceTex,
      color: state.customArtworkTex ? 0xffffff : board.colorHex,
      vertexColors: true,
      roughness: state.customArtworkTex ? 0.55 : 0.80,
      metalness: 0.03,
      wireframe: state.showWireframe
    });

    // 2. Material Cara Interior (con vertexColors activado para sombrear el canal chafado interior)
    matInnerFace = new THREE.MeshStandardMaterial({
      name: 'Carton_Cara_Interior',
      map: innerTex,
      color: board.innerColorHex,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.02,
      wireframe: state.showWireframe
    });

    // 3. Material del Canto Cortado (Muestra las ondas/flautas reales del cartón corrugado)
    matCutEdge = new THREE.MeshStandardMaterial({
      name: 'Carton_Canto_Corrugado',
      map: edgeTex,
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.02,
      wireframe: state.showWireframe
    });

    // 4. Material del Núcleo Comprimido de la Bisagra en z = 0
    const baseCol = new THREE.Color(board.colorHex).multiplyScalar(0.76);
    matCreaseCore = new THREE.MeshStandardMaterial({
      name: 'Carton_Hendido_Nucleo',
      map: surfaceTex,
      color: baseCol,
      roughness: 0.88,
      metalness: 0.01,
      wireframe: state.showWireframe
    });

    return [matOuterFace, matInnerFace, matCutEdge];
  }

  // ============================================================================
  // PROCESAMIENTO DEL ARCHIVO SVG, MODELOS FEFCO Y REDIMENSIONAMIENTO PARAMÉTRICO
  // ============================================================================
  let livePacdoraTimer = null;
  let resizeRevision = 0;
  let modelRevision = 0;
  let catalogLimit = 60;

  function syncParametricInputsUI(model) {
    if (!model || !model.boxDimensionsMm) return;
    state.paramL = +(model.boxDimensionsMm.length || 200).toFixed(1);
    state.paramW = +(model.boxDimensionsMm.width || 150).toFixed(1);
    state.paramH = +(model.boxDimensionsMm.depth || 100).toFixed(1);

    const setPair = (numId, sliderId, val) => {
      const nEl = document.getElementById(numId);
      const sEl = document.getElementById(sliderId);
      if (nEl && document.activeElement !== nEl) nEl.value = val;
      if (sEl) sEl.value = Math.min(parseFloat(sEl.max) || 1200, val);
    };
    setPair('param-l-num', 'param-l-slider', state.paramL);
    setPair('param-w-num', 'param-w-slider', state.paramW);
    setPair('param-h-num', 'param-h-slider', state.paramH);
    for (const [id, value] of [['input-length', state.paramL], ['input-width', state.paramW], ['input-height', state.paramH]]) {
      const input = document.getElementById(id);
      if (input) input.value = value;
    }
  }

  function applyNewDielineModel(model, displayTitle, animateIntro = false, allowLibraryAdd = false) {
    model = DielineEngine.enforceFlapLengthLimit(VectorCAD.normalize(model));
    vectorSelection = null; vectorDraft=null; vectorRedo=[];
    vectorHistory = [];
    clearTimeout(livePacdoraTimer);
    resizeRevision++;
    state.fileName = displayTitle;
    state.canAddToLibrary = false;
    document.getElementById('btn-add-library')?.classList.add('hidden');
    clearArtwork();
    state.baseDieline = model;
    state.dieline = model;
    state.openParamsValues = {};
    state.symmetryLinks = {};
    state.activePart = 'standard';
    state.partParams = {};
    document.getElementById('part-options-dialog')?.close();
    document.querySelectorAll('.part-card').forEach(card => card.classList.toggle('active', card.dataset.partKey === 'standard'));
    state.solverAvailable = true;
    state.selectedFaceId = model.rootFaceId;
    document.getElementById('btn-set-base')?.classList.toggle('hidden',model.isPacdoraModel);

    state.hingeAngles = {};
    for (const h of model.hinges) {
      state.hingeAngles[h.id] = 0;
    }

    syncParametricInputsUI(model);
    updateDielineInfoUI(model);
    buildHingeSlidersUI(model);
    rebuild3DMesh();
    reset2DView();

    if (animateIntro) {
      state.masterFold = 0;
      setMasterFold(0.75);
      fitCameraToModel(true);
    } else {
      setMasterFold(state.masterFold || 0.75);
      fitCameraToModel(false);
    }
    if(state.activeFefcoEntry?.userModel)state.parametricDieline=model;
    else applyParametricResizeRealTime(state.paramL, state.paramW, state.paramH);
    if (state.activeTab === 'details') renderDetailsTabUI();
  }

  function loadSVGString(svgString, fileName, animateIntro = false) {
    try {
      modelRevision++;
      state.svgText = svgString;
      state.activeFefcoEntry = null;
      const quickSel = document.getElementById('fefco-quick-select');
      if (quickSel) quickSel.value = '__SVG__';

      const model = DielineEngine.buildDielineModel(svgString);
      state.boardCode='C1';state.caliper=1.5;
      applyNewDielineModel(model, fileName || 'troquel.svg', animateIntro, true);
    } catch (err) {
      console.error('Error procesando el archivo SVG:', err);
      alert('Error al procesar el archivo SVG: ' + err.message);
    }
  }

  const shardLoadPromises = new Map();

  function loadPacdoraShard(shardKey) {
    if (!shardKey) return Promise.resolve([]);
    window.PACDORA_CATALOG_SHARDS = window.PACDORA_CATALOG_SHARDS || {};
    if (window.PACDORA_CATALOG_SHARDS[shardKey]) {
      return Promise.resolve(window.PACDORA_CATALOG_SHARDS[shardKey]);
    }
    if (shardLoadPromises.has(shardKey)) {
      return shardLoadPromises.get(shardKey);
    }

    const indexObj = window.PACDORA_CATALOG_INDEX;
    const scriptUrl = (indexObj && indexObj.shards && indexObj.shards[shardKey])
      ? indexObj.shards[shardKey]
      : `assets/pacdora-catalog/${shardKey}.js`;

    const p = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = scriptUrl;
      s.async = true;
      s.onload = () => {
        resolve(window.PACDORA_CATALOG_SHARDS[shardKey] || []);
      };
      s.onerror = () => {
        console.warn('No se pudo cargar el módulo de categoría:', scriptUrl);
        resolve([]);
      };
      document.head.appendChild(s);
    });

    shardLoadPromises.set(shardKey, p);
    return p;
  }

  async function resolveFullPacdoraModel(metaEntry) {
    if (!metaEntry) return null;
    if (metaEntry.knifeData && metaEntry.knifeData.faces) return metaEntry;

    // Si pertenece a los 116 modelos FEFCO precargados en memoria
    if (window.FEFCO_CATALOG) {
      const fMatch = window.FEFCO_CATALOG.find(x => Number(x.num) === Number(metaEntry.num));
      if (fMatch && fMatch.knifeData) return fMatch;
    }

    if (metaEntry.shard) {
      const list = await loadPacdoraShard(metaEntry.shard);
      const found = list.find(x => Number(x.num) === Number(metaEntry.num) || Number(x.id) === Number(metaEntry.id));
      if (found && found.knifeData) return found;
    }
    return null;
  }

  async function loadFefcoModel(fefcoEntry, animateIntro = true) {
    if (!fefcoEntry) return;
    const revision = ++modelRevision;
    try {
      if(fefcoEntry.userModel){
        UserLibrary.validate(fefcoEntry);
        state.activeFefcoEntry=fefcoEntry;
        state.boardCode=fefcoEntry.boardCode;
        state.caliper=UserLibrary.boardThicknessMm[fefcoEntry.boardCode]||1.5;
        applyNewDielineModel(JSON.parse(JSON.stringify(fefcoEntry.geometry)),fefcoEntry.name,animateIntro);
        return;
      }
      const fullEntry = await resolveFullPacdoraModel(fefcoEntry);
      if (revision !== modelRevision) return;
      if (!fullEntry || !fullEntry.knifeData) {
        alert('No se encontró la geometría vectorial del modelo #' + fefcoEntry.num);
        return;
      }

      state.activeFefcoEntry = fullEntry;
      state.boardCode='C1';state.caliper=1.5;
      const quickSel = document.getElementById('fefco-quick-select');
      if (quickSel) {
        // Asegurar que la opción exista en el desplegable rápido
        let opt = Array.from(quickSel.options).find(o => o.value === String(fullEntry.num));
        if (!opt) {
          opt = document.createElement('option');
          opt.value = String(fullEntry.num);
          const prefix = fullEntry.fefcoCode ? `${fullEntry.fefcoCode} (#${fullEntry.num})` : `#${fullEntry.num}`;
          opt.textContent = `${prefix} — ${nombreModelo(fullEntry)} (${fullEntry.length}×${fullEntry.width}×${fullEntry.height} mm)`;
          quickSel.appendChild(opt);
        }
        quickSel.value = String(fullEntry.num);
      }

      const model = DielineEngine.buildDielineModelFromPacdora(fullEntry.knifeData, fullEntry);
      const codePrefix = fullEntry.fefcoCode ? `${fullEntry.fefcoCode} (#${fullEntry.num})` : `#${fullEntry.num}`;
      const title = `${codePrefix} · ${nombreModelo(fullEntry)}`;
      applyNewDielineModel(model, title, animateIntro);
    } catch (err) {
      console.error('Error cargando modelo del catálogo:', err);
      alert('Error al construir el modelo: ' + err.message);
    }
  }

  /**
   * Redimensiona en tiempo real el modelo actual (tanto .SVG como los 116 modelos FEFCO)
   * al alterar Largo (L), Ancho (W) o Alto (H) en la vista 2D, actualizando al instante el 2D y el 3D.
   */
  function applyParametricResizeRealTime(newL, newW, newH) {
    if (!state.baseDieline) return;
    if(state.dieline?.vector3DStale){document.getElementById('param-sync-status').textContent='Cierra el contorno antes de cambiar las medidas.';return;}
    state.paramL = Math.max(15, Math.min(2000, Number(newL) || state.paramL));
    state.paramW = Math.max(15, Math.min(2000, Number(newW) || state.paramW));
    state.paramH = Math.max(15, Math.min(2000, Number(newH) || state.paramH));
    const board = resolveMaterialFinish(state.boardId);
    const ratio = state.caliper / (board?.caliper || state.caliper);
    const inside = (board?.insideLoss || 0) * ratio;
    const outside = (board?.outsideGain || 0) * ratio;
    const mfg = [state.paramL, state.paramW, state.paramH];
    let resized = DielineEngine.resizeDielineParametric(state.baseDieline, ...mfg);
    if (!resized) return;
    for (const [key, targetSpan] of Object.entries(state.openParamsValues)) {
      const match = /^band:(\d+):(x|y)$/.exec(key);
      if (!match || !Number.isFinite(Number(targetSpan))) continue;
      const face = resized.faces.find(f => String(f.id) === match[1]);
      if (!face) continue;
      const axis = match[2]; const min = axis === 'x' ? face.bounds.minX : face.bounds.minY;
      const max = axis === 'x' ? face.bounds.maxX : face.bounds.maxY;
      if (max - min <= 1 || Number(targetSpan) <= 1) continue;
      resized = DielineEngine.resizeDielineParametric(resized, ...mfg, {axis, min, max, targetSpan: Number(targetSpan)});
    }
    const dims = values => ({L: +values[0].toFixed(2), W: +values[1].toFixed(2), H: +values[2].toFixed(2)});
    // Offsets are material-based estimates, not the original model's manufacturing rules.
    resized = {...resized, solverDimensions: {mfg: dims(mfg), inner: dims(mfg.map(v => Math.max(0, v - inside))), outer: dims(mfg.map(v => v + outside))}};
    state.parametricDieline = resized;
    state.dieline = state.activePart === 'standard' ? resized : DielineEngine.applyPartVariationToModel(resized, state.activePart, state.partParams[state.activePart]);
    state.solverAvailable = true;
    state.solverPending = false;
    document.getElementById('param-sync-status').textContent = 'Cálculo local · medidas estimadas';
    updateDielineInfoUI(state.dieline);
    rebuild3DMesh();
    setMasterFold(state.masterFold);
  }

  // ============================================================================
  // MOTOR DE SUBDIVISIÓN DE MALLA PARA HENDIDOS CHAFADOS (POR AMBAS CARAS)
  // ============================================================================

  /**
   * Recorta un polígono 2D contra un semiplano definido por un punto `linePt` y vector normal `normal`.
   */
  function clipPolygonHalfPlane(poly, linePt, normal, keepGreaterEqual) {
    if (!poly || poly.length < 3) return [];
    const out = [];
    const eps = 1e-6;
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const dCur = (cur.x - linePt.x) * normal.x + (cur.y - linePt.y) * normal.y;
      const dPrev = (prev.x - linePt.x) * normal.x + (prev.y - linePt.y) * normal.y;
      const curIn = keepGreaterEqual ? dCur >= -eps : dCur <= eps;
      const prevIn = keepGreaterEqual ? dPrev >= -eps : dPrev <= eps;

      if (curIn !== prevIn) {
        const denom = dPrev - dCur;
        const t = Math.abs(denom) > 1e-12 ? dPrev / denom : 0.5;
        out.push({
          x: prev.x + t * (cur.x - prev.x),
          y: prev.y + t * (cur.y - prev.y)
        });
      }
      if (curIn) {
        out.push(cur);
      }
    }
    return out;
  }

  /**
   * Evalúa el factor de aplastamiento / chafado en cualquier punto 2D (x, y) del panel
   * respecto a todas las líneas rojas de doblez conectadas a esta cara.
   * Devuelve:
   *  - scaleZ: factor de espesor en [1 - crushDepth, 1.0] (se aplica a +t/2 y -t/2 para hundir AMBAS caras)
   *  - gradX, gradY: derivadas espaciales para inclinar las normales 3D hacia el surco del hendido
   *  - shade: factor de oscurecimiento suave en el fondo del canal por compresión de fibras
   */
  function evaluateCreaseCrushField(x, y, faceHingeData, creaseW, crushDepth) {
    if (crushDepth <= 0.001 || creaseW <= 0.05 || faceHingeData.length === 0) {
      return { scaleZ: 1.0, gradX: 0, gradY: 0, shade: 1.0 };
    }

    let minScaleZ = 1.0;
    let totalGradX = 0;
    let totalGradY = 0;

    for (let i = 0; i < faceHingeData.length; i++) {
      const hd = faceHingeData[i];
      // Distancia perpendicular hacia el interior del panel desde la línea roja
      const dPerp = (x - hd.p1.x) * hd.nx + (y - hd.p1.y) * hd.ny;
      if (dPerp < -0.25 || dPerp >= creaseW) continue;

      // Verificar proyección longitudinal a lo largo del segmento de la línea roja
      const along = (x - hd.p1.x) * hd.tx + (y - hd.p1.y) * hd.ty;
      if (along < -creaseW || along > hd.len + creaseW) continue;

      const dClamped = Math.max(0, dPerp);
      const s = Math.min(1, dClamped / creaseW); // s = 0 en la línea roja, s = 1 fuera del canal

      // Perfil de chafado de troquel (curva suave con garganta marcada en s=0):
      // s=0 -> scale = 1 - crushDepth; s=1 -> scale = 1.0, derivada 0 en ambos extremos
      const smooth = s * s * (3 - 2 * s);
      const scale = (1.0 - crushDepth) + crushDepth * smooth;

      // Derivada d(scale)/d(dPerp) = crushDepth * 6 * s * (1 - s) / creaseW
      const dScale_dPerp = (crushDepth * 6 * s * (1 - s)) / creaseW;

      if (scale < minScaleZ) {
        minScaleZ = scale;
      }
      totalGradX += dScale_dPerp * hd.nx;
      totalGradY += dScale_dPerp * hd.ny;
    }

    const compression = (1.0 - minScaleZ) / Math.max(0.01, crushDepth);
    // Sombrear sutilmente el fondo del surco chafado (simula oclusión ambiental y fibra prensada)
    const shade = 1.0 - 0.28 * compression;

    return {
      scaleZ: minScaleZ,
      gradX: totalGradX,
      gradY: totalGradY,
      shade
    };
  }

  /**
   * Construye la geometría 3D de un panel subdividiendo su malla en franjas paralelas
   * a cada línea roja de doblez para crear el efecto real de HENDIDO CHAFADO / HUNDIDO
   * por AMBAS caras (interior +Z y exterior -Z), manteniendo el plano medio en z = 0.
   */
  function createCrushedPanelGeometry(face, faceHinges, caliper, globalBounds) {
    const crushDepth = state.crushDepthRatio;
    const creaseW = Math.max(0.8, caliper * state.creaseWidthFactor);

    // Precalcular vectores unitarios (tangente y normal hacia adentro del panel) de cada línea roja
    const faceHingeData = faceHinges.map(h => {
      const dx = h.p2.x - h.p1.x;
      const dy = h.p2.y - h.p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len;
      const ty = dy / len;
      let nx = -ty;
      let ny = tx;
      const toCentX = face.centroid.x - h.p1.x;
      const toCentY = face.centroid.y - h.p1.y;
      if (nx * toCentX + ny * toCentY < 0) {
        nx = -nx;
        ny = -ny;
      }
      return { h, p1: h.p1, p2: h.p2, len, tx, ty, nx, ny };
    });

    // 1. Subdividir el polígono del panel en franjas paralelas a cada línea roja (6 escalones por hendido)
    // Triangulate the actual contour and holes before clipping crease bands.
    // Starting with triangles also handles concave notches without filling them in.
    const contour = face.polygon.map(p => new THREE.Vector2(p.x, p.y));
    const holes = (face.holes || []).map(ring => ring.map(p => new THREE.Vector2(p.x, p.y)));
    const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
    const points = contour.concat(...holes);
    let subPolys = triangles.map(indices => {
      const ring = indices.map(i => ({x: points[i].x, y: points[i].y}));
      const [a,b,c] = ring;
      if ((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) < 0) ring.reverse();
      return ring;
    });
    const stepRatios = [0.14, 0.28, 0.45, 0.64, 0.82, 1.0];

    for (const hd of faceHingeData) {
      for (const ratio of stepRatios) {
        const dist = creaseW * ratio;
        const linePt = { x: hd.p1.x + hd.nx * dist, y: hd.p1.y + hd.ny * dist };
        const nextList = [];
        for (let i = 0; i < subPolys.length; i++) {
          const poly = subPolys[i];
          const pNear = clipPolygonHalfPlane(poly, linePt, { x: hd.nx, y: hd.ny }, false);
          const pFar = clipPolygonHalfPlane(poly, linePt, { x: hd.nx, y: hd.ny }, true);
          if (pNear.length >= 3) nextList.push(pNear);
          if (pFar.length >= 3) nextList.push(pFar);
        }
        subPolys = nextList;
      }
    }

    // Buffers para los 3 grupos de materiales:
    // Grupo 0: Cara Exterior (z < 0)
    // Grupo 1: Cara Interior (z > 0)
    // Grupo 2: Canto Corrugado / Borde Cortado
    const groupData = [
      { pos: [], norm: [], uv: [], col: [] }, // 0: Exterior
      { pos: [], norm: [], uv: [], col: [] }, // 1: Interior
      { pos: [], norm: [], uv: [], col: [] }  // 2: Canto
    ];

    const minX3d = globalBounds.minX;
    const maxX3d = globalBounds.maxX;
    const minY3d = -globalBounds.maxY;
    const maxY3d = -globalBounds.minY;
    const spanX = Math.max(1, maxX3d - minX3d);
    const spanY = Math.max(1, maxY3d - minY3d);
    const grainScaleMM = 130.0;
    const fluteWaveSpanMM = Math.max(18.0, caliper * 7.5);
    const halfT = caliper * 0.5;

    function pushVertex(grpIdx, vx, vy, vz, nx, ny, nz, u, v, shade) {
      const g = groupData[grpIdx];
      g.pos.push(vx, vy, vz);
      g.norm.push(nx, ny, nz);
      g.uv.push(u, v);
      g.col.push(shade, shade, shade);
    }

    function evalPoint3D(pt2d) {
      const x = pt2d.x;
      const y = pt2d.y;
      const x3d = x;
      const y3d = -y;
      const crush = evaluateCreaseCrushField(x, y, faceHingeData, creaseW, crushDepth);

      const zInner = +halfT * crush.scaleZ;
      const zOuter = -halfT * crush.scaleZ;

      // Como x3d = x, y3d = -y:
      // dzInner/dx3d = +halfT * gradX ; dzInner/dy3d = -halfT * gradY
      const dzIdx = halfT * crush.gradX;
      const dzIdy = -halfT * crush.gradY;

      // Normal unitaria de la cara interior (+Z) inclinada hacia el canal chafado
      const lenI = Math.hypot(dzIdx, dzIdy, 1.0);
      const nIx = -dzIdx / lenI;
      const nIy = -dzIdy / lenI;
      const nIz = 1.0 / lenI;

      // Normal unitaria de la cara exterior (-Z) inclinada simétricamente hacia el canal chafado
      const nOx = -dzIdx / lenI;
      const nOy = -dzIdy / lenI;
      const nOz = -1.0 / lenI;

      // UVs Cara Exterior e Interior
      let uOut, vOut;
      if (state.customArtworkTex) {
        uOut = (x3d - minX3d) / spanX;
        vOut = state.customArtworkFlipY ? 1.0 - (y3d - minY3d) / spanY : (y3d - minY3d) / spanY;
      } else {
        uOut = x3d / grainScaleMM;
        vOut = y3d / grainScaleMM;
      }
      const uIn = x3d / grainScaleMM;
      const vIn = y3d / grainScaleMM;

      return {
        x3d, y3d,
        zInner, zOuter,
        nIx, nIy, nIz,
        nOx, nOy, nOz,
        uOut, vOut,
        uIn, vIn,
        shade: crush.shade
      };
    }

    // 2. Generar triángulos de la Cara Exterior (Grupo 0) y Cara Interior (Grupo 1)
    for (let pIdx = 0; pIdx < subPolys.length; pIdx++) {
      const poly = subPolys[pIdx];
      if (poly.length < 3) continue;

      // Pre-evaluar vértices del sub-polígono
      const vList = poly.map(evalPoint3D);

      // Al transformar de 2D SVG (CW, área > 0) a 3D (x3d = x, y3d = -y), el polígono queda en sentido horario (CW) visto desde +Z.
      // Por tanto, para que la orientación de caras (Face Orientation / Front-Face CCW) sea 100% exterior:
      // - Cara Exterior (Grupo 0, normal hacia -Z): orden (v0, v1, v2) -> producto vectorial hacia -Z (visible desde fuera).
      // - Cara Interior (Grupo 1, normal hacia +Z): orden (v0, v2, v1) -> producto vectorial hacia +Z (visible desde dentro).
      const v0 = vList[0];
      for (let i = 1; i < vList.length - 1; i++) {
        const v1 = vList[i];
        const v2 = vList[i + 1];

        // Cara Exterior (Grupo 0, mira hacia -Z, orientación CCW vista desde fuera)
        pushVertex(0, v0.x3d, v0.y3d, v0.zOuter, v0.nOx, v0.nOy, v0.nOz, v0.uOut, v0.vOut, v0.shade);
        pushVertex(0, v1.x3d, v1.y3d, v1.zOuter, v1.nOx, v1.nOy, v1.nOz, v1.uOut, v1.vOut, v1.shade);
        pushVertex(0, v2.x3d, v2.y3d, v2.zOuter, v2.nOx, v2.nOy, v2.nOz, v2.uOut, v2.vOut, v2.shade);

        // Cara Interior (Grupo 1, mira hacia +Z, orientación CCW vista desde dentro)
        pushVertex(1, v0.x3d, v0.y3d, v0.zInner, v0.nIx, v0.nIy, v0.nIz, v0.uIn, v0.vIn, v0.shade);
        pushVertex(1, v2.x3d, v2.y3d, v2.zInner, v2.nIx, v2.nIy, v2.nIz, v2.uIn, v2.vIn, v2.shade);
        pushVertex(1, v1.x3d, v1.y3d, v1.zInner, v1.nIx, v1.nIy, v1.nIz, v1.uIn, v1.vIn, v1.shade);
      }
    }

    // 3. Generar el Canto Perimetral (Grupo 2: Flauta Corrugada en bordes azules y cierre biselado en líneas rojas)
    // Subdividimos los segmentos del perímetro cuando están cerca de un hendido para que el canto acompañe la curva chafada
    for (const [ringIndex, sourceRing] of [face.polygon, ...(face.holes || [])].entries()) {
    const signedArea = sourceRing.reduce((sum,p,i) => {const q=sourceRing[(i+1)%sourceRing.length]; return sum+p.x*q.y-q.x*p.y;},0);
    const ring = (signedArea > 0) === (ringIndex === 0) ? sourceRing : sourceRing.slice().reverse();
    let perimeterRunMM = 0;

    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1e-4) continue;

      // Comprobar si este tramo del perímetro está cerca de algún hendido para subdividirlo finamente
      let minDistToHinge = Infinity;
      for (const hd of faceHingeData) {
        const dA = Math.abs((a.x - hd.p1.x) * hd.nx + (a.y - hd.p1.y) * hd.ny);
        const dB = Math.abs((b.x - hd.p1.x) * hd.nx + (b.y - hd.p1.y) * hd.ny);
        minDistToHinge = Math.min(minDistToHinge, dA, dB);
      }

      const numSub = minDistToHinge <= creaseW * 1.2
        ? Math.max(1, Math.min(18, Math.ceil(segLen / (creaseW * 0.16))))
        : 1;

      // Normal 3D unitaria apuntando hacia AFUERA del perímetro en el plano XY
      // (Dado que el anillo en 3D (x, -y) es CW, el exterior está a la izquierda: (-dy3d, +dx3d))
      const dx3d = b.x - a.x;
      const dy3d = (-b.y) - (-a.y);
      const len3d = Math.hypot(dx3d, dy3d) || 1;
      const enX = -dy3d / len3d;
      const enY = dx3d / len3d;

      for (let k = 0; k < numSub; k++) {
        const t0 = k / numSub;
        const t1 = (k + 1) / numSub;
        const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
        const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };

        const e0 = evalPoint3D(p0);
        const e1 = evalPoint3D(p1);

        const u0 = (perimeterRunMM + segLen * t0) / fluteWaveSpanMM;
        const u1 = (perimeterRunMM + segLen * t1) / fluteWaveSpanMM;
        const vBot = 0.06;
        const vTop = 0.94;

        // Dos triángulos con orientación CCW vista desde fuera del canto (normal = enX, enY, 0)
        pushVertex(2, e0.x3d, e0.y3d, e0.zOuter, enX, enY, 0, u0, vBot, e0.shade);
        pushVertex(2, e0.x3d, e0.y3d, e0.zInner, enX, enY, 0, u0, vTop, e0.shade);
        pushVertex(2, e1.x3d, e1.y3d, e1.zInner, enX, enY, 0, u1, vTop, e1.shade);

        pushVertex(2, e0.x3d, e0.y3d, e0.zOuter, enX, enY, 0, u0, vBot, e0.shade);
        pushVertex(2, e1.x3d, e1.y3d, e1.zInner, enX, enY, 0, u1, vTop, e1.shade);
        pushVertex(2, e1.x3d, e1.y3d, e1.zOuter, enX, enY, 0, u1, vBot, e1.shade);
      }

      perimeterRunMM += segLen;
    }
    }

    // 4. Ensamblar el THREE.BufferGeometry final con sus 3 grupos de materiales
    const allPos = [];
    const allNorm = [];
    const allUv = [];
    const allCol = [];
    const geo = new THREE.BufferGeometry();

    let vertexCursor = 0;
    for (let gIdx = 0; gIdx < 3; gIdx++) {
      const g = groupData[gIdx];
      const count = g.pos.length / 3;
      if (count > 0) {
        for (let i = 0; i < g.pos.length; i++) {
          allPos.push(g.pos[i]);
          allNorm.push(g.norm[i]);
          allCol.push(g.col[i]);
        }
        for (let i = 0; i < g.uv.length; i++) {
          allUv.push(g.uv[i]);
        }
        geo.addGroup(vertexCursor, count, gIdx);
        vertexCursor += count;
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNorm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(allUv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(allCol, 3));
    // GLTFExporter slices material groups through the index accessor. Without
    // indices this bundled version exports the whole mesh once per material.
    geo.setIndex(Array.from({length: vertexCursor}, (_, i) => i));

    return geo;
  }

  /**
   * Construye toda la jerarquía cinemática 3D del troquel:
   * - Cada panel tiene sus hendidos chafados por ambas caras.
   * - Cada eje de rotación (pivotGroup) está exactamente en z = 0 (el centro del espesor del cartón).
   */
  function rebuild3DMesh() {
    if (!state.dieline || !rootBoxGroup) return;

    while (rootBoxGroup.children.length > 0) {
      const child = rootBoxGroup.children[0];
      rootBoxGroup.remove(child);
      const materials = new Set();
      child.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) if (material) materials.add(material);
      });
      for (const material of materials) material.dispose();
    }
    pivotMap.clear();
    faceMeshMap.clear();

    const model = state.dieline;
    const caliper = state.caliper;
    const materials = buildBoardMaterials();

    dielineRootGroup = new THREE.Group();
    dielineRootGroup.name = 'Troquel_Raiz_1_1_mm';
    rootBoxGroup.add(dielineRootGroup);

    const faceById = new Map();
    for (const f of model.faces) faceById.set(f.id, f);

    const childrenHingesByFace = new Map();
    const allHingesByFace = new Map();
    for (const f of model.faces) {
      childrenHingesByFace.set(f.id, []);
      allHingesByFace.set(f.id, []);
    }
    for (const h of model.hinges) {
      if (childrenHingesByFace.has(h.parentFaceId)) {
        childrenHingesByFace.get(h.parentFaceId).push(h);
      }
      if (allHingesByFace.has(h.parentFaceId)) {
        allHingesByFace.get(h.parentFaceId).push(h);
      }
      if (allHingesByFace.has(h.childFaceId)) {
        allHingesByFace.get(h.childFaceId).push(h);
      }
    }

    const cutLineMat = new THREE.LineBasicMaterial({
      color: 0x009ee3,
      transparent: true,
      opacity: 0.82
    });
    const creaseLineMat = new THREE.LineBasicMaterial({
      color: 0xe5007d,
      transparent: true,
      opacity: 0.90
    });

    // Radio del núcleo central comprimido en la línea roja (en z = 0)
    const pinchedThickness = caliper * Math.max(0.15, 1.0 - state.crushDepthRatio);
    const coreRadius = pinchedThickness * 0.48;

    const builtFaces = new Set();
    function buildFaceNode(faceId, parentContainer, originOffset3D) {
      const face = faceById.get(faceId);
      if (!face || builtFaces.has(faceId)) return;
      builtFaces.add(faceId);

      const safeFaceName = (face.label || `Panel_${face.id}`).replace(/[^a-zA-Z0-9_]/g, '_');
      const faceHolder = new THREE.Group();
      faceHolder.name = `FaceHolder_${face.id}_${safeFaceName}`;
      parentContainer.add(faceHolder);

      // Generar la malla 3D con los canales de hendido chafados por ambas caras
      const faceHinges = allHingesByFace.get(faceId) || [];
      const geo = createCrushedPanelGeometry(face, faceHinges, caliper, model.bounds);
      // Trasladar respecto al pivote padre (que está en z = 0, centro exacto del espesor)
      geo.translate(-originOffset3D.x, -originOffset3D.y, -originOffset3D.z);

      const mesh = new THREE.Mesh(geo, materials);
      mesh.name = `Mesh_${face.id}_${safeFaceName}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { faceId: face.id, face };
      faceHolder.add(mesh);

      // Contorno azul técnico de corte (no se incluye al exportar a GLB para que Blender reciba solo la geometría física limpia)
      const loopPtsOuter = [];
      const loopPtsInner = [];
      for (let i = 0; i <= face.polygon.length; i++) {
        const pt = face.polygon[i % face.polygon.length];
        const lx = pt.x - originOffset3D.x;
        const ly = -pt.y - originOffset3D.y;
        const crush = evaluateCreaseCrushField(
          pt.x,
          pt.y,
          faceHinges.map(h => {
            const dx = h.p2.x - h.p1.x, dy = h.p2.y - h.p1.y, len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len, ny = dx / len;
            if (nx * (face.centroid.x - h.p1.x) + ny * (face.centroid.y - h.p1.y) < 0) { nx = -nx; ny = -ny; }
            return { p1: h.p1, p2: h.p2, len, tx: dx / len, ty: dy / len, nx, ny };
          }),
          Math.max(0.8, caliper * state.creaseWidthFactor),
          state.crushDepthRatio
        );
        const zOff = (caliper * 0.5) * crush.scaleZ + 0.06;
        loopPtsOuter.push(new THREE.Vector3(lx, ly, -zOff));
        loopPtsInner.push(new THREE.Vector3(lx, ly, +zOff));
      }
      const cutOutline = new THREE.Group();
      cutOutline.name = `CAD_Helper_Cut_${face.id}`;
      cutOutline.userData.isCADHelper = true;
      cutOutline.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(loopPtsOuter), cutLineMat));
      cutOutline.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(loopPtsInner), cutLineMat));
      cutOutline.visible = state.showCutLines3D;
      faceHolder.add(cutOutline);

      const childHinges = childrenHingesByFace.get(faceId) || [];
      const creaseLinesGroup = new THREE.Group();
      creaseLinesGroup.name = `CAD_Helper_Crease_${face.id}`;
      creaseLinesGroup.userData.isCADHelper = true;
      creaseLinesGroup.visible = state.showCreaseLines3D;
      faceHolder.add(creaseLinesGroup);

      for (const hinge of childHinges) {
        // Eje de la bisagra exactamente en z = 0 (el centro geométrico del espesor del cartón)
        const p1_3d = new THREE.Vector3(hinge.p1.x, -hinge.p1.y, 0);
        const p2_3d = new THREE.Vector3(hinge.p2.x, -hinge.p2.y, 0);

        const cPts = [
          new THREE.Vector3(p1_3d.x - originOffset3D.x, p1_3d.y - originOffset3D.y, -coreRadius - 0.1),
          new THREE.Vector3(p2_3d.x - originOffset3D.x, p2_3d.y - originOffset3D.y, -coreRadius - 0.1),
          new THREE.Vector3(p1_3d.x - originOffset3D.x, p1_3d.y - originOffset3D.y, +coreRadius + 0.1),
          new THREE.Vector3(p2_3d.x - originOffset3D.x, p2_3d.y - originOffset3D.y, +coreRadius + 0.1)
        ];
        creaseLinesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cPts), creaseLineMat));

        const segVec = new THREE.Vector3().subVectors(p2_3d, p1_3d);
        const segLen = segVec.length();
        const axis3d = segVec.clone().normalize();

        // Cilindro de fibra comprimida exactamente en el eje central z = 0 del hendido chafado
        if (segLen > 1 && coreRadius > 0.08) {
          const knuckleGeo = new THREE.CylinderGeometry(coreRadius, coreRadius, segLen, 16, 1, false);
          const knuckleMesh = new THREE.Mesh(knuckleGeo, matCreaseCore);
          knuckleMesh.name = `Hendido_Nucleo_${hinge.id}`;
          knuckleMesh.castShadow = true;
          knuckleMesh.receiveShadow = true;

          const midPt = new THREE.Vector3().addVectors(p1_3d, p2_3d).multiplyScalar(0.5).sub(originOffset3D);
          knuckleMesh.position.copy(midPt);
          knuckleMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis3d);
          faceHolder.add(knuckleMesh);
        }

        // Grupo pivote anclado en p1_3d con z = 0 (centro exacto del espesor)
        const pivotGroup = new THREE.Group();
        pivotGroup.name = `Pivot_${hinge.id}`;
        pivotGroup.position.set(
          p1_3d.x - originOffset3D.x,
          p1_3d.y - originOffset3D.y,
          0
        );
        faceHolder.add(pivotGroup);

        const childFace = faceById.get(hinge.childFaceId);

        pivotMap.set(hinge.id, {
          pivotGroup,
          axis3d,
          basePos: new THREE.Vector3(
            p1_3d.x - originOffset3D.x,
            p1_3d.y - originOffset3D.y,
            0
          ),
          hinge,
          childFace,
          parentFace: face
        });

        buildFaceNode(hinge.childFaceId, pivotGroup, p1_3d);
      }

      faceMeshMap.set(face.id, {
        mesh,
        cutOutline,
        creaseLines: creaseLinesGroup,
        face
      });
    }

    const rootFace = faceById.get(model.rootFaceId);
    const rootOrigin3D = new THREE.Vector3(
      rootFace ? rootFace.centroid.x : 0,
      rootFace ? -rootFace.centroid.y : 0,
      0
    );

    buildFaceNode(model.rootFaceId, dielineRootGroup, rootOrigin3D);
    for (const face of model.faces) if (!builtFaces.has(face.id)) buildFaceNode(face.id, dielineRootGroup, rootOrigin3D);

    applyFoldAngles();
    updateSelectionHighlight();
  }

  /**
   * Calcula el ángulo objetivo (en grados) de una bisagra para un valor maestro t en [0, 1].
   * La pestaña de pegado (GLUE_FLAP) rota ligeramente más de 90° alrededor de su eje central (z = 0)
   * para alojarse detrás de la Cara Cuerpo 4 usando rotación pura sobre el centro del espesor.
   */
  function computeHingeAngleAtProgress(hinge, childFace, progressT, sequenceMode) {
    // Si el modelo proviene del catálogo FEFCO / Pacdora y tiene pasos de animación exactos (animSteps),
    // reproducir su secuencia cinemática multicapa (incluyendo pliegues de 120° -> -30° en fondos automáticos)
    if (sequenceMode === 'phased' && hinge.animSteps && hinge.animSteps.length > 0) {
      let angleSum = 0;
      for (const st of hinge.animSteps) {
        if (progressT <= st.start) continue;
        if (progressT >= st.end) {
          angleSum += st.deltaDeg;
        } else {
          const raw = (progressT - st.start) / Math.max(1e-5, st.end - st.start);
          const clamped = Math.max(0, Math.min(1, raw));
          const smooth = clamped * clamped * (3 - 2 * clamped);
          angleSum += st.deltaDeg * smooth;
        }
      }
      return +angleSum.toFixed(2);
    }

    let maxDeg = hinge.defaultAngle !== undefined ? hinge.defaultAngle : 90;
    if (!state.dieline?.isPacdoraModel && childFace) {
      if (childFace.role === 'GLUE_FLAP') {
        const extraDeg = THREE.MathUtils.radToDeg(Math.atan2(state.caliper * 1.02, Math.max(8, childFace.bounds.width * 0.55)));
        maxDeg = 90 + extraDeg;
      } else if (childFace.role === 'FLAP_INNER_TOP' || childFace.role === 'FLAP_INNER_BOTTOM') {
        const clearance = Math.max(0.25, state.caliper - 1.75);
        const extraFlapDeg = THREE.MathUtils.radToDeg(Math.atan2(clearance, Math.max(20, childFace.bounds.height * 0.65)));
        maxDeg = 90 + extraFlapDeg;
      }
    }

    let localT = progressT;
    if (sequenceMode === 'phased' && childFace) {
      let start = 0.0, end = 1.0;
      switch (childFace.role) {
        case 'BODY':
        case 'GLUE_FLAP':
          start = 0.0; end = 0.36;
          break;
        case 'FLAP_INNER_BOTTOM':
          start = 0.30; end = 0.56;
          break;
        case 'FLAP_OUTER_BOTTOM':
          start = 0.50; end = 0.74;
          break;
        case 'FLAP_INNER_TOP':
          start = 0.68; end = 0.86;
          break;
        case 'FLAP_OUTER_TOP':
          start = 0.80; end = 1.00;
          break;
        default:
          start = 0.0; end = 0.65;
      }
      const raw = (progressT - start) / (end - start);
      const clamped = Math.max(0, Math.min(1, raw));
      localT = clamped * clamped * (3 - 2 * clamped);
    }

    return +(maxDeg * localT).toFixed(2);
  }

  /**
   * Aplica las rotaciones 3D de todas las bisagras estrictamente alrededor del centro del espesor (z = 0).
   */
  function applyFoldAngles() {
    if (!state.dieline || !dielineRootGroup) return;

    for (const [hingeId, data] of pivotMap.entries()) {
      const { pivotGroup, axis3d, basePos } = data;
      const deg = state.hingeAngles[hingeId] !== undefined ? state.hingeAngles[hingeId] : 0;
      const rad = THREE.MathUtils.degToRad(deg);

      // Rotación pura alrededor del eje de la línea roja en el centro exacto del espesor (z = 0)
      pivotGroup.position.copy(basePos);
      pivotGroup.setRotationFromAxisAngle(axis3d, rad);
    }

    // The root is the same base panel identified in 2D. Its interior (+Z)
    // faces up (+Y); folding never changes this panel's contact with the floor.
    dielineRootGroup.rotation.set(-Math.PI / 2, 0, 0);
    dielineRootGroup.position.set(0, 0, 0);

    dielineRootGroup.updateMatrixWorld(true);
    const baseMesh = faceMeshMap.get(state.dieline.rootFaceId)?.mesh;
    if (baseMesh) {
      const baseBox = new THREE.Box3().setFromObject(baseMesh);
      const center = baseBox.getCenter(new THREE.Vector3());
      dielineRootGroup.position.set(-center.x, -baseBox.min.y, -center.z);
    }

    update3DBoundingBoxDimensions();
    render2FDieline();
  }

  function setMasterFold(t) {
    state.masterFold = Math.max(0, Math.min(1, t));

    const masterSlider = document.getElementById('master-fold-slider');
    const masterNum = document.getElementById('master-fold-num');
    const pctVal = Math.round(state.masterFold * 100);
    if (masterSlider) masterSlider.value = pctVal;
    if (masterNum && document.activeElement !== masterNum) masterNum.value = pctVal;

    if (!state.dieline) return;

    const faceById = new Map();
    for (const f of state.dieline.faces) faceById.set(f.id, f);

    for (const h of state.dieline.hinges) {
      const child = faceById.get(h.childFaceId);
      const angle = computeHingeAngleAtProgress(h, child, state.masterFold, state.foldSequenceMode);
      state.hingeAngles[h.id] = angle;

      const hSlider = document.getElementById(`hinge-slider-${h.id}`);
      const hNum = document.getElementById(`hinge-num-${h.id}`);
      if (hSlider) hSlider.value = angle;
      if (hNum && document.activeElement !== hNum) hNum.value = Math.round(angle);
    }

    applyFoldAngles();
  }

  // ============================================================================
  // EXPORTACIÓN .GLB PARA BLENDER (ESCALA 1:1 EN MM + ANIMACIÓN DE PLEGADO)
  // ============================================================================
  function buildBlenderAnimationClips() {
    if (!state.dieline) return [];

    // 1. Clip Principal: Plegado Completo por Fases (0% a 100% en 5.0 segundos, 60 pasos)
    const durationFold = 5.0;
    const numSamples = 60;
    const timesFold = new Float32Array(numSamples + 1);
    for (let k = 0; k <= numSamples; k++) {
      timesFold[k] = +((k / numSamples) * durationFold).toFixed(4);
    }

    // 2. Clip Ciclo Ida y Vuelta: Plegar (0s-4s) -> Pausa cerrada (4s-5s) -> Desplegar (5s-9s)
    const cycleSamples = 90;
    const durationCycle = 9.0;
    const timesCycle = new Float32Array(cycleSamples + 1);
    for (let k = 0; k <= cycleSamples; k++) {
      timesCycle[k] = +((k / cycleSamples) * durationCycle).toFixed(4);
    }

    const tracksFold = [];
    const tracksCycle = [];
    const qTemp = new THREE.Quaternion();

    for (const [hingeId, data] of pivotMap.entries()) {
      const { pivotGroup, axis3d, hinge, childFace } = data;

      // Valores de cuaternión para el clip de plegado 0% -> 100%
      const quatValuesFold = new Float32Array((numSamples + 1) * 4);
      for (let k = 0; k <= numSamples; k++) {
        const progress = k / numSamples;
        const deg = computeHingeAngleAtProgress(hinge, childFace, progress, 'phased');
        qTemp.setFromAxisAngle(axis3d, THREE.MathUtils.degToRad(deg));
        quatValuesFold[k * 4 + 0] = qTemp.x;
        quatValuesFold[k * 4 + 1] = qTemp.y;
        quatValuesFold[k * 4 + 2] = qTemp.z;
        quatValuesFold[k * 4 + 3] = qTemp.w;
      }
      tracksFold.push(
        new THREE.QuaternionKeyframeTrack(`${pivotGroup.name}.quaternion`, timesFold, quatValuesFold)
      );

      // Valores de cuaternión para el clip de ciclo ida y vuelta
      const quatValuesCycle = new Float32Array((cycleSamples + 1) * 4);
      for (let k = 0; k <= cycleSamples; k++) {
        const tSec = timesCycle[k];
        let progress = 0;
        if (tSec <= 4.0) {
          progress = tSec / 4.0;
        } else if (tSec <= 5.0) {
          progress = 1.0;
        } else {
          progress = Math.max(0, 1.0 - (tSec - 5.0) / 4.0);
        }
        const deg = computeHingeAngleAtProgress(hinge, childFace, progress, 'phased');
        qTemp.setFromAxisAngle(axis3d, THREE.MathUtils.degToRad(deg));
        quatValuesCycle[k * 4 + 0] = qTemp.x;
        quatValuesCycle[k * 4 + 1] = qTemp.y;
        quatValuesCycle[k * 4 + 2] = qTemp.z;
        quatValuesCycle[k * 4 + 3] = qTemp.w;
      }
      tracksCycle.push(
        new THREE.QuaternionKeyframeTrack(`${pivotGroup.name}.quaternion`, timesCycle, quatValuesCycle)
      );
    }

    const clipFold = new THREE.AnimationClip('01_Plegado_Caja_Por_Fases', durationFold, tracksFold);
    const clipCycle = new THREE.AnimationClip('02_Ciclo_Plegado_Y_Desplegado', durationCycle, tracksCycle);
    return [clipFold, clipCycle];
  }

  function exportGLBForBlender() {
    if(state.dieline?.vector3DStale){alert('Cierra los contornos del plano antes de exportar el modelo 3D.');return;}
    if (!dielineRootGroup || !THREE.GLTFExporter) {
      alert('El exportador GLTF/GLB no está disponible.');
      return;
    }

    // glTF uses metres. Export an independent hierarchy so the live viewer stays in mm.
    const exportRoot=dielineRootGroup.clone(true);
    exportRoot.traverse(obj=>{if(obj.userData?.isCADHelper)obj.visible=false;});
    exportRoot.scale.multiplyScalar(0.001);
    exportRoot.position.multiplyScalar(0.001);
    exportRoot.userData={...exportRoot.userData,units:'meters',boardCode:state.boardCode,thicknessMm:UserLibrary.boardThicknessMm[state.boardCode],dimensionsMm:{length:state.paramL,width:state.paramW,height:state.paramH}};

    const clips = buildBlenderAnimationClips();
    const exporter = new THREE.GLTFExporter();

    exporter.parse(
      exportRoot,
      (result) => {

        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          const baseName = state.fileName.replace(/\.[^.]+$/, '');
          saveExport(blob, `${baseName}_${state.boardId}_${state.boardCode}_Animado_Blender.glb`);
        }
      },
      {
        binary: true,
        animations: clips,
        onlyVisible: true,
        truncateDrawRange: false,
        embedImages: true
      }
    );
  }

  function buildClientGLB() {
    if (!dielineRootGroup || !state.dieline?.faces.length || state.dieline.vector3DStale) {
      return Promise.reject(new Error('Cierra los contornos y comprueba el modelo 3D antes de publicarlo.'));
    }
    if (!THREE.GLTFExporter) return Promise.reject(new Error('No está disponible el exportador GLB.'));
    // Snapshot the current pose; publishing must not modify the editor or play fold animations.
    const root = dielineRootGroup.clone(true);
    root.traverse(object => { if (object.userData?.isCADHelper) object.visible = false; });
    root.scale.multiplyScalar(0.001);
    root.position.multiplyScalar(0.001);
    root.userData = { ...root.userData, clientViewer: true, units: 'meters' };
    const clips = buildBlenderAnimationClips();
    return new Promise((resolve, reject) => {
      try {
        new THREE.GLTFExporter().parse(root, result => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error('No se ha podido generar el archivo GLB.'));
        }, { binary: true, animations: clips, onlyVisible: true, embedImages: true });
      } catch (error) { reject(error); }
    });
  }

  function setupClientPublishing() {
    const dialog = document.getElementById('publish-client-dialog');
    const form = document.getElementById('publish-client-form');
    if (!dialog || !form) return;
    const input = document.getElementById('publish-client-key');
    const status = document.getElementById('publish-client-status');
    const submit = document.getElementById('publish-client-submit');
    const close = document.getElementById('publish-client-close');
    const resultPanel = document.getElementById('publish-client-result');
    const share = document.getElementById('publish-client-share');
    let publishing = false;
    document.getElementById('btn-publish-client')?.addEventListener('click', () => {
      if (!state.dieline || state.dieline.vector3DStale) { alert('Abre una caja y cierra sus contornos antes de publicarla.'); return; }
      status.textContent = '';
      resultPanel.hidden = true;
      submit.disabled = false;
      dialog.showModal();
      input.focus();
    });
    close.addEventListener('click', () => { if (!publishing) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (publishing) event.preventDefault(); });
    document.getElementById('publish-client-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(share.value); status.textContent = 'Enlace y clave copiados.'; }
      catch (_) { share.focus(); share.select(); status.textContent = 'Pulsa Ctrl+C para copiar los datos seleccionados.'; }
    });
    input.addEventListener('input', () => { resultPanel.hidden = true; submit.disabled = false; });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (publishing) return;
      let filename;
      try { filename = ClientPublishing.modelFilename(input.value); }
      catch (error) { status.dataset.error = 'true'; status.textContent = error.message; input.focus(); return; }
      publishing = true;
      submit.disabled = input.disabled = close.disabled = true;
      status.dataset.error = 'false';
      resultPanel.hidden = true;
      status.textContent = 'Generando y subiendo la caja…';
      try {
        const data = Array.from(new Uint8Array(await buildClientGLB()));
        let result;
        if (window.__TAURI__?.core?.invoke) {
          result = await window.__TAURI__.core.invoke('publish_client_model', { filename, data });
        } else {
          if (!/^https?:$/.test(location.protocol) || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Publica desde la aplicación de escritorio o el servidor local.');
          const response = await fetch('/api/publish-client-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, data }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'No se pudo publicar la caja.');
          result = body;
        }
        share.value = `Visor: ${result.url}\nClave: ${result.key}`;
        resultPanel.hidden = false;
        status.textContent = 'Caja subida. Abriendo el visor web... (GitHub Pages puede tardar unos minutos en desplegar el nuevo modelo).';
        const openUrl = () => {
          if (window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('open_browser_url', { url: result.url }).catch(() => {});
          } else {
            try { window.open(result.url, '_blank'); } catch (_) {}
          }
        };
        const openBtn = document.getElementById('publish-client-open');
        if (openBtn) openBtn.onclick = openUrl;
        openUrl();
      } catch (error) {
        status.dataset.error = 'true';
        status.textContent = String(error.message || error);
      } finally {
        publishing = false;
        input.disabled = close.disabled = false;
        submit.disabled = !resultPanel.hidden;
      }
    });
  }

  async function createBlendScene() {
    const button=document.getElementById('btn-create-blend');
    if(!window.__TAURI__?.core?.invoke){alert('Abre la aplicación de escritorio para crear la escena en Blender.');return;}
    if(!dielineRootGroup || !state.dieline?.faces.length || state.dieline.vector3DStale){alert('Cierra los contornos antes de crear el archivo Blender.');return;}
    button.disabled=true;button.textContent='Creando escena en Blender…';
    try {
      const root=dielineRootGroup.clone(true);
      root.traverse(o=>{if(o.userData?.isCADHelper)o.visible=false;});
      root.scale.multiplyScalar(.001);root.position.multiplyScalar(.001);
      const clips=buildBlenderAnimationClips().filter(c=>c.name.startsWith('02_'));
      const result=await new Promise(resolve=>new THREE.GLTFExporter().parse(root,resolve,{binary:true,animations:clips,onlyVisible:true,embedImages:true}));
      if(!(result instanceof ArrayBuffer))throw Error('No se ha podido generar el modelo GLB.');
      const path=await window.__TAURI__.core.invoke('create_blend',{data:Array.from(new Uint8Array(result))});
      alert('Escena Blender guardada en el Escritorio:\n'+path);
    }catch(error){alert('No se pudo crear el archivo .blend: '+(error.message||error));}
    finally{button.disabled=false;button.textContent='CREAR .blend';}
  }

  // ============================================================================
  // COTAS Y DIMENSIONES 3D EN TIEMPO REAL (BOUNDING BOX EN MM)
  // ============================================================================
  function update3DBoundingBoxDimensions() {
    if (!bboxHelperGroup || !dielineRootGroup) return;

    while (bboxHelperGroup.children.length > 0) {
      bboxHelperGroup.remove(bboxHelperGroup.children[0]);
    }

    dielineRootGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(dielineRootGroup);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);

    const dim3dEl = document.getElementById('hud-3d-dims');
    if (dim3dEl) {
      dim3dEl.textContent = `${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;
    }

  }

  // ============================================================================
  // ASIGNACIÓN Y GESTIÓN DE COTAS POR ÁREA (DIANA 🎯 Y HIT-TESTING DE COTAS)
  // ============================================================================
  function applyPickedDimensionFace(dimKey, face) {
    if (!state.dieline || !face || !face.bounds) return;
    const b = face.bounds;
    let val = 0;
    if (dimKey === 'H') {
      val = +(b.height > 0 ? b.height : 60).toFixed(1);
      state.paramH = val;
      const inp = document.getElementById('input-height');
      if (inp) inp.value = val;
    } else if (dimKey === 'L') {
      val = +(b.width > 0 ? b.width : 200).toFixed(1);
      state.paramL = val;
      const inp = document.getElementById('input-length');
      if (inp) inp.value = val;
    } else if (dimKey === 'W') {
      val = +(b.width > 0 ? b.width : 150).toFixed(1);
      state.paramW = val;
      const inp = document.getElementById('input-width');
      if (inp) inp.value = val;
    }

    // Posicionamiento de flecha sobre el área seleccionada
    let arrow;
    if (dimKey === 'H') {
      const xH = b.minX + Math.min(25, b.width * 0.4);
      arrow = {
        lineName: 'H',
        lineLength: val,
        p1: { x: xH, y: b.minY },
        p2: { x: xH, y: b.maxY },
        tpointer: { x: xH, y: (b.minY + b.maxY) * 0.5, value: 'H=' + val },
        faceId: face.id,
        isMain: true
      };
    } else {
      const yMid = b.minY + b.height * 0.5;
      arrow = {
        lineName: dimKey,
        lineLength: val,
        p1: { x: b.minX, y: yMid },
        p2: { x: b.maxX, y: yMid },
        tpointer: { x: (b.minX + b.maxX) * 0.5, y: yMid, value: `${dimKey}=${val}` },
        faceId: face.id,
        isMain: true
      };
    }

    if (!Array.isArray(state.dieline.sizeArrowData)) state.dieline.sizeArrowData = [];
    state.dieline.sizeArrowData = state.dieline.sizeArrowData.filter(a => a.lineName !== dimKey);
    state.dieline.sizeArrowData.push(arrow);

    // Cancelar estado de diana
    state.pickingDimensionArea = null;
    ['l', 'w', 'h'].forEach(k => {
      document.getElementById('btn-pick-dim-' + k)?.classList.remove('active-target');
    });
    const c2d = document.getElementById('canvas-2d');
    if (c2d && c2d.style) c2d.style.cursor = 'default';

    if (state.dimensionDisplayMode === 'none') {
      state.dimensionDisplayMode = 'main';
      const switchEl = document.getElementById('dimension-mode-switch');
      if (switchEl) {
        switchEl.querySelectorAll('.seg-btn-3').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === 'main');
        });
      }
    }

    vectorMessage(`Área '${face.name || face.label || face.id}' asignada a la cota ${dimKey} (${val} mm).`);
    render2FDieline();
  }

  function hitTestArrow(model, p, tol = 8) {
    if (!model) return null;
    const dimMode = state.dimensionDisplayMode || 'main';
    if (dimMode === 'none') return null;
    const list = (dimMode === 'all')
      ? [...(model.outsideArrowData || []), ...(model.sizeArrowData || [])]
      : (model.sizeArrowData || []);
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (!a || !a.p1 || !a.p2) continue;
      const d = distPointToSegment(p, a.p1, a.p2);
      if (d <= tol) return a;
      if (a.tpointer && Math.hypot(p.x - a.tpointer.x, p.y - a.tpointer.y) <= tol * 1.6) {
        return a;
      }
    }
    return null;
  }

  // ============================================================================
  // VISOR CAD 2D INTERACTIVO (CANVAS 2D CON COTA 1:1, CORTE AZUL Y DOBLEZ ROJO)
  // ============================================================================
  function init2DCanvasInteractions() {
    const canvas = document.getElementById('canvas-2d');
    if (!canvas) return;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom2D(e.deltaY < 0 ? 1.12 : 1/1.12, e);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      if (state.pickingDimensionArea && e.button === 0) {
        const hitFace = hitTest2DCanvas(e);
        if (hitFace) {
          applyPickedDimensionFace(state.pickingDimensionArea, hitFace);
          return;
        }
      }
      if (state.hingeSelectionMode && state.toolMode !== 'pan' && e.button === 0) {
        const rawP = vectorWorldPoint(e, canvas);
        if (state.dieline?.hinges?.length) {
          let closestH = null;
          const tf = get2DTransform(canvas, state.dieline.bounds);
          const screenTolMm = 20 / (tf.scale || 1);
          let minDist = Math.max(25, screenTolMm);
          for (const h of state.dieline.hinges) {
            const d = distPointToSegment(rawP, h.p1, h.p2);
            if (d < minDist) {
              minDist = d;
              closestH = h;
            }
          }
          if (closestH) {
            if (state.selectedHinges.has(closestH.id)) {
              state.selectedHinges.delete(closestH.id);
            } else {
              state.selectedHinges.add(closestH.id);
            }
            updateHingeSelectionUI();
            render2FDieline();
            return;
          }
        }
      }
      if (vectorEditing && !state.artworkEditing && state.toolMode !== 'pan' && e.button === 0) {
        const rawP = vectorWorldPoint(e, canvas);
        const face = state.dieline?.faces?.[vectorSelection?.face];
        const hole = face?.holes?.[vectorSelection?.index];
        if (vectorSelection?.type === 'hole' && hole && vectorInside(rawP, hole)) {
          holeDrag = { startX: rawP.x, startY: rawP.y, curX: rawP.x, curY: rawP.y, hole };
          return;
        }
        if (vectorTool === 'select') {
          const tf = get2DTransform(canvas, state.dieline.bounds);
          const arrowHit = hitTestArrow(state.dieline, rawP, 12 / (tf.scale || 1));
          if (arrowHit) {
            vectorSelection = { type: 'dimension', arrow: arrowHit };
            vectorRefreshControls();
            return;
          }
          boxSelectCandidate = { startX: rawP.x, startY: rawP.y, curX: rawP.x, curY: rawP.y, e };
          return;
        }
        vectorCanvasClick(e);
        return;
      }
      if (state.artwork && state.artworkEditing && state.toolMode !== 'pan' && e.button === 0 && !e.shiftKey) {
        const tf = get2DTransform(canvas, state.dieline.bounds), rect = canvas.getBoundingClientRect();
        const ratio = canvas.width/rect.width;
        artworkDrag = {x:tf.toWorldX((e.clientX-rect.left)*ratio), y:tf.toWorldY((e.clientY-rect.top)*ratio), centerX:state.artwork.centerX,centerY:state.artwork.centerY};
        e.preventDefault();return;
      }
      const rawP = vectorWorldPoint(e, canvas);
      const tf = get2DTransform(canvas, state.dieline.bounds);
      const arrowHit = hitTestArrow(state.dieline, rawP, 12 / (tf.scale || 1));
      if (arrowHit && state.toolMode === 'select' && e.button === 0 && !e.shiftKey) {
        if (!vectorEditing) {
          const toggleBtn = document.getElementById('vector-toggle');
          if (toggleBtn) toggleBtn.click();
        }
        vectorSelection = { type: 'dimension', arrow: arrowHit };
        vectorRefreshControls();
        return;
      }
      const hitFace = hitTest2DCanvas(e);
      if (state.toolMode === 'select' && hitFace && e.button === 0 && !e.shiftKey) {
        selectFace(hitFace.id);
      }
      state.view2D.isDragging = state.toolMode === 'pan' || (!vectorEditing && e.shiftKey) || e.button === 1;
      state.view2D.lastX = e.clientX;
      state.view2D.lastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (holeDrag) {
        const p = vectorWorldPoint(e, canvas);
        let dx = p.x - holeDrag.startX, dy = p.y - holeDrag.startY;
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
        }
        holeDrag.curX = holeDrag.startX + dx;
        holeDrag.curY = holeDrag.startY + dy;
        const dxInput = document.getElementById('vector-hole-dx');
        const dyInput = document.getElementById('vector-hole-dy');
        if (dxInput) dxInput.value = dx.toFixed(1);
        if (dyInput) dyInput.value = dy.toFixed(1);
        render2FDieline();
        return;
      }
      if (boxSelectCandidate) {
        const rawP = vectorWorldPoint(e, canvas);
        if (Math.hypot(rawP.x - boxSelectCandidate.startX, rawP.y - boxSelectCandidate.startY) > 2) {
          boxSelect = boxSelectCandidate;
          boxSelect.curX = rawP.x;
          boxSelect.curY = rawP.y;
          const box = {
            minX: Math.min(boxSelect.startX, boxSelect.curX),
            maxX: Math.max(boxSelect.startX, boxSelect.curX),
            minY: Math.min(boxSelect.startY, boxSelect.curY),
            maxY: Math.max(boxSelect.startY, boxSelect.curY)
          };
          boxSelect.selectedItems = VectorCAD.selectInBox(state.dieline, box);
          render2FDieline();
          return;
        }
      }
      if (artworkDrag && state.artwork) {
        const tf=get2DTransform(canvas,state.dieline.bounds),rect=canvas.getBoundingClientRect(),ratio=canvas.width/rect.width;
        state.artwork.centerX=artworkDrag.centerX+tf.toWorldX((e.clientX-rect.left)*ratio)-artworkDrag.x;
        state.artwork.centerY=artworkDrag.centerY+tf.toWorldY((e.clientY-rect.top)*ratio)-artworkDrag.y;
        scheduleArtworkRefresh();syncArtworkControls();return;
      }
      if (state.view2D.isDragging) {
        const dx = e.clientX - state.view2D.lastX;
        const dy = e.clientY - state.view2D.lastY;
        state.view2D.lastX = e.clientX;
        state.view2D.lastY = e.clientY;
        state.view2D.panX += dx;
        state.view2D.panY += dy;
        render2FDieline();
        return;
      }

      if (vectorEditing && state.toolMode !== 'pan') {
        const rect=canvas.getBoundingClientRect();
        if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom) {
          vectorPointer=vectorWorldPoint(e,canvas,true);
          if (vectorDraft?.point && e.shiftKey) {
            const dx = vectorPointer.x - vectorDraft.point.x, dy = vectorPointer.y - vectorDraft.point.y;
            if (Math.abs(dx) >= Math.abs(dy)) vectorPointer = { ...vectorPointer, y: vectorDraft.point.y };
            else vectorPointer = { ...vectorPointer, x: vectorDraft.point.x };
          }
          canvas.style.cursor=vectorTool==='select'?'default':'crosshair';
          render2FDieline();
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        const hitFace = hitTest2DCanvas(e);
        const newHoverId = hitFace ? hitFace.id : null;
        if (newHoverId !== state.hoveredFaceId) {
          state.hoveredFaceId = newHoverId;
          canvas.style.cursor = newHoverId !== null ? 'pointer' : 'grab';
          updateSelectionHighlight();
          render2FDieline();
        }
      }
    });

    window.addEventListener('pointerup', () => {
      state.view2D.isDragging = false;
      artworkDrag = null;
      if (boxSelect) {
        const box = {
          minX: Math.min(boxSelect.startX, boxSelect.curX),
          maxX: Math.max(boxSelect.startX, boxSelect.curX),
          minY: Math.min(boxSelect.startY, boxSelect.curY),
          maxY: Math.max(boxSelect.startY, boxSelect.curY)
        };
        const items = boxSelect.selectedItems || [];
        boxSelect = null;
        const cand = boxSelectCandidate;
        boxSelectCandidate = null;
        if (items.length > 0) {
          vectorSelection = { type: 'multi', box, items };
          vectorRefreshControls();
          vectorMessage(`${items.length} trazos seleccionados. Introduce x y o pulsa Shift + M.`);
          const xyInput = document.getElementById('vector-box-xy');
          if (xyInput) {
            xyInput.focus();
            xyInput.select();
          }
        } else {
          vectorSelection = null;
          vectorRefreshControls();
        }
        render2FDieline();
        return;
      }
      if (boxSelectCandidate) {
        const e = boxSelectCandidate.e;
        boxSelectCandidate = null;
        vectorCanvasClick(e);
        return;
      }
      if (holeDrag) {
        const dx = holeDrag.curX - holeDrag.startX;
        const dy = holeDrag.curY - holeDrag.startY;
        const h = holeDrag.hole;
        holeDrag = null;
        if (Math.hypot(dx, dy) > 1.5) {
          try {
            const model = VectorCAD.moveHole(state.dieline, h, dx, dy);
            vectorSelection = null;
            commitVectorEdit(model);
            vectorMessage(`Agujero desplazado X: ${dx.toFixed(1)} mm, Y: ${dy.toFixed(1)} mm.`);
          } catch (err) {
            vectorMessage(err.message || String(err));
          }
        }
        render2FDieline();
      }
    });
  }

  function reset2DView() {
    state.view2D.zoom = 1;
    state.view2D.panX = 0;
    state.view2D.panY = 0;
    render2FDieline();
  }

  function get2DTransform(canvas, bounds) {
    const rect = canvas.getBoundingClientRect();
    const pixelScale = canvas.width / Math.max(1, rect.width);
    const panel = document.querySelector('.right-floating-container');
    const panelRect = panel?.getBoundingClientRect();
    // Measure the actual overlay, including the user's resized 3D panel.
    const right = panelRect && panelRect.width > 0 && panelRect.left > rect.left && panelRect.left < rect.right && panelRect.top < rect.bottom && panelRect.bottom > rect.top
      ? (panelRect.left - rect.left - 16) * pixelScale : canvas.width;
    const left = vectorEditing ? Math.min(272 * pixelScale, right * 0.45) : 0;
    const availW = Math.max(1, right - left);
    const availH = Math.max(1, canvas.height);
    const baseScale = 0.75 * Math.min(availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height));
    const scale = baseScale * state.view2D.zoom;

    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;

    const offsetX = left + availW / 2 - cx * scale + state.view2D.panX * pixelScale;
    const offsetY = availH / 2 - cy * scale + state.view2D.panY * pixelScale;

    return {
      scale, centerX: left + availW / 2, centerY: availH / 2,
      toScreenX: (x) => x * scale + offsetX,
      toScreenY: (y) => y * scale + offsetY,
      toWorldX: (sx) => (sx - offsetX) / scale,
      toWorldY: (sy) => (sy - offsetY) / scale
    };
  }

  function hitTest2DCanvas(e) {
    if (!state.dieline) return null;
    const canvas = document.getElementById('canvas-2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    const tf = get2DTransform(canvas, state.dieline.bounds);
    const wx = tf.toWorldX(sx);
    const wy = tf.toWorldY(sy);

    for (const face of state.dieline.faces) {
      if (DielineEngine.pointInPolygon({ x: wx, y: wy }, face.polygon) && !(face.holes || []).some(h => DielineEngine.pointInPolygon({x:wx,y:wy}, h))) {
        return face;
      }
    }
    return null;
  }

  function render2FDieline() {
    const canvas = document.getElementById('canvas-2d');
    if (!canvas || !state.dieline) return;

    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#f1f3f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const model = state.dieline;
    const bounds = model.bounds;
    const tf = get2DTransform(canvas, bounds);

    const stepMM = 50;
    ctx.strokeStyle = 'rgba(80, 98, 120, 0.08)';
    ctx.lineWidth = 1;
    const startX = Math.floor((bounds.minX - 100) / stepMM) * stepMM;
    const endX = Math.ceil((bounds.maxX + 100) / stepMM) * stepMM;
    const startY = Math.floor((bounds.minY - 100) / stepMM) * stepMM;
    const endY = Math.ceil((bounds.maxY + 100) / stepMM) * stepMM;

    ctx.beginPath();
    if (state.view2D.showGrid !== false) for (let x = startX; x <= endX; x += stepMM) {
      const sx = tf.toScreenX(x);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
    }
    if (state.view2D.showGrid !== false) for (let y = startY; y <= endY; y += stepMM) {
      const sy = tf.toScreenY(y);
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
    }
    ctx.stroke();

    // 0. Dibujar contorno verde de SANGRADO (BLEED #22c55e)
    if (state.showBleed) {
      const bleeds = DielineEngine.getOrBuildBleedSegments(model, state.bleedMm);
      if (bleeds.length > 0) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = Math.max(1.2, 1.4 * dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const seg of bleeds) {
          ctx.moveTo(tf.toScreenX(seg.x1), tf.toScreenY(seg.y1));
          ctx.lineTo(tf.toScreenX(seg.x2), tf.toScreenY(seg.y2));
        }
        ctx.stroke();
      }
    }

    // 1. Rellenar caras detectadas del troquel
    if (state.view2D.showFaces) {
      for (const face of model.faces) {
        const isSelected = face.id === state.selectedFaceId;

        ctx.beginPath();
        face.polygon.forEach((p, idx) => {
          const sx = tf.toScreenX(p.x);
          const sy = tf.toScreenY(p.y);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();

        for (const hole of (face.holes || [])) {
          hole.forEach((p, idx) => {
            const sx = tf.toScreenX(p.x), sy = tf.toScreenY(p.y);
            if (idx === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          });
          ctx.closePath();
        }

        if (face.id === state.partHoverFaceId) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; // Resaltado azul celeste intenso de la pestaña Parts
        } else if (isSelected) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        } else if (face.role === 'BODY') {
          ctx.fillStyle = 'rgba(198, 156, 109, 0.16)';
        } else if (face.role === 'GLUE_FLAP') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        } else {
          ctx.fillStyle = 'rgba(198, 156, 109, 0.10)';
        }
        ctx.fill('evenodd');
      }
    }

    drawArtwork2D(ctx, tf, model);

    // Individual cut colors are retained for export and library saves.
    ctx.lineWidth = dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [index, seg] of model.cutSegments.entries()) {
      ctx.strokeStyle = vectorEditing && vectorSelection?.type === 'line' && vectorSelection.kind !== 'fold' && vectorSelection.index === index ? '#00567e' : '#009ee3';
      ctx.beginPath(); ctx.moveTo(tf.toScreenX(seg.x1), tf.toScreenY(seg.y1)); ctx.lineTo(tf.toScreenX(seg.x2), tf.toScreenY(seg.y2)); ctx.stroke();
    }
    if (vectorEditing && vectorSelection?.type === 'hole') {
      const hole = model.faces[vectorSelection.face]?.holes?.[vectorSelection.index];
      if (hole) { ctx.beginPath(); hole.forEach((p,i)=>i?ctx.lineTo(tf.toScreenX(p.x),tf.toScreenY(p.y)):ctx.moveTo(tf.toScreenX(p.x),tf.toScreenY(p.y))); ctx.closePath(); ctx.strokeStyle='#00567e'; ctx.lineWidth=3*dpr; ctx.stroke(); }
    }

    // Fold segments are the editable source of truth, including loose crease strokes.
    for(const [index,seg] of model.foldSegments.entries()) {
      const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
      const isSelectedHinge = (model.hinges || []).some(h => state.selectedHinges?.has(h.id) &&
        distPointToSegment(mid, h.p1, h.p2) < 2.5);

      if (isSelectedHinge) {
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4 * dpr;
        ctx.beginPath();
        ctx.moveTo(tf.toScreenX(seg.x1), tf.toScreenY(seg.y1));
        ctx.lineTo(tf.toScreenX(seg.x2), tf.toScreenY(seg.y2));
        ctx.stroke();
        ctx.restore();
      }

      ctx.lineWidth = isSelectedHinge ? 2 * dpr : dpr;
      ctx.strokeStyle = isSelectedHinge ? '#d97706' : (vectorEditing&&vectorSelection?.type==='line'&&vectorSelection.kind==='fold'&&vectorSelection.index===index?'#99002e':'#e5007d');
      ctx.beginPath();ctx.moveTo(tf.toScreenX(seg.x1),tf.toScreenY(seg.y1));ctx.lineTo(tf.toScreenX(seg.x2),tf.toScreenY(seg.y2));ctx.stroke();
    }

    if (state.selectedHinges?.size && model.hinges) {
      for (const h of model.hinges) {
        if (!state.selectedHinges.has(h.id)) continue;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 6 * dpr;
        ctx.beginPath();
        ctx.moveTo(tf.toScreenX(h.p1.x), tf.toScreenY(h.p1.y));
        ctx.lineTo(tf.toScreenX(h.p2.x), tf.toScreenY(h.p2.y));
        ctx.stroke();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.5 * dpr;
        ctx.stroke();
        ctx.restore();
      }
    }
    drawVectorDraft(ctx,tf,dpr);

    // 5. Dibujar Flechas y Cotas (L, W, H) - Regidas por el switch de 3 estados (Ocultas, Principales, Todas)
    const dimMode = state.dimensionDisplayMode || 'main';
    if (state.showDimensions && state.view2D.showCota && dimMode !== 'none') {
      if (dimMode === 'all' && (!model.outsideArrowData || !model.outsideArrowData.length)) {
        model.outsideArrowData = DielineEngine.generateOutsideArrowData(model);
      }
      if (!model.sizeArrowData || !model.sizeArrowData.length) {
        model.sizeArrowData = DielineEngine.generateSizeArrowData(model);
      }
      let arrowList = [];
      if (dimMode === 'main') {
        arrowList = (model.sizeArrowData || []).filter(sa => ['L', 'W', 'H'].includes(sa.lineName) || sa.isMain || sa.isUserCreated);
      } else if (dimMode === 'all') {
        const seen = new Set();
        const combined = [];
        for (const a of (model.outsideArrowData || [])) {
          combined.push(a);
          if (a.lineName) seen.add(a.lineName);
        }
        for (const a of (model.sizeArrowData || [])) {
          if (!a.lineName || !seen.has(a.lineName)) combined.push(a);
        }
        arrowList = combined;
      }

      if (arrowList.length > 0) {
        for (const sa of arrowList) {
          if (!sa.p1 || !sa.p2) continue;
          const isSelectedDim = (vectorSelection?.type === 'dimension' && (vectorSelection.arrow === sa || vectorSelection.arrow?.id === sa.id));
          ctx.save();
          ctx.strokeStyle = isSelectedDim ? '#00e5ff' : '#0077ff';
          ctx.fillStyle = isSelectedDim ? '#00e5ff' : '#0077ff';
          ctx.lineWidth = (isSelectedDim ? 2.4 : 1.2) * dpr;
          if (isSelectedDim) {
            ctx.shadowColor = 'rgba(0, 229, 255, 0.7)';
            ctx.shadowBlur = 8 * dpr;
          }

          const sx1 = tf.toScreenX(sa.p1.x);
          const sy1 = tf.toScreenY(sa.p1.y);
          const sx2 = tf.toScreenX(sa.p2.x);
          const sy2 = tf.toScreenY(sa.p2.y);

          // Línea principal de cota
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();

          // Puntas de flecha
          const ang = Math.atan2(sy2 - sy1, sx2 - sx1);
          const len = Math.hypot(sx2 - sx1, sy2 - sy1);
          const headLen = Math.min(6 * dpr, len * 0.25);
          if (len > 10 * dpr) {
            const drawHead = (hx, hy, a) => {
              ctx.beginPath();
              ctx.moveTo(hx, hy);
              ctx.lineTo(hx - headLen * Math.cos(a - Math.PI / 6), hy - headLen * Math.sin(a - Math.PI / 6));
              ctx.lineTo(hx - headLen * Math.cos(a + Math.PI / 6), hy - headLen * Math.sin(a + Math.PI / 6));
              ctx.closePath();
              ctx.fill();
            };
            drawHead(sx1, sy1, ang + Math.PI);
            drawHead(sx2, sy2, ang);
          }

          if (isSelectedDim) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2 * dpr;
            ctx.beginPath(); ctx.arc(sx1, sy1, 4 * dpr, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx2, sy2, 4 * dpr, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
          }

          // Texto de medida (mm)
          const mx = (sx1 + sx2) * 0.5;
          const my = (sy1 + sy2) * 0.5;
          const valNum = Number(sa.lineLength) || Math.hypot(sa.p2.x - sa.p1.x, sa.p2.y - sa.p1.y);
          const prefix = (['L', 'W', 'H'].includes(sa.lineName)) ? `${sa.lineName}=` : '';
          const valDisp = `${prefix}${valNum.toFixed(1)} mm`;

          ctx.font = `600 ${Math.round(10.5 * dpr)}px "Inter", system-ui, sans-serif`;
          const tw = ctx.measureText(valDisp).width;
          ctx.fillStyle = isSelectedDim ? '#f0fdff' : 'rgba(255, 255, 255, 0.94)';
          ctx.fillRect(mx - tw * 0.5 - 3 * dpr, my - 7 * dpr, tw + 6 * dpr, 14 * dpr);
          ctx.strokeStyle = isSelectedDim ? '#00cce5' : '#0284c7';
          ctx.lineWidth = (isSelectedDim ? 1.4 : 0.8) * dpr;
          ctx.strokeRect(mx - tw * 0.5 - 3 * dpr, my - 7 * dpr, tw + 6 * dpr, 14 * dpr);
          ctx.fillStyle = isSelectedDim ? '#0891b2' : '#0284c7';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(valDisp, mx, my);
          ctx.restore();
        }
      }
    }

    // 6. Etiquetas de cada cara
    if (state.view2D.showLabels && state.showAreaLabels !== false) {
      for (const face of model.faces) {
        const sx = tf.toScreenX(face.centroid.x);
        const sy = tf.toScreenY(face.centroid.y);
        const screenW = face.bounds.width * tf.scale;
        const screenH = face.bounds.height * tf.scale;

        if (screenW < 28 * dpr && screenH < 28 * dpr) continue;

        ctx.save();
        ctx.translate(sx, sy);
        if (face.bounds.height > face.bounds.width * 2.2) {
          ctx.rotate(-Math.PI / 2);
        }

        ctx.font = `600 ${Math.round(9.5 * dpr)}px "Inter", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = face.id === state.selectedFaceId ? '#006ca8' : '#39475a';
        const shortName = face.label.replace('Superior', 'Sup.').replace('Inferior', 'Inf.');
        ctx.fillText(shortName, 0, -6 * dpr);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // ============================================================================
  // INTERACCIÓN 3D (RAYCASTING Y SELECCIÓN SINCRONIZADA 2D <-> 3D)
  // ============================================================================
  function get3DHitFace(event) {
    if (!renderer || !dielineRootGroup) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = [];
    for (const item of faceMeshMap.values()) {
      meshes.push(item.mesh);
    }

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      return intersects[0].object.userData.face;
    }
    return null;
  }

  let pointerDownPos = { x: 0, y: 0 };

  function on3DPointerMove(e) {
    const face = get3DHitFace(e);
    const fid = face ? face.id : null;
    if (fid !== state.hoveredFaceId) {
      state.hoveredFaceId = fid;
      renderer.domElement.style.cursor = fid !== null ? 'pointer' : 'grab';
      updateSelectionHighlight();
      render2FDieline();
    }
  }

  function on3DPointerDown(e) {
    pointerDownPos = { x: e.clientX, y: e.clientY };
    const onUp = (upEvt) => {
      window.removeEventListener('pointerup', onUp);
      const dist = Math.hypot(upEvt.clientX - pointerDownPos.x, upEvt.clientY - pointerDownPos.y);
      if (dist < 5) {
        const face = get3DHitFace(upEvt);
        if (face) {
          selectFace(face.id);
        }
      }
    };
    window.addEventListener('pointerup', onUp);
  }

  function selectFace(faceId) {
    state.selectedFaceId = faceId;
    updateSelectionHighlight();
    render2FDieline();

    if (!state.dieline) return;
    const face = state.dieline.faces.find(f => f.id === faceId);
    const selBox = document.getElementById('selected-face-info');
    if (face && selBox) {
      selBox.innerHTML = `
        <div class="sel-face-title">${face.label} <span class="badge-id">#${face.id}</span></div>
        <div class="sel-face-grid">
          <div><span>Dimensiones:</span> <strong>${face.bounds.width.toFixed(2)} × ${face.bounds.height.toFixed(2)} mm</strong></div>
          <div><span>Cartón:</span> <strong>${state.boardCode} · ${String(state.caliper).replace('.',',')} mm</strong></div>
          <div><span>Eje rotación:</span> <strong>Centro del espesor (z = 0.00 mm)</strong></div>
        </div>
      `;
    }
  }

  function updateSelectionHighlight() {
    for (const [fid, item] of faceMeshMap.entries()) {
      item.cutOutline.visible = state.showCutLines3D;
    }
  }

  // ============================================================================
  // CÁMARA Y PRESETS DE VISTA 3D
  // ============================================================================
  function fitCameraToModel(instant = false, preserveDirection = false) {
    if (!dielineRootGroup || !camera || !controls) return;
    dielineRootGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(dielineRootGroup);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
    const radius = Math.max(size.length() * 0.5, 60);
    const dist = radius / Math.sin(Math.min(halfVerticalFov, halfHorizontalFov)) * 1.12;
    const direction = preserveDirection
      ? camera.position.clone().sub(controls.target).normalize()
      : new THREE.Vector3(0.78, 0.62, 0.85).normalize();

    controls.target.copy(center);
    if (instant) {
      camera.position.copy(center).addScaledVector(direction, dist);
    }
    controls.update();
  }

  function setCameraPreset(preset) {
    if (!dielineRootGroup) return;
    dielineRootGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(dielineRootGroup);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const d = Math.max(size.x, size.y, size.z, 150) * 1.75;

    controls.target.copy(center);
    switch (preset) {
      case 'iso':
        camera.position.set(center.x + d * 0.75, center.y + d * 0.6, center.z + d * 0.82);
        break;
      case 'front':
        camera.position.set(center.x, center.y + d * 0.1, center.z + d * 1.15);
        break;
      case 'top':
        camera.position.set(center.x, center.y + d * 1.25, center.z + 0.01);
        break;
      case 'side':
        camera.position.set(center.x + d * 1.15, center.y + d * 0.1, center.z);
        break;
      case 'edge':
        // Acercar cámara a una línea de hendido y canto para ver el chafado por ambas caras y la onda del cartón
        camera.position.set(box.max.x + 32, box.max.y + 28, box.max.z + 42);
        controls.target.set(box.max.x - 18, box.max.y - 12, box.max.z - 18);
        break;
    }
    controls.update();
  }

  // ============================================================================
  // CONTROLES DE LA INTERFAZ DE USUARIO (UI)
  // ============================================================================
  /**
   * Vincula un deslizador (<input type="range">) con su caja numérica (<input type="number">)
   * permitiendo:
   *  1. Arrastrar la bolita del slider
   *  2. Introducir la cifra con el teclado numérico
   *  3. Subir/bajar el valor con la ruleta del ratón (wheel) teniendo el foco o el cursor encima del valor o del slider
   */
  function bindSliderAndNumeric(sliderEl, numEl, min, max, step, decimals, onChange) {
    const clampRound = (val) => {
      if (isNaN(val)) return min;
      const clamped = Math.max(min, Math.min(max, val));
      return Number(clamped.toFixed(decimals));
    };

    if (sliderEl) {
      sliderEl.addEventListener('input', (e) => {
        const v = clampRound(parseFloat(e.target.value));
        if (numEl) numEl.value = v;
        onChange(v);
      });

      sliderEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const mult = e.shiftKey ? 5 : 1;
        const dir = e.deltaY < 0 ? 1 : -1;
        const cur = parseFloat(sliderEl.value) || 0;
        const next = clampRound(cur + dir * step * mult);
        sliderEl.value = next;
        if (numEl) numEl.value = next;
        onChange(next);
      }, { passive: false });
    }

    if (numEl) {
      const applyFromNum = () => {
        const raw = parseFloat(numEl.value);
        if (isNaN(raw)) return;
        const v = clampRound(raw);
        if (sliderEl) sliderEl.value = v;
        onChange(v);
      };

      numEl.addEventListener('input', applyFromNum);
      numEl.addEventListener('change', () => {
        const v = clampRound(parseFloat(numEl.value));
        numEl.value = v;
        if (sliderEl) sliderEl.value = v;
        onChange(v);
      });

      const wheelTarget = numEl.closest('.num-input-wrap') || numEl;
      wheelTarget.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mult = e.shiftKey ? 5 : 1;
        const dir = e.deltaY < 0 ? 1 : -1;
        const cur = parseFloat(numEl.value);
        const base = isNaN(cur) ? (sliderEl ? parseFloat(sliderEl.value) : min) : cur;
        const next = clampRound(base + dir * step * mult);
        numEl.value = next;
        if (sliderEl) sliderEl.value = next;
        onChange(next);
      }, { passive: false });
    }
  }

  function initUIControls() {
    // 1. Selector de Pestañas del Drawer Lateral (Rail de Iconos: Dielines, Basic, Details, Parts, Info, More)
    const railTabs = document.querySelectorAll('.rail-tab-btn');
    const drawerViews = {
      dielines: document.getElementById('drawer-tab-dielines'),
      projects: document.getElementById('drawer-tab-projects'),
      basic: document.getElementById('drawer-tab-basic'),
      details: document.getElementById('drawer-tab-details'),
      parts: document.getElementById('drawer-tab-parts'),
      info: document.getElementById('drawer-tab-info'),
      more: document.getElementById('drawer-tab-more')
    };

    railTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabKey = btn.getAttribute('data-drawer-tab');
        state.activeTab = tabKey;
        railTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        Object.keys(drawerViews).forEach(k => {
          if (drawerViews[k]) {
            drawerViews[k].classList.toggle('hidden', k !== tabKey);
          }
        });

        // Al cambiar a Details, regenerar parámetros avanzados y forzar redibujo de cotas 2D detalladas
        if (tabKey === 'details') {
          renderDetailsTabUI();
        } else if (tabKey === 'projects') {
          renderProjects();
        } else if (tabKey === 'dielines') {
          renderDrawerCatalogList();
        }
        render2FDieline();
      });
    });

    // 3. Inputs de Largo, Ancho y Alto (Basic Tab)
    const lInput = document.getElementById('input-length');
    const wInput = document.getElementById('input-width');
    const hInput = document.getElementById('input-height');

    const handleDimChange = () => {
      const factor = 1;
      const nl = (parseFloat(lInput?.value) || state.paramL) * factor;
      const nw = (parseFloat(wInput?.value) || state.paramW) * factor;
      const nh = (parseFloat(hInput?.value) || state.paramH) * factor;
      applyParametricResizeRealTime(nl, nw, nh);
    };

    [lInput, wInput, hInput].forEach(inp => {
      if (!inp) return;
      inp.addEventListener('input', handleDimChange);
      inp.addEventListener('change', handleDimChange);
      inp.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        const cur = parseFloat(inp.value) || 0;
        const step = 1.0;
        inp.value = +(cur + dir * step).toFixed(2);
        handleDimChange();
      }, { passive: false });
    });

    // Botones diana 🎯 para seleccionar directamente el área que define Largo, Ancho o Alto
    ['l', 'w', 'h'].forEach(k => {
      const code = k.toUpperCase();
      const btn = document.getElementById('btn-pick-dim-' + k);
      if (btn) {
        btn.onclick = () => {
          if (state.pickingDimensionArea === code) {
            state.pickingDimensionArea = null;
            btn.classList.remove('active-target');
            const c2d = document.getElementById('canvas-2d');
            if (c2d && c2d.style) c2d.style.cursor = 'default';
            vectorMessage('Selección de área cancelada.');
          } else {
            ['l', 'w', 'h'].forEach(other => {
              document.getElementById('btn-pick-dim-' + other)?.classList.remove('active-target');
            });
            state.pickingDimensionArea = code;
            btn.classList.add('active-target');
            const c2d = document.getElementById('canvas-2d');
            if (c2d && c2d.style) c2d.style.cursor = 'crosshair';
            vectorMessage(`Pincha sobre el área del troquel para acotar ${code === 'L' ? 'el Largo (L)' : code === 'W' ? 'el Ancho (W)' : 'el Alto (H)'}.`);
          }
        };
      }
    });

    // Switch de 3 estados de visualización de cotas (Ocultas, Principales, Todas)
    const dimSwitch = document.getElementById('dimension-mode-switch');
    if (dimSwitch) {
      dimSwitch.querySelectorAll('.seg-btn-3').forEach(btn => {
        btn.onclick = () => {
          dimSwitch.querySelectorAll('.seg-btn-3').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.dimensionDisplayMode = btn.dataset.mode;
          render2FDieline();
        };
      });
    }

    // Toggle para mostrar u ocultar nombres de áreas
    const btnToggleAreas = document.getElementById('btn-toggle-area-names');
    if (btnToggleAreas) {
      btnToggleAreas.onclick = () => {
        state.showAreaLabels = !state.showAreaLabels;
        btnToggleAreas.classList.toggle('active', state.showAreaLabels);
        render2FDieline();
      };
    }

    // 4. Selector de Material (ArtiosCAD DB)
    const matSelect = document.getElementById('select-material');
    if (matSelect && window.DielineEngine) {
      matSelect.innerHTML = '';
      for (const b of MATERIAL_FINISHES) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        if (b.id === state.boardId) opt.selected = true;
        matSelect.appendChild(opt);
      }
      matSelect.addEventListener('change', (e) => {
        const chosen = MATERIAL_FINISHES.find(b => b.id === e.target.value);
        if (chosen) {
          state.boardId = chosen.id;
          state.flute = chosen.flute;
          applyParametricResizeRealTime(state.paramL, state.paramW, state.paramH);
        }
      });
    }

    // 7. Parts Tab: variación de partes estructurales (Screenshot 3)
    const partCards = document.querySelectorAll('.part-card');
    partCards.forEach(card => {
      const partKey = card.getAttribute('data-part-key');
      card.addEventListener('click', () => {
        document.getElementById('part-options-dialog')?.close();
        partCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        state.activePart = partKey;
        applyCurrentPartVariation();
        if (['handle', 'thumb_notch', 'tab_lock', 'side_locks'].includes(partKey)) openPartOptions(partKey);
      });

      card.addEventListener('mouseenter', () => {
        if (state.dieline) {
          if (partKey === 'side_locks') {
            const data = DielineEngine.getSideLocksData ? DielineEngine.getSideLocksData(state.dieline) : null;
            if (data) {
              state.partHoverFaceId = data.hl.id;
              render2FDieline();
            }
          } else if (DielineEngine.findPrimaryLidFlapFace) {
            const flap = DielineEngine.findPrimaryLidFlapFace(state.dieline);
            if (flap) {
              state.partHoverFaceId = flap.id;
              render2FDieline();
            }
          }
        }
      });

      card.addEventListener('mouseleave', () => {
        state.partHoverFaceId = null;
        render2FDieline();
      });
    });

    // 8. Botones de Formato de Exportación (AI, PDF, DXF, SVG, GLB, PNG)
    const formatBtns = document.querySelectorAll('.format-btn');
    formatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        formatBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedExportFormat = btn.getAttribute('data-export-format');
        const dlBtnLabel = document.getElementById('label-download-btn');
        if (dlBtnLabel) {
          dlBtnLabel.textContent = `Descargar ${state.selectedExportFormat.toUpperCase()}`;
        }
      });

      // Doble clic descarga directamente el formato
      btn.addEventListener('dblclick', () => {
        downloadSelectedDielineFormat(btn.getAttribute('data-export-format'));
      });
    });

    const mainDlBtn = document.getElementById('btn-download-dieline-main');
    if (mainDlBtn) {
      mainDlBtn.addEventListener('click', () => {
        downloadSelectedDielineFormat(state.selectedExportFormat);
      });
    }

    // 9. Floating Toolbar 2D (Selección, Mano/Pan, Zoom, Cotas, Bleed, Cuadrícula)
    const toolSelect = document.getElementById('tool-select');
    const toolPan = document.getElementById('tool-pan');
    const toolZoomIn = document.getElementById('tool-zoom-in');
    const toolZoomOut = document.getElementById('tool-zoom-out');
    const toolFit = document.getElementById('tool-fit-view');
    const toolDims = document.getElementById('tool-toggle-dims');
    const toolBleed = document.getElementById('tool-toggle-bleed');
    const toolGrid = document.getElementById('tool-toggle-grid');

    if (toolSelect) {
      toolSelect.addEventListener('click', () => {
        state.toolMode = 'select';
        toolSelect.classList.add('active');
        if (toolPan) toolPan.classList.remove('active');
      });
    }
    if (toolPan) {
      toolPan.addEventListener('click', () => {
        state.toolMode = 'pan';
        toolPan.classList.add('active');
        if (toolSelect) toolSelect.classList.remove('active');
      });
    }
    if (toolZoomIn) toolZoomIn.addEventListener('click', () => {
      zoom2D(1.25);
    });
    if (toolZoomOut) toolZoomOut.addEventListener('click', () => {
      zoom2D(1/1.25);
    });
    if (toolFit) toolFit.addEventListener('click', reset2DView);

    if (toolDims) {
      toolDims.addEventListener('click', () => {
        state.showDimensions = !state.showDimensions;
        toolDims.classList.toggle('active', state.showDimensions);
        render2FDieline();
      });
    }
    if (toolBleed) {
      toolBleed.addEventListener('click', () => {
        state.showBleed = !state.showBleed;
        toolBleed.classList.toggle('active', state.showBleed);
        render2FDieline();
      });
    }
    if (toolGrid) {
      toolGrid.addEventListener('click', () => {
        state.view2D.showGrid = state.view2D.showGrid === undefined ? false : !state.view2D.showGrid;
        toolGrid.classList.toggle('active', state.view2D.showGrid !== false);
        render2FDieline();
      });
    }

    // 10. Floating 3D Card (Expand/PiP + Slider Open-Close)
    const expand3dBtn = document.getElementById('btn-expand-3d');
    const preview3dCard = document.getElementById('preview-3d-card');
    if (expand3dBtn && preview3dCard) {
      expand3dBtn.addEventListener('click', () => {
        preview3dCard.classList.toggle('expanded');
        setTimeout(onWindowResize, 60);
      });
    }

    const resize3dHandle = document.getElementById('resize-3d-handle');
    if (resize3dHandle && preview3dCard) {
      const floatingPanel = preview3dCard.parentElement;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      let drag = null;
      resize3dHandle.addEventListener('pointerdown', e => {
        if (e.button !== 0 || preview3dCard.classList.contains('expanded')) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = preview3dCard.getBoundingClientRect();
        drag = {x: e.clientX, y: e.clientY, width: rect.width, height: rect.height};
        resize3dHandle.setPointerCapture(e.pointerId);
      });
      resize3dHandle.addEventListener('pointermove', e => {
        if (!drag) return;
        // The card is anchored at the right, so drag left to widen it.
        floatingPanel.style.width = `${clamp(drag.width + drag.x - e.clientX, 340, Math.max(340, window.innerWidth - 420))}px`;
        preview3dCard.style.height = `${clamp(drag.height + e.clientY - drag.y, 280, Math.max(280, window.innerHeight - 120))}px`;
      });
      const stopResize = () => { drag = null; };
      resize3dHandle.addEventListener('pointerup', stopResize);
      resize3dHandle.addEventListener('pointercancel', stopResize);
      resize3dHandle.addEventListener('lostpointercapture', stopResize);
      resize3dHandle.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const rect = preview3dCard.getBoundingClientRect();
        floatingPanel.style.width = `${clamp(rect.width + (e.key === 'ArrowLeft' ? 20 : e.key === 'ArrowRight' ? -20 : 0), 340, Math.max(340, window.innerWidth - 420))}px`;
        preview3dCard.style.height = `${clamp(rect.height + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0), 280, Math.max(280, window.innerHeight - 120))}px`;
      });
      if (window.ResizeObserver) new ResizeObserver(onWindowResize).observe(preview3dCard);
    }

    const masterSlider = document.getElementById('master-fold-slider');
    if (masterSlider) {
      masterSlider.addEventListener('input', (e) => {
        state.isPlaying = false;
        updatePlayButtonUI();
        setMasterFold(parseFloat(e.target.value) / 100);
      });
    }

    const pipPlayBtn = document.getElementById('btn-play-fold');
    if (pipPlayBtn) {
      pipPlayBtn.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying && state.masterFold >= 0.99) state.playDirection = -1;
        else if (state.isPlaying && state.masterFold <= 0.01) state.playDirection = 1;
        updatePlayButtonUI();
      });
    }

    // 11. Opciones de More Tab y Archivos
    const svgInput = document.getElementById('svg-file-input');
    if (svgInput) {
      svgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (/\.dxf$/i.test(file.name)) openDxfImport(ev.target.result, file.name);
            else loadSVGString(ev.target.result, file.name, true);
          };
          reader.readAsText(file);
          e.target.value = '';
        }
      });
    }

    const artInput = document.getElementById('artwork-file-input');
    if (artInput) {
      artInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) applyCustomArtworkFile(file);
        e.target.value = '';
      });
    }

    const clearArtBtn = document.getElementById('btn-clear-artwork');
    if (clearArtBtn) {
      clearArtBtn.addEventListener('click', () => {
        clearArtwork();
        rebuild3DMesh();
        render2FDieline();
      });
    }

    document.getElementById('btn-art-settings')?.addEventListener('click', openArtworkOptions);
    initUserLibraryUI();
    document.getElementById('project-save').onclick=saveCurrentProject;
    document.getElementById('btn-create-blend')?.addEventListener('click',createBlendScene);
    setupClientPublishing();
    initVectorEditor();
    document.getElementById('btn-set-base')?.addEventListener('click',async()=>{
      try{
        const artwork=state.artwork?{...state.artwork}:null;
        const model=DielineEngine.rerootDielineModel(state.baseDieline,state.selectedFaceId);
        applyNewDielineModel(model,state.fileName,true,state.canAddToLibrary);
        if(artwork)await loadArtworkData(artwork.dataUrl,artwork);
      }catch(error){alert(error.message);}
    });
    initArtworkControls();

    const bindCheck = (id, prop, callback) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = state[prop];
      el.addEventListener('change', (e) => {
        state[prop] = e.target.checked;
        if (callback) callback();
      });
    };
    bindCheck('chk-wireframe', 'showWireframe', () => rebuild3DMesh());
    bindCheck('chk-crease-3d', 'showCreaseLines3D', () => {
      for (const item of faceMeshMap.values()) item.creaseLines.visible = state.showCreaseLines3D;
    });
    bindCheck('chk-cut-3d', 'showCutLines3D', () => updateSelectionHighlight());
    bindCheck('chk-grid-3d', 'showGrid', () => {
      if (gridHelper) gridHelper.visible = state.showGrid;
    });

    document.getElementById('fold-sequence-mode')?.addEventListener('change', e => { state.foldSequenceMode = e.target.value; setMasterFold(state.masterFold); });
    const crushInput = document.getElementById('input-crush-depth');
    if (crushInput) crushInput.addEventListener('change', () => {
      state.crushDepthRatio = Math.max(0, Math.min(0.9, Number(crushInput.value) / 100));
      crushInput.value = Math.round(state.crushDepthRatio * 100);
      rebuild3DMesh();
      setMasterFold(state.masterFold);
    });
    document.getElementById('btn-switch-studio-view')?.addEventListener('click', () => document.getElementById('btn-expand-3d')?.click());
    document.getElementById('btn-toggle-main-menu')?.addEventListener('click', () => {
      document.body.classList.toggle('drawer-collapsed');
      requestAnimationFrame(onWindowResize);
    });
    if (window.ResizeObserver) new ResizeObserver(() => onWindowResize()).observe(document.querySelector('.canvas-2d-viewport'));

    // Dropdowns de Cabecera (Abrir / Guardar) y Control de Hendidos en pestaña Más
    initHeaderDropdowns();
    initHingeMoreControls();

    // 13. Inicializar catálogo de dielines dentro de la pestaña Dielines
    initDrawerCatalogUI();
  }

  function initHeaderDropdowns() {
    const openBtn = document.getElementById('btn-header-open');
    const openMenu = document.getElementById('header-open-menu');
    const saveBtn = document.getElementById('btn-header-save');
    const saveMenu = document.getElementById('header-save-menu');

    function closeAllDropdowns() {
      if (openMenu) openMenu.classList.add('hidden');
      if (saveMenu) saveMenu.classList.add('hidden');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
      if (saveBtn) saveBtn.setAttribute('aria-expanded', 'false');
    }

    if (openBtn && openMenu) {
      openBtn.onclick = (e) => {
        e.stopPropagation();
        const willOpen = openMenu.classList.contains('hidden');
        closeAllDropdowns();
        if (willOpen) {
          openMenu.classList.remove('hidden');
          openBtn.setAttribute('aria-expanded', 'true');
        }
      };
    }

    if (saveBtn && saveMenu) {
      saveBtn.onclick = (e) => {
        e.stopPropagation();
        const willOpen = saveMenu.classList.contains('hidden');
        closeAllDropdowns();
        if (willOpen) {
          saveMenu.classList.remove('hidden');
          saveBtn.setAttribute('aria-expanded', 'true');
        }
      };
    }

    window.addEventListener('click', (e) => {
      if (!e.target.closest('.header-dropdown-container')) {
        closeAllDropdowns();
      }
    });

    document.getElementById('menu-open-file')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('svg-file-input')?.click();
    });

    document.getElementById('menu-open-projects')?.addEventListener('click', () => {
      closeAllDropdowns();
      const projRail = document.querySelector('.rail-tab-btn[data-drawer-tab="projects"]');
      if (projRail) projRail.click();
    });

    document.getElementById('menu-open-artwork')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('artwork-file-input')?.click();
    });

    document.getElementById('menu-save-project')?.addEventListener('click', () => {
      closeAllDropdowns();
      saveCurrentProject();
    });

    document.getElementById('menu-save-library')?.addEventListener('click', () => {
      closeAllDropdowns();
      document.getElementById('btn-add-library')?.click();
    });

    document.getElementById('menu-export-svg')?.addEventListener('click', () => {
      closeAllDropdowns();
      downloadSelectedDielineFormat('svg');
    });

    document.getElementById('menu-export-dxf')?.addEventListener('click', () => {
      closeAllDropdowns();
      downloadSelectedDielineFormat('dxf');
    });

    document.getElementById('menu-export-glb')?.addEventListener('click', () => {
      closeAllDropdowns();
      downloadSelectedDielineFormat('glb');
    });

    document.getElementById('menu-export-pdf')?.addEventListener('click', () => {
      closeAllDropdowns();
      downloadSelectedDielineFormat('pdf');
    });

    document.getElementById('menu-export-png')?.addEventListener('click', () => {
      closeAllDropdowns();
      downloadSelectedDielineFormat('png');
    });

    document.getElementById('menu-publish-client')?.addEventListener('click', () => {
      closeAllDropdowns();
      const pubBtn = document.getElementById('btn-publish-client');
      if (pubBtn) pubBtn.click();
      else if (typeof setupClientPublishingClick === 'function') setupClientPublishingClick();
    });

    document.getElementById('menu-create-blend')?.addEventListener('click', () => {
      closeAllDropdowns();
      createBlendScene();
    });
  }

  function applyCurrentPartVariation() {
    if (!state.parametricDieline || !DielineEngine.applyPartVariationToModel) return;
    recordUndoState();
    const modified = DielineEngine.applyPartVariationToModel(state.parametricDieline, state.activePart, state.partParams[state.activePart]);
    if (modified) {
      state.dieline = modified;
      const status = document.getElementById('part-options-status');
      if (status) status.textContent = modified.partError || 'Cambios en tiempo real en el plano y el 3D.';
      rebuild3DMesh();
      setMasterFold(state.masterFold);
      render2FDieline();
    }
  }

  let partUpdateFrame = 0;
  function openPartOptions(key) {
    const dialog = document.getElementById('part-options-dialog');
    const fields = document.getElementById('part-options-fields');
    if (!dialog || !fields || !state.parametricDieline) return;
    fields.replaceChildren();
    const titles = {handle:'Asa', thumb_notch:'Uñero', tab_lock:'Pestaña de cierre', side_locks:'Machos y hembras'};
    document.getElementById('part-options-title').textContent = titles[key] || 'Variación de pieza';
    const controls = new Map();
    if (!state.partParams[key]) state.partParams[key] = {};
    let settings = DielineEngine.getPartVariationSettings(state.parametricDieline, key, state.partParams[key]);
    state.partParams[key] = {...settings.params};
    const sync = () => {
      settings = DielineEngine.getPartVariationSettings(state.parametricDieline, key, state.partParams[key]);
      state.partParams[key] = {...settings.params};
      for (const [name, control] of controls) {
        const limit = settings.limits[name];
        if (limit) {
          for (const input of [control.number, control.slider]) {
            if (input) {
              input.min = limit.min;
              input.max = limit.max;
              input.value = settings.params[name];
            }
          }
        } else if (control.number) {
          control.number.value = settings.params[name];
        }
        control.row.hidden = name === 'distance' && Number(settings.params.count) < 2;
      }
    };
    const change = (name, value) => {
      state.partParams[key][name] = Number(value);
      sync();
      if (!partUpdateFrame) partUpdateFrame = requestAnimationFrame(() => {
        partUpdateFrame = 0;
        applyCurrentPartVariation();
      });
    };
    const definitions = key === 'handle'
      ? [['width','Ancho del asa (mm)'],['length','Largo del asa (mm)'],['radius','Radio de las esquinas (mm)']]
      : key === 'thumb_notch'
        ? [['count','Número de uñeros'],['radius','Radio del uñero (mm)'],['distance','Distancia entre centros (mm)']]
        : key === 'side_locks'
          ? [['count','Número de encastres'],['length','Largo del macho / hembra (mm)'],['distance','Distancia entre centros (mm)'],['radius','Radio de las esquinas (mm)'],['depth','Saliente del macho (mm)']]
          : [['length','Ancho de la pestaña (mm)'],['depth','Fondo de la pestaña (mm)']];
    for (const [name, label] of definitions) {
      const row = document.createElement('label'); row.className = 'part-option-field';
      const title = document.createElement('span'); title.textContent = label;
      let number, slider;
      if (name === 'count') {
        number = document.createElement('select');
        const countOptions = key === 'side_locks'
          ? [[1, 'Uno'], [2, 'Dos'], [3, 'Tres']]
          : [[1, 'Uno'], [2, 'Dos']];
        for (const [value, text] of countOptions) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          number.appendChild(option);
        }
        number.value = settings.params.count || countOptions[0][0];
        number.addEventListener('change', () => change(name, number.value));
        row.append(title, number);
      } else {
        number = document.createElement('input'); number.type = 'number'; number.step = '0.5'; number.setAttribute('aria-label', label);
        slider = document.createElement('input'); slider.type = 'range'; slider.step = '0.5'; slider.setAttribute('aria-label', label + ' · deslizador');
        number.addEventListener('input', () => { if (number.value !== '') change(name, number.value); });
        slider.addEventListener('input', () => change(name, slider.value));
        row.append(title, number, slider);
      }
      controls.set(name, {row, number, slider});
      fields.appendChild(row);
    }
    sync();
    document.getElementById('part-options-status').textContent = state.dieline.partError || 'Cambios en tiempo real en el plano y el 3D.';
    document.getElementById('part-options-close').onclick = () => dialog.close();
    document.getElementById('part-options-done').onclick = () => dialog.close();
    if (!dialog.open) dialog.show();
  }

  function getDetailGroups(baseModel, currentModel) {
    const faces = currentModel.faces.filter(f => f.role && f.role.includes('FLAP') && f.bounds.width > 2 && f.bounds.height > 2);
    const byId = new Map(faces.map(f => [f.id, f]));
    const visited = new Set();
    const groups = [];
    for (const face of faces) {
      if (visited.has(face.id)) continue;
      const original = baseModel.faces.find(f => f.id === face.id) || face;
      const axis = original.bounds.width < original.bounds.height ? 'x' : 'y';
      const span = f => axis === 'x' ? f.bounds.width : f.bounds.height;
      const members = [face];
      visited.add(face.id);
      for (let i = 0; i < members.length; i++) {
        const base = baseModel.faces.find(f => f.id === members[i].id) || members[i];
        for (const mirror of ['x', 'y']) {
          const partner = DielineEngine.findSymmetricFace(baseModel, base, axis, mirror);
          const current = partner && byId.get(partner.id);
          if (!current || visited.has(current.id) || Math.abs(span(current) - span(face)) > 0.35) continue;
          members.push(current);
          visited.add(current.id);
        }
      }
      groups.push({axis, members, value: span(face)});
    }
    return groups;
  }

  function renderDetailsTabUI() {
    const container = document.getElementById('details-params-container');
    if (!container || !state.dieline) return;
    container.innerHTML = '';
    const groups = getDetailGroups(state.baseDieline, state.parametricDieline || state.dieline);
    if (!groups.length) { container.textContent = 'No se han identificado solapas editables en este plano.'; return; }
    const help = document.createElement('p'); help.className = 'project-note';
    help.textContent = 'Las piezas simétricas comparten una medida. Los ajustes pueden afectar a piezas vecinas.';
    container.appendChild(help);
    if (Object.keys(state.openParamsValues).length) {
      const reset = document.createElement('button'); reset.className = 'btn-outline'; reset.textContent = 'Restablecer medidas';
      reset.addEventListener('click', () => { state.openParamsValues = {}; applyParametricResizeRealTime(state.paramL, state.paramW, state.paramH); renderDetailsTabUI(); });
      container.appendChild(reset);
    }
    for (const {axis, members, value} of groups) {
      const face = members[0];
      const row = document.createElement('label'); row.className = 'detail-row';
      const title = document.createElement('span'); title.className = 'detail-name';
      if (members.length > 1) {
        let common = face.name.replace(/\s*\([^)]*\)/g, '').replace(/Izquierda|Derecha|Superior|Inferior|Izq\.?|Der\.?|Sup\.?|Inf\.?/gi, '').trim();
        if (face.pacdoraName && common.endsWith(face.pacdoraName)) common = common.slice(0, -face.pacdoraName.length).trim();
        title.textContent = common.replace(/\s+/g, ' ') + ' (' + members.map(f => f.pacdoraName || f.id).join(' / ') + ')';
      } else title.textContent = face.name;
      const wrap = document.createElement('div'); wrap.className = 'detail-input-wrap';
      const input = document.createElement('input'); input.type = 'number'; input.className = 'detail-num-input';
      input.value = +value.toFixed(3); input.min = 2; input.max = 2000; input.step = 'any';
      const unit = document.createElement('span'); unit.textContent = 'mm';
      input.addEventListener('change', () => {
        const target = Number(input.value);
        if (!Number.isFinite(target) || target < 2 || target > 2000) { input.value = +value.toFixed(3); return; }
        for (const member of members) state.openParamsValues['band:' + member.id + ':' + axis] = target;
        applyParametricResizeRealTime(state.paramL, state.paramW, state.paramH);
        renderDetailsTabUI();
      });
      wrap.append(input, unit); row.append(title, wrap); container.appendChild(row);
    }
  }

  async function saveExport(blob, filename) {
    try {
      if (window.__TAURI__?.core?.invoke) {
        const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await window.__TAURI__.core.invoke('save_export', { filename, data });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      console.error('Error guardando exportación:', error);
      alert('No se pudo guardar el archivo: ' + (error.message || error));
    }
  }

  function downloadSelectedDielineFormat(fmt) {
    if (!state.dieline) return;
    const model = state.dieline;
    const cleanName = (state.fileName || 'dieline').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dimsSuffix = `${state.paramL}x${state.paramW}x${state.paramH}mm`;

    const triggerDownload = (blobOrStr, ext, mime) => {
      const blob = typeof blobOrStr === 'string' ? new Blob([blobOrStr], { type: mime }) : blobOrStr;
      saveExport(blob, `${cleanName}_${dimsSuffix}_1_1.${ext}`);
    };

    switch (fmt) {
      case 'ai':
        if (DielineEngine.exportDielineToPDF) {
          const aiData = DielineEngine.exportDielineToPDF(model, state.bleedMm, true);
          triggerDownload(aiData, 'ai', 'application/postscript');
        }
        break;
      case 'pdf':
        if (DielineEngine.exportDielineToPDF) {
          const pdfData = DielineEngine.exportDielineToPDF(model, state.bleedMm, false);
          triggerDownload(pdfData, 'pdf', 'application/pdf');
        }
        break;
      case 'dxf':
        if (DielineEngine.exportDielineToDXF) {
          const dxfData = DielineEngine.exportDielineToDXF(model, state.bleedMm);
          triggerDownload(dxfData, 'dxf', 'application/dxf');
        }
        break;
      case 'svg':
        if (DielineEngine.exportDielineToSVG) {
          const svgData = DielineEngine.exportDielineToSVG(model, state.bleedMm);
          triggerDownload(svgData, 'svg', 'image/svg+xml;charset=utf-8');
        }
        break;
      case 'glb':
        exportGLBForBlender();
        break;
      case 'png':
        exportPNGSnapshot();
        break;
    }
  }

  function initDrawerCatalogUI() {
    const searchInput = document.getElementById('drawer-dielines-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.fefcoSearch = e.target.value;
        catalogLimit = 60;
        renderDrawerCatalogList();
      });
    }

    const catChips = document.querySelectorAll('.cat-chip');
    catChips.forEach(chip => {
      chip.addEventListener('click', () => {
        catChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.catalogCategory = chip.getAttribute('data-cat-slug');
        catalogLimit = 60;
        renderDrawerCatalogList();
      });
    });

    const boardPills = document.querySelectorAll('.board-pill');
    boardPills.forEach(pill => {
      pill.addEventListener('click', () => {
        boardPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedBoardFilter = pill.getAttribute('data-board') || 'C1';
        catalogLimit = 60;
        renderDrawerCatalogList();
      });
    });
  }

  function nombreModelo(item) {
    if(item.userModel)return item.name;
    const text = (item.name || '').toLowerCase();
    if (item.fefcoCode) return 'Caja ' + item.fefcoCode;
    if (text.includes('mailer') || text.includes('shipping')) return 'Caja de envío';
    if (text.includes('tuck end') || text.includes('tuck top')) return 'Caja con lengüeta';
    if (text.includes('display')) return 'Caja expositora';
    if (text.includes('window')) return 'Caja con ventana';
    if (text.includes('gift')) return 'Caja de regalo';
    if (text.includes('drawer') || text.includes('sleeve')) return 'Caja deslizante';
    if (text.includes('tray')) return 'Bandeja';
    if (text.includes('envelope')) return 'Sobre';
    if (text.includes('bag') || text.includes('pouch')) return 'Bolsa';
    if (text.includes('insert')) return 'Separador';
    if (text.includes('lid') || text.includes('flip top')) return 'Caja con tapa';
    if (text.includes('box')) return 'Caja';
    return 'Troquel';
  }

  // Edits are applied to a private model snapshot until explicitly saved.
  let vectorEditing=false, vectorSelection=null;
  let vectorTool='select', vectorDraft=null, vectorPointer=null, holeDrag=null, boxSelect=null, boxSelectCandidate=null;
  function vectorInside(p, poly) {
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) { const a=poly[i],b=poly[j]; if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside; }
    return inside;
  }
  function vectorBounds(poly) {
    const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
    return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  }
  function vectorEdgesCross(a, b) {
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) {
      const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
      if(cross(p,q,r)*cross(p,q,s)<=0 && cross(r,s,p)*cross(r,s,q)<=0 &&
         Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x))<=Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x)) &&
         Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y))<=Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))) return true;
    }
    return false;
  }

  function vectorMessage(message) { document.getElementById('vector-status').textContent=message; }
  function vectorLine() { return vectorSelection?.type==='line' ? VectorCAD.get(state.dieline,vectorSelection) : null; }
  function vectorRefreshControls() {
    const sel=vectorSelection,model=state.dieline,hole=sel?.type==='hole'?model?.faces[sel.face]?.holes?.[sel.index]:null;
    const line=vectorLine();
    document.getElementById('vector-color-controls').hidden=!line;
    document.getElementById('vector-hole-controls').hidden=!hole;
    document.getElementById('vector-selection').textContent=hole?'Agujero seleccionado':line?(sel.kind==='fold'?'Hendido seleccionado':'Corte seleccionado'):'Sin selección';
    if(hole) {const b=vectorBounds(hole);document.getElementById('vector-hole-width').value=(b.maxX-b.minX).toFixed(2);document.getElementById('vector-hole-height').value=(b.maxY-b.minY).toFixed(2);}
    if(line&&vectorTool==='select')document.getElementById('vector-kind').value=sel.kind||'cut';
    document.getElementById('vector-undo').disabled=!vectorHistory.length;
    document.getElementById('vector-redo').disabled=!vectorRedo.length;

    const modal = document.getElementById('vector-tool-modal');
    const lineFields = document.getElementById('vector-modal-line-fields');
    const circleFields = document.getElementById('vector-modal-circle-fields');
    const handleFields = document.getElementById('vector-modal-handle-fields');
    const holeFields = document.getElementById('vector-modal-hole-fields');
    const boxFields = document.getElementById('vector-modal-box-fields');
    const dimFields = document.getElementById('vector-modal-dim-fields');
    const modalTitle = document.getElementById('vector-modal-title');

    if (modal && lineFields && circleFields && handleFields && holeFields) {
      if (vectorTool === 'line') {
        modal.hidden = false;
        modalTitle.textContent = 'Línea · Medidas';
        lineFields.hidden = false; circleFields.hidden = true; handleFields.hidden = true; holeFields.hidden = true; if (boxFields) boxFields.hidden = true; if (dimFields) dimFields.hidden = true;
      } else if (vectorTool === 'circle') {
        modal.hidden = false;
        modalTitle.textContent = 'Círculo · Medidas';
        lineFields.hidden = true; circleFields.hidden = false; handleFields.hidden = true; holeFields.hidden = true; if (boxFields) boxFields.hidden = true; if (dimFields) dimFields.hidden = true;
      } else if (vectorTool === 'handle') {
        modal.hidden = false;
        modalTitle.textContent = 'Asa · Medidas';
        lineFields.hidden = true; circleFields.hidden = true; handleFields.hidden = false; holeFields.hidden = true; if (boxFields) boxFields.hidden = true; if (dimFields) dimFields.hidden = true;
      } else if (sel?.type === 'dimension' && sel?.arrow) {
        modal.hidden = false;
        modalTitle.textContent = 'Cota seleccionada';
        lineFields.hidden = true; circleFields.hidden = true; handleFields.hidden = true; holeFields.hidden = true; if (boxFields) boxFields.hidden = true;
        if (dimFields) {
          dimFields.hidden = false;
          const badge = document.getElementById('vector-dim-val-badge');
          const nameStr = sel.arrow.lineName ? ` [${sel.arrow.lineName}]` : '';
          if (badge) badge.textContent = `Cota: ${(Number(sel.arrow.lineLength) || 0).toFixed(1)} mm${nameStr}`;
        }
      } else if (vectorTool === 'dimension') {
        modal.hidden = false;
        modalTitle.textContent = 'Acotar ortogonal (X / Y)';
        lineFields.hidden = true; circleFields.hidden = true; handleFields.hidden = true; holeFields.hidden = true; if (boxFields) boxFields.hidden = true;
        if (dimFields) {
          dimFields.hidden = false;
          const badge = document.getElementById('vector-dim-val-badge');
          if (badge) badge.textContent = 'Pulsa inicio y fin para acotar';
        }
      } else if (vectorTool === 'select' && sel?.type === 'hole' && hole) {
        modal.hidden = false;
        modalTitle.textContent = 'Asa / Agujero seleccionado';
        lineFields.hidden = true; circleFields.hidden = true; handleFields.hidden = true; holeFields.hidden = false; if (boxFields) boxFields.hidden = true; if (dimFields) dimFields.hidden = true;
        const b = vectorBounds(hole);
        document.getElementById('vector-modal-hole-w').value = (b.maxX - b.minX).toFixed(1);
        document.getElementById('vector-modal-hole-h').value = (b.maxY - b.minY).toFixed(1);
        document.getElementById('vector-hole-dx').value = 0;
        document.getElementById('vector-hole-dy').value = 0;
      } else if (vectorTool === 'select' && sel?.type === 'multi' && sel?.items?.length) {
        modal.hidden = false;
        modalTitle.textContent = 'Mover / Copiar trazos (Shift + M)';
        lineFields.hidden = true; circleFields.hidden = true; handleFields.hidden = true; holeFields.hidden = true; if (boxFields) boxFields.hidden = false; if (dimFields) dimFields.hidden = true;
        const badge = document.getElementById('vector-box-count-badge');
        if (badge) badge.textContent = `${sel.items.length} trazos seleccionados`;
      } else {
        modal.hidden = true;
      }
    }
    render2FDieline();
  }
  function vectorWorldPoint(e,canvas,snapping=false) {
    const rect=canvas.getBoundingClientRect(),ratio=canvas.width/rect.width,tf=get2DTransform(canvas,state.dieline.bounds);
    const p={x:tf.toWorldX((e.clientX-rect.left)*ratio),y:tf.toWorldY((e.clientY-rect.top)*ratio)};
    return snapping?VectorCAD.snap(state.dieline,p,8*ratio/tf.scale):p;
  }
  function zoom2D(factor,event) {
    if(!state.dieline)return;
    const canvas=document.getElementById('canvas-2d'),rect=canvas.getBoundingClientRect(),ratio=canvas.width/rect.width;
    const before=get2DTransform(canvas,state.dieline.bounds),line=vectorLine();
    let focus,selected=false;
    if(line){focus={x:(line.x1+line.x2)/2,y:(line.y1+line.y2)/2};selected=true;}
    else if(vectorSelection?.type==='hole') {const hole=state.dieline.faces[vectorSelection.face]?.holes?.[vectorSelection.index];if(hole){const b=vectorBounds(hole);focus={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};selected=true;}}
    else if(!vectorEditing&&state.selectedFaceId!==null) {const face=state.dieline.faces.find(f=>f.id===state.selectedFaceId);if(face){focus=face.centroid||{x:(face.bounds.minX+face.bounds.maxX)/2,y:(face.bounds.minY+face.bounds.maxY)/2};selected=true;}}
    if(!focus)focus=event?vectorWorldPoint(event,canvas):{x:before.toWorldX(before.centerX),y:before.toWorldY(before.centerY)};
    const screen={x:selected?before.centerX:before.toScreenX(focus.x),y:selected?before.centerY:before.toScreenY(focus.y)};
    state.view2D.zoom=Math.max(0.15,Math.min(24,state.view2D.zoom*factor));
    const after=get2DTransform(canvas,state.dieline.bounds);
    state.view2D.panX+=(screen.x-after.toScreenX(focus.x))/ratio;
    state.view2D.panY+=(screen.y-after.toScreenY(focus.y))/ratio;
    render2FDieline();
  }
  function setVectorTool(tool) {
    vectorTool=tool;vectorDraft=null;vectorPointer=null;state.toolMode='select';
    state.artworkEditing=false;artworkDrag=null;
    const help={
      select:'Selecciona trazos arrastrando un rectángulo o pulsa sobre una línea o cota. Mayús: ortogonal. Supr: borrar.',
      dimension:'Acotar: pulsa el inicio y el final de la cota. Solo en línea recta ortogonal (X o Y) con imanes a vectores rectos.',
      line:'Pulsa el inicio y después el final de la línea. Mayús: ortogonal. Se imanta al troquel.',
      circle:'Pulsa para colocar el círculo con el radio exacto. Se imanta al troquel.',
      handle:'Pulsa para colocar el asa centrada en el cursor con medidas exactas.',
      extend:'Pulsa cerca del extremo que quieres extender hasta el siguiente trazo.',
      trim:'Pulsa cerca del extremo que quieres contraer hasta la primera intersección interior.',
      chamfer:'Introduce la distancia y pulsa las dos líneas que forman la esquina.',
      fillet:'Introduce el radio y pulsa las dos líneas que forman la esquina.'
    };
    for(const key of Object.keys(help)) {
      const btn = document.getElementById('vector-tool-'+key);
      if (btn) btn.classList.toggle('active', tool===key);
    }
    document.getElementById('vector-help').textContent=help[tool]+' Mayús: ortogonal / desplazar · Esc: cancelar.';
    document.getElementById('vector-value-label').hidden=!['chamfer','fillet'].includes(tool);
    vectorRefreshControls();
  }
  function vectorCanvasClick(e) {
    if(!state.dieline)return;
    const canvas=e.currentTarget;
    let p=vectorWorldPoint(e,canvas,true),raw=vectorWorldPoint(e,canvas);
    const rect=canvas.getBoundingClientRect(),tf=get2DTransform(canvas,state.dieline.bounds),hit=VectorCAD.hit(state.dieline,raw,10*canvas.width/rect.width/tf.scale);
    const kind=document.getElementById('vector-kind').value==='fold'?'fold':'cut';

    // Shift key orthogonal constraint for line
    if (vectorDraft?.point && (e.shiftKey || vectorPointer?._orthogonal)) {
      const dx = p.x - vectorDraft.point.x, dy = p.y - vectorDraft.point.y;
      if (Math.abs(dx) >= Math.abs(dy)) p = { ...p, y: vectorDraft.point.y };
      else p = { ...p, x: vectorDraft.point.x };
    }

    try {
      if (vectorTool === 'dimension') {
        if (!vectorDraft) {
          vectorDraft = { point: p };
          vectorPointer = p;
          vectorMessage('Extremo inicial fijado. Pulsa el extremo final para acotar (ortogonal en X o Y).');
          render2FDieline();
          return;
        }
        let endP = p;
        const dx = endP.x - vectorDraft.point.x;
        const dy = endP.y - vectorDraft.point.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          endP = { x: endP.x, y: vectorDraft.point.y };
        } else {
          endP = { x: vectorDraft.point.x, y: endP.y };
        }
        const len = Math.hypot(endP.x - vectorDraft.point.x, endP.y - vectorDraft.point.y);
        if (len < 0.5) {
          vectorMessage('La cota es demasiado pequeña.');
          return;
        }
        const newArrow = {
          id: 'user_dim_' + Date.now(),
          lineName: 'Dim',
          lineLength: +len.toFixed(1),
          p1: { x: vectorDraft.point.x, y: vectorDraft.point.y },
          p2: { x: endP.x, y: endP.y },
          tpointer: {
            x: (vectorDraft.point.x + endP.x) * 0.5,
            y: (vectorDraft.point.y + endP.y) * 0.5,
            value: len.toFixed(1) + ' mm'
          },
          isUserCreated: true,
          isMain: false
        };
        if (!Array.isArray(state.dieline.sizeArrowData)) state.dieline.sizeArrowData = [];
        state.dieline.sizeArrowData.push(newArrow);
        vectorDraft = null;
        vectorSelection = { type: 'dimension', arrow: newArrow };
        vectorRefreshControls();
        render2FDieline();
        vectorMessage(`Cota ortogonal de ${len.toFixed(1)} mm creada. Puedes asignarla como L, W o H.`);
        return;
      }
      if (vectorTool === 'handle') {
        const w = Number(document.getElementById('vector-handle-width')?.value) || 80;
        const h = Number(document.getElementById('vector-handle-height')?.value) || 25;
        const r = Number(document.getElementById('vector-handle-radius')?.value) || 8;
        const model = VectorCAD.handle(state.dieline, p, w, h, r, kind);
        vectorDraft = null; vectorSelection = null;
        commitVectorEdit(model);
        vectorMessage(`Asa ${w}×${h} mm colocada en (${p.x.toFixed(1)}, ${p.y.toFixed(1)}).`);
        return;
      }
      if (vectorTool === 'circle') {
        const presetRadius = Number(document.getElementById('vector-circle-radius')?.value) || 12;
        if (!vectorDraft) {
          // If modal has radius configured, directly place circle on click!
          const model = VectorCAD.circle(state.dieline, p, presetRadius, kind);
          vectorDraft = null; vectorSelection = null;
          commitVectorEdit(model);
          vectorMessage(`Círculo R ${presetRadius} mm colocado en (${p.x.toFixed(1)}, ${p.y.toFixed(1)}).`);
          return;
        }
        const model = VectorCAD.circle(state.dieline, vectorDraft.point, Math.hypot(p.x - vectorDraft.point.x, p.y - vectorDraft.point.y), kind);
        vectorDraft = null; vectorSelection = null;
        commitVectorEdit(model);
        return;
      }
      if (vectorTool === 'line') {
        const fixedLen = Number(document.getElementById('vector-line-len')?.value);
        if (!vectorDraft) {
          vectorDraft = { point: p };
          vectorPointer = p;
          vectorMessage('Pulsa el final de la línea. Mantén Mayús para ortogonal.');
          render2FDieline();
          return;
        }
        let endP = p;
        if (fixedLen > 0) {
          const ang = Math.atan2(p.y - vectorDraft.point.y, p.x - vectorDraft.point.x);
          endP = { x: vectorDraft.point.x + Math.cos(ang) * fixedLen, y: vectorDraft.point.y + Math.sin(ang) * fixedLen };
        }
        const model = VectorCAD.addLine(state.dieline, vectorDraft.point, endP, kind);
        vectorDraft = null; vectorSelection = null;
        commitVectorEdit(model);
        return;
      }
      if (vectorTool === 'select') {
        const arrowHit = hitTestArrow(state.dieline, raw, 12 * canvas.width / rect.width / tf.scale);
        if (arrowHit) {
          vectorSelection = { type: 'dimension', arrow: arrowHit };
          vectorRefreshControls();
          return;
        }
        // 1. Check if clicked inside a hole
        let foundHole = null;
        for (let f = 0; f < state.dieline.faces.length; f++) {
          const face = state.dieline.faces[f];
          for (let i = 0; i < (face.holes || []).length; i++) {
            if (vectorInside(raw, face.holes[i])) {
              foundHole = { type: 'hole', face: f, index: i };
              break;
            }
          }
          if (foundHole) break;
        }

        // 2. Check if clicked on any line of a hole
        if (!foundHole && hit) {
          const s = VectorCAD.get(state.dieline, hit);
          if (s) {
            const sameP = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y) < 0.1;
            for (let f = 0; f < state.dieline.faces.length; f++) {
              const face = state.dieline.faces[f];
              for (let i = 0; i < (face.holes || []).length; i++) {
                const hPoly = face.holes[i];
                if (hPoly.some(pt => sameP(pt, { x: s.x1, y: s.y1 })) && hPoly.some(pt => sameP(pt, { x: s.x2, y: s.y2 }))) {
                  foundHole = { type: 'hole', face: f, index: i };
                  break;
                }
              }
              if (foundHole) break;
            }
          }
        }

        vectorSelection = foundHole || hit;
        vectorRefreshControls();
        return;
      }
      if (!hit) { vectorMessage('Pulsa sobre una línea de corte o de hendido.'); return; }
      vectorSelection = hit;
      if (vectorTool === 'erase') { vectorSelection = null; commitVectorEdit(VectorCAD.erase(state.dieline, hit)); }
      else if (vectorTool === 'extend' || vectorTool === 'trim') { vectorSelection = null; commitVectorEdit(VectorCAD.collide(state.dieline, hit, raw, vectorTool === 'extend')); }
      else {
        if (!vectorDraft) { vectorDraft = { ref: hit }; vectorMessage('Primera línea seleccionada. Pulsa la segunda línea de la esquina.'); vectorRefreshControls(); return; }
        const model = VectorCAD.corner(state.dieline, vectorDraft.ref, hit, Number(document.getElementById('vector-value').value), vectorTool === 'fillet');
        vectorDraft = null; vectorSelection = null; commitVectorEdit(model);
      }
    } catch (error) { vectorMessage(error.message || String(error)); }
  }
  function drawVectorDraft(ctx,tf,dpr) {
    if (!vectorEditing) return;

    // A. Render live rectangular marquee crossing selection
    if (boxSelect && Math.hypot(boxSelect.curX - boxSelect.startX, boxSelect.curY - boxSelect.startY) > 2) {
      const minX = Math.min(boxSelect.startX, boxSelect.curX);
      const maxX = Math.max(boxSelect.startX, boxSelect.curX);
      const minY = Math.min(boxSelect.startY, boxSelect.curY);
      const maxY = Math.max(boxSelect.startY, boxSelect.curY);
      const sx1 = tf.toScreenX(minX), sy1 = tf.toScreenY(minY);
      const sx2 = tf.toScreenX(maxX), sy2 = tf.toScreenY(maxY);
      const bx = Math.min(sx1, sx2), by = Math.min(sy1, sy2);
      const bw = Math.abs(sx2 - sx1), bh = Math.abs(sy2 - sy1);

      ctx.save();
      ctx.fillStyle = 'rgba(0, 192, 135, 0.14)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#00c087';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([5 * dpr, 3 * dpr]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);

      if (boxSelect.selectedItems?.length) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.5 * dpr;
        ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
        ctx.shadowBlur = 6 * dpr;
        for (const item of boxSelect.selectedItems) {
          const s = item.s;
          ctx.beginPath();
          ctx.moveTo(tf.toScreenX(s.x1), tf.toScreenY(s.y1));
          ctx.lineTo(tf.toScreenX(s.x2), tf.toScreenY(s.y2));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // B. Highlight multi-segment selection
    if (vectorSelection?.type === 'multi' && vectorSelection?.items?.length) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.8 * dpr;
      ctx.shadowColor = 'rgba(0, 229, 255, 0.7)';
      ctx.shadowBlur = 8 * dpr;
      for (const item of vectorSelection.items) {
        const seg = (item.kind === 'fold' ? state.dieline.foldSegments : state.dieline.cutSegments)[item.index];
        if (seg) {
          ctx.beginPath();
          ctx.moveTo(tf.toScreenX(seg.x1), tf.toScreenY(seg.y1));
          ctx.lineTo(tf.toScreenX(seg.x2), tf.toScreenY(seg.y2));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 0. Render dragging hole ghost
    if (holeDrag) {
      const dx = holeDrag.curX - holeDrag.startX, dy = holeDrag.curY - holeDrag.startY;
      ctx.save();
      ctx.strokeStyle = '#00c087';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      for (let i = 0; i < holeDrag.hole.length; i++) {
        const sx = tf.toScreenX(holeDrag.hole[i].x + dx), sy = tf.toScreenY(holeDrag.hole[i].y + dy);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#00c087';
      ctx.font = 11 * dpr + 'px sans-serif';
      ctx.fillText(`ΔX: ${dx.toFixed(1)} mm, ΔY: ${dy.toFixed(1)} mm`, tf.toScreenX(holeDrag.curX), tf.toScreenY(holeDrag.curY) - 10 * dpr);
      ctx.restore();
    }

    // 1. Highlight selected hole with glowing halo
    if (vectorSelection?.type === 'hole') {
      const face = state.dieline.faces[vectorSelection.face];
      const hole = face?.holes?.[vectorSelection.index];
      if (hole && hole.length) {
        ctx.save();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3 * dpr;
        ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
        ctx.shadowBlur = 8 * dpr;
        ctx.beginPath();
        for (let i = 0; i < hole.length; i++) {
          const sx = tf.toScreenX(hole[i].x), sy = tf.toScreenY(hole[i].y);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#00e5ff';
        for (const pt of hole) {
          ctx.beginPath();
          ctx.arc(tf.toScreenX(pt.x), tf.toScreenY(pt.y), 2.5 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (!vectorPointer) return;

    // 2. Magnetic Snap Marker
    if (vectorPointer.snapped) {
      const sx = tf.toScreenX(vectorPointer.x), sy = tf.toScreenY(vectorPointer.y);
      ctx.save();
      ctx.strokeStyle = '#00c087';
      ctx.fillStyle = 'rgba(0, 192, 135, 0.25)';
      ctx.lineWidth = 2 * dpr;
      if (vectorPointer.snapType === 'endpoint') {
        ctx.strokeRect(sx - 5 * dpr, sy - 5 * dpr, 10 * dpr, 10 * dpr);
        ctx.fillRect(sx - 5 * dpr, sy - 5 * dpr, 10 * dpr, 10 * dpr);
      } else if (vectorPointer.snapType === 'midpoint') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - 6 * dpr);
        ctx.lineTo(sx + 6 * dpr, sy + 5 * dpr);
        ctx.lineTo(sx - 6 * dpr, sy + 5 * dpr);
        ctx.closePath();
        ctx.stroke(); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, 5 * dpr, 0, Math.PI * 2);
        ctx.stroke(); ctx.fill();
      }
      ctx.restore();
    }

    // 3. Handle Tool preview ghost
    if (vectorTool === 'handle') {
      const w = Number(document.getElementById('vector-handle-width')?.value) || 80;
      const h = Number(document.getElementById('vector-handle-height')?.value) || 25;
      const r = Number(document.getElementById('vector-handle-radius')?.value) || 8;
      const q = vectorPointer;
      ctx.save();
      ctx.strokeStyle = '#009ee3';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      const rC = Math.max(0, Math.min(r, w/2, h/2));
      const x1 = tf.toScreenX(q.x - w/2), y1 = tf.toScreenY(q.y - h/2);
      const sw = w * tf.scale, sh = h * tf.scale, sr = rC * tf.scale;
      if (ctx.roundRect) ctx.roundRect(x1, y1, sw, sh, sr);
      else ctx.rect(x1, y1, sw, sh);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#009ee3';
      ctx.font = 11 * dpr + 'px sans-serif';
      ctx.fillText(`Asa ${w}×${h} mm`, x1, y1 - 6 * dpr);
      ctx.restore();
      return;
    }

    // 4. Circle Tool preview without draft
    if (vectorTool === 'circle' && !vectorDraft?.point) {
      const r = Number(document.getElementById('vector-circle-radius')?.value) || 12;
      const q = vectorPointer;
      ctx.save();
      ctx.strokeStyle = '#009ee3';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.arc(tf.toScreenX(q.x), tf.toScreenY(q.y), r * tf.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#009ee3';
      ctx.font = 11 * dpr + 'px sans-serif';
      ctx.fillText(`R ${r} mm`, tf.toScreenX(q.x) + r * tf.scale + 6 * dpr, tf.toScreenY(q.y));
      ctx.restore();
      return;
    }

    // Cota (Acotar ortogonal en X / Y) draft preview
    if (vectorTool === 'dimension' && vectorDraft?.point && vectorPointer) {
      const p = vectorDraft.point;
      let q = vectorPointer;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        q = { x: q.x, y: p.y };
      } else {
        q = { x: p.x, y: q.y };
      }
      const sx1 = tf.toScreenX(p.x), sy1 = tf.toScreenY(p.y);
      const sx2 = tf.toScreenX(q.x), sy2 = tf.toScreenY(q.y);
      const len = Math.hypot(q.x - p.x, q.y - p.y);

      ctx.save();
      ctx.strokeStyle = '#0284c7';
      ctx.fillStyle = '#0284c7';
      ctx.lineWidth = 1.5 * dpr;

      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      const ang = Math.atan2(sy2 - sy1, sx2 - sx1);
      const headLen = Math.min(6 * dpr, Math.hypot(sx2 - sx1, sy2 - sy1) * 0.25);
      if (Math.hypot(sx2 - sx1, sy2 - sy1) > 10 * dpr) {
        const drawHead = (hx, hy, a) => {
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx - headLen * Math.cos(a - Math.PI / 6), hy - headLen * Math.sin(a - Math.PI / 6));
          ctx.lineTo(hx - headLen * Math.cos(a + Math.PI / 6), hy - headLen * Math.sin(a + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        };
        drawHead(sx1, sy1, ang + Math.PI);
        drawHead(sx2, sy2, ang);
      }

      const mx = (sx1 + sx2) * 0.5, my = (sy1 + sy2) * 0.5;
      const txt = `${len.toFixed(1)} mm`;
      ctx.font = `600 ${Math.round(11 * dpr)}px "Inter", sans-serif`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - tw * 0.5 - 4 * dpr, my - 8 * dpr, tw + 8 * dpr, 16 * dpr);
      ctx.strokeStyle = '#0284c7';
      ctx.strokeRect(mx - tw * 0.5 - 4 * dpr, my - 8 * dpr, tw + 8 * dpr, 16 * dpr);
      ctx.fillStyle = '#0284c7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, mx, my);
      ctx.restore();
      return;
    }

    // 5. Line draft or Circle drag
    if (!vectorDraft?.point) return;
    const p = vectorDraft.point;
    let q = vectorPointer;
    if (vectorTool === 'line') {
      const fixedLen = Number(document.getElementById('vector-line-len')?.value);
      if (fixedLen > 0) {
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        q = { x: p.x + Math.cos(ang) * fixedLen, y: p.y + Math.sin(ang) * fixedLen };
      }
    }
    ctx.save();
    ctx.strokeStyle = document.getElementById('vector-kind').value === 'fold' ? '#e5007d' : '#009ee3';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.beginPath();
    if (vectorTool === 'circle') ctx.arc(tf.toScreenX(p.x), tf.toScreenY(p.y), Math.hypot(q.x - p.x, q.y - p.y) * tf.scale, 0, 2 * Math.PI);
    else { ctx.moveTo(tf.toScreenX(p.x), tf.toScreenY(p.y)); ctx.lineTo(tf.toScreenX(q.x), tf.toScreenY(q.y)); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 12 * dpr + 'px sans-serif';
    ctx.fillText((vectorTool === 'circle' ? 'R ' : '') + Math.hypot(q.x - p.x, q.y - p.y).toFixed(2) + ' mm', tf.toScreenX(q.x) + 8 * dpr, tf.toScreenY(q.y) - 8 * dpr);
    ctx.restore();
  }
  function displayVectorModel(model) {
    state.dieline=model;state.baseDieline=vectorClone(model);state.parametricDieline=model;state.activePart='standard';state.partParams={};
    state.selectedFaceId=model.rootFaceId;state.hoveredFaceId=null;
    state.hingeAngles=Object.fromEntries(model.hinges.map(h=>[h.id,0]));
    if(state.artwork){
      if(state.artwork.scope==='face'&&!model.faces.some(f=>f.id===state.artwork.faceId))state.artwork.scope='all';
      refreshArtworkAtlas(model);
    }
    rebuild3DMesh();setMasterFold(state.masterFold);buildHingeSlidersUI(model);vectorRefreshControls();
  }
  function commitVectorEdit(model) {
    model=VectorCAD.rebuild(model,DielineEngine);
    vectorHistory.push(vectorClone(state.dieline));if(vectorHistory.length>30)vectorHistory.shift();vectorRedo=[];
    displayVectorModel(model);
    vectorMessage(model.vectorWarning||'Cambio aplicado. Exporta o guarda en la biblioteca.');
  }
  function initVectorEditor() {
    const controls=document.getElementById('vector-controls');
    const upImg = document.getElementById('vector-upload-image');
    if (upImg) upImg.onclick = () => document.getElementById('artwork-file-input')?.click();
    const mvImg = document.getElementById('vector-move-image');
    if (mvImg) mvImg.onclick = () => {
      if (!state.artwork) { vectorMessage('Sube primero una imagen.'); return; }
      vectorDraft = null; vectorSelection = null; state.toolMode = 'select'; state.artworkEditing = true;
      syncArtworkControls(); render2FDieline(); vectorMessage('Arrastra la imagen en el plano.');
    };
    const adjImg = document.getElementById('vector-adjust-image');
    if (adjImg) adjImg.onclick = () => { if (state.artwork) openArtworkOptions(); else vectorMessage('Sube primero una imagen.'); };
    const toggle=on=>{vectorEditing=on;controls.hidden=!on;document.getElementById('vector-toggle').setAttribute('aria-expanded',String(on));vectorSelection=null;vectorDraft=null;if(on)setVectorTool('select');else render2FDieline();};
    document.getElementById('vector-toggle').onclick=()=>toggle(!vectorEditing);
    document.getElementById('vector-close').onclick=()=>toggle(false);
    for(const tool of ['select','dimension','line','circle','handle','extend','trim','chamfer','fillet']) {
      const btn = document.getElementById('vector-tool-'+tool);
      if (btn) btn.onclick = () => setVectorTool(tool);
    }

    // Modal discreto de herramientas y manipulación de agujero/asa
    const modalClose = document.getElementById('vector-modal-close');
    if (modalClose) modalClose.onclick = () => {
      const m = document.getElementById('vector-tool-modal');
      if (m) m.hidden = true;
    };

    const circRad = document.getElementById('vector-circle-radius');
    if (circRad) circRad.oninput = e => {
      const r = Number(e.target.value) || 0;
      const diam = document.getElementById('vector-circle-diam');
      if (diam) diam.value = (r * 2).toFixed(1);
      render2FDieline();
    };

    const circDiam = document.getElementById('vector-circle-diam');
    if (circDiam) circDiam.oninput = e => {
      const d = Number(e.target.value) || 0;
      const rad = document.getElementById('vector-circle-radius');
      if (rad) rad.value = (d / 2).toFixed(1);
      render2FDieline();
    };

    // Mover asa o agujero con desplazamiento exacto
    const btnMoveHole = document.getElementById('vector-btn-move-hole');
    if (btnMoveHole) btnMoveHole.onclick = () => {
      if (vectorSelection?.type !== 'hole') return;
      const face = state.dieline.faces[vectorSelection.face];
      const hole = face?.holes?.[vectorSelection.index];
      if (!hole) return;
      const dx = Number(document.getElementById('vector-hole-dx')?.value) || 0;
      const dy = Number(document.getElementById('vector-hole-dy')?.value) || 0;
      if (dx === 0 && dy === 0) { vectorMessage('Indica un desplazamiento ΔX o ΔY.'); return; }
      try {
        const model = VectorCAD.moveHole(state.dieline, hole, dx, dy);
        vectorSelection = null;
        commitVectorEdit(model);
        vectorMessage(`Agujero desplazado: ${dx} mm horizontal, ${dy} mm vertical.`);
      } catch (err) { vectorMessage(err.message || String(err)); }
    };

    // Copiar asa o agujero con desplazamiento exacto
    const btnCopyHole = document.getElementById('vector-btn-copy-hole');
    if (btnCopyHole) btnCopyHole.onclick = () => {
      if (vectorSelection?.type !== 'hole') return;
      const face = state.dieline.faces[vectorSelection.face];
      const hole = face?.holes?.[vectorSelection.index];
      if (!hole) return;
      let dx = Number(document.getElementById('vector-hole-dx')?.value) || 0;
      let dy = Number(document.getElementById('vector-hole-dy')?.value) || 0;
      if (dx === 0 && dy === 0) dx = 35;
      try {
        const model = VectorCAD.copyHole(state.dieline, hole, dx, dy);
        vectorSelection = null;
        commitVectorEdit(model);
        vectorMessage(`Agujero copiado con éxito (+ ${dx} mm, + ${dy} mm).`);
      } catch (err) { vectorMessage(err.message || String(err)); }
    };

    // Eliminar asa o agujero completo
    const btnDelHole = document.getElementById('vector-btn-delete-hole');
    if (btnDelHole) btnDelHole.onclick = () => {
      if (vectorSelection?.type !== 'hole') return;
      const face = state.dieline.faces[vectorSelection.face];
      const hole = face?.holes?.[vectorSelection.index];
      if (!hole) return;
      try {
        const model = VectorCAD.deleteHole(state.dieline, hole);
        vectorSelection = null;
        commitVectorEdit(model);
        vectorMessage('Agujero eliminado.');
      } catch (err) { vectorMessage(err.message || String(err)); }
    };
    function applyBoxMoveOrCopy() {
      if (vectorSelection?.type !== 'multi' || !vectorSelection?.box) {
        vectorMessage('Selecciona trazos arrastrando un rectángulo primero.');
        return;
      }
      const xyInput = document.getElementById('vector-box-xy');
      const val = xyInput ? xyInput.value.trim() : '-20 0';
      const parts = val.split(/\s+/);
      if (parts.length < 2) {
        vectorMessage('Introduce dos medidas separadas por espacio: x y (ej: -20 0)');
        return;
      }
      const userX = Number(parts[0]);
      const userY = Number(parts[1]);
      if (!Number.isFinite(userX) || !Number.isFinite(userY)) {
        vectorMessage('Medidas no válidas. Introduce dos números separados por espacio (ej: -20 0)');
        return;
      }
      // Convención de ejes solicitada:
      // x negativo: izquierda, x positivo: derecha -> dx = userX
      // y negativo: abajo, y positivo: arriba -> dy = -userY (en canvas +Y es hacia abajo)
      const dx = userX;
      const dy = -userY;
      const isCopy = document.getElementById('vector-box-is-copy')?.checked || false;

      try {
        const count = vectorSelection.items.length;
        const model = VectorCAD.stretch(state.dieline, vectorSelection.box, dx, dy, isCopy);
        vectorSelection = null;
        commitVectorEdit(model);
        vectorMessage(isCopy
          ? `Copia realizada con éxito (${count} trazos).`
          : `Líneas estiradas y desplazadas: x = ${userX} mm, y = ${userY} mm.`);
        const m = document.getElementById('vector-tool-modal');
        if (m) m.hidden = true;
      } catch (err) {
        vectorMessage(err.message || String(err));
      }
    }

    const btnApplyBox = document.getElementById('vector-btn-apply-box');
    if (btnApplyBox) btnApplyBox.onclick = applyBoxMoveOrCopy;

    const btnCancelBox = document.getElementById('vector-btn-cancel-box');
    if (btnCancelBox) btnCancelBox.onclick = () => {
      vectorSelection = null;
      vectorRefreshControls();
      const m = document.getElementById('vector-tool-modal');
      if (m) m.hidden = true;
    };

    function deleteCurrentVectorSelection() {
      if (!vectorSelection) return;
      if (vectorSelection.type === 'multi' && vectorSelection.items?.length) {
        try {
          const count = vectorSelection.items.length;
          const box = vectorSelection.box || null;
          const model = VectorCAD.deleteSegments(state.dieline, vectorSelection.items, box);
          vectorSelection = null;
          commitVectorEdit(model);
          vectorMessage(`${count} trazos eliminados.`);
        } catch (err) {
          vectorMessage(err.message || String(err));
        }
      } else if (vectorSelection.type === 'hole') {
        const face = state.dieline?.faces?.[vectorSelection.face];
        const hole = face?.holes?.[vectorSelection.index];
        if (hole) {
          try {
            const model = VectorCAD.deleteHole(state.dieline, hole);
            vectorSelection = null;
            commitVectorEdit(model);
            vectorMessage('Agujero eliminado.');
          } catch (err) {
            vectorMessage(err.message || String(err));
          }
        }
      } else if (vectorSelection.type === 'dimension' && vectorSelection.arrow) {
        const targetArrow = vectorSelection.arrow;
        if (Array.isArray(state.dieline?.sizeArrowData)) {
          state.dieline.sizeArrowData = state.dieline.sizeArrowData.filter(a => a !== targetArrow && a.id !== targetArrow.id);
        }
        if (Array.isArray(state.dieline?.outsideArrowData)) {
          state.dieline.outsideArrowData = state.dieline.outsideArrowData.filter(a => a !== targetArrow && a.id !== targetArrow.id);
        }
        vectorSelection = null;
        vectorMessage('Cota eliminada.');
      } else if (vectorSelection.type === 'line' || vectorSelection.kind) {
        try {
          const model = VectorCAD.erase(state.dieline, vectorSelection);
          vectorSelection = null;
          commitVectorEdit(model);
          vectorMessage('Trazo eliminado.');
        } catch (err) {
          vectorMessage(err.message || String(err));
        }
      }
      const m = document.getElementById('vector-tool-modal');
      if (m) m.hidden = true;
      render2FDieline();
    }

    const btnDeleteBox = document.getElementById('vector-btn-delete-box');
    if (btnDeleteBox) btnDeleteBox.onclick = deleteCurrentVectorSelection;

    const btnDeleteDim = document.getElementById('vector-btn-delete-dim');
    if (btnDeleteDim) btnDeleteDim.onclick = deleteCurrentVectorSelection;

    function assignSelectedDim(code) {
      if (vectorSelection?.type !== 'dimension' || !vectorSelection?.arrow) {
        vectorMessage('Selecciona una cota primero.');
        return;
      }
      const arrow = vectorSelection.arrow;
      arrow.lineName = code;
      arrow.isMain = true;
      const val = Number(arrow.lineLength) || (code === 'L' ? state.paramL : code === 'W' ? state.paramW : state.paramH);
      if (code === 'L') {
        state.paramL = +val.toFixed(1);
        const lInp = document.getElementById('input-length');
        if (lInp) lInp.value = state.paramL;
      } else if (code === 'W') {
        state.paramW = +val.toFixed(1);
        const wInp = document.getElementById('input-width');
        if (wInp) wInp.value = state.paramW;
      } else if (code === 'H') {
        state.paramH = +val.toFixed(1);
        const hInp = document.getElementById('input-height');
        if (hInp) hInp.value = state.paramH;
      }
      if (!Array.isArray(state.dieline.sizeArrowData)) state.dieline.sizeArrowData = [];
      state.dieline.sizeArrowData = state.dieline.sizeArrowData.filter(a => a === arrow || a.lineName !== code);
      if (!state.dieline.sizeArrowData.includes(arrow)) state.dieline.sizeArrowData.push(arrow);
      vectorSelection = null;
      const m = document.getElementById('vector-tool-modal');
      if (m) m.hidden = true;
      vectorRefreshControls();
      render2FDieline();
      vectorMessage(`Cota asignada como ${code} (${val.toFixed(1)} mm).`);
    }

    const btnDimL = document.getElementById('vector-btn-dim-as-l');
    if (btnDimL) btnDimL.onclick = () => assignSelectedDim('L');
    const btnDimW = document.getElementById('vector-btn-dim-as-w');
    if (btnDimW) btnDimW.onclick = () => assignSelectedDim('W');
    const btnDimH = document.getElementById('vector-btn-dim-as-h');
    if (btnDimH) btnDimH.onclick = () => assignSelectedDim('H');

    const xyInput = document.getElementById('vector-box-xy');
    if (xyInput) {
      xyInput.onkeydown = e => {
        if (e.key === 'Delete' || e.code === 'Delete' || e.key === 'Supr' || e.key === 'Del') {
          e.preventDefault();
          e.stopPropagation();
          deleteCurrentVectorSelection();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          applyBoxMoveOrCopy();
        }
      };
    }

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && vectorEditing) {
        vectorDraft = null; vectorSelection = null; boxSelect = null; boxSelectCandidate = null;
        vectorMessage('Operación cancelada.');
        vectorRefreshControls();
      }
      if (vectorEditing && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        applyBoxMoveOrCopy();
      }
      const isDeleteKey = e.key === 'Delete' || e.key === 'Del' || e.code === 'Delete' || e.key === 'Supr' || e.code === 'NumpadDecimal';
      if (vectorEditing && (isDeleteKey || e.key === 'Backspace')) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isEditingOtherInput = (activeTag === 'INPUT' || activeTag === 'TEXTAREA') && document.activeElement !== xyInput && e.key === 'Backspace';
        if (isEditingOtherInput) return;
        if (vectorSelection) {
          e.preventDefault();
          e.stopPropagation();
          deleteCurrentVectorSelection();
        }
      }
    });
    document.getElementById('vector-apply-kind').onclick=()=>{if(!vectorLine())return;try {const model=VectorCAD.classify(state.dieline,vectorSelection,document.getElementById('vector-kind').value==='fold'?'fold':'cut');vectorSelection=null;commitVectorEdit(model);}catch(error){vectorMessage(error.message);}};
    document.getElementById('vector-apply-hole').onclick=()=>{
      if(vectorSelection?.type!=='hole')return;
      const model=vectorClone(state.dieline),face=model.faces[vectorSelection.face],old=face.holes[vectorSelection.index],b=vectorBounds(old);
      const w=Number(document.getElementById('vector-hole-width').value),h=Number(document.getElementById('vector-hole-height').value),ow=b.maxX-b.minX,oh=b.maxY-b.minY;
      if(!(w>0&&h>0&&ow>0&&oh>0&&Number.isFinite(w)&&Number.isFinite(h))){alert('Indica medidas positivas y válidas.');return;}
      const cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
      const next=old.map(p=>({...p,x:cx+(p.x-cx)*w/ow,y:cy+(p.y-cy)*h/oh}));
      if(!next.every(p=>vectorInside(p,face.polygon)) || vectorEdgesCross(next,face.polygon) ||
        face.holes.some((hole,i)=>i!==vectorSelection.index && (vectorEdgesCross(next,hole) || vectorInside(next[0],hole) || vectorInside(hole[0],next)))) {
        alert('El agujero debe quedar dentro del panel y no cruzar otros agujeros.');return;
      }
      const same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<0.01;
      const matches=[];
      for(let i=0;i<old.length;i++){const j=(i+1)%old.length;const k=model.cutSegments.findIndex(s=>(same({x:s.x1,y:s.y1},old[i])&&same({x:s.x2,y:s.y2},old[j]))||(same({x:s.x2,y:s.y2},old[i])&&same({x:s.x1,y:s.y1},old[j])));if(k<0){alert('Este agujero no tiene un contorno de corte editable de forma segura.');return;}matches.push(k);}
      if(new Set(matches).size!==old.length){alert('No se puede modificar este contorno de forma segura.');return;}
      matches.forEach((k,i)=>{const j=(i+1)%old.length,s=model.cutSegments[k]; if(same({x:s.x1,y:s.y1},old[i])) Object.assign(s,{x1:next[i].x,y1:next[i].y,x2:next[j].x,y2:next[j].y}); else Object.assign(s,{x1:next[j].x,y1:next[j].y,x2:next[i].x,y2:next[i].y});});
      face.holes[vectorSelection.index]=next;commitVectorEdit(model);
    };
    document.getElementById('vector-undo').onclick = handleUndo;
    document.getElementById('vector-redo').onclick = handleRedo;
    const btnVecSave = document.getElementById('vector-save');
    if (btnVecSave) btnVecSave.onclick = saveCurrentProject;
  }

  const PROJECTS_KEY='troqueles-vicente-projects-v1';
  async function readProjects(){
    if(window.__TAURI__?.core?.invoke)return await window.__TAURI__.core.invoke('load_projects');
    return JSON.parse(window.localStorage.getItem(PROJECTS_KEY)||'[]');
  }
  async function saveCurrentProject(){
    if(!state.dieline)return;
    const name=prompt('Nombre del proyecto:',state.fileName.replace(/\.[^.]+$/,'')||'Mi proyecto');
    if(name===null)return;
    if(!name.trim()){alert('Escribe un nombre para el proyecto.');return;}
    const item={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name:name.trim().slice(0,100),geometry:vectorClone(state.dieline),artwork:state.artwork?vectorClone(state.artwork):null,boardCode:state.boardCode,boardId:state.boardId,masterFold:state.masterFold,createdAt:new Date().toISOString()};
    try {
      if(window.__TAURI__?.core?.invoke)await window.__TAURI__.core.invoke('save_project',{project:item});
      else {const projects=await readProjects();projects.unshift(item);window.localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));}
      document.getElementById('project-status').textContent='Proyecto guardado.';
      document.getElementById('vector-status').textContent='Proyecto guardado. La biblioteca no se ha modificado.';
      if(state.activeTab==='projects')await renderProjects();
    }catch(error){alert('No se pudo guardar el proyecto: '+(error.message||error));}
  }
  async function renderProjects(){
    const list=document.getElementById('project-list');list.replaceChildren();
    try{
      const projects=await readProjects();projects.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      if(!projects.length){list.textContent='Todavía no hay proyectos guardados.';return;}
      for(const project of projects){
        const button=document.createElement('button');button.className='btn-outline';button.style.cssText='display:block;width:100%;margin:8px 0;text-align:left';button.textContent=project.name;
        button.onclick=async()=>{try{
          if(!project.geometry||!Array.isArray(project.geometry.faces)||!Array.isArray(project.geometry.cutSegments)||!Array.isArray(project.geometry.foldSegments))throw Error('El proyecto no contiene geometría válida.');
          state.activeFefcoEntry=null;state.boardCode=project.boardCode||'C1';state.caliper=UserLibrary.boardThicknessMm[state.boardCode]||1.5;state.boardId=project.boardId||state.boardId;
          if(project.geometry.faces.length)applyNewDielineModel(vectorClone(project.geometry),project.name,false,false);
          else {clearArtwork();state.fileName=project.name;state.canAddToLibrary=false;state.selectedFaceId=null;state.hingeAngles={};vectorSelection=null;vectorHistory=[];vectorRedo=[];}
          state.baseDieline=vectorClone(project.geometry);state.dieline=vectorClone(project.geometry);state.parametricDieline=state.dieline;syncParametricInputsUI(state.dieline);
          if(project.artwork?.dataUrl)await loadArtworkData(project.artwork.dataUrl,project.artwork);
          rebuild3DMesh();setMasterFold(project.masterFold??.75);render2FDieline();
          document.getElementById('project-status').textContent='Proyecto abierto: '+project.name;
        }catch(error){document.getElementById('project-status').textContent='No se pudo abrir: '+(error.message||error);}};
        list.appendChild(button);
      }
    }catch(error){document.getElementById('project-status').textContent='No se pudieron cargar los proyectos: '+(error.message||error);}
  }

  const USER_LIBRARY_KEY='troqueles-vicente-user-library-v1';
  let userLibraryModels=[];
  let userLibraryReady=Promise.resolve();
  function allCatalogModels(){
    const stock=window.PACDORA_CATALOG_INDEX?.models||window.FEFCO_CATALOG||[];
    return userLibraryModels.concat(stock);
  }
  async function loadUserLibrary(){
    try{
      let result;
      if(window.__TAURI__?.core?.invoke)result=await window.__TAURI__.core.invoke('load_library_models');
      else result={models:JSON.parse(window.localStorage.getItem(USER_LIBRARY_KEY)||'[]'),warnings:[]};
      userLibraryModels=UserLibrary.normalize(result.models);
      if(result.warnings?.length)alert('No se pudieron cargar '+result.warnings.length+' modelos guardados de la biblioteca.');
      if(state.activeTab==='dielines')renderDrawerCatalogList();
    }catch(error){alert('No se pudo cargar tu biblioteca: '+(error.message||error));}
  }
  function initUserLibraryUI(){
    const dialog=document.getElementById('add-library-dialog'),status=document.getElementById('library-model-status');
    const profile=document.getElementById('library-model-board');
    const showProfile=()=>{
      const mm=UserLibrary.boardThicknessMm[profile.value];
      status.textContent='Espesor: '+String(mm).replace('.',',')+' mm. Se conservan los retranqueos y tolerancias del archivo.';
    };
    const openAddLibraryModal=()=>{
      if(!state.dieline) {
        alert('No hay ningún troquel cargado para añadir a la biblioteca.');
        return;
      }
      document.getElementById('library-model-name').value=(state.fileName||'Mi troquel').replace(/\.[^.]+$/,'').slice(0,100);
      profile.value=state.boardCode||'C1';showProfile();dialog.showModal();
    };
    const btnAddLib = document.getElementById('btn-add-library');
    if (btnAddLib) btnAddLib.onclick = openAddLibraryModal;
    const btnHeaderAdd = document.getElementById('btn-header-add-die');
    if (btnHeaderAdd) btnHeaderAdd.onclick = openAddLibraryModal;
    profile.onchange=showProfile;
    document.getElementById('library-model-cancel').onclick=()=>dialog.close();
    document.getElementById('library-model-save').onclick=async()=>{
      const button=document.getElementById('library-model-save');button.disabled=true;
      try{
        await userLibraryReady;
        const name=document.getElementById('library-model-name').value;
        const item=UserLibrary.create(name,profile.value,state.dieline,state.fileName);
        if(window.__TAURI__?.core?.invoke)await window.__TAURI__.core.invoke('add_library_model',{model:item});
        else window.localStorage.setItem(USER_LIBRARY_KEY,JSON.stringify([item,...userLibraryModels]));
        userLibraryModels.unshift(item);state.activeFefcoEntry=item;state.fileName=item.name;
        state.boardCode=item.boardCode;
        state.selectedBoardFilter=item.boardCode;
        state.caliper=UserLibrary.boardThicknessMm[item.boardCode]||1.5;
        state.canAddToLibrary=false;
        document.getElementById('btn-add-library')?.classList.add('hidden');
        dialog.close();rebuild3DMesh();setMasterFold(state.masterFold);updateDielineInfoUI(state.dieline);
        state.catalogCategory='user-models';state.fefcoSearch='';catalogLimit=60;
        document.getElementById('drawer-dielines-search').value='';
        document.querySelectorAll('.cat-chip').forEach(chip=>chip.classList.toggle('active',chip.getAttribute('data-cat-slug')==='user-models'));
        document.querySelectorAll('.board-pill').forEach(pill=>pill.classList.toggle('active',pill.getAttribute('data-board')===item.boardCode));
        document.querySelector('.rail-tab-btn[data-drawer-tab="dielines"]')?.click();
        renderDrawerCatalogList();
      }catch(error){status.textContent=error.message||String(error);}
      finally{button.disabled=false;}
    };
  }

  const FAVORITES_KEY = 'troqueles-vicente-favorites-v1';
  function readFavoriteModels(storage) {
    try {
      const values=JSON.parse((storage||window.localStorage)?.getItem(FAVORITES_KEY)||'[]');
      return new Set(Array.isArray(values)?values.filter(id=>Number.isSafeInteger(id)&&id>0):[]);
    }catch{return new Set();}
  }
  let favoriteModelIds = readFavoriteModels();
  function toggleFavoriteModel(num) {
    const next=new Set(favoriteModelIds);
    if(next.has(num))next.delete(num);else next.add(num);
    try{window.localStorage.setItem(FAVORITES_KEY,JSON.stringify([...next]));}
    catch{alert('No se pudo guardar la selección de preferidos.');return false;}
    favoriteModelIds=next;return true;
  }
  function createFavoriteButton(item) {
    const button=document.createElement('button');button.type='button';button.className='favorite-model-button';
    const update=()=>{
      const active=favoriteModelIds.has(Number(item.num));
      button.setAttribute('aria-pressed',String(active));
      const label=(active?'Quitar de preferidos: ':'Añadir a preferidos: ')+nombreModelo(item)+' #'+item.num;
      button.setAttribute('aria-label',label);button.title=label;
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" fill="'+(active?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    };
    update();
    button.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      if(!toggleFavoriteModel(Number(item.num)))return;
      update();
      if(state.catalogCategory==='FAVORITES')renderDrawerCatalogList();
    });
    return button;
  }

  let catalogPreviewObserver = null;
  let catalogPreviewQueue = Promise.resolve();
  const catalogPreviewCache = new Map();
  let catalogThumbRenderer = null;

  function renderDrawerCatalogList() {
    const listEl = document.getElementById('drawer-models-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    catalogPreviewObserver?.disconnect();
    const previewJobs = new WeakMap();
    const enqueue = card => {
      const item = previewJobs.get(card);
      catalogPreviewQueue = catalogPreviewQueue.then(async () => {
        if (!card.isConnected) return;
        await new Promise(resolve => setTimeout(resolve, 0));
        const flat = card.querySelector('.card-2d-canvas-wrap canvas');
        const folded = card.querySelector('.card-3d-thumb-wrap canvas');
        const cached = catalogPreviewCache.get(Number(item.num));
        if (cached) {
          for (const [target, source] of [[flat,cached.flat],[folded,cached.folded]]) {
            target.width=source.width; target.height=source.height;
            target.getContext('2d').drawImage(source,0,0);
          }
          return;
        }
        let full = item;
        if (!item.userModel && !full.knifeData && item.shard) full = (await loadPacdoraShard(item.shard)).find(x => Number(x.num) === Number(item.num));
        if (!card.isConnected || (!item.userModel && !full?.knifeData)) return;
        const model = item.userModel?item.geometry:DielineEngine.buildDielineModelFromPacdora(full.knifeData, full);
        drawMiniDielinePreview(flat, model);
        drawCatalog3DPreview(folded, model);
        const copy = source => {const c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);return c;};
        catalogPreviewCache.set(Number(item.num), {flat:copy(flat),folded:copy(folded)});
        if (catalogPreviewCache.size > 80) catalogPreviewCache.delete(catalogPreviewCache.keys().next().value);
      }).catch(error => console.error('No se pudo generar la miniatura:', item?.num, error));
    };
    if (window.IntersectionObserver) catalogPreviewObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {catalogPreviewObserver.unobserve(entry.target);enqueue(entry.target);}
    }, {root:listEl, rootMargin:'120px'});

    const allModels = allCatalogModels();

    const catSlug = state.catalogCategory || 'FAVORITES';
    const selectedBoard = state.selectedBoardFilter || 'C1';
    const normalizar = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = normalizar((state.fefcoSearch || '').trim());

    const filtered = allModels.filter(m => {
      const mBoard = m.userModel ? (m.boardCode || 'C1') : 'C1';
      if (selectedBoard !== 'ALL' && mBoard !== selectedBoard) return false;

      const matchCat = catSlug === 'FAVORITES' ? favoriteModelIds.has(Number(m.num)) : (catSlug === 'ALL') ||
        (Array.isArray(m.modelCategories) && m.modelCategories.includes(catSlug)) ||
        (Array.isArray(m.useCategories) && m.useCategories.includes(catSlug));
      if (!matchCat) return false;
      if (!q) return true;
      const hay = normalizar(`${m.fefcoCode || ''} ${m.num} ${m.name} ${nombreModelo(m)} ${m.boardCode||'C1'}`);
      return hay.includes(q);
    });

    const slice = filtered.slice(0, catalogLimit);

    for (const item of slice) {
      const card = document.createElement('div');
      card.className = 'model-preview-card' + (state.activeFefcoEntry && Number(state.activeFefcoEntry.num) === Number(item.num) ? ' active' : '');
      const cleanDesc = nombreModelo(item);

      card.innerHTML = `
        <div class="card-split-previews">
          <div class="card-2d-canvas-wrap">
            <canvas width="120" height="72"></canvas>
          </div>
          <div class="card-3d-thumb-wrap">
            <canvas width="240" height="176" aria-label="Vista 3D del modelo"></canvas>
          </div>
        </div>
        <div class="card-model-title"></div>
        <div class="card-model-sub"></div>
      `;
      card.querySelector('.card-model-title').textContent=cleanDesc;
      const code=item.userModel?item.boardCode:'C1',mm=UserLibrary.boardThicknessMm[code];
      card.querySelector('.card-model-sub').textContent=`${item.userModel?'':'#'+item.num+' · '}${item.length}×${item.width}×${item.height} mm · ${code}${mm?' · '+String(mm).replace('.',',')+' mm':''}`;
      card.title=cleanDesc+' · '+code+(item.userModel?'':' · #'+item.num);
      card.appendChild(createFavoriteButton(item));

      card.addEventListener('click', () => {
        loadFefcoModel(item, true);
      });

      listEl.appendChild(card);
      previewJobs.set(card, item);
      if (catalogPreviewObserver) catalogPreviewObserver.observe(card); else enqueue(card);
    }
    if (filtered.length > catalogLimit) {
      const more = document.createElement('button');
      more.className = 'btn-outline catalog-more';
      more.textContent = `Mostrar más (${filtered.length - catalogLimit} restantes)`;
      more.addEventListener('click', () => { catalogLimit += 60; renderDrawerCatalogList(); });
      listEl.appendChild(more);
    } else if (!filtered.length) {
      if (catSlug === 'FAVORITES' && !q) {
        listEl.textContent = 'Todavía no has marcado troqueles como preferidos en ' + selectedBoard + '.';
      } else if (selectedBoard !== 'C1') {
        listEl.textContent = `No hay troqueles guardados en ${selectedBoard} todavía. Usa «Añadir a biblioteca» para guardar troqueles aquí.`;
      } else {
        listEl.textContent = 'No se encontraron modelos.';
      }
    }
  }

  function drawMiniDielinePreview(canvas, data) {
    if (!canvas || !data) return;
    const model = data.cutSegments ? data : DielineEngine.buildDielineModelFromPacdora(data);
    const ctx = canvas.getContext('2d');
    const w = canvas.width = 240, h = canvas.height = 176;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
    const bounds = model.bounds, pad = 18;
    const scale = Math.min((w-pad*2)/Math.max(1,bounds.width),(h-pad*2)/Math.max(1,bounds.height));
    const ox = (w-bounds.width*scale)/2-bounds.minX*scale;
    const oy = (h-bounds.height*scale)/2-bounds.minY*scale;
    const lines = (segments, color) => {
      ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();
      for (const s of segments) {ctx.moveTo(s.x1*scale+ox,s.y1*scale+oy);ctx.lineTo(s.x2*scale+ox,s.y2*scale+oy);}
      ctx.stroke();
    };
    lines(model.cutSegments,'#6b99ad');
    lines(model.foldSegments,'#b184a0');
  }

  function createCatalogPreviewGroup(model) {
    const root = new THREE.Group();
    const byId = new Map(model.faces.map(f=>[f.id,f]));
    const children = new Map();
    for (const h of model.hinges) {if(!children.has(h.parentFaceId))children.set(h.parentFaceId,[]);children.get(h.parentFaceId).push(h);}
    const materials = [new THREE.MeshStandardMaterial({color:0xd6b98b,roughness:0.9}),new THREE.MeshStandardMaterial({color:0xb79b73,roughness:0.95})];
    for (const material of materials) material.color.convertSRGBToLinear();
    const thickness = Math.max(0.2,Math.min(3,(model.boxDimensionsMm?.depth || 50)*0.03));
    const visited = new Set();
    let baseMesh;
    const build = (id, parent, origin) => {
      const face = byId.get(id);
      if (!face || visited.has(id)) return;
      visited.add(id);
      const shape = new THREE.Shape(face.polygon.map(p=>new THREE.Vector2(p.x,-p.y)));
      for (const hole of face.holes || []) shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(p.x,-p.y))));
      const geometry = new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1,curveSegments:4});
      geometry.translate(-origin.x,-origin.y,-thickness/2);
      const mesh = new THREE.Mesh(geometry,materials);
      parent.add(mesh);
      if (id===model.rootFaceId) baseMesh=mesh;
      for (const h of children.get(id) || []) {
        const p1 = new THREE.Vector3(h.p1.x,-h.p1.y,0),p2 = new THREE.Vector3(h.p2.x,-h.p2.y,0);
        const pivot = new THREE.Group();pivot.position.copy(p1).sub(origin);parent.add(pivot);
        build(h.childFaceId,pivot,p1);
        // Use each model's own fold sequence, with the closure slightly open.
        let degrees = (h.defaultAngle || 0)*0.94;
        if(h.animSteps?.length) degrees=h.animSteps.reduce((sum,step)=>{
          const t=Math.max(0,Math.min(1,(0.94-step.start)/Math.max(0.00001,step.end-step.start)));
          return sum+step.deltaDeg*t*t*(3-2*t);
        },0);
        pivot.setRotationFromAxisAngle(p2.sub(p1).normalize(),THREE.MathUtils.degToRad(degrees));
      }
    };
    const base=byId.get(model.rootFaceId);
    build(model.rootFaceId,root,new THREE.Vector3(base.centroid.x,-base.centroid.y,0));
    root.rotation.x=-Math.PI/2;root.updateMatrixWorld(true);
    if(baseMesh) root.position.y=-new THREE.Box3().setFromObject(baseMesh).min.y;
    root.updateMatrixWorld(true);
    return root;
  }

  function drawCatalog3DPreview(canvas, model) {
    if (!catalogThumbRenderer) {
      catalogThumbRenderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
      catalogThumbRenderer.setSize(240,176);
      catalogThumbRenderer.setClearColor(0xffffff,1);
      catalogThumbRenderer.outputEncoding=THREE.sRGBEncoding;
      catalogThumbRenderer.toneMapping=THREE.ACESFilmicToneMapping;
    }
    const scene = new THREE.Scene();scene.background=new THREE.Color(0xffffff);
    scene.add(new THREE.AmbientLight(0xffffff,0.65));
    const light=new THREE.DirectionalLight(0xffffff,0.75);light.position.set(1,2,3);scene.add(light);
    const group=createCatalogPreviewGroup(model);scene.add(group);
    try {
      const box=new THREE.Box3().setFromObject(group);
      const center=box.getCenter(new THREE.Vector3());
      const radius=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
      const camera=new THREE.PerspectiveCamera(35,240/176,0.1,Math.max(10000,radius*30));
      const distance=radius/Math.sin(THREE.MathUtils.degToRad(35)/2)*1.05;
      camera.position.copy(center).addScaledVector(new THREE.Vector3(0.8,0.65,1).normalize(),distance);
      camera.lookAt(center);
      catalogThumbRenderer.render(scene,camera);
      canvas.width=240;canvas.height=176;
      canvas.getContext('2d').drawImage(catalogThumbRenderer.domElement,0,0);
    } finally {
      const materials=new Set();
      group.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();if(obj.material)for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(mat);});
      for(const mat of materials)mat.dispose();
      scene.remove(group);
    }
  }

  function initFefcoCatalogUI() {
    const pacIndex = window.PACDORA_CATALOG_INDEX;
    const allModels = (pacIndex && Array.isArray(pacIndex.models))
      ? pacIndex.models
      : (window.FEFCO_CATALOG || []);

    const byModelsCats = (pacIndex && pacIndex.byModels) || [];
    const byUsesCats = (pacIndex && pacIndex.byUses) || [];

    state.catalogCategory = state.catalogCategory || 'ALL';
    state.catalogPage = 1;
    const PAGE_SIZE = 48;

    const catSelect = document.getElementById('pacdora-category-select');
    const quickSel = document.getElementById('fefco-quick-select');

    const getModelsForCategory = (catSlug) => {
      if (!catSlug || catSlug === 'ALL') return allModels;
      return allModels.filter(m =>
        (Array.isArray(m.modelCategories) && m.modelCategories.includes(catSlug)) ||
        (Array.isArray(m.useCategories) && m.useCategories.includes(catSlug))
      );
    };

    const populateQuickSelect = (catSlug) => {
      if (!quickSel) return;
      quickSel.innerHTML = '';
      const svgOpt = document.createElement('option');
      svgOpt.value = '__SVG__';
      svgOpt.textContent = '📄 Troquel .SVG Personalizado (b1 caja americana.svg)';
      quickSel.appendChild(svgOpt);

      const list = getModelsForCategory(catSlug);
      // Mostrar hasta 300 en el desplegable rápido o todos los de la categoría seleccionada
      const slice = catSlug === 'ALL' ? list.slice(0, 250) : list;
      for (const item of slice) {
        const opt = document.createElement('option');
        opt.value = String(item.num);
        const prefix = item.fefcoCode ? `${item.fefcoCode} (#${item.num})` : `#${item.num}`;
        opt.textContent = `${prefix} — ${item.name.replace(/FEFCO\s*\d+\s*/i, '').replace(/dieline/i, '').trim()} (${item.length}×${item.width}×${item.height}mm)`;
        quickSel.appendChild(opt);
      }
      if (state.activeFefcoEntry) {
        quickSel.value = String(state.activeFefcoEntry.num);
      }
    };

    if (catSelect) {
      catSelect.innerHTML = '';
      const allOpt = document.createElement('option');
      allOpt.value = 'ALL';
      allOpt.textContent = `🌐 Todas las Categorías (${allModels.length} modelos)`;
      catSelect.appendChild(allOpt);

      if (byModelsCats.length > 0) {
        const grpM = document.createElement('optgroup');
        grpM.label = '📦 By Models (Por Estructura de Caja)';
        for (const c of byModelsCats) {
          const opt = document.createElement('option');
          opt.value = c.slug;
          opt.textContent = `${c.labelEs} (${c.count})`;
          grpM.appendChild(opt);
        }
        catSelect.appendChild(grpM);
      }

      if (byUsesCats.length > 0) {
        const grpU = document.createElement('optgroup');
        grpU.label = '🏷️ By Uses (Por Uso / Sector)';
        for (const c of byUsesCats) {
          const opt = document.createElement('option');
          opt.value = c.slug;
          opt.textContent = `${c.labelEs} (${c.count})`;
          grpU.appendChild(opt);
        }
        catSelect.appendChild(grpU);
      }

      catSelect.value = 'fefco-box-templates';
      populateQuickSelect('fefco-box-templates');

      catSelect.addEventListener('change', (e) => {
        const slug = e.target.value;
        state.catalogCategory = slug;
        state.catalogPage = 1;
        populateQuickSelect(slug);
      });
    } else {
      populateQuickSelect('ALL');
    }

    if (quickSel) {
      quickSel.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '__SVG__') {
          if (window.ARTIOS_DEFAULT_SVG) {
            loadSVGString(window.ARTIOS_DEFAULT_SVG, 'b1 caja americana.svg', true);
          }
          return;
        }
        const entry = allModels.find(x => String(x.num) === val);
        if (entry) loadFefcoModel(entry, true);
      });
    }

    const modalBackdrop = document.getElementById('fefco-modal-backdrop');
    const openBtn1 = document.getElementById('btn-open-fefco-catalog');
    const openBtn2 = document.getElementById('btn-sidebar-fefco');
    const closeBtn = document.getElementById('btn-close-fefco-modal');
    const searchInput = document.getElementById('fefco-search-input');
    const navEl = document.getElementById('pacdora-category-nav');
    const gridEl = document.getElementById('fefco-catalog-grid');
    const countPill = document.getElementById('pacdora-result-count');
    const pageInfoEl = document.getElementById('pacdora-page-info');
    const prevBtn = document.getElementById('btn-catalog-prev');
    const nextBtn = document.getElementById('btn-catalog-next');

    const renderCategorySidebar = () => {
      if (!navEl) return;
      navEl.innerHTML = '';

      const makeItem = (slug, label, count) => {
        const btn = document.createElement('button');
        btn.className = 'pacdora-nav-item' + (state.catalogCategory === slug ? ' active' : '');
        btn.innerHTML = `
          <span>${label}</span>
          <span class="pacdora-nav-count">${count}</span>
        `;
        btn.addEventListener('click', () => {
          state.catalogCategory = slug;
          state.catalogPage = 1;
          if (catSelect) {
            catSelect.value = slug;
            populateQuickSelect(slug);
          }
          renderCategorySidebar();
          renderCatalogGrid();
        });
        return btn;
      };

      navEl.appendChild(makeItem('ALL', '🌐 All Dielines (Todos)', allModels.length));

      if (byModelsCats.length > 0) {
        const h1 = document.createElement('div');
        h1.className = 'pacdora-nav-group-title';
        h1.textContent = '📦 By Models (21 Categorías)';
        navEl.appendChild(h1);
        for (const c of byModelsCats) {
          navEl.appendChild(makeItem(c.slug, `# ${c.name}`, c.count));
        }
      }

      if (byUsesCats.length > 0) {
        const h2 = document.createElement('div');
        h2.className = 'pacdora-nav-group-title';
        h2.textContent = '🏷️ By Uses (16 Sectores)';
        navEl.appendChild(h2);
        for (const c of byUsesCats) {
          navEl.appendChild(makeItem(c.slug, `# ${c.name}`, c.count));
        }
      }
    };

    const getFilteredModels = () => {
      const q = (state.fefcoSearch || '').trim().toLowerCase();
      const base = getModelsForCategory(state.catalogCategory);
      if (!q) return base;
      return base.filter(item => {
        const hay = `${item.fefcoCode || ''} ${item.num} ${item.name}`.toLowerCase();
        return hay.includes(q);
      });
    };

    const renderCatalogGrid = () => {
      if (!gridEl) return;
      gridEl.innerHTML = '';
      const filtered = getFilteredModels();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (state.catalogPage > totalPages) state.catalogPage = totalPages;
      if (state.catalogPage < 1) state.catalogPage = 1;

      if (countPill) countPill.textContent = `${filtered.length.toLocaleString()} modelos`;
      if (pageInfoEl) pageInfoEl.textContent = `Pág. ${state.catalogPage} / ${totalPages}`;
      if (prevBtn) prevBtn.disabled = state.catalogPage <= 1;
      if (nextBtn) nextBtn.disabled = state.catalogPage >= totalPages;

      const startIdx = (state.catalogPage - 1) * PAGE_SIZE;
      const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

      // Agrupar por shard para cargar bajo demanda las geometrías vectoriales de las tarjetas visibles
      const shardsNeeded = new Set();
      for (const item of pageItems) {
        if (item.shard) shardsNeeded.add(item.shard);
      }

      const cardCanvasMap = new Map();

      for (const item of pageItems) {
        const card = document.createElement('div');
        card.className = 'fefco-card' + (state.activeFefcoEntry && Number(state.activeFefcoEntry.num) === Number(item.num) ? ' active' : '');
        const cleanDesc = item.name.replace(/FEFCO\s*\d+\s*/i, '').replace(/dieline/i, '').trim();
        const badgeText = item.fefcoCode ? item.fefcoCode : `MOD #${item.num}`;

        card.innerHTML = `
          <div class="fefco-card-preview">
            <canvas width="210" height="112"></canvas>
          </div>
          <div class="fefco-card-top">
            <span class="fefco-code-badge">${badgeText}</span>
            <span class="fefco-num-badge">#${item.num}</span>
          </div>
          <div class="fefco-card-title">${cleanDesc || item.name}</div>
          <div class="fefco-card-dims">
            <span>${item.length} × ${item.width} × ${item.height} mm</span>
            <span>${item.facesCount || (item.knifeData ? item.knifeData.faces.length : '1:1')} caras</span>
          </div>
        `;
        const cvs = card.querySelector('canvas');
        cardCanvasMap.set(Number(item.num), cvs);

        if (item.knifeData && item.knifeData.faces) {
          drawMiniDielinePreview(cvs, item.knifeData);
        }

        card.addEventListener('click', () => {
          if (modalBackdrop) modalBackdrop.classList.add('hidden');
          loadFefcoModel(item, true);
        });
        gridEl.appendChild(card);
      }

      gridEl.scrollTop = 0;

      // Cargar asíncronamente los archivos modulares necesarios para dibujar el plano vectorial 2D en cada tarjeta visible
      for (const shardKey of shardsNeeded) {
        loadPacdoraShard(shardKey).then(shardList => {
          for (const fullItem of shardList) {
            const cvs = cardCanvasMap.get(Number(fullItem.num));
            if (cvs && fullItem.knifeData) {
              drawMiniDielinePreview(cvs, fullItem.knifeData);
            }
          }
        });
      }
    };

    const openModal = () => {
      if (!modalBackdrop) return;
      modalBackdrop.classList.remove('hidden');
      renderCategorySidebar();
      renderCatalogGrid();
    };

    if (openBtn1) openBtn1.addEventListener('click', openModal);
    if (openBtn2) openBtn2.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', () => modalBackdrop.classList.add('hidden'));
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) modalBackdrop.classList.add('hidden');
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.fefcoSearch = e.target.value;
        state.catalogPage = 1;
        renderCatalogGrid();
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.catalogPage > 1) {
          state.catalogPage--;
          renderCatalogGrid();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        state.catalogPage++;
        renderCatalogGrid();
      });
    }
  }

  function openDxfImport(text, filename) {
    try {
      const cad=CadIO.parse(text),dialog=document.getElementById('cad-import-dialog');
      const list=document.getElementById('cad-layer-roles'),status=document.getElementById('cad-import-status');
      list.replaceChildren();status.textContent='';
      document.getElementById('cad-unit-scale').value=cad.mmPerUnit||1;
      document.getElementById('cad-import-summary').textContent=(cad.mmPerUnit?'Unidades detectadas.':'El archivo no declara unidades: confirma la escala (1 = mm; 10 = cm; 25,4 = pulgadas).')+' '+cad.warnings.join(' ');
      const roles={};
      for(const group of cad.groups){
        const row=document.createElement('label');row.className='cad-layer-row';
        const title=document.createElement('span');title.textContent=group.layer+' · color '+group.color+' · '+group.polylines.length+' trazados';
        const select=document.createElement('select');select.setAttribute('aria-label','Tipo de línea de '+group.layer);
        for(const [value,label]of [['cut','Corte'],['fold','Hendido'],['ignore','Ignorar']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);}
        select.value=group.role;roles[group.id]=group.role;select.onchange=()=>{roles[group.id]=select.value;};row.append(title,select);list.appendChild(row);
      }
      document.getElementById('cad-import-cancel').onclick=()=>dialog.close();
      document.getElementById('cad-import-apply').onclick=()=>{
        try{
          const svg=CadIO.toSvg(cad,roles,Number(document.getElementById('cad-unit-scale').value));
          const model=DielineEngine.buildDielineModel(svg);
          if(!model.faces.length)throw new Error('No se encontraron paneles cerrados. Revisa los cortes y los hendidos.');
          model.boxDimensionsMm=DielineEngine.dimensionsFromBase(model);
          state.svgText=svg;state.activeFefcoEntry=null;
          state.boardCode='C1';state.caliper=1.5;
          applyNewDielineModel(model,filename,true,true);dialog.close();
          if(model.hinges.length<model.faces.length-1)document.getElementById('param-sync-status').textContent='DXF abierto · hay paneles sin unión: revisa los hendidos';
        }catch(error){status.textContent=error.message;}
      };
      dialog.showModal();
    }catch(error){alert('No se pudo abrir el DXF: '+error.message);}
  }

  let artworkImage=null,artworkCanvas=null,artworkTextureCanvas=null,artworkDrag=null,artworkFrame=0;
  function clearArtwork(){
    state.artwork=null;state.artworkEditing=false;artworkImage=null;artworkCanvas=null;artworkTextureCanvas=null;
    state.customArtworkTex?.dispose();state.customArtworkTex=null;
    document.getElementById('btn-art-settings')?.classList.add('hidden');
    document.getElementById('art-options-dialog')?.close();
  }
  function artworkTargetBounds(){
    if(state.artwork?.scope==='face')return state.dieline.faces.find(f=>f.id===state.artwork.faceId)?.bounds||state.dieline.bounds;
    return state.dieline.bounds;
  }
  function fitArtwork(){
    if(!state.artwork||!artworkImage)return;
    Object.assign(state.artwork,ArtworkLayout.fit(artworkTargetBounds(),artworkImage.naturalWidth,artworkImage.naturalHeight));
    state.artwork.baseWidth=state.artwork.width;state.artwork.baseHeight=state.artwork.height;
    syncArtworkControls();scheduleArtworkRefresh();
  }
  function refreshArtworkAtlas(model){
    if(!model||!state.artwork||!artworkImage)return;
    const bounds=model.bounds,ratio=Math.min(2048/Math.max(bounds.width,bounds.height),8);
    const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
    artworkCanvas=artworkCanvas||document.createElement('canvas');artworkTextureCanvas=artworkTextureCanvas||document.createElement('canvas');
    for(const canvas of [artworkCanvas,artworkTextureCanvas]){canvas.width=width;canvas.height=height;}
    const ctx=artworkCanvas.getContext('2d');ctx.setTransform(width/bounds.width,0,0,height/bounds.height,-bounds.minX*width/bounds.width,-bounds.minY*height/bounds.height);
    ctx.save();
    if(state.artwork.scope==='face'){
      const face=model.faces.find(f=>f.id===state.artwork.faceId);
      ctx.beginPath();
      if(face)for(const ring of [face.polygon,...(face.holes||[])]){ring.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
      ctx.clip('evenodd');
    }
    const layout=state.artwork;
    ctx.translate(layout.centerX,layout.centerY);ctx.rotate(layout.rotation*Math.PI/180);ctx.scale(layout.mirrorX?-1:1,layout.mirrorY?-1:1);
    ctx.globalAlpha=layout.opacity??1;ctx.drawImage(artworkImage,-layout.width/2,-layout.height/2,layout.width,layout.height);ctx.restore();
    const textureCtx=artworkTextureCanvas.getContext('2d'),board=resolveMaterialFinish(state.boardId);
    textureCtx.fillStyle='#'+board.colorHex.toString(16).padStart(6,'0');textureCtx.fillRect(0,0,width,height);
    const boardImage=getArtiosTexture(board.surfaceTex).image;
    if(boardImage?.width&&boardImage?.height){
      const tileX=130*width/bounds.width,tileY=130*height/bounds.height;
      for(let y=0;y<height;y+=tileY)for(let x=0;x<width;x+=tileX)textureCtx.drawImage(boardImage,x,y,tileX,tileY);
    }
    textureCtx.drawImage(artworkCanvas,0,0);
    if(!state.customArtworkTex){
      state.customArtworkTex=new THREE.CanvasTexture(artworkTextureCanvas);
      state.customArtworkTex.encoding=THREE.sRGBEncoding;
      state.customArtworkTex.wrapS=state.customArtworkTex.wrapT=THREE.ClampToEdgeWrapping;
      if(renderer)state.customArtworkTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    }
    state.customArtworkTex.image=artworkTextureCanvas;state.customArtworkTex.needsUpdate=true;
  }
  function drawArtwork2D(ctx,tf,model){
    if(!artworkCanvas||!state.artwork)return;
    for(const face of model.faces){
      ctx.save();ctx.beginPath();
      for(const ring of [face.polygon,...(face.holes||[])]){ring.forEach((p,i)=>i?ctx.lineTo(tf.toScreenX(p.x),tf.toScreenY(p.y)):ctx.moveTo(tf.toScreenX(p.x),tf.toScreenY(p.y)));ctx.closePath();}
      ctx.clip('evenodd');ctx.drawImage(artworkCanvas,tf.toScreenX(model.bounds.minX),tf.toScreenY(model.bounds.minY),model.bounds.width*tf.scale,model.bounds.height*tf.scale);ctx.restore();
    }
    if(state.artworkEditing){
      ctx.save();ctx.setLineDash([5,4]);ctx.lineWidth=1.5;ctx.strokeStyle='#0788c6';ctx.beginPath();
      ArtworkLayout.corners(state.artwork).forEach((p,i)=>i?ctx.lineTo(tf.toScreenX(p.x),tf.toScreenY(p.y)):ctx.moveTo(tf.toScreenX(p.x),tf.toScreenY(p.y)));ctx.closePath();ctx.stroke();ctx.restore();
    }
  }
  function scheduleArtworkRefresh(){
    if(!artworkFrame)artworkFrame=requestAnimationFrame(()=>{artworkFrame=0;refreshArtworkAtlas(state.dieline);render2FDieline();});
  }
  async function loadArtworkData(dataUrl,saved=null){
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo leer la imagen.'));img.src=dataUrl;});
    if(!state.dieline)throw new Error('Abre primero un troquel.');
    artworkImage=image;
    const fit=ArtworkLayout.fit(state.dieline.bounds,image.naturalWidth,image.naturalHeight);
    state.artwork=saved?{...saved,dataUrl}:{...fit,dataUrl,scope:'all',faceId:state.selectedFaceId,baseWidth:fit.width,baseHeight:fit.height};
    refreshArtworkAtlas(state.dieline);rebuild3DMesh();setMasterFold(state.masterFold);render2FDieline();
    document.getElementById('btn-art-settings').classList.remove('hidden');
  }
  async function applyCustomArtworkFile(file){
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      await loadArtworkData(dataUrl);
      state.artworkEditing=true;state.toolMode='select';vectorDraft=null;vectorSelection=null;
      openArtworkOptions();render2FDieline();
    }catch(error){alert('No se pudo cargar el arte: '+(error.message||error));}
  }
  function syncArtworkControls(){
    if(!state.artwork||!state.dieline)return;
    const layout=state.artwork,bounds=artworkTargetBounds(),centerX=bounds.minX+bounds.width/2,centerY=bounds.minY+bounds.height/2;
    const set=(id,value)=>{const el=document.getElementById(id);if(el&&el!==document.activeElement)el.value=Number(value.toFixed(3));};
    set('art-scale',layout.width/(layout.baseWidth||layout.width)*100);set('art-scale-num',layout.width/(layout.baseWidth||layout.width)*100);
    set('art-x',layout.centerX-centerX);set('art-y',layout.centerY-centerY);set('art-angle',layout.rotation);set('art-angle-num',layout.rotation);
    document.getElementById('art-scope').value=layout.scope;
    document.getElementById('art-mirror-x').checked=layout.mirrorX;document.getElementById('art-mirror-y').checked=layout.mirrorY;
    document.getElementById('art-drag').setAttribute('aria-pressed',String(state.artworkEditing));
  }
  function openArtworkOptions(){if(!state.artwork)return;syncArtworkControls();const dialog=document.getElementById('art-options-dialog');if(!dialog.open)dialog.show();}
  function initArtworkControls(){
    const close=()=>{state.artworkEditing=false;artworkDrag=null;document.getElementById('art-options-dialog').close();render2FDieline();};
    document.getElementById('art-options-close').onclick=close;document.getElementById('art-options-done').onclick=close;
    document.getElementById('art-fit').onclick=fitArtwork;
    document.getElementById('art-scope').onchange=e=>{if(!state.artwork)return;state.artwork.scope=e.target.value;state.artwork.faceId=state.selectedFaceId;fitArtwork();};
    for(const id of ['art-scale','art-scale-num','art-x','art-y','art-angle','art-angle-num'])document.getElementById(id).addEventListener('input',e=>{
      if(!state.artwork||e.target.value==='')return;
      const value=Number(e.target.value);if(!Number.isFinite(value))return;
      const layout=state.artwork,bounds=artworkTargetBounds();
      if(id.startsWith('art-scale')){const scale=Math.max(1,Math.min(1000,value))/100;layout.width=layout.baseWidth*scale;layout.height=layout.baseHeight*scale;}
      else if(id==='art-x')layout.centerX=bounds.minX+bounds.width/2+value;
      else if(id==='art-y')layout.centerY=bounds.minY+bounds.height/2+value;
      else layout.rotation=Math.max(-180,Math.min(180,value));
      syncArtworkControls();scheduleArtworkRefresh();
    });
    for(const [id,key] of [['art-mirror-x','mirrorX'],['art-mirror-y','mirrorY']])document.getElementById(id).onchange=e=>{if(state.artwork){state.artwork[key]=e.target.checked;scheduleArtworkRefresh();}};
    document.getElementById('art-drag').onclick=()=>{state.artworkEditing=!state.artworkEditing;syncArtworkControls();render2FDieline();};
  }

  function updatePlayButtonUI() {
    const playBtn = document.getElementById('btn-play-fold');
    if (!playBtn) return;
    playBtn.innerHTML = state.isPlaying
      ? '⏸ Pausar Animación'
      : '▶ Animar Plegado 3D';
    playBtn.classList.toggle('playing', state.isPlaying);
  }

  function updateBoardBadgeUI(board) {
    const fluteEl = document.getElementById('board-flute-code');
    const lossEl = document.getElementById('board-loss-gain');
    const texEl = document.getElementById('board-tex-info');
    if (fluteEl) fluteEl.textContent = `Onda ${board.flute} (${board.grammage} g/m²)`;
    if (lossEl) lossEl.textContent = `-${board.insideLoss} / +${board.outsideGain} mm`;
    if (texEl) texEl.textContent = `${board.surfaceTex} + ${board.edgeTex}`;
  }

  function updateDielineInfoUI(model) {
    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    const dims = model.boxDimensionsMm || { length: 315, width: 202, depth: 62 };
    const numId = (model.pacdoraMeta && model.pacdoraMeta.num) ? model.pacdoraMeta.num : 'SVG';
    setTxt('info-model-id', String(numId));

    // Manufacturing: L × W × H mm
    setTxt('info-dim-mfg', `${dims.length} × ${dims.width} × ${dims.depth} mm`);

    // Inner & Outer
    const innerDims = (model.solverDimensions && model.solverDimensions.inner)
      ? `${model.solverDimensions.inner.L ?? model.solverDimensions.inner.length} × ${model.solverDimensions.inner.W ?? model.solverDimensions.inner.width} × ${model.solverDimensions.inner.H ?? model.solverDimensions.inner.height} mm`
      : 'No disponible';
    setTxt('info-dim-inner', innerDims);

    const outerDims = (model.solverDimensions && model.solverDimensions.outer)
      ? `${model.solverDimensions.outer.L ?? model.solverDimensions.outer.length} × ${model.solverDimensions.outer.W ?? model.solverDimensions.outer.width} × ${model.solverDimensions.outer.H ?? model.solverDimensions.outer.height} mm`
      : 'No disponible';
    setTxt('info-dim-outer', outerDims);

    // Dieline statistics
    const bw = model.bounds ? model.bounds.width.toFixed(1) : '578';
    const bh = model.bounds ? model.bounds.height.toFixed(1) : '590';
    setTxt('info-stat-area', `${bw} × ${bh} mm`);

    const cutL = (model.totalCutLengthMm ?? 0).toFixed(2);
    setTxt('info-stat-cut', `${cutL} mm`);

    const creaseL = (model.totalFoldLengthMm ?? 0).toFixed(1);
    setTxt('info-stat-crease', `${creaseL} mm`);

    selectFace(model.rootFaceId);
  }

  function buildHingeSlidersUI(model) {
    const list = document.getElementById('hinges-slider-list');
    if (!list) return;
    list.innerHTML = '';

    const faceById = new Map();
    for (const f of model.faces) faceById.set(f.id, f);

    for (const h of model.hinges) {
      const child = faceById.get(h.childFaceId);
      const label = child ? child.label : `Bisagra #${h.id}`;
      const isSelected = state.selectedHinges?.has(h.id);

      const row = document.createElement('div');
      row.className = 'hinge-control-row' + (isSelected ? ' selected-hinge-row' : '');
      row.setAttribute('data-hinge-id', h.id);
      row.innerHTML = `
        <div class="hinge-row-header" style="cursor:pointer;" title="Haz clic para seleccionar/deseleccionar esta bisagra">
          <input type="checkbox" class="hinge-select-chk" ${isSelected ? 'checked' : ''} style="cursor:pointer;margin-right:6px;" />
          <span class="hinge-label" title="${label}" style="flex:1;">${label}</span>
          <span class="hinge-len">${h.length.toFixed(1)} mm</span>
          <div class="num-input-wrap" title="Escribe el ángulo (-180° a 180°)">
            <input type="number" id="hinge-num-${h.id}" min="-180" max="180" step="1" value="${Math.round(state.hingeAngles[h.id] || 0)}" class="cad-num-input hinge-num" />
            <span class="num-unit">°</span>
          </div>
        </div>
        <input type="range" id="hinge-slider-${h.id}" min="-180" max="180" step="1" value="${Math.round(state.hingeAngles[h.id] || 0)}" class="cad-slider hinge-slider" />
      `;

      const slider = row.querySelector(`#hinge-slider-${h.id}`);
      const numInput = row.querySelector(`#hinge-num-${h.id}`);
      const chk = row.querySelector('.hinge-select-chk');

      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        if (chk.checked) state.selectedHinges.add(h.id);
        else state.selectedHinges.delete(h.id);
        updateHingeSelectionUI();
        render2FDieline();
      });

      row.querySelector('.hinge-row-header').addEventListener('click', (e) => {
        if (e.target === chk || e.target === numInput) return;
        if (state.selectedHinges.has(h.id)) state.selectedHinges.delete(h.id);
        else state.selectedHinges.add(h.id);
        updateHingeSelectionUI();
        render2FDieline();
      });

      bindSliderAndNumeric(slider, numInput, -180, 180, 1, 0, (val) => {
        state.isPlaying = false;
        updatePlayButtonUI();
        state.hingeAngles[h.id] = val;
        applyFoldAngles();
      });

      row.addEventListener('mouseenter', () => {
        if (child) {
          state.hoveredFaceId = child.id;
          updateSelectionHighlight();
          render2FDieline();
        }
      });

      list.appendChild(row);
    }
    updateHingeSelectionUI();
  }

  function syncHingeSlidersFromAngles() {
    if (!state.dieline?.hinges) return;
    for (const h of state.dieline.hinges) {
      const angle = Math.round(state.hingeAngles[h.id] || 0);
      const s = document.getElementById(`hinge-slider-${h.id}`);
      const n = document.getElementById(`hinge-num-${h.id}`);
      if (s) s.value = angle;
      if (n && document.activeElement !== n) n.value = angle;
    }
  }

  function updateHingeSelectionUI() {
    const count = state.selectedHinges ? state.selectedHinges.size : 0;
    const total = state.dieline?.hinges?.length || 0;
    const status = document.getElementById('selected-hinges-status');
    const label = document.getElementById('selected-hinges-label');
    const btnTool = document.getElementById('btn-select-hinges-tool');
    if (btnTool) btnTool.classList.toggle('active', !!state.hingeSelectionMode);

    if (status) {
      if (state.hingeSelectionMode) {
        status.innerHTML = `<span style="color:#0284c7;font-weight:600;">Modo selección activo:</span> Toca líneas rojas en el plano 2D para seleccionarlas (${count} de ${total}).`;
      } else if (count > 0) {
        status.innerHTML = `<strong>${count}</strong> hendido(s) seleccionado(s) de ${total}.`;
      } else {
        status.textContent = 'Pulsa «Seleccionar» y toca las líneas de hendido (rojas) en el plano 2D para elegirlas.';
      }
    }
    if (label) {
      label.textContent = count > 0 ? `Rotar seleccionados (${count})` : 'Rotar seleccionados';
    }

    const list = document.getElementById('hinges-slider-list');
    if (list && state.dieline?.hinges) {
      for (const h of state.dieline.hinges) {
        const isSel = state.selectedHinges.has(h.id);
        const row = list.querySelector(`.hinge-control-row[data-hinge-id="${h.id}"]`);
        if (row) {
          row.classList.toggle('selected-hinge-row', isSel);
          const chk = row.querySelector('.hinge-select-chk');
          if (chk) chk.checked = isSel;
        }
      }
    }

    if (count > 0) {
      const firstId = state.selectedHinges.values().next().value;
      const angle = Math.round(state.hingeAngles[firstId] || 0);
      const selSlider = document.getElementById('selected-hinges-slider');
      const selNum = document.getElementById('selected-hinges-num');
      if (selSlider) selSlider.value = angle;
      if (selNum && document.activeElement !== selNum) selNum.value = angle;
    }
  }

  function initHingeMoreControls() {
    const btnSelectAll = document.getElementById('btn-select-all-hinges');
    if (btnSelectAll) {
      btnSelectAll.onclick = () => {
        if (!state.dieline?.hinges) return;
        state.selectedHinges = new Set(state.dieline.hinges.map(h => h.id));
        updateHingeSelectionUI();
        render2FDieline();
      };
    }

    const allSlider = document.getElementById('all-hinges-slider');
    const allNum = document.getElementById('all-hinges-num');
    if (allSlider && allNum) {
      bindSliderAndNumeric(allSlider, allNum, -180, 180, 1, 0, (val) => {
        if (!state.dieline?.hinges) return;
        state.isPlaying = false;
        updatePlayButtonUI();
        for (const h of state.dieline.hinges) {
          state.hingeAngles[h.id] = val;
        }
        applyFoldAngles();
        syncHingeSlidersFromAngles();
        const selSlider = document.getElementById('selected-hinges-slider');
        const selNum = document.getElementById('selected-hinges-num');
        if (selSlider) selSlider.value = val;
        if (selNum && document.activeElement !== selNum) selNum.value = val;
      });
    }

    const btnSelectTool = document.getElementById('btn-select-hinges-tool');
    if (btnSelectTool) {
      btnSelectTool.onclick = () => {
        state.hingeSelectionMode = !state.hingeSelectionMode;
        btnSelectTool.classList.toggle('active', state.hingeSelectionMode);
        updateHingeSelectionUI();
      };
    }

    const btnClear = document.getElementById('btn-clear-selected-hinges');
    if (btnClear) {
      btnClear.onclick = () => {
        state.selectedHinges.clear();
        updateHingeSelectionUI();
        render2FDieline();
      };
    }

    const selSlider = document.getElementById('selected-hinges-slider');
    const selNum = document.getElementById('selected-hinges-num');
    if (selSlider && selNum) {
      bindSliderAndNumeric(selSlider, selNum, -180, 180, 1, 0, (val) => {
        if (!state.dieline?.hinges || !state.selectedHinges.size) return;
        state.isPlaying = false;
        updatePlayButtonUI();
        for (const hId of state.selectedHinges) {
          state.hingeAngles[hId] = val;
        }
        applyFoldAngles();
        syncHingeSlidersFromAngles();
      });
    }
  }

  // ============================================================================
  // EXPORTACIÓN ADICIONAL (CAPTURA PNG Y MODELO 3D .OBJ EN ESCALA 1:1 MM)
  // ============================================================================
  function exportPNGSnapshot() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    renderer.domElement.toBlob(blob => {
      if (blob) saveExport(blob, `${state.fileName.replace(/\.[^.]+$/, '')}_3D_${state.caliper}mm.png`);
    }, 'image/png');
  }

  function exportOBJModel() {
    if (!dielineRootGroup) return;
    dielineRootGroup.updateMatrixWorld(true);

    let obj = `# Exportado por ArtiosCAD 3D Web Engine (Escala 1:1 en milimetros)\n`;
    obj += `# Archivo origen: ${state.fileName} | Cartón: ${state.boardId} (${state.caliper} mm)\n\n`;

    let vertexOffset = 1;
    const vTemp = new THREE.Vector3();

    for (const [fid, item] of faceMeshMap.entries()) {
      const mesh = item.mesh;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;

      obj += `o Panel_${fid}_${item.face.role}\n`;
      for (let i = 0; i < pos.count; i++) {
        vTemp.fromBufferAttribute(pos, i);
        vTemp.applyMatrix4(mesh.matrixWorld);
        obj += `v ${vTemp.x.toFixed(4)} ${vTemp.y.toFixed(4)} ${vTemp.z.toFixed(4)}\n`;
      }

      for (let i = 0; i < pos.count; i += 3) {
        const a = vertexOffset + i;
        const b = vertexOffset + i + 1;
        const c = vertexOffset + i + 2;
        obj += `f ${a} ${b} ${c}\n`;
      }
      vertexOffset += pos.count;
      obj += `\n`;
    }

    const blob = new Blob([obj], { type: 'text/plain;charset=utf-8' });
    saveExport(blob, `${state.fileName.replace(/\.[^.]+$/, '')}_${state.caliper}mm.obj`);
  }

  // ============================================================================
  // BUCLE DE ANIMACIÓN Y RENDERIZADO
  // ============================================================================
  let lastTime = performance.now();

  function animateLoop(now) {
    requestAnimationFrame(animateLoop);

    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (state.isPlaying) {
      let nextFold = state.masterFold + state.playDirection * state.playSpeed * dt;
      if (nextFold >= 1.0) {
        nextFold = 1.0;
        state.isPlaying = false;
        updatePlayButtonUI();
      } else if (nextFold <= 0.0) {
        nextFold = 0.0;
        state.isPlaying = false;
        updatePlayButtonUI();
      }
      setMasterFold(nextFold);
    }

    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }
})();
