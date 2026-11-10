const test=require('node:test'),assert=require('node:assert/strict');
const cad=require('../vector-cad'),engine=require('../dieline-engine');
const line=(x1,y1,x2,y2)=>({x1,y1,x2,y2,type:'CUT'});
function base(){
 const polygon=[{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80}],bounds={minX:0,minY:0,maxX:100,maxY:80,width:100,height:80};
 return {faces:[{id:0,polygon,holes:[],bounds,centroid:{x:50,y:40},label:'Base',pacdoraName:'H',shortName:'H',role:'BODY'}],rootFaceId:0,hinges:[],foldSegments:[],cutSegments:[line(0,0,100,0),line(100,0,100,80),line(100,80,0,80),line(0,80,0,0)],bounds,boxDimensionsMm:{length:100,width:80,depth:20}};
}
const ref=(index,kind='cut')=>({type:'line',kind,index});
test('el tipo mueve el trazo entre corte y hendido y elimina colores libres',()=>{
 const m=base();m.cutSegments[0].color='#123456';
 const changed=cad.classify(m,ref(0),'fold');
 assert.equal(changed.cutSegments.length,3);assert.equal(changed.foldSegments.length,1);assert.equal(changed.foldSegments[0].type,'FOLD');assert.equal(changed.foldSegments[0].color,undefined);assert.equal(m.cutSegments.length,4);
 assert.equal(cad.classify(changed,ref(0,'fold'),'cut').cutSegments.length,4);
 for(const fn of [engine.exportDielineToSVG,engine.exportDielineToDXF,engine.exportDielineToPDF])assert.doesNotMatch(fn(m),/#123456|1193046|0\.071 0\.204 0\.337/);
});
test('el círculo crea un agujero físico y el borrador lo elimina en una operación',()=>{
 const m=base(),circled=cad.circle(m,{x:30,y:30},10,'cut'),rebuilt=cad.rebuild(circled,engine);
 assert.equal(rebuilt.vector3DStale,false);assert.equal(rebuilt.faces.length,1);assert.equal(rebuilt.faces[0].holes.length,1);
 const hole=rebuilt.faces[0].holes[0];assert.ok(hole.every(p=>Math.abs(Math.hypot(p.x-30,p.y-30)-10)<1e-6));
 const erased=cad.rebuild(cad.erase(rebuilt,ref(4)),engine);assert.equal(erased.cutSegments.length,4);assert.equal(erased.faces[0].holes.length,0);
});
test('una línea de hendido entre bordes divide el panel y genera una bisagra real',()=>{
 const m=cad.rebuild(cad.addLine(base(),{x:50,y:0},{x:50,y:80},'fold'),engine);
 assert.equal(m.faces.length,2);assert.equal(m.hinges.length,1);assert.equal(m.foldSegments.length,1);
 const svg=engine.exportDielineToSVG(m);assert.match(svg,/Hendido_Rojo/);assert.ok(m.hinges[0].p1.x===50&&m.hinges[0].p2.x===50);
});
test('extender y contraer el extremo pulsado se detienen en la primera colisión',()=>{
 const m=base();m.cutSegments=[line(0,0,10,0),line(20,-5,20,5),line(30,-5,30,5)];
 const extended=cad.collide(m,ref(0),{x:10,y:0},true);assert.equal(extended.cutSegments[0].x2,20);
 m.cutSegments=[line(0,0,40,0),line(20,-5,20,5),line(30,-5,30,5)];
 assert.equal(cad.collide(m,ref(0),{x:40,y:0},false).cutSegments[0].x2,30);
 assert.equal(cad.collide(m,ref(0),{x:0,y:0},false).cutSegments[0].x1,20);
 assert.throws(()=>cad.collide(m,ref(0),{x:40,y:0},true),/colisión/);
});
test('chaflán recorta ambas líneas y mantiene cerrado el contorno',()=>{
 const m=cad.corner(base(),ref(0),ref(1),10,false);
 assert.deepEqual(m.cutSegments[0],line(0,0,90,0));assert.deepEqual(m.cutSegments[1],line(100,10,100,80));
 assert.ok(m.cutSegments.some(s=>s.x1===90&&s.y1===0&&s.x2===100&&Math.abs(s.y2-10)<1e-6));
 const rebuilt=cad.rebuild(m,engine);assert.equal(rebuilt.faces.length,1);assert.ok(Math.abs(rebuilt.totalAreaMm2-7950)<1e-5);
});
test('radio crea un arco tangente con el radio indicado y rechaza medidas imposibles',()=>{
 const m=cad.corner(base(),ref(0),ref(1),10,true),arc=m.cutSegments.slice(4);
 assert.ok(Math.abs(m.cutSegments[0].x2-90)<1e-6);assert.ok(Math.abs(m.cutSegments[1].y1-10)<1e-6);
 for(const s of arc)for(const p of [{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}])assert.ok(Math.abs(Math.hypot(p.x-90,p.y-10)-10)<1e-6);
 assert.equal(cad.rebuild(m,engine).faces.length,1);
 assert.throws(()=>cad.corner(base(),ref(0),ref(1),500,true),/demasiado/);
 assert.throws(()=>cad.corner(base(),ref(0),ref(2),5,true),/paralelas/);
});
test('un contorno abierto conserva sus trazos y señala que el 3D está pendiente',()=>{
 const m=cad.rebuild(cad.erase(base(),ref(0)),engine);
 assert.equal(m.cutSegments.length,3);assert.equal(m.vector3DStale,true);assert.equal(m.faces.length,0);
 const closed=cad.rebuild(cad.addLine(m,{x:0,y:0},{x:100,y:0},'cut'),engine);assert.equal(closed.vector3DStale,false);assert.equal(closed.faces.length,1);
});

test('editar y borrar un agujero en el modelo de biblioteca conserva H, las ranuras y las cuatro solapas',()=>{
 global.window=global;require('../assets/pacdora-catalog/folding-box-dielines-p1');
 const entry=PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(x=>x.num===150010),m=engine.buildDielineModelFromPacdora(entry.knifeData,entry),h=m.faces.find(f=>f.pacdoraName==='H');
 const r=cad.rebuild(cad.circle(m,h.centroid,10,'cut'),engine);
 assert.equal(r.faces.length,m.faces.length);assert.equal(r.hinges.length,m.hinges.length);assert.equal(r.faces.find(f=>f.id===r.rootFaceId).pacdoraName,'H');
 assert.equal(r.faces.find(f=>f.pacdoraName==='H').holes.length,1);
 const erased=cad.rebuild(cad.erase(r,ref(m.cutSegments.length)),engine);assert.equal(erased.faces.length,m.faces.length);assert.equal(erased.faces.find(f=>f.pacdoraName==='H').holes.length,0);
 const narrow=engine.resizeDielineParametric(r,315,50,300),base=narrow.faces.find(f=>f.pacdoraName==='H');
 for(const f of narrow.faces.filter(f=>['FBL','FBR','HBL','HBR'].includes(f.pacdoraName)))assert.ok(f.bounds.width<=base.bounds.height/2+1e-6);
});
