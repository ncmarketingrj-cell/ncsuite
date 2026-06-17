-- Migração: Sincronização e Suporte a Múltiplas Contas Sociais (Facebook Pages e Instagram Profiles)

-- 1. Criar a tabela social_pages
CREATE TABLE IF NOT EXISTS public.social_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id text UNIQUE NOT NULL,
  page_name text NOT NULL,
  instagram_account_id text,
  instagram_handle text,
  access_token text, -- Token de página
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.social_pages ENABLE ROW LEVEL SECURITY;

-- Criar política de acesso para usuários autenticados
DROP POLICY IF EXISTS "social_pages all auth" ON public.social_pages;
CREATE POLICY "social_pages all auth" ON public.social_pages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Modificar social_posts para associar a uma página específica
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS page_id text;

-- Adicionar índice para performance de buscas por página
CREATE INDEX IF NOT EXISTS social_posts_page_id_idx ON public.social_posts(page_id);

-- Recarregar o schema do PostgREST
NOTIFY pgrst, 'reload schema';
