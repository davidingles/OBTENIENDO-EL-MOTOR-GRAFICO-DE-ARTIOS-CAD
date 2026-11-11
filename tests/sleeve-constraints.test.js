const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../dieline-engine');
function sleeve(rotated = false) {
  const point = (x,y) => rotated ? {x:y,y:x} : {x,y};
  let x=0;
  const faces=[25,316,700,150,700].map((w,id)=>{
    const polygon=[point(x,0),point(x+w,0),point(x+w,316),point(x,316)]; x+=w;
    const xs=polygon.map(p=>p.x), ys=polygon.map(p=>p.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    return {id,role:id?'BODY':'GLUE_FLAP',polygon,holes:[],bounds:{minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY}};
  });
  faces[1].holes=[[point(163,140),point(203,140),point(203,160),point(163,160)]];
  return {faces,hinges:faces.slice(1).map((f,i)=>({parentFaceId:i,childFaceId:i+1,p1:f.polygon[0],p2:f.polygon[3],defaultAngle:90})),
    cutSegments:[],foldSegments:[],boxDimensionsMm:{length:700,width:150,depth:316},
    sizeArrowData:[{lineName:'L',p1:point(341,100),p2:point(1041,100)},{lineName:'W',p1:point(1041,100),p2:point(1191,100)}]};
}
for (const rotated of [false,true]) test(`opposite sleeve walls follow anchors, rotated=${rotated}`,()=>{
  const base=sleeve(rotated), original=JSON.stringify(base);
  const result=engine.resizeDielineParametric(base,700,150,316);
  const span=rotated?'height':'width';
  assert.deepEqual(result.faces.slice(1).map(f=>f.bounds[span]),[150,700,150,700]);
  const hole=result.faces[1].holes[0];
  assert.equal(Math.hypot(hole[1].x-hole[0].x,hole[1].y-hole[0].y),40);
  assert.equal(JSON.stringify(base),original);
  const again=engine.resizeDielineParametric(result,500,200,316);
  assert.deepEqual(again.faces.slice(1).map(f=>f.bounds[span]),[200,500,200,500]);
});
test('does not impose sleeve equality on disconnected, trapezoidal or oblique-fold layouts',()=>{
  for(const mutate of [m=>m.hinges.splice(1,1), m=>m.faces[1].polygon[1].x-=70, m=>m.hinges[1].defaultAngle=60, m=>m.faces[0].role='FLAP']) {
    const m=sleeve();mutate(m);
    const r=engine.resizeDielineParametric(m,700,150,316);
    assert.equal(r.faces[1].bounds.width,316);
  }
});
test('explicit local edits remain local',()=>{
  const m=sleeve();
  const r=engine.resizeDielineParametric(m,700,150,316,{axis:'x',min:25,max:341,targetSpan:280});
  assert.equal(r.faces[1].bounds.width,280);
  assert.equal(r.faces[3].bounds.width,150);
});
test('conflicting anchors do not invent a rectangular constraint',()=>{
  const m=sleeve();m.sizeArrowData[0]={lineName:'L',p1:{x:25,y:100},p2:{x:341,y:100}};
  assert.equal(engine.resizeDielineParametric(m,700,150,316).faces[1].bounds.width,316);
});
