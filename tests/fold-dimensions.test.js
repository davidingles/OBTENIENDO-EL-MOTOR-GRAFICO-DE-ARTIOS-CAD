const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../dieline-engine');
global.window=global;require('../assets/pacdora-catalog/folding-box-dielines-p1');
const entries=global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'];
const model=num=>{const a=entries.find(e=>e.num===num);return engine.buildDielineModelFromPacdora(a.knifeData,a);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const num of [10001004,10001018,10501002]) test(`catalog ${num}: distinguish L/W when equal initially, connect lids and walls`,()=>{
 const m=model(num),r=engine.resizeDielineParametric(m,120,51.3,92);
 const face=n=>r.faces.find(f=>f.pacdoraName===n);
 near(face('H').bounds.width,120);near(face('F').bounds.width,120);
 near(face('FR').bounds.width,51.3);near(face('FL').bounds.width,50.3);
 near(face('HT2').bounds.height,51.3);
 const next=engine.resizeDielineParametric(r,180,75,130);
 near(next.faces.find(f=>f.pacdoraName==='FR').bounds.width,75);
 near(next.faces.find(f=>f.pacdoraName==='HT2').bounds.height,75);
});
test('a width anchor placed on the lid also drives side walls',()=>{
 const m=model(10001004),lid=m.faces.find(f=>f.pacdoraName==='HT2'),b=lid.bounds;
 m.sizeArrowData=m.sizeArrowData.filter(a=>a.lineName!=='W');
 m.sizeArrowData.push({lineName:'W',p1:{x:(b.minX+b.maxX)/2,y:b.minY},p2:{x:(b.minX+b.maxX)/2,y:b.maxY}});
 const r=engine.resizeDielineParametric(m,120,51.3,92);
 near(r.faces.find(f=>f.pacdoraName==='FR').bounds.width,51.3);
 near(r.faces.find(f=>f.pacdoraName==='HT2').bounds.height,51.3);
});
test('conflicting physical directions do not produce inferred bands',()=>{
 const m=model(10001004);m.sizeArrowData.find(a=>a.lineName==='W').lineName='L';
 assert.equal(engine.inferFoldDimensionBands(m,{L:120,W:60,H:90}).length,0);
});
test('catalog sweep: finite closed polygons, preserved topology and authoritative dimensions',()=>{
 let recognized=0;
 for(const entry of entries){
  const m=engine.buildDielineModelFromPacdora(entry.knifeData,entry),d=m.boxDimensionsMm;
  if(!engine.inferFoldDimensionBands(m,{L:d.length,W:d.width,H:d.depth}).length)continue;
  recognized++;
  for(const factors of [[1.2,.8,1.1],[.8,1.2,.9]]){
   const values=[d.length*factors[0],d.width*factors[1],d.depth*factors[2]],r=engine.resizeDielineParametric(m,...values);
   assert.equal(r.faces.length,m.faces.length);assert.equal(r.hinges.length,m.hinges.length);
   for(const f of r.faces){assert.ok(f.bounds.width>0&&f.bounds.height>0,entry.num);assert.ok(f.polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),entry.num);}
   for(const [i,key] of ['L','W','H'].entries()){
    const a=r.sizeArrowData.find(a=>a.lineName===key);if(a)near(Math.hypot(a.p2.x-a.p1.x,a.p2.y-a.p1.y),values[i]);
   }
  }
 }
 assert.ok(recognized>=90,`recognized ${recognized}`);
});
