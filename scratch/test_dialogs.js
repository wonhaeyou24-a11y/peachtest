/**
 * 알림창·확인창 강조 시험 — A. FEATURE TEST (v126)
 * 실행: node scratch/test_dialogs.js   (화면 동작은 실브라우저에서 따로 확인함)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };
function skip(src, j) {
  let depth = 0, k = j, str = null, line = false, block = false;
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
  return k;
}
const fn = h => { const i = html.indexOf(h); if (i < 0) throw new Error('없음: ' + h); const j = html.indexOf('{', html.indexOf(')', i)); return html.slice(i, skip(html, j)); };
const constLine = n => { const i = html.indexOf('const ' + n + ' = '); if (i < 0) throw new Error('없음: ' + n); return html.slice(i, html.indexOf('\n', i)); };

// ---------------------------------------------------------------- 정적 확인
check('PS_BUILD v126 이상', /const PS_BUILD = 'v(12[6-9]|1[3-9]\d)'/.test(html));
check('confirm 호출이 모두 psConfirm(답을 기다리는 꾸밈 확인창)으로 바뀜 — 남은 기본 confirm 호출 0곳', (html.match(/(^|[^\w$.])confirm\(/gm) || []).length === 0);
check('psConfirm 호출 48곳은 모두 await 와 함께 (정의·안내 문구 외에 await 없는 호출 없음)', (html.match(/await psConfirm\(/g) || []).length === 48 && (html.match(/(^|[^\w$.])(?<!await )psConfirm\(/gm) || []).filter(x => true).length <= 3);
check('alert 는 꾸밈 창으로 대신하고 기다리지 않음(순서대로 한 줄씩)', html.includes('window.alert = function(msg){ psAlert(msg); };'));
check('시험·자동화가 window.confirm 을 바꿔 끼우면 그것을 그대로 씀', html.includes('if(window.confirm !== psNativeConfirm) return Promise.resolve(window.confirm(msg));'));
check('위험한 확인창은 "취소"에 기본 포커스, Esc 는 취소', html.includes("(conf && level === 'danger' && cancelBtn ? cancelBtn : okBtn).focus()") && html.includes("e.key === 'Escape'"));
check('대화상자는 진행 표시 창(100000)보다 위(100200)', html.includes('.psd-overlay{ position:fixed; inset:0; z-index:100200;'));

// ---------------------------------------------------------------- 실제 함수 실행
const a = html.indexOf('function psdEscape('), b = html.indexOf('const psdQueue = [];');
if (a < 0 || b < 0) throw new Error('대화상자 코드를 찾지 못함');
const body = `${constLine('PSD_DANGER')}
${constLine('PSD_WARN')}
${html.slice(a, b)}
return { psdEscape, psdEmph, psdLevelOf, psdFormat };`;
const t = new Function(body)();
const lv = (m, k) => t.psdLevelOf(m, k || 'alert');
check('수준: 지우기·되돌릴 수 없음 → danger', lv('이 기기에만 있는 지점 5개가 사라집니다.', 'confirm') === 'danger' && lv('완전히 삭제하면 되돌릴 수 없습니다. 계속할까요?', 'confirm') === 'danger');
check('수준: ⚠·실패·오류·확인되지 않음 → warn', lv('⚠ 백업이 확인되지 않았습니다') === 'warn' && lv('저장에 실패했습니다') === 'warn' && lv('아직 확인되지 않은 항목') === 'warn');
check('수준: 완료·✅ → ok (알림창), 보통 문장은 info', lv('✅ 클라우드 백업 완료') === 'ok' && lv('불러왔습니다') === 'ok' && lv('이름을 입력하세요') === 'info' && lv('교체할까요?', 'confirm') === 'info');
const f1 = t.psdFormat('⚠ 아래 항목은 확인되지 않았습니다.\n\n(올라간 수 / 기기에 있는 수)\n지점 4/9 · 사진 252/317 · 도면 3/3\n일반 문장입니다.');
check('줄 강조: ⚠ 줄은 경고 띠, 괄호 줄은 작은 안내, 빈 줄은 간격, 보통 줄은 그대로', f1.includes('psd-line psd-warn') && f1.includes('psd-line psd-muted') && f1.includes('psd-gap') && /<div class="psd-line">일반 문장입니다\.<\/div>/.test(f1));
check('이상 수치: 올라간 수 < 기기 수(4/9, 252/317)만 빨간 표시, 같은 수(3/3)는 그대로', f1.includes('<span class="psd-bad">4/9</span>') && f1.includes('<span class="psd-bad">252/317</span>') && !f1.includes('psd-bad">3/3') && f1.includes('3/3'));
const f2 = t.psdFormat('⚠ 지점 4개\n⚠ 사진 62장\n삭제하면 5개가 사라집니다.');
check('경고·위험 줄의 숫자+단위("4개", "62장", "5개")를 크게 강조', (f2.match(/psd-num/g) || []).length === 3 && f2.includes('<span class="psd-num">4개</span>') && f2.includes('<span class="psd-num">62장</span>'));
check('위험 줄은 빨간 띠(psd-danger)', t.psdFormat('지금 교체하면 이 내용은 프로젝트에서 사라집니다.').includes('psd-danger'));
const f3 = t.psdFormat('[확인] 먼저 백업한 뒤 교체 (추천)\n[취소] 백업하지 않고 다음 단계로');
check('[확인]/[취소] 선택 안내 줄은 굵게', f3.includes('psd-choice') && f3.includes('<b>[확인]</b>') && f3.includes('<b>[취소]</b>') && !f3.includes('psd-warn'));
check('흔한 단어(교체·없습니다)만으로는 경고 띠를 만들지 않음 (경고가 흔해지지 않게)', !t.psdFormat('교체할까요?').includes('psd-warn') && !t.psdFormat('복사할 이전 손상이 없습니다.').includes('psd-warn'));
check('HTML 이 섞인 글(지점 이름 등)은 그대로 글자로 표시 (스크립트 실행 불가)', t.psdFormat('<img src=x onerror=alert(1)> "A&B"').includes('&lt;img src=x onerror=alert(1)&gt; &quot;A&amp;B&quot;') && !t.psdFormat('<script>x</script>').includes('<script>'));
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
