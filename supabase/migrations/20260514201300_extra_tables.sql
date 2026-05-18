
-- Meta Ads Configs
CREATE TABLE IF NOT EXISTS public.meta_ads_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token text NOT NULL,
  ad_account_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.meta_ads_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_ads_configs all auth" ON public.meta_ads_configs;
CREATE POLICY "meta_ads_configs all auth" ON public.meta_ads_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Link Pages
CREATE TABLE IF NOT EXISTS public.link_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  bio text,
  theme jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  views_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.link_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "link_pages all auth" ON public.link_pages;
CREATE POLICY "link_pages all auth" ON public.link_pages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Swipe Files (Criativos)
CREATE TABLE IF NOT EXISTS public.swipe_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  media_url text,
  notes text,
  tags text[],
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.swipe_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swipe_files all auth" ON public.swipe_files;
CREATE POLICY "swipe_files all auth" ON public.swipe_files FOR ALL TO authenticated USING (true) WITH CHECK (true);
