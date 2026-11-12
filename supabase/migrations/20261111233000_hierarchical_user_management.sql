-- Migration: Hierarchical User Management & Credential Editing
-- NC Performance Suite

-- 1. Atualizar RPC admin_update_user para permitir alterar login/email, senha, cargo, role e status
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL,
  new_email text DEFAULT NULL,
  new_status text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_email text;
  caller_role text;
  caller_level int := 10;
  target_email text;
  target_role text;
  target_level int := 10;
BEGIN
  -- Identifica o executor
  caller_email := lower(coalesce(auth.email(), ''));
  SELECT coalesce(role, 'outro') INTO caller_role FROM profiles WHERE id = auth.uid();

  -- Calcula nível do caller
  IF caller_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    caller_level := 100;
  ELSIF caller_role IN ('admin', 'ceo') THEN
    caller_level := 90;
  ELSIF caller_role = 'diretor' THEN
    caller_level := 80;
  ELSIF caller_role = 'gerente' THEN
    caller_level := 70;
  ELSIF caller_role = 'coordenador' THEN
    caller_level := 60;
  ELSIF caller_role IN ('gestor_trafego', 'gestor_projetos', 'desenvolvedor') THEN
    caller_level := 50;
  ELSE
    caller_level := 10;
  END IF;

  -- Busca dados do usuário alvo
  SELECT lower(coalesce(email, '')) INTO target_email FROM auth.users WHERE id = target_user_id;
  SELECT coalesce(role, 'outro') INTO target_role FROM profiles WHERE id = target_user_id;

  -- Calcula nível do target
  IF target_email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    target_level := 100;
  ELSIF target_role IN ('admin', 'ceo') THEN
    target_level := 90;
  ELSIF target_role = 'diretor' THEN
    target_level := 80;
  ELSIF target_role = 'gerente' THEN
    target_level := 70;
  ELSIF target_role = 'coordenador' THEN
    target_level := 60;
  ELSIF target_role IN ('gestor_trafego', 'gestor_projetos', 'desenvolvedor') THEN
    target_level := 50;
  ELSE
    target_level := 10;
  END IF;

  -- Protege Master Admin
  IF target_level = 100 THEN
    IF caller_level < 100 OR auth.uid() <> target_user_id THEN
      RAISE EXCEPTION 'Acesso negado. O Administrador Master possui proteção absoluta.';
    END IF;
    new_role := 'admin';
  END IF;

  -- Se não for o próprio master admin editando a si mesmo, exige superioridade estrita
  IF auth.uid() <> target_user_id THEN
    IF caller_level <= target_level THEN
      RAISE EXCEPTION 'Acesso negado. Hierarquia insuficiente: você só pode gerenciar usuários subordinados ao seu nível.';
    END IF;
  END IF;

  -- Atualiza profiles
  UPDATE public.profiles
  SET role = coalesce(new_role, role),
      position = coalesce(new_position, position),
      full_name = coalesce(new_name, full_name),
      email = coalesce(lower(trim(new_email)), email),
      status = coalesce(new_status, status, 'ativo'),
      updated_at = now()
  WHERE id = target_user_id;

  -- Atualiza credenciais no auth.users se fornecidas
  IF new_email IS NOT NULL AND trim(new_email) <> '' THEN
    UPDATE auth.users
    SET email = lower(trim(new_email)),
        raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{email}', to_jsonb(lower(trim(new_email)))),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  IF new_password IS NOT NULL AND trim(new_password) <> '' AND length(trim(new_password)) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = crypt(trim(new_password), gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;
END;
$$;

-- 2. Wrapper retrocompatível com 5 parâmetros
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_update_user(target_user_id, new_role, new_position, new_name, new_password, NULL, NULL);
END;
$$;

