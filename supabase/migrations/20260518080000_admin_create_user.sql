-- Habilita pgcrypto caso ainda não esteja habilitado
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Função administrativa para criar usuários com e-mail, senha, cargo e nome
CREATE OR REPLACE FUNCTION public.admin_create_user(
  new_email text,
  new_password text,
  new_name text,
  new_position text,
  new_role text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_user_id uuid;
  hashed_pw text;
BEGIN
  -- Valida se quem está chamando é um dos administradores autorizados
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem cadastrar novos usuários.';
  END IF;

  -- Verifica se o e-mail já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = new_email) THEN
    RAISE EXCEPTION 'Este e-mail já está cadastrado no sistema.';
  END IF;

  -- Gera o hash crypt do password compatível com o Supabase auth
  hashed_pw := crypt(new_password, gen_salt('bf', 10));

  -- Insere na tabela auth.users do Supabase
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

  -- Garante que o perfil seja atualizado se necessário (o trigger handle_new_user já é disparado)
  -- Mas fazemos um update explícito para garantir caso o trigger não pegue tudo
  UPDATE public.profiles
  SET full_name = new_name, position = new_position, role = new_role
  WHERE id = new_user_id;

  RETURN new_user_id;
END;
$$;
