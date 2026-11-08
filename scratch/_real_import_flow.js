// 실제 전차자료(JSON+ZIP)를 앱 화면 흐름(가져오기 입력 → 확인 → 사진 연결)대로 돌려 결과를 저장소에서 확인 (Electron)
// 실행: <desk>/node_modules/.bin/electron scratch/_real_import_flow.js "<json>" "<zip>"
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const jsonPath = process.argv[2], zipPath = process.argv[3] === 'none' ? null : process.argv[3];
const tmp = process.env.PS_USERDATA ? (fs.mkdirSync(process.env.PS_USERDATA, { recursive: true }), process.env.PS_USERDATA) : fs.mkdtempSync(path.join(os.tmpdir(), 'ps-flow-'));
app.setPath('userData', tmp);
app.on('window-all-closed', () => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, 'window.confirm = () => true;');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { contextIsolation: false, nodeIntegration: false, preload } });
  const js = c => w.webContents.executeJavaScript(c);
  await w.loadFile(path.join(__dirname, '..', 'index.html'));
  await sleep(4000);
  await js(`window.__alerts = []; window.alert = m => window.__alerts.push(String(m)); window.__j = ${JSON.stringify(fs.readFileSync(jsonPath).toString('base64'))}; window.__z = ${JSON.stringify(zipPath ? fs.readFileSync(zipPath).toString('base64') : '')}; true`);
  await js(`(() => {
    const dec = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const jf = new File([dec(window.__j)], ${JSON.stringify(path.basename(jsonPath))}, { type: 'application/json' });
    const zf = new File([dec(window.__z)], ${JSON.stringify(path.basename(zipPath || 'x.zip'))}, { type: 'application/zip' });
    const dt = new DataTransfer(); dt.items.add(jf); if (window.__z) dt.items.add(zf);
    const inp = document.getElementById('priorImportInput'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true; })()`);
  const seen = [];
  for (let i = 0; i < 100; i++) {
    await sleep(2000);
    const r = await js(`(() => { const ov = [...document.querySelectorAll('.psd-overlay')].filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none'); if (!ov.length) return null; const o = ov[ov.length - 1]; const bs = [...o.querySelectorAll('button')]; const txt = o.innerText; const ok = bs[bs.length - 1]; const label = ok ? ok.textContent.trim() : ''; if (ok) ok.click(); return JSON.stringify({ txt: txt.slice(0, 700), label }); })()`);
    if (r) { seen.push(r); if (/가져왔습니다|오류가 발생|가져올 수 있는 파일이 없습니다|ZIP/.test(r) && !/이대로 가져올까요/.test(r)) { await sleep(2500); break; } }
  }
  console.log('DIALOGS', seen.map(x => { try { const o = JSON.parse(x); return '[' + o.label + '] ' + o.txt.split(String.fromCharCode(10)).join(' / '); } catch (e) { return x; } }).join(String.fromCharCode(10) + '---' + String.fromCharCode(10)).slice(0, 3500));
  await sleep(1500);
  const st = await js(`new Promise((res) => { const r = indexedDB.open('point-shot-db'); r.onsuccess = () => { const db = r.result; const g = db.transaction('kv').objectStore('kv').get('point-shot-sites-v1'); g.onsuccess = () => { const v = g.result && (g.result.value || g.result); const sites = (v && v.sites) || []; const out = { sites: sites.map(s => ({ name: s.name, ed: (s.existingDamages || []).length, withPhotos: (s.existingDamages || []).filter(d => (d.photos || []).length).length, priorPhotos: (s.existingDamages || []).reduce((a, d) => a + (d.photos || []).filter(p => p && p.prior).length, 0), withFile: (s.existingDamages || []).filter(d => d.priorPhotoFile).length })) }; let n = 0; try { const c = db.transaction('photoBlobs').objectStore('photoBlobs').count(); c.onsuccess = () => { out.photoBlobs = c.result; res(JSON.stringify(out)); }; } catch (e) { out.photoBlobs = 'err'; res(JSON.stringify(out)); } }; }; })`);
  console.log('STORE', st);
  // 화면 확인: 전차손상 조사 창 / 기존손상 관리 창에서 사진이 실제로 보이는지
  const dumpPhotos = `(() => { const imgs = [...document.querySelectorAll('img')].filter(i => i.offsetParent !== null && /전차 사진/.test(i.alt || '')); return JSON.stringify({ n: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, srcs: imgs.slice(0, 2).map(i => (i.src || '').slice(0, 40)) }); })()`;
  console.log('BTN', await js(`(()=>{ const b = document.getElementById('btnPriorSurvey'); return b ? (b.offsetParent !== null ? 'visible:' + b.textContent.trim() : 'hidden') : 'none'; })()`));
  await js(`(() => { const b = document.getElementById('btnPriorSurvey'); if (b) b.click(); return true; })()`);
  await sleep(3000);
  console.log('SURVEY', await js(dumpPhotos));
  console.log('SURVEY-TEXT', (await js(`(() => { const p = document.getElementById('priorSurveyPanel') || document.querySelector('[id*=priorSurvey]'); return p ? p.innerText.slice(0, 600) : 'no panel'; })()`)).split(String.fromCharCode(10)).join(' / '));
  app.exit(0);
});
