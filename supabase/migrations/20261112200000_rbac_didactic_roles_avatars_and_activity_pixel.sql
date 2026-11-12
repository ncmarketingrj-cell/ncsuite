-- ==============================================================================
-- Migration: 20261112200000_rbac_didactic_roles_avatars_and_activity_pixel.sql
-- Purpose:
--   1. Corrige constraint profiles_role_check para aceitar todos os cargos/roles
--      (desenvolvedor, diretor, coordenador, gestor_projetos, designer, sdr, etc.)
--   2. Corrige bug de cast booleano em admin_update_user (onde 'none'/'view'/'edit'
--      causava erro "invalid input syntax for type boolean")
--   3. Garante visibilidade global das fotos de perfil (profiles + storage media)
--   4. Adiciona colunas last_seen_at / last_route em profiles para status online
--   5. Cria estrutura robusta do Pixel de Monitoramento & Fluxo de Trabalho
--      (user_activity_daily, user_activity_events e RPC track_user_pixel)
-- ==============================================================================

-- 1. Expansão segura da constraint profiles_role_check
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IS NULL OR role IN (
    'master_admin',
    'admin',
    'ceo',
    'diretor',
    'gerente',
    'coordenador',
    'gestor_trafego',
    'gestor_projetos',
    'desenvolvedor',
    'social_media',
    'designer',
    'videomaker',
    'sdr',
    'agency_sdr',
    'client_store',
    'staff',
    'employee',
    'outro'
  )
);

-- 2. Colunas de presença em tempo real em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_route text,
  ADD COLUMN IF NOT EXISTS last_page_label text;

-- 3. Visibilidade global das fotos e diretório básico para usuários autenticados
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "profiles select authenticated" ON public.profiles;
CREATE POLICY "profiles select authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Garante bucket 'media' público e leitura global das fotos de perfil
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Media public read" ON storage.objects;
CREATE POLICY "Media public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Media auth insert" ON storage.objects;
CREATE POLICY "Media auth insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "Media auth update" ON storage.objects;
CREATE POLICY "Media auth update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media');

-- 4. Helper seguro de permissão (trata 'none', 'view', 'edit', 'true', 'false' sem erro de cast)
CREATE OR REPLACE FUNCTION public._nc_perm_is_enabled(perms jsonb, perm_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(lower(perms->>perm_key), 'none') IN ('view', 'edit', 'true', '1');
$$;

-- Atualiza _nc_get_hierarchy_level para reconhecer todos os novos cargos
CREATE OR REPLACE FUNCTION public._nc_get_hierarchy_level(
  p_email text,
  p_role text,
  p_position text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, '')));
  v_pos text := lower(trim(coalesce(p_position, '')));
BEGIN
  IF v_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') OR v_role = 'master_admin' THEN
    RETURN 100;
  END IF;
  IF v_role IN ('admin', 'ceo') OR v_pos ~ '(ceo|sócio|socio|proprietário|proprietario|dono|administrador master)' THEN
    RETURN 90;
  END IF;
  IF v_role = 'diretor' OR v_pos ~ '(diretor|diretora)' THEN
    RETURN 80;
  END IF;
  IF v_role = 'gerente' OR v_pos ~ '(gerente|head|gestor geral)' THEN
    RETURN 70;
  END IF;
  IF v_role = 'coordenador' OR v_pos ~ '(coordenador|coordenadora|líder|lider|team lead)' THEN
    RETURN 60;
  END IF;
  IF v_role IN ('gestor_trafego', 'gestor_projetos', 'desenvolvedor')
     OR v_pos ~ '(gestor de tráfego|gestor de trafego|gestor de projetos|desenvolvedor|programador|media buyer)' THEN
    RETURN 50;
  END IF;
  IF v_role IN ('social_media', 'designer', 'videomaker')
     OR v_pos ~ '(social media|designer|videomaker|filmmaker)' THEN
    RETURN 20;
  END IF;
  IF v_role IN ('sdr', 'agency_sdr') OR v_pos ~ '(sdr|bdr|comercial|vendas|closer)' THEN
    RETURN 15;
  END IF;
  RETURN 10;
END;
$$;

-- Helper para verificar se o usuário autenticado atual pode gerenciar equipe/monitoramento
CREATE OR REPLACE FUNCTION public._nc_can_manage_users()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_role text;
  v_perms jsonb;
BEGIN
  v_email := lower(coalesce(auth.email(), ''));
  IF v_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RETURN true;
  END IF;

  SELECT role, permissions INTO v_role, v_perms
  FROM public.profiles
  WHERE id = auth.uid();

  IF lower(coalesce(v_role, '')) IN ('master_admin', 'admin', 'ceo') THEN
    RETURN true;
  END IF;

  RETURN public._nc_perm_is_enabled(v_perms, 'criar_usuarios');
END;
$$;

-- Atualiza admin_update_user para respeitar permissões 'none'/'view'/'edit' corretamente
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL,
  new_email text DEFAULT NULL,
  new_status text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_pos text;
  caller_perms jsonb;
  caller_level int;
  caller_has_perm boolean;
  target_email text;
  target_role text;
  target_pos text;
  target_level int;
  clean_new_email text;
  clean_new_pwd text;
BEGIN
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT role, position, permissions INTO caller_role, caller_pos, caller_perms
  FROM public.profiles WHERE id = auth.uid();

  caller_level := public._nc_get_hierarchy_level(caller_email, caller_role, caller_pos);
  caller_has_perm := caller_level >= 90 OR public._nc_perm_is_enabled(caller_perms, 'criar_usuarios');

  SELECT lower(coalesce(u.email, p.email, '')), p.role, p.position
  INTO target_email, target_role, target_pos
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = target_user_id;

  target_level := public._nc_get_hierarchy_level(target_email, target_role, target_pos);

  -- Proteção absoluta ao Administrador Master
  IF target_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    IF caller_level < 100 OR auth.uid() <> target_user_id THEN
      RAISE EXCEPTION 'Acesso negado. O Administrador Master possui proteção absoluta.';
    END IF;
    new_role := 'admin';
  END IF;

  -- Se estiver editando outro usuário, exige permissão ativa + hierarquia superior estrita
  IF auth.uid() <> target_user_id THEN
    IF NOT caller_has_perm THEN
      RAISE EXCEPTION 'Acesso negado. Você não possui permissão de Gestão de Usuários.';
    END IF;
    IF caller_level < 100 AND caller_level <= target_level THEN
      RAISE EXCEPTION 'Acesso negado. Hierarquia insuficiente: você só pode gerenciar usuários subordinados ao seu nível.';
    END IF;
  END IF;

  clean_new_email := NULLIF(lower(trim(coalesce(new_email, ''))), '');
  clean_new_pwd := NULLIF(trim(coalesce(new_password, '')), '');

  IF clean_new_email IS NOT NULL AND clean_new_email <> target_email THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = clean_new_email AND id <> target_user_id) THEN
      RAISE EXCEPTION 'Este e-mail já está em uso por outro usuário.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET role       = CASE WHEN auth.uid() = target_user_id THEN role ELSE coalesce(new_role, role) END,
      position   = CASE WHEN nullif(trim(coalesce(new_position, '')), '') IS NOT NULL THEN new_position ELSE position END,
      full_name  = CASE WHEN nullif(trim(coalesce(new_name, '')), '') IS NOT NULL THEN trim(new_name) ELSE full_name END,
      email      = coalesce(clean_new_email, email),
      status     = coalesce(new_status, status, 'ativo'),
      updated_at = now()
  WHERE id = target_user_id;

  IF clean_new_email IS NOT NULL AND clean_new_email <> target_email THEN
    UPDATE auth.users
    SET email = clean_new_email,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        email_change = '',
        email_change_token_new = '',
        raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{email}', to_jsonb(clean_new_email)),
        updated_at = now()
    WHERE id = target_user_id;

    UPDATE auth.identities
    SET provider_id = clean_new_email,
        identity_data = jsonb_set(
          jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(clean_new_email)),
          '{email_verified}', 'true'::jsonb
        ),
        updated_at = now()
    WHERE user_id = target_user_id AND provider = 'email';
  END IF;

  IF clean_new_pwd IS NOT NULL THEN
    IF length(clean_new_pwd) < 6 THEN
      RAISE EXCEPTION 'A senha deve ter no mínimo 6 caracteres.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(clean_new_pwd, extensions.gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;
END;
$$;

-- Atualiza admin_set_user_permissions e admin_delete_user para usar _nc_perm_is_enabled também
CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(target_user_id uuid, new_permissions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_pos text;
  caller_perms jsonb;
  caller_level int;
  caller_has_perm boolean;
  target_email text;
  target_role text;
  target_pos text;
  target_level int;
BEGIN
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT role, position, permissions INTO caller_role, caller_pos, caller_perms FROM public.profiles WHERE id = auth.uid();
  caller_level := public._nc_get_hierarchy_level(caller_email, caller_role, caller_pos);
  caller_has_perm := caller_level >= 90 OR public._nc_perm_is_enabled(caller_perms, 'criar_usuarios');

  SELECT lower(coalesce(u.email, p.email, '')), p.role, p.position
  INTO target_email, target_role, target_pos
  FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE p.id = target_user_id;
  target_level := public._nc_get_hierarchy_level(target_email, target_role, target_pos);

  IF target_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') AND caller_level < 100 THEN
    RAISE EXCEPTION 'Acesso negado ao Administrador Master.';
  END IF;

  IF auth.uid() <> target_user_id THEN
    IF NOT caller_has_perm THEN
      RAISE EXCEPTION 'Acesso negado. Sem permissão de Gestão de Usuários.';
    END IF;
    IF caller_level < 100 AND caller_level <= target_level THEN
      RAISE EXCEPTION 'Hierarquia insuficiente para editar permissões deste usuário.';
    END IF;
  END IF;

  UPDATE public.profiles SET permissions = new_permissions, updated_at = now() WHERE id = target_user_id;
END;
$$;

-- 5. Estrutura do Pixel de Monitoramento & Fluxo de Trabalho
CREATE TABLE IF NOT EXISTS public.user_activity_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_route text,
  last_page_label text,
  last_hub text,
  active_seconds integer NOT NULL DEFAULT 0,
  page_views_count integer NOT NULL DEFAULT 1,
  session_starts_count integer NOT NULL DEFAULT 1,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_date)
);

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  route text NOT NULL,
  page_label text NOT NULL,
  hub_name text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  event_type text NOT NULL DEFAULT 'page_view',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_daily_date ON public.user_activity_daily(activity_date DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_daily_user_date ON public.user_activity_daily(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_date ON public.user_activity_events(user_id, activity_date DESC, entered_at DESC);

ALTER TABLE public.user_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_daily_select_policy" ON public.user_activity_daily;
CREATE POLICY "activity_daily_select_policy"
  ON public.user_activity_daily
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public._nc_can_manage_users());

DROP POLICY IF EXISTS "activity_daily_insert_own" ON public.user_activity_daily;
CREATE POLICY "activity_daily_insert_own"
  ON public.user_activity_daily
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activity_daily_update_own" ON public.user_activity_daily;
CREATE POLICY "activity_daily_update_own"
  ON public.user_activity_daily
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activity_events_select_policy" ON public.user_activity_events;
CREATE POLICY "activity_events_select_policy"
  ON public.user_activity_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public._nc_can_manage_users());

DROP POLICY IF EXISTS "activity_events_insert_own" ON public.user_activity_events;
CREATE POLICY "activity_events_insert_own"
  ON public.user_activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activity_events_update_own" ON public.user_activity_events;
CREATE POLICY "activity_events_update_own"
  ON public.user_activity_events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC principal do Pixel de Monitoramento (atômico, leve e seguro)
CREATE OR REPLACE FUNCTION public.track_user_pixel(
  p_route text,
  p_page_label text,
  p_hub text,
  p_event_id uuid DEFAULT NULL,
  p_delta_seconds integer DEFAULT 0,
  p_is_login boolean DEFAULT false,
  p_device text DEFAULT NULL,
  p_activity_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_safe_delta integer := GREATEST(0, LEAST(COALESCE(p_delta_seconds, 0), 300));
  v_event_id uuid;
  v_date date := COALESCE(p_activity_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Upsert resumo diário
  INSERT INTO public.user_activity_daily (
    user_id, activity_date, first_seen_at, last_seen_at,
    last_route, last_page_label, last_hub,
    active_seconds, page_views_count, session_starts_count, device_info, updated_at
  )
  VALUES (
    v_uid, v_date, now(), now(),
    p_route, p_page_label, p_hub,
    v_safe_delta,
    CASE WHEN p_event_id IS NULL THEN 1 ELSE 0 END,
    CASE WHEN p_is_login THEN 1 ELSE 0 END,
    p_device,
    now()
  )
  ON CONFLICT (user_id, activity_date) DO UPDATE
    SET last_seen_at = now(),
        last_route = EXCLUDED.last_route,
        last_page_label = EXCLUDED.last_page_label,
        last_hub = EXCLUDED.last_hub,
        active_seconds = public.user_activity_daily.active_seconds + v_safe_delta,
        page_views_count = public.user_activity_daily.page_views_count + CASE WHEN p_event_id IS NULL THEN 1 ELSE 0 END,
        session_starts_count = GREATEST(1, public.user_activity_daily.session_starts_count + CASE WHEN p_is_login THEN 1 ELSE 0 END),
        device_info = COALESCE(EXCLUDED.device_info, public.user_activity_daily.device_info),
        updated_at = now();

  -- 2. Atualiza presença em profiles
  UPDATE public.profiles
  SET last_seen_at = now(),
      last_route = p_route,
      last_page_label = p_page_label
  WHERE id = v_uid;

  -- 3. Atualiza evento atual OU inicia um novo evento de tela no fluxo
  IF p_event_id IS NOT NULL THEN
    UPDATE public.user_activity_events
    SET last_ping_at = now(),
        duration_seconds = duration_seconds + v_safe_delta
    WHERE id = p_event_id AND user_id = v_uid
    RETURNING id INTO v_event_id;
  END IF;

  IF v_event_id IS NULL THEN
    INSERT INTO public.user_activity_events (
      user_id, activity_date, route, page_label, hub_name,
      entered_at, last_ping_at, duration_seconds, event_type
    )
    VALUES (
      v_uid, v_date, p_route, p_page_label, p_hub,
      now(), now(), v_safe_delta,
      CASE WHEN p_is_login THEN 'login' ELSE 'page_view' END
    )
    RETURNING id INTO v_event_id;
  END IF;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_user_pixel(text, text, text, uuid, integer, boolean, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public._nc_can_manage_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public._nc_perm_is_enabled(jsonb, text) TO authenticated;

-- Atualiza admin_delete_user para usar _nc_perm_is_enabled (evita crash em cast ::boolean)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_pos text;
  caller_perms jsonb;
  caller_level int;
  caller_has_perm boolean;
  target_email text;
  target_role text;
  target_pos text;
  target_level int;
BEGIN
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT role, position, permissions INTO caller_role, caller_pos, caller_perms
  FROM public.profiles WHERE id = auth.uid();

  caller_level := public._nc_get_hierarchy_level(caller_email, caller_role, caller_pos);
  caller_has_perm := caller_level >= 90 OR public._nc_perm_is_enabled(caller_perms, 'criar_usuarios');

  IF NOT caller_has_perm THEN
    RAISE EXCEPTION 'Acesso negado. Apenas usuários autorizados podem excluir colaboradores.';
  END IF;

  SELECT lower(coalesce(u.email, p.email, '')), p.role, p.position
  INTO target_email, target_role, target_pos
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = target_user_id;

  IF target_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'O Administrador Master é protegido e nunca pode ser excluído.';
  END IF;

  target_level := public._nc_get_hierarchy_level(target_email, target_role, target_pos);
  IF caller_level < 100 AND caller_level <= target_level THEN
    RAISE EXCEPTION 'Hierarquia insuficiente. Você só pode excluir subordinados.';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
