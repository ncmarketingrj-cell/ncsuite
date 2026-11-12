-- ============================================================================
-- Migration: Correção definitiva de Credenciais, Login e Senhas (SEM envio de e-mail)
-- Projeto: NC Performance Suite (uqhilsnrrmlepdjzpubq)
-- ============================================================================

-- 1. Garante extensão pgcrypto no schema extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Garante coluna status na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

-- 3. Repara usuários existentes em auth.users e auth.identities SEM envio de e-mail:
--    - Confirma todos os e-mails cadastrados por superiores (email_confirmed_at)
--    - Cria auth.identities faltantes exigidos pelo GoTrue v2 para login
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    updated_at = now()
WHERE email_confirmed_at IS NULL;

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

-- 4. Helper interno de nível hierárquico
CREATE OR REPLACE FUNCTION public._nc_get_hierarchy_level(p_email text, p_role text, p_position text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  e text := lower(trim(coalesce(p_email, '')));
  r text := lower(trim(coalesce(p_role, '')));
  p text := lower(trim(coalesce(p_position, '')));
BEGIN
  IF e IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RETURN 100;
  END IF;
  IF r IN ('admin', 'ceo') OR p ~* '(ceo|s[oó]cio|propriet[aá]rio|dono|administrador master)' THEN
    RETURN 90;
  END IF;
  IF r = 'diretor' OR p ~* 'diretor' THEN RETURN 80; END IF;
  IF r = 'gerente' OR p ~* '(gerente|head)' THEN RETURN 70; END IF;
  IF r = 'coordenador' OR p ~* '(coordenador|l[ií]der|team lead)' THEN RETURN 60; END IF;
  IF r IN ('gestor_trafego', 'gestor_projetos', 'desenvolvedor') OR p ~* '(gestor|media buyer|desenvolvedor)' THEN RETURN 50; END IF;
  IF r IN ('social_media', 'designer', 'videomaker') OR p ~* '(social|designer|filmmaker|videomaker)' THEN RETURN 20; END IF;
  IF r IN ('sdr', 'agency_sdr') OR p ~* '(sdr|comercial|vendas)' THEN RETURN 15; END IF;
  RETURN 10;
END;
$$;

-- 5. Recria admin_create_user (confirmação imediata, sem e-mail, pgcrypto via extensions)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  new_email text,
  new_password text,
  new_name text,
  new_position text,
  new_role text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_pos text;
  caller_perms jsonb;
  caller_level int;
  assigned_level int;
  clean_email text := lower(trim(new_email));
  clean_pwd text := trim(new_password);
  new_user_id uuid;
  hashed_pw text;
BEGIN
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT role, position, permissions INTO caller_role, caller_pos, caller_perms
  FROM public.profiles WHERE id = auth.uid();

  caller_level := public._nc_get_hierarchy_level(caller_email, caller_role, caller_pos);

  IF caller_level < 70 AND NOT coalesce((caller_perms->>'criar_usuarios')::boolean, false) THEN
    RAISE EXCEPTION 'Acesso negado. Apenas gestores superiores podem cadastrar novos usuários.';
  END IF;

  IF clean_email = '' OR length(clean_pwd) < 6 THEN
    RAISE EXCEPTION 'E-mail inválido ou senha menor que 6 caracteres.';
  END IF;

  assigned_level := public._nc_get_hierarchy_level('', new_role, new_position);
  IF caller_level < 100 AND assigned_level >= caller_level THEN
    RAISE EXCEPTION 'Hierarquia insuficiente para criar usuário deste nível.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = clean_email) THEN
    RAISE EXCEPTION 'Este e-mail já está cadastrado no sistema.';
  END IF;

  hashed_pw := extensions.crypt(clean_pwd, extensions.gen_salt('bf', 10));
  new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated', 'authenticated',
    clean_email, hashed_pw, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'full_name', trim(new_name),
      'position', new_position,
      'role', coalesce(new_role, 'outro'),
      'email', clean_email,
      'email_verified', true
    ),
    now(), now()
  );

  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    clean_email,
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', clean_email, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, position, role, email, status, updated_at)
  VALUES (new_user_id, trim(new_name), new_position, coalesce(new_role, 'outro'), clean_email, 'ativo', now())
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        position  = EXCLUDED.position,
        role      = EXCLUDED.role,
        email     = EXCLUDED.email,
        status    = 'ativo',
        updated_at = now();

  RETURN new_user_id;
END;
$$;

-- 6. Recria admin_update_user com search_path = public, extensions e ZERO envio de e-mail
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

  -- Se estiver editando outro usuário, exige hierarquia superior ou permissão criar_usuarios
  IF auth.uid() <> target_user_id THEN
    IF caller_level < 70 AND NOT coalesce((caller_perms->>'criar_usuarios')::boolean, false) THEN
      RAISE EXCEPTION 'Acesso negado. Permissão insuficiente para gerenciar usuários.';
    END IF;
    IF caller_level < 100 AND caller_level <= target_level THEN
      RAISE EXCEPTION 'Acesso negado. Hierarquia insuficiente: você só pode gerenciar usuários subordinados ao seu nível.';
    END IF;
  END IF;

  clean_new_email := NULLIF(lower(trim(coalesce(new_email, ''))), '');
  clean_new_pwd := NULLIF(trim(coalesce(new_password, '')), '');

  -- Verifica duplicidade de e-mail se mudou
  IF clean_new_email IS NOT NULL AND clean_new_email <> target_email THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = clean_new_email AND id <> target_user_id) THEN
      RAISE EXCEPTION 'Este e-mail já está em uso por outro usuário.';
    END IF;
  END IF;

  -- Atualiza perfil
  UPDATE public.profiles
  SET role       = CASE WHEN auth.uid() = target_user_id THEN role ELSE coalesce(new_role, role) END,
      position   = CASE WHEN nullif(trim(coalesce(new_position, '')), '') IS NOT NULL THEN new_position ELSE position END,
      full_name  = CASE WHEN nullif(trim(coalesce(new_name, '')), '') IS NOT NULL THEN trim(new_name) ELSE full_name END,
      email      = coalesce(clean_new_email, email),
      status     = coalesce(new_status, status, 'ativo'),
      updated_at = now()
  WHERE id = target_user_id;

  -- Atualiza e-mail diretamente em auth.users + auth.identities SEM envio de confirmação
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

  -- Atualiza senha diretamente no auth.users (garante confirmação imediata, sem e-mail)
  IF clean_new_pwd IS NOT NULL AND length(clean_new_pwd) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(clean_new_pwd, extensions.gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;

    -- Garante que auth.identities exista
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    SELECT
      u.email,
      u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email',
      now(), now(), now()
    FROM auth.users u
    WHERE u.id = target_user_id
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
      );
  END IF;
END;
$$;

-- 7. Wrapper retrocompatível com 5 parâmetros (chama o de 7 parâmetros acima)
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.admin_update_user(target_user_id, new_role, new_position, new_name, new_password, NULL, NULL);
END;
$$;

-- 8. Atualiza admin_set_user_permissions e admin_delete_user com suporte completo à hierarquia
CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(
  target_user_id uuid,
  new_permissions jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_pos text;
  caller_perms jsonb;
  caller_level int;
  target_email text;
  target_role text;
  target_pos text;
  target_level int;
BEGIN
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT role, position, permissions INTO caller_role, caller_pos, caller_perms
  FROM public.profiles WHERE id = auth.uid();

  caller_level := public._nc_get_hierarchy_level(caller_email, caller_role, caller_pos);

  IF caller_level < 70 AND NOT coalesce((caller_perms->>'criar_usuarios')::boolean, false) THEN
    RAISE EXCEPTION 'Permissão negada para alterar acessos.';
  END IF;

  SELECT lower(coalesce(u.email, p.email, '')), p.role, p.position
  INTO target_email, target_role, target_pos
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = target_user_id;

  IF target_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') AND auth.uid() <> target_user_id THEN
    RAISE EXCEPTION 'O Administrador Master é protegido e suas permissões não podem ser alteradas por terceiros.';
  END IF;

  target_level := public._nc_get_hierarchy_level(target_email, target_role, target_pos);
  IF caller_level < 100 AND caller_level <= target_level AND auth.uid() <> target_user_id THEN
    RAISE EXCEPTION 'Hierarquia insuficiente para alterar permissões deste usuário.';
  END IF;

  UPDATE public.profiles SET permissions = new_permissions, updated_at = now() WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_pos text;
  caller_perms jsonb;
  caller_level int;
  target_email text;
  target_role text;
  target_pos text;
  target_level int;
BEGIN
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT role, position, permissions INTO caller_role, caller_pos, caller_perms
  FROM public.profiles WHERE id = auth.uid();

  caller_level := public._nc_get_hierarchy_level(caller_email, caller_role, caller_pos);

  IF caller_level < 70 AND NOT coalesce((caller_perms->>'criar_usuarios')::boolean, false) THEN
    RAISE EXCEPTION 'Acesso negado. Apenas superiores podem excluir usuários.';
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

