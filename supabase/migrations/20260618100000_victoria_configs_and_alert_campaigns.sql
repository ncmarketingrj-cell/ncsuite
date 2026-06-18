-- ─── Migration: Configurações da Victoria AI e Alertas de Campanha Granulares ───

-- 1. Criar tabela de configurações da Victoria AI
CREATE TABLE IF NOT EXISTS public.victoria_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system_prompt text,
  model_name text DEFAULT 'gemini-1.5-pro',
  rag_threshold numeric DEFAULT 0.70,
  rag_count integer DEFAULT 5,
  temperature numeric DEFAULT 0.7,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.victoria_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "victoria_configs all auth" ON public.victoria_configs;
CREATE POLICY "victoria_configs all auth" ON public.victoria_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Modificar alert_thresholds para suportar regras de campanha específicas
ALTER TABLE public.alert_thresholds
  ADD COLUMN IF NOT EXISTS campaign_id text;

-- 3. Remover constraint UNIQUE antiga se existir
ALTER TABLE public.alert_thresholds 
  DROP CONSTRAINT IF EXISTS alert_thresholds_user_id_ad_account_id_key;

-- 4. Criar índices únicos parciais no Postgres
-- Um índice único para regras globais/por conta (onde campaign_id é NULL)
DROP INDEX IF EXISTS idx_unique_alert_thresholds_account;
CREATE UNIQUE INDEX idx_unique_alert_thresholds_account 
  ON public.alert_thresholds (user_id, ad_account_id) 
  WHERE campaign_id IS NULL;

-- Um índice único para regras de campanha específica (onde campaign_id NÃO é NULL)
DROP INDEX IF EXISTS idx_unique_alert_thresholds_campaign;
CREATE UNIQUE INDEX idx_unique_alert_thresholds_campaign 
  ON public.alert_thresholds (user_id, ad_account_id, campaign_id) 
  WHERE campaign_id IS NOT NULL;
