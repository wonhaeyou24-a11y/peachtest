-- PeachShot: ps_projects 팀원 읽기권한 (2026-09-06)
-- Supabase SQL Editor. [A] 먼저 실행해 결과 보고 -> [B] 실행.
-- (이전 버전은 맨 위 주석 줄이 붙여넣기에서 깨졌음 - 이 파일은 첫 줄부터 -- 주석)


-- ============================================================
-- [A] 진단 (읽기 전용) - 4개 쿼리를 하나씩 실행
-- ============================================================

-- A-1. The Avengers 멤버십 + auth.users 매칭
--     (organizations 테이블 소유자 컬럼명은 owner_user_id — owner_id 아님)
SELECT om.organization_id, o.name AS org_name, o.owner_user_id,
       om.email, om.user_id, om.role, om.status,
       au.email AS auth_email_for_user_id,
       (au.id IS NOT NULL) AS user_id_valid
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
LEFT JOIN auth.users au ON au.id = om.user_id
WHERE o.name = 'The Avengers'
ORDER BY om.role, om.email;


-- A-2. 조직 프로젝트 행 소유자
SELECT p.id, p.name, p.organization_id, p.user_id AS owner_user_id,
       ou.email AS owner_email, o.name AS org_name
FROM public.ps_projects p
LEFT JOIN auth.users ou ON ou.id = p.user_id
LEFT JOIN public.organizations o ON o.id = p.organization_id
ORDER BY p.updated_at DESC NULLS LAST;


-- A-3. is_org_member 재현 — 배포된 함수는 소유권을 안 보고 "active 멤버인지"만 확인한다:
--        select exists (select 1 from organization_members
--          where organization_id::text = check_org_id and user_id = auth.uid() and status = 'active')
WITH org AS (
  SELECT id FROM public.organizations WHERE name = 'The Avengers'
), targets AS (
  SELECT au.id AS uid, au.email
  FROM auth.users au
  WHERE au.email ILIKE ANY (ARRAY['kim@gmail.com','hyun@naver.com','wonki@gmail.com'])
)
SELECT t.email, t.uid,
       EXISTS (
         SELECT 1 FROM public.organization_members m
         WHERE m.organization_id::text = (SELECT id::text FROM org)
           AND m.user_id = t.uid
           AND m.status = 'active'
       ) AS is_org_member_result
FROM targets t
ORDER BY t.email;
-- is_org_member_result 가 kim/hyun 에게 false -> A-1 에서 그 사람의 user_id 가
-- NULL/불일치 이거나 status != 'active'. 고치려면 아래 UPDATE:
--   UPDATE public.organization_members m
--     SET user_id = au.id, status = 'active'
--     FROM auth.users au
--    WHERE m.email = au.email
--      AND m.organization_id = (SELECT id FROM public.organizations WHERE name='The Avengers')
--      AND (m.user_id IS DISTINCT FROM au.id OR m.status <> 'active');


-- A-4. ps_projects 현재 정책
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'ps_projects'
ORDER BY cmd, policyname;


-- ============================================================
-- [B] 수정 - ps_projects 에 "프로젝트 경로로 읽기 가능" 정책 추가 (읽기 전용, permissive)
--     쓰기(INSERT/UPDATE/DELETE) 정책은 건드리지 않음 - 소유자만 가능.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ps_projects p
    WHERE p.id = p_project_id
      AND (
        p.user_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id))
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_project(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Projects readable via project/org" ON public.ps_projects;
CREATE POLICY "Projects readable via project/org" ON public.ps_projects
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(id)
  );


-- ============================================================
-- [C] 확인
-- ============================================================
-- A-4 재실행 -> "Projects readable via project/org" (SELECT) 보이면 성공.
-- 그다음 PC(kim) 앱 새로고침(v39) -> "팀원 자료 가져오기" ->
--   진단로그에서 ps_projects RLS 에러 사라지고 도면/지점 일치하는지 확인.
