-- Corrige autenticação de usuários criados via admin_create_user
-- Problema: a função não inseria em auth.identities, exigido pelo Supabase para login com email/senha

-- Backfill: cria identidades faltantes para usuários já cadastrados
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  u.email,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  now(),
  now(),
  now()
FROM auth.users u
WHERE (u.raw_app_meta_data->>'provider' = 'email' OR u.raw_app_meta_data->>'providers' LIKE '%email%')
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- Recria admin_create_user com INSERT em auth.identities
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
  hashed_pw   text;
BEGIN
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem cadastrar novos usuários.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = new_email) THEN
    RAISE EXCEPTION 'Este e-mail já está cadastrado no sistema.';
  END IF;

  hashed_pw := extensions.crypt(new_password, extensions.gen_salt('bf', 10));
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
    new_email, hashed_pw, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', new_name, 'position', new_position, 'role', new_role),
    now(), now()
  );

  -- Obrigatório para login com email/senha no Supabase GoTrue v2
  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    new_email,
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', new_email),
    'email',
    now(), now(), now()
  );

  -- Garante perfil com dados completos (trigger pode ter criado incompleto)
  INSERT INTO public.profiles (id, full_name, position, role, email)
  VALUES (new_user_id, new_name, new_position, new_role, new_email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        position  = EXCLUDED.position,
        role      = EXCLUDED.role,
        email     = EXCLUDED.email;

  RETURN new_user_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
