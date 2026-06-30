-- 1. Adicionar coluna status na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo'));

-- 2. Atualizar a função crm_manage_user
CREATE OR REPLACE FUNCTION public.crm_manage_user(
  action_type text, -- 'create', 'update', 'delete'
  target_user_id uuid DEFAULT NULL,
  new_email text DEFAULT NULL,
  new_password text DEFAULT NULL,
  new_name text DEFAULT NULL,
  new_role text DEFAULT NULL, -- 'agency_sdr', 'client_store', 'gerente', 'admin'
  new_client_id uuid DEFAULT NULL,
  new_status text DEFAULT NULL -- 'ativo', 'inativo'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  caller_role text;
  created_user_id uuid;
BEGIN
  -- 1. Verificar permissões do chamador (deve ser admin, gerente, ceo ou whitelist)
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'gerente', 'ceo', 'master_admin') THEN
    -- Também aceita emails na lista de whitelist administrativa
    IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
      RAISE EXCEPTION 'Acesso negado. Apenas administradores e gestores podem gerenciar usuários.';
    END IF;
  END IF;

  -- 2. Executar ação
  IF action_type = 'create' THEN
    IF new_email IS NULL OR new_password IS NULL OR new_name IS NULL OR new_role IS NULL THEN
      RAISE EXCEPTION 'Email, senha, nome e cargo são obrigatórios para criação.';
    END IF;

    -- Criar no auth.users
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud, confirmation_token
    )
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      new_email,
      extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', new_name),
      now(),
      now(),
      'authenticated',
      'authenticated',
      ''
    )
    RETURNING id INTO created_user_id;

    -- Criar perfil associado
    INSERT INTO public.profiles (id, full_name, role, position, client_id, status, updated_at)
    VALUES (
      created_user_id,
      new_name,
      new_role,
      CASE 
        WHEN new_role = 'agency_sdr' THEN 'SDR' 
        WHEN new_role = 'gerente' THEN 'Gestor de Vendas' 
        WHEN new_role = 'admin' THEN 'Administrador'
        ELSE 'Cliente' 
      END,
      new_client_id,
      COALESCE(new_status, 'ativo'),
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        position = EXCLUDED.position,
        client_id = EXCLUDED.client_id,
        status = EXCLUDED.status,
        updated_at = now();

    RETURN created_user_id;

  ELSIF action_type = 'update' THEN
    IF target_user_id IS NULL THEN
      RAISE EXCEPTION 'ID do usuário alvo é obrigatório para atualização.';
    END IF;

    -- Atualizar profile
    UPDATE public.profiles
    SET role = COALESCE(new_role, role),
        full_name = COALESCE(new_name, full_name),
        client_id = new_client_id, 
        status = COALESCE(new_status, status),
        position = CASE 
          WHEN COALESCE(new_role, role) = 'agency_sdr' THEN 'SDR' 
          WHEN COALESCE(new_role, role) = 'gerente' THEN 'Gestor de Vendas' 
          WHEN COALESCE(new_role, role) = 'admin' THEN 'Administrador'
          ELSE position 
        END,
        updated_at = now()
    WHERE id = target_user_id;

    -- Atualizar senha se fornecida
    IF new_password IS NOT NULL AND new_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = target_user_id;
    END IF;

    RETURN target_user_id;

  ELSIF action_type = 'delete' THEN
    IF target_user_id IS NULL THEN
      RAISE EXCEPTION 'ID do usuário alvo é obrigatório para exclusão.';
    END IF;

    -- Excluir perfil e auth.users
    DELETE FROM public.profiles WHERE id = target_user_id;
    DELETE FROM auth.users WHERE id = target_user_id;

    RETURN target_user_id;
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Criar RPC para transferência de leads em lote
CREATE OR REPLACE FUNCTION public.crm_transfer_leads(
  source_sdr_id uuid,
  destination_sdr_id uuid,
  filter_client_id uuid DEFAULT NULL,
  filter_pipeline_id uuid DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rows_updated integer;
  caller_role text;
BEGIN
  -- 1. Verificar permissões do chamador (deve ser admin, gerente, ceo ou whitelist)
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'gerente', 'ceo', 'master_admin') THEN
    -- Whitelist
    IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
      RAISE EXCEPTION 'Acesso negado. Apenas administradores e gestores podem transferir leads.';
    END IF;
  END IF;

  -- 2. Validar que não são o mesmo usuário
  IF source_sdr_id = destination_sdr_id THEN
    RAISE EXCEPTION 'O SDR de origem e destino não podem ser o mesmo.';
  END IF;

  -- 3. Atualizar leads
  UPDATE public.crm_leads
  SET assigned_to = destination_sdr_id
  WHERE assigned_to = source_sdr_id
    AND (filter_client_id IS NULL OR client_id = filter_client_id)
    AND (filter_pipeline_id IS NULL OR pipeline_id = filter_pipeline_id);

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  
  RETURN rows_updated;
END;
$$;

-- 4. Notificar recarga de schema
NOTIFY pgrst, 'reload schema';
