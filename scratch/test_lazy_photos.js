/**
 * 사진을 필요할 때만 불러오기 시험 — A. FEATURE TEST (v117)
 * 실행: node scratch/test_lazy_photos.js
 * index.html 의 실제 도우미 함수를 꺼내 가짜 저장소로 돌린다. (화면 동작은 실브라우저에서 따로 확인함)
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
check('PS_BUILD v117 이상', /const PS_BUILD = 'v(11[7-9]|1[2-9]\d)'/.test(html));
const loadSiteSrc = extract(html, 'async function loadSite(');
check('시설물을 열 때(loadSite) 사진 전체를 메모리에 올리지 않음', !/await hydratePhotoBlobs\(markers\)/.test(loadSiteSrc));
check('기록목록 썸네일(카드·표)은 저장소에서 읽어 연결 (lazyThumb)', (html.match(/lazyThumb\(/g) || []).length >= 3);
check('촬영창 사진 줄은 저장소에서 읽어 연결', /setImgFromStore\(img, p\);\s*\/\/ 저장소의 사진을 바로 연결/.test(html));
check('지점 상세 사진 선택 줄 썸네일도 저장소에서 읽어 연결', html.includes('setImgFromStore(timg, tp);'));
check('주석 열기: 메모리에 없으면 먼저 읽어 온 뒤 엶', html.includes('if(!p.src){ ensurePhotoSrc(p).then(ok => { if(ok) openAnnotate(markerId, photoIndex); }); return; }'));
check('다운로드 버튼: 먼저 읽어 온 뒤 내려받음', html.includes("ensurePhotoSrc(p).then(ok => { if(ok) downloadDataUrl(p.src,"));
check('ZIP 내보내기: 기기 저장소의 파일을 그대로 담음 (photoBlobForExport)', html.includes('const zipBlob = await photoBlobForExport(p);'));
check('Word 내보내기: 지점 하나씩 사진을 올렸다 내려놓음', html.includes('const releaseMarkerPhotos = await hydrateMarkerTemporarily(m);') && html.includes('releaseMarkerPhotos();'));
check('팀원 자료 가져온 뒤 사진 받기: 저장소에 없는 사진만, 한 지점씩 받고 내려놓음', html.includes('for(const m of needHydrate){ const release = await hydrateMarkerTemporarily(m); release(); }'));
check('보이는지 판단하는 방식(IntersectionObserver)에 기대지 않음 (환경에 따라 동작하지 않아 사진이 안 뜰 수 있음)', !html.includes('new IntersectionObserver'));

// ---------------------------------------------------------------- 도우미 함수를 가짜 환경에서 실행
function build(state) {
  const calls = { idbGet: [], hydrate: [], created: [], revoked: [] };
  const scope = {
    idbGetPhotoBlob: async (ref) => { calls.idbGet.push(ref); return state.store[ref] ? { blob: state.store[ref] } : null; },
    hydratePhotoBlobs: async (markersArr) => {
      calls.hydrate.push(markersArr.map(m => m.id || '(임시)'));
      for (const m of markersArr) for (const p of (m.photos || [])) {
        const ref = p.photoRef || p.id;
        if (!p.src && state.store[ref]) { p.src = 'DATA-' + ref; p.blobExtracted = true; }
        else if (!p.src && state.legacy && state.legacy[ref]) { p.src = state.legacy[ref]; p.blobExtracted = true; }
      }
    },
    dataUrlToBlob: s => ({ fromDataUrl: s }),
    URL: { createObjectURL: b => { const u = 'blob:' + b.name; calls.created.push(u); return u; }, revokeObjectURL: u => calls.revoked.push(u) },
    activeMarkerId: state.activeMarkerId || null,
    setTimeout, Promise, console
  };
  const proxy = new Proxy(scope, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (k in globalThis ? globalThis[k] : () => undefined))) });
  const names = ['setImgFromStore', 'ensurePhotoSrc', 'photoBlobForExport', 'hydrateMarkerTemporarily', 'lazyThumb', '_pumpThumbs'];
  const queueDecl = 'const _thumbQueue = []; let _thumbActive = 0;';
  const asyncNames = ['setImgFromStore', 'ensurePhotoSrc', 'photoBlobForExport', 'hydrateMarkerTemporarily'];
  const body = `with(__p){ ${queueDecl}\n${names.map(n => extract(html, (asyncNames.includes(n) ? 'async function ' : 'function ') + n + '(')).join('\n')}\n return { ${names.join(', ')}, active: () => _thumbActive, queued: () => _thumbQueue.length }; }`;
  return { api: new Function('__p', body)(proxy), calls, scope };
}
// 가짜 <img>: src 가 정해지면 load 이벤트를 흉내 낸다
const mkImg = () => { const l = {}; return { src: '', addEventListener: (e, f) => { l[e] = f; }, fire: e => l[e] && l[e]() }; };
const blobOf = name => ({ name });

(async () => {
  // setImgFromStore
  let t = build({ store: { p1: blobOf('p1') } });
  let img = mkImg();
  let ok = await t.api.setImgFromStore(img, { id: 'p1' });
  check('setImgFromStore: 저장소의 파일을 blob 주소로 연결 (data URL 을 만들지 않음)', ok && img.src === 'blob:p1' && t.calls.hydrate.length === 0);
  img.fire('load');
  check('setImgFromStore: 다 불러온 뒤 blob 주소를 해제(누수 방지)', t.calls.revoked.includes('blob:p1'));
  const pMem = { id: 'p2', src: 'MEM-p2' }; img = mkImg();
  ok = await t.api.setImgFromStore(img, pMem);
  check('setImgFromStore: 이미 메모리에 있으면 그대로 사용', ok && img.src === 'MEM-p2' && t.calls.idbGet.length === 1);

  // 저장소에 없는 사진
  t = build({ store: {}, legacy: { old1: 'LEGACY-DATA' } });
  img = mkImg(); ok = await t.api.setImgFromStore(img, { id: 'gone', cloudRef: 'x/gone' });
  check('클라우드에만 있는 사진은 목록 썸네일에서 받아 오지 않음(상세 창에서 받음), 오류 없이 false', ok === false && t.calls.hydrate.length === 0 && img.src === '');
  img = mkImg(); const pOld = { id: 'old1' }; ok = await t.api.setImgFromStore(img, pOld);
  check('예전 방식(kv)으로만 저장된 사진은 불러오면서 연결 (사진이 안 뜨는 일 없음)', ok && img.src === 'LEGACY-DATA' && pOld.src === 'LEGACY-DATA');
  img = mkImg(); ok = await t.api.setImgFromStore(img, {});
  check('사진 번호가 없으면 오류 없이 false', ok === false);

  // ensurePhotoSrc
  t = build({ store: { a: blobOf('a') } });
  const pa = { id: 'a' };
  check('ensurePhotoSrc: 저장소에서 읽어 src 를 채움', (await t.api.ensurePhotoSrc(pa)) === true && pa.src === 'DATA-a');
  const pz = { id: 'zzz' };
  check('ensurePhotoSrc: 어디에도 없으면 false (오류 없음)', (await t.api.ensurePhotoSrc(pz)) === false);

  // photoBlobForExport
  t = build({ store: { a: blobOf('a') } });
  check('photoBlobForExport: 저장소의 원본 파일을 그대로 반환', (await t.api.photoBlobForExport({ id: 'a' })).name === 'a');
  check('photoBlobForExport: 저장소에 없으면 화면의 데이터를 사용', (await t.api.photoBlobForExport({ id: 'q', src: 'MEM-q' })).fromDataUrl === 'MEM-q');
  check('photoBlobForExport: 둘 다 없으면 null', (await t.api.photoBlobForExport({ id: 'q' })) === null);

  // hydrateMarkerTemporarily
  t = build({ store: { a: blobOf('a'), b: blobOf('b'), c: blobOf('c') }, activeMarkerId: 'OPEN' });
  const m1 = { id: 'm1', photos: [{ id: 'a' }, { id: 'b', src: 'MEM-b', blobExtracted: true }, { id: 'c' }] };
  const rel = await t.api.hydrateMarkerTemporarily(m1);
  check('hydrateMarkerTemporarily: 지점 사진이 올라옴', m1.photos[0].src === 'DATA-a' && m1.photos[2].src === 'DATA-c');
  rel();
  check('내려놓기: 새로 올린 사진(a,c)만 비우고 원래 메모리에 있던 사진(b)은 유지', !m1.photos[0].src && !m1.photos[2].src && m1.photos[1].src === 'MEM-b');
  const mOpen = { id: 'OPEN', photos: [{ id: 'a' }] };
  const rel2 = await t.api.hydrateMarkerTemporarily(mOpen); rel2();
  check('지금 열어 본 지점의 사진은 내려놓지 않음', mOpen.photos[0].src === 'DATA-a');
  const mNew = { id: 'mN', photos: [{ id: 'fresh', src: 'MEM-fresh' }] };
  const rel3 = await t.api.hydrateMarkerTemporarily(mNew); rel3();
  check('방금 찍은 사진(이미 메모리에 있음)은 건드리지 않음', mNew.photos[0].src === 'MEM-fresh');
  const mNoFlag = { id: 'mF', photos: [{ id: 'nofile' }] };
  const rel4 = await t.api.hydrateMarkerTemporarily(mNoFlag); rel4();
  check('저장소에서 못 읽은 사진은 아무 것도 지우지 않음', !('src' in mNoFlag.photos[0]) || !mNoFlag.photos[0].src);

  // lazyThumb: 3개씩 차례로
  t = build({ store: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['t' + i, blobOf('t' + i)])) });
  let maxActive = 0; const imgs = Array.from({ length: 10 }, mkImg);
  const orig = t.api.lazyThumb;
  imgs.forEach((im, i) => orig(im, { id: 't' + i }));
  maxActive = Math.max(maxActive, t.api.active());
  await new Promise(r => setTimeout(r, 50));
  check('lazyThumb: 한 번에 최대 3개씩만 읽음 (수백 개 지점도 한꺼번에 읽지 않음)', maxActive <= 3, `동시 ${maxActive}`);
  check('lazyThumb: 10개 모두 결국 연결됨', imgs.every((im, i) => im.src === 'blob:t' + i), imgs.map(i => i.src).join(','));
  check('lazyThumb: 메모리에 있는 사진은 바로 연결', (() => { const im = mkImg(); orig(im, { id: 'x', src: 'MEM-x' }); return im.src === 'MEM-x'; })());

  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('시험 중단:', e); process.exit(2); });
