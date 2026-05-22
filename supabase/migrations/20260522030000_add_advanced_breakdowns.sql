-- ============================================================
-- Novas Tabelas de Breakdowns Avançados (Hourly e Region)
-- ============================================================

-- 1. Métricas por Hora do Dia
CREATE TABLE IF NOT EXISTS public.hourly_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  date date NOT NULL,
  hour text NOT NULL,             -- ex: '00:00:00 - 00:59:59' ou numérico '0'..'23'
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  spend numeric DEFAULT 0,
  conversions integer DEFAULT 0,
  reach integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date, hour)
);
ALTER TABLE public.hourly_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hourly_metrics all auth" ON public.hourly_metrics;
CREATE POLICY "hourly_metrics all auth" ON public.hourly_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Métricas por Região (Estado)
CREATE TABLE IF NOT EXISTS public.region_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  date date NOT NULL,
  region text NOT NULL,           -- ex: 'São Paulo', 'Rio de Janeiro'
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  spend numeric DEFAULT 0,
  conversions integer DEFAULT 0,
  reach integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date, region)
);
ALTER TABLE public.region_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "region_metrics all auth" ON public.region_metrics;
CREATE POLICY "region_metrics all auth" ON public.region_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS hourly_metrics_campaign_date_idx ON public.hourly_metrics (campaign_id, date);
CREATE INDEX IF NOT EXISTS region_metrics_campaign_date_idx ON public.region_metrics (campaign_id, date);
