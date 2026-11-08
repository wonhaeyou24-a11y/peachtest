// 실제 전차자료(JSON+ZIP)를 앱 화면 흐름으로 가져와 사진이 연결되는지 확인 (Electron)
// 실행: <desk>/node_modules/.bin/electron scratch/_real_import_ui.js "<json>" "<zip>"
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const jsonPath = process.argv[2], zipPath = process.argv[3];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-real-'));
app.setPath('userData', tmp);
app.on('window-all-closed', () => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, `
  window.__alerts = []; window.alert = (m) => { window.__alerts.push(String(m)); };
  window.confirm = () => true;
`);
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false, nodeIntegration: false, preload } });
  const logs = [];
  w.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) logs.push(msg.slice(0, 200)); });
  await w.loadFile(path.join(__dirname, '..', 'index.html'));
  await sleep(4000);
  const jb64 = fs.readFileSync(jsonPath).toString('base64'), zb64 = fs.readFileSync(zipPath).toString('base64');
  const js = (c) => w.webContents.executeJavaScript(c);
  await js(`window.__j = ${JSON.stringify(jb64)}; window.__z = ${JSON.stringify(zb64)}; true`);
  const fns = fs.readFileSync(path.join(__dirname, '_zip_fns.js'), 'utf8');
  const jd = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const eds = (jd.prior_damages || []).map((r, i) => ({ id: 'ed' + i, priorPhotoFile: r['사진 파일'] })).filter(e => e.priorPhotoFile);
  await js('window.__eds = ' + JSON.stringify(eds) + '; true');
  const r = await js(`(async () => {
    ${fns}
    const saved = []; const idbPutPhotoBlob = async (id, blob) => { saved.push([id, blob.size]); }; const genId = () => 'g';
    window.JSZip || (await new Promise((res) => setTimeout(res, 100)));
    const dec = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const zf = new File([dec(window.__z)], 'x.zip', { type: 'application/zip' });
    const pr = await priorImportPhotoZip(zf, window.__eds, 'x');
    return JSON.stringify({ pr, saved: saved.length, sizes: saved.slice(0, 3), jszip: typeof JSZip });
  })()`);
  console.log('result:', r);
  const st = await js(`(()=>{ const s = (typeof sites!=='undefined'?sites:[]).map(x=>({name:x.name, ed:(x.existingDamages||[]).length, withPhoto:(x.existingDamages||[]).filter(d=>(d.photos||[]).length).length, photos:(x.existingDamages||[]).reduce((a,d)=>a+(d.photos||[]).length,0)})); return JSON.stringify(s); })()`);
  console.log('sites:', st);
  console.log('errors:', logs.slice(0, 8));
  app.exit(0);
});
