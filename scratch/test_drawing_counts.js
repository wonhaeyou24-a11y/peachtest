/**
 * 클라우드 백업·불러오기 도면 수량 시험 — A. FEATURE TEST (v125)
 * 실행: node scratch/test_drawing_counts.js   (화면 동작은 실브라우저에서 따로 확인함)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };
function extractFn(header) {
  const i = html.indexOf(header); if (i < 0) throw new Error('없음: ' + header);
  let j = html.indexOf('{', html.indexOf(')', i)), depth = 0, k = j, str = null;
  for (; k < html.length; k++) {
    const c = html[k];
    if (str) { if (c.charCodeAt(0) === 92) { k++; continue; } if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return html.slice(i, k);
}
check('PS_BUILD v125 이상', /const PS_BUILD = 'v(12[5-9]|1[3-9]\d)'/.test(html));
check('도면 수는 도면 이미지를 받지 않고 id 만 읽음 (d0~d9, data->drawings->N->>id) — 시설물 데이터 전체를 받지 않는다', html.includes("const DRAW_ID_SELECT = Array.from({ length: 10 }, (_, i) => 'd' + i + ':data->drawings->' + i + '->>id').join(',');"));
check('① 불러오기 전 비교: 이 기기·클라우드 도면 수 + 이 기기에만 있는 도면 경고', html.includes("const drawLocalTxt = ' · 도면 ' + lDraw + '개';") && html.includes('onlyDraws') && html.includes("(onlyDraws ? '\\n⚠ 도면 ' + onlyDraws + '개' : '')"));
check('② 불러오기 완료 안내에 도면 수', html.includes("개 · 도면 ' + countLocalDrawings(newSites) + '개 · 기존손상 '"));
check('③ 클라우드 프로젝트 관리 목록에 도면 수', html.includes("' · 도면 ' + drawingCountText(drCnt[p.id] || 0, drCapped[p.id])") && html.includes("fetchAllRows('ps_facilities', 'id,project_id,' + DRAW_ID_SELECT)"));
check('④ 클라우드 백업 완료 보고서의 도면(올라간 수/기기 수)은 그대로', html.includes("' · 도면 ' + r.drawings[0] + '/' + r.drawings[1]"));
check('도면 수를 못 읽어도(오류) 불러오기 비교는 계속됨 (보조 정보)', html.includes('draw = null;') && html.includes("' · 도면 (확인 못 함)'"));

const scope = {};
const body = `${extractFn('function drawingsFromRow(')}\nconst drawingCountText = (n, capped)=> n + (capped ? '+' : '') + '개';\nreturn { drawingsFromRow, drawingCountText };`;
const t = new Function(body)();
const r3 = t.drawingsFromRow({ id: 'F', d0: 'a', d1: 'b', d2: 'c', d3: null });
check('도면 id 3개 → 3개, 10개 미만은 정확한 수', r3.ids.length === 3 && r3.capped === false && t.drawingCountText(3, false) === '3개');
const r10 = t.drawingsFromRow(Object.fromEntries([['id', 'F'], ...Array.from({ length: 10 }, (_, i) => ['d' + i, 'x' + i])]));
check('도면 10개 이상은 "10+개"로 표시 (더 있을 수 있음)', r10.ids.length === 10 && r10.capped === true && t.drawingCountText(10, true) === '10+개');
check('도면이 없으면 0개', t.drawingsFromRow({ id: 'F', d0: null }).ids.length === 0 && t.drawingCountText(0, false) === '0개');
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
