-- ============================================================================
-- PeachShot — 팀원이 조직 프로젝트 "행(ps_projects)"을 읽지 못하는 문제  (2026-09-06)
-- ============================================================================
-- 증상(PC/kim 진단로그, 2026-09-06 02:03~02:09):
--   "new row violates row-level security policy for table \"ps_projects\"" 반복.
--   시설물·지점 pull/push 는 정상( merged / points 정상, failed 0 ) 인데
--   프로젝트 행만 계속 튕김.
--
-- 원인 분석:
--   [D] 스크립트에서 ps_facilities / ps_inspection_points / ps_existing_damages /
--   ps_drawings / ps_damages 에는 permissive FOR ALL 정책
--     ( user_id=auth.uid() OR is_org_member(org) OR can_access_project(project_id) )
--   을 추가했지만, ps_projects 에는 추가하지 않았다.
--   ps_projects 의 기존 정책은
--     SELECT:  (org IS NULL AND user_id=auth.uid()) OR (org IS NOT NULL AND is_org_member(org))
--     INSERT:  같은 조건
--     UPDATE:  위 + AND user_id=auth.uid()   ← 소유자만
--   따라서 is_org_member(org) 가 이 계정에서 false 를 반환하면, 팀원은 프로젝트
--   행을 SELECT 조차 못 한다. 클라이언트는 "행이 없다"고 보고 INSERT 를 시도 →
--   INSERT 정책도 is_org_member 라 실패 → 로그의 "violates row-level security".
--
--   시설물/지점 pull 이 되는 이유: 그 테이블들은 can_access_project(project_id)
--   경로가 열려 있어서. can_access_project 는 SECURITY DEFINER 라 내부의
--   is_org_member 호출이 정상 평가된다(호출자 컨텍스트 차이 흡수).
--
-- 조치:
--   [A] 진단 — kim/hyun 의 멤버십·auth 매칭 상태 확인.
--   [B] 수정 — ps_projects 에도 "프로젝트 경로로 읽기 가능" permissive 정책 추가.
--            쓰기(INSERT/UPDATE/DELETE)는 그대로 소유자만 — 팀원은 프로젝트 행을
--            수정할 일이 없고, 앱도 v38 부터 팀원 기기에서는 프로젝트 행을 큐에
--            아예 안 넣는다(iOwnProjectRow 가드).
--
-- ▶ 사용법: Supabase SQL Editor 에서 [A] 먼저 → 결과 보고 → [B] 실행.
-- ============================================================================


-- ============================================================================
-- [A] 진단 (읽기 전용)
-- ============================================================================

-- A-1. The Avengers 조직의 멤버십 + auth.users 매칭
SELECT om.organization_id, o.name AS org_name, o.owner_id,
       om.email, om.user_id, om.role, om.status,
       au.email AS auth_email_for_user_id,
       (au.id IS NOT NULL) AS user_id_valid
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
LEFT JOIN auth.users au ON au.id = om.user_id
WHERE o.name = 'The Avengers'
ORDER BY om.role, om.email;
--  ✅ 기대: 모든 행 user_id_valid = true, status = 'active',
--          auth_email_for_user_id 가 email 과 같음.
--  ❌ user_id 가 NULL / 다른 사람 / status != 'active' 면 그 멤버가 is_org_member 실패.


-- A-2. 조직 프로젝트 행들의 소유자/조직 상태
SELECT p.id, p.name, p.organization_id, p.user_id AS owner_user_id,
       ou.email AS owner_email,
       o.name AS org_name
FROM public.ps_projects p
LEFT JOIN auth.users ou ON ou.id = p.user_id
LEFT JOIN public.organizations o ON o.id = p.organization_id
ORDER BY p.updated_at DESC NULLS LAST;


-- A-3. is_org_member 를 특정 사용자 관점에서 수동 재현
--      (SQL Editor 는 service_role 이라 auth.uid() 가 없으므로 직접 계산)
WITH targets AS (
  SELECT au.id AS uid, au.email
  FROM auth.users au
  WHERE au.email ILIKE ANY (ARRAY['kim@gmail.com','hyun@naver.com','wonki@gmail.com'])
), org AS (
  SELECT id FROM public.organizations WHERE name = 'The Avengers'
)
SELECT t.email, t.uid,
       EXISTS (SELECT 1 FROM public.organization_members m
               WHERE m.organization_id = (SELECT id FROM org)
                 AND m.user_id = t.uid AND m.status = 'active') AS active_member,
       EXISTS (SELECT 1 FROM public.organizations o
               WHERE o.id = (SELECT id FROM org) AND o.owner_id = t.uid) AS is_owner,
       (EXISTS (SELECT 1 FROM public.organization_members m
                WHERE m.organization_id = (SELECT id FROM org)
                  AND m.user_id = t.uid AND m.status = 'active')
        OR EXISTS (SELECT 1 FROM public.organizations o
                   WHERE o.id = (SELECT id FROM org) AND o.owner_id = t.uid)) AS is_org_member_expected
FROM targets t
ORDER BY t.email;
--  ❌ kim / hyun 의 is_org_member_expected = false 면 → A-1 의 멤버십 행이 깨진 것.
--     ( user_id 불일치 또는 status 문제 )  먼저 그걸 고쳐야 함:
--
--     UPDATE public.organization_members m
--       SET user_id = au.id, status = 'active'
--       FROM auth.users au
--      WHERE m.email = au.email
--        AND m.organization_id = (SELECT id FROM public.organizations WHERE name='The Avengers')
--        AND (m.user_id IS DISTINCT FROM au.id OR m.status <> 'active');


-- A-4. ps_projects 에 현재 걸린 정책
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'ps_projects'
ORDER BY cmd, policyname;


-- ============================================================================
-- [B] 수정 — ps_projects 도 "프로젝트 경로로 읽기 가능"하게 (permissive, 읽기 전용)
-- ============================================================================
-- permissive(OR 결합)라 기존 정책에 더해질 뿐, 접근이 좁아지지 않는다.
-- 쓰기 정책(INSERT/UPDATE/DELETE)은 건드리지 않음 — 팀원은 프로젝트 행을
-- 만들거나 고치지 못하고, 소유자만 가능 (기존과 동일).

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

-- (선택) 팀원이 조직 프로젝트를 처음 만들 수 있어야 한다면 — 지금 워크플로우는
-- "조직원이 미리 프로젝트 생성 → 팀원은 불러오기만" 이므로 필요 없음. 필요 시:
--   DROP POLICY IF EXISTS "Projects insertable by org members" ON public.ps_projects;
--   CREATE POLICY "Projects insertable by org members" ON public.ps_projects
--     FOR INSERT TO authenticated
--     WITH CHECK (
--       (organization_id IS NULL AND user_id = auth.uid())
--       OR (organization_id IS NOT NULL AND public.is_org_member(organization_id) AND user_id = auth.uid())
--     );


-- ============================================================================
-- [C] 확인
-- ============================================================================
-- A-4 를 다시 실행 → "Projects readable via project/org" (SELECT) 가 보여야 함.
-- 그다음 PC(kim) 앱 새로고침(v38) → "팀원 자료 가져오기" → 진단로그에서
--   - "new row violates row-level security policy for table ps_projects" 가 사라지고
--   - pull 병합 결과의 도면수 / 지점수가 모바일과 일치하는지 확인.
