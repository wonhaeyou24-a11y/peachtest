/**
 * 손상명 라이브러리 시험 — A. FEATURE TEST (v120)
 * 실행: node scratch/test_damage_library.js
 * index.html 의 실제 함수(dmLibraryEffective, getMeasurementFields, dmNormalizeMeasurementItems, syncMeasurementText)를 꺼내 실제 기준DB(STANDARD_DB)로 돌린다.
 * 화면 동작(라이브러리 화면·부위 묶기·상태양호 안내)은 실브라우저에서 따로 확인함.
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

function skip(src, j) {   // 중괄호 짝 맞춰 끝 위치를 찾는다 (문자열·주석 건너뜀)
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
function extractConst(header) { const i = html.indexOf(header); if (i < 0) throw new Error('없음: ' + header); const j = html.indexOf(header.endsWith('[') ? '[' : '{', i + header.length - 1); const end = skip(html, j); return html.slice(i, end) + ';'; }

// ---------------------------------------------------------------- 정적 확인
check('PS_BUILD v120 이상', /const PS_BUILD = 'v(12[0-9]|1[3-9]\d)'/.test(html));
check('여러 형식에 한 번에 담기: 다른 형식 후보·보관(dmPendingForms)·저장 3종에서 함께 저장', ['const dmPendingForms = new Map()', "dmFlushPendingForms('project')", "dmFlushPendingForms('global')", "dmFlushPendingForms('org', orgId)", 'dmLoadFormData(type, form)'].every(k => html.includes(k)));
check('읽는 지점 하나: getMeasurementFields 가 라이브러리를 먼저 봄', html.includes('const lib = dmLibraryEffective().get(damageType); if(lib && lib.fields.length) return lib.fields;'));
check('라이브러리 저장소는 이 기기 저장소 키(point-shot-damage-library) + 시작 시 불러옴', html.includes("const DAMAGE_LIBRARY_KEY = 'point-shot-damage-library';") && (html.match(/loadDamageLibrary\(\)/g) || []).length >= 3);
check('손상마스터 화면: 라이브러리 버튼·부위별 "손상명 가져오기"·카드의 "규모 변경"', ['btnOpenDamageLibrary', '📚 손상명 가져오기', 'dm-scale-btn', 'window.dmPickFromLibrary', 'window.openDamageLibrary'].every(k => html.includes(k)));
check('부위 묶음에서 손상명을 모두 빼도 부위가 남도록 빈 자리표시 항목을 둠', html.includes('손상명을 모두 뺀 부위도 부위 자체는 남도록'));
check('상태양호: 부위만 있고 손상명이 없으면 표시(목록·복사·Word)', (html.match(/상태양호/g) || []).length >= 6 && html.includes("d.damageType || (d.component ? '상태양호' : '(손상명 없음)')"));
check('규모 항목 3개 이상이면 3번째부터 값이 빈 칸은 접음', html.includes('규모 항목 더 보기') && html.includes('fi >= 2 &&'));

check('v123: 손상명 카드의 "사용함" 체크박스 대신 삭제 버튼 (손상명이 있는 카드만, 삭제 전 확인, 부위는 남김)', !/<input type="checkbox" \$\{item\.enabled !== false/.test(html) && html.includes('dm-del-btn') && html.includes("dmCurrentData.splice(i, 1);") && html.includes("손상명을 모두 삭제해도 부위는 남도록"));

// ---------------------------------------------------------------- 실제 함수 실행
const STANDARD_DB = new Function('return ' + extractConst('const STANDARD_DB = {').replace(/^const STANDARD_DB = /, '').replace(/;$/, ''))();
const MEASUREMENT_TEMPLATES = new Function('return ' + extractConst('const MEASUREMENT_TEMPLATES = {').replace(/^const MEASUREMENT_TEMPLATES = /, '').replace(/;$/, ''))();
const DM_LABEL_PRESETS = new Function('return ' + extractConst('const DM_LABEL_PRESETS = [').replace(/^const DM_LABEL_PRESETS = /, '').replace(/;$/, ''))();
function build(state) {
  const scope = { STANDARD_DB, MEASUREMENT_TEMPLATES, DM_LABEL_PRESETS, globalDamageMaster: state.global || {}, orgDamageMasterCache: {}, projects: state.projects || [], currentProjectId: state.pid || null,
    damageLibrary: state.library || {}, Date, Array, Object, Set, Map, JSON, currentSiteObj: () => null, resolveDamageStandard: () => null };
  const proxy = new Proxy(scope, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (k in globalThis ? globalThis[k] : undefined))), set: (t, k, v) => { t[k] = v; return true; } });
  const names = ['dmNormLabel', 'dmFieldDef', 'dmLibraryEffective', 'getMeasurementFields', 'dmNormalizeMeasurementItems', 'syncMeasurementText', 'dmApplyPickToData', 'dmDiffSets', 'dmDiffIsEmpty', 'dmDiffLines', 'dmCleanupChecks', 'dmSetStats'];
  // v125 의 차이 계산이 쓰는 한 줄 도우미 (index.html 의 const 화살표 함수와 같은 내용)
  const consts = "const dmEntryKey = it => (it.component || '').trim() + '\\u0001' + (it.damageType || ''); const dmScaleText = it => (it.measurementFields || []).map(f => dmNormLabel(f.label) + '(' + f.defaultUnit + ')').join('+'); const dmTextSig = it => JSON.stringify([it.cause || '', it.repairOptions || [], it.reinforcementOptions || [], it.investigationItems || '']); const dmFieldsText = o => (o && Array.isArray(o.fields) ? o.fields.map(f => f.label).join('+') : '') || '기본';";
  const body = `with(__p){ let dmLibCache = null; function dmLibInvalidate(){ dmLibCache = null; }\n${consts}\n${names.map(n => extractFn('function ' + n + '(')).join('\n')}\n return { ${names.join(', ')}, dmLibInvalidate }; }`;
  return new Function('__p', body)(proxy);
}
let t = build({});
const lib = t.dmLibraryEffective();
const labels = n => lib.get(n).fields.map(f => f.label).join('+');
check('기준DB에서 서로 다른 손상명 61개로 정리됨 (131건 → 61개)', lib.size === 61, String(lib.size));
check('유실 = 너비+길이+깊이+개소 (두 설정의 합집합)', labels('유실') === '너비+길이+깊이+개소', labels('유실'));
check('누수 = 너비+길이+개소 ("수량"은 "개소"로 통일)', labels('누수') === '너비+길이+개소', labels('누수'));
check('어느 손상명에도 "수량" 항목이 남지 않음', [...lib.values()].every(r => r.fields.every(f => f.label !== '수량' && f.type !== 'dm:수량')));
check('규모 설정이 원래 없던 손상명은 그대로 비어 있음 (전도·활동 등 8개)', [...lib.values()].filter(r => !r.fields.length).length === 8, String([...lib.values()].filter(r => !r.fields.length).length));
check('개소 항목은 단위 EA, 폭은 mm 기본 (단위 바꾸기용 보조 단위 포함)', lib.get('균열').fields.find(f => f.label === '폭').defaultUnit === 'mm' && lib.get('유실').fields.find(f => f.label === '개소').defaultUnit === 'EA' && lib.get('균열').fields.find(f => f.label === '길이').units.includes('cm'));

// getMeasurementFields
check('getMeasurementFields: 유실은 어느 시설물 형식에서도 4항목', t.getMeasurementFields('유실', { facilityType: '절토사면', facilityForm: '토사사면' }).length === 4 && t.getMeasurementFields('유실', { facilityType: '옹벽', facilityForm: '보강토 옹벽' }).length === 4);
check('getMeasurementFields: 규모가 비어 있는 손상명은 예전처럼 키워드 추정으로 대체', t.getMeasurementFields('전도', null) === MEASUREMENT_TEMPLATES.general.fields || t.getMeasurementFields('전도', null).length >= 1);
check('getMeasurementFields: 목록에 없는 손상명(직접 입력 등)은 예전과 같이 범용 칸', t.getMeasurementFields('아무거나', null) === MEASUREMENT_TEMPLATES.general.fields);

// 사용자가 라이브러리에서 바꾼 것 / 직접 등록
t = build({ library: { '균열': { fields: [{ label: '길이', unit: 'm' }, { label: '폭', unit: 'mm' }, { label: '깊이', unit: 'm' }] }, '배수로 막힘': { custom: true, fields: [{ label: '길이', unit: 'm' }, { label: '개소', unit: 'EA' }] }, '규모없는신규': { custom: true, fields: [] } } });
let lib2 = t.dmLibraryEffective();
check('라이브러리에서 바꾼 규모가 기준값을 통째로 대신함 (균열 = 길이+폭+깊이)', lib2.get('균열').fields.map(f => f.label).join('+') === '길이+폭+깊이' && lib2.get('균열').overridden === true);
check('직접 등록한 손상명이 목록에 추가됨 (62개 + 규모 없는 신규 1개 = 63개)', lib2.get('배수로 막힘').custom === true && lib2.size === 63, String(lib2.size));
check('직접 등록한 손상명의 규모가 현장 입력에 쓰임', t.getMeasurementFields('배수로 막힘', null).map(f => f.label).join('+') === '길이+개소');
check('규모를 하나도 안 고른 신규 손상명은 범용 칸으로 대체', t.getMeasurementFields('규모없는신규', null) === MEASUREMENT_TEMPLATES.general.fields);

// 프로젝트 마스터의 사용자 항목도 합집합에 들어감
t = build({ pid: 'P', projects: [{ id: 'P', damageMaster: { '옹벽': { '콘크리트 옹벽': [{ damageType: '신규균열형', component: '전면부', measurementFields: [{ type: 'dm:길이', label: '길이', defaultUnit: 'm', units: ['m'] }] }] } } }] });
check('프로젝트 마스터에만 있는 손상명도 라이브러리에 나타남', t.dmLibraryEffective().has('신규균열형') && t.dmLibraryEffective().size === 62);

// 수량 -> 개소 통일 (기존 입력값 보존)
t = build({});
const d = { damageType: '누수', measurementItems: [{ type: 'dm:수량', label: '수량', value: '3', unit: 'EA' }, { type: 'dm:길이', label: '길이', value: '2', unit: 'm' }] };
t.syncMeasurementText(d);
check('예전 "수량 3EA" 입력값은 "개소 3EA" 로 옮겨져 규모 문자열에 그대로 들어감', d.measurementItems.some(mi => mi.type === 'dm:개소' && mi.value === '3') && /개소 3EA/.test(d.measurement) && /길이 2m/.test(d.measurement), d.measurement);
const d2 = { damageType: '누수', measurementItems: [{ type: 'dm:수량', label: '수량', value: '9', unit: 'EA' }, { type: 'dm:개소', label: '개소', value: '4', unit: 'EA' }] };
t.dmNormalizeMeasurementItems(d2);
check('수량과 개소 값이 둘 다 있으면 개소 값을 남기고 옛 수량 칸만 정리', d2.measurementItems.length === 1 && d2.measurementItems[0].value === '4');
const d3 = { damageType: '균열', measurementItems: [{ type: 'dm:길이', label: '길이', value: '1.5', unit: 'm' }] };
t.syncMeasurementText(d3);
check('수량이 없는 일반 기록은 문자열이 예전과 같음 ("길이 1.5m")', d3.measurement === '길이 1.5m', d3.measurement);

// ---- v121: 부위 묶기 적용 (현재 형식·다른 형식 공통 함수) ----
t = build({});
const base = [{ damageType: '균열', component: '전면부' }, { damageType: '박리', component: '전면부' }, { damageType: '이물질 집적', component: '배수시설' }];
const r1 = t.dmApplyPickToData(base, '전면부', ['유실'], []);
check('담기: 라이브러리의 규모(유실=4항목)와 부위를 가진 새 항목이 추가됨', r1.length === 4 && r1[3].damageType === '유실' && r1[3].component === '전면부' && r1[3].measurementFields.length === 4 && r1[3].enabled === true);
check('담기: 이미 있는 손상명은 중복해서 담지 않음 (다른 형식에 이미 있을 때)', t.dmApplyPickToData(r1, '전면부', ['유실', '균열'], []).length === 4);
const r2 = t.dmApplyPickToData(base, '전면부', [], ['균열']);
check('빼기: 그 부위의 그 손상명만 빠지고 다른 부위·다른 손상명은 그대로', r2.length === 2 && !r2.some(x => x.damageType === '균열') && r2.some(x => x.damageType === '이물질 집적') && r2.some(x => x.damageType === '박리'));
const r3 = t.dmApplyPickToData(base, '배수시설', [], ['이물질 집적']);
check('빼기: 손상명을 모두 빼도 부위는 빈 자리표시 항목으로 남음 (현장에서 부위만 고르면 상태양호)', r3.some(x => x.component === '배수시설' && x.damageType === '') && r3.length === 3);
const r4 = t.dmApplyPickToData(base, '전면부', ['유실'], ['균열']);
check('추가와 빼기를 한 번에 해도 됨', r4.some(x => x.damageType === '유실') && !r4.some(x => x.damageType === '균열'));
check('원본 배열은 바뀌지 않음 (다른 형식 보관용 복사본만 바뀜)', base.length === 3 && base[0].damageType === '균열');

// ---- v125: 손상마스터 버전 (차이 계산·정리 점검) ----
const mkE = (comp, name, extra) => Object.assign({ damageType: name, component: comp, cause: '', repairOptions: [], measurementFields: [] }, extra || {});
const setA = { library: {}, forms: { '옹벽': { '콘크리트 옹벽': [mkE('전면부', '균열', { cause: 'A' }), mkE('전면부', '박리'), mkE('배수시설', '이물질 집적')] } } };
const setB = { library: { '배수로 막힘': { custom: true, fields: [{ label: '길이', unit: 'm' }] }, '유실': { fields: [{ label: '너비', unit: 'm' }] } },
  forms: { '옹벽': { '콘크리트 옹벽': [mkE('전면부', '균열', { cause: 'B' }), mkE('전면부', '유실'), mkE('배수시설', '이물질 집적', { measurementFields: [{ label: '길이', defaultUnit: 'm' }] })] } } };
t = build({});
const df = t.dmDiffSets(setA, setB);
check('차이: 직접 등록한 손상명만 "추가", 기본 손상명의 규모 수정은 "규모 변경"', df.library.added.join() === '배수로 막힘' && df.library.changed.length === 1 && df.library.changed[0].name === '유실' && df.library.changed[0].from === '기본' && df.library.removed.length === 0, JSON.stringify(df.library));
const f0 = df.forms[0];
check('차이: 형식별 항목의 추가(유실)·삭제(박리)·변경(균열 문구, 이물질 집적 규모)', f0.added.map(x => x.damageType).join() === '유실' && f0.removed.map(x => x.damageType).join() === '박리' && f0.changed.map(c => c.it.damageType + ':' + c.what.join('/')).sort().join() === '균열:원인·보수 문구,이물질 집적:규모', JSON.stringify({ a: f0.added.length, r: f0.removed.length, c: f0.changed.map(c => c.it.damageType + ':' + c.what.join('/')) }));
check('차이: 개수 집계 (추가 2 · 삭제 1 · 변경 3)', df.counts.added === 2 && df.counts.removed === 1 && df.counts.changed === 3, JSON.stringify(df.counts));
check('차이: 같은 세트끼리는 차이 없음', t.dmDiffIsEmpty(t.dmDiffSets(setA, JSON.parse(JSON.stringify(setA)))));
check('차이 문장: [라이브러리]·[종류 / 형식] 머리말', t.dmDiffLines(df).some(l => l.startsWith('[라이브러리] 추가: 배수로 막힘')) && t.dmDiffLines(df).some(l => l.startsWith('[옹벽 / 콘크리트 옹벽] 삭제: 전면부 · 박리')), JSON.stringify(t.dmDiffLines(df)));
check('라이브러리에서 사라진 직접 등록 항목은 "삭제", 규모 수정이 사라지면 "기본으로"', t.dmDiffSets(setB, setA).library.removed.join() === '배수로 막힘' && t.dmDiffSets(setB, setA).library.changed.some(c => c.name === '유실' && c.to === '기본'));
const ckSet = { library: { '미사용등록': { custom: true, fields: [] } }, forms: { '옹벽': { 'A': [mkE('전면부', '배수공 불량', { cause: 'x' }), mkE('전면부', '배수공불량', { cause: 'y' }), mkE('빈부위', ''), mkE('기타부', '균열', { cause: 'x' })], 'B': [mkE('기타부', '균열', { cause: 'z' })] } } };
const ck = t.dmCleanupChecks(ckSet);
check('정리 점검: 띄어쓰기만 다른 비슷한 이름 묶음', ck.similar.length === 1 && ck.similar[0].includes('배수공 불량') && ck.similar[0].includes('배수공불량'), JSON.stringify(ck.similar));
check('정리 점검: 손상명 없는 부위 / 라이브러리에만 있는 손상명 / 형식별 문구가 다른 손상명', ck.emptyParts.join() === '옹벽 / A · 빈부위' && ck.unused.join() === '미사용등록' && ck.textDiffs.some(x => x.startsWith('균열 (2곳')), JSON.stringify({ e: ck.emptyParts, u: ck.unused, t: ck.textDiffs }));
const stt = t.dmSetStats(ckSet);
check('통계: 손상명 수·항목 수·형식 수', stt.entries === 4 && stt.forms === 2 && stt.library === 1 && stt.names === 4, JSON.stringify(stt));
check('v125: 버전 저장·되돌리기·파일 내보내기/가져오기 화면 요소', ['window.openDmVersions', 'btnOpenDmVersions', 'dmCreateVersion', 'dmRestoreSet', 'kind !== DM_FILE_KIND', '정리 전 상태 (자동 보관)', '되돌리기 직전 (자동 보관)'].every(k => html.includes(k)));

// ---- v127: 라이브러리 수정 (기본 문구 덮어쓰기·불안정 수정) ----
t = build({ library: { '균열': { defaults: { cause: '내가 고친 원인', repairOptions: ['A보수', 'B보수'], reinforcementOptions: [] } }, '유실': { fields: [{ label: '너비', unit: 'cm' }], defaults: { cause: '유실 원인' } }, '내이름': { custom: true, fields: [], defaults: { cause: '신규 원인' } } } });
const le = t.dmLibraryEffective();
check('기본 문구: 라이브러리에서 고친 값이 기준DB 기본 문구보다 우선', le.get('균열').base.cause === '내가 고친 원인' && le.get('균열').base.repairOptions.join() === 'A보수,B보수');
check('기본 문구만 고쳐도 규모(기준값)는 그대로 (균열 = 폭+길이)', le.get('균열').fields.map(f => f.label).sort().join('+') === '길이+폭', le.get('균열').fields.map(f => f.label).join('+'));
check('직접 등록 항목의 기본 문구도 base 로 쓰임', le.get('내이름').base.cause === '신규 원인');
check('규모 단위 수정(유실 너비 cm)이 현장 입력 규모에 반영', t.getMeasurementFields('유실', null).length === 1 && t.getMeasurementFields('유실', null)[0].defaultUnit === 'cm');
const nb = t.dmApplyPickToData([], '전면부', ['균열', '내이름'], []);
check('부위에 담을 때 고친 기본 문구가 들어감 (원인·보수)', nb.find(x => x.damageType === '균열').cause === '내가 고친 원인' && nb.find(x => x.damageType === '균열').repairOptions.join() === 'A보수,B보수' && nb.find(x => x.damageType === '내이름').cause === '신규 원인');
check('v127: 라이브러리 화면 — 수정 창(이름·규모 복수 선택·단위·순서·기본 문구)과 저장 시 한 번만 쓰기', ['function dlcOpenEditor(', 'function dlcScaleEditor(', 'function dlcRenameCustom(', 'id="deSave"', 'if(busy) return;', '눌러도 저장하지 않으므로 연속으로 눌러도 빠지지 않는다'].every(k => html.includes(k)));
check('v127: 칩을 누를 때마다 저장하던 예전 방식 제거 (dlcSetFields·dlcChipsRow 없음)', !html.includes('dlcSetFields') && !html.includes('dlcChipsRow'));
check('v127: 터치 칸 40px 안팎 (버튼 min-height 40/38px)', html.includes("const DLC_BTN = 'min-height:40px;") && html.includes('min-height:40px; padding:8px 14px; font-size:14px;'));
check('v128: 라이브러리 창은 전체 화면 (width/height 100%, 둥근 모서리 없음)이고 설명 문장 상자가 없음', html.includes('max-width:none; width:100%; height:100%; max-height:none; border-radius:0;') && !/damageLibraryModal[\s\S]{0,1800}std-ref-note/.test(html.slice(html.indexOf("window.openDamageLibrary = function"), html.indexOf("window.openDamageLibrary = function") + 2600)));
check('v128: 검색·새 손상명 버튼·닫기가 한 줄 머리글에, 새 손상명 등록 상자는 접혀 있다가 버튼으로 펼침 (등록하면 다시 접음)', html.includes('id="dlcAddToggle"') && html.includes('id="dlcAdd" style="display:none;') && html.includes("ab.style.display = 'none';   // 등록하면 상자를 접어 목록 공간을 돌려준다"));
check('v128: 목록은 남는 공간 전부(flex:1; min-height:0)를 쓰고 넓은 화면에서는 여러 열(grid auto-fill)', html.includes('id="dlcList" style="flex:1; min-height:0; overflow-y:auto;') && html.includes('grid-template-columns:repeat(auto-fill, minmax(340px, 1fr))'));

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
