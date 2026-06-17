-- 1. Adicionar colunas de redes sociais em meta_ads_configs
ALTER TABLE public.meta_ads_configs
  ADD COLUMN IF NOT EXISTS facebook_page_id text,
  ADD COLUMN IF NOT EXISTS facebook_page_name text,
  ADD COLUMN IF NOT EXISTS instagram_account_id text,
  ADD COLUMN IF NOT EXISTS instagram_handle text;

-- 2. Criar a tabela social_posts
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  content text,
  media_url text,
  post_type text DEFAULT 'feed', -- 'feed', 'stories', 'reels'
  status text DEFAULT 'draft',   -- 'draft', 'pending_approval', 'scheduled', 'published', 'failed'
  platform text DEFAULT 'instagram', -- 'instagram', 'facebook', 'both'
  scheduled_at timestamptz,
  published_at timestamptz,
  meta_post_id text,
  error_message text,
  product_tags jsonb DEFAULT '[]'::jsonb,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  reach_count integer DEFAULT 0,
  impressions_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- Criar política de acesso total para usuários autenticados
DROP POLICY IF EXISTS "social_posts all auth" ON public.social_posts;
CREATE POLICY "social_posts all auth" ON public.social_posts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recarregar o schema do PostgREST
NOTIFY pgrst, 'reload schema';
