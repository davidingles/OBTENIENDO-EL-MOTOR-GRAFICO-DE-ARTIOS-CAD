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
  const context = {THREE, DielineEngine: engine, console, performance, window: {addEventListener() {}}, document: {getElementById() { return null; }}};
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
  const expected = [['WhiteBoard3.JPG', 'WhiteBoard3.JPG'], ['WhiteBoard3.JPG', 'boardbrown.jpg'], ['boardbrown.jpg', 'boardbrown.jpg']];
  ui.MATERIAL_FINISHES.forEach((finish, index) => {
    ui.state.boardId = finish.id;
    const materials = ui.realBuildBoardMaterials();
    assert.equal(materials[0].map.name, expected[index][0]);
    assert.equal(materials[1].map.name, expected[index][1]);
    if (index === 0) assert.equal(materials[1].color.getHex(), 0xffffff);
  });
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
