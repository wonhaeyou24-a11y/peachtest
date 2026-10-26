/**
 * 손상 입력 후 기록목록 갱신 시험 — A. FEATURE TEST (v114)
 * 실행: node scratch/test_record_list_refresh.js
 * (실제 화면 동작은 실브라우저에서 따로 확인: 칩을 누른 뒤 0.3초 안에 목록이 바뀌는지)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

check('PS_BUILD v114 이상', /const PS_BUILD = 'v(11[4-9]|1[2-9]\d)'/.test(html));
check('목록 갱신 도우미(짧게 모아서 한 번만 그림)', /let recordListRefreshTimer = null;\s*function scheduleRecordListRefresh\(\)\{\s*clearTimeout\(recordListRefreshTimer\);\s*recordListRefreshTimer = setTimeout\(\(\)=>\{ try\{ renderLog\(\); \}catch\(e\)\{\} \}, 120\);/.test(html));
check('손상 입력 화면을 다시 그릴 때(구분·부위·손상명 변경, 손상 추가·삭제) 목록 갱신', /function renderDamageRecords\(\)\{\s*if\(damageFormBuilt\) scheduleRecordListRefresh\(\);/.test(html));
check('처음 만들 때는 갱신하지 않음 (damageFormBuilt 표시)', /let damageFormBuilt = false;[\s\S]*?renderDamageRecords\(\);\s*damageFormBuilt = true;/.test(html));
check('부위 직접 입력도 목록 갱신', html.includes("partInput.addEventListener('change', ()=>{ d.component = partInput.value; scheduleRecordListRefresh(); saveState(); });"));
check('"저장하고 닫기"가 저장 뒤 목록을 새로 그림', /try\{ await saveState\(\); \}catch\(e\)\{\}\s*try\{ renderLog\(\); \}catch\(e\)\{\}/.test(html));
// 호출이 쓰이는 함수들은 모두 같은 범위에 있어야 한다 (오타·범위 오류 방지)
check('주 스크립트가 문법 오류 없이 컴파일됨', (() => { const m = html.match(/<script>\n\(function\(\)\{([\s\S]*)\}\)\(\);\n<\/script>/); try { new Function(m[1]); return true; } catch (e) { return false; } })());
// 보호 함수 본문은 그대로
let head = '';
try { head = require('child_process').execSync('git show HEAD:index.html', { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 28 }).toString('utf8'); } catch (e) {}
function extract(src, header) {
  const i = src.indexOf(header); if (i < 0) throw new Error('없음: ' + header);
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0, k = j, str = null;
  for (; k < src.length; k++) { const c = src[k]; if (str) { if (c.charCodeAt(0) === 92) { k++; continue; } if (c === str) str = null; continue; } if (c === '"' || c === "'" || c === '`') { str = c; continue; } if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}
if (head) ['async function storageGet(', 'async function idbDeleteInspectionPoint(', 'async function saveState(', 'async function performSaveState(', 'async function syncSingleEntity('].forEach(h => {
  try { check('보호 함수 본문 그대로: ' + h.replace(/^async function |\($/g, ''), extract(html, h) === extract(head, h)); } catch (e) { check('보호 함수: ' + h, false, e.message); }
});
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
