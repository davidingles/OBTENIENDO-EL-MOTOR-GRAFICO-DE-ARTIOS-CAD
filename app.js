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

  // ============================================================================
  // ESTADO GLOBAL DE LA APLICACIÓN
  // ============================================================================
  const state = {
    svgText: '',
    fileName: 'b1 caja americana.svg',
    dieline: null,          // Resultado de DielineEngine.buildDielineModel()
    boardId: 'M-125B',      // Cartón seleccionado de la base de datos ArtiosCAD
    caliper: 3.0,           // Espesor actual en mm (escala 1:1)
    insideLoss: 1.5,        // Pérdida interior de plegado (mm)
    outsideGain: 1.5,       // Ganancia exterior de plegado (mm)
    flute: 'B',
    // Parámetros del Hendido Chafado (Crushed Crease Channel en líneas rojas por ambas caras)
    crushDepthRatio: 0.72,  // 72% de compresión del espesor en la línea roja (ambas caras se hunden hacia z=0)
    creaseWidthFactor: 1.25,// Anchura de la zona chafada a cada lado = 1.25 * espesor (mm)
    masterFold: 0,          // Progreso global de plegado (0.0 a 1.0)
    isPlaying: false,
    playDirection: 1,
    playSpeed: 0.38,        // Velocidad de animación
    standUpBox: true,       // Posicionar caja de pie sobre la base en 3D
    showWireframe: false,
    showCreaseLines3D: false,// Desactivado por defecto para apreciar limpio el surco chafado 3D
    showCutLines3D: true,
    showDimensions3D: true,
    showGrid: true,
    selectedFaceId: null,
    hoveredFaceId: null,
    viewMode: 'split',      // 'split' | '3d' | '2d'
    customArtworkTex: null,
    customArtworkFlipY: false,
    hingeAngles: {},
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

  // ============================================================================
  // INICIALIZACIÓN
  // ============================================================================
  window.addEventListener('DOMContentLoaded', () => {
    initUIControls();
    initThreeJS();
    init2DCanvasInteractions();

    if (window.ARTIOS_DEFAULT_SVG) {
      loadSVGString(window.ARTIOS_DEFAULT_SVG, 'b1 caja americana.svg', true);
    } else {
      fetch('b1 caja americana.svg')
        .then(r => r.text())
        .then(txt => loadSVGString(txt, 'b1 caja americana.svg', true))
        .catch(err => console.error('No se pudo cargar el SVG inicial:', err));
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
    scene.background = new THREE.Color(0x0f141c);

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

    gridHelper = new THREE.GridHelper(1000, 50, 0x2e4568, 0x1a2433);
    gridHelper.position.y = -0.2;
    scene.add(gridHelper);

    const planeGeo = new THREE.PlaneGeometry(2500, 2500);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.34 });
    shadowPlane = new THREE.Mesh(planeGeo, planeMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.15;
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
      : `assets/textures/${fileName}`;

    const tex = loader.load(dataUri, () => {
      tex.needsUpdate = true;
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
    const board = DielineEngine.ARTIOS_BOARDS.find(b => b.id === state.boardId) || DielineEngine.ARTIOS_BOARDS[0];

    const surfaceTex = getArtiosTexture(board.surfaceTex, 1, 1);
    const innerTex = getArtiosTexture(board.innerTex || board.surfaceTex, 1, 1);
    const edgeTex = getArtiosTexture(board.edgeTex, 1, 1);

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
      color: board.innerTex === 'GreyBoard3.JPG' ? 0xb5b3ae : 0xcfa778,
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
  // PROCESAMIENTO DEL ARCHIVO SVG Y CONSTRUCCIÓN DEL MODELO 3D
  // ============================================================================
  function loadSVGString(svgString, fileName, animateIntro = false) {
    try {
      state.svgText = svgString;
      state.fileName = fileName || 'troquel.svg';

      const model = DielineEngine.buildDielineModel(svgString);
      state.dieline = model;
      state.selectedFaceId = model.rootFaceId;

      state.hingeAngles = {};
      for (const h of model.hinges) {
        state.hingeAngles[h.id] = 0;
      }

      updateDielineInfoUI(model);
      buildHingeSlidersUI(model);
      rebuild3DMesh();
      reset2DView();

      if (animateIntro) {
        state.masterFold = 0;
        setMasterFold(0.75);
        fitCameraToModel(true);
      } else {
        applyFoldAngles();
        fitCameraToModel(false);
      }
    } catch (err) {
      console.error('Error procesando el archivo SVG:', err);
      alert('Error al procesar el archivo SVG: ' + err.message);
    }
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
    let subPolys = [face.polygon];
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
        pushVertex(0, v1.x3d, v1.y3d, v1.zOuter, v0.nOx, v0.nOy, v0.nOz, v0.uOut, v1.vOut, v1.shade);
        pushVertex(0, v2.x3d, v2.y3d, v2.zOuter, v2.nOx, v2.nOy, v2.nOz, v2.uOut, v2.vOut, v2.shade);

        // Cara Interior (Grupo 1, mira hacia +Z, orientación CCW vista desde dentro)
        pushVertex(1, v0.x3d, v0.y3d, v0.zInner, v0.nIx, v0.nIy, v0.nIz, v0.uIn, v0.vIn, v0.shade);
        pushVertex(1, v2.x3d, v2.y3d, v2.zInner, v2.nIx, v2.nIy, v2.nIz, v2.uIn, v2.vIn, v2.shade);
        pushVertex(1, v1.x3d, v1.y3d, v1.zInner, v1.nIx, v1.nIy, v1.nIz, v1.uIn, v1.vIn, v1.shade);
      }
    }

    // 3. Generar el Canto Perimetral (Grupo 2: Flauta Corrugada en bordes azules y cierre biselado en líneas rojas)
    // Subdividimos los segmentos del perímetro cuando están cerca de un hendido para que el canto acompañe la curva chafada
    const ring = face.polygon;
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

    function buildFaceNode(faceId, parentContainer, originOffset3D) {
      const face = faceById.get(faceId);
      if (!face) return;

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

    applyFoldAngles();
    updateSelectionHighlight();
  }

  /**
   * Calcula el ángulo objetivo (en grados) de una bisagra para un valor maestro t en [0, 1].
   * La pestaña de pegado (GLUE_FLAP) rota ligeramente más de 90° alrededor de su eje central (z = 0)
   * para alojarse detrás de la Cara Cuerpo 4 usando rotación pura sobre el centro del espesor.
   */
  function computeHingeAngleAtProgress(hinge, childFace, progressT, sequenceMode) {
    let maxDeg = hinge.defaultAngle || 90;
    if (childFace) {
      if (childFace.role === 'GLUE_FLAP') {
        // Ángulo adicional calculado en función del espesor para que entre por el interior de Cara 4
        // manteniendo el eje de rotación estrictamente en el centro del espesor (z = 0)
        const extraDeg = THREE.MathUtils.radToDeg(Math.atan2(state.caliper * 1.02, Math.max(8, childFace.bounds.width * 0.55)));
        maxDeg = 90 + extraDeg;
      } else if (childFace.role === 'FLAP_INNER_TOP' || childFace.role === 'FLAP_INNER_BOTTOM') {
        // Si el espesor del cartón supera el decalaje de ranura (2 mm), las solapas interiores
        // ceden ligeramente hacia adentro para quedar completamente debajo de las solapas exteriores
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

    dielineRootGroup.rotation.set(0, 0, 0);
    dielineRootGroup.position.set(0, 0, 0);

    if (state.standUpBox) {
      dielineRootGroup.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(dielineRootGroup);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        dielineRootGroup.position.set(-center.x, -box.min.y, -center.z);
      }
    } else {
      dielineRootGroup.rotation.x = -Math.PI / 2;
      dielineRootGroup.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(dielineRootGroup);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        dielineRootGroup.position.set(-center.x, -box.min.y, -center.z);
      }
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
    if (!dielineRootGroup || !THREE.GLTFExporter) {
      alert('El exportador GLTF/GLB no está disponible.');
      return;
    }

    // Ocultar temporalmente las líneas auxiliares CAD 3D para que el .GLB en Blender solo tenga la malla sólida limpia
    const hiddenHelpers = [];
    dielineRootGroup.traverse(obj => {
      if (obj.userData && obj.userData.isCADHelper && obj.visible) {
        obj.visible = false;
        hiddenHelpers.push(obj);
      }
    });

    const clips = buildBlenderAnimationClips();
    const exporter = new THREE.GLTFExporter();

    exporter.parse(
      dielineRootGroup,
      (result) => {
        // Restaurar visibilidad de líneas auxiliares
        for (const h of hiddenHelpers) h.visible = true;

        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const baseName = state.fileName.replace(/\.svg$/i, '');
          a.download = `${baseName}_${state.boardId}_${state.caliper}mm_Animado_Blender.glb`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
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

    if (!state.showDimensions3D) return;

    const helper = new THREE.Box3Helper(box, 0x38bdf8);
    helper.material.transparent = true;
    helper.material.opacity = 0.28;
    bboxHelperGroup.add(helper);
  }

  // ============================================================================
  // VISOR CAD 2D INTERACTIVO (CANVAS 2D CON COTA 1:1, CORTE AZUL Y DOBLEZ ROJO)
  // ============================================================================
  function init2DCanvasInteractions() {
    const canvas = document.getElementById('canvas-2d');
    if (!canvas) return;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      state.view2D.zoom = Math.max(0.25, Math.min(12, state.view2D.zoom * factor));
      render2FDieline();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      const hitFace = hitTest2DCanvas(e);
      if (hitFace && e.button === 0 && !e.shiftKey) {
        selectFace(hitFace.id);
      }
      state.view2D.isDragging = true;
      state.view2D.lastX = e.clientX;
      state.view2D.lastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
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
    });
  }

  function reset2DView() {
    state.view2D.zoom = 1;
    state.view2D.panX = 0;
    state.view2D.panY = 0;
    render2FDieline();
  }

  function get2DTransform(canvas, bounds) {
    const pad = 48;
    const availW = Math.max(50, canvas.width - pad * 2);
    const availH = Math.max(50, canvas.height - pad * 2 - 28);
    const baseScale = Math.min(availW / bounds.width, availH / bounds.height);
    const scale = baseScale * state.view2D.zoom;

    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;

    const offsetX = canvas.width / 2 - cx * scale + state.view2D.panX;
    const offsetY = (canvas.height + 18) / 2 - cy * scale + state.view2D.panY;

    return {
      scale,
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
      if (DielineEngine.pointInPolygon({ x: wx, y: wy }, face.polygon)) {
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

    ctx.fillStyle = '#0c1118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const model = state.dieline;
    const bounds = model.bounds;
    const tf = get2DTransform(canvas, bounds);

    const stepMM = 50;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    const startX = Math.floor((bounds.minX - 100) / stepMM) * stepMM;
    const endX = Math.ceil((bounds.maxX + 100) / stepMM) * stepMM;
    const startY = Math.floor((bounds.minY - 100) / stepMM) * stepMM;
    const endY = Math.ceil((bounds.maxY + 100) / stepMM) * stepMM;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += stepMM) {
      const sx = tf.toScreenX(x);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
    }
    for (let y = startY; y <= endY; y += stepMM) {
      const sy = tf.toScreenY(y);
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
    }
    ctx.stroke();

    // 1. Rellenar caras detectadas del troquel
    if (state.view2D.showFaces) {
      for (const face of model.faces) {
        const isSelected = face.id === state.selectedFaceId;
        const isHovered = face.id === state.hoveredFaceId;

        ctx.beginPath();
        face.polygon.forEach((p, idx) => {
          const sx = tf.toScreenX(p.x);
          const sy = tf.toScreenY(p.y);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();

        if (isSelected) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(229, 0, 125, 0.20)';
        } else if (face.role === 'BODY') {
          ctx.fillStyle = 'rgba(198, 156, 109, 0.16)';
        } else if (face.role === 'GLUE_FLAP') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        } else {
          ctx.fillStyle = 'rgba(198, 156, 109, 0.10)';
        }
        ctx.fill();
      }
    }

    // 2. Visualizar banda de chafado del hendido en 2D alrededor de cada línea roja
    const creaseWpx = Math.max(2, state.caliper * state.creaseWidthFactor * 2 * tf.scale);
    ctx.strokeStyle = 'rgba(229, 0, 125, 0.16)';
    ctx.lineWidth = creaseWpx;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const h of model.hinges) {
      ctx.moveTo(tf.toScreenX(h.p1.x), tf.toScreenY(h.p1.y));
      ctx.lineTo(tf.toScreenX(h.p2.x), tf.toScreenY(h.p2.y));
    }
    ctx.stroke();

    // 3. Dibujar líneas de CORTE (AZUL #009ee3)
    ctx.strokeStyle = '#009ee3';
    ctx.lineWidth = Math.max(1.5, 1.8 * dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const seg of model.cutSegments) {
      ctx.moveTo(tf.toScreenX(seg.x1), tf.toScreenY(seg.y1));
      ctx.lineTo(tf.toScreenX(seg.x2), tf.toScreenY(seg.y2));
    }
    ctx.stroke();

    // 4. Dibujar líneas de DOBLEZ / HENDIDO (ROJO/MAGENTA #e5007d)
    ctx.strokeStyle = '#e5007d';
    ctx.lineWidth = Math.max(1.8, 2.1 * dpr);
    ctx.beginPath();
    for (const h of model.hinges) {
      ctx.moveTo(tf.toScreenX(h.p1.x), tf.toScreenY(h.p1.y));
      ctx.lineTo(tf.toScreenX(h.p2.x), tf.toScreenY(h.p2.y));
    }
    ctx.stroke();

    // 5. Dibujar COTA DE ESCALA 1:1 en milímetros
    if (state.view2D.showCota) {
      const cotaY = tf.toScreenY(bounds.minY) - 20 * dpr;
      const x1 = tf.toScreenX(bounds.minX);
      const x2 = tf.toScreenX(bounds.maxX);

      ctx.strokeStyle = '#e2e8f0';
      ctx.fillStyle = '#e2e8f0';
      ctx.lineWidth = 1.2 * dpr;

      ctx.beginPath();
      ctx.moveTo(x1, tf.toScreenY(bounds.minY) - 4 * dpr);
      ctx.lineTo(x1, cotaY - 6 * dpr);
      ctx.moveTo(x2, tf.toScreenY(bounds.minY) - 4 * dpr);
      ctx.lineTo(x2, cotaY - 6 * dpr);
      ctx.moveTo(x1, cotaY);
      ctx.lineTo(x2, cotaY);
      ctx.stroke();

      const labelW = `${bounds.width.toFixed(2)} mm (Escala 1:1)`;
      ctx.font = `600 ${Math.round(11 * dpr)}px "Inter", system-ui, sans-serif`;
      const tw = ctx.measureText(labelW).width;
      const midX = (x1 + x2) / 2;
      ctx.fillStyle = '#0c1118';
      ctx.fillRect(midX - tw / 2 - 6 * dpr, cotaY - 8 * dpr, tw + 12 * dpr, 16 * dpr);
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelW, midX, cotaY);

      const cotaX = tf.toScreenX(bounds.maxX) + 22 * dpr;
      const y1 = tf.toScreenY(bounds.minY);
      const y2 = tf.toScreenY(bounds.maxY);
      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(tf.toScreenX(bounds.maxX) + 4 * dpr, y1);
      ctx.lineTo(cotaX + 6 * dpr, y1);
      ctx.moveTo(tf.toScreenX(bounds.maxX) + 4 * dpr, y2);
      ctx.lineTo(cotaX + 6 * dpr, y2);
      ctx.moveTo(cotaX, y1);
      ctx.lineTo(cotaX, y2);
      ctx.stroke();

      ctx.save();
      ctx.translate(cotaX, (y1 + y2) / 2);
      ctx.rotate(-Math.PI / 2);
      const labelH = `${bounds.height.toFixed(2)} mm`;
      const thW = ctx.measureText(labelH).width;
      ctx.fillStyle = '#0c1118';
      ctx.fillRect(-thW / 2 - 5 * dpr, -8 * dpr, thW + 10 * dpr, 16 * dpr);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(labelH, 0, 0);
      ctx.restore();
    }

    // 6. Etiquetas de cada cara y sus medidas en mm
    if (state.view2D.showLabels) {
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
        ctx.fillStyle = face.id === state.selectedFaceId ? '#38bdf8' : '#f1f5f9';
        const shortName = face.label.replace('Superior', 'Sup.').replace('Inferior', 'Inf.');
        ctx.fillText(shortName, 0, -6 * dpr);

        ctx.font = `500 ${Math.round(8.5 * dpr)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${face.bounds.width.toFixed(1)}×${face.bounds.height.toFixed(1)}mm`, 0, 6 * dpr);
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
      const pinchedMM = (state.caliper * (1 - state.crushDepthRatio)).toFixed(2);
      selBox.innerHTML = `
        <div class="sel-face-title">${face.label} <span class="badge-id">#${face.id}</span></div>
        <div class="sel-face-grid">
          <div><span>Dimensiones:</span> <strong>${face.bounds.width.toFixed(2)} × ${face.bounds.height.toFixed(2)} mm</strong></div>
          <div><span>Espesor cara / hendido:</span> <strong>${state.caliper.toFixed(2)} mm → ${pinchedMM} mm</strong></div>
          <div><span>Eje rotación:</span> <strong>Centro del espesor (z = 0.00 mm)</strong></div>
        </div>
      `;
    }
  }

  function updateSelectionHighlight() {
    for (const [fid, item] of faceMeshMap.entries()) {
      const isSelected = fid === state.selectedFaceId;
      const isHovered = fid === state.hoveredFaceId;
      item.cutOutline.visible = state.showCutLines3D || isSelected || isHovered;
    }
  }

  // ============================================================================
  // CÁMARA Y PRESETS DE VISTA 3D
  // ============================================================================
  function fitCameraToModel(instant = false) {
    if (!dielineRootGroup || !camera || !controls) return;
    dielineRootGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(dielineRootGroup);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 120);
    const dist = maxDim * 1.65;

    controls.target.copy(center);
    if (instant) {
      camera.position.set(center.x + dist * 0.78, center.y + dist * 0.62, center.z + dist * 0.85);
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
    // 1. Selector de Cartones Oficiales de Esko ArtiosCAD 12.0
    const boardSelect = document.getElementById('board-select');
    if (boardSelect && window.DielineEngine) {
      boardSelect.innerHTML = '';
      for (const b of DielineEngine.ARTIOS_BOARDS) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.name} — ${b.caliper.toFixed(1)} mm (${b.grammage} g/m²)`;
        if (b.id === state.boardId) opt.selected = true;
        boardSelect.appendChild(opt);
      }

      boardSelect.addEventListener('change', (e) => {
        const chosen = DielineEngine.ARTIOS_BOARDS.find(b => b.id === e.target.value);
        if (chosen) {
          state.boardId = chosen.id;
          state.caliper = chosen.caliper;
          state.insideLoss = chosen.insideLoss;
          state.outsideGain = chosen.outsideGain;
          state.flute = chosen.flute;

          const calSlider = document.getElementById('caliper-slider');
          const calNum = document.getElementById('caliper-num');
          if (calSlider) calSlider.value = chosen.caliper;
          if (calNum) calNum.value = chosen.caliper;

          updateBoardBadgeUI(chosen);
          rebuild3DMesh();
          if (state.selectedFaceId !== null) selectFace(state.selectedFaceId);
        }
      });

      const initialBoard = DielineEngine.ARTIOS_BOARDS.find(b => b.id === state.boardId);
      if (initialBoard) updateBoardBadgeUI(initialBoard);
    }

    // 2. Deslizador + Teclado + Ruleta de Espesor / Calibre en milímetros (0.4 mm a 15.0 mm)
    const calSlider = document.getElementById('caliper-slider');
    const calNum = document.getElementById('caliper-num');
    const applyNewCaliper = (val) => {
      state.caliper = Math.max(0.4, Math.min(15.0, val));
      state.insideLoss = +(state.caliper * 0.5).toFixed(2);
      state.outsideGain = +(state.caliper * 0.5).toFixed(2);
      if (calSlider) calSlider.value = state.caliper;
      if (calNum && document.activeElement !== calNum) calNum.value = state.caliper;
      const lossEl = document.getElementById('board-loss-gain');
      if (lossEl) lossEl.textContent = `-${state.insideLoss} / +${state.outsideGain} mm`;
      rebuild3DMesh();
      if (state.selectedFaceId !== null) selectFace(state.selectedFaceId);
    };

    bindSliderAndNumeric(calSlider, calNum, 0.4, 15.0, 0.1, 2, (v) => {
      applyNewCaliper(v);
    });

    document.querySelectorAll('[data-caliper-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = parseFloat(btn.getAttribute('data-caliper-preset'));
        if (calNum) calNum.value = v;
        applyNewCaliper(v);
      });
    });

    // 3. Controles del Hendido Chafado (Profundidad y Anchura del surco en líneas rojas)
    const crushSlider = document.getElementById('crush-depth-slider');
    const crushNum = document.getElementById('crush-depth-num');
    bindSliderAndNumeric(crushSlider, crushNum, 0, 85, 1, 0, (v) => {
      state.crushDepthRatio = v / 100;
      rebuild3DMesh();
      if (state.selectedFaceId !== null) selectFace(state.selectedFaceId);
    });

    const creaseWSlider = document.getElementById('crease-width-slider');
    const creaseWNum = document.getElementById('crease-width-num');
    bindSliderAndNumeric(creaseWSlider, creaseWNum, 0.5, 2.4, 0.05, 2, (v) => {
      state.creaseWidthFactor = v;
      rebuild3DMesh();
    });

    // 4. Deslizador Maestro de Plegado 3D (0% a 100%)
    const masterSlider = document.getElementById('master-fold-slider');
    const masterNum = document.getElementById('master-fold-num');
    bindSliderAndNumeric(masterSlider, masterNum, 0, 100, 1, 0, (v) => {
      state.isPlaying = false;
      updatePlayButtonUI();
      setMasterFold(v / 100);
    });

    document.querySelectorAll('[data-fold-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.isPlaying = false;
        updatePlayButtonUI();
        const pct = parseFloat(btn.getAttribute('data-fold-preset')) / 100;
        setMasterFold(pct);
      });
    });

    const playBtn = document.getElementById('btn-play-fold');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying && state.masterFold >= 0.99) {
          state.playDirection = -1;
        } else if (state.isPlaying && state.masterFold <= 0.01) {
          state.playDirection = 1;
        }
        updatePlayButtonUI();
      });
    }

    const seqSelect = document.getElementById('fold-sequence-mode');
    if (seqSelect) {
      seqSelect.addEventListener('change', (e) => {
        state.foldSequenceMode = e.target.value;
        setMasterFold(state.masterFold);
      });
    }

    // 5. Carga de archivo SVG mediante botón o Drag & Drop
    const svgInput = document.getElementById('svg-file-input');
    if (svgInput) {
      svgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => loadSVGString(ev.target.result, file.name, true);
        reader.readAsText(file);
      });
    }

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.svg')) {
        const reader = new FileReader();
        reader.onload = (ev) => loadSVGString(ev.target.result, file.name, true);
        reader.readAsText(file);
      } else if (file.type.startsWith('image/')) {
        applyCustomArtworkFile(file);
      }
    });

    // 6. Carga de diseño gráfico exterior
    const artInput = document.getElementById('artwork-file-input');
    if (artInput) {
      artInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) applyCustomArtworkFile(file);
      });
    }
    const clearArtBtn = document.getElementById('btn-clear-artwork');
    if (clearArtBtn) {
      clearArtBtn.addEventListener('click', () => {
        state.customArtworkTex = null;
        rebuild3DMesh();
      });
    }

    // 7. Toggles de visualización 3D
    const bindCheck = (id, prop, callback) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = state[prop];
      el.addEventListener('change', (e) => {
        state[prop] = e.target.checked;
        if (callback) callback();
      });
    };

    bindCheck('chk-standup', 'standUpBox', () => {
      applyFoldAngles();
      fitCameraToModel(true);
    });
    bindCheck('chk-crease-3d', 'showCreaseLines3D', () => {
      for (const item of faceMeshMap.values()) item.creaseLines.visible = state.showCreaseLines3D;
    });
    bindCheck('chk-cut-3d', 'showCutLines3D', () => updateSelectionHighlight());
    bindCheck('chk-dims-3d', 'showDimensions3D', () => update3DBoundingBoxDimensions());
    bindCheck('chk-grid-3d', 'showGrid', () => {
      if (gridHelper) gridHelper.visible = state.showGrid;
    });
    bindCheck('chk-wireframe', 'showWireframe', () => rebuild3DMesh());

    // 8. Conmutador de Vistas
    document.querySelectorAll('[data-view-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-view-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-view-mode');
        state.viewMode = mode;
        const workspace = document.getElementById('cad-workspace');
        if (workspace) {
          workspace.setAttribute('data-layout', mode);
          setTimeout(onWindowResize, 50);
        }
      });
    });

    // 9. Presets de cámara 3D
    document.querySelectorAll('[data-cam-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        setCameraPreset(btn.getAttribute('data-cam-preset'));
      });
    });

    const btnReset2D = document.getElementById('btn-reset-2d');
    if (btnReset2D) btnReset2D.addEventListener('click', reset2DView);

    // 10. Botones de Exportación (.GLB con animación para Blender, .OBJ y .PNG)
    const btnGlb = document.getElementById('btn-export-glb');
    if (btnGlb) {
      btnGlb.addEventListener('click', exportGLBForBlender);
    }
    const btnSnap = document.getElementById('btn-export-png');
    if (btnSnap) {
      btnSnap.addEventListener('click', exportPNGSnapshot);
    }
    const btnObj = document.getElementById('btn-export-obj');
    if (btnObj) {
      btnObj.addEventListener('click', exportOBJModel);
    }
  }

  function applyCustomArtworkFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const loader = new THREE.TextureLoader();
      const tex = loader.load(ev.target.result, () => {
        tex.encoding = THREE.sRGBEncoding;
        tex.needsUpdate = true;
        state.customArtworkTex = tex;
        rebuild3DMesh();
      });
    };
    reader.readAsDataURL(file);
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

    setTxt('info-filename', state.fileName);
    setTxt('info-blank-size', `${model.bounds.width.toFixed(2)} × ${model.bounds.height.toFixed(2)} mm`);
    setTxt('info-cota-source', model.calibration.source);
    setTxt('info-panel-count', `${model.faces.length} paneles`);
    setTxt('info-hinge-count', `${model.hinges.length} líneas rojas`);
    setTxt('info-cut-count', `${model.cutSegments.length} tramos azules`);

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

      const row = document.createElement('div');
      row.className = 'hinge-control-row';
      row.innerHTML = `
        <div class="hinge-row-header">
          <span class="hinge-label" title="${label}">${label}</span>
          <span class="hinge-len">${h.length.toFixed(1)} mm</span>
          <div class="num-input-wrap" title="Escribe el ángulo con el teclado numérico o gira la ruleta del ratón">
            <input type="number" id="hinge-num-${h.id}" min="-180" max="180" step="1" value="0" class="cad-num-input hinge-num" />
            <span class="num-unit">°</span>
          </div>
        </div>
        <input type="range" id="hinge-slider-${h.id}" min="-180" max="180" step="1" value="0" class="cad-slider hinge-slider" />
      `;

      const slider = row.querySelector(`#hinge-slider-${h.id}`);
      const numInput = row.querySelector(`#hinge-num-${h.id}`);

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
  }

  // ============================================================================
  // EXPORTACIÓN ADICIONAL (CAPTURA PNG Y MODELO 3D .OBJ EN ESCALA 1:1 MM)
  // ============================================================================
  function exportPNGSnapshot() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${state.fileName.replace(/\.svg$/i, '')}_3D_${state.caliper}mm.png`;
    a.click();
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.fileName.replace(/\.svg$/i, '')}_${state.caliper}mm.obj`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
