CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Função administrativa segura para atualizar dados, roles e senhas de outros usuários
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem atualizar perfis alheios.';
  END IF;

  -- Atualiza dados de perfil
  UPDATE public.profiles
  SET role = new_role, position = new_position, full_name = new_name, updated_at = now()
  WHERE id = target_user_id;

  -- Se foi fornecida uma nova senha, faz o crypt-hash e atualiza no auth.users
  IF new_password IS NOT NULL AND new_password <> '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;
END;
$$;
