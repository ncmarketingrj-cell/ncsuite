-- Habilita a extensão pgcrypto necessária para crypt() e gen_salt()
-- Requerida pelas funções admin_create_user e admin_update_user
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recria admin_create_user garantindo que a extensão esteja disponível
CREATE OR REPLACE FUNCTION public.admin_create_user(
  new_email text,
  new_password text,
  new_name text,
  new_position text,
  new_role text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  new_user_id uuid;
  hashed_pw text;
BEGIN
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem cadastrar novos usuários.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = new_email) THEN
    RAISE EXCEPTION 'Este e-mail já está cadastrado no sistema.';
  END IF;

  hashed_pw := extensions.crypt(new_password, extensions.gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    new_email,
    hashed_pw,
    now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', new_name, 'position', new_position, 'role', new_role),
    now(),
    now()
  )
  RETURNING id INTO new_user_id;

  UPDATE public.profiles
  SET full_name = new_name, position = new_position, role = new_role
  WHERE id = new_user_id;

  RETURN new_user_id;
END;
$$;

-- Recria admin_update_user garantindo que a extensão esteja disponível
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem atualizar perfis alheios.';
  END IF;

  UPDATE public.profiles
  SET role = new_role, position = new_position, full_name = new_name, updated_at = now()
  WHERE id = target_user_id;

  IF new_password IS NOT NULL AND new_password <> '' THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;
END;
$$;
