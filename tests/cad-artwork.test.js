const test=require('node:test');
const assert=require('node:assert/strict');
const cad=require('../cad-io');
const art=require('../artwork-layout');
const engine=require('../dieline-engine');
global.window=global;
require('../assets/pacdora-catalog/folding-box-dielines-p1');
const entry=global.PACDORA_CATALOG_SHARDS['folding-box-dielines-p1'].find(e=>e.num===150010);
const pairs=tags=>tags.flat().join('\n')+'\n';
test('las medidas CAD se estiman desde la base y sus paredes adyacentes',()=>{
  const fs=require('node:fs');
  const imported=engine.buildDielineModel(cad.toSvg(cad.parse(fs.readFileSync(require.resolve('./fixtures/bandeja-120x80.dxf'),'utf8'))));
  assert.deepEqual(engine.dimensionsFromBase(imported),{length:120,width:80,depth:40});
});
function drawing(entities,unit=4,blocks=[]){return pairs([[0,'SECTION'],[2,'HEADER'],[9,'$INSUNITS'],[70,unit],[0,'ENDSEC'],[0,'SECTION'],[2,'BLOCKS'],...blocks,[0,'ENDSEC'],[0,'SECTION'],[2,'ENTITIES'],...entities,[0,'ENDSEC'],[0,'EOF']]);}

test('DXF exportado se vuelve a abrir a escala real con corte, hendido y paneles',()=>{
  const model=engine.buildDielineModelFromPacdora(entry.knifeData,entry);
  const doc=cad.parse(engine.exportDielineToDXF(model));
  assert.equal(doc.mmPerUnit,1);
  assert.ok(doc.groups.some(g=>g.role==='cut'));
  assert.ok(doc.groups.some(g=>g.role==='fold'));
  const imported=engine.buildDielineModel(cad.toSvg(doc));
  assert.ok(Math.abs(imported.bounds.width-model.bounds.width)<0.01);
  assert.ok(Math.abs(imported.bounds.height-model.bounds.height)<0.01);
  assert.ok(imported.faces.length>=10);
  assert.ok(imported.hinges.length>=10);
});

test('DXF conserva el hueco de un asa al importar su contorno',()=>{
  const model=engine.applyPartVariationToModel(engine.buildDielineModelFromPacdora(entry.knifeData,entry),'handle',{length:80,width:20,radius:5});
  const imported=engine.buildDielineModel(cad.toSvg(cad.parse(engine.exportDielineToDXF(model))));
  assert.ok(imported.faces.some(f=>f.holes.length>0));
});

test('DXF interpreta arcos, círculos, bulges y pulgadas',()=>{
  const doc=cad.parse(drawing([[0,'LWPOLYLINE'],[8,'CUT'],[70,1],[10,0],[20,0],[42,1],[10,2],[20,0],[0,'CIRCLE'],[8,'CUT'],[10,5],[20,5],[40,1],[0,'ARC'],[8,'CREASE'],[10,0],[20,0],[40,1],[50,0],[51,90]],1));
  assert.equal(doc.mmPerUnit,25.4);
  assert.equal(doc.groups[0].polylines.length,2);
  assert.ok(doc.groups[0].polylines[0].some(p=>p.y<-0.9));
  const arc=doc.groups.find(g=>g.role==='fold').polylines[0];
  assert.ok(Math.abs(arc[0].x-1)<1e-6&&Math.abs(arc.at(-1).y-1)<1e-6);
  assert.match(cad.toSvg(doc),/width="152\.4mm" height="177\.8mm"/);
});

test('DXF expande bloques con giro, escala y capa heredada',()=>{
  const blocks=[[0,'BLOCK'],[2,'EDGE'],[10,0],[20,0],[0,'LINE'],[8,'0'],[10,0],[20,0],[11,10],[21,0],[0,'ENDBLK']];
  const doc=cad.parse(drawing([[0,'INSERT'],[2,'EDGE'],[8,'HENDIDO'],[10,20],[20,30],[41,2],[42,2],[50,90]],4,blocks));
  assert.equal(doc.groups[0].role,'fold');
  const line=doc.groups[0].polylines[0];
  assert.ok(Math.abs(line[1].x-20)<1e-6&&Math.abs(line[1].y-50)<1e-6);
});

test('DXF permite reclasificar grupos y avisa de entidades no compatibles',()=>{
  const doc=cad.parse(drawing([[0,'LINE'],[8,'GENERAL'],[10,0],[20,0],[11,20],[21,10],[0,'REGION']]));
  assert.equal(doc.warnings.length,1);
  assert.match(cad.toSvg(doc,{[doc.groups[0].id]:'cut'}),/#009ee3/);
  assert.throws(()=>cad.toSvg(doc,{[doc.groups[0].id]:'fold'}),/corte/);
  assert.throws(()=>cad.parse('AutoCAD Binary DXF\x00'),/ASCII/);
  assert.throws(()=>cad.parse('0\nSECTION\n2\n'),/incompleto/);
});

test('una nueva base mantiene las caras conectadas y cambia la raíz sin alterar el original',()=>{
  const model=engine.buildDielineModelFromPacdora(entry.knifeData,entry);
  const id=model.faces.find(f=>f.id!==model.rootFaceId).id;
  const changed=engine.rerootDielineModel(model,id);
  assert.equal(changed.rootFaceId,id);
  assert.equal(changed.hinges.length,model.hinges.length);
  assert.notEqual(model.rootFaceId,id);
});

test('el ajuste de imagen conserva proporciones y la transformación UV es invertible',()=>{
  const layout=art.fit({minX:20,minY:30,width:300,height:200},1200,600);
  assert.equal(layout.width,300);assert.equal(layout.height,150);
  for(const rotation of [0,90,-45,180]){
    layout.rotation=rotation;
    const corners=art.corners(layout),expected=[[0,0],[1,0],[1,1],[0,1]];
    corners.forEach((p,i)=>{const uv=art.imageUV(p,layout);assert.ok(Math.abs(uv.u-expected[i][0])<1e-6&&Math.abs(uv.v-expected[i][1])<1e-6);});
  }
  layout.mirrorX=true;layout.mirrorY=true;
  const uv=art.imageUV(art.corners(layout)[0],layout);
  assert.ok(Math.abs(uv.u-1)<1e-6&&Math.abs(uv.v-1)<1e-6);
});
