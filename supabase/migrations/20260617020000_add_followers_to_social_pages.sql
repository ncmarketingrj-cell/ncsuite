-- Migração: Adicionar contagem de seguidores reais na tabela social_pages
ALTER TABLE public.social_pages
  ADD COLUMN IF NOT EXISTS facebook_followers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS instagram_followers integer DEFAULT 0;

-- Recarregar schema
NOTIFY pgrst, 'reload schema';
