-- Conceder permissao de uso do schema public para as roles da API
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Conceder permissoes essenciais de leitura, escrita e exclusao para a role 'authenticated' em todas as tabelas
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Conceder permissao total para a role 'service_role' (utilizada pelas Edge Functions e Server)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Forcar explicitamente na meta_ads_configs por precaucao
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_ads_configs TO authenticated;

-- Forcar o recarregamento instantaneo do cache de schema da API do PostgREST
NOTIFY pgrst, 'reload schema';
