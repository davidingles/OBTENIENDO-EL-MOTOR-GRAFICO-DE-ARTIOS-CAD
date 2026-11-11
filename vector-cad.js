(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.VectorCAD=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const EPS=1e-7, clone=v=>JSON.parse(JSON.stringify(v));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const a=s=>({x:s.x1,y:s.y1}), b=s=>({x:s.x2,y:s.y2});
  const line=(p,q,extra={})=>({...extra,x1:p.x,y1:p.y,x2:q.x,y2:q.y});
  const list=(m,kind)=>kind==='fold'?m.foldSegments:m.cutSegments;
  const get=(m,ref)=>list(m,ref.kind)[ref.index];
  function normalize(model){
    const m=clone(model);
    for(const kind of ['cut','fold'])for(const s of list(m,kind)){delete s.color;s.type=kind==='cut'?'CUT':'FOLD';}
    m.cutSegmentsMm=m.cutSegments;m.foldSegmentsMm=m.foldSegments;return m;
  }
  function hit(model,p,tolerance){
    let best=tolerance,ref=null;
    for(const kind of ['cut','fold'])list(model,kind).forEach((s,index)=>{
      const dx=s.x2-s.x1,dy=s.y2-s.y1,t=Math.max(0,Math.min(1,((p.x-s.x1)*dx+(p.y-s.y1)*dy)/(dx*dx+dy*dy||1)));
      const d=Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy);
      if(d<best){best=d;ref={type:'line',kind,index};}
    });return ref;
  }
  const samePt=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y)<0.1;
  const sameSeg=(s,t)=>(samePt(a(s),a(t))&&samePt(b(s),b(t)))||(samePt(a(s),b(t))&&samePt(b(s),a(t)));

  function snap(model,p,tolerance){
    let result=p,best=tolerance,snapType=null;
    const all=[...model.cutSegments,...model.foldSegments];
    // 1. Endpoints (highest priority)
    for(const s of all){
      for(const q of [a(s),b(s)]){
        const d=distance(p,q);
        if(d<best){best=d;result=q;snapType='endpoint';}
      }
    }
    // 2. Midpoints (second priority)
    let midBest=Math.min(best,tolerance*0.85);
    for(const s of all){
      const mid={x:(s.x1+s.x2)/2,y:(s.y1+s.y2)/2};
      const d=distance(p,mid);
      if(d<midBest){midBest=d;best=d;result=mid;snapType='midpoint';}
    }
    // 3. Edge perpendicular projection
    if(!snapType){
      for(const s of all){
        const dx=s.x2-s.x1,dy=s.y2-s.y1,lenSq=dx*dx+dy*dy;
        if(lenSq<1e-6)continue;
        const t=((p.x-s.x1)*dx+(p.y-s.y1)*dy)/lenSq;
        if(t>=0.02&&t<=0.98){
          const proj={x:s.x1+t*dx,y:s.y1+t*dy},d=distance(p,proj);
          if(d<best){best=d;result=proj;snapType='edge';}
        }
      }
    }
    return snapType ? {...result,snapped:true,snapType} : {...p,snapped:false};
  }

  function handle(model,center,width,height,radius,kind='cut'){
    if(!(width>2&&height>2))throw Error('El ancho y alto del asa deben ser mayores a 2 mm.');
    const m=normalize(model);
    const r=Math.max(0,Math.min(Number(radius)||0,width/2,height/2));
    const steps=8,pts=[];
    if(r<0.1){
      pts.push({x:center.x-width/2,y:center.y-height/2});
      pts.push({x:center.x+width/2,y:center.y-height/2});
      pts.push({x:center.x+width/2,y:center.y+height/2});
      pts.push({x:center.x-width/2,y:center.y+height/2});
    }else{
      const corners=[
        {cx:center.x+width/2-r,cy:center.y+height/2-r,a1:0,a2:Math.PI/2},
        {cx:center.x-width/2+r,cy:center.y+height/2-r,a1:Math.PI/2,a2:Math.PI},
        {cx:center.x-width/2+r,cy:center.y-height/2+r,a1:Math.PI,a2:Math.PI*1.5},
        {cx:center.x+width/2-r,cy:center.y-height/2+r,a1:Math.PI*1.5,a2:Math.PI*2}
      ];
      for(const c of corners){
        for(let i=0;i<steps;i++){
          const ang=c.a1+(c.a2-c.a1)*(i/steps);
          pts.push({x:c.cx+Math.cos(ang)*r,y:c.cy+Math.sin(ang)*r});
        }
      }
    }
    const group='handle-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const listSegments=kind==='fold'?m.foldSegments:m.cutSegments;
    for(let i=0;i<pts.length;i++){
      const p1=pts[i],p2=pts[(i+1)%pts.length];
      listSegments.push({x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,type:kind==='fold'?'FOLD':'CUT',vectorGroup:group,vectorCreated:true});
    }
    return m;
  }

  function findHoleSegments(model,holePoly){
    return model.cutSegments.filter(s=>holePoly.some(p=>samePt(p,a(s)))&&holePoly.some(p=>samePt(p,b(s))));
  }

  function moveHole(model,holePoly,dx,dy){
    const m=normalize(model);
    const segs=findHoleSegments(m,holePoly);
    if(!segs.length)throw Error('No se encontraron trazos editables para este agujero.');
    for(const s of segs){
      s.x1+=dx;s.y1+=dy;s.x2+=dx;s.y2+=dy;
    }
    return m;
  }

  function copyHole(model,holePoly,dx,dy){
    const m=normalize(model);
    const segs=findHoleSegments(m,holePoly);
    if(!segs.length)throw Error('No se encontraron trazos editables para copiar.');
    const group='copy-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    for(const s of segs){
      m.cutSegments.push({x1:s.x1+dx,y1:s.y1+dy,x2:s.x2+dx,y2:s.y2+dy,type:s.type||'CUT',vectorGroup:group,vectorCreated:true});
    }
    return m;
  }

  function deleteHole(model,holePoly){
    const m=normalize(model);
    const segs=findHoleSegments(m,holePoly);
    if(!segs.length)throw Error('No se encontraron trazos editables para eliminar.');
    m.cutSegments=m.cutSegments.filter(s=>!segs.some(t=>sameSeg(s,t)));
    return m;
  }

  function segmentIntersectsBox(s, box) {
    const { minX, maxX, minY, maxY } = box;
    const inBox = (x, y) => x >= minX - 1e-4 && x <= maxX + 1e-4 && y >= minY - 1e-4 && y <= maxY + 1e-4;
    if (inBox(s.x1, s.y1) || inBox(s.x2, s.y2)) return true;
    const ccw = (p, q, r) => (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x);
    const intersect = (p1, p2, p3, p4) => (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
    const p1 = { x: s.x1, y: s.y1 }, p2 = { x: s.x2, y: s.y2 };
    const bTL = { x: minX, y: maxY }, bTR = { x: maxX, y: maxY };
    const bBL = { x: minX, y: minY }, bBR = { x: maxX, y: minY };
    return intersect(p1, p2, bTL, bTR) || intersect(p1, p2, bTR, bBR) || intersect(p1, p2, bBR, bBL) || intersect(p1, p2, bBL, bTL);
  }

  function selectInBox(model, box) {
    const cuts = (model.cutSegments || []).map((s, index) => ({ s, kind: 'cut', index })).filter(item => segmentIntersectsBox(item.s, box));
    const folds = (model.foldSegments || []).map((s, index) => ({ s, kind: 'fold', index })).filter(item => segmentIntersectsBox(item.s, box));
    return [...cuts, ...folds];
  }

  function moveSegments(model, selectedItems, dx, dy) {
    const m = normalize(model);
    for (const item of selectedItems) {
      const seg = list(m, item.kind)[item.index];
      if (seg) {
        seg.x1 += dx; seg.y1 += dy; seg.x2 += dx; seg.y2 += dy;
        delete seg.vectorGroup;
      }
    }
    return m;
  }

  function copySegments(model, selectedItems, dx, dy) {
    const m = normalize(model);
    const group = 'copy-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    for (const item of selectedItems) {
      const seg = list(m, item.kind)[item.index];
      if (seg) {
        list(m, item.kind).push(line(
          { x: seg.x1 + dx, y: seg.y1 + dy },
          { x: seg.x2 + dx, y: seg.y2 + dy },
          { type: item.kind === 'fold' ? 'FOLD' : 'CUT', vectorGroup: group, vectorCreated: true }
        ));
      }
    }
    return m;
  }

  function deleteSegments(model, selectedItems) {
    const m = normalize(model);
    const cutIndices = new Set(selectedItems.filter(i => i.kind === 'cut').map(i => i.index));
    const foldIndices = new Set(selectedItems.filter(i => i.kind === 'fold').map(i => i.index));
    m.cutSegments = m.cutSegments.filter((_, idx) => !cutIndices.has(idx));
    m.foldSegments = m.foldSegments.filter((_, idx) => !foldIndices.has(idx));
    return m;
  }

  function stretch(model, box, dx, dy, isCopy = false) {
    const m = normalize(model);
    const inBox = (x, y) => x >= box.minX - 1e-4 && x <= box.maxX + 1e-4 && y >= box.minY - 1e-4 && y <= box.maxY + 1e-4;

    if (isCopy) {
      const group = 'copy-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      for (const kind of ['cut', 'fold']) {
        const segs = list(m, kind);
        const originalCount = segs.length;
        for (let i = 0; i < originalCount; i++) {
          const s = segs[i];
          const in1 = inBox(s.x1, s.y1), in2 = inBox(s.x2, s.y2);
          if (in1 && in2) {
            segs.push(line(
              { x: s.x1 + dx, y: s.y1 + dy },
              { x: s.x2 + dx, y: s.y2 + dy },
              { type: kind === 'fold' ? 'FOLD' : 'CUT', vectorGroup: group, vectorCreated: true }
            ));
          } else if (in1 || in2) {
            const p1 = in1 ? { x: s.x1 + dx, y: s.y1 + dy } : { x: s.x1, y: s.y1 };
            const p2 = in2 ? { x: s.x2 + dx, y: s.y2 + dy } : { x: s.x2, y: s.y2 };
            segs.push(line(p1, p2, { type: kind === 'fold' ? 'FOLD' : 'CUT', vectorGroup: group, vectorCreated: true }));
          }
        }
      }
      return m;
    }

    for (const kind of ['cut', 'fold']) {
      for (const s of list(m, kind)) {
        const in1 = inBox(s.x1, s.y1);
        const in2 = inBox(s.x2, s.y2);
        if (in1 && in2) {
          s.x1 += dx; s.y1 += dy;
          s.x2 += dx; s.y2 += dy;
          delete s.vectorGroup;
        } else if (in1 && !in2) {
          s.x1 += dx; s.y1 += dy;
          delete s.vectorGroup;
        } else if (!in1 && in2) {
          s.x2 += dx; s.y2 += dy;
          delete s.vectorGroup;
        }
      }
    }
    return m;
  }
  function classify(model,ref,kind){
    const m=normalize(model),s=get(m,ref);if(!s)throw Error('Selecciona una línea.');
    if(ref.kind===kind)return m;
    list(m,ref.kind).splice(ref.index,1);list(m,kind).push({...s,type:kind==='cut'?'CUT':'FOLD'});return m;
  }
  function erase(model,ref){
    const m=normalize(model),s=get(m,ref);if(!s)throw Error('Selecciona un trazo para borrar.');
    if(s.vectorGroup) {
      m.cutSegments=m.cutSegments.filter(t=>t.vectorGroup!==s.vectorGroup);
      m.foldSegments=m.foldSegments.filter(t=>t.vectorGroup!==s.vectorGroup);
    }else list(m,ref.kind).splice(ref.index,1);
    return m;
  }
  function addLine(model,p,q,kind){
    if(distance(p,q)<0.05)throw Error('La línea debe medir al menos 0,05 mm.');
    const m=normalize(model);list(m,kind).push(line(p,q,{type:kind==='cut'?'CUT':'FOLD',vectorCreated:true}));return m;
  }
  function circle(model,center,radius,kind){
    if(!Number.isFinite(radius)||radius<0.1||radius>5000)throw Error('El radio debe estar entre 0,1 y 5000 mm.');
    const m=normalize(model),count=Math.min(512,Math.max(48,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-0.01/radius)))));
    const group='circle-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    for(let i=0;i<count;i++){
      const at=t=>({x:center.x+radius*Math.cos(t),y:center.y+radius*Math.sin(t)});
      list(m,kind).push(line(at(i*2*Math.PI/count),at((i+1)*2*Math.PI/count),{type:kind==='cut'?'CUT':'FOLD',vectorGroup:group,vectorCreated:true}));
    }return m;
  }
  function intersection(p,v,q,w){
    const cross=(a,b)=>a.x*b.y-a.y*b.x,den=cross(v,w);if(Math.abs(den)<EPS)return null;
    const d={x:q.x-p.x,y:q.y-p.y};return {t:cross(d,w)/den,u:cross(d,v)/den};
  }
  function collide(model,ref,click,extend){
    const m=normalize(model),s=get(m,ref);if(!s)throw Error('Selecciona una línea.');
    const start=distance(click,a(s))<=distance(click,b(s))?a(s):b(s),other=distance(click,a(s))<=distance(click,b(s))?b(s):a(s);
    const v=extend?{x:start.x-other.x,y:start.y-other.y}:{x:other.x-start.x,y:other.y-start.y};
    let best=Infinity;
    for(const kind of ['cut','fold'])list(m,kind).forEach((target,index)=>{
      if(kind===ref.kind&&index===ref.index)return;
      const i=intersection(start,v,a(target),{x:target.x2-target.x1,y:target.y2-target.y1});
      if(i&&i.t>EPS&&(extend||i.t<1-EPS)&&i.u>=-EPS&&i.u<=1+EPS)best=Math.min(best,i.t);
    });
    if(!Number.isFinite(best))throw Error(extend?'No hay colisión delante de ese extremo.':'No hay una intersección interior para contraer ese extremo.');
    const p={x:start.x+v.x*best,y:start.y+v.y*best};
    if(distance(start,a(s))<EPS){s.x1=p.x;s.y1=p.y;}else{s.x2=p.x;s.y2=p.y;}
    delete s.vectorGroup;return m;
  }
  function corner(model,first,second,value,rounded){
    if(first.kind!==second.kind)throw Error('Las dos líneas deben ser del mismo tipo: corte o hendido.');
    if(first.index===second.index)throw Error('Selecciona otra línea.');
    if(!(Number.isFinite(value)&&value>0))throw Error('Indica una medida positiva en milímetros.');
    const m=normalize(model),s=get(m,first),t=get(m,second);
    const v={x:s.x2-s.x1,y:s.y2-s.y1},w={x:t.x2-t.x1,y:t.y2-t.y1},i=intersection(a(s),v,a(t),w);
    if(!i)throw Error('Las líneas paralelas no forman una esquina.');
    const vertex={x:s.x1+i.t*v.x,y:s.y1+i.t*v.y};
    // Retain the end farther from the corner, trimming the near end.
    const farS=distance(vertex,a(s))>distance(vertex,b(s))?a(s):b(s),farT=distance(vertex,a(t))>distance(vertex,b(t))?a(t):b(t);
    const lenS=distance(vertex,farS),lenT=distance(vertex,farT);
    const u={x:(farS.x-vertex.x)/lenS,y:(farS.y-vertex.y)/lenS},z={x:(farT.x-vertex.x)/lenT,y:(farT.y-vertex.y)/lenT};
    const angle=Math.acos(Math.max(-1,Math.min(1,u.x*z.x+u.y*z.y)));
    if(!Number.isFinite(angle)||angle<1e-4||Math.PI-angle<1e-4)throw Error('La esquina no admite este ajuste.');
    const offset=rounded?value/Math.tan(angle/2):value;
    if(offset>=lenS-0.01||offset>=lenT-0.01)throw Error('La medida es demasiado grande para esas líneas.');
    const p={x:vertex.x+u.x*offset,y:vertex.y+u.y*offset},q={x:vertex.x+z.x*offset,y:vertex.y+z.y*offset};
    Object.assign(s,line(farS,p));Object.assign(t,line(q,farT));delete s.vectorGroup;delete t.vectorGroup;
    const extra={type:first.kind==='cut'?'CUT':'FOLD',vectorCreated:true};
    if(!rounded)list(m,first.kind).push(line(p,q,extra));
    else {
      const bisLen=Math.hypot(u.x+z.x,u.y+z.y),d=value/Math.sin(angle/2);
      const c={x:vertex.x+(u.x+z.x)/bisLen*d,y:vertex.y+(u.y+z.y)/bisLen*d};
      const start=Math.atan2(p.y-c.y,p.x-c.x),end=Math.atan2(q.y-c.y,q.x-c.x);
      let sweep=end-start;while(sweep>Math.PI)sweep-=2*Math.PI;while(sweep< -Math.PI)sweep+=2*Math.PI;
      const count=Math.min(256,Math.max(8,Math.ceil(Math.abs(sweep)/0.05)));let previous=p;
      for(let n=1;n<=count;n++){const next=n===count?q:{x:c.x+value*Math.cos(start+sweep*n/count),y:c.y+value*Math.sin(start+sweep*n/count)};list(m,first.kind).push(line(previous,next,extra));previous=next;}
    }return m;
  }
  function rebuild(model,engine){
    const m=normalize(model),all=[...m.cutSegments,...m.foldSegments];
    if(!all.length)throw Error('El plano debe conservar al menos un trazo.');
    if(all.length>15000)throw Error('El plano supera el límite de 15000 segmentos editables.');
    const xs=all.flatMap(s=>[s.x1,s.x2]),ys=all.flatMap(s=>[s.y1,s.y2]);
    if(![...xs,...ys].every(Number.isFinite))throw Error('Hay coordenadas no válidas.');
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    m.bounds={minX,maxX,minY,maxY,width:Math.max(.01,maxX-minX),height:Math.max(.01,maxY-minY)};
    m.blankWidthMm=m.bounds.width;m.blankHeightMm=m.bounds.height;m.bleedSegments=[];m.bleedSegmentsMm=[];
    const length=s=>Math.hypot(s.x2-s.x1,s.y2-s.y1);
    m.totalCutLengthMm=m.cutSegments.reduce((sum,s)=>sum+length(s),0);m.totalFoldLengthMm=m.foldSegments.reduce((sum,s)=>sum+length(s),0);
    try {
      const sub=engine.buildPlanarSubdivision({...m,cutSegmentsMm:m.cutSegments,foldSegmentsMm:m.foldSegments});
      const overlap=(x,y)=>Math.max(0,Math.min(x.maxX,y.maxX)-Math.max(x.minX,y.minX))*Math.max(0,Math.min(x.maxY,y.maxY)-Math.max(x.minY,y.minY));
      const used=new Set();
      // Keep pre-existing empty notches empty. The planar solver can produce
      // tiny closed regions where a slot touches a fold at its endpoints.
      const onOldSegment=p=>[...model.cutSegments,...model.foldSegments].filter(s=>!s.vectorCreated).some(s=>{
        const dx=s.x2-s.x1,dy=s.y2-s.y1,t=((p.x-s.x1)*dx+(p.y-s.y1)*dy)/(dx*dx+dy*dy||1);
        return t>=-EPS&&t<=1+EPS&&Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy)<0.06;
      });
      const inOldMaterial=p=>model.faces.some(f=>engine.pointInPolygon(p,f.polygon)&&!(f.holes||[]).some(h=>engine.pointInPolygon(p,h)));
      const hasOldMaterial=f=>inOldMaterial(f.centroid)||f.points.some((p,i)=>{
        const q=f.points[(i+1)%f.points.length];
        return inOldMaterial({x:(p.x+q.x)*.495+f.centroid.x*.01,y:(p.y+q.y)*.495+f.centroid.y*.01});
      });
      const physicalFaces=sub.faces.filter(f=>hasOldMaterial(f)||!f.points.every((p,i)=>{
        const q=f.points[(i+1)%f.points.length];return onOldSegment(p)&&onOldSegment({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
      }));
      if(!physicalFaces.length)throw Error('No quedan contornos materiales cerrados.');
      m.faces=physicalFaces.map(f=>{
        const old=model.faces.filter(o=>!used.has(o.id)).sort((a,b)=>overlap(f.bbox,b.bounds)/Math.max(1,b.bounds.width*b.bounds.height)-overlap(f.bbox,a.bounds)/Math.max(1,a.bounds.width*a.bounds.height))[0];
        const match=old&&overlap(f.bbox,old.bounds)>0;
        if(match)used.add(old.id);
        return {...f,polygon:f.points,bounds:f.bbox,area:f.areaMm2,label:match?old.label:f.name,
          role:match?old.role:f.role,pacdoraName:match?old.pacdoraName:undefined,shortName:match?old.shortName:undefined};
      });
      const faceIds=new Set(m.faces.map(f=>f.id));
      m.hinges=sub.hinges.filter(h=>faceIds.has(h.parentId)&&faceIds.has(h.childId)).map(h=>{
        const old=(model.hinges||[]).find(o=>(distance(o.p1,h.p1)<.1&&distance(o.p2,h.p2)<.1)||(distance(o.p2,h.p1)<.1&&distance(o.p1,h.p2)<.1));
        const direction=old&&distance(old.p1,h.p2)<.1?-1:1;
        return {...h,parentFaceId:h.parentId,childFaceId:h.childId,length:h.lengthMm,
          defaultAngle:old?(old.defaultAngle??90)*direction:90,
          pacdoraFoldName:old?.pacdoraFoldName,animSteps:old?.animSteps?.map(s=>({...s,deltaDeg:s.deltaDeg*direction}))};
      });
      m.rootFaceId=sub.rootFaceId;m.totalAreaMm2=sub.totalAreaMm2;
      const oldRoot=model.faces.find(f=>f.id===model.rootFaceId);
      const root=oldRoot&&m.faces.slice().sort((a,b)=>overlap(b.bounds,oldRoot.bounds)-overlap(a.bounds,oldRoot.bounds))[0];
      if(root){try {const rerooted=engine.rerootDielineModel(m,root.id);m.faces=rerooted.faces;m.hinges=rerooted.hinges;m.rootFaceId=root.id;}catch{
        // Disconnected closed pieces stay visible in the flat preview.
        m.rootFaceId=root.id;m.faces=m.faces.map(f=>({...f,isRoot:f.id===root.id,parentId:f.id===root.id?null:f.parentId}));
      }}
      m.totalAreaMm2=m.faces.reduce((sum,f)=>sum+f.areaMm2,0);
      m.vector3DStale=false;
      // A dangling outer cut cannot define a physical panel yet.
      m.vectorWarning=m.faces.length<model.faces.length?'El 3D muestra los contornos cerrados que quedan. Revisa las zonas abiertas.':'';
    }catch(error){
      m.faces=[];m.hinges=[];m.rootFaceId=null;m.totalAreaMm2=0;m.vector3DStale=true;
      m.vectorWarning='Contorno abierto: cierra el plano para recuperar el modelo 3D.';
    }
    return engine.enforceFlapLengthLimit(m);
  }
  return {normalize,hit,snap,classify,erase,addLine,circle,handle,collide,corner,rebuild,get,findHoleSegments,moveHole,copyHole,deleteHole,segmentIntersectsBox,selectInBox,moveSegments,copySegments,deleteSegments,stretch};
});
