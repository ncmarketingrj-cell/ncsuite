-- Migration: Proteção rígida do Administrador Master (nc.marketingrj@gmail.com)
-- NC Performance Suite

-- 1. Redefinir a função de exclusão de usuário para impedir deletar o Master Admin
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_email text;
BEGIN
  -- Valida se o executor é um administrador autorizado
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem excluir usuários.';
  END IF;

  -- Busca o e-mail do usuário que está sendo deletado
  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;

  -- Protege rigidamente o Administrador Master
  IF target_email = 'nc.marketingrj@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado. O Administrador Master (nc.marketingrj@gmail.com) é protegido e não pode ser excluído do sistema.';
  END IF;

  -- Deleta do auth.users (a chave estrangeira ON DELETE CASCADE cuidará do profile)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;


-- 2. Redefinir a função de atualização de usuário (dados, role e senha) para impedir alterar o Master Admin
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id uuid,
  new_role text,
  new_position text,
  new_name text,
  new_password text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_email text;
BEGIN
  -- Valida se o executor é um administrador autorizado
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem atualizar perfis alheios.';
  END IF;

  -- Busca o e-mail do usuário que está sendo editado
  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;

  -- Protege rigidamente o Administrador Master
  IF target_email = 'nc.marketingrj@gmail.com' THEN
    -- O próprio master admin pode atualizar seu nome e cargo, mas NINGUÉM mais pode, e a role dele deve continuar 'admin'
    IF auth.email() != 'nc.marketingrj@gmail.com' THEN
      RAISE EXCEPTION 'Acesso negado. O Administrador Master (nc.marketingrj@gmail.com) é protegido e não pode ser editado por outros usuários.';
    END IF;
    
    -- Se for o próprio master admin editando a si mesmo, força a role dele a continuar 'admin'
    new_role := 'admin';
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


-- 3. Redefinir a função de alteração de permissões para bloquear qualquer alteração no Master Admin ou rebaixamento
CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(
  target_user_id uuid,
  new_permissions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  target_role text;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'ceo', 'gerente') THEN
    RAISE EXCEPTION 'Permissão negada: apenas admin, ceo e gerente podem alterar acessos';
  END IF;

  -- Busca o e-mail do usuário alvo
  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;

  -- Protege rigidamente o Administrador Master contra alterações de acesso
  IF target_email = 'nc.marketingrj@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado. O Administrador Master (nc.marketingrj@gmail.com) possui acesso total e vitalício, suas permissões não podem ser alteradas.';
  END IF;

  SELECT role INTO target_role FROM profiles WHERE id = target_user_id;
  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'Administradores têm acesso total e não podem ser alterados';
  END IF;

  UPDATE profiles SET permissions = new_permissions WHERE id = target_user_id;
END;
$$;
