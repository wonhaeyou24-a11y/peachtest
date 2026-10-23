/**
 * 기준점(refPoints) 기능 시험 — A. FEATURE TEST
 * 실행: node scratch/test_refpoints.js
 * (실제 화면 동작은 가짜 GPS로 브라우저에서 따로 확인했다: 측정·평균·저장·재시작 후 복원·삭제·취소)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let fail = 0;
function check(name, ok, detail) { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`); if (!ok) fail++; }

// 1. 화면 요소
['fmRefSection', 'fmRefList', 'fmRefStatus', 'fmRefStart', 'fmRefMid', 'fmRefEnd', 'fmRefFinish', 'fmRefCancel']
  .forEach(id => check('요소 ' + id, html.includes('id="' + id + '"')));

// 1-2. 지도에서 직접 지정(GPS가 안 잡히는 곳)
['fmRefPickStart', 'fmRefPickMid', 'fmRefPickEnd'].forEach(id => check('요소 ' + id, html.includes('id="' + id + '"')));
check('지도 지정: 일반 지점 만들기 가로채기(capture)', /mapStage\.addEventListener\('click'[\s\S]*?\}, true\);/.test(html));
check('지도 지정: 확대 단계 제한', /REF_PICK_MIN_ZOOM = 18/.test(html));
check('지도 지정: 기존 지도 클릭 처리는 수정 없음', html.includes("leafletMap.on('click', (e)=>{\n      if(movingMarkerId){"));

// 1-3. 지도 배경 전환(일반/위성)
check('위성 배경 레이어(Esri)', html.includes('World_Imagery/MapServer/tile'));
check('기존 일반 지도 레이어 유지(OSM)', html.includes("L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'"));
check('브이월드 위성(Satellite jpeg)+지명(Hybrid png) 타일 주소', html.includes("'/Satellite/{z}/{y}/{x}.jpeg'") && html.includes("'/Hybrid/{z}/{y}/{x}.png'") && html.includes('https://api.vworld.kr/req/wmts/1.0.0/'));
check('브이월드 인증키는 코드에 넣지 않고 기기(localStorage)에만 저장', html.includes("localStorage.getItem('ps_vworld_key')") && !/vworld\.kr\/req\/wmts\/1\.0\.0\/[A-F0-9]{8}-/i.test(html));
check('타일 실패 시 Esri 로 자동 복귀 안내', html.includes('브이월드 위성 사진을 받지 못했습니다') && html.includes("setBaseMap('esri')"));
check('배경 전환은 지도 초기화에서 한 줄만 호출', (html.match(/installBaseMapToggle\(\);/g) || []).length === 1);

// 2. 연결 지점: 정보 수정에서 보이고, 새 시설물에서는 숨김
check('정보 수정 때 구역 표시', /fmYear\.value = site\.completionYear \|\| '';\s*renderRefPoints\(site\);/.test(html));
check('새 시설물에서는 숨김', /renderRefPoints\(null\);/.test(html));

// 3. 보호 대상 함수 본문은 건드리지 않았는지: refPoints 는 새 블록에서만 쓰인다
const outside = html.replace(/\/\/ ---------- 기준점 \(시설물 시점·종점·중간점\)[\s\S]*?function openFacilityModalForEdit/, 'function openFacilityModalForEdit');
check('새 블록 밖에서 refPoints 를 쓰지 않음(보호 함수 미수정)', !/refPoints/.test(outside.replace(/<!--[\s\S]*?-->/g, '')));

// 4. 평균 계산 (refSummarize 본문을 꺼내 실행)
const m = html.match(/function refSummarize\(samples\)\{[\s\S]*?\n  \}\n/);
check('refSummarize 존재', !!m);
if (m) {
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  const refSummarize = new Function('haversine', m[0] + '; return refSummarize;')(haversine);
  const s1 = refSummarize([{ lat: 37.5, lng: 127, accuracy: 5 }, { lat: 37.5, lng: 127, accuracy: 5 }, { lat: 37.5, lng: 127, accuracy: 5 }]);
  check('같은 점 3개 → 그 점', s1.lat === 37.5 && s1.lng === 127 && s1.spread === 0 && s1.samples === 3, JSON.stringify(s1));
  // 오차가 작은 표본(정확도 값 작음)에 더 가깝게 평균
  const s2 = refSummarize([{ lat: 37.5, lng: 127, accuracy: 3 }, { lat: 37.5001, lng: 127, accuracy: 30 }, { lat: 37.5, lng: 127, accuracy: 3 }]);
  check('정확한 표본에 가중', s2.lat < 37.50005 && s2.lat >= 37.5, 'lat=' + s2.lat);
  check('정확도는 중앙값', s2.accuracy === 3, 'accuracy=' + s2.accuracy);
}

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
