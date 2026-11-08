
function calibUsable(calib){ return !!(calib && !calib.off && calib.p1 && calib.p2); }
  function priorPositionM(text){
    const t = String(text == null ? '' : text).replace(/,/g, '');
    const r = t.match(/(-?\d+(?:\.\d+)?)\s*(?:~|∼|–|-)\s*(-?\d+(?:\.\d+)?)/);
    if(r){ const a = parseFloat(r[1]), c = parseFloat(r[2]); if(isFinite(a) && isFinite(c)) return (a + c) / 2; }
    const m = t.match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // 눈금 보정 두 점(p1,p2: 도면 % 좌표 + 측점 m)을 잇는 선 위에서 측점 m 의 도면 좌표(%). 선 양끝에서 2% 넘게 벗어나면 null.
  function priorXYFromStation(calib, meters){
    if(!calibUsable(calib) || meters == null) return null;
    const dm = calib.p2.m - calib.p1.m;
    if(!(Math.abs(dm) > 0)) return null;
    const t = (meters - calib.p1.m) / dm;
    if(!isFinite(t) || t < -0.02 || t > 1.02) return null;
    const c = Math.max(0, Math.min(1, t));
    return { xPct: calib.p1.x + c * (calib.p2.x - calib.p1.x), yPct: calib.p1.y + c * (calib.p2.y - calib.p1.y), t };
  }

const assert=require('assert');
assert.strictEqual(priorPositionM('12m'),12);
assert.strictEqual(priorPositionM('64~72'),68);
assert.strictEqual(priorPositionM('L=152m 부근'),152);
assert.strictEqual(priorPositionM('1,250m'),1250);
assert.strictEqual(priorPositionM(''),null);
assert.strictEqual(priorPositionM('상단'),null);
const c={p1:{x:10,y:50,m:0},p2:{x:90,y:50,m:80}};
let r=priorXYFromStation(c,40); assert(Math.abs(r.xPct-50)<1e-9 && r.yPct===50);
r=priorXYFromStation(c,0); assert(Math.abs(r.xPct-10)<1e-9);
assert.strictEqual(priorXYFromStation(c,200),null);   // 범위 밖
assert.strictEqual(priorXYFromStation(c,-10),null);
assert.strictEqual(priorXYFromStation({off:true},10),null);
const rev={p1:{x:90,y:40,m:0},p2:{x:10,y:60,m:80}};   // 오른쪽→왼쪽, 비스듬한 선
r=priorXYFromStation(rev,40); assert(Math.abs(r.xPct-50)<1e-9 && Math.abs(r.yPct-50)<1e-9);
console.log('ok');
