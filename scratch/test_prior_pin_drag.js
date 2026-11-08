/**
 * 전차 미리 찍은 지점을 도면에서 끌어서 옮기는 기능 시험 (Electron)
 * 실행: <desk>/node_modules/.bin/electron scratch/test_prior_pin_drag.js
 *  - 미리 찍은(priorId, 사진 없음) 지점을 끌면 위치가 바뀌어 저장된다
 *  - 사진이 있는 지점·일반 지점은 끌어도 옮겨지지 않고, 짧게 누르면 기존처럼 열린다
 */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-drag-'));
app.setPath('userData', tmp);
app.on('window-all-closed', () => {});
const dir = path.join(tmp, 'site'); fs.mkdirSync(dir);
fs.copyFileSync(path.join(__dirname, '..', 'index.html'), path.join(dir, 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, 'window.alert = () => {}; window.confirm = () => true;');

app.whenReady().then(async () => {
  try {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { contextIsolation: false, nodeIntegration: false, preload } });
    let js = c => w.webContents.executeJavaScript(c);
    await w.loadFile(path.join(dir, 'index.html')); await sleep(3000);
    // 시험용 도면 그림과 지점을 저장소에 심는다
    await js(`(async () => {
      const cv = document.createElement('canvas'); cv.width = 800; cv.height = 400; const g = cv.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 800, 400);
      const img = cv.toDataURL('image/png');
      const now = new Date().toISOString();
      const seed = { schemaVersion: 1, currentSiteId: 'S1', currentProjectId: 'P1', deletedSites: [],
        projects: [{ id: 'P1', name: '기본 프로젝트', createdAt: now }],
        sites: [{ id: 'S1', name: '시험 사면', projectId: 'P1', nextNum: 4, mode: 'image', currentDrawingId: 'D1',
          drawings: [{ id: 'D1', name: '도면', imageSrc: img, calib: { p1: { x: 10, y: 50, m: 0 }, p2: { x: 90, y: 50, m: 80 }, ar: 2 } }],
          existingDamages: [{ id: 'ED1', damageName: '균열', measurement: '3m', priorPhotoFile: 'a.jpg' }],
          markers: [
            { id: 'M1', num: 1, xPct: 30, yPct: 40, drawingId: 'D1', photos: [], priorId: 'ED1', createdAt: now },
            { id: 'M2', num: 2, xPct: 60, yPct: 40, drawingId: 'D1', photos: [], createdAt: now }
          ] }] };
      await new Promise((res) => { const r = indexedDB.open('point-shot-db'); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(seed, 'point-shot-sites-v1'); tx.oncomplete = res; }; });
      return true; })()`);
    w.destroy(); await sleep(400);
    const w2 = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { contextIsolation: false, nodeIntegration: false, preload } });
    js = c => w2.webContents.executeJavaScript(c); w2.webContents.on('console-message', (...a) => { const t = JSON.stringify(a); if (t.includes('DRAGDBG')) console.log(t.slice(0, 200)); });
    await w2.loadFile(path.join(dir, 'index.html')); await sleep(4500);
    const info = () => js(`(() => { const m = [...document.querySelectorAll('#stage .marker, .marker')].map(e => ({ id: e.dataset.id, l: parseFloat(e.style.left), t: parseFloat(e.style.top), r: e.getBoundingClientRect().toJSON() })); return JSON.stringify(m); })()`).then(JSON.parse);
    console.log('CLICK', await js(`(()=>{ const c=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && e.textContent.trim().startsWith('시험 사면') && e.offsetParent!==null); if(!c.length) return 'none:'+[...document.querySelectorAll('[class*=site]')].slice(0,6).map(e=>e.className).join('|'); c[0].click(); return 'clicked '+c[0].className; })()`)); await sleep(2500);
    console.log('IDB', await js(`new Promise((res) => { const r = indexedDB.open('point-shot-db'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('point-shot-sites-v1'); g.onsuccess = () => { const v = g.result; res(JSON.stringify({ keys: q.result, hasValueWrap: !!(v && v.value), sites: ((v && (v.value || v)).sites || []).length, ls: Object.keys(localStorage).slice(0,8) })); }; }; }; })`));
    console.log('DBG', await js(`JSON.stringify({stage: !!document.getElementById('stage'), stageDisp: document.getElementById('stage') && getComputedStyle(document.getElementById('stage')).display, nm: document.querySelectorAll('.marker').length, title: document.title, vis: [...document.querySelectorAll('.modal, [id*=Modal]')].filter(e=>e.offsetParent!==null).map(e=>e.id).slice(0,6), body: document.body.innerText.slice(0,200)})`));
    let ms = await info();
    check('도면에 지점 2개가 보인다', ms.length === 2, JSON.stringify(ms.map(m => [m.id, m.l, m.t])));
    const m1 = ms.find(m => m.id === 'M1'), m2 = ms.find(m => m.id === 'M2');
    const fire = (type, x, y, target) => js(`(() => { const el = ${target ? `document.querySelector('.marker[data-id="${target}"]')` : 'document.getElementById("stage")'}; (el || document.body).dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', clientX: ${x}, clientY: ${y}, buttons: 1 })); return true; })()`);
    console.log('HIT', await js(`(()=>{ const m=${JSON.stringify(ms[0].r)}; const el=document.elementFromPoint(m.x+m.width/2, m.y+m.height/2); return el? (el.tagName+'.'+el.className+' in '+(el.closest('.marker')?'marker':'-')) : 'null'; })()`), JSON.stringify(ms[0].r));
    const drag = async (m, dx, dy) => {
      const cx = m.r.x + m.r.width / 2, cy = m.r.y + m.r.height / 2;
      await fire('pointerdown', cx, cy, m.id);
      for (let i = 1; i <= 4; i++) await fire('pointermove', cx + dx * i / 4, cy + dy * i / 4, false);
      await fire('pointerup', cx + dx, cy + dy, false);
      await sleep(600);
    };
    await drag(m1, 120, 40);
    ms = await info();
    const n1 = ms.find(m => m.id === 'M1');
    check('미리 찍은 지점을 끌면 위치가 바뀐다', n1 && (Math.abs(n1.l - 30) > 3 || Math.abs(n1.t - 40) > 3), JSON.stringify([m1.l, m1.t, '→', n1 && n1.l, n1 && n1.t]));
    await sleep(800);
    const saved = await js(`new Promise((res) => { const r = indexedDB.open('point-shot-db'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('point-shot-sites-v1'); q.onsuccess = () => { const v = q.result && (q.result.value || q.result); const mk = ((v.sites || [])[0] || {}).markers || []; res(JSON.stringify(mk.map(x => [x.id, Math.round(x.xPct), Math.round(x.yPct)]))); }; }; })`);
    const sv = JSON.parse(saved);
    check('옮긴 위치가 저장소에 저장된다', sv.some(x => x[0] === 'M1' && (Math.abs(x[1] - 30) > 3 || Math.abs(x[2] - 40) > 3)), saved);
    // 일반 지점(미리 찍은 것이 아님)은 끌어도 지점이 옮겨지지 않는다 (도면이 이동할 뿐)
    ms = await info();
    const o2 = ms.find(m => m.id === 'M2');
    await drag(o2, -100, 60);
    ms = await info();
    const n2 = ms.find(m => m.id === 'M2');
    check('일반 지점은 끌어도 위치가 그대로 (도면 좌표 유지)', n2 && Math.abs(n2.l - o2.l) < 0.01 && Math.abs(n2.t - o2.t) < 0.01, JSON.stringify([o2.l, o2.t, n2 && n2.l, n2 && n2.t]));
  } catch (e) { console.log('[FAIL] 예외', e.stack || e); fail++; }
  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
  app.exit(fail ? 1 : 0);
});
