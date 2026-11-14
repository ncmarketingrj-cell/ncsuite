-- Migration: Adiciona heartbeat_at e accounts_total em sync_history para locks com heartbeat real e cobertura por conta
ALTER TABLE public.sync_history
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounts_total integer;

-- Atualiza heartbeat_at inicial nos registros em andamento usando started_at como fallback
UPDATE public.sync_history
SET heartbeat_at = COALESCE(heartbeat_at, completed_at, started_at)
WHERE heartbeat_at IS NULL;

-- Fecha quaisquer execuções presas em 'running' sem heartbeat recente (> 5 minutos)
UPDATE public.sync_history
SET
  status = 'error',
  completed_at = COALESCE(completed_at, now()),
  error_message = COALESCE(error_message, 'Execução anterior interrompida sem heartbeat (>5m)')
WHERE status = 'running'
  AND COALESCE(heartbeat_at, started_at) < now() - interval '5 minutes';

CREATE INDEX IF NOT EXISTS idx_sync_history_status_started_at
  ON public.sync_history (status, started_at DESC);
