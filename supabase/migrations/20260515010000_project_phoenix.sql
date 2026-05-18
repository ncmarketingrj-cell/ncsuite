-- ============================================================
-- Project Phoenix: Agent Memory & Demographic Intelligence
-- ============================================================

-- 1. Colunas de targetting em clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS target_cpa numeric,
  ADD COLUMN IF NOT EXISTS target_roas numeric,
  ADD COLUMN IF NOT EXISTS meta_ad_account_id text;

-- 2. Memória persistente do agente
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,              -- ex: 'best_audience_18_24', 'avg_cpa_last_30d'
  value jsonb NOT NULL,           -- ex: { "cpa": 12.50, "trend": "down" }
  context text,                   -- ex: 'account:act_123456', 'campaign:987654'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key, context)
);
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_memory all auth" ON public.agent_memory;
CREATE POLICY "agent_memory all auth" ON public.agent_memory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Métricas demográficas (idade × gênero × plataforma)
CREATE TABLE IF NOT EXISTS public.demographic_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  date date NOT NULL,
  age_range text NOT NULL,        -- ex: '18-24', '25-34', '35-44', '45-54', '55-64', '65+'
  gender text NOT NULL,           -- 'male', 'female', 'unknown'
  platform text,                  -- 'facebook', 'instagram', 'messenger', 'audience_network'
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  spend numeric DEFAULT 0,
  conversions integer DEFAULT 0,
  reach integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date, age_range, gender, platform)
);
ALTER TABLE public.demographic_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demographic_metrics all auth" ON public.demographic_metrics;
CREATE POLICY "demographic_metrics all auth" ON public.demographic_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Log de ações do agente (mais detalhado que automation_logs)
CREATE TABLE IF NOT EXISTS public.agent_actions_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  heartbeat_id text NOT NULL,     -- UUID da execução do heartbeat
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  action_type text NOT NULL,      -- 'pause', 'resume', 'scale_budget', 'alert', 'sync'
  target_type text NOT NULL,      -- 'campaign', 'adset', 'ad', 'account'
  target_external_id text NOT NULL,-- ID externo na Meta
  target_name text,
  meta_api_success boolean DEFAULT false,
  meta_api_response jsonb,
  payload_sent jsonb,             -- O que foi enviado para a API
  metric_triggered text,          -- ex: 'cpa'
  metric_value numeric,           -- Valor que triggerou
  metric_threshold numeric,       -- Limite configurado na regra
  notification_sent boolean DEFAULT false,
  webhook_sent boolean DEFAULT false,
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.agent_actions_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_actions_log all auth" ON public.agent_actions_log;
CREATE POLICY "agent_actions_log all auth" ON public.agent_actions_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Tabela de alertas gerados pelo agente
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  campaign_external_id text,
  alert_type text NOT NULL,       -- 'HIGH_CPA', 'HIGH_SPEND', 'LOW_ROAS', 'NO_CONVERSIONS', 'PAUSED', 'SCALED'
  severity text DEFAULT 'warning', -- 'info', 'warning', 'critical'
  title text NOT NULL,
  message text NOT NULL,
  metric_value numeric,
  metric_threshold numeric,
  action_taken text,              -- Ação executada pelo agente
  is_read boolean DEFAULT false,
  notification_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alerts all auth" ON public.alerts;
CREATE POLICY "alerts all auth" ON public.alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Configurações do agente (webhook, openai key placeholder, etc)
ALTER TABLE public.meta_ads_configs
  ADD COLUMN IF NOT EXISTS is_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS openai_key_configured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS heartbeat_frequency text DEFAULT '1h',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_status text DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS last_heartbeat_summary jsonb;

-- Index para performance nas queries demográficas
CREATE INDEX IF NOT EXISTS demographic_metrics_campaign_date_idx ON public.demographic_metrics (campaign_id, date);
CREATE INDEX IF NOT EXISTS demographic_metrics_account_date_idx ON public.demographic_metrics (ad_account_id, date);
CREATE INDEX IF NOT EXISTS agent_actions_log_heartbeat_idx ON public.agent_actions_log (heartbeat_id);
CREATE INDEX IF NOT EXISTS alerts_user_read_idx ON public.alerts (user_id, is_read);
