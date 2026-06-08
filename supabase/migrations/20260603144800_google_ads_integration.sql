-- Add platform to ad_accounts
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS platform text DEFAULT 'Meta Ads';

-- Create google_ads_configs table
CREATE TABLE IF NOT EXISTS public.google_ads_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text DEFAULT 'Google Ads Connection',
  email text, -- Email from OAuth
  refresh_token text NOT NULL,
  login_customer_id text, -- Optional MCC ID
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.google_ads_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "google_ads_configs all auth" ON public.google_ads_configs;
CREATE POLICY "google_ads_configs all auth" ON public.google_ads_configs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Force schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
