/**
 * v129 시험 — 촬영 완료 후 손상 입력칸 바로 열기 / 손상 두 개 생기던 오류 / 모바일 빈 곳 끌기 / 촬영 메모리 정리
 * 실행: node scratch/test_v129.js   (화면 동작은 실브라우저(휴대폰 크기)에서 따로 확인함)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

check('PS_BUILD v129 이상 + 서비스워커 캐시 이름 갱신', /const PS_BUILD = 'v(129|1[3-9]\d)'/.test(html) && /point-shot-v(129|1[3-9]\d)/.test(sw));

// (3) 촬영 직후 손상 입력
check('"촬영 완료"는 새로 찍은 사진이 있을 때 그 사진의 상세창을 연다 (freshPhotoIds 로 판단, 조회전용 제외)',
  html.includes("btnDoneCapture.addEventListener('click', ()=>{") && /if\(freshPhotoIds\.has\(m\.photos\[i\]\.id\)\)\{ idx = i; break; \}/.test(html) && html.includes("if(idx >= 0 && mid && !document.body.classList.contains('viewer-mode')) openPreview(mid, idx);"));
check('"촬영 완료"가 예전의 단순 닫기(closeCaptureModal 직접 연결)로 남아 있지 않음', !html.includes("btnDoneCapture.addEventListener('click', closeCaptureModal);"));
check('촬영창의 "＋ 손상 추가" 버튼: 상세창이 이미 입력칸을 열었으면 한 번 더 열지 않음 (손상 두 개 방지)',
  html.includes('const damagesBefore = (p.damages || []).length;') && html.includes('if((p.damages || []).length > damagesBefore) return;'));
check('이미 손상이 있는 사진의 "＋ 손상 추가 (N개)"는 예전처럼 하나 더 추가 (전/후 개수 비교라서 영향 없음)',
  html.indexOf('const damagesBefore') < html.indexOf("const card = previewGrid.children[idx];"));
check('상세창의 자동 추가는 그대로: 사진당 한 번, 손상이 없을 때만', html.includes('if(freshPhotoIds.has(p.id) && idx === previewSelIdx){') && html.includes("if(!p.damages.length && !document.body.classList.contains('viewer-mode')) addDamageBtn.click();"));

// (2) 모바일 빈 곳 끌기
check('모바일: 화면 바깥으로 밀림 방지(overscroll-behavior:none) + 머리 줄 touch-action:none', html.includes('overscroll-behavior: none !important;') && html.includes('.side-head, .view-switcher, .stage-head { touch-action: none; }'));
check('끌기 방지 장치는 모바일 폭에서만, 한 손가락만, 입력칸·사진 크게 보기·도면/지도·캔버스는 제외', html.includes("window.matchMedia('(max-width: 880px)')") && html.includes('e.touches.length !== 1') && html.includes("input, textarea, select, [contenteditable=\"true\"], #photoLightbox, .stage, #stage, .leaflet-container, canvas"));
check('스크롤할 수 있는 영역(기록 목록 등) 안의 끌기는 막지 않음 (조상 중 overflow auto/scroll + 내용이 넘칠 때)', html.includes('const scrollableAncestor = (el)=>{') && html.includes("el.scrollHeight > el.clientHeight + 1"));
check('touchmove 리스너는 passive:false (preventDefault 가능)', html.includes('}, { passive: false });'));

// (1) 메모리
check('저장이 끝난 사진은 지금 찍는 지점 것만 메모리(p.src)에 두고 나머지는 내려놓음 (blobExtracted 확인된 것만)',
  html.includes('if(mm.id === markerId) return;') && html.includes('if(ph.blobExtracted && ph.src) delete ph.src;'));
check('내려놓기는 저장 성공(blobOk·pointOk·stateOk)일 때만 — 실패하면 메모리의 원본을 그대로 둠', /if\(!blobOk \|\| !pointOk \|\| !stateOk\)\{\s*setSaveIndicator\('pending_retry'\);\s*\} else \{/.test(html));
check('품질 분석용 큰 이미지·캔버스, 촬영 프레임 캔버스를 바로 비움', html.includes('c.width = c.height = 0; hc.width = hc.height = 0;') && html.includes('captureCanvas.width = captureCanvas.height = 0;') && html.includes("img.onload = null; img.src = '';"));
check('촬영 프레임 캔버스를 비운 뒤에도 다음 촬영 때 크기를 다시 잡음', html.includes('captureCanvas.width = w;') && html.includes('captureCanvas.height = h;'));

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
