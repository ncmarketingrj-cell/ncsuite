-- Sistema de permissões por usuário (jsonb por ser flexível e sem enum rigido)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}';

-- Definir permissões padrão baseadas nos roles atuais (migração dos existentes)
UPDATE public.profiles SET permissions = '{"metricas": true, "automacoes": true, "criar_usuarios": true}'::jsonb
  WHERE role IN ('ceo', 'gerente');

UPDATE public.profiles SET permissions = '{"metricas": true}'::jsonb
  WHERE role = 'gestor_trafego';

-- Função SECURITY DEFINER: apenas admin/ceo/gerente podem alterar permissões de outros
-- Admins nunca têm permissões alteradas
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
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'ceo', 'gerente') THEN
    RAISE EXCEPTION 'Permissão negada: apenas admin, ceo e gerente podem alterar acessos';
  END IF;

  SELECT role INTO target_role FROM profiles WHERE id = target_user_id;
  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'Administradores têm acesso total e não podem ser alterados';
  END IF;

  UPDATE profiles SET permissions = new_permissions WHERE id = target_user_id;
END;
$$;
