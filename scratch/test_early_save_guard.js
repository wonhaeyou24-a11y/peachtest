/**
 * 시작 중 저장 가드 시험 (Electron): 앱을 열자마자 화면이 숨겨져(visibilitychange·pagehide) 저장이 걸릴 때,
 * 불러오기가 끝나기 전의 "시설물 0개" 빈 상태가 저장소에 쓰이면 안 된다 (그 틈에 창이 닫히면 기존손상·눈금·지점 추가 필드가 사라짐).
 * 실행: <desk>/node_modules/.bin/electron scratch/test_early_save_guard.js [비교할 옛 index.html]
 *   - 인자 없이: 현재 index.html (가드 있음 → 통과)  /  옛 파일(가드 없음)을 주면 "빈 상태 저장 1회"로 실패해 문제를 재현한다
 */
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');

const htmlSrc = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'index.html');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-guard-'));
app.setPath('userData', tmp);
app.on('window-all-closed', () => {});   // 창을 닫아도 시험이 끝나기 전에는 종료하지 않는다
const dir = path.join(tmp, 'site'); fs.mkdirSync(dir);
fs.copyFileSync(htmlSrc, path.join(dir, 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

const SEED = {
  schemaVersion: 1,
  sites: [{ id: 'S1', name: '시험 옹벽', projectId: 'P1', markers: [], nextNum: 1, existingDamages: [{ id: 'ED1', damageName: '균열', measurement: '길이 3m' }], drawings: [{ id: 'D1', name: '도면', calib: { p1: { x: 10, y: 50, m: 0 }, p2: { x: 90, y: 50, m: 40 }, ar: 1.5 } }] }],
  currentSiteId: 'S1', projects: [{ id: 'P1', name: '시험 프로젝트', createdAt: new Date().toISOString() }], currentProjectId: 'P1', deletedSites: []
};

// 페이지가 읽기 전에 '화면이 숨겨짐' 이벤트를 보낸다 (시작 직후 화면이 숨겨지는 상황)
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, `
  const _put = IDBObjectStore.prototype.put; window.__emptyPuts = 0;
  IDBObjectStore.prototype.put = function (v, k) { try { if (k === 'point-shot-sites-v1' && v && Array.isArray(v.sites) && v.sites.length === 0) window.__emptyPuts++; } catch (e) {} return _put.apply(this, arguments); };
  Object.defineProperty(document, 'visibilityState', { get: () => window.__hidden ? 'hidden' : 'visible', configurable: true });
  window.__earlyHide = /hide=1/.test(location.search);
  const fire = () => { if (window.__earlyHide) { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); } };
  document.addEventListener('DOMContentLoaded', () => { fire(); setTimeout(fire, 0); setTimeout(fire, 30); setTimeout(fire, 100); });
`);

async function openWin(hide) {
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false, nodeIntegration: false, preload } });
  await w.loadFile(path.join(dir, 'index.html'), hide ? { query: { hide: '1' } } : undefined);
  return w;
}
const readKV0 = (w) => w.webContents.executeJavaScript(`new Promise((res)=>{const r=indexedDB.open('point-shot-db'); r.onsuccess=()=>{const db=r.result; const t=db.transaction('kv').objectStore('kv').get('point-shot-sites-v1'); t.onsuccess=()=>{ const v=t.result; const val=v&&(v.value||v); res(JSON.stringify(val? {ed:((val.sites||[])[0]||{}).existingDamages?.length||0, sites:(val.sites||[]).length, calib: !!(((val.sites||[])[0]||{}).drawings||[])[0]?.calib } : null)); }; t.onerror=()=>res('err'); }; r.onerror=()=>res('err');})`);

const readKV = (w) => Promise.race([readKV0(w), sleep(8000).then(() => 'null')]);
app.whenReady().then(async () => {
  try {
    // 1) 첫 실행으로 DB 를 만들고, 정상 데이터를 심는다
    let w = await openWin(); 
    await sleep(2500);
    await (Promise.race([w.webContents.executeJavaScript(`new Promise((res)=>{const r=indexedDB.open('point-shot-db'); r.onerror=()=>res('openerr '+r.error); r.onblocked=()=>res('blocked'); r.onsuccess=()=>{const db=r.result; const names=[...db.objectStoreNames].join(','); try{ const tx=db.transaction('kv','readwrite'); tx.objectStore('kv').put(${JSON.stringify(SEED)}, 'point-shot-sites-v1'); tx.oncomplete=()=>res('ok '+names); tx.onerror=()=>res('txerr '+tx.error); tx.onabort=()=>res('abort '+tx.error);}catch(e){ res('throw '+e.message+' '+names); } };})`), sleep(8000).then(() => 'timeout')]));
    w.destroy(); await sleep(300);

    // 2) 정상 시작(숨김 없음): 데이터가 그대로 남는다
    console.log('step2'); w = await openWin(false);
    await sleep(3500);
    let st = JSON.parse(await readKV(w));
    check('정상 시작: 기존손상·눈금이 유지된다', st && st.ed === 1 && st.calib === true, JSON.stringify(st));
    w.destroy(); await sleep(300);

    // 3) 시작 직후 화면이 숨겨짐(저장이 걸림): 불러오기 전에 '시설물 0개' 상태가 저장소에 쓰이면 안 된다
    const w3 = await openWin(true);
    await sleep(3500);
    const empties = await w3.webContents.executeJavaScript('window.__emptyPuts || 0');
    st = JSON.parse(await readKV(w3));
    check('시작 직후 화면이 숨겨져도 "시설물 0개" 상태를 저장소에 쓰지 않는다', empties === 0, '빈 상태 저장 ' + empties + '회');
    check('최종 저장소에 정상 데이터가 남아 있다', st && st.sites === 1 && st.ed === 1 && st.calib === true, JSON.stringify(st));
  } catch (e) { console.log('[FAIL] 예외', e.stack || e); fail++; }
  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
  app.exit(fail ? 1 : 0);
});
