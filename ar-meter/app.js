const $=id=>document.getElementById(id);
let mode='horizontal',unit='cm',session=null,ref=null,hitSource=null,gl=null,A=null,B=null,target=null,camera=null,lastHit=0,samples=[],running=false;
const descriptions={horizontal:'วัดระยะบนระนาบแนวนอน เช่น ความกว้างหรือความลึก',vertical:'วัดความต่างระดับของสองจุด เช่น ความสูงของวัตถุ',free:'วัดเส้นตรงสามมิติ พร้อมระยะแนวนอนและแนวตั้ง'};
const labels={cm:'ซม.',m:'ม.',in:'นิ้ว'};
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function components(a,b){const horizontal=Math.hypot(a.x-b.x,a.z-b.z),vertical=Math.abs(a.y-b.y);return {horizontal,vertical,free:Math.hypot(horizontal,vertical)}}
function fmt(m){return (m*(unit==='cm'?100:unit==='in'?39.3700787402:1)).toLocaleString('th-TH',{maximumFractionDigits:unit==='m'?2:1,minimumFractionDigits:unit==='m'?2:1})}
function message(s){$('hint').textContent=s}
function render(){const end=B||target;const c=A&&end?components(A,end):null;$('distance').textContent=c?fmt(c[mode]):'—';$('horizontal').textContent=c?fmt(c.horizontal)+' '+labels[unit]:'—';$('vertical').textContent=c?fmt(c.vertical)+' '+labels[unit]:'—';$('unitlabel').textContent=labels[unit];$('resultstate').textContent=B?'วัดเสร็จแล้ว • ค่าประมาณจาก AR':A?'เล็งจุดสิ้นสุดเพื่อดูระยะ':'กำหนดจุดเริ่มต้นเพื่อเริ่มวัด';$('capture').textContent=B?'✓ วัดเสร็จแล้ว':A?'＋ กำหนดจุดสิ้นสุด':'＋ กำหนดจุดเริ่มต้น';$('capture').disabled=!session||!target||!!B;$('reset').disabled=!A;$('stepA').classList.toggle('done',!!A);$('stepB').classList.toggle('done',!!B);$('pointA').textContent=A?'กำหนดแล้ว':'ยังไม่ได้กำหนด';$('pointB').textContent=B?'กำหนดแล้ว':'ยังไม่ได้กำหนด';$('stepA').querySelector('i').textContent=A?'✓':'○';$('stepB').querySelector('i').textContent=B?'✓':'○';if(session&&c)message((B?'ระยะที่วัดได้: ':'ระยะขณะเล็ง: ')+fmt(c[mode])+' '+labels[unit]+(B?' • ปิดกล้องเพื่อดูรายละเอียด':''));}
function reset(){A=null;B=null;$('lines').replaceChildren();render();message(session?'เล็งพื้นผิวเพื่อกำหนดจุดเริ่มต้น':'ใช้กล้องหลังของมือถือที่รองรับ AR')}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});$('modehelp').textContent=descriptions[mode];reset()});
$('unit').onchange=()=>{unit=$('unit').value;render()};$('help').onclick=()=>$('guide').showModal();$('closeHelp').onclick=()=>$('guide').close();$('reset').onclick=reset;
$('capture').onclick=()=>{if(!target||!session||performance.now()-lastHit>250||B)return;if(!A)A={...target};else B={...target};navigator.vibrate?.(25);render()};
$('exit').onclick=()=>session?.end();
$('app').addEventListener('beforexrselect',e=>e.preventDefault());
async function check(){try{const ok=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-ar');$('support').textContent=ok?'อุปกรณ์รองรับ AR • อนุญาตกล้องเพื่อเริ่มวัด':'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ AR — ลองเปิดใน Chrome บนมือถือ Android ที่รองรับ AR';$('status').textContent=ok?'พร้อมเริ่มวัดด้วย AR':'ยังไม่รองรับ AR บนอุปกรณ์นี้';return ok}catch{$('support').textContent='ตรวจสอบ AR ไม่สำเร็จ ลองเปิดเว็บโดยตรงในเบราว์เซอร์มือถือ';return false}}
function cleanup(){hitSource?.cancel();hitSource=null;session=null;running=false;target=null;camera=null;samples=[];$('app').classList.remove('ar-active');$('empty').hidden=false;$('reticle').hidden=true;$('exit').hidden=true;$('lines').replaceChildren();$('depth').textContent='—';$('liveDepth').textContent='LIVE VIEW';$('start').disabled=false;$('status').textContent='กล้องปิดแล้ว';if(!B)A=null;render();message('ใช้กล้องหลังของมือถือที่รองรับ AR')}
$('start').onclick=async()=>{if(running)return;running=true;$('start').disabled=true;let started=null;try{if(!navigator.xr)throw new Error('NO_AR');started=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['hit-test','dom-overlay'],domOverlay:{root:$('app')}});session=started;started.addEventListener('end',cleanup,{once:true});gl=$('xrCanvas').getContext('webgl',{xrCompatible:true,alpha:true});if(!gl)throw new Error('NO_WEBGL');await gl.makeXRCompatible();started.updateRenderState({baseLayer:new XRWebGLLayer(started,gl)});ref=await started.requestReferenceSpace('local');const viewer=await started.requestReferenceSpace('viewer');hitSource=await started.requestHitTestSource({space:viewer});A=null;B=null;samples=[];$('app').classList.add('ar-active');$('empty').hidden=true;$('exit').hidden=false;$('status').textContent='กำลังค้นหาพื้นผิว';message('ขยับมือถือช้า ๆ แล้วเล็งพื้นผิวที่มีลวดลาย');started.requestAnimationFrame(frame);render()}catch(e){if(started){try{await started.end()}catch{}}cleanup();const denied=e.name==='NotAllowedError'||e.name==='SecurityError';$('support').textContent=denied?'ไม่ได้รับอนุญาตให้ใช้ AR / กล้อง กรุณาอนุญาตกล้องและเปิดเว็บโดยตรงผ่าน HTTPS':'ไม่สามารถเริ่ม AR ได้ อุปกรณ์ต้องรองรับ WebXR, hit-test และการแสดงปุ่มบนกล้อง ลองใช้ Chrome บน Android ที่รองรับ AR';$('status').textContent='เปิด AR ไม่สำเร็จ';}};
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
function draw(view) {
  const root = $('lines');
  root.replaceChildren();
  const pa = A ? project(A, view) : null;
  const pb = (B || target) ? project(B || target, view) : null;
  if (pa && pb) root.append(svg('line', {x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: '#c0fa8b', 'stroke-width': 3, 'stroke-dasharray': B ? 'none' : '7 5'}));
  if (pb && !B) root.append(svg('circle', {cx: pb.x, cy: pb.y, r: 7, fill: '#c0fa8b', stroke: '#17341f', 'stroke-width': 2}));
  if (pa) root.append(flagMarker(pa, 'A'));
  if (pb && B) root.append(flagMarker(pb, 'B'));
}

function frame(t,f){if(!session)return;session.requestAnimationFrame(frame);const pose=f.getViewerPose(ref);gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(!pose){target=null;samples=[];$('reticle').hidden=true;$('lines').replaceChildren();$('depth').textContent='—';$('liveDepth').textContent='ถึงพื้นผิว —';$('status').textContent='การติดตามขาดหาย';render();message('หยุดมือถือชั่วครู่แล้วเล็งพื้นผิวใหม่');return}camera=pose.transform.position;const hits=f.getHitTestResults(hitSource);const hp=hits[0]?.getPose(ref);if(hp){const p=hp.transform.position;const point={x:p.x,y:p.y,z:p.z};if(samples.length&&length(samples[samples.length-1],point)>.035)samples=[];samples.push(point);if(samples.length>6)samples.shift();target=samples.length>=6? samples.reduce((a,p)=>({x:a.x+p.x/6,y:a.y+p.y/6,z:a.z+p.z/6}),{x:0,y:0,z:0}):null;lastHit=performance.now();$('depth').textContent=fmt(length(camera,point))+' '+labels[unit];$('liveDepth').textContent='ถึงพื้นผิว '+$('depth').textContent;$('status').textContent=target?'พบพื้นผิว • พร้อมกำหนดจุด':'กำลังปรับจุดวัดให้นิ่ง'}else{target=null;samples=[];$('depth').textContent='—';$('liveDepth').textContent='ถึงพื้นผิว —';$('status').textContent='กำลังค้นหาพื้นผิว'}$('reticle').hidden=!target||!!B;render();if(!B&&!target)message('ขยับช้า ๆ และเล็งพื้นผิวจนพบจุดวัด');else if(!A)message('เล็งจุดเริ่มต้น แล้วกดปุ่มกำหนดจุด');draw(pose.views[0]);}
check();
