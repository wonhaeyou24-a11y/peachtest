/**
 * 10분 사진 자동 업로드의 메모리 사용 시험 — A. FEATURE TEST (v116)
 * 실행: node scratch/test_upload_memory.js
 * index.html 의 실제 uploadPendingPhotosForProject 본문을 꺼내 가짜 Supabase·가짜 사진 저장소로 돌린다.
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

function extract(src, header) {
  const i = src.indexOf(header); if (i < 0) throw new Error('없음: ' + header);
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0, k = j, str = null, line = false, block = false;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; k++; } continue; }
    if (str) { if (c.charCodeAt(0) === 92) { k++; continue; } if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; continue; }
    if (c === '/' && n === '*') { block = true; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

// ---------------------------------------------------------------- 정적 확인
check('PS_BUILD v116 이상', /const PS_BUILD = 'v(11[6-9]|1[2-9]\d)'/.test(html));
const fnSrc = extract(html, 'async function uploadPendingPhotosForProject(');
check('올릴 사진이 있는 지점만 불러옴 (pendingMarkers)', fnSrc.includes('const pendingMarkers = (s.markers || []).filter(m => (m.photos || []).some(ph => !ph.cloudRef));') && fnSrc.includes('if(!pendingMarkers.length) continue;'));
check('올릴 것이 없는 시설물에서는 hydratePhotoBlobs 를 부르지 않음 (continue 가 그 앞)', fnSrc.indexOf('if(!pendingMarkers.length) continue;') < fnSrc.indexOf('await hydratePhotoBlobs(pendingMarkers);'));

// ---------------------------------------------------------------- 실제 함수를 가짜 환경에서 실행
function build(state) {
  const calls = { hydrate: [], upload: [], index: 0, requeue: [] };
  const scope = {
    supabaseClient: {
      storage: { from: () => ({ upload: async (pth) => { calls.upload.push(pth); return { error: state.uploadFail ? { message: 'x' } : null }; } }) },
      from: () => ({ upsert: async () => { calls.index++; return {}; } })
    },
    supabaseSession: { user: { id: 'me' } },
    navigator: { onLine: true },
    sites: state.sites, activeMarkerId: state.activeMarkerId || null,
    genId: () => 'gen' + Math.random().toString(36).slice(2, 7),
    dataUrlToBlob: s => ({ type: 'image/jpeg', size: String(s).length, src: s }),
    // 안전 저장소에서 읽어 오는 것을 흉내: 저장소에 있는 사진은 src 를 채우고 blobExtracted 로 표시한다
    hydratePhotoBlobs: async (markersArr) => {
      calls.hydrate.push((markersArr || []).map(m => m.id));
      for (const m of markersArr) for (const p of (m.photos || [])) if (!p.src && state.store[p.id]) { p.src = state.store[p.id]; p.blobExtracted = true; }
    },
    queueEntitySyncForFacility: s => calls.requeue.push(s.id),
    processSyncQueue: async () => {}, saveState: async () => {}, console
  };
  const proxy = new Proxy(scope, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (k in globalThis ? globalThis[k] : () => undefined))), set: (t, k, v) => { t[k] = v; return true; } });
  const fn = new Function('__p', `with(__p){ ${fnSrc}\n return uploadPendingPhotosForProject; }`)(proxy);
  return { fn, calls, scope };
}
const mkPhoto = (id, o = {}) => ({ id, ...o });
const countSrc = sites => sites.reduce((a, s) => a + s.markers.reduce((b, m) => b + m.photos.filter(p => p.src).length, 0), 0);

(async () => {
  // (a) 모든 사진이 이미 클라우드에 있음 → 불러오지 않음 (예전: 300장을 전부 메모리에 올림)
  const mk = (n, prefix, o) => Array.from({ length: n }, (_, i) => ({ id: prefix + 'm' + i, photos: [mkPhoto(prefix + 'p' + i, { cloudRef: 'me/' + prefix + i, ...(o || {}) })] }));
  let state = { sites: [{ id: 'A', projectId: 'P', markers: mk(150, 'a') }, { id: 'B', projectId: 'P', markers: mk(150, 'b') }], store: {} };
  for (const s of state.sites) for (const m of s.markers) state.store[m.photos[0].id] = 'DATA-' + m.photos[0].id;
  let t = build(state);
  let r = await t.fn({ id: 'P', organizationId: null });
  check('(a) 올릴 사진이 없으면 hydratePhotoBlobs 를 한 번도 안 부르고 사진 300장이 메모리에 올라가지 않음', r.ok && t.calls.hydrate.length === 0 && countSrc(state.sites) === 0 && t.calls.upload.length === 0, `hydrate ${t.calls.hydrate.length}회, 메모리 사진 ${countSrc(state.sites)}장`);

  // (b) 올릴 사진이 일부만 있음 → 그 지점만 불러오고, 올린 뒤 메모리에서 내려놓음
  state = { sites: [{ id: 'A', projectId: 'P', markers: mk(100, 'a') }, { id: 'B', projectId: 'P', markers: mk(100, 'b') }], store: {} };
  const pend1 = { id: 'bNEW1', photos: [mkPhoto('bNEW1p')] }, pend2 = { id: 'aNEW1', photos: [mkPhoto('aNEW1p')] };
  state.sites[1].markers.push(pend1); state.sites[0].markers.push(pend2);
  state.store['bNEW1p'] = 'DATA-b'; state.store['aNEW1p'] = 'DATA-a';
  t = build(state);
  r = await t.fn({ id: 'P', organizationId: null });
  check('(b) 올릴 사진이 있는 지점 2개만 불러옴 (200개 지점은 안 불러옴)', JSON.stringify(t.calls.hydrate.map(h => h.join(',')).sort()) === JSON.stringify(['aNEW1', 'bNEW1']), JSON.stringify(t.calls.hydrate));
  check('(b) 올릴 사진 2장이 실제로 업로드되고 cloudRef 가 붙음', t.calls.upload.length === 2 && !!pend1.photos[0].cloudRef && !!pend2.photos[0].cloudRef && r.uploadedCount === 2, JSON.stringify(t.calls.upload));
  check('(b) 올린 뒤 이 함수가 불러온 사진은 메모리에서 내려놓음 (메모리 사진 0장)', countSrc(state.sites) === 0, `${countSrc(state.sites)}장`);
  check('(b) 지점 데이터에 cloudRef 를 싣도록 시설물 재큐잉', t.calls.requeue.sort().join() === 'A,B');

  // (c) 원래 메모리에 있던 사진 / 방금 찍은 사진은 건드리지 않음
  state = { sites: [{ id: 'A', projectId: 'P', markers: [] }], store: { oldp: 'DATA-old' } };
  const hadSrc = { id: 'm1', photos: [mkPhoto('oldp', { src: 'MEM-old', blobExtracted: true })] };
  const fresh = { id: 'm2', photos: [mkPhoto('freshp', { src: 'MEM-fresh', blobExtracted: true })] };
  state.sites[0].markers.push(hadSrc, fresh);
  t = build(state);
  r = await t.fn({ id: 'P', organizationId: null });
  check('(c) 이미 메모리에 있던 사진과 방금 찍은 사진은 올린 뒤에도 메모리에 그대로 남음', hadSrc.photos[0].src === 'MEM-old' && fresh.photos[0].src === 'MEM-fresh' && r.uploadedCount === 2, JSON.stringify([hadSrc.photos[0].src, fresh.photos[0].src]));

  // (d) 업로드가 실패하면 cloudRef 가 안 붙고 다음에 다시 시도 (사진은 지워지지 않음: 안전 저장소에 그대로)
  state = { sites: [{ id: 'A', projectId: 'P', markers: [{ id: 'm1', photos: [mkPhoto('p1')] }] }], store: { p1: 'DATA-1' }, uploadFail: true };
  t = build(state);
  r = await t.fn({ id: 'P', organizationId: null });
  check('(d) 업로드 실패: cloudRef 없음(다음에 재시도), 사진 데이터는 저장소에 그대로, 메모리는 비움', !state.sites[0].markers[0].photos[0].cloudRef && state.store.p1 === 'DATA-1' && !state.sites[0].markers[0].photos[0].src && r.uploadedCount === 0);

  // (e) 안전 저장소에서 못 읽은 사진(blobExtracted 아님)은 비우지도, 올리지도 않음
  state = { sites: [{ id: 'A', projectId: 'P', markers: [{ id: 'm1', photos: [mkPhoto('ghost', { src: undefined })] }] }], store: {} };
  t = build(state);
  r = await t.fn({ id: 'P', organizationId: null });
  check('(e) 저장소에 없는 사진은 업로드를 시도하지 않고 오류 없이 지나감', r.ok && t.calls.upload.length === 0);

  // (f) 지금 열어 보고 있는 지점의 사진은 올린 뒤에도 메모리에 둠
  state = { sites: [{ id: 'A', projectId: 'P', markers: [{ id: 'open1', photos: [mkPhoto('o1')] }, { id: 'other', photos: [mkPhoto('o2')] }] }], store: { o1: 'DATA-o1', o2: 'DATA-o2' }, activeMarkerId: 'open1' };
  t = build(state);
  r = await t.fn({ id: 'P', organizationId: null });
  const [mo, mx] = state.sites[0].markers;
  check('(f) 지금 보고 있는 지점(open1)의 사진은 유지하고 다른 지점 사진만 비움', mo.photos[0].src === 'DATA-o1' && !mx.photos[0].src && r.uploadedCount === 2, JSON.stringify([mo.photos[0].src, mx.photos[0].src]));

  // 다른 프로젝트의 시설물은 건드리지 않음
  state = { sites: [{ id: 'A', projectId: 'P', markers: [] }, { id: 'Z', projectId: 'OTHER', markers: [{ id: 'z', photos: [mkPhoto('zp')] }] }], store: { zp: 'D' } };
  t = build(state);
  await t.fn({ id: 'P', organizationId: null });
  check('다른 프로젝트의 시설물은 불러오지도 올리지도 않음', t.calls.hydrate.length === 0 && t.calls.upload.length === 0);

  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('시험 중단:', e); process.exit(2); });
