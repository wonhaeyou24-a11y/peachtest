/**
 * v130 시험 — 휴대폰(iPhone·iPad·Android)은 촬영창 없이 바로 카메라 앱 → 손상내용 창 / PC 는 예전 촬영창 그대로
 * 실행: node scratch/test_v130.js   (화면 동작은 실브라우저(Android 휴대폰 크기)에서 따로 확인함)
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' - ' + d : ''}`); if (!ok) fail++; };

check('PS_BUILD v130 이상 + 서비스워커 캐시 이름 갱신', /const PS_BUILD = 'v(130|1[4-9]\d)'/.test(html) && /point-shot-v(130|1[4-9]\d)/.test(sw));

// 대상 기기
const fn = html.slice(html.indexOf('function useDirectCameraFlow()'), html.indexOf('let directCapture = null;'));
check('휴대폰 판별: iPhone·iPad·iPod·Android + 아이패드OS(Mac 으로 보이는 터치 기기). PC(Windows/Mac 마우스)는 해당 없음',
  /iPhone\|iPad\|iPod\|Android/.test(fn) && fn.includes("navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1"));
// 판별 함수를 실제로 돌려 본다
const make = (ua, platform, touch) => { const nav = { userAgent: ua, platform, maxTouchPoints: touch }; return new Function('navigator', fn + '; return useDirectCameraFlow();')(nav); };
check('iPhone / Android 휴대폰 → 직접 카메라 흐름', make('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)', 'iPhone', 5) === true && make('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5) === true);
check('아이패드(Mac 으로 보이는 터치) → 직접 카메라 흐름', make('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5) === true);
check('Windows PC · 일반 Mac → 예전 촬영창 그대로', make('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0) === false && make('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0) === false);

// 열기
check('openCapture 는 휴대폰이면 촬영창을 열기 전에 카메라 앱(nativeCameraInput.click)을 동기로 호출하고 끝냄 (await 이전)',
  html.includes('async function openCapture(markerId, opts){') && /if\(useDirectCameraFlow\(\)\)\{\s*directCapture = \{ markerId, justCreated: !!\(opts && opts\.justCreated\), fromPreview: !!\(opts && opts\.fromPreview\) \};\s*pendingNativeCapture = true;\s*nativeCameraInput\.click\(\);[^\n]*\n\s*return;\s*\}\s*captureTitle\.textContent/.test(html));
const openCap = html.slice(html.indexOf('async function openCapture(markerId, opts){'), html.indexOf("captureTitle.textContent = '지점 ' + m.num"));
check('그 앞 구간에 await 가 없음 (iOS 는 사용자 터치 직후가 아니면 카메라 앱을 막음)', !/\bawait\b/.test(openCap.replace(/\/\/[^\n]*/g, '')));
check('새 지점을 찍을 때만 justCreated 로 호출 (이미 있던 지점·검수 이동 등은 아님)', html.includes('openCapture(marker.id, { justCreated: true });') && html.includes("openCapture(activeMarkerId, { fromPreview: true });") && html.includes('openCapture(m.id); }') );

// 받은 뒤
check('사진을 받으면 촬영창 대신 손상내용 창을 연다 (새로 찍은 마지막 사진, 자동 입력칸)', html.includes('function openDetailAfterCapture(markerId){') && html.includes('openDetailAfterCapture(mid);') && html.includes('if(idx >= 0) openPreview(markerId, idx); else openPreview(markerId);'));
check('사진첩에서 선택해도 같은 흐름 (촬영창이 안 열려 있는 휴대폰이면 손상내용 창)', html.includes("(useDirectCameraFlow() && captureModal.style.display !== 'flex')"));
check('손상내용 창 아래줄에 "🖼 사진첩" 버튼 (휴대폰에서만 보임) + "사진 추가 촬영"은 그대로', html.includes('id="btnPickGallery" style="display:none;"') && html.includes("if(useDirectCameraFlow()) btnPickGallery.style.display = '';") && html.includes('id="btnAddMorePhotos">사진 추가 촬영</button>'));

// 취소
check('카메라 앱에서 사진 없이 돌아오면 취소 처리: cancel 이벤트, 파일 0개 change, 돌아온 뒤 1.8초 지나도 파일이 없을 때',
  html.includes("nativeCameraInput.addEventListener('cancel'") && html.includes('if(files.length === 0){ if(directCapture) handleDirectCancel(); return; }') && html.includes('}, 1800);'));
check('사진이 들어오는 중이면(파일이 있으면) 취소로 보지 않음', html.includes('!(nativeCameraInput.files && nativeCameraInput.files.length)'));
check('방금 만든 지점이고 사진이 없을 때만 지움 — 사진이 하나라도 있거나 이미 있던 지점은 절대 지우지 않음',
  html.includes('if(dc.justCreated && m && !(m.photos && m.photos.length)){ discardEmptyNewMarker(dc.markerId); return; }') && html.includes("if(m.photos && m.photos.length) return;          // 사진이 있으면 절대 지우지 않는다"));
check('지운 지점의 번호가 마지막 번호였으면 번호를 되돌림 (빈 번호 방지)', html.includes('if(m.num != null && m.num === nextNum - 1) nextNum--;'));
check('빈 지점 삭제는 서버 삭제 대기열·저장소 정리까지 (Ctrl+Z 지점 찍기 취소와 같은 처리)', html.includes('try{ await idbDeleteInspectionPoint(markerId, true); }catch(e){}') && html.includes('try{ queueMarkerDeleteSync(m); }catch(e){}'));
check('"사진 추가 촬영"에서 취소하면 손상내용 창으로 돌아옴', html.includes('if(dc.fromPreview && m){ openPreview(dc.markerId); return; }'));

// PC 보존
check('PC 촬영창 코드(실시간 카메라·촬영 완료·사진첩·지점 삭제 버튼)는 그대로 남아 있음', ['id="btnShoot"', 'id="btnDoneCapture"', 'id="btnFileFallback"', 'id="btnDeleteInCapture"', 'id="btnNativeCamera"'].every(s => html.includes(s)) && html.includes('function closeCaptureModal()'));

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
