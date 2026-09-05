-- ============================================================================
-- PeachShot 팀 동기화 RLS 점검 & 수정  (2026-09-06)
-- ============================================================================
-- 증상: 모바일(wonki@gmail.com, 조직 Owner/Admin)에서 저장 시 동기화 대기열이
--       안 빠지고, 진단로그에 아래가 반복됨:
--         "new row violates row-level security policy for table ps_inspection_points"
--
-- ps_inspection_points / ps_facilities / ps_existing_damages 의 RLS 정책은
--   user_id = auth.uid()
--   OR (organization_id IS NOT NULL AND is_org_member(organization_id))
--   OR (그 프로젝트가 내 것이거나 내가 멤버인 조직 것)
-- 이다. 즉 "남이 만든 지점"을 수정하려면 그 행(또는 프로젝트)에
-- organization_id 가 채워져 있어야 하고, 내가 그 조직의 활성 멤버여야 한다.
--
-- 가장 흔한 원인: 프로젝트/시설물/지점 행의 organization_id 가 NULL
--               (개인 프로젝트로 만들어졌다가 조직으로 옮겨졌거나,
--                클라이언트가 organization_id 를 안 올렸음).
--
-- ▶ 사용법: Supabase 대시보드 > SQL Editor 에서 [A] 진단부터 실행 → 결과 보고
--          [B]~[D] 는 진단 결과에 따라 골라 실행.
-- ============================================================================


-- ============================================================================
-- [A] 진단 (읽기만 함 — 안전하게 먼저 실행)
-- ============================================================================

-- A-1. 내 조직 멤버십 상태 (SQL Editor 는 보통 service_role 이라 auth.uid()가 없음.
--      아래는 이메일로 직접 조회)
SELECT om.organization_id, o.name AS org_name,
       om.email, om.user_id, om.role, om.status,
       au.email AS auth_email_for_that_user_id
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
LEFT JOIN auth.users au ON au.id = om.user_id
WHERE om.email ILIKE ANY (ARRAY['wonki@gmail.com','hyun@naver.com','kim@gmail.com'])
   OR o.name = 'The Avengers'
ORDER BY o.name, om.role;
--  ✅ 기대: 세 명 모두 user_id 가 채워져 있고(auth.users 와 매칭), status='active'.
--  ❌ 문제: user_id 가 NULL 이거나, status 가 'invited'/'revoked' 이면 → [B] 실행.


-- A-2. "테스트" 프로젝트와 시설물의 organization_id 채워져 있는지
SELECT 'project' AS kind, p.id, p.name, p.organization_id, p.user_id,
       (p.organization_id IS NULL) AS org_id_누락
FROM public.ps_projects p
WHERE p.name = '테스트'
UNION ALL
SELECT 'facility', f.id, f.name, f.organization_id, f.user_id,
       (f.organization_id IS NULL)
FROM public.ps_facilities f
JOIN public.ps_projects p ON p.id = f.project_id
WHERE p.name = '테스트';
--  ❌ org_id_누락 = true 인 행이 있으면 → [C] 실행.


-- A-3. 지점/기존손상 행의 organization_id 누락 개수
SELECT p.name AS project,
       count(*) FILTER (WHERE ip.organization_id IS NULL) AS 지점_org누락,
       count(*)                                           AS 지점_전체
FROM public.ps_inspection_points ip
JOIN public.ps_projects p ON p.id = ip.project_id
WHERE p.name = '테스트'
GROUP BY p.name;

SELECT p.name AS project,
       count(*) FILTER (WHERE ed.organization_id IS NULL) AS 기존손상_org누락,
       count(*)                                           AS 기존손상_전체
FROM public.ps_existing_damages ed
JOIN public.ps_projects p ON p.id = ed.project_id
WHERE p.name = '테스트'
GROUP BY p.name;
--  ❌ org누락 > 0 이면 → [C] 실행.


-- A-4. 함수가 실제로 어떻게 동작하는지 (특정 사용자 기준으로 흉내내 확인)
--      wonki 의 user_id 를 A-1 결과에서 복사해 넣고 실행
--      (SECURITY DEFINER 함수라 SQL Editor 에서 auth.uid() 가 NULL 이므로
--       아래처럼 조건을 직접 풀어서 확인)
WITH me AS (SELECT id AS uid FROM auth.users WHERE email = 'wonki@gmail.com')
SELECT
  o.id AS org_id,
  EXISTS (SELECT 1 FROM public.organization_members m, me
          WHERE m.organization_id = o.id AND m.user_id = me.uid AND m.status='active')
    AS 멤버로_인정,
  EXISTS (SELECT 1 FROM public.organizations x, me
          WHERE x.id = o.id AND x.owner_user_id = me.uid)
    AS 오너로_인정
FROM public.organizations o
WHERE o.name = 'The Avengers';
--  ✅ 둘 중 하나라도 true 여야 is_org_member 가 true 를 반환.
--  ❌ 둘 다 false → [B] 실행(멤버십 문제).


-- ============================================================================
-- [B] 멤버십 수정 — A-1 / A-4 에서 user_id 누락 또는 status 문제일 때
-- ============================================================================

-- (주의: 배포된 organization_members 테이블에는 updated_at 컬럼이 없어서
--        아래 UPDATE 들은 updated_at 을 건드리지 않는다.)

-- B-1. 이메일은 맞는데 user_id 가 NULL 인 멤버 행에 auth.users 의 id 를 백필 +
--      status 를 active 로. (이메일 대소문자/공백 정규화해서 매칭)
UPDATE public.organization_members om
SET user_id = au.id,
    status  = 'active'
FROM auth.users au
WHERE om.user_id IS NULL
  AND lower(trim(om.email)) = lower(trim(au.email))
  AND om.organization_id IN (SELECT id FROM public.organizations WHERE name = 'The Avengers');

-- B-2. status 가 invited/suspended 인데 실제로 가입시킬 사람이면 active 로
--      (원하는 이메일만 골라서)
UPDATE public.organization_members
SET status = 'active'
WHERE status <> 'active'
  AND lower(trim(email)) IN ('wonki@gmail.com','hyun@naver.com','kim@gmail.com')
  AND organization_id IN (SELECT id FROM public.organizations WHERE name = 'The Avengers');

-- B-3. (혹시 wonki 의 조직 소유권이 안 잡혀 있으면) 조직 owner 지정
--      — A-4 의 "오너로_인정"이 false 이고 wonki 가 이 조직을 만든 사람이 맞을 때만
-- UPDATE public.organizations
-- SET owner_user_id = (SELECT id FROM auth.users WHERE email='wonki@gmail.com')
-- WHERE name = 'The Avengers';


-- ============================================================================
-- [C] organization_id 백필 — A-2 / A-3 에서 org_id 누락일 때
--     "테스트" 프로젝트와 그 아래 모든 시설물·지점·기존손상·도면·손상에
--     조직 id 를 채워 넣는다.
-- ============================================================================

-- 배포된 스키마가 파일과 조금 다를 수 있어(organization_members에 updated_at 없음
-- 등), 각 테이블에 organization_id / updated_at 컬럼이 실제로 있는지 확인한 뒤
-- 동적 SQL 로 실행한다.
DO $$
DECLARE
  v_proj  TEXT;
  v_org   TEXT;
  t       TEXT;
  key_col TEXT;
  has_updated BOOLEAN;
  has_orgcol  BOOLEAN;
  sql_txt TEXT;
  n       INT;
BEGIN
  SELECT id INTO v_proj FROM public.ps_projects WHERE name = '테스트' LIMIT 1;
  IF v_proj IS NULL THEN RAISE NOTICE '프로젝트 "테스트" 없음 — 중단'; RETURN; END IF;

  SELECT organization_id INTO v_org FROM public.ps_projects WHERE id = v_proj;
  IF v_org IS NULL THEN
    SELECT id INTO v_org FROM public.organizations WHERE name = 'The Avengers' LIMIT 1;
  END IF;
  IF v_org IS NULL THEN RAISE NOTICE '조직 "The Avengers" 없음 — 중단'; RETURN; END IF;

  FOR t, key_col IN
    SELECT * FROM (VALUES
      ('ps_projects','id'),
      ('ps_facilities','project_id'),
      ('ps_drawings','project_id'),
      ('ps_inspection_points','project_id'),
      ('ps_existing_damages','project_id'),
      ('ps_damages','project_id')
    ) AS x(tbl, kc)
  LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=t) INTO has_orgcol;
    CONTINUE WHEN NOT has_orgcol;  -- 테이블 자체가 없으면 skip

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='organization_id') INTO has_orgcol;
    CONTINUE WHEN NOT has_orgcol;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='updated_at') INTO has_updated;

    sql_txt := format(
      'UPDATE public.%I SET organization_id = %L %s WHERE %I = %L AND organization_id IS DISTINCT FROM %L',
      t, v_org,
      CASE WHEN has_updated THEN ', updated_at = now()' ELSE '' END,
      key_col, v_proj, v_org
    );
    EXECUTE sql_txt;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '%: % 행에 organization_id 백필', t, n;
  END LOOP;

  RAISE NOTICE '완료: 프로젝트 % → 조직 %', v_proj, v_org;
END $$;


-- ============================================================================
-- [D] (선택) RLS 정책 보강 — 프로젝트 org 로도 항상 통하도록 명시
--     현재 정책도 논리상 맞지만, "프로젝트가 조직 것이면 그 조직 멤버는
--     하위 행 전부 읽고 쓸 수 있다"를 더 분명히 하고 organization_id 가
--     비어 있어도 프로젝트 경로로 통과되게 한다.
--     [C] 를 실행했다면 [D] 는 없어도 됨. 그래도 넣어두면 방어적.
--     정책은 permissive(OR 결합)라, 아래를 추가해도 접근이 넓어질 뿐 좁아지지 않음.
-- ============================================================================

-- D-0. 현재 걸려 있는 정책 이름 먼저 확인 (아래 DROP 이름이 안 맞으면 여기서 실제 이름 확인)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('ps_inspection_points','ps_facilities','ps_existing_damages','ps_drawings','ps_damages')
ORDER BY tablename, policyname;

-- 공통 헬퍼: 이 프로젝트에 내가 접근 가능한가
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

-- ps_inspection_points
DROP POLICY IF EXISTS "Inspection points accessible via project/org" ON public.ps_inspection_points;
CREATE POLICY "Inspection points accessible via project/org" ON public.ps_inspection_points
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  );

-- ps_facilities
DROP POLICY IF EXISTS "Facilities accessible by owner or org members" ON public.ps_facilities;
CREATE POLICY "Facilities accessible by owner or org members" ON public.ps_facilities
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  );

-- ps_existing_damages
DROP POLICY IF EXISTS "Existing damages accessible via project/org" ON public.ps_existing_damages;
CREATE POLICY "Existing damages accessible via project/org" ON public.ps_existing_damages
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  );

-- ps_drawings
DROP POLICY IF EXISTS "Drawings accessible via project/org" ON public.ps_drawings;
CREATE POLICY "Drawings accessible via project/org" ON public.ps_drawings
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  );

-- ps_damages
DROP POLICY IF EXISTS "Damages accessible via project/org" ON public.ps_damages;
CREATE POLICY "Damages accessible via project/org" ON public.ps_damages
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.can_access_project(project_id)
  );


-- ============================================================================
-- [E] 확인 — [B]~[D] 실행 후 다시
-- ============================================================================
-- A-2, A-3 을 다시 실행해서 org누락이 0 인지 확인.
-- 그다음 앱(모바일)에서 온라인 상태로 새로고침 → 저장 몇 번 → 진단로그의
-- "queue 처리 결과" 에서 failed 가 0 이 되는지 확인.
