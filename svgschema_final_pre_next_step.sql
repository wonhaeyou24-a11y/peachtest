-- ================================================================
-- PeachShot DB STABILIZATION GATE: Unified Supabase Migration
-- File: svgschema_final_pre_next_step.sql
-- 
-- 원칙:
-- 1. DROP TABLE / DROP COLUMN / TRUNCATE / DELETE 절대 금지 (Zero Data Loss)
-- 2. IF NOT EXISTS 및 CREATE OR REPLACE 멱등성 보장 (Idempotent)
-- 3. Zero-Trust RLS: 광범위한 auth.uid() IS NOT NULL 제거 및 프로젝트/조직 경계 강제
-- 4. OCC 낙관적 동시성 제어 및 충돌 감지/해결 권한 엄격화
-- 5. 보안 초대 링크 (이메일 검증, 토큰 해시 은닉, Owner/Admin 전용 조회 RPC)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. 핵심 프로필 및 조직 테이블 (Profiles & Organizations)
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY DEFAULT ('org_' || encode(gen_random_bytes(12), 'hex')),
    name TEXT NOT NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id TEXT PRIMARY KEY DEFAULT ('mem_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Owner', 'Admin', 'Member', 'Inspector', 'Reviewer', 'Reporter', 'Viewer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_org_user UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id TEXT PRIMARY KEY DEFAULT ('inv_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Admin', 'Member', 'Inspector', 'Reviewer', 'Reporter', 'Viewer')),
    target_email TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    max_uses INT NOT NULL DEFAULT 1,
    use_count INT NOT NULL DEFAULT 0
);

-- target_email 컬럼 안전 추가 (기존 테이블 존재 시)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'organization_invitations' AND column_name = 'target_email'
    ) THEN
        ALTER TABLE public.organization_invitations ADD COLUMN target_email TEXT;
    END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 최종 Entity 테이블 (Cloud Entity Tables)
-- (ps_markers 대신 클라이언트 호환성 표준인 ps_inspection_points 사용)
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ps_projects (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    data JSONB,
    revision BIGINT DEFAULT 1 NOT NULL,
    schema_version INT DEFAULT 8 NOT NULL,
    device_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ps_facilities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.ps_projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    data JSONB,
    revision BIGINT DEFAULT 1 NOT NULL,
    schema_version INT DEFAULT 8 NOT NULL,
    device_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ps_drawings (
    id TEXT PRIMARY KEY,
    facility_id TEXT NOT NULL REFERENCES public.ps_facilities(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES public.ps_projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    svg_data TEXT,
    data JSONB,
    revision BIGINT DEFAULT 1 NOT NULL,
    schema_version INT DEFAULT 8 NOT NULL,
    device_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ps_inspection_points (
    id TEXT PRIMARY KEY,
    drawing_id TEXT REFERENCES public.ps_drawings(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES public.ps_facilities(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES public.ps_projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    num INT,
    x NUMERIC,
    y NUMERIC,
    data JSONB,
    revision BIGINT DEFAULT 1 NOT NULL,
    schema_version INT DEFAULT 8 NOT NULL,
    device_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ps_photo_index (
    photo_id TEXT PRIMARY KEY,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    project_id TEXT NOT NULL REFERENCES public.ps_projects(id) ON DELETE CASCADE,
    facility_id TEXT REFERENCES public.ps_facilities(id) ON DELETE SET NULL,
    point_id TEXT REFERENCES public.ps_inspection_points(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    storage_path TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ps_damages (
    id TEXT PRIMARY KEY,
    point_id TEXT REFERENCES public.ps_inspection_points(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES public.ps_facilities(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES public.ps_projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    damage_type TEXT,
    component TEXT,
    data JSONB,
    revision BIGINT DEFAULT 1 NOT NULL,
    schema_version INT DEFAULT 8 NOT NULL,
    device_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ps_existing_damages (
    id TEXT PRIMARY KEY,
    facility_id TEXT NOT NULL REFERENCES public.ps_facilities(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES public.ps_projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    data JSONB,
    revision BIGINT DEFAULT 1 NOT NULL,
    schema_version INT DEFAULT 8 NOT NULL,
    device_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------
-- 3. 동기화 충돌 및 감사 로그 테이블 (Sync Conflicts & Audit Logs)
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ps_sync_conflicts (
    id TEXT PRIMARY KEY DEFAULT ('conf_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'facility',
    entity_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    local_revision BIGINT DEFAULT 1,
    cloud_revision BIGINT DEFAULT 1,
    local_data JSONB,
    cloud_data JSONB,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_local', 'resolved_cloud', 'resolved_merge', 'ignored')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ps_sync_conflicts entity_type CHECK 제약조건 안전 업데이트 (데이터 삭제 없이 교체)
DO $$ BEGIN
    ALTER TABLE public.ps_sync_conflicts DROP CONSTRAINT IF EXISTS ps_sync_conflicts_entity_type_check;
    ALTER TABLE public.ps_sync_conflicts ADD CONSTRAINT ps_sync_conflicts_entity_type_check
        CHECK (entity_type IN ('project', 'facility', 'drawing', 'inspection_point', 'marker', 'photo', 'damage', 'existing_damage', 'damage_master'));
END $$;

CREATE TABLE IF NOT EXISTS public.ps_integrity_audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('audit_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    project_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    audit_type TEXT NOT NULL DEFAULT 'read_only_check',
    total_issues INT NOT NULL DEFAULT 0,
    issues_summary JSONB DEFAULT '[]'::jsonb,
    repaired_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ----------------------------------------------------------------
-- 4. 인덱스 최적화 (Indexes)
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_hash ON public.organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.organization_invitations(organization_id);

CREATE INDEX IF NOT EXISTS idx_ps_projects_org_updated ON public.ps_projects(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_projects_user ON public.ps_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_ps_facilities_project ON public.ps_facilities(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_facilities_org ON public.ps_facilities(organization_id);
CREATE INDEX IF NOT EXISTS idx_ps_drawings_facility ON public.ps_drawings(facility_id);
CREATE INDEX IF NOT EXISTS idx_ps_drawings_project ON public.ps_drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_ps_inspection_points_facility ON public.ps_inspection_points(facility_id);
CREATE INDEX IF NOT EXISTS idx_ps_inspection_points_drawing ON public.ps_inspection_points(drawing_id);
CREATE INDEX IF NOT EXISTS idx_ps_damages_point ON public.ps_damages(point_id);
CREATE INDEX IF NOT EXISTS idx_ps_damages_facility ON public.ps_damages(facility_id);
CREATE INDEX IF NOT EXISTS idx_ps_existing_damages_facility ON public.ps_existing_damages(facility_id);
CREATE INDEX IF NOT EXISTS idx_ps_photo_index_project ON public.ps_photo_index(project_id);
CREATE INDEX IF NOT EXISTS idx_ps_sync_conflicts_org_status ON public.ps_sync_conflicts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ps_sync_conflicts_entity ON public.ps_sync_conflicts(project_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.ps_integrity_audit_logs(organization_id, created_at DESC);

-- ----------------------------------------------------------------
-- 5. 보안 헬퍼 함수 (단일 Canonical Signature 정립)
-- ----------------------------------------------------------------

-- 구형 오버로딩 함수 안전 제거
DROP FUNCTION IF EXISTS public.is_org_member(TEXT, UUID);
DROP FUNCTION IF EXISTS public.is_org_admin(TEXT, UUID);

-- 사용자가 특정 조직의 활성 멤버인지 확인 (내부적으로 auth.uid() 안전 사용)
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT (p_org_id IS NOT NULL) AND (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = p_org_id
              AND user_id = auth.uid()
              AND status = 'active'
        ) OR EXISTS (
            SELECT 1 FROM public.organizations
            WHERE id = p_org_id
              AND owner_user_id = auth.uid()
        )
    );
$$;

-- 사용자가 특정 조직의 Admin 또는 Owner인지 확인
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
    SELECT (p_org_id IS NOT NULL) AND (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = p_org_id
              AND user_id = auth.uid()
              AND role IN ('Owner', 'Admin')
              AND status = 'active'
        ) OR EXISTS (
            SELECT 1 FROM public.organizations
            WHERE id = p_org_id
              AND owner_user_id = auth.uid()
        )
    );
$$;

-- ----------------------------------------------------------------
-- 6. 통합 Row Level Security (RLS) 정책
-- (광범위한 auth.uid() IS NOT NULL 제거 및 Project/Org 경계 엄격 적용)
-- ----------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_inspection_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_existing_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_photo_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_integrity_audit_logs ENABLE ROW LEVEL SECURITY;

-- 6-1. Profiles RLS
DROP POLICY IF EXISTS "Profiles viewable by self" ON public.profiles;
CREATE POLICY "Profiles viewable by self" ON public.profiles
    FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Profiles upsert by self" ON public.profiles;
CREATE POLICY "Profiles upsert by self" ON public.profiles
    FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 6-2. Organizations RLS
DROP POLICY IF EXISTS "Organizations select for members" ON public.organizations;
CREATE POLICY "Organizations select for members" ON public.organizations
    FOR SELECT TO authenticated USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Organizations insert by authenticated" ON public.organizations;
CREATE POLICY "Organizations insert by authenticated" ON public.organizations
    FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Organizations update by owner/admin" ON public.organizations;
CREATE POLICY "Organizations update by owner/admin" ON public.organizations
    FOR UPDATE TO authenticated USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));

-- 6-3. Organization Members RLS
DROP POLICY IF EXISTS "Org members select for org peers" ON public.organization_members;
CREATE POLICY "Org members select for org peers" ON public.organization_members
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org members insert/update by admin" ON public.organization_members;
CREATE POLICY "Org members insert/update by admin" ON public.organization_members
    FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

-- 6-4. Organization Invitations RLS (일반 멤버 직접 조회 차단, RPC를 통해서만 안전 관리)
DROP POLICY IF EXISTS "Invitations managed by org admin" ON public.organization_invitations;
CREATE POLICY "Invitations managed by org admin" ON public.organization_invitations
    FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

-- 6-5. Projects RLS (개인 프로젝트: user_id / 조직 프로젝트: is_org_member)
DROP POLICY IF EXISTS "Projects accessible by owner or org members" ON public.ps_projects;
CREATE POLICY "Projects accessible by owner or org members" ON public.ps_projects
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    )
    WITH CHECK (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    );

-- 6-6. Facilities RLS
DROP POLICY IF EXISTS "Facilities accessible by owner or org members" ON public.ps_facilities;
CREATE POLICY "Facilities accessible by owner or org members" ON public.ps_facilities
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_facilities.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_facilities.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    );

-- 6-7. Drawings RLS
DROP POLICY IF EXISTS "Drawings accessible via project/org" ON public.ps_drawings;
CREATE POLICY "Drawings accessible via project/org" ON public.ps_drawings
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_drawings.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_drawings.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    );

-- 6-8. Inspection Points RLS
DROP POLICY IF EXISTS "Inspection points accessible via project/org" ON public.ps_inspection_points;
CREATE POLICY "Inspection points accessible via project/org" ON public.ps_inspection_points
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_inspection_points.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_inspection_points.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    );

-- 6-9. Damages & Existing Damages RLS
DROP POLICY IF EXISTS "Damages accessible via project/org" ON public.ps_damages;
CREATE POLICY "Damages accessible via project/org" ON public.ps_damages
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_damages.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_damages.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    );

DROP POLICY IF EXISTS "Existing damages accessible via project/org" ON public.ps_existing_damages;
CREATE POLICY "Existing damages accessible via project/org" ON public.ps_existing_damages
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_existing_damages.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_existing_damages.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    );

-- 6-10. Photo Index RLS
DROP POLICY IF EXISTS "Photos accessible via project/org" ON public.ps_photo_index;
CREATE POLICY "Photos accessible via project/org" ON public.ps_photo_index
    FOR ALL TO authenticated
    USING (
        owner_user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_photo_index.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    )
    WITH CHECK (
        owner_user_id = auth.uid() OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR
        EXISTS (
            SELECT 1 FROM public.ps_projects p
            WHERE p.id = ps_photo_index.project_id
              AND (p.user_id = auth.uid() OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id)))
        )
    );

-- 6-11. Sync Conflicts RLS
DROP POLICY IF EXISTS "Conflicts select for owner or org members" ON public.ps_sync_conflicts;
CREATE POLICY "Conflicts select for owner or org members" ON public.ps_sync_conflicts
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    );

DROP POLICY IF EXISTS "Conflicts insert for owner or org members" ON public.ps_sync_conflicts;
CREATE POLICY "Conflicts insert for owner or org members" ON public.ps_sync_conflicts
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    );

DROP POLICY IF EXISTS "Conflicts update by owner or org admin" ON public.ps_sync_conflicts;
CREATE POLICY "Conflicts update by owner or org admin" ON public.ps_sync_conflicts
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = user_id OR
        (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    );

-- 6-12. Integrity Audit Logs RLS (개인 로그는 작성자만, 조직 로그는 조직 멤버만)
DROP POLICY IF EXISTS "Audit logs select policy" ON public.ps_integrity_audit_logs;
CREATE POLICY "Audit logs select policy" ON public.ps_integrity_audit_logs
    FOR SELECT TO authenticated
    USING (
        (organization_id IS NULL AND user_id = auth.uid()) OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    );

DROP POLICY IF EXISTS "Audit logs insert policy" ON public.ps_integrity_audit_logs;
CREATE POLICY "Audit logs insert policy" ON public.ps_integrity_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id AND (
            organization_id IS NULL OR public.is_org_member(organization_id)
        )
    );

-- ----------------------------------------------------------------
-- 7. 보안 초대 RPC 함수 (Invitation RPCs)
-- ----------------------------------------------------------------

-- 7-1. 초대장 생성 (Owner/Admin 전용, target_email 정규화)
CREATE OR REPLACE FUNCTION public.create_secure_invitation(
    p_organization_id TEXT,
    p_token_hash TEXT,
    p_role TEXT DEFAULT 'Member',
    p_expires_days INT DEFAULT 7,
    p_target_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_invitation_id TEXT;
    v_expires_at TIMESTAMPTZ;
    v_clean_email TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF NOT public.is_org_admin(p_organization_id) THEN
        RAISE EXCEPTION '초대 권한이 없습니다. (Owner/Admin만 생성 가능)';
    END IF;

    IF p_role = 'Owner' THEN
        RAISE EXCEPTION 'Owner 역할로는 직접 초대할 수 없습니다.';
    END IF;

    v_clean_email := NULLIF(lower(trim(COALESCE(p_target_email, ''))), '');
    v_expires_at := TIMEZONE('utc'::text, NOW()) + (p_expires_days || ' days')::INTERVAL;
    v_invitation_id := 'inv_' || encode(gen_random_bytes(12), 'hex');

    INSERT INTO public.organization_invitations (
        id, organization_id, token_hash, role, target_email, created_by, created_at, expires_at, max_uses, use_count
    ) VALUES (
        v_invitation_id, p_organization_id, p_token_hash, p_role, v_clean_email, v_user_id, NOW(), v_expires_at, 1, 0
    );

    RETURN jsonb_build_object(
        'ok', true,
        'invitation_id', v_invitation_id,
        'expires_at', v_expires_at,
        'role', p_role,
        'target_email', v_clean_email
    );
END;
$$;

-- 7-2. 초대장 상태 검증 (Landing page용, 최소 정보만 안전 반환)
CREATE OR REPLACE FUNCTION public.verify_invitation_token(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_inv RECORD;
    v_org RECORD;
    v_status TEXT;
BEGIN
    SELECT * INTO v_inv FROM public.organization_invitations
    WHERE token_hash = p_token_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'status', 'NOT_FOUND', 'reason', '초대장을 찾을 수 없습니다.');
    END IF;

    IF v_inv.revoked_at IS NOT NULL THEN
        v_status := 'REVOKED';
    ELSIF v_inv.use_count >= v_inv.max_uses OR v_inv.used_at IS NOT NULL THEN
        v_status := 'USED';
    ELSIF v_inv.expires_at < NOW() THEN
        v_status := 'EXPIRED';
    ELSE
        v_status := 'VALID';
    END IF;

    SELECT id, name INTO v_org FROM public.organizations WHERE id = v_inv.organization_id;

    RETURN jsonb_build_object(
        'ok', (v_status = 'VALID'),
        'status', v_status,
        'organization_id', v_inv.organization_id,
        'organization_name', COALESCE(v_org.name, '알 수 없는 조직'),
        'role', v_inv.role,
        'target_email', v_inv.target_email,
        'expires_at', v_inv.expires_at
    );
END;
$$;

-- 7-3. 초대 수락 (대상 이메일 검증 포함)
CREATE OR REPLACE FUNCTION public.accept_secure_invitation(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_email TEXT;
    v_inv RECORD;
    v_existing_mem RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', '로그인이 필요합니다.');
    END IF;

    SELECT lower(trim(email)) INTO v_user_email FROM auth.users WHERE id = v_user_id;

    SELECT * INTO v_inv FROM public.organization_invitations
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'status', 'NOT_FOUND', 'reason', '유효하지 않은 초대 링크입니다.');
    END IF;

    IF v_inv.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'status', 'REVOKED', 'reason', '취소된 초대 링크입니다.');
    END IF;

    IF v_inv.use_count >= v_inv.max_uses OR v_inv.used_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'status', 'USED', 'reason', '이미 사용된 초대 링크입니다.');
    END IF;

    IF v_inv.expires_at < NOW() THEN
        RETURN jsonb_build_object('ok', false, 'status', 'EXPIRED', 'reason', '만료된 초대 링크입니다.');
    END IF;

    -- 지정된 초대 대상 이메일이 있는 경우 엄격 검증
    IF v_inv.target_email IS NOT NULL AND v_inv.target_email != '' THEN
        IF v_user_email IS NULL OR lower(trim(v_inv.target_email)) != v_user_email THEN
            RETURN jsonb_build_object(
                'ok', false,
                'status', 'EMAIL_MISMATCH',
                'reason', '이 초대는 ' || v_inv.target_email || ' 계정 전용입니다. (현재 계정: ' || COALESCE(v_user_email, '없음') || ')'
            );
        END IF;
    END IF;

    -- 기존 멤버십 확인
    SELECT * INTO v_existing_mem FROM public.organization_members
    WHERE organization_id = v_inv.organization_id AND user_id = v_user_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'ok', true,
            'already_member', true,
            'organization_id', v_inv.organization_id,
            'role', v_existing_mem.role,
            'message', '이미 이 조직의 팀원입니다.'
        );
    END IF;

    INSERT INTO public.organization_members (
        organization_id, user_id, email, role, status
    ) VALUES (
        v_inv.organization_id, v_user_id, v_user_email, v_inv.role, 'active'
    );

    UPDATE public.organization_invitations
    SET used_at = NOW(),
        used_by = v_user_id,
        use_count = use_count + 1
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'ok', true,
        'organization_id', v_inv.organization_id,
        'role', v_inv.role,
        'message', '조직에 성공적으로 가입되었습니다.'
    );
END;
$$;

-- 7-4. 초대장 취소 (Owner / Admin 전용)
CREATE OR REPLACE FUNCTION public.revoke_secure_invitation(
    p_invitation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_inv RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', '로그인이 필요합니다.');
    END IF;

    SELECT * INTO v_inv FROM public.organization_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', '초대장을 찾을 수 없습니다.');
    END IF;

    IF NOT public.is_org_admin(v_inv.organization_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', '초대 취소 권한이 없습니다.');
    END IF;

    UPDATE public.organization_invitations
    SET revoked_at = NOW()
    WHERE id = p_invitation_id;

    RETURN jsonb_build_object('ok', true, 'message', '초대가 성공적으로 취소되었습니다.');
END;
$$;

-- 7-5. 초대장 목록 조회 (Owner/Admin 전용, token_hash 은닉)
CREATE OR REPLACE FUNCTION public.list_organization_invitations(
    p_organization_id TEXT
)
RETURNS TABLE (
    id TEXT,
    organization_id TEXT,
    role TEXT,
    target_email TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    used_by UUID,
    revoked_at TIMESTAMPTZ,
    max_uses INT,
    use_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF NOT public.is_org_admin(p_organization_id) THEN
        RAISE EXCEPTION '초대 목록 조회 권한이 없습니다. (Owner/Admin만 가능)';
    END IF;

    RETURN QUERY
    SELECT 
        i.id, i.organization_id, i.role, i.target_email,
        i.created_by, i.created_at, i.expires_at,
        i.used_at, i.used_by, i.revoked_at,
        i.max_uses, i.use_count
    FROM public.organization_invitations i
    WHERE i.organization_id = p_organization_id
    ORDER BY i.created_at DESC;
END;
$$;

-- ----------------------------------------------------------------
-- 8. 최종 atomic_entity_upsert (OCC 동시성 제어 및 전 엔티티 지원)
-- ----------------------------------------------------------------

-- 구형 함수 signature 제거
DROP FUNCTION IF EXISTS public.atomic_entity_upsert(TEXT, TEXT, TEXT, TEXT, JSONB, INT);
DROP FUNCTION IF EXISTS public.atomic_entity_upsert(TEXT, TEXT, TEXT, TEXT, JSONB, BIGINT, INT);

CREATE OR REPLACE FUNCTION public.atomic_entity_upsert(
    p_table TEXT,
    p_id TEXT,
    p_project_id TEXT,
    p_org_id TEXT,
    p_data JSONB,
    p_expected_revision BIGINT DEFAULT NULL,
    p_schema_version INT DEFAULT 8,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_target_table TEXT;
    v_current_rev BIGINT;
    v_next_rev BIGINT;
    v_proj_row RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', '인증되지 않은 사용자입니다.');
    END IF;

    -- 허용된 대상 테이블 화이트리스트 검증
    v_target_table := lower(trim(p_table));
    IF v_target_table NOT IN (
        'ps_projects', 'ps_facilities', 'ps_drawings',
        'ps_inspection_points', 'ps_damages', 'ps_existing_damages'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', '허용되지 않은 대상 테이블입니다: ' || COALESCE(p_table, 'NULL'));
    END IF;

    -- 조직 권한 검증 (Viewer 권한 사용자는 모든 쓰기 차단)
    IF p_org_id IS NOT NULL THEN
        SELECT role INTO v_role
        FROM public.organization_members
        WHERE organization_id = p_org_id AND user_id = v_user_id AND status = 'active';

        IF v_role IS NULL AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id AND owner_user_id = v_user_id) THEN
            RETURN jsonb_build_object('ok', false, 'reason', '해당 조직에 대한 접근 권한이 없습니다.');
        END IF;

        IF v_role = 'Viewer' THEN
            RETURN jsonb_build_object('ok', false, 'reason', '조회 전용(Viewer) 권한으로는 데이터를 수정할 수 없습니다.');
        END IF;
    END IF;

    -- 프로젝트 접근 권한 검증 (ps_projects 본체 제외)
    IF p_project_id IS NOT NULL AND v_target_table != 'ps_projects' THEN
        SELECT * INTO v_proj_row FROM public.ps_projects WHERE id = p_project_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'reason', '상위 프로젝트를 찾을 수 없습니다.');
        END IF;

        IF v_proj_row.user_id != v_user_id AND (v_proj_row.organization_id IS NULL OR NOT public.is_org_member(v_proj_row.organization_id)) THEN
            RETURN jsonb_build_object('ok', false, 'reason', '상위 프로젝트에 대한 권한이 없습니다.');
        END IF;
    END IF;

    -- -------------------------------------------------------------
    -- 테이블별 OCC 검증 및 안전한 INSERT / UPDATE 실행
    -- -------------------------------------------------------------

    -- 1. ps_projects
    IF v_target_table = 'ps_projects' THEN
        SELECT revision INTO v_current_rev FROM public.ps_projects WHERE id = p_id;
        IF FOUND THEN
            IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
                RETURN jsonb_build_object('ok', false, 'conflict', true, 'cloud_revision', v_current_rev, 'reason', 'Revision mismatch');
            END IF;
            v_next_rev := v_current_rev + 1;
            UPDATE public.ps_projects
            SET name = COALESCE((p_data->>'name')::text, name),
                data = p_data,
                revision = v_next_rev,
                schema_version = p_schema_version,
                organization_id = COALESCE(p_org_id, organization_id),
                device_id = p_device_id,
                updated_by = v_user_id,
                updated_at = NOW()
            WHERE id = p_id;
        ELSE
            v_next_rev := 1;
            INSERT INTO public.ps_projects (id, user_id, organization_id, name, data, revision, schema_version, device_id, updated_by, updated_at)
            VALUES (p_id, v_user_id, p_org_id, COALESCE((p_data->>'name')::text, '프로젝트'), p_data, 1, p_schema_version, p_device_id, v_user_id, NOW());
        END IF;

    -- 2. ps_facilities
    ELSIF v_target_table = 'ps_facilities' THEN
        SELECT revision INTO v_current_rev FROM public.ps_facilities WHERE id = p_id;
        IF FOUND THEN
            IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
                RETURN jsonb_build_object('ok', false, 'conflict', true, 'cloud_revision', v_current_rev, 'reason', 'Revision mismatch');
            END IF;
            v_next_rev := v_current_rev + 1;
            UPDATE public.ps_facilities
            SET name = COALESCE((p_data->>'name')::text, name),
                data = p_data,
                revision = v_next_rev,
                schema_version = p_schema_version,
                organization_id = COALESCE(p_org_id, organization_id),
                device_id = p_device_id,
                updated_by = v_user_id,
                updated_at = NOW()
            WHERE id = p_id;
        ELSE
            v_next_rev := 1;
            INSERT INTO public.ps_facilities (id, project_id, user_id, organization_id, name, data, revision, schema_version, device_id, updated_by, updated_at)
            VALUES (p_id, p_project_id, v_user_id, p_org_id, COALESCE((p_data->>'name')::text, '시설물'), p_data, 1, p_schema_version, p_device_id, v_user_id, NOW());
        END IF;

    -- 3. ps_drawings
    ELSIF v_target_table = 'ps_drawings' THEN
        SELECT revision INTO v_current_rev FROM public.ps_drawings WHERE id = p_id;
        IF FOUND THEN
            IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
                RETURN jsonb_build_object('ok', false, 'conflict', true, 'cloud_revision', v_current_rev, 'reason', 'Revision mismatch');
            END IF;
            v_next_rev := v_current_rev + 1;
            UPDATE public.ps_drawings
            SET name = COALESCE((p_data->>'name')::text, name),
                svg_data = COALESCE((p_data->>'svg_data')::text, svg_data),
                data = p_data,
                revision = v_next_rev,
                schema_version = p_schema_version,
                organization_id = COALESCE(p_org_id, organization_id),
                device_id = p_device_id,
                updated_by = v_user_id,
                updated_at = NOW()
            WHERE id = p_id;
        ELSE
            v_next_rev := 1;
            INSERT INTO public.ps_drawings (id, facility_id, project_id, user_id, organization_id, name, svg_data, data, revision, schema_version, device_id, updated_by, updated_at)
            VALUES (p_id, COALESCE((p_data->>'facility_id')::text, p_id), p_project_id, v_user_id, p_org_id, COALESCE((p_data->>'name')::text, '도면'), (p_data->>'svg_data')::text, p_data, 1, p_schema_version, p_device_id, v_user_id, NOW());
        END IF;

    -- 4. ps_inspection_points
    ELSIF v_target_table = 'ps_inspection_points' THEN
        SELECT revision INTO v_current_rev FROM public.ps_inspection_points WHERE id = p_id;
        IF FOUND THEN
            IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
                RETURN jsonb_build_object('ok', false, 'conflict', true, 'cloud_revision', v_current_rev, 'reason', 'Revision mismatch');
            END IF;
            v_next_rev := v_current_rev + 1;
            UPDATE public.ps_inspection_points
            SET num = COALESCE((p_data->>'num')::int, num),
                x = COALESCE((p_data->>'x')::numeric, x),
                y = COALESCE((p_data->>'y')::numeric, y),
                data = p_data,
                revision = v_next_rev,
                schema_version = p_schema_version,
                organization_id = COALESCE(p_org_id, organization_id),
                device_id = p_device_id,
                updated_by = v_user_id,
                updated_at = NOW()
            WHERE id = p_id;
        ELSE
            v_next_rev := 1;
            INSERT INTO public.ps_inspection_points (id, drawing_id, facility_id, project_id, user_id, organization_id, num, x, y, data, revision, schema_version, device_id, updated_by, updated_at)
            VALUES (p_id, (p_data->>'drawing_id')::text, COALESCE((p_data->>'facility_id')::text, p_id), p_project_id, v_user_id, p_org_id, (p_data->>'num')::int, (p_data->>'x')::numeric, (p_data->>'y')::numeric, p_data, 1, p_schema_version, p_device_id, v_user_id, NOW());
        END IF;

    -- 5. ps_damages
    ELSIF v_target_table = 'ps_damages' THEN
        SELECT revision INTO v_current_rev FROM public.ps_damages WHERE id = p_id;
        IF FOUND THEN
            IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
                RETURN jsonb_build_object('ok', false, 'conflict', true, 'cloud_revision', v_current_rev, 'reason', 'Revision mismatch');
            END IF;
            v_next_rev := v_current_rev + 1;
            UPDATE public.ps_damages
            SET damage_type = COALESCE((p_data->>'damage_type')::text, damage_type),
                component = COALESCE((p_data->>'component')::text, component),
                data = p_data,
                revision = v_next_rev,
                schema_version = p_schema_version,
                organization_id = COALESCE(p_org_id, organization_id),
                device_id = p_device_id,
                updated_by = v_user_id,
                updated_at = NOW()
            WHERE id = p_id;
        ELSE
            v_next_rev := 1;
            INSERT INTO public.ps_damages (id, point_id, facility_id, project_id, user_id, organization_id, damage_type, component, data, revision, schema_version, device_id, updated_by, updated_at)
            VALUES (p_id, (p_data->>'point_id')::text, COALESCE((p_data->>'facility_id')::text, p_id), p_project_id, v_user_id, p_org_id, (p_data->>'damage_type')::text, (p_data->>'component')::text, p_data, 1, p_schema_version, p_device_id, v_user_id, NOW());
        END IF;

    -- 6. ps_existing_damages
    ELSIF v_target_table = 'ps_existing_damages' THEN
        SELECT revision INTO v_current_rev FROM public.ps_existing_damages WHERE id = p_id;
        IF FOUND THEN
            IF p_expected_revision IS NOT NULL AND v_current_rev != p_expected_revision THEN
                RETURN jsonb_build_object('ok', false, 'conflict', true, 'cloud_revision', v_current_rev, 'reason', 'Revision mismatch');
            END IF;
            v_next_rev := v_current_rev + 1;
            UPDATE public.ps_existing_damages
            SET data = p_data,
                revision = v_next_rev,
                schema_version = p_schema_version,
                organization_id = COALESCE(p_org_id, organization_id),
                device_id = p_device_id,
                updated_by = v_user_id,
                updated_at = NOW()
            WHERE id = p_id;
        ELSE
            v_next_rev := 1;
            INSERT INTO public.ps_existing_damages (id, facility_id, project_id, user_id, organization_id, data, revision, schema_version, device_id, updated_by, updated_at)
            VALUES (p_id, COALESCE((p_data->>'facility_id')::text, p_id), p_project_id, v_user_id, p_org_id, p_data, 1, p_schema_version, p_device_id, v_user_id, NOW());
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', p_id,
        'table', v_target_table,
        'revision', v_next_rev
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------
-- 9. 충돌 해결 RPC 함수 (resolve_sync_conflict 권한 강화)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_sync_conflict(
    p_conflict_id TEXT,
    p_status TEXT,
    p_resolved_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_conf RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', '로그인이 필요합니다.');
    END IF;

    SELECT * INTO v_conf FROM public.ps_sync_conflicts WHERE id = p_conflict_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', '충돌 기록을 찾을 수 없습니다.');
    END IF;

    -- 본인이 발생시킨 충돌이거나 해당 조직의 Owner/Admin만 해결 가능
    IF v_conf.user_id != v_user_id AND (v_conf.organization_id IS NULL OR NOT public.is_org_admin(v_conf.organization_id)) THEN
        RETURN jsonb_build_object('ok', false, 'reason', '충돌 해결 권한이 없습니다. (본인 또는 조직 Owner/Admin만 가능)');
    END IF;

    UPDATE public.ps_sync_conflicts
    SET status = p_status,
        resolved_at = TIMEZONE('utc'::text, NOW()),
        resolved_by = v_user_id,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_conflict_id;

    RETURN jsonb_build_object('ok', true, 'message', '충돌이 성공적으로 해결 처리되었습니다.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------
-- 10. RPC 실행 권한 (Explicit Grants)
-- ----------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.is_org_member(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(TEXT) TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.verify_invitation_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_secure_invitation(TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_secure_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_secure_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_organization_invitations(TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.atomic_entity_upsert(TEXT, TEXT, TEXT, TEXT, JSONB, BIGINT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sync_conflict(TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sync_conflict(TEXT, TEXT, JSONB) TO authenticated;
