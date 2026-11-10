(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CadIO=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const unitScale={1:25.4,2:304.8,3:1609344,4:1,5:10,6:1000,7:1e6,8:0.0000254,9:0.0254,10:914.4,11:1e-7,12:1e-6,13:0.001,14:100,15:10000,16:100000};
  const first=(e,c,fallback='')=>e.tags.find(t=>t[0]===c)?.[1]??fallback;
  const number=(e,c,fallback=0)=>{const n=Number(first(e,c,fallback));if(!Number.isFinite(n))throw new Error('Coordenada DXF no válida.');return n;};
  const point=(e,c=10)=>({x:number(e,c),y:number(e,c+10)});
  const all=(e,c)=>e.tags.filter(t=>t[0]===c).map(t=>Number(t[1]));
  const identity=[1,0,0,1,0,0];
  const transform=(p,m)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  function guessRole(layer,color,lineType=''){
    const name=layer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(/cota|dimension|text|anot|aux|sangr|bleed|defpoints/.test(name))return 'ignore';
    if(/hend|crease|fold|score|dobl|pleg/.test(name))return 'fold';
    if(/cort|cut|knife|die/.test(name))return 'cut';
    if([1,6].includes(Math.abs(color))||/dash|hidden|center/.test(lineType.toLowerCase()))return 'fold';
    return 'cut';
  }
  function parse(text){
    if(typeof text!=='string'||/^AutoCAD Binary DXF/i.test(text))throw new Error('Se necesita un DXF de texto (ASCII). Guarda una copia DXF ASCII desde tu CAD.');
    const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
    while(lines.length&&lines.at(-1).trim()==='')lines.pop();
    if(lines.length%2)throw new Error('DXF incompleto: falta un valor de grupo.');
    const pairs=[];
    for(let i=0;i<lines.length;i+=2){const code=Number(lines[i].trim());if(!Number.isInteger(code))throw new Error('Código de grupo DXF no válido.');pairs.push([code,lines[i+1].trim()]);}
    if(!pairs.some(t=>t[0]===0&&t[1]==='SECTION'))throw new Error('El archivo no contiene secciones DXF.');
    const sections={};let section=null;
    for(let i=0;i<pairs.length;i++){
      const [c,v]=pairs[i];
      if(c===0&&v==='SECTION'){section=pairs[++i]?.[1];sections[section]=sections[section]||[];}
      else if(c===0&&v==='ENDSEC')section=null;
      else if(section)sections[section].push([c,v]);
    }
    const records=tags=>{const out=[];let current;for(const tag of tags||[]){if(tag[0]===0){current={type:tag[1],tags:[]};out.push(current);}else if(current)current.tags.push(tag);}return out;};
    let units=0;const header=sections.HEADER||[];
    for(let i=0;i<header.length;i++)if(header[i][0]===9&&header[i][1]==='$INSUNITS')units=Number(header[i+1]?.[1])||0;
    const layers=new Map();
    for(const record of records(sections.TABLES))if(record.type==='LAYER'){
      const name=first(record,2,'0'),color=number(record,62,7),lineType=first(record,6,'CONTINUOUS');
      layers.set(name,{name,color,lineType,hidden:color<0||(number(record,70)&1)!==0});
    }
    const blocks=new Map();let block=null;
    for(const record of records(sections.BLOCKS)){
      if(record.type==='BLOCK'){block={base:point(record),entities:[]};blocks.set(first(record,2),block);}
      else if(record.type==='ENDBLK')block=null;
      else if(block)block.entities.push(record);
    }
    const groups=new Map(),warnings=new Set();let segmentCount=0;
    const add=(e,points,matrix,inherited)=>{
      if(points.length<2)return;
      const rawLayer=first(e,8,'0'),layer=rawLayer==='0'&&inherited?inherited.layer:rawLayer;
      const spec=layers.get(layer)||{};if(spec.hidden||number(e,60)===1||number(e,67)===1)return;
      const entityColor=number(e,62,256),color=entityColor===256?(spec.color||7):entityColor===0?(inherited?.color||spec.color||7):entityColor;
      const lineType=first(e,6,spec.lineType||'CONTINUOUS');
      const trueColor=number(e,420,-1),rgb=trueColor>=0?trueColor:null;
      const normalizedColor=rgb!==null?(((rgb>>16)&255)>170&&((rgb>>8)&255)<100?(((rgb&255)>100)?6:1):color):color;
      const key=JSON.stringify([layer,normalizedColor,lineType]);
      if(!groups.has(key))groups.set(key,{id:key,layer,color:normalizedColor,lineType,role:guessRole(layer,normalizedColor,lineType),polylines:[]});
      if(segmentCount+points.length>150000)throw new Error('El DXF es demasiado complejo (más de 150.000 segmentos).');
      const transformed=points.map(p=>transform(p,matrix));
      if(!transformed.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('El DXF contiene coordenadas no válidas.');
      groups.get(key).polylines.push(transformed);segmentCount+=points.length-1;
    };
    const arcPoints=(center,r,start,sweep)=>{
      if(r<=0)throw new Error('Radio DXF no válido.');
      const step=2*Math.acos(Math.max(-1,1-0.03/r));
      const count=Math.max(4,Math.min(2048,Math.ceil(Math.abs(sweep)/Math.max(0.005,Math.min(Math.PI/24,step)))));
      return Array.from({length:count+1},(_,i)=>({x:center.x+r*Math.cos(start+sweep*i/count),y:center.y+r*Math.sin(start+sweep*i/count)}));
    };
    const bulgePoints=(a,b,bulge)=>{
      if(Math.abs(bulge)<1e-10)return [a,b];
      const dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy);
      if(chord<1e-9)return [a];
      const offset=chord*(1-bulge*bulge)/(4*bulge);
      const center={x:(a.x+b.x)/2-dy/chord*offset,y:(a.y+b.y)/2+dx/chord*offset};
      return arcPoints(center,chord*(1+bulge*bulge)/(4*Math.abs(bulge)),Math.atan2(a.y-center.y,a.x-center.x),4*Math.atan(bulge));
    };
    const polyline=(vertices,closed)=>{
      const out=[];for(let i=0;i<vertices.length-(closed?0:1);i++){
        const pts=bulgePoints(vertices[i],vertices[(i+1)%vertices.length],vertices[i].bulge||0);out.push(...(out.length?pts.slice(1):pts));
      }return out;
    };
    const process=(entities,matrix=identity,inherited=null,stack=[])=>{
      for(let index=0;index<entities.length;index++){
        const e=entities[index];
        if(number(e,60)===1||number(e,67)===1)continue;
        if(number(e,30)!==0||number(e,38)!==0||number(e,210)!==0||number(e,220)!==0||number(e,230,1)!==1){warnings.add('Se han omitido entidades fuera del plano XY.');continue;}
        if(e.type==='INSERT'){
          const name=first(e,2),b=blocks.get(name);if(!b){warnings.add('Bloque no encontrado: '+name);continue;}
          if(stack.includes(name)||stack.length>16)throw new Error('Bloques recursivos o excesivamente anidados.');
          const angle=number(e,50)*Math.PI/180,sx=number(e,41,1),sy=number(e,42,1),c=Math.cos(angle),s=Math.sin(angle);
          const cols=Math.max(1,number(e,70,1)),rows=Math.max(1,number(e,71,1));if(cols*rows>1000)throw new Error('Demasiadas instancias de un bloque.');
          for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
            const local=[c*sx,s*sx,-s*sy,c*sy,number(e,10)+c*col*number(e,44)-s*row*number(e,45),number(e,20)+s*col*number(e,44)+c*row*number(e,45)];
            local[4]-=local[0]*b.base.x+local[2]*b.base.y;local[5]-=local[1]*b.base.x+local[3]*b.base.y;
            process(b.entities,multiply(matrix,local),{layer:first(e,8,'0'),color:number(e,62,7)},stack.concat(name));
          }continue;
        }
        let points=[];
        if(e.type==='LINE')points=[point(e),point(e,11)];
        else if(e.type==='LWPOLYLINE'){
          const vertices=[];for(const [code,value]of e.tags){if(code===10)vertices.push({x:Number(value),y:0,bulge:0});else if(code===20&&vertices.length)vertices.at(-1).y=Number(value);else if(code===42&&vertices.length)vertices.at(-1).bulge=Number(value);}
          points=polyline(vertices,(number(e,70)&1)!==0);
        }else if(e.type==='POLYLINE'){
          const flags=number(e,70);if(flags&120){warnings.add('Se ha omitido una polilínea 3D o malla.');continue;}
          const vertices=[];while(index+1<entities.length&&entities[index+1].type==='VERTEX'){const v=entities[++index];vertices.push({...point(v),bulge:number(v,42)});}
          if(entities[index+1]?.type==='SEQEND')index++;
          points=polyline(vertices,(flags&1)!==0);
        }else if(e.type==='ARC'||e.type==='CIRCLE'){
          const start=e.type==='CIRCLE'?0:number(e,50)*Math.PI/180;
          let sweep=e.type==='CIRCLE'?Math.PI*2:(number(e,51)-number(e,50))*Math.PI/180;while(sweep<=0)sweep+=Math.PI*2;
          points=arcPoints(point(e),number(e,40),start,sweep);
        }else if(e.type==='ELLIPSE'){
          const center=point(e),major=point(e,11),ratio=number(e,40,1),start=number(e,41),end=number(e,42,Math.PI*2);
          const count=Math.max(24,Math.ceil(Math.abs(end-start)*32));points=Array.from({length:Math.min(2048,count)+1},(_,i)=>{const t=start+(end-start)*i/Math.min(2048,count);return{x:center.x+major.x*Math.cos(t)-major.y*ratio*Math.sin(t),y:center.y+major.y*Math.cos(t)+major.x*ratio*Math.sin(t)};});
        }else if(e.type==='SPLINE'){
          const xs=all(e,10),ys=all(e,20),degree=number(e,71),knots=all(e,40),weights=all(e,41);
          if(xs.length!==ys.length||degree<1||degree>10||knots.length!==xs.length+degree+1){warnings.add('Spline no compatible: conviértela a polilínea en el CAD.');continue;}
          const n=xs.length-1,start=knots[degree],end=knots[n+1];
          for(let sample=0;sample<=256;sample++){
            const u=start+(end-start)*sample/256;let span=degree;while(span<n&&u>=knots[span+1])span++;
            const d=[];for(let j=0;j<=degree;j++){const i=span-degree+j,w=weights[i]??1;d.push([xs[i]*w,ys[i]*w,w]);}
            for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){const i=span-degree+j,den=knots[i+degree-r+1]-knots[i],alpha=den?(u-knots[i])/den:0;d[j]=d[j].map((v,k)=>(1-alpha)*d[j-1][k]+alpha*v);}
            const v=d[degree];points.push({x:v[0]/v[2],y:v[1]/v[2]});
          }
        }else if(!['TEXT','MTEXT','DIMENSION','POINT','HATCH','SOLID','SEQEND','VERTEX','ATTDEF','ATTRIB'].includes(e.type))warnings.add('Entidad omitida: '+e.type);
        add(e,points,matrix,inherited);
      }
    };
    process(records(sections.ENTITIES));
    if(!groups.size)throw new Error('No se encontraron líneas, polilíneas o curvas 2D compatibles.');
    return {groups:Array.from(groups.values()),units,mmPerUnit:unitScale[units]||null,warnings:Array.from(warnings)};
  }
  function toSvg(document,roles={},scale=document.mmPerUnit||1){
    if(!Number.isFinite(scale)||scale<=0)throw new Error('La escala debe ser positiva.');
    const selected=document.groups.filter(g=>(roles[g.id]||g.role)!=='ignore');
    const pts=selected.flatMap(g=>g.polylines.flat());
    if(!pts.length)throw new Error('Selecciona al menos una capa de corte.');
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
    const w=(maxX-minX)*scale,h=(maxY-minY)*scale;
    if(w<=0||h<=0)throw new Error('El plano no tiene ancho o alto.');
    if(!selected.some(g=>(roles[g.id]||g.role)==='cut'))throw new Error('Debe haber al menos una capa de corte.');
    const fmt=n=>Number(n.toFixed(6));
    const lines=[`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">`];
    for(const group of selected){const role=roles[group.id]||group.role;for(const poly of group.polylines)lines.push(`<polyline fill="none" stroke="${role==='fold'?'#e5007d':'#009ee3'}" points="${poly.map(p=>fmt((p.x-minX)*scale)+','+fmt((maxY-p.y)*scale)).join(' ')}"/>`);}
    return lines.concat('</svg>').join('\n');
  }
  return {parse,toSvg,guessRole};
});
