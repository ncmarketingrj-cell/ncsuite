
-- Upgrade campaigns table for Meta Ads sync
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE;

-- Create unique index on external_id for upsert logic
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'campaigns_external_id_key') THEN
    CREATE UNIQUE INDEX campaigns_external_id_key ON public.campaigns (external_id);
  END IF;
END $$;

-- Update metrics table to support upserts by date and campaign
-- First, ensure campaign_id and date are part of a unique constraint if we want to upsert daily metrics
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'metrics_campaign_id_date_key') THEN
    CREATE UNIQUE INDEX metrics_campaign_id_date_key ON public.metrics (campaign_id, date);
  END IF;
END $$;
