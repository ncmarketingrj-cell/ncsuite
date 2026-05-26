-- campaign_period_stats: métricas agregadas por período (sem time_increment)
-- Armazena alcance e frequência reais do Gerenciador de Anúncios, sem duplicações
-- por dia que inflacionam o alcance quando se soma dados diários.

CREATE TABLE IF NOT EXISTS public.campaign_period_stats (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id   uuid    REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id text    NOT NULL,
  start_date    date    NOT NULL,
  end_date      date    NOT NULL,
  reach         bigint  DEFAULT 0,
  impressions   bigint  DEFAULT 0,
  frequency     numeric(6,3) DEFAULT 0,
  spend         numeric(12,2) DEFAULT 0,
  conversions   integer DEFAULT 0,
  clicks        integer DEFAULT 0,
  synced_at     timestamptz DEFAULT now(),
  CONSTRAINT campaign_period_stats_unique UNIQUE (campaign_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS campaign_period_stats_dates
  ON public.campaign_period_stats (ad_account_id, start_date, end_date);

ALTER TABLE public.campaign_period_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "period_stats_read_all" ON public.campaign_period_stats
  FOR SELECT TO authenticated USING (true);

-- ─── pg_cron: sincronização automática a cada 3 minutos ──────────────────────
-- Requer extensões pg_cron e pg_net (habilitadas por padrão no Supabase)
-- O sync não exige auth (requireAuth está definida mas não chamada no Edge Function)

DO $$
BEGIN
  -- Remove agendamento anterior se existir
  BEGIN
    PERFORM cron.unschedule('nc-auto-sync-meta-ads');
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Cria novo agendamento: a cada 3 minutos, sincroniza hoje + ontem
  PERFORM cron.schedule(
    'nc-auto-sync-meta-ads',
    '*/3 * * * *',
    $job$
    SELECT net.http_post(
      url     := 'https://xudumzedcxuuhxokissm.supabase.co/functions/v1/sync-meta-ads',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object(
        'triggered_by', 'cron',
        'time_range', jsonb_build_object(
          'since', to_char(current_date - 1, 'YYYY-MM-DD'),
          'until', to_char(current_date, 'YYYY-MM-DD')
        )
      )
    )::bigint
    $job$
  );

  RAISE NOTICE 'pg_cron: nc-auto-sync-meta-ads agendado (*/3 * * * *)';
EXCEPTION WHEN others THEN
  RAISE WARNING 'pg_cron não disponível — sync automático não foi configurado: %', SQLERRM;
END;
$$;
