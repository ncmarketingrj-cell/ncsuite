-- Criar tabela de conjuntos de anúncios
CREATE TABLE IF NOT EXISTS public.ad_sets (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    campaign_id uuid NOT NULL,
    external_id character varying NULL,
    name text NOT NULL,
    status character varying NULL DEFAULT 'ACTIVE'::character varying,
    budget numeric NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT ad_sets_pkey PRIMARY KEY (id),
    CONSTRAINT ad_sets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    CONSTRAINT ad_sets_external_id_key UNIQUE (external_id)
);

-- Criar tabela de anúncios
CREATE TABLE IF NOT EXISTS public.ads (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    ad_set_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    external_id character varying NULL,
    name text NOT NULL,
    status character varying NULL DEFAULT 'ACTIVE'::character varying,
    creative_url text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT ads_pkey PRIMARY KEY (id),
    CONSTRAINT ads_ad_set_id_fkey FOREIGN KEY (ad_set_id) REFERENCES ad_sets(id) ON DELETE CASCADE,
    CONSTRAINT ads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    CONSTRAINT ads_external_id_key UNIQUE (external_id)
);

-- Adicionar colunas na tabela de metrics se necessário para suportar granularidade
-- (Como a tabela metrics atual tem UNIQUE(campaign_id, date), precisamos criar uma nova ou adicionar colunas)
-- Para simplificar sem quebrar o que já funciona, vamos criar asset_metrics
CREATE TABLE IF NOT EXISTS public.asset_metrics (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    ad_set_id uuid NULL,
    ad_id uuid NULL,
    date date NOT NULL,
    impressions integer NULL DEFAULT 0,
    clicks integer NULL DEFAULT 0,
    cost numeric NULL DEFAULT 0,
    conversions integer NULL DEFAULT 0,
    reach integer NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT asset_metrics_pkey PRIMARY KEY (id),
    CONSTRAINT asset_metrics_ad_set_id_fkey FOREIGN KEY (ad_set_id) REFERENCES ad_sets(id) ON DELETE CASCADE,
    CONSTRAINT asset_metrics_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);

-- Ativar RLS
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas temporais de leitura pública (simplificado)
CREATE POLICY "Enable read access for all users" ON public.ad_sets FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.ads FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.asset_metrics FOR SELECT USING (true);
