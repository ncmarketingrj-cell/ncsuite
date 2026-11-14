-- ==============================================================================
-- MIGRATION: 20261114000000_meta_integrity_contract.sql
-- Integridade integral Meta Graph API v21.0 -> NC Performance Suite:
--   1. Preserva metadados completos nos 3 niveis (campaign, ad_set, ad)
--   2. Adiciona tabelas de alcance deduplicado em nivel de conta (diario + periodo)
--   3. Preserva payloads brutos, janela de atribuicao, inline_link_clicks e purchase_value
--   4. Adiciona rastreamento de cobertura/erros parciais em sync_history e billing_snapshots
--   5. Corrige a view public.daily_metrics removendo heuristicas por nome de vendedor/cliente
-- Migration aditiva e reversivel: nao apaga dados historicos.
-- ==============================================================================

-- 1. Metadados de Campanhas
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS configured_status text,
  ADD COLUMN IF NOT EXISTS buying_type text,
  ADD COLUMN IF NOT EXISTS bid_strategy text,
  ADD COLUMN IF NOT EXISTS budget_remaining numeric,
  ADD COLUMN IF NOT EXISTS spend_cap numeric,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS stop_time timestamptz,
  ADD COLUMN IF NOT EXISTS special_ad_categories jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_synced_at timestamptz;

-- 2. Metadados de Conjuntos de Anuncios (Ad Sets)
ALTER TABLE public.ad_sets
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS configured_status text,
  ADD COLUMN IF NOT EXISTS optimization_goal text,
  ADD COLUMN IF NOT EXISTS billing_event text,
  ADD COLUMN IF NOT EXISTS bid_strategy text,
  ADD COLUMN IF NOT EXISTS bid_amount numeric,
  ADD COLUMN IF NOT EXISTS destination_type text,
  ADD COLUMN IF NOT EXISTS attribution_spec jsonb,
  ADD COLUMN IF NOT EXISTS promoted_object jsonb,
  ADD COLUMN IF NOT EXISTS targeting jsonb,
  ADD COLUMN IF NOT EXISTS daily_budget numeric,
  ADD COLUMN IF NOT EXISTS lifetime_budget numeric,
  ADD COLUMN IF NOT EXISTS budget_remaining numeric,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS meta_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS ad_sets_account_idx ON public.ad_sets (ad_account_id);

-- 3. Metadados de Anuncios (Ads)
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS configured_status text,
  ADD COLUMN IF NOT EXISTS creative_id text,
  ADD COLUMN IF NOT EXISTS creative_name text,
  ADD COLUMN IF NOT EXISTS effective_object_story_id text,
  ADD COLUMN IF NOT EXISTS call_to_action_type text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS meta_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS ads_account_idx ON public.ads (ad_account_id);

-- 4. Metricas Diarias de Campanhas e Assets (AdSets / Ads) + Period Stats
ALTER TABLE public.metrics
  ADD COLUMN IF NOT EXISTS raw_objective text,
  ADD COLUMN IF NOT EXISTS optimization_goal text,
  ADD COLUMN IF NOT EXISTS result_indicator text,
  ADD COLUMN IF NOT EXISTS attribution_window text DEFAULT 'unified_or_default',
  ADD COLUMN IF NOT EXISTS inline_link_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actions_json jsonb,
  ADD COLUMN IF NOT EXISTS results_json jsonb,
  ADD COLUMN IF NOT EXISTS cost_per_result_json jsonb,
  ADD COLUMN IF NOT EXISTS sync_version text;

ALTER TABLE public.asset_metrics
  ADD COLUMN IF NOT EXISTS raw_objective text,
  ADD COLUMN IF NOT EXISTS optimization_goal text,
  ADD COLUMN IF NOT EXISTS result_type text,
  ADD COLUMN IF NOT EXISTS result_indicator text,
  ADD COLUMN IF NOT EXISTS attribution_window text DEFAULT 'unified_or_default',
  ADD COLUMN IF NOT EXISTS inline_link_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actions_json jsonb,
  ADD COLUMN IF NOT EXISTS results_json jsonb,
  ADD COLUMN IF NOT EXISTS sync_version text;

ALTER TABLE public.meta_period_stats
  ADD COLUMN IF NOT EXISTS result_type text,
  ADD COLUMN IF NOT EXISTS result_indicator text,
  ADD COLUMN IF NOT EXISTS optimization_goal text,
  ADD COLUMN IF NOT EXISTS attribution_window text DEFAULT 'unified_or_default',
  ADD COLUMN IF NOT EXISTS inline_link_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_clicks bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actions_json jsonb,
  ADD COLUMN IF NOT EXISTS results_json jsonb;

-- 5. Alcance Deduplicado em Nivel de Conta (Diario + Periodo)
CREATE TABLE IF NOT EXISTS public.meta_account_period_stats (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id      text NOT NULL,
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  reach              bigint DEFAULT 0,
  impressions        bigint DEFAULT 0,
  frequency          numeric(8,4) DEFAULT 0,
  spend              numeric(14,4) DEFAULT 0,
  clicks             bigint DEFAULT 0,
  inline_link_clicks bigint DEFAULT 0,
  conversions        numeric DEFAULT 0,
  purchase_value     numeric DEFAULT 0,
  attribution_window text DEFAULT 'unified_or_default',
  synced_at          timestamptz DEFAULT now(),
  CONSTRAINT meta_account_period_stats_unique UNIQUE (ad_account_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS public.meta_account_daily_stats (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id      text NOT NULL,
  date               date NOT NULL,
  reach              bigint DEFAULT 0,
  impressions        bigint DEFAULT 0,
  frequency          numeric(8,4) DEFAULT 0,
  spend              numeric(14,4) DEFAULT 0,
  clicks             bigint DEFAULT 0,
  inline_link_clicks bigint DEFAULT 0,
  synced_at          timestamptz DEFAULT now(),
  CONSTRAINT meta_account_daily_stats_unique UNIQUE (ad_account_id, date)
);

CREATE INDEX IF NOT EXISTS meta_account_period_stats_idx
  ON public.meta_account_period_stats (ad_account_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS meta_account_daily_stats_idx
  ON public.meta_account_daily_stats (ad_account_id, date);

ALTER TABLE public.meta_account_period_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_account_daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_account_period_stats_read_auth" ON public.meta_account_period_stats;
CREATE POLICY "meta_account_period_stats_read_auth" ON public.meta_account_period_stats
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "meta_account_daily_stats_read_auth" ON public.meta_account_daily_stats;
CREATE POLICY "meta_account_daily_stats_read_auth" ON public.meta_account_daily_stats
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.meta_account_period_stats TO authenticated, service_role;
GRANT SELECT ON public.meta_account_daily_stats TO authenticated, service_role;

-- 6. Cobertura de Sincronizacao, Billing & Social
ALTER TABLE public.sync_history
  ADD COLUMN IF NOT EXISTS sync_coverage jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS partial_failures jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_version text;

ALTER TABLE public.billing_snapshots
  ADD COLUMN IF NOT EXISTS account_status integer,
  ADD COLUMN IF NOT EXISTS disable_reason integer,
  ADD COLUMN IF NOT EXISTS min_billing_threshold numeric,
  ADD COLUMN IF NOT EXISTS permission_gaps jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_partial boolean DEFAULT false;

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS shares_count integer,
  ADD COLUMN IF NOT EXISTS saved_count integer,
  ADD COLUMN IF NOT EXISTS permalink text,
  ADD COLUMN IF NOT EXISTS reach_state text DEFAULT 'indisponivel',
  ADD COLUMN IF NOT EXISTS impressions_state text DEFAULT 'indisponivel';

-- 7. View public.daily_metrics corrigida:
--    - Nunca classifica por nome de campanha/vendedor/prefixo
--    - Separa claramente Leads/Mensagens reais, Compras, ROAS real (purchase_value / spend) e Resultados gerais
--    - Usa alcance deduplicado de meta_account_daily_stats quando disponivel (evitando soma por campanha)
DROP VIEW IF EXISTS public.daily_metrics;

CREATE VIEW public.daily_metrics AS
WITH campaign_daily AS (
  SELECT
    c.ad_account_id,
    m.date,
    SUM(m.cost)        AS spend,
    SUM(m.impressions) AS impressions,
    SUM(m.reach)       AS campaign_reach_sum,
    SUM(m.clicks)      AS clicks,
    SUM(COALESCE(m.inline_link_clicks, m.clicks)) AS inline_link_clicks,
    SUM(COALESCE(m.purchase_value, 0))            AS purchase_value,
    SUM(
      CASE
        WHEN UPPER(COALESCE(m.result_type, '')) IN ('MESSAGES', 'LEADS', 'OUTCOME_LEADS', 'LEAD_GENERATION')
          OR (COALESCE(m.result_type, '') = '' AND UPPER(COALESCE(c.objective, '')) IN ('MESSAGES', 'OUTCOME_LEADS', 'LEAD_GENERATION'))
        THEN m.conversions
        ELSE 0
      END
    ) AS leads,
    SUM(
      CASE
        WHEN UPPER(COALESCE(m.result_type, '')) IN ('PURCHASES', 'CONVERSIONS', 'OUTCOME_SALES')
          OR (COALESCE(m.result_type, '') = '' AND UPPER(COALESCE(c.objective, '')) IN ('CONVERSIONS', 'OUTCOME_SALES', 'CATALOG_SALES'))
        THEN m.conversions
        ELSE 0
      END
    ) AS purchases,
    SUM(m.conversions) AS results
  FROM public.metrics m
  JOIN public.campaigns c ON c.id = m.campaign_id
  WHERE c.ad_account_id IS NOT NULL
  GROUP BY c.ad_account_id, m.date
)
SELECT
  cd.ad_account_id,
  cd.date,
  cd.spend,
  cd.impressions,
  COALESCE(acd.reach, cd.campaign_reach_sum) AS reach,
  (acd.reach IS NOT NULL)                    AS reach_is_deduplicated,
  cd.campaign_reach_sum,
  cd.clicks,
  cd.inline_link_clicks,
  cd.leads,
  cd.purchases,
  cd.results,
  CASE WHEN cd.spend > 0 AND cd.purchase_value > 0
    THEN ROUND(cd.purchase_value / cd.spend, 2)
    ELSE NULL
  END AS roas,
  CASE WHEN cd.impressions > 0
    THEN ROUND((cd.clicks::numeric / cd.impressions) * 100, 2)
    ELSE 0
  END AS ctr,
  CASE WHEN cd.impressions > 0
    THEN ROUND((cd.spend / cd.impressions) * 1000, 2)
    ELSE 0
  END AS cpm,
  CASE WHEN (cd.leads + cd.purchases) > 0
    THEN ROUND(cd.spend / (cd.leads + cd.purchases), 2)
    ELSE NULL
  END AS cpa
FROM campaign_daily cd
LEFT JOIN public.meta_account_daily_stats acd
  ON acd.ad_account_id = cd.ad_account_id AND acd.date = cd.date;

GRANT SELECT ON public.daily_metrics TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
