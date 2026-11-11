const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../dieline-engine');
global.window=global;require('../assets/pacdora-catalog/folding-box-dielines-p1');
function model(){const entry=PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e=>e.num===10501002);return engine.buildDielineModelFromPacdora(entry.knifeData,entry);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function check(m,ids,length){
 for(const id of ids)assert.ok(m.faces.find(f=>f.id===id).bounds.height<=length/2+1e-6);
 for(const h of m.hinges.filter(h=>h.planarSlope)){
  close((h.p2.x-h.p1.x)/(h.p2.y-h.p1.y),h.planarSlope);
  const on=(p,s)=>{
   const dx=s.x2-s.x1,dy=s.y2-s.y1,t=((p.x-s.x1)*dx+(p.y-s.y1)*dy)/(dx*dx+dy*dy);
   return t>=-1e-6&&t<=1+1e-6&&Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy)<1e-6;
  };
  assert.ok(m.foldSegments.some(s=>on(h.p1,s)&&on(h.p2,s)),'exported fold matches hinge');
 }
}
test('dust flaps use receiving-wall half span and lock folds retain 45 degrees without catalog names',()=>{
 const m=model(),ids=m.faces.filter(f=>['FRT','FLT'].includes(f.pacdoraName)).map(f=>f.id);
 for(const f of m.faces){delete f.pacdoraName;delete f.shortName;delete f.name;delete f.label;}
 for(const h of m.hinges)delete h.pacdoraFoldName;
 const snapshot=JSON.stringify(m);
 let r=m;
 for(const [l,w,h] of [[30,50,161.6],[100,35,90],[40,80,200],[60,40,100]]){
  r=engine.resizeDielineParametric(r,l,w,h);check(r,ids,l);
 }
 assert.equal(JSON.stringify(m),snapshot);
});
test('constraint corrections preserve every shared polygon vertex and keep the body attachment fixed',()=>{
 const m=model(),r=engine.resizeDielineParametric(m,30,50,161.6);
 for(const h of r.hinges.filter(h=>h.planarSlope)){
  for(const id of [h.parentFaceId,h.childFaceId]){
   const f=r.faces.find(f=>f.id===id);
   for(const p of [h.p1,h.p2])assert.ok(f.polygon.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-6));
  }
 }
 for(const f of r.faces)assert.ok(f.polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 const twice=engine.enforceFlapLengthLimit(r);
 for(const h of r.hinges){const q=twice.hinges.find(q=>q.id===h.id);close(q.p1.x,h.p1.x);close(q.p2.y,h.p2.y);}
});
