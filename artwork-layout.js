(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ArtworkLayout=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function fit(bounds,imageWidth,imageHeight){
    const factor=Math.min(bounds.width/Math.max(1,imageWidth),bounds.height/Math.max(1,imageHeight));
    return {centerX:bounds.minX+bounds.width/2,centerY:bounds.minY+bounds.height/2,width:imageWidth*factor,height:imageHeight*factor,rotation:0,mirrorX:false,mirrorY:false,opacity:1};
  }
  function corners(layout){
    const angle=layout.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:layout.centerX+c*x*layout.width/2-s*y*layout.height/2,y:layout.centerY+s*x*layout.width/2+c*y*layout.height/2}));
  }
  function imageUV(point,layout){
    const a=-layout.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=point.x-layout.centerX,dy=point.y-layout.centerY;
    let u=(c*dx-s*dy)/layout.width+0.5,v=(s*dx+c*dy)/layout.height+0.5;
    if(layout.mirrorX)u=1-u;if(layout.mirrorY)v=1-v;
    return {u,v};
  }
  return {fit,corners,imageUV};
});
