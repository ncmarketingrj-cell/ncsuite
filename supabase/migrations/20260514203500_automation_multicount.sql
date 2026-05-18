
-- Ad Accounts Cache
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id text PRIMARY KEY,
  name text NOT NULL,
  currency text,
  status integer,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  last_sync timestamptz DEFAULT now()
);
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_accounts all auth" ON public.ad_accounts;
CREATE POLICY "ad_accounts all auth" ON public.ad_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Automation Rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  metric text NOT NULL, -- 'cpl', 'ctr', 'roas', 'spend'
  condition text NOT NULL, -- '>', '<', '>='
  value numeric NOT NULL,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  recipient_email text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation_rules all auth" ON public.automation_rules;
CREATE POLICY "automation_rules all auth" ON public.automation_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- System Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info', -- 'alert', 'info', 'success'
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications all auth" ON public.notifications;
CREATE POLICY "notifications all auth" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
