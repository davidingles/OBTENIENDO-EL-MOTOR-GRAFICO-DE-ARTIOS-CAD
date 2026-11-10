const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const VectorCAD=require('../vector-cad');
for(const ratio of [1,1.5,2])test('zoom centra la selección y mantiene el punto del cursor sin selección a escala '+ratio,()=>{
 const canvas={width:1000*ratio,height:700*ratio,getBoundingClientRect:()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700})};
 const c={DielineEngine:require('../dieline-engine'),VectorCAD,performance,window:{addEventListener(){}},document:{getElementById:()=>canvas,querySelector:()=>null}};vm.createContext(c);
 vm.runInContext(fs.readFileSync(require.resolve('../app'),'utf8').replace(/\}\)\(\);\s*$/,`render2FDieline=()=>{};globalThis.api={state,zoom2D,get2DTransform,select(v){vectorSelection=v;vectorEditing=true;}};})();`),c);
 const {api}=c;const bounds={minX:0,minY:0,maxX:200,maxY:100,width:200,height:100};
 api.state.dieline={bounds,faces:[],cutSegments:[{x1:10,y1:20,x2:30,y2:20}],foldSegments:[]};api.select({type:'line',kind:'cut',index:0});
 api.zoom2D(1.25);let tf=api.get2DTransform(canvas,bounds);assert.ok(Math.abs(tf.toScreenX(20)-tf.centerX)<1e-6);assert.ok(Math.abs(tf.toScreenY(20)-tf.centerY)<1e-6);
 api.select(null);const e={clientX:700,clientY:300};tf=api.get2DTransform(canvas,bounds);const x=tf.toWorldX(700*ratio),y=tf.toWorldY(300*ratio);api.zoom2D(1.25,e);tf=api.get2DTransform(canvas,bounds);assert.ok(Math.abs(tf.toScreenX(x)-700*ratio)<1e-6);assert.ok(Math.abs(tf.toScreenY(y)-300*ratio)<1e-6);
});

