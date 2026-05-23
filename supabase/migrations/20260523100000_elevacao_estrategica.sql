-- ============================================================
-- Elevação Estratégica — NC Performance Suite
-- Campos críticos para gestão de tráfego $1M+/mês
-- ============================================================

-- 1. Objetivo e status de entrega em campanhas
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivery_status TEXT; -- LEARNING | ELIGIBLE | LIMITED | PAUSED

-- 2. Frequência real do Meta em métricas diárias (antes calculada como impressions/reach)
ALTER TABLE public.metrics ADD COLUMN IF NOT EXISTS frequency NUMERIC(6,2) DEFAULT 0;

-- 3. Métricas de vídeo em asset_metrics (funil de retenção de vídeo)
ALTER TABLE public.asset_metrics ADD COLUMN IF NOT EXISTS video_p25   INTEGER DEFAULT 0;
ALTER TABLE public.asset_metrics ADD COLUMN IF NOT EXISTS video_p50   INTEGER DEFAULT 0;
ALTER TABLE public.asset_metrics ADD COLUMN IF NOT EXISTS video_p75   INTEGER DEFAULT 0;
ALTER TABLE public.asset_metrics ADD COLUMN IF NOT EXISTS video_p95   INTEGER DEFAULT 0;
ALTER TABLE public.asset_metrics ADD COLUMN IF NOT EXISTS video_views INTEGER DEFAULT 0;

-- 4. Threshold de frequência nos alertas (default 3.5 — ótimo para automotivo)
ALTER TABLE public.alert_thresholds ADD COLUMN IF NOT EXISTS max_frequency NUMERIC(4,1) DEFAULT 3.5;

-- 5. Tabela de placement metrics (Feed vs Stories vs Reels vs Marketplace)
CREATE TABLE IF NOT EXISTS public.placement_metrics (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id   text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  date            date NOT NULL,
  placement       text NOT NULL,         -- feed | story | reels | marketplace | search | video_feeds
  publisher       text NOT NULL,         -- facebook | instagram | audience_network | messenger
  impressions     integer DEFAULT 0,
  clicks          integer DEFAULT 0,
  spend           numeric DEFAULT 0,
  conversions     integer DEFAULT 0,
  reach           integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date, placement, publisher)
);

ALTER TABLE public.placement_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "placement_metrics all auth" ON public.placement_metrics;
CREATE POLICY "placement_metrics all auth" ON public.placement_metrics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS placement_metrics_campaign_date_idx
  ON public.placement_metrics (campaign_id, date);

CREATE INDEX IF NOT EXISTS placement_metrics_account_date_idx
  ON public.placement_metrics (ad_account_id, date);
