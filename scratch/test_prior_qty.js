const assert=require('assert');
  function priorQty(str){
    const none = { quantity: null, unit: '' };
    if(!str) return none;
    const s0 = String(str);
    const NUM = '(-?\\d+(?:\\.\\d+)?)';
    const nums = (e)=> [...String(e).matchAll(/-?\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
    const prod = (xs)=> Math.round(xs.reduce((a, c) => a * c, 1) * 1e6) / 1e6;
    const countOf = (t)=>{ const m = t.match(new RegExp(NUM + '\\s*(EA|개소|개)(?![가-힣A-Za-z])', 'i')); return m ? parseFloat(m[1]) : null; };
    const EXPR = NUM + '(?:\\s*[×xX*]\\s*' + NUM + ')*';
    let m = s0.match(new RegExp('(?:(?<![A-Za-z])V|체적)\\s*[=:]?\\s*(' + EXPR + ')\\s*(㎥|m³|m3)?', 'i'));
    if(m) return { quantity: prod(nums(m[1])), unit: '㎥' };
    m = s0.match(new RegExp('(?:(?<![A-Za-z])A|면적)\\s*[=:]?\\s*(' + EXPR + ')\\s*(㎡|m²|m2)?', 'i'));
    if(m) return { quantity: prod(nums(m[1])), unit: '㎡' };
    m = s0.match(new RegExp('(?<![A-Za-z])L\\s*=\\s*(' + EXPR + ')\\s*(m)(?![a-z²³])', 'i'));
    if(m){ const n = nums(m[1]); if(n.length !== 1) return none; const c = countOf(s0); return { quantity: c ? Math.round(n[0] * c * 1e6) / 1e6 : n[0], unit: 'm' }; }
    m = s0.match(new RegExp('(' + NUM + '(?:\\s*[×xX*]\\s*' + NUM + ')+)\\s*(m|㎡|㎥|m²|m³)?', 'i'));
    if(m){ const n = nums(m[1]); if((n.length === 2 || n.length === 3) && (!m[m.length - 1] || /^m$/i.test(m[m.length - 1]))){ const c = countOf(s0), v = prod(n); return { quantity: c ? Math.round(v * c * 1e6) / 1e6 : v, unit: n.length === 2 ? '㎡' : '㎥' }; } return none; }
    const dims = [...s0.matchAll(new RegExp('(너비|폭|길이|깊이|높이|가로|세로)\\s*[=:]?\\s*' + NUM + '\\s*(mm|cm|m)(?![a-z²³])', 'g'))].filter(d => d[3] === 'm').map(d => parseFloat(d[2]));
    const c3 = countOf(s0), mul = (v)=> c3 ? Math.round(v * c3 * 1e6) / 1e6 : v;
    if(dims.length === 1) return { quantity: mul(dims[0]), unit: 'm' };
    if(dims.length === 2) return { quantity: mul(prod(dims)), unit: '㎡' };
    if(dims.length >= 3) return { quantity: mul(prod(dims.slice(0, 3))), unit: '㎥' };
    m = s0.match(new RegExp(NUM + '\\s*(EA|개소|개)(?![가-힣A-Za-z])', 'i'));
    if(m) return { quantity: parseFloat(m[1]), unit: m[2] };
    const all = [...s0.matchAll(new RegExp(NUM + '\\s*(㎡|㎥|m²|m³|mm|cm|km|개소|개|매|EA|ea|kg|ton|%|m)?', 'gi'))];
    if(!all.length) return none;
    const normU = (u)=> u === 'm²' ? '㎡' : u === 'm³' ? '㎥' : (u || '');
    const pick = all.find(x => x[2] && !/^(mm|cm)$/i.test(x[2])) || all.find(x => x[2]) || all[0];
    return { quantity: parseFloat(pick[1]), unit: normU(pick[2]) };
  }
  function priorNudge(x, y, taken){
    const clash = (yy)=> taken.some(([tx, ty]) => Math.abs(tx - x) < 2.4 && Math.abs(ty - yy) < 3.6);
    for(const dy of [0, 4, -4, 8, -8, 12, -12, 16, -16]){
      const yy = Math.max(2, Math.min(98, y + dy));
      if(!clash(yy)) return { xPct: x, yPct: yy };
    }
    return { xPct: x, yPct: y };
  }

const cases=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8')).cases;
let bad=0,n=0;
for(const c of cases){ const exp=c.js; const r=priorQty(c.text); n++; const eq=(exp[0]===''?null:exp[0]), eu=exp[1]; const okq=(eq==null&&r.quantity==null)||(eq!=null&&r.quantity!=null&&Math.abs(r.quantity-eq)<1e-6); const oku=(eu||'')===(r.unit||''); if(!(okq&&oku)){ bad++; if(bad<8) console.log('MISMATCH',JSON.stringify(c.text),JSON.stringify(r),JSON.stringify(exp)); } }
console.log('cases',n,'bad',bad);
const taken=[[50,50]]; const z=priorNudge(50,50,taken); assert(z.yPct!==50 && z.xPct===50); const z2=priorNudge(10,50,taken); assert(z2.yPct===50);
console.log('nudge ok');
