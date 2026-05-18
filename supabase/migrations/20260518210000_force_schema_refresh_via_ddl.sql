-- Forcar evento DDL para acionar o Webhook interno do PostgREST no Supabase
ALTER TABLE public.meta_ads_configs ADD COLUMN IF NOT EXISTS _force_reload boolean;
ALTER TABLE public.meta_ads_configs DROP COLUMN _force_reload;

ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS _force_reload boolean;
ALTER TABLE public.ad_accounts DROP COLUMN _force_reload;

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS _force_reload boolean;
ALTER TABLE public.campaigns DROP COLUMN _force_reload;

-- Assegurar permissoes corretas sem acentos para evitar bugs
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
