/**
 * 갑작스런 종료 추적 시험 — A. FEATURE TEST (v112)
 * 실행: node scratch/test_crash_trace.js
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

function extract(src, header) {
  const i = src.indexOf(header); if (i < 0) throw new Error('없음: ' + header);
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0, k = j, str = null;
  for (; k < src.length; k++) {
    const c = src[k];
    if (str) { if (c.charCodeAt(0) === 92) { k++; continue; } if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

function run(prior) {
  const store = Object.assign({}, prior || {});
  const logs = [], listeners = {};
  const scope = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    diagLog: (c, m, d) => logs.push({ c, m, d }),
    document: { visibilityState: 'visible', addEventListener: (e, f) => { listeners['doc:' + e] = f; } },
    window: { addEventListener: (e, f) => { listeners['win:' + e] = f; } },
    console, JSON, Date, Object
  };
  const keys = html.match(/const PS_CRUMB_KEY = 'ps_last_crumb', PS_CLEAN_KEY = 'ps_clean_exit';/)[0];
  const src = keys + '\n' + extract(html, 'function psCrumb(') + '\n' + extract(html, 'function psInitCrashTrace(') + '\n psInitCrashTrace(); return { psCrumb };';
  const api = new Function(...Object.keys(scope), src)(...Object.values(scope));
  return { store, logs, listeners, api, scope };
}

// 1) 처음 실행: 로그 없음, 표시는 "화면 켜짐(0)"
let t = run();
check('처음 실행: 진단로그 없음, 종료 표시 0', t.logs.length === 0 && t.store.ps_clean_exit === '0');
// 2) 촬영 중 갑자기 종료 → 다음 실행에서 마지막 동작과 함께 기록
t.api.psCrumb('촬영 버튼', { mode: 'map', video: '1920x1080', photosOnMarker: 2 });
t = run(t.store);
check('화면이 켜진 채 끝났으면 "갑자기 종료" 로그 + 마지막 동작(촬영 버튼, 지도모드)', t.logs.length === 1 && /갑자기 종료/.test(t.logs[0].m) && t.logs[0].d.lastCrumb.a === '촬영 버튼' && t.logs[0].d.lastCrumb.mode === 'map' && t.logs[0].d.lastCrumb.video === '1920x1080', JSON.stringify(t.logs[0]));
// 3) 화면이 숨겨지며 끝남 → "마지막 동작" 로그(갑작스런 종료 표현 없음)
t = run(t.store);                     // 위에서 다시 켜졌으므로 표시는 0, 마지막 동작은 그대로
t.listeners['doc:visibilitychange'] && (t.scope.document.visibilityState = 'hidden');
t.listeners['doc:visibilitychange']();
check('화면이 숨겨지면 종료 표시 1', t.store.ps_clean_exit === '1');
t = run(t.store);
check('숨겨진 채 끝난 뒤 시작: "갑자기 종료"라고 하지 않고 마지막 동작만 기록', t.logs.length === 1 && !/갑자기/.test(t.logs[0].m) && t.logs[0].d.cleanExit === '1');
// 4) 다시 보이면 0, pagehide 는 1
t.scope.document.visibilityState = 'visible'; t.listeners['doc:visibilitychange']();
check('다시 보이면 표시 0', t.store.ps_clean_exit === '0');
t.listeners['win:pagehide']();
check('pagehide 에서 표시 1', t.store.ps_clean_exit === '1');
// 5) 저장소 사용 불가(사생활 보호 모드 등)에서도 오류 없이 동작
let ok = true;
try {
  const scope = { localStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, diagLog() {}, document: { visibilityState: 'visible', addEventListener() {} }, window: { addEventListener() {} }, JSON, Date, Object };
  const keys = html.match(/const PS_CRUMB_KEY = 'ps_last_crumb', PS_CLEAN_KEY = 'ps_clean_exit';/)[0];
  new Function(...Object.keys(scope), keys + '\n' + extract(html, 'function psCrumb(') + '\n' + extract(html, 'function psInitCrashTrace(') + '\n psInitCrashTrace(); psCrumb("a");')(...Object.values(scope));
} catch (e) { ok = false; }
check('localStorage 가 막혀 있어도 오류 없음', ok);

// 6) 촬영 흐름 연결 (기존 촬영 핸들러·보호 함수는 그대로)
check('촬영창 열림/닫힘을 관찰하고 메모리 상태를 함께 기록', /new MutationObserver\(\(\)=>\{[\s\S]*?psCrumb\('촬영창 열림'[\s\S]*?diagLogMemorySnapshot\('촬영창 열림/.test(html));
check('촬영 버튼은 capture 단계 리스너로 기록만 함 (기존 핸들러 유지)', /btnShoot\.addEventListener\('click', \(\)=>\{   \/\/ capture 단계에서 기록만[\s\S]*?\}, true\);/.test(html) && /btnShoot\.addEventListener\('click', async \(\)=>\{\n    if\(!mediaStream\) return;/.test(html));
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
