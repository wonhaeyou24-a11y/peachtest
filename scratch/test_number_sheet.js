/**
 * 규모 숫자 입력판 + 직전 손상 복사 시험 — A. FEATURE TEST (v119)
 * 실행: node scratch/test_number_sheet.js   (화면 동작은 실브라우저에서 따로 확인함)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };
check('PS_BUILD v119 이상', /const PS_BUILD = 'v(119|1[2-9]\d)'/.test(html));
check('입력판은 터치 기기(pointer: coarse)에서만 기본으로 켜지고, 저장값(ps_numsheet)으로 켜고 끌 수 있음', html.includes("window.matchMedia('(pointer: coarse)')") && html.includes("localStorage.getItem('ps_numsheet')"));
check('값 칸은 기존 입력칸(valInput)을 그대로 쓰고, 입력판 결과를 change 이벤트로 넣어 기존 저장 경로(commitMeasurement)를 탄다', html.includes("valInput.dispatchEvent(new Event('change', { bubbles: true }))") && html.includes("valInput.addEventListener('change', commitMeasurement);"));
check('데이터 구조(measurementItems 항목·값·단위)와 규모 문자열 생성(syncMeasurementText)은 변경 없음', html.includes("d.measurement = items.length ? items.map(mi => mi.label + ' ' + mi.value + mi.unit).join(', ') : '';"));
check('입력판: 정수 휠·소수 휠·자주 쓰는 값 칩·±버튼·직접 입력·지움·확인', ['nw-wheel','NW_CHIPS','−0.1','+0.1','직접 입력','지움','nw-ok'].every(k => html.includes(k)));
check('스크롤 이벤트가 오지 않는 환경 대비 주기 읽기 + 해제(clearInterval)', html.includes('poll = setInterval(readWheels, 150);') && html.includes('clearInterval(poll)'));
check('휠 위치가 그대로면 값을 덮어쓰지 않음 (소수 둘째 자리 값 보호)', html.includes('if(i === lastI && d === lastD) return;'));
check('값이 비어 있으면 같은 항목의 마지막 입력값에서 시작', html.includes('nwLastKey(opts.title, opts.unit)'));
check('"직전 손상과 같게": 비어 있는 손상칸이 있으면 채우고 없으면 새로 만들며, 규모 값만 비움', html.includes("copyDamageBtn.textContent = '↺ 직전 손상과 같게';") && html.includes("Object.assign({}, mi, { value: '' })") && html.includes('target.existingDamageId = null;'));
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
