const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const library=require('../library-models');
const cad=require('../cad-io');
const engine=require('../dieline-engine');
function geometry(){return engine.buildDielineModel(cad.toSvg(cad.parse(fs.readFileSync(require.resolve('./fixtures/bandeja-120x80.dxf'),'utf8'))));}

test('guardar y reabrir un modelo conserva su geometría completa y no depende del original',()=>{
  const original=geometry();
  const saved=library.create('  Bandeja ñ 120 × 80  ','C3',original,'bandeja.dxf',1800000000001);
  const reopened=library.normalize(JSON.parse(JSON.stringify([saved])))[0];
  assert.equal(reopened.name,'Bandeja ñ 120 × 80');
  assert.equal(reopened.boardCode,'C3');
  assert.equal(reopened.thickness,3);
  assert.deepEqual(reopened.geometry,original);
  assert.notEqual(saved.geometry,original);
  original.faces[0].polygon[0].x+=99;
  assert.notDeepEqual(saved.geometry,original);
});

test('los cuatro cartones usan el espesor confirmado sin modificar cortes ni hendidos',()=>{
  const original=geometry();
  for(const [code,mm] of Object.entries({C1:1.5,C3:3,C5:4.5,C8:7})){
    const saved=library.create('Bandeja',code,original);
    assert.equal(saved.thickness,mm);
    assert.deepEqual(saved.geometry,original);
    assert.deepEqual(library.normalize([saved])[0].modelCategories,['user-models']);
  }
});

test('la biblioteca rechaza nombres vacíos, códigos y geometría inválidos y descarta duplicados',()=>{
  const original=geometry();
  assert.throws(()=>library.create('  ','C1',original));
  assert.throws(()=>library.create('a'.repeat(101),'C1',original));
  assert.throws(()=>library.create('Caja','C9',original));
  assert.throws(()=>library.create('Caja','C1',{...original,rootFaceId:'missing'}));
  assert.throws(()=>library.create('Caja','C1',original,'',12));
  const first=library.create('Caja','C8',original,'',1800000000001);
  const second=library.create('Caja 2','C5',original,'',1800000000002);
  assert.deepEqual(library.normalize([first,first,{bad:true},second]).map(m=>m.num),[second.num,first.num]);
});


test('normalizar y editar una copia nunca modifica la instantanea guardada',()=>{
  const saved=library.create('Original','C1',geometry());
  const before=JSON.stringify(saved);
  const copy=library.normalize([saved])[0];
  copy.geometry.faces[0].polygon[0].x+=25;
  assert.equal(JSON.stringify(saved),before);
});

test('almacen versionado persiste entre lecturas y rechaza sobrescribir el mismo identificador',()=>{
  const store=require('../desktop/library-store'),os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'troqueles-library-'));
  try{
    const saved=library.create('Instantanea','C1',geometry());
    store.add(dir,saved);
    const before=fs.readFileSync(path.join(dir,saved.num+'.json'),'utf8');
    saved.geometry.faces[0].polygon[0].x+=25;
    assert.throws(()=>store.add(dir,saved));
    assert.equal(fs.readFileSync(path.join(dir,saved.num+'.json'),'utf8'),before);
    const loaded=store.read(dir);
    assert.equal(loaded.models.length,1);assert.deepEqual(loaded.warnings,[]);
    assert.notDeepEqual(loaded.models[0].geometry,saved.geometry);
  }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
