import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Decodificadores de compresión soportados (por si el .glb viene comprimido
 * con Draco o con meshopt). Mantener la versión alineada con el importmap
 * de index.html.
 */
const DRACO_DECODER_PATH =
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/';

/**
 * Visor 3D: escena, luces, controles de órbita y carga de modelos .glb.
 *
 * Gira, escala (zoom) y desplaza (pan) tanto con ratón como con el dedo.
 */
export class ModelViewer {
  /**
   * @param {HTMLCanvasElement} canvas Lienzo donde se dibuja la escena.
   * @param {object} [config] Configuración (ver js/config.js).
   */
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.config = config;
    this.autoRotate = Boolean(config.rotation?.enabled);

    /** @type {(state: 'loading'|'ready'|'error', detail: object) => void} */
    this.onStatus = () => {};
    /** @type {string} */
    this.contentLabel = '';
    /** @type {THREE.Object3D|null} */
    this.content = null;

    this.timer = new THREE.Timer();
    if (typeof document !== 'undefined') this.timer.connect(document);
    this._loadToken = 0;
    this.mixer = null;
    this.animClips = [];
    this.activeAction = null;
    this.isPlayingAnimation = false;
    this.onAnimationUpdate = null;

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLights();
    this._initEnvironment();
    this._initHelpers();
    this._initControls();
    this._initLoaders();
    this._initResize();

    /** Grupo que gira: contiene el modelo y rota sobre su eje vertical. */
    this.pivot = new THREE.Group();
    this.pivot.name = 'Pivot';
    this.scene.add(this.pivot);

    this._tick = this._tick.bind(this);
    this.renderer.setAnimationLoop(this._tick);
  }

  /* ---------------------------------------------------------------- API --- */

  /** Muestra el cubo de prueba (lo que se ve mientras no hay .glb). */
  showPlaceholder() {
    this._applyLightingProfile(false);
    this._setContent(this._createPlaceholder(), 'Cubo de prueba');
    this.onStatus('ready', { label: this.contentLabel });
  }

  /**
   * Carga un modelo desde una URL.
   * @param {string} url
   * @param {string} [label]
   */
  async loadModel(url, label) {
    const token = ++this._loadToken;
    const name = label || url.split('/').pop() || 'modelo';
    this.onStatus('loading', { label: name, url });

    try {
      const gltf = await this._loadAsync(url);
      if (token !== this._loadToken) {
        this._disposeObject(gltf.scene);
        return;
      }
      this._registerModel(gltf.scene);
      this._setupAnimations(gltf.scene, gltf.animations);
      this._setContent(gltf.scene, name);
      this.onStatus('ready', { label: this.contentLabel, hasAnimations: this.hasAnimations });
    } catch (error) {
      if (token !== this._loadToken) return;
      console.error('[visor] error al cargar el modelo', error);
      this.onStatus('error', { label: name, url, error });
    }
  }

  /**
   * Carga un modelo desde un archivo local (input o arrastrar y soltar).
   * @param {File} file
   */
  async loadFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      await this.loadModel(url, file.name);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** @param {boolean} value */
  setAutoRotate(value) {
    this.autoRotate = Boolean(value);
    return this.autoRotate;
  }

  toggleAutoRotate() {
    return this.setAutoRotate(!this.autoRotate);
  }

  /** Devuelve la cámara a la vista inicial, encuadrando el modelo. */
  resetView() {
    this._frame();
  }

  /** Libera recursos (no es imprescindible en una página de un solo visor). */
  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this._resize);
    this._resizeObserver?.disconnect();
    this.timer.disconnect();
    this.controls.dispose();
    this._draco.dispose();
    if (this.content) this._disposeObject(this.content);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this._environmentTarget?.dispose();
    this.scene.background?.dispose();
    this.renderer.dispose();
  }

  /* ------------------------------------------------------------ montaje --- */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // PCF con `shadow.radius` da bordes suaves; PCFSoftShadowMap se eliminó
    // en three reciente y solo generaba un aviso en consola.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  /** Factor de píxel efectivo (densidad de pantalla acotada por la config). */
  _pixelRatio() {
    const max = this.config.quality?.maxPixelRatio ?? 2;
    return Math.min(window.devicePixelRatio || 1, max);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = createGradientTexture(this.config.background);
  }

  get hasAnimations() { return Boolean(this.animClips && this.animClips.length > 0); }

  _setupAnimations(scene, animations) {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.animClips = animations || [];
    this.activeAction = null;
    this.isPlayingAnimation = false;

    if (!this.animClips.length) return;

    this.mixer = new THREE.AnimationMixer(scene);
    const clip = this.animClips.find(c => c.name.includes('Plegado') && !c.name.includes('Ciclo')) || this.animClips[0];
    this.activeAction = this.mixer.clipAction(clip);
    this.activeAction.setLoop(THREE.LoopOnce);
    this.activeAction.clampWhenFinished = true;
    this.activeAction.play();
    this.activeAction.paused = true;
    // Mostrar inicialmente la caja en posición plegada completa
    this.activeAction.time = clip.duration;
    this.mixer.update(0);
  }

  setAnimationProgress(progress) {
    if (!this.activeAction || !this.mixer) return;
    const clip = this.activeAction.getClip();
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    this.activeAction.time = p * clip.duration;
    this.activeAction.paused = true;
    this.isPlayingAnimation = false;
    this.mixer.update(0);
    this.onAnimationUpdate?.(p, false);
  }

  toggleAnimation() {
    if (!this.activeAction || !this.mixer) return;
    const clip = this.activeAction.getClip();
    if (this.isPlayingAnimation) {
      this.pauseAnimation();
    } else {
      if (this.activeAction.time >= clip.duration - 0.05) {
        this.activeAction.time = 0;
      }
      this.activeAction.paused = false;
      this.isPlayingAnimation = true;
      this.onAnimationUpdate?.(this.activeAction.time / clip.duration, true);
    }
  }

  playAnimation() {
    if (!this.activeAction) return;
    const clip = this.activeAction.getClip();
    if (this.activeAction.time >= clip.duration - 0.05) {
      this.activeAction.time = 0;
    }
    this.activeAction.paused = false;
    this.isPlayingAnimation = true;
    this.onAnimationUpdate?.(this.activeAction.time / clip.duration, true);
  }

  pauseAnimation() {
    if (!this.activeAction) return;
    this.activeAction.paused = true;
    this.isPlayingAnimation = false;
    const clip = this.activeAction.getClip();
    this.onAnimationUpdate?.(this.activeAction.time / clip.duration, false);
  }

  _initCamera() {
    const fov = this.config.camera?.fov ?? 45;
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
    this.camera.position.set(3, 2.4, 4.2);
  }

  _initLights() {
    const shadowSize = this.config.quality?.shadowMapSize ?? 2048;

    this.hemiLight = new THREE.HemisphereLight(0xbfd4ff, 0x1c2333, 1.15);
    this.scene.add(this.hemiLight);

    // Luz principal: es la que proyecta la sombra sobre el suelo.
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    this.keyLight.position.set(4, 7, 5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    // Radio alto = borde de sombra suave y difuso, como el de una luz de estudio.
    this.keyLight.shadow.radius = 4;
    // Sombra algo translúcida: el cartón no proyecta una mancha negra.
    this.keyLight.shadow.intensity = 0.82;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Luz de contra para separar el objeto del fondo.
    this.rimLight = new THREE.DirectionalLight(0x8fb6ff, 1.0);
    this.rimLight.position.set(-5, 3.5, -4.5);
    this.scene.add(this.rimLight);
  }

  _initEnvironment() {
    // Iluminación de entorno: hace que los materiales PBR se vean bien.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this._environmentTarget.texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
  }

  _initHelpers() {
    // Plano que solo recoge la sombra (deja ver el degradado del fondo).
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.34 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grid = new THREE.GridHelper(10, 10, 0x4f8cff, 0x2b3550);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.16;
    this.grid.material.depthWrite = false;
    this.grid.position.y = 0.004;
    this.grid.visible = this.config.grid !== false;
    this.scene.add(this.grid);
  }

  _initControls() {
    const tuning = this.config.controls ?? {};

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = tuning.dampingFactor ?? 0.06;
    this.controls.rotateSpeed = tuning.rotateSpeed ?? 0.85;
    this.controls.zoomSpeed = tuning.zoomSpeed ?? 0.9;
    this.controls.panSpeed = tuning.panSpeed ?? 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    // Un dedo gira; dos dedos escalan y desplazan (comportamiento por defecto).
    this.controls.maxPolarAngle = Math.PI * 0.5 + 0.35;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 200;
    this.controls.target.set(0, 0.8, 0);
    this.controls.update();
  }

  _initLoaders() {
    this._draco = new DRACOLoader();
    this._draco.setDecoderPath(DRACO_DECODER_PATH);

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this._draco);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  _initResize() {
    this._resize = () => {
      const host = this.canvas.parentElement || document.body;
      const width = Math.max(1, Math.floor(host.clientWidth || window.innerWidth));
      const height = Math.max(1, Math.floor(host.clientHeight || window.innerHeight));

      this.renderer.setPixelRatio(this._pixelRatio());
      this.renderer.setSize(width, height, false);

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    };

    this._resize();
    window.addEventListener('resize', this._resize);

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._resize);
      this._resizeObserver.observe(this.canvas.parentElement || document.body);
    }
  }

  /* ---------------------------------------------------------- contenido --- */

  _createPlaceholder() {
    const size = this.config.placeholder?.size ?? 1.6;
    const color = this.config.placeholder?.color ?? 0x4f8cff;

    const group = new THREE.Group();
    group.name = 'CuboDePrueba';

    const geometry = new THREE.BoxGeometry(size, size, size);
    const cube = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.3 }),
    );
    cube.castShadow = true;
    cube.receiveShadow = true;
    group.add(cube);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x9dc0ff, transparent: true, opacity: 0.5 }),
    );
    group.add(edges);

    return group;
  }

  /**
   * Sustituye el contenido del visor y reencuadra la cámara.
   * @param {THREE.Object3D} object
   * @param {string} label
   */
  _setContent(object, label) {
    if (this.content) {
      this.pivot.remove(this.content);
      this._disposeObject(this.content);
    }

    this.content = object;
    this.contentLabel = label;
    object.name = object.name || label;

    this.pivot.add(object);
    this._frame();
  }

  /** Activa sombras y ajusta los materiales de un modelo cargado. */
  _registerModel(object) {
    this._applyPose(object);

    const options = this.config.model ?? {};
    const materialOptions = this.config.materials ?? {};
    const castShadow = options.castShadow !== false;
    const receiveShadow = options.receiveShadow !== false;
    const anisotropy = this._resolveAnisotropy();

    const embeddedLights = [];

    object.traverse((node) => {
      if (node.isLight) embeddedLights.push(node);

      if (!node.isMesh && !node.isSkinnedMesh) return;

      node.castShadow = castShadow;
      node.receiveShadow = receiveShadow;
      node.frustumCulled = false;

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material) this._tuneMaterial(material, materialOptions, anisotropy);
      }
    });

    const useEmbedded =
      options.useEmbeddedLights === true && embeddedLights.length > 0;

    if (!useEmbedded) {
      // Se recogen primero y se quitan despues: no se modifica el arbol
      // mientras se recorre.
      for (const light of embeddedLights) light.removeFromParent();
    }

    this._applyLightingProfile(useEmbedded);
  }

  /**
   * Aplica el plegado del modelo (config `pose`).
   *
   * Algunos .glb (como el de la caja) guardan la pieza desplegada y traen un
   * esqueleto con un hueso por panel y por solapa. Aquí se gira cada hueso
   * hasta montar la figura. Los huesos que no existan se ignoran, así que un
   * modelo distinto (arrastrado a la página) no se rompe.
   * @param {THREE.Object3D} object
   */
  _applyPose(object) {
    const bones = new Map();
    object.traverse((node) => {
      if (node.isBone) bones.set(node.name, node);
    });

    // Se guarda la orientación original de cada hueso: las solapas se vuelven
    // a colocar desde los controles sin que los giros se acumulen.
    this._boneRest = new Map();
    for (const [name, bone] of bones) this._boneRest.set(name, bone.quaternion.clone());
    this._bones = bones;

    for (const [name, steps] of Object.entries(this.config.pose ?? {})) {
      const bone = bones.get(name);
      if (bone) this._rotateBone(bone, steps);
    }

    this._initFlaps();
  }

  /**
   * Gira un hueso sobre sus propios ejes, en orden.
   * @param {THREE.Bone} bone
   * @param {Array<[string, number]>} steps Pares [eje, grados] (`x`, `y` o `z`).
   */
  _rotateBone(bone, steps) {
    for (const [axis, degrees] of steps) {
      const radians = THREE.MathUtils.degToRad(degrees);
      if (axis === 'x') bone.rotateX(radians);
      else if (axis === 'z') bone.rotateZ(radians);
      else bone.rotateY(radians);
    }
  }

  /** Prepara las solapas que se abren y cierran desde la interfaz. */
  _initFlaps() {
    const config = this.config.flaps;
    this.flaps = [];
    if (!config || !this._bones) return;

    for (const item of config.bones ?? []) {
      const bone = this._bones.get(item.bone);
      if (bone) this.flaps.push({ id: item.id, label: item.label, bone });
    }

    this.resetFlaps();
  }

  /**
   * Abre o cierra una solapa de arriba.
   * @param {string} id Identificador de la solapa (ver `config.flaps.bones`).
   * @param {number} value Apertura en % (0 = cerrada, 100 = abierta).
   * @returns {number|undefined} La apertura aplicada, ya acotada.
   */
  setFlapAperture(id, value) {
    const flap = this.flaps?.find((item) => item.id === id);
    if (!flap) return undefined;

    const config = this.config.flaps;
    const percent = THREE.MathUtils.clamp(Number(value) || 0, 0, 100);
    const degrees = config.closed + (config.open - config.closed) * (percent / 100);

    const rest = this._boneRest.get(flap.bone.name);
    if (rest) flap.bone.quaternion.copy(rest);
    this._rotateBone(flap.bone, [[config.axis ?? 'y', degrees]]);

    flap.aperture = percent;
    return percent;
  }

  /** Devuelve todas las solapas a su apertura inicial. */
  resetFlaps() {
    const initial = this.config.flaps?.initial ?? 100;
    for (const flap of this.flaps ?? []) this.setFlapAperture(flap.id, initial);
  }

  /**
   * Ajusta un material PBR para que se vea realista.
   *
   * Las texturas se filtran en ángulo con el máximo anisotrópico del equipo
   * (si no, se ven borrosas cuando la caja gira) y, en los materiales que no
   * traen mapa de metal ni de rugosidad, se corrigen los valores para que el
   * cartón no brille como el plástico o el metal.
   * @param {THREE.Material} material
   * @param {object} options Ajustes de `config.materials`.
   * @param {number} anisotropy
   */
  _tuneMaterial(material, options, anisotropy) {
    for (const value of Object.values(material)) {
      if (value && value.isTexture) {
        value.anisotropy = anisotropy;
        value.needsUpdate = true;
      }
    }

    if ('envMapIntensity' in material) {
      material.envMapIntensity = options.envMapIntensity ?? 1;
    }

    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
      // El cartón es dieléctrico: sin metal, y mate. Solo se toca si el
      // material no trae un mapa propio, para no pisar la intención del autor.
      if (options.forceDielectric !== false && !material.metalnessMap) {
        material.metalness = 0;
      }

      const range = options.roughnessRange;
      if (Array.isArray(range) && range.length === 2 && !material.roughnessMap) {
        material.roughness = THREE.MathUtils.clamp(material.roughness, range[0], range[1]);
      }
    }

    material.needsUpdate = true;
  }

  /** Anisotropía de filtrado: 'auto' usa el máximo del equipo. */
  _resolveAnisotropy() {
    const value = this.config.quality?.anisotropy ?? 'auto';
    if (value === 'auto') return this.renderer.capabilities.getMaxAnisotropy();
    return Number(value) || 1;
  }

  /**
   * Ajusta la iluminación del visor.
   *
   * Si el modelo trae sus propias luces y se respetan, las del visor se bajan
   * para que no se sumen y quemen la imagen.
   * @param {boolean} useEmbeddedLights
   */
  _applyLightingProfile(useEmbeddedLights) {
    if (useEmbeddedLights) {
      this.hemiLight.intensity = 0.3;
      this.keyLight.intensity = 0.7;
      this.rimLight.intensity = 0.35;
      this.scene.environmentIntensity = 0.3;
      return;
    }

    this.hemiLight.intensity = 1.15;
    this.keyLight.intensity = 2.4;
    this.rimLight.intensity = 1.0;
    this.scene.environmentIntensity = 0.7;
  }

  /**
   * Encuadra el contenido: lo apoya en el suelo (y = 0), lo centra en el eje
   * y coloca la cámara, las luces y el suelo a su medida.
   */
  _frame() {
    this.pivot.rotation.set(0, 0, 0);
    this._prepareForMeasure();

    const box = this._recenterContent();
    if (!box) return;

    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    // El encuadre usa la esfera que envuelve el modelo, no solo su medida
    // mayor: así también entran las esquinas de una caja.
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fitRadius = sphere.radius || radius;

    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect);
    const limitingFov = Math.min(fov, horizontalFov);
    const padding = this.config.camera?.fitPadding ?? 1.55;
    const distance = (fitRadius / Math.sin(limitingFov / 2)) * padding;

    this.controls.target.set(0, size.y / 2, 0);

    const dir = this.config.camera?.direction ?? [0.68, 0.46, 1];
    const direction = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);

    this.camera.near = Math.max(radius / 100, 0.01);
    this.camera.far = radius * 200 + 100;
    this.camera.updateProjectionMatrix();

    this.controls.minDistance = radius * 0.5;
    this.controls.maxDistance = radius * 14;
    this.controls.update();

    this._fitLights(radius, size.y);
    this._fitGround(radius);
  }

  /**
   * Deja el contenido listo para poder medirlo.
   *
   * Un SkinnedMesh (el caso de la caja, que viene con armature) guarda su
   * caja envolvente en caché y la calcula a partir de las matrices de los
   * huesos, que normalmente solo refresca el renderer al dibujar. Si se mide
   * antes de eso, la medida sale mal y el encuadre también. Aquí se fuerzan
   * las matrices, se actualiza el esqueleto y se invalida la caché.
   */
  _prepareForMeasure() {
    this.pivot.updateMatrixWorld(true);

    this.pivot.traverse((node) => {
      if (!node.isSkinnedMesh) return;

      node.skeleton?.update();
      node.boundingBox = null;
      node.boundingSphere = null;
    });
  }

  /**
   * Desplaza el contenido para que quede centrado en horizontal y apoyado
   * en el suelo. Devuelve la nueva caja envolvente (en coordenadas de mundo).
   * @returns {THREE.Box3|null}
   */
  _recenterContent() {
    const box = new THREE.Box3().setFromObject(this.pivot);
    if (box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    this.content.position.x -= center.x;
    this.content.position.z -= center.z;
    this.content.position.y -= box.min.y;

    return new THREE.Box3().setFromObject(this.pivot);
  }

  _fitLights(radius, height) {
    const extent = radius * 3;

    this.keyLight.position.set(extent, radius * 5.5, extent * 0.9);
    this.keyLight.target.position.set(0, height / 2, 0);
    this.keyLight.target.updateMatrixWorld();

    const shadowCamera = this.keyLight.shadow.camera;
    shadowCamera.left = -extent * 1.7;
    shadowCamera.right = extent * 1.7;
    shadowCamera.top = extent * 1.7;
    shadowCamera.bottom = -extent * 1.7;
    shadowCamera.near = 0.1;
    shadowCamera.far = radius * 30;
    shadowCamera.updateProjectionMatrix();

    this.rimLight.position.set(-extent * 1.6, radius * 3.5, -extent * 1.5);
  }

  _fitGround(radius) {
    const groundSize = radius * 26;
    this.ground.scale.set(groundSize, groundSize, 1);

    // El GridHelper se crea con 10 unidades de lado; se escala a la medida.
    this.grid.scale.setScalar((radius * 16) / 10);
  }

  /* ------------------------------------------------------------- bucle --- */

  _tick(time) {
    // El Timer (con Page Visibility) evita el salto brusco al volver a la
    // pestaña; el acotado extra es una red de seguridad.
    this.timer.update(time);
    const delta = Math.min(this.timer.getDelta(), 0.1);

    if (this.autoRotate && this.content) {
      this.pivot.rotation.y += (this.config.rotation?.speed ?? 0.4) * delta;
    }

    if (this.mixer && this.isPlayingAnimation) {
      this.mixer.update(delta);
      const action = this.activeAction;
      const duration = action?.getClip().duration || 0;
      const progress = duration ? Math.min(1, action.time / duration) : 0;
      this.isPlayingAnimation = Boolean(action && !action.paused && progress < 1);
      this.onAnimationUpdate?.(progress, this.isPlayingAnimation);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /* ------------------------------------------------------------ utils --- */

  _loadAsync(url) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  _disposeObject(root) {
    if (!root) return;

    root.traverse((node) => {
      node.geometry?.dispose();

      const materials = Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [];

      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
  }
}

/**
 * Fondo degradado vertical, dibujado en un canvas 2D y usado como textura.
 * @param {{ top?: string, bottom?: string }} [colors]
 */
function createGradientTexture(colors = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;

  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors.top ?? '#1b2440');
  gradient.addColorStop(1, colors.bottom ?? '#070910');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

