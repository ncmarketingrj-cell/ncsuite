-- Permite que todos os usuários autenticados vejam perfis (necessário para cabeçalhos e avatares)
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
CREATE POLICY "profiles select authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

-- Permite que o próprio usuário atualize seu perfil
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Função administrativa segura para deletar usuários do Supabase Auth
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Valida se o e-mail do executor é um dos administradores autorizados
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem excluir usuários.';
  END IF;

  -- Deleta do auth.users (a chave estrangeira ON DELETE CASCADE cuidará do profile)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Função administrativa segura para atualizar dados e roles de outros usuários
CREATE OR REPLACE FUNCTION public.admin_update_user(target_user_id uuid, new_role text, new_position text, new_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.email() NOT IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com') THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem atualizar perfis alheios.';
  END IF;

  UPDATE public.profiles
  SET role = new_role, position = new_position, full_name = new_name, updated_at = now()
  WHERE id = target_user_id;
END;
$$;
