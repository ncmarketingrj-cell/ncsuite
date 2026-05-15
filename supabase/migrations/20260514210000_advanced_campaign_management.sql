-- Advanced Campaign Management & Automation Upgrades

-- 1. Upgrade automation_rules table
ALTER TABLE public.automation_rules 
  ADD COLUMN IF NOT EXISTS action_type text DEFAULT 'notify', -- 'notify', 'pause', 'start', 'increase_budget', 'decrease_budget'
  ADD COLUMN IF NOT EXISTS action_value jsonb DEFAULT '{}', -- Example: {"percentage": 20, "max_budget": 1000}
  ADD COLUMN IF NOT EXISTS target_level text DEFAULT 'account', -- 'account', 'campaign', 'adset', 'ad'
  ADD COLUMN IF NOT EXISTS target_ids text[] DEFAULT '{}', -- empty array implies "all" in the scope
  ADD COLUMN IF NOT EXISTS time_window text DEFAULT 'today', -- 'today', 'yesterday', 'last_3_days', 'last_7_days'
  ADD COLUMN IF NOT EXISTS evaluation_frequency text DEFAULT '1h', -- '15m', '1h', '24h'
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'; -- 'active', 'paused', 'archived'

-- 2. Automation Logs
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action_taken text NOT NULL,
  target_level text NOT NULL,
  target_id text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  status text DEFAULT 'success', -- 'success', 'failed'
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation_logs all auth" ON public.automation_logs;
CREATE POLICY "automation_logs all auth" ON public.automation_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Campaign Portfolios
CREATE TABLE IF NOT EXISTS public.campaign_portfolios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_roas numeric,
  target_cpa numeric,
  budget_limit numeric,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.campaign_portfolios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign_portfolios all auth" ON public.campaign_portfolios;
CREATE POLICY "campaign_portfolios all auth" ON public.campaign_portfolios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Portfolio Campaigns Mapping
CREATE TABLE IF NOT EXISTS public.portfolio_campaigns (
  portfolio_id uuid REFERENCES public.campaign_portfolios(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (portfolio_id, campaign_id)
);
ALTER TABLE public.portfolio_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_campaigns all auth" ON public.portfolio_campaigns;
CREATE POLICY "portfolio_campaigns all auth" ON public.portfolio_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Campaign Schedules (Dayparting)
CREATE TABLE IF NOT EXISTS public.campaign_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_level text NOT NULL, -- 'campaign', 'adset', 'portfolio'
  target_id text NOT NULL,
  days_of_week integer[] NOT NULL, -- [1, 2, 3, 4, 5, 6, 7] (1=Monday)
  start_time time NOT NULL,
  end_time time NOT NULL,
  action text NOT NULL, -- 'pause', 'start', 'multiplier'
  multiplier_value numeric,
  timezone text DEFAULT 'America/Sao_Paulo',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.campaign_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign_schedules all auth" ON public.campaign_schedules;
CREATE POLICY "campaign_schedules all auth" ON public.campaign_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
