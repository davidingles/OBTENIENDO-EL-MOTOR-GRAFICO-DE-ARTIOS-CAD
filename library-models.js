(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.UserLibrary=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const boardThicknessMm={C1:1.5,C3:3,C5:4.5,C8:7};
  function validate(model){
    if(!model||!Number.isSafeInteger(model.num)||model.num<=100000000000)throw new Error('Identificador de modelo no válido.');
    if(typeof model.name!=='string'||!model.name.trim()||Array.from(model.name.trim()).length>100)throw new Error('Escribe un nombre de entre 1 y 100 caracteres.');
    if(!Object.hasOwn(boardThicknessMm,model.boardCode))throw new Error('Elige C1, C3, C5 o C8.');
    const g=model.geometry;
    if(!g||!Array.isArray(g.faces)||!g.faces.length||g.faces.length>10000||!Array.isArray(g.hinges)||!Array.isArray(g.cutSegments)||!Array.isArray(g.foldSegments))throw new Error('El archivo no contiene un troquel válido.');
    if(!['width','height'].every(key=>Number.isFinite(g.bounds?.[key])&&g.bounds[key]>0))throw new Error('Las medidas del plano no son válidas.');
    if(!g.faces.some(f=>f.id===g.rootFaceId))throw new Error('No se encuentra el panel base.');
    for(const face of g.faces){
      if(!Array.isArray(face.polygon)||face.polygon.length<3||!face.polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('Hay paneles con contornos no válidos.');
    }
    return model;
  }
  function create(name,boardCode,geometry,sourceFilename='',id=Date.now()*1000+Math.floor(Math.random()*1000)){
    const g=JSON.parse(JSON.stringify(geometry));
    const model={num:id,id,userModel:true,name:String(name).trim(),boardCode,thickness:boardThicknessMm[boardCode]??null,
      length:g.boxDimensionsMm?.length,width:g.boxDimensionsMm?.width,height:g.boxDimensionsMm?.depth,
      sourceFilename,geometry:g,createdAt:new Date().toISOString(),modelCategories:['user-models'],useCategories:[]};
    validate(model);
    if(new TextEncoder().encode(JSON.stringify(model)).length>8000000)throw new Error('El modelo supera el límite de 8 MB.');
    return model;
  }
  function normalize(models){
    const accepted=[],seen=new Set();
    for(const candidate of Array.isArray(models)?models:[]){
      try{validate(candidate);if(seen.has(candidate.num))continue;seen.add(candidate.num);accepted.push({...candidate,userModel:true,thickness:boardThicknessMm[candidate.boardCode]??null,modelCategories:['user-models']});}catch{}
    }
    return accepted.sort((a,b)=>b.num-a.num);
  }
  return {boardThicknessMm,validate,create,normalize};
});
