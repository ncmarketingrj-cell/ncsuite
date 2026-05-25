-- Adiciona opções de configuração por regra de alerta
-- min_spend_threshold: gasto mínimo do dia para disparar qualquer alerta
-- alert_*_enabled: habilita/desabilita cada tipo de alerta individualmente

ALTER TABLE public.alert_thresholds
  ADD COLUMN IF NOT EXISTS min_spend_threshold numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alert_cpl_enabled      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_budget_enabled   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_frequency_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.alert_thresholds.min_spend_threshold     IS 'Gasto mínimo do dia (R$) para disparar qualquer alerta desta regra';
COMMENT ON COLUMN public.alert_thresholds.alert_cpl_enabled       IS 'Habilita alerta de CPL / custo por resultado';
COMMENT ON COLUMN public.alert_thresholds.alert_budget_enabled    IS 'Habilita alerta de orçamento diário';
COMMENT ON COLUMN public.alert_thresholds.alert_frequency_enabled IS 'Habilita alerta de frequência';
