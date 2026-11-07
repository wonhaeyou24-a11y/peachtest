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

// ---------------------------------------------------------------- 정적 확인
check('PS_BUILD v174 이상', /const PS_BUILD = 'v(17[4-9]|1[89]\d)'/.test(html));
check('서비스워커 캐시 이름도 v174 이상', /point-shot-v(17[4-9]|1[89]\d)/.test(sw));
['btnPriorImport', 'npPriorImport', 'priorImportInput', 'priorSummaryBox'].forEach(id =>
  check('화면 요소 ' + id + ' 있음', html.includes('id="' + id + '"')));
check('기존 Excel 가져오기(EXCEL_COLUMNS)는 그대로', html.includes("{ key:'section', label:'구간' }") && html.includes('btnImportExcel'));
check('보호 함수(saveState/loadState/syncSingleEntity/pushProjectToCloud)에 전차자료 코드가 섞이지 않음', (() => {
  const names = ['function performSaveState', 'async function pushProjectToCloud', 'async function syncSingleEntity'];
  return names.every(h => { const i = html.indexOf(h); if (i < 0) return true; const body = html.slice(i, skip(html, html.indexOf('{', html.indexOf(')', i)))); return !/prior(Import|Parse|Plan)/.test(body); });
})());

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

const sample = {
  facility: '84.630k(포항) 절토사면(192127)',
  project: '2026년 비탈면·옹벽 정밀안전점검 및 성능평가 용역',
  inputs: ['전차보고서.hwp', '시설물관리대장.pdf'],
  compare: [
    { '항목': '연장', '관리대장': '174', '전차보고서': '173', '판정': '불일치', '비고·출처': '' },
    { '항목': '높이', '관리대장': '', '전차보고서': '12.5', '판정': '확인필요', '비고·출처': '' },
    { '항목': '준공년도', '관리대장': '2005', '전차보고서': '2005', '판정': '일치', '비고·출처': '' },
    { '항목': '노선', '관리대장': '국도7호선', '전차보고서': '국도7호선', '판정': '일치', '비고·출처': '' }
  ],
  inspection_history: [{ 'No.': 1, '점검종류': '정기안전점검', '점검기간': '2025', '점검기관': '자체', '평가등급': '양호', '출처': 'x' }],
  prior_evaluations: [{ '점검연도': '2024', '구분': '정밀안전점검', '수행기관': 'A사', '상태평가': 'B', '종합평가': 'B', '결함지수': '0.21', '출처': 'y' }],
  repair_history: [{ '시행연도': '2020', '내용': '배수로 보수', '위치/수량': '30m', '출처': 'z' }],
  prior_damages: [
    { '번호': 1, '위치(m)': 'Sta.25m', '구성요소': '나. 옹벽 전면', '손상명': '블록파손(균열)', '규모': '폭 0.3mm, L=1.2m', '전차 보수·보강방안': '주입보수', '사진 파일': '02_Sta.25m.jpg', '출처': '표4.2', '_imgs': ['/tmp/a.png'] },
    { '번호': 2, '위치(m)': '145m', '구성요소': '배수시설', '손상명': '누수(젖음)', '규모': '', '전차 보수·보강방안': '', '사진 파일': '', '출처': '표4.3' },
    { '번호': 3, '위치(m)': '', '구성요소': '', '손상명': '', '규모': '', '출처': '' }
  ],
  quantities: [{ '구분': '배수시설', '손상명': '균열', '단위': 'm', '전차 수량': 23.3 }],
  issues: [{ '번호': 1, '구분': '연장', '내용': '대장 174 / 전차 173', '중요도': '상' }],
  field_tests: [{ table: 51, '분류': '계획선형오차', grid: [['a', 'b']], _imgs: ['x'] }]
};

const p = api.priorParseOrganized(JSON.parse(JSON.stringify(sample)), 'a.json');
check('관리번호 추출 (괄호 숫자)', p.facilityNo === '192127');
check('시설물 종류 추정 (절토사면)', p.facilityType === '절토사면');
check('제원: 관리대장 값 우선 (연장 174)', p.specs.length === '174' && p.specSource.length === '관리대장');
check('제원: 대장이 비면 전차 값을 쓰되 출처를 전차보고서로 표시', p.specs.height === '12.5' && p.specSource.height === '전차보고서');
check('제원: 준공년도·노선 반영', p.specs.completionYear === '2005' && p.specs.route === '국도7호선');
check('대장↔전차 불일치 개수 집계', p.mismatchCount === 1);
check('손상명 없는 행은 제외하고 개수 기록', p.damages.length === 2 && p.skippedDamages === 1);
check('전차 손상 값은 원문 그대로 (규모 문자열 변형 없음)', p.damages[0].measurement === '폭 0.3mm, L=1.2m' && p.damages[0].component === '나. 옹벽 전면' && p.damages[0].drawingPosition === 'Sta.25m');
check('priorKey 는 관리번호|번호|손상명|위치', p.damages[0].priorKey === '192127|1|블록파손(균열)|Sta.25m');
check('내부 키(_imgs)는 저장 대상에서 제거', !JSON.stringify(p.priorRef).includes('_imgs') && !JSON.stringify(p.history).includes('_imgs'));
check('이력·참고자료 보존 (평가·점검·보수·확인필요·시험)', p.history.prior_evaluations.length === 1 && p.history.inspection_history.length === 1 && p.history.repair_history.length === 1 && p.priorRef.issues.length === 1 && p.priorRef.field_tests.length === 1);
check('잘못된 입력은 오류 메시지', !!api.priorParseOrganized([], 'x').error && !!api.priorParseOrganized({}, 'x').error && !!api.priorParseOrganized(null, 'x').error);

// 시설물 매칭
const siteByNo = { id: 'sAAAA1111', name: '다른이름', facilityNo: '192127', projectId: 'P' };
const siteByNameWithNo = { id: 'sBBBB2222', name: '현장 절토사면(192127)', projectId: 'P' };
const siteByName = { id: 'sCCCC3333', name: '84.630k (포항)  절토사면(192127)', projectId: 'P' };
check('매칭: 관리번호 필드 우선', api.priorFindSite([siteByName, siteByNo], p) === siteByNo);
check('매칭: 이름에 (관리번호)가 들어 있으면 매칭', api.priorFindSite([siteByNameWithNo], p) === siteByNameWithNo);
check('매칭: 공백·기호 차이를 무시한 이름 일치', api.priorFindSite([{ id: 'x', name: '84.630K(포항)절토사면(192127)' }], p) !== null);
check('매칭: 없으면 null (새 시설물)', api.priorFindSite([{ id: 'x', name: '전혀다른시설' }], p) === null);

// 가져오기 계획·중복 방지
const plan1 = api.priorPlanImport(p, []);
check('새 시설물: 전차 손상 2건 추가, 중복 0', plan1.site === null && plan1.toAdd.length === 2 && plan1.dup === 0);
const built = plan1.toAdd.map((d, i) => api.priorBuildDamage({ id: 'sXXXX9999' }, d, i + 1, '2026-11-07T00:00:00Z'));
check('기존손상 형식: id(EX-DMG-###-시설물표식)·상태 미확인·사진 빈 배열', built[0].id === 'EX-DMG-001-9999' && built[0].status === '미확인' && Array.isArray(built[0].photos) && built[0].photos.length === 0 && built[0].isDeleted === false);
check('기존손상: 출처·원본 사진 파일명·가져온 표시 보존', built[0].sourceRef === '표4.2' && built[0].priorPhotoFile === '02_Sta.25m.jpg' && built[0].origin === 'prior-import');
const siteExisting = { id: 'sAAAA1111', facilityNo: '192127', projectId: 'P', existingDamages: [built[0], { id: 'EX-DMG-009', damageName: '수기 입력' }] };
const plan2 = api.priorPlanImport(p, [siteExisting]);
check('다시 가져와도 같은 전차 손상은 건너뜀 (중복 1건, 추가 1건)', plan2.site === siteExisting && plan2.dup === 1 && plan2.toAdd.length === 1 && plan2.toAdd[0].damageName === '누수(젖음)');
// 같은 파일 안 중복 행
const dupSample = JSON.parse(JSON.stringify(sample));
dupSample.prior_damages.push(JSON.parse(JSON.stringify(sample.prior_damages[0])));
const plan3 = api.priorPlanImport(api.priorParseOrganized(dupSample, 'd.json'), []);
check('같은 파일 안의 완전 중복 행도 한 번만 추가', plan3.toAdd.length === 2 && plan3.dup === 1);
// 현재 열린 시설물은 라이브 배열(existingDamages)을 기준으로 중복 판단
ctx.currentSiteId = 'sAAAA1111'; ctx.existingDamages = [built[1]];
const plan4 = api.priorPlanImport(p, [{ id: 'sAAAA1111', facilityNo: '192127', existingDamages: [] }]);
check('현재 시설물: 화면에 열린 목록 기준으로 중복 판단', plan4.dup === 1 && plan4.toAdd.length === 1 && plan4.toAdd[0].damageName === '블록파손(균열)');

// ---------------------------------------------------------------- 관리대장 우선 / 사진 캡션 기반 전차 손상 (실제 스킬 출력 형식)
const ledgerSample = {
  facility: '중부선14.51K_하남_절토사면',   // 빠른 경로에서는 출력 이름 인자가 그대로 들어간다
  ledger: { '시설물번호': 'SL2005-0000129', '시설물종류': '절토사면', '시설물명': '중부선 14.51K(하남방향) 절토사면', '관리주체': '한국도로공사 고성지사 도로안전부', '노선': '고속국도 35호선', '주소_시도시군': '경상남도 통영시', '준공일_후보': '2005-12-23', '연장(m)': 480.0, '높이(m)': 63.0 },
  compare: [{ '항목': '연장', '관리대장': '', '전차보고서': '600', '판정': '확인필요' }, { '항목': '준공년도', '관리대장': '', '전차보고서': '2004', '판정': '확인필요' }],
  prior_damages: [],
  photo_captions: [
    { '절': '2.2.1 전차(2022년) 정밀안전점검에 의한 손상부위 확인결과', '열 헤더': '2022년 정밀안전점검', '캡션(원문)': 'Ⓐ 비탈면 내 표층유실', '사진 파일': 'a.jpg', '출처': '표28' },
    { '절': '2.2.2 1구간 외관조사 결과', '열 헤더': '', '캡션(원문)': '3소단측구 세굴', '사진 파일': '05_3소단측구_세굴.jpg', '출처': '표33 행1 열0' },
    { '절': '2.2.2 1구간 외관조사 결과', '열 헤더': '', '캡션(원문)': '⑧ 산마루측구 퇴적물 집적', '사진 파일': '16_산마루.jpg', '출처': '표36 행1 열1' },
    { '절': '2.2.2 1구간 외관조사 결과', '열 헤더': '', '캡션(원문)': '⑩ 도로포장 상태양호', '사진 파일': 'x.jpg', '출처': '표37' },
    { '절': '2.2.2 1구간 외관조사 결과', '열 헤더': '평면파괴 검토', '캡션(원문)': '평면파괴', '사진 파일': 'y.jpg', '출처': '표39' },
    { '절': '2.2.4 3구간 외관조사 결과', '열 헤더': '', '캡션(원문)': '㉔ 산마루측구 파손', '사진 파일': 'z.jpg', '출처': '표52' },
    { '절': '2.2.5 4구간 외관조사 결과', '열 헤더': '', '캡션(원문)': '㊱  인공구조물(봉분)', '사진 파일': 'w.jpg', '출처': '표60' },
    { '절': '2.2.5 4구간 외관조사 결과', '열 헤더': '', '캡션(원문)': '㊲  1소단측구 체수', '사진 파일': 'v.jpg', '출처': '표61' }
  ]
};
const lp = api.priorParseOrganized(ledgerSample, 'l.json');
check('관리대장 우선: 시설물명은 ledger.시설물명 (출력 이름 인자가 아님)', lp.facilityName === '중부선 14.51K(하남방향) 절토사면');
check('관리대장 우선: 시설물번호 SL2005-0000129', lp.facilityNo === 'SL2005-0000129');
check('관리대장 우선: 연장·높이는 대장 값(480·63), 전차 값(600)으로 덮이지 않음', lp.specs.length === '480' && lp.specs.height === '63' && lp.specSource.length === '관리대장');
check('관리대장 우선: 노선·관리주체·주소·준공년도', lp.specs.route === '고속국도 35호선' && lp.specs.agency.startsWith('한국도로공사') && lp.specs.address === '경상남도 통영시' && lp.specs.completionYear === '2005');
check('준공년도도 대장 값(전차 2004로 덮이지 않음)', lp.specSource.completionYear === '관리대장');
check('시설물 종류는 ledger.시설물종류', lp.facilityType === '절토사면');
check('ledger 원문을 priorRef 에 보존', lp.priorRef.ledger && lp.priorRef.ledger['시설물번호'] === 'SL2005-0000129');
check('prior_damages 가 비면 외관조사 구간 사진 캡션에서 전차 손상 생성 (2.2.1 전차 비교표·검토 그림은 제외)', lp.damageSource === 'photo_captions' && lp.damages.length === 4, lp.damages.map(d => d.damageName).join(' / '));
check('캡션 번호 ⑧→8, ㉔→24 (원문 캡션은 번호만 떼고 그대로)', lp.damages.find(d => d.damageName === '산마루측구 퇴적물 집적').no === '8' && lp.damages.find(d => d.damageName === '산마루측구 파손').no === '24');
check('번호 없는 캡션도 가져오고 구간을 section 으로', lp.damages[0].damageName === '3소단측구 세굴' && lp.damages[0].no === '' && lp.damages[0].section === '1구간');
check('상태양호·인공구조물은 손상에서 제외하고 개수 알림', lp.excludedCaptionCount === 2 && lp.priorRef.excludedCaptions.length === 2);
check('원본 사진 파일명·출처 보존', lp.damages[0].priorPhotoFile === '05_3소단측구_세굴.jpg' && /표33/.test(lp.damages[0].sourceRef));
const lb = api.priorBuildDamage({ id: 'sXXXX9999' }, lp.damages[1], 1, 'now');
check('기존손상: 구간 채움, 번호(externalId) 보존', lb.section === '1구간' && lb.externalId === '8');
const lp2 = api.priorParseOrganized(Object.assign({}, ledgerSample, { ledger: undefined }), 'l2.json');
check('ledger 가 없으면 compare(전차 값)로 보충하고 출처를 전차보고서로 표시', lp2.specs.length === '600' && lp2.specSource.length === '전차보고서');

// ---------------------------------------------------------------- v175: 사진 ZIP 짝 맞추기 · 체크리스트 정렬 · 조사 시작 시 자동 연결
check('PS_BUILD v175 이상', /const PS_BUILD = 'v(17[5-9]|1[89]\d)'/.test(html));
['btnPriorSurvey', 'btnPriorSurveyMenu', 'priorSurveyModal', 'priorPhotoViewer', 'priorLinkBanner'].forEach(id => check('화면 요소 ' + id + ' 있음', html.includes('id="' + id + '"')));
check('손상기록 추가(+손상 추가) 버튼이 전차손상 자동 연결을 호출', html.includes('priorApplyPendingLink(p.damages[p.damages.length - 1])'));
check('손상기록의 "기존 vs 현재 비교" 카드에 전차 사진 줄 표시', html.includes('priorBuildPhotoStrip(linkedExisting, 64)'));
check('보호 함수(openCapture/addPhoto/commitNewMarker/extractPhotoBlobsFromMarkers/hydratePhotoBlobs)에 전차 코드가 섞이지 않음', ['async function openCapture', 'async function addPhoto', 'function commitNewMarker', 'async function extractPhotoBlobsFromMarkers', 'async function hydratePhotoBlobs'].every(h => { const i = html.indexOf(h); if (i < 0) return true; const body = html.slice(i, skip(html, html.indexOf('{', html.indexOf(')', i)))); return !/prior[A-Z]/.test(body); }));
const ctx2 = { priorPendingLink: null, existingDamages: [], String, Array, Object, Set, Map, parseInt, console,
  seedMeasurementItemsFromText: () => { ctx2.seeded = true; }, currentSiteObj: () => ({ id: 'S' }), logActivity: () => {}, priorShowBanner: () => { ctx2.bannerShown = true; } };
vm.createContext(ctx2);
vm.runInContext([extractFn('function priorBaseName('), extractFn('function priorPairZips('), extractFn('function priorSortEds('), extractFn('function priorEdLabel('), extractFn('function priorApplyPendingLink(')].join('\n') +
  '\nthis.api = { priorBaseName, priorPairZips, priorSortEds, priorEdLabel, priorApplyPendingLink };', ctx2);
const a2 = ctx2.api;
check('파일 이름 짝: _사전자료정리.json ↔ _전차손상사진.zip', a2.priorBaseName('중부선14.51K_하남_절토사면_사전자료정리.json') === a2.priorBaseName('중부선14.51K_하남_절토사면_전차손상사진.zip'));
const pj = [{ fileName: 'A_사전자료정리.json' }, { fileName: 'B_사전자료정리.json' }];
const pz = [{ name: 'B_전차손상사진.zip' }, { name: 'A_전차손상사진.zip' }, { name: 'C_전차손상사진.zip' }];
const pp = a2.priorPairZips(pj, pz);
check('여러 시설물: 이름이 같은 것끼리 짝, 남는 ZIP 은 따로 알림', pp.pairs.get(0).name === 'A_전차손상사진.zip' && pp.pairs.get(1).name === 'B_전차손상사진.zip' && pp.unpaired.length === 1 && pp.unpaired[0].name === 'C_전차손상사진.zip');
const p1 = a2.priorPairZips([{ fileName: 'x.json' }], [{ name: '전혀다른이름.zip' }]);
check('JSON 1개 + ZIP 1개는 이름이 달라도 한 쌍', p1.pairs.get(0).name === '전혀다른이름.zip' && p1.unpaired.length === 0);
const p2 = a2.priorPairZips([{ fileName: 'x.json' }, { fileName: 'y.json' }], [{ name: '전혀다른이름.zip' }]);
check('JSON 여러 개인데 이름이 안 맞으면 짝을 억지로 만들지 않음', p2.pairs.size === 0 && p2.unpaired.length === 1);
const sorted = a2.priorSortEds([{ id: 'a', section: '2구간', externalId: '11' }, { id: 'b', section: '1구간', externalId: '8' }, { id: 'c', section: '1구간', externalId: '' }, { id: 'd', section: '1구간', externalId: '3' }, { id: 'e', section: '', externalId: '' }]);
check('체크리스트 정렬: 구간 → 번호 → 입력 순서, 구간 없는 것은 맨 뒤', sorted.map(x => x.id).join('') === 'dbcae', sorted.map(x => x.id).join(''));
check('표시 이름: [번호] 구간 손상명', a2.priorEdLabel({ externalId: '8', section: '1구간', damageName: '산마루측구 퇴적물 집적' }) === '[8] 1구간 산마루측구 퇴적물 집적');
ctx2.existingDamages = [{ id: 'EX1', externalId: '8', section: '1구간', damageName: '산마루측구 퇴적물 집적', measurement: '', cause: '', repairMethod: '배수로청소' }];
const nd = { id: 'd1', damageOrigin: null, existingDamageId: null, component: '', damageType: '', measurement: '' };
check('조사 중인 전차손상이 없으면 새 손상기록을 건드리지 않음', a2.priorApplyPendingLink(nd) === false && nd.existingDamageId === null);
ctx2.priorPendingLink = { edId: 'EX1' };
check('조사 중이면 새 손상기록이 그 전차 손상에 연결되고 내용이 채워짐', a2.priorApplyPendingLink(nd) === true && nd.damageOrigin === 'EXISTING' && nd.existingDamageId === 'EX1' && nd.section === '1구간' && nd.damageType === '산마루측구 퇴적물 집적' && nd.repairMethod === '배수로청소');
check('연결 후 조사 중 상태가 해제됨(다음 손상기록은 연결되지 않음)', ctx2.priorPendingLink === null && a2.priorApplyPendingLink({ id: 'd2' }) === false);
ctx2.priorPendingLink = { edId: 'GONE' };
check('조사 중이던 전차 손상이 삭제됐으면 연결하지 않고 해제', a2.priorApplyPendingLink({ id: 'd3' }) === false && ctx2.priorPendingLink === null);

// 실제 전차자료정리 결과(환경변수 PRIOR_REAL_JSON)가 있으면 그대로 시험
if (process.env.PRIOR_REAL_JSON && fs.existsSync(process.env.PRIOR_REAL_JSON)) {
  const real = api.priorParseOrganized(JSON.parse(fs.readFileSync(process.env.PRIOR_REAL_JSON, 'utf8')), 'real.json');
  check('실제 파일: 오류 없이 읽힘', !real.error, real.error);
  check('실제 파일: 시설물명·번호는 대장', real.facilityName === '중부선 14.51K(하남방향) 절토사면' && real.facilityNo === 'SL2005-0000129');
  if (process.env.PRIOR_SHOW) {
    console.log('  [가져옴]'); real.damages.forEach(d => console.log('   ', d.section, d.no || '-', d.damageName));
    console.log('  [제외]'); real.priorRef.excludedCaptions.forEach(x => console.log('   ', x));
  }
  console.log('  [실제 파일 요약]', JSON.stringify({ specs: real.specs, damages: real.damages.length, excluded: real.excludedCaptionCount, source: real.damageSource, history: real.history.inspection_history.length, quantities: real.priorRef.quantities.length, issues: real.priorRef.issues.length }));
}

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
