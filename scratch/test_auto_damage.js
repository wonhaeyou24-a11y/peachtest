/**
 * 촬영 직후 손상 입력칸 자동 열기 시험 — A. FEATURE TEST (v118)
 * 실행: node scratch/test_auto_damage.js   (화면 동작은 실브라우저에서 따로 확인함)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };
check('PS_BUILD v118 이상', /const PS_BUILD = 'v(11[8-9]|1[2-9]\d)'/.test(html));
check('촬영 직후 사진 표시용 집합(freshPhotoIds)이 메모리에만 있음 (저장 데이터에 들어가지 않음)', html.includes('const freshPhotoIds = new Set();') && !/photoObj\.fresh|p\.fresh/.test(html));
check('addPhoto 는 autoDamage 옵션일 때만 표시함 (사진첩 가져오기 등 다른 경로는 영향 없음)', html.includes('if(opts && opts.autoDamage) freshPhotoIds.add(photoId);'));
check('실시간 카메라 촬영·카메라앱/사진 선택 촬영 두 경로 모두 autoDamage 로 호출', html.includes('await addPhoto(activeMarkerId, dataUrl, deviceExif, { autoDamage: true });') && html.includes('await addPhoto(activeMarkerId, dataUrl, exif, { autoDamage: true });'));
check('상세창은 보고 있는 사진에서만, 손상이 없을 때만, 조회전용이 아닐 때만 자동 추가하고 사진당 한 번만 함', html.includes('if(freshPhotoIds.has(p.id) && idx === previewSelIdx){') && html.includes('freshPhotoIds.delete(p.id);') && html.includes("if(!p.damages.length && !document.body.classList.contains('viewer-mode')) addDamageBtn.click();"));
check('자동 추가는 기존 "+ 손상 추가" 버튼 동작을 그대로 사용 (저장·기록목록 갱신 경로 동일)', html.includes("addDamageBtn.click();") );
console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
