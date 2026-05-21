-- Migration: Recriar Cron Jobs com chave de autenticação embutida
-- NC Performance Suite — Sync 24/7 sem depender de nenhum PC

-- Remover jobs anteriores (sem chave de auth)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('nc-sync-meta-ads-3min', 'nc-run-automations-3min');

-- ─── CRON 1: Sincronizar Meta Ads a cada 3 minutos ────────────────────────────
SELECT cron.schedule(
  'nc-sync-meta-ads-3min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xudumzedcxuuhxokissm.supabase.co/functions/v1/sync-meta-ads',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZHVtemVkY3h1dWh4b2tpc3NtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwNzI2NywiZXhwIjoyMDk0NjgzMjY3fQ.UZu6anm6Pj454Ts1rDUUT8xPQEMNcDEj9gezomnKHBc"}'::jsonb,
    body := jsonb_build_object(
      'triggered_by', 'cron',
      'time_range', jsonb_build_object(
        'since', to_char((now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 day', 'YYYY-MM-DD'),
        'until', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
      )
    )
  );
  $$
);

-- ─── CRON 2: Motor de alertas CPL/Budget (1 min após o sync) ─────────────────
SELECT cron.schedule(
  'nc-run-automations-3min',
  '1-58/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xudumzedcxuuhxokissm.supabase.co/functions/v1/run-automations',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZHVtemVkY3h1dWh4b2tpc3NtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwNzI2NywiZXhwIjoyMDk0NjgzMjY3fQ.UZu6anm6Pj454Ts1rDUUT8xPQEMNcDEj9gezomnKHBc"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
