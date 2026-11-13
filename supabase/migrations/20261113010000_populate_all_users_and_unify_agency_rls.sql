-- ==============================================================================
-- MIGRATION: 20261113010000_populate_all_users_and_unify_agency_rls.sql
-- Objetivo:
--   1. Garantir que TODOS os colaboradores autenticados da agência (independente
--      do nível hierárquico: Gestor de Tráfego, Social Media, Designer, Videomaker,
--      SDR, Coordenador, Gerente, Diretor, CEO, Desenvolvedor, Gestor de Projetos,
--      Operação Básica / Outro) enxerguem e operem 100% dos dados populados em
--      todas as páginas que têm permissão de acessar.
--   2. Reparar e sincronizar 100% dos logins (auth.users <-> auth.identities <->
--      public.profiles), garantindo que e-mails e senhas salvas funcionem sem falha.
--   3. Compartilhar a Base de Conhecimento e Calibração da Victoria AI com toda a equipe.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. FUNÇÃO CENTRAL DE ACESSO DA EQUIPE DA AGÊNCIA (is_agency_staff)
--    Retorna TRUE para qualquer usuário autenticado da equipe (qualquer cargo/role),
--    exceto contas externas estritamente isoladas como 'client_store' com client_id.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_agency_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'client_store'
    AND client_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_agency_staff() TO authenticated, anon, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. SINCRONIZAÇÃO COMPLETA DE LOGINS, SENHAS E PERFIS (auth.users <-> profiles)
-- ──────────────────────────────────────────────────────────────────────────────

-- 2.1 Confirmar todos os e-mails em auth.users e limpar tokens pendentes de troca de e-mail
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    updated_at = now()
WHERE email_confirmed_at IS NULL
   OR email_change IS NULL
   OR email_change <> '';

-- 2.2 Garantir registro em auth.identities para todos os usuários do auth.users
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  u.email,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- 2.3 Preencher e-mail ausente em public.profiles a partir de auth.users
UPDATE public.profiles p
SET email = lower(trim(u.email))
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR trim(p.email) = '')
  AND u.email IS NOT NULL;

-- 2.4 Garantir que todo usuário em auth.users possua linha correspondente em public.profiles
INSERT INTO public.profiles (id, email, full_name, position, role, status, updated_at)
SELECT
  u.id,
  lower(trim(u.email)),
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
    initcap(split_part(u.email, '@', 1))
  ),
  COALESCE(NULLIF(trim(u.raw_user_meta_data->>'position'), ''), 'Gestor de Tráfego'),
  CASE
    WHEN lower(trim(u.email)) IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN 'admin'
    WHEN NULLIF(trim(u.raw_user_meta_data->>'role'), '') IS NOT NULL THEN lower(trim(u.raw_user_meta_data->>'role'))
    ELSE 'gestor_trafego'
  END,
  'ativo',
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
  )
ON CONFLICT (id) DO NOTHING;

-- 2.6 Garantir permissões padrão populadas para qualquer perfil que esteja com permissions nulo ou vazio
UPDATE public.profiles
SET permissions = CASE
  WHEN lower(coalesce(email, '')) IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com')
    OR lower(coalesce(role, '')) IN ('master_admin', 'admin', 'ceo', 'diretor') THEN
    jsonb_build_object(
      'dashboard', 'edit', 'metricas', 'edit', 'simulador', 'edit', 'cockpit', 'edit',
      'clientes', 'edit', 'relatorios', 'edit', 'criativos', 'edit', 'social', 'edit',
      'automacoes', 'edit', 'reunioes', 'edit', 'cobrancas', 'edit', 'strategy_map', 'edit',
      'agente', 'edit', 'gestao_victoria', 'edit', 'auditoria', 'edit', 'criar_usuarios', 'edit'
    )
  WHEN lower(coalesce(role, '')) IN ('gerente', 'coordenador') THEN
    jsonb_build_object(
      'dashboard', 'edit', 'metricas', 'edit', 'simulador', 'edit', 'cockpit', 'edit',
      'clientes', 'edit', 'relatorios', 'edit', 'criativos', 'edit', 'social', 'edit',
      'automacoes', 'edit', 'reunioes', 'edit', 'cobrancas', 'none', 'strategy_map', 'edit',
      'agente', 'edit', 'gestao_victoria', 'view', 'auditoria', 'edit', 'criar_usuarios', 'none'
    )
  WHEN lower(coalesce(role, '')) = 'social_media' OR lower(coalesce(position, '')) ~ 'social' THEN
    jsonb_build_object(
      'dashboard', 'view', 'metricas', 'none', 'simulador', 'none', 'cockpit', 'none',
      'clientes', 'view', 'relatorios', 'edit', 'criativos', 'edit', 'social', 'edit',
      'automacoes', 'none', 'reunioes', 'none', 'cobrancas', 'none', 'strategy_map', 'edit',
      'agente', 'view', 'gestao_victoria', 'none', 'auditoria', 'none', 'criar_usuarios', 'none'
    )
  ELSE
    jsonb_build_object(
      'dashboard', 'edit', 'metricas', 'edit', 'simulador', 'edit', 'cockpit', 'edit',
      'clientes', 'view', 'relatorios', 'edit', 'criativos', 'edit', 'social', 'none',
      'automacoes', 'edit', 'reunioes', 'none', 'cobrancas', 'none', 'strategy_map', 'edit',
      'agente', 'edit', 'gestao_victoria', 'none', 'auditoria', 'edit', 'criar_usuarios', 'none'
    )
END || COALESCE(permissions, '{}'::jsonb)
WHERE permissions IS NULL
   OR permissions = '{}'::jsonb
   OR NOT (permissions ? 'dashboard');

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RPC DE AUTO-REPARO DE SESSÃO NO LOGIN (ensure_user_session_ready)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_user_session_ready()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.email(), '')));
  v_profile record;
  v_orphan record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    -- Verifica se existe perfil órfão com mesmo e-mail
    IF v_email <> '' THEN
      SELECT * INTO v_orphan FROM public.profiles WHERE lower(trim(email)) = v_email LIMIT 1;
    END IF;

    INSERT INTO public.profiles (
      id, email, full_name, position, role, permissions, avatar_url, status, updated_at
    )
    VALUES (
      v_uid,
      v_email,
      COALESCE(v_orphan.full_name, initcap(split_part(v_email, '@', 1)), 'Colaborador'),
      COALESCE(v_orphan.position, 'Gestor de Tráfego'),
      COALESCE(v_orphan.role, CASE WHEN v_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN 'admin' ELSE 'gestor_trafego' END),
      COALESCE(v_orphan.permissions, jsonb_build_object(
        'dashboard', 'edit', 'metricas', 'edit', 'simulador', 'edit', 'cockpit', 'edit',
        'clientes', 'view', 'relatorios', 'edit', 'criativos', 'edit', 'social', 'none',
        'automacoes', 'edit', 'reunioes', 'none', 'cobrancas', 'none', 'strategy_map', 'edit',
        'agente', 'edit', 'gestao_victoria', 'none', 'auditoria', 'edit', 'criar_usuarios', 'none'
      )),
      v_orphan.avatar_url,
      'ativo',
      now()
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  END IF;

  RETURN to_jsonb(v_profile);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_session_ready() TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. UNIFICAÇÃO DAS POLÍTICAS RLS EM TODAS AS TABELAS OPERACIONAIS DA AGÊNCIA
--    Remove bloqueios por user_id / role restrito e libera leitura e escrita
--    para todos os colaboradores autenticados via public.is_agency_staff().
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  pol record;
  agency_tables text[] := ARRAY[
    'clients',
    'client_notes',
    'client_accounts',
    'ad_accounts',
    'ad_account_health',
    'ad_account_rules',
    'ad_account_notes',
    'campaigns',
    'campaign_period_stats',
    'campaign_portfolios',
    'portfolio_campaigns',
    'campaign_schedules',
    'ad_sets',
    'ads',
    'metrics',
    'asset_metrics',
    'hourly_metrics',
    'region_metrics',
    'placement_metrics',
    'device_metrics',
    'demographic_metrics',
    'meta_placement_metrics',
    'meta_device_metrics',
    'meta_period_stats',
    'reports',
    'report_templates',
    'swipe_files',
    'automation_rules',
    'automation_logs',
    'alert_thresholds',
    'sync_history',
    'billing_snapshots',
    'agency_settings',
    'meta_ads_configs',
    'google_ads_configs',
    'social_pages',
    'social_posts',
    'link_pages',
    'link_items',
    'link_clicks',
    'lead_captures',
    'quizzes',
    'quiz_steps',
    'quiz_submissions',
    'funnels',
    'funnel_nodes',
    'funnel_edges',
    'funnel_sessions',
    'funnel_events',
    'mind_maps',
    'mind_map_nodes',
    'mind_map_edges',
    'chart_configs',
    'meetings',
    'crm_leads',
    'crm_activities',
    'crm_appointments',
    'crm_pipelines',
    'crm_pipeline_stages',
    'crm_tasks',
    'crm_custom_pipelines',
    'crm_lead_activities',
    'crm_lead_notes',
    'victoria_knowledge',
    'victoria_knowledge_base'
  ];
BEGIN
  FOREACH tbl IN ARRAY agency_tables LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      -- Garante que RLS está ativo na tabela
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      -- Remove políticas autenticadas restritivas anteriores (preservando apenas políticas anon públicas)
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND policyname NOT ILIKE '%anon%'
          AND policyname NOT ILIKE '%public read%'
          AND policyname NOT ILIKE '%own_client_store%'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;

      -- Cria a política unificada para toda a equipe autenticada da agência
      EXECUTE format(
        'CREATE POLICY "nc_agency_staff_full_access" ON public.%I FOR ALL TO authenticated USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff())',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. POLÍTICAS DA TABELA PROFILES E VIEWS ANALÍTICAS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "profiles select authenticated" ON public.profiles;
CREATE POLICY "profiles select authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles update own or superior" ON public.profiles;
-- Edições de terceiros continuam passando pelas RPCs SECURITY DEFINER (admin_update_user /
-- admin_set_user_permissions), que validam a hierarquia. Aqui só o próprio usuário edita o seu perfil.
CREATE POLICY "profiles update own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
CREATE POLICY "profiles insert own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Garantir permissões de leitura nas views e tabelas para authenticated
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
DO $$
BEGIN
  IF to_regclass('public.daily_metrics') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.daily_metrics TO authenticated, anon, service_role';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. COMPARTILHAMENTO GLOBAL DA BASE RAG DA VICTORIA AI (match_victoria_knowledge)
--    Qualquer colaborador autenticado consulta toda a base treinada da agência.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.victoria_knowledge') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.match_victoria_knowledge (
        query_embedding vector(768),
        match_threshold float,
        match_count int,
        p_user_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        category text,
        title text,
        content text,
        similarity float
      )
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      BEGIN
        RETURN QUERY
        SELECT
          vk.id,
          vk.category,
          vk.title,
          vk.content,
          1 - (vk.embedding <=> query_embedding) AS similarity
        FROM public.victoria_knowledge vk
        WHERE vk.embedding IS NOT NULL
          AND 1 - (vk.embedding <=> query_embedding) > match_threshold
        ORDER BY vk.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $fn$;
    $sql$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
