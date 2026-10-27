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
  const names = ['dmNormLabel', 'dmFieldDef', 'dmLibraryEffective', 'getMeasurementFields', 'dmNormalizeMeasurementItems', 'syncMeasurementText', 'dmApplyPickToData'];
  const body = `with(__p){ let dmLibCache = null; function dmLibInvalidate(){ dmLibCache = null; }\n${names.map(n => extractFn('function ' + n + '(')).join('\n')}\n return { ${names.join(', ')}, dmLibInvalidate }; }`;
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

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
