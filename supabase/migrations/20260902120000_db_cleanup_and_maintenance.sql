-- ─── Migration: Automação de Limpeza de Cache e Retenção no Supabase ─────────

-- 1. Função RPC para Purga Automática de Logs e Snapshots Expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache_and_logs(
  days_billing integer DEFAULT 14,
  days_notifications integer DEFAULT 14,
  days_sync integer DEFAULT 7,
  days_metrics integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_billing integer := 0;
  deleted_notif integer := 0;
  deleted_sync integer := 0;
  deleted_hourly integer := 0;
  deleted_demo integer := 0;
  deleted_asset integer := 0;
  deleted_region integer := 0;
  cutoff_billing timestamptz;
  cutoff_notif timestamptz;
  cutoff_sync timestamptz;
  cutoff_metrics date;
BEGIN
  cutoff_billing := now() - (days_billing || ' days')::interval;
  cutoff_notif := now() - (days_notifications || ' days')::interval;
  cutoff_sync := now() - (days_sync || ' days')::interval;
  cutoff_metrics := (now() - (days_metrics || ' days')::interval)::date;

  -- Purga billing_snapshots
  WITH deleted AS (
    DELETE FROM public.billing_snapshots
    WHERE fetched_at < cutoff_billing
    RETURNING id
  )
  SELECT count(*) INTO deleted_billing FROM deleted;

  -- Purga notifications
  WITH deleted AS (
    DELETE FROM public.notifications
    WHERE created_at < cutoff_notif
    RETURNING id
  )
  SELECT count(*) INTO deleted_notif FROM deleted;

  -- Purga sync_history
  WITH deleted AS (
    DELETE FROM public.sync_history
    WHERE started_at < cutoff_sync
    RETURNING id
  )
  SELECT count(*) INTO deleted_sync FROM deleted;

  -- Purga hourly_metrics
  WITH deleted AS (
    DELETE FROM public.hourly_metrics
    WHERE date < cutoff_metrics
    RETURNING id
  )
  SELECT count(*) INTO deleted_hourly FROM deleted;

  -- Purga demographic_metrics
  WITH deleted AS (
    DELETE FROM public.demographic_metrics
    WHERE date < cutoff_metrics
    RETURNING id
  )
  SELECT count(*) INTO deleted_demo FROM deleted;

  -- Purga asset_metrics
  WITH deleted AS (
    DELETE FROM public.asset_metrics
    WHERE date < cutoff_metrics
    RETURNING id
  )
  SELECT count(*) INTO deleted_asset FROM deleted;

  -- Purga region_metrics
  WITH deleted AS (
    DELETE FROM public.region_metrics
    WHERE date < cutoff_metrics
    RETURNING id
  )
  SELECT count(*) INTO deleted_region FROM deleted;

  RETURN jsonb_build_object(
    'success', true,
    'timestamp', now(),
    'billing_snapshots_deleted', deleted_billing,
    'notifications_deleted', deleted_notif,
    'sync_history_deleted', deleted_sync,
    'hourly_metrics_deleted', deleted_hourly,
    'demographic_metrics_deleted', deleted_demo,
    'asset_metrics_deleted', deleted_asset,
    'region_metrics_deleted', deleted_region,
    'total_deleted', (deleted_billing + deleted_notif + deleted_sync + deleted_hourly + deleted_demo + deleted_asset + deleted_region)
  );
END;
$$;

-- Permissões para execução da RPC
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache_and_logs(integer, integer, integer, integer) TO authenticated, service_role;

-- 2. Agendamento Automático via pg_cron (se a extensão estiver disponível)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'daily-supabase-cache-cleanup',
      '0 3 * * *', -- Executa diariamente às 03:00 AM
      $$ SELECT public.cleanup_expired_cache_and_logs(14, 14, 7, 30); $$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron não está habilitado neste ambiente. A função pode ser disparada via RPC ou Edge Function.';
END;
$$;
