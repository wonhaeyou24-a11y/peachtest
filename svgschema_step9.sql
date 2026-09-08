-- ================================================================
-- PeachShot STEP 9: Final Pre-deployment Hardening & Integrity Stabilization
-- Migration File: svgschema_step9.sql
-- 
-- 원칙:
-- 1. DROP TABLE / DROP COLUMN 절대 금지, 기존 데이터 100% 보존 (Zero Data Loss)
-- 2. IF NOT EXISTS 및 CREATE OR REPLACE 멱등성 보장 (Idempotent)
-- 3. Zero-Trust 보안 모델 (RLS 기반 데이터 격리 및 Strict Input Sanitization)
-- 4. RPC 보안 취약점 감사 및 불법적인 권한 상승(Escalation) 차단
-- ================================================================

-- 1. ps_integrity_audit_logs 테이블 (무결성 감사 이력 및 복구 내역 기록)
CREATE TABLE IF NOT EXISTS public.ps_integrity_audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('audit_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    project_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    audit_type TEXT NOT NULL DEFAULT 'read_only_check', -- 'read_only_check', 'repair_preview', 'repaired'
    total_issues INT NOT NULL DEFAULT 0,
    issues_summary JSONB DEFAULT '[]'::jsonb,
    repaired_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.ps_integrity_audit_logs ENABLE ROW LEVEL SECURITY;

-- 무결성 감사 로그 RLS
DROP POLICY IF EXISTS "Members can view org audit logs" ON public.ps_integrity_audit_logs;
CREATE POLICY "Members can view org audit logs"
ON public.ps_integrity_audit_logs
FOR SELECT
TO authenticated
USING (
    organization_id IS NULL OR
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = ps_integrity_audit_logs.organization_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
    )
);

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.ps_integrity_audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
ON public.ps_integrity_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id AND (
        organization_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = ps_integrity_audit_logs.organization_id
              AND om.user_id = auth.uid()
              AND om.status = 'active'
        )
    )
);

-- 2. 안전한 RPC 보안 강화: atomic_entity_upsert (입력값 유효성 및 권한 검증)
CREATE OR REPLACE FUNCTION public.atomic_entity_upsert(
    p_table TEXT,
    p_id TEXT,
    p_project_id TEXT,
    p_org_id TEXT,
    p_data JSONB,
    p_schema_version INT DEFAULT 8
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
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', '인증되지 않은 사용자입니다.');
    END IF;

    -- 허용된 테이블 화이트리스트 검증 (SQL Injection 방어)
    v_target_table := lower(trim(p_table));
    IF v_target_table NOT IN ('ps_projects', 'ps_facilities', 'ps_drawings', 'ps_markers', 'ps_damages') THEN
        RETURN jsonb_build_object('ok', false, 'reason', '허용되지 않은 대상 테이블입니다.');
    END IF;

    -- 조직 권한 검증 (Viewer 권한 사용자는 쓰기 차단)
    IF p_org_id IS NOT NULL THEN
        SELECT role INTO v_role
        FROM public.organization_members
        WHERE organization_id = p_org_id AND user_id = v_user_id AND status = 'active';

        IF v_role IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'reason', '해당 조직의 멤버가 아닙니다.');
        END IF;

        IF v_role = 'Viewer' THEN
            RETURN jsonb_build_object('ok', false, 'reason', '조회 전용(Viewer) 권한으로는 데이터를 수정할 수 없습니다.');
        END IF;
    END IF;

    -- 프로젝트 접근 권한 검증
    IF p_project_id IS NOT NULL AND v_target_table != 'ps_projects' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.ps_projects
            WHERE id = p_project_id AND (
                user_id = v_user_id OR
                (organization_id IS NOT NULL AND organization_id = p_org_id)
            )
        ) THEN
            RETURN jsonb_build_object('ok', false, 'reason', '상위 프로젝트에 대한 접근 권한이 없습니다.');
        END IF;
    END IF;

    -- 테이블별 안전한 멱등성 Upsert 실행
    IF v_target_table = 'ps_projects' THEN
        INSERT INTO public.ps_projects (id, user_id, name, data, schema_version, organization_id, updated_at)
        VALUES (p_id, v_user_id, COALESCE((p_data->>'name')::text, '프로젝트'), p_data, p_schema_version, p_org_id, NOW())
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            data = EXCLUDED.data,
            schema_version = EXCLUDED.schema_version,
            organization_id = EXCLUDED.organization_id,
            updated_at = NOW()
        WHERE ps_projects.user_id = v_user_id OR ps_projects.organization_id = p_org_id;

    ELSIF v_target_table = 'ps_facilities' THEN
        INSERT INTO public.ps_facilities (id, project_id, user_id, name, data, schema_version, organization_id, updated_at)
        VALUES (p_id, p_project_id, v_user_id, COALESCE((p_data->>'name')::text, '시설물'), p_data, p_schema_version, p_org_id, NOW())
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            data = EXCLUDED.data,
            schema_version = EXCLUDED.schema_version,
            organization_id = EXCLUDED.organization_id,
            updated_at = NOW()
        WHERE ps_facilities.user_id = v_user_id OR ps_facilities.organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', p_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

-- 3. 조직 멤버십 검증 헬퍼 함수 (is_org_member)
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id TEXT, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_id = p_user_id
          AND status = 'active'
    );
$$;

-- 4. 무결성 감사용 인덱스 보강
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.ps_integrity_audit_logs(organization_id, created_at DESC);

