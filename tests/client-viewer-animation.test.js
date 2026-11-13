const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const THREE=require('../assets/libs/three.min');

test('el canvas encuadra toda la caja en pantallas estrechas y anchas',()=>{
  const source=fs.readFileSync(require.resolve('../revision-publicacion/visor/viewer.js'),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('export class ModelViewer','globalThis.ModelViewer = class ModelViewer');
  const context={THREE,console};vm.createContext(context);vm.runInContext(source,context);
  for(const aspect of [.3,.7,1,2]){
    const viewer=Object.create(context.ModelViewer.prototype);
    viewer.pivot=new THREE.Group();viewer.content=new THREE.Mesh(new THREE.BoxGeometry(2,1,1));viewer.pivot.add(viewer.content);
    viewer.camera=new THREE.PerspectiveCamera(45,aspect,.01,100);
    viewer.controls={target:new THREE.Vector3(),update(){viewer.camera.lookAt(this.target);viewer.camera.updateMatrixWorld(true);}};
    viewer.config={};viewer._fitLights=()=>{};viewer._fitGround=()=>{};
    viewer._frame();viewer.pivot.updateMatrixWorld(true);
    for(const x of [-1,1])for(const y of [-.5,.5])for(const z of [-.5,.5]){
      const point=new THREE.Vector3(x,y,z).applyMatrix4(viewer.content.matrixWorld).project(viewer.camera);
      assert.ok(Math.abs(point.x)<1 && Math.abs(point.y)<1,`aspecto ${aspect}: ${point.toArray()}`);
    }
  }
});

test('la reparación del visor conecta los clips del GLB, avisa a los controles y reproduce los huesos',async()=>{
  const source=fs.readFileSync(require.resolve('../revision-publicacion/visor/viewer.js'),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('export class ModelViewer','globalThis.ModelViewer = class ModelViewer');
  const context={THREE,console};vm.createContext(context);vm.runInContext(source,context);
  const viewer=Object.create(context.ModelViewer.prototype);
  const scene=new THREE.Group(),bone=new THREE.Bone();bone.name='Pivot_prueba';scene.add(bone);
  const clips=[new THREE.AnimationClip('01_Plegado',1,[new THREE.QuaternionKeyframeTrack('Pivot_prueba.quaternion',[0,1],[0,0,0,1,Math.SQRT1_2,0,0,Math.SQRT1_2])])];
  Object.assign(viewer,{_loadToken:0,mixer:null,animClips:[],activeAction:null,isPlayingAnimation:false,
    _loadAsync:async()=>({scene,animations:clips}),_registerModel(){},
    _setContent(object,name){this.content=object;this.contentLabel=name;},
    timer:{update(){},getDelta(){return .1;}},controls:{update(){}},renderer:{render(){}},config:{}});
  const events=[],progress=[];viewer.onStatus=(status,detail)=>events.push([status,detail]);viewer.onAnimationUpdate=(...args)=>progress.push(args);
  await viewer.loadModel('prueba.glb');
  assert.equal(events.at(-1)[1].hasAnimations,true);
  assert.equal(viewer.animClips.length,1);
  viewer.setAnimationProgress(0);
  assert.ok(bone.quaternion.angleTo(new THREE.Quaternion())<1e-6);
  viewer.playAnimation();viewer._tick(100);
  assert.ok(bone.quaternion.angleTo(new THREE.Quaternion())>0);
  assert.ok(progress.at(-1)[0]>0);
  for(let i=0;i<11;i++)viewer._tick(200+i*100);
  assert.equal(viewer.isPlayingAnimation,false);
  assert.ok(Math.abs(bone.quaternion.angleTo(new THREE.Quaternion())-Math.PI/2)<1e-6);
});
