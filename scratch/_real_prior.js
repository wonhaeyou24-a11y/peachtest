/**
 * 전차자료 가져오기 시험 — A. FEATURE TEST (v174, 연결 설계안 Phase 1)
 * 실행: node scratch/test_prior_import.js
 * index.html 의 실제 함수(priorParseOrganized, priorFindSite, priorPlanImport, priorBuildDamage)를 꺼내
 * organized.json 형식의 시험 자료로 돌린다. 화면 동작(선택창·확인창·요약 카드)은 실브라우저에서 따로 확인함.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

function skip(src, j) {
  let depth = 0, k = j, str = null, line = false, block = false;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; k++; } continue; }
    if (str) { if (c === '\\') { k++; continue; } if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; continue; }
    if (c === '/' && n === '*') { block = true; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (depth === 0) { k++; break; } }
  }
  return k;
}
function extractFn(header) { const i = html.indexOf(header); if (i < 0) throw new Error('없음: ' + header); const j = html.indexOf('{', html.indexOf(')', i)); return html.slice(i, skip(html, j)); }
function extractConst(header) { const i = html.indexOf(header); if (i < 0) throw new Error('없음: ' + header); const j = html.indexOf('[', i + header.length - 1); return html.slice(i, skip(html, j)) + ';'; }

// ---------------------------------------------------------------- 실제 함수 시험
const src = [
  extractConst('const PRIOR_SPEC_MAP = ['),
  extractFn('function priorStr('), extractFn('function priorNormName('), extractFn('function priorStripInternal('), extractFn('function priorArr('),
  extractFn('function priorCircledNo('), extractFn('function priorDamagesFromCaptions('),
  extractFn('function priorParseOrganized('), extractFn('function priorFindSite('), extractFn('function priorPlanImport('), extractFn('function priorBuildDamage('),
  extractFn('function newExistingDamageId(')
].join('\n');
const ctx = { currentSiteId: null, existingDamages: [], String, Array, Object, Set };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.api = { priorParseOrganized, priorFindSite, priorPlanImport, priorBuildDamage, priorNormName };', ctx);
const api = ctx.api;


const real = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const parsed = api.priorParseOrganized(real, 'x.json');
console.log('parsed keys', Object.keys(parsed || {}));
console.log('ok', parsed && parsed.ok, 'damages', parsed && (parsed.damages || []).length, 'withPhoto', parsed && (parsed.damages || []).filter(d => d.priorPhotoFile).length);
console.log((parsed.damages || []).slice(0, 4).map(d => JSON.stringify({n: d.damageName, pos: d.priorPos || d.position, photo: d.priorPhotoFile, q: d.priorQty})).join('|'));

require('fs').writeFileSync(process.argv[3]||'_names.json', JSON.stringify((parsed.damages||[]).map(d=>d.priorPhotoFile)));
