/**
 * 현장시험 계산 모듈(fieldTests.js) 시험 — 사용자 부록 엑셀(04-3~04-9)의 입력값/엑셀 계산 결과와 한 행씩 대조
 * 실행: node scratch/desk-port/test_fieldTests.js
 * 대조 자료: scratch/fixtures/{field_tests_samples,rebound_samples,conc_samples,soil_samples}.json
 */
const fs = require('fs');
const path = require('path');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };
const api = require('./fieldTests.js');
{
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'field_tests_samples.json'), 'utf8'));
const close = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

// ---- 탄산화 (엑셀: H=F-G, J=G/√공용년수, K=(H/J)²(100 초과면 "100년 이상"), L=등급, M=ROUND(F²/J²-년수))
let n = 0, bad = [];
fx.carbonation.forEach(s => s.rows.forEach(r => {
  const o = api.ftCarbonationRow({ cover: r.cover, depth: r.depth }, s.age);
  n++;
  const e = r.exp;
  if (!close(o.remain, e.remain) || !close(o.speed, e.speed) || !close(o.life, e.life) || o.grade !== e.grade || (e.reach != null && !close(o.reach, e.reach))) bad.push(s.sheet + ' ' + JSON.stringify([r, o]));
}));
check('탄산화: 엑셀 계산 결과와 ' + n + '행 모두 일치 (잔여깊이·속도계수·잔존수명·등급·도달시간)', n > 0 && !bad.length, bad[0]);
const c0 = api.ftCarbonationRow({ cover: 44, depth: 0 }, 11);
check('탄산화: 깊이 0이면 속도계수 0 · 잔존수명 100년 이상 · 오류 없음', c0.speed === 0 && c0.life === '100년 이상' && c0.reach === null);
check('탄산화: 경과년수를 안 넣으면 잔여깊이·등급만 계산', (() => { const o = api.ftCarbonationRow({ cover: 40, depth: 12 }, ''); return o.remain === 28 && o.grade === 'b' && o.speed === null; })());
check('탄산화: 입력이 비면 계산하지 않음', api.ftCarbonationRow({ cover: '', depth: '' }, 11).remain === null);
check('탄산화 등급 경계: 잔여 30.0 → a, 10.0 → c(10 초과 아님), 0 → d, 음수 → FALSE', api.ftCarbonationRow({ cover: 40, depth: 10 }, 11).grade === 'a' && api.ftCarbonationRow({ cover: 20, depth: 10 }, 11).grade === 'c' && api.ftCarbonationRow({ cover: 5, depth: 5 }, 11).grade === 'd' && api.ftCarbonationRow({ cover: 5, depth: 6 }, 11).grade === 'FALSE');

// ---- 계획선형오차 (엑셀: E=금회-기준, F=노출높이×RADIANS(E), G=SIN(RADIANS(E))×100, H=진행성별 기준표)
n = 0; bad = []; let gap = 0;
fx.alignment.forEach(s => s.rows.forEach(r => {
  const o = api.ftAlignmentRow({ height: r.height, base: r.base, now: r.now, progress: r.progress });
  n++;
  const e = r.exp;
  if (!close(o.dev, e.dev) || !close(o.disp, e.disp) || !close(o.err, e.err)) { bad.push(s.sheet + ' 수치 ' + JSON.stringify([r, o])); return; }
  if (e.grade === 0 || e.grade === '0') { gap++; return; }   // 엑셀이 틈(경계 구간)에서 0 을 돌려준 행 — 아래에서 따로 확인
  if (o.grade !== e.grade) bad.push(s.sheet + ' 등급 ' + JSON.stringify([r, o]));
}));
check('계획선형오차: 엑셀 결과와 ' + n + '행 일치 (편차·변위·선형오차·평가' + (gap ? ', 엑셀이 0을 낸 틈 ' + gap + '행 제외' : '') + ')', n > 0 && !bad.length, bad[0]);
check('계획선형오차: 평가 경계 — 비진행성 오차 2% 이상 b, 6% 이상 e / 진행성 1% 이상 b, 4% 이상 e(엑셀의 4~6% 틈 없이 계산)', (() => {
  const e = pct => ({ progress: '비진행성' }), g = (prog, err) => { const deg = Math.asin(err / 100) * 180 / Math.PI; return api.ftAlignmentRow({ height: 1000, base: 0, now: deg, progress: prog }).grade; };
  return g('비진행성', 1.99) === 'a' && g('비진행성', 2.01) === 'b' && g('비진행성', 6.01) === 'e' && g('진행성', 0.99) === 'a' && g('진행성', 1.01) === 'b' && g('진행성', 4.5) === 'e';
})());
check('계획선형오차: 기준치가 없으면(전차 값 없음) 계산하지 않음', api.ftAlignmentRow({ height: 4500, base: '-', now: 89.3 }).err === null);

// ---- 수준측량 (엑셀: D=b-a, E=D×100, G=구조·진행성별 기준표)
n = 0; bad = []; gap = 0;
fx.leveling.forEach(s => s.rows.forEach(r => {
  const o = api.ftLevelingRow({ design: r.design, measured: r.measured, progress: r.progress }, s.set);
  n++;
  const e = r.exp;
  if (!close(o.d, e.d) || !close(o.settle, e.settle)) { bad.push(s.sheet + ' 수치 ' + JSON.stringify([r, o])); return; }
  if (e.grade === 0 || e.grade === '0') { gap++; return; }
  if (o.grade !== e.grade) bad.push(s.sheet + ' 등급 ' + JSON.stringify([r, o, e]));
}));
check('수준측량: 엑셀 결과와 ' + n + '행 일치 (b-a·침하량·평가등급' + (gap ? ', 엑셀이 0을 낸 행 ' + gap + '건 제외' : '') + ')', n > 0 && !bad.length, bad[0]);
check('수준측량 경계: 보강토(2) 비진행성 5cm 미만 a·5 이상 b·30 이상 e / 콘크리트(1) 비진행성 16 이상 e', (() => {
  const g = (set, prog, cm) => api.ftLevelingRow({ design: 100, measured: 100 + cm / 100, progress: prog }, set).grade;
  return g('2', '비진행성', 4.9) === 'a' && g('2', '비진행성', 5.1) === 'b' && g('2', '비진행성', -31) === 'e' && g('1', '비진행성', 16.5) === 'e' && g('1', '진행성', 2.5) === 'b';
})());

// ---- 붙여넣기
const pr = api.ftParsePaste('alignment', 'STA. 20m\t4625\t89.4\t88.8\nSTA. 40m  5125  89.3  89.7\n\n');
check('붙여넣기: 탭/공백 구분 줄을 행으로 (열 순서 측점·노출높이·기준치·금회)', pr.length === 2 && pr[0].pos === 'STA. 20m' && pr[0].height === '4625' && pr[0].base === '89.4' && pr[0].now === '88.8' && pr[0].progress === '비진행성' && pr[1].now === '89.7');
const pl = api.ftParsePaste('leveling', '20\t235.7\t235.687');
check('붙여넣기: 수준측량(구간·설계치·금회 측량)', pl.length === 1 && pl[0].design === '235.7' && pl[0].measured === '235.687');


}
{
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'rebound_samples.json'), 'utf8'));
const close = (a, b, tol) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(a), Math.abs(b)));

// ---- 콘크리트·보강토옹벽 반발경도: 엑셀 한 지점(20점)씩
let n = 0, bad = [];
fx.wall.forEach(w => {
  const e = w.exp;
  if (typeof e.R !== 'number' || !(e.R > 0)) return;   // 시험 값이 아직 없는 지점
  const age = String(w.age).replace(/[^0-9]/g, '') || 3000;
  const o = api.ftReboundWall({ readings: w.readings, angle: w.angle, wet: w.wet, age, design: w.design });
  n++;
  const pairs = [['R', o.R, e.R], ['excluded', o.excluded, e.excluded], ['dR1', o.dR1, e.dR1], ['Ro', o.Ro, e.Ro], ['FcMat', o.FcMat, e.FcMat], ['FcArc', o.FcArc, e.FcArc], ['alpha', o.alpha, e.alpha], ['estMat', o.estMat, e.estMat], ['estArc', o.estArc, e.estArc], ['ratioArc', o.ratioArc, e.ratioArc], ['ratioMat', o.ratioMat, e.ratioMat]];
  const diff = pairs.filter(([, a, b]) => typeof b === 'number' ? !close(a, b) : false);
  if (diff.length) bad.push(w.sheet + ' ' + w.name + ' → ' + diff.map(([k, a, b]) => k + ' 앱 ' + a + ' / 엑셀 ' + b).join(', '));
});
check('콘크리트·보강토옹벽: 엑셀과 ' + n + '개 지점 일치 (평균치·제외 개수·타각보정·Ro·두 식 압축강도·재령계수·추정강도·강도비)', n > 0 && !bad.length, bad.slice(0, 3).join(' // '));
check('타각 보정: 0° 는 보정 없음, ±90°·±45° 는 보정표 사용, 지원하지 않는 각도는 계산하지 않음', api.ftWallDeltaR(43.45, 0) === 0 && api.ftWallDeltaR(43.45, -90) > 0 && api.ftWallDeltaR(43.45, 90) < 0 && api.ftWallDeltaR(43.45, 30) === null && api.ftWallDeltaR(15, 90) === null);
check('재령계수: 28일 1.00, 2700일 이상 0.63, 4일 미만은 표에 없음', api.ftWallAge(28) === 1 && api.ftWallAge(3000) === 0.63 && api.ftWallAge(3) === null && api.ftWallAge(150) === 0.74);
const edge = api.ftReboundWall({ readings: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 48, 32, 52, 28], angle: 0, age: 3000, design: 24 });
check('20% 범위 밖 값 제외: 평균 40 기준 28·52는 제외, 경계값 32(-20%)·48(+20%)은 포함', edge.excluded === 2 && edge.n === 20, JSON.stringify(edge.excluded));
check('입력이 모자라면(2개 미만) 계산하지 않음', api.ftReboundWall({ readings: [40] }).R === null);

// ---- 암반 반발경도
n = 0; bad = [];
fx.rock.forEach(w => {
  const o = api.ftReboundRock({ readings: w.raw, angle: w.angle, density: w.density });
  n++;
  const e = w.exp;
  const diff = [['avg', o.avg, e.avg], ['X', o.X, e.X], ['Y', o.Y, e.Y], ['Z', o.Z, e.Z], ['mpa', o.mpa, e.AC], ['count', o.count, e.count], ['min', o.min, e.min], ['max', o.max, e.max]].filter(([, a, b]) => typeof b === 'number' && !close(a, b, 1e-7));
  if (o.cls !== e.AD) diff.push(['판정', o.cls, e.AD]);
  if (diff.length) bad.push(w.sheet + ' ' + w.pos + ' → ' + diff.map(([k, a, b]) => k + ' 앱 ' + a + ' / 엑셀 ' + b).join(', '));
});
check('암반: 엑셀과 ' + n + '개 지점 일치 (평균·상위50% 평균·보정계수·보정 반발·추정강도·유효갯수·최소/최대·암판정)', n > 0 && !bad.length, bad.slice(0, 3).join(' // '));
check('암판정 경계: 160 초과 극경암, 130 초과 경암, 100 초과 보통암, 70 초과 연암, 그 이하 풍화암', api.ftRockClass(161) === '극경암' && api.ftRockClass(160) === '경암' && api.ftRockClass(100) === '연암' && api.ftRockClass(70) === '풍화암');
const tie = api.ftReboundRock({ readings: [48, 54, 44, 54, 57, 58, 48, 52, 51, 50, 44, 46, 45, 50, 44, 52, 49, 52, 50, 52], angle: 0, density: 25 });
check('암반: 공동 순위는 엑셀 양식처럼 모두 포함(유효갯수가 10을 넘을 수 있음) — 정수 입력 예: 12개', tie.count === 12 && Math.abs(tie.X - 52.6667) < 1e-3 && tie.cls === '보통암', JSON.stringify([tie.count, tie.X, tie.mpa]));
check('암반: -90° 는 엑셀 템플릿처럼 보정 없음(0)', api.ftReboundRock({ readings: new Array(20).fill(50), angle: -90, density: 25 }).Y === 0);
check('값 붙여넣기: 공백·쉼표·줄바꿈 구분 숫자 20개', api.ftParseReadings('40 43 39\n43, 39;41').length === 6);
// ---- 콘크리트 반발경도 (04-4 .xls, 앤빌 보정형) — 보강토옹벽 양식과 별도
const cx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'conc_samples.json'), 'utf8'));
n = 0; bad = [];
cx.forEach(w => {
  const e = w.exp;
  const o = api.ftReboundConc({ readings: w.readings, angle: w.angle, anvil: w.anvil, wet: 0, alpha: e.alpha, design: e.design });
  n++;
  const diff = [['R', o.R, e.R], ['Ro', o.Ro, e.Ro], ['Fc1', o.Fc1, e.Fc1], ['Fc2', o.Fc2, e.Fc2], ['F1', o.F1, e.F1], ['F2', o.F2, e.F2]].filter(([, a, b]) => typeof b === 'number' && !close(a, b, 1e-9));
  if (typeof e.ratio === 'number' && !close(o.ratio, e.ratio * 100, 1e-9)) diff.push(['ratio', o.ratio, e.ratio * 100]);
  if (diff.length) bad.push(w.sheet + ' ' + w.name + ' → ' + diff.map(([k, a, b]) => k + ' 앱 ' + a + ' / 엑셀 ' + b).join(', '));
});
check('콘크리트(앤빌형): 엑셀 .xls 와 ' + n + '개 지점 일치 (평균경도 R·Ro·1식/2식 Fc·F28·설계강도 대비)', n > 0 && !bad.length, bad.slice(0, 3).join(' // '));
check('콘크리트(앤빌형): 경계값은 제외(20% 초과·미만만 남김) — 보강토옹벽 양식은 -20% 경계값 포함', (() => {
  const a = [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 48, 32, 52, 28];   // 평균 40, 경계 32·48
  return api.ftReboundConc({ readings: a, alpha: 1, anvil: 80 }).excluded === 4 && api.ftReboundWall({ readings: a, angle: 0, age: 3000 }).excluded === 2;
})());
check('콘크리트(앤빌형): 앤빌 Ra 가 80이 아니면 80/Ra 를 곱함, 각도보정치 직접 입력 우선', (() => {
  const a = new Array(20).fill(40);
  const o = api.ftReboundConc({ readings: a, anvil: 82, dAngle: 1.5, alpha: 1 });
  return Math.abs(o.K - 80 / 82) < 1e-12 && o.Ro === api.ftRound(40 * 80 / 82 + 1.5, 1);
})());
check('콘크리트 재령표: 28일 1.00 · 3000일 이상 0.63 · 2000일 0.64 · 28일 미만은 표 없음', api.ftConcAge(28) === 1 && api.ftConcAge(5000) === 0.63 && api.ftConcAge(2000) === 0.64 && api.ftConcAge(10) === null);
check('반올림은 엑셀 ROUND 와 같음(44.85 → 44.9)', api.ftRound(44.85, 1) === 44.9 && api.ftRound(24.949, 1) === 24.9);
// ---- 토양경도 (04-5 .xls): 평균 · 최소 · 최대 · 지반종류별 분류
const sx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'soil_samples.json'), 'utf8'));
n = 0; bad = [];
sx.forEach(w => {
  const row = { soil: w.soil }; w.readings.forEach((v, i) => { if (i < 10) row['r' + (i + 1)] = v == null ? '' : String(v); });
  const o = api.ftSoilRow(row);
  n++;
  const e = w.exp;
  if (!close(o.avg, e.avg, 1e-9) || o.cls !== e.cls || (e.min != null && o.min !== e.min) || (e.max != null && o.max !== e.max)) bad.push(w.sheet + ' ' + w.soil + ' ' + JSON.stringify([o.avg, o.cls, o.min, o.max, e]));
});
check('토양경도: 엑셀 .xls 와 ' + n + '개 측정위치 일치 (평균·분류·최소·최대)', n > 0 && !bad.length, bad.slice(0, 2).join(' // '));
check('토양경도 분류 경계: 모래 20.4 → 보통(미만이면 느슨), 실트질모래 14.9 → 조밀, 그 밖 4.7 → 느슨', api.ftSoilClass(20.39, '모래') === '느슨' && api.ftSoilClass(20.4, '모래') === '보통' && api.ftSoilClass(14.9, '실트질모래') === '조밀' && api.ftSoilClass(4.7, '기타(실트·점토 등)') === '느슨' && api.ftSoilClass(30, '모래') === '매우조밀');
check('토양경도: 일부만 입력해도 입력한 값으로 계산, 비면 계산 안 함', api.ftSoilRow({ soil: '모래', r1: '20', r2: '22' }).avg === 21 && api.ftSoilRow({ soil: '모래' }).avg === null);

}

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
