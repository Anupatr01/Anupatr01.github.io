import {distance as length,components,median,filterPoint,depthAgrees,motionIsStill,clipSegment} from './measurement.js?v=3';
const $=id=>document.getElementById(id);
let mode='horizontal',unit='cm',session=null,ref=null,hitSource=null,gl=null;
let A=null,B=null,target=null,camera=null,samples=[],running=false;
let anchors={A:null,B:null},anchorOffsets={},anchorEnabled=false,depthEnabled=false;
let generation=0,pendingCapture=false,capturing=false,previousCamera=null,trackingOK=false,resetNotice='';
let currentDistance=null,depthSource='',progress=0,quality='',lastHit=0;
const descriptions={horizontal:'วัดระยะบนระนาบแนวนอน เช่น ความกว้างหรือความลึก',vertical:'วัดความต่างระดับของสองจุด เช่น ความสูงของวัตถุ',free:'วัดเส้นตรงสามมิติ พร้อมระยะแนวนอนและแนวตั้ง'};
const modeNames={horizontal:'แนวนอน',vertical:'แนวตั้ง',free:'ระยะ 3 มิติ'};
const labels={cm:'ซม.',m:'ม.',in:'นิ้ว'};
function fmt(m){return (m*(unit==='cm'?100:unit==='in'?39.3700787402:1)).toLocaleString('th-TH',{maximumFractionDigits:unit==='m'?2:1,minimumFractionDigits:unit==='m'?2:1})}
function message(s){$('hint').textContent=s}
function safeDelete(anchor){try{anchor?.delete()}catch{}}
function releaseAnchors(){Object.values(anchors).forEach(safeDelete);anchors={A:null,B:null};anchorOffsets={};}
function reset(){
  generation++;releaseAnchors();A=null;B=null;target=null;samples=[];progress=0;pendingCapture=false;capturing=false;resetNotice='';
  $('lines').replaceChildren();render();message(session?'เล็งจุด A แล้วถือมือถือให้นิ่ง':'ใช้กล้องหลังของมือถือที่รองรับ AR');
}
function render(){
  const c=A&&(B||target)&&(!session||trackingOK)?components(A,B||target):null;
  $('distance').textContent=c?fmt(c[mode]):'—';$('horizontal').textContent=c?fmt(c.horizontal)+' '+labels[unit]:'—';
  $('vertical').textContent=c?fmt(c.vertical)+' '+labels[unit]:'—';$('unitlabel').textContent=labels[unit];
  $('resultstate').textContent=session&&!trackingOK?'รอการติดตามจุดวัด':B?'วัดเสร็จแล้ว • ค่าประมาณจาก AR':A?'เล็งจุดสิ้นสุดเพื่อดูระยะ':'กำหนดจุดเริ่มต้นเพื่อเริ่มวัด';
  $('capture').textContent=capturing?'กำลังยึดจุดวัด…':B?'✓ วัดเสร็จแล้ว':A?'＋ ปักธงจุด B':'＋ ปักธงจุด A';
  $('capture').disabled=!session||!target||!trackingOK||!!B||capturing||pendingCapture;
  $('reset').disabled=!A&&!capturing;
  for(const [key,p] of [['A',A],['B',B]]){
    $('step'+key).classList.toggle('done',!!p);$('point'+key).textContent=p?'กำหนดแล้ว':'ยังไม่ได้กำหนด';$('step'+key).querySelector('i').textContent=p?'✓':'○';
  }
  $('depth').textContent=currentDistance!==null?fmt(currentDistance)+' '+labels[unit]:'—';
  $('liveDepth').textContent=currentDistance!==null?'กล้อง → พื้นผิว ≈ '+fmt(currentDistance)+' '+labels[unit]:'กล้อง → พื้นผิว —';
  $('trackingDetail').textContent=resetNotice||(anchors.A?'ยึดจุด A แล้ว':anchorEnabled?'รองรับการยึดจุด':'การยึดจุดไม่พร้อม • เดินแล้วอาจคลาดเคลื่อน')+(anchors.B?' และ B':'')+' · '+(depthSource||'กำลังตรวจจับระยะ');
  $('stabilityFill').style.width=Math.round(progress*100)+'%';
  $('status').textContent=quality;
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
  mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});$('modehelp').textContent=descriptions[mode];reset();
});
$('unit').onchange=()=>{unit=$('unit').value;render()};
$('help').onclick=()=>$('guide').showModal();$('closeHelp').onclick=()=>$('guide').close();$('reset').onclick=reset;
// Process this request inside an active XR frame, never reuse a previous frame's hit.
$('capture').onclick=()=>{if(target&&trackingOK&&!B&&!capturing&&performance.now()-lastHit<250){pendingCapture=true;render()}};
$('exit').onclick=()=>session?.end();
$('app').addEventListener('beforexrselect',e=>e.preventDefault());
async function check(){
  try{const ok=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-ar');
    $('support').textContent=ok?'อุปกรณ์รองรับ AR • อนุญาตกล้องเพื่อเริ่มวัด':'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ AR — เปิดในเบราว์เซอร์มือถือที่รองรับ';
    $('status').textContent=ok?'พร้อมเริ่มวัดด้วย AR':'ยังไม่รองรับ AR บนอุปกรณ์นี้';
  }catch{$('support').textContent='ตรวจสอบ AR ไม่สำเร็จ ลองเปิดเว็บโดยตรงในเบราว์เซอร์มือถือ'}
}
function cleanup(){
  generation++;pendingCapture=false;capturing=false;releaseAnchors();
  hitSource?.cancel();hitSource=null;session=null;running=false;target=null;camera=null;samples=[];previousCamera=null;currentDistance=null;
  $('app').classList.remove('ar-active');$('empty').hidden=false;$('reticle').hidden=true;$('exit').hidden=true;$('trackingHud').hidden=true;
  $('lines').replaceChildren();$('start').disabled=false;if(!B)A=null;quality='กล้องปิดแล้ว';render();message('ใช้กล้องหลังของมือถือที่รองรับ AR');
}
$('start').onclick=async()=>{
  if(running)return;running=true;$('start').disabled=true;let started=null;
  try{
    if(!navigator.xr)throw new Error('NO_AR');
    started=await navigator.xr.requestSession('immersive-ar',{
      requiredFeatures:['hit-test','dom-overlay'],optionalFeatures:['anchors','depth-sensing'],domOverlay:{root:$('app')},
      depthSensing:{usagePreference:['cpu-optimized'],dataFormatPreference:['float32','luminance-alpha'],matchDepthView:true}
    });
    session=started;started.addEventListener('end',cleanup,{once:true});
    gl=$('xrCanvas').getContext('webgl',{xrCompatible:true,alpha:true});if(!gl)throw new Error('NO_WEBGL');
    await gl.makeXRCompatible();started.updateRenderState({baseLayer:new XRWebGLLayer(started,gl)});
    ref=await started.requestReferenceSpace('local');
    ref.addEventListener('reset',()=>{
      // A reference-space relocalization must not leave old coordinates on screen.
      reset();resetNotice='ระบบปรับพิกัดใหม่ กรุณาปักจุด A และ B ใหม่';previousCamera=null;
    });
    const viewer=await started.requestReferenceSpace('viewer');hitSource=await started.requestHitTestSource({space:viewer});
    const features=started.enabledFeatures;
    anchorEnabled=features?Array.from(features).includes('anchors'):typeof XRFrame!=='undefined'&&typeof XRFrame.prototype.createAnchor==='function';
    depthEnabled=started.depthUsage==='cpu-optimized';reset();previousCamera=null;
    $('app').classList.add('ar-active');$('empty').hidden=true;$('exit').hidden=false;$('trackingHud').hidden=false;
    quality='กำลังค้นหาพื้นผิว';started.requestAnimationFrame(frame);render();
  }catch(e){
    if(started){try{await started.end()}catch{}}cleanup();
    $('support').textContent=e.name==='NotAllowedError'||e.name==='SecurityError'?'กรุณาอนุญาตกล้องและเปิดเว็บโดยตรงผ่าน HTTPS':'เริ่ม AR ไม่สำเร็จ ลองเปิดใหม่ในเบราว์เซอร์ที่รองรับ WebXR hit-test และ DOM overlay';
    $('status').textContent='เปิด AR ไม่สำเร็จ';
  }
};
function readDepth(frame,view){
  if(!depthEnabled||typeof frame.getDepthInformation!=='function')return null;
  try{
    const info=frame.getDepthInformation(view);if(!info)return null;
    const values=[];
    for(const [x,y] of [[.5,.5],[.495,.5],[.505,.5],[.5,.495],[.5,.505]]){
      const d=info.getDepthInMeters(x,y);if(Number.isFinite(d)&&d>.1&&d<10)values.push(d);
    }
    if(values.length<3)return null;
    const m=median(values);
    return Math.max(...values)-Math.min(...values)<=Math.max(.05,m*.05)?m:null;
  }catch{return null}
}
function updateAnchors(frame){
  let valid=true;
  for(const key of ['A','B'])if(anchors[key]){
    let pose=null;try{pose=frame.getPose(anchors[key].anchorSpace,ref)}catch{}
    if(!pose||pose.emulatedPosition){valid=false;continue}
    const v=transform(pose.transform.matrix,anchorOffsets[key]||[0,0,0,1]);
    const p={x:v[0],y:v[1],z:v[2]};if(key==='A')A=p;else B=p;
  }
  return valid;
}
function capturePoint(frame,hit,hitPose){
  pendingCapture=false;if(!target||!trackingOK||capturing||B)return;
  const key=A?'B':'A',point={...target},version=generation,activeSession=session;
  capturing=true;render();
  const commit=(anchor,offset)=>{
    if(version!==generation||session!==activeSession){safeDelete(anchor);return}
    if(key==='A')A=point;else B=point;
    anchors[key]=anchor;anchorOffsets[key]=offset;capturing=false;target=null;samples=[];progress=0;resetNotice='';
    navigator.vibrate?.(25);render();
  };
  if(!anchorEnabled){commit(null,null);return}
  let promise,offset;
  try{
    if(typeof hit.createAnchor==='function'){
      offset=transform(hitPose.transform.inverse.matrix,[point.x,point.y,point.z,1]);
      promise=hit.createAnchor();
    }else{
      offset=[0,0,0,1];promise=frame.createAnchor(new XRRigidTransform(point),ref);
    }
    Promise.resolve(promise).then(anchor=>commit(anchor,offset),()=>{
      if(version!==generation||session!==activeSession)return;
      anchorEnabled=false;commit(null,null);
    });
  }catch{anchorEnabled=false;commit(null,null)}
}
function transform(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]*p[3],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]*p[3],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]*p[3],m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15]*p[3]]}
function project(p,view){const v=transform(view.transform.inverse.matrix,[p.x,p.y,p.z,1]);const c=transform(view.projectionMatrix,v);if(c[3]<=0||c[2]<-c[3]||c[2]>c[3])return null;const rect=$('lines').getBoundingClientRect();return {x:(c[0]/c[3]+1)*rect.width/2,y:(1-c[1]/c[3])*rect.height/2}}
function svg(name,attrs,text){const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;return el}
// The pole foot stays at the projected world point; flag size stays readable on a phone.
function flagMarker(point, label) {
  const group = svg('g', {transform: `translate(${point.x} ${point.y})`});
  const width = $('lines').getBoundingClientRect().width;
  const direction = point.x > width - 50 ? -1 : 1;
  group.append(svg('circle', {cx: 0, cy: 0, r: 7, fill: '#ef3340', stroke: '#fff', 'stroke-width': 2}));
  group.append(svg('line', {x1: 0, y1: 0, x2: 0, y2: -52, stroke: '#15241c', 'stroke-width': 6, 'stroke-linecap': 'round'}));
  group.append(svg('line', {x1: 0, y1: 0, x2: 0, y2: -52, stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round'}));
  group.append(svg('path', {
    d: `M 0 -50 L ${direction * 36} -50 L ${direction * 29} -37 L ${direction * 36} -24 L 0 -24 Z`,
    fill: '#e52e3c', stroke: '#fff', 'stroke-width': 1.5, 'stroke-linejoin': 'round'
  }));
  group.append(svg('text', {x: direction * 15, y: -32, fill: '#fff', 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, 'font-family': 'system-ui'}, label));
  return group;
}
function draw(view){
  const root=$('lines');root.replaceChildren();if(!trackingOK)return;
  const end=B||target,pa=A?project(A,view):null,pb=end?project(end,view):null;
  if(pa&&pb){
    root.append(svg('line',{x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y,stroke:'#13271c','stroke-width':6}));
    root.append(svg('line',{x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y,stroke:'#c0fa8b','stroke-width':3,'stroke-dasharray':B?'none':'7 5'}));
    const area=root.getBoundingClientRect(),controls=$('measurementControls').getBoundingClientRect();
    const visible=clipSegment(pa,pb,{left:18,right:area.width-18,top:125,bottom:Math.max(155,controls.top-area.top-25)});
    if(visible){
      const midX=(visible[0].x+visible[1].x)/2,y=(visible[0].y+visible[1].y)/2;
      const value='≈ '+fmt(components(A,end)[mode])+' '+labels[unit];
      const width=Math.max(156,value.length*13+30);
      const x=Math.max(width/2+8,Math.min(area.width-width/2-8,midX));
      const g=svg('g',{transform:`translate(${x} ${y})`});
      g.append(svg('rect',{x:-width/2,y:-32,width,height:64,rx:16,fill:'#10261f','fill-opacity':.96,stroke:'#c0fa8b','stroke-width':1.5}));
      g.append(svg('text',{x:0,y:-10,'text-anchor':'middle',fill:'#c5d5c9','font-size':12,'font-family':'Tahoma,system-ui'},modeNames[mode]+(B?'':' · กำลังเล็ง')));
      g.append(svg('text',{x:0,y:18,'text-anchor':'middle',fill:'#fff','font-size':23,'font-weight':700,'font-family':'Tahoma,system-ui'},value));root.append(g);
    }
  }
  if(pb&&!B)root.append(svg('circle',{cx:pb.x,cy:pb.y,r:7,fill:'#c0fa8b',stroke:'#17341f','stroke-width':2}));
  if(pa)root.append(flagMarker(pa,'A'));if(pb&&B)root.append(flagMarker(pb,'B'));
}
function frame(time,f){
  if(!session||f.session!==session)return;session.requestAnimationFrame(frame);
  gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const pose=f.getViewerPose(ref);
  trackingOK=!!pose&&!pose.emulatedPosition&&session.visibilityState==='visible';
  if(trackingOK)trackingOK=updateAnchors(f);
  if(!trackingOK){
    if(A&&(!anchors.A||(B&&!anchors.B))&&!capturing){reset();resetNotice='การติดตามขาดหาย กรุณาปักจุดใหม่';}
    pendingCapture=false;target=null;samples=[];progress=0;previousCamera=null;currentDistance=null;
    $('reticle').hidden=true;$('lines').replaceChildren();quality='การติดตามไม่พร้อม';depthSource='รอการติดตาม';
    render();message('หยุดเดิน แล้วเล็งกลับไปยังจุดวัด');return;
  }
  camera=pose.transform.position;
  const still=motionIsStill(previousCamera,pose.transform,time);
  previousCamera={position:{x:camera.x,y:camera.y,z:camera.z},orientation:{...pose.transform.orientation},time};
  // DOMPoint properties are not enumerable on every browser.
  previousCamera.orientation={x:pose.transform.orientation.x,y:pose.transform.orientation.y,z:pose.transform.orientation.z,w:pose.transform.orientation.w};
  const view=pose.views[0],nativeDepth=readDepth(f,view);
  const hit=f.getHitTestResults(hitSource)[0],hp=hit?.getPose(ref);
  currentDistance=null;target=null;depthSource=nativeDepth!==null?'มีข้อมูล Depth':'ระยะจากพื้นผิว AR';
  quality=B?'วัดเสร็จแล้ว':still?'กำลังตรวจสอบจุด':'ถือมือถือให้นิ่งก่อนปักธง';
  let depthConflict=false;
  if(hp){
    const p=hp.transform.position,point={x:p.x,y:p.y,z:p.z};
    const range=length(camera,point),forward=-transform(view.transform.inverse.matrix,[point.x,point.y,point.z,1])[2];
    depthConflict=nativeDepth!==null&&!depthAgrees(forward,nativeDepth);
    if(nativeDepth!==null)depthSource=depthConflict?'Depth ไม่ตรงกับพื้นผิว':'ตรวจสอบด้วย Depth';
    // Depth measures camera-plane distance. Convert on the same hit ray, never mix units with ray length.
    currentDistance=nativeDepth!==null&&forward>0?nativeDepth*length(view.transform.position,point)/forward:range;
    const filtered=filterPoint(samples,point,time,still&&!depthConflict&&range>=.15&&range<=8&&!hp.emulatedPosition);
    samples=filtered.samples;target=B?null:filtered.point;progress=B?1:filtered.progress;
    if(target){lastHit=performance.now();quality='จุดนิ่ง • พร้อมปักธง';if(nativeDepth===null)currentDistance=length(camera,target);}
    if(depthConflict&&!B)quality='พื้นผิวยังไม่แน่นอน';
    if((range<.15||range>8)&&!B)quality='ขยับให้อยู่ห่าง 0.15–8 เมตร';
    if(pendingCapture){if(target)capturePoint(f,hit,hp);else pendingCapture=false}
  }else{
    samples=[];progress=B?1:0;pendingCapture=false;
    if(!B)quality='กำลังค้นหาพื้นผิว';
    // No hit ray is available for a true camera-to-point distance.
    depthSource=nativeDepth!==null?'มี Depth • กำลังหาจุดบนพื้นผิว':'ยังไม่พบพื้นผิว';
  }
  $('reticle').hidden=!!B;
  $('reticle').classList.toggle('ready',!!target);
  render();
  if(resetNotice)message(resetNotice);
  else if(capturing)message('กำลังยึดจุดวัดกับพื้นผิว');
  else if(B)message(anchors.A&&anchors.B?'ยึดจุด A–B แล้ว • ดูระยะบนเส้น':'อุปกรณ์ยึดจุดไม่ได้ครบ • เดินแล้วอาจคลาดเคลื่อน');
  else if(depthConflict)message('เลี่ยงขอบวัตถุหรือพื้นผิวใส แล้วเล็งใหม่');
  else if(target)message('กดปักธงจุด '+(A?'B':'A'));
  else message(still?'เล็งตำแหน่งเดิมค้างไว้ประมาณ 1 วินาที':'หยุดเดินและถือมือถือให้นิ่งก่อนปักธง');
  draw(view);
}
check();
