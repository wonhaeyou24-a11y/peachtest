-- ================================================================
-- PeachShot STEP 7: Organization / Member / Invitation / Role / RLS
-- Migration File: svgschema_step7.sql
-- 
-- 원칙:
-- 1. DROP TABLE 금지, 기존 데이터 보존 (Zero Data Loss)
-- 2. IF NOT EXISTS 및 멱등성 보장 (Idempotent)
-- 3. Zero-Trust 보안 모델 (RLS 기반 데이터 격리)
-- 4. 암호화 토큰 해시 기반 초대 체계 (SHA-256)
-- ================================================================

-- 1. Profiles 테이블 (존재하지 않을 경우 생성)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Organizations 테이블 (조직)
CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY DEFAULT ('org_' || encode(gen_random_bytes(12), 'hex')),
    name TEXT NOT NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Organization Members 테이블 (조직 멤버십)
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

-- 4. Organization Invitations 테이블 (보안 초대 링크)
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id TEXT PRIMARY KEY DEFAULT ('inv_' || encode(gen_random_bytes(12), 'hex')),
    organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, -- SHA-256 Hash of raw random invitation token
    role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Admin', 'Member', 'Inspector', 'Reviewer', 'Reporter', 'Viewer')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    max_uses INT NOT NULL DEFAULT 1,
    use_count INT NOT NULL DEFAULT 0
);

-- 인덱스 생성 (조회 및 RLS 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_hash ON public.organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.organization_invitations(organization_id);

-- 5. 기존 프로젝트/시설물 테이블 컬럼 보강 (organization_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'ps_projects' AND column_name = 'organization_id'
    ) THEN
        ALTER TABLE public.ps_projects ADD COLUMN organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'ps_facilities' AND column_name = 'organization_id'
    ) THEN
        ALTER TABLE public.ps_facilities ADD COLUMN organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 6. Helper Security Functions (RLS용 도우미 함수)

-- 사용자가 특정 조직의 활성 멤버인지 확인
CREATE OR REPLACE FUNCTION public.is_org_member(org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND status = 'active'
    ) OR EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = org_id
          AND owner_user_id = auth.uid()
    );
$$;

-- 사용자가 특정 조직의 Admin 또는 Owner인지 확인
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND role IN ('Owner', 'Admin')
          AND status = 'active'
    ) OR EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = org_id
          AND owner_user_id = auth.uid()
    );
$$;

-- 7. Secure RPC Functions (초대 생성, 검증, 수락, 취소)

-- 7-1. 초대장 생성 (Owner / Admin 전용)
CREATE OR REPLACE FUNCTION public.create_secure_invitation(
    p_organization_id TEXT,
    p_token_hash TEXT,
    p_role TEXT DEFAULT 'Member',
    p_expires_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_invitation_id TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    -- 권한 검증: 조직 Owner 또는 Admin만 초대 생성 가능
    IF NOT public.is_org_admin(p_organization_id) THEN
        RAISE EXCEPTION '초대 권한이 없습니다. (Owner/Admin만 생성 가능)';
    END IF;

    -- Owner 역할 초대는 보안상 차단 (새로운 Owner는 별도 양도 절차 필요)
    IF p_role = 'Owner' THEN
        RAISE EXCEPTION 'Owner 역할로는 직접 초대할 수 없습니다.';
    END IF;

    v_expires_at := TIMEZONE('utc'::text, NOW()) + (p_expires_days || ' days')::INTERVAL;
    v_invitation_id := 'inv_' || encode(gen_random_bytes(12), 'hex');

    INSERT INTO public.organization_invitations (
        id, organization_id, token_hash, role, created_by, created_at, expires_at, max_uses, use_count
    ) VALUES (
        v_invitation_id, p_organization_id, p_token_hash, p_role, v_user_id, NOW(), v_expires_at, 1, 0
    );

    RETURN jsonb_build_object(
        'ok', true,
        'invitation_id', v_invitation_id,
        'expires_at', v_expires_at,
        'role', p_role
    );
END;
$$;

-- 7-2. 초대장 상태 검증 (인증 여부와 관계없이 토큰 해시로 상태 확인)
CREATE OR REPLACE FUNCTION public.verify_invitation_token(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        'expires_at', v_inv.expires_at
    );
END;
$$;

-- 7-3. 초대 수락 (로그인된 사용자가 조직 가입)
CREATE OR REPLACE FUNCTION public.accept_secure_invitation(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- 사용자 이메일 조회
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    -- 초대장 잠금 조회
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

    -- 기존 멤버십 확인 (중복 가입 방지)
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

    -- 신규 멤버십 생성
    INSERT INTO public.organization_members (
        organization_id, user_id, email, role, status
    ) VALUES (
        v_inv.organization_id, v_user_id, v_user_email, v_inv.role, 'active'
    );

    -- 초대장 상태 업데이트
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
SET search_path = public
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

-- 8. Row Level Security (RLS) 활성화 및 정책 구성

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- 8-1. Profiles 정책
DO $$ BEGIN
    DROP POLICY IF EXISTS "Profiles viewable by self and org peers" ON public.profiles;
    CREATE POLICY "Profiles viewable by self and org peers" ON public.profiles
        FOR SELECT TO authenticated
        USING (id = auth.uid());

    DROP POLICY IF EXISTS "Profiles insert/update by self" ON public.profiles;
    CREATE POLICY "Profiles insert/update by self" ON public.profiles
        FOR ALL TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid());
END $$;

-- 8-2. Organizations 정책
DO $$ BEGIN
    DROP POLICY IF EXISTS "Organizations select for members" ON public.organizations;
    CREATE POLICY "Organizations select for members" ON public.organizations
        FOR SELECT TO authenticated
        USING (public.is_org_member(id));

    DROP POLICY IF EXISTS "Organizations insert by authenticated" ON public.organizations;
    CREATE POLICY "Organizations insert by authenticated" ON public.organizations
        FOR INSERT TO authenticated
        WITH CHECK (owner_user_id = auth.uid());

    DROP POLICY IF EXISTS "Organizations update by owner/admin" ON public.organizations;
    CREATE POLICY "Organizations update by owner/admin" ON public.organizations
        FOR UPDATE TO authenticated
        USING (public.is_org_admin(id))
        WITH CHECK (public.is_org_admin(id));
END $$;

-- 8-3. Organization Members 정책
DO $$ BEGIN
    DROP POLICY IF EXISTS "Org members select for org peers" ON public.organization_members;
    CREATE POLICY "Org members select for org peers" ON public.organization_members
        FOR SELECT TO authenticated
        USING (public.is_org_member(organization_id));

    DROP POLICY IF EXISTS "Org members insert/update by admin" ON public.organization_members;
    CREATE POLICY "Org members insert/update by admin" ON public.organization_members
        FOR ALL TO authenticated
        USING (public.is_org_admin(organization_id))
        WITH CHECK (public.is_org_admin(organization_id));
END $$;

-- 8-4. Projects / Facilities RLS 정책 (조직 격리)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ps_projects') THEN
        ALTER TABLE public.ps_projects ENABLE ROW LEVEL SECURITY;

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
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ps_facilities') THEN
        ALTER TABLE public.ps_facilities ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Facilities accessible by owner or org members" ON public.ps_facilities;
        CREATE POLICY "Facilities accessible by owner or org members" ON public.ps_facilities
            FOR ALL TO authenticated
            USING (
                user_id = auth.uid() OR
                (organization_id IS NOT NULL AND public.is_org_member(organization_id))
            )
            WITH CHECK (
                user_id = auth.uid() OR
                (organization_id IS NOT NULL AND public.is_org_member(organization_id))
            );
    END IF;
END $$;
