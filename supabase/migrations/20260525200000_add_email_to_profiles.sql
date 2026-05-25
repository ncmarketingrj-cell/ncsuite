-- Adiciona coluna email na tabela profiles para exibição no painel admin
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill: preenche emails existentes a partir de auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Atualiza handle_new_user para salvar o email também
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'outro');
  IF v_role NOT IN ('admin','ceo','gerente','gestor_trafego','social_media','videomaker','outro') THEN
    v_role := 'outro';
  END IF;

  INSERT INTO public.profiles (id, full_name, position, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'position', ''),
    v_role,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Atualiza admin_create_user para salvar email no profile
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
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    new_email, hashed_pw, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', new_name, 'position', new_position, 'role', new_role),
    now(), now()
  )
  RETURNING id INTO new_user_id;

  INSERT INTO public.profiles (id, full_name, position, role, email)
  VALUES (new_user_id, new_name, new_position, new_role, new_email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = new_name, position = new_position, role = new_role, email = new_email;

  RETURN new_user_id;
END;
$$;
