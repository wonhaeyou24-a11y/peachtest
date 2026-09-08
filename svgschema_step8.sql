-- ================================================================
-- PeachShot STEP 8: Team Collaboration / Project Sharing / Sync UX Stabilization
-- Migration File: svgschema_step8.sql
-- 
-- 원칙:
-- 1. DROP TABLE / DROP COLUMN 절대 금지, 기존 데이터 100% 보존 (Zero Data Loss)
-- 2. IF NOT EXISTS 및 멱등성 보장 (Idempotent)
-- 3. Zero-Trust 보안 모델 (RLS 기반 데이터 격리 및 권한 검증)
-- 4. OCC 충돌 감지 및 동시성 제어 데이터 무결성 보존
-- ================================================================

-- 1. ps_sync_conflicts 테이블 (동기화 충돌 발생 시 로컬/클라우드 데이터 보존용)
CREATE TABLE IF NOT EXISTS public.ps_sync_conflicts (
    id TEXT PRIMARY KEY DEFAULT ('conf_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'facility' CHECK (entity_type IN ('project', 'facility', 'marker', 'photo', 'damage_master')),
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

-- 2. 인덱스 최적화 (다중 조직 및 동기화 커서 조회 속도 개선)
CREATE INDEX IF NOT EXISTS idx_ps_projects_org_updated ON public.ps_projects(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_facilities_org_updated ON public.ps_facilities(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ps_sync_conflicts_org_status ON public.ps_sync_conflicts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ps_sync_conflicts_entity ON public.ps_sync_conflicts(project_id, entity_type, entity_id);

-- 3. Row Level Security (RLS) 활성화
ALTER TABLE public.ps_sync_conflicts ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 정의 (조직 멤버만 충돌 조회 및 등록 가능)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ps_sync_conflicts' AND policyname = 'org_members_select_conflicts'
    ) THEN
        CREATE POLICY "org_members_select_conflicts" ON public.ps_sync_conflicts
            FOR SELECT USING (
                auth.uid() = user_id 
                OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ps_sync_conflicts' AND policyname = 'org_members_insert_conflicts'
    ) THEN
        CREATE POLICY "org_members_insert_conflicts" ON public.ps_sync_conflicts
            FOR INSERT WITH CHECK (
                auth.uid() = user_id 
                OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ps_sync_conflicts' AND policyname = 'org_members_update_conflicts'
    ) THEN
        CREATE POLICY "org_members_update_conflicts" ON public.ps_sync_conflicts
            FOR UPDATE USING (
                auth.uid() = user_id 
                OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
            );
    END IF;
END $$;

-- 5. 보안 RPC 함수: record_sync_conflict (충돌 안전 기록)
CREATE OR REPLACE FUNCTION public.record_sync_conflict(
    p_org_id TEXT,
    p_project_id TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_local_rev BIGINT,
    p_cloud_rev BIGINT,
    p_local_data JSONB,
    p_cloud_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_conflict_id TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', '로그인이 필요합니다.');
    END IF;

    IF p_org_id IS NOT NULL AND NOT public.is_org_member(p_org_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', '해당 조직에 대한 접근 권한이 없습니다.');
    END IF;

    INSERT INTO public.ps_sync_conflicts (
        organization_id, project_id, entity_type, entity_id, user_id,
        local_revision, cloud_revision, local_data, cloud_data, status
    ) VALUES (
        p_org_id, p_project_id, p_entity_type, p_entity_id, v_user_id,
        p_local_rev, p_cloud_rev, p_local_data, p_cloud_data, 'open'
    ) RETURNING id INTO v_conflict_id;

    RETURN jsonb_build_object('ok', true, 'conflict_id', v_conflict_id);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

-- 6. 보안 RPC 함수: resolve_sync_conflict (충돌 해결)
CREATE OR REPLACE FUNCTION public.resolve_sync_conflict(
    p_conflict_id TEXT,
    p_status TEXT, -- 'resolved_local', 'resolved_cloud', 'resolved_merge', 'ignored'
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

    IF v_conf.organization_id IS NOT NULL AND NOT public.is_org_member(v_conf.organization_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', '해당 조직에 대한 권한이 없습니다.');
    END IF;

    UPDATE public.ps_sync_conflicts
    SET status = p_status,
        resolved_at = TIMEZONE('utc'::text, NOW()),
        resolved_by = v_user_id,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_conflict_id;

    RETURN jsonb_build_object('ok', true, 'message', '충돌이 성공적으로 해결 처리되었습니다.');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;
