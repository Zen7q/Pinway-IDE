// Derived geometry only: never writes automatic bends into the saved circuit.
const same=(a,b)=>Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6;
export function simplify(points){
  const result=[];
  for(const p of points){
    if(result.length&&same(result.at(-1),p))continue;
    while(result.length>1){const a=result.at(-2),b=result.at(-1);
      if((a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0)||(a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0))result.pop();else break;
    }
    result.push({x:p.x,y:p.y});
  }
  return result;
}
export function partBounds(shape,pose){
  const angle=pose.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const corners=[[0,0],[shape.width,0],[0,shape.height],[shape.width,shape.height]].map(([x,y])=>({x:pose.x+shape.width/2+(x-shape.width/2)*c-(y-shape.height/2)*s,y:pose.y+shape.height/2+(x-shape.width/2)*s+(y-shape.height/2)*c}));
  return {left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
}
export function terminalExit(point,bounds,clearance=12){
  const sides=[['left',Math.abs(point.x-bounds.left)],['right',Math.abs(point.x-bounds.right)],['top',Math.abs(point.y-bounds.top)],['bottom',Math.abs(point.y-bounds.bottom)]];
  const side=sides.sort((a,b)=>a[1]-b[1])[0][0];
  return side==='left'?{x:bounds.left-clearance,y:point.y}:side==='right'?{x:bounds.right+clearance,y:point.y}:side==='top'?{x:point.x,y:bounds.top-clearance}:{x:point.x,y:bounds.bottom+clearance};
}
function crosses(a,b,r){
  return a.y===b.y?a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right:
    a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom;
}
export function elbowRoute(a,b,obstacles=[]){
  const candidates=[[a,{x:b.x,y:a.y},b],[a,{x:a.x,y:b.y},b]];
  const xs=new Set([(a.x+b.x)/2]),ys=new Set([(a.y+b.y)/2]);
  // Candidate corridors alongside every body, including the outside of the circuit.
  for(const r of obstacles){xs.add(r.left-12);xs.add(r.right+12);ys.add(r.top-12);ys.add(r.bottom+12);}
  for(const x of xs)candidates.push([a,{x,y:a.y},{x,y:b.y},b]);
  for(const y of ys)candidates.push([a,{x:a.x,y},{x:b.x,y},b]);
  let best,score=Infinity;
  for(const candidate of candidates){const points=simplify(candidate);let cost=points.length*8;
    for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i];cost+=Math.abs(p.x-q.x)+Math.abs(p.y-q.y);for(const r of obstacles)if(crosses(p,q,r))cost+=1e7;}
    if(cost<score){score=cost;best=points;}
  }
  return best;
}
export function wireRoute(a,b,{start,end,bends=[],obstacles=[]}={}){
  const anchors=[a,...(start?[start]:[]),...bends,...(end?[end]:[]),b];
  return simplify(anchors.flatMap((p,i)=>i?elbowRoute(anchors[i-1],p,obstacles).slice(1):[p]));
}
