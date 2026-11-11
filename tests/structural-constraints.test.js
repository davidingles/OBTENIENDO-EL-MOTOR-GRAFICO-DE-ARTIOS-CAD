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

test('the screenshot dimensions keep every visible automatic-bottom crease at 45 degrees',()=>{
 const r=engine.resizeDielineParametric(model(),120.6,30,161.6);
 const diagonal=r.foldSegments.filter(s=>Math.abs(s.x2-s.x1)>1&&Math.abs(s.y2-s.y1)>1);
 assert.equal(diagonal.length,2);
 for(const s of diagonal)close(Math.abs(s.x2-s.x1),Math.abs(s.y2-s.y1));
});
test('legacy geometry without slope metadata recovers automatic-bottom angles on load',()=>{
 const m=model();
 // Reproduce a legacy anisotropic warp in every geometry representation.
 const point=p=>({...p,y:p.y*.5});
 for(const f of m.faces){f.polygon=f.polygon.map(point);f.points=f.polygon;f.bounds.minY*=.5;f.bounds.maxY*=.5;f.bounds.height*=.5;f.bbox={...f.bounds};}
 for(const h of m.hinges){h.p1=point(h.p1);h.p2=point(h.p2);delete h.planarSlope;}
 for(const s of [...m.cutSegments,...m.foldSegments]){s.y1*=.5;s.y2*=.5;}
 const fixed=engine.enforceFlapLengthLimit(JSON.parse(JSON.stringify(m)));
 const diagonal=fixed.foldSegments.filter(s=>Math.abs(s.x2-s.x1)>1&&Math.abs(s.y2-s.y1)>1);
 assert.equal(diagonal.length,2);
 for(const s of diagonal)close(Math.abs(s.x2-s.x1),Math.abs(s.y2-s.y1));
});
test('the glue-flap terminal corner is square in both polygon and visible cuts',()=>{
 const r=engine.resizeDielineParametric(model(),120.6,30,161.6);
 const f=r.faces.find(f=>f.role==='GLUE_FLAP'),b=f.bounds;
 assert.ok(f.polygon.some(p=>Math.abs(p.x-b.minX)<1e-6&&Math.abs(p.y-b.maxY)<1e-6));
 const bottom=r.cutSegments.filter(s=>Math.abs(s.y1-b.maxY)<1e-6&&Math.abs(s.y2-b.maxY)<1e-6);
 assert.ok(bottom.some(s=>Math.abs(s.x1-s.x2)>=b.width-1e-6));
 assert.ok(f.polygon.every(p=>Math.abs(p.x-b.minX)<1e-6||Math.abs(p.x-b.maxX)<1e-6));
});
