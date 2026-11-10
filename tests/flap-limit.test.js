const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../dieline-engine');
global.window=global;
require('../assets/pacdora-catalog/folding-box-dielines-p1');
const entry=PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(x=>x.num===150010);
const model=()=>engine.buildDielineModelFromPacdora(entry.knifeData,entry);
const names=new Set(['FBL','FBR','HBL','HBR']);
const flaps=m=>m.faces.filter(f=>names.has(f.pacdoraName));
function valid(m) {
 const base=m.faces.find(f=>f.pacdoraName==='H');
 for(const f of flaps(m)) assert.ok(f.bounds.width<=base.bounds.height/2+1e-6,`${f.pacdoraName}: ${f.bounds.width} > ${base.bounds.height/2}`);
}
test('las cuatro solapas nunca exceden W/2 al cambiar largo, ancho o alto',()=>{
 const base=model(),snapshot=JSON.stringify(base);
 for(const [l,w,h] of [[315,202,62],[315,80,62],[315,20,400],[500,120,300],[100,100,100],[315,202,800],[315,800,62]]) {
  const m=engine.resizeDielineParametric(base,l,w,h);valid(m);
  assert.deepEqual(m.boxDimensionsMm,{length:l,width:w,depth:h});
  assert.equal(engine.enforceFlapLengthLimit(m),m);
 }
 assert.equal(JSON.stringify(base),snapshot);
});
test('el límite conserva las bisagras, los paneles restantes y los cortes de las solapas',()=>{
 const base=model();const flap=flaps(base)[0];const d=base.boxDimensionsMm;
 const enlarged=engine.resizeDielineParametric(base,d.length,d.width,d.depth,{axis:'x',min:flap.bounds.minX,max:flap.bounds.maxX,targetSpan:300});valid(enlarged);
 const narrow=engine.resizeDielineParametric(base,315,50,62);valid(narrow);
 for(const f of flaps(narrow)) {
  assert.ok(Math.abs(f.bounds.width-25)<1e-6);
  const hinge=narrow.hinges.find(h=>h.id===f.hingeId);
  const anchor=f.pacdoraName.endsWith('L')?f.bounds.maxX:f.bounds.minX;
  assert.ok(Math.abs(hinge.p1.x-anchor)<1e-6);assert.ok(Math.abs(hinge.p2.x-anchor)<1e-6);
  // Every visible outer polygon edge has the matching exported cut or fold.
  const segments=[...narrow.cutSegments,...narrow.foldSegments];
  for(let i=0;i<f.polygon.length;i++) {
   const p=f.polygon[i],q=f.polygon[(i+1)%f.polygon.length];
   const on=(p,s)=>{const dx=s.x2-s.x1,dy=s.y2-s.y1,t=((p.x-s.x1)*dx+(p.y-s.y1)*dy)/(dx*dx+dy*dy||1);return t>=-1e-6&&t<=1+1e-6&&Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy)<1e-6;};
   assert.ok(segments.some(s=>on(p,s)&&on(q,s)),f.pacdoraName+' edge '+i);
  }
 }
 for(const fn of [engine.exportDielineToSVG,engine.exportDielineToDXF,engine.exportDielineToPDF])assert.doesNotMatch(fn(narrow),/NaN|Infinity/);
 const snapshot=JSON.parse(JSON.stringify(narrow));
 // Force an invalid persisted flap and normalize it as on library load.
 const f=snapshot.faces.find(f=>f.pacdoraName==='FBL');
 f.bounds.width=100;f.bounds.minX=f.bounds.maxX-100;f.polygon=f.polygon.map(p=>({...p,x:f.bounds.maxX+(p.x-f.bounds.maxX)*4}));
 const fixed=engine.enforceFlapLengthLimit(snapshot);valid(fixed);
 for(const other of snapshot.faces.filter(f=>!names.has(f.pacdoraName)))assert.deepEqual(fixed.faces.find(f=>f.id===other.id),other);
});
test('las solapas válidas y los modelos sin esos paneles no cambian',()=>{
 const base=model();assert.equal(engine.enforceFlapLengthLimit(base),base);
 const unknown={...base,faces:base.faces.map(f=>({...f,pacdoraName:'OTHER',shortName:'OTHER'}))};
 assert.equal(engine.enforceFlapLengthLimit(unknown),unknown);
});
