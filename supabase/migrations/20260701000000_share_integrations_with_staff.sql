-- Migração: Compartilhar configurações de integrações e páginas sociais com o staff da agência

-- 1. meta_ads_configs
DROP POLICY IF EXISTS "meta_ads_configs own" ON public.meta_ads_configs;
DROP POLICY IF EXISTS "meta_ads_configs all auth" ON public.meta_ads_configs;
CREATE POLICY "meta_ads_configs staff_access" ON public.meta_ads_configs
  FOR ALL TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

-- 2. google_ads_configs
DROP POLICY IF EXISTS "google_ads_configs all auth" ON public.google_ads_configs;
CREATE POLICY "google_ads_configs staff_access" ON public.google_ads_configs
  FOR ALL TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

-- 3. social_pages
DROP POLICY IF EXISTS "social_pages all auth" ON public.social_pages;
CREATE POLICY "social_pages staff_access" ON public.social_pages
  FOR ALL TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

-- 4. social_posts
DROP POLICY IF EXISTS "social_posts all auth" ON public.social_posts;
CREATE POLICY "social_posts staff_access" ON public.social_posts
  FOR ALL TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

-- Recarregar o schema do PostgREST
NOTIFY pgrst, 'reload schema';
