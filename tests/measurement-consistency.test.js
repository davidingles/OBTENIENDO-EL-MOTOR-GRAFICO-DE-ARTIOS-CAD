const test=require('node:test'),assert=require('node:assert/strict'),engine=require('../dieline-engine');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function panel(){
 const polygon=[{x:0,y:0},{x:120,y:0},{x:120,y:316},{x:0,y:316}],bounds={minX:0,minY:0,maxX:120,maxY:316,width:120,height:316};
 const hole=[{x:50,y:146},{x:70,y:146},{x:70,y:154},{x:50,y:154}];
 const fold={x1:52,y1:146,x2:68,y2:146};
 return {faces:[{id:0,role:'BODY',polygon,bounds,holes:[hole]}],rootFaceId:0,boxDimensionsMm:{length:120,width:80,depth:316},
 cutSegments:hole.map((p,i)=>{const q=hole[(i+1)%hole.length];return {x1:p.x,y1:p.y,x2:q.x,y2:q.y};}),foldSegments:[fold],
 hinges:[{id:'handle',parentFaceId:0,childFaceId:1,p1:{x:52,y:146},p2:{x:68,y:146}}],
 sizeArrowData:[{lineName:'L',lineLength:1200,p1:{x:0,y:200},p2:{x:120,y:200},tpointer:{x:60,y:200,value:'L=1200'}}]};
}
test('dimension values are measured, including stale labels from saved geometry',()=>{
 const m=panel(),r=engine.reconcileDimensionMeasurements(m);
 close(r.sizeArrowData[0].lineLength,120);
 assert.equal(r.sizeArrowData[0].tpointer.value,'L=120.0 mm');
 assert.equal(m.sizeArrowData[0].lineLength,1200);
});
test('local band edits report their actual length and expose an unsatisfied requested dimension',()=>{
 const r=engine.resizeDielineParametric(panel(),120,80,316,{axis:'x',min:0,max:120,targetSpan:240});
 close(r.faces[0].bounds.width,240);close(r.sizeArrowData[0].lineLength,240);
 assert.equal(r.dimensionErrors[0].requested,120);close(r.dimensionErrors[0].measured,240);
});
test('handle cuts, creases, hinge and hole dimensions share a rigid translation',()=>{
 const m=panel();m.outsideArrowData=[{lineName:'hole',p1:{x:50,y:150},p2:{x:70,y:150}}];
 for(const [l,h] of [[240,632],[60,158]]){
  const r=engine.resizeDielineParametric(m,l,80,h),hole=r.faces[0].holes[0],s=r.foldSegments[0],hinge=r.hinges[0];
  close(s.y1,hole[0].y);close(s.y2,hole[0].y);close(s.x1-hole[0].x,2);close(s.x2-s.x1,16);
  close(hinge.p1.x,s.x1);close(hinge.p1.y,s.y1);close(hinge.p2.x,s.x2);
  close(r.outsideArrowData[0].lineLength,20);close(r.sizeArrowData[0].lineLength,l);
 }
});

test('the imported American box keeps geometry, arrows and drawing proportions consistent',()=>{
 const fs=require('node:fs');
 const base=engine.buildDielineModel(fs.readFileSync(require.resolve('../b1 caja americana.svg'),'utf8'));
 for(const m of [base,engine.resizeDielineParametric(base,460,1200,316)]){
  for(const a of m.sizeArrowData)close(a.lineLength,engine.measureDimensionArrow(a));
 }
 const r=engine.resizeDielineParametric(base,460,1200,316),L=r.sizeArrowData.find(a=>a.lineName==='L'),W=r.sizeArrowData.find(a=>a.lineName==='W');
 close(engine.measureDimensionArrow(W)/engine.measureDimensionArrow(L),1200/460);
 assert.equal(r.dimensionErrors.length,0);
});
