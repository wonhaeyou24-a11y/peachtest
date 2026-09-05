-- ============================================================================
-- PeachShot 테스트 데이터 완전 정리 (2026-09-06)
-- ============================================================================
-- 지금까지 테스트하며 프로젝트 4개 + 시설물 10여 개 + 충돌 390건 + 큐 90건이
-- 뒤엉켜서, 이 상태로는 무엇이 버그이고 무엇이 데이터 문제인지 구분 불가.
-- 클라우드와 두 기기를 모두 깨끗이 비우고 처음부터 다시 시작한다.
--
-- ▶ 순서:
--   1) 아래 SQL 로 클라우드 테스트 데이터 삭제
--   2) 두 기기(모바일/PC) 각각: 앱에서 프로젝트 전부 삭제 →
--      브라우저 설정에서 이 사이트 데이터 삭제(권장) → v30 으로 새로고침
--   3) wonki 가 "조직 프로젝트"로 새 프로젝트 1개 + 시설물 1개 + 도면 1장 생성
--   4) hyun/kim 은 앱에서 그 조직 프로젝트를 "이 기기로 불러오기" (새로 만들지 말 것)
--   5) 같은 시설물에서 각자 지점 몇 개 → 저장 → "팀원 최신자료 가져오기"
-- ============================================================================

-- [A] 무엇을 지울지 먼저 확인 (읽기)
SELECT 'projects' t, count(*) FROM public.ps_projects
UNION ALL SELECT 'facilities', count(*) FROM public.ps_facilities
UNION ALL SELECT 'drawings', count(*) FROM public.ps_drawings
UNION ALL SELECT 'inspection_points', count(*) FROM public.ps_inspection_points
UNION ALL SELECT 'existing_damages', count(*) FROM public.ps_existing_damages
UNION ALL SELECT 'damages', count(*) FROM public.ps_damages
UNION ALL SELECT 'sync_conflicts', count(*) FROM public.ps_sync_conflicts
UNION ALL SELECT 'photo_index', count(*) FROM public.ps_photo_index;

SELECT id, name, organization_id, user_id, updated_at
FROM public.ps_projects ORDER BY updated_at;


-- [B] 전체 삭제 — "The Avengers" 조직/멤버십/초대는 남기고, 조사 데이터만 전부.
--     FK ON DELETE CASCADE 가 걸려 있어 프로젝트만 지워도 하위가 따라 지워지지만,
--     혹시 몰라 자식부터 명시적으로 지운다.
BEGIN;

DELETE FROM public.ps_sync_conflicts;
DELETE FROM public.ps_photo_index;
DELETE FROM public.ps_damages;
DELETE FROM public.ps_existing_damages;
DELETE FROM public.ps_inspection_points;
DELETE FROM public.ps_drawings;
DELETE FROM public.ps_facilities;
DELETE FROM public.ps_projects;

-- 감사 로그도 비우고 싶으면 주석 해제
-- DELETE FROM public.ps_integrity_audit_logs;

COMMIT;


-- [C] Storage 의 사진 파일(ps-photos 버킷)도 비우려면 — SQL 로는 안 되고
--     Supabase 대시보드 > Storage > ps-photos 에서 폴더 전체 선택 후 삭제.
--     (조사 데이터를 다 지웠으니 참조가 없어 남아도 무방하지만, 용량 정리용)


-- [D] 확인 — 전부 0 이어야 함
SELECT 'projects' t, count(*) FROM public.ps_projects
UNION ALL SELECT 'facilities', count(*) FROM public.ps_facilities
UNION ALL SELECT 'inspection_points', count(*) FROM public.ps_inspection_points
UNION ALL SELECT 'sync_conflicts', count(*) FROM public.ps_sync_conflicts;

-- 조직/멤버는 남아있어야 함
SELECT o.name, om.email, om.role, om.status
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
ORDER BY o.name, om.role;
