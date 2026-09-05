const CACHE_NAME = 'point-shot-v30-renderdamage-trim-guard'; // renderDamageRecords facilityType/Form undefined 크래시 가드
// 이 문자열을 바꾸는 이유: index.html이 바뀌어도 이 service-worker.js 파일 자체 텍스트가 그대로면
// 브라우저가 "새 버전"으로 인식하지 못해 새 install/activate가 전혀 실행되지 않는다. 그 경우 기존에
// 홈화면에 추가돼 있던 PWA는 예전 캐시된 index.html(카메라 수정 이전 버전)을 계속 쓰게 된다.
// 버전 문자열을 바꾸면 새 Service Worker가 설치되며 activate에서 아래처럼 이전 이름의 캐시만 정리한다
// (IndexedDB/localStorage 등 앱 데이터는 이 파일이 손대지 않으므로 전혀 영향 없음).

// 앱 자체 실행에 반드시 필요한 파일 — 하나라도 실패하면 설치 자체를 중단해야 함
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './apple-touch-icon.png'
];

// 지도(Leaflet)·ZIP 내보내기(JSZip)·보고서(docx)·클라우드 동기화(Supabase)·
// PDF 도면 읽기(pdf.js)에 필요한 외부 라이브러리.
// 오프라인 현장에서도 핵심 조사 기능이 그대로 동작하도록 서비스워커가 미리 저장해 둔다.
// (핵심 조사 기능은 아니므로, 캐싱에 실패해도 앱 설치 자체는 막지 않는다 — 아래에서 개별 처리)
const VENDOR_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/docx@8.0.4/build/index.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1) 핵심 파일: 실패하면 설치 실패로 처리 (기존 동작 그대로 유지)
      await cache.addAll(CORE_ASSETS);

      // 2) 외부 라이브러리: 하나씩 개별 시도. 첫 설치 시 인터넷이 없어서
      //    일부가 실패하더라도 앱 자체는 정상적으로 설치되어야 하므로
      //    Promise.allSettled로 처리하고 실패는 조용히 넘어간다.
      //    (다음에 인터넷이 연결됐을 때 다시 이 install 로직이 실행되면 채워진다)
      const results = await Promise.allSettled(
        VENDOR_ASSETS.map((url) =>
          fetch(url, { mode: 'cors' }).then((res) => {
            if (res && res.ok) return cache.put(url, res);
            throw new Error('bad response for ' + url);
          })
        )
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn('[SW] 외부 라이브러리 캐싱 실패(다음 온라인 시 재시도됨):', VENDOR_ASSETS[i]);
        }
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // network-first for navigation, cache-first for static assets
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        // 외부 라이브러리(Leaflet/JSZip/docx)는 응답이 오면 캐시에도 채워 넣어
        // 다음 오프라인 실행을 대비한다. 지도 타일(openstreetmap 등)은 대상이 아님.
        const url = event.request.url;
        const isVendor = VENDOR_ASSETS.some((v) => url === v);
        if (isVendor && res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      }).catch((err) => {
        throw err;
      });
    })
  );
});
