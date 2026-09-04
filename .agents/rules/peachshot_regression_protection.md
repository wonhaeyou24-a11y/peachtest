# PeachShot 개발 원칙 & Regression Protection Guidelines (PEACHSHOT_STABLE_BASELINE)

## 1. CURRENT STABLE BASELINE 원칙
- 현재 정상 동작이 검증된 버전을 `PEACHSHOT_STABLE_BASELINE`으로 간주하며, 임의의 아키텍처 변경 및 기능 삭제를 엄격히 금지합니다.
- **핵심 보호 대상 (Regression Protected Features)**:
  - 로그인, 조직, 조직 멤버, 초대
  - 프로젝트/시설물/도면 생성, 선택, 복원
  - 도면 모드 / 지도 모드 / GPS 지점 마킹 및 번호/좌표 관리
  - 카메라 호출 및 사진 촬영 체인 (사용자 제스처 동기 유지)
  - 사진 Blob 전용 스토어(`photoBlobs`) 영구 저장 및 메타데이터 동기화
  - 손상정보 입력, 기존 손상정보, 메모
  - 오프라인 작업 및 앱 재실행 시 100% 무손실 복원
  - IndexedDB v3 (kv, photoBlobs, inspectionPoints) & localStorage fallback migration
  - 온라인 재연결, Supabase 동기화, RLS, 조직 데이터 격리
  - Service Worker 캐시 분리, Standalone PWA 호환

---

## 2. 변경 범위 최소화 원칙 & Patch-Based 수정
- 버그 수정이나 기능 개발 시 반드시 **최소 코드만 수정**합니다.
- 관련 없는 대규모 영역의 리팩터링 및 전체 파일 재작성을 금지합니다.
- 코드를 수정하기 전 반드시 **CHANGE IMPACT REPORT**를 선행 작성합니다.

---

## 3. 정상 기능 임의 리팩터링 금지 (Protected Core Functions)
수정 요청과 직접 관련이 없는 경우 아래 핵심 함수의 수정을 엄격히 금지합니다.
- `storageGet`, `storageSet`, `openIDB`
- `idbPutInspectionPoint`, `idbDeleteInspectionPoint`, `idbGetAllInspectionPoints`
- `idbPutPhotoBlob`, `idbGetPhotoBlob`, `idbDeletePhotoBlob`
- `extractPhotoBlobsFromMarkers`, `hydratePhotoBlobs`
- `commitNewMarker`, `openCapture`, `addPhoto`
- `loadState`, `loadSite`, `saveState`, `performSaveState`, `commitLiveToCurrentSite`
- `restoreInspectionPointsFromDurableStore`, `initPeachShotApp`
- `pushProjectToCloud`, `pullEntityChanges`, `syncSingleEntity`, `queueCloudSync`

---

## 4. ZERO DATA LOSS & 실패 시 DELETE 금지
- 네트워크 단절, 앱 강제 종료, 브라우저/PWA 종료, 저장 지연, Sync 충돌 시에도 기존 데이터는 100% 보존되어야 합니다.
- 저장 또는 Sync 실패를 이유로 기존 지점, 사진, 도면, 시설물, 프로젝트, 손상정보를 자동 삭제하지 않으며 `pending_retry`, `sync_pending`, `conflict` 상태로 보존합니다.

---

## 5. 필수 회귀 검증 및 표준 완료 보고 체계
- 모든 개발 작업은 **A. FEATURE TEST** 및 **B. REGRESSION TEST (REG-01 ~ REG-30)**와 **PEACHSHOT_GOLDEN_OFFLINE_TEST**가 모두 PASS되어야 완료됩니다.
- 완료 보고는 지정된 15개 섹션 표준 보고 형식을 준수합니다.
