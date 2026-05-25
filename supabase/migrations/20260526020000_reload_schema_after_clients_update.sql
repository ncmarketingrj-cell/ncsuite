-- Reload do schema PostgREST após expansão da tabela clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS _force boolean;
ALTER TABLE public.clients DROP COLUMN IF EXISTS _force;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
