-- 1. Add Meta Auction Rankings to meta_period_stats
ALTER TABLE public.meta_period_stats 
  ADD COLUMN IF NOT EXISTS quality_ranking text,
  ADD COLUMN IF NOT EXISTS engagement_rate_ranking text,
  ADD COLUMN IF NOT EXISTS conversion_rate_ranking text;

-- 2. Create tables for specific breakdowns to avoid cross-product nulls in demographic_metrics

-- Placement Breakdown (Feed, Stories, Reels, etc.)
CREATE TABLE IF NOT EXISTS public.meta_placement_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id text,
  date date NOT NULL,
  platform text NOT NULL, -- e.g., facebook, instagram
  placement text NOT NULL, -- e.g., feed, stories, reels
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric(12,2) DEFAULT 0,
  conversions bigint DEFAULT 0,
  reach bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (campaign_id, date, platform, placement)
);

-- Device Breakdown (Desktop, Mobile OS)
CREATE TABLE IF NOT EXISTS public.meta_device_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id text,
  date date NOT NULL,
  platform text NOT NULL, -- e.g., facebook, instagram
  device text NOT NULL, -- e.g., desktop, iphone, android_smartphone
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric(12,2) DEFAULT 0,
  conversions bigint DEFAULT 0,
  reach bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (campaign_id, date, platform, device)
);

-- Enable RLS for new tables
ALTER TABLE public.meta_placement_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_device_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_placement_metrics_read_all" ON public.meta_placement_metrics
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "meta_device_metrics_read_all" ON public.meta_device_metrics
    FOR SELECT TO authenticated USING (true);
