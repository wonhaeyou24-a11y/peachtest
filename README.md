# PeachShot — 시설물 손상조사 현장앱

이미지(도면·현황도) 또는 실제 지도 위에 조사지점을 찍고, 사진을 촬영하고,
기존손상·신규손상 정보를 입력해 **Word/Excel 보고서**로 출력하는 오프라인 우선 PWA.

**배포 주소**: https://wonhaeyou24-a11y.github.io/peachtest/

## 구조

- 단일 `index.html` (CSS·HTML·JS 전부) — 빌드 시스템 없음
- `service-worker.js` — 오프라인 캐시, PWA
- `manifest.json`, `icons/`, `apple-touch-icon.png` — 홈화면 설치
- 백엔드: Supabase (`ps_projects` / `ps_facilities` / `ps_inspection_points` / `ps-photos`)
- 데이터 원본(Source of Truth)은 IndexedDB. 온라인일 때만 Supabase와 백그라운드 동기화

## 개발 원칙

`.agents/rules/peachshot_regression_protection.md` 를 반드시 따른다 —
핵심 함수 임의 수정 금지, ZERO DATA LOSS, 변경 전 CHANGE IMPACT REPORT,
REG-01~30 + GOLDEN_OFFLINE_TEST 통과.

개발계획: [`docs/통합개발계획_v1.1.md`](docs/통합개발계획_v1.1.md)

## 로컬 실행

정적 파일이라 아무 정적 서버로 열면 된다 (센서·카메라·SW는 `localhost` 또는 HTTPS 필요):

```bash
npx http-server -p 8777 -c-1
# → http://localhost:8777/index.html
```

## 배포

`master` 에 push → `.github/workflows/pages.yml` 이 저장소 루트를 그대로 GitHub Pages에 배포.
최초 1회만 저장소 **Settings → Pages → Source = "GitHub Actions"** 로 설정 필요.
`docs/`·`scratch/` 는 배포에서 제외된다.
