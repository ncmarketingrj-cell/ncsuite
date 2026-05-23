-- Device metrics: impression_device × publisher_platform breakdown (Meta API)
CREATE TABLE IF NOT EXISTS public.device_metrics (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id   text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  date            date NOT NULL,
  device          text NOT NULL,    -- mobile, desktop, tablet, connected_tv
  platform        text NOT NULL,    -- facebook, instagram, audience_network, messenger
  impressions     integer DEFAULT 0,
  clicks          integer DEFAULT 0,
  spend           numeric DEFAULT 0,
  conversions     integer DEFAULT 0,
  reach           integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date, device, platform)
);

ALTER TABLE public.device_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "device_metrics all auth" ON public.device_metrics;
CREATE POLICY "device_metrics all auth" ON public.device_metrics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS device_metrics_campaign_date_idx ON public.device_metrics (campaign_id, date);
CREATE INDEX IF NOT EXISTS device_metrics_account_date_idx ON public.device_metrics (ad_account_id, date);

-- Adicionar reach + CTR fields a demographic_metrics caso não existam
ALTER TABLE public.demographic_metrics ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;
ALTER TABLE public.demographic_metrics ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0;
ALTER TABLE public.demographic_metrics ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;
