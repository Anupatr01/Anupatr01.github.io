// Thresholds describe sample stability, not a guarantee of physical accuracy.
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function components(a,b) {
  const horizontal=Math.hypot(a.x-b.x,a.z-b.z), vertical=Math.abs(a.y-b.y);
  return {horizontal,vertical,free:Math.hypot(horizontal,vertical)};
}
export function median(values) {
  const v=[...values].sort((a,b)=>a-b), n=v.length;
  return n ? (v[Math.floor((n-1)/2)]+v[Math.floor(n/2)])/2 : NaN;
}
export function filterPoint(history, point, time, still) {
  if (!still || !point || ![point.x,point.y,point.z].every(Number.isFinite)) return {samples:[],point:null,progress:0};
  let samples=history.filter(s=>time-s.time<=800);
  if (samples.length && distance(samples[samples.length-1],point)>.035) samples=[];
  samples.push({...point,time});
  const center={x:median(samples.map(p=>p.x)),y:median(samples.map(p=>p.y)),z:median(samples.map(p=>p.z))};
  const spread=Math.max(...samples.map(p=>distance(p,center)));
  if (spread>.012 || distance(samples[0],point)>.015) samples=[{...point,time}];
  const elapsed=time-samples[0].time;
  const ready=samples.length>=12 && elapsed>=600;
  return {samples,point:ready?center:null,progress:Math.min(1,elapsed/600)};
}
export function depthAgrees(forwardDepth, observedDepth) {
  return Number.isFinite(forwardDepth) && forwardDepth>0 && Number.isFinite(observedDepth) && observedDepth>0 && Math.abs(forwardDepth-observedDepth)<=Math.max(.05,forwardDepth*.05);
}
export function motionIsStill(previous, current, time) {
  if (!previous) return false;
  const dt=(time-previous.time)/1000;
  if (dt<=0 || dt>.2) return false;
  const q=previous.orientation, r=current.orientation;
  const dot=Math.min(1,Math.abs(q.x*r.x+q.y*r.y+q.z*r.z+q.w*r.w));
  return distance(previous.position,current.position)/dt<.12 && 2*Math.acos(dot)/dt<.2;
}
// Clip screen-space line to the useful camera area; keep the label on that line.
export function clipSegment(a,b,rect) {
  const dx=b.x-a.x,dy=b.y-a.y;
  let lo=0,hi=1;
  const p=[-dx,dx,-dy,dy],q=[a.x-rect.left,rect.right-a.x,a.y-rect.top,rect.bottom-a.y];
  for(let i=0;i<4;i++) {
    if(Math.abs(p[i])<1e-9){if(q[i]<0)return null;continue;}
    const t=q[i]/p[i];
    if(p[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [{x:a.x+lo*dx,y:a.y+lo*dy},{x:a.x+hi*dx,y:a.y+hi*dy}];
}
