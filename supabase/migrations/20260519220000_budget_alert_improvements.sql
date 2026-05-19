-- ─── Migration: Budget, Alertas Críticos e Histórico de Sync ─────────────────

-- 1. Adicionar orçamento às campanhas
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS daily_budget numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_budget numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_currency text DEFAULT 'BRL';

-- 2. Melhorar tabela de notificações
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_critical boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS link text;

-- 3. Histórico de sincronizações
CREATE TABLE IF NOT EXISTS public.sync_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'running', -- 'running', 'success', 'error'
  accounts_synced integer DEFAULT 0,
  campaigns_synced integer DEFAULT 0,
  metrics_synced integer DEFAULT 0,
  error_message text,
  triggered_by text DEFAULT 'auto' -- 'auto', 'manual', 'scheduled'
);
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sync_history all auth" ON public.sync_history;
CREATE POLICY "sync_history all auth" ON public.sync_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Thresholds de alerta por conta (CPL máximo, % de orçamento)
CREATE TABLE IF NOT EXISTS public.alert_thresholds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  max_cpl numeric,               -- CPL máximo aceitável (R$)
  max_budget_pct numeric DEFAULT 90, -- % do orçamento diário que dispara alerta (ex: 90%)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, ad_account_id)
);
ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alert_thresholds all auth" ON public.alert_thresholds;
CREATE POLICY "alert_thresholds all auth" ON public.alert_thresholds FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Index para notificações críticas não lidas (consulta frequente)
CREATE INDEX IF NOT EXISTS idx_notifications_critical_unread 
  ON public.notifications(user_id, is_critical, is_read, created_at DESC)
  WHERE is_critical = true AND is_read = false;

-- 6. Index para sync_history recente
CREATE INDEX IF NOT EXISTS idx_sync_history_recent
  ON public.sync_history(user_id, started_at DESC);
