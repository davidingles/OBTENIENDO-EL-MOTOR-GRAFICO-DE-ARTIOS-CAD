const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../assets/libs/three.min.js');
const engine = require('../dieline-engine.js');
global.window = global;
require('../assets/pacdora-catalog/folding-box-dielines-p1.js');
const entry = global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e => e.num === 150010);

function app() {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const context = {THREE, DielineEngine: engine, UserLibrary:require('../library-models'), console, performance, alert() {}, window: {addEventListener() {}}, document: {getElementById() { return null; }}};
  vm.createContext(context);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    const realBuildBoardMaterials = buildBoardMaterials;
    getArtiosTexture = name => { const tex = new THREE.Texture(); tex.name = name; return tex; };
    buildBoardMaterials = () => [0,1,2].map(() => new THREE.MeshBasicMaterial());
    render2FDieline = () => {};
    globalThis.testApp = {
      state, createCrushedPanelGeometry, setMasterFold, updateSelectionHighlight, fitCameraToModel,
      MATERIAL_FINISHES, resolveMaterialFinish, getDetailGroups, realBuildBoardMaterials,
      get2DTransform, drawMiniDielinePreview, createCatalogPreviewGroup,
      exportGLBForBlender, buildSingleMeshExport, computeHingeAngleAtProgress,
      readFavoriteModels, toggleFavoriteModel, createFavoriteButton,
      setFavoritesStorage(storage) {window.localStorage=storage;favoriteModelIds=readFavoriteModels(storage);},
      setCreateElement(factory) {document.createElement=factory;},
      setOverlay(rect) { document.querySelector = () => rect ? {getBoundingClientRect:()=>rect} : null; },
      setup(model) {
        state.dieline = model;
        rootBoxGroup = new THREE.Group();
        bboxHelperGroup = new THREE.Group();
        camera = new THREE.PerspectiveCamera(38, 1.25, 0.1, 10000);
        controls = {target: new THREE.Vector3(), update() {camera.lookAt(this.target); camera.updateMatrixWorld(true);}};
        rebuild3DMesh();
      },
      meshes: faceMeshMap,
      get root() { return dielineRootGroup; },
      get camera() { return camera; },
      get boxHelpers() { return bboxHelperGroup; }
    };
  })();`), context);
  return context.testApp;
}

test('la base marcada en 2D permanece horizontal, inmóvil y apoyada en el suelo durante el plegado', () => {
  const ui = app();
  const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
  ui.setup(model);
  let reference;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    ui.setMasterFold(t);
    ui.root.updateMatrixWorld(true);
    const base = ui.meshes.get(model.rootFaceId).mesh;
    const box = new THREE.Box3().setFromObject(base);
    assert.ok(Math.abs(box.min.y) < 1e-5, `apoyo en ${t}: ${box.min.y}`);
    const up = new THREE.Vector3(0, 0, 1).transformDirection(base.matrixWorld);
    assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-6);
    const matrix = base.matrixWorld.elements;
    if (!reference) reference = matrix.slice();
    matrix.forEach((value, i) => assert.ok(Math.abs(value - reference[i]) < 1e-6));
  }
});

test('los preferidos se conservan al reabrir y pueden desmarcarse',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const first=app();first.setFavoritesStorage(storage);
  assert.equal(first.toggleFavoriteModel(150010),true);
  const second=app();second.setFavoritesStorage(storage);
  assert.equal(second.readFavoriteModels(storage).has(150010),true);
  second.toggleFavoriteModel(150010);
  assert.equal(first.readFavoriteModels(storage).has(150010),false);
  assert.equal(first.readFavoriteModels({getItem:()=>'{invalid'}).size,0);
});

test('el corazón cambia de vacío a macizo sin propagar el clic de selección del troquel',()=>{
  const ui=app(),values=new Map();ui.setFavoritesStorage({getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)});
  ui.setCreateElement(()=>({attributes:{},handlers:{},setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,handler){this.handlers[key]=handler;}}));
  const button=ui.createFavoriteButton(entry);
  assert.equal(button.attributes['aria-pressed'],'false');
  assert.match(button.innerHTML,/fill="none"/);
  let stopped=false,prevented=false;
  button.handlers.click({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.ok(stopped&&prevented);
  assert.equal(button.attributes['aria-pressed'],'true');
  assert.match(button.innerHTML,/fill="currentColor"/);
});

test('si falla el guardado de preferidos, la selección no se muestra como guardada',()=>{
  const ui=app(),storage={getItem:()=>null,setItem(){throw new Error('Cuota');}};
  ui.setFavoritesStorage(storage);
  assert.equal(ui.toggleFavoriteModel(150010),false);
});



test('GLB exporta una sola malla en metros, con materiales y plegado, sin modificar el visor', () => {
  const ui=app(),original=THREE.GLTFExporter;
  let exported,options;
  THREE.GLTFExporter=class {parse(root,callback,opts){exported=root;options=opts;}};
  try{
    ui.setup(engine.buildDielineModelFromPacdora(entry.knifeData,entry));
    ui.setMasterFold(0.75);
    const before=ui.root.position.clone();
    ui.exportGLBForBlender();
    assert.notEqual(exported,ui.root);
    assert.equal(exported.scale.x,1);
    assert.equal(exported.position.length(),0);
    assert.equal(exported.isMesh,true);
    assert.equal(exported.isSkinnedMesh,true);
    assert.ok(exported.children.every(object=>object.isBone));
    assert.equal(ui.root.scale.x,1);
    assert.ok(ui.root.position.equals(before));
    assert.equal(exported.userData.units,'meters');
    assert.ok(options.animations.length>=1);
    assert.equal(options.embedImages,true);
    let panels=0;
    exported.traverse(object=>{
      if(!object.isMesh || !Array.isArray(object.material))return;
      panels++;
      const geometry=object.geometry;
      assert.ok(geometry.index,'GLB requiere índices para respetar los grupos de material');
      const used=new Set();
      for(const group of geometry.groups){
        for(let i=group.start;i<group.start+group.count;i++){
          assert.ok(!used.has(i),'los grupos no deben repetir triángulos');
          used.add(i);
        }
      }
      assert.equal(used.size,geometry.index.count);
    });
    assert.equal(panels,1);
    assert.deepEqual(Object.keys(exported.geometry.morphAttributes),[]);
    assert.equal(exported.skeleton.bones.length,ui.state.dieline.hinges.length+1);
    assert.ok(options.animations.every(clip=>clip.tracks.every(track=>track.name.endsWith('.quaternion'))));
  }finally{THREE.GLTFExporter=original;}
});

test('la malla única conserva UV y vértices y la armadura reproduce cada panel plegado sin shape keys', () => {
  const ui=app();
  ui.setup(engine.buildDielineModelFromPacdora(entry.knifeData,entry));
  ui.setMasterFold(0.75);
  const before=[];
  ui.root.traverse(object=>before.push([object,object.matrixWorld.clone()]));
  const {root,clips}=ui.buildSingleMeshExport();
  for (const [object,matrix] of before) assert.deepEqual(object.matrixWorld.elements,matrix.elements);
  const parts=[];
  ui.root.traverseVisible(object=>{if(object.isMesh)parts.push(object);});
  const p=new THREE.Vector3(),n=new THREE.Vector3(),nm=new THREE.Matrix3();
  let offset=0;
  const initialMixer=new THREE.AnimationMixer(root);
  initialMixer.clipAction(clips[0]).play();
  initialMixer.setTime(0);
  root.updateMatrixWorld(true);root.skeleton.update();
  ui.setMasterFold(0);
  for(const part of parts){
    const attrs=part.geometry.attributes;
    nm.getNormalMatrix(part.matrixWorld);
    for(let i=0;i<attrs.position.count;i++){
      p.fromBufferAttribute(attrs.position,i).applyMatrix4(part.matrixWorld).multiplyScalar(.001);
      assert.ok(p.distanceTo(new THREE.Vector3().fromBufferAttribute(root.geometry.attributes.position,offset+i))<1e-6);
      if(attrs.uv){assert.equal(root.geometry.attributes.uv.getX(offset+i),attrs.uv.getX(i));assert.equal(root.geometry.attributes.uv.getY(offset+i),attrs.uv.getY(i));}
    }
    offset+=attrs.position.count;
  }
  assert.equal(root.geometry.attributes.position.count,offset);
  // Match bone skinning against the editor's hierarchy throughout folding.
  ui.state.foldSequenceMode='phased';
  for(const k of [0,15,30,45,60]){
    ui.setMasterFold(k/60);
    initialMixer.setTime(k/60*5);
    // AnimationMixer repeats by default; inspect the closed endpoint explicitly.
    if(k===60){for(const bone of root.skeleton.bones.slice(1)){
      const track=clips[0].tracks.find(track=>track.name===bone.name+'.quaternion');
      bone.quaternion.fromArray(track.values,track.values.length-4);
    }}
    root.updateMatrixWorld(true);root.skeleton.update();
    offset=0;
    for(const part of parts){
      nm.getNormalMatrix(part.matrixWorld);
      for(let i=0;i<part.geometry.attributes.position.count;i+=11){
        p.fromBufferAttribute(part.geometry.attributes.position,i).applyMatrix4(part.matrixWorld).multiplyScalar(.001);
        const j=offset+i;
        const baked=new THREE.Vector3().fromBufferAttribute(root.geometry.attributes.position,j);
        root.boneTransform(j,baked);
        assert.ok(p.distanceTo(baked)<1e-6,`muestra ${k}, vértice ${j}`);
      }
      offset+=part.geometry.attributes.position.count;
    }
  }
  assert.equal(clips.length,2);
  assert.equal(clips[1].duration,9);
  for(const clip of clips)for(const track of clip.tracks){
    for(let i=0;i<track.values.length;i+=4){
      const q=new THREE.Quaternion().fromArray(track.values,i);
      assert.ok(2*Math.acos(Math.min(1,Math.abs(q.w)))<=Math.PI/2+1e-6,'sin sobreplegado');
    }
    const endpoint=clip.name.startsWith('01_')?track.values.length-4:40*4;
    const q=new THREE.Quaternion().fromArray(track.values,endpoint);
    assert.ok(Math.abs(2*Math.acos(Math.abs(q.w))-Math.PI/2)<1e-6,'giro local final de 90 grados');
  }
});

test('el plegado automático termina siempre a 90 grados incluso en cartones gruesos y secuencias antiguas',()=>{
  const ui=app();ui.state.caliper=7;
  for(const hinge of [{defaultAngle:110},{defaultAngle:-120},{animSteps:[{start:0,end:.4,deltaDeg:120},{start:.4,end:1,deltaDeg:-30}]}]){
    const face={role:'GLUE_FLAP',bounds:{width:25,height:30}};
    for(const mode of ['phased','simultaneous']){
      assert.equal(Math.abs(ui.computeHingeAngleAtProgress(hinge,face,1,mode)),90);
      assert.equal(Math.abs(ui.computeHingeAngleAtProgress(hinge,face,0,mode)),0);
      for(let t=0;t<=1;t+=.01)assert.ok(Math.abs(ui.computeHingeAngleAtProgress(hinge,face,t,mode))<=90);
    }
  }
});

test('el encuadre inicial 2D respeta el 75 % del espacio libre con distintas pantallas y escalas', () => {
  const ui=app();
  for(const [width,height,panelWidth] of [[1050,680,400],[1440,900,400],[2560,1440,600],[3840,2160,900]]) {
    for(const dpr of [1,1.5,2]) {
      const left=360, top=88, w=width-left, h=height-top;
      const rect={left,top,width:w,height:h,right:width,bottom:height};
      ui.setOverlay({left:width-panelWidth-16,top:102,width:panelWidth,height:h-24,right:width-16,bottom:height-12});
      const canvas={width:w*dpr,height:h*dpr,getBoundingClientRect:()=>rect};
      const freeWidth=(width-panelWidth-16-left-16)*dpr;
      for(const [bw,bh] of [[500,200],[200,900],[2000,2000]]) {
        const bounds={minX:-30,minY:40,width:bw,height:bh};
        const tf=ui.get2DTransform(canvas,bounds);
        const drawnW=bw*tf.scale,drawnH=bh*tf.scale;
        assert.ok(drawnW<=freeWidth*0.75+1e-6);
        assert.ok(drawnH<=canvas.height*0.75+1e-6);
        assert.ok(Math.abs(tf.toScreenX(bounds.minX)+drawnW/2-freeWidth/2)<1e-6);
      }
    }
  }
});

test('las miniaturas 2D dibujan todos los cortes dentro del lienzo sobre fondo blanco', () => {
  const ui=app();
  const model=engine.buildDielineModelFromPacdora(entry.knifeData,entry);
  const points=[];let background;
  const ctx={fillRect(){background=this.fillStyle;},beginPath(){},stroke(){},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);}};
  const canvas={getContext:()=>ctx};
  ui.drawMiniDielinePreview(canvas,model);
  assert.equal(background,'#ffffff');
  assert.equal(points.length,(model.cutSegments.length+model.foldSegments.length)*2);
  assert.ok(points.every(([x,y])=>x>=10&&x<=canvas.width-10&&y>=10&&y<=canvas.height-10));
});

test('cada vista 3D de catálogo usa las caras y bisagras de su propio modelo', () => {
  const ui=app();
  const other=global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e=>e.num!==entry.num);
  const sizes=[];
  for(const item of [entry,other]) {
    const model=engine.buildDielineModelFromPacdora(item.knifeData,item);
    const group=ui.createCatalogPreviewGroup(model);
    const meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});
    assert.equal(meshes.length,model.faces.length);
    assert.ok(meshes.every(m=>m.geometry.getAttribute('position').count>0));
    const size=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    assert.ok([size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0));
    sizes.push(size);
  }
  assert.ok(sizes[0].distanceTo(sizes[1])>1);
});

test('hay tres acabados y el blanco interior conserva textura y color blancos', () => {
  const ui = app();
  assert.equal(ui.MATERIAL_FINISHES.length, 3);
  ui.MATERIAL_FINISHES.forEach((finish, index) => {
    ui.state.boardId = finish.id;
    const materials = ui.realBuildBoardMaterials();
    // En 3D solo se usa marrón liso o blanco liso (sin texturas repetitivas como boardbrown o corrugado)
    assert.equal(materials[0].map, null);
    assert.equal(materials[1].map, null);
    if (index === 0) {
      assert.equal(materials[0].color.getHex(), 0xffffff);
      assert.equal(materials[1].color.getHex(), 0xffffff);
    } else if (index === 1) {
      assert.equal(materials[0].color.getHex(), 0xffffff);
      assert.equal(materials[1].color.getHex(), 0xcfa778);
    } else {
      assert.equal(materials[0].color.getHex(), 0xcfa778);
      assert.equal(materials[1].color.getHex(), 0xcfa778);
    }
  });
  // Si el usuario usa una imagen, se aplica en la cara exterior
  const fakeTex = new THREE.Texture();
  ui.state.customArtworkTex = fakeTex;
  const artMaterials = ui.realBuildBoardMaterials();
  assert.equal(artMaterials[0].map, fakeTex);
  assert.equal(ui.resolveMaterialFinish('M-SBS-400').id, 'WHITE-WHITE');
  assert.equal(ui.resolveMaterialFinish('M-125E').id, 'M-125B');
});

test('Detalles agrupa lados simétricos y mantiene separados los que tienen medidas diferentes', () => {
  const ui = app();
  const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
  const groups = ui.getDetailGroups(model, model);
  const group = groups.find(g => g.members.some(f => f.pacdoraName === 'FL'));
  assert.deepEqual(Array.from(group.members, f => f.pacdoraName).sort(), ['FL', 'FR']);
  assert.ok(groups.length < model.faces.filter(f => f.role === 'FLAP').length);
  const changed = structuredClone(model);
  changed.faces.find(f => f.pacdoraName === 'FR').bounds.width += 5;
  assert.equal(ui.getDetailGroups(model, changed).find(g => g.members.some(f => f.pacdoraName === 'FL')).members.length, 1);
});

test('las simetrías vertical y horizontal comparten un solo campo, también sin nombres de catálogo', () => {
  const ui = app();
  const faces = [];
  for (const x of [0, 80]) for (const y of [0, 90]) faces.push({
    id: faces.length, name: 'Solapa', role: 'FLAP',
    bounds: {minX:x, maxX:x+20, minY:y, maxY:y+10, width:20, height:10},
    polygon: [{x,y}, {x:x+20,y}, {x:x+20,y:y+10}, {x,y:y+10}]
  });
  const model = {faces, bounds: {minX:0,maxX:100,minY:0,maxY:100,width:100,height:100}};
  assert.equal(ui.getDetailGroups(model, model).length, 1);
  assert.equal(ui.getDetailGroups(model, model)[0].members.length, 4);
  faces[3].holes = [[{x:85,y:92}, {x:87,y:92}, {x:87,y:94}, {x:85,y:94}]];
  assert.equal(ui.getDetailGroups(model, model).length, 2);
});

test('el modelo completo cabe en el visor al cambiar su proporción', () => {
  const ui = app();
  ui.setup(engine.buildDielineModelFromPacdora(entry.knifeData, entry));
  ui.setMasterFold(0.75);
  for (const aspect of [0.7, 1.25, 2]) {
    ui.camera.aspect = aspect;
    ui.camera.updateProjectionMatrix();
    ui.fitCameraToModel(true);
    for (const {mesh} of ui.meshes.values()) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(ui.camera);
        assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `vértice recortado con proporción ${aspect}`);
      }
    }
  }
});

test('cada vértice exterior tiene la UV del punto correcto, sin deformar los triángulos', () => {
  for (const artwork of [null, {}]) {
    const ui = app();
    ui.state.customArtworkTex = artwork;
    const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
    const face = model.faces.find(f => f.id === model.rootFaceId);
    const hinges = model.hinges.filter(h => h.parentFaceId === face.id || h.childFaceId === face.id);
    const geo = ui.createCrushedPanelGeometry(face, hinges, 3, model.bounds);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const exterior = geo.groups.find(g => g.materialIndex === 0);
    for (let i = exterior.start; i < exterior.start + exterior.count; i++) {
      const u = artwork ? (pos.getX(i) - model.bounds.minX) / model.bounds.width : pos.getX(i) / 130;
      const v = artwork ? (pos.getY(i) + model.bounds.maxY) / model.bounds.height : pos.getY(i) / 130;
      assert.ok(Math.abs(uv.getX(i) - u) < 1e-5, `U del vértice ${i}`);
      assert.ok(Math.abs(uv.getY(i) - v) < 1e-5, `V del vértice ${i}`);
    }
  }
});

test('la superficie 3D respeta los huecos del asa y el perímetro cóncavo de los uñeros', () => {
  const base=engine.buildDielineModelFromPacdora(entry.knifeData,entry);
  for(const [key,options] of [['handle',{length:80,width:20,radius:5}],['thumb_notch',{radius:10,count:2,distance:80}]]) {
    const model=engine.applyPartVariationToModel(base,key,options);
    const face=model.faces.find(f=>f.id===model.partTargetFaceId);
    const ui=app();
    const geo=ui.createCrushedPanelGeometry(face,model.hinges.filter(h=>h.parentFaceId===face.id||h.childFaceId===face.id),3,model.bounds);
    const pos=geo.getAttribute('position');
    const exterior=geo.groups.find(g=>g.materialIndex===0);
    let area=0;
    for(let i=exterior.start;i<exterior.start+exterior.count;i+=3) {
      const ax=pos.getX(i),ay=pos.getY(i),bx=pos.getX(i+1),by=pos.getY(i+1),cx=pos.getX(i+2),cy=pos.getY(i+2);
      area+=Math.abs((bx-ax)*(cy-ay)-(by-ay)*(cx-ax))/2;
      const center={x:(ax+bx+cx)/3,y:-(ay+by+cy)/3};
      assert.equal((face.holes||[]).some(h=>engine.pointInPolygon(center,h)),false);
    }
    assert.ok(Math.abs(area-face.areaMm2)<0.02, `${key}: área 3D ${area} frente a plano ${face.areaMm2}`);
  }
});

test('la pestaña añadida se articula en 3D con el plegado', () => {
  const ui=app();
  const base=engine.buildDielineModelFromPacdora(entry.knifeData,entry);
  const model=engine.applyPartVariationToModel(base,'tab_lock',{length:60,depth:15});
  ui.setup(model);ui.setMasterFold(0);
  const tab=ui.meshes.get(model.hinges.find(h=>h.isPartMod).childFaceId).mesh;
  const pivot=tab.parent.parent;
  const before=pivot.quaternion.clone();
  ui.setMasterFold(1);ui.root.updateMatrixWorld(true);
  assert.ok(before.angleTo(pivot.quaternion)>1.5);
});

test('seleccionar o señalar un panel no añade contornos azules ni el box auxiliar', () => {
  const ui = app();
  const model = engine.buildDielineModelFromPacdora(entry.knifeData, entry);
  ui.setup(model);
  ui.state.selectedFaceId = model.rootFaceId;
  ui.state.hoveredFaceId = model.rootFaceId;
  ui.updateSelectionHighlight();
  assert.ok([...ui.meshes.values()].every(item => !item.cutOutline.visible));
  assert.equal(ui.boxHelpers.children.length, 0);
});
