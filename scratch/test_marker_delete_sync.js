/**
 * 지점 삭제가 클라우드에 반영되는지 시험 — A. FEATURE TEST (v112)
 * 실행: node scratch/test_marker_delete_sync.js
 * index.html 에서 실제 함수 본문(syncSingleEntity 등)을 꺼내 가짜 Supabase 로 돌린다.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let fail = 0;
function check(name, ok, detail) { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`); if (!ok) fail++; }

// 함수 본문 꺼내기 (중괄호 짝 맞추기; 문자열·주석 안의 중괄호는 무시)
function extract(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('함수를 찾지 못함: ' + header);
  let j = src.indexOf('{', src.indexOf(')', i));
  let depth = 0, k = j, str = null, line = false, block = false;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; k++; } continue; }
    if (str) { if (c === '\\') { k++; continue; } if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; continue; }
    if (c === '/' && n === '*') { block = true; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

// ---------------------------------------------------------------- 1) 정적 확인
check('PS_BUILD v112', html.includes("const PS_BUILD = 'v112'"));
check('service-worker 캐시 이름도 v112', /point-shot-v112-/.test(fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8')));
check('deleteMarker 가 삭제를 클라우드 큐에 넣음', /idbDeleteInspectionPoint\(markerId, false\)[^\n]*\n\s*try\{ queueMarkerDeleteSync\(m\); \}catch\(e\)\{\}/.test(html));
check('Ctrl+Z "찍기 취소" 도 삭제를 큐에 넣음', /idbDeleteInspectionPoint\(action\.markerId, true\)[^\n]*\n\s*try\{ queueMarkerDeleteSync\(m\); \}catch\(e\)\{\}/.test(html));
check('pull 3곳이 삭제 표시된 지점을 받지 않음', (html.match(/from\('ps_inspection_points'\)\.select\('\*'\)\.eq\('project_id', (cloudProjectId|targetProjId)\)\.is\('deleted_at', null\)/g) || []).length === 3);
check('클라우드 행을 읽을 때 deleted_at 도 읽음', html.includes("'revision, data, user_id, project_id, facility_id, deleted_at'"));

// 보호 함수 본문은 그대로인지 (git HEAD 와 비교)
let headHtml = '';
try { headHtml = execSync('git show HEAD:index.html', { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 28 }).toString('utf8'); } catch (e) { headHtml = ''; }
if (headHtml) {
  ['async function storageGet(', 'async function storageSet(', 'async function idbDeleteInspectionPoint(', 'async function idbPutInspectionPoint(',
   'async function saveState(', 'function queueCloudSync(', 'async function enqueueEntitySync(', 'function mergeEntityIntoQueue('].forEach(h => {
    let a, b;
    try { a = extract(html, h); b = extract(headHtml, h); } catch (e) { check('보호 함수 존재: ' + h, false, e.message); return; }
    check('보호 함수 본문 그대로: ' + h.replace(/^async function |\($/g, ''), a === b);
  });
} else { check('git HEAD 와 비교 (git 없음 — 건너뜀)', true); }

// ---------------------------------------------------------------- 2) syncSingleEntity 를 가짜 Supabase 로 실행
const needed = ['stableSyncStringify', 'sameSyncedContent', 'stripPhotoHeavyFields', 'findTrashedMarker', 'queueMarkerDeleteSync'];
const fnSrc = {};
needed.forEach(n => { fnSrc[n] = extract(html, 'function ' + n + '('); });
const volatile = html.match(/const SYNC_VOLATILE_KEYS = new Set\(\[[\s\S]*?\]\);/)[0];
const syncSrc = extract(html, 'async function syncSingleEntity(');

function build(state) {
  const calls = { upsert: [], update: [], enqueue: [] };
  const rows = state.rows || {};
  const chain = (table) => {
    const q = { filter: {} };
    const api = {
      select() { return api; },
      eq(k, v) { q.filter[k] = v; return api; },
      in() { return api; },
      maybeSingle: async () => ({ data: rows[q.filter.id] || null, error: null }),
      upsert: async (row) => { calls.upsert.push({ table, row }); return { error: null }; },
      update(obj) { return { eq: async (k, v) => { calls.update.push({ table, obj, k, v }); return { error: null }; } }; }
    };
    return api;
  };
  const scope = {
    supabaseClient: { from: chain }, supabaseSession: { user: { id: 'me' } },
    sites: state.sites || [], projects: [{ id: 'P', organizationId: null }], trash: state.trash || [],
    currentProjectId: 'P', currentSiteId: 'F', lastQueuedEntitySignatures: state.sigs || new Map(),
    diagLog() {}, getOrCreateDeviceId: () => 'dev', iOwnFacility: () => true,
    enqueueEntitySync: async (x) => { calls.enqueue.push(x); },
    console
  };
  const proxy = new Proxy(scope, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (k in globalThis ? globalThis[k] : (k === 'undefined' ? undefined : () => undefined)))) });
  const body = `with(__p){ ${volatile}\n${Object.values(fnSrc).join('\n')}\n${syncSrc}\n return { syncSingleEntity, queueMarkerDeleteSync, findTrashedMarker }; }`;
  const api = new Function('__p', body)(proxy);
  return { api, calls, scope };
}

const marker = { id: 'm9', num: 9, xPct: 66, yPct: 75, drawingId: 'D', revision: 2, createdBy: 'me', locationSource: 'manual', photos: [{ id: 'ph1', note: '메모' }] };
const cloudRow = (extra) => ({ id: 'm9', revision: 2, data: { ...marker }, user_id: 'me', project_id: 'P', facility_id: 'F', deleted_at: null, ...extra });
const item = (op) => ({ entityType: 'inspection_point', entityId: 'm9', operation: op, projectId: 'P', facilityId: 'F', revision: 2, payload: op === 'delete' ? null : { id: 'm9' } });

(async () => {
  // (a) 삭제 작업 + 휴지통에 지점이 있음 → 내용 그대로 + deleted_at
  let t = build({ sites: [{ id: 'F', projectId: 'P', markers: [] }], trash: [{ type: 'marker', data: { ...marker }, deletedAt: 'x' }], rows: { m9: cloudRow() } });
  let r = await t.api.syncSingleEntity(item('delete'), null);
  check('삭제 작업(휴지통에 지점 있음): 성공', r && r.ok, JSON.stringify(r));
  let up = t.calls.upsert[0] && t.calls.upsert[0].row;
  check('삭제 표시(deleted_at)가 기록됨', up && !!up.deleted_at);
  check('내용이 비지 않음: 번호 9, 위치 66/75, 사진 1장 유지', up && up.num === 9 && up.x === 66 && up.y === 75 && up.data && up.data.photos && up.data.photos.length === 1, JSON.stringify(up && { num: up.num, x: up.x, y: up.y, photos: up.data && up.data.photos && up.data.photos.length }));
  check('행을 새로 만들지 않고 같은 id 에 기록 (id m9)', up && up.id === 'm9');

  // (b) 삭제 작업 + 휴지통에서도 못 찾음 → 내용은 건드리지 않고 deleted_at 만
  t = build({ sites: [{ id: 'F', projectId: 'P', markers: [] }], trash: [], rows: { m9: cloudRow() } });
  r = await t.api.syncSingleEntity(item('delete'), null);
  check('삭제 작업(휴지통에도 없음): 성공, upsert 없이 deleted_at 만 update', r && r.ok && t.calls.upsert.length === 0 && t.calls.update.length === 1 && !!t.calls.update[0].obj.deleted_at && Object.keys(t.calls.update[0].obj).sort().join() === 'deleted_at,updated_at,updated_by', JSON.stringify(t.calls.update));

  // (c) 복원: 지점이 markers 에 있고 클라우드 행이 삭제 표시 + 내용 같음 → 건너뛰지 않고 deleted_at 해제
  t = build({ sites: [{ id: 'F', projectId: 'P', markers: [{ ...marker }] }], rows: { m9: cloudRow({ deleted_at: '2026-10-26T08:00:00Z' }) } });
  r = await t.api.syncSingleEntity(item('upsert'), null);
  up = t.calls.upsert[0] && t.calls.upsert[0].row;
  check('복원(클라우드에 삭제 표시 있음): 건너뛰지 않고 올림', r && r.ok && !r.skipped && up, JSON.stringify(r));
  check('복원: 올린 행의 deleted_at 이 비워짐', up && up.deleted_at === null);

  // (d) 회귀: 삭제 표시가 없고 내용이 같으면 예전처럼 건너뜀
  t = build({ sites: [{ id: 'F', projectId: 'P', markers: [{ ...marker }] }], rows: { m9: cloudRow() } });
  r = await t.api.syncSingleEntity(item('upsert'), null);
  check('회귀: 삭제 표시 없고 내용 같으면 건너뜀 (불필요한 업로드 없음)', r && r.ok && r.skipped && t.calls.upsert.length === 0, JSON.stringify(r));

  // (e) 큐 넣기: 내 지점 → 삭제 작업, 팀원 지점 → 안 넣음, 서명 지움
  const sigs = new Map([['inspection_point:m9', 'old-sig']]);
  t = build({ sigs, sites: [{ id: 'F', projectId: 'P', markers: [] }] });
  t.api.queueMarkerDeleteSync({ ...marker });
  check('내 지점 삭제 → 클라우드 삭제 작업이 큐에 들어감 (operation=delete, 종류=inspection_point)', t.calls.enqueue.length === 1 && t.calls.enqueue[0].operation === 'delete' && t.calls.enqueue[0].entityType === 'inspection_point' && t.calls.enqueue[0].entityId === 'm9' && t.calls.enqueue[0].projectId === 'P' && t.calls.enqueue[0].facilityId === 'F');
  check('복원 때 다시 올라가도록 "마지막 큐 내용 서명"이 지워짐', !sigs.has('inspection_point:m9'));
  t = build({ sites: [] });
  t.api.queueMarkerDeleteSync({ ...marker, createdBy: 'teammate' });
  check('팀원이 만든 지점은 큐에 넣지 않음 (기존 규칙 유지)', t.calls.enqueue.length === 0);
  t.api.queueMarkerDeleteSync(null);
  check('빈 값을 넘겨도 오류 없이 무시', t.calls.enqueue.length === 0);

  // (f) 휴지통 찾기: 현재 휴지통 / 시설물 휴지통
  t = build({ trash: [{ type: 'marker', data: { id: 'a' } }, { type: 'photo', data: { id: 'b' } }], sites: [{ id: 'F', trash: [{ type: 'marker', data: { id: 'c' } }] }] });
  check('휴지통에서 지점 찾기: 현재 휴지통(a), 시설물 휴지통(c), 사진(b)·없는 것(z)은 null', t.api.findTrashedMarker('a').id === 'a' && t.api.findTrashedMarker('c').id === 'c' && t.api.findTrashedMarker('b') === null && t.api.findTrashedMarker('z') === null);

  console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('시험 중단:', e); process.exit(2); });
