/**
 * 현장시험 입력·산출 계산 모듈 (피치샷 웹앱 v177~v179 에서 분리 — 데스크 프로그램으로 이식용)
 * 화면(DOM)이 없는 순수 함수와 보정표·평가기준만 담았다. 사용자 부록 엑셀(04-3~04-9)의 수식/표를 그대로 옮겼고,
 * scratch/desk-port/test_fieldTests.js 가 엑셀 계산 결과와 한 행씩 대조한다.
 * 측정값은 현장에서 실제로 잰 값만 받는다(값을 만들어 내는 코드는 없다).
 */
'use strict';
// ---------- 현장시험 입력·산출 (v177, 연결 설계안 Phase 6 — 1차: 탄산화 · 계획선형오차 · 수준측량) ----------
// 산출식·평가기준은 사용자가 가진 부록 엑셀(04-7 수준측량, 04-8 계획선형오차, 04-9 탄산화 깊이측정)의 수식을 그대로 옮겼다.
// 자료는 시설물(site.fieldTests)에 저장되고, "부록 엑셀 내보내기"로 시험별 시트를 만든다.
//  - 평가기준표(FT_CRITERIA)는 엑셀 템플릿과 같은 값이다. 엑셀은 경계값(예: 정확히 d 한계값)에서 0을 돌려주는 틈이 있어
//    여기서는 "d 한계값 이상이면 e"로 틈 없이 계산한다(차이가 나는 경우는 경계값뿐).
const FT_CRITERIA = {
  // 수준측량 침하량(cm): [a 미만, b 미만, c 미만, d 미만] 이상이면 e. 구조 1=콘크리트·석축, 2=보강토·돌망태
  leveling: {
    '1': { '비진행성': [5, 8, 12, 16], '진행성': [2, 5, 8, 12] },
    '2': { '비진행성': [5, 10, 20, 30], '진행성': [3, 8, 16, 25] }
  },
  // 계획선형오차(%): |선형오차|
  alignment: { '비진행성': [2, 3, 4, 6], '진행성': [1, 2, 3, 4] }
};
function ftNum(v){
  if(v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
function ftGrade(x, th){
  const a = Math.abs(x);
  return a < th[0] ? 'a' : a < th[1] ? 'b' : a < th[2] ? 'c' : a < th[3] ? 'd' : 'e';
}
// 탄산화: 잔여깊이=피복-깊이, 속도계수=깊이/√공용년수, 잔존수명=(잔여/속도)², 등급은 잔여깊이로
function ftCarbonationRow(row, age){
  const cover = ftNum(row.cover), depth = ftNum(row.depth), yrs = ftNum(age);
  const out = { remain: null, speed: null, life: '', grade: '', reach: null };
  if(cover == null || depth == null) return out;
  out.remain = cover - depth;
  out.grade = out.remain > 29.9999 ? 'a' : out.remain > 10 ? 'b' : out.remain > 0.000001 ? 'c' : out.remain >= 0 ? 'd' : 'FALSE';
  if(yrs == null || yrs <= 0) return out;
  out.speed = depth / Math.sqrt(yrs);
  const life = out.speed === 0 ? Infinity : Math.pow(out.remain / out.speed, 2);
  out.life = life > 100 ? '100년 이상' : life;
  out.reach = out.speed === 0 ? null : Math.round(Math.pow(cover, 2) / Math.pow(out.speed, 2) - yrs);
  return out;
}
// 계획선형오차: 편차=금회-기준, 변위(mm)=노출높이×편차(rad), 선형오차(%)=sin(편차)×100, 평가=진행성별 기준표
function ftAlignmentRow(row){
  const h = ftNum(row.height), base = ftNum(row.base), now = ftNum(row.now);
  const out = { dev: null, disp: null, err: null, grade: '' };
  if(base == null || now == null) return out;
  out.dev = now - base;
  const rad = out.dev * Math.PI / 180;
  if(h != null) out.disp = h * rad;
  out.err = Math.sin(rad) * 100;
  const th = FT_CRITERIA.alignment[row.progress === '진행성' ? '진행성' : '비진행성'];
  out.grade = ftGrade(out.err, th);
  return out;
}
// 수준측량: b-a(m), 침하량(cm)=(b-a)×100, 평가=구조·진행성별 기준표
function ftLevelingRow(row, structure){
  const a = ftNum(row.design), b = ftNum(row.measured);
  const out = { d: null, settle: null, grade: '' };
  if(a == null || b == null) return out;
  out.d = b - a;
  out.settle = out.d * 100;
  const set = FT_CRITERIA.leveling[structure === '1' ? '1' : '2'];
  out.grade = ftGrade(out.settle, set[row.progress === '진행성' ? '진행성' : '비진행성']);
  return out;
}
// ---- 반발경도 (슈미트해머) — 04-6 보강토옹벽 반발경도 · 04-3 암반 반발경도 엑셀의 수식/보정표를 옮겼다 ----
// 측정값은 현장에서 실제로 잰 값만 입력한다(앱은 값을 만들어 내지 않는다).
const FT_WALL_ANGLE = {20: [-5.4, -3.5, 2.5, 3.4], 30: [-4.7, -3.1, 2.3, 3.1], 40: [-3.9, -2.6, 2, 2.7], 50: [-3.1, -2.1, 1.6, 2.2], 60: [-2.3, -1.6, 1.3, 1.7]};   // 타격각도 보정 기준점(R=20·30·40·50·60) [90°, 45°, -45°, -90°]
const FT_WALL_AGE = [[4,1.9],[5,1.84],[6,1.75],[7,1.72],[8,1.67],[9,1.61],[10,1.55],[11,1.49],[12,1.45],[13,1.4],[14,1.36],[15,1.32],[16,1.28],[17,1.25],[18,1.22],[19,1.18],[20,1.15],[21,1.12],[22,1.1],[23,1.08],[24,1.06],[25,1.04],[26,1.02],[27,1.01],[28,1],[29,0.99],[30,0.99],[32,0.98],[33,0.97],[34,0.96],[36,0.95],[38,0.94],[40,0.93],[42,0.92],[44,0.91],[46,0.9],[48,0.89],[50,0.87],[52,0.87],[54,0.87],[56,0.86],[58,0.86],[60,0.86],[62,0.85],[64,0.85],[66,0.85],[68,0.84],[70,0.84],[72,0.84],[74,0.83],[76,0.83],[78,0.82],[80,0.82],[82,0.82],[84,0.81],[86,0.81],[88,0.8],[90,0.8],[100,0.78],[125,0.76],[150,0.74],[175,0.73],[200,0.72],[250,0.71],[300,0.7],[400,0.68],[500,0.67],[750,0.66],[1000,0.65],[1200,0.65],[1400,0.65],[1600,0.64],[1800,0.64],[2000,0.64],[2200,0.64],[2700,0.63]];   // 재령(일) → 재령계수. 2700일 이상은 0.63(엑셀 "3000일 이상")
const FT_ROCK_TABLE = [[10,-0.8,null,null,-3.2],[11,-0.81,null,null,-3.22],[12,-0.82,null,null,-3.24],[13,-0.83,null,null,-3.26],[14,-0.84,null,null,-3.28],[15,-0.85,null,null,-3.3],[16,-0.86,null,null,-3.32],[17,-0.87,null,null,-3.34],[18,-0.88,null,null,-3.36],[19,-0.89,null,null,-3.38],[20,-0.9,-8.8,-6.9,-3.4],[21,-0.89,-8.7,-6.83,-3.37],[22,-0.88,-8.6,-6.76,-3.34],[23,-0.87,-8.5,-6.69,-3.31],[24,-0.86,-8.4,-6.62,-3.28],[25,-0.85,-8.3,-6.55,-3.25],[26,-0.84,-8.2,-6.48,-3.22],[27,-0.83,-8.1,-6.41,-3.19],[28,-0.82,-8.0,-6.34,-3.16],[29,-0.81,-7.9,-6.27,-3.13],[30,-0.8,-7.8,-6.2,-3.1],[31,-0.79,-7.68,-6.11,-3.06],[32,-0.78,-7.56,-6.02,-3.02],[33,-0.77,-7.44,-5.93,-2.98],[34,-0.76,-7.32,-5.84,-2.94],[35,-0.75,-7.2,-5.75,-2.9],[36,-0.74,-7.08,-5.66,-2.86],[37,-0.73,-6.96,-5.57,-2.82],[38,-0.72,-6.84,-5.48,-2.78],[39,-0.71,-6.72,-5.39,-2.74],[40,-0.7,-6.6,-5.3,-2.7],[41,-0.69,-6.47,-5.2,-2.65],[42,-0.68,-6.34,-5.1,-2.6],[43,-0.67,-6.21,-5,-2.55],[44,-0.66,-6.08,-4.9,-2.5],[45,-0.65,-5.95,-4.8,-2.45],[46,-0.64,-5.82,-4.7,-2.4],[47,-0.63,-5.69,-4.6,-2.35],[48,-0.62,-5.56,-4.5,-2.3],[49,-0.61,-5.43,-4.4,-2.25],[50,-0.6,-5.3,-4.3,-2.2],[51,-0.58,-5.17,-4.2,-2.15],[52,-0.56,-5.04,-4.1,-2.1],[53,-0.54,-4.91,-4,-2.05],[54,-0.52,-4.78,-3.9,-2],[55,-0.5,-4.65,-3.8,-1.95],[56,-0.48,-4.52,-3.7,-1.9],[57,-0.46,-4.39,-3.6,-1.85],[58,-0.44,-4.26,-3.5,-1.8],[59,-0.42,-4.13,-3.4,-1.75],[60,-0.4,-4,-3.3,-1.7]];   // 암반: [R, -45°, 90°, 45°, 0°] 보정값
let ftWallTable = null;
// 엑셀 '반발경도 보정치' 표와 같은 방식(0.1 간격, 기준점 사이를 누적 덧셈)으로 만든다 — 같은 부동소수점 값이라 행 선택이 엑셀과 같다
function ftBuildWallTable(){
  const keys = [20, 30, 40, 50, 60], A = [20], cols = [0, 1, 2, 3].map(j => [FT_WALL_ANGLE[20][j]]);
  for(let i = 1; i <= 400; i++){
    A.push(A[i - 1] + 0.1);
    for(let j = 0; j < 4; j++){
      if(i % 100 === 0) cols[j].push(FT_WALL_ANGLE[keys[i / 100]][j]);
      else { const seg = Math.floor(i / 100); cols[j].push(cols[j][i - 1] + (FT_WALL_ANGLE[keys[seg + 1]][j] - FT_WALL_ANGLE[keys[seg]][j]) * 0.01); }
    }
  }
  return { A, cols };
}
// 타각 보정 ΔR1: 평균치 R 이하의 가장 큰 표 행(엑셀 MATCH) · 타격각도 열. R 이 20~60 밖이거나 지원하지 않는 각도면 null
function ftWallDeltaR(R, angle){
  if(R == null || R < 20) return null;
  const a = Number(angle);
  if(a === 0) return 0;
  const col = { 90: 0, 45: 1, '-45': 2, '-90': 3 }[String(a)];
  if(col == null) return null;
  if(!ftWallTable) ftWallTable = ftBuildWallTable();
  let idx = 0;
  for(let i = 0; i < ftWallTable.A.length; i++){ if(ftWallTable.A[i] <= R) idx = i; else break; }
  return ftWallTable.cols[col][idx];
}
function ftWallAge(days){
  const d = ftNum(days);
  if(d == null || d < 4) return null;
  let c = null;
  for(const [age, coef] of FT_WALL_AGE){ if(age <= d) c = coef; else break; }
  return c;
}
// 콘크리트·보강토옹벽 반발경도: 20점 평균 m(소수 버림) → m±20% 밖은 제외(m-20% 미만, m+20% 초과) → 남은 값의 평균 R
// → R + 타각보정 ΔR1 + 습윤보정 ΔR2 = Ro → 재료학회식·건축학회식 압축강도 × 재령계수 = 추정강도 → 설계기준강도 대비(%)
function ftReboundWall(row){
  const rd = (row.readings || []).map(ftNum).filter(x => x != null);
  const out = { n: rd.length, R: null, excluded: null, dR1: null, Ro: null, FcMat: null, FcArc: null, alpha: null, estMat: null, estArc: null, ratioMat: null, ratioArc: null };
  if(rd.length < 2) return out;
  const m = Math.trunc(rd.reduce((s, x) => s + x, 0) / rd.length);
  const lo = m - m * 0.2, hi = m + m * 0.2;
  const kept = rd.filter(x => x >= lo && x <= hi);
  out.excluded = rd.length - kept.length;
  if(!kept.length) return out;
  out.R = kept.reduce((s, x) => s + x, 0) / kept.length;
  out.dR1 = ftWallDeltaR(out.R, row.angle == null || row.angle === '' ? 0 : row.angle);
  if(out.dR1 == null) return out;
  out.Ro = out.R + out.dR1 + (ftNum(row.wet) || 0);
  out.FcMat = out.Ro * 1.27 - 18;
  out.FcArc = (out.Ro * 7.3 + 100) * 0.098;
  out.alpha = ftWallAge(row.age);
  if(out.alpha == null) return out;
  out.estMat = out.FcMat * out.alpha;
  out.estArc = out.FcArc * out.alpha;
  const dsg = ftNum(row.design);
  if(dsg) { out.ratioMat = out.estMat / dsg * 100; out.ratioArc = out.estArc / dsg * 100; }
  return out;
}
// ---- 토양경도시험 (04-5 토양경도측정 .xls 양식): 측정치(mm) 평균 → 지반종류별 분류 ----
function ftSoilClass(avg, soil){
  const s = String(soil || '');
  const th = s === '모래' ? [17.2, 20.4, 23.3, 26] : (s === '실트질모래' || s === '모래질실트') ? [10.2, 12, 14.9, 18.9] : [4.7, 7.1, 9.7, 11.1];
  return avg < th[0] ? '매우느슨' : avg < th[1] ? '느슨' : avg < th[2] ? '보통' : avg < th[3] ? '조밀' : '매우조밀';
}
function ftSoilRow(row){
  const vals = [];
  for(let i = 1; i <= 10; i++){ const v = ftNum(row['r' + i]); if(v != null) vals.push(v); }
  const out = { avg: null, cls: '', min: null, max: null, n: vals.length };
  if(!vals.length) return out;
  out.avg = vals.reduce((s, x) => s + x, 0) / vals.length;
  out.min = Math.min.apply(null, vals); out.max = Math.max.apply(null, vals);
  out.cls = ftSoilClass(out.avg, row.soil);
  return out;
}
// ---- 콘크리트 반발경도 (04-4 콘크리트 반발경도 .xls 양식: 앤빌 보정형) ----
// 보강토옹벽 양식과 다르다: ±20% 경계값을 포함하지 않고(초과·미만만 남김), 앤빌 계수(80/Ra)를 곱하고, Ro를 소수 첫째 자리로 반올림하며,
// 추정강도도 소수 첫째 자리로 반올림한다. 재령계수는 재령표(콘크리트 양식)로 찾거나 직접 입력(엑셀 양식에서도 값을 직접 적어 넣음).
const FT_CONC_AGE = [[28, 1], [50, 0.84], [100, 0.78], [200, 0.72], [300, 0.7], [400, 0.68], [500, 0.67], [1000, 0.65], [2000, 0.64], [3000, 0.63]];
function ftRound(x, d){ return Number(Math.round(Number(x + 'e' + d)) + 'e-' + d); }
function ftConcAge(days){
  const d = ftNum(days);
  if(d == null || d < 28) return null;
  let c = null;
  for(const [age, coef] of FT_CONC_AGE){ if(age <= Math.min(d, 3000)) c = coef; else break; }
  return c;
}
function ftReboundConc(row){
  const rd = (row.readings || []).map(ftNum).filter(x => x != null);
  const out = { n: rd.length, R: null, excluded: null, K: null, dAngle: null, Ro: null, Fc1: null, Fc2: null, alpha: null, F1: null, F2: null, ratio: null };
  if(rd.length < 2) return out;
  const mean = rd.reduce((s, x) => s + x, 0) / rd.length;
  const kept = rd.filter(x => x > mean * 0.8 && x < mean * 1.2);
  out.excluded = rd.length - kept.length;
  if(!kept.length) return out;
  out.R = kept.reduce((s, x) => s + x, 0) / kept.length + (ftNum(row.wet) || 0);
  const ra = ftNum(row.anvil);
  out.K = (ra && ra > 0) ? 80 / ra : 1;
  const manual = ftNum(row.dAngle);
  const ang = row.angle == null || row.angle === '' ? 0 : row.angle;
  out.dAngle = manual != null ? manual : ftWallDeltaR(out.R * out.K, ang);
  if(out.dAngle == null) return out;
  out.Ro = ftRound(out.R * out.K + out.dAngle, 1);
  out.Fc1 = (7.3 * out.Ro + 100) * 0.098;
  out.Fc2 = -18 + 1.27 * out.Ro;
  const aManual = ftNum(row.alpha);
  out.alpha = aManual != null ? aManual : ftConcAge(row.age);
  if(out.alpha == null) return out;
  out.F1 = ftRound(out.Fc1 * out.alpha, 1);
  out.F2 = ftRound(out.Fc2 * out.alpha, 1);
  const dsg = ftNum(row.design);
  if(dsg) out.ratio = out.F2 / dsg * 100;
  return out;
}
// 암반 반발경도(불연속면 강도추정): 20점 반올림값 → 상위 50%(순위 10위 이내) 평균 X → 타격각도 보정계수 Y(표) → Z=X+Y → 강도=10^(0.0008·Z·밀도+1.01) → 암판정
function ftRockClass(mpa){ return mpa > 160 ? '극경암' : mpa > 130 ? '경암' : mpa > 100 ? '보통암' : mpa > 70 ? '연암' : '풍화암'; }
function ftReboundRock(row){
  const raw = (row.readings || []).map(ftNum).filter(x => x != null);
  const out = { n: raw.length, avg: null, X: null, count: null, Y: null, Z: null, mpa: null, cls: '', min: null, max: null };
  if(raw.length < 2) return out;
  const rounded = raw.map(x => Math.round(x));
  out.avg = rounded.reduce((s, x) => s + x, 0) / rounded.length;
  out.min = Math.min.apply(null, rounded); out.max = Math.max.apply(null, rounded);
  const top = Math.floor(raw.length / 2);
  // 엑셀 양식과 같은 규칙: 순위(RANK, 큰 값이 1위)가 top(20개면 10) 이내인 값을 모두 쓴다 — 공동 순위가 있으면 10개를 넘을 수 있다(유효갯수에 표시).
  // 순위는 입력한 값 기준, 합은 반올림 값 기준.
  let sum = 0, cnt = 0;
  raw.forEach((x, i) => { const rank = 1 + raw.filter(y => y > x).length; if(rank <= top && rounded[i] > 0){ sum += rounded[i]; cnt++; } });
  if(!cnt) return out;
  out.count = cnt; out.X = sum / cnt;
  const rx = Math.round(out.X);
  let line = null;
  for(const r of FT_ROCK_TABLE){ if(r[0] <= rx) line = r; else break; }
  if(!line) return out;
  const a = Number(row.angle == null || row.angle === '' ? 0 : row.angle);
  const col = { '-45': 1, 90: 2, 45: 3, 0: 4 }[String(a)];
  out.Y = col == null ? 0 : (line[col] == null ? null : line[col]);   // 표에 없는 각도(예: -90°)는 엑셀 템플릿처럼 보정 없음(0)
  if(out.Y == null) return out;
  out.Z = out.X + out.Y;
  const dens = ftNum(row.density) == null ? 25 : ftNum(row.density);
  out.mpa = Math.pow(10, 0.0008 * out.Z * dens + 1.01);
  out.cls = ftRockClass(out.mpa);
  return out;
}
function ftParseReadings(text){
  return String(text || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean).map(s => s.replace(/,/g, ''));
}
function ftFmt(v, d){
  if(v == null || v === '') return '';
  if(typeof v === 'string') return v;
  return isFinite(v) ? (Math.round(v * Math.pow(10, d == null ? 2 : d)) / Math.pow(10, d == null ? 2 : d)).toString() : '';
}
// 시험 종류 정의: 입력 열, 계산 열, 붙여넣기 열 순서, 행 계산 함수
const FT_TESTS = {
  carbonation: {
    label: '탄산화 깊이', title: '[콘크리트 탄산화 깊이 측정 시험 보고서]',
    inputs: [['pos', '측정위치', 'text'], ['cover', '최소 피복두께(㎜)', 'num'], ['depth', '탄산화 깊이(㎜)', 'num']],
    calcs: [['remain', '탄산화 잔여깊이(㎜)', 2], ['speed', '탄산화 속도계수', 3], ['life', '잔존수명(년)', 1], ['grade', '등급', 0], ['reach', '도달시간(년)', 0]],
    paste: ['pos', 'cover', 'depth'],
    meta: [['age', '구조물 경과년수(년)', '', 'num'], ['date', '코어 채취·시험일', '', 'text'], ['aggregate', '사용골재의 종류', '보통골재', 'text'],
           ['surface', '측정면의 종류', '', 'text'], ['reagent', '시약', '페놀프탈레인(1%) 용액', 'text'], ['tool', '측정기구', '버니어 캘리퍼스', 'text'], ['spray', '시약 분무로부터 탄산화 깊이까지의 시간', '5~10초 내외', 'text']],
    calc: (row, meta) => ftCarbonationRow(row, meta.age)
  },
  alignment: {
    label: '계획선형오차', title: '계획선형오차',
    inputs: [['pos', '측점', 'text'], ['height', '노출높이(mm)', 'num'], ['base', '기준치(˚)', 'num'], ['now', '금회(˚)', 'num'], ['progress', '진행성', 'sel']],
    calcs: [['dev', '편차(˚)', 2], ['disp', '변위(mm)', 2], ['err', '선형오차(%)', 3], ['grade', '평가', 0]],
    paste: ['pos', 'height', 'base', 'now'],
    meta: [],
    calc: (row) => ftAlignmentRow(row)
  },
  leveling: {
    label: '수준측량', title: '수준측량',
    inputs: [['pos', '구간', 'text'], ['design', '설계치 a (기준값 m)', 'num'], ['measured', '금회 측량 b (측정값 m)', 'num'], ['progress', '진행성 여부', 'sel']],
    calcs: [['d', 'b-a (m)', 3], ['settle', '침하량(㎝)', 2], ['grade', '평가등급', 0]],
    paste: ['pos', 'design', 'measured'],
    meta: [['structure', '구조 구분 (1=콘크리트·석축, 2=보강토·돌망태)', '2', 'structure']],
    calc: (row, meta) => ftLevelingRow(row, meta.structure)
  },
  soil: {
    label: '토양경도', title: '토양경도시험(mm)', autoId: 'SH-',
    inputs: [['sh', '구분', 'text', 56], ['soil', '지반종류', 'sel', ['실트질모래', '모래질실트', '모래', '기타(실트·점토 등)']], ['pos', '측정위치', 'text', 70]]
      .concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => ['r' + i, String(i), 'num', 42])),
    calcs: [['avg', '평균(mm)', 1], ['cls', '분류', 0], ['min', '최소', 0], ['max', '최대', 0]],
    paste: ['pos'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => 'r' + i)),
    rowDefault: { soil: '실트질모래' },
    meta: [],
    calc: (row) => ftSoilRow(row)
  },
  // ---- 반발경도: 지점(카드)마다 측정값 20개를 4행×5열로 입력한다
  rebound_wall: {
    label: '반발경도(보강토옹벽)', title: '[반발경도 시험 보고서]', kind: 'cards',
    head: [['pos', '측정위치', 'text'], ['angle', '타격각도(˚)', 'angle', [0, -90, 90, 45, -45]], ['wet', '습윤보정 ΔR2', 'num'], ['age', '재령(일)', 'num'], ['design', '설계기준강도(㎫)', 'num']],
    headDefault: { angle: '0', wet: '0', age: '3000', design: '24' },
    meta: [['date', '시험일자 및 시간', '', 'text'], ['fck', '콘크리트의 설계조건', '', 'text'], ['surface', '시험위치의 표면상태', '표면건조상태', 'text'], ['temp', '시험시 온도', '', 'text'],
           ['ageText', '콘크리트 재령', '', 'text'], ['moisture', '콘크리트 내부의 함수상태', '표면건조', 'text'], ['model', '반발경도 측정기 모델명', '', 'text'], ['dir', '타격방향', '', 'text'], ['dropped', '버린 반발경도의 값 및 위치', '특이사항 없음.', 'text']],
    results: [['R', '평균치 R', 2], ['excluded', '제외한 값(개)', 0], ['dR1', '타각보정 ΔR1', 2], ['Ro', '보정경도 Ro', 2], ['FcMat', '재료학회식 Fc(㎫)', 2], ['FcArc', '건축학회식 Fc(㎫)', 2],
              ['alpha', '재령계수 αn', 2], ['estMat', '추정강도 재료학회식(㎫)', 2], ['estArc', '추정강도 건축학회식(㎫)', 2], ['ratioMat', '설계강도대비 재료식(%)', 1], ['ratioArc', '설계강도대비 건축식(%)', 1]],
    criteria: '평균(소수 버림) ±20% 밖의 값은 제외하고 남은 값의 평균을 R로 씁니다. 재료학회식 Fc=1.27·Ro−18, 건축학회식 Fc=(7.3·Ro+100)×0.098, 추정강도=Fc×재령계수. 타각 보정은 R이 20~60일 때, 0·±45·±90˚만 지원합니다.',
    calc: (row) => ftReboundWall(row)
  },
  rebound_conc: {
    label: '반발경도(콘크리트)', title: '[반발경도 시험 보고서]', kind: 'cards',
    head: [['pos', '측점(측정위치)', 'text'], ['angle', '타격각도(˚)', 'angle', [0, -90, 90, 45, -45]], ['anvil', '앤빌 측정값 Ra(기준 80)', 'num'], ['wet', '습윤보정 ΔR', 'num'], ['dAngle', '각도보정치(비우면 자동)', 'num'],
           ['age', '재령(일)', 'num'], ['alpha', '재령보정계수(비우면 재령표)', 'num'], ['design', '설계기준강도(㎫)', 'num']],
    headDefault: { angle: '0', anvil: '80', wet: '0', dAngle: '', age: '', alpha: '', design: '24' },
    meta: [['date', '시험일자', '', 'text'], ['fck', '콘크리트의 설계조건', '', 'text'], ['model', '반발경도 측정기 모델명', '', 'text'], ['note', '비고', '', 'text']],
    results: [['R', '평균경도 R', 2], ['excluded', '제외한 값(개)', 0], ['K', '앤빌 계수(80/Ra)', 3], ['dAngle', '각도보정치', 2], ['Ro', '보정 평균경도 Ro(0.1)', 1], ['Fc1', '강도 Fc 1식(건축학회)', 2], ['Fc2', '강도 Fc 2식(재료학회)', 2],
              ['alpha', '재령보정계수 α', 2], ['F1', '강도 F28 1식(㎫)', 1], ['F2', '강도 F28 2식 = 비파괴강도(㎫)', 1], ['ratio', '설계기준강도 대비(%)', 0]],
    criteria: '측정값 20개의 평균 ±20% 경계값은 제외합니다(초과·미만만 남김). R 평균에 습윤보정을 더하고, 앤빌 계수(80/Ra)를 곱한 뒤 각도보정치를 더해 소수 첫째 자리로 반올림한 값이 Ro입니다. 1식 Fc=(7.3·Ro+100)×0.098, 2식 Fc=−18+1.27·Ro, F28=Fc×재령보정계수(소수 첫째 자리 반올림). 재령보정계수를 비우면 재령(일, 3000일까지)으로 표(28일 1.00 … 3000일 0.63)에서 찾습니다. 각도보정치를 비우면 0°는 0, 그 외 각도는 보강토옹벽 양식과 같은 보정표(R 20~60)를 씁니다.',
    calc: (row) => ftReboundConc(row)
  },
  rebound_rock: {
    label: '반발경도(암반)', title: '반발도법에 의한 불연속면 강도추정', kind: 'cards',
    head: [['pos', '측정위치', 'text'], ['angle', '타격방향(˚)', 'angle', [0, -45, 45, 90, -90]], ['density', '암석의 밀도(kN/㎥)', 'num']],
    headDefault: { angle: '0', density: '25' },
    meta: [],
    results: [['avg', '평균값', 2], ['X', '상위 50% 평균 X', 2], ['count', '유효갯수', 0], ['Y', '보정계수', 2], ['Z', '보정 반발 Z', 2], ['mpa', '추정강도(㎫)', 1], ['cls', '암판정', 0], ['min', '최소', 0], ['max', '최대', 0]],
    criteria: '측정값 20개를 반올림해 상위 50%(10개) 평균 X를 구하고, 타격방향 보정계수 Y를 더한 Z로 강도=10^(0.0008·Z·밀도+1.01)을 계산합니다. 판정: 160 초과 극경암, 130 초과 경암, 100 초과 보통암, 70 초과 연암, 그 이하 풍화암. 값이 같은 순위는 모두 포함해 유효갯수가 10개를 넘을 수 있습니다(엑셀 양식과 동일). 보정표는 0·±45·90˚이며 −90˚는 보정 없음(엑셀 양식과 동일).',
    calc: (row) => ftReboundRock(row)
  }
};
function ftEnsure(site, key){
  if(!site.fieldTests || typeof site.fieldTests !== 'object') site.fieldTests = {};
  if(!site.fieldTests[key]) site.fieldTests[key] = { meta: {}, rows: [] };
  const t = site.fieldTests[key];
  if(!t.meta) t.meta = {};
  if(!Array.isArray(t.rows)) t.rows = [];
  FT_TESTS[key].meta.forEach(([k, , def]) => { if(t.meta[k] === undefined) t.meta[k] = def; });
  return t;
}
// 엑셀·메모에서 복사한 줄(탭 또는 공백 구분)을 행으로: 열 순서는 FT_TESTS[key].paste
function ftParsePaste(key, text){
  const cols = FT_TESTS[key].paste;
  const rows = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if(!line.trim()) return;
    let parts;
    if(line.indexOf('\t') >= 0) parts = line.split('\t');
    else {
      parts = line.trim().split(/\s{2,}/);
      if(parts.length !== cols.length){   // 공백 한 칸으로만 나뉜 줄: 앞 열(위치 이름, 공백 포함 가능)은 합치고 나머지는 뒤에서부터 숫자로
        const tk = line.trim().split(/\s+/);
        const tail = cols.length - 1;
        parts = tk.length > tail ? [tk.slice(0, tk.length - tail).join(' ')].concat(tk.slice(tk.length - tail)) : tk;
      }
    }
    const row = Object.assign({ progress: '비진행성' }, FT_TESTS[key].rowDefault || {});
    cols.forEach((c, i) => { row[c] = (parts[i] || '').trim(); });
    rows.push(row);
  });
  return rows;
}

function ftEmptyCard(def){
  const row = { readings: new Array(20).fill('') };
  def.head.forEach(([k]) => { row[k] = (def.headDefault && def.headDefault[k] !== undefined) ? def.headDefault[k] : ''; });
  return row;
}

function ftCardsToAoa(def, t, aoa){
  t.rows.forEach((row, i) => {
    const res = def.calc(row, t.meta);
    aoa.push([]);
    aoa.push([(i + 1) + '. ' + (row.pos || '')].concat(def.head.filter(h => h[0] !== 'pos').map(([k, label]) => label + ': ' + (row[k] == null ? '' : row[k]))));
    for(let r = 0; r < 4; r++) aoa.push(['측정값'].concat((row.readings || []).slice(r * 5, r * 5 + 5).map(v => ftNum(v) == null ? (v || '') : ftNum(v))));
    def.results.forEach(([k, label, d]) => { const v = res[k]; aoa.push([label, (v == null || v === '') ? '' : (typeof v === 'number' ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : v)]); });
  });
}

module.exports = {
  FT_CRITERIA, FT_TESTS, FT_WALL_ANGLE, FT_WALL_AGE, FT_ROCK_TABLE, FT_CONC_AGE,
  ftNum, ftGrade, ftFmt, ftRound, ftEnsure, ftParsePaste, ftEmptyCard, ftCardsToAoa, ftParseReadings,
  ftCarbonationRow, ftAlignmentRow, ftLevelingRow, ftSoilClass, ftSoilRow,
  ftWallDeltaR, ftWallAge, ftReboundWall, ftReboundRock, ftRockClass, ftConcAge, ftReboundConc
};
